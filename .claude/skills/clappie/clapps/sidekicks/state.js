// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  STATE - File-based sidekick storage                                       ║
// ║                                                                           ║
// ║  Solo sidekicks: DATE-NAME.txt or DATE-SOURCE-SLUG.txt                    ║
// ║  Squad sidekicks: DATE-SQUAD-NAME.txt (metadata only) +                   ║
// ║                   DATE-group-SQUAD.txt (shared history)                    ║
// ║  Every group log line prefixed with [sidekick-name] for attribution        ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Go up to project root: sidekick -> clapps -> clappie -> skills -> .claude -> root
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const RECALL_DIR = join(PROJECT_ROOT, 'recall');
const SIDEKICKS_DIR = join(RECALL_DIR, 'logs', 'sidekicks');
const FILES_DIR = join(RECALL_DIR, 'files');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function ensureSidekicksDir() {
  if (!existsSync(SIDEKICKS_DIR)) {
    mkdirSync(SIDEKICKS_DIR, { recursive: true });
  }
}

export function ensureDownloadsDir() {
  if (!existsSync(FILES_DIR)) {
    mkdirSync(FILES_DIR, { recursive: true });
  }
}

function timestamp() {
  return new Date().toISOString().slice(11, 19);  // HH:MM:SS
}

function slugify(text, maxWords = 5) {
  if (!text) return 'empty';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')  // Remove non-alphanumeric
    .trim()
    .split(/\s+/)                  // Split on whitespace
    .slice(0, maxWords)            // Take first N words
    .join('-')
    .slice(0, 40)                  // Cap length
    || 'empty';
}

function generateDatePrefix() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0')
  ].join('-');  // YYYY-MM-DD-HHmm (sorts chronologically)
}

export function generateSidekickId(source, text) {
  return `${generateDatePrefix()}-${source}-${slugify(text)}`;
}

// ── Sidekick emoji + color index ──────────────────────────────────────────────
const EMOJI_PALETTE = [
  '🐺', '🦊', '🐙', '🦅', '🐍', '🦈',
  '🦁', '🐲', '🦉', '🐝', '🦋', '🐬',
];

const PALETTE_SIZE = 12;

function nameHash(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function getSidekickEmoji(name) {
  if (!name) return '●';
  return EMOJI_PALETTE[nameHash(name) % EMOJI_PALETTE.length];
}

/**
 * Get the next unused color index by checking active sidekicks.
 * Uses name hash as starting position so concurrent spawns (separate processes)
 * spread across the palette even before files are written to disk.
 */
export function getNextColorIndex(name) {
  const start = name ? (nameHash(name) % PALETTE_SIZE) : 0;
  const active = getActiveSidekicks();
  const taken = new Set(active.map(m => parseInt(m.colorIndex)).filter(n => !isNaN(n)));
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const idx = (start + i) % PALETTE_SIZE;
    if (!taken.has(idx)) return idx;
  }
  return start;
}

/**
 * Look up a sidekick's assigned color index by name.
 */
export function getSidekickColorIndex(name) {
  if (!name) return 0;
  const m = findSidekickByName(name);
  if (m && !m.ambiguous && m.colorIndex !== undefined) {
    return parseInt(m.colorIndex);
  }
  // Fallback for sidekicks without colorIndex (legacy)
  return nameHash(name) % PALETTE_SIZE;
}

