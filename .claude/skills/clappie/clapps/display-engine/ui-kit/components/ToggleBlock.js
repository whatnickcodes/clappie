// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  TOGGLE BLOCK - Full-width side-by-side filled/ghost toggle              ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    ToggleBlock({ options: ['ON', 'OFF'], value: 0, onChange: (i) => {} }) ║
// ║    ToggleBlock({ options: ['S', 'M', 'L'], value: 1, onChange: (i) => {} })║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    options  - Array of 2-3 labels (required)                              ║
// ║    value    - Selected index (default: 0)                                 ║
// ║    onChange - Function called with new index when changed                 ║
// ║    width    - Total width or 'full' (default: 'full')                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { clappieError, clappieWarn } from '../errors.js';
import { ansi } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

export function ToggleBlock(opts = {}) {
  if (!opts || typeof opts !== 'object') {
    clappieError('ToggleBlock', 'options object required',
      'Usage: ToggleBlock({ options: ["ON", "OFF"], onChange: (i) => {} })');
  }

  const { options, onChange, width = 'full' } = opts;
  let { value = 0 } = opts;

  if (!options || !Array.isArray(options) || options.length < 2 || options.length > 3) {
    clappieError('ToggleBlock', 'options must be array of 2 or 3 strings',
      'Usage: ToggleBlock({ options: ["ON", "OFF"], onChange: (i) => {} })');
  }

  const numOptions = options.length;

  if (typeof value !== 'number' || value < 0 || value >= numOptions) {
    clappieWarn('ToggleBlock', `value should be 0-${numOptions - 1}, got ${value}. Using 0.`);
    value = 0;
  }

  if (onChange && typeof onChange !== 'function') {
    clappieError('ToggleBlock', `onChange must be function, got ${typeof onChange}`,
      'Usage: ToggleBlock({ options: ["ON", "OFF"], onChange: (i) => {} })');
  }

  const isFullWidth = width === 'full';

  const component = {
    type: 'toggle-block',
    focusable: true,
    _containerWidth: 40,

    render(focused = false) {
      const c = colors();
      const coral = ansi.fg.rgb(...c.primary);
      const coralBg = ansi.bg.rgb(...c.primary);
      const dark = ansi.fg.rgb(...c.textInverse);
      const text = ansi.fg.rgb(...c.text);
      const reset = ansi.reset;

      const totalWidth = isFullWidth ? (component._containerWidth || 40) : width;

      // Calculate segment widths
      const segmentWidth = Math.floor(totalWidth / numOptions);
      const widths = [];
      for (let i = 0; i < numOptions; i++) {
        if (i === numOptions - 1) {
          // Last segment gets remainder
          widths.push(totalWidth - segmentWidth * (numOptions - 1));
        } else {
          widths.push(segmentWidth);
        }
      }

      // Center text with arrows on both sides for selected
      const centerText = (label, innerWidth, selected) => {
        const content = selected ? `◀ ${label} ▶` : label;
        const padding = innerWidth - content.length;
        const leftPad = Math.floor(padding / 2);
        const rightPad = padding - leftPad;
        return ' '.repeat(Math.max(0, leftPad)) + content + ' '.repeat(Math.max(0, rightPad));
      };

      // Build filled segment (selected)
      const filledTop = (w) => `${coral}${'▄'.repeat(w)}${reset}`;
      const filledMid = (label, w) => {
        const inner = w - 2;
        const content = centerText(label, inner, true);
        return `${coral}█${coralBg}${dark}${content}${reset}${coral}█${reset}`;
      };
      const filledBot = (w) => `${coral}${'▀'.repeat(w)}${reset}`;

      // Build ghost segment (unselected)
      const ghostTop = (w) => {
        const inner = w - 2;
        return `${coral}┏${'━'.repeat(inner)}┓${reset}`;
      };
      const ghostMid = (label, w) => {
        const inner = w - 2;
        const content = centerText(label, inner, false);
        return `${coral}┃${reset}${text}${content}${reset}${coral}┃${reset}`;
      };
      const ghostBot = (w) => {
        const inner = w - 2;
        return `${coral}┗${'━'.repeat(inner)}┛${reset}`;
      };

      // Build each line by concatenating segments
      let topLine = '';
      let midLine = '';
      let botLine = '';

      for (let i = 0; i < numOptions; i++) {
        const w = widths[i];
        const label = options[i];
        const isSelected = i === value;

        if (isSelected) {
          topLine += filledTop(w);
          midLine += filledMid(label, w);
          botLine += filledBot(w);
        } else {
          topLine += ghostTop(w);
          midLine += ghostMid(label, w);
          botLine += ghostBot(w);
        }
      }

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

    toggle() {
      value = (value + 1) % numOptions;
      if (onChange) onChange(value);
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
      if (v < 0 || v >= numOptions) {
        clappieWarn('ToggleBlock.setValue', `expected 0-${numOptions - 1}, got ${v}`);
        v = 0;
      }
      value = v;
    }
  };

  return component;
}
