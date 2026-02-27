// tmux helpers for pane management and Claude communication

import { spawnSync } from 'child_process';

// Get current tmux session info
export function getTmuxInfo() {
  const result = spawnSync('tmux', ['display-message', '-p', '#{session_name}:#{window_index}.#{pane_index}'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

// Check if we're inside tmux
export function inTmux() {
  return !!process.env.TMUX;
}

// Get the Claude pane (the pane that spawned us)
export function getClaudePane() {
  // When daemon starts, we store the originating pane
  return process.env.CLAPPIE_CLAUDE_PANE || null;
}

// Create a new pane for the display
export function createDisplayPane(claudePane) {
  // Split horizontally, 40% width on the right
  const result = spawnSync('tmux', [
    'split-window', '-h',
    '-l', '40%',
    '-t', claudePane,
    '-P', '-F', '#{pane_id}'
  ], { encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(`Failed to create pane: ${result.stderr}`);
  }

  return result.stdout.trim();
}

// Close a pane
export function closePane(paneId) {
  spawnSync('tmux', ['kill-pane', '-t', paneId]);
}

// Focus a pane
export function focusPane(paneId) {
  spawnSync('tmux', ['select-pane', '-t', paneId]);
}

// Format a value for display (human-readable)
function formatValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'yes' : 'no';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) {
    // For checkbox-style arrays, show checked items
    if (val.every(v => typeof v === 'boolean')) {
      return val.map((v, i) => v ? `[${i + 1}]` : '').filter(Boolean).join(' ') || 'none';
    }
    return val.join(', ');
  }
  if (typeof val === 'object') {
    // For objects like {a: 1, b: 2}, show "a=1 b=2"
    return Object.entries(val).map(([k, v]) => `${k}=${v}`).join(' ');
  }
  return String(val);
}

// Send text to Claude's pane (no Enter - just types it)
export function sendToChat(text, claudePane, options = {}) {
  if (!claudePane) {
    throw new Error('No Claude pane specified');
  }

  // Add [clappie] prefix
  const prefixed = `[clappie] ${text}`;

  // Escape for tmux send-keys
  const escaped = prefixed.replace(/'/g, "'\\''");

  // Send to Claude's pane
  const sendResult = spawnSync('tmux', ['send-keys', '-t', claudePane, '-l', escaped]);
  if (sendResult.status !== 0) {
    throw new Error(`Failed to send to Claude: ${sendResult.stderr}`);
  }

  // Focus Claude's pane if requested
  if (options.focus !== false) {
    focusPane(claudePane);
  }
}

// Submit message to Claude (types + Enter)
export function submitToChat(message, claudePane, options = {}) {
  if (!claudePane) {
    throw new Error('No Claude pane specified');
  }

  let text;
  if (typeof message === 'string') {
    // Allow raw strings now - just prefix with marker
    text = `[clappie] ${message}`;
  } else {
    // Object: format as readable text
    // [clappie] ComponentName → value
    const component = message.component || message.action || 'message';
    const value = message.value !== undefined ? formatValue(message.value) : '';
    text = value ? `[clappie] ${component} → ${value}` : `[clappie] ${component}`;
  }

  // Escape for tmux send-keys
  const escaped = text.replace(/'/g, "'\\''");

  // Send to Claude's pane
  const sendResult = spawnSync('tmux', ['send-keys', '-t', claudePane, '-l', escaped]);
  if (sendResult.status !== 0) {
    throw new Error(`Failed to send to Claude: ${sendResult.stderr}`);
  }

  // Press Enter
  spawnSync('tmux', ['send-keys', '-t', claudePane, 'Enter']);

  // Focus Claude's pane if requested
  if (options.focus !== false) {
    focusPane(claudePane);
  }
}

// Get pane dimensions
export function getPaneDimensions(paneId) {
  const result = spawnSync('tmux', [
    'display-message', '-t', paneId, '-p', '#{pane_width},#{pane_height}'
  ], { encoding: 'utf8' });

  if (result.status !== 0) return { width: 80, height: 24 };

  const [width, height] = result.stdout.trim().split(',').map(Number);
  return { width, height };
}

// Resize pane
export function resizePane(paneId, width) {
  spawnSync('tmux', ['resize-pane', '-t', paneId, '-x', String(width)]);
}

// Set pane background color (for dark/light mode)
export function setPaneBackground(paneId, color) {
  // color can be:
  // - 'default' to reset to terminal default
  // - '#RRGGBB' hex color
  // - [R, G, B] array (will be converted to hex)
  let colorStr;
  if (color === 'default' || color === null) {
    colorStr = 'default';
  } else if (Array.isArray(color)) {
    const [r, g, b] = color;
    colorStr = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } else {
    colorStr = color;
  }

  spawnSync('tmux', ['select-pane', '-t', paneId, '-P', `bg=${colorStr}`]);
}
