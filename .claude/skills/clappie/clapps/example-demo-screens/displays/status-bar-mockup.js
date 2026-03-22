// Status Bar Mockup - Final breadcrumb
//
// Run: clappie display push example-demo-screens/status-bar-mockup

import { ui } from '../../display-engine/ui-kit/index.js';
import { ansi } from '../../display-engine/layout/ansi.js';

export function create(ctx) {
  ctx.setTitle('Breadcrumbs');
  ctx.setDescription('Final breadcrumb style');

  // Colors
  const coral = ansi.fg.rgb(217, 119, 87);
  const dim = ansi.fg.rgb(140, 135, 130);
  const reset = ansi.reset;

  // Lead text color (from sky-scene.js)
  const leadBlue = ansi.fg.rgb(135, 180, 220);

  function render() {
    const lines = [];

    lines.push('');
    lines.push(`${coral}   ========================================${reset}`);
    lines.push(`${coral}   ===     FINAL BREADCRUMB STYLE      ===${reset}`);
    lines.push(`${coral}   ========================================${reset}`);
    lines.push('');

    // Final style: dim previous, coral triangle, coral current
    lines.push(`${dim}   Style: Dim previous + coral arrow + coral current${reset}`);
    lines.push('');
    lines.push(`   ${dim}Home › Settings ${coral}▶ Theme${reset}`);
    lines.push('');

    lines.push(`${coral}   ========================================${reset}`);
    lines.push(`${coral}   ===        FULL STATUS BAR          ===${reset}`);
    lines.push(`${coral}   ========================================${reset}`);
    lines.push('');

    const mail = '\u{1F4ED}';
    const sun = '\u{1F31E}';
    const moon = '\u{1F31A}';
    const close = '\u274C';
    const toggleLight = `${leadBlue}\u2501\u2501\u2501${sun}${reset}`;
    const toggleDark = `${dim}\u2022\u2022\u2022${moon}${reset}`;

    // Single view
    lines.push(`${dim}   Single view:${reset}`);
    lines.push(`   ${coral}▶ Hello-world${reset}${''.padEnd(24)}${mail}   ${toggleLight}   ${close}`);
    lines.push('');

    // Two views deep
    lines.push(`${dim}   Two views deep:${reset}`);
    lines.push(`   ${dim}Hello-world ${coral}▶ Settings${reset}${''.padEnd(18)}${mail}   ${toggleLight}   ${close}`);
    lines.push('');

    // Three views deep
    lines.push(`${dim}   Three views deep:${reset}`);
    lines.push(`   ${dim}Hello-world › Settings ${coral}▶ Theme${reset}${''.padEnd(10)}${mail}   ${toggleLight}   ${close}`);
    lines.push('');

    // With notifications
    lines.push(`${dim}   With notifications:${reset}`);
    const mailFull = '\u{1F4EC}';
    lines.push(`   ${dim}Home › Settings ${coral}▶ Theme${reset}${''.padEnd(14)}${mailFull}${dim}\u00B3${reset}   ${toggleDark}   ${close}`);
    lines.push('');

    lines.push(`${coral}   ========================================${reset}`);
    lines.push('');
    lines.push(`${dim}   This is the one! Ready to implement?${reset}`);
    lines.push('');

    ctx.draw(lines);
  }

  return {
    init() {
      render();
    },
    render,
  };
}
