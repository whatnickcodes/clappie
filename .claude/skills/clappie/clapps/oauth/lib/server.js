/**
 * OAuth Callback Server
 *
 * HTTPS server that handles OAuth callbacks from all providers.
 * Routes callbacks by state parameter which encodes provider + nonce.
 *
 * Always uses HTTPS. If mkcert certs exist in recall/oauth/, uses those
 * (trusted, no browser warning). Otherwise generates self-signed certs
 * (works but shows browser warning).
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { getProvider } from './providers.js';
import { saveTokens, getCredentials, CERT_PATH, KEY_PATH } from './tokens.js';
import crypto from 'crypto';

const CALLBACK_PORT = 9876;
const TEMP_CERTS_DIR = '/tmp/clappie-oauth-certs';

/**
 * Check if trusted mkcert certs exist
 */
export function hasTrustedCerts() {
  return existsSync(CERT_PATH) && existsSync(KEY_PATH);
}

/**
 * Get redirect URI - always HTTPS
 */
export function getRedirectUri() {
  return `https://localhost:${CALLBACK_PORT}/callback`;
}


/**
 * Get SSL certs for the OAuth callback server.
 * Prefers mkcert certs (trusted) if available, falls back to self-signed.
 */
function getCerts() {
  // Check for mkcert certs first (trusted, no browser warning)
  if (hasTrustedCerts()) {
    return {
      key: readFileSync(KEY_PATH),
      cert: readFileSync(CERT_PATH),
      cleanup: () => {}, // Don't delete persistent certs
      trusted: true,
    };
  }

  // Fall back to self-signed (browser will show warning)
  const keyPath = join(TEMP_CERTS_DIR, 'localhost.key');
  const certPath = join(TEMP_CERTS_DIR, 'localhost.crt');

  // Clean up any old temp certs and recreate dir
  if (existsSync(TEMP_CERTS_DIR)) {
    rmSync(TEMP_CERTS_DIR, { recursive: true });
  }
  mkdirSync(TEMP_CERTS_DIR, { recursive: true });

  // Generate self-signed cert
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 1 -nodes -subj "/CN=localhost" 2>/dev/null`,
    { stdio: 'pipe' }
  );

  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
    cleanup: () => rmSync(TEMP_CERTS_DIR, { recursive: true, force: true }),
    trusted: false,
  };
}

// Pending auth requests (state -> request info)
const pendingAuth = new Map();

/**
 * Generate state parameter for CSRF protection
 * Format: <provider>_<random_hex>
 */
export function generateState(provider) {
  const nonce = crypto.randomBytes(16).toString('hex');
  return `${provider}_${nonce}`;
}

/**
 * Parse state parameter
 */
export function parseState(state) {
  const underscoreIndex = state.indexOf('_');
  if (underscoreIndex === -1) return null;
  return {
    provider: state.slice(0, underscoreIndex),
    nonce: state.slice(underscoreIndex + 1),
  };
}

/**
 * Generate PKCE code verifier and challenge
 */
export function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

/**
 * Build the authorization URL for a provider
 */
export function buildAuthUrl(provider, options = {}) {
  const config = getProvider(provider);
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const { clientId } = getCredentials(provider);
  if (!clientId) {
    throw new Error(`Missing ${config.envPrefix}_CLIENT_ID in .env`);
  }

  const state = generateState(provider);
  const redirectUri = getRedirectUri(); // Always HTTPS

  // Build scopes - use provided scopes if non-empty, otherwise default
  const scopes = (options.scopes && options.scopes.length > 0)
    ? options.scopes
    : (config.defaultScopes || []);
  const scopeString = scopes.join(config.scopeDelimiter || ' ');

  // Generate PKCE if supported
  let pkce = null;
  if (config.pkce) {
    pkce = generatePKCE();
  }

  // Build URL
  const url = new URL(config.authUrl);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);

  if (scopeString) {
    url.searchParams.set('scope', scopeString);
  }

  // Add PKCE params
  if (pkce) {
    url.searchParams.set('code_challenge', pkce.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }

  // Add provider-specific params
  if (config.extraAuthParams) {
    for (const [key, value] of Object.entries(config.extraAuthParams)) {
      url.searchParams.set(key, value);
    }
  }

  // Store pending auth info
  pendingAuth.set(state, {
    provider,
    account: options.account || 'default',
    scopes,
    pkce,
    createdAt: Date.now(),
  });

  return {
    url: url.toString(),
    state,
    pkce,
  };
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCode(code, state, extraParams = {}) {
  const pending = pendingAuth.get(state);
  if (!pending) {
    throw new Error('Invalid or expired state parameter');
  }

  const { provider, account, scopes, pkce } = pending;
  const config = getProvider(provider);
  const { clientId, clientSecret } = getCredentials(provider);
  const redirectUri = getRedirectUri();

  // Build token request
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  // Add PKCE verifier if used
  if (pkce) {
    body.set('code_verifier', pkce.verifier);
  }

  // Some providers want credentials in body, some in Basic auth header
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',  // GitHub etc need this to return JSON
    ...(config.tokenRequestHeaders || {}),
  };

  if (config.useBasicAuth) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  } else {
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${response.status} - ${error}`);
  }

  let tokens = await response.json();

  // Some providers have custom token extraction
  if (config.extractTokens) {
    tokens = config.extractTokens(tokens);
  }

  // Support tokenPath for nested token responses (e.g., Slack's authed_user)
  if (config.tokenPath && tokens[config.tokenPath]) {
    const nested = tokens[config.tokenPath];
    // Merge nested tokens with top-level (keep team info etc.)
    tokens = {
      ...tokens,
      access_token: nested.access_token,
      refresh_token: nested.refresh_token || tokens.refresh_token,
      expires_in: nested.expires_in || tokens.expires_in,
      token_type: nested.token_type || tokens.token_type,
      scope: nested.scope || tokens.scope,
    };
  }

  // Build token data
  const expiresIn = tokens.expires_in || config.defaultExpiresIn || 3600;
  const tokenData = {
    provider,
    account,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type || 'Bearer',
    scopes,
    created_at: Date.now(),
    metadata: {},
  };

  // Handle expiry
  if (!config.noExpiry) {
    tokenData.expires_at = Date.now() + (expiresIn * 1000);
  }

  // Handle refresh token expiry (QuickBooks etc.)
  if (config.refreshExpiresIn && tokens.refresh_token) {
    tokenData.refresh_expires_at = Date.now() + (config.refreshExpiresIn * 1000);
  }

  // Capture extra params from callback (e.g., QuickBooks realmId)
  if (config.captureFromCallback && extraParams) {
    for (const key of config.captureFromCallback) {
      if (extraParams[key]) {
        tokenData.metadata[key] = extraParams[key];
      }
    }
  }

  // Save tokens
  saveTokens(provider, account, tokenData);

  // Clean up pending auth
  pendingAuth.delete(state);

  return {
    provider,
    account,
    tokenData,
  };
}

