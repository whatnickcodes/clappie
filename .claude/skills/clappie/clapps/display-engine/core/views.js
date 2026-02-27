// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  DISPLAYS - Display stack management, loading, and context creation       ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { join, dirname } from 'path';
import { getLayoutDimensions } from '../layout/dimensions.js';
import { sendToChat, submitToChat } from './tmux.js';
import { clearClickGrid, paintClick } from './pointer.js';
import { showToast } from '../layout/toast.js';
import { ui } from '../ui-kit/index.js';

// Base path for skill displays
const VIEWS_BASE = dirname(dirname(dirname(dirname(import.meta.dir))));  // .claude/skills/

// View stack state
let viewStack = [];

// Display dimensions (set by daemon)
let displayWidth = 80;
let displayHeight = 24;

// Claude pane reference (set by daemon)
let claudePane = null;

// Whether we're running inside a background session
let isBackground = false;

// Render callback (set by daemon)
let renderCallback = null;

// Cleanup callback (set by daemon)
let cleanupCallback = null;

/**
 * Initialize the displays module with callbacks and state.
 */
export function initViews(options) {
  displayWidth = options.displayWidth || 80;
  displayHeight = options.displayHeight || 24;
  claudePane = options.claudePane || null;
  renderCallback = options.onRender || null;
  cleanupCallback = options.onCleanup || null;
  isBackground = process.env.CLAPPIE_ALLOW_SENDKEYS === '1';
}

/**
 * Update display dimensions (call on resize).
 */
export function updateViewDimensions(width, height) {
  displayWidth = width;
  displayHeight = height;

  const dims = getLayoutDimensions(displayWidth, displayHeight);

  viewStack.forEach((view) => {
    view.ctx.width = dims.contentWidth;
    view.ctx.height = dims.contentHeight;
  });
}

/**
 * Get the view stack.
 */
export function getViewStack() {
  return viewStack;
}

/**
 * Get the current (top) view.
 */
export function getCurrentView() {
  return viewStack[viewStack.length - 1] || null;
}

/**
 * Load a view module by name.
 *
 * View naming convention:
 *   - No slash (e.g., "heartbeat") → Clappie clapp's index view
 *   - Has slash (e.g., "heartbeat/dashboard") → Clappie clapp's specific view
 *   - Leading slash (e.g., "/email/inbox") → External third-party skill
 *
 * Paths:
 *   - heartbeat → .claude/skills/clappie/clapps/heartbeat/displays/index.js
 *   - heartbeat/dashboard → .claude/skills/clappie/clapps/heartbeat/displays/dashboard.js
 *   - /email/inbox → .claude/skills/email/displays/inbox.js
 */
async function loadView(name) {
  let viewPath;

  if (name.startsWith('/')) {
    // External third-party skill (leading slash)
    const [, skill, viewName] = name.split('/');
    viewPath = join(VIEWS_BASE, skill, 'displays', `${viewName || 'index'}.js`);
  } else if (name.includes('/')) {
    // Clappie clapp with specific view
    const [clapp, viewName] = name.split('/');
    viewPath = join(VIEWS_BASE, 'clappie', 'clapps', clapp, 'displays', `${viewName}.js`);
  } else {
    // Clappie clapp shortcode (index.js)
    viewPath = join(VIEWS_BASE, 'clappie', 'clapps', name, 'displays', 'index.js');
  }

  try {
    const module = await import(viewPath + '?t=' + Date.now());
    return module;
  } catch (err) {
    throw new Error(`View not found: ${name} (tried: ${viewPath})`);
  }
}

/**
 * Create a context object for a view.
 */
