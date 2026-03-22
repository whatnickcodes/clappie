// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CHECKBOX - Toggleable check box                                          ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    Checkbox({ label: 'Agree', value: false, onChange: (v) => {} })        ║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    label    - Text shown next to checkbox (required)                      ║
// ║    value    - Initial state true/false (default: false)                   ║
// ║    onChange - Function called with new value when toggled                 ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { clappieError, clappieWarn } from '../errors.js';
import { ansi } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

export function Checkbox(opts = {}) {
  // Validate options
  if (!opts || typeof opts !== 'object') {
    clappieError('Checkbox', 'options object required',
      'Usage: Checkbox({ label: "Agree", value: false, onChange: (v) => {} })');
  }

  let { label, value = false, onChange } = opts;

  if (!label) {
    clappieError('Checkbox', 'label is required',
      'Usage: Checkbox({ label: "Agree", onChange: (v) => {} })');
  }

  if (typeof label !== 'string') {
    clappieError('Checkbox', `label must be string, got ${typeof label}`,
      'Usage: Checkbox({ label: "Agree", onChange: (v) => {} })');
  }

  if (typeof value !== 'boolean') {
    clappieWarn('Checkbox',
      `value should be boolean, got ${typeof value}. Converting to boolean.`);
    value = Boolean(value);
  }

  if (!onChange) {
    clappieWarn('Checkbox',
      `Checkbox "${label}" has no onChange - state changes won't be captured`);
  }

  if (onChange && typeof onChange !== 'function') {
    clappieError('Checkbox', `onChange must be function, got ${typeof onChange}`,
      'Usage: Checkbox({ label: "Agree", onChange: (v) => {} })');
  }

  const reset = ansi.reset;

  const component = {
    type: 'checkbox',
    focusable: true,
    label,

    render(focused = false) {
      // Get theme colors dynamically
      const c = colors();
      const coral = ansi.fg.rgb(...c.primary);
      const dim = ansi.fg.rgb(...c.textMuted);
      const blue = ansi.fg.rgb(...c.primaryFocused);
      const textColor = ansi.fg.rgb(...c.text);

      // Checked: ■ in coral, Unchecked: □ in dim
      // When focused, use blue for the box
      let box, labelColor;
      if (value) {
        // Checked: coral box, theme text
        box = focused ? `${blue}■${reset}` : `${coral}■${reset}`;
        labelColor = focused ? blue : textColor;
      } else {
        // Unchecked: dim box and label
        box = focused ? `${blue}□${reset}` : `${dim}□${reset}`;
        labelColor = focused ? blue : dim;
      }

      return [`${box} ${labelColor}${label}${reset}`];
    },

    getWidth() {
      // "■ " (2 chars) + label
      return 2 + label.length;
    },

    toggle() {
      value = !value;
      if (onChange) onChange(value);
    },

    onKey(key) {
      if (key === 'ENTER' || key === ' ') {
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
        clappieWarn('Checkbox.setValue', `expected boolean, got ${typeof v}`);
        v = Boolean(v);
      }
      value = v;
    }
  };

  return component;
}
