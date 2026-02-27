// Ledger — core data layer for parties simulations
// Handles: parse/format/read/write ledger files, state mutations, locking, auto-detection

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, openSync, closeSync, unlinkSync, statSync, constants } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');
const SIMULATIONS_DIR = join(PROJECT_ROOT, 'recall', 'parties', 'games', 'simulations');

// ─────────────────────────────────────────────────────────────────────────────
// PARSING
// ─────────────────────────────────────────────────────────────────────────────

export function parseLedger(content) {
  const ledger = { meta: {}, participants: {}, state: {}, events: [] };
  let section = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Section headers
    if (trimmed === '[meta]') { section = 'meta'; continue; }
    if (trimmed === '[participants]') { section = 'participants'; continue; }
    if (trimmed === '[state]') { section = 'state'; continue; }
    if (trimmed === '[events]') { section = 'events'; continue; }
    if (!trimmed) continue;

    if (section === 'meta') {
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        ledger.meta[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
      }
    }

    if (section === 'participants') {
      // Format: name: model | sidekick=id | identity=name | squad=team
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const name = trimmed.slice(0, colonIdx).trim();
        const rest = trimmed.slice(colonIdx + 1).trim();
        const parts = rest.split('|').map(p => p.trim());
        const participant = { model: parts[0] || '' };
        for (const part of parts.slice(1)) {
          const eqIdx = part.indexOf('=');
          if (eqIdx > 0) {
            participant[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
          }
        }
        ledger.participants[name] = participant;
      }
    }

    if (section === 'state') {
      // Format: who.key=value
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const path = trimmed.slice(0, eq);
        const value = trimmed.slice(eq + 1);
        ledger.state[path] = value;
      }
    }

    if (section === 'events') {
      // Format: HH:MM | actor | description
      ledger.events.push(trimmed);
    }
  }

  return ledger;
}

