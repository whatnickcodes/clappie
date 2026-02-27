// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  QUARTER-BLOCK RENDERING SYSTEM                                           ║
// ║  2x2 pixels per character using ▘▝▖▗▛▜▙▟▀▄▌▐█                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// Quarter-block character map: 4 bits (TL TR BL BR) -> character
// Bit order: TL=8, TR=4, BL=2, BR=1
const QUARTER_CHARS = {
  0b0000: ' ',
  0b1000: '▘',
  0b0100: '▝',
  0b0010: '▖',
  0b0001: '▗',
  0b1100: '▀',
  0b0011: '▄',
  0b1010: '▌',
  0b0101: '▐',
  0b1110: '▛',
  0b1101: '▜',
  0b1011: '▙',
  0b0111: '▟',
  0b1111: '█',
  0b1001: '▚',  // diagonal TL+BR
  0b0110: '▞',  // diagonal TR+BL
};

const reset = '\x1b[0m';

function fg([r, g, b]) {
  return `\x1b[38;2;${r};${g};${b}m`;
}

function bg([r, g, b]) {
  return `\x1b[48;2;${r};${g};${b}m`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PIXEL BUFFER - stores colors at 2x char resolution
// Buffer dimensions: (charWidth * 2) x (charHeight * 2)
// ─────────────────────────────────────────────────────────────────────────────

export function createBuffer(charWidth, charHeight) {
  const pixelWidth = charWidth * 2;
  const pixelHeight = charHeight * 2;
  const buffer = [];
  for (let y = 0; y < pixelHeight; y++) {
    buffer[y] = new Array(pixelWidth).fill(null);
  }
  buffer.charWidth = charWidth;
  buffer.charHeight = charHeight;
  return buffer;
}

// Pixel format: { color: [r,g,b], layer: 'grass'|'crab'|null }
// For backwards compat, also accepts plain [r,g,b] arrays

export function setPixel(buffer, x, y, color, layer = null) {
  if (y >= 0 && y < buffer.length && x >= 0 && x < buffer[0].length) {
    if (color) {
      buffer[y][x] = { color: Array.isArray(color) ? color : color.color, layer: layer || (color?.layer) || null };
    } else {
      buffer[y][x] = null;
    }
  }
}

export function getPixel(buffer, x, y) {
  if (y >= 0 && y < buffer.length && x >= 0 && x < buffer[0].length) {
    return buffer[y][x];
  }
  return null;
}

// Helper to extract just the color from a pixel
function getColor(pixel) {
  if (!pixel) return null;
  return pixel.color || pixel; // Handle both {color, layer} and plain [r,g,b]
}

function getLayer(pixel) {
  if (!pixel) return null;
  return pixel.layer || null;
}

// Draw a sprite (2D array of colors) into buffer at pixel coordinates
export function drawSprite(buffer, sprite, offsetX, offsetY, layer = null) {
  for (let y = 0; y < sprite.length; y++) {
    for (let x = 0; x < sprite[y].length; x++) {
      const color = sprite[y][x];
      if (color) {
        setPixel(buffer, offsetX + x, offsetY + y, color, layer);
      }
    }
  }
}

// Draw text (quarter-block characters) into buffer
// This converts the character back to pixels - useful for the crab logo
export function drawText(buffer, text, offsetX, offsetY, color, layer = null) {
  const lines = Array.isArray(text) ? text : text.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    for (let charIdx = 0; charIdx < line.length; charIdx++) {
      const char = line[charIdx];
      const mask = charToMask(char);

      // Each character maps to 2x2 pixels
      const px = offsetX + (charIdx * 2);
      const py = offsetY + (lineIdx * 2);

      // Set pixels based on mask
      if (mask & 0b1000) setPixel(buffer, px, py, color, layer);         // TL
      if (mask & 0b0100) setPixel(buffer, px + 1, py, color, layer);     // TR
      if (mask & 0b0010) setPixel(buffer, px, py + 1, color, layer);     // BL
      if (mask & 0b0001) setPixel(buffer, px + 1, py + 1, color, layer); // BR
    }
  }
}

