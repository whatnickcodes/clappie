// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  BUTTON - Clickable action                                                ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    Button({ label: 'Save', shortcut: 'S', onPress: () => doSomething() }) ║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    label    - Text shown on button (required)                             ║
// ║    shortcut - Keyboard shortcut key, e.g. 'S' (optional)                  ║
// ║    onPress  - Function called on click/Enter/shortcut (required)          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { clappieError, clappieWarn } from '../errors.js';
import { ansi } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

export function Button(opts = {}) {
  // Validate options
  if (!opts || typeof opts !== 'object') {
    clappieError('Button', 'options object required',
      'Usage: Button({ label: "Save", shortcut: "S", onPress: () => {} })');
  }

  const { label, shortcut, onPress } = opts;

  if (!label) {
    clappieError('Button', 'label is required',
      'Usage: Button({ label: "Save", onPress: () => {} })');
  }

  if (typeof label !== 'string') {
    clappieError('Button', `label must be string, got ${typeof label}`,
      'Usage: Button({ label: "Save", onPress: () => {} })');
  }

  if (!onPress) {
    clappieWarn('Button',
      `Button "${label}" has no onPress - clicking will do nothing`);
  }

  if (onPress && typeof onPress !== 'function') {
    clappieError('Button', `onPress must be function, got ${typeof onPress}`,
      'Usage: Button({ label: "Save", onPress: () => {} })');
  }

  return {
    type: 'button',
    focusable: true,
    label,
    shortcut,
    onPress,

    render(focused = false) {
      const reset = ansi.reset;
      const c = colors();
      const focusColor = ansi.fg.rgb(...c.primaryFocused);
      const mutedColor = ansi.fg.rgb(...c.textMuted);
      const textColor = ansi.fg.rgb(...c.text);
      if (focused) {
        // Focused: inverse pill
        return [`${focusColor}${ansi.inverse} ${label} ${reset}`];
      }
      // Normal: subtle brackets
      return [`${mutedColor}[${reset}${textColor} ${label} ${mutedColor}]${reset}`];
    },

    getWidth() {
      return label.length + 4; // "[ " + label + " ]"
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
