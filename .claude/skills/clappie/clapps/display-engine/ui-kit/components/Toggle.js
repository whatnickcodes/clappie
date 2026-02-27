// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  TOGGLE - On/off switch                                                   ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    Toggle({ label: 'Dark', shortcut: 'D', value: false, onChange: (v)=>{} })║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    label    - Text shown next to toggle (optional)                        ║
// ║    shortcut - Keyboard shortcut key, e.g. 'D' (optional)                  ║
// ║    value    - Initial state true/false (default: false)                   ║
// ║    onChange - Function called with new value when toggled                 ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { clappieError, clappieWarn } from '../errors.js';
import { ansi } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

export function Toggle(opts = {}) {
  // Validate options
  if (!opts || typeof opts !== 'object') {
    clappieError('Toggle', 'options object required',
      'Usage: Toggle({ label: "Dark", shortcut: "D", onChange: (v) => {} })');
  }

  let { label = '', shortcut, value = false, onChange } = opts;

  if (label && typeof label !== 'string') {
    clappieError('Toggle', `label must be string, got ${typeof label}`,
      'Usage: Toggle({ label: "Dark Mode", onChange: (v) => {} })');
  }

  if (typeof value !== 'boolean') {
    clappieWarn('Toggle',
      `value should be boolean, got ${typeof value}. Converting to boolean.`);
    value = Boolean(value);
  }

  if (!onChange) {
    clappieWarn('Toggle',
      `Toggle "${label || '(no label)'}" has no onChange - state changes won't be captured`);
  }

  if (onChange && typeof onChange !== 'function') {
    clappieError('Toggle', `onChange must be function, got ${typeof onChange}`,
      'Usage: Toggle({ label: "Dark Mode", onChange: (v) => {} })');
  }

  const component = {
    type: 'toggle',
    focusable: true,
    label,
    shortcut,

    render(focused = false) {
      const reset = ansi.reset;
      const fg = (r, g, b) => ansi.fg.rgb(r, g, b);
      const c = colors();
      const coral = fg(...c.primary);
      const dim = fg(...c.textMuted);
      const blue = fg(...c.primaryFocused);
      const textColor = fg(...c.text);

      // OFF: □━━━━ OFF (square on left, track extends right)
      // ON:  ━━━━■ ON  (track extends left, square on right)
      let switchPart;
      let statusText;

      if (value) {
        // ON state: ━━━━■ ON
        if (focused) {
          switchPart = `${blue}━━━━■${reset}`;
          statusText = `${coral} ON${reset}`;
        } else {
          switchPart = `${coral}━━━━■${reset}`;
          statusText = `${coral} ON${reset}`;
        }
      } else {
        // OFF state: □━━━━ OFF
        if (focused) {
          switchPart = `${blue}□━━━━${reset}`;
          statusText = `${dim} OFF${reset}`;
        } else {
          switchPart = `${dim}□━━━━${reset}`;
          statusText = `${dim} OFF${reset}`;
        }
      }

      const fullSwitch = switchPart + statusText;
      const text = label ? `${textColor}${label}${reset}  ${fullSwitch}` : fullSwitch;

      if (focused && label) {
        // Highlight label when focused
        const labelPart = `${blue}${ansi.inverse} ${label} ${reset}`;
        return [labelPart + '  ' + fullSwitch];
      }
      return [text];
    },

    getWidth() {
      // label + "  " + "□━━━━ OFF" (9 chars for switch + status)
      return (label ? label.length + 2 : 0) + 9;
    },

    toggle() {
      value = !value;
      if (onChange) onChange(value);
    },

    onKey(key) {
      if (key === 'ENTER' || key === ' ' || key === 'LEFT' || key === 'RIGHT') {
        this.toggle();
        return true;
      }
      return false;
    },

    onClick() {
      this.toggle();
    },

    getValue() {
      return value;
    },

    setValue(v) {
      if (typeof v !== 'boolean') {
        clappieWarn('Toggle.setValue', `expected boolean, got ${typeof v}`);
        v = Boolean(v);
      }
      value = v;
    }
  };

  return component;
}
