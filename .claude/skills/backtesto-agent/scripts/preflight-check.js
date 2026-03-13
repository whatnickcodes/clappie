#!/usr/bin/env node
/**
 * preflight-check.js
 *
 * Validates everything before a backtest: credentials, site reachability,
 * and session state. Outputs structured JSON to stdout.
 *
 * Exit codes:
 *   0 = ready (all checks pass)
 *   1 = issues found (details in output)
 *   2 = site unreachable
 */

const { chromium } = require('playwright');
const https = require('https');
const { readCredentials, readAuthStatus, BROWSER_DATA, BASE_URL, ensureBacktestoDir } = require('./auth-utils');
const { AuthManager } = require('./auth-manager');

function checkSiteReachable() {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.request(BASE_URL, { method: 'HEAD', timeout: 10000 }, (res) => {
      resolve({ reachable: true, latencyMs: Date.now() - start, statusCode: res.statusCode });
    });
    req.on('error', (err) => {
      resolve({ reachable: false, error: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ reachable: false, error: 'timeout' });
    });
    req.end();
  });
}

function formatAge(isoDate) {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function main() {
  ensureBacktestoDir();

  const issues = [];
  const result = { credentials: {}, site: {}, session: {}, ready: false, issues };

  // 1. Check credentials
  const creds = readCredentials();
  result.credentials = { ok: creds.ok, email: creds.email || null };
  if (!creds.ok) {
    issues.push(`Credentials: ${creds.error}`);
  }

  // 2. Check site reachability
  result.site = await checkSiteReachable();
  if (!result.site.reachable) {
    issues.push(`Site unreachable: ${result.site.error}`);
    result.ready = false;
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  // 3. Check session state
  const lastStatus = readAuthStatus();
  if (lastStatus && lastStatus.checkedAt) {
    const ageMs = Date.now() - new Date(lastStatus.checkedAt).getTime();
    const stale = ageMs > 4 * 3600000; // > 4 hours
    result.session = {
      loggedIn: lastStatus.state === 'logged_in',
      stale,
      age: formatAge(lastStatus.checkedAt),
      lastCheck: lastStatus.checkedAt,
      source: 'cached',
    };

    if (!stale && lastStatus.state === 'logged_in') {
      // Trust cached state — skip Playwright probe
      result.ready = issues.length === 0;
      console.log(JSON.stringify(result, null, 2));
      process.exit(issues.length === 0 ? 0 : 1);
    }
  }

  // 4. Probe session via Playwright (cached state is stale or absent)
  let context;
  try {
    ensureBacktestoDir();
    context = await chromium.launchPersistentContext(BROWSER_DATA, {
      headless: true,
      viewport: { width: 1280, height: 800 },
    });
  } catch (err) {
    issues.push(`Cannot launch browser: ${err.message}`);
    result.session = { loggedIn: false, error: err.message, source: 'probe_failed' };
    result.ready = false;
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const page = context.pages()[0] || await context.newPage();

  try {
    const response = await page.goto(`${BASE_URL}/backtester`, { timeout: 15000 });
    if (!response || !response.ok()) {
      issues.push(`Site returned status ${response?.status()}`);
      result.session = { loggedIn: false, source: 'probe_failed' };
    } else {
      await page.waitForTimeout(3000);
      const authMgr = new AuthManager(page);
      const state = await authMgr.checkSession();
      result.session = {
        loggedIn: state.loggedIn,
        stale: false,
        age: '0m',
        lastCheck: new Date().toISOString(),
        source: 'live_probe',
        email: state.email || null,
      };
      if (!state.loggedIn) {
        issues.push('Not logged in (login needed for saving portfolios)');
      }
    }
  } catch (err) {
    issues.push(`Session probe error: ${err.message}`);
    result.session = { loggedIn: false, error: err.message, source: 'probe_failed' };
  }

  await context.close();

  result.ready = issues.length === 0;
  console.log(JSON.stringify(result, null, 2));
  process.exit(issues.length === 0 ? 0 : 1);
}

main();
