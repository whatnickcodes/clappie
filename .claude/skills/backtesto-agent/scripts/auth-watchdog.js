#!/usr/bin/env node
/**
 * auth-watchdog.js
 *
 * Session health monitor for backtesto-agent.
 * Checks session state and optionally auto-relogins if expired.
 *
 * Usage:
 *   node auth-watchdog.js              # Check + auto-relogin if expired
 *   node auth-watchdog.js --check-only # Just report, don't login
 *
 * Exit codes:
 *   0 = session healthy
 *   1 = issues (expired, no creds, login failed)
 *   2 = site unreachable
 */

const { chromium } = require('playwright');
const { readCredentials, readAuthStatus, BROWSER_DATA, BASE_URL, ensureBacktestoDir } = require('./auth-utils');
const { AuthManager } = require('./auth-manager');

const checkOnly = process.argv.includes('--check-only');

async function main() {
  ensureBacktestoDir();

  const report = {
    previousState: null,
    previousCheck: null,
    currentState: null,
    action: null,
    nextCheckRecommended: null,
  };

  // 1. Read last known state
  const lastStatus = readAuthStatus();
  if (lastStatus) {
    report.previousState = lastStatus.state;
    report.previousCheck = lastStatus.checkedAt;

    // If last check < 4 hours ago and logged in, trust cached state
    const ageMs = Date.now() - new Date(lastStatus.checkedAt).getTime();
    if (ageMs < 4 * 3600000 && lastStatus.state === 'logged_in') {
      report.currentState = 'logged_in';
      report.action = 'still_active';
      report.nextCheckRecommended = new Date(Date.now() + 4 * 3600000).toISOString();
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    }
  }

  // 2. Probe session via Playwright
  let context;
  try {
    ensureBacktestoDir();
    context = await chromium.launchPersistentContext(BROWSER_DATA, {
      headless: true,
      viewport: { width: 1280, height: 800 },
    });
  } catch (err) {
    report.currentState = 'unknown';
    report.action = 'probe_failed';
    report.error = err.message;
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const page = context.pages()[0] || await context.newPage();

  try {
    const response = await page.goto(`${BASE_URL}/backtester`, { timeout: 15000 });
    if (!response || !response.ok()) {
      await context.close();
      report.currentState = 'unknown';
      report.action = 'site_unreachable';
      console.log(JSON.stringify(report, null, 2));
      process.exit(2);
    }
    await page.waitForTimeout(3000);

    const authMgr = new AuthManager(page);
    const state = await authMgr.checkSession();

    if (state.loggedIn) {
      report.currentState = 'logged_in';
      report.action = 'still_active';
      report.nextCheckRecommended = new Date(Date.now() + 4 * 3600000).toISOString();
      await context.close();
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    }

    // Session expired
    report.currentState = 'logged_out';

    if (checkOnly) {
      report.action = 'check_only';
      await context.close();
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    // Attempt auto-relogin
    const creds = readCredentials();
    if (!creds.ok) {
      report.action = 'expired_no_creds';
      report.error = creds.error;
      await context.close();
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    const loginResult = await authMgr.login(creds);
    if (loginResult.success) {
      report.currentState = 'logged_in';
      report.action = 'relogin_success';
      report.nextCheckRecommended = new Date(Date.now() + 4 * 3600000).toISOString();
      await context.close();
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    }

    report.action = 'relogin_failed';
    report.error = loginResult.error;
    await context.close();
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  } catch (err) {
    await context.close();
    report.currentState = 'unknown';
    report.action = 'probe_error';
    report.error = err.message;
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }
}

main();
