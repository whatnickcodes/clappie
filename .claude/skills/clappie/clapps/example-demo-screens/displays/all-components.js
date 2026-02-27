// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  ALL COMPONENTS - Test all UI kit components                              ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import {
  View,
  Button,
  ButtonFilled,
  ButtonGhost,
  ButtonInline,
  Toggle,
  ToggleBlock,
  TextInput,
  Textarea,
  Checkbox,
  Radio,
  Select,
  SelectBlock,
  Progress,
  Loader,
  SectionHeading,
  Label,
  Divider,
  Alert
} from '../../display-engine/ui-kit/index.js';

export function create(ctx) {
  ctx.setTitle('All Components');
  ctx.setDescription('Testing the UI kit');

  const view = new View(ctx);

  // Create loader instance for animation
  const loaderInstance = Loader({ message: 'Loading' });

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD VIEW - Add ALL components in render order
  // ═══════════════════════════════════════════════════════════════════════════

  // INPUTS SECTION
  view.add(SectionHeading({ text: 'INPUTS' }));
  view.space();

  view.add(Label({ text: 'Small (width: 16)' }));
  view.add(TextInput({
    placeholder: 'Small...',
    width: 16,
  }));
  view.space();

  view.add(Label({ text: 'Medium (width: 28)' }));
  view.add(TextInput({
    placeholder: 'Medium input...',
    width: 28,
  }));
  view.space();

  view.add(Label({ text: 'Full Width (default)' }));
  view.add(TextInput({
    placeholder: 'Full width input fills container...',
  }));
  view.space();

  view.add(Label({ text: 'Textarea Small (3 rows)' }));
  view.add(Textarea({
    placeholder: 'Small textarea...',
    width: 24,
    rows: 3,
  }));
  view.space();

  view.add(Label({ text: 'Textarea Full Width (4 rows)' }));
  view.add(Textarea({
    placeholder: 'Full width textarea...',
    rows: 4,
  }));
  view.space();

  view.add(Textarea({
    label: 'Notes',
    value: 'Click the header to toggle edit mode.\nThis textarea has all the bells and whistles.',
    rows: 5,
    showStatus: true,
    editToggle: true,
  }));
  view.space();

  // SELECTIONS SECTION
  view.add(SectionHeading({ text: 'SELECTIONS' }));
  view.space();
  view.add(Label({ text: 'Theme' }));
  view.add(Radio({
    options: ['Light', 'Dark', 'Auto'],
    value: 0,
    onChange: (i) => console.log('Theme index:', i)
  }));
  view.space();
  view.add(Label({ text: 'Size' }));
  view.add(Select({
    options: ['Small', 'Medium', 'Large', 'X-Large'],
    value: 1,
    onChange: (i) => console.log('Size index:', i)
  }));
  view.space();
  view.add(Label({ text: 'Size (SelectBlock)' }));
  view.add(SelectBlock({
    options: ['Small', 'Medium', 'Large', 'X-Large'],
    value: 1,
    onChange: (i) => console.log('Size index:', i)
  }));
  view.space();
  view.add(Checkbox({
    label: 'I agree to the terms',
    value: false,
    onChange: (v) => console.log('Agree:', v)
  }));
  view.add(Checkbox({
    label: 'Send me notifications',
    value: true,
    onChange: (v) => console.log('Notify:', v)
  }));
  view.space();
  view.add(Label({ text: 'Dark Mode' }));
  view.add(Toggle({
    value: false,
    onChange: (v) => console.log('Dark mode:', v)
  }));
  view.space();
  view.add(Label({ text: 'Notifications' }));
  view.add(Toggle({
    value: true,
    onChange: (v) => console.log('Notifications:', v)
  }));
  view.space();

  // NEW: ToggleBlock (full-width side-by-side)
  view.add(Label({ text: 'Power Mode (ToggleBlock)' }));
  view.add(ToggleBlock({
    options: ['ON', 'OFF'],
    value: 0,
    onChange: (i) => console.log('Power mode index:', i)
  }));
  view.space();
  view.add(Label({ text: 'Theme (ToggleBlock)' }));
  view.add(ToggleBlock({
    options: ['LIGHT', 'DARK'],
    value: 1,
    onChange: (i) => console.log('Theme index:', i)
  }));
  view.space();

  view.add(Label({ text: 'Size (3 options)' }));
  view.add(ToggleBlock({
    options: ['SMALL', 'MEDIUM', 'LARGE'],
    value: 1,
    onChange: (i) => console.log('Size index:', i)
  }));
  view.space();


  // INDICATORS SECTION
  view.add(SectionHeading({ text: 'INDICATORS' }));
  view.space();
  view.add(Progress({ value: 35, width: 24 }));
  view.add(loaderInstance);
  view.space();

  // BUTTONS SECTION
  view.add(SectionHeading({ text: 'BUTTONS' }));
  view.space();
  view.add(ButtonFilled({
    label: 'SUBMIT',
    shortcut: 'S',
    onPress: () => ctx.toast('Filled button pressed!')
  }));
  view.space();
  view.add(ButtonGhost({
    label: 'CANCEL',
    shortcut: 'C',
    onPress: () => ctx.toast('Ghost button pressed!')
  }));
  view.space();
  view.add(ButtonInline({
    label: 'Yes',
    onPress: () => ctx.toast('Inline button pressed!')
  }));
  view.space();
  view.add(Button({
    label: 'Simple',
    onPress: () => ctx.toast('Simple button pressed!')
  }));
  view.space();

  // DIVIDERS SECTION
  view.add(SectionHeading({ text: 'DIVIDERS' }));
  view.space();
  view.add(Divider({ variant: 'thin' }));
  view.space();
  view.add(Divider({ variant: 'big' }));
  view.space();

  // ALERTS SECTION
  view.add(SectionHeading({ text: 'ALERTS' }));
  view.space();
  view.add(Alert({
    variant: 'error',
    message: 'Connection failed. Please check your network.'
  }));
  view.space();
  view.add(Alert({
    variant: 'warning',
    message: 'Your session will expire in 5 minutes.'
  }));
  view.space();
  view.add(Alert({
    variant: 'success',
    message: 'Changes saved successfully!'
  }));
  view.space();
  view.add(Alert({
    variant: 'info',
    message: 'Press T to toggle dark mode.'
  }));
  view.space();

  // Animation loop for loader
  let animationInterval = null;

  return {
    init() {
      view.render();
      // Start loader animation
      animationInterval = setInterval(() => {
        loaderInstance.tick();
        view.render();
      }, 150);
    },

    render() {
      view.render();
    },

    onKey(key) {
      return view.handleKey(key);
    },

    cleanup() {
      if (animationInterval) {
        clearInterval(animationInterval);
      }
    }
  };
}
