// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CHORES STATE - File-based chore storage                                  ║
// ║                                                                           ║
// ║  Each chore = one txt file: chores/humans/name.txt                        ║
// ║  Human-readable content on top, --- separator, [chore-meta] below         ║
// ║  When complete/rejected: logged to recall/logs/chores/, then deleted      ║
// ║                                                                           ║
// ║  Meta fields:                                                             ║
// ║    title    - Main heading in UI (required)                               ║
// ║    summary  - Subtitle shown dimmed below title (optional)                ║
// ║    icon     - Emoji before title                                          ║
// ║    context  - Where chore came from (e.g., "email-sweep heartbeat")     ║
// ║    status   - pending | approved | completed | rejected                   ║
// ║    created  - Timestamp when created                                      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deleteCleanByChore } from '../notifications/state.js';

// Derive project root from this file's location
// This file is at: .claude/skills/clappie/clapps/chores/state.js
// Project root is 5 levels up
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const CHORES_DIR = join(PROJECT_ROOT, 'chores', 'humans');
const LOGS_DIR = join(PROJECT_ROOT, 'recall', 'logs', 'chores');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function ensureChoresDir() {
  if (!existsSync(CHORES_DIR)) {
    mkdirSync(CHORES_DIR, { recursive: true });
  }
}

