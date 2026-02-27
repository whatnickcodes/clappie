#!/usr/bin/env bun
/**
 * OAuth CLI Commands
 *
 * clappie oauth auth <provider>   - Start OAuth flow
 * clappie oauth token <provider>  - Get current token (auto-refresh)
 * clappie oauth status            - Show all tokens
 * clappie oauth refresh <provider>- Force refresh
 * clappie oauth revoke <provider> - Delete tokens
 * clappie oauth providers         - List available providers
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getProvider, listProviders } from './lib/providers.js';
import {
  getAccessToken,
  refreshAccessToken,
  deleteTokens,
  loadTokens,
  listAllTokens,
  formatDuration,
  getCredentials,
} from './lib/tokens.js';
import {
  buildAuthUrl,
  startServer,
  hasTrustedCerts,
} from './lib/server.js';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

/**
 * Parse CLI arguments
 */
function parseArgs(args) {
  const parsed = {
    command: args[0],
    provider: null,
    account: 'default',
    scopes: [],
    force: false,
    json: false,
  };

  let i = 1;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--account' || arg === '-a') {
      parsed.account = args[++i];
    } else if (arg === '--scopes' || arg === '-s') {
      parsed.scopes = args[++i]?.split(',').map(s => s.trim()) || [];
    } else if (arg === '--force' || arg === '-f') {
      parsed.force = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (!arg.startsWith('-') && !parsed.provider) {
      parsed.provider = arg;
    }

    i++;
  }

  return parsed;
}

/**
 * Command: auth
 * Start OAuth flow for a provider
 */
