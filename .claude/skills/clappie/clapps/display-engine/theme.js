// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CLAPPIE THEME - Centralized color management                             ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    import { theme, colors } from '../theme.js';                           ║
// ║    const c = colors();                                                    ║
// ║    ansi.fg.rgb(...c.primary)                                              ║
// ║                                                                           ║
// ║  Theme persists to: recall/settings/theme/mode.txt                        ║
// ║  Color overrides: recall/settings/theme/colors.txt                        ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { settings } from './settings.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const SETTINGS_DIR = join(PROJECT_ROOT, 'recall', 'settings');

// ─────────────────────────────────────────────────────────────────────────────
// COLOR PALETTES
// ─────────────────────────────────────────────────────────────────────────────

const PALETTES = {
  light: {
    // ─────────────────────────────────────────────────────────────────────────
    // UI COLORS
    // ─────────────────────────────────────────────────────────────────────────
    background: [240, 238, 231],     // warm cream
    primary: [217, 119, 87],         // coral accent
    primaryFocused: [217, 119, 87],  // coral focused
    text: [45, 42, 40],              // dark text
    textMuted: [120, 115, 110],      // dim/disabled
    textInverse: [255, 255, 255],    // white text on colored bg
    statusText: [140, 135, 130],
    statusAccent: [217, 119, 87],
    border: [180, 175, 170],
    borderFocused: [217, 119, 87],
    divider: [200, 198, 195],

    // ─────────────────────────────────────────────────────────────────────────
    // SKY COLORS
    // ─────────────────────────────────────────────────────────────────────────
    sky: [170, 210, 255],            // soft blue
    cloudBright: [255, 255, 255],    // white highlights
    cloudMid: [245, 250, 255],       // soft white
    cloudShadow: [225, 235, 250],    // subtle shadow
    sunCore: [255, 225, 90],         // warm yellow
    sunMid: [255, 220, 80],
    sunEdge: [255, 210, 70],
    skyTitle: [70, 130, 180],        // steel blue text
    skyLead: [135, 180, 220],        // sky blue text

    // ─────────────────────────────────────────────────────────────────────────
    // GARDEN COLORS
    // ─────────────────────────────────────────────────────────────────────────
    grass1: [34, 85, 51],            // darkest
    grass2: [45, 106, 64],
    grass3: [56, 128, 77],
    grass4: [72, 155, 95],           // lightest
    stem: [100, 180, 70],
    dirt: [92, 64, 51],
    dirtLight: [107, 83, 68],
    pebble1: [140, 130, 120],
    pebble2: [160, 150, 140],

    // ─────────────────────────────────────────────────────────────────────────
    // FLOWER COLORS
    // ─────────────────────────────────────────────────────────────────────────
    flowerWhite: [250, 250, 240],
    flowerWhiteCenter: [255, 190, 60],
    flowerRed: [230, 70, 70],
    flowerRedCenter: [255, 210, 80],
    flowerPurple: [170, 100, 210],
    flowerPurpleCenter: [255, 210, 80],
    flowerBlue: [100, 170, 255],
    flowerBlueCenter: [255, 230, 100],
    flowerPink: [255, 150, 180],
    flowerPinkCenter: [255, 220, 80],
    flowerOrange: [255, 160, 70],
    flowerOrangeCenter: [180, 60, 30],

    // ─────────────────────────────────────────────────────────────────────────
    // SPRITE COLORS (crab/dog eyes)
    // ─────────────────────────────────────────────────────────────────────────
    spriteEyes: [0, 0, 0],           // jet black
  },

  dark: {
    // ─────────────────────────────────────────────────────────────────────────
    // UI COLORS
    // ─────────────────────────────────────────────────────────────────────────
    background: [28, 28, 32],        // dark charcoal
    primary: [217, 119, 87],         // coral accent
    primaryFocused: [217, 119, 87],
    text: [240, 240, 240],           // nearly white
    textMuted: [180, 180, 190],
    textInverse: [20, 20, 25],
    statusText: [180, 180, 190],
    statusAccent: [217, 119, 87],
    border: [100, 100, 110],
    borderFocused: [217, 119, 87],
    divider: [65, 65, 72],

    // ─────────────────────────────────────────────────────────────────────────
    // SKY COLORS (night mode)
    // ─────────────────────────────────────────────────────────────────────────
    sky: null,                       // transparent (uses tmux bg)
    cloudBright: [200, 205, 210],    // muted white
    cloudMid: [180, 185, 190],
    cloudShadow: [160, 165, 170],
    sunCore: [220, 225, 235],        // moon - silvery
    sunMid: [200, 205, 215],
    sunEdge: [180, 185, 195],
    skyTitle: [140, 170, 200],
    skyLead: [120, 150, 180],

    // ─────────────────────────────────────────────────────────────────────────
    // GARDEN COLORS (same as light - garden is always green)
    // ─────────────────────────────────────────────────────────────────────────
    grass1: [34, 85, 51],
    grass2: [45, 106, 64],
    grass3: [56, 128, 77],
    grass4: [72, 155, 95],
    stem: [100, 180, 70],
    dirt: [92, 64, 51],
    dirtLight: [107, 83, 68],
    pebble1: [140, 130, 120],
    pebble2: [160, 150, 140],

    // ─────────────────────────────────────────────────────────────────────────
    // FLOWER COLORS (same as light)
    // ─────────────────────────────────────────────────────────────────────────
    flowerWhite: [250, 250, 240],
    flowerWhiteCenter: [255, 190, 60],
    flowerRed: [230, 70, 70],
    flowerRedCenter: [255, 210, 80],
    flowerPurple: [170, 100, 210],
    flowerPurpleCenter: [255, 210, 80],
    flowerBlue: [100, 170, 255],
    flowerBlueCenter: [255, 230, 100],
    flowerPink: [255, 150, 180],
    flowerPinkCenter: [255, 220, 80],
    flowerOrange: [255, 160, 70],
    flowerOrangeCenter: [180, 60, 30],

    // ─────────────────────────────────────────────────────────────────────────
    // SPRITE COLORS
    // ─────────────────────────────────────────────────────────────────────────
    spriteEyes: [0, 0, 0],
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// COLOR OVERRIDE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a hex color (#rrggbb) to RGB array [r, g, b]
 */
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

/**
 * Load color overrides from a colors.txt file
 * Format: colorName=#rrggbb (lines starting with # are comments)
 */
function loadColorOverrides(filePath) {
  const overrides = {};
  if (!existsSync(filePath)) return overrides;

  try {
    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const [name, value] = trimmed.split('=').map(s => s.trim());
      if (name && value && value.startsWith('#')) {
        overrides[name] = hexToRgb(value);
      }
    }
  } catch (e) {
    // Ignore read errors
  }
  return overrides;
}

/**
 * Get merged color palette with overrides applied
 */
function getMergedPalette(themeName) {
  // Start with base palette
  const base = { ...PALETTES[themeName] };

  // Load general overrides from theme/colors.txt
  const generalOverrides = loadColorOverrides(join(SETTINGS_DIR, 'theme', 'colors.txt'));

  // Merge: base <- general overrides
  return { ...base, ...generalOverrides };
}

// ─────────────────────────────────────────────────────────────────────────────
// THEME STATE (delegated to settings.js)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API (delegates to settings.js for persistence)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize theme - call once at startup
 */
export function initTheme() {
  settings.init();
  return settings.theme.get();
}

/**
 * Get current theme name
 */
export function getTheme() {
  return settings.theme.get();
}

/**
 * Set theme and persist
 */
export function setTheme(themeName) {
  return settings.theme.set(themeName);
}

/**
 * Toggle between dark and light
 */
export function toggleTheme() {
  return settings.theme.toggle();
}

/**
 * Check if dark mode
 */
export function isDark() {
  return settings.theme.is('dark');
}

/**
 * Get current color palette (with overrides merged)
 */
export function colors() {
  return getMergedPalette(settings.theme.get());
}

/**
 * Get a specific color as RGB array
 */
export function color(name) {
  const c = colors();
  if (!c[name]) {
    throw new Error(`Unknown color: ${name}. Available: ${Object.keys(c).join(', ')}`);
  }
  return c[name];
}

// Convenience export for the whole theme object
export const theme = {
  init: initTheme,
  get: getTheme,
  set: setTheme,
  toggle: toggleTheme,
  isDark,
  colors,
  color,
};

export default theme;
