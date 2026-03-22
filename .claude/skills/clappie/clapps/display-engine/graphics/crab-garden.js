// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CRAB GARDEN - Quarter-block scene with animated crab                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import {
  createBuffer,
  setPixel,
  drawText,
  composite,
  renderBuffer,
  seededRandom,
} from './quarter-block.js';
import { settings } from '../settings.js';
import { colors } from '../theme.js';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION - All tunable values in one place
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  // Animation constraints
  MAX_SKITTER: 12,         // Max pixels crab can move horizontally from base
  MAX_JUMP_HEIGHT: 2,      // Max pixels crab can jump vertically
  GAP_PADDING: 0,          // Extra pixels around crab for grass gap

  // Physics
  GRAVITY: 0.4,           // Downward acceleration per frame

  // Jump velocities (pixels per frame)
  JUMP_BIG: { min: 3.5, range: 1.0 },      // Rare high jumps
  JUMP_MEDIUM: { min: 1.8, range: 0.7 },   // Common hops
  JUMP_SMALL: { min: 0.8, range: 0.5 },    // Frequent tiny hops
  JUMP_MICRO: { min: 0.6, range: 0.8 },    // While skittering

  // Skitter speed (pixels per frame)
  SKITTER_SPEED: { min: 1, range: 2 },

  // Pause duration (frames)
  PAUSE_FRAMES: { min: 10, range: 30 },

  // Action probabilities per frame (checked in order, must sum < 1)
  // idle -> skitter: 5%, idle -> jump: 3%, idle -> pause: 2%
  PROB_SKITTER: 0.05,
  PROB_JUMP: 0.03,
  PROB_PAUSE: 0.02,
  PROB_MICRO_HOP: 0.05,   // Chance to hop while skittering

  // Jump type distribution
  PROB_BIG_JUMP: 0.12,    // 12% of jumps are big
  PROB_MEDIUM_JUMP: 0.38, // 38% are medium (cumulative 50%)
  // Remaining 50% are small

  // Ground cover generation
  GRASS_PATCH_CHANCE: 0.7,    // Chance of grass patch at each x position
  GRASS_BUMP_CHANCE: 0.3,     // Chance of 1px bump on top of patch
  FLOWER_CHANCE: 0.06,        // Chance of tiny flower

  // Scene dimensions
  SCENE_HEIGHT: 5,        // Character height of rendered scene
};

// ─────────────────────────────────────────────────────────────────────────────
// COLORS - Now delegated to centralized theme.js
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the current color palette from theme.
 * This allows per-device overrides via recall/settings/theme/devices/<ip>/colors.txt
 */
function getPalette() {
  const c = colors();
  return {
    // Sprite eyes
    crabEyes: c.spriteEyes,

    // Grass layers (dark to light)
    grass1: c.grass1,
    grass2: c.grass2,
    grass3: c.grass3,
    grass4: c.grass4,

    // Flowers
    flowerWhite: c.flowerWhite,
    flowerWhiteCenter: c.flowerWhiteCenter,
    flowerRed: c.flowerRed,
    flowerRedCenter: c.flowerRedCenter,
    flowerPurple: c.flowerPurple,
    flowerPurpleCenter: c.flowerPurpleCenter,
    flowerBlue: c.flowerBlue,
    flowerBlueCenter: c.flowerBlueCenter,
    flowerPink: c.flowerPink,
    flowerPinkCenter: c.flowerPinkCenter,
    flowerOrange: c.flowerOrange,
    flowerOrangeCenter: c.flowerOrangeCenter,

    stem: c.stem,

    // Pebbles
    pebble1: c.pebble1,
    pebble2: c.pebble2,

    // Ground
    dirt: c.dirt,
    dirtLight: c.dirtLight,
  };
}

// Eye positions in pixel coordinates (relative to crab top-left)
// Derived from sprite: ' ▐▛███▜▌' where ▛ at char 2 and ▜ at char 6 have the eye holes
const CRAB_EYES = [
  { x: 5, y: 1 },   // Left eye: char 2 (▛) bottom-right pixel = (2*2+1, 0*2+1)
  { x: 12, y: 1 },  // Right eye: char 6 (▜) bottom-left pixel = (6*2, 0*2+1)
];

// ─────────────────────────────────────────────────────────────────────────────
// CRAB SPRITE - The sacred Claude Code logo (DO NOT MODIFY)
// ─────────────────────────────────────────────────────────────────────────────

const CRAB_TEXT = [
  ' ▐▛███▜▌',
  '▝▜█████▛▘',
  '  ▘▘ ▝▝',
];

// Crab dimensions in characters
const CRAB_CHAR_WIDTH = 9;
const CRAB_CHAR_HEIGHT = 3;

