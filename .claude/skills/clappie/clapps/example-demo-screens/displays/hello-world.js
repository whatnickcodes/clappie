// Hello World - The simplest possible Clappie view
//
// Run: clappie display push hello-world

import { ui } from '../../display-engine/ui-kit/index.js';
import { colors } from '../../display-engine/theme.js';
import { ansi } from '../../display-engine/layout/ansi.js';

export function create(ctx) {
  // Set the title (shown as ASCII art banner)
  ctx.setTitle('Hello');

  // Optional description (shown below title)
  ctx.setDescription('The simplest Clappie view');

  let partyMode = false;

  function render() {
    const c = colors();
    const text = ansi.fg.rgb(...c.text);
    const muted = ansi.fg.rgb(...c.textMuted);
    const accent = ansi.fg.rgb(...c.primary);
    const { reset } = ansi;

    const lines = [
      '',
      partyMode ? `   ${accent}🎉 PARTY MODE ACTIVATED! 🎉${reset}` : `   ${text}Hello, World!${reset}`,
      '',
      `   ${text}This is a minimal Clappie view.${reset}`,
      `   ${muted}Press ESC to close.${reset}`,
      `   ${muted}Press P to toggle party mode.${reset}`,
      '',
      `   ${muted}─── Scroll Test ───${reset}`,
      '',
    ];

    // Add lots of lines to test scrolling
    for (let i = 1; i <= 50; i++) {
      const emoji = partyMode ? ['🎈', '🎊', '✨', '🌟', '🎉'][i % 5] : '•';
      lines.push(`   ${muted}${emoji} Line ${i} - Scroll down to see more!${reset}`);
    }

    lines.push('');
    lines.push(`   ${muted}─── End of content ───${reset}`);
    lines.push('');

    ctx.draw(lines);
  }

  // Return the view interface
  return {
    init() {
      ui.registerShortcut('P', 'Party', () => {
        partyMode = !partyMode;
        render();
      });
      render();
    },
    render,
    onKey(key) {
      if (key === 'P' || key === 'p') {
        partyMode = !partyMode;
        ctx.toast(partyMode ? '🎉 Party mode ON!' : 'Party mode off');
        render();
        return true;
      }
      return false;
    },
  };
}
