// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  TEXTAREA - Multi-line text entry with word wrap                          ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    Textarea({ label: 'Bio', rows: 4, onChange: (v) => {} })               ║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    label       - Text shown above textarea (optional)                     ║
// ║    placeholder - Ghost text when empty (optional)                         ║
// ║    value       - Initial text (default: '')                               ║
// ║    width       - Width in chars or 'full' (default: 'full')               ║
// ║    rows        - Number of visible rows (default: 4)                      ║
// ║    onChange    - Function called with new value on each keystroke         ║
// ║    showStatus  - Show status line with cursor position (default: false)   ║
// ║    editToggle  - Show header bar with edit/done toggle (default: false)   ║
// ║    onEditChange - Callback when edit mode changes (optional)              ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { clappieError, clappieWarn } from '../errors.js';
import { ansi, visualWidth } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

export function Textarea(opts = {}) {
  if (!opts || typeof opts !== 'object') {
    clappieError('Textarea', 'options object required',
      'Usage: Textarea({ label: "Bio", rows: 4, onChange: (v) => {} })');
  }

  let {
    label = '',
    value = '',
    placeholder = '',
    width = 'full',
    rows = 4,
    onChange,
    showStatus = false,
    editToggle = false,
    onEditChange
  } = opts;

  const isFullWidth = width === 'full';

  // Validation
  if (label && typeof label !== 'string') {
    clappieError('Textarea', `label must be string, got ${typeof label}`,
      'Usage: Textarea({ label: "Bio", onChange: (v) => {} })');
  }

  if (typeof value !== 'string') {
    clappieWarn('Textarea', `value should be string, got ${typeof value}. Converting.`);
    value = String(value);
  }

  if (typeof rows !== 'number' || rows < 1) {
    clappieWarn('Textarea', `rows should be positive number, got ${rows}. Using default 4.`);
    rows = 4;
  }

  if (!isFullWidth && (typeof width !== 'number' || width < 1)) {
    clappieWarn('Textarea', `width should be positive number or 'full', got ${width}. Using default 30.`);
    width = 30;
  }

  if (onChange && typeof onChange !== 'function') {
    clappieError('Textarea', `onChange must be function, got ${typeof onChange}`,
      'Usage: Textarea({ label: "Bio", onChange: (v) => {} })');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────

  let lines = value ? value.split('\n') : [''];
  let cursorRow = 0;
  let cursorCol = 0;
  let scrollOffset = 0;

  // Modified tracking
  let initialValue = value;
  let isModified = false;

  // Edit mode (only used when editToggle is true)
  let _isEditing = !editToggle;  // Start in edit mode if no toggle, view mode if toggle enabled

  // ─────────────────────────────────────────────────────────────────────────
  // UNDO/REDO HISTORY
  // ─────────────────────────────────────────────────────────────────────────

  let history = [];
  let historyIndex = -1;
  let lastCheckpointTime = 0;
  const DEBOUNCE_MS = 300;
  const MAX_HISTORY = 100;
  const CHECKPOINT_CHARS = new Set([' ', '\n', '.', ',', '!', '?', ';', ':', '-', '(', ')']);

  function createSnapshot() {
    return {
      lines: lines.map(l => l),
      cursorRow,
      cursorCol
    };
  }

  function restoreSnapshot(snapshot) {
    lines = snapshot.lines.map(l => l);
    cursorRow = Math.min(snapshot.cursorRow, lines.length - 1);
    cursorCol = Math.min(snapshot.cursorCol, charCount(lines[cursorRow]));
  }

  function pushHistory(force = false) {
    const now = Date.now();

    if (!force && now - lastCheckpointTime < DEBOUNCE_MS) {
      return;
    }

    // Clear redo history
    if (historyIndex < history.length - 1) {
      history = history.slice(0, historyIndex + 1);
    }

    // Don't push duplicates
    const lastState = history[history.length - 1];
    const currentText = lines.join('\n');
    if (lastState && lastState.lines.join('\n') === currentText) {
      return;
    }

    history.push(createSnapshot());
    historyIndex = history.length - 1;
    lastCheckpointTime = now;

    // Enforce limit
    if (history.length > MAX_HISTORY) {
      history = history.slice(-MAX_HISTORY);
      historyIndex = history.length - 1;
    }
  }

  function undo() {
    if (historyIndex > 0) {
      historyIndex--;
      restoreSnapshot(history[historyIndex]);
      checkModified();
      if (onChange) onChange(lines.join('\n'));
      return true;
    }
    return false;
  }

  function redo() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      restoreSnapshot(history[historyIndex]);
      checkModified();
      if (onChange) onChange(lines.join('\n'));
      return true;
    }
    return false;
  }

  // Initialize history
  history.push(createSnapshot());
  historyIndex = 0;

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  const charCount = (line) => [...line].length;
  const charSlice = (line, start, end) => [...line].slice(start, end).join('');
  const charAt = (line, idx) => [...line][idx];

  function checkModified() {
    isModified = lines.join('\n') !== initialValue;
  }

  function triggerOnChange() {
    checkModified();
    if (onChange) onChange(lines.join('\n'));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WORD WRAP
  // ─────────────────────────────────────────────────────────────────────────

  function isBreakPoint(char) {
    return char === ' ' || char === '\t' || char === '-';
  }

  function wrapLine(line, maxWidth) {
    if (!line) return [{ text: '', startOffset: 0 }];
    if (visualWidth(line) <= maxWidth) return [{ text: line, startOffset: 0 }];

    const chars = [...line];
    const wrapped = [];
    let pos = 0;

    while (pos < chars.length) {
      // Skip leading spaces on continuation lines
      if (wrapped.length > 0) {
        while (pos < chars.length && chars[pos] === ' ') pos++;
      }
      if (pos >= chars.length) break;

      const textStartPos = pos;
      let width = 0;
      let lastBreakPos = -1;

      while (pos < chars.length) {
        const char = chars[pos];
        const charWidth = visualWidth(char);
        if (width + charWidth > maxWidth) break;
        width += charWidth;
        pos++;
        if (isBreakPoint(char)) lastBreakPos = pos;
      }

      let breakAt = pos >= chars.length ? pos :
                    lastBreakPos > textStartPos ? lastBreakPos : pos;

      let text = chars.slice(textStartPos, breakAt).join('');
      if (breakAt < chars.length) text = text.trimEnd();

      wrapped.push({ text, startOffset: textStartPos });
      pos = breakAt;
    }

    return wrapped.length ? wrapped : [{ text: '', startOffset: 0 }];
  }

  function getDisplayRows(maxWidth) {
    const displayRows = [];
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const wrapped = wrapLine(lines[lineIdx], maxWidth);
      for (let wrapIdx = 0; wrapIdx < wrapped.length; wrapIdx++) {
        displayRows.push({
          text: wrapped[wrapIdx].text,
          lineIdx,
          wrapIdx,
          colOffset: wrapped[wrapIdx].startOffset
        });
      }
    }
    return displayRows;
  }

  function getCursorDisplayRow(displayRows) {
    for (let i = 0; i < displayRows.length; i++) {
      const row = displayRows[i];
      if (row.lineIdx === cursorRow) {
        const rowCharCount = [...row.text].length;
        const isLastRowOfLine = i === displayRows.length - 1 || displayRows[i + 1]?.lineIdx !== cursorRow;
        const nextRowStart = isLastRowOfLine ? charCount(lines[cursorRow]) + 1 : displayRows[i + 1].colOffset;

        if (cursorCol < nextRowStart) {
          const colInRow = Math.min(cursorCol - row.colOffset, rowCharCount);
          return { displayRowIdx: i, colInRow: Math.max(0, colInRow) };
        }
      }
    }
    return { displayRowIdx: 0, colInRow: 0 };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCROLL INDICATOR
  // ─────────────────────────────────────────────────────────────────────────

  function renderScrollIndicator(visibleRows, totalDisplayRows, currentScrollOffset) {
    const c = colors();
    const trackColor = ansi.fg.rgb(...c.textMuted);
    const thumbColor = ansi.fg.rgb(...c.primary);
    const reset = ansi.reset;

    if (totalDisplayRows <= visibleRows) return null;

    const scrollableRange = totalDisplayRows - visibleRows;
    const thumbSize = Math.max(1, Math.round(visibleRows * (visibleRows / totalDisplayRows)));
    const thumbStart = Math.round((currentScrollOffset / scrollableRange) * (visibleRows - thumbSize));

    const indicator = [];
    for (let i = 0; i < visibleRows; i++) {
      if (i >= thumbStart && i < thumbStart + thumbSize) {
        indicator.push(`${thumbColor}┃${reset}`);
      } else {
        indicator.push(`${trackColor}│${reset}`);
      }
    }
    return indicator;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COMPONENT
  // ─────────────────────────────────────────────────────────────────────────

  const component = {
    type: 'textarea',
    focusable: true,

    render(focused = false) {
      const output = [];
      const c = colors();
      const accent = ansi.fg.rgb(...c.primaryFocused);
      const mutedColor = ansi.fg.rgb(...c.textMuted);
      const textColor = ansi.fg.rgb(...c.text);
      const reset = ansi.reset;
      const border = focused ? accent : mutedColor;

      const totalWidth = isFullWidth ? (component._containerWidth || 40) - 2 : width;

      // Reserve space for scroll indicator
      const displayRows = getDisplayRows(totalWidth);
      const hasScrollbar = displayRows.length > rows;
      const scrollbarWidth = hasScrollbar ? 1 : 0;
      const effectiveWidth = totalWidth - scrollbarWidth;

      // Recalculate with correct width
      const displayRowsFinal = getDisplayRows(effectiveWidth);
      const { displayRowIdx: cursorDisplayRow, colInRow: cursorColInRow } = getCursorDisplayRow(displayRowsFinal);

      // Auto-scroll
      if (cursorDisplayRow < scrollOffset) {
        scrollOffset = cursorDisplayRow;
      } else if (cursorDisplayRow >= scrollOffset + rows) {
        scrollOffset = cursorDisplayRow - rows + 1;
      }

      const scrollIndicator = renderScrollIndicator(rows, displayRowsFinal.length, scrollOffset);

      // Label (only if not using editToggle - editToggle puts label in header bar)
      if (label && !editToggle) {
        output.push(focused ? `${accent}${label}${reset}` : `${textColor}${label}${reset}`);
      }

      // Top border
      output.push(`${border}╭${'─'.repeat(totalWidth)}╮${reset}`);

      // Header bar with edit toggle (optional, click to toggle)
      if (editToggle) {
        const toggleLabel = _isEditing
          ? `${accent}[ Done ]${reset}`
          : `${mutedColor}[ Edit ]${reset}`;
        const toggleWidth = 8;  // "[ Done ]" or "[ Edit ]"
        const minPadding = 2;   // Minimum space between title and button

        // Optional title on the left (use label field), truncate if too long
        const maxTitleWidth = totalWidth - toggleWidth - minPadding;
        let displayTitle = label || '';
        if (visualWidth(displayTitle) > maxTitleWidth) {
          // Truncate with ellipsis
          const chars = [...displayTitle];
          let truncated = '';
          let w = 0;
          for (const char of chars) {
            if (w + visualWidth(char) + 1 > maxTitleWidth) break;  // +1 for ellipsis
            truncated += char;
            w += visualWidth(char);
          }
          displayTitle = truncated + '…';
        }
        const titleText = displayTitle ? `${mutedColor}${displayTitle}${reset}` : '';
        const titleWidth = visualWidth(displayTitle);

        const middlePad = Math.max(minPadding, totalWidth - titleWidth - toggleWidth);
        output.push(`${border}│${reset}${titleText}${' '.repeat(middlePad)}${toggleLabel}${border}│${reset}`);
        output.push(`${border}├${'─'.repeat(totalWidth)}┤${reset}`);
      }

      // Content rows
      for (let i = 0; i < rows; i++) {
        const displayRowIdx = scrollOffset + i;
        const row = displayRowsFinal[displayRowIdx];
        let display = '';

        if (!row) {
          display = ' '.repeat(effectiveWidth);
        } else if (focused && _isEditing && displayRowIdx === cursorDisplayRow) {
          // Show cursor only when focused AND in edit mode
          const chars = [...row.text];
          const before = chars.slice(0, cursorColInRow).join('');
          const cursorChar = chars[cursorColInRow] || ' ';
          const after = chars.slice(cursorColInRow + 1).join('');
          const lineWidth = visualWidth(row.text);
          const padding = ' '.repeat(Math.max(0, effectiveWidth - lineWidth - (cursorChar === ' ' ? 1 : 0)));
          display = `${textColor}${before}${ansi.inverse}${cursorChar}${reset}${textColor}${after}${reset}${padding}`;
        } else if (!lines.join('') && placeholder && displayRowIdx === 0 && !focused) {
          const truncated = [...placeholder].slice(0, effectiveWidth).join('');
          const pw = visualWidth(truncated);
          display = `${mutedColor}${truncated}${reset}${' '.repeat(Math.max(0, effectiveWidth - pw))}`;
        } else if (row) {
          const lw = visualWidth(row.text);
          display = `${textColor}${row.text}${reset}${' '.repeat(Math.max(0, effectiveWidth - lw))}`;
        }

        const scrollChar = scrollIndicator ? scrollIndicator[i] : '';
        output.push(`${border}│${reset}${display}${scrollChar}${border}│${reset}`);
      }

      // Status line (optional)
      if (showStatus) {
        const posInfo = `Ln ${cursorRow + 1}, Col ${cursorCol + 1}`;
        const lineCount = `${lines.length} line${lines.length !== 1 ? 's' : ''}`;
        const modIndicator = isModified ? `${accent}●${reset} ` : '  ';

        const leftStatus = `${modIndicator}${mutedColor}${posInfo}${reset}`;
        const rightStatus = `${mutedColor}${lineCount}${reset}`;
        const leftWidth = 2 + posInfo.length;
        const rightWidth = lineCount.length;
        const middlePad = Math.max(1, totalWidth - leftWidth - rightWidth);

        output.push(`${border}├${'─'.repeat(totalWidth)}┤${reset}`);
        output.push(`${border}│${reset}${leftStatus}${' '.repeat(middlePad)}${rightStatus}${border}│${reset}`);
      }

      // Bottom border
      output.push(`${border}╰${'─'.repeat(totalWidth)}╯${reset}`);

      return output;
    },

    getWidth() {
      return isFullWidth ? (component._containerWidth || 40) : width + 2;
    },

    onKey(key) {
      const totalWidth = isFullWidth ? (component._containerWidth || 40) - 2 : width;
      const effectiveWidth = totalWidth - 1; // Account for potential scrollbar
      const displayRows = getDisplayRows(effectiveWidth);
      const { displayRowIdx: cursorDisplayRow } = getCursorDisplayRow(displayRows);

      // If not in edit mode, only allow navigation (not editing)
      // Edit mode is toggled by clicking the header bar
      const canEdit = _isEditing;

      // Undo/Redo (only in edit mode)
      if (canEdit && key === 'CTRL_Z') return undo();
      if (canEdit && key === 'CTRL_Y') return redo();

      // Navigation
      if (key === 'UP') {
        if (cursorDisplayRow > 0) {
          const targetRow = displayRows[cursorDisplayRow - 1];
          const targetCharCount = charCount(targetRow.text);
          cursorRow = targetRow.lineIdx;
          cursorCol = Math.min(targetRow.colOffset + Math.min(cursorCol - (displayRows[cursorDisplayRow]?.colOffset || 0), targetCharCount), charCount(lines[cursorRow]));
        }
        return true;
      }

      if (key === 'DOWN') {
        if (cursorDisplayRow < displayRows.length - 1) {
          const currentRow = displayRows[cursorDisplayRow];
          const targetRow = displayRows[cursorDisplayRow + 1];
          const colInCurrent = cursorCol - (currentRow?.colOffset || 0);
          const targetCharCount = charCount(targetRow.text);
          cursorRow = targetRow.lineIdx;
          cursorCol = Math.min(targetRow.colOffset + Math.min(colInCurrent, targetCharCount), charCount(lines[cursorRow]));
        }
        return true;
      }

      if (key === 'LEFT') {
        if (cursorCol > 0) cursorCol--;
        else if (cursorRow > 0) {
          cursorRow--;
          cursorCol = charCount(lines[cursorRow]);
        }
        return true;
      }

      if (key === 'RIGHT') {
        const lineLen = charCount(lines[cursorRow]);
        if (cursorCol < lineLen) cursorCol++;
        else if (cursorRow < lines.length - 1) {
          cursorRow++;
          cursorCol = 0;
        }
        return true;
      }

      if (key === 'HOME' || key === 'CTRL_A') { cursorCol = 0; return true; }
      if (key === 'END' || key === 'CTRL_E') { cursorCol = charCount(lines[cursorRow]); return true; }

      if (key === 'PAGEUP') {
        const targetRow = displayRows[Math.max(0, cursorDisplayRow - rows)];
        if (targetRow) {
          cursorRow = targetRow.lineIdx;
          cursorCol = Math.min(targetRow.colOffset + charCount(targetRow.text), charCount(lines[cursorRow]));
        }
        return true;
      }

      if (key === 'PAGEDOWN') {
        const targetRow = displayRows[Math.min(displayRows.length - 1, cursorDisplayRow + rows)];
        if (targetRow) {
          cursorRow = targetRow.lineIdx;
          cursorCol = Math.min(targetRow.colOffset + charCount(targetRow.text), charCount(lines[cursorRow]));
        }
        return true;
      }

      if (key === 'CTRL_LEFT') {
        const chars = [...lines[cursorRow]];
        while (cursorCol > 0 && chars[cursorCol - 1] === ' ') cursorCol--;
        while (cursorCol > 0 && chars[cursorCol - 1] !== ' ') cursorCol--;
        return true;
      }

      if (key === 'CTRL_RIGHT') {
        const chars = [...lines[cursorRow]];
        while (cursorCol < chars.length && chars[cursorCol] !== ' ') cursorCol++;
        while (cursorCol < chars.length && chars[cursorCol] === ' ') cursorCol++;
        return true;
      }

      // Editing (only allowed in edit mode)
      if (canEdit && key === 'BACKSPACE') {
        pushHistory();
        if (cursorCol > 0) {
          lines[cursorRow] = charSlice(lines[cursorRow], 0, cursorCol - 1) + charSlice(lines[cursorRow], cursorCol);
          cursorCol--;
        } else if (cursorRow > 0) {
          cursorCol = charCount(lines[cursorRow - 1]);
          lines[cursorRow - 1] += lines[cursorRow];
          lines.splice(cursorRow, 1);
          cursorRow--;
        }
        triggerOnChange();
        return true;
      }

      if (canEdit && key === 'DELETE') {
        pushHistory();
        const lineLen = charCount(lines[cursorRow]);
        if (cursorCol < lineLen) {
          lines[cursorRow] = charSlice(lines[cursorRow], 0, cursorCol) + charSlice(lines[cursorRow], cursorCol + 1);
        } else if (cursorRow < lines.length - 1) {
          lines[cursorRow] += lines[cursorRow + 1];
          lines.splice(cursorRow + 1, 1);
        }
        triggerOnChange();
        return true;
      }

      if (canEdit && key === 'ENTER') {
        pushHistory(true);
        const before = charSlice(lines[cursorRow], 0, cursorCol);
        const after = charSlice(lines[cursorRow], cursorCol);
        lines[cursorRow] = before;
        lines.splice(cursorRow + 1, 0, after);
        cursorRow++;
        cursorCol = 0;
        triggerOnChange();
        return true;
      }

      // Printable character (only in edit mode)
      if (canEdit && key.length >= 1 && key.codePointAt(0) >= 32) {
        if (CHECKPOINT_CHARS.has(key)) pushHistory(true);
        else pushHistory();

        lines[cursorRow] = charSlice(lines[cursorRow], 0, cursorCol) + key + charSlice(lines[cursorRow], cursorCol);
        cursorCol++;
        triggerOnChange();
        return true;
      }

      return false;
    },

    onClick(row, col) {
      const totalWidth = isFullWidth ? (component._containerWidth || 40) - 2 : width;
      const effectiveWidth = totalWidth - 1;

      // Row layout: [label if no editToggle] + top border + [header if editToggle] + content rows + [status?] + bottom border
      // When editToggle is on, label is INSIDE the header bar, not a separate line
      const labelOffset = (label && !editToggle) ? 1 : 0;
      const borderTopOffset = 1;
      const headerOffset = editToggle ? 2 : 0;  // header line + divider
      const contentRowClicked = row - labelOffset - borderTopOffset - headerOffset;

      // Click on header area - toggle edit mode
      if (editToggle && row >= labelOffset + borderTopOffset && row < labelOffset + borderTopOffset + headerOffset) {
        _isEditing = !_isEditing;
        if (onEditChange) onEditChange(_isEditing);
        return true;
      }

      // Outside content area - return false to signal blur
      if (contentRowClicked < 0 || contentRowClicked >= rows) return false;

      // Column layout: left border (1) + content + [scrollbar] + right border (1)
      const contentCol = Math.max(0, Math.min(col - 1, effectiveWidth - 1));

      const displayRows = getDisplayRows(effectiveWidth);
      const displayRowIdx = scrollOffset + contentRowClicked;

      // Below content - move to end of last line
      if (displayRowIdx >= displayRows.length) {
        cursorRow = lines.length - 1;
        cursorCol = charCount(lines[cursorRow]);
        return true;  // Click was accepted (moved cursor)
      }

      const targetRow = displayRows[displayRowIdx];
      cursorRow = targetRow.lineIdx;

      // Map visual column to character position
      const chars = [...targetRow.text];
      let charIndex = 0;
      let visualPos = 0;

      for (let i = 0; i < chars.length; i++) {
        const charWidth = visualWidth(chars[i]);
        if (contentCol < visualPos + charWidth) {
          charIndex = (contentCol - visualPos < charWidth / 2) ? i : i + 1;
          break;
        }
        visualPos += charWidth;
        charIndex = i + 1;
      }

      cursorCol = Math.min(targetRow.colOffset + charIndex, charCount(lines[cursorRow]));
      return true;  // Click was accepted
    },

    getValue() {
      return lines.join('\n');
    },

    setValue(v) {
      if (typeof v !== 'string') {
        clappieWarn('Textarea.setValue', `expected string, got ${typeof v}`);
        v = String(v);
      }
      pushHistory(true);
      lines = v ? v.split('\n') : [''];
      cursorRow = 0;
      cursorCol = 0;
      scrollOffset = 0;
      checkModified();
    },

    onScroll(direction) {
      const totalWidth = isFullWidth ? (component._containerWidth || 40) - 2 : width;
      const effectiveWidth = totalWidth - 1;
      const displayRows = getDisplayRows(effectiveWidth);
      const maxScroll = Math.max(0, displayRows.length - rows);
      scrollOffset = Math.max(0, Math.min(maxScroll, scrollOffset + direction * 3));
      return true;
    },

    // Public API
    markSaved() {
      initialValue = lines.join('\n');
      isModified = false;
    },

    isModified() {
      return isModified;
    },

    undo,
    redo,

    getCursorPosition() {
      return { line: cursorRow + 1, column: cursorCol + 1 };
    },

    // Edit mode API (for editToggle mode)
    isEditing() {
      return _isEditing;
    },

    setEditing(editing) {
      if (editToggle) {
        const wasEditing = _isEditing;
        _isEditing = editing;
        if (wasEditing !== _isEditing && onEditChange) {
          onEditChange(_isEditing);
        }
      }
    },

    enterEditMode() {
      this.setEditing(true);
    },

    exitEditMode() {
      this.setEditing(false);
    }
  };

  return component;
}
