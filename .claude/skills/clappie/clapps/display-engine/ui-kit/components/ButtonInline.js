// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  BUTTON INLINE - Underlined text button                                   ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    ButtonInline({ label: 'Yes', onPress: () => {} })                      ║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    label   - Text shown on button (required)                              ║
// ║    onPress - Function called on click/Enter/Space (required)              ║
// ║                                                                           ║
// ║  Visual (2 lines):                                                        ║
// ║    Yes   No   Cancel     <- text, active one in coral                     ║
// ║    ━━━                   <- underline only under active option (coral)    ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { clappieError, clappieWarn } from '../errors.js';
import { ansi } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

// Color helpers
const fg = (r, g, b) => ansi.fg.rgb(r, g, b);
const reset = ansi.reset;

export function ButtonInline(opts = {}) {
  // Validate options
  if (!opts || typeof opts !== 'object') {
    clappieError('ButtonInline', 'options object required',
      'Usage: ButtonInline({ label: "Yes", onPress: () => {} })');
  }

  const { label, onPress, shortcut } = opts;

  if (!label) {
    clappieError('ButtonInline', 'label is required',
      'Usage: ButtonInline({ label: "Yes", onPress: () => {} })');
  }

  if (typeof label !== 'string') {
    clappieError('ButtonInline', `label must be string, got ${typeof label}`,
      'Usage: ButtonInline({ label: "Yes", onPress: () => {} })');
  }

  if (!onPress) {
    clappieWarn('ButtonInline',
      `ButtonInline "${label}" has no onPress - clicking will do nothing`);
  }

  if (onPress && typeof onPress !== 'function') {
    clappieError('ButtonInline', `onPress must be function, got ${typeof onPress}`,
      'Usage: ButtonInline({ label: "Yes", onPress: () => {} })');
  }

  return {
    type: 'button-inline',
    focusable: true,
    label,
    shortcut,
    onPress,

    render(focused = false) {
      // Line 1: label text (coral if focused, normal otherwise)
      // Line 2: underline ━━━ matching label width (coral if focused, dim otherwise)
      const c = colors();
      const coral = fg(...c.primary);
      const dim = fg(...c.textMuted);
      const textColor = fg(...c.text);
      const underline = '━'.repeat(label.length);

      if (focused) {
        return [
          `${coral}${label}${reset}`,
          `${coral}${underline}${reset}`
        ];
      }

      return [
        `${textColor}${label}${reset}`,
        `${dim}${underline}${reset}`
      ];
    },

    getWidth() {
      return label.length;
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
