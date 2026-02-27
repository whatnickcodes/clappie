// Utility: Multi-select / Single-select List
//
// Usage:
//   ctx.push('utility/list', {
//     title: 'Select emails to archive',
//     lead: 'Choose which emails to process',  // optional description
//     items: 'Email from Bob\nEmail from Alice\nNewsletter',
//     multi: true  // default: true (checkboxes), false for single-select (radio)
//   });
//
// Or load from file:
//   ctx.push('utility/list', {
//     title: 'Select items',
//     file: 'path/to/items.txt'  // relative to project root
//   });
//
// Returns on Done:
//   [clappie] List -> selected item 1\nselected item 2
//
// Cancelling pops without submitting anything.

import { View, SectionHeading, Label, ButtonFullWidth, Alert, Checkbox, Radio } from '../../display-engine/ui-kit/index.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

export const maxWidth = 60;

export function create(ctx) {
  const title = ctx.data?.title;
  const lead = ctx.data?.lead;  // Optional, no default
  const multi = ctx.data?.multi !== false;  // default to multi-select

  ctx.setTitle(title || 'Select Items');
  ctx.setDescription('Pick from list');

  const view = new View(ctx);

  // Parse items from ctx.data.items (string) or ctx.data.file
  let items = [];
  let error = null;

  if (ctx.data?.file) {
    // Load from file
    const fullPath = join(PROJECT_ROOT, ctx.data.file);
    if (!existsSync(fullPath)) {
      error = `File not found: ${ctx.data.file}`;
    } else {
      try {
        const content = readFileSync(fullPath, 'utf8');
        items = parseItems(content);
      } catch (err) {
        error = `Failed to read file: ${err.message}`;
      }
    }
  } else if (ctx.data?.items) {
    // Parse inline items
    items = parseItems(ctx.data.items);
  } else {
    error = 'No items provided. Use items: "..." or file: "..."';
  }

  // Track selection state
  const selected = new Set();  // For multi-select
  let selectedIndex = -1;       // For single-select (-1 = none)

  function parseItems(content) {
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  }

  function handleDone() {
    if (multi) {
      // Multi-select: return all selected items
      const selectedItems = items.filter((_, i) => selected.has(i));
      if (selectedItems.length > 0) {
        ctx.submit({ component: 'List', value: selectedItems.join('\n') });
      }
    } else {
      // Single-select: return the one selected item
      if (selectedIndex >= 0) {
        ctx.submit({ component: 'List', value: items[selectedIndex] });
      }
    }
    ctx.pop();
  }

  function handleCancel() {
    ctx.pop();
  }

  function render() {
    view.clear();

    if (error) {
      view.add(Alert({ variant: 'error', message: error }));
      view.space(2);
      view.add(ButtonFullWidth({ label: 'Back', variant: 'ghost', onPress: handleCancel }));
      view.render();
      return;
    }

    if (items.length === 0) {
      view.add(Alert({ variant: 'warning', message: 'No items in list' }));
      view.space(2);
      view.add(ButtonFullWidth({ label: 'Back', variant: 'ghost', onPress: handleCancel }));
      view.render();
      return;
    }

    // Title
    if (title) {
      view.add(SectionHeading({ text: title }));
    }

    // Lead text (only if provided)
    if (lead) {
      view.add(Label({ text: lead, dim: true }));
      view.space();
    }
    view.space();

    // Items using ui-kit components
    if (multi) {
      for (let i = 0; i < items.length; i++) {
        const idx = i;
        view.add(Checkbox({
          label: items[i],
          value: selected.has(i),
          onChange: (v) => {
            if (v) selected.add(idx);
            else selected.delete(idx);
          }
        }));
      }
    } else {
      // Single-select
      for (let i = 0; i < items.length; i++) {
        const idx = i;
        view.add(Radio({
          label: items[i],
          selected: selectedIndex === i,
          onSelect: () => {
            selectedIndex = idx;
            render();
          }
        }));
      }
    }

    view.space(2);

    // Buttons - full width block style
    view.add(ButtonFullWidth({
      label: 'Done',
      shortcut: 'D',
      onPress: handleDone
    }));
    view.add(ButtonFullWidth({
      label: 'Cancel',
      variant: 'ghost',
      onPress: handleCancel
    }));

    view.render();
  }

  return {
    init: render,
    render,
    onKey(key) {
      // ESC to cancel
      if (key === 'ESCAPE' || key === 'ESC') {
        handleCancel();
        return true;
      }
      return view.handleKey(key);
    }
  };
}
