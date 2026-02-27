// Full Width Inputs Demo - Shows default full-width vs fixed-width inputs
//
// Run: clappie display push example-demo-screens/full-width-inputs
//
// Note: TextInput and Textarea now DEFAULT to width: 'full' (fills container).
// Use explicit width values (e.g., width: 20) for fixed-width inputs.

import { View, TextInput, Textarea, Label, Divider } from '../../display-engine/ui-kit/index.js';

export function create(ctx) {
  ctx.setTitle('Inputs');
  ctx.setDescription('Default full-width vs fixed-width');

  const view = new View(ctx);

  view.add(Label({ text: 'Default TextInput (full-width):' }));
  view.add(TextInput({
    label: 'Name',
    placeholder: 'Enter your name...'
    // width defaults to 'full'
  }));

  view.space();
  view.add(Divider());
  view.space();

  view.add(Label({ text: 'Default Textarea (full-width):' }));
  view.add(Textarea({
    label: 'Bio',
    placeholder: 'Tell us about yourself...',
    // width defaults to 'full'
    rows: 5
  }));

  view.space();
  view.add(Divider());
  view.space();

  view.add(Label({ text: 'Fixed width (20) for comparison:' }));
  view.add(TextInput({
    label: 'Email',
    placeholder: 'email@example.com',
    width: 20
  }));

  return {
    init() { view.render(); },
    render() { view.render(); },
    onKey(key) { return view.handleKey(key); }
  };
}
