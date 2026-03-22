#!/usr/bin/env bun
// ============================================================================
//  SIDEKICK HQ SERVER
//
//  HTTP server that receives webhooks, manages sidekicks, routes messages.
//  Webhooks discovered from skill webhook.json files.
// ============================================================================

import { existsSync, realpathSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import state from './state.js';
import router from './router.js';
import { spawnSync } from 'child_process';
import { spawnSession, sendToSession, killSession, listPanes, updatePaneTitle, buildPaneTitle, getSourceStyle } from './tmux.js';
import { logError, logApiError } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = router.PROJECT_ROOT;

/**
 * Try to send a message to a sidekick pane. On failure, verify the pane is
 * actually dead before marking stale. Retries once after a short delay.
 * Returns true if delivered, false if pane is truly dead.
 */
async function trySendToPane(paneId, message) {
  try {
    await sendToSession(paneId, message);
    return true;
  } catch {
    // Retry once after 500ms — pane might be busy processing
    await new Promise(r => setTimeout(r, 500));
    try {
      await sendToSession(paneId, message);
      return true;
    } catch {
      // Verify pane is actually dead
      const check = spawnSync('tmux', ['has-session', '-t', paneId], { encoding: 'utf8' });
      if (check.status === 0) {
        // Pane exists but can't accept input — try one more time
        try {
          await sendToSession(paneId, message);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }
}

// Load .env
function loadEnv() {
  const envPath = join(PROJECT_ROOT, '.env');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) process.env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
      }
    }
  }
  return process.env;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function isExternalRequest(req) {
  // Tailscale Funnel injects these headers server-side (unforgeable from localhost)
  if (req.headers.has('tailscale-funnel-request')) return true;  // Public internet via Funnel
  if (req.headers.has('tailscale-user-login')) return true;       // Tailscale network user
  return false;
}

// ── ANSI colors ──────────────────────────────────────────────────────────────
// Standard ANSI — readable on both light and dark terminals
const esc = (n) => `\x1b[${n}m`;

const c = {
  reset: esc(0),
  dim: esc(2),
  bold: esc(1),
  italic: esc(3),
  // Dark ANSI (readable on light bg)
  red: esc(31),     green: esc(32),    yellow: esc(33),
  blue: esc(34),    magenta: esc(35),  cyan: esc(36),
  // Bright ANSI
  brightRed: esc(91),     brightGreen: esc(92),
  brightBlue: esc(94),    brightMagenta: esc(95),
  // 256-color
  teal: `\x1b[38;5;73m`,
};

// ── Sidekick name colors & emoji ───────────────────────────────────────────────
// High-contrast palette — readable on light terminals, distinct per sidekick.
// Colors assigned sequentially (no hash collisions) via colorIndex in state.
const NAME_PALETTE = [
  '\x1b[38;5;124m',  // dark red
  '\x1b[38;5;25m',   // dark blue
  '\x1b[38;5;97m',   // medium purple
  '\x1b[38;5;172m',  // dark orange
  '\x1b[38;5;28m',   // forest green
  '\x1b[38;5;126m',  // dark magenta
  '\x1b[38;5;31m',   // teal blue
  '\x1b[38;5;130m',  // brown
  '\x1b[38;5;64m',   // dark olive
  '\x1b[38;5;95m',   // mauve
  '\x1b[38;5;30m',   // dark teal
  '\x1b[38;5;136m',  // dark gold
];

// Ultra-faint pastel backgrounds (true-color) — barely visible tint per sidekick
const NAME_BG_PALETTE = [
  '\x1b[48;2;252;238;238m',  // faint pink
  '\x1b[48;2;236;240;252m',  // faint blue
  '\x1b[48;2;244;238;252m',  // faint purple
  '\x1b[48;2;252;244;234m',  // faint peach
  '\x1b[48;2;238;250;238m',  // faint mint
  '\x1b[48;2;250;238;248m',  // faint magenta
  '\x1b[48;2;236;248;252m',  // faint teal
  '\x1b[48;2;252;248;236m',  // faint tan
  '\x1b[48;2;244;250;236m',  // faint lime
  '\x1b[48;2;250;238;244m',  // faint rose
  '\x1b[48;2;236;250;244m',  // faint seafoam
  '\x1b[48;2;252;252;236m',  // faint yellow
];

const EMOJI_PALETTE = [
  '🐺', '🦊', '🐙', '🦅', '🐍', '🦈',
  '🦁', '🐲', '🦉', '🐝', '🦋', '🐬',
];

// Caches: sidekick name → colorIndex / emoji (populated on spawn/startup)
const colorCache = new Map();
const emojiCache = new Map();

function nameColor(name) {
  if (!name) return c.dim;
  if (colorCache.has(name)) return NAME_PALETTE[colorCache.get(name)] || c.dim;
  // Lazy lookup from state
  const idx = state.getSidekickColorIndex(name);
  colorCache.set(name, idx);
  return NAME_PALETTE[idx] || c.dim;
}

function nameBg(name) {
  if (!name) return '';
  if (colorCache.has(name)) return NAME_BG_PALETTE[colorCache.get(name)] || '';
  const idx = state.getSidekickColorIndex(name);
  colorCache.set(name, idx);
  return NAME_BG_PALETTE[idx] || '';
}

// Wrap a log line with sidekick background — fills to end of line via \x1b[K
function withBg(name, line) {
  const bg = nameBg(name);
  if (!bg) return line;
  return bg + line.replaceAll('\x1b[0m', '\x1b[0m' + bg) + '\x1b[K\x1b[0m';
}

function resolveEmoji(name) {
  if (!name) return '●';
  if (emojiCache.has(name)) return emojiCache.get(name);
  // Lazy lookup from state
  const m = state.findSidekickByName(name);
  if (m && !m.ambiguous && m.emoji) {
    emojiCache.set(name, m.emoji);
    return m.emoji;
  }
  return EMOJI_PALETTE[0];
}

function resolveSquad(name) {
  if (!name) return '';
  const m = state.findSidekickByName(name);
  return (m && !m.ambiguous && m.squad) ? m.squad : '';
}

function squadTag(name) {
  const sq = resolveSquad(name);
  return sq ? ` ${c.dim}│ @${sq}${c.reset}` : '';
}

function colorName(name) {
  return `${resolveEmoji(name)} ${nameColor(name)}${name}${c.reset}`;
}

// Source → color + icon for consistent branding everywhere
const SOURCES = {
  'telegram-bot': { color: `\x1b[38;5;39m`, icon: '✈',  label: 'telegram' },
  'slack-bot':    { color: c.magenta,  icon: '⚡', label: 'slack' },
  'parties':      { color: c.green,    icon: '🎲', label: 'parties' },
  'internal':     { color: c.teal,     icon: '⚙',  label: 'system' },
  'custom':       { color: c.yellow,   icon: '◈',  label: 'custom' },
};

const getSource = (name) => SOURCES[name] || { color: c.dim, icon: '●', label: name };

function log(msg) {
  const timestamp = new Date().toISOString().slice(11, 19);
  const ts = `${c.dim}${timestamp}${c.reset}`;

  // ── New sidekick spawned ────────────────────────────────────────────
  if (msg.startsWith('New sidekick:')) {
    const parts = msg.match(/New sidekick: (.+?)( \((.+?)\))?( │ @(\S+))? from (.+?)\/(.+)/);
    if (parts) {
      const [, id, , nameLabel, , squad] = parts;
      const display = nameLabel || id.replace(/^\d{4}-\d{2}-\d{2}-\d{4}-/, '').slice(0, 30);
      const sq = squad ? ` ${c.dim}│ @${squad}${c.reset}` : '';
      console.log(`${ts} ${c.dim}⚡ New sidekick:${c.reset} ${display}${sq}`);
    } else {
      console.log(`${ts} ${c.dim}⚡ ${msg}${c.reset}`);
    }
    return;
  }

  // ── Sidekick deployed ───────────────────────────────────────────────
  if (msg.includes('deployed in pane')) {
    const pane = msg.match(/pane (.+)/)?.[1] || '';
    console.log(`${ts} ${c.dim}✓ pane ${pane}${c.reset}`);
    return;
  }

  // ── Sidekick failed ─────────────────────────────────────────────────
  if (msg.includes('failed to deploy') || msg.includes('Failed') || msg.includes('error:')) {
    console.log(`${ts} ${c.brightRed}✗ ${msg}${c.reset}`);
    return;
  }

  // (completed/killed/aborted/ended are logged directly by endSidekick)

  // ── Stale sidekick ──────────────────────────────────────────────────
  if (msg.includes('is stale')) {
    const id = msg.match(/Sidekick (.+?) is stale/)?.[1] || '';
    const short = id.replace(/^\d{4}-\d{2}-\d{2}-\d{4}-/, '');
    console.log(`${ts} ${c.dim}💀 ${short} stale${c.reset}`);
    return;
  }

  // ── Inter-sidekick message ──────────────────────────────────────────
  // Must be BEFORE the generic [source] handler
  if (msg.startsWith('[message]')) {
    const match = msg.match(/\[message\] (.+?) → (.+?): "(.+?)…?"/);
    if (match) {
      const [, sender, targets, preview] = match;
      const sc = nameColor(sender);
      console.log(withBg(sender, `${c.dim}${timestamp}${c.reset} ${sc}${resolveEmoji(sender)} ${sender}${squadTag(sender)}${c.reset} ${c.dim}→${c.reset} ${colorName(targets)}${c.dim}:${c.reset} ${sc}"${preview}…"${c.reset}`));
    } else {
      console.log(`${ts} ${msg.slice(10)}`);
    }
    return;
  }

  // ── Broadcast ────────────────────────────────────────────────────────
  if (msg.startsWith('[broadcast]')) {
    const match = msg.match(/\[broadcast\] (.+?)(?:\s+@(\S+))? → (\d+) sidekicks: "(.+?)…?"/);
    if (match) {
      const [, sender, squad, count, preview] = match;
      const sc = nameColor(sender);
      const squadLabel = squad ? ` ${c.dim}@${squad}${c.reset}` : '';
      console.log(withBg(sender, `${c.dim}${timestamp}${c.reset} ${sc}${resolveEmoji(sender)} ${sender}${squadLabel}${c.reset} ${c.dim}→ ${count} sidekicks:${c.reset} ${sc}"${preview}…"${c.reset}`));
    } else {
      console.log(`${ts} ${msg.slice(12)}`);
    }
    return;
  }

  // ── Source-tagged messages: [telegram-bot], [slack-bot], etc. ──────
  if (msg.startsWith('[')) {
    const match = msg.match(/^\[([^\]]+)\]/);
    if (match) {
      const source = match[1];
      const s = getSource(source);
      const rest = msg.slice(match[0].length);

      // Outbound message → user
      if (rest.includes('→') && rest.includes(':')) {
        const msgMatch = rest.match(/→ ([^:]+): "(.+?)\.\.\.?"/) || rest.match(/→ (.+)/);
        if (msgMatch && msgMatch[2]) {
          const targetName = msgMatch[1].trim();
          const targetDisplay = /^\d+ sidekicks?$/.test(targetName)
            ? `${c.yellow}${targetName}${c.reset}`
            : colorName(targetName);
          console.log(`${ts} ${s.color}${s.icon} →${c.reset} ${targetDisplay}${c.dim}: "${msgMatch[2]}…"${c.reset}`);
        } else if (rest.includes('→ [sticker]')) {
          console.log(`${ts} ${s.color}${s.icon} →${c.reset} ${c.yellow}🎨 sticker${c.reset}${c.dim}${rest.replace(/→ \[sticker\]/, '')}${c.reset}`);
        } else if (rest.includes('→ [')) {
          console.log(`${ts} ${s.color}${s.icon} →${c.reset}${c.yellow}${rest}${c.reset}`);
        } else {
          console.log(`${ts} ${s.color}${s.icon} →${c.reset}${rest}`);
        }
        return;
      }

      // Emoji reaction
      if (rest.includes('→ message')) {
        console.log(`${ts} ${s.color}${s.icon}${c.reset} ${rest}`);
        return;
      }

      // Sidekick action log (⚡)
      if (rest.includes('⚡')) {
        const action = rest.replace(/.*⚡\s*/, '').replace(/^[^:]+:\s*/, '');
        console.log(`${ts} ${c.dim}⚡ ${action.slice(0, 70)}${c.reset}`);
        return;
      }

      // Routing
      if (rest.includes('Routing to existing')) {
        const id = rest.match(/sidekick: (.+)/)?.[1] || '';
        const short = id.replace(/^\d{4}-\d{2}-\d{2}-\d{4}-/, '');
        console.log(`${ts} ${c.dim}↩ routing → ${short}${c.reset}`);
        return;
      }

      // Generic source-tagged
      console.log(`${ts} ${s.color}${s.icon} ${s.label}${c.reset}${rest}`);
      return;
    }
  }

  // ── Server startup ─────────────────────────────────────────────────
  if (msg.includes('Server running')) {
    const url = msg.match(/http:\/\/[^\s]+/)?.[0] || '';
    console.log(`${ts} ${c.green}${c.bold}● SIDEKICK HQ${c.reset} ${c.dim}${url}${c.reset}`);
    return;
  }
  if (msg.includes('Webhooks:')) {
    console.log(`${ts} ${c.blue}${msg}${c.reset}`);
    return;
  }
  if (msg.includes('Shutting down')) {
    console.log(`${ts} ${c.red}${c.bold}■ ${msg}${c.reset}`);
    return;
  }

  // ── Graceful end ─────────────────────────────────────────────────────
  if (msg.startsWith('Ending ')) {
    const match = msg.match(/Ending (\d+) sidekick(s): (.+)/);
    if (match) {
      const names = match[2].split(', ').map(n => colorName(n)).join(`${c.dim},${c.reset} `);
      console.log(`${ts} ${c.dim}⏳ Ending${c.reset} ${names}`);
    } else {
      console.log(`${ts} ${c.dim}⏳ ${msg}${c.reset}`);
    }
    return;
  }

  // ── Force end/kill ───────────────────────────────────────────────────
  if (msg.startsWith('Force-ending')) {
    const name = msg.match(/Force-ending stale sidekick: (.+)/)?.[1] || '';
    console.log(`${ts} ${c.dim}💀 Force-killed${c.reset} ${colorName(name)}`);
    return;
  }

  // ── Pane stale (from message/broadcast delivery) ─────────────────────
  if (msg.includes('pane is stale')) {
    const name = msg.match(/Sidekick (.+?) pane is stale/)?.[1] || msg;
    console.log(`${ts} ${c.dim}💀${c.reset} ${colorName(name)} ${c.dim}stale${c.reset}`);
    return;
  }

  // ── Blocked / no route ─────────────────────────────────────────────
  if (msg.includes('No route') || msg.includes('Blocked')) {
    console.log(`${ts} ${c.dim}${msg}${c.reset}`);
    return;
  }

  // ── Route listing (startup) ────────────────────────────────────────
  if (msg.trimStart().startsWith('⚡') || msg.trimStart().startsWith('○') || msg.trimStart().startsWith('🚀') || msg.trimStart().startsWith('⚙')) {
    console.log(`${ts} ${msg}`);
    return;
  }

  // ── Whitespace / everything else ───────────────────────────────────
  if (!msg.trim()) { console.log(''); return; }
  console.log(`${ts} ${msg}`);
}

