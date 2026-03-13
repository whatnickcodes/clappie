# Backtester Workflow

Step-by-step browser automation sequences for backtes.to backtester.
Verified against live site on 2026-02-24.

## Prerequisites

- Tab open on `https://backtes.to/backtester` (or navigate there first)
- Authentication is NOT required for basic backtesting
- Authentication IS required for: saving portfolios, some advanced features

## 1. Auth & Preflight

Authentication state is NOT stored in localStorage. It's detected visually
via the Account modal. Auth state is persisted to `~/.backtesto/auth-status.json`.

### First-time setup

If `~/.backtesto/credentials.json` doesn't exist:
- Run `node scripts/setup-credentials.js` for interactive setup
- Or manually create: `{ "email": "...", "password": "..." }`

### Playwright path — Preflight

```
Run: node scripts/preflight-check.js

Output (JSON): credentials status, site reachability, session state
Exit codes: 0=ready, 1=issues, 2=site unreachable

Report results to user before proceeding.
```

Additional commands:
- `node scripts/playwright-login.js --check` — probe session without login
- `node scripts/playwright-login.js` — check + login if needed
- `node scripts/auth-watchdog.js` — check + auto-relogin if expired
- `node scripts/auth-watchdog.js --check-only` — report only

### Chrome path — Auth check via javascript_tool

```
Step 1: Open Account modal
Tool: computer
action: click on `account-button` (top-right, text: "Account")

Step 2: Wait for modal
Tool: computer
action: wait 2s

Step 3: Check login state
Tool: javascript_tool
Code: (async () => {
  const modal = document.querySelector('#login-modal');
  if (!modal) return { status: 'modal_not_found' };
  const hasLogout = modal.innerText.includes('LOGOUT');
  const hasUsernameInput = !!modal.querySelector('#username');
  return { loggedIn: hasLogout, hasLoginForm: hasUsernameInput };
})()

Step 4: Report to user
"Logged in as X" or "Not logged in (login needed for saving)"

Step 5: Close modal
Tool: computer
action: key Escape
```

### Chrome path — Login (only if needed)

Only when auth check shows `loggedIn: false` and login is required.
The Account modal must be open.

```
Step 1: Click "Accedi" tab (should be default, but ensure it)
The auth-form has tabs: Accedi / Registrati / Reset Password

Step 2: Enter email
Tool: form_input
ref: [ref for #username input]
value: [email from credentials]

Step 3: Enter password
Tool: form_input
ref: [ref for #password input]
value: [password from credentials]

Step 4: Submit login
Tool: computer
action: click on submit/login button within auth-form
(Look for a submit button - may need read_page to find exact ref)

Step 5: Wait and verify (3-4 seconds)
Tool: computer
action: wait 4s

Step 6: Verify login succeeded
Tool: javascript_tool
Code: (async () => {
  const modal = document.querySelector('#login-modal');
  if (!modal) return { status: 'modal_closed' };
  return { loggedIn: modal.innerText.includes('LOGOUT') };
})()

Step 7: Report to user + close modal
Tool: computer
action: key Escape
```

### Auth status file

All auth operations write to `~/.backtesto/auth-status.json`:
```json
{
  "state": "logged_in",
  "email": "user@example.com",
  "checkedAt": "2026-02-26T10:30:00Z",
  "source": "playwright",
  "error": null
}
```

Read this file for instant visibility without re-probing.

## 3. Navigate to Backtester

```
Tool: navigate
URL: https://backtes.to/backtester

Tool: computer
action: wait 3s

Tool: javascript_tool (verify page loaded)
Code: (async () => {
  return !!document.querySelector('#etf-dropdown');
})()
```

## 4. Clear Existing Portfolio

```
Tool: javascript_tool
Code: (async () => {
  const table = document.querySelector('#portfolio-table');
  if (!table) return { rows: 0 };
  // Count data rows (excluding header)
  const rows = table.querySelectorAll('.rt-tr-group, tbody tr');
  return { rows: rows.length };
})()
```

If rows > 0, click each `x` button in the portfolio table to remove entries.
The `x` buttons are inside the portfolio-table rows (no specific IDs).

```
Tool: read_page (find x buttons in portfolio table)
filter: interactive
ref_id: [ref for portfolio-table]

Then click each remove/x button found.
Wait 1s between removals.
```

## 5. Add ETF to Portfolio

Repeat for each asset:

