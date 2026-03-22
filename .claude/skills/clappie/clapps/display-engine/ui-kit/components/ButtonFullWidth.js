// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  BUTTON FULL WIDTH - Block button that spans container width              ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    ButtonFullWidth({ label: 'Submit', onPress: () => {} })                ║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    label    - Text shown on button (required)                             ║
// ║    shortcut - Keyboard shortcut key, e.g. 'S' (optional)                  ║
// ║    onPress  - Function called on click/Enter/shortcut (required)          ║
// ║    variant  - 'filled' (default) or 'ghost'                               ║
// ║                                                                           ║
// ║  Visual (3-line button spanning full container width):                    ║
// ║    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓                   ║
// ║    ┃                    SUBMIT                        ┃                   ║
// ║    ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛                   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { clappieError, clappieWarn } from '../errors.js';
import { ansi } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

export function ButtonFullWidth(opts = {}) {
  // Validate options
  if (!opts || typeof opts !== 'object') {
    clappieError('ButtonFullWidth', 'options object required',
      'Usage: ButtonFullWidth({ label: "Submit", onPress: () => {} })');
  }

  const { label, shortcut, onPress, variant = 'filled' } = opts;

  if (!label) {
    clappieError('ButtonFullWidth', 'label is required',
      'Usage: ButtonFullWidth({ label: "Submit", onPress: () => {} })');
  }

  if (typeof label !== 'string') {
    clappieError('ButtonFullWidth', `label must be string, got ${typeof label}`,
      'Usage: ButtonFullWidth({ label: "Submit", onPress: () => {} })');
  }

  if (!onPress) {
    clappieWarn('ButtonFullWidth',
      `ButtonFullWidth "${label}" has no onPress - clicking will do nothing`);
  }

  if (onPress && typeof onPress !== 'function') {
    clappieError('ButtonFullWidth', `onPress must be function, got ${typeof onPress}`,
      'Usage: ButtonFullWidth({ label: "Submit", onPress: () => {} })');
  }

  // Container width will be set by View when component is added
  let containerWidth = 50;

  return {
    type: 'button-full-width',
    focusable: true,
    label,
    shortcut,
    onPress,

    // Called by View to set container width
    set _containerWidth(w) { containerWidth = w; },
    get _containerWidth() { return containerWidth; },

    render(focused = false) {
      const reset = ansi.reset;
      const fg = ansi.fg.rgb;
      const bg = ansi.bg.rgb;
      const c = colors();

      // Use full container width minus 2 for borders
      const innerWidth = Math.max(10, containerWidth - 2);

      // Center the label
      const labelLen = label.length;
      const leftPad = Math.floor((innerWidth - labelLen) / 2);
      const rightPad = innerWidth - labelLen - leftPad;
      const centeredLabel = ' '.repeat(leftPad) + label + ' '.repeat(rightPad);

      // Build horizontal bar
      const bar = '━'.repeat(innerWidth);

      if (variant === 'ghost') {
        // Ghost variant - outlined
        const [r, g, b] = focused ? c.primaryFocused : c.primary;
        const borderColor = fg(r, g, b);
        const textColor = fg(...c.text);

        const top = `${borderColor}┏${bar}┓${reset}`;
        const middle = `${borderColor}┃${reset}${textColor}${centeredLabel}${reset}${borderColor}┃${reset}`;
        const bottom = `${borderColor}┗${bar}┛${reset}`;

        return [top, middle, bottom];
      }

      // Filled variant (default)
      const [br, bg_g, bb] = focused ? c.primaryFocused : c.primary;
      const bgColor = bg(br, bg_g, bb);
      const textColor = fg(255, 255, 255); // White text on colored bg

      const top = `${bgColor} ${' '.repeat(innerWidth)} ${reset}`;
      const middle = `${bgColor} ${textColor}${centeredLabel}${reset}${bgColor} ${reset}`;
      const bottom = `${bgColor} ${' '.repeat(innerWidth)} ${reset}`;

      return [top, middle, bottom];
    },

    getWidth() {
      return containerWidth;
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
