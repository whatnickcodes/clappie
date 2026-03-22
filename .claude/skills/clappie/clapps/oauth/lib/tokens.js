/**
 * OAuth Token Management
 *
 * Storage, retrieval, and refresh of OAuth tokens.
 * Tokens stored in recall/oauth/<provider>.json or recall/oauth/<provider>-<account>.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getProvider, hasProvider } from './providers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');
const OAUTH_DIR = join(PROJECT_ROOT, 'recall', 'oauth');

// Cert paths for trusted localhost HTTPS
export const CERT_PATH = join(OAUTH_DIR, 'clappie-localhost.pem');
export const KEY_PATH = join(OAUTH_DIR, 'clappie-localhost-key.pem');

// Ensure oauth directory exists
if (!existsSync(OAUTH_DIR)) {
  mkdirSync(OAUTH_DIR, { recursive: true });
}

/**
 * Get the token file path for a provider/account combo
 */
export function getTokenPath(provider, account = 'default') {
  const filename = account === 'default' ? `${provider}.json` : `${provider}-${account}.json`;
  return join(OAUTH_DIR, filename);
}

/**
 * Load tokens from file
 * Returns null if file doesn't exist
 */
export function loadTokens(provider, account = 'default') {
  const path = getTokenPath(provider, account);
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    console.error(`Error reading token file: ${err.message}`);
    return null;
  }
}

/**
 * Save tokens to file
 */
export function saveTokens(provider, account, tokens) {
  const path = getTokenPath(provider, account);
  writeFileSync(path, JSON.stringify(tokens, null, 2));
  return tokens;
}

/**
 * Delete tokens
 */
export function deleteTokens(provider, account = 'default') {
  const path = getTokenPath(provider, account);
  if (existsSync(path)) {
    unlinkSync(path);
    return true;
  }
  return false;
}

/**
 * Check if tokens need refresh
 * Returns true if expired or expiring within buffer (default 5 minutes)
 */
export function needsRefresh(tokens, bufferMs = 5 * 60 * 1000) {
  if (!tokens?.expires_at) {
    return false;  // No expiry = doesn't need refresh
  }
  return (Date.now() + bufferMs) > tokens.expires_at;
}

/**
 * Check if refresh token is expired (for providers like QuickBooks)
 */
export function refreshTokenExpired(tokens) {
  if (!tokens?.refresh_expires_at) {
    return false;  // No refresh expiry = still valid
  }
  return Date.now() > tokens.refresh_expires_at;
}

/**
 * Load environment variables from .env file
 */
export function loadEnv() {
  const envPath = join(PROJECT_ROOT, '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex);
          const value = trimmed.slice(eqIndex + 1);
          process.env[key] = value;
        }
      }
    }
  }
}

/**
 * Get client credentials from environment
 */
export function getCredentials(providerKey) {
  loadEnv();
  const provider = getProvider(providerKey);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerKey}`);
  }

  const prefix = provider.envPrefix;
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];

  return { clientId, clientSecret, prefix };
}

/**
 * Refresh an access token using the refresh token
 */
export async function refreshAccessToken(provider, account = 'default') {
  const tokens = loadTokens(provider, account);
  if (!tokens) {
    throw new Error(`No tokens found for ${provider}${account !== 'default' ? ` (${account})` : ''}`);
  }

  if (!tokens.refresh_token) {
    throw new Error(`No refresh token available for ${provider}. Re-authenticate with: clappie oauth auth ${provider}`);
  }

  if (refreshTokenExpired(tokens)) {
    throw new Error(`Refresh token expired for ${provider}. Re-authenticate with: clappie oauth auth ${provider}`);
  }

  const providerConfig = getProvider(provider);
  if (!providerConfig) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const { clientId, clientSecret } = getCredentials(provider);
  if (!clientId || !clientSecret) {
    throw new Error(`Missing ${providerConfig.envPrefix}_CLIENT_ID or ${providerConfig.envPrefix}_CLIENT_SECRET`);
  }

  // Build refresh request
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  });

  // Some providers want credentials in body, some in Basic auth header
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...(providerConfig.tokenRequestHeaders || {}),
  };

  if (providerConfig.useBasicAuth) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  } else {
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
  }

  const response = await fetch(providerConfig.tokenUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${response.status} - ${error}`);
  }

  let newTokens = await response.json();

  // Some providers have custom token extraction
  if (providerConfig.extractTokens) {
    newTokens = providerConfig.extractTokens(newTokens);
  }

  // Update stored tokens
  const expiresIn = newTokens.expires_in || providerConfig.defaultExpiresIn || 3600;
  const updated = {
    ...tokens,
    access_token: newTokens.access_token,
    expires_at: Date.now() + (expiresIn * 1000),
    last_refreshed_at: Date.now(),
  };

  // Some providers rotate refresh tokens
  if (newTokens.refresh_token) {
    updated.refresh_token = newTokens.refresh_token;
    // Reset refresh token expiry if provider has one
    if (providerConfig.refreshExpiresIn) {
      updated.refresh_expires_at = Date.now() + (providerConfig.refreshExpiresIn * 1000);
    }
  }

  saveTokens(provider, account, updated);
  return updated;
}

