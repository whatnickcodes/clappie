// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  TMUX HELPERS - Spawn and manage Claude sessions                          ║
// ║                                                                           ║
// ║  NOTE: This now uses the background session for everything.                ║
// ║  Server control moved to background/services.js                           ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { $ } from 'bun';
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { getConversationContext } from './state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

// Sidekicks run in the background-sidekicks session (created by background clapp)
// Name MUST match background naming: background-<folder> where folder = "sidekicks"
const TMUX_SESSION = 'background-sidekicks';

// Sidekick panes go in the main window alongside the server
const SIDEKICK_WINDOW = 'main';

// Legacy: kept for backwards compat but prefer background services
export const SERVER_SESSION = 'background-sidekicks';

// ─────────────────────────────────────────────────────────────────────────────
// SIDEKICK PANE STYLING
// ─────────────────────────────────────────────────────────────────────────────

const SOURCE_STYLES = {
  'telegram-bot': { icon: '✈',  color: 'colour39',  bright: 'colour75',  label: 'TELEGRAM' },
  'slack-bot':    { icon: '⚡', color: 'colour135', bright: 'colour177', label: 'SLACK' },
  'parties':      { icon: '🎲', color: 'colour112', bright: 'colour150', label: 'PARTY' },
  'internal':     { icon: '⚙',  color: 'colour73',  bright: 'colour109', label: 'SYSTEM' },
};

const DEFAULT_STYLE = { icon: '●', color: 'colour226', bright: 'colour228', label: 'SIDEKICK' };

// Per-sidekick tmux colors — matches NAME_PALETTE indices in server.js
const TMUX_COLOR_PALETTE = [
  { color: 'colour124', bright: 'colour167' },  // dark red
  { color: 'colour25',  bright: 'colour68'  },  // dark blue
  { color: 'colour97',  bright: 'colour140' },  // medium purple
  { color: 'colour172', bright: 'colour214' },  // dark orange
  { color: 'colour28',  bright: 'colour71'  },  // forest green
  { color: 'colour126', bright: 'colour169' },  // dark magenta
  { color: 'colour31',  bright: 'colour74'  },  // teal blue
  { color: 'colour130', bright: 'colour173' },  // brown
  { color: 'colour64',  bright: 'colour107' },  // dark olive
  { color: 'colour95',  bright: 'colour138' },  // mauve
  { color: 'colour30',  bright: 'colour73'  },  // dark teal
  { color: 'colour136', bright: 'colour179' },  // dark gold
];

// Sources that use per-sidekick colors instead of source brand color
const INDIVIDUAL_COLOR_SOURCES = new Set(['internal', 'parties']);

export function getSourceStyle(source) {
  return SOURCE_STYLES[source] || DEFAULT_STYLE;
}

/**
 * Build a pane title string for a sidekick
 */
export function buildPaneTitle(source, description, emoji, squad, superCC) {
  const style = getSourceStyle(source);
  const desc = description || 'starting...';
  const ccIndicator = superCC ? ' 👁' : '';
  const squadSuffix = squad ? ` │ @${squad}` : '';
  const maxLen = 42 - squadSuffix.length - ccIndicator.length;
  const truncated = desc.length > maxLen ? desc.slice(0, maxLen - 1) + '…' : desc;
  const emojiPrefix = emoji ? `${emoji} ` : '';
  return `${style.icon} ${style.label} │ ${emojiPrefix}${truncated}${ccIndicator}${squadSuffix}`;
}

/**
 * Configure the background-sidekick session's visual style.
 * Called on session init. Idempotent — safe to call multiple times.
 */