async function cmdAuth(args) {
  const { provider, account, scopes, force } = args;

  if (!provider) {
    console.error('Usage: clappie oauth auth <provider> [--scopes "scope1,scope2"] [--account name]');
    console.error('');
    console.error('Providers: ' + listProviders().map(p => p.key).join(', '));
    process.exit(1);
  }

  const config = getProvider(provider);
  if (!config) {
    console.error(`${c.red}Unknown provider: ${provider}${c.reset}`);
    console.error('Run `clappie oauth providers` to see available providers.');
    process.exit(1);
  }

  // Check if already authenticated
  if (!force) {
    const existing = loadTokens(provider, account);
    if (existing) {
      console.log(`${c.yellow}Already authenticated with ${provider}${account !== 'default' ? ` (${account})` : ''}.${c.reset}`);
      console.log(`Use --force to re-authenticate.`);
      process.exit(0);
    }
  }

  // Check for credentials
  try {
    const { clientId, clientSecret, prefix } = getCredentials(provider);
    if (!clientId) {
      console.error(`${c.red}Missing ${prefix}_CLIENT_ID in .env${c.reset}`);
      process.exit(1);
    }
    if (!clientSecret) {
      console.error(`${c.red}Missing ${prefix}_CLIENT_SECRET in .env${c.reset}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`${c.red}${err.message}${c.reset}`);
    process.exit(1);
  }

  console.log('');
  console.log(`${c.bold}  OAuth Authentication${c.reset}`);
  console.log(`${c.dim}  ────────────────────────${c.reset}`);
  console.log('');

  // Check if we have trusted certs (mkcert) or will use self-signed
  const trusted = hasTrustedCerts();
  if (!trusted) {
    console.log(`${c.yellow}⚠${c.reset}  Using self-signed cert - browser will show a security warning.`);
    console.log(`${c.dim}   Click "Advanced" → "Proceed to localhost" to continue.${c.reset}`);
    console.log('');
    console.log(`${c.dim}   To remove this warning, set up trusted certs during clappie setup.${c.reset}`);
    console.log('');
  }

  // Build auth URL (always HTTPS)
  const { url, state } = buildAuthUrl(provider, { account, scopes });

  console.log(`${c.cyan}→${c.reset} Starting callback server on https://localhost:9876`);
  console.log('');
  console.log(`${c.cyan}→${c.reset} Opening browser for ${c.bold}${config.name}${c.reset} authentication...`);
  console.log('');
  console.log(`${c.dim}   If browser doesn't open, visit:${c.reset}`);
  console.log(`${c.dim}   ${url}${c.reset}`);
  console.log('');
  console.log(`${c.yellow}   Waiting for authorization...${c.reset}`);
  console.log('');

  // Start server and open browser (always HTTPS)
  const serverPromise = startServer({ timeout: 5 * 60 * 1000 });

  // Open browser
  const platform = process.platform;
  const openCmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${openCmd} "${url}"`);

  try {
    const result = await serverPromise;

    console.log(`${c.green}✓${c.reset} Authentication successful!`);
    console.log('');
    console.log(`   ${c.dim}Provider:${c.reset} ${result.provider}${result.account !== 'default' ? ` (${result.account})` : ''}`);
    if (result.tokenData.scopes?.length) {
      console.log(`   ${c.dim}Scopes:${c.reset} ${result.tokenData.scopes.join(', ')}`);
    }
    if (result.tokenData.expires_at) {
      console.log(`   ${c.dim}Expires:${c.reset} ${formatDuration(result.tokenData.expires_at - Date.now())}`);
    }
    console.log('');
    console.log(`   ${c.dim}Get token:${c.reset} clappie oauth token ${provider}${account !== 'default' ? ` --account ${account}` : ''}`);
    console.log('');

  } catch (err) {
    console.error(`${c.red}✗${c.reset} Authentication failed: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Command: token
 * Get current access token, auto-refreshing if needed
 */
async function cmdToken(args) {
  const { provider, account, json } = args;

  if (!provider) {
    console.error('Usage: clappie oauth token <provider> [--account name] [--json]');
    process.exit(1);
  }

  try {
    if (json) {
      const tokens = loadTokens(provider, account);
      if (!tokens) {
        console.error(`No tokens found for ${provider}. Run: clappie oauth auth ${provider}`);
        process.exit(1);
      }
      console.log(JSON.stringify(tokens, null, 2));
    } else {
      const token = await getAccessToken(provider, account);
      // Output just the token for easy scripting: TOKEN=$(clappie oauth token google)
      console.log(token);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

/**
 * Command: status
 * Show all stored tokens
 */
async function cmdStatus(args) {
  const tokens = listAllTokens();

  if (tokens.length === 0) {
    console.log('No OAuth tokens stored.');
    console.log('');
    console.log('Authenticate with: clappie oauth auth <provider>');
    console.log('Available providers: ' + listProviders().map(p => p.key).join(', '));
    return;
  }

  console.log('');
  console.log(`${c.bold}  OAuth Tokens${c.reset}`);
  console.log(`${c.dim}  ──────────────────────────────────────────────────────────${c.reset}`);
  console.log('');

  // Header
  console.log(`  ${c.dim}PROVIDER        ACCOUNT      STATUS         EXPIRES${c.reset}`);
  console.log(`  ${c.dim}─────────────────────────────────────────────────────────${c.reset}`);

  for (const token of tokens) {
    const provider = token.providerName.padEnd(14);
    const account = token.account.padEnd(12);

    let statusIcon, statusColor;
    switch (token.status) {
      case 'valid':
        statusIcon = '●';
        statusColor = c.green;
        break;
      case 'expiring_soon':
        statusIcon = '●';
        statusColor = c.yellow;
        break;
      case 'expired':
        statusIcon = '○';
        statusColor = c.red;
        break;
      case 'refresh_expired':
        statusIcon = '○';
        statusColor = c.red;
        break;
      default:
        statusIcon = '?';
        statusColor = c.dim;
    }

    const status = (token.status === 'refresh_expired' ? 'refresh exp' : token.status).padEnd(14);
    const expires = token.expiresIn !== null ? formatDuration(token.expiresIn) : '—';

    console.log(`  ${statusColor}${statusIcon}${c.reset} ${provider} ${account} ${statusColor}${status}${c.reset} ${expires}`);
  }

  console.log('');

  // Show any warnings
  const expired = tokens.filter(t => t.status === 'expired' || t.status === 'refresh_expired');
  if (expired.length > 0) {
    console.log(`${c.yellow}  ⚠ ${expired.length} token(s) need re-authentication${c.reset}`);
    for (const t of expired) {
      console.log(`${c.dim}    clappie oauth auth ${t.provider}${t.account !== 'default' ? ` --account ${t.account}` : ''} --force${c.reset}`);
    }
    console.log('');
  }
}

/**
 * Command: refresh
 * Force refresh a token
 */
async function cmdRefresh(args) {
  const { provider, account } = args;

  if (!provider) {
    console.error('Usage: clappie oauth refresh <provider> [--account name]');
    process.exit(1);
  }

  try {
    console.log(`Refreshing ${provider}${account !== 'default' ? ` (${account})` : ''}...`);
    const tokens = await refreshAccessToken(provider, account);
    console.log(`${c.green}✓${c.reset} Token refreshed. Expires in ${formatDuration(tokens.expires_at - Date.now())}`);
  } catch (err) {
    console.error(`${c.red}✗${c.reset} ${err.message}`);
    process.exit(1);
  }
}

/**
 * Command: revoke
 * Delete stored tokens
 */
async function cmdRevoke(args) {
  const { provider, account } = args;

  if (!provider) {
    console.error('Usage: clappie oauth revoke <provider> [--account name]');
    process.exit(1);
  }

  const deleted = deleteTokens(provider, account);
  if (deleted) {
    console.log(`${c.green}✓${c.reset} Tokens deleted for ${provider}${account !== 'default' ? ` (${account})` : ''}`);
  } else {
    console.log(`No tokens found for ${provider}${account !== 'default' ? ` (${account})` : ''}`);
  }
}

/**
 * Command: providers
 * List available providers
 */
async function cmdProviders(args) {
  const providers = listProviders();

  // Group by source
  const skillProviders = providers.filter(p => p.source?.startsWith('skill:'));
  const userProviders = providers.filter(p => p.source?.startsWith('user:'));

  console.log('');
  console.log(`${c.bold}  OAuth Providers${c.reset}`);
  console.log(`${c.dim}  ──────────────────────────────────────────────────────────${c.reset}`);

  if (providers.length === 0) {
    console.log('');
    console.log(`  ${c.dim}No providers found.${c.reset}`);
    console.log('');
    console.log(`  ${c.dim}Providers come from:${c.reset}`);
    console.log(`  ${c.dim}  • Skills: .claude/skills/<name>/oauth.json${c.reset}`);
    console.log(`  ${c.dim}  • User:   recall/oauth/providers/<name>.json${c.reset}`);
    console.log('');
    return;
  }

  if (skillProviders.length > 0) {
    console.log('');
    console.log(`  ${c.dim}─── from skills ───${c.reset}`);
    for (const p of skillProviders) {
      const key = p.key.padEnd(12);
      const name = p.name.padEnd(14);
      const pkce = p.pkce ? '✓' : '—';
      console.log(`  ${c.cyan}${key}${c.reset} ${name} ${pkce.padEnd(4)} ${c.dim}${p.envPrefix}_CLIENT_ID${c.reset}`);
    }
  }

  if (userProviders.length > 0) {
    console.log('');
    console.log(`  ${c.dim}─── user-added ───${c.reset}`);
    for (const p of userProviders) {
      const key = p.key.padEnd(12);
      const name = p.name.padEnd(14);
      const pkce = p.pkce ? '✓' : '—';
      console.log(`  ${c.yellow}${key}${c.reset} ${name} ${pkce.padEnd(4)} ${c.dim}${p.envPrefix}_CLIENT_ID${c.reset}`);
    }
  }

  console.log('');
  console.log(`${c.dim}  Skills ship oauth.json to add providers.${c.reset}`);
  console.log('');
}

/**
 * Show usage
 */
function showUsage() {
  console.log('');
  console.log(`${c.bold}  OAuth - Token Management${c.reset}`);
  console.log('');
  console.log('  Usage: clappie oauth <command> [options]');
  console.log('');
  console.log('  Commands:');
  console.log(`    ${c.cyan}auth${c.reset} <provider>      Start OAuth flow`);
  console.log(`    ${c.cyan}token${c.reset} <provider>     Get current token (auto-refresh)`);
  console.log(`    ${c.cyan}status${c.reset}               Show all tokens`);
  console.log(`    ${c.cyan}refresh${c.reset} <provider>   Force token refresh`);
  console.log(`    ${c.cyan}revoke${c.reset} <provider>    Delete tokens`);
  console.log(`    ${c.cyan}providers${c.reset}            List available providers`);
  console.log('');
  console.log('  Options:');
  console.log('    --account, -a <name>    Account name (for multi-account)');
  console.log('    --scopes, -s <scopes>   Comma-separated scopes');
  console.log('    --force, -f             Re-authenticate even if tokens exist');
  console.log('    --json                  Output full token object');
  console.log('');
  console.log('  Examples:');
  console.log(`    ${c.dim}clappie oauth auth google --scopes "gmail.readonly,calendar.events"${c.reset}`);
  console.log(`    ${c.dim}clappie oauth auth google --account work${c.reset}`);
  console.log(`    ${c.dim}clappie oauth token google${c.reset}`);
  console.log(`    ${c.dim}TOKEN=$(clappie oauth token github)${c.reset}`);
  console.log('');
}

/**
 * Main entry point
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  switch (args.command) {
    case 'auth':
      await cmdAuth(args);
      break;
    case 'token':
      await cmdToken(args);
      break;
    case 'status':
      await cmdStatus(args);
      break;
    case 'refresh':
      await cmdRefresh(args);
      break;
    case 'revoke':
    case 'delete':
      await cmdRevoke(args);
      break;
    case 'providers':
    case 'list':
      await cmdProviders(args);
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      showUsage();
      break;
    default:
      console.error(`Unknown command: ${args.command}`);
      showUsage();
      process.exit(1);
  }
}

// Export for use as module
export { cmdAuth, cmdToken, cmdStatus, cmdRefresh, cmdRevoke, cmdProviders };

// Run if called directly
main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