function createContext(viewData, stackIndex, layoutConfig = {}) {
  const dims = getLayoutDimensions(displayWidth, displayHeight);

  // Private state for title/description
  let _title = '';
  let _description = '';

  // Layout state (can be changed dynamically via setLayout)
  let _layout = layoutConfig.layout || 'centered';  // 'centered' or 'full'
  let _maxWidth = layoutConfig.maxWidth || 60;      // max content width when centered

  return {
    data: viewData || {},
    width: dims.contentWidth,
    height: dims.contentHeight,
    stackIndex,
    stackDepth: stackIndex + 1,

    setTitle(title) {
      _title = title;
    },

    setDescription(desc) {
      _description = desc;
    },

    getTitle() {
      return _title;
    },

    getDescription() {
      return _description;
    },

    /**
     * Set layout mode for this view.
     * @param {Object} opts - { layout: 'centered'|'full', maxWidth: number }
     */
    setLayout(opts) {
      if (opts.layout) _layout = opts.layout;
      if (opts.maxWidth !== undefined) _maxWidth = opts.maxWidth;
      // Update the view stack entry
      const view = viewStack[stackIndex];
      if (view) {
        view.layout = _layout;
        view.maxWidth = _maxWidth;
      }
    },

    getLayout() {
      return { layout: _layout, maxWidth: _maxWidth };
    },

    /**
     * Hint the total content lines before painting clicks.
     * This enables accurate vertical centering for click zones.
     */
    setContentLines(count) {
      const view = viewStack[stackIndex];
      if (view) {
        view._contentLinesHint = count;
      }
    },

    push(view, data) {
      pushView(view, data);
    },

    pop() {
      popView();
    },

    // Whether running inside a background session
    isBackground,

    send(message) {
      sendToChat(message, claudePane);
    },

    submit(message) {
      submitToChat(message, claudePane);
    },

    toast(msg) {
      showToast(msg);
    },

    draw(lines) {
      // Update THIS view's data (not always the top of stack!)
      const view = viewStack[stackIndex];
      if (view) {
        view.renderedLines = lines;
        view.title = _title;
        view.description = _description;
      }
      // Only render if this view is currently on top
      if (stackIndex === viewStack.length - 1) {
        if (renderCallback) renderCallback();
      }
    },

    clearClickGrid() {
      clearClickGrid();
    },

    paintClick(lineOffset, colStart, colEnd, handler, component = null) {
      const view = viewStack[stackIndex];
      const scrollOffset = view?.scrollOffset || 0;
      // Use hint if available (set before painting), fallback to rendered lines
      const totalContentLines = view?._contentLinesHint || view?.renderedLines?.length || 0;
      paintClick(lineOffset, colStart, colEnd, handler, component, {
        displayWidth,
        displayHeight,
        scrollOffset,
        layout: view?.layout || _layout,
        maxWidth: view?.maxWidth ?? _maxWidth,
        totalContentLines,
      });
    },
  };
}

/**
 * Push a new view onto the stack.
 */
export async function pushView(name, data) {
  try {
    const module = await loadView(name);
    const stackIndex = viewStack.length;

    // Extract layout config from module (defaults: centered, maxWidth 60)
    const layoutConfig = {
      layout: module.layout || 'centered',
      maxWidth: module.maxWidth ?? 60,
    };

    const ctx = createContext(data, stackIndex, layoutConfig);
    const instance = module.create(ctx);

    viewStack.push({
      name,
      instance,
      ctx,
      renderedLines: [],
      title: '',
      description: '',
      scrollOffset: 0,
      layout: layoutConfig.layout,
      maxWidth: layoutConfig.maxWidth,
    });

    // Clear click state and shortcuts when pushing new view
    clearClickGrid();
    ui.clearShortcuts();

    if (instance.init) {
      await instance.init();
    } else {
      instance.render();
    }
  } catch (err) {
    console.error('pushView error:', err);

    // If no views are loaded yet, push an error view so user can close gracefully
    if (viewStack.length === 0) {
      const errorView = createErrorView(name, err.message);
      viewStack.push(errorView);
      errorView.instance.render();
    } else {
      // Already have views, just show toast
      showToast(`Error: ${err.message}`);
    }
  }
}

/**
 * Create an inline error view for when view loading fails
 */
function createErrorView(viewName, errorMessage) {
  const ctx = createContext({}, 0, { layout: 'centered', maxWidth: 60 });

  const instance = {
    render() {
      ctx.setTitle('Error');
      const lines = [
        '',
        `  View not found: ${viewName}`,
        '',
        `  ${errorMessage}`,
        '',
        '',
        '  Press ESC or X to close',
        '',
      ];
      ctx.draw(lines);
    },
    onKey(key) {
      // Any key closes
      return false;
    }
  };

  return {
    name: 'error',
    instance,
    ctx,
    renderedLines: [],
    title: 'Error',
    description: '',
    scrollOffset: 0,
    layout: 'centered',
    maxWidth: 60,
  };
}

/**
 * Pop the current view from the stack.
 * If last view, triggers cleanup and exit.
 */
export function popView() {
  if (viewStack.length <= 1) {
    // Cleanup the last view before exiting
    const lastView = viewStack[0];
    if (lastView?.instance?.cleanup) {
      lastView.instance.cleanup();
    }
    if (cleanupCallback) cleanupCallback();
    process.exit(0);
  }

  // Cleanup the view being removed
  const removedView = viewStack.pop();
  if (removedView?.instance?.cleanup) {
    removedView.instance.cleanup();
  }

  // Clear click state and shortcuts when popping view
  clearClickGrid();
  ui.clearShortcuts();

  const current = viewStack[viewStack.length - 1];
  if (current) {
    const dims = getLayoutDimensions(displayWidth, displayHeight);
    current.ctx.width = dims.contentWidth;
    current.ctx.height = dims.contentHeight;

    // Reset scroll offset when returning to view
    current.scrollOffset = 0;

    // Re-render the view (repaints click zones)
    current.instance.render();

    // Explicitly trigger layout render (click grid should now be populated)
    if (renderCallback) renderCallback();
  }
}

/**
 * Capitalize a string.
 */
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
