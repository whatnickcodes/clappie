// Submit Data Demo - Shows ctx.send() vs ctx.submit()
//
// Run: clappie display push submit-data-demo

import { View, Button, Toggle, Input } from '../../display-engine/ui-kit/index.js';

export function create(ctx) {
  ctx.setTitle('Submit');
  ctx.setDescription('Two ways to send data to Claude');

  const view = new View(ctx);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 1: SOFT vs HARD
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Soft: ctx.send() - types text, NO Enter (user reviews first)
  view.add(Button({
    label: '◦ Soft: Draft Message',
    shortcut: 'S',
    onPress: () => ctx.send('draft an email to team about the new feature')
  }));

  // Hard: ctx.submit() - types text AND presses Enter
  view.add(Button({
    label: '● Hard: Execute Now',
    shortcut: 'H',
    onPress: () => ctx.submit('list files in current directory')
  }));

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 2: STRUCTURED DATA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  let counter = 0;
  const counterBtn = Button({
    label: `↑ Counter: ${counter}`,
    shortcut: 'C',
    onPress: () => {
      counter++;
      counterBtn.label = `↑ Counter: ${counter}`;
      view.render();
      // Sends: [clappie] Counter → 5
      ctx.submit({ component: 'Counter', value: counter });
    }
  });
  view.add(counterBtn);

  view.add(Toggle({
    label: 'Dark Mode',
    shortcut: 'D',
    value: false,
    onChange: (val) => {
      // Sends: [clappie] DarkMode → yes
      ctx.submit({ component: 'DarkMode', value: val });
    }
  }));

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 3: FORM INPUT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const nameInput = Input({
    label: 'Your Name',
    placeholder: 'Enter name...',
    width: 20
  });
  view.add(nameInput);

  view.add(Button({
    label: '→ Submit Name',
    onPress: () => {
      const name = nameInput.getValue();
      if (name) {
        // Sends: [clappie] UserName → nick
        ctx.submit({ component: 'UserName', value: name });
      } else {
        ctx.toast('Enter a name first');
      }
    }
  }));

  return {
    init() { view.render(); },
    render() { view.render(); },
    onKey(key) { return view.handleKey(key); }
  };
}
