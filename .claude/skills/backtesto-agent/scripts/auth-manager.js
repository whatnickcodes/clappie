#!/usr/bin/env node
/**
 * auth-manager.js
 *
 * Core auth logic for backtes.to. Extracts and centralizes the visual
 * modal-based authentication from playwright-login.js.
 *
 * Auth model: Session-based via Account modal (#username / #password).
 * Login state is detected visually by checking for "LOGOUT" text.
 *
 * Usage:
 *   const { AuthManager } = require('./auth-manager');
 *   const mgr = new AuthManager(page);
 *   const state = await mgr.checkSession();
 *   const result = await mgr.ensureAuth({ lazy: false });
 */

const { writeAuthStatus } = require('./auth-utils');

class AuthManager {
  constructor(page) {
    this.page = page;
  }

  /**
   * Check current session state by probing the Account modal.
   * Opens modal, checks for "LOGOUT" text, closes modal.
   * Writes auth-status.json with current state.
   *
   * @returns {{ loggedIn: boolean, modalFound: boolean, email?: string, error?: string }}
   */
  async checkSession() {
    const page = this.page;

    const accountBtn = await page.$('#account-button');
    if (!accountBtn) {
      const result = { loggedIn: false, modalFound: false, error: 'account-button not found' };
      this._writeStatus(result);
      return result;
    }

    await accountBtn.click();
    await page.waitForTimeout(2000);

    const state = await page.evaluate(() => {
      const modal = document.querySelector('#login-modal');
      if (!modal) return { loggedIn: false, modalFound: false };
      const hasLogout = modal.innerText.includes('LOGOUT');
      const hasLoginForm = !!modal.querySelector('#username');
      // Try to extract email from modal text when logged in
      let email = null;
      if (hasLogout) {
        const text = modal.innerText;
        const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
        if (emailMatch) email = emailMatch[0];
      }
      return { loggedIn: hasLogout, hasLoginForm, modalFound: true, email };
    });

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    this._writeStatus(state);
    return state;
  }

  /**
   * Attempt login with provided credentials.
   * Assumes the page is on the backtester (or any page with account-button).
   *
   * @param {{ email: string, password: string }} creds
   * @returns {{ success: boolean, error?: string, suggestion?: string }}
   */
  async login(creds) {
    const page = this.page;

    // Open Account modal
    const accountBtn = await page.$('#account-button');
    if (!accountBtn) {
      return { success: false, error: 'account-button not found', suggestion: 'Site structure may have changed' };
    }
    await accountBtn.click();
    await page.waitForTimeout(2000);

    // Fill credentials
    const emailInput = await page.$('#username');
    const passwordInput = await page.$('#password');

    if (!emailInput || !passwordInput) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      return {
        success: false,
        error: 'Cannot find login inputs (#username / #password)',
        suggestion: 'Element IDs may have changed. Run discovery.',
      };
    }

    await emailInput.fill(creds.email);
    await passwordInput.fill(creds.password);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(4000);

    // Verify login
    const loginSuccess = await page.evaluate(() => {
      const modal = document.querySelector('#login-modal');
      if (!modal) return false;
      return modal.innerText.includes('LOGOUT');
    });

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    if (loginSuccess) {
      this._writeStatus({ loggedIn: true, email: creds.email });
      return { success: true };
    }

    this._writeStatus({ loggedIn: false, error: 'login_failed' });
    return { success: false, error: 'Login failed - credentials may be incorrect' };
  }

  /**
   * High-level auth flow: check session, optionally login if needed.
   *
   * @param {{ lazy?: boolean }} options
   *   lazy=true (default): just reports state, doesn't attempt login
   *   lazy=false: attempts login if not already authenticated
   * @returns {{ loggedIn: boolean, action: string, error?: string }}
   */
  async ensureAuth({ lazy = true } = {}) {
    const state = await this.checkSession();

    if (state.loggedIn) {
      return { loggedIn: true, action: 'already', email: state.email };
    }

    if (lazy) {
      return { loggedIn: false, action: 'skipped' };
    }

    // Attempt login
    const { readCredentials } = require('./auth-utils');
    const creds = readCredentials();
    if (!creds.ok) {
      return { loggedIn: false, action: 'failed', error: creds.error, suggestion: creds.suggestion };
    }

    const loginResult = await this.login(creds);
    if (loginResult.success) {
      return { loggedIn: true, action: 'logged_in', email: creds.email };
    }

    return { loggedIn: false, action: 'failed', error: loginResult.error };
  }

  /** @private */
  _writeStatus(state) {
    writeAuthStatus({
      state: state.loggedIn ? 'logged_in' : 'logged_out',
      email: state.email || null,
      checkedAt: new Date().toISOString(),
      source: 'playwright',
      error: state.error || null,
    });
  }
}

module.exports = { AuthManager };
