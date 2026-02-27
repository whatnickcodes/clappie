// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  POINTER - Mouse parsing, click grid, and pointer event handling          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { getLayoutDimensions } from '../layout/dimensions.js';

// Click grid: 2D array mapping screen coords to handlers
// clickGrid[row][col] = { handler, component }
let clickGrid = [];

/**
 * Clear the click grid (call before re-rendering).
 */
export function clearClickGrid() {
  clickGrid = [];
}

/**
 * Get the click grid (for direct access if needed).
 */
export function getClickGrid() {
  return clickGrid;
}

/**
 * Paint a click region into the grid.
 * @param {number} lineOffset - Line offset within content area
 * @param {number} colStart - Starting column
 * @param {number} colEnd - Ending column (exclusive)
 * @param {Function} handler - Click handler
 * @param {*} component - Optional component reference
 * @param {Object} options - displayWidth, displayHeight, scrollOffset, layout, maxWidth, totalContentLines
 */
export function paintClick(lineOffset, colStart, colEnd, handler, component, options) {
  const { displayWidth, displayHeight, scrollOffset = 0, layout = 'centered', maxWidth = 60, totalContentLines = 0 } = options;
  const dims = getLayoutDimensions(displayWidth, displayHeight);

  // Calculate horizontal centering offset (same formula as renderer.js)
  let centerOffset = 0;
  if (layout === 'centered') {
    const availableWidth = dims.innerWidth - dims.contentPadLeft;
    const effectiveMaxWidth = Math.min(maxWidth, availableWidth);
    centerOffset = Math.max(0, Math.floor((availableWidth - effectiveMaxWidth) / 2));
  }

  // Calculate vertical centering offset (only if content fits in viewport)
  let verticalOffset = 0;
  if (layout === 'centered' && totalContentLines > 0 && totalContentLines < dims.contentHeight) {
    verticalOffset = Math.floor((dims.contentHeight - totalContentLines) / 2);
  }

  // Convert content-relative line to absolute screen row (account for vertical centering)
  const screenRow = dims.contentStartY + lineOffset + verticalOffset - scrollOffset;

  // Bounds check
  if (screenRow < 0 || screenRow >= displayHeight) return;

  // Paint each column in the range (account for padding + horizontal centering)
  const xOffset = dims.padding + dims.contentPadLeft + centerOffset;
  for (let col = colStart + xOffset; col < colEnd + xOffset; col++) {
    if (!clickGrid[screenRow]) clickGrid[screenRow] = [];
    // Store the relative column so handlers can know WHERE in the component was clicked
    const relativeCol = col - xOffset;
    clickGrid[screenRow][col] = { handler, component, relativeCol, lineOffset };
  }
}

/**
 * Register a click handler at absolute screen coordinates.
 * @param {number} row - Screen row (0-based)
 * @param {number} colStart - Starting column
 * @param {number} colEnd - Ending column (exclusive)
 * @param {Function} handler - Click handler
 * @param {*} component - Optional component reference
 */
export function registerClickZone(row, colStart, colEnd, handler, component = null) {
  for (let col = colStart; col < colEnd; col++) {
    if (!clickGrid[row]) clickGrid[row] = [];
    clickGrid[row][col] = { handler, component };
  }
}

/**
 * Parse mouse input from raw buffer.
 * Supports SGR, urxvt, and legacy X10/X11 modes.
 * @param {Buffer} buf - Raw input
 * @returns {Object|null} { button, x, y, pressed } or null
 */
