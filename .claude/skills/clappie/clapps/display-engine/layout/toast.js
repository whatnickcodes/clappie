// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  TOAST - Temporary notification overlay system                            ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { ansi, visualWidth } from './ansi.js';
import { getCrabColor } from '../graphics/crab-garden.js';

// Toast state
let toastMessage = null;
let toastTimeout = null;
let renderCallback = null;

/**
 * Set the render callback - called when toast state changes.
 * This should be set by the renderer on init.
 */
export function setToastRenderCallback(callback) {
  renderCallback = callback;
}

/**
 * Show a toast notification.
 * @param {string} message - The message to display
 * @param {number} duration - How long to show (ms), default 2000
 */
export function showToast(message, duration = 2000) {
  toastMessage = message;

  if (toastTimeout) clearTimeout(toastTimeout);

  if (renderCallback) renderCallback();

  toastTimeout = setTimeout(() => {
    toastMessage = null;
    if (renderCallback) renderCallback();
  }, duration);
}

/**
 * Get current toast message (or null if none).
 */
export function getToastMessage() {
  return toastMessage;
}

/**
 * Apply toast overlay to output lines.
 * Renders on row 0 (above breadcrumb) with coral background.
 * @param {string[]} output - The rendered output lines
 * @param {number} displayWidth - Full terminal width
 */
export function applyToastOverlay(output, displayWidth) {
  if (!toastMessage) return;
  if (output.length === 0) return;

  const crab = getCrabColor();
  const bg = ansi.bg.rgb(...crab);
  const fg = ansi.fg.rgb(255, 255, 255);
  const reset = ansi.reset;

  const msg = ` ${toastMessage} `;
  const msgWidth = visualWidth(msg);
  const pad = Math.max(0, Math.floor((displayWidth - msgWidth) / 2));

  // Row 2 = right below the breadcrumb bar (row 0 = empty, row 1 = breadcrumbs)
  const toastRow = 2;
  if (toastRow < output.length) {
    output[toastRow] = ' '.repeat(pad) + bg + fg + msg + reset;
  }
}

/**
 * Clear any active toast.
 */
export function clearToast() {
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }
  toastMessage = null;
}