async function styleSession() {
  const s = TMUX_SESSION;
  const w = `${s}:${SIDEKICK_WINDOW}`;
  const run = (...args) => spawnSync('tmux', args);

  try {
    // ── Borders ──────────────────────────────────────────────────────────
    run('set', '-t', s, 'pane-border-lines', 'heavy');
    run('set', '-w', '-t', w, 'pane-border-status', 'top');

    // Border colors — visible separators between panes
    run('set', '-t', s, 'pane-border-style', 'fg=colour240');
    run('set', '-t', s, 'pane-active-border-style', 'fg=colour250');

    // Border format: use @sidekick-title (custom option, immune to Claude overriding pane_title)
    // If @sidekick-title is set → show it in @sidekick-color, bold
    // If not set (shell pane) → show pane_title dimmed
    const fmt = '#{?#{@sidekick-title},#[fg=#{@sidekick-color}]#[bold] #{@sidekick-title} #[default],#[fg=colour240] #{pane_title} }';
    run('set', '-w', '-t', w, 'pane-border-format', fmt);

    // ── Disable copy-mode key triggers (Claude Code escape sequences fire them when scrolling) ──
    // Unbind ALL single-letter keys in copy-mode for this session.
    // Mouse scroll still works, but stray escape bytes can't trigger goto-line, jump, search, etc.
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    for (const ch of alphabet) {
      run('bind-key', '-T', 'copy-mode', ch, 'send-keys', '-X', 'cancel');
      run('bind-key', '-T', 'copy-mode', ch.toUpperCase(), 'send-keys', '-X', 'cancel');
      run('bind-key', '-T', 'copy-mode-vi', ch, 'send-keys', '-X', 'cancel');
      run('bind-key', '-T', 'copy-mode-vi', ch.toUpperCase(), 'send-keys', '-X', 'cancel');
    }
    // Also kill semicolon, comma, and common punctuation triggers
    for (const ch of [';', ',', '/', '?', ':', "'", '"']) {
      run('bind-key', '-T', 'copy-mode', ch, 'send-keys', '-X', 'cancel');
      run('bind-key', '-T', 'copy-mode-vi', ch, 'send-keys', '-X', 'cancel');
    }

    // ── Status bar ───────────────────────────────────────────────────────
    run('set', '-t', s, 'status', 'off');

    // ── Notifications ────────────────────────────────────────────────────
    run('set', '-t', s, 'message-style', 'bg=colour235,fg=colour214,bold');
    run('set', '-t', s, 'display-time', '2500');

  } catch (err) {
    console.error(`[tmux] Style error: ${err.message}`);
  }
}

/**
 * Apply per-pane styling for a sidekick.
 * Branded sources (telegram, slack) use source color.
 * Individual sources (internal, parties) use per-sidekick color from palette.
 */
async function styleSidekickPane(paneId, source, description, emoji, squad, colorIndex, superCC) {
  const style = getSourceStyle(source);
  const title = buildPaneTitle(source, description, emoji, squad, superCC);
  const run = (...args) => spawnSync('tmux', args);

  // Pick color: per-sidekick palette for internal/parties, source brand for others
  let paneColor = style.color;
  let paneBright = style.bright;
  if (INDIVIDUAL_COLOR_SOURCES.has(source) && colorIndex !== undefined) {
    const idx = parseInt(colorIndex) % TMUX_COLOR_PALETTE.length;
    const c = TMUX_COLOR_PALETTE[idx];
    if (c) { paneColor = c.color; paneBright = c.bright; }
  }

  try {
    run('set', '-p', '-t', paneId, '@sidekick-title', title);
    run('set', '-p', '-t', paneId, '@sidekick-color', paneColor);
    run('set', '-p', '-t', paneId, '@sidekick-bright', paneBright);

  } catch (err) {
    console.error(`[tmux] Pane style error: ${err.message}`);
  }
}

/**
 * Flash a spawn notification on the session's status bar
 */
async function notifySpawn(source, description) {
  const style = getSourceStyle(source);
  const desc = description ? description.slice(0, 50) : 'new sidekick';
  spawnSync('tmux', ['display-message', '-t', TMUX_SESSION, ` ${style.icon} New: ${desc}`]);
}