function stripEscaping(text) {
  return text.replace(/\\([_*\[\]()~`>#+\-=|{}.!\\])/g, '$1');
}

function formatFollowUpMessage(text, attachments, replyTo, messageId, { username, firstName, source } = {}) {
  const parts = [];
  // Attribution: [source @username] prefix for sender identity
  if (source && (username || firstName)) {
    const who = username ? `@${username}` : firstName;
    parts.push(`[${source} ${who}]`);
  }
  if (messageId) parts.push(`[Message ID: ${messageId}]`);
  if (replyTo) {
    const who = replyTo.isFromBot ? 'your message' : `${replyTo.fromFirstName || 'a message'}`;
    const preview = replyTo.text ? `"${replyTo.text.slice(0, 50)}${replyTo.text.length > 50 ? '...' : ''}"` : '';
    parts.push(`[Replying to ${who}${preview ? ': ' + preview : ''}]`);
  }
  if (attachments?.length > 0) {
    for (const att of attachments) {
      if (att.localPath) {
        parts.push(`[Attachment: ${att.type}] Saved to: ${att.localPath}`);
      } else if (att.type === 'sticker') {
        parts.push(`[Sticker: ${att.emoji || '?'} from set "${att.setName || 'unknown'}"]`);
      } else if (att.type === 'location') {
        parts.push(`[Location: ${att.latitude}, ${att.longitude}]`);
      }
    }
  }
  if (text) parts.push(text);
  return parts.join('\n') || '(empty message)';
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPER CC — Global event forwarding to --super-cc sidekicks
//
// Super-CC sidekicks receive ALL events across ALL sidekicks:
// DMs, broadcasts, reports, spawns, completes, ends, kills, stale, webhooks.
// ─────────────────────────────────────────────────────────────────────────────

function getSuperCCRecipients(excludeIds = []) {
  const excluded = new Set(excludeIds);
  return state.getActiveSidekicks().filter(s =>
    s.superCC === 'true' && !excluded.has(s.id)
  );
}

async function notifySuperCC(event, message, excludeIds = []) {
  const recipients = getSuperCCRecipients(excludeIds);
  for (const r of recipients) {
    const paneId = r.paneId || r.tmuxWindow;
    if (paneId) {
      try {
        await sendToSession(paneId, `[cc:${event}] ${message}`);
      } catch {}
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEKICK LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────

async function createSidekick({ source, routeSkill, userId, chatId, text, username, attachments, previousSidekickId, replyTo, messageId }) {
  const sidekick = state.createSidekick(source, {
    userId,
    chatId,
    initialText: text,
    lastUserMessageId: messageId,
  });

  // Read prompt mode setting (same logic as CLI)
  let promptMode = 'message';
  try {
    const pmPath = join(PROJECT_ROOT, 'recall', 'settings', 'sidekicks', 'prompt-mode.txt');
    if (existsSync(pmPath)) {
      const val = readFileSync(pmPath, 'utf8').trim();
      if (['system', 'message'].includes(val)) promptMode = val;
    }
  } catch {}

  state.updateSidekick(sidekick.id, { username, ...(routeSkill ? { routeSkill } : {}), ...(promptMode !== 'message' ? { promptMode } : {}) });

  // Cache emoji for tail display
  if (sidekick.name && sidekick.emoji) emojiCache.set(sidekick.name, sidekick.emoji);
  if (sidekick.name && sidekick.colorIndex !== undefined) colorCache.set(sidekick.name, parseInt(sidekick.colorIndex));

  if (attachments?.length > 0) {
    for (const att of attachments) state.logAttachment(sidekick.id, 'in', att);
  }

  const nameLabel = sidekick.name ? ` (${resolveEmoji(sidekick.name)} ${sidekick.name})` : '';
  const squadLabel = sidekick.squad ? ` │ @${sidekick.squad}` : '';
  log(`New sidekick: ${sidekick.id}${nameLabel}${squadLabel} from ${source}/${username || userId}`);

  try {
    const paneId = await spawnSession({ ...sidekick, id: sidekick.id, attachments, previousSidekickId, replyTo, promptMode });
    state.updateSidekick(sidekick.id, { paneId, status: 'active' });
    log(`Sidekick ${sidekick.id} deployed in pane ${paneId}`);
  } catch (err) {
    state.updateSidekick(sidekick.id, { status: 'failed', error: err.message });
    log(`Sidekick ${sidekick.id} failed to deploy: ${err.message}`);
  }

  // cc:spawn
  const label = sidekick.name || sidekick.id;
  const squadInfo = sidekick.squad ? ` squad ${sidekick.squad}` : '';
  const preview = (text || '').slice(0, 60);
  await notifySuperCC('spawn', `${label} spawned${squadInfo}: "${preview}"`, [sidekick.id]);

  return state.getSidekick(sidekick.id);
}

async function endSidekick(sidekickId, reason = 'completed') {
  const sidekick = state.getSidekick(sidekickId);
  if (!sidekick) return;

  const label = sidekick.name || sidekickId;
  const target = sidekick.paneId || sidekick.tmuxWindow;
  if (target) {
    // Flash completion status in pane title before killing
    try {
      const icon = reason === 'completed' ? '✅' : '✗';
      const style = getSourceStyle(sidekick.source);
      const desc = (sidekick.name || sidekick.initialText || sidekickId).slice(0, 30);
      await updatePaneTitle(target, `${icon} ${style.label} │ ${desc}`);
      await new Promise(r => setTimeout(r, 800));
    } catch {}
    try { await killSession(target); } catch {}
  }

  state.completeSidekick(sidekickId);

  // Distinct log per reason
  const timestamp = new Date().toISOString().slice(11, 19);
  const ts = `${c.dim}${timestamp}${c.reset}`;
  if (reason === 'killed') {
    console.log(`${ts} ${c.red}${c.bold}💀 KILLED${c.reset} ${colorName(label)}`);
    await notifySuperCC('kill', `${label} was force-killed`, [sidekickId]);
  } else if (reason === 'ended') {
    console.log(`${ts} ${c.yellow}${c.bold}⏳ TIMED OUT${c.reset} ${colorName(label)} ${c.dim}(grace period expired)${c.reset}`);
    await notifySuperCC('end', `${label} timed out (grace period expired)`, [sidekickId]);
  } else if (reason === 'aborted') {
    console.log(`${ts} ${c.red}${c.bold}✗ ABORTED${c.reset} ${colorName(label)}`);
    await notifySuperCC('end', `${label} was aborted`, [sidekickId]);
  } else {
    console.log(`${ts} ${c.dim}✓${c.reset} ${colorName(label)} ${c.dim}completed${c.reset}`);
    await notifySuperCC('complete', `${label} completed`, [sidekickId]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK HANDLER
// ─────────────────────────────────────────────────────────────────────────────

async function handleWebhook(req, path) {
  const env = loadEnv();
  const routes = await router.buildRouteTable();
  const route = router.matchRoute(path, routes);

  if (!route) {
    log(`No route for: ${path}`);
    return new Response('Not found', { status: 404 });
  }

  const rawBody = await req.text();
  if (rawBody.length > 1_000_000) return new Response('Payload too large', { status: 413 });
  const headers = Object.fromEntries(req.headers.entries());

  // Verify signature
  if (route.verify) {
    // Skill-based verification
    const verify = await router.loadVerifier(route);
    if (verify && !verify(req, rawBody, env)) {
      log(`[${route.skill || 'custom'}] Invalid signature`);
      return new Response('Unauthorized', { status: 401 });
    }
  } else if (route.signing === 'hmac' && route.secretEnvVar) {
    // HMAC verification for custom webhooks
    const secret = env[route.secretEnvVar];
    const signature = headers['x-signature'] || headers['x-hub-signature-256'] || headers['x-webhook-signature'];
    if (!router.verifyHmac(rawBody, signature, secret)) {
      log(`[custom] Invalid HMAC signature`);
      return new Response('Unauthorized', { status: 401 });
    }
  }
  // signing: none = no verification

  // Parse body
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    // Accept raw body for webhooks without run() (dirty fallback)
    body = rawBody;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CUSTOM WEBHOOKS (.js modules with optional run() function)
  // ─────────────────────────────────────────────────────────────────────────

  if (route.custom) {
    log(`[custom] ${path}`);

    // Build context for run()
    const ctx = {
      env,
      headers,
      path: route.path,
      name: route._fileName,
    };

    // ─────────────────────────────────────────────────────────────────────────
    // EVENT HEADER ROUTING (e.g., X-GitHub-Event)
    // ─────────────────────────────────────────────────────────────────────────

    let activeHandler = null;

    if (route.eventHeader && route.eventHandlers) {
      const eventType = headers[route.eventHeader.toLowerCase()];
      if (eventType) {
        activeHandler = router.getEventHandler(route, eventType);
        if (!activeHandler) {
          // No handler for this event type, silently ignore
          log(`[custom] No handler for event: ${eventType}`);
          return new Response('OK', { status: 200 });
        }
        log(`[custom] Event: ${eventType}`);
      }
    }

    // If event routing found a handler, use it; otherwise use route-level config
    const handlerConfig = activeHandler || route;

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION DISPATCH: dirty, sidekick, or run
    // ─────────────────────────────────────────────────────────────────────────

    // Action: dirty - dump to dirty/ directory
    if (handlerConfig.action === 'dirty') {
      const prefix = handlerConfig.prefix || handlerConfig.dirtyPrefix || route.dirtyPrefix || route._fileName;
      router.executeDirtyAction({ ...route, dirtyPrefix: prefix }, body, headers);
      return new Response('OK', { status: 200 });
    }

    // Action: sidekick - spawn sidekick with directive
    if (handlerConfig.action === 'sidekick') {
      const directive = handlerConfig.directive || handlerConfig.instructions || '';
      const content = directive
        ? `${directive}\n\n--- WEBHOOK PAYLOAD ---\n${JSON.stringify(body, null, 2)}`
        : JSON.stringify(body, null, 2);
      await createSidekick({
        source: 'custom-webhook',
        userId: handlerConfig.userId || 'webhook',
        chatId: handlerConfig.conversationId || route._fileName,
        text: content,
        username: handlerConfig.username || route._fileName,
        attachments: handlerConfig.attachments,
      });
      return new Response('OK', { status: 200 });
    }

    // Action: run - call run() function
    if (handlerConfig.action === 'run' && typeof handlerConfig.run === 'function') {
      try {
        const result = await handlerConfig.run(body, ctx);

        // Handle return values
        if (result?.dirty) {
          router.executeDirtyAction({ ...route, dirtyPrefix: result.prefix || route.dirtyPrefix }, body, headers);
          return new Response('OK', { status: 200 });
        }

        if (result?.sidekick) {
          const content = result.content || JSON.stringify(body, null, 2);
          const effectiveSource = result.source || (route.extension ? route.skill : 'custom-webhook');
          await createSidekick({
            source: effectiveSource,
            routeSkill: route.skill || null,
            userId: result.userId || 'webhook',
            chatId: result.conversationId || route._fileName,
            text: content,
            username: result.username || route._fileName,
            attachments: result.attachments,
            messageId: result.messageId,
            replyTo: result.replyTo,
          });
          return new Response('OK', { status: 200 });
        }

        // { handled: true } or any truthy return = done
        return new Response('OK', { status: 200 });

      } catch (err) {
        logError(`webhook ${route.skill} handler`, err, { route: route._fileName });
        return Response.json({ ok: false, error: 'Internal error' }, { status: 500 });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LEGACY: route-level run() function (no action specified)
    // ─────────────────────────────────────────────────────────────────────────

    if (typeof route.run === 'function') {
      try {
        const result = await route.run(body, ctx);

        // Handle return values
        if (result?.dirty) {
          router.executeDirtyAction({ ...route, dirtyPrefix: result.prefix || route.dirtyPrefix }, body, headers);
          return new Response('OK', { status: 200 });
        }

        if (result?.sidekick) {
          const content = result.content || JSON.stringify(body, null, 2);
          await createSidekick({
            source: 'custom-webhook',
            userId: result.userId || 'webhook',
            chatId: result.conversationId || route._fileName,
            text: content,
            username: result.username || route._fileName,
            attachments: result.attachments,
          });
          return new Response('OK', { status: 200 });
        }

        // { handled: true } or any truthy return = done
        return new Response('OK', { status: 200 });

      } catch (err) {
        logError(`webhook ${route.skill} run`, err, { route: route._fileName });
        return Response.json({ ok: false, error: 'Internal error' }, { status: 500 });
      }
    }

    // No run() function - check for instructions (spawn sidekick) or fallback to dirty
    if (route.instructions) {
      const instructions = `${route.instructions}\n\n--- WEBHOOK PAYLOAD ---\n${JSON.stringify(body, null, 2)}`;
      await createSidekick({
        source: 'custom-webhook',
        userId: 'webhook',
        chatId: route._fileName,
        text: instructions,
        username: route._fileName,
      });
      return new Response('OK', { status: 200 });
    }

    // Default: dump to dirty
    router.executeDirtyAction(route, body, headers);
    return new Response('OK', { status: 200 });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL WEBHOOK HANDLING
  // ─────────────────────────────────────────────────────────────────────────

  // Run skill's handler
  const handlerModule = await router.loadHandler(route);
  if (!handlerModule) {
    log(`[${route.skill}] No handler found`);
    return new Response('No handler', { status: 500 });
  }

  const ctx = {
    skill: route.skill,
    route: route.route,
    env,
    projectRoot: PROJECT_ROOT,
    loadSkillSetting: (name, def) => router.loadSkillSetting(route.skill, name, def),
    loadSkillSettingList: (name) => router.loadSkillSettingList(route.skill, name),
  };

  // Handler can be a function or an object with run()
  const handlerFn = typeof handlerModule === 'function' ? handlerModule : handlerModule.run;
  if (!handlerFn) {
    log(`[${route.skill}] Handler has no run function`);
    return new Response('Invalid handler', { status: 500 });
  }

  const result = await handlerFn(body, ctx);

  // Handler says it handled it (e.g., reaction, challenge)
  if (result.handled) {
    if (result.challenge) return Response.json({ challenge: result.challenge });
    return new Response('OK', { status: 200 });
  }

  // Handler returns sidekick input
  if (result.sidekick) {
    const source = result.source || route.skill;
    const routeSkill = result.source ? route.skill : null;  // preserve original skill for reply routing

    // Check for existing sidekick
    const existingSidekick = state.findSidekickByScope(result.scope);

    if (existingSidekick) {
      const target = existingSidekick.paneId || existingSidekick.tmuxWindow;
      log(`[${source}] Routing to existing sidekick: ${existingSidekick.id}`);
      const followUp = formatFollowUpMessage(result.content, result.attachments, result.replyTo, result.messageId, {
        username: result.username,
        firstName: result.firstName,
        source: route.skill,
      });
      const ok = await trySendToPane(target, followUp);
      if (ok) {
        state.logMessage(existingSidekick.id, 'in', result.content || '(attachment)');
        state.updateSidekick(existingSidekick.id, {
          lastActivity: new Date().toISOString(),
          lastUserMessageId: result.messageId,
        });

        // cc:webhook — follow-up routed to existing sidekick
        const skLabel = existingSidekick.name || existingSidekick.id;
        const preview = (result.content || '').slice(0, 50);
        await notifySuperCC('webhook', `${source} → ${skLabel}: "${preview}"`, [existingSidekick.id]);

        return new Response('OK', { status: 200 });
      } else {
        log(`[${source}] Sidekick ${existingSidekick.id} is stale`);
        state.updateSidekick(existingSidekick.id, { status: 'stale' });

        // cc:stale
        const staleLabel = existingSidekick.name || existingSidekick.id;
        await notifySuperCC('stale', `${staleLabel} pane died`, [existingSidekick.id]);
      }
    }

    // Check for previous completed sidekick for context
    // Thread-based (Slack threads, etc.): match by scope (exact thread)
    // User-based (Telegram DMs, etc.): match by user's last conversation
    let previousSidekickId = null;
    if (result.threadTs) {
      // Thread context exists - find previous sidekick in same thread
      const prev = state.findCompletedSidekickByScope(result.scope);
      if (prev) previousSidekickId = prev.id;
    } else {
      // No thread context - find user's last conversation
      const prev = state.findLastCompletedSidekick(source, result.userId);
      if (prev) previousSidekickId = prev.id;
    }

    await createSidekick({
      source,
      routeSkill,
      userId: result.userId,
      chatId: result.conversationId,
      text: result.content,
      username: result.username,
      attachments: result.attachments,
      previousSidekickId,
      replyTo: result.replyTo,
      messageId: result.messageId,
    });

    return new Response('OK', { status: 200 });
  }

  return new Response('OK', { status: 200 });
}

// ─────────────────────────────────────────────────────────────────────────────
// API HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

async function handleOutbox(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const { sidekickId, message, replyToMessageId } = body;
  if (!sidekickId || !message) return Response.json({ ok: false, error: 'sidekickId and message required' }, { status: 400 });

  const sidekick = state.getSidekick(sidekickId);
  if (!sidekick) return Response.json({ ok: false, error: 'Sidekick not found' }, { status: 404 });

  // Find route to get sender (routeSkill preserves original skill when source is overridden)
  const routeSource = sidekick.routeSkill || sidekick.source;
  const routes = await router.buildRouteTable();
  const route = routes.find(r => r.skill === routeSource);
  if (!route) return Response.json({ ok: false, error: `No route for source: ${routeSource}` }, { status: 500 });

  const sender = await router.loadSender(route);
  if (!sender?.send) return Response.json({ ok: false, error: 'No send function' }, { status: 500 });

  try {
    const cleanMessage = stripEscaping(message);
    const options = replyToMessageId ? { replyToMessageId } : {};
    await sender.send(sidekick.chatId, cleanMessage, options);
    state.logMessage(sidekickId, 'out', cleanMessage);
    log(`[${sidekick.source}] → ${sidekick.username || sidekick.userId}: "${cleanMessage.slice(0, 120)}${cleanMessage.length > 120 ? '…' : ''}"`);;
    return Response.json({ ok: true, sent: true });
  } catch (err) {
    logError(`${sidekick.source} send`, err, { sidekickId, chatId: sidekick.chatId });
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

async function handleComplete(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const { sidekickId, summary } = body;
  if (!sidekickId) return Response.json({ ok: false, error: 'sidekickId required' }, { status: 400 });

  const sidekick = state.getSidekick(sidekickId);
  if (!sidekick) return Response.json({ ok: false, error: 'Sidekick not found' }, { status: 404 });

  if (summary) state.logMessage(sidekickId, 'action', summary);

  // cc:complete with summary (endSidekick also fires cc but this has the summary)
  const label = sidekick.name || sidekickId;
  const summaryPreview = summary ? `: "${summary.slice(0, 60)}"` : '';
  await notifySuperCC('complete', `${label} completed${summaryPreview}`, [sidekickId]);

  await endSidekick(sidekickId, 'completed');
  return Response.json({ ok: true, terminated: true });
}

async function handleLog(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const { sidekickId, action: rawAction } = body;
  if (!sidekickId || !rawAction) return Response.json({ ok: false, error: 'sidekickId and action required' }, { status: 400 });
  const action = stripEscaping(rawAction);

  const sidekick = state.getSidekick(sidekickId);
  if (!sidekick) return Response.json({ ok: false, error: 'Sidekick not found' }, { status: 404 });

  state.logMessage(sidekickId, 'action', action);
  log(`[${sidekick.source}] ⚡ ${sidekick.id}: ${action.slice(0, 80)}`);
  return Response.json({ ok: true });
}

async function handleReport(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const { sidekickId, message: rawMessage } = body;
  if (!sidekickId || !rawMessage) return Response.json({ ok: false, error: 'sidekickId and message required' }, { status: 400 });
  const message = stripEscaping(rawMessage);

  const sidekick = state.getSidekick(sidekickId);
  if (!sidekick) return Response.json({ ok: false, error: 'Sidekick not found' }, { status: 404 });

  const label = sidekick.name || sidekickId;

  // Log to sidekick history
  state.logMessage(sidekickId, 'action', `[report] ${message}`);

  // Find main Claude terminal pane
  const { spawnSync } = await import('child_process');
  let delivered = false;

  try {
    // Scan tmux for clappie-* sessions (main terminal sessions)
    const paneInfo = spawnSync('tmux', [
      'list-panes', '-a', '-F',
      '#{pane_id} #{pane_current_command} #{session_name} #{pane_activity}'
    ], { encoding: 'utf8' });

    if (paneInfo.stdout) {
      const candidates = paneInfo.stdout.trim().split('\n')
        .map(line => {
          const parts = line.split(' ');
          return {
            paneId: parts[0],
            command: parts[1],
            session: parts[2],
            activity: parseInt(parts[3]) || 0,
          };
        })
        .filter(p =>
          p.session.startsWith('clappie-') &&
          !p.session.startsWith('clappie-background') &&
          p.command !== 'bun' // Exclude display engine panes
        )
        // Sort by session timestamp (clappie-{timestamp}) — newest session first
        .sort((a, b) => {
          const tsA = parseInt(a.session.replace('clappie-', '')) || 0;
          const tsB = parseInt(b.session.replace('clappie-', '')) || 0;
          return tsB - tsA;
        });

      if (candidates.length > 0) {
        const target = candidates[0]; // Newest session = the one you're actually using
        const reportMsg = `[sidekick:${label}] ${message}`;
        const { sendToSession } = await import('./tmux.js');
        await sendToSession(target.paneId, reportMsg);
        delivered = [target];
      }
    }
  } catch (err) {
    logError('report main pane scan', err, { sidekickId });
  }

  // Fallback: write to dirty/ for heartbeat pickup
  if (!delivered) {
    try {
      const { writeFileSync, mkdirSync, existsSync } = await import('fs');
      const dirtyDir = join(PROJECT_ROOT, 'notifications', 'dirty');
      if (!existsSync(dirtyDir)) mkdirSync(dirtyDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = join(dirtyDir, `sidekick-report-${label}-${timestamp}.txt`);
      writeFileSync(filePath, `[sidekick:${label}] ${message}\n`, 'utf8');
    } catch (err) {
      logError('report dirty fallback', err, { sidekickId });
    }
  }

  const paneList = delivered ? delivered.map(t => t.paneId).join(',') : null;
  log(`[${sidekick.source}] 📢 [report] ${label}: ${message.slice(0, 80)}${paneList ? ` (→ ${paneList})` : ' (→ dirty/)'}`);

  // cc:report
  await notifySuperCC('report', `${label} → main: ${message.slice(0, 80)}`, [sidekickId]);

  return Response.json({ ok: true, delivered: !!delivered, fallback: !delivered });
}

// ─────────────────────────────────────────────────────────────────────────────
// SKILL EXTENSION COMMANDS (generic handler)
//
// Skills register sidekick commands via `sidekickCommands` export in their
// webhooks/send.js. This handler loads and executes them dynamically.
// ─────────────────────────────────────────────────────────────────────────────

const _skillCommandCache = new Map();

async function loadSkillCommands(source) {
  if (_skillCommandCache.has(source)) return _skillCommandCache.get(source);

  const sendPath = join(PROJECT_ROOT, '.claude', 'skills', source, 'webhooks', 'send.js');
  if (!existsSync(sendPath)) return null;

  try {
    const mod = await import(sendPath);
    const commands = mod.sidekickCommands || null;
    _skillCommandCache.set(source, commands);
    return commands;
  } catch {
    return null;
  }
}

async function executeSkillCommand(sidekickId, command, args) {
  const sidekick = state.getSidekick(sidekickId);
  if (!sidekick) return Response.json({ ok: false, error: 'Sidekick not found' }, { status: 404 });

  const cmdSource = sidekick.routeSkill || sidekick.source;
  const commands = await loadSkillCommands(cmdSource);
  if (!commands) return Response.json({ ok: false, error: `${cmdSource} has no sidekick extensions` }, { status: 400 });
  if (!commands[command]) return Response.json({ ok: false, error: `${cmdSource} doesn't support '${command}'` }, { status: 400 });

  // Security: file path validation for send-file
  if (command === 'send-file') {
    const [, filePath] = args; // args = [type, filePath, caption]
    if (!filePath || !existsSync(filePath)) return Response.json({ ok: false, error: 'File not found' }, { status: 400 });

    const allowedPaths = config.getAllowedSendPaths();
    if (!allowedPaths) return Response.json({ ok: false, error: 'File sending disabled' }, { status: 403 });

    const realPath = realpathSync(filePath);
    const isAllowed = allowedPaths.some(dir => {
      try { return realPath.startsWith(realpathSync(dir) + '/'); } catch { return false; }
    });
    if (!isAllowed) return Response.json({ ok: false, error: 'File path not allowed' }, { status: 403 });

    // Clean caption
    if (args[2]) args[2] = stripEscaping(args[2]);
  }

  const chatId = sidekick.chatId || sidekick.conversationId;

  try {
    const result = await commands[command](chatId, ...args);
    // Log to sidekick history
    const logMsg = command === 'send-file'
      ? `[${command}] ${args[0]}: ${args[1]}`
      : `[${command}] ${args.join(' ').slice(0, 80)}`;
    state.logMessage(sidekickId, 'action', logMsg);
    log(`[${sidekick.source}] ${command} ${args.slice(0, 2).join(' ').slice(0, 50)}`);
    return Response.json({ ok: true, ...(result || {}) });
  } catch (err) {
    logError(`${sidekick.source} ${command}`, err, { sidekickId, args });
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

async function handleSkillCommand(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const { sidekickId, command, args } = body;
  if (!sidekickId || !command) return Response.json({ ok: false, error: 'sidekickId and command required' }, { status: 400 });

  return executeSkillCommand(sidekickId, command, args || []);
}

// ─────────────────────────────────────────────────────────────────────────────
// COORDINATION API (name-based, inter-sidekick)
// ─────────────────────────────────────────────────────────────────────────────

async function handleSidekickEnd(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const { target } = body;
  if (!target) return Response.json({ ok: false, error: 'target required' }, { status: 400 });

  let targets;
  try { targets = state.resolveTarget(target); } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 400 });
  }
  if (targets.length === 0) return Response.json({ ok: false, error: `No sidekicks matching "${target}"` }, { status: 404 });

  // Inject graceful shutdown message into each pane
  for (const t of targets) {
    const paneId = t.paneId || t.tmuxWindow;
    if (paneId) {
      try {
        await sendToSession(paneId, `[system] Wrapping up — save state and call "clappie sidekick complete ${t.id}" within 30 seconds.`);
      } catch {}
    }
  }

  const targetIds = targets.map(t => t.id);
  const targetNames = targets.map(t => t.name || t.id);
  log(`Ending ${targets.length} sidekick(s): ${targetNames.join(', ')}`);

  // cc:end — graceful end initiated
  await notifySuperCC('end', `${targetNames.join(', ')} ending (30s grace)`, targetIds);

  // After 30 seconds, force-kill any that haven't self-completed + sweep orphan panes
  setTimeout(async () => {
    for (const id of targetIds) {
      const current = state.getSidekick(id);
      if (current && current.status === 'active') {
        log(`Force-ending stale sidekick: ${current.name || id}`);
        await endSidekick(id, 'ended');
      }
    }
    // Sweep orphan panes
    try {
      const activePaneIds = new Set(state.getActiveSidekicks().map(s => s.paneId).filter(Boolean));
      const panes = await listPanes();
      for (const p of panes) {
        if (p.command === 'bash') continue;
        if (activePaneIds.has(p.paneId)) continue;
        await killSession(p.paneId);
        log(`Swept orphan pane: ${p.paneId}`);
      }
    } catch {}
  }, 30000);

  return Response.json({ ok: true, ending: targets.length, sidekicks: targetNames });
}

async function handleSidekickKill(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const { target } = body;
  if (!target) return Response.json({ ok: false, error: 'target required' }, { status: 400 });

  let targets;
  try { targets = state.resolveTarget(target); } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 400 });
  }
  if (targets.length === 0) return Response.json({ ok: false, error: `No sidekicks matching "${target}"` }, { status: 404 });

  const killed = [];
  for (const t of targets) {
    await endSidekick(t.id, 'killed');
    killed.push(t.name || t.id);
  }

  // Sweep orphan panes — sidekicks that completed/died but left tmux panes alive
  try {
    const activePaneIds = new Set(state.getActiveSidekicks().map(s => s.paneId).filter(Boolean));
    const panes = await listPanes();
    for (const p of panes) {
      if (p.command === 'bash') continue; // Server shell pane
      if (activePaneIds.has(p.paneId)) continue; // Still tracked as active
      await killSession(p.paneId);
      killed.push(`orphan:${p.paneId}`);
    }
  } catch {}

  return Response.json({ ok: true, killed: killed.length, sidekicks: killed });
}

