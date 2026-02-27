// Easy Stack Demo - Shows push/pop navigation
//
// Run: clappie display push easy-stack-demo

import { View, Button } from '../../display-engine/ui-kit/index.js';

export function create(ctx) {
  const depth = ctx.stackDepth;

  ctx.setTitle(`Level ${depth}`);
  ctx.setDescription('Push to go deeper, ESC to go back');

  const view = new View(ctx);

  // Show current position in stack
  view.add(Button({
    label: `Stack Depth: ${depth}`,
    onPress: () => ctx.toast(`You are ${depth} level${depth > 1 ? 's' : ''} deep`)
  }));

  // Push another view onto the stack
  view.add(Button({
    label: 'Push New View',
    shortcut: 'N',
    onPress: () => {
      // Push the same view again - it creates a new instance
      ctx.push('easy-stack-demo');
    }
  }));

  // Push with data example
  view.add(Button({
    label: 'Push With Data',
    shortcut: 'D',
    onPress: () => {
      ctx.push('easy-stack-demo', { fromLevel: depth });
    }
  }));

  // Show received data if any
  if (ctx.data.fromLevel) {
    view.add(Button({
      label: `Received: fromLevel=${ctx.data.fromLevel}`,
      onPress: () => ctx.toast(`Data passed from level ${ctx.data.fromLevel}`)
    }));
  }

  // Go back
  view.add(Button({
    label: 'Pop (Go Back)',
    shortcut: 'B',
    onPress: () => ctx.pop()
  }));

  return {
    init() { view.render(); },
    render() { view.render(); },
    onKey(key) { return view.handleKey(key); }
  };
}