```
Step 1: Click on ETF dropdown to focus it
Tool: computer
action: click on the etf-dropdown area (the search input inside it)

Step 2: Type search query
Tool: computer
action: type [ISIN or ticker]
(ISIN preferred - gives exact single match)

Step 3: Wait for dropdown results (1.5-2s for Dash callback)
Tool: computer
action: wait 2s

Step 4: Screenshot to verify dropdown options appeared
Tool: computer
action: screenshot

Step 5: Select the matching result
Tool: computer
action: click on the first dropdown option
(Dropdown option format: "[Name] | [ISIN] | Da [MM/YYYY]")

Step 6: Set allocation percentage (if not 100)
The percentage-input defaults to 100. Only change if needed.
Tool: computer
action: triple_click on percentage-input to select all
Tool: computer
action: type [weight as number]

Step 7: Click "Aggiungi" (Add) button
Tool: computer
action: click on add-etf-button

Step 8: Wait and verify
Tool: computer
action: wait 1.5s
Tool: javascript_tool
Code: (async () => {
  const table = document.querySelector('#portfolio-table');
  const remaining = document.querySelector('#remaining-percentage');
  return {
    tableText: table?.innerText?.substring(0, 200),
    remaining: remaining?.innerText
  };
})()
```

**Important**: After adding the first ETF, the percentage-input resets to the
remaining percentage. For multi-ETF portfolios, add ETFs in order and adjust
percentages accordingly.

## 6. Configure Settings

Settings are accessible via the "Impostazioni Analisi" button OR inline controls.

**Inline settings** (always visible above the action buttons):
- Investment frequency, amounts, date range are in the settings panel

**Modal settings** (click "Impostazioni Analisi"):
- Advanced options like tax, inflation, FIRE analysis

```
Step 1: Set initial investment (if specified)
Tool: computer
action: triple_click on #single-investment-amount-input
Tool: computer
action: type [amount]

Step 2: Set recurring amount (if specified)
Tool: computer
action: triple_click on #recurring-amount-input
Tool: computer
action: type [amount]

Step 3: Set frequency (if specified) - react-select dropdown
Tool: computer
action: click on #investment-frequency-dropdown
action: wait 0.5s
action: type [search term]
action: wait 1s
action: click matching option

Step 4: Set custom date range (if specified)
First enable custom period:
Tool: computer
action: click on #custom-period-switch (checkbox)

Then set dropdowns for start-year, start-month, end-year, end-month
(each is a react-select: click, type, select option)
```

## 7. Set Benchmark (Optional)

The benchmark dropdown uses the **same ETF catalog** as the portfolio dropdown — no named indices.
Always search by ISIN. See `asset_catalog_sample.md` for recommended benchmark ETFs.

### 7A. Single Benchmark (default mode)

```
Step 1: Click benchmark dropdown
Tool: computer
action: click on #benchmark-dropdown

Step 2: Type ISIN
Tool: computer
action: type [ISIN, e.g. IE00B4L5Y983 for SWDA/MSCI World]

Step 3: Wait for dropdown results
Tool: computer
action: wait 2s

Step 4: Select matching option
Tool: computer
action: key ArrowDown Return

Step 5: Verify selection
Tool: javascript_tool
Code: (async () => {
  const bd = document.querySelector('#benchmark-dropdown');
  return bd?.innerText?.substring(0, 200);
})()
Expect: ETF name with × clear button
```

### 7B. Multi-ETF Benchmark

```
Step 1: Enable multi-ETF mode
Tool: computer
action: click on #benchmark-type-switch

Step 2: For each benchmark ETF, repeat:
  a. Click #benchmark-etf-dropdown
  b. Type [ISIN]
  c. Wait 2s
  d. Key ArrowDown Return
  e. Click #benchmark-percentage-input, Cmd+A, type [weight]
  f. Click #add-benchmark-etf-button
  g. Wait 1.5s

Step 3: Verify total = 100%
Tool: javascript_tool
Code: (async () => {
  const remaining = document.querySelector('#benchmark-remaining-percentage');
  return remaining?.innerText;
})()
```

### 7C. Saved Portfolio as Benchmark

Use a previously saved portfolio as benchmark via the Portafogli modal.

