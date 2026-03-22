// Game — file reading helpers for parties
// Claude does all interpretation; these just read files.
//
// Game file format:
//   [SHARED RULES]              — everyone sees this
//   [CARD: Name | Model | @squad] — only that player sees this (| segments optional)
//   [SUGGESTED STATE]           — natural language for AI to interpret when setting initial state

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');
const GAMES_DIR = join(PROJECT_ROOT, 'recall', 'parties', 'games');
const IDENTITIES_DIR = join(PROJECT_ROOT, 'recall', 'parties', 'identities');
const EMERGED_DIR = join(IDENTITIES_DIR, 'emerged');

// Section header pattern — matches [ANYTHING]
const SECTION_HEADER = /^\[(.+?)\]\s*$/gm;

// Card header: [CARD: Name => identity | Model | @squad | super-cc] — all segments after name optional, any order
// Name segment: "Name" or "Name => identity" (=> assigns an identity file)
// Segments: @prefix → squad, "super-cc" → flag, otherwise → model
function parseCardHeader(header) {
  const m = header.match(/^CARD:\s*(.+)$/i);
  if (!m) return null;
  const parts = m[1].split('|').map(s => s.trim());
  const result = {};
  // Parse name segment: "Red Fighter => vex" or just "Red Fighter"
  const namePart = parts[0];
  const arrowMatch = namePart.match(/^(.+?)\s*=>\s*(.+)$/);
  if (arrowMatch) {
    result.name = arrowMatch[1].trim();
    result.identity = arrowMatch[2].trim();
  } else {
    result.name = namePart;
  }
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    if (seg.startsWith('@')) result.squad = seg.slice(1);
    else if (seg.toLowerCase() === 'super-cc') result.superCC = true;
    else result.model = seg.toLowerCase();
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL — section parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a game file into named sections.
 * Returns Map of header → content (header is the text inside brackets).
 */
function parseSections(content) {
  const sections = new Map();
  const headers = [];
  let m;
  const regex = new RegExp(SECTION_HEADER.source, 'gm');
  while ((m = regex.exec(content)) !== null) {
    headers.push({ header: m[1].trim(), index: m.index, end: m.index + m[0].length });
  }

  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].end;
    const end = i + 1 < headers.length ? headers[i + 1].index : content.length;
    sections.set(headers[i].header, content.slice(start, end).trim());
  }

  return sections;
}

// ─────────────────────────────────────────────────────────────────────────────
// GAMES
// ─────────────────────────────────────────────────────────────────────────────

export function readGame(name) {
  const withExt = join(GAMES_DIR, name.endsWith('.txt') ? name : `${name}.txt`);
  if (!existsSync(withExt)) throw new Error(`Game not found: ${name}`);
  return readFileSync(withExt, 'utf8');
}

export function listGames() {
  if (!existsSync(GAMES_DIR)) return [];
  return readdirSync(GAMES_DIR)
    .filter(f => f.endsWith('.txt') && f !== '.txt')
    .map(f => f.replace('.txt', ''));
}

/**
 * Read the [SHARED RULES] section.
 */
export function readSharedRules(name) {
  const sections = parseSections(readGame(name));
  for (const [header, content] of sections) {
    if (header.toLowerCase() === 'shared rules') return content;
  }
  return null;
}

/**
 * Read a specific player's card content.
 * [CARD: Name | Model] → returns content for that name.
 */
export function readPrivateRules(gameName, playerName) {
  const sections = parseSections(readGame(gameName));
  const target = playerName.toLowerCase().trim();

  for (const [header, content] of sections) {
    const card = parseCardHeader(header);
    if (card && card.name.toLowerCase().trim() === target) {
      return content;
    }
  }
  return null;
}

/**
 * List all player names from [CARD: Name] sections.
 */
export function listPlayers(gameName) {
  const sections = parseSections(readGame(gameName));
  const players = [];

  for (const [header] of sections) {
    const card = parseCardHeader(header);
    if (card) {
      players.push(card.name);
    }
  }
  return players;
}

/**
 * Extract metadata from a card header and content.
 * Header provides: model, squad, identity (from => in name or pipe segments)
 * Content provides: Identity: line (fallback)
 * Returns { model, identity, squad } — undefined fields if not found.
 */
export function readPlayerMeta(gameName, playerName) {
  const sections = parseSections(readGame(gameName));
  const target = playerName.toLowerCase().trim();

  for (const [header, content] of sections) {
    const card = parseCardHeader(header);
    if (card && card.name.toLowerCase().trim() === target) {
      const meta = {};
      if (card.model) meta.model = card.model;
      if (card.squad) meta.squad = card.squad;
      if (card.superCC) meta.superCC = true;

      // Identity: header => takes priority, then body "Identity:" line as fallback
      if (card.identity) {
        meta.identity = card.identity;
      } else {
        const identityMatch = content.match(/^Identity:\s*(.+)$/im);
        if (identityMatch) meta.identity = identityMatch[1].trim();
      }

      return meta;
    }
  }
  return null;
}

/**
 * Read the [SUGGESTED STATE] section — raw text for AI to interpret.
 */
export function readSuggestedState(gameName) {
  const sections = parseSections(readGame(gameName));
  for (const [header, content] of sections) {
    if (header.toLowerCase() === 'suggested state') return content;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITIES
// ─────────────────────────────────────────────────────────────────────────────

export function readIdentity(name) {
  const path = join(IDENTITIES_DIR, name.endsWith('.txt') ? name : `${name}.txt`);
  if (!existsSync(path)) throw new Error(`Identity not found: ${name}`);
  return readFileSync(path, 'utf8');
}

export function readEmergedMemory(name) {
  const path = join(EMERGED_DIR, name.endsWith('.txt') ? name : `${name}.txt`);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8');
}

export function ensureEmergedFile(name) {
  mkdirSync(EMERGED_DIR, { recursive: true });
  const path = join(EMERGED_DIR, name.endsWith('.txt') ? name : `${name}.txt`);
  if (existsSync(path)) return false;
  const identityPath = join(IDENTITIES_DIR, name.endsWith('.txt') ? name : `${name}.txt`);
  const seed = existsSync(identityPath) ? readFileSync(identityPath, 'utf8') : '';
  writeFileSync(path, seed, 'utf8');
  return true;
}

export function listIdentities() {
  if (!existsSync(IDENTITIES_DIR)) return [];
  return readdirSync(IDENTITIES_DIR)
    .filter(f => f.endsWith('.txt'))
    .map(f => {
      const name = f.replace('.txt', '');
      const emergedPath = join(EMERGED_DIR, f);
      return { name, hasEmerged: existsSync(emergedPath) };
    });
}