// Convert character to 4-bit mask
function charToMask(char) {
  for (const [mask, c] of Object.entries(QUARTER_CHARS)) {
    if (c === char) return parseInt(mask);
  }
  // Full block for unknown filled chars, empty for space/unknown
  if (char === '█') return 0b1111;
  if (char === ' ') return 0b0000;
  return 0b0000;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSITING - layer buffers together
// ─────────────────────────────────────────────────────────────────────────────

// Composite src buffer onto dst buffer (src pixels overwrite dst where non-null)
export function composite(dst, src, offsetX = 0, offsetY = 0) {
  for (let y = 0; y < src.length; y++) {
    for (let x = 0; x < src[y].length; x++) {
      const color = src[y][x];
      if (color) {
        setPixel(dst, offsetX + x, offsetY + y, color);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDERING - convert pixel buffer to terminal strings
// ─────────────────────────────────────────────────────────────────────────────

export function renderBuffer(buffer) {
  const lines = [];
  const charWidth = buffer.charWidth;
  const charHeight = buffer.charHeight;

  for (let cy = 0; cy < charHeight; cy++) {
    let line = '';

    for (let cx = 0; cx < charWidth; cx++) {
      // Get the 4 pixels for this character cell
      const px = cx * 2;
      const py = cy * 2;

      const pixels = [
        getPixel(buffer, px, py),         // TL = index 0
        getPixel(buffer, px + 1, py),     // TR = index 1
        getPixel(buffer, px, py + 1),     // BL = index 2
        getPixel(buffer, px + 1, py + 1), // BR = index 3
      ];

      // Check layers present in this cell
      // 'grass' and 'ground' are both part of the vegetation/background layer
      const isVegetation = (p) => {
        const layer = getLayer(p);
        return layer === 'grass' || layer === 'ground';
      };
      const hasGrass = pixels.some(isVegetation);
      const isSprite = (p) => {
        const layer = getLayer(p);
        return layer === 'crab' || layer === 'dog';
      };
      const hasCrab = pixels.some(isSprite);

      // Separate pixels by layer
      const grassPixels = pixels.map(p => isVegetation(p) ? p : null);
      const crabPixels = pixels.map(p => isSprite(p) ? p : null);

      // Group grass pixels by color
      const grassGroups = new Map();
      const quadrantBits = [0b1000, 0b0100, 0b0010, 0b0001];

      for (let i = 0; i < 4; i++) {
        const pixel = grassPixels[i];
        const color = getColor(pixel);
        if (color) {
          const key = color.join(',');
          if (!grassGroups.has(key)) {
            grassGroups.set(key, { color, quadrants: [], mask: 0 });
          }
          const group = grassGroups.get(key);
          group.quadrants.push(i);
          group.mask |= quadrantBits[i];
        }
      }

      // Get first crab color (for bg when grass is fg)
      const crabColor = crabPixels.find(p => p) ? getColor(crabPixels.find(p => p)) : null;

      if (grassGroups.size === 0 && !hasCrab) {
        // All transparent - no grass, no crab
        line += ' ';
      } else if (grassGroups.size === 0 && hasCrab) {
        // No grass, just crab - render crab normally
        const crabGroups = new Map();
        for (let i = 0; i < 4; i++) {
          const pixel = crabPixels[i];
          const color = getColor(pixel);
          if (color) {
            const key = color.join(',');
            if (!crabGroups.has(key)) {
              crabGroups.set(key, { color, quadrants: [], mask: 0 });
            }
            const group = crabGroups.get(key);
            group.quadrants.push(i);
            group.mask |= quadrantBits[i];
          }
        }
        if (crabGroups.size === 1) {
          const group = [...crabGroups.values()][0];
          const char = QUARTER_CHARS[group.mask] || ' ';
          line += fg(group.color) + char + reset;
        } else if (crabGroups.size >= 2) {
          const groups = [...crabGroups.values()].sort((a, b) => b.quadrants.length - a.quadrants.length);
          const fgGroup = groups[0];
          const bgGroup = groups[1];
          const char = QUARTER_CHARS[fgGroup.mask] || '█';
          line += fg(fgGroup.color) + bg(bgGroup.color) + char + reset;
        } else {
          line += ' ';
        }
      } else if (grassGroups.size === 1) {
        // Single grass color
        const grassGroup = [...grassGroups.values()][0];
        const char = QUARTER_CHARS[grassGroup.mask] || ' ';

        if (hasCrab && crabColor) {
          // Mixed cell: grass fg, crab bg (crab shows through gaps!)
          line += fg(grassGroup.color) + bg(crabColor) + char + reset;
        } else {
          // Pure grass, no crab behind
          line += fg(grassGroup.color) + char + reset;
        }
      } else if (hasCrab && crabColor) {
        // 2+ grass colors BUT crab behind - flatten grass to show crab!
        // Combine all grass into one mask, pick darkest grass color for fg
        let combinedMask = 0;
        let darkestGrass = null;
        let darkestLuma = Infinity;
        for (const group of grassGroups.values()) {
          combinedMask |= group.mask;
          // Approximate luminance: 0.299*R + 0.587*G + 0.114*B
          const luma = group.color[0] * 0.299 + group.color[1] * 0.587 + group.color[2] * 0.114;
          if (luma < darkestLuma) {
            darkestLuma = luma;
            darkestGrass = group.color;
          }
        }
        const char = QUARTER_CHARS[combinedMask] || '█';
        line += fg(darkestGrass) + bg(crabColor) + char + reset;
      } else {
        // 2+ grass colors, no crab - render grass gradient normally
        const groups = [...grassGroups.values()].sort((a, b) => b.quadrants.length - a.quadrants.length);
        const fgGroup = groups[0];
        const bgGroup = groups[1];

        const char = QUARTER_CHARS[fgGroup.mask] || '█';
        line += fg(fgGroup.color) + bg(bgGroup.color) + char + reset;
      }
    }

    lines.push(line);
  }

  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export function colorsEqual(a, b) {
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

// Seeded random for deterministic generation
export function seededRandom(seed) {
  return () => {
    const x = Math.sin(seed++) * 43758.5453;
    return x - Math.floor(x);
  };
}
