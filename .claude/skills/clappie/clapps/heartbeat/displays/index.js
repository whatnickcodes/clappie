// Heartbeat - Scheduled background tasks
//
// Runs .txt files in /chores/bots/ on a timer. Each file contains
// instructions for Claude to execute. Results logged to /recall/logs/.
//
// State is stored in filesystem for cross-instance sync:
// - Check enabled/disabled: dot prefix (.foo.txt = disabled, foo.txt = enabled)
// - Interval: recall/settings/heartbeat/interval.txt
// - ON/OFF: recall/settings/heartbeat/enabled.txt
//
// Run: clappie display push heartbeat

import {
  View,
  SectionHeading,
  ToggleBlock,
  SelectBlock,
  Checkbox,
  Label,
  ButtonFilled,
  Alert
} from '../../display-engine/ui-kit/index.js';
import { spawnSync, execSync } from 'child_process';
import { readdirSync, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Derive project root from this file's location
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

const HEARTBEAT_DIR = join(PROJECT_ROOT, 'chores', 'bots');
const LOGS_DIR = join(PROJECT_ROOT, 'recall', 'logs', 'heartbeat');
const SETTINGS_DIR = join(PROJECT_ROOT, 'recall', 'settings', 'heartbeat');
const INTERVAL_FILE = join(SETTINGS_DIR, 'interval.txt');
const ENABLED_FILE = join(SETTINGS_DIR, 'enabled.txt');

function ensureDirs() {
  if (!existsSync(HEARTBEAT_DIR)) mkdirSync(HEARTBEAT_DIR, { recursive: true });
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
  if (!existsSync(SETTINGS_DIR)) mkdirSync(SETTINGS_DIR, { recursive: true });
}

// Returns array of { name, enabled, filename }
// - foo.txt = enabled, .foo.txt = disabled
function getCheckFiles() {
  ensureDirs();
  try {
    const files = readdirSync(HEARTBEAT_DIR).filter(f => f.endsWith('.txt'));
    const checks = [];

    for (const f of files) {
      const isHidden = f.startsWith('.');
      const name = isHidden ? f.slice(1, -4) : f.slice(0, -4); // strip dot and .txt
      checks.push({
        name,
        enabled: !isHidden,
        filename: f,
      });
    }

    // Sort by name, dedupe (prefer enabled if both exist)
    const byName = {};
    for (const c of checks) {
      if (!byName[c.name] || c.enabled) {
        byName[c.name] = c;
      }
    }

    return Object.values(byName).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function toggleCheckFile(check) {
  const oldPath = join(HEARTBEAT_DIR, check.filename);
  const newFilename = check.enabled ? `.${check.name}.txt` : `${check.name}.txt`;
  const newPath = join(HEARTBEAT_DIR, newFilename);

  try {
    renameSync(oldPath, newPath);
    return true;
  } catch {
    return false;
  }
}

function sendToChat(text, pane) {
  if (!pane) return;
  spawnSync('tmux', ['send-keys', '-t', pane, '-l', text.replace(/'/g, "'\\''")]);
  spawnSync('tmux', ['send-keys', '-t', pane, 'Enter']);
}

function focusPane(pane) {
  if (pane) spawnSync('tmux', ['select-pane', '-t', pane]);
}

function isInBackground() {
  try {
    const session = execSync('tmux display-message -p "#{session_name}"', { encoding: 'utf8' }).trim();
    return session === 'background-heartbeat';
  } catch {
    return false;
  }
}

// Preset intervals
const PRESETS = [
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
  { label: '10m', value: 600 },
  { label: '30m', value: 1800 },
  { label: '1h', value: 3600 },
];

const DEFAULT_INTERVAL = 600; // 10m

function formatInterval(sec) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return sec % 60 === 0 ? `${sec / 60}m` : `${sec}s`;
  return sec % 3600 === 0 ? `${sec / 3600}h` : `${Math.floor(sec / 60)}m`;
}

function loadIntervalSetting() {
  try {
    const val = parseInt(readFileSync(INTERVAL_FILE, 'utf8').trim(), 10);
    return val > 0 ? val : DEFAULT_INTERVAL;
  } catch {
    return DEFAULT_INTERVAL;
  }
}

function saveIntervalSetting(value) {
  ensureDirs();
  try {
    writeFileSync(INTERVAL_FILE, String(value));
  } catch {}
}

function loadEnabledSetting() {
  try {
    const val = readFileSync(ENABLED_FILE, 'utf8').trim().toLowerCase();
    return val === 'true' || val === '1' || val === 'on';
  } catch {
    return false; // default OFF
  }
}

function saveEnabledSetting(value) {
  ensureDirs();
  try {
    writeFileSync(ENABLED_FILE, value ? 'true' : 'false');
  } catch {}
}

function getIntervalOptions() {
  const saved = loadIntervalSetting();
  const options = [...PRESETS];

  // If saved value isn't a preset, inject it
  if (!options.some(p => p.value === saved)) {
    options.push({ label: formatInterval(saved), value: saved });
    options.sort((a, b) => a.value - b.value);
  }

  return options;
}

export const maxWidth = 40;

export function create(ctx) {
  ctx.setTitle('Heartbeat');
  ctx.setDescription('Cron scheduled tasks');

  const claudePane = process.env.CLAPPIE_CLAUDE_PANE;
  const autoEnable = ctx.data?.autoEnable === 'true' || ctx.data?.autoEnable === true;

  // State (synced from filesystem)
  let timer = null;
  let syncInterval = null;  // Always runs for filesystem sync
  let nextRun = null;
  let intervalSec = loadIntervalSetting();
  // Use autoEnable only if settings file doesn't exist (first-time setup)
  let isEnabled = existsSync(ENABLED_FILE) ? loadEnabledSetting() : autoEnable;
  let checks = getCheckFiles();

  const view = new View(ctx);

  function refreshFromFilesystem() {
    // Re-read settings files to catch external changes
    const newInterval = loadIntervalSetting();
    const newEnabled = loadEnabledSetting();
    checks = getCheckFiles();

    let needsReschedule = false;

    if (newInterval !== intervalSec) {
      intervalSec = newInterval;
      needsReschedule = true;
    }

    if (newEnabled !== isEnabled) {
      isEnabled = newEnabled;
      // Only schedule if in background session
      if (inBackground && isEnabled && !timer) {
        schedule();
      } else if (!isEnabled && timer) {
        stopExecutionTimer();
      }
    } else if (inBackground && needsReschedule && isEnabled) {
      schedule();
    }
  }

  function getEnabledChecks() {
    return checks.filter(c => c.enabled).map(c => c.name);
  }

  function schedule() {
    if (timer) clearTimeout(timer);

    const ms = intervalSec * 1000;
    nextRun = Date.now() + ms;
    timer = setTimeout(execute, ms);
  }

  function stopExecutionTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
    nextRun = null;
  }

  // Sync interval - always runs to detect file changes and update UI
  function startSyncInterval() {
    if (syncInterval) return; // Already running
    syncInterval = setInterval(() => {
      try {
        refreshFromFilesystem();
        render();
      } catch (err) {
        console.error('[heartbeat] Sync error:', err);
      }
    }, 1000);
  }

  function stopSyncInterval() {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = null;
  }

  function start() {
    isEnabled = true;
    saveEnabledSetting(true);
    if (inBackground) {
      schedule();
      ctx.toast('Heart beating');
    } else {
      ctx.toast('Settings saved (run in Background to start)');
    }
  }

  function stop() {
    isEnabled = false;
    saveEnabledSetting(false);
    stopExecutionTimer();
    ctx.toast('Flatlined');
  }

  function execute() {
    const enabled = getEnabledChecks();
    if (!enabled.length) {
      ctx.toast('No vitals to check');
      return;
    }

    const now = new Date();
    // Use local time, not UTC
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const date = `${year}-${month}-${day}`;
    const ts = `${date} ${hours}:${minutes}:${seconds}`;

    if (inBackground && isEnabled) schedule();

    focusPane(claudePane);
    if (inBackground) {
      sendToChat('/compact heartbeat cycle complete - no need to preserve history', claudePane);
    }

    setTimeout(() => {
      const checkNames = enabled.map(name => `  ${name}`).join('\n');
      sendToChat(`[clappie] Heartbeat initiated
Rate: ${formatInterval(intervalSec)} | Time: ${ts}
Checks:
${checkNames}

Execute each check listed above (files are in chores/bots/). Check [heartbeat-meta] last_run to skip if too recent. Spawn subagents for each. Update [heartbeat-meta] after. Log to recall/logs/heartbeat/${date}.txt: [HH:MM:SS] check1 ✓|✗ | check2 ✓|✗ (brief note)`, claudePane);
      render();
    }, 500);
  }

  // Interval options (rebuilt on render to catch file changes)
  let intervalOptions = getIntervalOptions();

  const inBackground = isInBackground();

  function render() {
    // Refresh options in case interval file changed
    intervalOptions = getIntervalOptions();
    const currentIdx = intervalOptions.findIndex(o => o.value === intervalSec);

    view.clear();

    if (!inBackground) {
      view.add(Alert({
        variant: 'warning',
        message: 'Meant to run in Background. Use clappie background start heartbeat.'
      }));
      view.space();
    }

    view.add(ToggleBlock({
      options: ['OFF', 'ON'],
      value: isEnabled ? 1 : 0,
      onChange: (i) => {
        i === 1 ? start() : stop();
        render();
      }
    }));
    view.space();

    // Status line
    const status = !isEnabled
      ? 'Flatlined'
      : nextRun
        ? `Next beat in ${Math.max(0, Math.ceil((nextRun - Date.now()) / 1000))}s`
        : 'Beating in background';
    view.add(Label({ text: status, dim: true }));
    view.space();

    view.add(SectionHeading({ text: 'HEART RATE' }));
    view.space();
    view.add(SelectBlock({
      options: intervalOptions.map(o => o.label),
      value: currentIdx >= 0 ? currentIdx : 4,
      onChange: (idx) => {
        intervalSec = intervalOptions[idx].value;
        saveIntervalSetting(intervalSec);
        if (isEnabled) schedule();
        render();
      }
    }));
    view.space(2);

    // Vitals (checks)
    view.add(SectionHeading({ text: 'VITALS' }));
    view.space();

    if (!checks.length) {
      view.add(Label({ text: 'No .txt files in /chores/bots/', dim: true }));
    } else {
      for (const check of checks) {
        view.add(Checkbox({
          label: check.name,
          value: check.enabled,
          onChange: () => {
            toggleCheckFile(check);
            checks = getCheckFiles(); // refresh
            render();
          }
        }));
      }
    }
    view.space(2);

    view.add(ButtonFilled({
      label: 'Beat Now',
      shortcut: 'B',
      onPress: execute
    }));

    view.render();
  }

  return {
    init() {
      render();
      // Always start sync interval (for filesystem watching)
      startSyncInterval();
      // Auto-start execution only if in background and enabled
      if (inBackground && isEnabled) {
        saveEnabledSetting(true); // persist so other instances see it
        schedule();
        ctx.toast('Heart beating');
      }
    },
    render,
    onKey: (key) => view.handleKey(key),
    cleanup() {
      stopExecutionTimer();
      stopSyncInterval();
    }
  };
}
