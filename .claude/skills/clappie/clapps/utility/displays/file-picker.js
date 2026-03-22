// Utility: File Picker
// A reusable file browser/picker for selecting files or directories

import {
  View,
  Label,
  ButtonFullWidth,
  ButtonInline,
  SectionHeading,
  Divider,
} from '../../display-engine/ui-kit/index.js';
import { colors } from '../../display-engine/theme.js';
import { ansi, truncateToWidth } from '../../display-engine/layout/ansi.js';
import { readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');
const HOME_DIR = homedir();

/**
 * Simple glob pattern matcher (no external dependencies)
 * Supports: *, ?, {a,b,c} patterns
 * Examples: '*.pdf', '*.{jpg,png}', 'test?.txt'
 */
function globMatch(filename, pattern) {
  // Expand brace patterns: *.{jpg,png} -> [*.jpg, *.png]
  const patterns = expandBraces(pattern);
  return patterns.some(p => matchSinglePattern(filename.toLowerCase(), p.toLowerCase()));
}

function expandBraces(pattern) {
  const braceMatch = pattern.match(/\{([^}]+)\}/);
  if (!braceMatch) return [pattern];

  const prefix = pattern.slice(0, braceMatch.index);
  const suffix = pattern.slice(braceMatch.index + braceMatch[0].length);
  const options = braceMatch[1].split(',');

  // Recursively expand in case of multiple brace groups
  return options.flatMap(opt => expandBraces(prefix + opt + suffix));
}

function matchSinglePattern(str, pattern) {
  // Convert glob to regex
  let regex = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      regex += '.*';
    } else if (c === '?') {
      regex += '.';
    } else if ('.+^${}[]|()\\'.includes(c)) {
      regex += '\\' + c;
    } else {
      regex += c;
    }
  }
  return new RegExp('^' + regex + '$').test(str);
}

export const maxWidth = 60;

