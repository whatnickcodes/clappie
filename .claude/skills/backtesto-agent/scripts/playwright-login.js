#!/usr/bin/env node
/**
 * playwright-login.js
 *
 * Logs into backtes.to using Playwright with persistent browser context.
 * Thin wrapper around AuthManager for backward compatibility.
 *
 * Auth model: Session-based (NOT localStorage). Login is via Account modal
 * (click account-button, fill #username/#password). Login state is detected
 * visually by checking if the modal shows "LOGOUT" text vs login form.
 *
 * Note: Login is NOT required for basic backtesting, only for saving portfolios.
 *
 * Usage:
 *   node playwright-login.js          # Check + login if needed
 *   node playwright-login.js --check  # Check only, don't attempt login
 *
 * Exit codes:
 *   0 = success (already logged in or login succeeded)
 *   1 = auth failed (bad credentials or not logged in with --check)
 *   2 = site unreachable
 */

const { chromium } = require('playwright');
const { readCredentials, BROWSER_DATA, BASE_URL, ensureBacktestoDir } = require('./auth-utils');
const { AuthManager } = require('./auth-manager');

const checkOnly = process.argv.includes('--check');

async function main() {
  // Read credentials (unless check-only mode)
  if (!checkOnly) {
    const creds = readCredentials();
    if (!creds.ok) {
      console.error(JSON.stringify({ error: creds.error, suggestion: creds.suggestion }));
      process.exit(1);
    }
  }

  ensureBacktestoDir();

  let context;
  try {
    context = await chromium.launchPersistentContext(BROWSER_DATA, {
      headless: true,
      viewport: { width: 1280, height: 800 },
    });
  } catch (err) {
    console.error(JSON.stringify({ error: 'Cannot launch browser', details: err.message }));
    process.exit(2);
  }

  const page = context.pages()[0] || await context.newPage();

  try {
    const response = await page.goto(`${BASE_URL}/backtester`, { timeout: 15000 });
    if (!response || !response.ok()) {
      console.error(JSON.stringify({ error: 'Site unreachable', status: response?.status() }));
      await context.close();
      process.exit(2);
    }
    await page.waitForTimeout(3000);

    const authMgr = new AuthManager(page);
    const result = await authMgr.ensureAuth({ lazy: checkOnly });

    await context.close();

    if (result.loggedIn) {
      const status = result.action === 'already' ? 'already_logged_in' : 'login_success';
      console.log(JSON.stringify({ status, email: result.email }));
      process.exit(0);
    }

    if (checkOnly) {
      console.log(JSON.stringify({ status: 'not_logged_in' }));
      process.exit(1);
    }

    console.error(JSON.stringify({ error: result.error || 'Login failed' }));
    process.exit(1);
  } catch (err) {
    console.error(JSON.stringify({ error: 'Login error', details: err.message }));
    await context.close();
    process.exit(2);
  }
}

main();
