// Input Component Demo - Single-line text input
//
// Run: clappie display push input

import { View, Input, Button } from '../../display-engine/ui-kit/index.js';

export function create(ctx) {
  ctx.setTitle('Input');
  ctx.setDescription('Single-line text input component');

  const view = new View(ctx);

  // ─────────────────────────────────────────────────────────────────────────
  // BASIC INPUT
  // ─────────────────────────────────────────────────────────────────────────

  const basicInput = Input({
    label: 'Basic',
    placeholder: 'Type here...',
    width: 20,
  });
  view.add(basicInput);

  // ─────────────────────────────────────────────────────────────────────────
  // INPUT WITH INITIAL VALUE
  // ─────────────────────────────────────────────────────────────────────────

  const prefilledInput = Input({
    label: 'Prefilled',
    value: 'Hello!',
    width: 20,
  });
  view.add(prefilledInput);

  // ─────────────────────────────────────────────────────────────────────────
  // WIDE INPUT
  // ─────────────────────────────────────────────────────────────────────────

  const wideInput = Input({
    label: 'Wide Input',
    placeholder: 'This one is wider...',
    width: 35,
  });
  view.add(wideInput);

  // ─────────────────────────────────────────────────────────────────────────
  // INPUT WITH LIVE CALLBACK
  // ─────────────────────────────────────────────────────────────────────────

  const liveInput = Input({
    label: 'Live',
    placeholder: 'Watch the toast...',
    width: 20,
    onChange: (val) => {
      // Called on every keystroke
      if (val.length > 0 && val.length % 5 === 0) {
        ctx.toast(`${val.length} characters`);
      }
    }
  });
  view.add(liveInput);

  // ─────────────────────────────────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  view.add(Button({
    label: 'Show All Values',
    shortcut: 'V',
    onPress: () => {
      const values = [
        `Basic: "${basicInput.getValue()}"`,
        `Prefilled: "${prefilledInput.getValue()}"`,
        `Wide: "${wideInput.getValue()}"`,
        `Live: "${liveInput.getValue()}"`,
      ];
      ctx.toast(values.join(', '));
    }
  }));

  view.add(Button({
    label: 'Clear All',
    shortcut: 'C',
    onPress: () => {
      basicInput.setValue('');
      prefilledInput.setValue('');
      wideInput.setValue('');
      liveInput.setValue('');
      view.render();
      ctx.toast('Cleared!');
    }
  }));

  return {
    init() { view.render(); },
    render() { view.render(); },
    onKey(key) { return view.handleKey(key); }
  };
}
