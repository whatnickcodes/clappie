// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  LABEL - Plain text display (optionally clickable)                        ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    Label({ text: 'Hello world' })                                         ║
// ║    Label({ text: 'Click me', onClick: () => {} })                         ║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    text    - Label text (required)                                        ║
// ║    bullet  - Show ▸ bullet prefix (default: false)                        ║
// ║    dim     - Dim the text (default: false)                                ║
// ║    onClick - Click handler (makes label focusable)                        ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { clappieError } from '../errors.js';
import { ansi, visualWidth, stripAnsi } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

export function Label(opts = {}) {
  // Validate options
  if (!opts || typeof opts !== 'object') {
    clappieError('Label', 'options object required',
      'Usage: Label({ text: "Email" })');
  }

  const { text, bullet = false, dim = false, onClick } = opts;

  if (!text && text !== '') {
    clappieError('Label', 'text is required',
      'Usage: Label({ text: "Email" })');
  }

  if (typeof text !== 'string') {
    clappieError('Label', `text must be string, got ${typeof text}`,
      'Usage: Label({ text: "Email" })');
  }

  // Colors
  const fg = (r, g, b) => ansi.fg.rgb(r, g, b);
  const reset = ansi.reset;

  return {
    type: 'label',
    focusable: !!onClick,
    text,
    onClick,

    render(focused) {
      const c = colors();
      const textColor = dim ? fg(...c.textMuted) : fg(...c.text);
      const prefix = bullet ? '▸ ' : '';

      // Highlight on focus if clickable
      if (focused && onClick) {
        const accentColor = fg(...c.primary);
        return [`${accentColor}${prefix}${text}${reset}`];
      }

      return [`${textColor}${prefix}${text}${reset}`];
    },

    getWidth() {
      const prefix = bullet ? 2 : 0;
      return prefix + visualWidth(stripAnsi(text));
    },

    onKey(key) {
      if ((key === 'ENTER' || key === ' ') && onClick) {
        onClick();
        return true;
      }
      return false;
    }
  };
}