```
Step 1: Open portfolios modal
Tool: computer
action: click on `show-portfolios-btn`
action: wait 2s

Step 2: Ensure user portfolios tab
Tool: computer
action: click on `btn-user-portfolios`
action: wait 1s

Step 3: Find matching portfolio
Tool: javascript_tool
Code: (async () => {
  const loadBtns = document.querySelectorAll('button[id*="load-portfolio"]');
  return Array.from(loadBtns).map((btn, i) => {
    const card = btn.closest('.card') || btn.parentElement?.parentElement;
    const text = card?.textContent || '';
    const nameMatch = text.match(/^([^\n]+?)Composizione:/s);
    const name = nameMatch ? nameMatch[1].trim() : `Portfolio ${i}`;
    return { index: i, name };
  });
})()

Step 4: Click "Usa come Benchmark" button for matched portfolio
Tool: javascript_tool
Code: (async () => {
  const btn = document.querySelector(`button[id='{"index":${N},"type":"use-as-benchmark"}']`);
  if (btn) { btn.click(); return { clicked: true }; }
  return { error: 'not found' };
})()
action: wait 2s

Step 5: Close modal
Tool: computer
action: click on `close-portfolios-modal`

Step 6: Verify benchmark was set
Tool: javascript_tool
Code: (async () => {
  const bd = document.querySelector('#benchmark-dropdown');
  const bt = document.querySelector('#benchmark-table');
  return {
    singleBenchmark: bd?.innerText?.substring(0, 200),
    multiBenchmark: bt?.innerText?.substring(0, 200)
  };
})()
```

### Benchmark Error Handling

| Error | Detection | Recovery |
|-------|-----------|----------|
| ISIN not found in dropdown | No results after 2s wait | Try alternate ISIN from asset catalog |
| Multi-ETF total != 100% | `benchmark-remaining-percentage` shows nonzero | Adjust weights or use "Porta a 100%" if available |
| Saved portfolio not found | No matching name in card list | List available portfolios, ask user |
| "use-as-benchmark" button missing | Button selector returns null | Portfolio may not be saved; save first |

## 8. Run Backtest

```
Step 1: Click "Avvia analisi" (pink button)
Tool: computer
action: click on #create-portfolio-button

Step 2: Wait for loading overlay to appear and disappear
Tool: computer
action: wait 5s

Step 3: Poll for results (every 3s, max 60s)
Tool: javascript_tool
Code: (async () => {
  const loading = document.querySelector('#backtester-analysis-loading-overlay');
  const isLoading = loading && loading.style.display !== 'none' && loading.offsetParent !== null;
  const chart = document.querySelector('#portfolio-value-chart .js-plotly-plot');
  const tabs = document.querySelector('#backtester-results-tabs');
  const error = document.querySelector('#portfolio-feedback');
  const errorText = error?.innerText?.trim();
  if (errorText) return { status: 'error', message: errorText };
  if (chart || tabs) return { status: 'ready' };
  if (isLoading) return { status: 'loading' };
  return { status: 'unknown' };
})()

Repeat until status is 'ready' or 'error', or 60s elapsed.

Step 4: Scroll down to results
Tool: computer
action: scroll down 8 ticks to reach results area
```

## 9. Extract Results

### 9a. Get Summary Metrics

```
Step 1: Get summary metrics from Riassunto tab (default active tab)
Tool: get_page_text
Parse for:
- "Rendimento Annuale" -> CAGR (e.g., "8.8%")
- "Volatilità" -> Volatility (e.g., "12.9%")
- "Sharpe Ratio" -> (e.g., "0.68")
- "Periodo Analisi" -> Date range
```

### 9b. Export Charts via Plotly.downloadImage()

For each chart, follow this 3-step pattern: activate tab, export via Plotly, move file.

**IMPORTANT**: Use `Plotly.downloadImage()` instead of `computer` screenshots for all Plotly charts.
This produces high-resolution exports (55-85 KB) vs low-res screenshots (~480px, 12-17 KB).

#### Plotly Export Pattern (repeat for each chart)

```
Step A: Click the target result tab and wait for chart to render
Tool: computer
action: click on "[Tab Name]" tab in backtester-results-tabs
action: wait 2s

Step B: Export chart via Plotly.downloadImage() with DPR override
Tool: javascript_tool
Code: (async () => {
  const el = document.querySelector('[CHART_SELECTOR] .js-plotly-plot');
  if (!el) return { error: 'chart not found' };
  const origDPR = window.devicePixelRatio;
  Object.defineProperty(window, 'devicePixelRatio', {value: 1, configurable: true, writable: true});
  await Plotly.downloadImage(el, {format: 'png', width: 1400, height: 500, filename: '[chart-name]'});
  Object.defineProperty(window, 'devicePixelRatio', {value: origDPR, configurable: true, writable: true});
  return { success: true };
})()

Step C: Move downloaded file to report images directory
Files download to ~/Downloads — move to docs/reports/images/[portfolio]-[date]-[chart-name].png
Use 1400x500 for wide charts, 700x500 for half-width charts.
```