// ─────────────────────────────────────────────────────────────────────────────
// DOG SPRITE - The crab's little buddy
// ─────────────────────────────────────────────────────────────────────────────

const DOG_TEXT = [
  '   ▖ ▖',
  '▗ █▜▛█',
  ' ▛▛▛▛▀ ',
];

const DOG_CHAR_WIDTH = 7;
const DOG_CHAR_HEIGHT = 3;

// Dog eyes: same technique as crab - black pixel in hollow quadrant
// ▜ at char(3,1) hollow BL = pixel (6,3), ▛ at char(4,1) hollow BR = pixel (9,3)
const DOG_EYES = [
  { x: 6, y: 3 },   // Left eye: BL of ▜
  { x: 9, y: 3 },   // Right eye: BR of ▛
];

// ─────────────────────────────────────────────────────────────────────────────
// GROUND COVER GENERATOR - Patchy grass with tiny flowers
// ─────────────────────────────────────────────────────────────────────────────

const FLOWER_COLORS = ['flowerPink', 'flowerYellow', 'flowerWhite', 'flowerBlue'];

function generateGrass(charWidth, charHeight, seed = 12345, gapStart = null, gapEnd = null, flowerBounceIdx = -1, bounceOffset = 0) {
  const buffer = createBuffer(charWidth, charHeight);
  const random = seededRandom(seed);
  const pixelWidth = charWidth * 2;
  const pixelHeight = charHeight * 2;

  // Get current palette (supports per-device overrides)
  const PALETTE = getPalette();

  // Track flower positions for click detection (character coordinates)
  const flowerPositions = [];

  // Clamp gap bounds to valid range
  if (gapStart !== null) gapStart = Math.max(0, gapStart);
  if (gapEnd !== null) gapEnd = Math.min(pixelWidth, gapEnd);

  // Ground layer - dirt at bottom
  const groundY = pixelHeight - 1;
  for (let x = 0; x < pixelWidth; x++) {
    const color = random() > 0.5 ? PALETTE.dirt : PALETTE.dirtLight;
    setPixel(buffer, x, groundY, color, 'ground');
  }

  // Grass base layer - solid dark green
  const baseY = groundY - 1;
  for (let x = 0; x < pixelWidth; x++) {
    setPixel(buffer, x, baseY, PALETTE.grass1, 'grass');
  }

  // Patchy ground cover layer (skip gap for crab)
  const coverY = baseY - 1;
  let lastFlowerX = -10; // Track flower positions to prevent overlap

  for (let x = 0; x < pixelWidth; x++) {
    if (gapStart !== null && gapEnd !== null && x >= gapStart && x < gapEnd) {
      continue;
    }

    // Patchy grass - not every pixel
    if (random() < CONFIG.GRASS_PATCH_CHANCE) {
      // Pick grass shade (mostly medium, occasionally light)
      const shade = random() < 0.6 ? PALETTE.grass2 : PALETTE.grass3;
      setPixel(buffer, x, coverY, shade, 'grass');

      // Small chance of tiny bump on top
      if (random() < CONFIG.GRASS_BUMP_CHANCE && coverY > 0) {
        const bumpShade = random() < 0.5 ? PALETTE.grass3 : PALETTE.grass4;
        setPixel(buffer, x, coverY - 1, bumpShade, 'grass');
      }
    }

  }

  // Helper to draw a small 4-petal flower
  // flowerIdx: which flower this is (for bounce tracking)
  // isBouncing: whether this flower is currently bouncing
  // bounceOff: vertical offset for bounce animation
  function drawSmallFlower(bx, by, petalColor, stemHeight, flowerIdx, isBouncing, bounceOff) {
    const centerColor = petalColor + 'Center';  // e.g. flowerPink -> flowerPinkCenter

    // Apply bounce offset to flower head position (moves it down during bounce)
    const headY = by + bounceOff;

    // Row 0: top petal
    setPixel(buffer, bx + 2, headY, PALETTE[petalColor], 'grass');
    setPixel(buffer, bx + 3, headY, PALETTE[petalColor], 'grass');

    // Row 1: left petal, center, right petal
    setPixel(buffer, bx, headY + 1, PALETTE[petalColor], 'grass');
    setPixel(buffer, bx + 1, headY + 1, PALETTE[petalColor], 'grass');
    setPixel(buffer, bx + 2, headY + 1, PALETTE[centerColor], 'grass');
    setPixel(buffer, bx + 3, headY + 1, PALETTE[centerColor], 'grass');
    setPixel(buffer, bx + 4, headY + 1, PALETTE[petalColor], 'grass');
    setPixel(buffer, bx + 5, headY + 1, PALETTE[petalColor], 'grass');

    // Row 2: bottom petal
    setPixel(buffer, bx + 2, headY + 2, PALETTE[petalColor], 'grass');
    setPixel(buffer, bx + 3, headY + 2, PALETTE[petalColor], 'grass');

    // Stem (variable height) - stem stays in place, connects to bouncing head
    const stemStartY = headY + 3;
    const stemEndY = by + 3 + stemHeight;  // Original stem end position
    for (let s = stemStartY; s < stemEndY; s++) {
      setPixel(buffer, bx + 2, s, PALETTE.stem, 'grass');
      setPixel(buffer, bx + 3, s, PALETTE.stem, 'grass');
    }

    // Track flower position (in character coordinates for click detection)
    // Flower head is ~3 chars wide (6 pixels), centered at bx+3
    flowerPositions.push({
      index: flowerIdx,
      charX: Math.floor(bx / 2),           // Left edge in chars
      charWidth: 3,                         // ~3 chars wide
      pixelX: bx,
      pixelWidth: 6,
      type: 'small',
    });
  }

  // Helper to draw the big flower with curved stem and leaves
  // flowerIdx: which flower this is (for bounce tracking)
  // isBouncing: whether this flower is currently bouncing
  // bounceOff: vertical offset for bounce animation
  function drawBigFlower(bx, by, petalColor, flowerIdx, isBouncing, bounceOff) {
    const petal = PALETTE[petalColor];
    const centerColor = petalColor + 'Center';
    const center = PALETTE[centerColor];
    const stemC = PALETTE.stem;

    // Apply bounce offset to flower head position
    const headY = by + bounceOff;

    // Row 0: top petal
    setPixel(buffer, bx + 4, headY, petal, 'grass');
    setPixel(buffer, bx + 5, headY, petal, 'grass');
    setPixel(buffer, bx + 6, headY, petal, 'grass');
    setPixel(buffer, bx + 7, headY, petal, 'grass');

    // Row 1: middle row
    setPixel(buffer, bx + 2, headY + 1, petal, 'grass');
    setPixel(buffer, bx + 3, headY + 1, petal, 'grass');
    setPixel(buffer, bx + 4, headY + 1, center, 'grass');
    setPixel(buffer, bx + 5, headY + 1, center, 'grass');
    setPixel(buffer, bx + 6, headY + 1, center, 'grass');
    setPixel(buffer, bx + 7, headY + 1, center, 'grass');
    setPixel(buffer, bx + 8, headY + 1, petal, 'grass');
    setPixel(buffer, bx + 9, headY + 1, petal, 'grass');

    // Row 2: bottom petal + leaf branch start (leaf stays fixed, head bounces)
    setPixel(buffer, bx + 4, headY + 2, petal, 'grass');
    setPixel(buffer, bx + 5, headY + 2, petal, 'grass');
    setPixel(buffer, bx + 6, headY + 2, petal, 'grass');
    setPixel(buffer, bx + 7, headY + 2, petal, 'grass');

    // Stem and leaves (drawn at original positions, not affected by bounce)
    // Row 2: leaf branch on right side
    setPixel(buffer, bx + 12, by + 2, stemC, 'grass');
    setPixel(buffer, bx + 13, by + 2, stemC, 'grass');

    // Row 3: stem branching with forked leaf structure
    setPixel(buffer, bx + 8, by + 3, stemC, 'grass');
    setPixel(buffer, bx + 9, by + 3, stemC, 'grass');
    setPixel(buffer, bx + 11, by + 3, stemC, 'grass');
    setPixel(buffer, bx + 12, by + 3, stemC, 'grass');

    // Row 4: stem
    setPixel(buffer, bx + 10, by + 4, stemC, 'grass');
    setPixel(buffer, bx + 11, by + 4, stemC, 'grass');

    // Row 5: stem curves
    setPixel(buffer, bx + 9, by + 5, stemC, 'grass');
    setPixel(buffer, bx + 10, by + 5, stemC, 'grass');

    // Row 6: stem into grass
    setPixel(buffer, bx + 8, by + 6, stemC, 'grass');
    setPixel(buffer, bx + 9, by + 6, stemC, 'grass');

    // Track flower position
    flowerPositions.push({
      index: flowerIdx,
      charX: Math.floor((bx + 2) / 2),
      charWidth: 5,  // ~10 pixels wide
      pixelX: bx + 2,
      pixelWidth: 10,
      type: 'big',
    });
  }

  // Generate random flower positions (avoiding crab gap)
  const colors = ['flowerWhite', 'flowerRed', 'flowerPurple', 'flowerBlue', 'flowerPink', 'flowerOrange'];
  const usedPositions = [];

  // Check if position overlaps with gap or other flowers
  function canPlace(x, width) {
    // Check gap
    if (gapStart !== null && gapEnd !== null) {
      if (x + width > gapStart - 4 && x < gapEnd + 4) return false;
    }
    // Check other flowers
    for (const pos of usedPositions) {
      if (Math.abs(x - pos) < 16) return false;
    }
    return x >= 2 && x + width < pixelWidth - 2;
  }

  // Place 4 small flowers at random positions (snap to even x for clean rendering)
  let flowerIdx = 0;
  for (let i = 0; i < 4; i++) {
    let attempts = 0;
    while (attempts < 20) {
      let x = Math.floor(random() * (pixelWidth - 10));
      x = x - (x % 2);  // snap to even (character boundary)
      if (canPlace(x, 6)) {
        usedPositions.push(x);
        const color = colors[Math.floor(random() * colors.length)];
        const stemHeight = 2 + Math.floor(random() * 3);  // 2-4 pixels tall
        const isBouncing = flowerBounceIdx === flowerIdx;
        const bounceOff = isBouncing ? bounceOffset : 0;
        drawSmallFlower(x, baseY - 3 - stemHeight, color, stemHeight, flowerIdx, isBouncing, bounceOff);
        flowerIdx++;
        break;
      }
      attempts++;
    }
  }

  // Place 1 big flower at random position (snap to even x)
  let bigAttempts = 0;
  while (bigAttempts < 20) {
    let x = Math.floor(random() * (pixelWidth - 20));
    x = x - (x % 2);  // snap to even (character boundary)
    if (canPlace(x, 16)) {
      usedPositions.push(x);
      const color = colors[Math.floor(random() * colors.length)];
      const isBouncing = flowerBounceIdx === 4;  // Big flower is always index 4
      const bounceOff = isBouncing ? bounceOffset : 0;
      drawBigFlower(x, baseY - 7, color, 4, isBouncing, bounceOff);
      break;
    }
    bigAttempts++;
  }

  // Scatter pebbles on dirt
  for (let i = 0; i < 6; i++) {
    const px = Math.floor(random() * pixelWidth);
    const pebbleColor = random() > 0.5 ? PALETTE.pebble1 : PALETTE.pebble2;
    setPixel(buffer, px, groundY, pebbleColor, 'ground');
  }

  return { buffer, flowerPositions };
}