async function handleSidekickMessage(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const { from, target, text: rawText } = body;
  if (!target || !rawText) return Response.json({ ok: false, error: 'target and text required' }, { status: 400 });
  const text = stripEscaping(rawText);

  let targets;
  try { targets = state.resolveTarget(target); } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 400 });
  }
  if (targets.length === 0) return Response.json({ ok: false, error: `No sidekicks matching "${target}"` }, { status: 404 });

  const label = from || 'user';
  let delivered = 0;

  // Find sender ID for exclusion
  const senderSidekick = from ? state.findSidekickByName(from) : null;
  const senderId = senderSidekick && !senderSidekick.ambiguous ? senderSidekick.id : null;

  for (const t of targets) {
    const paneId = t.paneId || t.tmuxWindow;
    if (paneId) {
      const ok = await trySendToPane(paneId, `[${label}] ${text}`);
      if (ok) {
        state.logMessage(t.id, 'in', `[from:${label}] ${text}`);
        delivered++;
      } else {
        log(`[message] Sidekick ${t.name || t.id} pane is stale`);
        state.updateSidekick(t.id, { status: 'stale' });

        // cc:stale
        const staleLabel = t.name || t.id;
        await notifySuperCC('stale', `${staleLabel} pane died`, [t.id]);
      }
    }
  }

  log(`[message] ${label} → ${targets.map(t => t.name || t.id).join(', ')}: "${text.slice(0, 120)}${text.length > 120 ? '…' : ''}"`);

  // cc:dm — forward DMs to all super-cc sidekicks
  const targetNames = targets.map(t => t.name || t.id).join(', ');
  const excludeIds = [...targets.map(t => t.id)];
  if (senderId) excludeIds.push(senderId);
  await notifySuperCC('dm', `${label} → ${targetNames}: ${text}`, excludeIds);

  return Response.json({ ok: true, delivered });
}

