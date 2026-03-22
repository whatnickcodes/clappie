#!/usr/bin/env bun
// Clappie CLI - thin wrapper that talks to the daemon
//
// Domain logic lives in clapps:
//   - clapps/sidekicks/cli.js   (send, complete, spawn, react, etc.)
//   - clapps/background/cli.js (start/stop apps, kill sessions, etc.)
//
// This file handles: arg parsing, daemon management, command routing

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';

const DAEMON_PATH = join(dirname(import.meta.path), 'clapps', 'display-engine', 'core', 'daemon.js');
const BACKGROUND_TMUX_PATH = join(dirname(import.meta.path), 'clapps', 'background', 'tmux.js');
const BACKGROUND_CLI_PATH = join(dirname(import.meta.path), 'clapps', 'background', 'cli.js');
const SIDEKICK_CLI_PATH = join(dirname(import.meta.path), 'clapps', 'sidekicks', 'cli.js');
const SIDEKICK_ROUTER_PATH = join(dirname(import.meta.path), 'clapps', 'sidekicks', 'router.js');
const SKILLS_DIR = join(dirname(import.meta.path), '..');  // .claude/skills/

// Get socket path for current Claude pane (isolated per-pane)
function getSocketPath() {
  // Use TMUX_PANE env var - this is the pane where the shell is running,
  // not the currently focused pane. This ensures correct behavior even
  // when focus switches to the display pane between commands.
  const paneId = (process.env.TMUX_PANE || '').replace('%', '');
  if (!paneId) {
    console.error('TMUX_PANE not set - are you running inside tmux?');
    process.exit(1);
  }
  return `/tmp/clappie-${paneId}.sock`;
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/**
 * Parse a data value. Supports:
 *   - JSON: '{"key": "value"}' or '[1,2,3]'
 *   - Key=value: 'name=Bob'
 *   - File reference: 'body=@/tmp/draft.txt' (@ reads file contents)
 */
function parseDataValue(str) {
  const trimmed = str.trim();

  // JSON object or array
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return { _json: JSON.parse(trimmed) };
    } catch (e) {
      console.error(`Invalid JSON: ${trimmed}`);
      process.exit(1);
    }
  }

  // Key=value format
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) {
    console.error(`Invalid data format: ${trimmed}\nUse key=value or JSON`);
    process.exit(1);
  }

  const key = trimmed.slice(0, eqIdx);
  let value = trimmed.slice(eqIdx + 1);

  // File reference: value starts with @
  if (value.startsWith('@')) {
    const filepath = value.slice(1);
    if (!existsSync(filepath)) {
      console.error(`File not found: ${filepath}`);
      process.exit(1);
    }
    value = readFileSync(filepath, 'utf8');
  }

  return { [key]: value };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const cmd = { action: args[0] };

  // Namespace commands: display, sidekick have subActions
  const NAMESPACES = ['display', 'sidekick'];
  if (NAMESPACES.includes(cmd.action)) {
    cmd.subAction = args[1];
  }

  // Determine where positional args start (after namespace + subAction or just action)
  const posStart = cmd.subAction ? 2 : 1;

  // Helper to check if flag exists
  const hasFlag = (long, short) => args.includes(long) || args.includes(short);

  // Helper to find flag value (supports both --flag and -f forms)
  const findFlag = (long, short) => {
    const longIdx = args.indexOf(long);
    const shortIdx = args.indexOf(short);
    return longIdx !== -1 ? longIdx : shortIdx;
  };

  // Helper to collect ALL values for a flag (supports multiple -d flags)
  const collectFlags = (long, short) => {
    const values = [];
    for (let i = 0; i < args.length; i++) {
      if ((args[i] === long || args[i] === short) && args[i + 1]) {
        values.push(args[i + 1]);
        i++; // skip value
      }
    }
    return values;
  };

  // Parse display push flags
  if (cmd.action === 'display' && cmd.subAction === 'push') {
    cmd.view = args[posStart];

    // Parse --data / -d flags (can be repeated)
    // Supports: -d key=value, -d key=@file, -d '{"json": true}'
    const dataValues = collectFlags('--data', '-d');
    if (dataValues.length > 0) {
      cmd.data = {};
      for (const val of dataValues) {
        const parsed = parseDataValue(val);
        if (parsed._json) {
          Object.assign(cmd.data, parsed._json);
        } else {
          Object.assign(cmd.data, parsed);
        }
      }
    }

    // Default is no-focus (assistant mode). Use --focus / -f to switch focus.
    cmd.noFocus = !hasFlag('--focus', '-f');

  } else if (cmd.action === 'display' && cmd.subAction === 'toast') {
    cmd.message = args[posStart];

    // Parse --duration / -t flag
    const durIdx = findFlag('--duration', '-t');
    if (durIdx !== -1 && args[durIdx + 1]) {
      cmd.duration = parseInt(args[durIdx + 1]);
    }
  }

  return cmd;
}

async function isDaemonRunning(socketPath) {
  if (!existsSync(socketPath)) return false;

  try {
    const socket = await Bun.connect({
      unix: socketPath,
      socket: {
        data() {},
        error() {},
      },
    });
    socket.write(JSON.stringify({ action: 'ping' }));
    socket.end();
    return true;
  } catch {
    return false;
  }
}

