// Background CLI commands - extracted from clappie.js
// All background-related operations (start/stop background apps, session management)

import { existsSync, readdirSync, unlinkSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

const BACKGROUND_TMUX_PATH = join(dirname(import.meta.path), 'tmux.js');

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

// Check if a pane belongs to a background-* tmux session
export function isBackgroundPane(paneId) {
  try {
    const result = Bun.spawnSync(
      ['tmux', 'display-message', '-t', `%${paneId}`, '-p', '#{session_name}'],
      { encoding: 'utf8', timeout: 2000 }
    );
    return result.stdout.toString().trim().startsWith('background-');
  } catch {
    return false;
  }
}

// Get all background tmux sessions
export function findBackgroundSessions() {
  try {
    const result = Bun.spawnSync(
      ['tmux', 'list-sessions', '-F', '#{session_name}'],
      { encoding: 'utf8', timeout: 2000 }
    );
    return result.stdout.toString().trim().split('\n').filter(s => s.startsWith('background-'));
  } catch {
    return [];
  }
}

// Find all clappie sockets
export function findAllSockets() {
  try {
    const files = readdirSync('/tmp');
    return files
      .filter(f => f.startsWith('clappie-') && f.endsWith('.sock'))
      .map(f => `/tmp/${f}`);
  } catch {
    return [];
  }
}

// Check if a socket is alive
export async function pingSocket(socketPath) {
  if (!existsSync(socketPath)) return null;

  try {
    return await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 500);

      Bun.connect({
        unix: socketPath,
        socket: {
          data(socket, data) {
            clearTimeout(timeout);
            const response = data.toString();
            socket.end();
            resolve(response === 'pong' ? 'running' : null);
          },
          error() {
            clearTimeout(timeout);
            resolve(null);
          },
          open(socket) {
            socket.write(JSON.stringify({ action: 'ping' }));
          },
        },
      }).catch(() => {
        clearTimeout(timeout);
        resolve(null);
      });
    });
  } catch {
    return null;
  }
}

// Send command to socket
async function sendCommand(cmd, socketPath) {
  try {
    const socket = await Bun.connect({
      unix: socketPath,
      socket: {
        data() {},
        error(socket, err) {
          console.error('Socket error:', err);
        },
      },
    });

    socket.write(JSON.stringify(cmd));
    socket.end();
    return true;
  } catch (err) {
    console.error('Failed to send command:', err.message);
    return false;
  }
}

// -------------------------------------------------------------------
// listInstances - Show all running clappie instances
// -------------------------------------------------------------------

export async function listInstances() {
  const sockets = findAllSockets();

  if (sockets.length === 0) {
    console.log('No clappie instances running');
    return;
  }

  console.log('Clappie instances:\n');

  for (const socketPath of sockets) {
    const paneId = socketPath.match(/clappie-(\d+)\.sock/)?.[1] || '?';
    const status = await pingSocket(socketPath);
    const background = isBackgroundPane(paneId);
    const tag = background ? ' [background]' : '';

    if (status === 'running') {
      console.log(`  %${paneId}  ✓ running${tag}  ${socketPath}`);
    } else {
      console.log(`  %${paneId}  ✗ stale${tag}    ${socketPath}`);
    }
  }

  console.log('');
}

// -------------------------------------------------------------------
// killSockets - Kill sockets matching a filter
// -------------------------------------------------------------------

export async function killSockets(filter) {
  const sockets = findAllSockets();
  let killed = 0;
  let cleaned = 0;

  for (const socketPath of sockets) {
    const paneId = socketPath.match(/clappie-(\d+)\.sock/)?.[1];
    if (!paneId) continue;

    const background = isBackgroundPane(paneId);
    if (!filter(background)) continue;

    const status = await pingSocket(socketPath);
    if (status === 'running') {
      await sendCommand({ action: 'close' }, socketPath);
      killed++;
    } else {
      try { unlinkSync(socketPath); cleaned++; } catch {}
    }
  }

  return { killed, cleaned };
}

