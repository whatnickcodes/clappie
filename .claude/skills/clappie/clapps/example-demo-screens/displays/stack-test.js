// Stack test - shows a big letter to make stacking obvious

import { View, Label } from '../../display-engine/ui-kit/index.js';

export function create(ctx) {
  const letter = ctx.data?.letter || 'A';

  ctx.setTitle(`View ${letter}`);
  ctx.setDescription('Press ESC to pop, or push more views');

  const view = new View(ctx);

  view.space();
  view.add(Label({ text: `This is View ${letter}` }));
  view.space();
  view.add(Label({ text: `Stack depth: ${ctx.stackDepth}` }));
  view.space();
  view.add(Label({ text: 'If stacking works, pushing another view' }));
  view.add(Label({ text: 'should show View B on TOP of this one.' }));
  view.space();
  view.add(Label({ text: 'ESC goes back through the stack.' }));
  view.space();

  return {
    init() { view.render(); },
    render() { view.render(); },
    onKey(key) { return view.handleKey(key); }
  };
}
