#!/usr/bin/env bun
// Background App Watchdog
// Discovers all background apps, checks health, restarts crashed ones.
// Crash loop policy: 1-3 immediate restart, #4 Telegram warning, 5+ backoff (10→20→30min cap).
// 1hr sliding window resets crash counter.

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { discoverBackgroundApps, isAppRunning, launchApp, stopApp } from './tmux.js';
import { findAllSockets, pingSocket } from './cli.js';

const PROJECT_ROOT = join(dirname(import.meta.path), '..', '..', '..', '..', '..');
const STATE_DIR = join(PROJECT_ROOT, 'recall', 'logs', 'watchdog');
const SETTINGS_DIR = join(PROJECT_ROOT, 'recall', 'settings', 'watchdog');
const STATE_FILE = join(STATE_DIR, 'state.json');

// ─────────────────────────────────────────────────────────────────────────────
// LOGGING
// ─────────────────────────────────────────────────────────────────────────────

function logFile() {
  const date = new Date().toISOString().slice(0, 10);
  return join(STATE_DIR, `${date}.txt`);
}

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    appendFileSync(logFile(), line + '\n');
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM ALERTS
// ─────────────────────────────────────────────────────────────────────────────

async function alertTelegram(message) {
  const chatIdPath = join(SETTINGS_DIR, 'alert-chat-id.txt');
  if (!existsSync(chatIdPath)) {
    log('WARN: no alert-chat-id.txt, skipping Telegram alert');
    return;
  }

  const chatId = readFileSync(chatIdPath, 'utf8').trim();
  if (!chatId) return;

  try {
    const { send } = await import('../../../telegram-bot/webhooks/send.js');
    await send(chatId, message);
    log(`Telegram alert sent to ${chatId}`);
  } catch (err) {
    log(`WARN: Telegram alert failed: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

function saveState(state) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    log(`WARN: failed to save state: ${err.message}`);
  }
}

// Sliding window: drop crashes older than 1 hour
function pruneOldCrashes(appState) {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  if (appState.crashes) {
    appState.crashes = appState.crashes.filter(ts => ts > oneHourAgo);
  }
  return appState;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRASH LOOP POLICY
// ─────────────────────────────────────────────────────────────────────────────

function shouldRestart(appState) {
  const crashes = appState.crashes || [];
  const count = crashes.length;

  // 1-3 crashes: immediate restart
  if (count <= 3) {
    return { restart: true, delay: 0 };
  }

  // 4th crash: restart + Telegram warning
  if (count === 4) {
    return { restart: true, delay: 0, alert: true };
  }

  // 5+ crashes: backoff (10→20→30min cap)
  const backoffMinutes = Math.min((count - 4) * 10, 30);
  const lastCrash = crashes[crashes.length - 1] || 0;
  const elapsed = Date.now() - lastCrash;
  const backoffMs = backoffMinutes * 60 * 1000;

  if (elapsed >= backoffMs) {
    return { restart: true, delay: 0, alert: count % 5 === 0 };
  }

  return { restart: false, nextTryIn: backoffMs - elapsed };
}

// ─────────────────────────────────────────────────────────────────────────────
// RESTART APP
// ─────────────────────────────────────────────────────────────────────────────

async function restartApp(app) {
  log(`Restarting ${app.name} (${app.id})...`);

  // Kill stale session first (prevents alreadyRunning false positive)
  try {
    await stopApp(app.id);
    await new Promise(r => setTimeout(r, 500));
  } catch {}

  // For apps with startCmd, use that directly
  if (app.startCmd) {
    try {
      const result = Bun.spawnSync(['bash', '-c', app.startCmd], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15000,
      });
      if (result.exitCode === 0) {
        log(`Restarted ${app.name} via startCmd`);
        return true;
      }
      log(`WARN: startCmd for ${app.name} exited ${result.exitCode}`);
      return false;
    } catch (err) {
      log(`WARN: startCmd for ${app.name} failed: ${err.message}`);
      return false;
    }
  }

  // For daemon apps, use launchApp (no Ghostty — headless on server)
  try {
    const result = await launchApp(app.id, app.launchArgs, app.daemonCmd);
    if (result.ok) {
      log(`Restarted ${app.name} via launchApp`);
      return true;
    }
    log(`WARN: launchApp for ${app.name} failed: ${result.error}`);
    return false;
  } catch (err) {
    log(`WARN: launchApp for ${app.name} failed: ${err.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WATCHDOG RUN
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  const apps = discoverBackgroundApps();
  if (apps.length === 0) {
    log('No background apps discovered');
    return;
  }

  const state = loadState();
  let anyAction = false;

  for (const app of apps) {
    const running = await isAppRunning(app.id, app.statusCmd);

    if (running) {
      // App is healthy — reset crash state if it had any
      if (state[app.id]?.crashes?.length > 0) {
        log(`${app.name} recovered, clearing crash history`);
        delete state[app.id];
        anyAction = true;
      }
      continue;
    }

    // App is down
    anyAction = true;
    if (!state[app.id]) {
      state[app.id] = { crashes: [] };
    }

    // Prune old crashes (1hr sliding window)
    pruneOldCrashes(state[app.id]);

    // Record this crash
    state[app.id].crashes.push(Date.now());
    const crashCount = state[app.id].crashes.length;

    log(`${app.name} is DOWN (crash #${crashCount} in last hour)`);

    const policy = shouldRestart(state[app.id]);

    if (!policy.restart) {
      const mins = Math.ceil((policy.nextTryIn || 0) / 60000);
      log(`${app.name} in backoff, next retry in ~${mins}min`);
      continue;
    }

    // Send Telegram alert if policy says so
    if (policy.alert) {
      await alertTelegram(
        `⚠️ Watchdog: ${app.name} crashed ${crashCount} times in the last hour. Restarting...`
      );
    }

    const ok = await restartApp(app);
    if (ok) {
      log(`${app.name} restarted successfully`);
    } else {
      log(`${app.name} restart FAILED`);
    }
  }

  saveState(state);

  if (!anyAction) {
    log(`All ${apps.length} app(s) healthy`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

try {
  await run();
} catch (err) {
  log(`FATAL: ${err.message}`);
  await alertTelegram(`🔴 Watchdog crashed: ${err.message}`);
  process.exit(1);
}