/**
 * Update a sidekick pane's title dynamically (for status changes, progress, etc.)
 */
export async function updatePaneTitle(paneId, title) {
  spawnSync('tmux', ['set', '-p', '-t', paneId, '@sidekick-title', title]);
}

// ─────────────────────────────────────────────────────────────────────────────
// INITIAL PROMPT TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load layered prompt customization for a sidekick source.
 * Layers (all concatenated if they exist):
 *   1. clapps/sidekicks/sidekick-prompt.txt           (BASE — always)
 *   2. .claude/skills/{source}/sidekick-prompt.txt    (SKILL — if exists)
 *   3. recall/settings/{source}/sidekick-prompt.txt   (USER OVERRIDE — if exists)
 */
function loadPromptLayers(source) {
  const layers = [];

  // Layer 1: Base prompt (universal sidekick commands/style)
  const basePath = join(__dirname, 'sidekick-prompt.txt');
  try {
    if (existsSync(basePath)) layers.push(readFileSync(basePath, 'utf8').trim());
  } catch {}

  // Layer 2: Skill-shipped prompt (source-specific commands)
  const skillPath = join(PROJECT_ROOT, '.claude', 'skills', source, 'sidekick-prompt.txt');
  try {
    if (existsSync(skillPath)) layers.push(readFileSync(skillPath, 'utf8').trim());
  } catch {}

  // Layer 3: User override (personality, preferences)
  const userPath = join(PROJECT_ROOT, 'recall', 'settings', source, 'sidekick-prompt.txt');
  try {
    if (existsSync(userPath)) layers.push(readFileSync(userPath, 'utf8').trim());
  } catch {}

  return layers.join('\n\n---\n\n');
}

function formatAttachmentsBlock(attachments) {
  if (!attachments || attachments.length === 0) return '';

  const lines = ['', 'ATTACHMENTS:', 'The user sent the following with their message:'];
  for (const att of attachments) {
    if (att.localPath) {
      const extra = att.fileName ? ` (${att.fileName})` : '';
      lines.push(`- ${att.type}: ${att.localPath}${extra}`);
    } else if (att.type === 'sticker') {
      lines.push(`- sticker: ${att.emoji || '?'} (set: ${att.setName || 'unknown'})`);
    } else if (att.type === 'location') {
      lines.push(`- location: ${att.latitude}, ${att.longitude}`);
    } else if (att.type === 'contact') {
      lines.push(`- contact: ${att.firstName || ''} ${att.lastName || ''} ${att.phoneNumber || ''}`);
    } else if (att.downloadError) {
      lines.push(`- ${att.type}: [download failed: ${att.downloadError}]`);
    } else {
      lines.push(`- ${att.type}: [no file path]`);
    }
  }
  lines.push('');
  lines.push('You can read/analyze downloaded files at the paths above.');
  lines.push('For voice/audio: transcribe with `clappie whisper listen /path/to/file.ogg`');
  lines.push('For video/video_note: extract audio with `ffmpeg -i video.mp4 -vn audio.ogg` then transcribe.');
  lines.push('');
  return lines.join('\n');
}

function formatPreviousSidekickReference(previousSidekickId) {
  if (!previousSidekickId) return '';
  const logPath = `recall/logs/sidekicks/${previousSidekickId}.txt`;
  if (!existsSync(join(PROJECT_ROOT, logPath))) return '';
  return `\nPrevious session log (for detailed action history): ${logPath}`;
}

function formatConversationContext(sidekick) {
  // Slack threads already have good continuity via threadTs — skip thread context
  if (sidekick.threadTs) {
    return formatPreviousSidekickReference(sidekick.previousSidekickId);
  }

  // Try inline conversation thread first
  const context = getConversationContext(sidekick.source, sidekick.chatId);
  if (context) {
    const ref = formatPreviousSidekickReference(sidekick.previousSidekickId);
    return context + ref;
  }

  // Fallback: no thread file yet (backward compat)
  return formatPreviousSidekickReference(sidekick.previousSidekickId);
}

