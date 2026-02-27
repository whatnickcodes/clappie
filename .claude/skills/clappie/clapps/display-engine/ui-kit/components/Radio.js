// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  RADIO - Single-select option group                                       ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    Radio({ options: ['A', 'B', 'C'], value: 0, onChange: (i) => {} })     ║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    options  - Array of option labels (required)                           ║
// ║    value    - Index of selected option (default: 0)                       ║
// ║    onChange - Function called with new index when selection changes       ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { clappieError, clappieWarn } from '../errors.js';
import { ansi } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

export function Radio(opts = {}) {
  // Validate options
  if (!opts || typeof opts !== 'object') {
    clappieError('Radio', 'options object required',
      'Usage: Radio({ options: ["Light", "Dark", "Auto"], value: 0, onChange: (i) => {} })');
  }

  const { options, onChange } = opts;
  let { value = 0 } = opts;

  if (!options || !Array.isArray(options)) {
    clappieError('Radio', 'options array is required',
      'Usage: Radio({ options: ["Light", "Dark", "Auto"], onChange: (i) => {} })');
  }

  if (options.length === 0) {
    clappieError('Radio', 'options array cannot be empty',
      'Usage: Radio({ options: ["Light", "Dark", "Auto"], onChange: (i) => {} })');
  }

  if (typeof value !== 'number' || value < 0 || value >= options.length) {
    clappieWarn('Radio',
      `value should be valid index (0-${options.length - 1}), got ${value}. Defaulting to 0.`);
    value = 0;
  }

  if (!onChange) {
    clappieWarn('Radio',
      `Radio has no onChange - selection changes won't be captured`);
  }

  if (onChange && typeof onChange !== 'function') {
    clappieError('Radio', `onChange must be function, got ${typeof onChange}`,
      'Usage: Radio({ options: ["Light", "Dark", "Auto"], onChange: (i) => {} })');
  }

  // Color helpers
  const fg = (r, g, b) => ansi.fg.rgb(r, g, b);
  const reset = ansi.reset;

  const component = {
    type: 'radio',
    focusable: true,

    render(focused = false) {
      const c = colors();
      const coral = fg(...c.primary);
      const dim = fg(...c.textMuted);
      const blue = fg(...c.primaryFocused);
      const textColor = fg(...c.text);
      const parts = [];

      for (let i = 0; i < options.length; i++) {
        const isSelected = i === value;
        const label = options[i];

        let optionStr;
        if (isSelected) {
          // Selected: coral filled square, text in theme color
          optionStr = `${coral}■${reset} ${textColor}${label}${reset}`;
        } else {
          // Unselected: dim empty square and label
          optionStr = `${dim}□${reset} ${dim}${label}${reset}`;
        }

        // When focused, highlight the currently selected option with blue
        if (focused && isSelected) {
          optionStr = `${blue}■${reset} ${blue}${label}${reset}`;
        }

        parts.push(optionStr);
      }

      // Join options with spacing (3 spaces between)
      return [parts.join('   ')];
    },

    getWidth() {
      // Calculate total width: sum of all options + spacing
      // Each option: 2 (symbol + space) + label length
      // Spacing: 3 spaces between each option
      let width = 0;
      for (let i = 0; i < options.length; i++) {
        width += 2 + options[i].length; // "■ " or "□ " + label
        if (i < options.length - 1) {
          width += 3; // spacing between options
        }
      }
      return width;
    },

    onKey(key) {
      if (key === 'LEFT') {
        // Move selection left (wrap around)
        const newValue = value === 0 ? options.length - 1 : value - 1;
        value = newValue;
        if (onChange) onChange(value);
        return true;
      }

      if (key === 'RIGHT') {
        // Move selection right (wrap around)
        const newValue = value === options.length - 1 ? 0 : value + 1;
        value = newValue;
        if (onChange) onChange(value);
        return true;
      }

      if (key === 'ENTER' || key === ' ') {
        // Confirm current selection (no change, but could trigger callback)
        if (onChange) onChange(value);
        return true;
      }

      return false;
    },

    onClick() {
      // Cycle to next option on click
      const newValue = value === options.length - 1 ? 0 : value + 1;
      value = newValue;
      if (onChange) onChange(value);
    },

    getValue() {
      return value;
    },

    setValue(v) {
      if (typeof v !== 'number') {
        clappieWarn('Radio.setValue', `expected number, got ${typeof v}`);
        v = parseInt(v, 10) || 0;
      }
      if (v < 0 || v >= options.length) {
        clappieWarn('Radio.setValue', `index out of range (0-${options.length - 1}), got ${v}`);
        v = Math.max(0, Math.min(v, options.length - 1));
      }
      value = v;
    },

    // Helper to get selected option label
    getSelectedOption() {
      return options[value];
    }
  };

  return component;
}
