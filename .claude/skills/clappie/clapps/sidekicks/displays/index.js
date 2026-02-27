// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  SIDEKICK CONTROL DASHBOARD                                                ║
// ║                                                                           ║
// ║  Monitor active sidekicks and manage integrations.                         ║
// ║  Server runs via background daemon. Skills discovered dynamically.         ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import {
  View,
  Toggle,
  Divider,
  Label,
  SectionHeading,
} from '../../display-engine/ui-kit/index.js';
import { ansi } from '../../display-engine/layout/ansi.js';
import { colors } from '../../display-engine/theme.js';
import config from '../config.js';
import stateModule from '../state.js';
import services from '../services.js';
import { killSession } from '../tmux.js';

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────

let webhookSkills = [];
let lastLogModTime = null;
let status = { server: false, ready: false };

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function refreshState() {
  status = await services.getStatus();
  webhookSkills = config.discoverWebhookSkills();
}

/**
 * Get a short icon/abbreviation for a skill
 */
function getSkillIcon(skillName) {
  // Use first 2 chars of skill name, uppercased (e.g., "telegram-bot" → "TE")
  const base = skillName.replace(/-bot$/, '');
  return base.slice(0, 2).toUpperCase();
}

/**
 * Format skill name for display (e.g., "telegram-bot" → "Telegram")
 */