export function parseMouse(buf) {
  const str = buf.toString();

  // Try SGR extended format: ESC[<btn;x;y[M|m]
  const sgrMatch = str.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
  if (sgrMatch) {
    const [, button, x, y, type] = sgrMatch;
    const btn = parseInt(button);

    // Button codes 32-63 are motion events (hover), not clicks - ignore them
    // 32 = motion no button, 33 = motion + left, 34 = motion + middle, etc.
    if (btn >= 32 && btn < 64) {
      return null;  // Ignore hover/motion
    }

    return {
      button: btn,
      x: parseInt(x),
      y: parseInt(y),
      pressed: type === 'M',
    };
  }

  // Try urxvt format: ESC[btn;x;yM (like SGR but no < prefix and always M)
  const urxvtMatch = str.match(/\x1b\[(\d+);(\d+);(\d+)M/);
  if (urxvtMatch) {
    const [, button, x, y] = urxvtMatch;
    const btn = parseInt(button);
    // urxvt uses 32+ encoding like X10: subtract 32 from button
    return {
      button: btn >= 32 ? btn - 32 : btn,
      x: parseInt(x),
      y: parseInt(y),
      pressed: true,
    };
  }

  // Try legacy X10/X11 format: ESC[M followed by 3 bytes (button, x+32, y+32)
  const x10Index = str.indexOf('\x1b[M');
  if (x10Index !== -1 && buf.length >= x10Index + 6) {
    const btnByte = buf[x10Index + 3];
    const xByte = buf[x10Index + 4];
    const yByte = buf[x10Index + 5];

    // X10 encodes coordinates as byte value - 32 (so 33 = column 1)
    const x = xByte - 32;
    const y = yByte - 32;

    // Button byte: bits 0-1 = button (0=left, 1=middle, 2=right, 3=release)
    // bit 6 = scroll up, bit 7 = scroll down
    const buttonBits = btnByte - 32;
    const button = buttonBits & 0x03;
    const isScroll = (buttonBits & 0x40) !== 0;

    if (isScroll) {
      // Scroll: button 0 = up (64), button 1 = down (65) in SGR terms
      return {
        button: button === 0 ? 64 : 65,
        x,
        y,
        pressed: true,
      };
    }

    // Regular click: button 3 means release in X10
    return {
      button,
      x,
      y,
      pressed: button !== 3,
    };
  }

  return null;
}

/**
 * Handle a click at screen coordinates.
 * @param {number} x - X coordinate (1-based from terminal)
 * @param {number} y - Y coordinate (1-based from terminal)
 * @param {Function} fallbackHandler - Called if no grid match (receives x0, y0)
 * @returns {Promise<boolean>} True if click was handled
 */
export async function handleClick(x, y, fallbackHandler = null) {
  const x0 = x - 1;  // Terminal coords are 1-based
  const y0 = y - 1;

  // Check click grid (O(1) lookup)
  if (clickGrid[y0] && clickGrid[y0][x0]) {
    const cell = clickGrid[y0][x0];
    if (cell.handler) {
      // Pass click position: relativeCol (x within component), lineOffset (y within component)
      await cell.handler(cell.relativeCol, cell.lineOffset);
      return true;
    }
  }

  // Fallback handler
  if (fallbackHandler) {
    await fallbackHandler(x0, y0);
  }

  return false;
}

/**
 * Handle scroll wheel input.
 * @param {number} direction - -1 for up, 1 for down
 * @param {Object} currentView - Current view object with scrollOffset and renderedLines
 * @param {number} displayWidth - Current display width
 * @param {number} displayHeight - Current display height
 * @param {Function} onScroll - Callback after scroll updates
 * @returns {boolean} True if scroll was handled
 */
export function handleScroll(direction, currentView, displayWidth, displayHeight, onScroll) {
  if (!currentView) return false;

  const dims = getLayoutDimensions(displayWidth, displayHeight);
  const contentLines = dims.contentHeight;

  const totalContentLines = (currentView.renderedLines || []).length;
  const maxScroll = Math.max(0, totalContentLines - contentLines);

  // Update scroll offset (direction: -1 = up, 1 = down)
  const oldOffset = currentView.scrollOffset || 0;
  currentView.scrollOffset = Math.max(0, Math.min(maxScroll, oldOffset + direction * 3));

  if (onScroll) onScroll();

  return true;
}
