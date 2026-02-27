// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  BUTTON GHOST - Outlined button with thick border                         ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    ButtonGhost({ label: 'Cancel', onPress: () => {} })                    ║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    label    - Text shown on button (required)                             ║
// ║    shortcut - Keyboard shortcut key, e.g. 'C' (optional)                  ║
// ║    onPress  - Function called on click/Enter/shortcut (required)          ║
// ║                                                                           ║
// ║  Visual (3-line outlined button):                                         ║
// ║    ┏━━━━━━━━━━━━━━┓                                                       ║
// ║    ┃    CANCEL    ┃                                                       ║
// ║    ┗━━━━━━━━━━━━━━┛                                                       ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { clappieError, clappieWarn } from '../errors.js';
import { ansi } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

export function ButtonGhost(opts = {}) {
  // Validate options
  if (!opts || typeof opts !== 'object') {
    clappieError('ButtonGhost', 'options object required',
      'Usage: ButtonGhost({ label: "Cancel", onPress: () => {} })');
  }

  const { label, shortcut, onPress } = opts;

  if (!label) {
    clappieError('ButtonGhost', 'label is required',
      'Usage: ButtonGhost({ label: "Cancel", onPress: () => {} })');
  }

  if (typeof label !== 'string') {
    clappieError('ButtonGhost', `label must be string, got ${typeof label}`,
      'Usage: ButtonGhost({ label: "Cancel", onPress: () => {} })');
  }

  if (!onPress) {
    clappieWarn('ButtonGhost',
      `ButtonGhost "${label}" has no onPress - clicking will do nothing`);
  }

  if (onPress && typeof onPress !== 'function') {
    clappieError('ButtonGhost', `onPress must be function, got ${typeof onPress}`,
      'Usage: ButtonGhost({ label: "Cancel", onPress: () => {} })');
  }

  // Calculate dimensions
  // Padding: 4 spaces each side of label
  const padding = 4;
  const innerWidth = padding + label.length + padding;

  return {
    type: 'button-ghost',
    focusable: true,
    label,
    shortcut,
    onPress,

    render(focused = false) {
      const reset = ansi.reset;
      const fg = ansi.fg.rgb;
      const c = colors();

      // Choose border color based on focus state
      const [r, g, b] = focused ? c.primaryFocused : c.primary;
      const borderColor = fg(r, g, b);
      const textColor = fg(...c.text);

      // Build horizontal bar (━ repeated)
      const bar = '━'.repeat(innerWidth);

      // Build padded label (centered with spaces)
      const leftPad = ' '.repeat(padding);
      const rightPad = ' '.repeat(padding);
      const centeredLabel = leftPad + label + rightPad;

      // Three lines, all exactly the same visual width
      const top = `${borderColor}┏${bar}┓${reset}`;
      const middle = `${borderColor}┃${reset}${textColor}${centeredLabel}${reset}${borderColor}┃${reset}`;
      const bottom = `${borderColor}┗${bar}┛${reset}`;

      return [top, middle, bottom];
    },

    getWidth() {
      // Total width: ┏ + inner + ┓ = 2 + innerWidth
      const padding = 4;
      const innerWidth = padding + label.length + padding;
      return innerWidth + 2;
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