async function handleSidekickBroadcast(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const { from, fromId, text: rawText, squad } = body;
  if (!rawText) return Response.json({ ok: false, error: 'text required' }, { status: 400 });
  const text = stripEscaping(rawText);

  let targets = squad ? state.findSidekicksBySquad(squad) : state.getActiveSidekicks();

  // Exclude sender from broadcast (use ID first, then name lookup as fallback)
  if (fromId) {
    targets = targets.filter(t => t.id !== fromId);
  } else if (from) {
    const sender = state.findSidekickByName(from);
    if (sender && !sender.ambiguous) {
      targets = targets.filter(t => t.id !== sender.id);
    }
  }

  if (targets.length === 0) return Response.json({ ok: true, delivered: 0 });

  const label = from || 'broadcast';
  let delivered = 0;

  for (const t of targets) {
    const paneId = t.paneId || t.tmuxWindow;
    if (paneId) {
      const ok = await trySendToPane(paneId, `[broadcast:${label}] ${text}`);
      if (ok) {
        state.logMessage(t.id, 'in', `[broadcast:${label}] ${text}`);
        delivered++;
      } else {
        log(`[broadcast] Sidekick ${t.name || t.id} pane is stale`);
        state.updateSidekick(t.id, { status: 'stale' });

        // cc:stale
        const staleLabel = t.name || t.id;
        await notifySuperCC('stale', `${staleLabel} pane died`, [t.id]);
      }
    }
  }

  log(`[broadcast] ${label}${squad ? ` @${squad}` : ''} → ${delivered} sidekicks: "${text.slice(0, 120)}${text.length > 120 ? '…' : ''}"`);

  // cc:broadcast — forward to super-cc sidekicks that didn't already receive it
  const excludeIds = targets.map(t => t.id);
  if (fromId) excludeIds.push(fromId);
  else if (from) {
    const sender = state.findSidekickByName(from);
    if (sender && !sender.ambiguous) excludeIds.push(sender.id);
  }
  const squadLabel = squad ? ` @${squad}` : '';
  await notifySuperCC('broadcast', `${label}${squadLabel} → ${delivered} sidekicks: "${text.slice(0, 50)}"`, excludeIds);

  return Response.json({ ok: true, delivered });
}

