// Parties Simulation Picker
// Lists active and recently completed simulations

import {
  View,
  Label,
  SectionHeading,
  Divider,
  Alert,
} from '../../display-engine/ui-kit/index.js';
import { colors } from '../../display-engine/theme.js';
import { ansi } from '../../display-engine/layout/ansi.js';
import { parseLedger } from '../lib/ledger.js';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');
const SIMULATIONS_DIR = join(PROJECT_ROOT, 'recall', 'parties', 'games', 'simulations');

export const maxWidth = 55;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getDirModTime() {
  try { return statSync(SIMULATIONS_DIR).mtimeMs; } catch { return 0; }
}

function listAllSimulations() {
  if (!existsSync(SIMULATIONS_DIR)) return [];
  try {
    const files = readdirSync(SIMULATIONS_DIR).filter(f => f.endsWith('.txt'));
    const sims = [];
    for (const file of files) {
      try {
        const content = readFileSync(join(SIMULATIONS_DIR, file), 'utf8');
        const ledger = parseLedger(content);
        const mtime = statSync(join(SIMULATIONS_DIR, file)).mtimeMs;
        sims.push({
          id: file.replace('.txt', ''),
          game: ledger.meta.game,
          started: ledger.meta.started,
          status: ledger.meta.status || 'active',
          participants: Object.keys(ledger.participants),
          mtime,
        });
      } catch {}
    }
    sims.sort((a, b) => b.mtime - a.mtime);
    return sims;
  } catch {
    return [];
  }
}

function formatAge(started) {
  if (!started) return '';
  const date = new Date(started.replace(' ', 'T'));
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return started.slice(5, 10).replace('-', '/');
}

// ─────────────────────────────────────────────────────────────────────────────
// SIM ROW COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function SimRow({ game, participantCount, age, onSelect }) {
  return {
    type: 'sim-row',
    focusable: true,
    label: game,

    render(focused) {
      const c = colors();
      const text = ansi.fg.rgb(...c.text);
      const muted = ansi.fg.rgb(...c.textMuted);
      const primary = ansi.fg.rgb(...c.primary);
      const reset = ansi.reset;

      const color = focused ? primary : text;
      const gameStr = `${color}${game}${reset}`;
      const meta = `${muted}${participantCount} participant${participantCount !== 1 ? 's' : ''} · ${age}${reset}`;

      return [
        `  \u{1F3AE}  ${gameStr}`,
        `      ${meta}`,
      ];
    },

    getWidth() { return 50; },

    onKey(key) {
      if (key === 'ENTER' || key === ' ') {
        onSelect();
        return true;
      }
      return false;
    },

    onClick() { onSelect(); },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW
// ─────────────────────────────────────────────────────────────────────────────

export function create(ctx) {
  ctx.setTitle('Parties');
  ctx.setDescription('Simulations');

  const view = new View(ctx);
  let pollInterval = null;
  let lastMtime = 0;

  function render() {
    view.clear();

    const sims = listAllSimulations();
    const active = sims.filter(s => s.status === 'active');
    const completed = sims.filter(s => s.status !== 'active');

    if (sims.length === 0) {
      view.add(Alert({ variant: 'info', message: 'No simulations yet' }));
      view.space();
      view.add(Label({ text: 'Run: clappie parties run <game>', dim: true }));
      view.render();
      return;
    }

    // Active simulations
    if (active.length > 0) {
      view.add(SectionHeading({ text: 'ACTIVE' }));
      view.space();

      for (const sim of active) {
        view.add(SimRow({
          game: sim.game,
          participantCount: sim.participants.length,
          age: formatAge(sim.started),
          onSelect: () => ctx.push('status', { sim: sim.id }),
        }));
        view.space();
      }
    }

    // Completed simulations
    if (completed.length > 0) {
      if (active.length > 0) {
        view.add(Divider({ variant: 'thin' }));
        view.space();
      }

      view.add(SectionHeading({ text: 'COMPLETED' }));
      view.space();

      for (const sim of completed.slice(0, 8)) {
        const dateStr = sim.started ? sim.started.slice(5, 10).replace('-', '/') : '';
        view.add(Label({
          text: `  \u25CB  ${sim.game}  (${dateStr})`,
          dim: true,
        }));
      }
    }

    view.render();
  }

  return {
    init() {
      lastMtime = getDirModTime();
      render();

      pollInterval = setInterval(() => {
        const newMtime = getDirModTime();
        if (newMtime !== lastMtime) {
          lastMtime = newMtime;
          render();
        }
      }, 2000);
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
