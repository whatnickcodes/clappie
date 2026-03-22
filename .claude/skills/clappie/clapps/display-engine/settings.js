// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CLAPPIE SETTINGS - Simple txt file persistence in recall/settings/       ║
// ║                                                                           ║
// ║  Each setting is its own .txt file with a simple value (on/off, etc)      ║
// ║                                                                           ║
// ║  Usage:                                                                   ║
// ║    import { settings } from '../settings.js';                             ║
// ║    settings.header.get()      // true/false                               ║
// ║    settings.header.toggle()   // flips and saves                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─────────────────────────────────────────────────────────────────────────────
// PATHS
// ─────────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Go up from display-engine to project root:
// display-engine -> clapps -> clappie -> skills -> .claude -> root (5 levels)
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const SETTINGS_DIR = join(PROJECT_ROOT, 'recall', 'settings');

// ─────────────────────────────────────────────────────────────────────────────
// SETTING DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

// Crab color options (vibrant & cute!)
const CRAB_COLORS = [
  'coral', 'hot-pink', 'sky-blue', 'lime-green', 'blush', 'blue-violet',
  'aqua-mint', 'orange', 'tomato', 'purple', 'turquoise', 'gold',
  'coral-light', 'lime', 'deep-pink', 'deep-sky-blue', 'orchid',
  'dark-orange', 'sea-green', 'red-orange', 'orchid-light', 'lawn-green',
  'pink', 'dark-turquoise', 'peach', 'violet', 'aquamarine', 'salmon',
  'green-yellow', 'magenta',
];

