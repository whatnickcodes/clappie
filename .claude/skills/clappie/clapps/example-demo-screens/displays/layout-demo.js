// Layout Demo - Shows centered vs full-width layouts
//
// Run: clappie display push example-demo-screens/layout-demo

import { View, Button, Label, Divider } from '../../display-engine/ui-kit/index.js';

// Start centered (default), toggle to full
export let layout = 'centered';
export let maxWidth = 50;

export function create(ctx) {
  ctx.setTitle('Layout');
  ctx.setDescription('Centered vs Full Width');

  let currentLayout = 'centered';
  let currentMaxWidth = 50;

  const view = new View(ctx);

  const layoutLabel = Label({ text: `Layout: ${currentLayout} (maxWidth: ${currentMaxWidth})` });
  view.add(layoutLabel);
  view.space();

  view.add(Divider());
  view.space();

  view.add(Button({
    label: 'Centered (50)',
    shortcut: '1',
    onPress: () => {
      currentLayout = 'centered';
      currentMaxWidth = 50;
      ctx.setLayout({ layout: 'centered', maxWidth: 50 });
      layoutLabel.text = `Layout: ${currentLayout} (maxWidth: ${currentMaxWidth})`;
      view.render();
    }
  }));

  view.add(Button({
    label: 'Centered (40)',
    shortcut: '2',
    onPress: () => {
      currentLayout = 'centered';
      currentMaxWidth = 40;
      ctx.setLayout({ layout: 'centered', maxWidth: 40 });
      layoutLabel.text = `Layout: ${currentLayout} (maxWidth: ${currentMaxWidth})`;
      view.render();
    }
  }));

  view.add(Button({
    label: 'Full Width',
    shortcut: '3',
    onPress: () => {
      currentLayout = 'full';
      ctx.setLayout({ layout: 'full' });
      layoutLabel.text = `Layout: ${currentLayout}`;
      view.render();
    }
  }));

  view.space();
  view.add(Divider());
  view.space();

  // Add a wide line to show the layout effect
  view.add(Label({ text: '|' + '-'.repeat(70) + '|' }));
  view.add(Label({ text: '^ This line is 72 chars wide - watch it clip/wrap based on layout ^' }));

  return {
    init() { view.render(); },
    render() { view.render(); },
    onKey(key) { return view.handleKey(key); }
  };
}