function formatReplyToBlock(replyTo) {
  if (!replyTo) return '';

  const who = replyTo.isFromBot ? 'YOUR previous message' : `a message from ${replyTo.fromFirstName || 'someone'}`;
  const preview = replyTo.text || '(no text)';

  return `
REPLYING TO:
The user is replying to ${who}:
"${preview}"

This gives you context about what specifically they're responding to.
`;
}

/**
 * Load extra context from a file (generic — used by parties and others).
 * Returns formatted string to append to prompt, or empty string.
 */
function loadContextFile(sidekick) {
  if (!sidekick.contextFile) return '';
  try {
    if (existsSync(sidekick.contextFile)) {
      return '\n\n' + readFileSync(sidekick.contextFile, 'utf8').trim();
    }
  } catch {}
  return '';
}

/**
 * Build the system prompt content (identity, metadata, prompt layers).
 * Used in 'system' prompt mode — goes into --append-system-prompt.
 */
function buildSystemPromptContent(sidekick) {
  const promptLayers = loadPromptLayers(sidekick.source);
  const templatedLayers = promptLayers.replace(/\s*"\$\{id\}"\s*/g, ' ').replace(/\$\{id\}/g, '');
  const contextLayers = loadContextFile(sidekick);

  const metaLines = [`Source: ${sidekick.source}`];
  metaLines.push(`ID: ${sidekick.id}`);
  if (sidekick.name) metaLines.push(`Name: ${sidekick.name}`);
  if (sidekick.squad) metaLines.push(`Squad: ${sidekick.squad}`);
  if (sidekick.userId) metaLines.push(`User: ${sidekick.userId}`);

  return `You are a Sidekick — an autonomous background agent. Stay task-focused, communicate results. The user cannot see this terminal. Do not use any TUI or displays.

Your sidekick ID is auto-detected via env var. <id> is optional in all commands — only needed to override.

${metaLines.join('\n')}

---

${templatedLayers}${contextLayers}`;
}

/**
 * Build the task message (the user-facing part: context, attachments, task text).
 * Used in 'system' prompt mode — pasted as the first user message.
 */
function buildTaskMessage(sidekick) {
  const attachmentsBlock = formatAttachmentsBlock(sidekick.attachments);
  const previousBlock = formatConversationContext(sidekick);
  const replyToBlock = formatReplyToBlock(sidekick.replyTo);
  const isAiInitiated = sidekick.aiInitiated || sidekick.source === 'internal';
  const taskLabel = isAiInitiated ? 'Task' : "User's request";

  // Skip task text when context file provides the real content
  const taskLine = sidekick.contextFile ? '' : `\n${taskLabel}: ${sidekick.initialText || '(no text - see attachments above)'}`;

  return `${previousBlock}${replyToBlock}${attachmentsBlock}Current Message ID: ${sidekick.lastUserMessageId || '(none)'}${taskLine}`;
}

/**
 * Build the full initial prompt (everything in one user message).
 * Used in 'message' prompt mode (default/legacy).
 */