function getSidekickFile(sidekickId) {
  return join(SIDEKICKS_DIR, `${sidekickId}.txt`);
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP LOGS - Squad sidekicks share a single interleaved log file
// ─────────────────────────────────────────────────────────────────────────────

function getGroupLogFile(squad, datePrefix) {
  return join(SIDEKICKS_DIR, `${datePrefix}-group-${squad}.txt`);
}

/**
 * Find the most recent active group log file for a squad.
 * Scans for group-<squad>-*.txt files, returns the most recent one
 * that has active sidekicks. Returns null if none found.
 */
function findActiveGroupLog(squad) {
  ensureSidekicksDir();
  const suffix = `-group-${squad}.txt`;
  const files = readdirSync(SIDEKICKS_DIR)
    .filter(f => f.endsWith(suffix))
    .sort()
    .reverse();  // Most recent first (YYYY-MM-DD-HHMM sorts chronologically)

  for (const file of files) {
    // Check if any sidekicks in this group are still active
    const content = readFileSync(join(SIDEKICKS_DIR, file), 'utf8');
    const metaEnd = content.indexOf('\n---\n');
    const metaSection = metaEnd >= 0 ? content.slice(0, metaEnd) : content;
    const membersMatch = metaSection.match(/^sidekicks=(.*)$/m);
    if (!membersMatch) continue;

    const members = membersMatch[1].split(',').filter(Boolean);
    for (const name of members) {
      const sk = findSidekickByName(name);
      if (sk && !sk.ambiguous && sk.status === 'active') {
        return file;
      }
    }
  }
  return null;
}

/**
 * Read only the metadata section of a sidekick file (before ---).
 * Lightweight — doesn't parse full history. Used by logMessage etc.
 */
function getSidekickMeta(sidekickId) {
  const file = getSidekickFile(sidekickId);
  if (!existsSync(file)) return null;

  try {
    const content = readFileSync(file, 'utf8');
    const metaEnd = content.indexOf('\n---\n');
    const metaSection = metaEnd >= 0 ? content.slice(0, metaEnd) : content;
    const meta = {};
    for (const line of metaSection.split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0) {
        meta[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
      }
    }
    return { id: sidekickId, ...meta };
  } catch {
    return null;
  }
}

/**
 * Find or create a group log file for a squad.
 * If an active group exists (has active sidekicks), joins it.
 * Otherwise creates a new group file.
 */
function findOrCreateGroupLog(squad, sidekickName) {
  // Check for an existing active group log for this squad
  const existingFile = findActiveGroupLog(squad);

  if (existingFile) {
    // Add sidekick to members list
    const filePath = join(SIDEKICKS_DIR, existingFile);
    const content = readFileSync(filePath, 'utf8');
    const sepIdx = content.indexOf('\n---\n');
    const metaSection = sepIdx >= 0 ? content.slice(0, sepIdx) : content;
    const historySection = sepIdx >= 0 ? content.slice(sepIdx) : '\n---\n';

    const membersMatch = metaSection.match(/^sidekicks=(.*)$/m);
    const currentMembers = membersMatch ? membersMatch[1].split(',').filter(Boolean) : [];

    if (sidekickName && !currentMembers.includes(sidekickName)) {
      currentMembers.push(sidekickName);
      const updatedMeta = membersMatch
        ? metaSection.replace(/^sidekicks=.*$/m, `sidekicks=${currentMembers.join(',')}`)
        : metaSection + `\nsidekicks=${currentMembers.join(',')}`;
      writeFileSync(filePath, updatedMeta + historySection, 'utf8');
    }
    return existingFile;
  }

  // Create new group log with timestamp
  const datePrefix = generateDatePrefix();
  const file = getGroupLogFile(squad, datePrefix);
  const fileName = `${datePrefix}-group-${squad}.txt`;
  const meta = [
    `squad=${squad}`,
    `sidekicks=${sidekickName || ''}`,
    `startedAt=${new Date().toISOString()}`,
  ].join('\n');
  writeFileSync(file, meta + '\n---\n', 'utf8');
  return fileName;
}

/**
 * Read a full group log transcript.
 */
export function getGroupLog(squad) {
  ensureSidekicksDir();
  // Find the most recent group log for this squad
  const suffix = `-group-${squad}.txt`;
  const files = readdirSync(SIDEKICKS_DIR)
    .filter(f => f.endsWith(suffix))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  const file = join(SIDEKICKS_DIR, files[0]);
  const content = readFileSync(file, 'utf8');
  const parts = content.split('\n---\n');
  const meta = {};
  for (const line of parts[0].trim().split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) meta[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  const history = parts[1] ? parts[1].trim().split('\n').filter(Boolean) : [];
  return { squad, file: files[0], ...meta, history };
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEKICK FILE FORMAT
// ─────────────────────────────────────────────────────────────────────────────
//
// source=<skill-name>
// userId=<user-id>
// chatId=<chat-id>
// status=active
// startedAt=2026-01-24T00:18:38
// ---
// 14:18:38 ← user message
// 14:19:02 → bot response
//

function parseSidekickFile(content) {
  const parts = content.split('\n---\n');
  const metaLines = parts[0].trim().split('\n');
  const history = parts[1] ? parts[1].trim().split('\n').filter(Boolean) : [];

  const meta = {};
  for (const line of metaLines) {
    const eq = line.indexOf('=');
    if (eq > 0) {
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      meta[key] = value;
    }
  }

  return { ...meta, history };
}

function formatSidekickFile(meta, history = []) {
  const metaLines = Object.entries(meta)
    .filter(([k]) => k !== 'history')
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  return metaLines + '\n---\n' + history.join('\n') + (history.length ? '\n' : '');
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEKICK CRUD
// ─────────────────────────────────────────────────────────────────────────────

export function createSidekick(source, { userId, chatId, initialText, lastUserMessageId, name, squad, emoji: customEmoji }) {
  ensureSidekicksDir();

  // Prevent duplicate active sidekick names — auto-suffix if taken
  if (name) {
    const existing = findSidekickByName(name);
    if (existing && !existing.ambiguous && existing.status === 'active') {
      let suffix = 2;
      while (true) {
        const candidate = `${name}-${suffix}`;
        const check = findSidekickByName(candidate);
        if (!check || check.ambiguous) { name = candidate; break; }
        suffix++;
      }
    }
  }

  // Generate unique ID — date prefix always first
  // Named:    DATE-NAME        (e.g. 2026-02-07-1410-chef-tony)
  // Unnamed:  DATE-SOURCE-SLUG (e.g. 2026-02-07-1410-internal-check-emails)
  // Squad is metadata only — never embedded in the ID
  const datePrefix = generateDatePrefix();
  let id;
  if (name) {
    id = `${datePrefix}-${name}`;
  } else {
    id = `${datePrefix}-${source}-${slugify(initialText)}`;
  }
  let file = getSidekickFile(id);
  let counter = 2;
  while (existsSync(file)) {
    if (name) {
      id = `${datePrefix}-${name}-${counter}`;
    } else {
      id = `${datePrefix}-${source}-${slugify(initialText)}-${counter}`;
    }
    file = getSidekickFile(id);
    counter++;
  }

  const emoji = customEmoji || getSidekickEmoji(name || id);
  const colorIndex = getNextColorIndex(name || id);
  const meta = {
    source,
    userId: userId || '',
    chatId: chatId || '',
    name: name || '',
    emoji,
    colorIndex,
    squad: squad || '',
    status: 'active',
    startedAt: new Date().toISOString(),
  };

  // Check if this sidekick should join a group log
  let history = [];

  if (squad) {
    // Join or create group log
    const groupLogName = findOrCreateGroupLog(squad, name || id);
    meta.groupLog = groupLogName;
    meta.groupName = name || id;

    // Write initial text to group log (not individual file)
    if (initialText) {
      const groupFile = join(SIDEKICKS_DIR, groupLogName);
      const label = name || id;
      appendFileSync(groupFile, `${timestamp()} [${label}] ← ${initialText}\n`, 'utf8');
    }

    // Individual file gets empty history (group log has it)
    writeFileSync(file, formatSidekickFile(meta, []), 'utf8');
  } else {
    // Solo sidekick — unchanged behavior
    history = initialText ? [`${timestamp()} ← ${initialText}`] : [];
    writeFileSync(file, formatSidekickFile(meta, history), 'utf8');
  }

  // Include initialText and lastUserMessageId in return so they're available for the prompt
  return { id, ...meta, history, initialText: initialText || '', lastUserMessageId };
}

export function getSidekick(sidekickId) {
  const file = getSidekickFile(sidekickId);

  if (!existsSync(file)) {
    return null;
  }

  try {
    const content = readFileSync(file, 'utf8');
    const parsed = parseSidekickFile(content);

    // If grouped, read this sidekick's history from the group log
    if (parsed.groupLog) {
      const groupFile = join(SIDEKICKS_DIR, parsed.groupLog);
      if (existsSync(groupFile)) {
        const groupContent = readFileSync(groupFile, 'utf8');
        const parts = groupContent.split('\n---\n');
        const allLines = parts[1] ? parts[1].trim().split('\n').filter(Boolean) : [];
        const label = parsed.groupName || parsed.name || sidekickId;
        // Filter lines for this sidekick and strip [name] prefix for compat
        parsed.history = allLines
          .filter(line => {
            const match = line.match(/^\d{2}:\d{2}:\d{2} \[([^\]]+)\]/);
            return match && match[1] === label;
          })
          .map(line => line.replace(/^(\d{2}:\d{2}:\d{2}) \[[^\]]+\] /, '$1 '));
      }
    }

    return { id: sidekickId, ...parsed };
  } catch (err) {
    console.error(`[state] Failed to read sidekick ${sidekickId}: ${err.message}`);
    return null;
  }
}

export function updateSidekick(sidekickId, updates) {
  const sidekick = getSidekick(sidekickId);
  if (!sidekick) return null;

  const { history, id, ...meta } = sidekick;
  const newMeta = { ...meta, ...updates, updatedAt: new Date().toISOString() };

  const file = getSidekickFile(sidekickId);
  // Grouped sidekicks: individual file is metadata-only (history lives in group log)
  const fileHistory = newMeta.groupLog ? [] : history;
  writeFileSync(file, formatSidekickFile(newMeta, fileHistory), 'utf8');

  return { id: sidekickId, ...newMeta, history };
}

// Debounced party grouped log recompiler
const _partyTimers = new Map();
function _debouncedPartyRecompile(simId) {
  if (_partyTimers.has(simId)) clearTimeout(_partyTimers.get(simId));
  _partyTimers.set(simId, setTimeout(async () => {
    _partyTimers.delete(simId);
    try {
      const { compileGroupedLog } = await import(
        join(__dirname, '..', '..', '..', 'parties', 'lib', 'grouped-log.js')
      );
      const { readLedger } = await import(
        join(__dirname, '..', '..', '..', 'parties', 'lib', 'ledger.js')
      );
      const ledger = readLedger(simId);
      compileGroupedLog(ledger, simId);
    } catch {}
  }, 3000));
}

export function logMessage(sidekickId, direction, message) {
  const meta = getSidekickMeta(sidekickId);
  if (!meta) {
    console.error(`[state] Sidekick ${sidekickId} not found`);
    return;
  }

  const arrows = { in: '←', out: '→', action: '⚡' };
  const arrow = arrows[direction] || '→';

  try {
    if (meta.groupLog) {
      // Write to group log with [name] prefix
      const groupFile = join(SIDEKICKS_DIR, meta.groupLog);
      const label = meta.groupName || meta.name || sidekickId;
      appendFileSync(groupFile, `${timestamp()} [${label}] ${arrow} ${message}\n`, 'utf8');
    } else {
      // Solo sidekick — write to individual file
      appendFileSync(getSidekickFile(sidekickId), `${timestamp()} ${arrow} ${message}\n`, 'utf8');
    }
  } catch (err) {
    console.error(`[state] Failed to log message: ${err.message}`);
  }

  // Live-recompile party grouped log (debounced 3s)
  if (meta.simulationId) {
    _debouncedPartyRecompile(meta.simulationId);
  }
}

export function logAttachment(sidekickId, direction, attachment) {
  const meta = getSidekickMeta(sidekickId);
  if (!meta) return;

  const arrows = { in: '←', out: '→' };
  const arrow = arrows[direction] || '←';
  let detail = attachment.type;
  if (attachment.localPath) {
    detail = attachment.localPath.replace(PROJECT_ROOT + '/', '');
  }

  try {
    if (meta.groupLog) {
      const groupFile = join(SIDEKICKS_DIR, meta.groupLog);
      const label = meta.groupName || meta.name || sidekickId;
      appendFileSync(groupFile, `${timestamp()} [${label}] ${arrow} [${attachment.type}] ${detail}\n`, 'utf8');
    } else {
      appendFileSync(getSidekickFile(sidekickId), `${timestamp()} ${arrow} [${attachment.type}] ${detail}\n`, 'utf8');
    }
  } catch (err) {
    console.error(`[state] Failed to log attachment: ${err.message}`);
  }
}

export function completeSidekick(sidekickId) {
  // Log completion to group file if grouped
  const meta = getSidekickMeta(sidekickId);
  if (meta?.groupLog) {
    try {
      const groupFile = join(SIDEKICKS_DIR, meta.groupLog);
      const label = meta.groupName || meta.name || sidekickId;
      appendFileSync(groupFile, `${timestamp()} [${label}] ✓ completed\n`, 'utf8');
    } catch {}
  }

  return updateSidekick(sidekickId, {
    status: 'completed',
    endedAt: new Date().toISOString(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────────────────────────────

export function listSidekicks() {
  ensureSidekicksDir();

  try {
    const files = readdirSync(SIDEKICKS_DIR).filter(f => f.endsWith('.txt') && !f.includes('-group-'));
    return files.map(f => {
      const id = f.replace('.txt', '');
      const sidekick = getSidekick(id);
      return sidekick;
    }).filter(Boolean);
  } catch (err) {
    console.error(`[state] Failed to list sidekicks: ${err.message}`);
    return [];
  }
}

export function getActiveSidekicks() {
  return listSidekicks().filter(m => m.status === 'active');
}

export function findSidekickByScope(scope) {
  // scope = "<skill>:<chatId>" - find active sidekick for this conversation
  const sidekicks = getActiveSidekicks();
  return sidekicks.find(m => `${m.source}:${m.chatId}` === scope);
}

export function findCompletedSidekickByScope(scope) {
  // Find most recent completed sidekick matching this scope.
  // For Slack: exact match on channel:thread_ts (same thread = same conversation).
  // For Telegram: matches on source:chatId (most recent from this user).
  const sidekicks = listSidekicks()
    .filter(m => m.status === 'completed' && `${m.source}:${m.chatId}` === scope);

  if (sidekicks.length === 0) return null;

  // Return most recent by startedAt
  return sidekicks.sort((a, b) =>
    new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  )[0];
}

export function findLastCompletedSidekick(source, userId) {
  // Find the most recent completed sidekick from this user on this source.
  // Used for Telegram where there's no thread — just "your last conversation".
  const sidekicks = listSidekicks()
    .filter(m => m.status === 'completed' && m.source === source && m.userId === userId);

  if (sidekicks.length === 0) return null;

  return sidekicks.sort((a, b) =>
    new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  )[0];
}

export function getRecentActivity(count = 10) {
  // Get recent messages across all sidekicks for live feed
  const sidekicks = listSidekicks();
  const allMessages = [];
  const processedGroupLogs = new Set();

  for (const sk of sidekicks) {
    if (sk.groupLog && !processedGroupLogs.has(sk.groupLog)) {
      // Read group log directly (all members, interleaved)
      processedGroupLogs.add(sk.groupLog);
      const groupFile = join(SIDEKICKS_DIR, sk.groupLog);
      if (existsSync(groupFile)) {
        const content = readFileSync(groupFile, 'utf8');
        const parts = content.split('\n---\n');
        const lines = parts[1] ? parts[1].trim().split('\n').filter(Boolean) : [];
        for (const line of lines) {
          allMessages.push({ sidekick: sk.groupLog, line });
        }
      }
    } else if (!sk.groupLog) {
      for (const line of sk.history || []) {
        allMessages.push({ sidekick: sk.id, line });
      }
    }
  }

  return allMessages.slice(-count).map(m => m.line);
}

// ─────────────────────────────────────────────────────────────────────────────
// NAME VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

const RESERVED_NAMES = ['all'];

export function validateSidekickName(name) {
  if (!name) return { valid: true };  // Empty name is fine (unnamed sidekick)
  if (RESERVED_NAMES.includes(name)) return { valid: false, reason: `"${name}" is a reserved word` };
  if (name.startsWith('@')) return { valid: false, reason: 'Name cannot start with @ (reserved for squads)' };
  if (name.includes(',')) return { valid: false, reason: 'Name cannot contain commas (reserved for multi-target)' };
  if (/\s/.test(name)) return { valid: false, reason: 'Name cannot contain spaces (use hyphens instead)' };
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return { valid: false, reason: 'Name can only contain letters, numbers, hyphens, and underscores' };
  return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// NAME & SQUAD RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

export function findSidekickByName(name) {
  if (!name) return null;

  const sidekicks = getActiveSidekicks();

  // Exact name match
  const exact = sidekicks.find(m => m.name === name);
  if (exact) return exact;

  // Prefix match (only if input is 2+ chars to avoid single-letter accidents)
  if (name.length >= 2) {
    const prefix = sidekicks.filter(m => m.name && m.name.startsWith(name));
    if (prefix.length === 1) return prefix[0];
    if (prefix.length > 1) return { ambiguous: true, matches: prefix.map(m => m.name) };
  }

  // Fall back to full ID match
  const byId = sidekicks.find(m => m.id === name);
  if (byId) return byId;

  return null;
}

export function findSidekicksBySquad(squad) {
  const sidekicks = getActiveSidekicks();
  return sidekicks.filter(m => m.squad === squad);
}

/**
 * Resolve a target string to an array of sidekicks.
 * Accepts: "name", "@squad", "name1,name2", "all"
 */
export function resolveTarget(target) {
  if (!target) return [];

  // "all" → every active sidekick
  if (target === 'all') return getActiveSidekicks();

  // "@squad" → all sidekicks in that squad
  if (target.startsWith('@')) return findSidekicksBySquad(target.slice(1));

  // "name1,name2" → resolve each (report failures)
  if (target.includes(',')) {
    const results = [];
    const notFound = [];
    const ambiguous = [];
    for (const name of target.split(',')) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const m = findSidekickByName(trimmed);
      if (!m) { notFound.push(trimmed); continue; }
      if (m.ambiguous) { ambiguous.push(trimmed); continue; }
      results.push(m);
    }
    if (results.length === 0) {
      const parts = [];
      if (notFound.length) parts.push(`not found: ${notFound.join(', ')}`);
      if (ambiguous.length) parts.push(`ambiguous: ${ambiguous.join(', ')}`);
      throw new Error(`No sidekicks resolved (${parts.join('; ')})`);
    }
    return results;
  }

  // Single name
  const result = findSidekickByName(target);
  if (!result) return [];
  if (result.ambiguous) {
    throw new Error(`Ambiguous name "${target}". Matches: ${result.matches.join(', ')}`);
  }
  return [result];
}

export function getSidekicksModTime() {
  // Return latest mod time of any sidekick file (for polling)
  ensureSidekicksDir();
  try {
    const files = readdirSync(SIDEKICKS_DIR).filter(f => f.endsWith('.txt'));
    let latest = 0;
    for (const f of files) {
      const stat = statSync(join(SIDEKICKS_DIR, f));
      if (stat.mtimeMs > latest) latest = stat.mtimeMs;
    }
    return latest || null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export default {
  // CRUD
  createSidekick,
  getSidekick,
  updateSidekick,
  logMessage,
  logAttachment,
  completeSidekick,

  // ID generation
  generateSidekickId,
  getSidekickEmoji,
  getNextColorIndex,
  getSidekickColorIndex,

  // Downloads
  ensureDownloadsDir,
  FILES_DIR,

  // Queries
  listSidekicks,
  getActiveSidekicks,
  findSidekickByScope,
  findCompletedSidekickByScope,
  findLastCompletedSidekick,
  getRecentActivity,
  getSidekicksModTime,
  getGroupLog,

  // Name validation & resolution
  validateSidekickName,
  findSidekickByName,
  findSidekicksBySquad,
  resolveTarget,

  // Paths
  SIDEKICKS_DIR,
};
