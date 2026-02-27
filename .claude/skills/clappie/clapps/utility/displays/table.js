// Utility: Table Viewer
//
// Usage:
//   ctx.push('utility/table', { data: 'name,age,role\nBob,30,dev\nAlice,25,design' });
//   ctx.push('utility/table', { file: 'path/to/data.csv', title: 'Users' });
//
// Data format:
//   First line is headers, comma-separated, spaces trimmed
//
// Navigation:
//   Up/Down - Navigate rows
//   Enter - Select row and return to caller
//   ESC - Close without selection

import { View, Label, SectionHeading, Alert } from '../../display-engine/ui-kit/index.js';
import { colors } from '../../display-engine/theme.js';
import { ansi, visualWidth, stripAnsi } from '../../display-engine/layout/ansi.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

export const maxWidth = 70;

// Box-drawing characters
const BOX = {
  topLeft: '\u250c',      // ┌
  topRight: '\u2510',     // ┐
  bottomLeft: '\u2514',   // └
  bottomRight: '\u2518',  // ┘
  horizontal: '\u2500',   // ─
  vertical: '\u2502',     // │
  teeDown: '\u252c',      // ┬
  teeUp: '\u2534',        // ┴
  teeRight: '\u251c',     // ├
  teeLeft: '\u2524',      // ┤
  cross: '\u253c',        // ┼
};