**Retina/HiDPI fix**: The DPR override temporarily sets `devicePixelRatio` to 1 before
export, then restores the original value. This produces full-size images without clipping.
Do NOT divide by DPR (produces tiny images) or use `scale:2` (causes top-left clipping bug).

#### Charts to Export

**Riassunto tab** (default active):
- `#portfolio-value-chart` → summary chart (allocation donut / portfolio value)

**Performance tab**:
- `#portfolio-value-chart` → portfolio value over time
- `#rolling-figure` → rolling returns
- `#yearly-bar-figure` → yearly returns bar chart

**Rischio tab**:
- `#max-loss-chart` → max loss analysis
- `#loss-prob-chart` → success/loss probability
- `#drawdown-chart` → drawdown timeline

**Composizione tab**:
- `#allocation-types-chart` → allocation breakdown
- Iterate radio buttons for each breakdown type (Geo, Settore, Asset Class, Valuta, Dimensione)
- Click each radio button, wait 2s, then export `#allocation-types-chart` again

### 9c. Fallback: computer screenshot

If `Plotly.toImage()` returns an error or the element is not a Plotly plot
(e.g., Dani Score tab, AI Analysis tab), fall back to `computer` screenshot:

```
Tool: computer
action: screenshot
Save screenshot for report
```

### 9d. Benchmark & Correlazioni Tab (only when benchmark is configured)

Skip this step if no benchmark was set. The 7th tab only appears when a benchmark is configured.

```
Step 1: Click "Benchmark & Correlazioni" tab
Tool: computer
action: click on "Benchmark & Correlazioni" tab in backtester-results-tabs
action: wait 2s

Step 2: Extract correlation value from scatter plot
Tool: javascript_tool
Code: (async () => {
  const scatter = document.querySelector('#linear-regression-scatter');
  const text = scatter?.innerText || '';
  const match = text.match(/Correlazione:\s*([\d.]+)/);
  return { correlation: match ? parseFloat(match[1]) : null };
})()

Step 3: Extract comparative Rischio metrics (Monte Carlo + Drawdown)
Tool: javascript_tool
Code: (async () => {
  const h4s = Array.from(document.querySelectorAll('h4'));
  const mcStats = h4s.find(h => h.innerText.includes('Monte Carlo'));
  const ddStats = h4s.find(h => h.innerText.includes('Drawdown'));
  return {
    monteCarlo: mcStats?.parentElement?.innerText,
    drawdown: ddStats?.parentElement?.innerText
  };
})()

Step 4: Export rolling correlation chart
Tool: javascript_tool (Plotly DPR-override export)
Chart selector: #rolling-correlation-graph
Filename: [portfolio]-[date]-rolling-correlation
Size: 1400x500

Step 5: Export scatter regression chart
Tool: javascript_tool (Plotly DPR-override export)
Chart selector: #linear-regression-scatter
Filename: [portfolio]-[date]-scatter-regression
Size: 700x500

Step 6: (Optional) Export common holdings chart
NOTE: This chart is interactive — it requires:
  a. Switch matrix-type-radio to "holdings" (click radio input)
  b. Wait 2s for holdings matrix to render
  c. Click a cell in the matrix to show the common holdings detail
  d. Wait 2s for holdings-common-bar-chart-1v1 to appear
  e. Export via Plotly DPR-override
Tool: javascript_tool (Plotly DPR-override export)
Chart selector: #holdings-common-bar-chart-1v1
Filename: [portfolio]-[date]-common-holdings
Size: 1400x500
Skip if chart element does not appear after cell click.

Step 7: (Optional) Change correlation period and re-export
Click radio labels in #correlation-period-radio for different periods.
Wait 2s after each click for chart to update.
```

## Result Tabs Reference

| Tab | Content | Key Charts |
|-----|---------|------------|
| Riassunto | Summary metrics + donut allocation chart | CAGR, Volatility, Sharpe |
| Performance | Rolling returns, yearly bar chart, distribution | `rolling-figure`, `yearly-bar-figure`, `distribution-figure` |
| Rischio | Max drawdown, success probability, drawdown timeline | `max-loss-chart`, `loss-prob-chart`, `drawdown-chart` |
| Composizione | Allocation breakdown over time | `allocation-types-chart` |
| Dani Score | Proprietary scoring | |
| AI Analysis | AI-generated analysis (requires acceptance of disclaimer) | |
| Benchmark & Correlazioni | Correlation charts + matrix + optional common holdings (only with benchmark) | `rolling-correlation-graph`, `linear-regression-scatter`, `correlation-matrix-chart`, `holdings-common-bar-chart-1v1` (interactive) |

