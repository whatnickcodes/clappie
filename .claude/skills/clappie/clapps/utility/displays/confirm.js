// Utility: Confirmation Dialog
//
// A reusable confirmation dialog for any clapp or skill.
//
// Usage:
//   ctx.push('utility/confirm', { message: 'Delete 3 files?' });
//   ctx.push('utility/confirm', { message: 'Send email?', variant: 'danger' });
//   ctx.push('utility/confirm', { file: 'path/to/message.txt' });
//   ctx.push('utility/confirm', {
//     lead: 'Please confirm your choice',
//     message: 'Are you sure?',
//     options: 'Yes\nNo\nMaybe later'  // newline-separated options
//   });
//
// Returns via submit:
//   [clappie] Confirm -> yes (or the option text for custom options)
//   [clappie] Confirm -> no

import { View, Label, ButtonFullWidth } from '../../display-engine/ui-kit/index.js';
import { visualWidth, stripAnsi } from '../../display-engine/layout/ansi.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

export const maxWidth = 50;

export function create(ctx) {
  ctx.setTitle('Confirm');
  ctx.setDescription('Yes or No');

  // Extract options
  const {
    message: providedMessage,
    file,
    lead,  // Optional lead/description text
    options: optionsStr,  // Newline-separated options
    confirmLabel = 'Yes',
    cancelLabel = 'No',
    variant = 'info'  // 'info' or 'danger'
  } = ctx.data || {};

  // Parse options - either from options string or confirmLabel/cancelLabel
  let optionsList;
  if (optionsStr) {
    optionsList = optionsStr.split('\n').map(o => o.trim()).filter(o => o);
  } else {
    optionsList = [confirmLabel, cancelLabel];
  }

  // Load message from file if specified
  let message = providedMessage;
  let error = null;

  if (file && !message) {
    const fullPath = join(PROJECT_ROOT, file);
    if (!existsSync(fullPath)) {
      error = `File not found: ${file}`;
    } else {
      try {
        const content = readFileSync(fullPath, 'utf8').trim();
        // First line is the message
        message = content.split('\n')[0];
      } catch (err) {
        error = `Failed to read: ${err.message}`;
      }
    }
  }

  if (!message && !error) {
    error = 'No message provided';
  }

  const view = new View(ctx);

  function selectOption(option, index) {
    // For default Yes/No, return 'yes' or 'no' for backwards compatibility
    let value;
    if (!optionsStr) {
      value = index === 0 ? 'yes' : 'no';
    } else {
      value = option.toLowerCase();
    }
    ctx.submit({ component: 'Confirm', value });
    ctx.pop();
  }

  function render() {
    view.clear();

    if (error) {
      view.add(Label({ text: `Error: ${error}`, dim: true }));
      view.space(2);
      view.add(ButtonFullWidth({
        label: 'Back',
        shortcut: 'B',
        variant: 'ghost',
        onPress: () => ctx.pop()
      }));
      view.render();
      return;
    }

    view.space();

    // Lead text (optional description above the message)
    if (lead) {
      const wrappedLead = wrapText(lead, maxWidth - 4);
      for (const line of wrappedLead) {
        view.add(Label({ text: line, dim: true }));
      }
      view.space();
    }

    // Main message (with word wrapping)
    const wrapped = wrapText(message, maxWidth - 4);
    for (const line of wrapped) {
      view.add(Label({ text: line }));
    }

    view.space();

    // Buttons - for 2 options (Yes/No style): first filled, second ghost
    // For 3+ options: all ghost (equal choices)
    const isSimpleConfirm = optionsList.length === 2;

    optionsList.forEach((option, index) => {
      const isFirst = index === 0;
      const shortcutKey = getShortcutKey(option, index);

      // Simple confirm: first filled, second ghost. Multi-option: all ghost
      const buttonVariant = (isSimpleConfirm && isFirst) ? 'filled' : 'ghost';

      view.add(ButtonFullWidth({
        label: option,
        shortcut: shortcutKey,
        variant: buttonVariant,
        onPress: () => selectOption(option, index)
      }));
    });

    // Start with first button focused
    view.focusIndex = 0;
    view.render();
  }

  return {
    init() { render(); },
    render,
    onKey(key) {
      // Check for option shortcuts
      for (let i = 0; i < optionsList.length; i++) {
        const shortcut = getShortcutKey(optionsList[i], i);
        if (key.toUpperCase() === shortcut) {
          selectOption(optionsList[i], i);
          return true;
        }
      }

      // ESC cancels (selects last option)
      if (key === 'ESCAPE') {
        selectOption(optionsList[optionsList.length - 1], optionsList.length - 1);
        return true;
      }

      return view.handleKey(key);
    }
  };
}

// Get shortcut key for an option
function getShortcutKey(option, index) {
  // Use first letter of option, or fallback to number
  const firstChar = option.charAt(0).toUpperCase();
  // Common shortcuts: Y for Yes, N for No, otherwise use first letter
  if (option.toLowerCase() === 'yes') return 'Y';
  if (option.toLowerCase() === 'no') return 'N';
  return firstChar;
}

// Simple text wrapping helper
function wrapText(text, maxWidth) {
  if (visualWidth(stripAnsi(text)) <= maxWidth) {
    return [text];
  }

  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (visualWidth(stripAnsi(testLine)) <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}
