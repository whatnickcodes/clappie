#!/usr/bin/env node
/**
 * auth-utils.js
 *
 * Shared constants and helpers for backtesto-agent auth system.
 * Used by auth-manager.js, playwright-login.js, playwright-backtest.js,
 * preflight-check.js, setup-credentials.js, and auth-watchdog.js.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const BACKTESTO_DIR = path.join(os.homedir(), '.backtesto');
const CREDS_PATH = path.join(BACKTESTO_DIR, 'credentials.json');
const BROWSER_DATA = path.join(BACKTESTO_DIR, 'browser-data');
const AUTH_STATUS_PATH = path.join(BACKTESTO_DIR, 'auth-status.json');
const BASE_URL = 'https://backtes.to';

function ensureBacktestoDir() {
  fs.mkdirSync(BACKTESTO_DIR, { recursive: true });
}

function readCredentials() {
  if (!fs.existsSync(CREDS_PATH)) {
    return { ok: false, error: 'Credentials file not found', suggestion: 'Run: node setup-credentials.js' };
  }
  try {
    const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));
    if (!creds.email || !creds.password) {
      return { ok: false, error: 'Invalid credentials file: missing email or password', suggestion: 'Run: node setup-credentials.js' };
    }
    return { ok: true, email: creds.email, password: creds.password };
  } catch (err) {
    return { ok: false, error: `Cannot parse credentials: ${err.message}`, suggestion: 'Check ~/.backtesto/credentials.json format' };
  }
}

function readAuthStatus() {
  if (!fs.existsSync(AUTH_STATUS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(AUTH_STATUS_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function writeAuthStatus(obj) {
  ensureBacktestoDir();
  fs.writeFileSync(AUTH_STATUS_PATH, JSON.stringify(obj, null, 2));
}

module.exports = {
  BACKTESTO_DIR,
  CREDS_PATH,
  BROWSER_DATA,
  AUTH_STATUS_PATH,
  BASE_URL,
  ensureBacktestoDir,
  readCredentials,
  readAuthStatus,
  writeAuthStatus,
};
