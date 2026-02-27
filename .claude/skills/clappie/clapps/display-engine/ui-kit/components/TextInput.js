// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  TEXT INPUT - Single line text entry                                      ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    TextInput({ label: 'Name', placeholder: 'Enter...', onChange: (v)=>{} })║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    label       - Text shown before input (optional)                       ║
// ║    placeholder - Ghost text when empty (optional)                         ║
// ║    value       - Initial text (default: '')                               ║
// ║    width       - Input field width in chars (default: 20)                 ║
// ║    onChange    - Function called with new value on each keystroke         ║
// ║    onSubmit    - Function called with value when Enter pressed            ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { clappieError, clappieWarn } from '../errors.js';
import { ansi, visualWidth } from '../../layout/ansi.js';
import { colors } from '../../theme.js';

export function TextInput(opts = {}) {
  // Validate options
  if (!opts || typeof opts !== 'object') {
    clappieError('TextInput', 'options object required',
      'Usage: TextInput({ label: "Name", onChange: (v) => {} })');
  }

  let { label = '', value = '', placeholder = '', width = 'full', onChange, onSubmit } = opts;
  const isFullWidth = width === 'full';

  if (label && typeof label !== 'string') {
    clappieError('TextInput', `label must be string, got ${typeof label}`,
      'Usage: TextInput({ label: "Name", onChange: (v) => {} })');
  }

  if (typeof value !== 'string') {
    clappieWarn('TextInput',
      `value should be string, got ${typeof value}. Converting to string.`);
    value = String(value);
  }

  if (placeholder && typeof placeholder !== 'string') {
    clappieWarn('TextInput',
      `placeholder should be string, got ${typeof placeholder}. Converting.`);
    placeholder = String(placeholder);
  }

  if (!isFullWidth && (typeof width !== 'number' || width < 1)) {
    clappieWarn('TextInput',
      `width should be positive number or 'full', got ${width}. Using default 20.`);
    width = 20;
  }

  if (onChange && typeof onChange !== 'function') {
    clappieError('TextInput', `onChange must be function, got ${typeof onChange}`,
      'Usage: TextInput({ label: "Name", onChange: (v) => {} })');
  }

  if (onSubmit && typeof onSubmit !== 'function') {
    clappieError('TextInput', `onSubmit must be function, got ${typeof onSubmit}`,
      'Usage: TextInput({ label: "Name", onSubmit: (v) => {} })');
  }

  let cursorPos = value.length;

  const component = {
    type: 'textinput',
    focusable: true,

    render(focused = false) {
      const output = [];
      const c = colors();
      const accent = ansi.fg.rgb(...c.primaryFocused);
      const mutedColor = ansi.fg.rgb(...c.textMuted);
      const textColor = ansi.fg.rgb(...c.text);
      const reset = ansi.reset;
      const border = focused ? accent : mutedColor;

      // Resolve 'full' width to container width (set by View), minus 2 for borders
      const effectiveWidth = isFullWidth ? (component._containerWidth || 40) - 2 : width;

      // Label (above the field) - always theme-aware
      if (label) {
        output.push(focused ? `${accent}${label}${reset}` : `${textColor}${label}${reset}`);
      }

      // Build display content
      let display = '';

      if (focused) {
        // Show cursor with inverse video
        const before = value.slice(0, cursorPos);
        const cursorChar = value[cursorPos] || ' ';
        const after = value.slice(cursorPos + 1);
        // Use visualWidth for proper emoji/wide char handling
        const valueWidth = visualWidth(value);
        const cursorWidth = cursorChar === ' ' ? 1 : visualWidth(cursorChar);
        const padding = ' '.repeat(Math.max(0, effectiveWidth - valueWidth - (cursorChar === ' ' ? 1 : 0)));
        display = `${textColor}${before}${ansi.inverse}${cursorChar}${reset}${textColor}${after}${reset}${padding}`;
      } else if (!value && placeholder) {
        // Show placeholder (dimmed)
        const truncated = placeholder.slice(0, effectiveWidth);
        const placeholderWidth = visualWidth(truncated);
        const padding = ' '.repeat(Math.max(0, effectiveWidth - placeholderWidth));
        display = `${mutedColor}${truncated}${reset}${padding}`;
      } else {
        // Show value or empty
        const truncated = value.slice(0, effectiveWidth);
        const valueWidth = visualWidth(truncated);
        const padding = ' '.repeat(Math.max(0, effectiveWidth - valueWidth));
        display = `${textColor}${truncated}${reset}${padding}`;
      }

      // Box with rounded corners
      output.push(`${border}╭${'─'.repeat(effectiveWidth)}╮${reset}`);
      output.push(`${border}│${reset}${display}${border}│${reset}`);
      output.push(`${border}╰${'─'.repeat(effectiveWidth)}╯${reset}`);

      return output;
    },

    getWidth() {
      // For 'full' width, use container width; otherwise fixed width + borders
      return isFullWidth ? (component._containerWidth || 40) : width + 2;
    },

    onKey(key) {
      // Backspace
      if (key === 'BACKSPACE') {
        if (cursorPos > 0) {
          value = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
          cursorPos--;
          if (onChange) onChange(value);
        }
        return true;
      }

      // Delete
      if (key === 'DELETE') {
        if (cursorPos < value.length) {
          value = value.slice(0, cursorPos) + value.slice(cursorPos + 1);
          if (onChange) onChange(value);
        }
        return true;
      }

      // Arrow keys
      if (key === 'LEFT') {
        if (cursorPos > 0) cursorPos--;
        return true;
      }
      if (key === 'RIGHT') {
        if (cursorPos < value.length) cursorPos++;
        return true;
      }

      // Home/End
      if (key === 'HOME') {
        cursorPos = 0;
        return true;
      }
      if (key === 'END') {
        cursorPos = value.length;
        return true;
      }

      // Ctrl+A - go to beginning of line (standard readline behavior)
      if (key === 'CTRL_A') {
        cursorPos = 0;
        return true;
      }

      // Ctrl+E - go to end of line (standard readline behavior)
      if (key === 'CTRL_E') {
        cursorPos = value.length;
        return true;
      }

      // Ctrl+Left - move to previous word boundary
      if (key === 'CTRL_LEFT') {
        // Skip any spaces, then skip non-spaces
        while (cursorPos > 0 && value[cursorPos - 1] === ' ') cursorPos--;
        while (cursorPos > 0 && value[cursorPos - 1] !== ' ') cursorPos--;
        return true;
      }

      // Ctrl+Right - move to next word boundary
      if (key === 'CTRL_RIGHT') {
        // Skip any non-spaces, then skip spaces
        while (cursorPos < value.length && value[cursorPos] !== ' ') cursorPos++;
        while (cursorPos < value.length && value[cursorPos] === ' ') cursorPos++;
        return true;
      }

      // Submit
      if (key === 'ENTER') {
        if (onSubmit) onSubmit(value);
        return true;
      }

      // Printable character
      if (key.length === 1 && key.charCodeAt(0) >= 32) {
        value = value.slice(0, cursorPos) + key + value.slice(cursorPos);
        cursorPos++;
        if (onChange) onChange(value);
        return true;
      }

      return false;
    },

    onClick() {
      // Clicking focuses the input - move cursor to end
      cursorPos = value.length;
    },

    getValue() {
      return value;
    },

    setValue(v) {
      if (typeof v !== 'string') {
        clappieWarn('TextInput.setValue', `expected string, got ${typeof v}`);
        v = String(v);
      }
      value = v;
      cursorPos = v.length;
    }
  };

  return component;
}
