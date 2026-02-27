// Grouped Log — compile all participant sidekick logs into one chronological simulation transcript

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');
const SIDEKICK_LOGS_DIR = join(PROJECT_ROOT, 'recall', 'logs', 'sidekicks');
const PARTY_LOGS_DIR = join(PROJECT_ROOT, 'recall', 'logs', 'parties');

/**
 * Parse a sidekick log file into structured entries.
 * Returns { metadata: {...}, entries: [{ time, timeMs, type, content, agent? }] }
 */
function parseSidekickLog(filePath) {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf8');
  const separatorIdx = raw.indexOf('\n---\n');
  if (separatorIdx === -1) return null;

  // Parse header metadata
  const header = raw.slice(0, separatorIdx);
  const metadata = {};
  for (const line of header.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) metadata[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }

  // Parse log entries
  const body = raw.slice(separatorIdx + 5);
  const entries = [];
  const lines = body.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match group log format: HH:MM:SS [agent-name] ← or ⚡
    const groupMatch = line.match(/^(\d{2}:\d{2}:\d{2})\s+\[([^\]]+)\]\s+(←|⚡)\s*(.*)/);
    if (groupMatch) {
      const [, time, agent, direction, content] = groupMatch;
      entries.push({
        time,
        timeMs: timeToMs(time),
        type: direction === '⚡' ? 'internal' : 'incoming',
        content,
        agent,
      });
      continue;
    }
    // Match individual log format: HH:MM:SS ← or ⚡
    const match = line.match(/^(\d{2}:\d{2}:\d{2})\s+(←|⚡)\s*(.*)/);
    if (match) {
      const [, time, direction, content] = match;
      entries.push({
        time,
        timeMs: timeToMs(time),
        type: direction === '⚡' ? 'internal' : 'incoming',
        content,
      });
    } else if (entries.length > 0 && line.trim()) {
      // Continuation line — append to previous entry
      entries[entries.length - 1].content += '\n' + line;
    }
  }

  return { metadata, entries };
}

function timeToMs(time) {
  const [h, m, s] = time.split(':').map(Number);
  return h * 3600000 + m * 60000 + s * 1000;
}

/**
 * Classify an incoming entry:
 * - broadcast: [broadcast:sender] message
 * - dm: [from:sender] message
 * - dm-cc: [cc:dm] [from:sender → recipient] message
 * - system: [from:parties] state notification
 * - prompt: initial system prompt (no prefix)
 */
function classifyEntry(entry) {
  const c = entry.content;
  if (c.startsWith('[broadcast:')) {
    const close = c.indexOf(']');
    const sender = c.slice(11, close);
    return { kind: 'broadcast', sender, message: c.slice(close + 2) };
  }
  if (c.startsWith('[cc:dm] ')) {
    return { kind: 'cc', message: c };
  }
  if (c.startsWith('[cc:broadcast] ')) {
    return { kind: 'cc', message: c };
  }
  if (c.startsWith('[from:parties]')) {
    return { kind: 'state', message: c.slice(18).trim() };
  }
  if (c.startsWith('[from:')) {
    const close = c.indexOf(']');
    const sender = c.slice(6, close);
    return { kind: 'dm', sender, message: c.slice(close + 2) };
  }
  return { kind: 'prompt', message: c };
}

/**
 * Compile grouped log for a simulation.
 * Reads all participant sidekick logs, deduplicates, merges chronologically.
 */