// Each setting: { file, type, default, validate? }
const SETTING_DEFS = {
  // Theme settings (theme/ subfolder)
  theme: {
    file: 'theme/mode.txt',    // light or dark
    type: 'enum',
    values: ['light', 'dark'],
    default: 'light',
  },
  scene: {
    file: 'theme/scene.txt',   // unified header+footer toggle
    type: 'bool',
    default: true,
  },
  header: {
    file: 'theme/header.txt',  // legacy, prefer scene
    type: 'bool',
    default: true,
  },
  themeToggle: {
    file: 'theme/toggle.txt',
    type: 'bool',
    default: true,
  },
  footer: {
    file: 'theme/footer.txt',  // legacy, prefer scene
    type: 'bool',
    default: true,
  },
  footerAnimations: {
    file: 'theme/animations.txt',
    type: 'bool',
    default: true,
  },
  crabColor: {
    file: 'theme/crab.txt',
    type: 'enum',
    values: CRAB_COLORS,
    default: 'coral',
  },
  dogColor: {
    file: 'theme/dog.txt',
    type: 'enum',
    values: CRAB_COLORS,
    default: 'coral',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// IN-MEMORY CACHE
// ─────────────────────────────────────────────────────────────────────────────

const cache = {};
let initialized = false;

// Legacy paths for migration (old name → new name in theme/ subfolder)
const LEGACY_MIGRATIONS = [
  // From recall/ root
  { from: join(PROJECT_ROOT, 'recall', 'theme.txt'), to: 'theme/color.txt' },
  { from: join(PROJECT_ROOT, 'recall', 'crab.txt'), to: 'theme/crab.txt' },
  // From recall/settings/ (old prefix style)
  { from: join(SETTINGS_DIR, 'theme.txt'), to: 'theme/color.txt' },
  { from: join(SETTINGS_DIR, 'theme-color.txt'), to: 'theme/color.txt' },
  { from: join(SETTINGS_DIR, 'header.txt'), to: 'theme/header.txt' },
  { from: join(SETTINGS_DIR, 'theme-header.txt'), to: 'theme/header.txt' },
  { from: join(SETTINGS_DIR, 'footer.txt'), to: 'theme/footer.txt' },
  { from: join(SETTINGS_DIR, 'theme-footer.txt'), to: 'theme/footer.txt' },
  { from: join(SETTINGS_DIR, 'footer-animations.txt'), to: 'theme/animations.txt' },
  { from: join(SETTINGS_DIR, 'theme-footer-animations.txt'), to: 'theme/animations.txt' },
  { from: join(SETTINGS_DIR, 'theme', 'footer-animations.txt'), to: 'theme/animations.txt' },
  { from: join(SETTINGS_DIR, 'crab-color.txt'), to: 'theme/crab.txt' },
  { from: join(SETTINGS_DIR, 'theme-crab.txt'), to: 'theme/crab.txt' },
  { from: join(SETTINGS_DIR, 'theme-crab-color.txt'), to: 'theme/crab.txt' },
  { from: join(SETTINGS_DIR, 'theme-toggle.txt'), to: 'theme/toggle.txt' },
  // color.txt → mode.txt rename
  { from: join(SETTINGS_DIR, 'theme', 'color.txt'), to: 'theme/mode.txt' },
];

// ─────────────────────────────────────────────────────────────────────────────
// FILE I/O
// ─────────────────────────────────────────────────────────────────────────────

function ensureDir(subdir = null) {
  const dir = subdir ? join(SETTINGS_DIR, subdir) : SETTINGS_DIR;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readSetting(name) {
  const def = SETTING_DEFS[name];
  if (!def) return null;

  const filePath = join(SETTINGS_DIR, def.file);
  try {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf8').trim().toLowerCase();

      if (def.type === 'bool') {
        if (content === 'on' || content === 'true' || content === '1') return true;
        if (content === 'off' || content === 'false' || content === '0') return false;
      } else if (def.type === 'enum') {
        if (def.values.includes(content)) return content;
      }
    }
  } catch (e) {
    // Ignore read errors
  }
  return null;
}

function writeSetting(name, value) {
  const def = SETTING_DEFS[name];
  if (!def) return;

  // Ensure subdirectory exists (e.g., theme/ for theme/color.txt)
  const subdir = def.file.includes('/') ? dirname(def.file) : null;
  ensureDir(subdir);
  const filePath = join(SETTINGS_DIR, def.file);

  try {
    let content;
    if (def.type === 'bool') {
      content = value ? 'on' : 'off';
    } else {
      content = String(value);
    }
    writeFileSync(filePath, content, 'utf8');
  } catch (e) {
    // Ignore write errors
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MIGRATION
// ─────────────────────────────────────────────────────────────────────────────

function migrateLegacyFiles() {
  ensureDir();
  for (const { from, to } of LEGACY_MIGRATIONS) {
    const newFile = join(SETTINGS_DIR, to);
    if (existsSync(from) && !existsSync(newFile)) {
      try {
        const content = readFileSync(from, 'utf8').trim();
        writeFileSync(newFile, content, 'utf8');
      } catch (e) {
        // Ignore migration errors
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

function init() {
  if (initialized) return;

  // Migrate legacy files if needed
  migrateLegacyFiles();

  for (const name of Object.keys(SETTING_DEFS)) {
    const saved = readSetting(name);
    cache[name] = saved !== null ? saved : SETTING_DEFS[name].default;
  }

  initialized = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTING ACCESSORS
// ─────────────────────────────────────────────────────────────────────────────

function createBoolAccessor(name) {
  return {
    get() {
      if (!initialized) init();
      return cache[name];
    },
    set(value) {
      if (!initialized) init();
      cache[name] = !!value;
      writeSetting(name, cache[name]);
      return cache[name];
    },
    toggle() {
      return this.set(!this.get());
    },
  };
}

function createEnumAccessor(name) {
  const def = SETTING_DEFS[name];
  return {
    get() {
      if (!initialized) init();
      return cache[name];
    },
    set(value) {
      if (!initialized) init();
      if (!def.values.includes(value)) {
        throw new Error(`Invalid value for ${name}: ${value}. Use: ${def.values.join(', ')}`);
      }
      cache[name] = value;
      writeSetting(name, value);
      return cache[name];
    },
    toggle() {
      // Cycle through enum values
      const current = this.get();
      const idx = def.values.indexOf(current);
      const next = def.values[(idx + 1) % def.values.length];
      return this.set(next);
    },
    is(value) {
      return this.get() === value;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export const settings = {
  // Theme (enum: light/dark)
  theme: createEnumAccessor('theme'),

  // Scene toggle (unified header+footer)
  scene: createBoolAccessor('scene'),

  // Layout toggles (bool: on/off) - legacy, prefer scene
  header: createBoolAccessor('header'),
  themeToggle: createBoolAccessor('themeToggle'),
  footer: createBoolAccessor('footer'),
  footerAnimations: createBoolAccessor('footerAnimations'),

  // Sprite colors (enum: coral, hot-pink, etc.)
  crabColor: createEnumAccessor('crabColor'),
  dogColor: createEnumAccessor('dogColor'),

  // Utility
  init,
  reload() {
    initialized = false;
    init();
  },
};

export default settings;