function buildInitialPrompt(sidekick) {
  const systemContent = buildSystemPromptContent(sidekick);
  const taskContent = buildTaskMessage(sidekick);

  return `${systemContent}

---

${taskContent}
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TMUX OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the background-sidekick tmux session exists with a main window
 */
async function ensureTmuxSession() {
  try {
    // Check if session exists
    await $`tmux has-session -t ${TMUX_SESSION} 2>/dev/null`;
  } catch {
    // Create background-sidekick session with main window
    try {
      await $`tmux new-session -d -s ${TMUX_SESSION} -n ${SIDEKICK_WINDOW}`;
    } catch (err) {
      // Race condition: another process created it first. That's fine.
      const errText = `${err.message || ''} ${err.stderr || ''}`;
      if (!errText.includes('duplicate session')) {
        throw err;
      }
    }
  }

  // Ensure main window exists (it should, but just in case)
  try {
    const windows = await $`tmux list-windows -t ${TMUX_SESSION} -F "#{window_name}" 2>/dev/null`.text();
    if (!windows.split('\n').includes(SIDEKICK_WINDOW)) {
      await $`tmux new-window -t ${TMUX_SESSION} -n ${SIDEKICK_WINDOW}`;
    }
  } catch {
    // Session might not exist yet
  }

  // Apply visual styling (idempotent — safe to call every time)
  await styleSession();
}

/**
 * Get target for the sidekick window
 */
function getSidekickTarget() {
  return `${TMUX_SESSION}:${SIDEKICK_WINDOW}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2-COLUMN GRID LAYOUT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate tmux layout checksum (required for select-layout)
 */
function tmuxChecksum(layout) {
  let csum = 0;
  for (let i = 0; i < layout.length; i++) {
    csum = ((csum >> 1) + ((csum & 1) << 15)) & 0xFFFF;
    csum = (csum + layout.charCodeAt(i)) & 0xFFFF;
  }
  return csum.toString(16).padStart(4, '0');
}

/**
 * Build a grid layout string for tmux.
 * Uses 2-column grid when panes fit, falls back to single column for large groups.
 * Minimum pane height: 8 lines (enough to read a few lines of output).
 */
const MIN_PANE_HEIGHT = 8;

async function buildTwoColumnLayout(target) {
  const info = await $`tmux list-panes -t ${target} -F "#{pane_index} #{window_width} #{window_height}"`.text();
  const lines = info.trim().split('\n');
  const paneIndices = lines.map(l => parseInt(l.split(' ')[0]));
  const W = parseInt(lines[0].split(' ')[1]);
  const H = parseInt(lines[0].split(' ')[2]);

  if (paneIndices.length < 2) return null;

  const count = paneIndices.length;

  // Decide columns: if 2-column grid would make panes too short, use single column
  const twoColRows = Math.ceil(count / 2);
  const twoColRowH = Math.floor((H - (twoColRows - 1)) / twoColRows);
  const useSingleCol = twoColRowH < MIN_PANE_HEIGHT && count > 2;
  const cols = useSingleCol ? 1 : 2;

  const numRows = Math.ceil(count / cols);
  const bordersV = numRows - 1;
  const usableH = H - bordersV;
  const rowH = Math.floor(usableH / numRows);
  const leftW = Math.floor((W - 1) / 2);
  const rightW = W - leftW - 1;

  // Single column layout — each pane gets full width
  if (cols === 1) {
    if (count === 1) return null;
    let rows = [];
    let y = 0;
    for (let r = 0; r < count; r++) {
      const h = (r === count - 1) ? (H - y) : rowH;
      rows.push(`${W}x${h},0,${y},${paneIndices[r]}`);
      y += h + 1;
    }
    const layout = `${W}x${H},0,0[${rows.join(',')}]`;
    return `${tmuxChecksum(layout)},${layout}`;
  }

  // 2-column: Single row — just a horizontal split
  if (numRows === 1) {
    const layout = `${W}x${H},0,0{${leftW}x${H},0,0,${paneIndices[0]},${rightW}x${H},${leftW + 1},0,${paneIndices[1]}}`;
    return `${tmuxChecksum(layout)},${layout}`;
  }

  // 2-column: Multi-row — vertical container of row pairs
  let rows = [];
  let y = 0;
  for (let r = 0; r < numRows; r++) {
    const li = r * 2;
    const ri = r * 2 + 1;
    const h = (r === numRows - 1) ? (H - y) : rowH;

    if (ri < count) {
      rows.push(`${W}x${h},0,${y}{${leftW}x${h},0,${y},${paneIndices[li]},${rightW}x${h},${leftW + 1},${y},${paneIndices[ri]}}`);
    } else {
      rows.push(`${W}x${h},0,${y},${paneIndices[li]}`);
    }
    y += h + 1;
  }

  const layout = `${W}x${H},0,0[${rows.join(',')}]`;
  return `${tmuxChecksum(layout)},${layout}`;
}

/**
 * Spawn a new tmux PANE for a sidekick (within background-sidekick:sidekick window)
 * @param {Object} sidekick - The sidekick object
 * @returns {string} The pane ID for tracking
 */
export async function spawnSession(sidekick) {
  await ensureTmuxSession();

  const target = getSidekickTarget();
  const useSystemPrompt = sidekick.promptMode === 'system';

  // Build tmux env flags (safe, no shell interpolation)
  const envFlagArr = [];
  if (sidekick.name) envFlagArr.push('-e', `CLAPPIE_SIDEKICK_NAME=${sidekick.name}`);
  envFlagArr.push('-e', `CLAPPIE_SIDEKICK_ID=${sidekick.id}`);
  if (sidekick.simulationId) envFlagArr.push('-e', `CLAPPIE_SIMULATION_ID=${sidekick.simulationId}`);

  let paneId;

  if (useSystemPrompt) {
    // ── SYSTEM PROMPT MODE ──────────────────────────────────────────────
    // Prompt layers go into --append-system-prompt. Only task goes as user message.
    // Uses temp file + bash variable assignment to avoid shell escaping issues:
    //   SYSPROMPT=$(cat file) — captures content literally (no interpretation)
    //   "$SYSPROMPT" — expands to value without re-interpretation
    const systemPrompt = buildSystemPromptContent(sidekick);
    const sysFile = `/tmp/sidekick-sysprompt-${sidekick.id}.txt`;
    await Bun.write(sysFile, systemPrompt);

    const modelArg = sidekick.model ? ` --model ${sidekick.model}` : '';
    const stderrFile = `/tmp/sidekick-stderr-${sidekick.id}.txt`;
    const exitFile = `/tmp/sidekick-exit-${sidekick.id}.txt`;
    const bashScript = `SYSPROMPT=$(cat '${sysFile}') && claude --enable-auto-mode${modelArg} --append-system-prompt "$SYSPROMPT" 2>'${stderrFile}'; EXIT=$?; if [ $EXIT -ne 0 ]; then echo "EXIT:$EXIT" > '${exitFile}'; sleep 10; fi`;

    // Use spawnSync for full control over argument passing
    const tmuxArgs = [
      'split-window', '-t', target, '-h', '-l', '50%', '-P', '-F', '#{pane_id}',
      ...envFlagArr,
      'bash', '-c', bashScript,
    ];
    const result = spawnSync('tmux', tmuxArgs, { encoding: 'utf8' });
    paneId = result.stdout.trim();
  } else {
    // ── MESSAGE MODE (default/legacy) ───────────────────────────────────
    // Everything goes as the first user message (current behavior)
    const stderrFile = `/tmp/sidekick-stderr-${sidekick.id}.txt`;
    const exitFile = `/tmp/sidekick-exit-${sidekick.id}.txt`;
    const modelArg = sidekick.model ? ` --model ${sidekick.model}` : '';
    const bashScript = `claude --enable-auto-mode${modelArg} 2>'${stderrFile}'; EXIT=$?; if [ $EXIT -ne 0 ]; then echo "EXIT:$EXIT" > '${exitFile}'; sleep 10; fi`;
    const result = await $`tmux split-window -t ${target} -h -l 50% -P -F "#{pane_id}" ${envFlagArr} bash -c ${bashScript}`.text();
    paneId = result.trim();
  }

  // Store pane ID in sidekick for later reference
  sidekick.paneId = paneId;

  // Style the pane immediately (visible while Claude loads)
  await styleSidekickPane(paneId, sidekick.source, sidekick.displayName || sidekick.name || sidekick.initialText || '', sidekick.emoji || '', sidekick.squad || '', sidekick.colorIndex, sidekick.superCC);

  // Wait for Claude Code to be ready (poll for working directory in startup banner)
  const maxWait = 30000;
  const pollInterval = 500;
  let waited = 0;
  while (waited < maxWait) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    waited += pollInterval;

    // Check if pane is still alive — if Claude crashed, detect it early
    const aliveCheck = spawnSync('tmux', ['display-message', '-t', paneId, '-p', '#{pane_id}'], { encoding: 'utf8' });
    if (aliveCheck.status !== 0) {
      // Pane died — try to read captured stderr for diagnostics
      const stderrFile = `/tmp/sidekick-stderr-${sidekick.id}.txt`;
      const exitFile = `/tmp/sidekick-exit-${sidekick.id}.txt`;
      let detail = '';
      try { detail = await Bun.file(stderrFile).text(); } catch {}
      try { await $`rm -f ${stderrFile} ${exitFile}`; } catch {}
      throw new Error(`Claude exited before ready${detail ? ': ' + detail.trim().slice(-500) : ''}`);
    }

    const capture = spawnSync('tmux', ['capture-pane', '-t', paneId, '-p'], { encoding: 'utf8' });
    if (capture.stdout && capture.stdout.includes('~/')) break;
  }

  // Build the prompt content for the user message
  const prompt = useSystemPrompt ? buildTaskMessage(sidekick) : buildInitialPrompt(sidekick);
  const tempFile = `/tmp/sidekick-prompt-${sidekick.id}.txt`;
  await Bun.write(tempFile, prompt);

  // Use tmux load-buffer + paste-buffer for multiline text
  const bufferName = `sidekick-${sidekick.id}`;
  await $`tmux load-buffer -b ${bufferName} ${tempFile}`;
  await $`tmux paste-buffer -b ${bufferName} -t ${paneId}`;

  // Small delay then submit (double Enter — sometimes first one gets eaten by paste processing)
  await new Promise(resolve => setTimeout(resolve, 500));
  await $`tmux send-keys -t ${paneId} Enter`;
  await new Promise(resolve => setTimeout(resolve, 300));
  await $`tmux send-keys -t ${paneId} Enter`;

  // Clean up temp files
  try {
    await $`rm ${tempFile}`;
    await $`tmux delete-buffer -b ${bufferName}`;
    if (useSystemPrompt) {
      await $`rm /tmp/sidekick-sysprompt-${sidekick.id}.txt`;
    }
    // Clean up error capture files (unused on success)
    await $`rm -f /tmp/sidekick-stderr-${sidekick.id}.txt /tmp/sidekick-exit-${sidekick.id}.txt`;
  } catch {
    // Ignore cleanup errors
  }

  // Rebalance all panes into a 2-column grid (tail and sidekicks are equal cells)
  try {
    const target = `${TMUX_SESSION}:${SIDEKICK_WINDOW}`;
    const layoutStr = await buildTwoColumnLayout(target);
    if (layoutStr) {
      spawnSync('tmux', ['select-layout', '-t', target, layoutStr]);
    }
  } catch {
    // Ignore layout errors
  }

  // Flash spawn notification on status bar
  await notifySpawn(sidekick.source, sidekick.initialText);

  return paneId;
}

