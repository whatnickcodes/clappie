// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  DIVIDER - Horizontal rule / separator                                    ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    Divider({ variant: 'thin', width: 40 })                                ║
// ║    Divider({ variant: 'big', width: 40 })                                 ║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    variant - 'thin' (default) or 'big'                                    ║
// ║    width   - Width in characters (default: 40)                            ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { ansi } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

export function Divider(opts = {}) {
  const { variant = 'thin', width = 'full' } = opts;
  const isFullWidth = width === 'full';

  // Color helpers
  const fg = (r, g, b) => ansi.fg.rgb(r, g, b);
  const reset = ansi.reset;

  // Character based on variant
  // Using widely-supported box drawing chars (╌ and ╍ don't render on many terminals)
  const isBig = variant === 'big';
  const char = isBig ? '━' : '─';  // Heavy vs light horizontal line

  const component = {
    type: 'divider',
    focusable: false,
    _containerWidth: 40,

    render(focused) {
      const c = colors();
      const coral = fg(...c.primary);
      const faded = fg(...c.divider);
      const color = isBig ? coral : faded;
      const effectiveWidth = isFullWidth ? (component._containerWidth || 40) : width;
      const line = char.repeat(effectiveWidth);
      return [`${color}${line}${reset}`];
    },

    getWidth() {
      return isFullWidth ? (component._containerWidth || 40) : width;
    }
  };

  return component;
}
