// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  SKY SCENE - Simple quarter-block sky with clouds                         ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import {
  createBuffer,
  setPixel,
  drawText,
  renderBuffer,
  seededRandom,
} from './quarter-block.js';
import { isDark, colors } from '../theme.js';

// ─────────────────────────────────────────────────────────────────────────────
// COLORS - Now uses centralized theme.js
// ─────────────────────────────────────────────────────────────────────────────

// Star characters - various ASCII stars
const STAR_CHARS = ['·', '∙', '*', '˚', '°', '+', '×'];

// Star colors for dark mode (not themeable - too specialized)
const STAR_COLORS = [
  [80, 85, 100],    // very dim
  [100, 105, 120],  // dim
  [130, 135, 150],  // medium
  [160, 165, 180],  // bright
];

// Get current palette from theme (with backwards-compatible property names)
function getPalette() {
  const c = colors();
  return {
    sky: c.sky,
    cloudBright: c.cloudBright,
    cloudMid: c.cloudMid,
    cloudShadow: c.cloudShadow,
    sunCore: c.sunCore,
    sunMid: c.sunMid,
    sunEdge: c.sunEdge,
    title: c.skyTitle,
    lead: c.skyLead,
    stars: isDark() ? STAR_COLORS : null,
  };
}

// Legacy export for compatibility
const PALETTE = getPalette();

// ─────────────────────────────────────────────────────────────────────────────
// CHUNKY PIXEL FONT (5x7 pixels per character)
// ─────────────────────────────────────────────────────────────────────────────

const PIXEL_FONT = {
  'A': [
    '  ##  ',
    ' #  # ',
    '#    #',
    '######',
    '#    #',
    '#    #',
    '#    #',
  ],
  'B': [
    '##### ',
    '#    #',
    '#    #',
    '##### ',
    '#    #',
    '#    #',
    '##### ',
  ],
  'C': [
    ' #####',
    '#     ',
    '#     ',
    '#     ',
    '#     ',
    '#     ',
    ' #####',
  ],
  'D': [
    '#### ',
    '#   #',
    '#    #',
    '#    #',
    '#    #',
    '#   # ',
    '#### ',
  ],
  'E': [
    '######',
    '#     ',
    '#     ',
    '####  ',
    '#     ',
    '#     ',
    '######',
  ],
  'F': [
    '######',
    '#     ',
    '#     ',
    '####  ',
    '#     ',
    '#     ',
    '#     ',
  ],
  'G': [
    ' #### ',
    '#     ',
    '#     ',
    '#  ###',
    '#    #',
    '#    #',
    ' #### ',
  ],
  'H': [
    '#    #',
    '#    #',
    '#    #',
    '######',
    '#    #',
    '#    #',
    '#    #',
  ],
  'I': [
    '######',
    '  ##  ',
    '  ##  ',
    '  ##  ',
    '  ##  ',
    '  ##  ',
    '######',
  ],
  'J': [
    '   ###',
    '    # ',
    '    # ',
    '    # ',
    '    # ',
    '#   # ',
    ' ###  ',
  ],
  'K': [
    '#    #',
    '#   # ',
    '#  #  ',
    '###   ',
    '#  #  ',
    '#   # ',
    '#    #',
  ],
  'L': [
    '#     ',
    '#     ',
    '#     ',
    '#     ',
    '#     ',
    '#     ',
    '######',
  ],
  'M': [
    '#    #',
    '##  ##',
    '# ## #',
    '#    #',
    '#    #',
    '#    #',
    '#    #',
  ],
  'N': [
    '#    #',
    '##   #',
    '# #  #',
    '#  # #',
    '#   ##',
    '#    #',
    '#    #',
  ],
  'O': [
    ' #### ',
    '#    #',
    '#    #',
    '#    #',
    '#    #',
    '#    #',
    ' #### ',
  ],
  'P': [
    '##### ',
    '#    #',
    '#    #',
    '##### ',
    '#     ',
    '#     ',
    '#     ',
  ],
  'Q': [
    ' #### ',
    '#    #',
    '#    #',
    '#    #',
    '#  # #',
    '#   # ',
    ' ### #',
  ],
  'R': [
    '##### ',
    '#    #',
    '#    #',
    '##### ',
    '#  #  ',
    '#   # ',
    '#    #',
  ],
  'S': [
    ' #####',
    '#     ',
    '#     ',
    ' #### ',
    '     #',
    '     #',
    '##### ',
  ],
  'T': [
    '######',
    '  ##  ',
    '  ##  ',
    '  ##  ',
    '  ##  ',
    '  ##  ',
    '  ##  ',
  ],
  'U': [
    '#    #',
    '#    #',
    '#    #',
    '#    #',
    '#    #',
    '#    #',
    ' #### ',
  ],
  'V': [
    '#    #',
    '#    #',
    '#    #',
    '#    #',
    ' #  # ',
    ' #  # ',
    '  ##  ',
  ],
  'W': [
    '#    #',
    '#    #',
    '#    #',
    '#    #',
    '# ## #',
    '##  ##',
    '#    #',
  ],
  'X': [
    '#    #',
    ' #  # ',
    '  ##  ',
    '  ##  ',
    '  ##  ',
    ' #  # ',
    '#    #',
  ],
  'Y': [
    '#    #',
    ' #  # ',
    '  ##  ',
    '  ##  ',
    '  ##  ',
    '  ##  ',
    '  ##  ',
  ],
  'Z': [
    '######',
    '    # ',
    '   #  ',
    '  #   ',
    ' #    ',
    '#     ',
    '######',
  ],
  ' ': [
    '   ',
    '   ',
    '   ',
    '   ',
    '   ',
    '   ',
    '   ',
  ],
  '-': [
    '      ',
    '      ',
    '      ',
    '######',
    '      ',
    '      ',
    '      ',
  ],
  '.': [
    '  ',
    '  ',
    '  ',
    '  ',
    '  ',
    '##',
    '##',
  ],
  ',': [
    '  ',
    '  ',
    '  ',
    '  ',
    '  ',
    ' #',
    '# ',
  ],
  "'": [
    '##',
    '##',
    '# ',
    '  ',
    '  ',
    '  ',
    '  ',
  ],
};

