// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  NOTIFICATIONS STATE - File-based notification storage                    ║
// ║                                                                           ║
// ║  dirty/ = raw notifications from integrations (the firehose)              ║
// ║  clean/ = curated notifications for user review (what matters)            ║
// ║                                                                           ║
// ║  File format: body on top, --- separator, [meta] below                    ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..');

const DIRTY_DIR = join(PROJECT_ROOT, 'notifications', 'dirty');
const CLEAN_DIR = join(PROJECT_ROOT, 'notifications', 'clean');
const LOGS_DIR = join(PROJECT_ROOT, 'recall', 'logs', 'notifications');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
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

function dateStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timeStamp() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function slugify(text, maxWords = 5) {
  if (!text) return 'notification';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, maxWords)
    .join('-')
    .slice(0, 40)
    || 'notification';
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE FORMAT
// ─────────────────────────────────────────────────────────────────────────────

function parseFile(content) {
  const parts = content.split('\n---\n');
  const body = parts[0].trim();
  const metaSection = parts[1] || '';

  const meta = {};
  const metaMatch = metaSection.match(/\[meta\]([\s\S]*)/);
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

function formatFile(body, meta) {
  const metaLines = Object.entries(meta)
    .filter(([k]) => k !== 'body')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  return `${body}\n\n---\n[meta]\n${metaLines}\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRTY (incoming raw data)
// ─────────────────────────────────────────────────────────────────────────────

export function createDirtyItem({ source, body, subject, from, timestamp }) {
  ensureDir(DIRTY_DIR);

  const ts = timestamp || fullTimestamp();
  const slug = slugify(subject || from || source);
  const id = `${source}-${dateStamp()}-${slug}`;

  let finalId = id;
  let counter = 2;
  while (existsSync(join(DIRTY_DIR, `${finalId}.txt`))) {
    finalId = `${id}-${counter}`;
    counter++;
  }

  const meta = {
    source: source || 'unknown',
    timestamp: ts,
  };

  const file = join(DIRTY_DIR, `${finalId}.txt`);
  writeFileSync(file, formatFile(body, meta), 'utf8');

  return { id: finalId, body, ...meta };
}

export function getDirtyItem(id) {
  const file = join(DIRTY_DIR, `${id}.txt`);
  if (!existsSync(file)) return null;

  try {
    const content = readFileSync(file, 'utf8');
    return { id, ...parseFile(content) };
  } catch (err) {
    console.error(`[notifications] Failed to read inbox item ${id}: ${err.message}`);
    return null;
  }
}

export function getDirtyItems() {
  ensureDir(DIRTY_DIR);

  try {
    const files = readdirSync(DIRTY_DIR).filter(f => f.endsWith('.txt'));
    return files.map(f => {
      const id = f.slice(0, -4);
      return getDirtyItem(id);
    }).filter(Boolean).sort((a, b) => {
      return (a.timestamp || '').localeCompare(b.timestamp || '');
    });
  } catch (err) {
    console.error(`[notifications] Failed to list inbox: ${err.message}`);
    return [];
  }
}

export function deleteDirtyItem(id) {
  const file = join(DIRTY_DIR, `${id}.txt`);
  if (existsSync(file)) {
    unlinkSync(file);
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLEAN (curated items for review)
// ─────────────────────────────────────────────────────────────────────────────

export function createCleanItem({ body, source, icon, title, summary, chore }) {
  ensureDir(CLEAN_DIR);

  const slug = slugify(title || body.slice(0, 50));
  let id = slug;
  let counter = 2;
  while (existsSync(join(CLEAN_DIR, `${id}.txt`))) {
    id = `${slug}-${counter}`;
    counter++;
  }

  const meta = {
    source: source || 'unknown',
    created: fullTimestamp(),
    icon: icon || '',
    title: title || '',
  };

  if (summary) meta.summary = summary;
  if (chore) meta.chore = chore;

  const file = join(CLEAN_DIR, `${id}.txt`);
  writeFileSync(file, formatFile(body, meta), 'utf8');

  return { id, body, ...meta };
}

export function updateCleanItem(id, updates) {
  const file = join(CLEAN_DIR, `${id}.txt`);
  if (!existsSync(file)) return null;

  try {
    const content = readFileSync(file, 'utf8');
    const existing = parseFile(content);

    // Merge updates
    const newBody = updates.body !== undefined ? updates.body : existing.body;
    const newMeta = { ...existing };
    delete newMeta.body;

    // Apply updates to meta
    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'body') {
        if (value === null) {
          delete newMeta[key];
        } else {
          newMeta[key] = value;
        }
      }
    }

    writeFileSync(file, formatFile(newBody, newMeta), 'utf8');
    return { id, body: newBody, ...newMeta };
  } catch (err) {
    console.error(`[notifications] Failed to update clean item ${id}: ${err.message}`);
    return null;
  }
}

export function getCleanItem(id) {
  const file = join(CLEAN_DIR, `${id}.txt`);
  if (!existsSync(file)) return null;

  try {
    const content = readFileSync(file, 'utf8');
    const stat = statSync(file);
    return { id, mtime: stat.mtimeMs, ...parseFile(content) };
  } catch (err) {
    console.error(`[notifications] Failed to read outbox item ${id}: ${err.message}`);
    return null;
  }
}

export function getCleanItems() {
  ensureDir(CLEAN_DIR);

  try {
    const files = readdirSync(CLEAN_DIR).filter(f => f.endsWith('.txt'));
    return files.map(f => {
      const id = f.slice(0, -4);
      return getCleanItem(id);
    }).filter(Boolean).sort((a, b) => {
      // Newest first
      return (b.created || '').localeCompare(a.created || '');
    });
  } catch (err) {
    console.error(`[notifications] Failed to list outbox: ${err.message}`);
    return [];
  }
}

export function deleteCleanItem(id) {
  const file = join(CLEAN_DIR, `${id}.txt`);
  if (existsSync(file)) {
    unlinkSync(file);
    return true;
  }
  return false;
}

/**
 * Delete clean item(s) that are linked to a specific chore.
 * Called when a chore is approved/completed to clean up the notification.
 */
export function deleteCleanByChore(choreId) {
  const items = getCleanItems();
  let deleted = 0;
  for (const item of items) {
    if (item.chore === choreId) {
      deleteCleanItem(item.id);
      deleted++;
    }
  }
  return deleted;
}

/**
 * Find clean item by source_id (for sync/cleanup).
 * Used when an external app marks something as read.
 */
export function findCleanBySourceId(source, sourceId) {
  const items = getCleanItems();
  return items.find(item => item.source === source && item.source_id === sourceId) || null;
}

/**
 * Delete clean item by source_id (for sync/cleanup).
 * Called when external app marks item as read/handled.
 */
export function deleteCleanBySourceId(source, sourceId) {
  const item = findCleanBySourceId(source, sourceId);
  if (item) {
    deleteCleanItem(item.id);
    return true;
  }
  return false;
}

export function getCleanCount() {
  ensureDir(CLEAN_DIR);
  try {
    return readdirSync(CLEAN_DIR).filter(f => f.endsWith('.txt')).length;
  } catch {
    return 0;
  }
}

export function getCleanDirModTime() {
  ensureDir(CLEAN_DIR);
  try {
    const files = readdirSync(CLEAN_DIR).filter(f => f.endsWith('.txt'));
    let latest = 0;
    for (const f of files) {
      const stat = statSync(join(CLEAN_DIR, f));
      if (stat.mtimeMs > latest) latest = stat.mtimeMs;
    }
    const dirStat = statSync(CLEAN_DIR);
    if (dirStat.mtimeMs > latest) latest = dirStat.mtimeMs;
    return latest || Date.now();
  } catch {
    return Date.now();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGGING
// ─────────────────────────────────────────────────────────────────────────────

export function logProcessing(message) {
  ensureDir(LOGS_DIR);
  const logFile = join(LOGS_DIR, `${dateStamp()}.txt`);
  const line = `[${timeStamp()}] ${message}\n`;

  try {
    if (existsSync(logFile)) {
      const existing = readFileSync(logFile, 'utf8');
      writeFileSync(logFile, existing + line, 'utf8');
    } else {
      writeFileSync(logFile, line, 'utf8');
    }
  } catch (err) {
    console.error(`[notifications] Failed to log: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export default {
  // Dirty
  createDirtyItem,
  getDirtyItem,
  getDirtyItems,
  deleteDirtyItem,
  // Clean
  createCleanItem,
  getCleanItem,
  getCleanItems,
  updateCleanItem,
  deleteCleanItem,
  deleteCleanByChore,
  findCleanBySourceId,
  deleteCleanBySourceId,
  getCleanCount,
  getCleanDirModTime,
  // Logging
  logProcessing,
  // Paths
  DIRTY_DIR,
  CLEAN_DIR,
  LOGS_DIR,
};