/**
 * Per-pane send queue to prevent concurrent sends from interleaving.
 * Each pane gets a promise chain — sends are serialized per-pane but
 * different panes can still send in parallel.
 */
const paneSendQueues = new Map();

/**
 * Send a raw message to an existing sidekick pane (for follow-up messages)
 * @param {string} paneId - The tmux pane ID (e.g., %123) or legacy window name
 * @param {string} message - The message to send
 */
export async function sendToSession(paneId, message) {
  const target = paneId.startsWith('%') ? paneId : `${TMUX_SESSION}:${paneId}`;

  // Serialize sends to the same pane to prevent interleaving
  const prev = paneSendQueues.get(target) || Promise.resolve();
  const next = prev.then(() => _doSend(target, message), () => _doSend(target, message));
  paneSendQueues.set(target, next);
  return next;
}

async function _doSend(target, message) {
  await $`tmux send-keys -t ${target} -l ${message}`;
  await $`tmux send-keys -t ${target} Enter`;
  // Ghetto fix: double-tap Enter after a delay — if the first one got
  // swallowed by a paste race, the second one pushes it through.
  // If it already submitted, blank Enter is a no-op in Claude Code.
  await new Promise(r => setTimeout(r, 300));
  await $`tmux send-keys -t ${target} Enter`;
  await new Promise(r => setTimeout(r, 150));
}