/**
 * Start the OAuth callback server
 * Returns a promise that resolves when auth completes or times out
 * Always uses HTTPS - trusted certs if available, self-signed otherwise
 */
export function startServer(options = {}) {
  const { timeout = 5 * 60 * 1000 } = options;

  return new Promise((resolve, reject) => {
    let server;
    let timeoutId;
    let certCleanup;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (server) server.stop();
      if (certCleanup) certCleanup();
    };

    const handleRequest = async (req) => {
      const url = new URL(req.url, `https://localhost:${CALLBACK_PORT}`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');

        if (error) {
          cleanup();
          reject(new Error(`OAuth error: ${error} - ${errorDescription || 'Unknown error'}`));
          return new Response(errorHtml(error, errorDescription), {
            status: 400,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }

        if (!code || !state) {
          return new Response('Missing code or state parameter', { status: 400 });
        }

        try {
          // Collect any extra params (e.g., realmId for QuickBooks)
          const extraParams = {};
          for (const [key, value] of url.searchParams.entries()) {
            if (!['code', 'state', 'error', 'error_description'].includes(key)) {
              extraParams[key] = value;
            }
          }

          const result = await exchangeCode(code, state, extraParams);

          // Schedule cleanup
          setTimeout(cleanup, 500);
          resolve(result);

          return new Response(successHtml(result.provider, result.account), {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        } catch (err) {
          cleanup();
          reject(err);
          return new Response(errorHtml('Exchange Failed', err.message), {
            status: 500,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
      }

      return new Response('Not found', { status: 404 });
    };

    try {
      // Always use HTTPS
      const certs = getCerts();
      certCleanup = certs.cleanup;

      const serverConfig = {
        port: CALLBACK_PORT,
        fetch: handleRequest,
        tls: {
          key: certs.key,
          cert: certs.cert,
        },
      };

      server = Bun.serve(serverConfig);

      // Set timeout
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('OAuth timeout: No callback received'));
      }, timeout);

    } catch (err) {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${CALLBACK_PORT} is already in use. Close other processes using this port.`));
      } else {
        reject(err);
      }
    }
  });
}

/**
 * HTML response templates
 */
function successHtml(provider, account) {
  const accountLabel = account !== 'default' ? ` (${account})` : '';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Connected - Clappie</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=VT323&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Fira Code', monospace;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #0a0a0c;
      color: #e8e6e3;
    }
    .container { text-align: center; padding: 40px; }
    .logo {
      font-family: 'Fira Code', monospace;
      font-size: 14px;
      line-height: 1.1;
      color: #ff8ec6;
      white-space: pre;
      margin-bottom: 24px;
    }
    h1 {
      font-family: 'VT323', monospace;
      font-size: 32px;
      margin: 0 0 12px 0;
      color: #5ab89a;
      letter-spacing: 2px;
    }
    p {
      margin: 6px 0;
      color: #8a8580;
      font-size: 14px;
    }
    .provider {
      color: #ff8ec6;
      font-weight: 500;
    }
    .close { margin-top: 20px; font-size: 12px; color: #4a4a52; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">   ▖ ▖
▗ █▜▛█
 ▛▛▛▛▀</div>
    <h1>CONNECTED</h1>
    <p><span class="provider">${provider}${accountLabel}</span></p>
    <p class="close">you can close this window</p>
  </div>
</body>
</html>`;
}

function errorHtml(error, description) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Error - Clappie</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=VT323&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Fira Code', monospace;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #0a0a0c;
      color: #e8e6e3;
    }
    .container { text-align: center; padding: 40px; }
    .logo {
      font-family: 'Fira Code', monospace;
      font-size: 14px;
      line-height: 1.1;
      color: #4a4a52;
      white-space: pre;
      margin-bottom: 24px;
    }
    h1 {
      font-family: 'VT323', monospace;
      font-size: 32px;
      margin: 0 0 12px 0;
      color: #d97757;
      letter-spacing: 2px;
    }
    p {
      margin: 6px 0;
      color: #8a8580;
      font-size: 14px;
    }
    .error {
      color: #ff8ec6;
      font-family: 'Fira Code', monospace;
      background: #18181c;
      padding: 12px 16px;
      border-radius: 4px;
      margin: 16px 0;
      font-size: 13px;
    }
    .close { margin-top: 20px; font-size: 12px; color: #4a4a52; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">   ▖ ▖
▗ █▜▛█
 ▛▛▛▛▀</div>
    <h1>ERROR</h1>
    <p class="error">${error}</p>
    ${description ? `<p>${description}</p>` : ''}
    <p class="close">you can close this window</p>
  </div>
</body>
</html>`;
}

export default {
  generateState,
  parseState,
  generatePKCE,
  buildAuthUrl,
  exchangeCode,
  startServer,
  getRedirectUri,
  hasTrustedCerts,
  CALLBACK_PORT,
};
