// OAuth Provider Discovery
//
// Providers are discovered ONLY from files:
// 1. Skills ship their own: .claude/skills/<skill>/oauth.json
// 2. User-added custom: recall/oauth/providers/<name>.json
//
// NO built-in presets. Skills own their OAuth config.

import { existsSync, readdirSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');
const SKILLS_DIR = join(PROJECT_ROOT, '.claude', 'skills');
const USER_PROVIDERS_DIR = join(PROJECT_ROOT, 'recall', 'oauth', 'providers');

// Cache for discovered providers
let discoveredProviders = null;
let lastDiscoveryTime = 0;
const DISCOVERY_CACHE_MS = 5000;

// Discover providers from skills
// Scans .claude/skills/<name>/oauth.json
function discoverSkillProviders() {
  const providers = {};

  if (!existsSync(SKILLS_DIR)) return providers;

  try {
    const skillDirs = readdirSync(SKILLS_DIR);
    for (const dir of skillDirs) {
      const providerPath = join(SKILLS_DIR, dir, 'oauth.json');
      if (existsSync(providerPath)) {
        try {
          const config = JSON.parse(readFileSync(providerPath, 'utf-8'));
          const key = config.key || dir;
          providers[key] = {
            ...config,
            _source: `skill:${dir}`,
          };
        } catch (err) {
          console.error(`Error loading ${providerPath}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    // Skills dir might not be readable
  }

  return providers;
}

// Discover user-added providers
// Scans recall/oauth/providers/<name>.json
function discoverUserProviders() {
  const providers = {};

  if (!existsSync(USER_PROVIDERS_DIR)) return providers;

  try {
    const files = readdirSync(USER_PROVIDERS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const providerPath = join(USER_PROVIDERS_DIR, file);
      try {
        const config = JSON.parse(readFileSync(providerPath, 'utf-8'));
        const key = config.key || file.replace('.json', '');
        providers[key] = {
          ...config,
          _source: `user:${file}`,
        };
      } catch (err) {
        console.error(`Error loading ${providerPath}: ${err.message}`);
      }
    }
  } catch (err) {
    // User providers dir might not exist
  }

  return providers;
}

/**
 * Get all providers (cached, with auto-refresh)
 * Priority: skill > user
 */
function getAllProviders() {
  const now = Date.now();
  if (discoveredProviders && (now - lastDiscoveryTime) < DISCOVERY_CACHE_MS) {
    return discoveredProviders;
  }

  // Discover from files only
  const userProviders = discoverUserProviders();
  const skillProviders = discoverSkillProviders();

  // Merge with priority: skill > user
  discoveredProviders = {
    ...userProviders,    // lower priority
    ...skillProviders,   // higher priority (skills override user)
  };

  lastDiscoveryTime = now;
  return discoveredProviders;
}

/**
 * Get a specific provider config
 */
export function getProvider(name, overrides = {}) {
  const providers = getAllProviders();
  const base = providers[name];

  if (!base) {
    return null;
  }

  return {
    ...base,
    ...overrides,
    name: overrides.name || base.name || name,
  };
}

/**
 * List all available providers
 */
export function listProviders() {
  const providers = getAllProviders();

  return Object.entries(providers).map(([key, config]) => ({
    key,
    name: config.name || key,
    envPrefix: config.envPrefix,
    pkce: config.pkce,
    noExpiry: config.noExpiry,
    noRefresh: config.noRefresh,
    source: config._source,
  }));
}

/**
 * Check if a provider exists
 */
export function hasProvider(name) {
  const providers = getAllProviders();
  return name in providers;
}

/**
 * Force re-discovery (useful after adding new provider files)
 */
export function refreshProviders() {
  discoveredProviders = null;
  lastDiscoveryTime = 0;
  return getAllProviders();
}

/**
 * Get the user providers directory (for adding custom providers)
 */
export function getUserProvidersDir() {
  if (!existsSync(USER_PROVIDERS_DIR)) {
    mkdirSync(USER_PROVIDERS_DIR, { recursive: true });
  }
  return USER_PROVIDERS_DIR;
}

export default {
  getProvider,
  listProviders,
  hasProvider,
  refreshProviders,
  getUserProvidersDir,
};
