// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  SECTION HEADING - Decorative section header                              ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    SectionHeading({ text: 'SETTINGS' })                                   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { clappieError } from '../errors.js';
import { ansi } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

// Colors
const fg = (r, g, b) => ansi.fg.rgb(r, g, b);
const reset = ansi.reset;

export function SectionHeading(opts = {}) {
  // Validate options
  if (!opts || typeof opts !== 'object') {
    clappieError('SectionHeading', 'options object required',
      'Usage: SectionHeading({ text: "SETTINGS" })');
  }

  const { text } = opts;

  if (!text) {
    clappieError('SectionHeading', 'text is required',
      'Usage: SectionHeading({ text: "SETTINGS" })');
  }

  if (typeof text !== 'string') {
    clappieError('SectionHeading', `text must be string, got ${typeof text}`,
      'Usage: SectionHeading({ text: "SETTINGS" })');
  }

  return {
    type: 'section-heading',
    focusable: false,

    render(focused = false) {
      // Format: █ TEXT ─────────────
      const c = colors();
      const coral = fg(...c.primary);
      const textColor = fg(...c.text);
      const lineWidth = (this._containerWidth || 40) - text.length - 4;
      const line = '─'.repeat(Math.max(0, lineWidth));
      return [`${coral}█${reset} ${textColor}${text}${reset} ${coral}${line}${reset}`];
    },

    getWidth() {
      return this._containerWidth || 40;
    }
  };
}
