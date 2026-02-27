// Utility: Viewer - Just text, nothing else
//
// Usage: clappie display push utility/viewer -d file=path/to/file.txt

import { colors } from '../../display-engine/theme.js';
import { ansi, visualWidth } from '../../display-engine/layout/ansi.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

export const maxWidth = 70;

// Wrap a line to fit within maxWidth
function wrapLine(line, width) {
  if (!line) return [''];
  if (visualWidth(line) <= width) return [line];

  const wrapped = [];
  const words = line.split(' ');
  let current = '';

  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (visualWidth(test) > width) {
      if (current) wrapped.push(current);
      // If single word is too long, just use it (will overflow but that's fine)
      current = word;
    } else {
      current = test;
    }
  }
  if (current) wrapped.push(current);

  return wrapped.length ? wrapped : [''];
}

export function create(ctx) {
  const filePath = ctx.data?.file;
  let title = ctx.data?.title || (filePath ? basename(filePath) : 'Viewer');

  // Truncate title if too long
  if (title.length > maxWidth - 4) {
    title = title.slice(0, maxWidth - 7) + '...';
  }

  ctx.setTitle(title);
  ctx.setDescription('Read only');

  // Load content
  let rawLines = [];
  let error = null;

  if (!filePath) {
    error = 'No file specified';
  } else {
    const fullPath = join(PROJECT_ROOT, filePath);
    if (!existsSync(fullPath)) {
      error = `File not found: ${filePath}`;
    } else {
      try {
        const content = readFileSync(fullPath, 'utf8');
        rawLines = content.split('\n');
      } catch (err) {
        error = `Failed to read: ${err.message}`;
      }
    }
  }

  let scrollOffset = 0;
  let wrappedLines = [];

  function wrapContent() {
    const contentWidth = Math.min(ctx.width - 4, maxWidth);
    wrappedLines = [];
    for (const line of rawLines) {
      wrappedLines.push(...wrapLine(line, contentWidth));
    }
  }

  function render() {
    const c = colors();
    const textColor = ansi.fg.rgb(...c.text);
    const mutedColor = ansi.fg.rgb(...c.textMuted);
    const reset = ansi.reset;

    const output = [];
    const visibleRows = ctx.height - 2;

    if (error) {
      output.push(`${mutedColor}${error}${reset}`);
      ctx.draw(output);
      return;
    }

    wrapContent();

    const maxScroll = Math.max(0, wrappedLines.length - visibleRows);
    scrollOffset = Math.min(scrollOffset, maxScroll);

    for (let i = 0; i < visibleRows; i++) {
      const lineIdx = scrollOffset + i;
      if (lineIdx >= wrappedLines.length) {
        output.push('');
      } else {
        output.push(`${textColor}${wrappedLines[lineIdx]}${reset}`);
      }
    }

    ctx.draw(output);
  }

  function scrollBy(delta) {
    const visibleRows = ctx.height - 2;
    const maxScroll = Math.max(0, wrappedLines.length - visibleRows);
    scrollOffset = Math.max(0, Math.min(maxScroll, scrollOffset + delta));
    render();
  }

  return {
    init() { render(); },
    render,

    onKey(key) {
      const visibleRows = ctx.height - 2;
      switch (key) {
        case 'DOWN':
        case 'j':
          scrollBy(1);
          return true;
        case 'UP':
        case 'k':
          scrollBy(-1);
          return true;
        case 'PAGEDOWN':
        case ' ':
          scrollBy(visibleRows - 2);
          return true;
        case 'PAGEUP':
          scrollBy(-(visibleRows - 2));
          return true;
        case 'HOME':
        case 'g':
          scrollOffset = 0;
          render();
          return true;
        case 'END':
        case 'G':
          scrollBy(wrappedLines.length);
          return true;
        case 'ESCAPE':
          ctx.pop();
          return true;
      }
      return false;
    },

    onScroll(direction) {
      scrollBy(direction * 3);
      return true;
    }
  };
}
