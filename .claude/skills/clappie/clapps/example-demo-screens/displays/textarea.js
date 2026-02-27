// Textarea Component Demo - Multi-line text input
//
// Run: clappie display push textarea

import { View, Textarea, Button } from '../../display-engine/ui-kit/index.js';

export function create(ctx) {
  ctx.setTitle('Textarea');
  ctx.setDescription('Multi-line text input component');

  const view = new View(ctx);

  // ─────────────────────────────────────────────────────────────────────────
  // BASIC TEXTAREA
  // ─────────────────────────────────────────────────────────────────────────

  const basicTextarea = Textarea({
    label: 'Notes',
    placeholder: 'Type multiple lines...',
    width: 30,
    rows: 3,
  });
  view.add(basicTextarea);

  // ─────────────────────────────────────────────────────────────────────────
  // TEXTAREA WITH INITIAL VALUE
  // ─────────────────────────────────────────────────────────────────────────

  const prefilledTextarea = Textarea({
    label: 'Description',
    value: 'Line one\nLine two\nLine three',
    width: 30,
    rows: 4,
  });
  view.add(prefilledTextarea);

  // ─────────────────────────────────────────────────────────────────────────
  // TALL TEXTAREA
  // ─────────────────────────────────────────────────────────────────────────

  const tallTextarea = Textarea({
    label: 'Essay',
    placeholder: 'Write something longer...',
    width: 35,
    rows: 6,
  });
  view.add(tallTextarea);

  // ─────────────────────────────────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  view.add(Button({
    label: 'Count Lines',
    shortcut: 'L',
    onPress: () => {
      const notesLines = basicTextarea.getValue().split('\n').length;
      const descLines = prefilledTextarea.getValue().split('\n').length;
      const essayLines = tallTextarea.getValue().split('\n').length;
      ctx.toast(`Notes: ${notesLines}, Desc: ${descLines}, Essay: ${essayLines} lines`);
    }
  }));

  view.add(Button({
    label: 'Submit All',
    shortcut: 'S',
    onPress: () => {
      const lines = [
        `Notes → ${basicTextarea.getValue() || '(empty)'}`,
        `Description → ${prefilledTextarea.getValue() || '(empty)'}`,
        `Essay → ${tallTextarea.getValue() || '(empty)'}`,
      ];
      ctx.submit(`TextareaForm\n  ${lines.join('\n  ')}`);
    }
  }));

  view.add(Button({
    label: 'Clear All',
    shortcut: 'C',
    onPress: () => {
      basicTextarea.setValue('');
      prefilledTextarea.setValue('');
      tallTextarea.setValue('');
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
