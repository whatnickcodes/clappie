// Persistent error logging for sidekicks
// Logs to recall/logs/errors/YYYY-MM-DD.txt

import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const ERRORS_DIR = join(PROJECT_ROOT, 'recall', 'logs', 'sidekicks', 'errors');

// Ensure errors directory exists
if (!existsSync(ERRORS_DIR)) {
  mkdirSync(ERRORS_DIR, { recursive: true });
}

function getLogPath() {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return join(ERRORS_DIR, `${date}.txt`);
}

function timestamp() {
  return new Date().toTimeString().slice(0, 8); // HH:MM:SS
}

export function logError(context, error, extra = {}) {
  const line = `[${timestamp()}] ${context}: ${error?.message || error}`;
  const extraStr = Object.keys(extra).length > 0
    ? ` | ${JSON.stringify(extra)}`
    : '';

  try {
    appendFileSync(getLogPath(), line + extraStr + '\n');
  } catch (e) {
    // Don't crash if logging fails
    console.error('[logger] Failed to write:', e.message);
  }

  // Also console.error for immediate visibility (red)
  console.error(`\x1b[91m${line}\x1b[0m`);
}

export function logApiError(skill, endpoint, status, response) {
  logError(`${skill} API`, `${endpoint} returned ${status}`, { response });
}

export default { logError, logApiError };