export function formatLedger(ledger) {
  const lines = [];

  // Meta
  lines.push('[meta]');
  for (const [key, val] of Object.entries(ledger.meta)) {
    lines.push(`${key}=${val}`);
  }
  lines.push('');

  // Participants
  lines.push('[participants]');
  for (const [name, info] of Object.entries(ledger.participants)) {
    const parts = [info.model || ''];
    for (const [key, val] of Object.entries(info)) {
      if (key === 'model') continue;
      parts.push(`${key}=${val}`);
    }
    lines.push(`${name}: ${parts.join(' | ')}`);
  }
  lines.push('');

  // State
  lines.push('[state]');
  for (const [path, val] of Object.entries(ledger.state)) {
    lines.push(`${path}=${val}`);
  }
  lines.push('');

  // Events
  lines.push('[events]');
  for (const event of ledger.events) {
    lines.push(event);
  }

  return lines.join('\n') + '\n';
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE I/O + LOCKING
// ─────────────────────────────────────────────────────────────────────────────

function ensureDir() {
  if (!existsSync(SIMULATIONS_DIR)) {
    mkdirSync(SIMULATIONS_DIR, { recursive: true });
  }
}

function ledgerPath(simulationId) {
  return join(SIMULATIONS_DIR, `${simulationId}.txt`);
}

function lockPath(simulationId) {
  return join(SIMULATIONS_DIR, `${simulationId}.lock`);
}

const STALE_LOCK_MS = 30_000; // 30 seconds

export async function acquireLock(simulationId, retries = 5) {
  const path = lockPath(simulationId);
  for (let i = 0; i < retries; i++) {
    try {
      const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
      closeSync(fd);
      return true;
    } catch {
      // Check for stale lock (orphaned by crashed process)
      try {
        const age = Date.now() - statSync(path).mtimeMs;
        if (age > STALE_LOCK_MS) {
          unlinkSync(path);
          continue; // Retry immediately after clearing stale lock
        }
      } catch {}
      // Jitter: 50-150ms
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
    }
  }
  throw new Error(`Failed to acquire lock for simulation ${simulationId}`);
}

export function releaseLock(simulationId) {
  const path = lockPath(simulationId);
  try { unlinkSync(path); } catch {}
}

export function readLedger(simulationId) {
  const path = ledgerPath(simulationId);
  if (!existsSync(path)) throw new Error(`Simulation not found: ${simulationId}`);
  return parseLedger(readFileSync(path, 'utf8'));
}

export function writeLedger(simulationId, ledger) {
  ensureDir();
  writeFileSync(ledgerPath(simulationId), formatLedger(ledger), 'utf8');
}

export function createLedger(gameName) {
  ensureDir();
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace('T', ' ');
  const id = `${now.toISOString().slice(0, 10)}-${now.toISOString().slice(11, 16).replace(':', '')}-${gameName}`;

  const ledger = {
    meta: {
      game: gameName,
      started: timestamp,
      status: 'loading',
    },
    participants: {},
    state: {},
    events: [
      `${timestamp.slice(11)} | system | simulation started`,
    ],
  };

  writeLedger(id, ledger);
  return { simulationId: id, path: ledgerPath(id) };
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE OPERATIONS (all locked)
// ─────────────────────────────────────────────────────────────────────────────

function timeStamp() {
  return new Date().toISOString().slice(11, 16);
}

export function getState(ledger, who, key) {
  if (key) {
    return ledger.state[`${who}.${key}`] ?? null;
  }
  // Return all state for `who`
  const prefix = `${who}.`;
  const result = {};
  for (const [path, val] of Object.entries(ledger.state)) {
    if (path.startsWith(prefix)) {
      result[path.slice(prefix.length)] = val;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

export function isNumeric(val) {
  return val !== '' && val !== null && val !== undefined && val !== '(none)' && !isNaN(Number(val));
}

function isList(val) {
  return typeof val === 'string' && val.includes(',');
}

export async function setState(simulationId, who, key, value, actor, reason) {
  await acquireLock(simulationId);
  try {
    const ledger = readLedger(simulationId);
    const path = `${who}.${key}`;
    const old = ledger.state[path] ?? '(none)';
    ledger.state[path] = String(value);
    const reasonStr = reason ? ` "${reason}"` : '';
    ledger.events.push(`${timeStamp()} | ${actor} | set ${path} = ${value}${reasonStr}`);
    ledger.events.push(`${timeStamp()} | ${path} | ${old} → ${value}`);
    writeLedger(simulationId, ledger);
    return { old, new: String(value), ledger };
  } finally {
    releaseLock(simulationId);
  }
}

export async function setSharedState(simulationId, key, value, actor) {
  await acquireLock(simulationId);
  try {
    const ledger = readLedger(simulationId);
    const old = ledger.state[key] ?? '(none)';
    ledger.state[key] = String(value);
    ledger.events.push(`${timeStamp()} | ${actor} | set ${key} = ${value}`);
    writeLedger(simulationId, ledger);
    return { old, new: String(value), ledger };
  } finally {
    releaseLock(simulationId);
  }
}

export async function giveState(simulationId, who, key, value, actor, reason) {
  await acquireLock(simulationId);
  try {
    const ledger = readLedger(simulationId);
    const path = `${who}.${key}`;
    const current = ledger.state[path] ?? '';
    let newVal;

    if (isNumeric(current) && isNumeric(value)) {
      newVal = String(Number(current) + Number(value));
    } else if (isNumeric(current) && !isNumeric(value)) {
      throw new Error(`Type mismatch: ${who}.${key} is numeric (${current}) but tried to give non-numeric "${value}"`);
    } else if (!current || current === '(none)') {
      // Empty/new key — just set it
      newVal = String(value);
    } else {
      // List append (current is non-numeric)
      newVal = `${current},${value}`;
    }

    ledger.state[path] = newVal;
    const reasonStr = reason ? ` "${reason}"` : '';
    ledger.events.push(`${timeStamp()} | ${actor} | give ${who} ${key} ${value}${reasonStr}`);
    ledger.events.push(`${timeStamp()} | ${path} | ${current || '(none)'} → ${newVal}`);
    writeLedger(simulationId, ledger);
    return { old: current || '(none)', new: newVal, ledger };
  } finally {
    releaseLock(simulationId);
  }
}

export async function takeState(simulationId, who, key, value, actor, reason) {
  await acquireLock(simulationId);
  try {
    const ledger = readLedger(simulationId);
    const path = `${who}.${key}`;
    const current = ledger.state[path] ?? '';
    let newVal;

    if (isNumeric(current) && isNumeric(value)) {
      newVal = String(Number(current) - Number(value));
    } else if (isNumeric(current) && !isNumeric(value)) {
      throw new Error(`Type mismatch: ${who}.${key} is numeric (${current}) but tried to take non-numeric "${value}"`);
    } else if (isList(current)) {
      // List remove — find and remove first match
      const items = current.split(',');
      const idx = items.indexOf(String(value));
      if (idx !== -1) items.splice(idx, 1);
      newVal = items.join(',');
    } else {
      // Single non-numeric value — exact match removal
      newVal = current === String(value) ? '' : current;
    }

    ledger.state[path] = newVal;
    const reasonStr = reason ? ` "${reason}"` : '';
    ledger.events.push(`${timeStamp()} | ${actor} | take ${who} ${key} ${value}${reasonStr}`);
    ledger.events.push(`${timeStamp()} | ${path} | ${current || '(none)'} → ${newVal}`);
    writeLedger(simulationId, ledger);
    return { old: current || '(none)', new: newVal, ledger };
  } finally {
    releaseLock(simulationId);
  }
}

export async function transferState(simulationId, from, to, key, amount, actor, reason) {
  await acquireLock(simulationId);
  try {
    const ledger = readLedger(simulationId);
    const fromPath = `${from}.${key}`;
    const toPath = `${to}.${key}`;
    const fromCurrent = ledger.state[fromPath] ?? '0';
    const toCurrent = ledger.state[toPath] ?? '0';

    if (!isNumeric(fromCurrent) || !isNumeric(toCurrent) || !isNumeric(amount)) {
      throw new Error(`Transfer requires numeric values. ${fromPath}=${fromCurrent}, ${toPath}=${toCurrent}, amount=${amount}`);
    }

    if (Number(fromCurrent) < Number(amount)) {
      throw new Error(`Insufficient ${key}: ${from} has ${fromCurrent} but tried to transfer ${amount}`);
    }

    const fromNew = String(Number(fromCurrent) - Number(amount));
    const toNew = String(Number(toCurrent) + Number(amount));

    ledger.state[fromPath] = fromNew;
    ledger.state[toPath] = toNew;

    const reasonStr = reason ? ` "${reason}"` : '';
    ledger.events.push(`${timeStamp()} | ${actor} | transfer ${amount} ${key} from ${from} to ${to}${reasonStr}`);
    ledger.events.push(`${timeStamp()} | ${fromPath} | ${fromCurrent} → ${fromNew}`);
    ledger.events.push(`${timeStamp()} | ${toPath} | ${toCurrent} → ${toNew}`);
    writeLedger(simulationId, ledger);
    return { from: { old: fromCurrent, new: fromNew }, to: { old: toCurrent, new: toNew }, ledger };
  } finally {
    releaseLock(simulationId);
  }
}

export async function appendEvent(simulationId, actor, description) {
  await acquireLock(simulationId);
  try {
    const ledger = readLedger(simulationId);
    ledger.events.push(`${timeStamp()} | ${actor} | ${description}`);
    writeLedger(simulationId, ledger);
    return ledger;
  } finally {
    releaseLock(simulationId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export function listActiveSimulations() {
  ensureDir();
  const files = readdirSync(SIMULATIONS_DIR).filter(f => f.endsWith('.txt'));
  const active = [];
  for (const file of files) {
    try {
      const content = readFileSync(join(SIMULATIONS_DIR, file), 'utf8');
      const ledger = parseLedger(content);
      if (ledger.meta.status === 'active' || ledger.meta.status === 'loading') {
        active.push({
          id: file.replace('.txt', ''),
          game: ledger.meta.game,
          started: ledger.meta.started,
          status: ledger.meta.status,
          participants: Object.keys(ledger.participants),
        });
      }
    } catch {}
  }
  return active;
}

export function findSimulationForSidekick(sidekickId) {
  ensureDir();
  const files = readdirSync(SIMULATIONS_DIR).filter(f => f.endsWith('.txt'));
  for (const file of files) {
    try {
      const content = readFileSync(join(SIMULATIONS_DIR, file), 'utf8');
      const ledger = parseLedger(content);
      if (ledger.meta.status !== 'active' && ledger.meta.status !== 'loading') continue;
      for (const [name, info] of Object.entries(ledger.participants)) {
        if (info.sidekick === sidekickId) {
          return { simulationId: file.replace('.txt', ''), participantName: name, ledger };
        }
      }
    } catch {}
  }
  return null;
}

export function resolveMe(ledger, sidekickId) {
  for (const [name, info] of Object.entries(ledger.participants)) {
    if (info.sidekick === sidekickId) return name;
  }
  return null;
}

export function resolveSimulationId(explicitId) {
  // If explicit ID provided, use it
  if (explicitId) return explicitId;

  // Fast path: check CLAPPIE_SIMULATION_ID env var (set by parties launch)
  const simEnv = process.env.CLAPPIE_SIMULATION_ID;
  if (simEnv) return simEnv;

  // Slow path: scan active sims for matching sidekick ID
  const sidekickId = process.env.CLAPPIE_SIDEKICK_ID;
  if (!sidekickId) throw new Error('No simulation ID provided and CLAPPIE_SIDEKICK_ID not set');

  const result = findSimulationForSidekick(sidekickId);
  if (!result) throw new Error(`Sidekick ${sidekickId} is not in any active simulation`);
  return result.simulationId;
}

export function resolveActor(ledger) {
  const sidekickId = process.env.CLAPPIE_SIDEKICK_ID;
  if (!sidekickId) return 'user';
  return resolveMe(ledger, sidekickId) || 'unknown';
}

// Resolve "me" alias to participant name
export function resolveName(name, ledger) {
  if (name === 'me') {
    const sidekickId = process.env.CLAPPIE_SIDEKICK_ID;
    if (!sidekickId) throw new Error('"me" requires CLAPPIE_SIDEKICK_ID to be set');
    const resolved = resolveMe(ledger, sidekickId);
    if (!resolved) throw new Error('You are not a participant in this simulation');
    return resolved;
  }
  return name;
}

// Check if target is in caller's squad
export function isSameSquad(ledger, callerName, targetName) {
  const callerInfo = ledger.participants[callerName];
  const targetInfo = ledger.participants[targetName];
  if (!callerInfo || !targetInfo) return true; // Can't determine, assume same
  if (!callerInfo.squad && !targetInfo.squad) return true; // No squads defined
  return callerInfo.squad === targetInfo.squad;
}