function formatSkillName(skillName) {
  const base = skillName.replace(/-bot$/, '');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEKICK ROW COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function SidekickRow({ icon, slug, msgCount, ageStr, onAbort }) {
  return {
    type: 'sidekick-row',
    focusable: true,
    label: slug,

    render(focused = false) {
      const c = colors();
      const text = ansi.fg.rgb(...c.text);
      const muted = ansi.fg.rgb(...c.textMuted);
      const primary = ansi.fg.rgb(...c.primary);
      const reset = ansi.reset;

      const iconStr = `${muted}${icon}${reset}`;
      const slugStr = `${text}${slug}${reset}`;
      const meta = `${muted}${msgCount}msg ${ageStr}${reset}`;
      const btn = focused ? `${primary}[✕]${reset}` : `${muted}[✕]${reset}`;

      return [`  ${iconStr}  ${slugStr}  ${meta}  ${btn}`];
    },

    getWidth() { return 48; },

    onKey(key) {
      if (key === 'ENTER' || key === ' ') {
        onAbort();
        return true;
      }
      return false;
    },

    onClick() { onAbort(); },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW
// ─────────────────────────────────────────────────────────────────────────────

export const maxWidth = 50;

export function create(ctx) {
  ctx.setTitle('Sidekick');
  ctx.setDescription('Async messaging control');

  const view = new View(ctx);
  let pollInterval = null;
  let lastSkillStates = {};  // Track skill enabled states for change detection

  async function render() {
    await refreshState();

    // Clear and rebuild view
    view.allComponents = [];
    view.components = [];
    view._shortcuts.clear();

    // ─── Status ───
    view.add(SectionHeading({ text: 'STATUS' }));
    view.space();

    const c = colors();
    const success = ansi.fg.rgb(100, 200, 100);
    const muted = ansi.fg.rgb(...c.textMuted);
    const reset = ansi.reset;

    const serverStatus = status.server
      ? `${success}●${reset} Server running on :${config.getPort()}`
      : `${muted}○${reset} Server not running`;

    view.add(Label({ text: serverStatus }));

    view.space();
    view.add(Divider({ variant: 'thin' }));
    view.space();

    // ─── Integrations (dynamically discovered) ───
    view.add(SectionHeading({ text: 'INTEGRATIONS' }));
    view.space();

    // Only show skills with send capability (chat integrations)
    const chatSkills = webhookSkills.filter(s => s.hasSend);

    if (chatSkills.length === 0) {
      view.add(Label({ text: 'No webhook skills found', dim: true }));
    } else {
      // Track current states for change detection
      const currentStates = {};

      for (const skill of chatSkills) {
        const enabled = config.isSkillEnabled(skill.name);
        const hasCredentials = config.skillHasCredentials(skill);
        const webhookPath = config.getSkillWebhookPath(skill.name);

        currentStates[skill.name] = enabled;

        let statusText = '';
        if (!hasCredentials) {
          statusText = ' (no credentials)';
        } else if (webhookPath) {
          statusText = ` /hook/${webhookPath.slice(0, 8)}...`;
        }

        view.add(Toggle({
          label: `${formatSkillName(skill.name)}${statusText}`,
          value: enabled,
          disabled: !hasCredentials,
          onChange: (val) => {
            config.setSkillEnabled(skill.name, val);
            render();
          },
        }));
      }

      lastSkillStates = currentStates;
    }

    view.space();
    view.add(Divider({ variant: 'thin' }));
    view.space();

    // ─── Active Sidekicks ───
    const activeSidekicks = stateModule.getActiveSidekicks();
    const allSidekicks = stateModule.listSidekicks();

    view.add(SectionHeading({ text: `SIDEKICKS (${activeSidekicks.length} active)` }));
    view.space();

    if (activeSidekicks.length === 0) {
      view.add(Label({ text: 'No active sidekicks', dim: true }));
    } else {
      // Group by squad: { squadName: [...], '': [...solo] }
      const squads = new Map();
      for (const sk of activeSidekicks) {
        const key = sk.squad || '';
        if (!squads.has(key)) squads.set(key, []);
        squads.get(key).push(sk);
      }

      // Render squad groups first, then solo sidekicks
      const squadKeys = [...squads.keys()].filter(k => k !== '');
      const soloList = squads.get('') || [];

      const addRow = (sidekick) => {
        const age = Math.round((Date.now() - new Date(sidekick.startedAt).getTime()) / 60000);
        const ageStr = age >= 60 ? `${Math.floor(age / 60)}h${age % 60}m` : `${age}m`;
        const msgCount = sidekick.history?.length || 0;
        const icon = sidekick.emoji || getSkillIcon(sidekick.source);
        const slug = sidekick.name || sidekick.id
          .replace(/^\d{4}-\d{2}-\d{2}-\d{4}-/, '')
          .replace(/^[a-z]+-bot-/, '')
          .replace(/^[a-z]+-/, '');

        view.add(SidekickRow({
          icon,
          slug,
          msgCount,
          ageStr,
          onAbort: async () => {
            const target = sidekick.paneId || sidekick.tmuxWindow;
            if (target) {
              try { await killSession(target); } catch {}
            }
            stateModule.completeSidekick(sidekick.id);
            ctx.toast(`Ended: ${slug}`);
            await render();
          },
        }));
      };

      for (const squad of squadKeys) {
        view.add(Label({ text: `  @${squad}`, dim: true }));
        for (const sk of squads.get(squad)) addRow(sk);
        view.space();
      }

      for (const sk of soloList) addRow(sk);
    }

    view.space();

    // ─── Stats ───
    const completed = allSidekicks.filter(m => m.status === 'completed').length;
    view.add(Label({
      text: `${allSidekicks.length} total · ${completed} completed`,
      dim: true,
    }));

    view.render();
  }

  return {
    init: async () => {
      await render();

      // Poll for updates every 2 seconds
      pollInterval = setInterval(async () => {
        try {
          const newStatus = await services.getStatus();
          const modTime = stateModule.getSidekicksModTime();

          // Check for skill state changes
          const newSkills = config.discoverWebhookSkills().filter(s => s.hasSend);
          let configChanged = false;
          for (const skill of newSkills) {
            const newState = config.isSkillEnabled(skill.name);
            if (lastSkillStates[skill.name] !== newState) {
              configChanged = true;
              break;
            }
          }

          if (JSON.stringify(newStatus) !== JSON.stringify(status) || modTime !== lastLogModTime || configChanged) {
            await render();
          }
        } catch (err) {
          console.error('[sidekick] Poll error:', err);
        }
      }, 2000);
    },

    render,

    onKey: (key) => view.handleKey(key),

    onClick: (row, col) => {
      ctx.handleClick?.(row, col);
    },

    cleanup: async () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    },
  };
}