export function compileGroupedLog(ledger, simId) {
  const participants = Object.entries(ledger.participants);
  if (participants.length === 0) return null;

  // Collect all entries with agent attribution
  const allEntries = [];
  const seenBroadcasts = new Set(); // deduplicate broadcasts
  const seenDMs = new Set(); // deduplicate DMs across individual + group logs
  const processedGroupLogs = new Set(); // don't read same group log twice

  // Helper: process a single entry and add to allEntries
  function processEntry(entry, agentName) {
    if (entry.type === 'internal') {
      allEntries.push({
        time: entry.time,
        timeMs: entry.timeMs,
        agent: agentName,
        line: `⚡ ${entry.content}`,
        sort: 1,
      });
      return;
    }

    const classified = classifyEntry(entry);

    if (classified.kind === 'broadcast') {
      const key = `${classified.sender}:${classified.message.slice(0, 80)}`;
      if (seenBroadcasts.has(key)) return;
      seenBroadcasts.add(key);
      allEntries.push({
        time: entry.time,
        timeMs: entry.timeMs,
        agent: classified.sender,
        line: `📢 ${classified.message}`,
        sort: 0,
      });
    } else if (classified.kind === 'dm') {
      const dmKey = `${classified.sender}→${agentName}:${classified.message.slice(0, 80)}`;
      if (seenDMs.has(dmKey)) return;
      seenDMs.add(dmKey);
      allEntries.push({
        time: entry.time,
        timeMs: entry.timeMs,
        agent: `${classified.sender} → ${agentName}`,
        line: `💬 ${classified.message}`,
        sort: 0,
      });
    } else if (classified.kind === 'cc') {
      return;
    } else if (classified.kind === 'state') {
      const stateKey = `state:${classified.message.slice(0, 100)}`;
      if (seenBroadcasts.has(stateKey)) return;
      seenBroadcasts.add(stateKey);
      allEntries.push({
        time: entry.time,
        timeMs: entry.timeMs,
        agent: 'system',
        line: classified.message,
        sort: 0,
      });
    } else if (classified.kind === 'prompt') {
      const truncated = classified.message.length > 200
        ? classified.message.slice(0, 200) + '...'
        : classified.message;
      allEntries.push({
        time: entry.time,
        timeMs: entry.timeMs,
        agent: agentName,
        line: `📋 ${truncated}`,
        sort: 0,
      });
    }
  }

  for (const [name, info] of participants) {
    if (!info.sidekick) continue;

    // Read individual log (may have entries for solo sidekicks, or just metadata for squad)
    const logPath = join(SIDEKICK_LOGS_DIR, `${info.sidekick}.txt`);
    const parsed = parseSidekickLog(logPath);

    if (parsed) {
      // Check if this sidekick points to a group log
      const groupLogFile = parsed.metadata.groupLog;
      if (groupLogFile && !processedGroupLogs.has(groupLogFile)) {
        processedGroupLogs.add(groupLogFile);
        const groupPath = join(SIDEKICK_LOGS_DIR, groupLogFile);
        const groupParsed = parseSidekickLog(groupPath);
        if (groupParsed) {
          for (const entry of groupParsed.entries) {
            // Group entries have agent field from [name] prefix
            processEntry(entry, entry.agent || name);
          }
        }
      }

      // Also process any entries in the individual log itself
      for (const entry of parsed.entries) {
        processEntry(entry, name);
      }
    }
  }

  // Sort chronologically, then by sort priority (externals before internals at same time)
  allEntries.sort((a, b) => a.timeMs - b.timeMs || a.sort - b.sort);

  // Build output
  const lines = [];

  // Header
  lines.push('PARTIES SIMULATION LOG');
  lines.push('═'.repeat(60));
  lines.push(`Game: ${ledger.meta.game || simId}`);
  lines.push(`Started: ${ledger.meta.started || '?'}`);
  const endEvent = ledger.events.find(e => e.includes('simulation ended'));
  lines.push(`Ended: ${endEvent ? endEvent.split(' | ')[0] : 'unknown'}`);
  if (ledger.state) {
    // Look for a result key in any participant's state
    for (const [key, val] of Object.entries(ledger.state)) {
      if (key.endsWith('.result')) lines.push(`Result: ${val}`);
    }
  }
  lines.push('');
  lines.push('Participants:');
  for (const [name, info] of participants) {
    const role = ledger.state?.[`${name}.role`] || '';
    lines.push(`  ${name} (${info.model}${role ? '/' + role : ''})`);
  }
  lines.push('');
  lines.push('─'.repeat(60));
  lines.push('');

  // Find the max agent label width for alignment
  const maxAgent = Math.max(...allEntries.map(e => e.agent.length), 6);

  // Entries
  for (const entry of allEntries) {
    const agent = entry.agent.padEnd(maxAgent);
    // Multiline: indent continuation lines
    const msgLines = entry.line.split('\n');
    lines.push(`${entry.time} │ ${agent} │ ${msgLines[0]}`);
    const indent = ' '.repeat(entry.time.length + 3 + maxAgent + 3);
    for (let i = 1; i < msgLines.length; i++) {
      lines.push(`${indent}${msgLines[i]}`);
    }
  }

  // Write the grouped log
  mkdirSync(PARTY_LOGS_DIR, { recursive: true });
  const logPath = join(PARTY_LOGS_DIR, `${simId}.txt`);
  writeFileSync(logPath, lines.join('\n') + '\n', 'utf8');
  return logPath;
}