function ensureLogsDir() {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function fullTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function logTimestamp() {
  // For log filenames: YYYY-MM-DD-HHMM
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}-${hours}${minutes}`;
}

function slugify(text, maxWords = 5) {
  if (!text) return 'chore';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, maxWords)
    .join('-')
    .slice(0, 40)
    || 'chore';
}

// Chore ID is just the slug (no timestamp)
export function generateChoreId(summary) {
  return slugify(summary);
}

function getChoreFile(choreId) {
  return join(CHORES_DIR, `${choreId}.txt`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHORE FILE FORMAT
// ─────────────────────────────────────────────────────────────────────────────

function parseChoreFile(content) {
  // Find [chore-meta] section directly (handles multiple --- separators)
  const metaIdx = content.indexOf('[chore-meta]');
  let body, metaSection;

  if (metaIdx >= 0) {
    // Find the --- before [chore-meta]
    const beforeMeta = content.slice(0, metaIdx);
    const lastSeparator = beforeMeta.lastIndexOf('\n---\n');
    body = (lastSeparator >= 0 ? beforeMeta.slice(0, lastSeparator) : beforeMeta).trim();
    metaSection = content.slice(metaIdx);
  } else {
    // No meta section, entire content is body
    body = content.trim();
    metaSection = '';
  }

  const meta = {};
  const metaMatch = metaSection.match(/\[chore-meta\]([\s\S]*)/);
  if (metaMatch) {
    const metaLines = metaMatch[1].trim().split('\n');
    for (const line of metaLines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        meta[key] = value;
      }
    }
  }

  return { body, ...meta };
}

function formatChoreFile(body, meta) {
  const metaLines = Object.entries(meta)
    .filter(([k]) => k !== 'body')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  return `${body}\n\n---\n[chore-meta]\n${metaLines}\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHORE CRUD
// ─────────────────────────────────────────────────────────────────────────────

export function createChore({ body, title, summary, context, icon }) {
  ensureChoresDir();

  const id = generateChoreId(title);
  const file = getChoreFile(id);

  // If file already exists, add a number suffix
  let finalId = id;
  let finalFile = file;
  let counter = 2;
  while (existsSync(finalFile)) {
    finalId = `${id}-${counter}`;
    finalFile = getChoreFile(finalId);
    counter++;
  }

  const meta = {
    status: 'pending',
    created: fullTimestamp(),
    context: context || '',
    icon: icon || '',
    title: title || 'Chore',
    ...(summary && { summary }),
  };

  writeFileSync(finalFile, formatChoreFile(body, meta), 'utf8');

  return { id: finalId, body, ...meta };
}

export function getChore(choreId) {
  const file = getChoreFile(choreId);

  if (!existsSync(file)) {
    return null;
  }

  try {
    const content = readFileSync(file, 'utf8');
    const parsed = parseChoreFile(content);
    return {
      id: choreId,
      filename: basename(file),
      ...parsed
    };
  } catch (err) {
    console.error(`[chores] Failed to read chore ${choreId}: ${err.message}`);
    return null;
  }
}

export function updateChore(choreId, updates) {
  const chore = getChore(choreId);
  if (!chore) return null;

  const { body, id, filename, ...meta } = chore;
  const newMeta = { ...meta, ...updates };

  const file = getChoreFile(choreId);
  writeFileSync(file, formatChoreFile(updates.body || body, newMeta), 'utf8');

  return { id: choreId, body: updates.body || body, ...newMeta };
}

export function approveChore(choreId) {
  // Also dismiss any linked notification
  deleteCleanByChore(choreId);

  return updateChore(choreId, {
    status: 'approved',
    approved: fullTimestamp(),
  });
}

export function completeChore(choreId, result) {
  const chore = getChore(choreId);
  if (!chore) return null;

  const { body, id, filename, ...meta } = chore;
  const newMeta = {
    ...meta,
    status: 'completed',
    completed: fullTimestamp(),
    result: result || 'done',
  };

  // Write to log file: YYYY-MM-DD-HHMM-name.txt
  ensureLogsDir();
  const logFilename = `${logTimestamp()}-${choreId}.txt`;
  const logFile = join(LOGS_DIR, logFilename);
  writeFileSync(logFile, formatChoreFile(body, newMeta), 'utf8');

  // Delete the original chore file
  const choreFile = getChoreFile(choreId);
  if (existsSync(choreFile)) {
    unlinkSync(choreFile);
  }

  return { id: choreId, body, ...newMeta };
}

export function rejectChore(choreId, feedback) {
  const chore = getChore(choreId);
  if (!chore) return null;

  const { body, id, filename, ...meta } = chore;
  const newMeta = {
    ...meta,
    status: 'rejected',
    rejected: fullTimestamp(),
    feedback: feedback || '',
  };

  // Write to log file
  ensureLogsDir();
  const logFilename = `${logTimestamp()}-${choreId}-rejected.txt`;
  const logFile = join(LOGS_DIR, logFilename);
  writeFileSync(logFile, formatChoreFile(body, newMeta), 'utf8');

  // Delete the original chore file
  const choreFile = getChoreFile(choreId);
  if (existsSync(choreFile)) {
    unlinkSync(choreFile);
  }

  return { id: choreId, body, ...newMeta };
}

// Delete a chore without logging (for inline approval in chat)
export function deleteChore(choreId) {
  const choreFile = getChoreFile(choreId);
  if (existsSync(choreFile)) {
    unlinkSync(choreFile);
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE_ID SYNC (for external app cleanup)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find a chore by source_id (for sync/cleanup).
 * Used when an external app marks something as read/handled.
 */
export function findChoreBySourceId(source, sourceId) {
  const chores = getAllChores();
  return chores.find(c => c.source === source && c.source_id === sourceId) || null;
}

/**
 * Complete a chore by source_id (for sync/cleanup).
 * Called when external app marks item as read/handled.
 */
export function completeChoreBySourceId(source, sourceId, result = 'handled externally') {
  const chore = findChoreBySourceId(source, sourceId);
  if (chore) {
    return completeChore(chore.id, result);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────────────────────────────

export function getAllChores() {
  ensureChoresDir();

  try {
    const files = readdirSync(CHORES_DIR)
      .filter(f => f.endsWith('.txt') && !f.startsWith('.'));

    const chores = [];
    for (const f of files) {
      const id = f.slice(0, -4);
      const chore = getChore(id);
      if (chore) chores.push(chore);
    }
    return chores;
  } catch (err) {
    console.error(`[chores] Failed to list chores: ${err.message}`);
    return [];
  }
}

export function getPendingChores() {
  ensureChoresDir();

  try {
    const files = readdirSync(CHORES_DIR)
      .filter(f => f.endsWith('.txt') && !f.startsWith('.'));

    const chores = [];

    for (const f of files) {
      const id = f.slice(0, -4); // remove .txt
      const chore = getChore(id);
      if (chore && chore.status === 'pending') {
        chores.push(chore);
      }
    }

    // Sort by created date (oldest first - FIFO queue)
    return chores.sort((a, b) => {
      const dateA = a.created || '';
      const dateB = b.created || '';
      return dateA.localeCompare(dateB);
    });
  } catch (err) {
    console.error(`[chores] Failed to list chores: ${err.message}`);
    return [];
  }
}

export function getChoresDirModTime() {
  ensureChoresDir();
  try {
    const files = readdirSync(CHORES_DIR).filter(f => f.endsWith('.txt'));
    let latest = 0;
    for (const f of files) {
      const stat = statSync(join(CHORES_DIR, f));
      if (stat.mtimeMs > latest) latest = stat.mtimeMs;
    }
    const dirStat = statSync(CHORES_DIR);
    if (dirStat.mtimeMs > latest) latest = dirStat.mtimeMs;
    return latest || Date.now();
  } catch {
    return Date.now();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHELVING (hide from queue while being revised)
// ─────────────────────────────────────────────────────────────────────────────

function getShelvedFile(choreId) {
  return join(CHORES_DIR, `.${choreId}.txt`);
}

export function shelveChore(choreId) {
  const choreFile = getChoreFile(choreId);
  const shelvedFile = getShelvedFile(choreId);

  if (!existsSync(choreFile)) {
    console.error(`[chores] Cannot shelve ${choreId}: file not found`);
    return false;
  }

  try {
    renameSync(choreFile, shelvedFile);
    return true;
  } catch (err) {
    console.error(`[chores] Failed to shelve ${choreId}: ${err.message}`);
    return false;
  }
}

export function unshelveChore(choreId) {
  const choreFile = getChoreFile(choreId);
  const shelvedFile = getShelvedFile(choreId);

  if (!existsSync(shelvedFile)) {
    console.error(`[chores] Cannot unshelve ${choreId}: shelved file not found`);
    return false;
  }

  try {
    renameSync(shelvedFile, choreFile);
    return true;
  } catch (err) {
    console.error(`[chores] Failed to unshelve ${choreId}: ${err.message}`);
    return false;
  }
}

// Get a shelved chore (dot-prefixed)
export function getShelvedChore(choreId) {
  const file = getShelvedFile(choreId);

  if (!existsSync(file)) {
    return null;
  }

  try {
    const content = readFileSync(file, 'utf8');
    const parsed = parseChoreFile(content);
    return {
      id: choreId,
      filename: `.${choreId}.txt`,
      shelved: true,
      ...parsed
    };
  } catch (err) {
    console.error(`[chores] Failed to read shelved chore ${choreId}: ${err.message}`);
    return null;
  }
}

// Update a shelved chore (for rewriting)
export function updateShelvedChore(choreId, updates) {
  const chore = getShelvedChore(choreId);
  if (!chore) return null;

  const { body, id, filename, shelved, ...meta } = chore;
  const newBody = updates.body !== undefined ? updates.body : body;
  const newMeta = { ...meta };

  // Update meta fields (except body)
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'body') {
      newMeta[key] = value;
    }
  }

  const file = getShelvedFile(choreId);
  writeFileSync(file, formatChoreFile(newBody, newMeta), 'utf8');

  return { id: choreId, body: newBody, shelved: true, ...newMeta };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export default {
  createChore,
  getChore,
  updateChore,
  approveChore,
  completeChore,
  rejectChore,
  deleteChore,
  generateChoreId,
  getAllChores,
  getPendingChores,
  getChoresDirModTime,
  findChoreBySourceId,
  completeChoreBySourceId,
  shelveChore,
  unshelveChore,
  getShelvedChore,
  updateShelvedChore,
  CHORES_DIR,
  LOGS_DIR,
};