async function startDaemon(initialView, initialData, options = {}) {
  // Get current tmux pane (this is Claude's pane)
  const result = Bun.spawnSync(['tmux', 'display-message', '-p', '#{pane_id}']);
  const claudePane = result.stdout.toString().trim();

  // Socket path is based on Claude's pane ID (for isolation)
  const socketPath = getSocketPath();

  // Get pane dimensions to detect mobile vs desktop
  const dimsResult = Bun.spawnSync(['tmux', 'display-message', '-p', '#{pane_width},#{pane_height}']);
  const [paneWidth, paneHeight] = dimsResult.stdout.toString().trim().split(',').map(Number);

  // Mobile detection: vertical orientation or narrow width
  const isMobile = paneHeight > paneWidth || paneWidth < 120;

  // Desktop: split right 70%, Mobile: split below 70%
  const splitDirection = isMobile ? '-v' : '-h';
  const splitSize = '70%';

  // Spawn daemon in a new tmux pane
  const tmuxCmd = [
    'tmux', 'split-window', splitDirection,
    '-l', splitSize,
    '-P', '-F', '#{pane_id}',  // Print new pane ID
  ];

  // Mobile: open above (-b = before) so UI is on top, chat below
  if (isMobile) {
    tmuxCmd.push('-b');
  }

  // -d flag keeps focus on current pane (don't switch to new pane)
  if (options.noFocus) {
    tmuxCmd.push('-d');
  }

  // Pass environment variables to daemon
  tmuxCmd.push('-e', `CLAPPIE_CLAUDE_PANE=${claudePane}`);
  tmuxCmd.push('-e', `CLAPPIE_SOCKET_PATH=${socketPath}`);

  // Pass through CLAPPIE_ALLOW_SENDKEYS if set (enables ctx.submit/ctx.send in background)
  if (process.env.CLAPPIE_ALLOW_SENDKEYS === '1') {
    tmuxCmd.push('-e', 'CLAPPIE_ALLOW_SENDKEYS=1');
  }

  if (initialView) {
    tmuxCmd.push('-e', `CLAPPIE_INITIAL_VIEW=${initialView}`);
    if (initialData) {
      tmuxCmd.push('-e', `CLAPPIE_INITIAL_DATA=${JSON.stringify(initialData)}`);
    }
  }

  tmuxCmd.push('bun', DAEMON_PATH);

  const spawnResult = Bun.spawnSync(tmuxCmd);
  const newPaneId = spawnResult.stdout.toString().trim();

  // Mobile: zoom the display pane to overlay fullscreen
  // When pane closes (X or Escape), zoom auto-exits back to Claude
  if (isMobile && newPaneId) {
    Bun.spawnSync(['tmux', 'resize-pane', '-Z', '-t', newPaneId]);
  }

  // Wait for daemon to start
  let attempts = 0;
  while (attempts < 50) {
    await Bun.sleep(100);
    if (await isDaemonRunning(socketPath)) return true;
    attempts++;
  }

  console.error('Daemon failed to start');
  return false;
}