// Smaller 3x5 font for lead text
const SMALL_FONT = {
  'A': ['###', '# #', '###', '# #', '# #'],
  'B': ['## ', '# #', '## ', '# #', '## '],
  'C': ['###', '#  ', '#  ', '#  ', '###'],
  'D': ['## ', '# #', '# #', '# #', '## '],
  'E': ['###', '#  ', '## ', '#  ', '###'],
  'F': ['###', '#  ', '## ', '#  ', '#  '],
  'G': ['###', '#  ', '# #', '# #', '###'],
  'H': ['# #', '# #', '###', '# #', '# #'],
  'I': ['###', ' # ', ' # ', ' # ', '###'],
  'J': ['  #', '  #', '  #', '# #', '###'],
  'K': ['# #', '## ', '#  ', '## ', '# #'],
  'L': ['#  ', '#  ', '#  ', '#  ', '###'],
  'M': ['# #', '###', '# #', '# #', '# #'],
  'N': ['# #', '###', '###', '# #', '# #'],
  'O': ['###', '# #', '# #', '# #', '###'],
  'P': ['###', '# #', '###', '#  ', '#  '],
  'Q': ['###', '# #', '# #', '###', '  #'],
  'R': ['###', '# #', '## ', '# #', '# #'],
  'S': ['###', '#  ', '###', '  #', '###'],
  'T': ['###', ' # ', ' # ', ' # ', ' # '],
  'U': ['# #', '# #', '# #', '# #', '###'],
  'V': ['# #', '# #', '# #', '# #', ' # '],
  'W': ['# #', '# #', '# #', '###', '# #'],
  'X': ['# #', '# #', ' # ', '# #', '# #'],
  'Y': ['# #', '# #', '###', ' # ', ' # '],
  'Z': ['###', '  #', ' # ', '#  ', '###'],
  ' ': ['  ', '  ', '  ', '  ', '  '],
  '.': ['  ', '  ', '  ', '  ', '# '],
  '-': ['   ', '   ', '###', '   ', '   '],
};