## Timing Notes

- After page navigation: wait 3s for Dash to fully initialize
- After typing in react-select dropdown: wait 2s for search callback
- After clicking "Aggiungi" (add ETF): wait 1.5s for table update
- After clicking "Avvia analisi" (run): poll every 3s, up to 60s
- After switching result tabs: wait 2s for charts to render
- If a wait seems insufficient, double it and retry once
- The `custom-period-switch` must be toggled ON before date dropdowns become active

## 10. Save Portfolio

Requires authentication. Only available when portfolio table has assets.

```
Step 1: Read current portfolio composition
Tool: javascript_tool
Code: (async () => {
  const table = document.querySelector('#portfolio-table');
  if (!table) return { error: 'no table' };
  const cells = Array.from(table.querySelectorAll('.dash-cell-value'));
  const texts = cells.map(c => c.textContent?.trim());
  const deduped = texts.filter((t, i) => i === 0 || t !== texts[i - 1]);
  const assets = [];
  for (let i = 0; i < deduped.length; i += 2) {
    const name = deduped[i];
    const weight = parseFloat(deduped[i + 1]);
    if (name && !isNaN(weight)) assets.push({ name, weight });
  }
  return assets;
})()

Step 2: Check for duplicates in saved portfolios
Tool: computer
action: click on `show-portfolios-btn`
action: wait 2s

Tool: javascript_tool
Code: (async () => {
  const loadBtns = document.querySelectorAll('button[id*="load-portfolio"]');
  return Array.from(loadBtns).map((btn, i) => {
    const card = btn.closest('.card') || btn.parentElement?.parentElement;
    const text = card?.textContent || '';
    const nameMatch = text.match(/^([^\n]+?)Composizione:/s);
    const name = nameMatch ? nameMatch[1].trim() : `Portfolio ${i}`;
    const assets = [...text.matchAll(/([^:]+?):\s*([\d.]+)%/g)].map(m => ({
      name: m[1].trim(), weight: parseFloat(m[2])
    }));
    return { index: i, name, assets };
  });
})()

If duplicate found: click delete button, wait 2s.
Tool: computer
action: click `close-portfolios-modal`

Step 3: Open save modal
Tool: computer
action: click on `save-portfolio-button`
action: wait 1s

Step 4: Set portfolio name
Tool: computer
action: triple_click on `#portfolio-name-input`
action: type [portfolio name]

Step 5: Confirm save
Tool: computer
action: click on `#confirm-save-portfolio`
action: wait 2s

Step 6: Verify save
Tool: computer
action: click on `show-portfolios-btn`
action: wait 2s
Tool: javascript_tool — verify new portfolio name appears in card list
Tool: computer
action: click `close-portfolios-modal`
```

## 11. Load Portfolio

```
Step 1: Open portfolios modal
Tool: computer
action: click on `show-portfolios-btn`
action: wait 2s

Step 2: Ensure user portfolios tab is active
Tool: computer
action: click on `btn-user-portfolios`
action: wait 1s

Step 3: Extract portfolio list
Tool: javascript_tool
Code: (async () => {
  const loadBtns = document.querySelectorAll('button[id*="load-portfolio"]');
  return Array.from(loadBtns).map((btn, i) => {
    const card = btn.closest('.card') || btn.parentElement?.parentElement;
    const text = card?.textContent || '';
    const nameMatch = text.match(/^([^\n]+?)Composizione:/s);
    const name = nameMatch ? nameMatch[1].trim() : `Portfolio ${i}`;
    const assets = [...text.matchAll(/([^:]+?):\s*([\d.]+)%/g)].map(m => ({
      name: m[1].trim(), weight: parseFloat(m[2])
    }));
    return { index: i, name, assets };
  });
})()

Step 4: Match user request (LLM step — no tool call)
Compare user query against portfolio names and compositions.
If ambiguous, list options and ask user.

Step 5: Click load button
Tool: javascript_tool
Code: (async () => {
  const btn = document.querySelector(`button[id='{"index":${N},"type":"load-portfolio"}']`);
  if (btn) { btn.click(); return { clicked: true }; }
  return { error: 'not found' };
})()
action: wait 2s

Step 6: Close modal
Tool: computer
action: click on `close-portfolios-modal`

Step 7: Verify loaded portfolio
Tool: javascript_tool — read portfolio-table to confirm assets loaded
```
