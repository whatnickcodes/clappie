// Notify — send notifications to sidekick panes via the sidekick HTTP server

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { isNumeric } from './ledger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');
const PORT_FILE = join(PROJECT_ROOT, 'recall', 'settings', 'sidekicks', 'port.txt');

export function getPort() {
  try {
    if (existsSync(PORT_FILE)) {
      const port = parseInt(readFileSync(PORT_FILE, 'utf8').trim(), 10);
      if (!isNaN(port)) return port;
    }
  } catch {}
  return 7777;
}

export async function notifyParticipant(sidekickName, message) {
  const port = getPort();
  try {
    await fetch(`http://localhost:${port}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'parties',
        target: sidekickName,
        text: message,
      }),
    });
  } catch {
    // Server might not be running — that's fine for offline ledger ops
  }
}

export async function notifyStateChange(ledger, who, key, oldVal, newVal, reason, actor) {
  let emoji = '🔄';
  if (isNumeric(newVal) && isNumeric(oldVal)) {
    emoji = Number(newVal) > Number(oldVal) ? '📈' : Number(newVal) < Number(oldVal) ? '📉' : '🔄';
  } else if (isNumeric(newVal) && oldVal === '(none)') {
    emoji = '📈';
  }
  const reasonStr = reason ? ` "${reason}"` : '';
  const actorStr = actor ? ` (from ${actor})` : '';
  const message = `${emoji} ${key} ${oldVal} → ${newVal}${reasonStr}${actorStr}`;

  // Notify the affected participant
  // Hosts/GMs don't need special handling here — spawn them with --super-cc
  // and they'll receive all events via the sidekick infrastructure
  const participantInfo = ledger.participants[who];
  if (participantInfo?.sidekick) {
    await notifyParticipant(who, message);
  }
}