// -------------------------------------------------------------------
// killAll - Kill all instances + background sessions
// -------------------------------------------------------------------

export async function killAll() {
  // Kill all sockets
  const { killed, cleaned } = await killSockets(() => true);

  // Get protected apps
  const { discoverBackgroundApps } = await import(BACKGROUND_TMUX_PATH);
  const apps = discoverBackgroundApps();
  const protectedIds = new Set(apps.filter(a => a.noCliStop).map(a => a.id));

  // Kill all background tmux sessions (except protected ones)
  const sessions = findBackgroundSessions();
  let killedSessions = 0;
  let skippedSessions = 0;
  for (const session of sessions) {
    const appId = session.replace('background-', '');
    if (protectedIds.has(appId)) {
      skippedSessions++;
      continue;
    }
    Bun.spawnSync(['tmux', 'kill-session', '-t', session]);
    killedSessions++;
  }

  if (killed === 0 && cleaned === 0 && killedSessions === 0 && skippedSessions === 0) {
    console.log('No clappie instances to kill');
    return;
  }

  const parts = [];
  if (killed > 0) parts.push(`killed ${killed} instance(s)`);
  if (cleaned > 0) parts.push(`cleaned ${cleaned} stale socket(s)`);
  if (killedSessions > 0) parts.push(`stopped ${killedSessions} background session(s)`);
  if (skippedSessions > 0) parts.push(`${skippedSessions} protected`);
  console.log(parts.join(', '));
}

// -------------------------------------------------------------------
// killBackgroundOnly - Kill only background instances
// -------------------------------------------------------------------

export async function killBackgroundOnly() {
  // Kill background sockets only
  const { killed, cleaned } = await killSockets((isBackground) => isBackground);

  // Get protected apps
  const { discoverBackgroundApps } = await import(BACKGROUND_TMUX_PATH);
  const apps = discoverBackgroundApps();
  const protectedIds = new Set(apps.filter(a => a.noCliStop).map(a => a.id));

  // Kill background tmux sessions (except protected ones)
  const sessions = findBackgroundSessions();
  let killedSessions = 0;
  let skippedSessions = 0;
  for (const session of sessions) {
    const appId = session.replace('background-', '');
    if (protectedIds.has(appId)) {
      skippedSessions++;
      continue;
    }
    Bun.spawnSync(['tmux', 'kill-session', '-t', session]);
    killedSessions++;
  }

  if (killed === 0 && cleaned === 0 && killedSessions === 0 && skippedSessions === 0) {
    console.log('No background instances to kill');
    return;
  }

  const parts = [];
  if (killed > 0) parts.push(`killed ${killed} background display(s)`);
  if (cleaned > 0) parts.push(`cleaned ${cleaned} stale socket(s)`);
  if (killedSessions > 0) parts.push(`stopped ${killedSessions} session(s)`);
  if (skippedSessions > 0) parts.push(`${skippedSessions} protected`);
  console.log(parts.join(', '));
}

// -------------------------------------------------------------------
// killAllExceptBackground - Kill non-background instances only
// -------------------------------------------------------------------

export async function killAllExceptBackground() {
  const { killed, cleaned } = await killSockets((isBackground) => !isBackground);

  if (killed === 0 && cleaned === 0) {
    console.log('No non-background instances to kill');
    return;
  }

  const parts = [];
  if (killed > 0) parts.push(`killed ${killed} instance(s)`);
  if (cleaned > 0) parts.push(`cleaned ${cleaned} stale socket(s)`);
  console.log(`${parts.join(', ')} (background untouched)`);
}

// -------------------------------------------------------------------
// command - Main background command handler
// -------------------------------------------------------------------