async function handleSidekickList(req) {
  const url = new URL(req.url);
  const squad = url.searchParams.get('squad');
  const sidekicks = squad ? state.findSidekicksBySquad(squad) : state.getActiveSidekicks();

  return Response.json({
    ok: true,
    sidekicks: sidekicks.map(m => ({
      id: m.id,
      name: m.name || null,
      source: m.source,
      squad: m.squad || null,
      status: m.status,
      paneId: m.paneId || m.tmuxWindow || null,
      startedAt: m.startedAt,
      age: Math.floor((Date.now() - new Date(m.startedAt).getTime()) / 60000),
    })),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFY — CLI-spawned sidekick events (spawn from outside the server)
// ─────────────────────────────────────────────────────────────────────────────

async function handleNotify(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const { event, message, excludeIds } = body;
  if (!event || !message) return Response.json({ ok: false, error: 'event and message required' }, { status: 400 });

  await notifySuperCC(event, message, excludeIds || []);
  return Response.json({ ok: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────────────────────────────────────

async function handleRequest(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // ─────────────────────────────────────────────────────────────────────────
  // /webhooks/* is the ONLY public endpoint
  // Everything else is blocked from external requests
  // ─────────────────────────────────────────────────────────────────────────

  if (method === 'POST' && path.startsWith('/webhooks/')) {
    return handleWebhook(req, path);
  }

  // GET to /webhooks/* - don't reveal endpoint existence
  if (method === 'GET' && path.startsWith('/webhooks/')) {
    return new Response('Not found', { status: 404 });
  }

  // Block ALL external requests to non-webhook paths
  if (isExternalRequest(req)) {
    log(`Blocked external request: ${method} ${path}`);
    return new Response('Not found', { status: 404 });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal endpoints (only accessible via localhost/tailscale internal)
  // ─────────────────────────────────────────────────────────────────────────

  if (path === '/' || path === '/health') {
    const activeSidekicks = state.getActiveSidekicks();
    const routes = await router.buildRouteTable();
    return Response.json({
      ok: true,
      service: 'sidekick-hq',
      uptime: process.uptime(),
      activeSidekicks: activeSidekicks.length,
      routes: routes.length,
    });
  }

  if (method === 'POST' && path === '/outbox') return handleOutbox(req);
  if (method === 'POST' && path === '/skill-command') return handleSkillCommand(req);
  if (method === 'POST' && path === '/complete') return handleComplete(req);
  if (method === 'POST' && path === '/log') return handleLog(req);
  if (method === 'POST' && path === '/report') return handleReport(req);
  if (method === 'POST' && path === '/notify') return handleNotify(req);

  // Coordination API (name-based, inter-sidekick)
  if (method === 'POST' && path === '/end') return handleSidekickEnd(req);
  if (method === 'POST' && path === '/kill') return handleSidekickKill(req);
  if (method === 'POST' && path === '/message') return handleSidekickMessage(req);
  if (method === 'POST' && path === '/broadcast') return handleSidekickBroadcast(req);
  if (method === 'GET' && path === '/list') return handleSidekickList(req);

  return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
}

// ─────────────────────────────────────────────────────────────────────────────
// STARTUP
// ─────────────────────────────────────────────────────────────────────────────

const PORT = router.getPort();

const server = Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  fetch: handleRequest,
});

// Populate emoji cache from existing active sidekicks
for (const m of state.getActiveSidekicks()) {
  if (m.name && m.emoji) emojiCache.set(m.name, m.emoji);
  if (m.name && m.colorIndex !== undefined) colorCache.set(m.name, parseInt(m.colorIndex));
}

log(`Server running on http://localhost:${PORT}`);
router.buildFullRouteTable().then(routes => {
  const active = routes.filter(r => r.enabled);
  const inactive = routes.filter(r => !r.enabled);

  console.log('');
  console.log(`  ${c.yellow}${c.bold}━━━ WEBHOOKS ━━━${c.reset} ${c.green}${active.length} active${c.reset} ${c.dim}${inactive.length} inactive${c.reset}`);
  console.log('');

  // Active webhooks — vibrant
  for (const r of active) {
    const source = (r.skill || 'custom');
    const s = getSource(source);
    const name = r.route || r._fileName || '';
    const desc = r.description ? `${c.dim} — ${r.description.slice(0, 40)}${c.reset}` : '';
    console.log(`  ${s.color}${c.bold}${s.icon} ${s.label.padEnd(12)}${c.reset} ${c.bold}${name}${c.reset}${desc}`);
  }

  // Inactive webhooks — dimmed
  if (inactive.length > 0) {
    console.log('');
    console.log(`  ${c.dim}Inactive:${c.reset}`);
    for (const r of inactive) {
      const source = (r.skill || 'custom');
      const s = getSource(source);
      const name = r.route || r._fileName || '';
      const reason = !r.skillEnabled ? 'skill off' : 'route off';
      console.log(`  ${c.dim}○ ${source.padEnd(12)} ${name.padEnd(18)} (${reason})${c.reset}`);
    }
  }
  console.log('');
  console.log(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
  console.log('');
});

process.on('SIGINT', () => { log('Shutting down...'); process.exit(0); });
process.on('SIGTERM', () => { log('Shutting down...'); process.exit(0); });
