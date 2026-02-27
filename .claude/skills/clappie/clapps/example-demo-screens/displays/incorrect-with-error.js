// Incorrect With Error - Shows common mistakes and how errors appear
//
// Run: clappie display push incorrect-with-error
//
// This demo shows what happens when you make common mistakes.
// Uncomment one error at a time to see the error messages.

import { View, Button, Toggle } from '../../display-engine/ui-kit/index.js';

export function create(ctx) {
  ctx.setTitle('Errors');
  ctx.setDescription('Uncomment errors in code to see messages');

  const view = new View(ctx);

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │  UNCOMMENT ONE ERROR AT A TIME TO SEE WHAT HAPPENS                      │
  // └─────────────────────────────────────────────────────────────────────────┘

  // ERROR 1: Forgetting to call the component function
  // ❌ view.add(Button);  // Wrong! Button is a function, not a component
  // ✅ view.add(Button({ label: 'Click' }));  // Correct

  // ERROR 2: Missing required props
  // ❌ view.add(Button({}));  // Missing label
  // ✅ view.add(Button({ label: 'Click' }));

  // ERROR 3: Adding null/undefined
  // ❌ view.add(null);
  // ❌ view.add(undefined);

  // ERROR 4: Wrong prop types
  // ❌ view.add(Button({ label: 123 }));  // label should be string
  // ✅ view.add(Button({ label: 'Click' }));

  // ERROR 5: Forgetting to return from create()
  // If you forget the return statement, you'll get:
  // "Cannot read properties of undefined (reading 'init')"

  // ─────────────────────────────────────────────────────────────────────────
  // WORKING EXAMPLES (for comparison)
  // ─────────────────────────────────────────────────────────────────────────

  view.add(Button({
    label: 'Working Button',
    onPress: () => ctx.toast('Button works!')
  }));

  view.add(Toggle({
    label: 'Working Toggle',
    value: false,
    onChange: (v) => ctx.toast(`Toggle: ${v ? 'ON' : 'OFF'}`)
  }));

  view.add(Button({
    label: 'Trigger Error',
    onPress: () => {
      // This will throw at runtime - shows error handling
      throw new Error('Intentional error for demo');
    }
  }));

  return {
    init() { view.render(); },
    render() { view.render(); },
    onKey(key) { return view.handleKey(key); }
  };
}
