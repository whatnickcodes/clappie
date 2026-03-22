// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  ALERT - Full-width notification box with severity levels                 ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    Alert({ variant: 'warning', message: 'Session expires soon' })         ║
// ║                                                                           ║
// ║  Options:                                                                 ║
// ║    variant  - 'error' | 'warning' | 'success' | 'info' (default: 'info')  ║
// ║    title    - Optional title text (defaults based on variant)             ║
// ║    message  - The alert message (required)                                ║
// ║    width    - Optional fixed width (defaults to container width)          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { clappieError } from '../errors.js';
import { ansi, stripAnsi, visualWidth } from '../../layout/ansi.js';
import { colors, isDark } from '../../theme.js';

// Variant configuration: icons, default titles, and colors
const VARIANTS = {
  error: {
    icon: '✕',
    title: 'Error',
    light: [200, 50, 50],    // red
    dark: [255, 100, 100],   // brighter red for dark mode
  },
  warning: {
    icon: '⚠',
    title: 'Warning',
    light: [180, 130, 0],    // amber/yellow
    dark: [255, 200, 50],    // brighter yellow for dark mode
  },
  success: {
    icon: '✓',
    title: 'Success',
    light: [40, 160, 60],    // green
    dark: [80, 220, 100],    // brighter green for dark mode
  },
  info: {
    icon: 'ℹ',
    title: 'Info',
    light: [60, 130, 200],   // blue
    dark: [100, 180, 255],   // brighter blue for dark mode
  },
};

export function Alert(opts = {}) {
  // Validate options
  if (!opts || typeof opts !== 'object') {
    clappieError('Alert', 'options object required',
      'Usage: Alert({ variant: "warning", message: "Something happened" })');
  }

  const { variant = 'info', title, message, width } = opts;

  if (!message) {
    clappieError('Alert', 'message is required',
      'Usage: Alert({ message: "Something happened" })');
  }

  if (typeof message !== 'string') {
    clappieError('Alert', `message must be string, got ${typeof message}`,
      'Usage: Alert({ message: "Something happened" })');
  }

  if (!VARIANTS[variant]) {
    clappieError('Alert', `unknown variant "${variant}"`,
      'Valid variants: error, warning, success, info');
  }

  const config = VARIANTS[variant];
  const displayTitle = title || config.title;

  return {
    type: 'alert',
    focusable: false,
    variant,
    message,

    render() {
      const reset = ansi.reset;
      const variantColor = isDark() ? config.dark : config.light;
      const fg = ansi.fg.rgb(...variantColor);
      const c = colors();
      const textColor = ansi.fg.rgb(...c.text);

      // Get width from container or explicit option
      const boxWidth = width || this._containerWidth || 50;

      // Box drawing characters (double border)
      const TOP_LEFT = '╔';
      const TOP_RIGHT = '╗';
      const BOTTOM_LEFT = '╚';
      const BOTTOM_RIGHT = '╝';
      const HORIZONTAL = '═';
      const VERTICAL = '║';

      // Build title line: ╔═ Error ════════════════════════════════════════╗
      // Keep title as plain ASCII for predictable width calculation
      // Structure: ╔═ [title] ═...═╗
      // Positions: corner(1) + bar(1) + space(1) + title + space(1) + bars(N) + corner(1)
      // Total = 5 + title.length + N, so N = boxWidth - 5 - title.length
      const remainingWidth = boxWidth - 5 - displayTitle.length;
      const titleLine = `${fg}${TOP_LEFT}${HORIZONTAL} ${displayTitle} ${HORIZONTAL.repeat(Math.max(0, remainingWidth))}${TOP_RIGHT}${reset}`;

      // Build message line(s): ║ message text                              ║
      const innerWidth = boxWidth - 4; // 2 for "║ " and 2 for " ║"
      const messageLines = wrapText(message, innerWidth);

      const contentLines = messageLines.map(line => {
        const lineWidth = visualWidth(line);
        const padding = innerWidth - lineWidth;
        return `${fg}${VERTICAL}${reset} ${textColor}${line}${' '.repeat(Math.max(0, padding))}${reset} ${fg}${VERTICAL}${reset}`;
      });

      // Build bottom line: ╚════════════════════════════════════════════════╝
      const bottomLine = `${fg}${BOTTOM_LEFT}${HORIZONTAL.repeat(boxWidth - 2)}${BOTTOM_RIGHT}${reset}`;

      return [titleLine, ...contentLines, bottomLine];
    },

    getWidth() {
      return width || this._containerWidth || 50;
    },
  };
}

// Simple text wrapping helper
function wrapText(text, maxWidth) {
  if (visualWidth(text) <= maxWidth) {
    return [text];
  }

  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (visualWidth(testLine) <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}