function drawSmallText(buffer, text, startX, startY, color) {
  let cursorX = startX;

  for (const char of text.toUpperCase()) {
    const glyph = SMALL_FONT[char] || SMALL_FONT[' '];

    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] === '#') {
          setPixel(buffer, cursorX + col, startY + row, color, 'grass');
        }
      }
    }

    cursorX += glyph[0].length + 1; // char width + spacing
  }

  return cursorX - startX;
}

function drawPixelText(buffer, text, startX, startY, color) {
  let cursorX = startX;

  for (const char of text.toUpperCase()) {
    const glyph = PIXEL_FONT[char] || PIXEL_FONT[' '];

    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] === '#') {
          setPixel(buffer, cursorX + col, startY + row, color, 'grass');
        }
      }
    }

    cursorX += glyph[0].length + 1; // char width + spacing
  }

  return cursorX - startX; // return total width
}

// ─────────────────────────────────────────────────────────────────────────────
// CLOUD DRAWING
// ─────────────────────────────────────────────────────────────────────────────

function drawCloud(buffer, x, y, size = 'medium') {
  const palette = getPalette();

  // Cumulus clouds: flat bottom, single wide peak on top
  const shapes = {
    small: [
      // Single rounded peak
            [2, 0], [3, 0], [4, 0], [5, 0],
      [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1],
      // Flat bottom
      [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2],
    ],
    medium: [
      // Single wider peak
                  [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0],
            [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1],
      [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2],
      // Flat bottom
      [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3],
    ],
    large: [
      // Single big peak
                        [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [13, 0],
                  [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1], [15, 1],
            [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2], [15, 2], [16, 2], [17, 2],
      [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [14, 3], [15, 3], [16, 3], [17, 3], [18, 3], [19, 3],
      // Flat bottom
      [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [14, 4], [15, 4], [16, 4], [17, 4], [18, 4], [19, 4],
    ],
  };

  const pixels = shapes[size] || shapes.medium;

  // Find max y to determine which row is bottom
  const maxY = Math.max(...pixels.map(([_, py]) => py));

  for (const [dx, dy] of pixels) {
    // Bottom row is slightly shadowed, rest is bright
    const color = dy === maxY ? palette.cloudShadow : palette.cloudBright;
    setPixel(buffer, x + dx, y + dy, color, 'grass');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUN
// ─────────────────────────────────────────────────────────────────────────────

function drawSun(buffer, x, y, random) {
  // THICC sun - 14x12 with random flame-y colors
  const palette = getPalette();
  const sunColors = [palette.sunCore, palette.sunMid, palette.sunEdge];

  const sunPixels = [
    // Top
                            [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0],
                    [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1],
            [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2],
        [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3],
    [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4],
    [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5],
    [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6], [12, 6], [13, 6],
    [0, 7], [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7], [12, 7], [13, 7],
        [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8], [12, 8],
            [2, 9], [3, 9], [4, 9], [5, 9], [6, 9], [7, 9], [8, 9], [9, 9], [10, 9], [11, 9],
                    [3, 10], [4, 10], [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10],
                            [4, 11], [5, 11], [6, 11], [7, 11], [8, 11], [9, 11],
  ];

  for (const [dx, dy] of sunPixels) {
    // Random color for flame-y effect
    const color = sunColors[Math.floor(random() * sunColors.length)];
    setPixel(buffer, x + dx, y + dy, color, 'grass');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE RENDERER
// ─────────────────────────────────────────────────────────────────────────────

export function renderSkyScene(charWidth, charHeight, seed = 42, title = '', description = '') {
  const buffer = createBuffer(charWidth, charHeight);
  const pixelWidth = charWidth * 2;
  const pixelHeight = charHeight * 2;
  const random = seededRandom(seed);
  const palette = getPalette();
  const dark = isDark();

  // Generate random clouds - fewer on mobile
  const isMobile = charWidth < 120;
  const cloudSizes = isMobile
    ? ['small', 'small', 'medium']
    : ['small', 'small', 'small', 'medium', 'medium', 'large'];
  const cloudCount = isMobile
    ? Math.floor(5 + random() * 4)   // 5-8 clouds on mobile
    : Math.floor(10 + random() * 10); // 10-19 clouds on desktop

  // Define safe zones for clouds (avoiding title center)
  const titleCenterX = pixelWidth / 2;
  const titleAvoidRadius = title ? (title.length * 7 / 2) + 10 : 0;

  // Bottom margin scales with height - less margin on small screens
  const bottomMargin = isMobile ? 2 : 8;

  for (let i = 0; i < cloudCount; i++) {
    const size = cloudSizes[Math.floor(random() * cloudSizes.length)];
    const cloudWidth = size === 'small' ? 8 : size === 'medium' ? 14 : 20;
    const cloudHeight = size === 'small' ? 3 : size === 'medium' ? 4 : 5;

    // Calculate available Y range
    const maxY = pixelHeight - cloudHeight - bottomMargin;
    if (maxY <= 0) continue; // Skip if no room for clouds

    // Random position - try a few times to find non-overlapping spot
    let x, y;
    let attempts = 0;
    do {
      x = Math.floor(random() * Math.max(1, pixelWidth - cloudWidth - 4)) + 2;
      y = Math.floor(random() * maxY);

      // Check if too close to title center
      const cloudCenter = x + cloudWidth / 2;
      const tooCloseToTitle = Math.abs(cloudCenter - titleCenterX) < titleAvoidRadius && y < 15;

      if (!tooCloseToTitle) break;
      attempts++;
    } while (attempts < 10);

    if (attempts < 10) {
      drawCloud(buffer, x, y, size);
    }
  }

  // Responsive text rendering (isMobile already defined above)
  if (title) {
    if (isMobile) {
      // Mobile: use small 3x5 pixel font for title (always show)
      const smallCharWidth = 4;
      const titlePixelWidth = title.length * smallCharWidth;
      const titleX = Math.floor((pixelWidth - titlePixelWidth) / 2);
      const titleY = Math.floor((pixelHeight - 5) / 2); // Center vertically
      drawSmallText(buffer, title, titleX, titleY, palette.title);
    } else {
      // Desktop: use big 5x7 pixel font for title (always show)
      const bigCharWidth = 7;
      const titlePixelWidth = title.length * bigCharWidth;
      const titleX = Math.floor((pixelWidth - titlePixelWidth) / 2);
      const titleY = Math.floor((pixelHeight - 7) / 2) - 3; // Center vertically, shift up
      drawPixelText(buffer, title, titleX, titleY, palette.title);
    }
  }

  // Lead text - desktop only
  if (description && !isMobile) {
    const descCharWidth = 4;
    const descPixelWidth = description.length * descCharWidth;
    const descX = Math.floor((pixelWidth - descPixelWidth) / 2);
    const descY = Math.floor((pixelHeight - 5) / 2) + 5;
    drawSmallText(buffer, description, descX, descY, palette.lead);
  }

  let lines = renderBuffer(buffer);

  // Add stars overlay in dark mode
  if (dark && palette.stars) {
    const starRandom = seededRandom(seed + 999); // Different seed for stars
    const starCount = Math.floor(8 + starRandom() * 12); // 8-20 stars

    lines = lines.map((line, rowIdx) => {
      // Convert line to array of chars for manipulation
      // Be careful with ANSI codes - only replace actual spaces
      let result = '';
      let i = 0;
      let inEscape = false;

      while (i < line.length) {
        const char = line[i];

        // Track ANSI escape sequences
        if (char === '\x1b') {
          inEscape = true;
          result += char;
          i++;
          continue;
        }
        if (inEscape) {
          result += char;
          if (char === 'm') inEscape = false;
          i++;
          continue;
        }

        // Only replace spaces with stars (randomly)
        if (char === ' ' && starRandom() < 0.008) {
          const starChar = STAR_CHARS[Math.floor(starRandom() * STAR_CHARS.length)];
          const starColor = palette.stars[Math.floor(starRandom() * palette.stars.length)];
          const [r, g, b] = starColor;
          result += `\x1b[38;2;${r};${g};${b}m${starChar}\x1b[0m`;
        } else {
          result += char;
        }
        i++;
      }
      return result;
    });
  }

  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// STANDALONE TEST
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const width = process.stdout.columns || 80;
  const height = 4;

  console.log('Sky Scene Test:\n');
  const lines = renderSkyScene(width, height, 12345);
  for (const line of lines) {
    console.log(line);
  }
}
