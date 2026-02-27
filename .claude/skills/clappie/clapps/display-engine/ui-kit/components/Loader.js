// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  LOADER - Animated loading indicator                                      ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    const loader = Loader({ message: 'Loading' });                         ║
// ║    setInterval(() => { loader.tick(); rerender(); }, 100);                ║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    message - Text before the animation (default: 'Loading')               ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { ansi } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

// Animation characters
const FRAMES = ['#', '@', '*', '%', '!', '&'];

// Colors
const fg = (r, g, b) => ansi.fg.rgb(r, g, b);
const reset = ansi.reset;

export function Loader(opts = {}) {
  const message = opts.message ?? 'Loading';

  // Animation state
  let frameIndex = 0;

  return {
    type: 'loader',
    focusable: false,

    render(focused = false) {
      const c = colors();
      const coral = fg(...c.primary);
      const textColor = fg(...c.text);
      const char = FRAMES[frameIndex];
      // Format: "Loading [#]" with message in text color and symbol in coral
      return [`${textColor}${message}${reset} ${coral}[${char}]${reset}`];
    },

    getWidth() {
      // "message" + " " + "[X]"
      return message.length + 1 + 3;
    },

    tick() {
      // Advance to next frame, cycling back to start
      frameIndex = (frameIndex + 1) % FRAMES.length;
    },

    reset() {
      // Reset animation to start
      frameIndex = 0;
    }
  };
}
