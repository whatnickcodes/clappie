// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  LAYOUT DIMENSIONS - Single source of truth for layout calculations       ║
// ║                                                                           ║
// ║  IMPORTANT: All layout-dependent code MUST use these functions.           ║
// ║  Never calculate headerLines, titleLines, footerLines elsewhere!          ║
// ║                                                                           ║
// ║  Respects settings from recall/settings/theme/:                           ║
// ║    header.txt, footer.txt, etc.                                           ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { spawnSync } from 'child_process';
import { settings } from '../settings.js';

// Layout configuration
export const LAYOUT = {
  minWidthForAscii: 120,     // Below this, use simple text title (mobile mode)
  padding: 4,                // Left/right padding for entire window
  content: {                 // Padding for content area
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
};

// Fixed layout heights
const HEADER_LINES_DESKTOP = 2;  // empty line + breadcrumbs row
const HEADER_LINES_MOBILE = 2;   // same as desktop (empty line + breadcrumbs)
const HEADER_GAP_LINES_DESKTOP = 1;   // gap between breadcrumbs and sky (toast renders here)
const HEADER_GAP_LINES_MOBILE = 1;   // same as desktop (toast needs this row)
const SKY_LINES_DESKTOP = 8;  // sky scene with pixel title, lead, clouds
const SKY_LINES_MOBILE = 4;   // compact sky for narrow terminals
const SKY_GAP_LINES_DESKTOP = 1;     // gap between sky and content
const SKY_GAP_LINES_MOBILE = 0;      // no gap on mobile
const TITLE_LINES = 0;        // old title area removed - sky handles it now
const SHORTCUTS_LINES = 2;    // blank line + shortcuts bar above footer
const FOOTER_LINES = 5;       // garden (5 lines)

/**
 * Check if we're inside a background tmux session
 */
function isInBackgroundSession() {
  try {
    const tmuxPane = process.env.TMUX_PANE;
    if (!tmuxPane) return false;

    // Get session name for this pane
    const result = spawnSync('tmux', ['display-message', '-p', '#{session_name}'], {
      encoding: 'utf8',
      timeout: 1000,
    });

    const sessionName = (result.stdout || '').trim();
    return sessionName.startsWith('background-');
  } catch {
    return false;
  }
}

/**
 * Check if we're in mobile mode (narrow terminal)
 * Always returns false (desktop mode) if inside a background session
 */
export function isMobileWidth(width) {
  // Background sessions always use desktop layout
  if (isInBackgroundSession()) {
    return false;
  }
  return width < LAYOUT.minWidthForAscii;
}

/**
 * Get all layout dimensions for a given terminal size.
 * This is THE function to use for layout calculations.
 *
 * Respects settings:
 *   - header: show/hide sky scene with pixel title
 *   - footer: show/hide garden
 *
 * @param {number} displayWidth - Terminal width in columns
 * @param {number} displayHeight - Terminal height in rows
 * @returns {Object} All layout dimensions
 */
export function getLayoutDimensions(displayWidth, displayHeight) {
  const isMobile = isMobileWidth(displayWidth);

  // Check settings for what to show
  // Scene setting controls both header and footer together
  const sceneEnabled = settings.scene.get();
  const showHeader = sceneEnabled;
  const showFooter = sceneEnabled;

  // Status bar (breadcrumbs) always shows - only sky scene is optional
  // Toast renders at row 2 (header gap), so gap must be consistent
  const headerLines = isMobile ? HEADER_LINES_MOBILE : HEADER_LINES_DESKTOP;
  const headerGapLines = showHeader ? (isMobile ? HEADER_GAP_LINES_MOBILE : HEADER_GAP_LINES_DESKTOP) : 0;
  const skyLines = showHeader ? (isMobile ? SKY_LINES_MOBILE : SKY_LINES_DESKTOP) : 0;
  const skyGapLines = showHeader ? (isMobile ? SKY_GAP_LINES_MOBILE : SKY_GAP_LINES_DESKTOP) : 0;
  const titleLines = TITLE_LINES;
  const shortcutsLines = SHORTCUTS_LINES;
  const footerLines = showFooter ? FOOTER_LINES : 0;

  const contentPadV = LAYOUT.content.top + LAYOUT.content.bottom;
  const contentPadH = LAYOUT.content.left + LAYOUT.content.right;

  const contentHeight = displayHeight - headerLines - headerGapLines - skyLines - skyGapLines - titleLines - shortcutsLines - footerLines - contentPadV;
  const contentWidth = displayWidth - (LAYOUT.padding * 2) - contentPadH;

  // Where content starts (for click calculations)
  const contentStartY = headerLines + headerGapLines + skyLines + skyGapLines + titleLines;

  return {
    // Mode
    isMobile,

    // Settings state
    showHeader,
    showFooter,

    // Fixed region heights
    headerLines,
    headerGapLines,
    skyLines,
    skyGapLines,
    titleLines,
    footerLines,

    // Content area
    contentWidth,
    contentHeight: Math.max(1, contentHeight),
    contentStartY,

    // Padding
    contentPadV,
    contentPadH,
    padding: LAYOUT.padding,
    contentPadLeft: LAYOUT.content.left,

    // Raw config (for inner width calculations)
    innerWidth: displayWidth - (LAYOUT.padding * 2),
  };
}

// Border character sets
export const borders = {
  single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│', lt: '├', rt: '┤' },
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║', lt: '╠', rt: '╣' },
  rounded: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│', lt: '├', rt: '┤' },
  heavy: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃', lt: '┣', rt: '┫' },
};
