// Notifications - The Dashboard
//
// Mirrors chores pattern: title, summary, inline action buttons
// File-based editing, AI-friendly

import {
  View,
  Label,
  Alert,
  Divider,
  TextInput,
  ButtonFullWidth,
} from '../../display-engine/ui-kit/index.js';
import { colors } from '../../display-engine/theme.js';
import { ansi } from '../../display-engine/layout/ansi.js';
import {
  getCleanItems,
  deleteCleanItem,
  getCleanDirModTime,
  logProcessing,
} from '../state.js';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');
const CHORES_DIR = join(PROJECT_ROOT, 'chores', 'humans');

export const maxWidth = 65;

// Wrap text to fit width
function wrapText(text, width) {
  if (!text || text.length <= width) return [text];

  const lines = [];
  const words = text.split(' ');
  let line = '';

  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (test.length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  return lines;
}

// Action form: input + bracketed buttons (copied from chores)
function ActionForm({ onCancel, onSubmit, maxWidth }) {
  let inputValue = '';

  const input = TextInput({
    placeholder: 'What should happen?',
    width: maxWidth - 2,
    onChange: (v) => { inputValue = v; },
    onSubmit: () => onSubmit(inputValue),
  });

  const gap = '    ';
  const buttons = [
    { label: 'Cancel', handler: onCancel },
    { label: 'Submit', handler: () => onSubmit(inputValue) },
  ];

  const buttonsComponent = {
    type: 'action-form-buttons',
    focusable: true,
    _focused: 1,

    render(focused) {
      const c = colors();
      const coral = ansi.fg.rgb(...c.primary);
      const dim = ansi.fg.rgb(...c.textMuted);
      const reset = ansi.reset;

      const parts = [];
      for (let i = 0; i < buttons.length; i++) {
        const b = buttons[i];
        const isFocused = focused && i === this._focused;
        const bracketColor = isFocused ? coral : dim;
        const textColor = isFocused ? coral : dim;
        parts.push(`${bracketColor}[${reset} ${textColor}${b.label}${reset} ${bracketColor}]${reset}`);
      }
      return [parts.join(gap)];
    },

    getWidth() {
      return buttons.reduce((sum, b) => sum + b.label.length + 4, 0) + gap.length;
    },

    onKey(key) {
      if (key === 'LEFT') { this._focused = 0; return true; }
      if (key === 'RIGHT') { this._focused = 1; return true; }
      if (key === 'ENTER' || key === ' ') { buttons[this._focused].handler(); return true; }
      return false;
    },

    onClick(lineIdx, clickCol) {
      let pos = 0;
      for (let i = 0; i < buttons.length; i++) {
        const btnWidth = buttons[i].label.length + 4;
        if (clickCol >= pos && clickCol < pos + btnWidth) {
          this._focused = i;
          buttons[i].handler();
          return;
        }
        pos += btnWidth + gap.length;
      }
    }
  };

  return { input, buttons: buttonsComponent };
}

// Inline action buttons (copied from chores pattern)
function ActionButtons({ onDismiss, onView, onAction, onChore, hasChore }) {
  const gap = '   ';
  const buttons = [
    { label: 'Dismiss', handler: onDismiss },
    { label: 'View', handler: onView },
    { label: 'Ask', handler: onAction },
  ];

  if (hasChore) {
    buttons.push({ label: 'Chore', handler: onChore });
  }

  return {
    type: 'notification-buttons',
    focusable: true,
    _focused: 1, // Start on View
    buttons,

    render(focused) {
      const c = colors();
      const coral = ansi.fg.rgb(...c.primary);
      const text = ansi.fg.rgb(...c.text);
      const dim = ansi.fg.rgb(...c.textMuted);
      const reset = ansi.reset;

      const labelParts = [];
      const underParts = [];

      for (let i = 0; i < buttons.length; i++) {
        const b = buttons[i];
        const isFocused = focused && i === this._focused;
        const color = isFocused ? coral : text;
        const underColor = isFocused ? coral : dim;

        labelParts.push(`${color}${b.label}${reset}`);
        underParts.push(`${underColor}${'━'.repeat(b.label.length)}${reset}`);
      }

      return [
        labelParts.join(gap),
        underParts.join(gap)
      ];
    },

    getWidth() {
      return buttons.reduce((s, b) => s + b.label.length, 0) + gap.length * (buttons.length - 1);
    },

    onKey(key) {
      if (key === 'LEFT') {
        this._focused = Math.max(0, this._focused - 1);
        return true;
      }
      if (key === 'RIGHT') {
        this._focused = Math.min(buttons.length - 1, this._focused + 1);
        return true;
      }
      if (key === 'ENTER' || key === ' ') {
        buttons[this._focused].handler();
        return true;
      }
      return false;
    },

    onClick(lineIdx, clickCol) {
      let pos = 0;
      for (let i = 0; i < buttons.length; i++) {
        const btnEnd = pos + buttons[i].label.length;
        if (clickCol >= pos && clickCol < btnEnd) {
          this._focused = i;
          buttons[i].handler();
          return;
        }
        pos = btnEnd + gap.length;
      }
    }
  };
}

export function create(ctx) {
  ctx.setTitle('Notifications');
  ctx.setDescription('The latest');

  const view = new View(ctx);

  let pollInterval = null;
  let lastMtime = 0;
  let items = [];
  let actioningItemId = null;
  let actionForm = null;

  function loadItems() {
    items = getCleanItems();
  }

  function hasLinkedChore(item) {
    if (!item.chore) return false;
    return existsSync(join(CHORES_DIR, `${item.chore}.txt`));
  }

  function handleDismiss(item) {
    logProcessing(`DISMISSED ${item.id}\n  title: ${item.title || item.id}`);
    deleteCleanItem(item.id);
    ctx.toast('Dismissed');
    loadItems();
    render();
  }

  function handleView(item) {
    ctx.push('utility/viewer', {
      file: `notifications/clean/${item.id}.txt`,
      title: item.title || item.id,
    });
  }

  function handleAction(itemId) {
    actioningItemId = itemId;
    actionForm = ActionForm({
      maxWidth,
      onCancel: () => {
        actioningItemId = null;
        actionForm = null;
        render();
      },
      onSubmit: (instruction) => {
        if (!instruction.trim()) {
          actioningItemId = null;
          actionForm = null;
          render();
          return;
        }

        const item = items.find(i => i.id === itemId);
        if (item) {
          ctx.submit({
            component: 'Notification',
            value: `action → ${itemId}\n  instruction: ${instruction}\n  title: ${item.title || ''}\n  body: ${item.body.slice(0, 200)}`
          });
        }

        ctx.toast('Sent to Claude');
        actioningItemId = null;
        actionForm = null;
        loadItems();
        render();
      },
    });
    render();
  }

  function handleChore(item) {
    if (item.chore) {
      ctx.push('utility/chore-editor', {
        file: `chores/humans/${item.chore}.txt`,
        title: item.chore,
      });
    }
  }

  function handleDismissAll() {
    if (!items.length) return;

    const logLines = [`DISMISSED ALL (${items.length} items)`];
    for (const item of items) {
      logLines.push(`  - ${item.id}`);
      if (item.title) logLines.push(`    title: ${item.title}`);
      if (item.source) logLines.push(`    source: ${item.source}`);
    }
    logProcessing(logLines.join('\n'));

    for (const item of items) {
      deleteCleanItem(item.id);
    }
    ctx.toast(`Dismissed ${items.length}`);
    loadItems();
    render();
  }

  function render() {
    const c = colors();
    view.clear();

    ctx.setDescription('The latest');

    if (items.length === 0) {
      view.add(Alert({
        variant: 'success',
        message: 'All clear'
      }));
      view.render();
      return;
    }

    // List items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const icon = item.icon || '📌';
      const title = item.title || item.body.split('\n')[0].slice(0, 40);
      const hasChore = hasLinkedChore(item);

      // Title line
      view.add(Label({ text: `${icon}  ${title}` }));

      // Summary line(s) - wrap to fit screen
      const summary = item.summary || item.body.split('\n')[0];
      if (summary && summary !== title) {
        const wrapWidth = Math.min(maxWidth, ctx.width) - 6;
        for (const line of wrapText(summary, wrapWidth)) {
          view.add(Label({ text: line, dim: true }));
        }
      }

      view.space();

      // Action form or buttons
      if (actioningItemId === item.id && actionForm) {
        const inputComp = view.add(actionForm.input);
        view.focusIndex = view.components.indexOf(inputComp);
        view.add(actionForm.buttons);
      } else {
        view.add(ActionButtons({
          onDismiss: () => handleDismiss(item),
          onView: () => handleView(item),
          onAction: () => handleAction(item.id),
          onChore: () => handleChore(item),
          hasChore,
        }));
      }

      if (i < items.length - 1) {
        view.space();
        view.add(Divider({}));
        view.space();
      }
    }

    // Dismiss all (only if multiple)
    if (items.length > 1) {
      view.space();
      view.add(Divider({ variant: 'big' }));
      view.space();
      view.add(ButtonFullWidth({
        label: 'Dismiss All',
        shortcut: 'A',
        onPress: handleDismissAll
      }));
    }

    view.render();
  }

  return {
    init() {
      loadItems();
      lastMtime = getCleanDirModTime();
      render();

      pollInterval = setInterval(() => {
        const newMtime = getCleanDirModTime();
        if (newMtime !== lastMtime) {
          lastMtime = newMtime;
          loadItems();
          render();
        }
      }, 1000);
    },

    render,

    onKey(key) {
      if (key === 'ESC' && actioningItemId) {
        actioningItemId = null;
        actionForm = null;
        render();
        return true;
      }
      if (key === 'A' && items.length > 1 && !actioningItemId) {
        handleDismissAll();
        return true;
      }
      return view.handleKey(key);
    },

    cleanup() {
      if (pollInterval) clearInterval(pollInterval);
    }
  };
}
