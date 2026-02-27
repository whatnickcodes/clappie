// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  RENDERER - Screen compositor (header, content, footer frame)             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { ansi, muted, dim, stripAnsi, visualWidth, truncateToWidth } from './ansi.js';
import { getLayoutDimensions, LAYOUT } from './dimensions.js';
import { applyToastOverlay } from './toast.js';
import { registerClickZone } from '../core/pointer.js';
import { ui } from '../ui-kit/index.js';
import { theme, colors, isDark, initTheme } from '../theme.js';
import { settings } from '../settings.js';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  renderScene,
  createAnimationState,
  tickAnimation,
  createDogAnimationState,
  tickDogAnimation,
  getSceneHeight,
  CONFIG,
  getClickablePositions,
  triggerFlowerBounce,
  cycleCrabColor,
  cycleDogColor,
  tickFlowerBounce,
} from '../graphics/crab-garden.js';
import { renderSkyScene } from '../graphics/sky-scene.js';

// Garden animation state (singleton for the layout footer)
const gardenAnimState = createAnimationState();
const dogAnimState = createDogAnimationState();
const gardenSeed = Math.floor(Math.random() * 100000);
const skySeed = Math.floor(Math.random() * 100000);
let gardenAnimInterval = null;

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BAR STATE
// ─────────────────────────────────────────────────────────────────────────────

// Initialize theme on module load
initTheme();

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION COUNT (live from clean/ directory)
// ─────────────────────────────────────────────────────────────────────────────

const CLEAN_DIR = join(process.cwd(), 'notifications/clean');
let notificationClickHandler = null;

/**
 * Count files in clean/ directory (excluding hidden files)
 * Called on every render - fast enough for polling
 */
function getNotificationCount() {
  try {
    if (!existsSync(CLEAN_DIR)) {
      return 0;
    }
    const files = readdirSync(CLEAN_DIR);
    return files.filter(f => !f.startsWith('.')).length;
  } catch (err) {
    return 0;
  }
}

/**
 * Set the handler for notification icon clicks
 */
