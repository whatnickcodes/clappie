---
name: backtesto-agent
description: >
  Automate financial backtesting on backtes.to. Manages login, parses portfolio
  inputs from Excel/CSV/text/chat, runs backtests via browser automation
  (claude-in-chrome primary, Playwright fallback), and generates Markdown reports
  with inline chart images. Use when user asks to backtest a portfolio, analyze
  ETFs, or generate backtest reports from backtes.to.
argument-hint: [portfolio description or file path]
---

# Backtesto Agent

Automates portfolio backtesting on [backtes.to](https://backtes.to/) (Italian Dash SPA).

## Trigger Conditions

Activate this skill when the user:
- Asks to **backtest** a portfolio or allocation
- Wants to **analyze ETF performance** over a historical period
- Provides an **Excel/CSV file** with portfolio allocations
- Mentions **backtes.to** or Italian backtesting
- Asks to compare portfolio allocations or benchmarks
- Says something like "run 60/40 VWCE/AGGH" or "backtest 100% VWCE"
- Asks to **save** a portfolio or the current backtest composition
- Asks to **load** or use a previously saved portfolio

## Prerequisites Check

Before starting, verify:

1. **First-time setup**: If `~/.backtesto/credentials.json` doesn't exist and auth is needed:
   - Run `node scripts/setup-credentials.js` for guided setup
   - Or manually create the file: `{ "email": "...", "password": "..." }`
2. **Run preflight** (Playwright path): `node scripts/preflight-check.js`
   - Report results to user: credentials status, site reachability, session state
   - If issues found, address them before proceeding
3. **Browser available** (Chrome path): Check if claude-in-chrome MCP tools respond
   - If available, use chrome auth check (javascript_tool to probe Account modal)
   - Report auth state: "Logged in as X" or "Not logged in (login needed for saving)"
   - If not available, fall back to Playwright scripts

## Credential Management

```
~/.backtesto/
├── credentials.json    # { "email": "...", "password": "..." } (chmod 600)
├── auth-status.json    # Last known auth state (auto-updated)
└── browser-data/       # Playwright persistent context (session cookies)
```

- **Setup**: `node scripts/setup-credentials.js` — interactive wizard with masked password input
- **Preflight**: `node scripts/preflight-check.js` — validates credentials, site, and session
- **Session check**: `node scripts/playwright-login.js --check` — probe-only, no login attempt
- **Session monitor**: `node scripts/auth-watchdog.js` — check + auto-relogin if expired
- **Auth status**: `~/.backtesto/auth-status.json` — written automatically by all auth operations
- Never log or display passwords

## Run Contract

Execute these 6 steps in order:

### 1. Parse Input

Detect and normalize the portfolio input:

| Input Type | Detection | Handler |
|-----------|-----------|---------|
| `.xlsx` file | File extension | `parse-portfolio.js` with xlsx |
| `.csv` file | File extension | `parse-portfolio.js` with csv-parse |
| Structured text | Pattern: `XX% TICKER` | Regex extraction |
| Natural language | Fallback | LLM extraction to canonical JSON |

**Canonical portfolio JSON format:**
```json
{
  "assets": [
    { "identifier": "IE00BK5BQT80", "type": "isin", "name": "VWCE", "weight": 60 },
    { "identifier": "IE00BG47KH54", "type": "isin", "name": "AGGH", "weight": 40 }
  ],
  "settings": {
    "startYear": null,
    "endYear": null,
    "initialInvestment": 10000,
    "recurringAmount": 0,
    "frequency": "monthly",
    "rebalancing": "no_rebalancing"
  },
  "benchmark": {
    "mode": "single",
    "identifier": "IE00B4L5Y983",
    "name": "SWDA"
  }
}
```

- Weights MUST sum to 100
- **NON-NEGOTIABLE**: ALL identifiers MUST be resolved to ISINs before any site interaction. Never search the site by ticker or name — tickers are ambiguous and can match wrong assets (e.g. "EXUS" → "Theranexus SA"). Resolve via `references/asset_catalog_sample.md` first; if not found there, look up the ISIN from your knowledge base.
- If settings not specified, use defaults (site will pick max available range)

**Benchmark field** (optional — omit entirely if no benchmark requested):

| Mode | `benchmark` value | Example user input |
|------|------------------|--------------------|
| `single` | `{ "mode": "single", "identifier": "[ISIN]", "name": "[ticker]" }` | "vs MSCI World", "vs VWCE" |
| `multi` | `{ "mode": "multi", "components": [{"identifier": "[ISIN]", "name": "[ticker]", "weight": N}, ...] }` | "vs 60% SWDA / 40% EIMI" |
| `saved_portfolio` | `{ "mode": "saved_portfolio", "name": "[portfolio name]" }` | "vs my Andy 2026 portfolio" |

**Benchmark input detection patterns:**
- `"vs MSCI World"` or `"vs SWDA"` → resolve to ISIN via `asset_catalog_sample.md` → single mode
- `"vs 60% VWCE / 40% AGGH"` → resolve each to ISIN → multi mode
- `"vs my [name] portfolio"` or `"vs saved [name]"` → saved_portfolio mode
- `"compare against ..."` / `"benchmark ..."` → same detection
- No benchmark mentioned → omit field (backward compatible)

### 2. Authenticate

**claude-in-chrome flow:**
1. Click `account-button` to open Account modal (URL becomes `?modal=login`)
2. Check login state: look for "LOGOUT" text in modal (logged in) vs login form (logged out)
3. If logged in: close modal (Escape), proceed
4. If not: fill `#username` (email) and `#password` inputs, submit, verify "LOGOUT" appears
5. Close modal (Escape)
Note: Authentication is NOT stored in localStorage. It's session-based and detected visually.

**Playwright fallback:**
1. Run `playwright-login.js` which uses persistent browser context
2. Check exit code: 0=success, 1=auth-failed, 2=unreachable

### 3. Configure Backtest

Navigate to the Backtester section and configure:
> **Saved portfolio shortcut**: If the user references a saved portfolio by name
> (e.g. "backtest my Andy 2026 portfolio"), use the **Load Portfolio** flow from
> the Portfolio Management Contract to load it, then skip to Step 4 (Run Backtest).
1. Clear any existing portfolio entries
2. For each asset in the portfolio:
   a. **ALWAYS search by ISIN** in the ETF dropdown — NEVER by ticker or name.
      Tickers are ambiguous (e.g. "EXUS" matches "Theranexus SA" stock before the ETF).
      Resolve tickers/names to ISINs via `references/asset_catalog_sample.md` or prior knowledge BEFORE interacting with the dropdown.
   b. Select the matching result
   c. Enter the allocation percentage
   d. Click "Add" / confirm
3. Configure settings (investment amount, frequency, rebalancing, date range)
4. **Set benchmark** if `benchmark` field is present in canonical JSON:
   - **single mode**: Search `#benchmark-dropdown` by ISIN, select via ArrowDown+Enter (workflow Step 7A)
   - **multi mode**: Toggle `#benchmark-type-switch`, add each ETF via `#benchmark-etf-dropdown` + `#benchmark-percentage-input` + `#add-benchmark-etf-button` (workflow Step 7B)
   - **saved_portfolio mode**: Open Portafogli modal, match by name, click "Usa come Benchmark" button (workflow Step 7C)
   - Verify benchmark is set before proceeding to Run Backtest

> **Naming convention for reports:**
> - **Tables**: use abbreviated names (e.g. "EXUS", "EIMI")
> - **Figure captions/filenames**: use tickers (e.g. `EXUS-EIMI-performance.png`)

See `references/backtester_workflow.md` for exact tool call sequences.
See `references/dash_element_map.md` for component IDs.

### 4. Run Backtest

1. Click `create-portfolio-button` (pink button, text: "Avvia analisi")
2. Wait for results to load:
   - Poll every 3 seconds for up to 60 seconds
   - Check for `#backtester-results-tabs` or `#portfolio-value-chart` to appear
   - Check `#portfolio-feedback` for error messages
3. If timeout: report to user and suggest adjusting parameters

### 5. Extract Results

Capture all available result data:
- **Summary metrics** (Riassunto tab): Rendimento Annuale (CAGR), Volatilita, Sharpe Ratio, Periodo Analisi
- **Performance charts** (Performance tab): rolling returns (`rolling-figure`), yearly bar (`yearly-bar-figure`), distribution (`distribution-figure`)
- **Risk charts** (Rischio tab): max loss (`max-loss-chart`), success probability (`loss-prob-chart`), drawdown (`drawdown-chart`)
- **Allocation chart** (Composizione tab): `allocation-types-chart`
- **Benchmark & Correlazioni** (only when benchmark is configured — workflow Step 9d):
  - Click "Benchmark & Correlazioni" tab, wait 2s
  - Extract correlation value from `#linear-regression-scatter` annotation text
  - Extract comparative Rischio stats (Monte Carlo + Drawdown for both portfolio and benchmark) via `get_page_text`
  - Export Plotly charts: `#rolling-correlation-graph` (1400×500), `#linear-regression-scatter` (700×500)
  - Optionally export `#holdings-common-bar-chart-1v1` (1400×500) — **interactive chart**, requires switching `matrix-type-radio` to "holdings" and clicking a cell in the matrix. Skip if not available.
- **Chart export** via `javascript_tool` using `Plotly.downloadImage()`:
  - MUST click target tab first and wait 2s for chart to render
  - Charts on inactive tabs have 0x0 dimensions — always activate tab first
  - **CRITICAL: DPR override + export MUST be in a single `javascript_tool` call.**
    The DPR override does NOT persist across separate JS executions. If you override DPR
    in one call and export in another, the override will be lost and images will be clipped
    to the top-left corner at native DPR.
  - **DPR override technique** (for hi-res exports on Retina):
    ```js
    (async () => {
      const chart = document.querySelector('#chart-id');
      const origDPR = window.devicePixelRatio;
      Object.defineProperty(window, 'devicePixelRatio', {value: 1, configurable: true, writable: true});
      // VERIFY override took effect
      if (window.devicePixelRatio !== 1) throw new Error('DPR override failed');
      try {
        await Plotly.downloadImage(chart, {format: 'png', width: 1400, height: 500, filename: 'name'});
      } finally {
        Object.defineProperty(window, 'devicePixelRatio', {value: origDPR, configurable: true, writable: true});
      }
    })()
    ```
  - **Batch export pattern**: use a single async IIFE that loops through tabs and charts,
    activating each tab, overriding DPR, exporting, restoring DPR, then moving to the next.
    This is faster and more reliable than individual export calls.
  - This produces full-size images (55-85 KB) without the top-left clipping bug
  - Do NOT divide by DPR (produces tiny images) or use `scale:2` (causes clipping)
  - Use 1400x500 for wide charts, 700x500 for half-width charts, **1400x1000 for matrix heatmaps** (correlation matrix, holdings overlap — axis labels overlap at 500px height)
  - Files download to ~/Downloads — move to project `docs/images/` afterward
  - Fall back to `computer` screenshot only if Plotly export fails (e.g., non-Plotly content like Dani Score or AI Analysis tabs)
- **Efficient frontier optimized portfolios**: Extract weights from `customdata[0]` on the `Max Sharpe`, `Min Volatility`, and `Max Return` traces in `#efficient-frontier-plot`. Each entry is an array of weights in portfolio asset order. Include these compositions in the report.

### 6. Generate Report

Create a Markdown report in the project output directory (default: `~/clappie/projects/backtester/docs/[portfolio-name]-[YYYY-MM-DD].md`).

**MANDATORY**: Follow `references/report_format_spec.md` as the canonical template.

Three non-negotiable rules:
1. **Images complement tables** — never use an image without a table when numeric data is available. Image-only is acceptable only for purely visual charts (time series, drawdowns, distributions).
2. **Composition tables use emoji flags/icons** (country flags, currency symbols, sector icons).
3. **All Plotly charts exported via DPR-override technique** at 1400×500 (wide) or 700×500 (half-width).
4. **If benchmark was configured**, include Section 12 (Benchmark & Correlazioni) as defined in `report_format_spec.md` — benchmark specification, comparative metrics table, correlation charts, and common holdings.

> **Save reminder**: After delivering the report, remind the user:
> "Would you like to save this portfolio? Say 'save' or 'save as [name]'."

## Dash SPA Interaction Model

backtes.to is a Python Dash application. Key interaction considerations:

- **Callbacks are async**: After any input change, wait for Dash callbacks to fire
- **No URL routing for state**: The backtester is a single page; state is in components
- **Dropdowns are searchable**: Type to filter, then select from results
- **Wait strategy**: After clicking "update", poll for result elements
- **State verification**: Always verify the expected state arrived before proceeding

## Error Handling

| Error | Detection | Recovery |
|-------|-----------|----------|
| Login failed | No auth token after login attempt | Ask user to verify credentials |
| ETF not found | Dropdown shows no results for query | Try alternate identifiers, ask user |
| Allocation != 100% | Sum check before submitting | Normalize or ask user |
| Backtest timeout | No results after 60s polling | Report timeout, suggest shorter range |
| Site unreachable | Navigation fails | Switch to Playwright, or report offline |
| Dash callback error | Error toast/modal appears | Screenshot error, report to user |

## Portfolio Management Contract

Read `references/portfolio_management_sop.md` when the user asks to **save** or **load** a portfolio.
Chrome-only (no Playwright fallback). Requires authentication.

> Contains: auth guard, DataTable extraction (`.dash-cell-value` dedup pattern), auto-naming (ticker+weight), duplicate detection, Portafogli modal interaction, smart match for load.

## Test Suite

Read `references/test_suite_guide.md` when the user asks to **run tests**, **validate a report**, or **E2E test**.

> Contains: validation-only mode (`node tests/validate-report.js <report.md>`), full E2E workflow, manifest structure, adding new checks, pre-merge requirement (`manifest_covers_sections` enforces manifest ↔ report sync).

**Quick validate**: `node tests/validate-report.js docs/reports/<report>.md` — JSON output, exit 0=PASS 1=FAIL.

## Resource Pointers

- **Element IDs**: `references/dash_element_map.md` - Dash component IDs for automation
- **Workflow steps**: `references/backtester_workflow.md` - Exact tool call sequences
- **Input formats**: `references/input_format_specs.md` - Parsing specifications
- **Asset catalog**: `references/asset_catalog_sample.md` - Common ETFs with ISINs
- **Portfolio save/load**: `references/portfolio_management_sop.md` - Save/load SOP with code patterns
- **Test suite**: `references/test_suite_guide.md` - E2E validation, manifest structure, pre-merge checks
- **Playwright scripts**: `scripts/` - Fallback automation scripts
- **Reports output**: `docs/reports/` - Generated backtest reports
