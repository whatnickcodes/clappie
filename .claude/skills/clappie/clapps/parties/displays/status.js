// Parties Live Simulation Status
// Clean character cards + compact event feed

import {
  View,
  Label,
  SectionHeading,
  Divider,
  ButtonFullWidth,
  Alert,
} from '../../display-engine/ui-kit/index.js';
import { colors } from '../../display-engine/theme.js';
import { ansi } from '../../display-engine/layout/ansi.js';
import { readLedger } from '../lib/ledger.js';
import { statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');
const SIMULATIONS_DIR = join(PROJECT_ROOT, 'recall', 'parties', 'games', 'simulations');

export const maxWidth = 48;

function getLedgerModTime(simId) {
  try { return statSync(join(SIMULATIONS_DIR, `${simId}.txt`)).mtimeMs; } catch { return 0; }
}

function groupState(ledger) {
  const grouped = {};
  for (const [path, val] of Object.entries(ledger.state)) {
    const dot = path.indexOf('.');
    if (dot > 0) {
      const who = path.slice(0, dot);
      const key = path.slice(dot + 1);
      if (!grouped[who]) grouped[who] = {};
      grouped[who][key] = val;
    }
  }
  return grouped;
}

function pad(str, len) {
  return str + ' '.repeat(Math.max(0, len - str.length));
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW
// ─────────────────────────────────────────────────────────────────────────────

export function create(ctx) {
  const simId = ctx.data?.sim;

  if (!simId) {
    ctx.setTitle('Parties');
    return {
      init() {
        const view = new View(ctx);
        view.add(Alert({ variant: 'warning', message: 'No simulation ID provided' }));
        view.render();
      },
      render() {},
      onKey() { return false; },
    };
  }

  ctx.setTitle('Parties');

  const view = new View(ctx);
  let pollInterval = null;
  let lastMtime = 0;

  function render() {
    view.clear();

    let ledger;
    try {
      ledger = readLedger(simId);
    } catch {
      view.add(Alert({ variant: 'warning', message: 'Simulation not found' }));
      view.render();
      return;
    }

    const c = colors();
    const text = ansi.fg.rgb(...c.text);
    const muted = ansi.fg.rgb(...c.textMuted);
    const primary = ansi.fg.rgb(...c.primary);
    const success = ansi.fg.rgb(100, 200, 100);
    const reset = ansi.reset;

    const isActive = ledger.meta.status === 'active';
    const gameName = ledger.meta.game || simId;

    ctx.setDescription(gameName);

    // ─── Header ───
    const dot = isActive ? `${success}*${reset}` : `${muted}o${reset}`;
    view.add(Label({ text: `${dot} ${text}${gameName}${reset}  ${muted}${ledger.meta.status}${reset}` }));

    view.space();

    // ─── Character Cards ───
    const grouped = groupState(ledger);
    const allNames = new Set([
      ...Object.keys(ledger.participants),
      ...Object.keys(grouped),
    ]);

    if (allNames.size === 0) {
      view.add(Label({ text: 'No participants yet', dim: true }));
    }

    for (const name of allNames) {
      const info = ledger.participants[name] || {};
      const state = grouped[name] || {};

      view.add(Divider({ variant: 'thin' }));
      view.space();

      // Name line
      const meta = [info.model, info.squad, info.identity].filter(Boolean).join(' ');
      const metaStr = meta ? `  ${muted}${meta}${reset}` : '';
      view.add(Label({ text: `${primary}${name}${reset}${metaStr}` }));

      // State — each key=value on its own line, indented
      const entries = Object.entries(state);
      if (entries.length === 0) {
        view.add(Label({ text: `  ${muted}no state${reset}` }));
      } else {
        const maxKey = Math.max(...entries.map(([k]) => k.length));
        for (const [key, val] of entries) {
          const k = `${muted}${pad(key, maxKey)}${reset}`;
          view.add(Label({ text: `  ${k}  ${text}${val}${reset}` }));
        }
      }

      view.space();
    }

    view.add(Divider({ variant: 'thin' }));
    view.space();

    // ─── Last 10 Events ───
    const events = ledger.events || [];
    const recent = events.slice(-10);

    view.add(SectionHeading({ text: `EVENTS (${events.length})` }));
    view.space();

    if (recent.length === 0) {
      view.add(Label({ text: 'No events', dim: true }));
    } else {
      for (const event of recent) {
        const parts = event.split(' | ');
        if (parts.length >= 3) {
          const time = parts[0];
          const actor = parts[1];
          const desc = parts.slice(2).join(' | ');
          const ac = actor === 'system' ? muted : primary;
          view.add(Label({ text: `${muted}${time}${reset} ${ac}${actor}${reset} ${text}${desc}${reset}` }));
        } else {
          view.add(Label({ text: `${muted}${event}${reset}` }));
        }
      }
    }

    if (events.length > 10) {
      view.add(Label({ text: `${muted}+ ${events.length - 10} older${reset}` }));
    }

    // ─── End Button ───
    if (isActive) {
      view.space();
      view.add(Divider({ variant: 'thin' }));
      view.space();
      view.add(ButtonFullWidth({
        label: 'End Simulation',
        shortcut: 'E',
        onPress: () => {
          ctx.submit({ component: 'Parties', value: `end -> ${simId}` });
          ctx.toast('Ending simulation...');
        },
      }));
    }

    view.render();
  }

  return {
    init() {
      lastMtime = getLedgerModTime(simId);
      render();

      pollInterval = setInterval(() => {
        const newMtime = getLedgerModTime(simId);
        if (newMtime !== lastMtime) {
          lastMtime = newMtime;
          render();
        }
      }, 1000);
    },

    render,

    onKey(key) {
      return view.handleKey(key);
    },

    cleanup() {
      if (pollInterval) clearInterval(pollInterval);
    },
  };
}
