// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CLAPPIE UI - Simple view orchestration                                   ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    import { View, Button, Toggle, Input } from '../clappie/ui-kit/index.js'║
// ║                                                                           ║
// ║    const view = new View(ctx);                                            ║
// ║    view.add(Button({ label: 'Save', shortcut: 'S', onPress: () => {} })); ║
// ║    view.add(Toggle({ label: 'Dark', shortcut: 'D', onChange: (v) => {} }));║
// ║    view.render();  // Shortcuts auto-appear in footer!                    ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// Re-export components for easy importing
export { Button } from './components/Button.js';
export { ButtonFilled } from './components/ButtonFilled.js';
export { ButtonGhost } from './components/ButtonGhost.js';
export { ButtonInline } from './components/ButtonInline.js';
export { ButtonFullWidth } from './components/ButtonFullWidth.js';
export { Toggle } from './components/Toggle.js';
export { TextInput } from './components/TextInput.js';
export { TextInput as Input } from './components/TextInput.js';  // Alias
export { Textarea } from './components/Textarea.js';
export { Checkbox } from './components/Checkbox.js';
export { Radio } from './components/Radio.js';
export { Select } from './components/Select.js';
export { SelectBlock } from './components/SelectBlock.js';
export { Progress } from './components/Progress.js';
export { Loader } from './components/Loader.js';
export { SectionHeading } from './components/SectionHeading.js';
export { Label } from './components/Label.js';
export { Divider } from './components/Divider.js';
export { ToggleBlock } from './components/ToggleBlock.js';
export { Alert } from './components/Alert.js';

// Error helpers (shared with widgets)
import { clappieError, clappieWarn } from './errors.js';

// Layout utilities (for emoji/wide char support)
import { visualWidth, stripAnsi } from '../layout/ansi.js';
export { clappieError, clappieWarn };

// Settings (for views that need to read/toggle layout settings)
export { settings } from '../settings.js';

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL UI STATE - Shared with daemon for footer shortcuts
// ─────────────────────────────────────────────────────────────────────────────

