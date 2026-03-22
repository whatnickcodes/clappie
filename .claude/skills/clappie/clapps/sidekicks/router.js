// ============================================================================
//  WEBHOOK ROUTER - Discovers routes from skill webhook.json + user webhooks
// ============================================================================
//
// URL Structure:
//   /webhooks/<skill>/{webhook-path}  - Skill webhooks (any skill with webhook.json)
//   /webhooks/custom/<user-path>      - User custom webhooks
//
// Only /webhooks/* is exposed to public internet. Everything else is blocked.
//
// ============================================================================

import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const SKILLS_DIR = join(PROJECT_ROOT, '.claude', 'skills');
const SETTINGS_DIR = join(PROJECT_ROOT, 'recall', 'settings', 'sidekicks');
const CUSTOM_WEBHOOKS_DIR = join(SETTINGS_DIR, 'webhooks');
const DIRTY_DIR = join(PROJECT_ROOT, 'notifications', 'dirty');

// Ensure directories exist
if (!existsSync(SETTINGS_DIR)) mkdirSync(SETTINGS_DIR, { recursive: true });
if (!existsSync(CUSTOM_WEBHOOKS_DIR)) mkdirSync(CUSTOM_WEBHOOKS_DIR, { recursive: true });
if (!existsSync(DIRTY_DIR)) mkdirSync(DIRTY_DIR, { recursive: true });

// Cache
let routeCache = null;
let cacheTime = 0;
const CACHE_TTL = 5000;

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

function loadSetting(name, defaultValue = '') {
  const path = join(SETTINGS_DIR, `${name}.txt`);
  if (!existsSync(path)) return defaultValue;
  try { return readFileSync(path, 'utf8').trim(); } catch { return defaultValue; }
}

export function getPort() {
  const port = parseInt(loadSetting('port', '7777'), 10);
  return isNaN(port) ? 7777 : port;
}

// ─────────────────────────────────────────────────────────────────────────────
// SKILL SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

function getSkillSettingsDir(skill) {
  return join(PROJECT_ROOT, 'recall', 'settings', skill);
}

export function loadSkillSetting(skill, name, defaultValue = '') {
  const dir = getSkillSettingsDir(skill);
  const path = join(dir, `${name}.txt`);
  if (!existsSync(path)) return defaultValue;
  try { return readFileSync(path, 'utf8').trim(); } catch { return defaultValue; }
}

export function saveSkillSetting(skill, name, value) {
  const dir = getSkillSettingsDir(skill);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.txt`), String(value));
}

export function loadSkillSettingList(skill, name) {
  const content = loadSkillSetting(skill, name, '');
  if (!content) return [];
  return content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
}

function generateRandomPath() {
  return randomBytes(12).toString('hex'); // 24 chars, cryptographically secure
}

// Load per-route enable setting: webhooks/<route-name>.txt
export function loadSkillWebhookSetting(skill, routeName) {
  const dir = join(getSkillSettingsDir(skill), 'webhooks');
  const path = join(dir, `${routeName}.txt`);
  if (!existsSync(path)) return '';
  try { return readFileSync(path, 'utf8').trim(); } catch { return ''; }
}

// Save per-route enable setting
export function saveSkillWebhookSetting(skill, routeName, value) {
  const dir = join(getSkillSettingsDir(skill), 'webhooks');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${routeName}.txt`), String(value));
}

// Load webhook path: webhook-path.txt at skill settings root (secret URL segment)
export function loadSkillWebhookPath(skill) {
  const dir = getSkillSettingsDir(skill);
  const path = join(dir, 'webhook-path.txt');
  if (!existsSync(path)) return '';
  try { return readFileSync(path, 'utf8').trim(); } catch { return ''; }
}

// Save webhook path: webhook-path.txt at skill settings root
export function saveSkillWebhookPath(skill, value) {
  const dir = getSkillSettingsDir(skill);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'webhook-path.txt'), String(value));
}