// ─────────────────────────────────────────────────────────────────────────────
// ANIMATION STATE MACHINE
// ─────────────────────────────────────────────────────────────────────────────

// Create a NEW animation state for each view (no shared global state)
export function createAnimationState() {
  return {
    // Position (pixels)
    offsetX: 0,       // Horizontal offset from base position
    offsetY: 0,       // Vertical offset (0 = on ground, positive = in air)

    // Movement
    targetX: 0,       // Where we're skittering to
    velocityY: 0,     // Vertical velocity (for jumps)

    // Behavior
    phase: 'idle',    // 'idle' | 'skittering' | 'jumping' | 'pausing'
    pauseFrames: 0,   // Countdown for pause state
    skitterSpeed: 0,  // Current horizontal speed
  };
}

export function tickAnimation(state, maxOffsetX = CONFIG.MAX_SKITTER, maxJumpHeight = CONFIG.MAX_JUMP_HEIGHT) {
  // Apply gravity FIRST (correct physics order: acceleration -> velocity -> position)
  if (state.offsetY > 0 || state.velocityY > 0) {
    state.velocityY -= CONFIG.GRAVITY;
    state.offsetY += state.velocityY;

    // Clamp to max height
    if (state.offsetY > maxJumpHeight) {
      state.offsetY = maxJumpHeight;
      state.velocityY = 0;
    }

    // Land
    if (state.offsetY <= 0) {
      state.offsetY = 0;
      state.velocityY = 0;
    }
  }

  switch (state.phase) {
    case 'idle': {
      const action = Math.random();
      if (action < CONFIG.PROB_SKITTER) {
        // Start skittering to random position within bounds
        state.phase = 'skittering';
        state.targetX = Math.floor((Math.random() - 0.5) * maxOffsetX * 2);
        state.skitterSpeed = CONFIG.SKITTER_SPEED.min + Math.random() * CONFIG.SKITTER_SPEED.range;
      } else if (action < CONFIG.PROB_SKITTER + CONFIG.PROB_JUMP) {
        // Jump with variable height
        state.phase = 'jumping';
        const jumpRoll = Math.random();
        if (jumpRoll < CONFIG.PROB_BIG_JUMP) {
          state.velocityY = CONFIG.JUMP_BIG.min + Math.random() * CONFIG.JUMP_BIG.range;
        } else if (jumpRoll < CONFIG.PROB_BIG_JUMP + CONFIG.PROB_MEDIUM_JUMP) {
          state.velocityY = CONFIG.JUMP_MEDIUM.min + Math.random() * CONFIG.JUMP_MEDIUM.range;
        } else {
          state.velocityY = CONFIG.JUMP_SMALL.min + Math.random() * CONFIG.JUMP_SMALL.range;
        }
      } else if (action < CONFIG.PROB_SKITTER + CONFIG.PROB_JUMP + CONFIG.PROB_PAUSE) {
        // Pause
        state.phase = 'pausing';
        state.pauseFrames = CONFIG.PAUSE_FRAMES.min + Math.floor(Math.random() * CONFIG.PAUSE_FRAMES.range);
      }
      break;
    }

    case 'skittering': {
      const diff = state.targetX - state.offsetX;
      if (Math.abs(diff) < 1) {
        state.offsetX = state.targetX;
        state.phase = 'idle';
      } else {
        const step = Math.sign(diff) * Math.min(state.skitterSpeed, Math.abs(diff));
        state.offsetX += step;
      }

      // Random micro-hop while skittering
      if (Math.random() < CONFIG.PROB_MICRO_HOP && state.offsetY === 0) {
        state.velocityY = CONFIG.JUMP_MICRO.min + Math.random() * CONFIG.JUMP_MICRO.range;
      }
      break;
    }

    case 'jumping':
      if (state.offsetY === 0 && state.velocityY === 0) {
        state.phase = 'idle';
      }
      break;

    case 'pausing':
      state.pauseFrames--;
      if (state.pauseFrames <= 0) {
        state.phase = 'idle';
      }
      break;
  }

  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOG ANIMATION - Zoomy, excitable, independent from crab
// ─────────────────────────────────────────────────────────────────────────────

const DOG_CONFIG = {
  GRAVITY: 0.4,
  MAX_SKITTER: 6,
  MAX_JUMP_HEIGHT: 2,

  // Dogs skitter more often
  PROB_SKITTER: 0.10,
  PROB_JUMP: 0.08,
  PROB_PAUSE: 0.01,
  PROB_ZOOMIES: 0.03,
  PROB_MICRO_HOP: 0.12,

  // Moderate dashes (slowed down from original)
  SKITTER_SPEED: { min: 1.5, range: 1.5 },

  // Shorter pauses — dogs don't sit still
  PAUSE_FRAMES: { min: 5, range: 10 },

  // Jumps — more frequent, visible hops
  JUMP_BIG: { min: 2.5, range: 1.0 },
  JUMP_SMALL: { min: 1.0, range: 0.6 },
  JUMP_MEDIUM: { min: 1.5, range: 0.8 },
  JUMP_MICRO: { min: 0.6, range: 0.8 },

  // Jump type distribution
  PROB_BIG_JUMP: 0.15,
  PROB_MEDIUM_JUMP: 0.45,

  // Zoomies: rapid back-and-forth (slightly slower)
  ZOOMIES_DASHES: { min: 3, range: 3 },
  ZOOMIES_SPEED: { min: 2, range: 1.5 },
};

export function createDogAnimationState() {
  return {
    offsetX: 0,
    offsetY: 0,
    targetX: 0,
    velocityY: 0,
    phase: 'idle',
    pauseFrames: 0,
    skitterSpeed: 0,
    // Zoomies state
    zoomiesDashes: 0,
    zoomiesDirection: 1,
  };
}

export function tickDogAnimation(state) {
  const C = DOG_CONFIG;

  // Gravity
  if (state.offsetY > 0 || state.velocityY > 0) {
    state.velocityY -= C.GRAVITY;
    state.offsetY += state.velocityY;
    if (state.offsetY > C.MAX_JUMP_HEIGHT) {
      state.offsetY = C.MAX_JUMP_HEIGHT;
      state.velocityY = 0;
    }
    if (state.offsetY <= 0) {
      state.offsetY = 0;
      state.velocityY = 0;
    }
  }

  switch (state.phase) {
    case 'idle': {
      const action = Math.random();
      if (action < C.PROB_ZOOMIES) {
        // ZOOMIES! Rapid back-and-forth
        state.phase = 'zoomies';
        state.zoomiesDashes = C.ZOOMIES_DASHES.min + Math.floor(Math.random() * C.ZOOMIES_DASHES.range);
        state.zoomiesDirection = Math.random() < 0.5 ? -1 : 1;
        state.skitterSpeed = C.ZOOMIES_SPEED.min + Math.random() * C.ZOOMIES_SPEED.range;
        state.targetX = state.zoomiesDirection * (C.MAX_SKITTER * 0.8);
      } else if (action < C.PROB_ZOOMIES + C.PROB_SKITTER) {
        state.phase = 'skittering';
        state.targetX = Math.floor((Math.random() - 0.5) * C.MAX_SKITTER * 2);
        state.skitterSpeed = C.SKITTER_SPEED.min + Math.random() * C.SKITTER_SPEED.range;
      } else if (action < C.PROB_ZOOMIES + C.PROB_SKITTER + C.PROB_JUMP) {
        state.phase = 'jumping';
        const jumpRoll = Math.random();
        if (jumpRoll < C.PROB_BIG_JUMP) {
          state.velocityY = C.JUMP_BIG.min + Math.random() * C.JUMP_BIG.range;
        } else if (jumpRoll < C.PROB_BIG_JUMP + C.PROB_MEDIUM_JUMP) {
          state.velocityY = C.JUMP_MEDIUM.min + Math.random() * C.JUMP_MEDIUM.range;
        } else {
          state.velocityY = C.JUMP_SMALL.min + Math.random() * C.JUMP_SMALL.range;
        }
      } else if (action < C.PROB_ZOOMIES + C.PROB_SKITTER + C.PROB_JUMP + C.PROB_PAUSE) {
        state.phase = 'pausing';
        state.pauseFrames = C.PAUSE_FRAMES.min + Math.floor(Math.random() * C.PAUSE_FRAMES.range);
      }
      break;
    }

    case 'skittering': {
      const diff = state.targetX - state.offsetX;
      if (Math.abs(diff) < 1) {
        state.offsetX = state.targetX;
        state.phase = 'idle';
      } else {
        state.offsetX += Math.sign(diff) * Math.min(state.skitterSpeed, Math.abs(diff));
      }
      // Frequent micro-hops while running
      if (Math.random() < C.PROB_MICRO_HOP && state.offsetY === 0) {
        state.velocityY = C.JUMP_MICRO.min + Math.random() * C.JUMP_MICRO.range;
      }
      break;
    }

    case 'zoomies': {
      const diff = state.targetX - state.offsetX;
      if (Math.abs(diff) < 1) {
        state.zoomiesDashes--;
        if (state.zoomiesDashes <= 0) {
          state.phase = 'idle';
        } else {
          // Reverse direction
          state.zoomiesDirection *= -1;
          state.targetX = state.zoomiesDirection * (C.MAX_SKITTER * (0.5 + Math.random() * 0.3));
        }
      } else {
        state.offsetX += Math.sign(diff) * Math.min(state.skitterSpeed, Math.abs(diff));
      }
      // Excited hops during zoomies
      if (Math.random() < 0.15 && state.offsetY === 0) {
        state.velocityY = C.JUMP_MICRO.min + Math.random() * C.JUMP_MICRO.range;
      }
      break;
    }

    case 'jumping':
      if (state.offsetY === 0 && state.velocityY === 0) {
        state.phase = 'idle';
      }
      break;

    case 'pausing':
      state.pauseFrames--;
      if (state.pauseFrames <= 0) {
        state.phase = 'idle';
      }
      break;
  }

  // Clamp to bounds
  state.offsetX = Math.max(-C.MAX_SKITTER, Math.min(C.MAX_SKITTER, state.offsetX));

  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE COMPOSITOR
// ─────────────────────────────────────────────────────────────────────────────

export function renderScene(charWidth, charHeight, seed = 12345, crabX = null, animState = null, dogAnimState = null) {
  const scene = createBuffer(charWidth, charHeight);
  const pixelWidth = charWidth * 2;
  const pixelHeight = charHeight * 2;

  // Random crab BASE position based on seed (deterministic per garden)
  if (crabX === null) {
    const random = seededRandom(seed + 9999);
    const minX = 4;
    const maxX = charWidth - CRAB_CHAR_WIDTH - 4;
    crabX = minX + Math.floor(random() * (maxX - minX));
  }

  // Crab animation offsets
  const offsetX = animState ? Math.round(animState.offsetX) : 0;
  const offsetY = animState ? Math.round(animState.offsetY) : 0;

  // Dog animation offsets (independent from crab)
  const dogOffsetX = dogAnimState ? Math.round(dogAnimState.offsetX) : 0;
  const dogOffsetY = dogAnimState ? Math.round(dogAnimState.offsetY) : 0;

  // Crab pixel coordinates (base + animation offset)
  const crabPixelX = Math.max(0, Math.min(pixelWidth - CRAB_CHAR_WIDTH * 2, crabX * 2 + offsetX));
  const crabPixelWidth = CRAB_CHAR_WIDTH * 2;

  // Position crab so its feet sit on the ground line
  const crabBaseY = pixelHeight - 3 - 4 - offsetY;

  // Dog base position (left of crab's BASE position)
  const baseCrabPixelX = crabX * 2;
  const dogBasePixelX = baseCrabPixelX - DOG_CHAR_WIDTH * 2 - 2;
  // Clamp dog so it never overlaps the crab (use actual crab position, not base)
  const dogMaxX = crabPixelX - DOG_CHAR_WIDTH * 2 - 2;
  const dogPixelX = Math.max(0, Math.min(dogBasePixelX + dogOffsetX, dogMaxX));
  const dogBaseY = pixelHeight - 3 - 5 - dogOffsetY;

  // Gap in grass (tight around both sprites, but let them venture into grass a bit)
  const gapPadding = CONFIG.GAP_PADDING + CONFIG.MAX_SKITTER - 6;
  const dogGapStart = dogBasePixelX - DOG_CONFIG.MAX_SKITTER;
  const gapStart = Math.max(0, dogGapStart);
  const gapEnd = baseCrabPixelX + crabPixelWidth + gapPadding;

  // Get bounce state for flowers (tick is called separately in animation loop)
  const bouncingIdx = getBouncingFlowerIndex();
  const bounceOff = getCurrentBounceOffset();

  // 1. Draw grass (with gap for sprites)
  const { buffer: grassBuffer, flowerPositions } = generateGrass(
    charWidth, charHeight, seed, gapStart, gapEnd, bouncingIdx, bounceOff
  );
  composite(scene, grassBuffer, 0, 0);

  // 2. Get colors (independent for each sprite)
  const currentCrabColor = getCrabColor();
  const currentDogColor = getDogColor();
  const palette = getPalette();

  // 3. Draw dog
  const dogBuffer = createBuffer(DOG_CHAR_WIDTH, DOG_CHAR_HEIGHT);
  drawText(dogBuffer, DOG_TEXT, 0, 0, currentDogColor, 'dog');
  for (const eye of DOG_EYES) {
    setPixel(dogBuffer, eye.x, eye.y, palette.crabEyes, 'dog');
  }
  composite(scene, dogBuffer, dogPixelX, dogBaseY);

  // 4. Draw crab
  const crabBuffer = createBuffer(CRAB_CHAR_WIDTH, CRAB_CHAR_HEIGHT);
  drawText(crabBuffer, CRAB_TEXT, 0, 0, currentCrabColor, 'crab');
  for (const eye of CRAB_EYES) {
    setPixel(crabBuffer, eye.x, eye.y, palette.crabEyes, 'crab');
  }
  composite(scene, crabBuffer, crabPixelX, crabBaseY);

  // Calculate positions in character coords for click detection
  const crabCharX = Math.floor(crabPixelX / 2);
  const dogCharX = Math.floor(dogPixelX / 2);

  // Store clickable positions for external access
  renderScene.lastClickables = {
    flowers: flowerPositions,
    crab: {
      charX: crabCharX,
      charWidth: CRAB_CHAR_WIDTH,
      pixelX: crabPixelX,
      pixelWidth: crabPixelWidth,
    },
    dog: {
      charX: dogCharX,
      charWidth: DOG_CHAR_WIDTH,
      pixelX: dogPixelX,
      pixelWidth: DOG_CHAR_WIDTH * 2,
    },
  };

  return renderBuffer(scene);
}

/**
 * Get the last rendered clickable positions.
 * Call after renderScene to get flower and crab positions for click detection.
 */
export function getClickablePositions() {
  return renderScene.lastClickables || { flowers: [], crab: null, dog: null };
}

export function getSceneHeight() {
  return CONFIG.SCENE_HEIGHT;
}

// Export config for external use (e.g., garden-demo.js)
export { CONFIG };

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIVE STATE - Flower bounce & crab color cycling
// ─────────────────────────────────────────────────────────────────────────────

// Flower bounce state (shared across renders)
const flowerBounceState = {
  bouncingIndex: -1,  // Which flower is bouncing (-1 = none, 0-3 = small flowers, 4 = big flower)
  bounceFrame: 0,     // Current frame in bounce animation
  bounceFrames: 8,    // Total frames for bounce (down + up)
};

// Crab color palette for cycling - vibrant & cute!
const CRAB_COLORS = {
  coral: [217, 119, 87],
  'hot-pink': [255, 105, 180],
  'sky-blue': [87, 207, 255],
  'lime-green': [180, 255, 105],
  blush: [255, 182, 193],
  'blue-violet': [138, 43, 226],
  'aqua-mint': [0, 255, 200],
  orange: [255, 165, 0],
  tomato: [255, 99, 71],
  purple: [147, 112, 219],
  turquoise: [64, 224, 208],
  gold: [255, 215, 0],
  'coral-light': [255, 127, 80],
  lime: [50, 205, 50],
  'deep-pink': [255, 20, 147],
  'deep-sky-blue': [0, 191, 255],
  orchid: [186, 85, 211],
  'dark-orange': [255, 140, 0],
  'sea-green': [32, 178, 170],
  'red-orange': [255, 69, 0],
  'orchid-light': [218, 112, 214],
  'lawn-green': [124, 252, 0],
  pink: [255, 192, 203],
  'dark-turquoise': [0, 206, 209],
  peach: [255, 228, 181],
  violet: [238, 130, 238],
  aquamarine: [127, 255, 212],
  salmon: [255, 160, 122],
  'green-yellow': [173, 255, 47],
  magenta: [199, 21, 133],
};

// Color names in order for cycling
const CRAB_COLOR_NAMES = Object.keys(CRAB_COLORS);

// ─────────────────────────────────────────────────────────────────────────────
// CRAB STATE (via settings.js -> recall/settings/theme/crab.txt)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trigger a flower bounce animation.
 * @param {number} index - Flower index (0-3 small, 4 big)
 */
export function triggerFlowerBounce(index) {
  flowerBounceState.bouncingIndex = index;
  flowerBounceState.bounceFrame = 0;
}

/**
 * Cycle to the next crab color, skipping the dog's current color.
 */
export function cycleCrabColor() {
  settings.crabColor.toggle();
  // Skip if we landed on the dog's color
  if (settings.crabColor.get() === settings.dogColor.get()) {
    settings.crabColor.toggle();
  }
}

/**
 * Get the current crab color.
 */
export function getCrabColor() {
  return CRAB_COLORS[settings.crabColor.get()];
}

/**
 * Cycle to the next dog color, skipping the crab's current color.
 */
export function cycleDogColor() {
  settings.dogColor.toggle();
  // Skip if we landed on the crab's color
  if (settings.dogColor.get() === settings.crabColor.get()) {
    settings.dogColor.toggle();
  }
}

/**
 * Get the current dog color.
 */
export function getDogColor() {
  return CRAB_COLORS[settings.dogColor.get()];
}

// Store current bounce offset for retrieval during render
let currentBounceOffset = 0;

/**
 * Tick the flower bounce animation (call each frame in animation loop).
 * Updates internal state and returns the current bounce offset.
 */
export function tickFlowerBounce() {
  if (flowerBounceState.bouncingIndex < 0) {
    currentBounceOffset = 0;
    return 0;
  }

  flowerBounceState.bounceFrame++;

  // Bounce curve: down fast, up slower
  const progress = flowerBounceState.bounceFrame / flowerBounceState.bounceFrames;

  if (flowerBounceState.bounceFrame >= flowerBounceState.bounceFrames) {
    // Animation complete
    flowerBounceState.bouncingIndex = -1;
    flowerBounceState.bounceFrame = 0;
    currentBounceOffset = 0;
    return 0;
  }

  // Parabolic bounce: peaks at middle, returns to 0
  const bounceHeight = 2;
  const offset = bounceHeight * Math.sin(progress * Math.PI);
  currentBounceOffset = Math.round(offset);
  return currentBounceOffset;
}

/**
 * Get the current bounce offset without ticking.
 * Use this during render; tick separately in animation loop.
 */
export function getCurrentBounceOffset() {
  return currentBounceOffset;
}

/**
 * Get current bouncing flower index.
 */
export function getBouncingFlowerIndex() {
  return flowerBounceState.bouncingIndex;
}

// ─────────────────────────────────────────────────────────────────────────────
// STANDALONE TEST
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const width = Math.min(process.stdout.columns || 80, 80);
  const height = CONFIG.SCENE_HEIGHT;

  console.log('\x1b[2J\x1b[H');
  console.log('Crab Garden Test - Quarter Block System\n');

  // Static render
  const lines = renderScene(width, height, 12345);
  for (const line of lines) {
    console.log(line);
  }

  console.log('\n\nAnimation test (watch for 10 seconds):\n');

  // Create animation state for test
  const testState = createAnimationState();
  let frame = 0;

  const interval = setInterval(() => {
    tickAnimation(testState);

    process.stdout.write('\x1b[8A');
    const animLines = renderScene(width, height, 12345, null, testState);
    for (const line of animLines) {
      console.log(line + '\x1b[K');
    }

    frame++;
    if (frame > 100) {
      clearInterval(interval);
      console.log('\nDone!');
    }
  }, 100);
}
