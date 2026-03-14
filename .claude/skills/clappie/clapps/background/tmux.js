// Background tmux helpers
// Each background task gets its own session: background-<appId>

import { $ } from 'bun';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const CLAPPS_DIR = join(import.meta.dir, '..');

// ─────────────────────────────────────────────────────────────────────────────
// SESSION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getSessionName(appId) {
  return `background-${appId}`;
}

export async function sessionExists(sessionName) {
  try {
    await $`tmux has-session -t ${sessionName} 2>/dev/null`;
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GHOSTTY WINDOW MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export async function openGhosttyForSession(sessionName) {
  // On Linux (headless/server), skip GUI window — sessions run detached
  if (process.platform !== 'darwin') return { ok: true };
  // Open a larger Ghostty window attached to the session
  await $`open -na Ghostty --args --window-height=80 --window-width=300 -e bash -c "tmux attach-session -t ${sessionName}"`;
  return { ok: true };
}

export async function isGhosttyAttached(sessionName) {
  // Check if any Ghostty process is attached to this session
  try {
    const result = await $`pgrep -f "Ghostty.*${sessionName}"`.text();
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TMUX SESSION LIST
// ─────────────────────────────────────────────────────────────────────────────

export async function getSessions() {
  try {
    await $`tmux list-sessions 2>/dev/null`.quiet();
  } catch {
    return [];
  }

  try {
    const sessionsRaw = await $`tmux list-sessions -F "#{session_name}:#{session_attached}"`.text();
    const sessionLines = sessionsRaw.trim().split('\n').filter(Boolean);

    const sessions = [];

    for (const line of sessionLines) {
      const [name, attached] = line.split(':');

      // Get windows with panes
      const windowsRaw = await $`tmux list-windows -t ${name} -F "#{window_index}:#{window_name}:#{window_active}"`.text();
      const windows = [];

      for (const winLine of windowsRaw.trim().split('\n').filter(Boolean)) {
        const [index, winName, active] = winLine.split(':');

        // Get panes for this window
        const panesRaw = await $`tmux list-panes -t ${name}:${index} -F "#{pane_id}:#{pane_current_command}:#{pane_current_path}:#{pane_active}:#{pane_title}"`.text();
        const panes = panesRaw.trim().split('\n').filter(Boolean).map(paneLine => {
          const parts = paneLine.split(':');
          const paneId = parts[0];
          const cmd = parts[1];
          const path = parts[2];
          const paneActive = parts[3];
          const title = parts.slice(4).join(':'); // Title may contain colons
          return {
            id: paneId,
            command: cmd,
            path: path,
            active: paneActive === '1',
            title: title || null,
          };
        });

        windows.push({
          index: parseInt(index),
          name: winName,
          active: active === '1',
          panes,
        });
      }

      sessions.push({
        name,
        attached: attached === '1',
        windows,
      });
    }

    return sessions;
  } catch {
    return [];
  }
}

export async function killSession(name) {
  try {
    await $`tmux kill-session -t ${name}`;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function killWindow(session, window) {
  try {
    await $`tmux kill-window -t ${session}:${window}`;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function killPane(paneId) {
  try {
    await $`tmux kill-pane -t ${paneId}`;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKGROUND APPS (clapps with .background marker)
// ─────────────────────────────────────────────────────────────────────────────

export function discoverBackgroundApps() {
  const apps = [];

  try {
    const folders = readdirSync(CLAPPS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const folder of folders) {
      const markerPath = join(CLAPPS_DIR, folder, '.background');
      if (existsSync(markerPath)) {
        // Read display name and commands from marker file
        // Format:
        //   Line 1: Display name
        //   Line 2+: Either launch args OR key: value pairs
        //     daemon: <command>  - daemon command to run
        //     status: <command>  - command to check if running (exit 0 = running)
        //     start: <command>   - one-shot start command (no tmux session)
        //     stop: <command>    - one-shot stop command
        let name = folder;
        let launchArgs = '';
        let daemonCmd = null;
        let statusCmd = null;
        let startCmd = null;
        let stopCmd = null;
        let noCliStop = false;
        try {
          const content = readFileSync(markerPath, 'utf8').trim();
          const lines = content.split('\n');
          if (lines[0]) name = lines[0].trim();
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('daemon:')) {
              daemonCmd = line.slice(7).trim();
            } else if (line.startsWith('status:')) {
              statusCmd = line.slice(7).trim();
            } else if (line.startsWith('start:')) {
              startCmd = line.slice(6).trim();
            } else if (line.startsWith('stop:')) {
              stopCmd = line.slice(5).trim();
            } else if (line === 'no-cli-stop: true' || line === 'no-cli-stop:true') {
              noCliStop = true;
            } else if (i === 1 && !line.includes(':')) {
              launchArgs = line;
            }
          }
        } catch {}

        // Resolve path placeholders:
        // - $(dirname "$0") → the .background file's directory
        // - $PROJECT_ROOT → the clappie project root
        const markerDir = join(CLAPPS_DIR, folder);
        const projectRoot = join(CLAPPS_DIR, '..', '..', '..', '..'); // .claude/skills/clappie/clapps → project root
        const resolvePaths = (cmd) => {
          if (!cmd) return cmd;
          return cmd
            .replace(/\$\(dirname "\$0"\)/g, markerDir)
            .replace(/\$PROJECT_ROOT/g, projectRoot);
        };

        // Ensure daemon/start commands inherit sops secrets from tmpfs
        const wrapWithEnv = (cmd) => {
          if (!cmd) return cmd;
          return `source /run/wash/env 2>/dev/null; ${cmd}`;
        };

        apps.push({
          id: folder,
          name,
          launchArgs,
          daemonCmd: wrapWithEnv(resolvePaths(daemonCmd)),
          statusCmd: resolvePaths(statusCmd),
          startCmd: wrapWithEnv(resolvePaths(startCmd)),
          stopCmd: resolvePaths(stopCmd),
          noCliStop,
          markerPath,
          sessionName: getSessionName(folder),
        });
      }
    }
  } catch {}

  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────────────────────
// APP LIFECYCLE - Each app gets its own session with Claude | Display
// ─────────────────────────────────────────────────────────────────────────────

export async function isAppRunning(appId, statusCmd = null) {
  // If a custom status command is provided, use it
  if (statusCmd) {
    try {
      const result = Bun.spawnSync(['bash', '-c', statusCmd]);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }
  // Otherwise check for tmux session
  const sessionName = getSessionName(appId);
  return await sessionExists(sessionName);
}

export async function launchApp(appId, launchArgs = '', daemonCmd = null) {
  const sessionName = getSessionName(appId);

  try {
    // Check if already running
    if (await sessionExists(sessionName)) {
      // Just open a new Ghostty window to attach
      await openGhosttyForSession(sessionName);
      return { ok: true, alreadyRunning: true };
    }

    // DAEMON MODE: Just run the command directly, no Claude
    if (daemonCmd) {
      // Use Bun's $ and login shell to ensure proper PATH
      try {
        await $`tmux new-session -d -s ${sessionName} -n main bash -l -c ${daemonCmd}`.quiet();
      } catch (e) {
        return { ok: false, error: e.message };
      }

      // Wait for session to be ready before opening Ghostty
      let ready = false;
      for (let i = 0; i < 10; i++) {
        if (await sessionExists(sessionName)) {
          ready = true;
          break;
        }
        await new Promise(r => setTimeout(r, 100));
      }

      if (!ready) {
        return { ok: false, error: 'Session failed to start' };
      }

      // Open Ghostty window attached to the new session
      await openGhosttyForSession(sessionName);

      return { ok: true, daemon: true };
    }

    // NORMAL MODE: Create new session with Claude Code in first pane
    // -d = detached, -s = session name, -n = window name
    // Read model setting from recall/settings/<appId>/starting-model.txt
    let claudeArgs = ['claude', '--enable-auto-mode'];
    const projectRoot = join(CLAPPS_DIR, '..', '..', '..', '..');
    const modelPath = join(projectRoot, 'recall', 'settings', appId, 'starting-model.txt');
    try {
      if (existsSync(modelPath)) {
        const model = readFileSync(modelPath, 'utf8').trim();
        if (model) claudeArgs = ['claude', '--enable-auto-mode', '--model', model];
      }
    } catch {}
    spawnSync('tmux', [
      'new-session',
      '-d',
      '-s', sessionName,
      '-n', 'main',
      '-e', 'CLAPPIE_ALLOW_SENDKEYS=1',
      ...claudeArgs
    ]);

    // Wait for Claude Code to be ready (poll for working directory in startup banner)
    const maxWait = 30000;
    const pollInterval = 500;
    let waited = 0;
    while (waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      waited += pollInterval;
      const capture = spawnSync('tmux', ['capture-pane', '-t', sessionName, '-p'], { encoding: 'utf8' });
      // Claude Code shows "~/dir" in its startup banner when ready
      if (capture.stdout && capture.stdout.includes('~/')) break;
    }

    // Build the clappie command
    const clappieCmd = launchArgs
      ? `clappie display push ${appId} ${launchArgs}`
      : `clappie display push ${appId}`;

    // Send the ! to enter bash mode, wait for it to be ready,
    // then send the command and Enter with delays between each step
    spawnSync('tmux', ['send-keys', '-t', sessionName, '-l', '!']);
    await new Promise(resolve => setTimeout(resolve, 1000));
    spawnSync('tmux', ['send-keys', '-t', sessionName, '-l', clappieCmd]);
    await new Promise(resolve => setTimeout(resolve, 500));
    spawnSync('tmux', ['send-keys', '-t', sessionName, 'Enter']);

    // Open Ghostty window attached to the new session
    await openGhosttyForSession(sessionName);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function stopApp(appId) {
  const sessionName = getSessionName(appId);

  try {
    // Kill the entire session (this closes any attached Ghostty windows too)
    await $`tmux kill-session -t ${sessionName}`;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function attachApp(appId) {
  const sessionName = getSessionName(appId);

  // Check if session exists
  if (!(await sessionExists(sessionName))) {
    return { ok: false, error: 'Session not running' };
  }

  // Open new Ghostty window attached to the session
  await openGhosttyForSession(sessionName);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// PANE IDENTIFICATION (for session tree view)
// ─────────────────────────────────────────────────────────────────────────────

export function identifyPane(paneId, command, sessionName, { claudePane, displayPane }) {
  // Check if this is the Claude chat pane
  if (paneId === claudePane) {
    return { type: 'chat', label: 'Your chat', icon: '◈' };
  }

  // Check if this is the clappie display pane
  if (paneId === displayPane) {
    return { type: 'display', label: 'Clappie display', icon: '◉' };
  }

  // Check if this is a background session
  if (sessionName.startsWith('background-')) {
    const appId = sessionName.replace('background-', '');
    return { type: 'background', label: `${appId} task`, icon: '◆' };
  }

  // Check command to infer type
  const cmd = command?.toLowerCase() || '';
  if (cmd.includes('claude')) {
    return { type: 'claude', label: 'Claude session', icon: '◇' };
  }
  if (cmd === 'bun' || cmd === 'node') {
    return { type: 'process', label: 'Running process', icon: '○' };
  }
  if (cmd === 'vim' || cmd === 'nvim') {
    return { type: 'editor', label: 'Editor', icon: '◇' };
  }
  if (cmd === 'zsh' || cmd === 'bash' || cmd === 'fish') {
    return { type: 'shell', label: 'Shell', icon: '○' };
  }

  return { type: 'unknown', label: 'Terminal', icon: '○' };
}
