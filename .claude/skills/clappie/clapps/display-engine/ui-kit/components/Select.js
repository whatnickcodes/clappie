// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  SELECT - Arrow-based option selector                                     ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    Select({ options: ['Small', 'Medium', 'Large'], value: 1, onChange })  ║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    options  - Array of option strings (required)                          ║
// ║    value    - Index of selected option (default: 0)                       ║
// ║    onChange - Function called with new index when changed                 ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { clappieError, clappieWarn } from '../errors.js';
import { ansi } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

export function Select(opts = {}) {
  // Validate options
  if (!opts || typeof opts !== 'object') {
    clappieError('Select', 'options object required',
      'Usage: Select({ options: ["A", "B", "C"], onChange: (i) => {} })');
  }

  let { options, value = 0, onChange } = opts;

  if (!options || !Array.isArray(options)) {
    clappieError('Select', 'options array is required',
      'Usage: Select({ options: ["Small", "Medium", "Large"], onChange: (i) => {} })');
  }

  if (options.length === 0) {
    clappieError('Select', 'options array cannot be empty',
      'Provide at least one option: Select({ options: ["Option1"], onChange: (i) => {} })');
  }

  if (typeof value !== 'number' || value < 0 || value >= options.length) {
    clappieWarn('Select',
      `value ${value} is out of range [0-${options.length - 1}]. Defaulting to 0.`);
    value = 0;
  }

  if (!onChange) {
    clappieWarn('Select',
      'Select has no onChange - selection changes won\'t be captured');
  }

  if (onChange && typeof onChange !== 'function') {
    clappieError('Select', `onChange must be function, got ${typeof onChange}`,
      'Usage: Select({ options: ["A", "B", "C"], onChange: (i) => {} })');
  }

  // Colors
  const fg = (r, g, b) => ansi.fg.rgb(r, g, b);
  const reset = ansi.reset;

  // Find max option length for consistent width
  const maxLen = Math.max(...options.map(o => o.length));
  const padded = (str) => {
    const pad = maxLen - str.length;
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return ' '.repeat(left) + str + ' '.repeat(right);
  };

  const component = {
    type: 'select',
    focusable: true,

    render(focused = false) {
      const c = colors();
      const coral = fg(...c.primary);
      const blue = fg(...c.primaryFocused);
      const textColor = fg(...c.text);
      const current = options[value];
      const paddedOption = padded(current);
      const arrow = focused ? blue : coral;
      const text = focused ? `${blue}${paddedOption}${reset}` : `${textColor}${paddedOption}${reset}`;

      // Format: <  option  >
      return [`${arrow}<${reset}  ${text}  ${arrow}>${reset}`];
    },

    getWidth() {
      // < + 2 spaces + padded option + 2 spaces + >
      return 1 + 2 + maxLen + 2 + 1;
    },

    onKey(key) {
      if (key === 'LEFT') {
        value = (value - 1 + options.length) % options.length;
        if (onChange) onChange(value);
        return true;
      }
      if (key === 'RIGHT') {
        value = (value + 1) % options.length;
        if (onChange) onChange(value);
        return true;
      }
      // ENTER/SPACE could also cycle forward
      if (key === 'ENTER' || key === ' ') {
        value = (value + 1) % options.length;
        if (onChange) onChange(value);
        return true;
      }
      return false;
    },

    onClick() {
      // Click cycles to next option
      value = (value + 1) % options.length;
      if (onChange) onChange(value);
    },

    getValue() {
      return value;
    },

    setValue(v) {
      if (typeof v !== 'number' || v < 0 || v >= options.length) {
        clappieWarn('Select.setValue', `value ${v} out of range, ignoring`);
        return;
      }
      value = v;
    },

    getSelectedOption() {
      return options[value];
    }
  };

  return component;
}
