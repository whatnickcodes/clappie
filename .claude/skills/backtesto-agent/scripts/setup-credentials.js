#!/usr/bin/env node
/**
 * setup-credentials.js
 *
 * Interactive credential setup wizard for backtesto-agent.
 * Prompts for email/password, writes credentials.json with chmod 600,
 * and optionally runs a test login to verify credentials work.
 *
 * Exit codes:
 *   0 = setup complete
 *   1 = user cancelled
 *   2 = test login failed
 */

const fs = require('fs');
const readline = require('readline');
const { CREDS_PATH, BROWSER_DATA, BASE_URL, ensureBacktestoDir, readCredentials } = require('./auth-utils');

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stderr, // prompts go to stderr so stdout stays clean
    terminal: true,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function askPassword(rl, question) {
  return new Promise((resolve) => {
    const stdout = process.stderr;
    stdout.write(question);

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.setRawMode) stdin.setRawMode(true);

    let password = '';
    const onData = (ch) => {
      const c = ch.toString('utf-8');
      if (c === '\n' || c === '\r') {
        stdin.removeListener('data', onData);
        if (stdin.setRawMode) stdin.setRawMode(wasRaw || false);
        stdout.write('\n');
        resolve(password);
      } else if (c === '\u0003') {
        // Ctrl+C
        stdin.removeListener('data', onData);
        if (stdin.setRawMode) stdin.setRawMode(wasRaw || false);
        stdout.write('\n');
        process.exit(1);
      } else if (c === '\u007F' || c === '\b') {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          stdout.write('\b \b');
        }
      } else {
        password += c;
        stdout.write('*');
      }
    };

    stdin.resume();
    stdin.on('data', onData);
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function testLogin(email, password) {
  const { chromium } = require('playwright');
  const { AuthManager } = require('./auth-manager');

  process.stderr.write('\nTesting login... ');

  let context;
  try {
    ensureBacktestoDir();
    fs.mkdirSync(BROWSER_DATA, { recursive: true });
    context = await chromium.launchPersistentContext(BROWSER_DATA, {
      headless: true,
      viewport: { width: 1280, height: 800 },
    });
  } catch (err) {
    process.stderr.write(`cannot launch browser: ${err.message}\n`);
    return { success: false, error: err.message };
  }

  const page = context.pages()[0] || await context.newPage();

  try {
    const response = await page.goto(`${BASE_URL}/backtester`, { timeout: 15000 });
    if (!response || !response.ok()) {
      process.stderr.write(`site unreachable (status ${response?.status()})\n`);
      await context.close();
      return { success: false, error: 'site unreachable' };
    }
    await page.waitForTimeout(3000);

    const authMgr = new AuthManager(page);
    const result = await authMgr.login({ email, password });
    await context.close();

    if (result.success) {
      process.stderr.write('success!\n');
    } else {
      process.stderr.write(`failed: ${result.error}\n`);
    }
    return result;
  } catch (err) {
    await context.close();
    process.stderr.write(`error: ${err.message}\n`);
    return { success: false, error: err.message };
  }
}

async function main() {
  const rl = createInterface();

  process.stderr.write('\n=== Backtesto Credential Setup ===\n\n');

  // Check existing credentials
  const existing = readCredentials();
  if (existing.ok) {
    process.stderr.write(`Existing credentials found for: ${existing.email}\n`);
    const update = await ask(rl, 'Update credentials? (y/N): ');
    if (update.toLowerCase() !== 'y') {
      process.stderr.write('Keeping existing credentials.\n');
      rl.close();
      console.log(JSON.stringify({ status: 'kept_existing', email: existing.email }));
      process.exit(0);
    }
  }

  // Prompt for email
  let email;
  while (true) {
    email = await ask(rl, 'Email: ');
    if (!email) {
      process.stderr.write('Cancelled.\n');
      rl.close();
      process.exit(1);
    }
    if (isValidEmail(email)) break;
    process.stderr.write('Invalid email format. Try again.\n');
  }

  // Prompt for password (masked)
  rl.pause();
  const password = await askPassword(rl, 'Password: ');
  rl.resume();

  if (!password) {
    process.stderr.write('Cancelled.\n');
    rl.close();
    process.exit(1);
  }

  // Write credentials
  ensureBacktestoDir();
  fs.writeFileSync(CREDS_PATH, JSON.stringify({ email, password }, null, 2));
  fs.chmodSync(CREDS_PATH, 0o600);
  process.stderr.write(`\nCredentials saved to ${CREDS_PATH} (chmod 600)\n`);

  // Offer test login
  const doTest = await ask(rl, 'Test login now? (Y/n): ');
  rl.close();

  if (doTest.toLowerCase() === 'n') {
    console.log(JSON.stringify({ status: 'setup_complete', email, tested: false }));
    process.exit(0);
  }

  const testResult = await testLogin(email, password);

  if (testResult.success) {
    console.log(JSON.stringify({ status: 'setup_complete', email, tested: true, loginOk: true }));
    process.exit(0);
  } else {
    console.log(JSON.stringify({ status: 'setup_complete', email, tested: true, loginOk: false, error: testResult.error }));
    process.exit(2);
  }
}

main();