export const ui = {
  shortcuts: new Map(),  // key -> { label, handler }

  clearShortcuts() {
    this.shortcuts.clear();
  },

  registerShortcut(key, label, handler) {
    this.shortcuts.set(key.toUpperCase(), { label, handler });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VIEW - Manages components, focus, clicks, and shortcuts automatically
// ─────────────────────────────────────────────────────────────────────────────

export class View {
  constructor(ctx) {
    // Validate ctx
    if (!ctx) {
      clappieError('View', 'ctx is required',
        'Pass the ctx from create(ctx) to new View(ctx)');
    }
    if (typeof ctx.draw !== 'function') {
      clappieError('View', 'ctx.draw is not a function - invalid context object',
        'Make sure you pass the ctx from create(ctx), not something else');
    }

    this.ctx = ctx;
    this.allComponents = [];  // ALL components in render order
    this.components = [];     // Only focusable components (for navigation)
    this.focusIndex = -1;     // -1 = no focus, 0+ = focused component index
    this._hasRendered = false;
    this._shortcuts = new Map();  // key -> component (from UI components)
    this._manualShortcuts = new Map();  // key -> { label } (manual registration for footer)
  }

  // Get the effective container width (respects layout mode)
  _getContainerWidth() {
    const layout = this.ctx.getLayout?.() || { layout: 'centered', maxWidth: 60 };
    if (layout.layout === 'full') {
      return this.ctx.width;
    }
    // Centered: use maxWidth, but don't exceed actual width
    return Math.min(layout.maxWidth, this.ctx.width);
  }

  // Add a component to the view
  add(component) {
    // Validate component
    if (!component) {
      clappieError('View.add', 'component is undefined or null',
        'Check that your component function returns something:\n' +
        '  WRONG:  view.add(Button({ label: "Save" }))  // if Button returns undefined\n' +
        '  RIGHT:  const btn = Button({ label: "Save" }); view.add(btn);');
    }

    if (typeof component !== 'object') {
      clappieError('View.add', `expected component object, got ${typeof component}`,
        'Components are created by calling the function:\n' +
        '  WRONG:  view.add(Button)\n' +
        '  RIGHT:  view.add(Button({ label: "Save" }))');
    }

    if (typeof component.render !== 'function') {
      clappieError('View.add', 'component is missing render() method',
        'This object is not a valid component. Components need:\n' +
        '  - render(focused) method\n' +
        '  - focusable: true/false\n' +
        '  - getWidth() method');
    }

    // Set container width for components that need it (e.g., TextInput with width: 'full')
    component._containerWidth = this._getContainerWidth();

    // Track ALL components for rendering
    this.allComponents.push(component);

    // Track focusable components separately for navigation
    if (component.focusable) {
      this.components.push(component);
    }

    // Register shortcut if component has one
    if (component.shortcut) {
      const key = component.shortcut.toUpperCase();
      this._shortcuts.set(key, component);
    }

    return component;
  }

  // Add a blank line spacer
  space(count = 1) {
    for (let i = 0; i < count; i++) {
      this.allComponents.push({
        render: () => [''],
        focusable: false,
        getWidth: () => 0
      });
    }
    return this;
  }

  /**
   * Register a shortcut for footer display.
   * Use this when you handle shortcuts in onKey() but want them to appear in the footer.
   * The shortcut won't be auto-handled - your onKey() must handle it.
   *
   * @param {string} key - The key (e.g., 'r', 'n', 'Enter')
   * @param {string} label - Human-readable label (e.g., 'refresh', 'new')
   */
  registerShortcut(key, label) {
    this._manualShortcuts.set(key.toUpperCase(), { label });
  }

  /**
   * Unregister a manually registered shortcut.
   */
  unregisterShortcut(key) {
    this._manualShortcuts.delete(key.toUpperCase());
  }

  // Get currently focused component (null if no focus)
  focused() {
    if (this.focusIndex < 0) return null;
    return this.components[this.focusIndex];
  }

  // Clear focus (no component focused)
  blur() {
    this.focusIndex = -1;
  }

  // Clear all components (for dynamic re-rendering)
  // Note: _manualShortcuts is NOT cleared - those persist across renders
  clear() {
    this.allComponents = [];
    this.components = [];
    this.focusIndex = -1;
    this._shortcuts.clear();
  }

  // Move focus to next component
  focusNext() {
    if (this.components.length === 0) return;
    // If no focus, start at first
    if (this.focusIndex < 0) {
      this.focusIndex = 0;
    } else {
      this.focusIndex = (this.focusIndex + 1) % this.components.length;
    }
  }

  // Move focus to previous component
  focusPrev() {
    if (this.components.length === 0) return;
    // If no focus, start at last
    if (this.focusIndex < 0) {
      this.focusIndex = this.components.length - 1;
    } else {
      this.focusIndex = (this.focusIndex - 1 + this.components.length) % this.components.length;
    }
  }

  // Render all components and register click zones + shortcuts
  render() {
    this._hasRendered = true;

    // Warn if no components
    if (this.allComponents.length === 0) {
      clappieWarn('View.render',
        'No components added. Did you forget view.add()?');
    }

    // Clear click grid and shortcuts before painting
    this.ctx.clearClickGrid?.();
    ui.clearShortcuts();

    // Register shortcuts with global ui (for daemon footer)
    for (const [key, component] of this._shortcuts) {
      const handler = () => {
        if (component.onPress) component.onPress();
        else if (component.onClick) component.onClick();
        else if (component.toggle) component.toggle();
        this.render();
      };
      ui.registerShortcut(key, component.label || key, handler);
    }

    // Register manual shortcuts (for footer display - handled by view's onKey)
    for (const [key, info] of this._manualShortcuts) {
      // No handler - view's onKey handles these
      ui.registerShortcut(key, info.label, null);
    }

    // Update container width for all components (handles resize)
    const containerWidth = this._getContainerWidth();
    for (const component of this.allComponents) {
      component._containerWidth = containerWidth;
    }

    // PHASE 1: Render all components to get lines (for vertical centering calc)
    const componentData = [];  // { component, lines, isFocused }
    for (const component of this.allComponents) {
      const isFocused = component.focusable && component === this.focused();

      let rendered;
      try {
        rendered = component.render(isFocused);
      } catch (err) {
        clappieError('View.render',
          `Component type="${component.type || 'unknown'}" threw error during render: ${err.message}`,
          'Check the component\'s render() method');
      }

      // Validate render output
      if (!Array.isArray(rendered)) {
        clappieError('View.render',
          `Component type="${component.type || 'unknown'}" render() must return array of strings, got ${typeof rendered}`,
          'Component render() should return ["line1", "line2", ...]');
      }

      componentData.push({ component, lines: rendered, isFocused });
    }

    // Calculate total lines and hint to context (for vertical centering)
    const allLines = componentData.flatMap(c => c.lines);
    this.ctx.setContentLines?.(allLines.length);

    // PHASE 2: Paint click zones (now that we know total lines)
    // First paint a background blur handler for ALL lines (full width)
    // Component-specific handlers will overwrite these cells
    for (let i = 0; i < allLines.length; i++) {
      this.ctx.paintClick?.(i, 0, containerWidth, () => {
        // Background click: blur any focused component
        this.blur();
        this.render();
      }, null);
    }

    // Now paint component-specific click zones (these override background)
    let currentLine = 0;
    for (const { component, lines } of componentData) {
      let componentLineIndex = 0;  // Track which line within this component

      for (const line of lines) {
        if (typeof line !== 'string') {
          clappieError('View.render',
            `Component type="${component.type || 'unknown'}" render() returned non-string in array: ${typeof line}`,
            'Every item in the render array must be a string');
        }

        // Paint click zone for this line
        const width = component.getWidth ? component.getWidth() : this._measureLine(line);

        // Non-focusable components: clicking blurs current focus
        if (!component.focusable) {
          this.ctx.paintClick?.(currentLine, 0, width, () => {
            this.blur();
            this.render();
          }, component);
          currentLine++;
          componentLineIndex++;
          continue;
        }

        // Capture componentLineIndex in closure for this specific line
        const lineIdx = componentLineIndex;

        // Focusable components: clicking focuses them and passes position
        this.ctx.paintClick?.(currentLine, 0, width, (clickCol) => {
          // On click: focus this component and trigger its onClick with position
          const wasAlreadyFocused = this.focusIndex === this.components.indexOf(component);
          this.focusIndex = this.components.indexOf(component);
          if (component.onClick) {
            // Pass row (relative to component) and column
            // If onClick returns false, click was rejected (e.g., border click on textarea)
            const accepted = component.onClick(lineIdx, clickCol);
            if (accepted === false && wasAlreadyFocused) {
              // Click on border of already-focused component - blur it
              this.blur();
            }
          }
          this.render();
        }, component);

        currentLine++;
        componentLineIndex++;
      }
    }

    // Draw to screen
    this.ctx.draw(allLines);
  }

  // Handle keyboard input
  handleKey(key) {
    // Warn if render was never called
    if (!this._hasRendered) {
      clappieWarn('View.handleKey',
        'handleKey() called before render(). Call view.render() in init() first.');
    }

    // Tab always navigates (standard form behavior)
    if (key === 'TAB') {
      this.focusNext();
      this.render();
      return true;
    }

    // Pass keys to focused component FIRST (including ESC)
    // This lets components like Textarea handle ESC for edit mode toggle
    const focused = this.focused();
    if (focused && focused.onKey) {
      if (focused.onKey(key)) {
        this.render();
        return true;
      }
    }

    // ESC goes back (only if component didn't handle it)
    if (key === 'ESCAPE') {
      this.ctx.pop();
      return true;
    }

    // Component didn't handle it - check shortcuts
    const shortcut = this._shortcuts.get(key.toUpperCase());
    if (shortcut) {
      if (shortcut.onPress) shortcut.onPress();
      else if (shortcut.onClick) shortcut.onClick();
      else if (shortcut.toggle) shortcut.toggle();
      this.render();
      return true;
    }

    // Still not handled - use Up/Down for navigation fallback
    if (key === 'DOWN') {
      this.focusNext();
      this.render();
      return true;
    }
    if (key === 'UP') {
      this.focusPrev();
      this.render();
      return true;
    }

    return false;
  }

  // Handle clicks on empty space (no component handler matched)
  // This is called by the daemon when clicking outside all registered click zones
  handleBackgroundClick(x, y) {
    // Blur current focus when clicking empty space
    if (this.focusIndex >= 0) {
      this.blur();
      this.render();
      return true;
    }
    return false;
  }

  // Measure a line's visible width (strip ANSI codes, handle emojis/wide chars)
  _measureLine(line) {
    return visualWidth(stripAnsi(line));
  }
}