/**
 * Kill a tmux pane
 * @param {string} paneId - The pane ID to kill (e.g., %123) or legacy window name
 */
export async function killSession(paneId) {
  try {
    // Support both pane IDs (%123) and legacy window names
    const target = paneId.startsWith('%') ? paneId : `${TMUX_SESSION}:${paneId}`;
    await $`tmux kill-pane -t ${target}`;
  } catch {
    // Pane might already be dead
  }
}

/**
 * List all sidekick panes in the sidekick window
 * @returns {Array<{paneId: string, command: string}>} - Pane info
 */
export async function listPanes() {
  try {
    const target = getSidekickTarget();
    const result = await $`tmux list-panes -t ${target} -F "#{pane_id}:#{pane_current_command}" 2>/dev/null`.text();
    return result.trim().split('\n').filter(Boolean).map(line => {
      const [paneId, command] = line.split(':');
      return { paneId, command };
    });
  } catch {
    return [];
  }
}

/**
 * List all sidekick windows (legacy - for backwards compat)
 * New system uses panes via listPanes(). This filters out system windows.
 * @returns {Array<string>} - Window names
 */
export async function listWindows() {
  try {
    const result = await $`tmux list-windows -t ${TMUX_SESSION} -F "#{window_name}"`.text();
    // Filter out system windows (main, server)
    return result.trim().split('\n').filter(w => w && w !== 'main' && w !== 'server');
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVER LIFECYCLE (for dashboard control)
// Uses background session - server runs as a WINDOW, not a separate session
// ─────────────────────────────────────────────────────────────────────────────

const SERVER_WINDOW = 'server';

/**
 * Check if server WINDOW exists in background session
 */
async function serverWindowExists() {
  try {
    const result = await $`tmux list-windows -t ${TMUX_SESSION} -F "#{window_name}" 2>/dev/null`.text();
    return result.split('\n').includes(SERVER_WINDOW);
  } catch {
    return false;
  }
}

/**
 * Check if sidekick server is running
 */
export async function isServerRunning() {
  return serverWindowExists();
}

/**
 * Start the sidekick server as a window in background session
 */
export async function startServer() {
  const serverPath = join(__dirname, 'server.js');
  const envFile = join(PROJECT_ROOT, '.env');

  // Check if already running
  if (await serverWindowExists()) {
    return { ok: true, message: 'Server already running' };
  }

  try {
    // Ensure background session exists
    try {
      await $`tmux has-session -t ${TMUX_SESSION} 2>/dev/null`;
    } catch {
      await $`tmux new-session -d -s ${TMUX_SESSION} -n main`;
    }

    // Create server window in background session
    const command = `cd ${PROJECT_ROOT} && set -a && (source ${envFile} 2>/dev/null || true) && set +a && bun ${serverPath}`;
    await $`tmux new-window -t ${TMUX_SESSION} -n ${SERVER_WINDOW} ${command}`;
    return { ok: true, message: 'Server started' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Stop the sidekick server
 */
export async function stopServer() {
  if (!(await serverWindowExists())) {
    return { ok: true, message: 'Server not running' };
  }

  try {
    await $`tmux kill-window -t ${TMUX_SESSION}:${SERVER_WINDOW}`;
    return { ok: true, message: 'Server stopped' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
