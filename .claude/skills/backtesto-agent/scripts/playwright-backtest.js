#!/usr/bin/env node
/**
 * playwright-backtest.js
 *
 * Runs a backtest on backtes.to using Playwright.
 * Accepts portfolio JSON from file argument or stdin.
 *
 * Login is NOT required for basic backtesting. The script will proceed
 * without authentication. Use playwright-login.js first only if you need
 * to save portfolios or access donor-only features.
 *
 * Usage:
 *   node playwright-backtest.js portfolio.json
 *   echo '{"assets":[...]}' | node playwright-backtest.js
 *
 * Output: JSON with results + screenshot paths
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { BROWSER_DATA, BASE_URL } = require('./auth-utils');
const { AuthManager } = require('./auth-manager');
const REPORTS_DIR = path.resolve(__dirname, '../../docs/reports/images');

async function readPortfolio() {
  const filePath = process.argv[2];
  if (filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  // Read from stdin
  const chunks = [];
  process.stdin.setEncoding('utf-8');
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return JSON.parse(chunks.join(''));
}

async function waitForResults(page, maxWaitMs = 60000) {
  const pollInterval = 3000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const status = await page.evaluate(() => {
      const loading = document.querySelector('#backtester-analysis-loading-overlay');
      const isLoading = loading && loading.style.display !== 'none' && loading.offsetParent !== null;
      const chart = document.querySelector('#portfolio-value-chart .js-plotly-plot');
      const tabs = document.querySelector('#backtester-results-tabs');
      const error = document.querySelector('#portfolio-feedback');
      const errorText = error?.innerText?.trim();
      // Only treat as error if it's NOT an info message about date ranges
      if (errorText && !errorText.includes('verrà effettuata') && !errorText.includes('Prima data disponibile')) {
        return { status: 'error', message: errorText };
      }
      if (chart || tabs) return { status: 'ready' };
      if (isLoading) return { status: 'loading' };
      return { status: 'unknown' };
    });

    if (status.status === 'ready') return status;
    if (status.status === 'error') throw new Error(`Backtest error: ${status.message}`);

    await page.waitForTimeout(pollInterval);
  }

  throw new Error('Backtest timed out after 60s');
}

async function clickTab(page, tabName) {
  // Tabs are <a role="tab" class="nav-link"> inside .nav-item divs
  const tabs = await page.$$('#backtester-results-tabs a.nav-link');
  for (const tab of tabs) {
    const text = (await tab.innerText()).trim();
    if (text === tabName) {
      await tab.click();
      await page.waitForTimeout(2000);
      return true;
    }
  }
  return false;
}

async function clickCompositionRadio(page, labelText) {
  try {
    await page.locator(`#allocation-type-radio label:has-text("${labelText}")`).click({ force: true });
    await page.waitForTimeout(1500);
    return true;
  } catch {
    // Fallback: evaluate-based click
    const clicked = await page.evaluate((text) => {
      const radio = document.querySelector('#allocation-type-radio');
      if (!radio) return false;
      for (const label of radio.querySelectorAll('label')) {
        if (label.innerText.includes(text)) {
          label.click();
          return true;
        }
      }
      return false;
    }, labelText);
    if (clicked) await page.waitForTimeout(1500);
    return clicked;
  }
}

async function exportChart(page, selector) {
  return page.evaluate(async (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    // Plotly.toImage works on the plot div
    const plot = el.classList.contains('js-plotly-plot') ? el : el.querySelector('.js-plotly-plot');
    if (!plot) return null;
    try {
      const dataUrl = await Plotly.toImage(plot, { format: 'png', width: 1200, height: 600 });
      return dataUrl.replace(/^data:image\/png;base64,/, '');
    } catch {
      return null;
    }
  }, selector);
}

async function extractChartData(page) {
  return page.evaluate(() => {
    const el = document.querySelector('#allocation-types-chart');
    if (!el) return null;
    const plot = el.classList.contains('js-plotly-plot')
      ? el : el.querySelector('.js-plotly-plot');
    if (!plot || !plot.data || !plot.data[0]) return null;

    const trace = plot.data[0];

    // Site uses bar charts: labels in trace.x, percentages in trace.text
    // trace.text has pre-formatted strings like "63.4%"
    if (trace.type === 'bar' && Array.isArray(trace.x) && Array.isArray(trace.text)) {
      return trace.x.map((label, i) => ({
        label: String(label),
        percentage: parseFloat(String(trace.text[i]).replace('%', '')) || 0,
      }));
    }

    // Fallback: pie chart structure (labels/values)
    const labels = Array.isArray(trace.labels) ? Array.from(trace.labels)
      : Array.isArray(trace.x) ? Array.from(trace.x) : [];
    let values = [];
    const src = trace.values || trace.y;
    if (Array.isArray(src)) {
      values = Array.from(src);
    } else if (src?.bdata) {
      const binary = atob(src.bdata);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      values = Array.from(new Float64Array(bytes.buffer));
    }

    const total = values.reduce((s, v) => s + v, 0);
    if (total === 0) return labels.map(l => ({ label: String(l), percentage: 0 }));
    let percentages;
    if (total > 90 && total < 110) {
      percentages = values.map(v => Math.round(v * 10) / 10);
    } else if (total <= 1.5) {
      percentages = values.map(v => Math.round(v * 1000) / 10);
    } else {
      percentages = values.map(v => Math.round((v / total) * 1000) / 10);
    }

    return labels.map((label, i) => ({
      label: String(label),
      percentage: percentages[i] ?? 0,
    }));
  });
}

const COMPOSITION_BREAKDOWNS = [
  { label: 'Paese',           key: 'country' },
  { label: 'Continente',      key: 'continent' },
  { label: 'Tipo di Mercato', key: 'marketType' },
  { label: 'Valuta',          key: 'currency' },
  { label: 'Settore',         key: 'sector' },
];

async function extractCompositionData(page, baseName, reportsDir) {
  const tabClicked = await clickTab(page, 'Composizione');
  if (!tabClicked) return { breakdowns: {}, screenshots: {} };
  await page.waitForTimeout(2000);

  const breakdowns = {};
  const screenshots = {};

  for (let i = 0; i < COMPOSITION_BREAKDOWNS.length; i++) {
    const { label, key } = COMPOSITION_BREAKDOWNS[i];

    if (i > 0) {
      const clicked = await clickCompositionRadio(page, label);
      if (!clicked) { breakdowns[key] = []; continue; }
    }

    breakdowns[key] = (await extractChartData(page)) || [];

    // Screenshot every breakdown view
    const base64 = await exportChart(page, '#allocation-types-chart');
    if (base64) {
      const filePath = path.join(reportsDir, `${baseName}-composition-${key}.png`);
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
      screenshots[`composition_${key}`] = filePath;
    }
  }

  return { breakdowns, screenshots };
}

async function captureResultScreenshots(page, baseName, reportsDir) {
  const screenshots = {};
  const mapping = [
    { key: 'performance', tab: null, selector: '#portfolio-value-chart' },
    { key: 'summary', tab: null, selector: '[id$="-tabpane-summary"] .js-plotly-plot, [id*="tabpane-summary"] .js-plotly-plot' },
    { key: 'yearly', tab: 'Performance', selector: '#yearly-bar-figure' },
    { key: 'risk', tab: 'Rischio', selector: '#max-loss-chart' },
    { key: 'drawdown', tab: 'Rischio', selector: '#drawdown-chart' },
  ];

  for (const { key, tab, selector } of mapping) {
    try {
      if (tab) await clickTab(page, tab);
      const base64 = await exportChart(page, selector);
      if (base64) {
        const filePath = path.join(reportsDir, `${baseName}-${key}.png`);
        fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
        screenshots[key] = filePath;
      }
    } catch (err) {
      // Skip this screenshot, continue with others
    }
  }

  return screenshots;
}

async function extractYearlyReturns(page) {
  // Click Performance tab first
  await clickTab(page, 'Performance');

  return page.evaluate(() => {
    const charts = document.querySelectorAll('.js-plotly-plot');
    for (const chart of charts) {
      if (!chart.data) continue;
      for (const trace of chart.data) {
        if (!trace.x || !trace.y) continue;
        const years = Array.from(trace.x);
        // Check if this looks like yearly data (has year strings like '2003')
        if (!years.some(y => /^\d{4}$/.test(String(y)))) continue;

        let values;
        if (trace.y.bdata) {
          // Binary-encoded float64 data
          const binary = atob(trace.y.bdata);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          values = Array.from(new Float64Array(bytes.buffer));
        } else if (Array.isArray(trace.y)) {
          values = trace.y;
        } else {
          continue;
        }

        return years.map((yr, i) => ({
          year: String(yr),
          return: Math.round(values[i] * 100) / 100,
        }));
      }
    }
    return [];
  });
}

async function main() {
  const portfolio = await readPortfolio();

  if (!portfolio.assets || portfolio.assets.length === 0) {
    console.error(JSON.stringify({ error: 'No assets in portfolio' }));
    process.exit(1);
  }

  // Ensure output dir exists
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  // Ensure browser data dir exists
  fs.mkdirSync(BROWSER_DATA, { recursive: true });

  let context;
  try {
    context = await chromium.launchPersistentContext(BROWSER_DATA, {
      headless: true,
      viewport: { width: 1280, height: 900 },
    });
  } catch (err) {
    console.error(JSON.stringify({ error: 'Cannot launch browser', details: err.message }));
    process.exit(2);
  }

  const page = context.pages()[0] || await context.newPage();

  try {
    // Navigate to backtester
    await page.goto(`${BASE_URL}/backtester`, { timeout: 15000 });
    await page.waitForTimeout(3000);

    // Non-blocking auth status check (report to stderr)
    try {
      const authMgr = new AuthManager(page);
      const authState = await authMgr.checkSession();
      console.error(JSON.stringify({ authCheck: authState }));
    } catch (authErr) {
      console.error(JSON.stringify({ authCheck: { error: authErr.message } }));
    }

    // Verify page loaded by checking for ETF dropdown
    const dropdownExists = await page.$('#etf-dropdown');
    if (!dropdownExists) {
      throw new Error('Backtester page did not load correctly (etf-dropdown not found)');
    }

    // Clear existing portfolio entries (click x buttons in portfolio-table)
    const table = await page.$('#portfolio-table');
    if (table) {
      const removeButtons = await table.$$('button');
      for (const btn of removeButtons) {
        const text = await btn.innerText().catch(() => '');
        if (text.includes('x') || text.includes('X') || text === '') {
          await btn.click();
          await page.waitForTimeout(500);
        }
      }
    }

    // Add each asset
    for (const asset of portfolio.assets) {
      // Click on the dropdown container to activate it (placeholder intercepts input clicks)
      const dropdown = await page.$('#etf-dropdown');
      if (!dropdown) {
        throw new Error('Cannot find ETF dropdown (#etf-dropdown). Element IDs may have changed.');
      }
      await dropdown.click();
      await page.waitForTimeout(500);

      // Use fill() on the input to trigger React/Dash change events properly
      const searchTerm = asset.name || asset.identifier;
      const dropdownInput = await page.$('#etf-dropdown input');
      if (dropdownInput) {
        await dropdownInput.fill(searchTerm);
      } else {
        await page.keyboard.type(searchTerm, { delay: 50 });
      }
      await page.waitForTimeout(3000); // Wait for Dash search callback

      // Select the first option using keyboard navigation (works with any dropdown)
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(200);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      // Brief pause for selection to register
      await page.waitForTimeout(500);
      await page.waitForTimeout(500);

      // Set allocation percentage
      const weightInput = await page.$('#percentage-input');
      if (weightInput) {
        await weightInput.click({ clickCount: 3, force: true }); // Select all
        await weightInput.fill(String(asset.weight));
      }

      // Click "Aggiungi" (Add) button
      const addBtn = await page.$('#add-etf-button');
      if (addBtn) {
        await addBtn.click({ force: true });
        await page.waitForTimeout(1500);
      }
    }

    // Configure settings
    const settings = portfolio.settings || {};

    // Set investment settings via JS (inputs may be in collapsed sections)
    if (settings.initialInvestment) {
      await page.evaluate((val) => {
        const input = document.querySelector('#single-investment-amount-input');
        if (input) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeInputValueSetter.call(input, val);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, String(settings.initialInvestment));
    }

    if (settings.recurringAmount) {
      await page.evaluate((val) => {
        const input = document.querySelector('#recurring-amount-input');
        if (input) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeInputValueSetter.call(input, val);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, String(settings.recurringAmount));
    }

    // Click "Avvia analisi" (Run backtest) - the pink button
    // Scroll down to make sure the button is in view
    await page.evaluate(() => {
      const btn = document.querySelector('#create-portfolio-button');
      if (btn) btn.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await page.waitForTimeout(500);
    const runBtn = await page.$('#create-portfolio-button');
    if (!runBtn) {
      throw new Error('Cannot find run button (#create-portfolio-button). Element IDs may have changed.');
    }
    await runBtn.click({ force: true });

    // Wait for results
    await waitForResults(page);

    const timestamp = new Date().toISOString().split('T')[0];
    const portfolioName = portfolio.assets.map(a => a.name).join('-');

    // Extract text results from Riassunto (Summary) tab
    const pageText = await page.evaluate(() => document.body.innerText);

    // Extract metrics - site uses Italian labels
    const metrics = {};
    const cagrMatch = pageText.match(/Rendimento\s+Annuale[:\s]*([+-]?\d+[.,]\d+)\s*%/i)
      || pageText.match(/CAGR[:\s]*([+-]?\d+[.,]\d+)\s*%/i);
    const volMatch = pageText.match(/Volatilit[àa][:\s]*([+-]?\d+[.,]\d+)\s*%/i);
    const sharpeMatch = pageText.match(/Sharpe\s*Ratio?[:\s]*([+-]?\d+[.,]\d+)/i);
    const ddMatch = pageText.match(/Max\s*Drawdown[:\s]*([+-]?\d+[.,]\d+)\s*%/i)
      || pageText.match(/Perdita\s+Massima[:\s]*([+-]?\d+[.,]\d+)\s*%/i);

    if (cagrMatch) metrics.cagr = cagrMatch[1];
    if (volMatch) metrics.volatility = volMatch[1];
    if (ddMatch) metrics.maxDrawdown = ddMatch[1];
    if (sharpeMatch) metrics.sharpe = sharpeMatch[1];

    // Capture multi-tab screenshots via Plotly.toImage
    const screenshots = await captureResultScreenshots(page, `${portfolioName}-${timestamp}`, REPORTS_DIR);

    // If no Plotly screenshots captured, fall back to viewport screenshot
    if (Object.keys(screenshots).length === 0) {
      const chartPath = path.join(REPORTS_DIR, `${portfolioName}-chart-${timestamp}.png`);
      await page.screenshot({ path: chartPath, fullPage: false });
      screenshots.chart = chartPath;
    }

    // Extract yearly returns from Performance tab
    const yearlyReturns = await extractYearlyReturns(page);

    // Extract composition data from Composizione tab
    const compositionResult = await extractCompositionData(
      page, `${portfolioName}-${timestamp}`, REPORTS_DIR
    );
    Object.assign(screenshots, compositionResult.screenshots);

    const result = {
      status: 'success',
      portfolio: portfolio.assets,
      settings: portfolio.settings,
      metrics,
      screenshots,
      yearlyReturns,
      compositionData: compositionResult.breakdowns,
      timestamp,
    };

    console.log(JSON.stringify(result, null, 2));
    await context.close();
    process.exit(0);
  } catch (err) {
    // Take error screenshot
    const errPath = path.join(REPORTS_DIR, `error-${Date.now()}.png`);
    try { await page.screenshot({ path: errPath }); } catch (_) {}

    console.error(JSON.stringify({
      error: err.message,
      errorScreenshot: errPath,
    }));
    await context.close();
    process.exit(1);
  }
}

main();