export function create(ctx) {
  const title = ctx.data?.title || 'Table';
  ctx.setTitle(title);
  ctx.setDescription('View data');

  const view = new View(ctx);

  // Parse data
  let headers = [];
  let rows = [];
  let error = null;

  // Get raw data from ctx.data.data or ctx.data.file
  let rawData = '';

  if (ctx.data?.data) {
    rawData = ctx.data.data;
  } else if (ctx.data?.file) {
    const filePath = ctx.data.file;
    const fullPath = filePath.startsWith('/') ? filePath : join(PROJECT_ROOT, filePath);
    if (!existsSync(fullPath)) {
      error = `File not found: ${filePath}`;
    } else {
      try {
        rawData = readFileSync(fullPath, 'utf8');
      } catch (err) {
        error = `Failed to read file: ${err.message}`;
      }
    }
  } else {
    error = 'No data provided. Pass data or file in ctx.data';
  }

  // Parse CSV-style data
  if (!error && rawData) {
    const lines = rawData.trim().split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      error = 'No data to display';
    } else {
      // First line is headers
      headers = lines[0].split(',').map(h => h.trim());
      // Rest are rows
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',').map(c => c.trim());
        rows.push(cells);
      }
    }
  }

  // Calculate column widths (max of header and all cell values)
  let colWidths = [];
  if (!error) {
    colWidths = headers.map((h, i) => {
      let maxWidth = visualWidth(h);
      for (const row of rows) {
        const cellWidth = visualWidth(row[i] || '');
        if (cellWidth > maxWidth) maxWidth = cellWidth;
      }
      return maxWidth;
    });
  }

  // State
  let selectedRow = 0;
  let scrollOffset = 0;

  // Helper: pad string to width
  function padRight(str, width) {
    const strWidth = visualWidth(str);
    const padding = width - strWidth;
    return str + ' '.repeat(Math.max(0, padding));
  }

  // Helper: build horizontal border line
  function buildBorder(left, middle, right) {
    const c = colors();
    const borderColor = ansi.fg.rgb(...c.border);
    const segments = colWidths.map(w => BOX.horizontal.repeat(w + 2));
    return borderColor + left + segments.join(middle) + right + ansi.reset;
  }

  // Helper: build data row
  function buildRow(cells, isHeader = false, isSelected = false) {
    const c = colors();
    const borderColor = ansi.fg.rgb(...c.border);
    const textColor = ansi.fg.rgb(...c.text);
    const mutedColor = ansi.fg.rgb(...c.textMuted);
    const primaryColor = ansi.fg.rgb(...c.primary);
    const bgSelected = ansi.bg.rgb(...c.primary);
    const textInverse = ansi.fg.rgb(...c.textInverse);

    let line = borderColor + BOX.vertical + ansi.reset;

    for (let i = 0; i < colWidths.length; i++) {
      const cell = cells[i] || '';
      const padded = padRight(cell, colWidths[i]);

      if (isSelected) {
        // Selected row: primary background with inverse text
        line += bgSelected + textInverse + ' ' + padded + ' ' + ansi.reset;
      } else if (isHeader) {
        // Header: primary color, bold
        line += ansi.bold + primaryColor + ' ' + padded + ' ' + ansi.reset;
      } else {
        // Normal cell
        line += textColor + ' ' + padded + ' ' + ansi.reset;
      }

      line += borderColor + BOX.vertical + ansi.reset;
    }

    return line;
  }

  // Calculate visible rows based on terminal height
  function getVisibleRowCount() {
    // Reserve space for: lead text (2), table header (3: top border, header, separator),
    // table footer (1: bottom border), status (3: space, text, space)
    const reserved = 9;
    return Math.max(3, ctx.height - reserved);
  }

  function render() {
    const c = colors();
    view.clear();

    if (error) {
      view.add(Alert({ variant: 'error', message: error }));
      view.render();
      return;
    }

    if (rows.length === 0) {
      view.add(Label({ text: 'No data rows' }));
      view.render();
      return;
    }

    // Lead text
    const leadText = ctx.data?.lead || `${rows.length} row${rows.length === 1 ? '' : 's'}`;
    view.add(Label({ text: leadText, dim: true }));
    view.space();

    // Calculate visible window
    const visibleCount = getVisibleRowCount();

    // Adjust scroll offset to keep selected row visible
    if (selectedRow < scrollOffset) {
      scrollOffset = selectedRow;
    } else if (selectedRow >= scrollOffset + visibleCount) {
      scrollOffset = selectedRow - visibleCount + 1;
    }

    // Build table lines
    const tableLines = [];

    // Top border
    tableLines.push(buildBorder(BOX.topLeft, BOX.teeDown, BOX.topRight));

    // Header row
    tableLines.push(buildRow(headers, true, false));

    // Header separator
    tableLines.push(buildBorder(BOX.teeRight, BOX.cross, BOX.teeLeft));

    // Data rows (visible window)
    const visibleRows = rows.slice(scrollOffset, scrollOffset + visibleCount);
    for (let i = 0; i < visibleRows.length; i++) {
      const rowIndex = scrollOffset + i;
      const isSelected = rowIndex === selectedRow;
      tableLines.push(buildRow(visibleRows[i], false, isSelected));
    }

    // Bottom border
    tableLines.push(buildBorder(BOX.bottomLeft, BOX.teeUp, BOX.bottomRight));

    // Add each line as a Label
    for (const line of tableLines) {
      view.add(Label({ text: line }));
    }

    // Status line
    view.space();
    const statusText = `Row ${selectedRow + 1} of ${rows.length}`;
    const scrollIndicator = rows.length > visibleCount ? `  (showing ${scrollOffset + 1}-${Math.min(scrollOffset + visibleCount, rows.length)})` : '';
    view.add(Label({ text: statusText + scrollIndicator, dim: true }));
    view.space();

    view.render();
  }

  function selectRow() {
    if (rows.length === 0) return;
    const selectedData = rows[selectedRow];
    ctx.submit({ component: 'Table', value: selectedData.join(',') });
    ctx.pop();
  }

  return {
    init() { render(); },
    render,
    onKey(key) {
      if (key === 'DOWN' || key === 'j') {
        if (selectedRow < rows.length - 1) {
          selectedRow++;
          render();
        }
        return true;
      }

      if (key === 'UP' || key === 'k') {
        if (selectedRow > 0) {
          selectedRow--;
          render();
        }
        return true;
      }

      if (key === 'ENTER') {
        selectRow();
        return true;
      }

      if (key === 'ESCAPE') {
        ctx.pop();
        return true;
      }

      // Page navigation
      if (key === 'PAGEDOWN' || key === 'CTRL+D') {
        const visibleCount = getVisibleRowCount();
        selectedRow = Math.min(rows.length - 1, selectedRow + visibleCount);
        render();
        return true;
      }

      if (key === 'PAGEUP' || key === 'CTRL+U') {
        const visibleCount = getVisibleRowCount();
        selectedRow = Math.max(0, selectedRow - visibleCount);
        render();
        return true;
      }

      // Home/End
      if (key === 'HOME' || key === 'g') {
        selectedRow = 0;
        render();
        return true;
      }

      if (key === 'END' || key === 'G') {
        selectedRow = Math.max(0, rows.length - 1);
        render();
        return true;
      }

      return view.handleKey(key);
    },
    onScroll(direction) {
      if (direction === 'up') {
        if (selectedRow > 0) {
          selectedRow--;
          render();
          return true;
        }
      } else if (direction === 'down') {
        if (selectedRow < rows.length - 1) {
          selectedRow++;
          render();
          return true;
        }
      }
      return false;
    }
  };
}
