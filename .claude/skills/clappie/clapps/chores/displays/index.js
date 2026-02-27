// Chores - Human approval queue
//
// Actions: Reject, Revise (AI rewrite), Edit (manual), Approve

import {
  View,
  Label,
  ButtonFullWidth,
  Alert,
  Divider,
  TextInput,
} from '../../display-engine/ui-kit/index.js';
import { colors } from '../../display-engine/theme.js';
import { ansi } from '../../display-engine/layout/ansi.js';
import {
  getPendingChores,
  approveChore,
  rejectChore,
  shelveChore,
  getChoresDirModTime,
} from '../state.js';

export const maxWidth = 50;

// Revise form: input + bracketed buttons
function ReviseForm({ onUndo, onSubmit, maxWidth }) {
  let inputValue = '';

  const input = TextInput({
    placeholder: 'What should change?',
    width: maxWidth - 2,
    onChange: (v) => { inputValue = v; },
    onSubmit: () => onSubmit(inputValue),
  });

  // Two bracketed buttons: [ Nevermind ]    [ Submit ]
  const gap = '    ';
  const buttons = [
    { label: 'Nevermind', handler: onUndo },
    { label: 'Submit', handler: () => onSubmit(inputValue) },
  ];

  const buttonsComponent = {
    type: 'revise-buttons',
    focusable: true,
    _focused: 1, // Start on Submit

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
      // [ label ] = label.length + 4 for brackets and spaces
      return buttons.reduce((sum, b) => sum + b.label.length + 4, 0) + gap.length;
    },

    onKey(key) {
      if (key === 'LEFT') {
        this._focused = 0;
        return true;
      }
      if (key === 'RIGHT') {
        this._focused = 1;
        return true;
      }
      if (key === 'ENTER' || key === ' ') {
        buttons[this._focused].handler();
        return true;
      }
      return false;
    },

    onClick(lineIdx, clickCol) {
      // Calculate click positions accounting for brackets: [ label ]
      let pos = 0;
      for (let i = 0; i < buttons.length; i++) {
        const btnWidth = buttons[i].label.length + 4; // [ label ]
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

// Custom component: 4 buttons side by side
function ActionButtons({ onReject, onRevise, onEdit, onApprove }) {
  const gap = '   ';
  const buttons = [
    { label: 'Reject', handler: onReject },
    { label: 'Revise', handler: onRevise },
    { label: 'Edit', handler: onEdit },
    { label: 'Approve', handler: onApprove },
  ];

  return {
    type: 'action-buttons',
    focusable: true,
    _focused: 2, // Start on Edit
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
      // Calculate which button was clicked based on column position
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
  ctx.setTitle('Chores');
  ctx.setDescription('APPROVAL NEEDED');

  const view = new View(ctx);

  let pollInterval = null;
  let lastMtime = 0;
  let chores = [];
  let revisingChoreId = null;  // Track which chore is in revise mode
  let reviseForm = null;       // The ReviseForm components

  function loadChores() {
    chores = getPendingChores();
  }

  function formatAge(created) {
    if (!created) return '';
    try {
      const createdDate = new Date(created.replace(' ', 'T'));
      const now = new Date();
      const diffMs = now - createdDate;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'now';
      if (diffMins < 60) return `${diffMins}m`;
      if (diffHours < 24) return `${diffHours}h`;
      return `${diffDays}d`;
    } catch {
      return '';
    }
  }

  function handleApprove(choreId) {
    approveChore(choreId);
    ctx.submit({ component: 'Chore', value: `approved → ${choreId}` });
    ctx.toast('Sent to Claude');
    loadChores();
    render();
  }

  function handleReject(choreId) {
    rejectChore(choreId, '');
    ctx.toast('Rejected');
    loadChores();
    render();
  }

  function handleRevise(choreId) {
    revisingChoreId = choreId;
    reviseForm = ReviseForm({
      maxWidth,
      onUndo: () => {
        revisingChoreId = null;
        reviseForm = null;
        render();
      },
      onSubmit: (feedback) => {
        if (!feedback.trim()) {
          revisingChoreId = null;
          reviseForm = null;
          render();
          return;
        }
        // Shelve the chore (hide from queue while revising)
        shelveChore(choreId);
        ctx.submit({ component: 'Chore', value: `revise → ${choreId}\n  ${feedback}` });
        ctx.toast('Revising...');
        revisingChoreId = null;
        reviseForm = null;
        loadChores();
        render();
      },
    });
    render();
  }

  function handleEdit(chore) {
    ctx.push('utility/chore-editor', {
      file: `chores/humans/${chore.id}.txt`,
      choreId: chore.id,
      title: chore.title || chore.summary || chore.id,
    });
  }

  function handleApproveAll() {
    if (!chores.length) return;

    const ids = chores.map(c => c.id);
    for (const id of ids) {
      approveChore(id);
    }

    ctx.submit({
      component: 'Chores',
      value: `approved all\n${ids.map(id => `  → ${id}`).join('\n')}`
    });

    ctx.toast(`Approved ${ids.length}`);
    loadChores();
    render();
  }

  function render() {
    const c = colors();
    view.clear();

    if (chores.length === 0) {
      view.add(Alert({
        variant: 'success',
        message: 'No pending chores'
      }));
      view.render();
      return;
    }

    // List chores
    for (let i = 0; i < chores.length; i++) {
      const chore = chores[i];
      const icon = chore.icon || '';
      const title = chore.title || chore.summary || chore.id;  // fallback to summary for old chores
      const age = formatAge(chore.created);

      // Chore title line
      const iconPart = icon ? `${icon}  ` : '';
      const agePart = age ? `  ${ansi.dim}${age}${ansi.reset}` : '';

      view.add(Label({ text: `${iconPart}${title}${agePart}` }));

      // Summary line (if present)
      const summaryText = chore.summary !== title ? chore.summary : chore.description;  // fallback for old chores
      if (summaryText) {
        view.add(Label({ text: summaryText, dim: true }));
      }
      view.space();

      // Show revise form if revising this chore, otherwise show action buttons
      if (revisingChoreId === chore.id && reviseForm) {
        const inputComp = view.add(reviseForm.input);
        // Auto-focus the input
        view.focusIndex = view.components.indexOf(inputComp);
        view.add(reviseForm.buttons);  // No space - keep buttons tight to input
      } else {
        view.add(ActionButtons({
          onReject: () => handleReject(chore.id),
          onRevise: () => handleRevise(chore.id),
          onEdit: () => handleEdit(chore),
          onApprove: () => handleApprove(chore.id),
        }));
      }

      if (i < chores.length - 1) {
        view.space();
        view.add(Divider({}));
        view.space();
      }
    }

    // Approve all (only if multiple)
    if (chores.length > 1) {
      view.space();
      view.add(Divider({ variant: 'big' }));
      view.space();
      view.add(ButtonFullWidth({
        label: 'Approve All',
        shortcut: 'A',
        onPress: handleApproveAll
      }));
    }

    view.render();
  }

  return {
    init() {
      loadChores();
      lastMtime = getChoresDirModTime();
      render();

      // Poll for changes
      pollInterval = setInterval(() => {
        const newMtime = getChoresDirModTime();
        if (newMtime !== lastMtime) {
          lastMtime = newMtime;
          loadChores();
          render();
        }
      }, 1000);
    },

    render,

    onKey(key) {
      // ESC cancels revise mode
      if (key === 'ESC' && revisingChoreId) {
        revisingChoreId = null;
        reviseForm = null;
        render();
        return true;
      }
      if (key === 'A' && chores.length > 1 && !revisingChoreId) {
        handleApproveAll();
        return true;
      }
      return view.handleKey(key);
    },

    cleanup() {
      if (pollInterval) clearInterval(pollInterval);
    }
  };
}