export function create(ctx) {
  ctx.setTitle('Select File');
  ctx.setDescription('Browse files');

  // Options from ctx.data
  // startDir can be absolute path, relative to project, or special values like '~'
  const startDirInput = ctx.data?.startDir || '.';
  const filter = ctx.data?.filter || null;  // e.g., '*.pdf', '*.{jpg,png}'
  const showHidden = ctx.data?.showHidden || false;
  const multi = ctx.data?.multi || false;
  const description = ctx.data?.description || 'Browse and select a file';

  // Resolve starting directory to absolute path
  function resolveStartDir(dir) {
    if (dir === '~' || dir.startsWith('~/')) {
      return dir === '~' ? HOME_DIR : join(HOME_DIR, dir.slice(2));
    }
    if (dir.startsWith('/')) {
      return dir;
    }
    // Relative path - resolve from project root for backwards compatibility
    return resolve(PROJECT_ROOT, dir);
  }

  // State - always use absolute paths internally
  let currentDir = resolveStartDir(startDirInput);
  let entries = [];  // { name, isDir, fullPath }
  let focusedIndex = 0;
  let selected = new Set();  // for multi-select (stores fullPath)
  let error = null;

  const view = new View(ctx);

  // Helpers
  const fg = (r, g, b) => ansi.fg.rgb(r, g, b);
  const reset = ansi.reset;

  /**
   * Check if a filename matches the filter pattern
   */
  function matchesFilter(name, isDir) {
    // Directories always shown (for navigation)
    if (isDir) return true;
    // No filter = show all
    if (!filter) return true;
    // Match against pattern (case-insensitive)
    return globMatch(name, filter);
  }

  /**
   * Load directory contents
   */
  function loadDirectory() {
    error = null;
    entries = [];
    focusedIndex = 0;

    // currentDir is always absolute
    const fullPath = currentDir;

    if (!existsSync(fullPath)) {
      error = `Directory not found: ${currentDir}`;
      return;
    }

    try {
      const items = readdirSync(fullPath);

      for (const name of items) {
        // Skip hidden files unless showHidden
        if (!showHidden && name.startsWith('.')) continue;

        const itemFullPath = join(fullPath, name);
        let isDir = false;

        try {
          const stat = statSync(itemFullPath);
          isDir = stat.isDirectory();
        } catch {
          // Skip items we can't stat
          continue;
        }

        // Apply filter
        if (!matchesFilter(name, isDir)) continue;

        entries.push({
          name,
          isDir,
          fullPath: itemFullPath
        });
      }

      // Sort: directories first, then alphabetically
      entries.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });

    } catch (err) {
      error = `Cannot read directory: ${err.message}`;
    }
  }

  /**
   * Navigate into a directory
   */
  function enterDirectory(entry) {
    currentDir = entry.fullPath;
    loadDirectory();
    render();
  }

  /**
   * Go up one directory
   */
  function goUp() {
    // Already at filesystem root?
    if (currentDir === '/') {
      ctx.toast('Already at filesystem root');
      return;
    }

    const parentDir = dirname(currentDir);
    currentDir = parentDir;
    loadDirectory();
    render();
  }

  /**
   * Jump to home directory
   */
  function goHome() {
    currentDir = HOME_DIR;
    loadDirectory();
    render();
  }

  /**
   * Select current file (or toggle for multi)
   */
  function selectFile(entry) {
    if (entry.isDir) {
      enterDirectory(entry);
      return;
    }

    if (multi) {
      // Toggle selection - use fullPath
      if (selected.has(entry.fullPath)) {
        selected.delete(entry.fullPath);
      } else {
        selected.add(entry.fullPath);
      }
      render();
    } else {
      // Single select: submit full system path and pop
      ctx.submit({ component: 'FilePicker', value: entry.fullPath });
      ctx.pop();
    }
  }

  /**
   * Confirm multi-selection
   */
  function confirmSelection() {
    if (selected.size === 0) {
      ctx.toast('No files selected');
      return;
    }
    // Return full system paths
    const files = [...selected].join('\n');
    ctx.submit({ component: 'FilePicker', value: files });
    ctx.pop();
  }

  /**
   * Render the view
   */
  function render() {
    const c = colors();
    view.clear();

    // Lead text description
    view.add(Label({ text: description, dim: true }));
    view.space();

    // Current path as section heading - show ~ for home, otherwise full path
    let displayPath = currentDir;
    if (currentDir === HOME_DIR) {
      displayPath = '~';
    } else if (currentDir.startsWith(HOME_DIR + '/')) {
      displayPath = '~' + currentDir.slice(HOME_DIR.length);
    }
    view.add(SectionHeading({ text: displayPath }));
    view.space();

    // Error state
    if (error) {
      view.add(Label({ text: error, dim: false }));
      view.space();
      view.add(ButtonFullWidth({
        label: 'Back',
        onPress: () => ctx.pop()
      }));
      view.render();
      return;
    }

    // Empty directory
    if (entries.length === 0) {
      view.add(Label({ text: '(empty directory)', dim: true }));
      view.space();
    }

    // Calculate visible rows (leave room for header, path, buttons, lead text)
    const maxVisibleRows = Math.max(5, ctx.height - 14);
    const totalEntries = entries.length;

    // Scrolling window
    let scrollOffset = 0;
    if (focusedIndex >= maxVisibleRows) {
      scrollOffset = focusedIndex - maxVisibleRows + 1;
    }
    const visibleEntries = entries.slice(scrollOffset, scrollOffset + maxVisibleRows);

    // File/directory list with improved styling
    for (let i = 0; i < visibleEntries.length; i++) {
      const entry = visibleEntries[i];
      const actualIndex = scrollOffset + i;
      const isSelected = selected.has(entry.fullPath);

      // Truncate name if needed
      const availableWidth = maxWidth - 10;  // icon + check + padding + arrow
      const displayName = truncateToWidth(entry.name, availableWidth);

      // Create clickable label for each entry
      const capturedEntry = entry;
      const capturedIndex = actualIndex;
      const capturedIsSelected = isSelected;

      view.add({
        type: 'file-entry',
        focusable: true,
        entry: capturedEntry,

        render(focused) {
          const textColor = focused ? fg(...c.primary) : fg(...c.text);
          const dimColor = fg(...c.textMuted);
          const selColor = fg(...c.primary);

          let line = '';

          // Selection checkbox for multi-select
          if (multi) {
            if (capturedIsSelected) {
              line += selColor + '[x] ' + reset;
            } else {
              line += dimColor + '[ ] ' + reset;
            }
          }

          // Icon: folder vs file
          if (capturedEntry.isDir) {
            line += (focused ? selColor : dimColor) + '\u25B8 ' + reset;  // Small right triangle for folder
          } else {
            line += '  ';  // Indent files
          }

          // Name
          line += textColor + displayName + reset;

          // Folder indicator arrow
          if (capturedEntry.isDir) {
            const arrow = focused ? selColor + '  \u2192' + reset : '';  // Right arrow on focus
            line += arrow;
          }

          return [line];
        },

        getWidth() {
          return maxWidth;
        },

        onClick() {
          focusedIndex = capturedIndex;
          selectFile(capturedEntry);
        },

        onKey(key) {
          if (key === 'ENTER' || key === ' ') {
            selectFile(capturedEntry);
            return true;
          }
          return false;
        }
      });
    }

    // Scroll indicator
    if (totalEntries > maxVisibleRows) {
      view.space();
      const showing = `${scrollOffset + 1}-${Math.min(scrollOffset + maxVisibleRows, totalEntries)}`;
      view.add(Label({ text: `Showing ${showing} of ${totalEntries}`, dim: true }));
    }

    view.space();
    view.add(Divider({}));
    view.space();

    // Home button
    view.add(ButtonInline({ label: 'Home', shortcut: 'H', onPress: goHome }));
    view.space();

    // Multi-select: show selection count and confirm button
    if (multi) {
      if (selected.size > 0) {
        view.add(Label({ text: `${selected.size} file(s) selected` }));
        view.space();
      }
      view.add(ButtonFullWidth({
        label: 'Select Files',
        shortcut: 'S',
        onPress: confirmSelection
      }));
    }

    // Track the focused entry index for keyboard navigation
    // view.components only contains focusable items (the file entries we just added)
    const visibleFocusIndex = focusedIndex - scrollOffset;
    if (visibleFocusIndex >= 0 && visibleFocusIndex < visibleEntries.length) {
      view.focusIndex = visibleFocusIndex;
    }

    view.render();
  }

  return {
    init() {
      loadDirectory();
      render();
    },

    render,

    onKey(key) {
      // Navigation
      if (key === 'UP') {
        if (focusedIndex > 0) {
          focusedIndex--;
          render();
        }
        return true;
      }

      if (key === 'DOWN') {
        if (focusedIndex < entries.length - 1) {
          focusedIndex++;
          render();
        }
        return true;
      }

      // Go up directory
      if (key === 'BACKSPACE' || key === 'LEFT') {
        goUp();
        return true;
      }

      // Enter directory or select file
      if (key === 'ENTER' || key === 'RIGHT') {
        if (entries.length > 0 && focusedIndex < entries.length) {
          selectFile(entries[focusedIndex]);
        }
        return true;
      }

      // Toggle selection (multi mode)
      if (key === ' ' && multi) {
        if (entries.length > 0 && focusedIndex < entries.length) {
          const entry = entries[focusedIndex];
          if (!entry.isDir) {
            if (selected.has(entry.fullPath)) {
              selected.delete(entry.fullPath);
            } else {
              selected.add(entry.fullPath);
            }
            render();
          }
        }
        return true;
      }

      // Confirm selection shortcut
      if (key === 'S' && multi) {
        confirmSelection();
        return true;
      }

      // Home directory shortcut
      if (key === 'H' || key === '~') {
        goHome();
        return true;
      }

      // Escape to go back
      if (key === 'ESCAPE') {
        ctx.pop();
        return true;
      }

      return view.handleKey(key);
    },

    onScroll(direction) {
      if (direction === 'up' && focusedIndex > 0) {
        focusedIndex = Math.max(0, focusedIndex - 3);
        render();
        return true;
      }
      if (direction === 'down' && focusedIndex < entries.length - 1) {
        focusedIndex = Math.min(entries.length - 1, focusedIndex + 3);
        render();
        return true;
      }
      return false;
    }
  };
}
