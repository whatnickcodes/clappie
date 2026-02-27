// Background - Background task manager
// Each task runs in its own tmux session with Claude + Display
//
// Run: clappie display push background

import {
  View,
  SectionHeading,
  Label,
  Divider,
  ButtonInline,
} from '../../display-engine/ui-kit/index.js';

import { ansi, visualWidth, stripAnsi } from '../../display-engine/layout/ansi.js';
import { colors } from '../../display-engine/theme.js';

import * as tmux from '../tmux.js';

export const maxWidth = 60;

// ─────────────────────────────────────────────────────────────────────────────
// APP ROW COMPONENT - Shows status + action buttons
// ─────────────────────────────────────────────────────────────────────────────

function AppRow({ app, isRunning, onStart, onStop, canStop = true }) {
  return {
    type: 'app-row',
    focusable: true,
    label: app.name,

    render(focused = false) {
      const c = colors();
      const text = ansi.fg.rgb(...c.text);
      const muted = ansi.fg.rgb(...c.textMuted);
      const primary = ansi.fg.rgb(...c.primary);
      const success = ansi.fg.rgb(100, 200, 100);
      const reset = ansi.reset;

      const status = isRunning
        ? `${success}●${reset}`
        : `${muted}○${reset}`;

      const name = `${text}${app.name}${reset}`;

      let btn = '';
      if (isRunning && !canStop) {
        // Running but can't be stopped via CLI - no button
        btn = '';
      } else if (isRunning) {
        btn = focused ? `${primary}[Stop]${reset}` : `${muted}[Stop]${reset}`;
      } else {
        btn = focused ? `${primary}[Start]${reset}` : `${muted}[Start]${reset}`;
      }

      return [`  ${status}  ${name}  ${btn}`];
    },

    getWidth() {
      return 50;
    },

    onKey(key) {
      if (key === 'ENTER' || key === ' ') {
        if (isRunning && !canStop) {
          return false; // Can't stop this app
        }
        if (isRunning) {
          onStop();
        } else {
          onStart();
        }
        return true;
      }
      return false;
    },

    onClick() {
      if (isRunning && !canStop) {
        return; // Can't stop this app
      }
      if (isRunning) {
        onStop();
      } else {
        onStart();
      }
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BOX DRAWING UTILITIES (for session tree)
// ─────────────────────────────────────────────────────────────────────────────

const BOX = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  tee: '├',
  corner: '╰',
  vertLine: '│',
};

function drawBoxHeader(title, width, options = {}) {
  const c = colors();
  const borderColor = options.highlight
    ? ansi.fg.rgb(...c.primary)
    : ansi.fg.rgb(...c.border);
  const titleColor = options.highlight
    ? ansi.fg.rgb(...c.primary)
    : ansi.fg.rgb(...c.text);
  const reset = ansi.reset;

  const innerWidth = width - 2;
  const marker = options.highlight ? ' <- you' : '';
  const titleText = ` ${title}${marker} `;
  const titleLen = visualWidth(titleText);
  const remainingWidth = innerWidth - titleLen;
  const leftPad = 1;
  const rightPad = remainingWidth - leftPad;

  return [
    borderColor + BOX.topLeft +
    BOX.horizontal.repeat(leftPad) +
    reset + titleColor + titleText + reset +
    borderColor + BOX.horizontal.repeat(Math.max(0, rightPad)) +
    BOX.topRight + reset,

    borderColor + BOX.vertical + reset +
    ' '.repeat(innerWidth) +
    borderColor + BOX.vertical + reset
  ];
}

function WindowLine({ windowName, isLast, boxWidth, highlight, canClose, onClose }) {
  return {
    type: 'window-line',
    focusable: canClose,
    label: windowName,

    render(focused = false) {
      const c = colors();
      const borderColor = highlight
        ? ansi.fg.rgb(...c.primary)
        : ansi.fg.rgb(...c.border);
      const textColor = ansi.fg.rgb(...c.text);
      const mutedColor = ansi.fg.rgb(...c.textMuted);
      const primary = ansi.fg.rgb(...c.primary);
      const reset = ansi.reset;

      const innerWidth = boxWidth - 2;
      const winConnector = isLast ? BOX.corner : BOX.tee;

      const closeBtn = canClose
        ? (focused ? `${primary}[x]${reset}` : `${mutedColor}[x]${reset}`)
        : '';

      const winLine = `${mutedColor}${winConnector}${BOX.horizontal}${reset} ${textColor}${windowName}${reset} ${closeBtn}`;
      const winPad = innerWidth - visualWidth(stripAnsi(winLine));

      return [
        borderColor + BOX.vertical + reset +
        winLine + ' '.repeat(Math.max(0, winPad)) +
        borderColor + BOX.vertical + reset
      ];
    },

    getWidth() {
      return boxWidth;
    },

    onKey(key) {
      if ((key === 'ENTER' || key === ' ') && canClose && onClose) {
        onClose();
        return true;
      }
      return false;
    },

    async onClick() {
      if (canClose && onClose) await onClose();
    }
  };
}

function getPaneTreePrefix(isLastWindow, isLastPane) {
  const c = colors();
  const mutedColor = ansi.fg.rgb(...c.textMuted);
  const reset = ansi.reset;

  const verticalLine = isLastWindow ? ' ' : BOX.vertLine;
  const paneConnector = isLastPane ? BOX.corner : BOX.tee;

  return `${mutedColor}${verticalLine}  ${paneConnector}${BOX.horizontal}${reset}`;
}

function PaneLine({ treeLine, label, paneId, canClose, onClose, boxWidth, highlight }) {
  return {
    type: 'pane-line',
    focusable: canClose,
    label,

    render(focused = false) {
      const c = colors();
      const text = ansi.fg.rgb(...c.text);
      const muted = ansi.fg.rgb(...c.textMuted);
      const primary = ansi.fg.rgb(...c.primary);
      const borderColor = highlight
        ? ansi.fg.rgb(...c.primary)
        : ansi.fg.rgb(...c.border);
      const reset = ansi.reset;

      const closeBtn = canClose
        ? (focused ? `${primary}[x]${reset}` : `${muted}[x]${reset}`)
        : '   ';

      const content = `${treeLine} ${text}${label}${reset} ${muted}${paneId}${reset} ${closeBtn}`;
      const innerWidth = boxWidth - 2;
      const contentLen = visualWidth(stripAnsi(content));
      const pad = innerWidth - contentLen;

      return [
        borderColor + '|' + reset +
        content + ' '.repeat(Math.max(0, pad)) +
        borderColor + '|' + reset
      ];
    },

    getWidth() {
      return boxWidth;
    },

    onKey(key) {
      if ((key === 'ENTER' || key === ' ') && canClose && onClose) {
        onClose();
        return true;
      }
      return false;
    },

    async onClick() {
      if (canClose && onClose) await onClose();
    }
  };
}

function drawBoxFooter(width, options = {}) {
  const c = colors();
  const borderColor = options.highlight
    ? ansi.fg.rgb(...c.primary)
    : ansi.fg.rgb(...c.border);
  const reset = ansi.reset;

  const innerWidth = width - 2;
  return borderColor + BOX.bottomLeft +
    BOX.horizontal.repeat(innerWidth) +
    BOX.bottomRight + reset;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN VIEW
// ─────────────────────────────────────────────────────────────────────────────

export function create(ctx) {
  ctx.setTitle('Background');
  ctx.setDescription('Service manager');

  const view = new View(ctx);
  let sessions = [];
  let backgroundApps = [];
  let appStates = {}; // appId -> running boolean
  let pollInterval = null;

  // Get the pane IDs for identification
  const claudePane = process.env.CLAPPIE_CLAUDE_PANE;
  const displayPane = process.env.TMUX_PANE;

  // Check if this session contains the current conversation
  function isCurrentSession(sess) {
    return sess.windows.some(w =>
      w.panes.some(p => p.id === claudePane || p.id === displayPane)
    );
  }

  // Get pane label
  function getPaneLabel(paneId, command, title = null) {
    if (paneId === claudePane) return 'Chat';
    if (paneId === displayPane) return 'Display';

    // Use custom pane title if set (not hostname or default)
    if (title && !title.includes('.local') && !title.includes('.com') && title.length < 20) {
      return title;
    }

    const cmd = (command || '').toLowerCase();
    if (cmd.includes('claude')) return 'Chat';
    if (/^\d+\.\d+\.\d+$/.test(cmd)) return 'Chat';
    if (cmd === 'bun' || cmd === 'node') return 'Display';

    return command || 'Shell';
  }

  async function render() {
    sessions = await tmux.getSessions();
    backgroundApps = tmux.discoverBackgroundApps();

    // Check running state for each app
    for (const app of backgroundApps) {
      appStates[app.id] = await tmux.isAppRunning(app.id, app.statusCmd);
    }

    view.allComponents = [];
    view.components = [];
    view._shortcuts.clear();

    // ─── BACKGROUND TASKS ───
    view.add(SectionHeading({ text: 'BACKGROUND TASKS' }));
    view.space();

    if (backgroundApps.length === 0) {
      view.add(Label({ text: 'No background apps configured', dim: true }));
      view.add(Label({ text: 'Add .background marker to a clapp folder', dim: true }));
    } else {
      for (const app of backgroundApps) {
        const isRunning = appStates[app.id] || false;

        view.add(AppRow({
          app,
          isRunning,
          canStop: !app.noCliStop,
          onStart: async () => {
            ctx.toast(`Starting ${app.name}...`);
            if (app.startCmd) {
              // One-shot start command (no tmux session)
              Bun.spawnSync(['bash', '-c', app.startCmd]);
            } else {
              await tmux.launchApp(app.id, app.launchArgs, app.daemonCmd);
            }
            await render();
          },
          onStop: async () => {
            ctx.toast(`Stopping ${app.name}...`);
            if (app.stopCmd) {
              // One-shot stop command
              Bun.spawnSync(['bash', '-c', app.stopCmd]);
            } else {
              await tmux.stopApp(app.id);
            }
            await render();
          },
        }));
      }

    }

    view.space();
    view.add(Divider({ variant: 'thin' }));
    view.space();

    // ─── TMUX SESSIONS ───
    view.add(SectionHeading({ text: 'TMUX SESSIONS' }));
    view.space();

    if (sessions.length === 0) {
      view.add(Label({ text: 'No sessions running', dim: true }));
    } else {
      const boxWidth = 50;

      for (let i = 0; i < sessions.length; i++) {
        const sess = sessions[i];
        const isCurrent = isCurrentSession(sess);
        const isBackground = sess.name.startsWith('background-');
        const boxOpts = { highlight: isCurrent };

        // Box header
        for (const line of drawBoxHeader(sess.name, boxWidth, boxOpts)) {
          view.add(Label({ text: line }));
        }

        // Windows and panes
        for (let wi = 0; wi < sess.windows.length; wi++) {
          const win = sess.windows[wi];
          const isLastWindow = wi === sess.windows.length - 1;

          // Window line (clickable to close for non-current sessions)
          view.add(WindowLine({
            windowName: win.name,
            isLast: isLastWindow,
            boxWidth,
            highlight: isCurrent,
            canClose: !isCurrent && !isBackground,
            onClose: async () => {
              ctx.toast('Closing window...');
              await tmux.killWindow(sess.name, wi);
              await render();
            },
          }));

          // Panes
          for (let pi = 0; pi < win.panes.length; pi++) {
            const pane = win.panes[pi];
            const isLastPane = pi === win.panes.length - 1;
            const isProtected = pane.id === claudePane || pane.id === displayPane;

            const treeLine = getPaneTreePrefix(isLastWindow, isLastPane);
            const label = getPaneLabel(pane.id, pane.command, pane.title);

            view.add(PaneLine({
              treeLine,
              label,
              paneId: pane.id,
              canClose: !isProtected && !isBackground,
              boxWidth,
              highlight: isCurrent,
              onClose: async () => {
                ctx.toast('Closing pane...');
                await tmux.killPane(pane.id);
                await render();
              },
            }));
          }
        }

        // Box footer
        view.add(Label({ text: drawBoxFooter(boxWidth, boxOpts) }));

        if (i < sessions.length - 1) {
          view.space();
        }
      }
    }

    view.render();
  }

  return {
    init: async () => {
      await render();

      pollInterval = setInterval(async () => {
        try {
          const newSessions = await tmux.getSessions();

          // Check app states
          const newAppStates = {};
          for (const app of backgroundApps) {
            newAppStates[app.id] = await tmux.isAppRunning(app.id);
          }

          if (JSON.stringify(newSessions) !== JSON.stringify(sessions) ||
              JSON.stringify(newAppStates) !== JSON.stringify(appStates)) {
            await render();
          }
        } catch (err) {
          // Ignore poll errors
        }
      }, 2000);
    },

    render,

    onKey: (key) => view.handleKey(key),

    cleanup: () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    },
  };
}
