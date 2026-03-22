// ANSI escape codes for terminal control

export const ansi = {
  // Clear and cursor
  clear: '\x1b[2J\x1b[H',
  clearLine: '\x1b[K',        // Clear from cursor to end of line
  clearFullLine: '\x1b[2K',   // Clear entire line

  cursor: {
    hide: '\x1b[?25l',
    show: '\x1b[?25h',
    home: '\x1b[H',
    to: (x, y) => `\x1b[${y};${x}H`,
    up: (n = 1) => `\x1b[${n}A`,
    down: (n = 1) => `\x1b[${n}B`,
    right: (n = 1) => `\x1b[${n}C`,
    left: (n = 1) => `\x1b[${n}D`,
  },

  // Colors
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  inverse: '\x1b[7m',

  // Foreground colors
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',

    // Bright variants
    brightRed: '\x1b[91m',
    brightGreen: '\x1b[92m',
    brightYellow: '\x1b[93m',
    brightBlue: '\x1b[94m',
    brightMagenta: '\x1b[95m',
    brightCyan: '\x1b[96m',
    brightWhite: '\x1b[97m',

    // 256 color
    rgb: (r, g, b) => `\x1b[38;2;${r};${g};${b}m`,
  },

  // Background colors
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m',

    // 256 color
    rgb: (r, g, b) => `\x1b[48;2;${r};${g};${b}m`,
  },

  // Mouse tracking - enable multiple modes for max compatibility
  // 1000 = X10 basic, 1002 = button events (press+release)
  // 1006 = SGR extended, 1015 = urxvt extended
  // Skip 1003 (any-event) - we don't need motion/hover tracking
  mouse: {
    enable: '\x1b[?1000h\x1b[?1002h\x1b[?1015h\x1b[?1006h',
    disable: '\x1b[?1006l\x1b[?1015l\x1b[?1002l\x1b[?1000l',
  },
};

// Helper functions
export function style(text, ...codes) {
  return codes.join('') + text + ansi.reset;
}

export function bold(text) {
  return ansi.bold + text + ansi.reset;
}

export function dim(text) {
  return ansi.dim + text + ansi.reset;
}

export function color(text, fg, bg = null) {
  let code = fg;
  if (bg) code += bg;
  return code + text + ansi.reset;
}

// Semantic colors
export function primary(text) {
  return ansi.fg.cyan + text + ansi.reset;
}

export function success(text) {
  return ansi.fg.green + text + ansi.reset;
}

export function warning(text) {
  return ansi.fg.yellow + text + ansi.reset;
}

export function error(text) {
  return ansi.fg.red + text + ansi.reset;
}

export function muted(text) {
  return ansi.fg.gray + text + ansi.reset;
}

// ─────────────────────────────────────────────────────────────────────────────
// STRING UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a character is a wide character (emoji, CJK, etc.)
 * Wide characters display as 2 columns in terminal
 */
function isWideChar(char) {
  const code = char.codePointAt(0);
  if (!code) return false;

  // Emojis and symbols (most common case)
  if (code >= 0x1F300 && code <= 0x1FAFF) return true;  // Misc symbols, emoticons, etc.
  if (code >= 0x2600 && code <= 0x26FF) return true;    // Misc symbols
  if (code >= 0x2700 && code <= 0x27BF) return true;    // Dingbats
  if (code >= 0xFE00 && code <= 0xFE0F) return false;   // Variation selectors (zero width)
  if (code >= 0x200D && code <= 0x200D) return false;   // Zero width joiner

  // CJK characters
  if (code >= 0x4E00 && code <= 0x9FFF) return true;    // CJK Unified Ideographs
  if (code >= 0x3000 && code <= 0x303F) return true;    // CJK Punctuation
  if (code >= 0xFF00 && code <= 0xFFEF) return true;    // Fullwidth forms

  return false;
}

/**
 * Get the visual width of a string (accounting for wide characters like emojis)
 * @param {string} str - String to measure (should have ANSI codes stripped first)
 * @returns {number} Visual width in terminal columns
 */
export function visualWidth(str) {
  if (!str) return 0;

  let width = 0;
  const chars = [...str]; // Properly split by code points, not code units

  for (const char of chars) {
    // Skip zero-width characters
    const code = char.codePointAt(0);
    if (code >= 0xFE00 && code <= 0xFE0F) continue;  // Variation selectors
    if (code === 0x200D) continue;  // Zero width joiner
    if (code === 0x200B) continue;  // Zero width space

    width += isWideChar(char) ? 2 : 1;
  }

  return width;
}

/**
 * Truncate a string to fit a visual width, accounting for wide characters
 * @param {string} str - String to truncate (may contain ANSI codes)
 * @param {number} maxWidth - Maximum visual width
 * @param {string} ellipsis - Ellipsis character (default: '…')
 * @returns {string} Truncated string
 */
export function truncateToWidth(str, maxWidth, ellipsis = '…') {
  if (!str || maxWidth <= 0) return '';

  const stripped = stripAnsi(str);
  const strWidth = visualWidth(stripped);

  if (strWidth <= maxWidth) return str;

  // Need to truncate - build up string until we hit maxWidth
  const ellipsisWidth = visualWidth(ellipsis);
  const targetWidth = maxWidth - ellipsisWidth;

  let result = '';
  let currentWidth = 0;
  let inAnsi = false;
  let ansiBuffer = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    // Track ANSI escape sequences
    if (char === '\x1b') {
      inAnsi = true;
      ansiBuffer = char;
      continue;
    }

    if (inAnsi) {
      ansiBuffer += char;
      if (char === 'm') {
        result += ansiBuffer;
        inAnsi = false;
        ansiBuffer = '';
      }
      continue;
    }

    // Check if this is a multi-byte character (emoji, etc)
    const code = char.codePointAt(0);
    let fullChar = char;

    // Handle surrogate pairs
    if (code > 0xFFFF && i + 1 < str.length) {
      fullChar = str[i] + str[i + 1];
      i++;
    }

    const charWidth = isWideChar(fullChar) ? 2 : 1;

    if (currentWidth + charWidth > targetWidth) {
      break;
    }

    result += fullChar;
    currentWidth += charWidth;
  }

  return result + ansi.reset + ellipsis;
}

// Memoized ANSI stripping - avoids repeated regex on same strings during render
const stripAnsiCache = new Map();
const STRIP_ANSI_CACHE_MAX = 1000;

/**
 * Strip ANSI escape codes from a string.
 * Results are memoized for performance during rendering.
 */
export function stripAnsi(str) {
  if (typeof str !== 'string') return '';

  // Check cache first
  const cached = stripAnsiCache.get(str);
  if (cached !== undefined) return cached;

  // Strip ANSI codes
  const result = str.replace(/\x1b\[[0-9;]*m/g, '');

  // Cache result (with size limit to prevent memory leaks)
  if (stripAnsiCache.size >= STRIP_ANSI_CACHE_MAX) {
    // Clear oldest entries (simple strategy: clear half)
    const entries = [...stripAnsiCache.keys()];
    for (let i = 0; i < entries.length / 2; i++) {
      stripAnsiCache.delete(entries[i]);
    }
  }
  stripAnsiCache.set(str, result);

  return result;
}

/**
 * Clear the stripAnsi cache (useful between renders if needed)
 */
export function clearStripAnsiCache() {
  stripAnsiCache.clear();
}
