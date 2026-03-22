// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  BUTTON FILLED - Blocky filled button                                     ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    ButtonFilled({ label: 'Submit', onPress: () => {} })                   ║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    label    - Text shown on button (required)                             ║
// ║    shortcut - Keyboard shortcut key, e.g. 'S' (optional)                  ║
// ║    onPress  - Function called on click/Enter/shortcut (required)          ║
// ║                                                                           ║
// ║  Visual (3-line blocky button):                                           ║
// ║    ▄▄▄▄▄▄▄▄▄▄▄▄▄▄     <- top edge (coral foreground)                      ║
// ║    █  SUBMIT ▶  █     <- middle: coral edges, coral bg with dark text     ║
// ║    ▀▀▀▀▀▀▀▀▀▀▀▀▀▀     <- bottom edge (coral foreground)                   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { clappieError, clappieWarn } from '../errors.js';
import { ansi } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

export function ButtonFilled(opts = {}) {
  // Validate options
  if (!opts || typeof opts !== 'object') {
    clappieError('ButtonFilled', 'options object required',
      'Usage: ButtonFilled({ label: "Submit", onPress: () => {} })');
  }

  const { label, shortcut, onPress } = opts;

  if (!label) {
    clappieError('ButtonFilled', 'label is required',
      'Usage: ButtonFilled({ label: "Submit", onPress: () => {} })');
  }

  if (typeof label !== 'string') {
    clappieError('ButtonFilled', `label must be string, got ${typeof label}`,
      'Usage: ButtonFilled({ label: "Submit", onPress: () => {} })');
  }

  if (!onPress) {
    clappieWarn('ButtonFilled',
      `ButtonFilled "${label}" has no onPress - clicking will do nothing`);
  }

  if (onPress && typeof onPress !== 'function') {
    clappieError('ButtonFilled', `onPress must be function, got ${typeof onPress}`,
      'Usage: ButtonFilled({ label: "Submit", onPress: () => {} })');
  }

  // Helper functions for colors
  const fg = (r, g, b) => ansi.fg.rgb(r, g, b);
  const bg = (r, g, b) => ansi.bg.rgb(r, g, b);
  const reset = ansi.reset;

  // Calculate button dimensions
  // Inner content: "  LABEL ▶  " (2 spaces + label + space + arrow + 2 spaces)
  const innerContent = `  ${label} \u25B6  `;
  const innerWidth = innerContent.length;
  const totalWidth = innerWidth + 2; // +2 for edge █ characters

  return {
    type: 'button-filled',
    focusable: true,
    label,
    shortcut,
    onPress,

    render(focused = false) {
      const c = colors();
      const color = focused ? c.primaryFocused : c.primary;
      const [r, g, b] = color;
      const [dr, dg, db] = c.textInverse;

      // Top edge: ▄ repeated (coral/blue foreground)
      const topLine = fg(r, g, b) + '▄'.repeat(totalWidth) + reset;

      // Middle line: █ + coral bg with dark text + █
      const middleLine =
        fg(r, g, b) + '█' +                           // left edge
        bg(r, g, b) + fg(dr, dg, db) + innerContent + // content with coral bg, dark text
        reset + fg(r, g, b) + '█' +                   // right edge
        reset;

      // Bottom edge: ▀ repeated (coral/blue foreground)
      const bottomLine = fg(r, g, b) + '▀'.repeat(totalWidth) + reset;

      return [topLine, middleLine, bottomLine];
    },

    getWidth() {
      return totalWidth;
    },

    onKey(key) {
      if ((key === 'ENTER' || key === ' ') && onPress) {
        onPress();
        return true;
      }
      return false;
    },

    onClick() {
      if (onPress) onPress();
    }
  };
}