export function setNotificationClickHandler(handler) {
  notificationClickHandler = handler;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHORES COUNT (live from chores/humans/ directory)
// ─────────────────────────────────────────────────────────────────────────────

const CHORES_DIR = join(process.cwd(), 'chores', 'humans');
let choresClickHandler = null;

/**
 * Count PENDING chores in chores/humans/ directory
 * Called on every render - fast enough for polling
 */
function getChoresCount() {
  try {
    if (!existsSync(CHORES_DIR)) {
      return 0;
    }
    const files = readdirSync(CHORES_DIR).filter(f => !f.startsWith('.') && f.endsWith('.txt'));
    let count = 0;
    for (const file of files) {
      try {
        const content = readFileSync(join(CHORES_DIR, file), 'utf8');
        // Check if status is pending (or no status = pending)
        if (content.includes('status: pending') || !content.includes('status:')) {
          count++;
        }
      } catch {
        // Skip unreadable files
      }
    }
    return count;
  } catch (err) {
    return 0;
  }
}

/**
 * Set the handler for chores icon clicks
 */
export function setChoresClickHandler(handler) {
  choresClickHandler = handler;
}

// Status bar colors - now dynamic based on theme
function getStatusColors() {
  const c = colors();
  return {
    coral: ansi.fg.rgb(...c.primary),
    dim: ansi.fg.rgb(...c.textMuted),
    cloudWhite: ansi.fg.rgb(255, 255, 255),
    leadBlue: ansi.fg.rgb(...c.primaryFocused),
    reset: ansi.reset,
  };
}

// Status bar emojis
const STATUS_ICONS = {
  moon: '\u{1F31A}',         // 🌚
  sun: '\u{1F31E}',          // 🌞
  mailEmpty: '\u{1F4ED}',    // 📭
  mailFull: '\u{1F4EC}',     // 📬
  envelopeEmpty: '\u2709\uFE0F', // ✉️
  envelopeFull: '\u{1F4E9}', // 📩
  sceneOn: '\u{1F33B}',      // 🌻 (sunflower - scene visible)
  sceneOff: '\u{1F331}',     // 🌱 (seedling - scene hidden)
  close: '\u274C',           // ❌
};

// Superscript digits for notification count
const SUPERSCRIPT_DIGITS = ['\u2070', '\u00B9', '\u00B2', '\u00B3', '\u2074', '\u2075', '\u2076', '\u2077', '\u2078', '\u2079'];

function toSuperscript(num) {
  return String(num).split('').map(d => SUPERSCRIPT_DIGITS[parseInt(d)] || d).join('');
}

/**
 * Toggle dark/light mode - persists to recall/settings/theme/color.txt
 */
export function toggleDarkMode() {
  theme.toggle();
}

/**
 * Get current dark mode state
 */
export function getDarkMode() {
  return isDark();
}

/**
 * Start the garden animation loop.
 * Call this once when the daemon starts.
 * Respects settings.footerAnimations - won't tick if animations disabled.
 */
export function startGardenAnimation(onFrame) {
  if (gardenAnimInterval) return; // Already running
  gardenAnimInterval = setInterval(() => {
    // Only tick animations if enabled in settings
    if (settings.footerAnimations.get()) {
      tickAnimation(gardenAnimState, CONFIG.MAX_SKITTER);
      tickDogAnimation(dogAnimState);
      tickFlowerBounce();  // Tick flower bounce animation
    }
    if (onFrame) onFrame();
  }, 80);
}

/**
 * Stop the garden animation loop.
 */
export function stopGardenAnimation() {
  if (gardenAnimInterval) {
    clearInterval(gardenAnimInterval);
    gardenAnimInterval = null;
  }
}

/**
 * Capitalize a string.
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Render the full screen layout.
 * @param {Object} options
 * @param {number} options.displayWidth - Terminal width
 * @param {number} options.displayHeight - Terminal height
 * @param {Array} options.viewStack - Stack of views
 * @param {Function} options.onPopView - Callback when close button clicked
 */
export function renderLayout(options) {
  const { displayWidth, displayHeight, viewStack, onPopView } = options;

  const w = displayWidth;
  const h = displayHeight;
  const current = viewStack[viewStack.length - 1];

  if (!current) return;

  // Get all layout dimensions from centralized source
  const dims = getLayoutDimensions(w, h);
  const { innerWidth, padding, contentPadLeft } = dims;
  const contentLines = dims.contentHeight;

  const padL = ' '.repeat(padding);
  const contentPadL = ' '.repeat(contentPadLeft);


  // Extract display name from view name
  // "hello-world" → "hello-world", "email/inbox" → "inbox"
  const getDisplayName = (name) => name.includes('/') ? name.split('/')[1] : name;

  const title = current.title || capitalize(getDisplayName(current.name));
  const description = current.description || '';

  const output = [];

  // ─── HEADER: Breadcrumbs + Notifications + Chores + Theme Toggle + Close ───
  const STATUS_COLORS = getStatusColors();
  const { coral, dim: dimColor, cloudWhite, leadBlue, reset } = STATUS_COLORS;
  const { moon, sun, mailEmpty, mailFull, envelopeEmpty, envelopeFull, close } = STATUS_ICONS;

  // Build breadcrumbs: dim previous with ›, coral current, max 3 visible
  const crumbParts = viewStack.map(v => capitalize(getDisplayName(v.name)));

  // Truncate to max 3, add … if more
  let visibleCrumbs;
  let hasEllipsis = false;
  if (crumbParts.length > 3) {
    visibleCrumbs = crumbParts.slice(-3);
    hasEllipsis = true;
  } else {
    visibleCrumbs = crumbParts;
  }

  let crumbs;
  if (visibleCrumbs.length === 1) {
    // Single view: › Current (coral)
    crumbs = `${coral}› ${visibleCrumbs[0]}${reset}`;
  } else {
    // Multiple views: dim previous › coral current
    const previous = visibleCrumbs.slice(0, -1).join(`${dimColor} › ${reset}${dimColor}`);
    const currentName = visibleCrumbs[visibleCrumbs.length - 1];
    const prefix = hasEllipsis ? `${dimColor}… › ` : `${dimColor}`;
    crumbs = `${prefix}${previous}${dimColor} ${coral}› ${currentName}${reset}`;
  }

  // Plain version for length calculation (2 cell left padding included)
  let crumbsPlain;
  if (visibleCrumbs.length === 1) {
    crumbsPlain = `  › ${visibleCrumbs[0]}`;
  } else {
    const prevPlain = visibleCrumbs.slice(0, -1).join(' › ');
    const prefix = hasEllipsis ? '  … › ' : '  ';
    crumbsPlain = `${prefix}${prevPlain} › ${visibleCrumbs[visibleCrumbs.length - 1]}`;
  }

  // Add 2 cell left padding
  crumbs = '  ' + crumbs;

  // Build notifications (count is read fresh on each render)
  const notificationCount = getNotificationCount();
  const mailIcon = notificationCount > 0 ? mailFull : mailEmpty;
  const notifText = notificationCount > 0
    ? `${mailIcon}${dimColor}${toSuperscript(notificationCount)}${reset}`
    : mailIcon;
  const notifPlain = notificationCount > 0
    ? `XX${toSuperscript(notificationCount)}` // emoji = 2 chars width
    : 'XX';

  // Build chores (count is read fresh on each render)
  const choresCount = getChoresCount();
  const choreIcon = choresCount > 0 ? envelopeFull : envelopeEmpty;
  const choresText = choresCount > 0
    ? `${choreIcon}${dimColor}${toSuperscript(choresCount)}${reset}`
    : choreIcon;
  const choresPlain = choresCount > 0
    ? `XX${toSuperscript(choresCount)}` // emoji = 2 chars width
    : 'XX';

  // Build scene toggle (header+footer visibility)
  const { sceneOn, sceneOff } = STATUS_ICONS;
  const sceneEnabled = settings.scene.get();
  const sceneIcon = sceneEnabled ? sceneOn : sceneOff;
  const sceneText = sceneIcon;
  const scenePlain = 'XX'; // emoji = 2 chars width

  // Build theme toggle (respects settings.themeToggle)
  const showThemeToggle = settings.themeToggle.get();
  const themeToggleText = isDark()
    ? `${cloudWhite}${moon}\u2022\u2022\u2022${reset}`
    : `${leadBlue}\u2501\u2501\u2501${sun}${reset}`;
  const togglePlain = showThemeToggle ? 'XX...' : ''; // emoji + 3 chars

  // Build close button
  const closeBtn = close;
  const closePlain = 'XX'; // emoji = 2 chars

  // Calculate spacing (3 spaces between each element, 2 space padding after close)
  const rightSide = showThemeToggle
    ? `${notifText}   ${choresText}   ${sceneText}   ${themeToggleText}   ${closeBtn}  `
    : `${notifText}   ${choresText}   ${sceneText}   ${closeBtn}  `;
  const rightPlain = showThemeToggle
    ? `${notifPlain}   ${choresPlain}   ${scenePlain}   ${togglePlain}   ${closePlain}  `
    : `${notifPlain}   ${choresPlain}   ${scenePlain}   ${closePlain}  `;
  const spacingNeeded = w - crumbsPlain.length - rightPlain.length;

  const headerLine = crumbs + ' '.repeat(Math.max(1, spacingNeeded)) + rightSide;

  // Empty line above status bar
  output.push('');
  output.push(headerLine);

  // Register click zones for status bar elements
  // Row 1 (row 0 is empty line)
  const statusBarRow = 1;
  const rightStartX = w - rightPlain.length;

  // Notification click zone
  const notifStartX = rightStartX;
  const notifEndX = notifStartX + notifPlain.length;
  registerClickZone(statusBarRow, notifStartX, notifEndX, () => {
    if (notificationClickHandler) {
      notificationClickHandler();
    }
  }, 'notifications');

  // Chores click zone
  const choresStartX = notifEndX + 3; // 3 spaces
  const choresEndX = choresStartX + choresPlain.length;
  registerClickZone(statusBarRow, choresStartX, choresEndX, () => {
    if (choresClickHandler) {
      choresClickHandler();
    }
  }, 'chores');

  // Scene toggle click zone (header+footer visibility)
  const sceneStartX = choresEndX + 3; // 3 spaces
  const sceneEndX = sceneStartX + scenePlain.length;
  registerClickZone(statusBarRow, sceneStartX, sceneEndX, () => {
    settings.scene.toggle();
  }, 'sceneToggle');

  // Theme toggle click zone (only if visible)
  let closeStartX;
  if (showThemeToggle) {
    const toggleStartX = sceneEndX + 3; // 3 spaces
    const toggleEndX = toggleStartX + togglePlain.length;
    registerClickZone(statusBarRow, toggleStartX, toggleEndX, () => {
      toggleDarkMode();
    }, 'themeToggle');
    closeStartX = toggleEndX + 3; // 3 spaces
  } else {
    closeStartX = sceneEndX + 3; // 3 spaces (skip toggle)
  }

  // Close button click zone
  const closeEndX = closeStartX + closePlain.length;
  registerClickZone(statusBarRow, closeStartX, closeEndX, onPopView, 'closeBtn');

  // ─── HEADER GAP ─────────────────────────────────────────────────────────────
  for (let i = 0; i < dims.headerGapLines; i++) {
    output.push('');
  }

  // ─── SKY SCENE (sky, clouds, sun, pixel title) ──────────────────────────────
  // Only render if header setting is enabled
  if (dims.showHeader && dims.skyLines > 0) {
    const skySceneLines = renderSkyScene(w, dims.skyLines, skySeed, title, description);
    for (const skyLine of skySceneLines) {
      output.push(skyLine);
    }
  }

  // ─── SKY GAP (space between header and content) ────────────────────────────
  for (let i = 0; i < dims.skyGapLines; i++) {
    output.push('');
  }

  // ─── CONTENT AREA (with scrolling) ─────────────────────────────────────────
  const viewContent = current.renderedLines || [];
  const totalContentLines = viewContent.length;
  const scrollOffset = current.scrollOffset || 0;
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = scrollOffset + contentLines < totalContentLines;

  // Layout mode: 'centered' (default) or 'full'
  const viewLayout = current.layout || 'centered';
  const viewMaxWidth = current.maxWidth ?? 60;

  // Calculate horizontal centering offset for centered layout
  let centerOffset = 0;
  if (viewLayout === 'centered') {
    const availableWidth = innerWidth - contentPadLeft;
    const effectiveMaxWidth = Math.min(viewMaxWidth, availableWidth);
    centerOffset = Math.max(0, Math.floor((availableWidth - effectiveMaxWidth) / 2));
  }
  const centerPad = ' '.repeat(centerOffset);

  // Calculate vertical centering offset (only if content fits in viewport)
  let verticalOffset = 0;
  if (viewLayout === 'centered' && totalContentLines < contentLines) {
    verticalOffset = Math.floor((contentLines - totalContentLines) / 2);
  }

  // Top padding
  for (let i = 0; i < LAYOUT.content.top; i++) {
    output.push(padL);
  }

  // Scrollbar setup
  const needsScrollbar = totalContentLines > contentLines;
  let thumbStart = 0;
  let thumbSize = contentLines;

  if (needsScrollbar) {
    const scrollRatio = scrollOffset / Math.max(1, totalContentLines - contentLines);
    const thumbRatio = contentLines / totalContentLines;
    thumbSize = Math.max(2, Math.min(8, Math.floor(contentLines * thumbRatio)));
    thumbStart = Math.floor(scrollRatio * (contentLines - thumbSize));
  }

  // Scrollbar styling - squares to match pixel vibe
  const c = colors();
  const accent = ansi.fg.rgb(...c.primary);
  const scrollMuted = ansi.fg.rgb(...c.textMuted);
  const scrollReset = ansi.reset;
  const scrollThumb = accent + '■' + scrollReset;
  const scrollArrowUp = accent + '▴' + scrollReset;
  const scrollArrowDown = accent + '▾' + scrollReset;
  const dimTrack = scrollMuted + '.' + scrollReset;

  // Scrollbar track margins
  const scrollMargin = Math.floor(contentLines * 0.15);
  const scrollTrackStart = scrollMargin;
  const scrollTrackEnd = contentLines - scrollMargin;
  const scrollTrackHeight = scrollTrackEnd - scrollTrackStart;

  // Recalculate thumb position within shorter track
  if (needsScrollbar && scrollTrackHeight > 0) {
    const scrollRatio = scrollOffset / Math.max(1, totalContentLines - contentLines);
    const thumbRatio = contentLines / totalContentLines;
    thumbSize = Math.max(2, Math.min(6, Math.floor(scrollTrackHeight * thumbRatio)));
    thumbStart = scrollTrackStart + Math.floor(scrollRatio * (scrollTrackHeight - thumbSize));
  }

  // Default text color for content (theme-aware)
  const defaultTextColor = ansi.fg.rgb(...c.text);

  // Render content lines
  for (let i = 0; i < contentLines; i++) {
    // Apply vertical offset for centered layout (only when content fits)
    const contentIdx = i - verticalOffset + scrollOffset;
    let line = (contentIdx >= 0 && contentIdx < totalContentLines) ? viewContent[contentIdx] : '';

    // Apply default text color (component colors will override where needed)
    line = defaultTextColor + line;

    // Calculate visual width (accounts for emojis being 2 chars wide)
    // For centered layouts, use maxWidth as the line limit; for full, use available width
    const maxLineLen = viewLayout === 'centered'
      ? Math.min(viewMaxWidth, innerWidth - contentPadLeft)
      : innerWidth - contentPadLeft;
    const lineVisualWidth = visualWidth(stripAnsi(line));

    // Truncate line if too long to prevent wrapping
    if (lineVisualWidth > maxLineLen) {
      line = truncateToWidth(line, maxLineLen);
    }

    // Pad line to fill full inner width (use visual width for accurate padding)
    const truncatedVisualWidth = visualWidth(stripAnsi(line));
    const linePadding = Math.max(0, innerWidth - truncatedVisualWidth - contentPadLeft - centerOffset);
    let fullLine = padL + contentPadL + centerPad + line + ' '.repeat(linePadding);

    // Add scrollbar on outer right edge (simple append, no cursor positioning)
    if (needsScrollbar && i >= scrollTrackStart && i < scrollTrackEnd) {
      const isThumb = i >= thumbStart && i < thumbStart + thumbSize;
      const isTrackStart = i === scrollTrackStart;
      const isTrackEnd = i === scrollTrackEnd - 1;

      if (isTrackStart && canScrollUp) {
        fullLine += scrollArrowUp;
      } else if (isTrackEnd && canScrollDown) {
        fullLine += scrollArrowDown;
      } else if (isThumb) {
        fullLine += scrollThumb;
      } else {
        fullLine += dimTrack;
      }
    }

    output.push(fullLine);
  }

  // Bottom padding
  for (let i = 0; i < LAYOUT.content.bottom; i++) {
    output.push(padL);
  }

  // ─── SHORTCUTS (above footer) ────────────────────────────────────────────
  output.push(''); // blank line
  const shortcutItems = [];
  ui.shortcuts.forEach((component, key) => {
    shortcutItems.push(`[${key}] ${component.label || key}`);
  });
  const shortcuts = shortcutItems.join('   ');
  const shortcutPad = Math.floor((w - shortcuts.length) / 2);
  const shortcutColor = ansi.fg.rgb(...c.textMuted);
  output.push(' '.repeat(Math.max(0, shortcutPad)) + shortcutColor + shortcuts + ansi.reset);

  // ─── FOOTER (garden) ──────────────────────────────────────────────────────
  // Only render if footer setting is enabled
  if (dims.showFooter && dims.footerLines > 0) {
    // Render the garden scene - FULL WIDTH, no padding
    const gardenHeight = getSceneHeight();
    const gardenLines = renderScene(w, gardenHeight, gardenSeed, null, gardenAnimState, dogAnimState);

    // Get clickable positions after render
    const clickables = getClickablePositions();

    // Calculate the starting row for the garden (current output length = where garden starts)
    const gardenStartRow = output.length;

    for (const gardenLine of gardenLines) {
      output.push(gardenLine);
    }

    // Register click zones for flowers (they span rows 0-3 of the garden approximately)
    // Flowers are in the top portion of the garden
    if (clickables.flowers) {
      for (const flower of clickables.flowers) {
        // Register click zone spanning multiple rows for each flower
        // Flowers are roughly in the top 2-3 character rows of the garden
        for (let rowOffset = 0; rowOffset < 3; rowOffset++) {
          const screenRow = gardenStartRow + rowOffset;
          registerClickZone(
            screenRow,
            flower.charX,
            flower.charX + flower.charWidth,
            () => triggerFlowerBounce(flower.index),
            `flower-${flower.index}`
          );
        }
      }
    }

    // Register click zone for crab (it's in the lower portion of the garden)
    if (clickables.crab) {
      for (let rowOffset = 1; rowOffset < 4; rowOffset++) {
        const screenRow = gardenStartRow + rowOffset;
        registerClickZone(
          screenRow,
          clickables.crab.charX,
          clickables.crab.charX + clickables.crab.charWidth,
          cycleCrabColor,
          'crab'
        );
      }
    }

    // Register click zone for dog
    if (clickables.dog) {
      for (let rowOffset = 1; rowOffset < 4; rowOffset++) {
        const screenRow = gardenStartRow + rowOffset;
        registerClickZone(
          screenRow,
          clickables.dog.charX,
          clickables.dog.charX + clickables.dog.charWidth,
          cycleDogColor,
          'dog'
        );
      }
    }
  }

  // ─── TOAST OVERLAY (row 0, above breadcrumb) ───────────────────────────────
  applyToastOverlay(output, w);

  // ─── OUTPUT TO TERMINAL ────────────────────────────────────────────────────
  process.stdout.write(ansi.cursor.home + ansi.cursor.hide);
  for (let i = 0; i < h - 1; i++) {
    process.stdout.write((output[i] || '') + ansi.clearLine + '\n');
  }
  // Last line without newline
  process.stdout.write((output[h - 1] || '') + ansi.clearLine);
}