/**
 * Get a valid access token, refreshing if necessary
 * This is the main function skills should use
 */
export async function getAccessToken(provider, account = 'default') {
  const tokens = loadTokens(provider, account);
  if (!tokens) {
    throw new Error(`No tokens for ${provider}. Run: clappie oauth auth ${provider}`);
  }

  const providerConfig = getProvider(provider);

  // If provider tokens don't expire, just return
  if (providerConfig?.noExpiry) {
    return tokens.access_token;
  }

  // Check if refresh needed
  if (needsRefresh(tokens)) {
    // If no refresh capability, throw helpful error
    if (providerConfig?.noRefresh || !tokens.refresh_token) {
      throw new Error(`Token expired for ${provider}. Re-authenticate with: clappie oauth auth ${provider}`);
    }

    // Refresh the token
    const refreshed = await refreshAccessToken(provider, account);
    return refreshed.access_token;
  }

  return tokens.access_token;
}

/**
 * List all stored tokens with their status
 */
export function listAllTokens() {
  if (!existsSync(OAUTH_DIR)) {
    return [];
  }

  const files = readdirSync(OAUTH_DIR).filter(f => f.endsWith('.json'));
  const tokens = [];

  for (const file of files) {
    try {
      const content = JSON.parse(readFileSync(join(OAUTH_DIR, file), 'utf-8'));
      const name = file.replace('.json', '');

      // Parse provider and account from filename
      // If full name is a known provider, use it as-is
      // Otherwise try splitting on last dash (e.g., "google-work" → provider: google, account: work)
      let provider, account;
      const dashIndex = name.lastIndexOf('-');

      if (hasProvider(name)) {
        // Full name is a known provider (e.g., "slack", "quickbooks")
        provider = name;
        account = 'default';
      } else if (dashIndex > 0 && hasProvider(name.slice(0, dashIndex))) {
        // Has account suffix (e.g., "google-work")
        provider = name.slice(0, dashIndex);
        account = name.slice(dashIndex + 1);
      } else {
        // Unknown format, use as-is
        provider = name;
        account = 'default';
      }

      const providerConfig = getProvider(provider);

      // Calculate status
      let status = 'valid';
      let expiresIn = null;

      if (refreshTokenExpired(content)) {
        status = 'refresh_expired';
      } else if (providerConfig?.noExpiry) {
        status = 'valid';
        expiresIn = Infinity;
      } else if (needsRefresh(content, 0)) {
        status = 'expired';
      } else if (needsRefresh(content, 30 * 60 * 1000)) {
        status = 'expiring_soon';
        expiresIn = content.expires_at - Date.now();
      } else if (content.expires_at) {
        expiresIn = content.expires_at - Date.now();
      }

      tokens.push({
        provider,
        account,
        status,
        expiresIn,
        expiresAt: content.expires_at,
        refreshExpiresAt: content.refresh_expires_at,
        scopes: content.scopes || [],
        createdAt: content.created_at,
        lastRefreshedAt: content.last_refreshed_at,
        metadata: content.metadata || {},
        hasRefreshToken: !!content.refresh_token,
        providerName: providerConfig?.name || provider,
      });
    } catch (err) {
      // Skip invalid files
    }
  }

  return tokens;
}

/**
 * Format duration for display
 */
export function formatDuration(ms) {
  if (ms === Infinity) return '∞';
  if (ms <= 0) return 'expired';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export default {
  getTokenPath,
  loadTokens,
  saveTokens,
  deleteTokens,
  needsRefresh,
  refreshTokenExpired,
  getCredentials,
  refreshAccessToken,
  getAccessToken,
  listAllTokens,
  formatDuration,
};