export async function command(args) {
  const subCmd = args[1]; // 'start', 'stop', 'list', 'kill', or undefined

  // clappie background kill — kill all background sessions
  if (subCmd === 'kill') {
    await killBackgroundOnly();
    return;
  }

  // clappie background list — list apps + status (ls kept as alias)
  if (subCmd === 'list' || subCmd === 'ls') {
    await listInstances();
    return;
  }

  // clappie background watchdog <status|run|reset|log>
  if (subCmd === 'watchdog') {
    const wdCmd = args[2] || 'status';
    const PROJECT_ROOT = join(dirname(import.meta.path), '..', '..', '..', '..', '..');
    const STATE_DIR = join(PROJECT_ROOT, 'recall', 'logs', 'watchdog');
    const STATE_FILE = join(STATE_DIR, 'state.json');

    if (wdCmd === 'run') {
      // Run watchdog inline
      await import('./watchdog.js');
      return;
    }

    if (wdCmd === 'status') {
      // Show crash state per app
      let state = {};
      try {
        if (existsSync(STATE_FILE)) {
          state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
        }
      } catch {}

      const entries = Object.entries(state);
      if (entries.length === 0) {
        console.log('Watchdog: no crash history (all clean)');
        return;
      }

      console.log('Watchdog crash state:\n');
      for (const [appId, appState] of entries) {
        const crashes = appState.crashes || [];
        const recent = crashes.filter(ts => ts > Date.now() - 60 * 60 * 1000);
        const last = crashes.length > 0
          ? new Date(crashes[crashes.length - 1]).toISOString().slice(11, 19)
          : 'n/a';
        console.log(`  ${appId}: ${recent.length} crash(es) in last hour (last: ${last})`);
      }
      console.log('');
      return;
    }

    if (wdCmd === 'reset') {
      const appId = args[3];
      try {
        if (!existsSync(STATE_FILE)) {
          console.log('No watchdog state to reset');
          return;
        }
        const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
        if (appId) {
          if (state[appId]) {
            delete state[appId];
            writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
            console.log(`Reset crash history for ${appId}`);
          } else {
            console.log(`No crash history for ${appId}`);
          }
        } else {
          writeFileSync(STATE_FILE, '{}');
          console.log('Reset all watchdog crash history');
        }
      } catch (err) {
        console.error(`Failed to reset: ${err.message}`);
      }
      return;
    }

    if (wdCmd === 'log') {
      const date = new Date().toISOString().slice(0, 10);
      const logPath = join(STATE_DIR, `${date}.txt`);
      if (!existsSync(logPath)) {
        console.log(`No watchdog log for today (${date})`);
        return;
      }
      const content = readFileSync(logPath, 'utf8');
      // Show last 30 lines
      const lines = content.trim().split('\n');
      const tail = lines.slice(-30);
      if (lines.length > 30) console.log(`... (showing last 30 of ${lines.length} lines)\n`);
      console.log(tail.join('\n'));
      return;
    }

    console.error('Usage: clappie background watchdog <status|run|reset [appId]|log>');
    process.exit(1);
  }

  const { discoverBackgroundApps, launchApp, stopApp, isAppRunning } = await import(BACKGROUND_TMUX_PATH);
  const apps = discoverBackgroundApps();

  if (apps.length === 0) {
    console.log('No background apps found (no .background marker files in clapps/)');
    return;
  }

  // clappie background stop [appId]
  if (subCmd === 'stop') {
    const appId = args[2];

    if (appId) {
      // Stop one specific app
      const app = apps.find(a => a.id === appId);
      if (!app) {
        console.error(`Unknown background app: ${appId}`);
        console.log(`Available: ${apps.map(a => a.id).join(', ')}`);
        process.exit(1);
      }
      // Check if protected from CLI stop
      if (app.noCliStop) {
        console.log(`${app.name} can only be stopped via the Background UI`);
        return;
      }
      if (!(await isAppRunning(appId, app.statusCmd))) {
        console.log(`${app.name} is not running`);
        return;
      }

      // If app has stopCmd, run it directly
      if (app.stopCmd) {
        try {
          Bun.spawnSync(['bash', '-c', app.stopCmd], {
            stdio: ['inherit', 'inherit', 'inherit']
          });
          console.log(`Stopped ${app.name}`);
        } catch (err) {
          console.error(`Failed to stop ${app.name}: ${err.message}`);
        }
        return;
      }

      await stopApp(appId);
      console.log(`Stopped ${app.name}`);
    } else {
      // Stop all (skip apps with noCliStop)
      let stopped = 0;
      let skipped = 0;
      for (const app of apps) {
        if (app.noCliStop) {
          skipped++;
          continue;
        }
        if (await isAppRunning(app.id, app.statusCmd)) {
          if (app.stopCmd) {
            try {
              Bun.spawnSync(['bash', '-c', app.stopCmd], {
                stdio: ['inherit', 'inherit', 'inherit']
              });
              console.log(`Stopped ${app.name}`);
              stopped++;
            } catch (err) {
              console.error(`Failed to stop ${app.name}: ${err.message}`);
            }
            continue;
          }
          await stopApp(app.id);
          console.log(`Stopped ${app.name}`);
          stopped++;
        }
      }
      if (stopped === 0 && skipped === 0) console.log('No background apps running');
      if (stopped === 0 && skipped > 0) console.log(`No background apps stopped (${skipped} protected)`);
    }
    return;
  }

  // clappie background start [appId] — start one or all apps
  if (subCmd === 'start') {
    const appId = args[2];

    if (appId) {
      // Start one specific app
      const app = apps.find(a => a.id === appId);
      if (!app) {
        console.error(`Unknown background app: ${appId}`);
        console.log(`Available: ${apps.map(a => a.id).join(', ')}`);
        process.exit(1);
      }
      if (await isAppRunning(app.id, app.statusCmd)) {
        console.log(`${app.name} is already running`);
        return;
      }
      console.log(`Starting ${app.name}...`);

      if (app.startCmd) {
        try {
          const result = Bun.spawnSync(['bash', '-c', app.startCmd], {
            stdio: ['inherit', 'inherit', 'inherit']
          });
          if (result.exitCode === 0) {
            console.log(`Started ${app.name}`);
          } else {
            console.error(`Failed to start ${app.name} (exit ${result.exitCode})`);
          }
        } catch (err) {
          console.error(`Failed to start ${app.name}: ${err.message}`);
        }
        return;
      }

      const result = await launchApp(app.id, app.launchArgs, app.daemonCmd);
      if (result.ok) {
        console.log(`Started ${app.name}${result.daemon ? ' (daemon)' : ''}`);
      } else {
        console.error(`Failed to start ${app.name}: ${result.error}`);
      }
      return;
    }

    // Start all apps
    let started = 0;
    let alreadyRunning = 0;
    for (const app of apps) {
      if (await isAppRunning(app.id, app.statusCmd)) {
        console.log(`${app.name} already running`);
        alreadyRunning++;
        continue;
      }
      console.log(`Starting ${app.name}...`);

      if (app.startCmd) {
        try {
          const result = Bun.spawnSync(['bash', '-c', app.startCmd], {
            stdio: ['inherit', 'inherit', 'inherit']
          });
          if (result.exitCode === 0) {
            started++;
          } else {
            console.error(`Failed to start ${app.name} (exit ${result.exitCode})`);
          }
        } catch (err) {
          console.error(`Failed to start ${app.name}: ${err.message}`);
        }
        continue;
      }

      const result = await launchApp(app.id, app.launchArgs, app.daemonCmd);
      if (result.ok) {
        started++;
      } else {
        console.error(`Failed to start ${app.name}: ${result.error}`);
      }
    }
    if (started > 0) console.log(`Started ${started} app(s)`);
    if (started === 0 && alreadyRunning > 0) console.log('All background apps already running');
    return;
  }

  // No valid subcommand
  console.error('Usage: clappie background <start|stop|list|kill|watchdog> [app]');
  process.exit(1);
}
