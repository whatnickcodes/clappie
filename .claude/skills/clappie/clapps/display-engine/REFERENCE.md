# Display Engine Reference

Terminal UI framework for creating interactive views with buttons, toggles, inputs, forms, and more.

## Architecture

```
display-engine/
├── core/
│   ├── daemon.js       # Orchestrator - socket server, lifecycle, input handling
│   ├── views.js        # View stack management, context creation, view loading
│   ├── tmux.js         # Tmux integration - pane creation, chat messaging
│   ├── keyboard.js     # Key parsing (arrows, ctrl+key, etc.)
│   └── pointer.js      # Mouse click grid, scroll handling
├── layout/
│   ├── renderer.js     # Screen composition - header, content, footer
│   ├── ansi.js         # ANSI escape codes, visual width calculation
│   └── dimensions.js   # Content area calculation with margins
├── ui-kit/
│   ├── index.js        # View class + component exports
│   └── components/     # Button, Toggle, TextInput, Select, etc.
├── graphics/
│   └── quarter-block.js # Pixel art using Unicode quarter blocks
└── theme.js            # Dark/light mode with persistence
```

## Data Flow

1. `clappie display push <view>` → CLI sends command to daemon via Unix socket
2. Daemon loads view module, creates context with `ctx.draw()`, `ctx.push()`, `ctx.submit()`
3. View renders lines → daemon composites with header/footer → ANSI output to terminal
4. User input (keyboard/mouse) → daemon routes to current view's `onKey()`/`onClick()`
5. `ctx.submit(data)` → types message into Claude's tmux pane as `[clappie] Component → value`

## Session Isolation

Each Claude terminal pane gets its own:
- Socket: `/tmp/clappie-{TMUX_PANE_ID}.sock`
- Daemon with heartbeat (auto-exits if pane closes)
- Independent view stack

## Creating Views

Views go in `clapps/<clappname>/displays/<viewname>.js`. Export a `create(ctx)` function.

### Layout Modes

```javascript
// Centered (default) - clean for simple views
export function create(ctx) { ... }

// Centered with custom max width
export const maxWidth = 50;
export function create(ctx) { ... }

// Full width - for dashboards, data tables
export const layout = 'full';
export function create(ctx) { ... }
```

Dynamic layout changes:
```javascript
ctx.setLayout({ layout: 'full' });
ctx.setLayout({ maxWidth: 40 });
ctx.setLayout({ layout: 'centered', maxWidth: 50 });
```

### Easy Way (Recommended) - UI Kit

```javascript
import { View, Button, Toggle, Input } from '../clappie/clapps/display-engine/ui-kit/index.js';

export function create(ctx) {
  ctx.setTitle('My View');
  ctx.setDescription('Optional subtitle');

  const view = new View(ctx);

  view.add(Button({ label: 'Save', shortcut: 'S', onPress: () => save() }));
  view.add(Toggle({ label: 'Dark Mode', shortcut: 'D', onChange: (v) => toggle(v) }));
  view.add(Input({ label: 'Name', placeholder: 'Enter name...', width: 20 }));

  return {
    init() { view.render(); },
    render() { view.render(); },
    onKey(key) { return view.handleKey(key); }
  };
}
```

Shortcuts auto-appear in footer. Clicks and keyboard navigation just work.

**CRITICAL:** Always export `render` in your return object. The daemon calls this when the theme is toggled. Without it, your view's colors won't update.

### Manual Way - Direct ctx API

```javascript
export function create(ctx) {
  return {
    init() { /* async setup, then render() */ },
    render() { /* draw the screen */ },
    onKey(key) { /* handle keyboard */ },
    onClick(x, y) { /* handle mouse click */ },
    onScroll(dir) { /* handle scroll: -1=up, 1=down */ },
  };
}
```

## Context API

- `ctx.data` - JSON passed via `-d` flag
- `ctx.width`, `ctx.height` - terminal dimensions
- `ctx.push(view, data)` - push new view onto stack
- `ctx.pop()` - go back
- `ctx.send(text)` - type text in Claude's input (no Enter)
- `ctx.submit({component, value})` - type + Enter (formats as `[clappie] Component → value`)
- `ctx.toast(msg)` - show notification
- `ctx.draw(lines)` - render screen
- `ctx.setLayout({ layout: 'full' })` - switch to full width dynamically

## Available Components

Button, ButtonFilled, ButtonGhost, ButtonInline, Toggle, TextInput, Textarea, Checkbox, Radio, Select, Progress, Loader, SectionHeading, Label, Divider

See `clapps/example-demo-screens/displays/` for working examples. Start with `hello-world.js` for the basics.

**Full creation guide:** Use `/create-clappie-integration` skill or read `.claude/skills/create-clappie-integration/SKILL.md` for complete integration docs.
