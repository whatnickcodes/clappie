// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  SELECT BLOCK - Full-width boxed selector                                 ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    SelectBlock({ options: ['S', 'M', 'L', 'XL'], value: 1, onChange })    ║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    options  - Array of labels (required)                                  ║
// ║    value    - Selected index (default: 0)                                 ║
// ║    onChange - Function called with new index when changed                 ║
// ║    width    - Total width or 'full' (default: 'full')                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { clappieError, clappieWarn } from '../errors.js';
import { ansi } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

export function SelectBlock(opts = {}) {
  if (!opts || typeof opts !== 'object') {
    clappieError('SelectBlock', 'options object required',
      'Usage: SelectBlock({ options: ["S", "M", "L", "XL"], onChange: (i) => {} })');
  }

  const { options, onChange, width = 'full' } = opts;
  let { value = 0 } = opts;

  if (!options || !Array.isArray(options) || options.length < 2) {
    clappieError('SelectBlock', 'options must be array of 2+ strings',
      'Usage: SelectBlock({ options: ["S", "M", "L", "XL"], onChange: (i) => {} })');
  }

  const numOptions = options.length;

  if (typeof value !== 'number' || value < 0 || value >= numOptions) {
    clappieWarn('SelectBlock', `value should be 0-${numOptions - 1}, got ${value}. Using 0.`);
    value = 0;
  }

  if (onChange && typeof onChange !== 'function') {
    clappieError('SelectBlock', `onChange must be function, got ${typeof onChange}`,
      'Usage: SelectBlock({ options: ["S", "M", "L", "XL"], onChange: (i) => {} })');
  }

  const isFullWidth = width === 'full';

  const component = {
    type: 'select-block',
    focusable: true,
    _containerWidth: 40,

    render(focused = false) {
      const c = colors();
      const coral = ansi.fg.rgb(...c.primary);
      const text = ansi.fg.rgb(...c.text);
      const reset = ansi.reset;

      const totalWidth = isFullWidth ? (component._containerWidth || 40) : width;
      const innerWidth = totalWidth - 2; // Account for border chars

      const label = options[value];

      // Center the label with orange arrows
      const arrowLeft = `${coral}◀${reset}`;
      const arrowRight = `${coral}▶${reset}`;
      const contentText = `  ${label}  `;
      const visualContent = `◀  ${label}  ▶`; // For padding calculation
      const padding = innerWidth - visualContent.length;
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      const centeredContent = ' '.repeat(Math.max(0, leftPad)) + arrowLeft + `${text}${contentText}${reset}` + arrowRight + ' '.repeat(Math.max(0, rightPad));

      // Simple box
      const topLine = `${coral}┏${'━'.repeat(innerWidth)}┓${reset}`;
      const midLine = `${coral}┃${reset}${text}${centeredContent}${reset}${coral}┃${reset}`;
      const botLine = `${coral}┗${'━'.repeat(innerWidth)}┛${reset}`;

      return [topLine, midLine, botLine];
    },

    getWidth() {
      return isFullWidth ? (component._containerWidth || 40) : width;
    },

    select(index) {
      if (index >= 0 && index < numOptions && value !== index) {
        value = index;
        if (onChange) onChange(value);
      }
    },

    onKey(key) {
      if (key === 'LEFT') {
        const newVal = (value - 1 + numOptions) % numOptions;
        this.select(newVal);
        return true;
      }
      if (key === 'RIGHT') {
        const newVal = (value + 1) % numOptions;
        this.select(newVal);
        return true;
      }
      if (key === 'ENTER' || key === ' ') {
        const newVal = (value + 1) % numOptions;
        this.select(newVal);
        return true;
      }
      return false;
    },

    onClick() {
      const newVal = (value + 1) % numOptions;
      this.select(newVal);
    },

    getValue() {
      return value;
    },

    setValue(v) {
      if (v < 0 || v >= numOptions) {
        clappieWarn('SelectBlock.setValue', `expected 0-${numOptions - 1}, got ${v}`);
        v = 0;
      }
      value = v;
    },

    getSelectedOption() {
      return options[value];
    }
  };

  return component;
}