async function sendCommandWithResponse(cmd, socketPath, timeoutMs = 2000) {
  try {
    return await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), timeoutMs);

      Bun.connect({
        unix: socketPath,
        socket: {
          data(socket, data) {
            clearTimeout(timeout);
            socket.end();
            resolve(data.toString());
          },
          error() {
            clearTimeout(timeout);
            resolve(null);
          },
          open(socket) {
            socket.write(JSON.stringify(cmd));
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

async function sendCommand(cmd, socketPath) {
  try {
    const socket = await Bun.connect({
      unix: socketPath,
      socket: {
        data() {},
        error(_socket, err) {
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

// Sidekick CLI commands are in clapps/sidekicks/cli.js

// Background CLI commands are in clapps/background/cli.js

// -------------------------------------------------------------------
// Command: list (discover all available commands)
// -------------------------------------------------------------------

async function listCommand(subcommand = null) {
  const CLAPPS_DIR = join(dirname(import.meta.path), 'clapps');

  // ANSI colors
  const dim = (s) => `\x1b[2m${s}\x1b[0m`;
  const bold = (s) => `\x1b[1m${s}\x1b[0m`;
  const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
  const green = (s) => `\x1b[32m${s}\x1b[0m`;
  const magenta = (s) => `\x1b[35m${s}\x1b[0m`;

  // Discover skills with meta exports (standalone skills + clapps with CLIs)
  async function discoverSkills() {
    const skills = [];
    const seen = new Set();

    async function scanDir(baseDir, { skipClappie = false } = {}) {
      try {
        const dirs = readdirSync(baseDir);
        for (const dir of dirs) {
          if (skipClappie && dir === 'clappie') continue;
          if (dir === 'display-engine' || dir === 'skill-maker' || dir === 'example-demo-screens') continue;
          if (seen.has(dir)) continue;
          const skillPath = join(baseDir, dir);
          if (!statSync(skillPath).isDirectory()) continue;

          const scriptPath = existsSync(join(skillPath, `${dir}.js`))
            ? join(skillPath, `${dir}.js`)
            : existsSync(join(skillPath, 'index.js'))
              ? join(skillPath, 'index.js')
              : null;

          let skillData = { name: dir, description: '', commands: [] };

          if (scriptPath) {
            try {
              const mod = await import(scriptPath);
              if (mod.meta) {
                skillData = { ...skillData, ...mod.meta };
              }
            } catch (e) {
              skillData.description = dim('(error loading)');
            }
          }

          if (skillData.commands.length > 0 || scriptPath) {
            skills.push(skillData);
            seen.add(dir);
          }
        }
      } catch (e) {
        // Dir might not exist
      }
    }

    await scanDir(SKILLS_DIR, { skipClappie: true });
    await scanDir(join(dirname(import.meta.path), 'clapps'));
    return skills;
  }

  // Discover all displays (internal clapps + skill displays)
  function discoverAllDisplays() {
    const internal = []; // clappie clapps
    const external = []; // skill displays

    // Internal clapps
    try {
      const clappDirs = readdirSync(CLAPPS_DIR);
      for (const dir of clappDirs) {
        if (dir === 'display-engine') continue;
        const displaysPath = join(CLAPPS_DIR, dir, 'displays');
        if (!existsSync(displaysPath)) continue;

        const files = readdirSync(displaysPath).filter(f => f.endsWith('.js'));
        const views = files.map(f => f === 'index.js' ? null : f.replace('.js', '')).filter(Boolean);
        internal.push({ name: dir, views });
      }
    } catch (e) {
      // Ignore
    }

    // External skill displays
    try {
      const skillDirs = readdirSync(SKILLS_DIR);
      for (const dir of skillDirs) {
        if (dir === 'clappie') continue;
        const displaysPath = join(SKILLS_DIR, dir, 'displays');
        if (!existsSync(displaysPath)) continue;

        const files = readdirSync(displaysPath).filter(f => f.endsWith('.js'));
        const views = files.map(f => f === 'index.js' ? null : f.replace('.js', '')).filter(Boolean);
        external.push({ name: dir, views });
      }
    } catch (e) {
      // Ignore
    }

    return { internal, external };
  }

  // Discover background apps
  async function discoverBackground() {
    try {
      const { discoverBackgroundApps, isAppRunning } = await import(BACKGROUND_TMUX_PATH);
      const apps = discoverBackgroundApps();
      const results = [];
      for (const app of apps) {
        const running = await isAppRunning(app.id);
        results.push({ ...app, running });
      }
      return results;
    } catch (e) {
      return [];
    }
  }

  // Print skills section
  function printSkills(skills) {
    console.log(`\n${bold('SKILLS')} ${dim('clappie <skill> <command>')}\n`);
    for (const skill of skills) {
      console.log(`  ${cyan(skill.name.padEnd(14))} ${dim(skill.description || '')}`);
      for (const cmd of skill.commands || []) {
        console.log(`    ${green(cmd.cmd.padEnd(26))} ${dim(cmd.desc)}`);
      }
    }
  }

  // Print displays section
  function printDisplays(displays) {
    console.log(`\n${bold('DISPLAYS')} ${dim('clappie display push <view>')}\n`);

    // Internal clapps
    if (displays.internal.length > 0) {
      console.log(`  ${dim('─── internal ───')}`);
      for (const d of displays.internal) {
        const viewsStr = d.views.length > 0 ? dim(` (${d.views.join(', ')})`) : '';
        console.log(`  ${cyan(d.name)}${viewsStr}`);
      }
    }

    // External skill displays
    if (displays.external.length > 0) {
      console.log(`  ${dim('─── skills ───')}`);
      for (const d of displays.external) {
        const viewsStr = d.views.length > 0 ? dim(` (${d.views.join(', ')})`) : '';
        console.log(`  ${magenta(`/${d.name}`)}${viewsStr}`);
      }
    }

    // Navigation commands
    console.log(`\n  ${dim('─── commands ───')}`);
    console.log(`  ${green('display push <view>')}      ${dim('Open a display')}`);
    console.log(`  ${green('display push <view> -f')}   ${dim('Open + focus the pane')}`);
    console.log(`  ${green('display push -d key=val')}  ${dim('Pass data to view')}`);
    console.log(`  ${green('display pop')}              ${dim('Go back one view')}`);
    console.log(`  ${green('display close')}            ${dim('Close display entirely')}`);
    console.log(`  ${green('display toast "msg"')}      ${dim('Show notification')}`);
    console.log(`  ${green('display list')}               ${dim('List running instances')}`);
    console.log(`  ${green('display kill')}             ${dim('Kill all displays')}`);
  }

  // Print background section
  function printBackground(backgroundApps, showCommands = false) {
    console.log(`\n${bold('BACKGROUND')} ${dim('clappie background <cmd>')}\n`);

    if (backgroundApps.length > 0) {
      console.log(`  ${dim('─── apps ───')}`);
      for (const app of backgroundApps) {
        const status = app.running ? green('● running') : dim('○ stopped');
        console.log(`  ${cyan(app.id.padEnd(14))} ${status}  ${dim(app.name)}`);
      }
    }

    if (showCommands || backgroundApps.length === 0) {
      console.log(`\n  ${dim('─── commands ───')}`);
      console.log(`  ${green('background start')}       ${dim('Start all background apps')}`);
      console.log(`  ${green('background start <app>')} ${dim('Start one app')}`);
      console.log(`  ${green('background stop')}        ${dim('Stop all apps')}`);
      console.log(`  ${green('background stop <app>')}  ${dim('Stop one app')}`);
      console.log(`  ${green('background list')}        ${dim('List apps + status')}`);
      console.log(`  ${green('background kill')}        ${dim('Kill background sessions')}`);
    }
  }

  // Print sidekick section
  function printSidekick() {
    console.log(`\n${bold('SIDEKICK')} ${dim('clappie sidekick <cmd> ...')}\n`);
    const sidekickCmds = [
      ['sidekick spawn [name] "prompt"', 'Spawn sidekick (name optional)'],
      ['sidekick end <name|@squad|all>', 'Graceful stop (30s grace)'],
      ['sidekick kill <name|@squad|all>', 'Force kill (immediate)'],
      ['sidekick message <target> "text"', 'Message a sidekick by name'],
      ['sidekick broadcast "text"', 'Broadcast to all sidekicks'],
      ['sidekick list [--squad X]', 'Show active sidekicks'],
      ['sidekick send <id> "msg"', 'Send to external user'],
      ['sidekick complete <id> "summary"', 'End sidekick (self)'],
      ['sidekick log <id> "action"', 'Log action (silent)'],
      ['sidekick report <id> "msg"', 'Message main Claude terminal'],
    ];
    for (const [cmd, desc] of sidekickCmds) {
      console.log(`  ${green(cmd.padEnd(36))} ${dim(desc)}`);
    }
  }

  // Print OAuth section
  function printOAuth() {
    console.log(`\n${bold('OAUTH')} ${dim('clappie oauth <cmd> ...')}\n`);
    const oauthCmds = [
      ['oauth auth <provider>', 'Start OAuth flow'],
      ['oauth token <provider>', 'Get token (auto-refresh)'],
      ['oauth status', 'Show all tokens'],
      ['oauth refresh <provider>', 'Force token refresh'],
      ['oauth revoke <provider>', 'Delete tokens'],
      ['oauth providers', 'List available providers'],
    ];
    for (const [cmd, desc] of oauthCmds) {
      console.log(`  ${green(cmd.padEnd(30))} ${dim(desc)}`);
    }
  }

  // Print Webhooks section
  async function printWebhooks() {
    const router = await import(SIDEKICK_ROUTER_PATH);
    const routes = await router.listAvailableRoutes();
    const port = router.getPort();

    console.log(`\n${bold('WEBHOOKS')} ${dim(`clappie webhooks <cmd> (port ${port})`)}\n`);

    if (routes.length > 0) {
      console.log(`  ${dim('─── routes ───')}`);
      for (const route of routes) {
        const status = route.enabled ? green('●') : dim('○');
        console.log(`  ${status} ${cyan(route.key.padEnd(24))} ${dim(route.description || '')}`);
      }
    }

    console.log(`\n  ${dim('─── commands ───')}`);
    console.log(`  ${green('webhooks')}               ${dim('Show webhook status')}`);
    console.log(`  ${green('webhooks enable <route>')}  ${dim('Enable a route')}`);
    console.log(`  ${green('webhooks disable <route>')} ${dim('Disable a route')}`);
  }

  // Handle subcommands
  if (subcommand === 'skills') {
    const skills = await discoverSkills();
    printSkills(skills);
    console.log('');
    return;
  }

  if (subcommand === 'displays') {
    const displays = discoverAllDisplays();
    printDisplays(displays);
    console.log('');
    return;
  }

  if (subcommand === 'background') {
    const backgroundApps = await discoverBackground();
    printBackground(backgroundApps, true);
    console.log('');
    return;
  }

  if (subcommand === 'sidekick') {
    printSidekick();
    console.log('');
    return;
  }

  if (subcommand === 'oauth') {
    printOAuth();
    console.log('');
    return;
  }

  if (subcommand === 'webhooks') {
    await printWebhooks();
    console.log('');
    return;
  }

  // Default: show everything
  const [skills, backgroundApps] = await Promise.all([
    discoverSkills(),
    discoverBackground(),
  ]);
  const displays = discoverAllDisplays();

  printSkills(skills);
  printDisplays(displays);
  printBackground(backgroundApps, true);
  printSidekick();
  printOAuth();
  await printWebhooks();
  console.log('');
}

// -------------------------------------------------------------------
// Main
// -------------------------------------------------------------------

async function main() {
  const cmd = parseArgs(process.argv);

  if (!cmd.action) {
    console.log(`
Clappie - Terminal Display for Claude Code

Usage:
  clappie list [skills|displays|background|sidekick|oauth|webhooks]

Display:
  clappie display push <view> [options]     Open a display
  clappie display pop                       Go back one view
  clappie display toast "<message>" [-t ms] Show notification
  clappie display close                     Close display entirely
  clappie display list                        List running instances
  clappie display kill                      Kill all displays (keep background)
  clappie display capture                   Debug: dump pane content as text

Sidekick:
  clappie sidekick spawn "<prompt>" [--model X]        Spawn autonomous AI agent
  clappie sidekick send <id> "<message>"               Send message to user
  clappie sidekick react <id> <message-id> [emoji]     React (skill extension)
  clappie sidekick combo <id> <message-id> <emoji> ... Combo react (skill extension)
  clappie sidekick sticker <id> <set-name> [index|random]  Sticker (skill extension)
  clappie sidekick send-file <id> <type> "<path>"      Send file (skill extension)
  clappie sidekick complete <id> ["<message>"]         End sidekick
  clappie sidekick log <id> "<action>"                 Log action (silent)
  clappie sidekick report <id> "<message>"             Message main Claude terminal

Background:
  clappie background start [app]            Start all or one background app
  clappie background stop [app]             Stop all or one background app
  clappie background list                   List background apps + status
  clappie background kill                   Kill background sessions only

OAuth:
  clappie oauth auth <provider>             Start OAuth flow
  clappie oauth token <provider>            Get token (auto-refresh)
  clappie oauth status                      Show all stored tokens
  clappie oauth refresh <provider>          Force token refresh
  clappie oauth revoke <provider>           Delete stored tokens
  clappie oauth providers                   List available providers

Skills (auto-discovered):
  clappie <skill> <command> [args]          Route to skill script

Global:
  clappie kill                              Kill everything (displays + background)

Display options:
  -f, --focus         Switch focus to display pane (default: stay in chat)
  -d, --data <value>  Pass data to view (repeatable: -d key=value -d key=@file -d '{"json":true}')
  -t, --duration <ms> Toast display duration in milliseconds

Examples:
  clappie display push hello-world -f
  clappie display push email/compose -d to=bob@x.com -d body=@/tmp/draft.txt
  clappie display toast "Done!" -t 3000
  clappie sidekick spawn "Check my emails and summarize unread"
  clappie sidekick send abc123 "Working on it..."
  clappie sidekick complete abc123 "All done!"
`);
    process.exit(0);
  }

  // Global commands (don't need a specific socket)
  if (cmd.action === 'list') {
    const subcommand = process.argv[3]; // 'skills', 'displays', or undefined
    await listCommand(subcommand);
    return;
  }

  // ─── DISPLAY namespace ───────────────────────────────────────────
  if (cmd.action === 'display') {
    if (!cmd.subAction) {
      console.error('Usage: clappie display <push|pop|toast|close|list|kill|capture>');
      process.exit(1);
    }

    // display kill — kill all displays, keep background
    if (cmd.subAction === 'kill') {
      const background = await import(BACKGROUND_CLI_PATH);
      await background.killAllExceptBackground();
      return;
    }

    // display list — list running instances
    if (cmd.subAction === 'list' || cmd.subAction === 'ls') {
      const background = await import(BACKGROUND_CLI_PATH);
      await background.listInstances();
      return;
    }

    // display capture — debug: dump pane content
    if (cmd.subAction === 'capture') {
      const socketPath = getSocketPath();
      if (!(await isDaemonRunning(socketPath))) {
        console.error('Clappie display is not running.');
        process.exit(1);
      }
      const output = await sendCommandWithResponse({ action: 'capture' }, socketPath);
      if (output) {
        process.stdout.write(output);
      } else {
        console.error('No response from display');
        process.exit(1);
      }
      return;
    }

    // display push/pop/toast/close — daemon socket commands
    const socketPath = getSocketPath();
    const running = await isDaemonRunning(socketPath);

    if (!running) {
      if (cmd.subAction === 'push') {
        console.log('Starting Clappie display...');
        const started = await startDaemon(cmd.view, cmd.data, { noFocus: cmd.noFocus });
        if (!started) process.exit(1);
        return;
      } else {
        console.error('Clappie display is not running. Use "clappie display push <view>" to start.');
        process.exit(1);
      }
    }

    // Map subAction to daemon action (daemon protocol unchanged)
    const daemonCmd = { action: cmd.subAction };
    if (cmd.subAction === 'push') {
      daemonCmd.view = cmd.view;
      daemonCmd.data = cmd.data;
      daemonCmd.noFocus = cmd.noFocus;
    } else if (cmd.subAction === 'toast') {
      daemonCmd.message = cmd.message;
      daemonCmd.duration = cmd.duration;
    }

    const success = await sendCommand(daemonCmd, socketPath);
    if (!success) process.exit(1);
    return;
  }

  // ─── BACKGROUND namespace ───────────────────────────────────────
  if (cmd.action === 'background') {
    const background = await import(BACKGROUND_CLI_PATH);
    await background.command(process.argv.slice(2));
    return;
  }

  // ─── KILL (nuclear) ──────────────────────────────────────────────
  if (cmd.action === 'kill') {
    const background = await import(BACKGROUND_CLI_PATH);
    await background.killAll();
    return;
  }

  // ─── SIDEKICK namespace ───────────────────────────────────────────
  if (cmd.action === 'sidekick') {
    // All sidekick args shift by +1 because of namespace
    // clappie sidekick <subAction> <arg1> <arg2> ...
    // argv:    [0]bun [1]script [2]sidekick [3]subAction [4]arg1 [5]arg2 ...
    const sub = cmd.subAction;

    // Implicit sidekick ID: if CLAPPIE_SIDEKICK_ID is set (inside a sidekick pane),
    // commands can omit the ID. Explicit ID always overrides.
    // Returns { id, args } where args are the remaining positional args after ID resolution.
    const ENV_ID = process.env.CLAPPIE_SIDEKICK_ID;
    const looksLikeSidekickId = (s) => s && s.includes('-') && /^\d{4}-/.test(s);
    function resolveId(positionalArgs) {
      if (!positionalArgs.length) return { id: ENV_ID || null, args: [] };
      // If env var is set and first arg does NOT look like a sidekick ID, use env
      if (ENV_ID && !looksLikeSidekickId(positionalArgs[0])) {
        return { id: ENV_ID, args: positionalArgs };
      }
      // First arg is an explicit sidekick ID (or no env var)
      return { id: positionalArgs[0], args: positionalArgs.slice(1) };
    }

    if (!sub) {
      console.error('Usage: clappie sidekick <spawn|end|kill|message|broadcast|list|send|complete|log|report|react|combo|sticker|send-file>');
      process.exit(1);
    }

    if (sub === 'spawn') {
      // Parse: clappie sidekick spawn [name] "prompt" [--squad X]
      // If two non-flag args: first is name, second is prompt
      // If one non-flag arg: it's the prompt (no name)
      const args = process.argv.slice(4);

      // Extract --squad and --name flags
      const flagValue = (flag) => {
        const idx = args.indexOf(flag);
        return idx !== -1 ? (args[idx + 1] || '') : '';
      };
      const squad = flagValue('--squad');
      const nameFlag = flagValue('--name');
      const emojiFlag = flagValue('--emoji');
      const modelFlag = flagValue('--model');
      const sourceFlag = flagValue('--source');
      const promptModeFlag = flagValue('--prompt-mode');
      const contextFileFlag = flagValue('--context-file');
      const simulationIdFlag = flagValue('--simulation-id');
      const identityFlag = flagValue('--identity');
      const displayNameFlag = flagValue('--display-name');
      const superCCFlag = args.includes('--super-cc');

      // Strip flags and their values from positional args
      const flagNames = ['--squad', '--name', '--emoji', '--model', '--source', '--prompt-mode', '--context-file', '--simulation-id', '--identity', '--display-name'];
      const positional = args.filter((a, i) => {
        if (flagNames.includes(a)) return false;
        if (a === '--super-cc') return false; // boolean flag, no value
        // Skip values of flags
        if (i > 0 && flagNames.includes(args[i - 1])) return false;
        return true;
      });

      let name = nameFlag;
      let prompt = '';
      if (!name && positional.length >= 2) {
        // Legacy: clappie sidekick spawn myname "prompt"
        name = positional[0];
        prompt = positional[1];
      } else if (!name && positional.length === 1) {
        prompt = positional[0];
      } else {
        // --name was used, prompt is first positional
        prompt = positional[0] || '';
      }

      if (!prompt && !contextFileFlag) {
        console.error('Usage: clappie sidekick spawn [name] "<prompt>" [--squad <squad>]');
        console.error('');
        console.error('Examples:');
        console.error('  clappie sidekick spawn bobby-b "Research the API and find auth docs"');
        console.error('  clappie sidekick spawn bobby-b "Research the API" --squad project-x');
        console.error('  clappie sidekick spawn "Quick task without a name"');
        console.error('  clappie sidekick spawn --name bob --context-file /tmp/ctx.txt');
        process.exit(1);
      }
      // Validate name if provided
      if (name) {
        const { validateSidekickName } = await import(join(dirname(import.meta.path), 'clapps', 'sidekicks', 'state.js'));
        const check = validateSidekickName(name);
        if (!check.valid) {
          console.error(`✗ Invalid sidekick name: ${check.reason}`);
          process.exit(1);
        }
      }
      const sidekick = await import(SIDEKICK_CLI_PATH);
      await sidekick.spawn(prompt, { name, squad, emoji: emojiFlag || undefined, model: modelFlag || undefined, source: sourceFlag || undefined, superCC: superCCFlag, promptMode: promptModeFlag || undefined, contextFile: contextFileFlag || undefined, simulationId: simulationIdFlag || undefined, identity: identityFlag || undefined, displayName: displayNameFlag || undefined });
      return;
    }

    if (sub === 'send') {
      const replyToIdx = process.argv.indexOf('--reply-to');
      const replyToMessageId = replyToIdx !== -1 ? parseInt(process.argv[replyToIdx + 1]) : undefined;
      // Collect positional args (before any --flags)
      const allArgs = process.argv.slice(4);
      const positional = [];
      for (const a of allArgs) { if (a.startsWith('--')) break; positional.push(a); }
      const { id, args } = resolveId(positional);
      if (!id || !args[0]) {
        console.error('Usage: clappie sidekick send [id] "<message>" [--reply-to <msgId>]');
        process.exit(1);
      }
      const sidekick = await import(SIDEKICK_CLI_PATH);
      await sidekick.send(id, args[0], { replyToMessageId });
      return;
    }

    if (sub === 'complete') {
      const { id, args } = resolveId(process.argv.slice(4));
      if (!id) {
        console.error('Usage: clappie sidekick complete [id] ["<summary>"]');
        process.exit(1);
      }
      const sidekick = await import(SIDEKICK_CLI_PATH);
      await sidekick.complete(id, args[0] || 'Sidekick complete.');
      return;
    }

    if (sub === 'log') {
      const { id, args } = resolveId(process.argv.slice(4));
      if (!id || !args[0]) {
        console.error('Usage: clappie sidekick log [id] "<action>"');
        process.exit(1);
      }
      const sidekick = await import(SIDEKICK_CLI_PATH);
      await sidekick.log(id, args[0]);
      return;
    }

    if (sub === 'send-file') {
      const { id, args } = resolveId(process.argv.slice(4));
      if (!id || !args[0] || !args[1]) {
        console.error('Usage: clappie sidekick send-file [id] <type> "/path" ["caption"]');
        process.exit(1);
      }
      const sidekick = await import(SIDEKICK_CLI_PATH);
      await sidekick.skillCommand(id, 'send-file', [args[0], args[1], args[2] || '']);
      return;
    }

    if (sub === 'sticker') {
      const { id, args } = resolveId(process.argv.slice(4));
      if (!id || !args[0]) {
        console.error('Usage: clappie sidekick sticker [id] <sticker-set> [index|random]');
        process.exit(1);
      }
      const sidekick = await import(SIDEKICK_CLI_PATH);
      await sidekick.skillCommand(id, 'sticker', [args[0], args[1]].filter(Boolean));
      return;
    }

    if (sub === 'report') {
      const { id, args } = resolveId(process.argv.slice(4));
      if (!id || !args[0]) {
        console.error('Usage: clappie sidekick report [id] "<message>"');
        process.exit(1);
      }
      const sidekick = await import(SIDEKICK_CLI_PATH);
      await sidekick.report(id, args[0]);
      return;
    }

    if (sub === 'end') {
      const target = process.argv[4];
      if (!target) {
        console.error('Usage: clappie sidekick end <name|@squad|all>');
        console.error('');
        console.error('Examples:');
        console.error('  clappie sidekick end bobby-b          # End one sidekick');
        console.error('  clappie sidekick end @crew             # End all in squad');
        console.error('  clappie sidekick end all               # End everything');
        process.exit(1);
      }
      const sidekick = await import(SIDEKICK_CLI_PATH);
      await sidekick.end(target);
      return;
    }

    if (sub === 'kill') {
      const target = process.argv[4];
      if (!target) {
        console.error('Usage: clappie sidekick kill <name|@squad|all>');
        console.error('');
        console.error('Examples:');
        console.error('  clappie sidekick kill bobby-b          # Kill immediately');
        console.error('  clappie sidekick kill @crew             # Kill all in squad');
        console.error('  clappie sidekick kill all               # Kill everything');
        process.exit(1);
      }
      const sidekick = await import(SIDEKICK_CLI_PATH);
      await sidekick.kill(target);
      return;
    }

    if (sub === 'message') {
      const target = process.argv[4];
      const text = process.argv[5];
      if (!target || !text) {
        console.error('Usage: clappie sidekick message <name|name1,name2|@squad> "<text>"');
        console.error('');
        console.error('Examples:');
        console.error('  clappie sidekick message bobby-b "what is your status?"');
        console.error('  clappie sidekick message bobby-b,triple-c "hey both of you"');
        console.error('  clappie sidekick message @crew "regroup"');
        process.exit(1);
      }
      // If called from inside a sidekick, try to detect our own name for the "from" field
      const from = process.env.CLAPPIE_SIDEKICK_NAME || '';
      const sidekick = await import(SIDEKICK_CLI_PATH);
      await sidekick.message(target, text, { from });
      return;
    }

    if (sub === 'broadcast') {
      const args = process.argv.slice(4);
      const squadIdx = args.indexOf('--squad');
      const squad = squadIdx !== -1 ? (args[squadIdx + 1] || '') : '';
      if (squadIdx !== -1 && !squad) {
        console.error('✗ --squad requires a value');
        process.exit(1);
      }
      const positional = args.filter((a, i) => a !== '--squad' && (squadIdx === -1 || i !== squadIdx + 1));
      const text = positional[0];

      if (!text) {
        console.error('Usage: clappie sidekick broadcast "<text>" [--squad <squad>]');
        console.error('');
        console.error('Examples:');
        console.error('  clappie sidekick broadcast "phase 1 complete"');
        console.error('  clappie sidekick broadcast "regroup" --squad crew');
        process.exit(1);
      }
      const from = process.env.CLAPPIE_SIDEKICK_NAME || '';
      const fromId = process.env.CLAPPIE_SIDEKICK_ID || '';
      const sidekick = await import(SIDEKICK_CLI_PATH);
      await sidekick.broadcast(text, { from, fromId, squad });
      return;
    }

    if (sub === 'list') {
      const args = process.argv.slice(4);
      const squadIdx = args.indexOf('--squad');
      const squad = squadIdx !== -1 ? (args[squadIdx + 1] || '') : '';
      if (squadIdx !== -1 && !squad) {
        console.error('✗ --squad requires a value');
        process.exit(1);
      }
      const sidekick = await import(SIDEKICK_CLI_PATH);
      await sidekick.list({ squad });
      return;
    }

    if (sub === 'react') {
      const { id, args } = resolveId(process.argv.slice(4));
      if (!id || !args[0]) {
        console.error('Usage: clappie sidekick react [id] <message-id> [emoji]');
        process.exit(1);
      }
      const sidekick = await import(SIDEKICK_CLI_PATH);
      await sidekick.skillCommand(id, 'react', [args[0], args[1] || '']);
      return;
    }

    if (sub === 'combo') {
      const { id, args } = resolveId(process.argv.slice(4));
      if (!id || !args[0] || args.length < 2) {
        console.error('Usage: clappie sidekick combo [id] <message-id> <emoji1> <emoji2> ...');
        process.exit(1);
      }
      const sidekick = await import(SIDEKICK_CLI_PATH);
      await sidekick.skillCommand(id, 'combo', args);
      return;
    }

    console.error(`Unknown sidekick command: ${sub}`);
    console.error('Usage: clappie sidekick <spawn|send|send-file|sticker|react|combo|complete|log|report>');
    process.exit(1);
  }

  // ─── OAUTH ───────────────────────────────────────────────────────
  if (cmd.action === 'oauth') {
    const OAUTH_SCRIPT = join(dirname(import.meta.path), 'clapps', 'oauth', 'oauth.js');
    const oauthArgs = process.argv.slice(3);
    const result = spawnSync('bun', [OAUTH_SCRIPT, ...oauthArgs], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
    });
    process.exit(result.status || 0);
  }

  // ─── WEBHOOKS ────────────────────────────────────────────────────
  if (cmd.action === 'webhooks') {
    const router = await import(SIDEKICK_ROUTER_PATH);
    const subCmd = process.argv[3];
    const arg = process.argv[4];

    const dim = (s) => `\x1b[2m${s}\x1b[0m`;
    const green = (s) => `\x1b[32m${s}\x1b[0m`;
    const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

    if (subCmd === 'status' || !subCmd) {
      const routes = await router.listAvailableRoutes();
      const port = router.getPort();

      console.log(`\n${cyan('Webhooks')} ${dim(`(port ${port})`)}\n`);

      if (routes.length === 0) {
        console.log(dim('  No webhook routes found. Skills can ship webhook.json to register routes.\n'));
        process.exit(0);
      }

      for (const route of routes) {
        const status = route.enabled ? green('● enabled') : dim('○ disabled');
        const path = route.enabled && route.path ? dim(` → ${route.path}`) : '';
        console.log(`  ${status}  ${cyan(route.key)}${path}`);
        if (route.description) {
          console.log(`           ${dim(route.description)}`);
        }
      }
      console.log('');
      process.exit(0);
    }

    if (subCmd === 'enable') {
      if (!arg) {
        console.error('Usage: clappie webhooks enable <skill/route>');
        console.error('  Example: clappie webhooks enable telegram-bot/updates');
        process.exit(1);
      }
      const routes = await router.listAvailableRoutes();
      const route = routes.find(r => r.key === arg);
      if (!route) {
        console.error(`Route not found: ${arg}`);
        console.log(`Available: ${routes.map(r => r.key).join(', ')}`);
        process.exit(1);
      }
      if (route.enabled) {
        console.log(`${arg} is already enabled`);
        process.exit(0);
      }
      router.enableRoute(arg);
      const updatedRoutes = await router.listAvailableRoutes();
      const updated = updatedRoutes.find(r => r.key === arg);
      console.log(`${green('✓')} Enabled ${arg}`);
      if (updated?.path) {
        console.log(`  Path: ${updated.path}`);
      }
      process.exit(0);
    }

    if (subCmd === 'disable') {
      if (!arg) {
        console.error('Usage: clappie webhooks disable <skill/route>');
        process.exit(1);
      }
      const routes = await router.listAvailableRoutes();
      const route = routes.find(r => r.key === arg);
      if (!route) {
        console.error(`Route not found: ${arg}`);
        process.exit(1);
      }
      if (!route.enabled) {
        console.log(`${arg} is already disabled`);
        process.exit(0);
      }
      router.disableRoute(arg);
      console.log(`${green('✓')} Disabled ${arg}`);
      process.exit(0);
    }

    console.error(`Unknown webhooks command: ${subCmd}`);
    console.error('Usage: clappie webhooks [status|enable|disable] [route]');
    process.exit(1);
  }

  // ─── SKILL ROUTING ───────────────────────────────────────────────
  // clappie <skill> <args...> → .claude/skills/<skill>/<skill>.js <args...>
  // Also checks clapps/<name>/<name>.js for internal clapps with CLIs
  if (cmd.action && cmd.action !== 'clappie') {
    // Check standalone skills first, then clapps
    const CLAPPS_DIR = join(dirname(import.meta.path), 'clapps');
    const candidates = [
      join(SKILLS_DIR, cmd.action),
      join(CLAPPS_DIR, cmd.action),
    ];
    for (const skillDir of candidates) {
      if (existsSync(skillDir) && statSync(skillDir).isDirectory()) {
        const skillScript = existsSync(join(skillDir, `${cmd.action}.js`))
          ? join(skillDir, `${cmd.action}.js`)
          : existsSync(join(skillDir, 'index.js'))
            ? join(skillDir, 'index.js')
            : null;

        if (skillScript) {
          const skillArgs = process.argv.slice(3);
          const result = spawnSync('bun', [skillScript, ...skillArgs], {
            stdio: 'inherit',
            cwd: process.cwd(),
            env: process.env,
          });
          process.exit(result.status || 0);
        }
      }
    }
  }

  console.error(`Unknown command: ${cmd.action}`);
  console.error('Run "clappie" with no args for usage.');
  process.exit(1);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
