#!/usr/bin/env bun
// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CLAPPIE DISPLAY DAEMON                                                   ║
// ║  Orchestrator - socket server, lifecycle, and wiring                      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { ansi, muted } from '../layout/ansi.js';
import { inTmux, focusPane, setPaneBackground } from './tmux.js';
import { colors, isDark } from '../theme.js';
import { renderLayout, startGardenAnimation, stopGardenAnimation, setNotificationClickHandler, setChoresClickHandler } from '../layout/renderer.js';
import { setToastRenderCallback, showToast } from '../layout/toast.js';
import { parseKey } from './keyboard.js';
import { parseMouse, handleClick, handleScroll, clearClickGrid } from './pointer.js';
import {
  initViews,
  updateViewDimensions,
  getViewStack,
  getCurrentView,
  pushView,
  popView,
} from './views.js';
import { ui } from '../ui-kit/index.js';
import { unlinkSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const SOCKET_PATH = process.env.CLAPPIE_SOCKET_PATH || '/tmp/clappie.sock';
const HEARTBEAT_INTERVAL = 5000;

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────

let displayWidth = 80;
let displayHeight = 24;
let heartbeatTimer = null;
let clickRefreshTimer = null;

// ─────────────────────────────────────────────────────────────────────────────
// RENDER BRIDGE
// ─────────────────────────────────────────────────────────────────────────────

// Track last bg state to avoid redundant tmux calls
let lastBgWasDark = null;

function render() {
  // Update tmux pane background based on theme
  const dark = isDark();
  if (dark !== lastBgWasDark) {
    const paneId = process.env.TMUX_PANE;
    if (paneId) {
      const c = colors();
      setPaneBackground(paneId, c.background);
    }
    lastBgWasDark = dark;
  }

  renderLayout({
    displayWidth,
    displayHeight,
    viewStack: getViewStack(),
    onPopView: popView,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// INPUT HANDLING
// ─────────────────────────────────────────────────────────────────────────────

async function handleInput(buf) {
  // Debug: uncomment to see raw input bytes
  // const hex = [...buf].map(b => b.toString(16).padStart(2, '0')).join(' ');
  // console.error(`[INPUT] ${buf.length} bytes: ${hex}`);

  // Check for mouse input first
  const mouse = parseMouse(buf);
  if (mouse) {
    if (mouse.button === 64 || mouse.button === 65) {
      // Scroll wheel
      const direction = mouse.button === 64 ? -1 : 1;
      const current = getCurrentView();

      // Check if view instance wants to handle scroll (e.g., editor with textarea)
      if (current?.instance?.onScroll) {
        const handled = current.instance.onScroll(direction);
        if (handled) {
          current?.instance?.render?.();
          render();
          return;
        }
      }

      // Otherwise scroll the whole view
      handleScroll(direction, current, displayWidth, displayHeight, () => {
        current?.instance?.render?.();
        render();
      });
      return;
    }
    if (mouse.pressed) {
      // Click - check grid first, then fallback to view's onClick or blur
      const current = getCurrentView();
      const handled = await handleClick(mouse.x, mouse.y, async (x0, y0) => {
        // Fallback: view's onClick handler OR blur via onBackgroundClick
        if (current?.instance?.onClick) {
          await current.instance.onClick(x0, y0);
        } else if (current?.instance?.onBackgroundClick) {
          // Background click handler - used to blur focus when clicking empty space
          await current.instance.onBackgroundClick(x0, y0);
        }
      });
      // Re-render after click (theme toggle, flowers, etc.)
      // Must re-render view first to regenerate colors if theme changed
      // Always re-render even if no handler matched - background clicks need re-render too
      await current?.instance?.render?.();
      render();
      return;
    }
  }

  // Parse keyboard input
  const key = parseKey(buf);
  if (!key) return;

  // Global keys
  if (key === 'ESCAPE') {
    popView();
    render();  // Ensure click grid is repainted
    return;
  }

  if (key === 'CTRL_C') {
    cleanup();
    process.exit(0);
  }

  // Let view handle key first
  const current = getCurrentView();
  if (current?.instance?.onKey) {
    const handled = current.instance.onKey(key);
    if (handled) return;
  }

  // Fallback: check global shortcuts
  const shortcut = ui.shortcuts.get(key.toUpperCase());
  if (shortcut?.handler) {
    shortcut.handler();
    return;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SOCKET SERVER
// ─────────────────────────────────────────────────────────────────────────────

function startServer() {
  if (existsSync(SOCKET_PATH)) {
    unlinkSync(SOCKET_PATH);
  }

  const server = Bun.listen({
    unix: SOCKET_PATH,
    socket: {
      async data(socket, data) {
        try {
          const cmd = JSON.parse(data.toString());

          switch (cmd.action) {
            case 'push':
              await pushView(cmd.view, cmd.data);
              // Focus this pane unless --no-focus was specified
              if (!cmd.noFocus) {
                focusPane(process.env.TMUX_PANE);
              }
              break;
            case 'pop':
              popView();
              break;
            case 'toast':
              showToast(cmd.message, cmd.duration);
              break;
            case 'close':
              cleanup();
              process.exit(0);
              break;
            case 'ping':
              socket.write('pong');
              break;
            case 'capture': {
              // Debug: capture the display pane content as text
              const pane = process.env.TMUX_PANE;
              if (pane) {
                const result = spawnSync('tmux', ['capture-pane', '-t', pane, '-p'], { encoding: 'utf8' });
                socket.write(result.stdout || '(empty)');
              } else {
                socket.write('(no pane)');
              }
              break;
            }
            default:
              console.error('Unknown command:', cmd.action);
          }
        } catch (err) {
          console.error('Socket error:', err);
        }
      },
      error(socket, err) {
        console.error('Socket error:', err);
      },
    },
  });

  return server;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────

function cleanup() {
  stopGardenAnimation();

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (clickRefreshTimer) {
    clearInterval(clickRefreshTimer);
    clickRefreshTimer = null;
  }

  process.stdout.write(ansi.cursor.show);
  process.stdout.write(ansi.mouse.disable);
  process.stdout.write(ansi.clear);

  try {
    if (existsSync(SOCKET_PATH)) {
      unlinkSync(SOCKET_PATH);
    }
  } catch (e) {}
}

function startHeartbeat() {
  const myPane = process.env.TMUX_PANE;
  if (!myPane) return;

  heartbeatTimer = setInterval(() => {
    try {
      const result = spawnSync('tmux', ['list-panes', '-F', '#{pane_id}'], {
        encoding: 'utf8',
        timeout: 2000,
      });

      if (result.status !== 0) {
        cleanup();
        process.exit(0);
      }

      const panes = result.stdout.trim().split('\n');
      if (!panes.includes(myPane)) {
        cleanup();
        process.exit(0);
      }
    } catch (err) {
      cleanup();
      process.exit(0);
    }
  }, HEARTBEAT_INTERVAL);
}

function startClickRefresh() {
  // Periodically refresh click grid to handle edge cases (pop, etc.)
  clickRefreshTimer = setInterval(() => {
    const current = getCurrentView();
    if (current?.instance?.render) {
      current.instance.render();
    }
  }, 500);  // Every 500ms
}

async function updateDimensions() {
  try {
    displayWidth = process.stdout.columns || 80;
    displayHeight = process.stdout.rows || 24;

    // Clear screen before re-rendering to prevent artifacts from old dimensions
    process.stdout.write(ansi.clear);

    updateViewDimensions(displayWidth, displayHeight);

    const current = getCurrentView();
    if (current?.instance?.render) {
      await current.instance.render();
    }

    // Force full re-render of layout (header, footer, etc.)
    render();
  } catch (err) {
    console.error('Resize error:', err.message, err.stack);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (!inTmux()) {
    console.error('Clappie must run inside tmux');
    process.exit(1);
  }

  const claudePane = process.env.CLAPPIE_CLAUDE_PANE;
  if (!claudePane) {
    console.error('CLAPPIE_CLAUDE_PANE not set');
    process.exit(1);
  }

  // Initialize modules
  initViews({
    displayWidth,
    displayHeight,
    claudePane,
    onRender: render,
    onCleanup: cleanup,
  });

  setToastRenderCallback(render);

  // Setup terminal
  process.stdout.write(ansi.clear);
  process.stdout.write(ansi.cursor.hide);
  process.stdout.write(ansi.mouse.enable);

  updateDimensions();
  process.stdout.on('resize', updateDimensions);

  // Setup input
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', handleInput);

  // Start services
  startServer();
  startHeartbeat();
  startClickRefresh();
  startGardenAnimation(render);

  // Set notification click handler to open notifications view
  setNotificationClickHandler(async () => {
    const current = getCurrentView();
    if (current?.name === 'notifications') return; // Already open
    await pushView('notifications');
  });

  // Set chores click handler to open chores view
  setChoresClickHandler(async () => {
    const current = getCurrentView();
    if (current?.name === 'chores') return; // Already open
    await pushView('chores');
  });

  // Signal handlers
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });

  // Startup screen
  const startupLines = [
    '',
    muted('  Terminal UI Engine v0.1'),
    '',
    muted(`  Socket: ${SOCKET_PATH}`),
    muted('  Waiting for views...'),
  ];

  process.stdout.write(ansi.clear);
  startupLines.forEach(line => process.stdout.write(line + '\n'));

  // Load initial view if specified
  const initialView = process.env.CLAPPIE_INITIAL_VIEW;
  const initialData = process.env.CLAPPIE_INITIAL_DATA;
  if (initialView) {
    await pushView(initialView, initialData ? JSON.parse(initialData) : {});
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  cleanup();
  process.exit(1);
});
