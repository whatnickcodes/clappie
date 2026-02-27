// Utility: Chore Editor - Edit and submit chores to AI

import { View, Textarea, Label, ButtonFullWidth, Alert, ButtonInline } from '../../display-engine/ui-kit/index.js';
import { colors } from '../../display-engine/theme.js';
import { ansi } from '../../display-engine/layout/ansi.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { approveChore } from '../../chores/state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

// Wider layout for editing
export const maxWidth = 80;

export function create(ctx) {
  const filePath = ctx.data?.file;
  const choreId = ctx.data?.choreId || (filePath ? basename(filePath, '.txt') : '');

  ctx.setTitle('Chore');
  ctx.setDescription('Submit your changes');

  const view = new View(ctx);

  // Load file content immediately
  let content = '';
  let originalContent = '';
  let error = null;

  if (!filePath) {
    error = 'No file specified';
  } else {
    const fullPath = join(PROJECT_ROOT, filePath);
    if (!existsSync(fullPath)) {
      error = `File not found: ${filePath}`;
    } else {
      try {
        content = readFileSync(fullPath, 'utf8');
        originalContent = content;
      } catch (err) {
        error = `Failed to read: ${err.message}`;
      }
    }
  }

  // Use passed title, or fall back to filename
  const fileName = filePath ? basename(filePath) : '';
  const textareaTitle = ctx.data?.title || fileName;

  // Create textarea ONCE at top level - with built-in edit toggle
  const textarea = !error ? Textarea({
    label: textareaTitle,  // Shows in header bar
    value: content,
    rows: Math.max(18, ctx.height - 6),
    width: 'full',
    showStatus: true,
    editToggle: true,  // Built-in header with edit/done toggle
    onChange: (v) => { content = v; },
    onEditChange: () => { render(); }  // Re-render when edit mode changes
  }) : null;

  function saveAndSubmit() {
    if (!filePath || !textarea) return;
    const fullPath = join(PROJECT_ROOT, filePath);
    try {
      content = textarea.getValue();
      writeFileSync(fullPath, content, 'utf8');
      originalContent = content;
      textarea.markSaved();

      // Mark chore as approved (updates status in file)
      approveChore(choreId);

      // Submit to AI
      ctx.submit({
        component: 'Chore',
        value: `approved → ${choreId}`
      });

      ctx.toast('Approved');
      ctx.pop();
    } catch (err) {
      ctx.toast(`Save failed: ${err.message}`);
    }
  }

  function hasChanges() {
    return textarea ? textarea.getValue() !== originalContent : false;
  }

  function render() {
    const c = colors();
    view.clear();

    if (error) {
      view.add(Alert({ variant: 'error', message: error }));
      view.space(2);
      view.add(ButtonInline({ label: 'Back', onPress: () => ctx.pop() }));
      view.render();
      return;
    }

    // Textarea (has its own header with title + edit toggle)
    view.add(textarea);
    view.space();

    // Approve button
    view.add(ButtonFullWidth({
      label: 'Approve',
      onPress: saveAndSubmit
    }));

    // Focus: textarea when editing, submit button when not
    const isEditing = textarea?.isEditing?.() ?? false;
    if (isEditing) {
      const textareaIdx = view.components.indexOf(textarea);
      view.focusIndex = textareaIdx >= 0 ? textareaIdx : 0;
    } else {
      view.focusIndex = 1;  // Focus submit button
    }

    view.render();
  }

  return {
    init() { render(); },
    render,
    onKey(key) {
      const handled = view.handleKey(key);
      if (handled) return true;

      if (key === 'ESCAPE') {
        if (!hasChanges()) ctx.pop();
        else ctx.toast('Unsaved changes');
        return true;
      }
      return false;
    },
    onScroll(direction) {
      const isEditing = textarea?.isEditing?.() ?? false;
      if (isEditing && textarea?.onScroll) {
        return textarea.onScroll(direction);
      }
      return false;
    }
  };
}
