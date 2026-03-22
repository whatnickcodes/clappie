// Utility: Markdown Editor/Preview
//
// Usage:
//   ctx.push('utility/markdown', { file: 'docs/readme.md' });
//   ctx.push('utility/markdown', { content: '# Hello', mode: 'edit' });

import { View, Textarea, ButtonFullWidth, Alert, ButtonInline, ToggleBlock } from '../../display-engine/ui-kit/index.js';
import { colors } from '../../display-engine/theme.js';
import { ansi, visualWidth, stripAnsi } from '../../display-engine/layout/ansi.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

export const maxWidth = 80;

export function create(ctx) {
  const filePath = ctx.data?.file;
  let mode = ctx.data?.mode || 'preview';

  ctx.setTitle(ctx.data?.title || (filePath ? basename(filePath) : 'Markdown'));
  ctx.setDescription('Edit markdown');

  const view = new View(ctx);

  // Load content
  let content = ctx.data?.content || '';
  let originalContent = '';
  let error = null;

  if (filePath) {
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
  } else if (!ctx.data?.content) {
    content = '';
    originalContent = '';
  } else {
    originalContent = content;
  }

  // Create textarea for edit mode
  const textarea = !error ? Textarea({
    label: ctx.data?.title || (filePath ? basename(filePath) : 'Content'),
    value: content,
    rows: Math.max(12, ctx.height - 12),
    width: 'full',
    showStatus: true,
    editToggle: true,
    onChange: (v) => { content = v; },
    onEditChange: () => { render(); }
  }) : null;

  // ─────────────────────────────────────────────────────────────────────────
  // MARKDOWN RENDERING
  // ─────────────────────────────────────────────────────────────────────────

  function renderMarkdown(md, maxLineWidth) {
    const c = colors();
    const textColor = ansi.fg.rgb(...c.text);
    const mutedColor = ansi.fg.rgb(...c.textMuted);
    const primaryColor = ansi.fg.rgb(...c.primary);
    const reset = ansi.reset;

    const lines = [];
    const inputLines = md.split('\n');

    for (const line of inputLines) {
      let rendered = line;

      // H1: # Heading -> BOLD CAPS
      if (/^# /.test(line)) {
        const text = line.slice(2).trim();
        lines.push('');
        lines.push(`${ansi.bold}${primaryColor}${text.toUpperCase()}${reset}`);
        lines.push('');
        continue;
      }

      // H2: ## Subheading -> Bold
      if (/^## /.test(line)) {
        const text = line.slice(3).trim();
        lines.push('');
        lines.push(`${ansi.bold}${textColor}${text}${reset}`);
        lines.push('');
        continue;
      }

      // H3: ### Subheading -> Bold, smaller
      if (/^### /.test(line)) {
        const text = line.slice(4).trim();
        lines.push(`${ansi.bold}${textColor}${text}${reset}`);
        continue;
      }

      // H4+: #### Heading -> Just bold
      if (/^#{4,} /.test(line)) {
        const text = line.replace(/^#{4,}\s*/, '').trim();
        lines.push(`${ansi.bold}${textColor}${text}${reset}`);
        continue;
      }

      // Horizontal rule: --- or *** or ___
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
        lines.push(`${mutedColor}${'─'.repeat(Math.min(maxLineWidth, 60))}${reset}`);
        continue;
      }

      // Bullet points: - item or * item
      if (/^[-*]\s+/.test(line)) {
        const text = line.replace(/^[-*]\s+/, '').trim();
        const formatted = formatInlineMarkdown(text, textColor, mutedColor, primaryColor, reset);
        lines.push(`${textColor}  • ${formatted}${reset}`);
        continue;
      }

      // Numbered list: 1. item
      if (/^\d+\.\s+/.test(line)) {
        const match = line.match(/^(\d+)\.\s+(.*)$/);
        if (match) {
          const num = match[1];
          const text = match[2];
          const formatted = formatInlineMarkdown(text, textColor, mutedColor, primaryColor, reset);
          lines.push(`${textColor}  ${num}. ${formatted}${reset}`);
          continue;
        }
      }

      // Code block markers: ``` (just skip them, content between is shown as-is)
      if (/^```/.test(line.trim())) {
        lines.push(`${mutedColor}${'─'.repeat(20)}${reset}`);
        continue;
      }

      // Blockquote: > text
      if (/^>\s?/.test(line)) {
        const text = line.replace(/^>\s?/, '');
        lines.push(`${mutedColor}│ ${textColor}${text}${reset}`);
        continue;
      }

      // Empty line
      if (line.trim() === '') {
        lines.push('');
        continue;
      }

      // Regular paragraph - apply inline formatting
      const formatted = formatInlineMarkdown(line, textColor, mutedColor, primaryColor, reset);
      lines.push(formatted);
    }

    return lines;
  }

  function formatInlineMarkdown(text, textColor, mutedColor, primaryColor, reset) {
    let result = text;

    // Bold: **text** or __text__
    result = result.replace(/\*\*(.+?)\*\*/g, `${ansi.bold}$1${reset}${textColor}`);
    result = result.replace(/__(.+?)__/g, `${ansi.bold}$1${reset}${textColor}`);

    // Italic: *text* or _text_
    result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, `${ansi.dim}$1${reset}${textColor}`);
    result = result.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, `${ansi.dim}$1${reset}${textColor}`);

    // Inline code: `code`
    result = result.replace(/`([^`]+)`/g, `${mutedColor}$1${reset}${textColor}`);

    // Links: [text](url) -> "text (url)" or just underlined text
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `${ansi.underline}$1${reset}${textColor} ${mutedColor}($2)${reset}${textColor}`);

    // Strikethrough: ~~text~~
    result = result.replace(/~~(.+?)~~/g, `${ansi.dim}$1${reset}${textColor}`);

    return `${textColor}${result}${reset}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PREVIEW SCROLL STATE
  // ─────────────────────────────────────────────────────────────────────────

  let previewScrollOffset = 0;
  let previewLines = [];

  // ─────────────────────────────────────────────────────────────────────────
  // SAVE FUNCTION
  // ─────────────────────────────────────────────────────────────────────────

  function saveFile() {
    if (!filePath || !textarea) return;
    const fullPath = join(PROJECT_ROOT, filePath);
    try {
      content = textarea.getValue();
      writeFileSync(fullPath, content, 'utf8');
      originalContent = content;
      textarea.markSaved();
      ctx.toast('Saved');
      ctx.submit({ component: 'Markdown', value: 'saved' });
      ctx.pop();
    } catch (err) {
      ctx.toast(`Save failed: ${err.message}`);
    }
  }

  function hasChanges() {
    return textarea ? textarea.getValue() !== originalContent : false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

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

    // Mode toggle
    view.add(ToggleBlock({
      options: ['Edit', 'Preview'],
      value: mode === 'edit' ? 0 : 1,
      onChange: (i) => {
        mode = i === 0 ? 'edit' : 'preview';
        if (mode === 'preview' && textarea) {
          content = textarea.getValue();
        }
        ctx.setDescription(mode === 'edit' ? 'Edit Mode' : 'Preview Mode');
        render();
      }
    }));
    view.space();

    if (mode === 'edit') {
      // Show textarea for editing
      view.add(textarea);
      view.space();

      // Save button (only if we have a file path)
      if (filePath) {
        view.add(ButtonFullWidth({
          label: 'Save',
          onPress: () => { saveFile(); }
        }));
      }

      // Focus management
      const isEditing = textarea?.isEditing?.() ?? false;
      if (isEditing) {
        const textareaIdx = view.components.indexOf(textarea);
        view.focusIndex = textareaIdx >= 0 ? textareaIdx : 0;
      } else {
        view.focusIndex = filePath ? 2 : 1; // Focus save button or toggle
      }
    } else {
      // Preview mode - render markdown
      const maxLineWidth = (ctx.width || 80) - 4; // Leave some margin
      previewLines = renderMarkdown(content, maxLineWidth);

      // Calculate visible area
      const visibleRows = Math.max(10, ctx.height - 10);
      const maxScroll = Math.max(0, previewLines.length - visibleRows);
      previewScrollOffset = Math.min(previewScrollOffset, maxScroll);

      // Create preview component
      const previewComponent = createPreviewComponent(previewLines, visibleRows, c);
      view.add(previewComponent);
    }

    view.render();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PREVIEW COMPONENT
  // ─────────────────────────────────────────────────────────────────────────

  function createPreviewComponent(lines, visibleRows, c) {
    const borderColor = ansi.fg.rgb(...c.textMuted);
    const textColor = ansi.fg.rgb(...c.text);
    const reset = ansi.reset;
    // Box width: ctx.width minus outer margins (2 each side)
    const boxWidth = (ctx.width || 80) - 4;
    // Inner content width: box minus borders (1 each) and inner padding (2 each side)
    const innerPadding = 2;
    const contentWidth = boxWidth - 2 - (innerPadding * 2);
    const innerPaddingStr = ' '.repeat(innerPadding);

    // Add top/bottom padding to the lines for document margins
    const paddedLines = ['', '', ...lines, '', ''];

    return {
      type: 'markdown-preview',
      focusable: true,

      render(focused) {
        const output = [];
        const accent = focused ? ansi.fg.rgb(...c.primaryFocused) : borderColor;

        // Top border
        output.push(`${accent}╭${'─'.repeat(boxWidth)}╮${reset}`);

        // Content rows
        for (let i = 0; i < visibleRows; i++) {
          const lineIdx = previewScrollOffset + i;
          let lineContent = paddedLines[lineIdx] || '';

          // Truncate if too long
          const stripped = stripAnsi(lineContent);
          if (visualWidth(stripped) > contentWidth) {
            // Simple truncation (won't preserve ANSI perfectly but good enough)
            const chars = [...stripped];
            let truncated = '';
            let w = 0;
            for (const char of chars) {
              if (w + visualWidth(char) + 1 > contentWidth) break;
              truncated += char;
              w += visualWidth(char);
            }
            lineContent = `${textColor}${truncated}…${reset}`;
          }

          const lineWidth = visualWidth(stripAnsi(lineContent));
          const rightPad = Math.max(0, contentWidth - lineWidth);
          output.push(`${accent}│${reset}${innerPaddingStr}${lineContent}${' '.repeat(rightPad)}${innerPaddingStr}${accent}│${reset}`);
        }

        // Scroll indicator
        if (paddedLines.length > visibleRows) {
          const scrollInfo = `${previewScrollOffset + 1}-${Math.min(previewScrollOffset + visibleRows, paddedLines.length)}/${paddedLines.length}`;
          const scrollText = `${borderColor}[${scrollInfo}]${reset}`;
          const scrollWidth = scrollInfo.length + 2;
          const padLeft = Math.floor((boxWidth - scrollWidth) / 2);
          const padRight = boxWidth - scrollWidth - padLeft;
          output.push(`${accent}├${'─'.repeat(padLeft)}${scrollText}${'─'.repeat(padRight)}┤${reset}`);
        }

        // Bottom border
        output.push(`${accent}╰${'─'.repeat(boxWidth)}╯${reset}`);

        return output;
      },

      getWidth() {
        return boxWidth + 2;
      },

      onKey(key) {
        const maxScroll = Math.max(0, paddedLines.length - visibleRows);

        if (key === 'UP' || key === 'k') {
          if (previewScrollOffset > 0) {
            previewScrollOffset--;
            return true;
          }
        }
        if (key === 'DOWN' || key === 'j') {
          if (previewScrollOffset < maxScroll) {
            previewScrollOffset++;
            return true;
          }
        }
        if (key === 'PAGEUP') {
          previewScrollOffset = Math.max(0, previewScrollOffset - visibleRows);
          return true;
        }
        if (key === 'PAGEDOWN') {
          previewScrollOffset = Math.min(maxScroll, previewScrollOffset + visibleRows);
          return true;
        }
        if (key === 'HOME' || key === 'g') {
          previewScrollOffset = 0;
          return true;
        }
        if (key === 'END' || key === 'G') {
          previewScrollOffset = maxScroll;
          return true;
        }
        // 'e' to enter edit mode
        if (key === 'e' || key === 'E') {
          mode = 'edit';
          ctx.setDescription('Edit Mode');
          return true;
        }
        return false;
      },

      onClick() {
        return true;
      },

      onScroll(direction) {
        const maxScroll = Math.max(0, paddedLines.length - visibleRows);
        const delta = direction * 3;
        previewScrollOffset = Math.max(0, Math.min(maxScroll, previewScrollOffset + delta));
        return true;
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RETURN INTERFACE
  // ─────────────────────────────────────────────────────────────────────────

  return {
    init() { render(); },
    render,
    onKey(key) {
      const handled = view.handleKey(key);
      if (handled) return true;

      // Mode toggle with 'M' or Tab
      if (key === 'M' || key === 'm') {
        mode = mode === 'edit' ? 'preview' : 'edit';
        if (mode === 'preview' && textarea) {
          content = textarea.getValue();
        }
        ctx.setDescription(mode === 'edit' ? 'Edit Mode' : 'Preview Mode');
        render();
        return true;
      }

      if (key === 'ESCAPE') {
        if (!hasChanges()) ctx.pop();
        else ctx.toast('Unsaved changes');
        return true;
      }

      return false;
    },
    onScroll(direction) {
      if (mode === 'edit') {
        const isEditing = textarea?.isEditing?.() ?? false;
        if (isEditing && textarea?.onScroll) {
          return textarea.onScroll(direction);
        }
      } else {
        // Preview mode scroll (account for 4 padding lines: 2 top + 2 bottom)
        const visibleRows = Math.max(10, ctx.height - 10);
        const totalPaddedLines = previewLines.length + 4;
        const maxScroll = Math.max(0, totalPaddedLines - visibleRows);
        const delta = direction * 3;
        previewScrollOffset = Math.max(0, Math.min(maxScroll, previewScrollOffset + delta));
        render();
        return true;
      }
      return false;
    }
  };
}
