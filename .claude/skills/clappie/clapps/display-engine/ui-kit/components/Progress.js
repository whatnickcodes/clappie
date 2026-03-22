// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  PROGRESS - Progress bar indicator                                        ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    Progress({ value: 50, width: 24 })                                     ║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    value - Percentage 0-100 (default: 0)                                  ║
// ║    width - Total bar width in characters (default: 24)                    ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { clappieWarn } from '../errors.js';
import { ansi } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

export function Progress(opts = {}) {
  let { value = 0, width = 24 } = opts;

  // Validate and clamp value
  if (typeof value !== 'number') {
    clappieWarn('Progress', `value should be number, got ${typeof value}. Converting to number.`);
    value = Number(value) || 0;
  }
  value = Math.max(0, Math.min(100, value));

  // Validate width
  if (typeof width !== 'number' || width < 1) {
    clappieWarn('Progress', `width should be positive number, got ${width}. Using default 24.`);
    width = 24;
  }

  // Colors
  const fg = (r, g, b) => ansi.fg.rgb(r, g, b);
  const reset = ansi.reset;

  return {
    type: 'progress',
    focusable: false,

    render(focused = false) {
      const c = colors();
      const coral = fg(...c.primary);
      const dim = fg(...c.textMuted);
      const textColor = fg(...c.text);

      // Calculate filled vs empty portions
      const filledCount = Math.round((value / 100) * width);
      const emptyCount = width - filledCount;

      // Build the bar
      const filledPart = coral + '█'.repeat(filledCount) + reset;
      const emptyPart = dim + '░'.repeat(emptyCount) + reset;
      const percentText = textColor + ` ${Math.round(value)}%` + reset;

      return [filledPart + emptyPart + percentText];
    },

    getWidth() {
      // Bar width + space + percentage (up to " 100%")
      return width + 5;
    },

    getValue() {
      return value;
    },

    setValue(v) {
      if (typeof v !== 'number') {
        clappieWarn('Progress.setValue', `expected number, got ${typeof v}`);
        v = Number(v) || 0;
      }
      value = Math.max(0, Math.min(100, v));
    }
  };
}