// Discover custom .js extensions in skill's webhooks/ directory
async function discoverSkillExtensions(skillName, skillConfig, skillWebhookPath) {
  const extensions = [];
  const webhooksDir = join(getSkillSettingsDir(skillName), 'webhooks');

  if (!existsSync(webhooksDir)) return extensions;

  try {
    // Find .js files (skip dot-prefixed = disabled)
    const files = readdirSync(webhooksDir).filter(f => f.endsWith('.js') && !f.startsWith('.'));

    for (const file of files) {
      const filePath = join(webhooksDir, file);
      const config = await loadWebhookModule(filePath);

      if (!config) continue;

      // path is required for clarity (default to {webhook-path} if missing but warn)
      if (!config.path) {
        console.warn(`[router] Extension ${skillName}/webhooks/${file} missing 'path' (defaulting to '{webhook-path}')`);
        config.path = '{webhook-path}';
      }

      const fileName = basename(file, '.js');

      // Resolve {webhook-path} using skill's shared secret
      let resolvedPath = config.path;
      if (resolvedPath.includes('{webhook-path}')) {
        resolvedPath = resolvedPath.replace('{webhook-path}', skillWebhookPath);
      }

      // Build full path under skill's namespace
      const fullPath = `/webhooks/${skillName}/${resolvedPath}`.replace(/\/+/g, '/');

      // Build eventHandlers map if extension has events array
      let eventHandlers = null;
      if (config.events && config.events.length > 0) {
        eventHandlers = {};
        for (const event of config.events) {
          eventHandlers[event] = {
            event,
            action: config.action || 'run',
            run: config.run,
            instructions: config.instructions,
          };
        }
      }

      extensions.push({
        custom: true,
        extension: true,  // marks this as a skill extension (overrides built-in if same name)
        skill: skillName,
        route: fileName,
        path: fullPath,
        action: config.action || 'run',
        events: config.events || [],
        eventHeader: skillConfig.eventHeader,  // Inherit skill's event header
        eventHandlers,
        signing: config.signing || 'skill',  // default: use skill's signing
        secretEnvVar: config.secret || skillConfig.signing?.secretEnvVar,
        run: config.run,
        instructions: config.instructions,
        dirtyPrefix: config.prefix || fileName,
        description: config.description || `Custom: ${fileName}`,
        // Inherit skill's verification
        verify: skillConfig.signing?.verify ? join(skillConfig._skillDir, skillConfig.signing.verify) : null,
        send: skillConfig.send ? join(skillConfig._skillDir, skillConfig.send) : null,
        _filePath: filePath,
        _fileName: fileName,
        _skillDir: skillConfig._skillDir,
      });
    }
  } catch (err) {
    console.error(`[router] Error scanning ${skillName} extensions: ${err.message}`);
  }

  return extensions;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE LOADING (shared by route discovery and custom webhooks)
// ─────────────────────────────────────────────────────────────────────────────

// Cache for loaded webhook modules (cleared when route cache expires)
const webhookModuleCache = {};

async function loadWebhookModule(filePath) {
  // Use file mtime as cache key to auto-reload on changes
  const { mtimeMs } = await import('fs').then(fs => fs.statSync(filePath));
  const cacheKey = `${filePath}:${mtimeMs}`;

  if (webhookModuleCache[cacheKey]) {
    return webhookModuleCache[cacheKey];
  }

  // Clear old versions of this file from cache
  for (const key of Object.keys(webhookModuleCache)) {
    if (key.startsWith(filePath + ':')) {
      delete webhookModuleCache[key];
    }
  }

  try {
    // Add cache-busting query to force reimport
    const mod = await import(`${filePath}?t=${mtimeMs}`);
    const config = mod.default || mod;
    webhookModuleCache[cacheKey] = config;
    return config;
  } catch (err) {
    console.error(`[router] Error loading ${filePath}: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SKILL ROUTE DISCOVERY (from webhooks/routes/*.js)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Auto-discover routes from <skillDir>/webhooks/routes/*.js
 * Each file exports: { name, description, events: [], action: 'dirty'|'sidekick'|'run', ... }
 * Returns object of route configs keyed by route name
 */
async function discoverSkillRoutes(skillDir, skillName) {
  const routesDir = join(skillDir, 'webhooks', 'routes');
  const routes = {};

  if (!existsSync(routesDir)) return routes;

  try {
    const files = readdirSync(routesDir).filter(f => f.endsWith('.js') && !f.startsWith('.'));

    for (const file of files) {
      const filePath = join(routesDir, file);
      const routeName = basename(file, '.js');

      try {
        const config = await loadWebhookModule(filePath);
        if (!config) continue;

        // Warn if path is missing (should be explicit for clarity)
        if (!config.path) {
          console.warn(`[router] Warning: ${skillName}/webhooks/routes/${file} missing 'path' field (defaulting to '{webhook-path}')`);
        }

        routes[routeName] = {
          path: config.path || '{webhook-path}',
          description: config.description || `${routeName} handler`,
          handler: config.handler ? join('webhooks', 'routes', file) : `webhooks/routes/${file}`,
          action: config.action || 'skill',  // 'dirty', 'sidekick', 'run', or 'skill'
          events: config.events || [],       // Events this handler responds to
          run: config.run,                   // Inline run function
          instructions: config.instructions,
          _filePath: filePath,
          _routeFile: true,
        };
      } catch (err) {
        console.error(`[router] Error loading route ${skillName}/webhooks/routes/${file}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`[router] Error scanning ${skillName}/webhooks/routes/: ${err.message}`);
  }

  return routes;
}

// ─────────────────────────────────────────────────────────────────────────────
// SKILL WEBHOOK DISCOVERY
// ─────────────────────────────────────────────────────────────────────────────

function discoverSkillWebhooks() {
  const webhooks = {};
  if (!existsSync(SKILLS_DIR)) return webhooks;

  try {
    for (const dir of readdirSync(SKILLS_DIR)) {
      const webhookPath = join(SKILLS_DIR, dir, 'webhook.json');
      if (existsSync(webhookPath)) {
        try {
          const config = JSON.parse(readFileSync(webhookPath, 'utf-8'));
          webhooks[dir] = { ...config, _skillDir: join(SKILLS_DIR, dir) };
        } catch (err) {
          console.error(`[router] Error loading ${webhookPath}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`[router] Error scanning skills: ${err.message}`);
  }

  return webhooks;
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM WEBHOOK DISCOVERY (from settings/sidekicks/webhooks/*.js)
// ─────────────────────────────────────────────────────────────────────────────

async function discoverCustomWebhooks() {
  const webhooks = [];
  if (!existsSync(CUSTOM_WEBHOOKS_DIR)) return webhooks;

  try {
    // Skip files starting with . (disabled)
    const files = readdirSync(CUSTOM_WEBHOOKS_DIR).filter(f => f.endsWith('.js') && !f.startsWith('.'));

    for (const file of files) {
      const filePath = join(CUSTOM_WEBHOOKS_DIR, file);
      const config = await loadWebhookModule(filePath);

      if (!config || !config.path) {
        console.error(`[router] Invalid webhook config in ${file}: missing 'path'`);
        continue;
      }

      const fileName = basename(file, '.js');

      // Resolve {webhook-path} placeholder
      let resolvedPath = config.path;
      if (resolvedPath.includes('{webhook-path}')) {
        let savedPath = loadSetting(`webhooks/${fileName}-path`, '');
        if (!savedPath) {
          savedPath = generateRandomPath();
          const pathFile = join(SETTINGS_DIR, `webhooks/${fileName}-path.txt`);
          mkdirSync(dirname(pathFile), { recursive: true });
          writeFileSync(pathFile, savedPath);
        }
        resolvedPath = resolvedPath.replace('{webhook-path}', savedPath);
      }

      webhooks.push({
        custom: true,
        path: `/webhooks/custom/${resolvedPath}`,
        signing: config.signing || 'none',
        secretEnvVar: config.secret,
        run: config.run,
        instructions: config.instructions,
        dirtyPrefix: config.prefix || fileName,
        _filePath: filePath,
        _fileName: fileName,
      });
    }
  } catch (err) {
    console.error(`[router] Error scanning custom webhooks: ${err.message}`);
  }

  return webhooks;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE TABLE
// ─────────────────────────────────────────────────────────────────────────────

// Get ALL routes including disabled (for display purposes)
export async function buildFullRouteTable() {
  const routes = [];
  const skillWebhooks = discoverSkillWebhooks();

  for (const [skillName, config] of Object.entries(skillWebhooks)) {
    const skillEnabled = loadSkillSetting(skillName, 'enabled') === 'true';

    let skillWebhookPath = loadSkillSetting(skillName, 'webhook-path');
    if (!skillWebhookPath) {
      skillWebhookPath = generateRandomPath();
      saveSkillSetting(skillName, 'webhook-path', skillWebhookPath);
    }

    // Auto-discover routes if none specified in webhook.json
    let skillRoutes = config.routes || {};
    if (Object.keys(skillRoutes).length === 0) {
      skillRoutes = await discoverSkillRoutes(config._skillDir, skillName);
    }

    for (const [routeName, routeConfig] of Object.entries(skillRoutes)) {
      const routeEnabled = loadSkillWebhookSetting(skillName, routeName) === 'true';

      let configPath = routeConfig.path;
      if (configPath.includes('{webhook-path}')) {
        configPath = configPath.replace('{webhook-path}', skillWebhookPath);
      }
      const path = `/webhooks/${skillName}/${configPath}`.replace(/\/+/g, '/');

      routes.push({
        path,
        skill: skillName,
        route: routeName,
        description: routeConfig.description,
        enabled: skillEnabled && routeEnabled,
        skillEnabled,
        routeEnabled,
        type: 'skill',
        eventHeader: config.eventHeader,
        events: routeConfig.events,
      });
    }
  }

  // Custom webhooks
  const customWebhooks = await discoverCustomWebhooks();
  for (const custom of customWebhooks) {
    routes.push({
      ...custom,
      enabled: true,
      type: custom.run ? 'handler' : (custom.instructions ? 'sidekick' : 'dirty'),
    });
  }

  return routes;
}

export async function buildRouteTable() {
  const now = Date.now();
  if (routeCache && (now - cacheTime) < CACHE_TTL) return routeCache;

  const routes = [];
  const skillWebhooks = discoverSkillWebhooks();

  // Skill routes
  for (const [skillName, config] of Object.entries(skillWebhooks)) {
    // Check skill's own enabled.txt
    // Master switch: skill must be enabled
    const enabled = loadSkillSetting(skillName, 'enabled');
    if (enabled !== 'true') continue;

    // Get skill's webhook path from webhooks/path.txt (shared secret for all routes)
    let skillWebhookPath = loadSkillWebhookPath(skillName);
    if (!skillWebhookPath) {
      skillWebhookPath = generateRandomPath();
      saveSkillWebhookPath(skillName, skillWebhookPath);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUILT-IN ROUTES: enabled via webhooks/<route-name>.txt = "true"
    // If no routes in webhook.json, auto-discover from webhooks/routes/*.js
    // ─────────────────────────────────────────────────────────────────────────
    let skillRoutes = config.routes || {};

    // Auto-discover routes if none specified in webhook.json
    if (Object.keys(skillRoutes).length === 0) {
      skillRoutes = await discoverSkillRoutes(config._skillDir, skillName);
    }

    // Build event handlers map if skill has eventHeader configured
    const eventHeader = config.eventHeader;  // e.g., 'X-GitHub-Event'

    // Discover user extensions FIRST to check for overrides
    const skillExtensions = await discoverSkillExtensions(skillName, config, skillWebhookPath);
    const extensionNames = new Set(skillExtensions.map(e => e._fileName));

    for (const [routeName, routeConfig] of Object.entries(skillRoutes)) {
      // If user has .js override, skip built-in route (extension takes precedence)
      if (extensionNames.has(routeName)) {
        continue;
      }

      // Check if route is enabled: webhooks/<route-name>.txt must contain "true"
      const routeEnabled = loadSkillWebhookSetting(skillName, routeName);
      if (routeEnabled !== 'true') continue;

      // Build path with {webhook-path} resolved
      let configPath = routeConfig.path;
      if (configPath.includes('{webhook-path}')) {
        configPath = configPath.replace('{webhook-path}', skillWebhookPath);
      }

      // Always prepend /webhooks/<skill>/
      const path = `/webhooks/${skillName}/${configPath}`.replace(/\/+/g, '/');

      // Build eventHandlers map from route's events array
      let eventHandlers = null;
      if (routeConfig.events && routeConfig.events.length > 0) {
        eventHandlers = {};
        for (const event of routeConfig.events) {
          eventHandlers[event] = {
            event,
            action: routeConfig.action || 'skill',
            handler: routeConfig.handler ? join(config._skillDir, routeConfig.handler) : null,
            run: routeConfig.run,
            instructions: routeConfig.instructions,
          };
        }
      }

      routes.push({
        path,
        skill: skillName,
        route: routeName,
        action: routeConfig.action || 'skill',
        handler: routeConfig.handler ? join(config._skillDir, routeConfig.handler) : null,
        verify: config.signing?.verify ? join(config._skillDir, config.signing.verify) : null,
        send: config.send ? join(config._skillDir, config.send) : null,
        secretEnvVar: config.signing?.secretEnvVar,
        description: routeConfig.description,
        eventHeader,           // Header to read event type from (e.g., 'X-GitHub-Event')
        eventHandlers,         // Map of event -> handler config
        _skillDir: config._skillDir,
        _routeFile: routeConfig._routeFile,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CUSTOM EXTENSIONS: .js files in webhooks/ directory (already discovered above)
    // These override built-in routes with same name, or add new routes
    // ─────────────────────────────────────────────────────────────────────────
    routes.push(...skillExtensions);
  }

  // Custom webhooks from settings/sidekicks/webhooks/*.js
  const customWebhooks = await discoverCustomWebhooks();
  for (const custom of customWebhooks) {
    // If signing references a skill, load its verifier
    if (custom.signing && custom.signing !== 'none' && custom.signing !== 'hmac') {
      const skillConfig = skillWebhooks[custom.signing];
      if (skillConfig?.signing?.verify) {
        custom.verify = join(skillConfig._skillDir, skillConfig.signing.verify);
        custom.secretEnvVar = custom.secretEnvVar || skillConfig.signing?.secretEnvVar;
      }
    }
    routes.push(custom);
  }

  routeCache = routes;
  cacheTime = now;
  return routes;
}

export function matchRoute(urlPath, routes) {
  // Only handle /webhooks/* paths
  if (!urlPath.startsWith('/webhooks/')) {
    return null;
  }

  // Try exact match first
  for (const route of routes) {
    if (route.path === urlPath) return route;
  }

  // Try prefix match (for paths with {webhook-path} that are already resolved)
  for (const route of routes) {
    // Strip the secret portion for matching
    const routeBase = route.path.replace(/\/[a-z0-9]{16}$/, '');
    const urlBase = urlPath.replace(/\/[a-z0-9]{16}$/, '');
    if (routeBase === urlBase && route.path.length === urlPath.length) {
      return route;
    }
  }

  // Try starts-with for nested custom paths
  for (const route of routes) {
    if (urlPath.startsWith(route.path + '/') || urlPath === route.path) {
      return route;
    }
  }

  return null;
}

export async function listAvailableRoutes() {
  const skillWebhooks = discoverSkillWebhooks();
  const routes = [];

  // Skill routes (show all, indicate which are enabled)
  for (const [skillName, config] of Object.entries(skillWebhooks)) {
    const skillEnabled = loadSkillSetting(skillName, 'enabled') === 'true';
    const skillWebhookPath = loadSkillSetting(skillName, 'webhook-path');

    // Auto-discover routes if none specified in webhook.json
    let skillRoutes = config.routes || {};
    if (Object.keys(skillRoutes).length === 0) {
      skillRoutes = await discoverSkillRoutes(config._skillDir, skillName);
    }

    for (const [routeName, routeConfig] of Object.entries(skillRoutes)) {
      // Check per-route enable
      const routeEnabled = loadSkillWebhookSetting(skillName, routeName) === 'true';

      let configPath = routeConfig.path;
      if (configPath.includes('{webhook-path}') && skillWebhookPath) {
        configPath = configPath.replace('{webhook-path}', skillWebhookPath);
      }

      const fullPath = `/webhooks/${skillName}/${configPath}`.replace(/\/+/g, '/');

      routes.push({
        type: routeConfig._routeFile ? 'discovered' : 'skill',
        skill: skillName,
        route: routeName,
        key: `${skillName}/${routeName}`,
        path: skillWebhookPath ? fullPath : null,  // null if no secret yet
        description: routeConfig.description,
        skillEnabled,
        routeEnabled,
        enabled: skillEnabled && routeEnabled,  // both must be true
        events: routeConfig.events,
        eventHeader: config.eventHeader,
      });
    }

    // Skill extensions (.js files in webhooks/)
    const webhooksDir = join(getSkillSettingsDir(skillName), 'webhooks');
    if (existsSync(webhooksDir)) {
      const jsFiles = readdirSync(webhooksDir).filter(f => f.endsWith('.js'));
      for (const file of jsFiles) {
        const isDisabled = file.startsWith('.');
        const fileName = basename(isDisabled ? file.slice(1) : file, '.js');
        routes.push({
          type: 'extension',
          skill: skillName,
          key: `${skillName}/ext/${fileName}`,
          file: file,
          description: `Custom extension`,
          skillEnabled,
          enabled: skillEnabled && !isDisabled,
        });
      }
    }
  }

  // Standalone custom webhooks
  const customWebhooks = await discoverCustomWebhooks();
  for (const custom of customWebhooks) {
    routes.push({
      type: 'custom',
      key: `custom/${custom._fileName}`,
      path: custom.path,
      hasRun: !!custom.run,
      description: custom.run ? 'Custom webhook with run()' : 'Custom webhook (sidekick)',
      enabled: true,
    });
  }

  return routes;
}

// Enable a route: "skill/route" or "skill" (master switch)
export function enableRoute(key) {
  const parts = key.split('/');
  const skillName = parts[0];
  const routeName = parts[1];

  // Clear cache
  routeCache = null;

  // If just skill name, enable master switch
  if (!routeName) {
    saveSkillSetting(skillName, 'enabled', 'true');
    return { type: 'skill', skill: skillName };
  }

  // Enable specific route
  // First ensure skill master is enabled
  if (loadSkillSetting(skillName, 'enabled') !== 'true') {
    saveSkillSetting(skillName, 'enabled', 'true');
  }

  saveSkillWebhookSetting(skillName, routeName, 'true');
  return { type: 'route', skill: skillName, route: routeName };
}

// Disable a route: "skill/route" or "skill" (master switch)
export function disableRoute(key) {
  const parts = key.split('/');
  const skillName = parts[0];
  const routeName = parts[1];

  // Clear cache
  routeCache = null;

  // If just skill name, disable master switch
  if (!routeName) {
    saveSkillSetting(skillName, 'enabled', 'false');
    return { type: 'skill', skill: skillName };
  }

  // Disable specific route
  saveSkillWebhookSetting(skillName, routeName, 'false');
  return { type: 'route', skill: skillName, route: routeName };
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD SKILL MODULES
// ─────────────────────────────────────────────────────────────────────────────

const moduleCache = {};

async function loadModule(path) {
  if (!path || !existsSync(path)) return null;
  if (moduleCache[path]) return moduleCache[path];
  const mod = await import(path);
  moduleCache[path] = mod;
  return mod;
}

export async function loadVerifier(route) {
  if (!route.verify) return null;
  const mod = await loadModule(route.verify);
  return mod?.default || mod?.verify || null;
}

export async function loadHandler(route) {
  if (!route.handler) return null;
  const mod = await loadModule(route.handler);
  return mod?.default || mod?.handler || null;
}

export async function loadSender(route) {
  if (!route.send) return null;
  return await loadModule(route.send);
}


// ─────────────────────────────────────────────────────────────────────────────
// ACTION EXECUTORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dump payload to dirty/ directory
 */
export function executeDirtyAction(route, payload, headers) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const prefix = basename((route.dirtyPrefix || 'webhook').replace(/\.\./g, ''));
  const filename = `${prefix}-${timestamp}.json`;
  const filepath = join(DIRTY_DIR, filename);

  const data = {
    received_at: new Date().toISOString(),
    path: route.path,
    headers: Object.fromEntries(
      Object.entries(headers || {}).filter(([k]) =>
        !k.toLowerCase().startsWith('x-forwarded') &&
        k.toLowerCase() !== 'host'
      )
    ),
    payload,
  };

  writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`[router] Dumped to ${filename}`);
  return { handled: true, file: filename };
}


// ─────────────────────────────────────────────────────────────────────────────
// HMAC VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

export function verifyHmac(payload, signature, secret, algorithm = 'sha256') {
  if (!signature || !secret) return false;

  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const expected = createHmac(algorithm, secret).update(payloadStr).digest('hex');

  // Handle "sha256=" prefix
  const sig = signature.replace(/^sha256=/, '');

  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT HEADER ROUTING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get event-specific handler from route.eventHandlers
 * Falls back to '*' catch-all if specific event not found
 * Returns null if no handler exists for this event
 */
export function getEventHandler(route, eventType) {
  if (!route.eventHandlers || !eventType) return null;

  // Try exact match first
  if (route.eventHandlers[eventType]) {
    return route.eventHandlers[eventType];
  }

  // Try catch-all
  if (route.eventHandlers['*']) {
    return route.eventHandlers['*'];
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export default {
  getPort,
  buildRouteTable,
  buildFullRouteTable,
  matchRoute,
  listAvailableRoutes,
  enableRoute,
  disableRoute,
  loadSkillSetting,
  saveSkillSetting,
  loadSkillSettingList,
  loadSkillWebhookPath,
  saveSkillWebhookPath,
  loadSkillWebhookSetting,
  saveSkillWebhookSetting,
  loadVerifier,
  loadHandler,
  loadSender,
  executeDirtyAction,
  verifyHmac,
  getEventHandler,
  PROJECT_ROOT,
  SKILLS_DIR,
  DIRTY_DIR,
};
