# Dash Element Map

Component IDs for backtes.to Backtester section, verified via live discovery on 2026-02-24.

> **Important**: IDs may change when the site updates. Use the Discovery Procedure
> below to verify IDs before relying on them.

## Navigation & Chrome

| Component | ID | Type | Notes |
|-----------|-----|------|-------|
| Main tabs | `tabs` | UL | Backtester / Live Tracker / Comparatore / Guida |
| Desktop tabs wrapper | `desktop-tabs-wrapper` | DIV | Contains main tab bar |
| Main content | `main-content` | MAIN | |
| Language toggle | `lang-toggle-btn` | BUTTON | Text: "English" (toggles to Italian) |
| Help button | `open-help-modal` | BUTTON | Text: "Aiuto" |
| Portfolios button | `show-portfolios-btn` | BUTTON | Text: "Portafogli" |
| Donate button | `donate-button` | BUTTON | Text: "Dona" |
| Account button | `account-button` | BUTTON | Text: "Account" - opens login modal |
| Donor indicator | `donor-indicator` | DIV | Shows supporter badge |

## Authentication (Account Modal)

Opened by clicking `account-button`. URL changes to `?modal=login`.

| Component | ID | Type | Notes |
|-----------|-----|------|-------|
| Login modal | `login-modal` | DIV | Modal container |
| Modal content | `contenuto-modale` | DIV | Inner content area |
| Modal lang toggle | `lang-toggle-btn-modal` | BUTTON | Language toggle inside modal |
| Login status | `login-status` | DIV | Status messages |
| Auth form | `auth-form` | DIV | Contains Accedi/Registrati/Reset tabs |
| Tab switcher | `toggle-auth` | UL | Tab navigation for login/register/reset |
| **Email input** | **`username`** | INPUT:email | placeholder: "Inserisci la tua email" |
| Confirm email | `confirm-email` | INPUT:email | Registration only |
| Confirm email wrapper | `confirm-email-container` | DIV | |
| **Password input** | **`password`** | INPUT:password | placeholder: "Inserisci la password" |
| Password wrapper | `password-container` | DIV | |
| GDPR terms | `gdpr-terms-container` | DIV | Registration checkbox |
| Auto-scroll toggle | `auto-scroll-toggle-login` | INPUT:checkbox | "Auto-scroll tab risultati" |
| Registration info | `registration-info` | H6 | Explains benefits of registering |

**Login state detection**: When logged in, the modal shows a purple banner with email
and a red "LOGOUT" button. When logged out, it shows email/password input fields.
There is NO localStorage auth token - login state is detected visually by checking
if the modal contains input fields vs the purple banner/logout button.

## Portfolio Management Modal

Opened by clicking `show-portfolios-btn`. URL changes to `?modal=portfolio`.

### Modal Tabs

| Component | ID | Type | Notes |
|-----------|-----|------|-------|
| Tab: User portfolios | `btn-user-portfolios` | BUTTON | "Portafogli Testati" (active by default) |
| Tab: Model portfolios | `btn-premade-portfolios` | BUTTON | "Portafogli Modello" (read-only presets) |
| Tab: Influencer | `btn-influencer-portfolios` | BUTTON | "Influencer" (read-only curated) |
| Tab: Custom assets | `btn-custom-etfs` | BUTTON | "Asset personalizzati" |
| Close modal | `close-portfolios-modal` | BUTTON | "Chiudi" button at bottom |

### Portfolio Cards (Portafogli Testati tab)

Each saved portfolio renders as a card with name, composition list, and 3 action buttons.
Button IDs are **JSON-encoded Dash pattern callback IDs** with `index` (0-based card position) and `type`.

| Action | ID Pattern | Button Style | Notes |
|--------|-----------|--------------|-------|
| Load into backtester | `{"index": N, "type": "load-portfolio"}` | Red "Carica" | Replaces entire backtester composition |
| Use as benchmark | `{"index": N, "type": "use-as-benchmark"}` | Blue "Usa come Benchmark" | |
| Delete | `{"index": N, "type": "delete-portfolio"}` | Text "Elimina" (red outline) | User portfolios only |

**Card data extraction** (via javascript_tool):
```js
(async () => {
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
```

### Save Portfolio Modal

Opened by clicking `save-portfolio-button`. URL changes to `?modal=portfolio-name`.

| Component | ID | Type | Notes |
|-----------|-----|------|-------|
| Portfolio name input | `portfolio-name-input` | INPUT:text | Auto-filled: `Portafoglio` + day + HHMMSS |
| Confirm save | `confirm-save-portfolio` | BUTTON | Red "Salva" button |
| Cancel save | `cancel-save-portfolio` | BUTTON | "Annulla" button |

## ETF Selection

| Component | ID | Type | Notes |
|-----------|-----|------|-------|
| **ETF search dropdown** | **`etf-dropdown`** | DIV | Searchable react-select. Placeholder: "Scrivi qui il nome del prodotto (ETF, bond o azioni)" |
| **Allocation % input** | **`percentage-input`** | INPUT | Defaults to 100 |
| Allocation label | `allocation-percentage-label` | LABEL | "Percentuale di Allocazione:" |
| **Add button** | **`add-etf-button`** | BUTTON | Text: "Aggiungi" |
| **Portfolio table** | **`portfolio-table`** | DIV | Columns: ETF/BOND/AZIONI, PERCENTUALE (%) |
| Remaining % display | `remaining-percentage` | DIV | "Totale corrente: X% Percentuale rimanente: Y%" |
| Portfolio info tooltip | `portfolio-composition-info-tooltip` | I | |
| Save portfolio button | `save-portfolio-button` | BUTTON | Text: "Salva Portafoglio" (requires login) |
| Show weight charts | `show-weight-charts-switch` | INPUT | Toggle weight visualization |

**Remove ETF**: Each row has an `x` button (no specific ID). Target via clicking the `x`
within the portfolio-table rows.

**Dropdown behavior**: Type to search, results appear as options. Format in dropdown:
`[Name] | [ISIN] | Da [MM/YYYY]`. Click option to select. Selected shows with `x` clear button.

## Settings (in "Impostazioni Analisi" modal)

Accessed via `open-settings-modal` button. Some settings are visible inline.

| Component | ID | Type | Notes |
|-----------|-----|------|-------|
| Settings button | `open-settings-modal` | BUTTON | Text: "Impostazioni Analisi" |
| **Frequency dropdown** | **`investment-frequency-dropdown`** | DIV | react-select |
| **Initial investment** | **`single-investment-amount-input`** | INPUT | EUR amount |
| Recurring initial amount | `recurring-initial-amount-input` | INPUT | |
| **Recurring amount** | **`recurring-amount-input`** | INPUT | EUR per period |
| Recurring commission | `recurring-commission-input` | INPUT | |
| **Rebalancing strategy** | **`weight-rebalancing-strategy`** | DIV | react-select dropdown |
| Custom period toggle | `custom-period-switch` | INPUT:checkbox | Enables date range pickers |
| **Start year** | **`start-year-dropdown`** | DIV | react-select |
| **Start month** | **`start-month-dropdown`** | DIV | react-select |
| **End year** | **`end-year-dropdown`** | DIV | react-select |
| **End month** | **`end-month-dropdown`** | DIV | react-select |

## Advanced Settings

| Component | ID | Type | Notes |
|-----------|-----|------|-------|
| FIRE analysis toggle | `analisi-fire-switch` | INPUT:checkbox | |
| FIRE simulation length | `fire-simulation-length` | INPUT | |
| FIRE simulation duration | `fire-simulation-duration` | INPUT | |
| FIRE monthly expenses | `fire-monthly-expenses` | INPUT | |
| FIRE inflation rate | `fire-inflation-rate` | INPUT | |
| Pension income toggle | `pension-income-switch` | INPUT:checkbox | |
| Pension monthly amount | `pension-monthly-amount` | INPUT | |
| Years to pension | `years-to-pension` | INPUT | |
| Black swan toggle | `cigno-nero-switch` | INPUT:checkbox | "Cigno nero" |
| **Tax toggle** | **`tax-switch`** | INPUT:checkbox | |
| Capital gains tax rate | `capital-gains-tax-rate` | INPUT | |
| **Inflation adjustment** | **`inflation-adjustment`** | INPUT:checkbox | |
| Use real inflation | `use-real-inflation` | INPUT:checkbox | |

## Benchmark

The benchmark dropdown uses the **same ETF/bond/stock catalog** as the main portfolio dropdown.
There are no bare named indices — **always search by ISIN**, same rule as portfolio ETFs.
See `asset_catalog_sample.md` for recommended benchmark ETFs mapped to common indices.

| Component | ID | Type | Notes |
|-----------|-----|------|-------|
| Benchmark card | `benchmark-card` | DIV | "Benchmark (Opzionale)" section |
| **Multi-ETF toggle** | **`benchmark-type-switch`** | INPUT:checkbox | "Crea il tuo Benchmark con multipli ETF/bond/azioni" |
| **Single benchmark dropdown** | **`benchmark-dropdown`** | DIV | "Cerca il tuo Benchmark" react-select (same catalog as ETF dropdown) |
| Single benchmark container | `single-benchmark-container` | DIV | |
| Multi-ETF dropdown | `benchmark-etf-dropdown` | DIV | react-select for multi-benchmark |
| Multi-ETF % input | `benchmark-percentage-input` | INPUT:number | Defaults to 100 |
| Multi-ETF add button | `add-benchmark-etf-button` | BUTTON | Text: "Aggiungi" |
| Benchmark table | `benchmark-table` | DIV | Multi-benchmark allocation table |
| Benchmark table container | `benchmark-table-container` | DIV | |
| Benchmark inputs row | `benchmark-inputs-row` | DIV | |
| Benchmark remaining % | `benchmark-remaining-percentage` | DIV | |

## Action Buttons

| Component | ID | Type | Notes |
|-----------|-----|------|-------|
| **Run backtest** | **`create-portfolio-button`** | BUTTON | Pink button, text: "Avvia analisi" |
| Portfolio feedback | `portfolio-feedback` | DIV | Validation messages |
| Loading overlay | `backtester-analysis-loading-overlay` | DIV | Shown during analysis |
| Loading close | `backtester-analysis-loading-close` | BUTTON | Close loading overlay |
| Loading message | `backtester-analysis-loading-message` | P | Progress text |
| Portfolio creation trigger | `trigger-portfolio-creation` | DIV | Internal trigger |
| URL portfolio store | `url-portfolio-store` | DIV | Stores portfolio URL state |
| Share URL container | `share-url-container` | DIV | |

## Results Area

Results appear below the action buttons after running analysis.

| Component | ID | Type | Notes |
|-----------|-----|------|-------|
| **Results tabs** | **`backtester-results-tabs`** | DIV | Riassunto/Performance/Rischio/Composizione/Dani Score/AI Analysis + Benchmark & Correlazioni (7th tab, only when benchmark is configured) |
| Results dropdown | `backtester-results-dropdown` | DIV | Additional results selector |
| **All plots container** | **`all-backtester-plots`** | DIV | Wrapper for all result charts |
| Results hint | `tabs-hint-wrapper` | DIV | Instructional hint for tabs |
| Hint dismiss | `tabs-hint-dismiss-btn` | BUTTON | |
| Save PDF button | `save-pdf-button` | BUTTON | |
| Share portfolio button | `share-portfolio-button` | BUTTON | |
| Rendimento info icon | `rendimento-info-icon` | I | |

## Result Charts (rendered after backtest runs)

| Component | ID | Type | Notes |
|-----------|-----|------|-------|
| **Portfolio value chart** | **`portfolio-value-chart`** | DIV | Main performance line chart |
| **CAGR chart** | **`cagr-chart`** | DIV | CAGR visualization |
| **Sortino chart** | **`sortino-chart`** | DIV | Sortino ratio chart |
| **Rolling figure** | **`rolling-figure`** | DIV | Rolling returns/volatility/sharpe |
| Rolling figure container | `rolling-figure-container` | DIV | |
| Rolling figure loading | `rolling-figure-loading` | DIV | |
| Rolling metric selector | `rolling-metric-select` | DIV | Rendimenti/Volatilita/Sharpe toggle |
| Rolling period dropdown | `rolling-period-dropdown` | DIV | "Rendimenti 1 Anno" etc. |
| Rolling period container | `rolling-period-dropdown-container` | DIV | |
| **Yearly bar chart** | **`yearly-bar-figure`** | DIV | Annual returns bar chart |
| Yearly bar container | `yearly-bar-figure-container` | DIV | |
| Yearly bar loading | `yearly-bar-figure-loading` | DIV | |
| **Distribution chart** | **`distribution-figure`** | DIV | Return distribution |
| Distribution container | `distribution-figure-container` | DIV | |
| Distribution loading | `distribution-figure-loading` | DIV | |
| **Monte Carlo chart** | **`monte-carlo-chart`** | DIV | Monte Carlo simulations |
| **Max loss chart** | **`max-loss-chart`** | DIV | "Perdita Massima" by period |
| **Loss probability chart** | **`loss-prob-chart`** | DIV | "Probabilita di Successo" |
| **Drawdown chart** | **`drawdown-chart`** | DIV | "Analisi Drawdown" |

## Composizione (Allocation) Charts

| Component | ID | Type | Notes |
|-----------|-----|------|-------|
| Allocation types section | `allocation-types-section` | DIV | |
| Allocation type radio | `allocation-type-radio` | DIV | Toggle allocation view type |
| Allocation types chart | `allocation-types-chart` | DIV | Bar chart (not pie). Labels in trace.x, percentages in trace.text |

### Radio Button Options (verified 2026-02-24)

Container: `#allocation-type-radio` (class: `andamento-pill-group`)
Structure: `<label><input type="radio">Text</label>` — no IDs on inputs, no name/value attrs.

| Label (Italian)      | Emoji | English key | Default? |
|----------------------|-------|-------------|----------|
| Paese                | 🌍    | country     | Yes (checked) |
| Continente           | 🌎    | continent   | No       |
| Tipo di Mercato      | 📊    | marketType  | No       |
| Valuta               | 💰    | currency    | No       |
| Settore              | 🏭    | sector      | No       |

**Click pattern:** Click the `<label>` element whose `innerText` includes the target text (e.g., "Paese").
Playwright selector: `#allocation-type-radio label:has-text("Paese")`

## Riassunto (Summary) Metrics

The summary tab shows these metrics in card layout (not individual IDs - extract via `get_page_text`):
- **Rendimento Annuale** (CAGR): e.g., "8.8%"
- **Volatilita**: e.g., "12.9%"
- **Sharpe Ratio**: e.g., "0.68"
- **Periodo Analisi**: e.g., "10/2003 - 01/2026"

## AI Analysis

| Component | ID | Type | Notes |
|-----------|-----|------|-------|
| AI run button | `ai-analysis-run-button` | BUTTON | |
| AI disclaimer check | `ai-analysis-disclaimer-check` | INPUT | |
| AI disclaimer accept | `ai-analysis-disclaimer-accept` | BUTTON | |
| AI disclaimer cancel | `ai-analysis-disclaimer-cancel` | BUTTON | |
| AI deep dive open | `ai-analysis-open-deep-dive` | BUTTON | |
| AI deep dive close | `ai-analysis-deep-dive-close` | BUTTON | |

## Benchmark & Correlazioni Result Tab

Only appears when a benchmark is configured. Verified 2026-02-26.

### Charts

| Component | ID | Type | Notes |
|-----------|-----|------|-------|
| **Correlation period selector** | **`correlation-period-radio`** | DIV (radio) | Options: Semestrale (6mo) / Annuale (12mo, default) / Biennale (24mo) / 5 Anni (60mo) / 10 Anni (120mo) |
| **Rolling correlation chart** | **`rolling-correlation-graph`** | DIV (Plotly) | "Correlazione Portafoglio vs Benchmark" — time series of rolling correlation |
| **Scatter regression chart** | **`linear-regression-scatter`** | DIV (Plotly) | "Rendimenti Portfolio vs Benchmark" — scatter with regression line, shows "Correlazione: X.XXX" annotation |
| **Matrix type radio** | **`matrix-type-radio`** | DIV (radio) | Toggle between "Correlazione tra gli Asset" (correlation matrix) and "Matrice di Sovrapposizione Holdings" (holdings overlap matrix). Inputs: `correlation` (default), `holdings` |
| **Correlation matrix chart** | **`correlation-matrix-chart`** | DIV (Plotly) | Heatmap of asset correlations (visible by default) |
| **Holdings info box** | **`holdings-info-box`** | DIV | "Clicca su una cella per vedere le holdings in comune" — appears in holdings matrix mode |
| **Common holdings chart** | **`holdings-common-bar-chart-1v1`** | DIV (Plotly) | "Dettaglio Holdings Comuni" — bar chart showing overlap counts. **Interactive**: only appears after clicking a cell in the holdings overlap matrix. Not auto-displayed. |

### Correlation Period Radio Options

Container: `#correlation-period-radio` (class: `andamento-pill-group`)
Structure: `<label><input type="radio">Text</label>` — same pattern as allocation-type-radio.

| Label (Italian) | Emoji | Months | Default? |
|-----------------|-------|--------|----------|
| Semestrale | 📅 | 6 | No |
| Annuale | 🗓️ | 12 | Yes |
| Biennale | 📆 | 24 | No |
| 5 Anni | | 60 | No |
| 10 Anni | | 120 | No |

**Click pattern:** Click the `<label>` element whose `innerText` includes the target text.

### Correlation Value Extraction

The correlation value is embedded in the scatter plot annotation text. Extract via:
```javascript
(async () => {
  const scatter = document.querySelector('#linear-regression-scatter');
  const text = scatter?.innerText || '';
  const match = text.match(/Correlazione:\s*([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
})()
```

### Benchmark Effects on Other Tabs

When a benchmark is configured, these existing sections gain comparative data:

- **Riassunto tab**: Portfolio value chart shows benchmark overlay line
- **Performance tab**: Rolling returns, yearly returns, and distribution charts show benchmark series
- **Rischio tab > Statistiche Simulazione Monte Carlo**: Adds "Portfolio" vs "Benchmark" subsections (worst/mean/best case values)
- **Rischio tab > Statistiche Drawdown**: Shows drawdown metrics for both portfolio and benchmark (Max DD, Avg DD, Max DD Duration, Ulcer Index)

These comparative stats have no individual element IDs — extract via `get_page_text` on the Rischio tab.

## Live Tracker (separate tab, different IDs)

| Component | ID | Type | Notes |
|-----------|-----|------|-------|
| Live tracker container | `live-tracker-container` | DIV | |
| Live ETF dropdown | `live-etf-dropdown` | DIV | |
| Transaction date picker | `transaction-date-picker` | DIV | |
| Purchase price input | `purchase-price-input` | INPUT | |
| Fees input | `fees-input` | INPUT | |
| Number of shares | `number-of-shares-input` | INPUT | |
| Transaction type radio | `transaction-type-radio` | DIV | Buy/Sell |
| Add transaction | `add-transaction-button` | BUTTON | |
| Upload portfolio modal | `open-portfolio-upload-modal` | BUTTON | |
| Export transactions | `export-transactions-button` | BUTTON | |
| Transactions table | `transactions-table` | DIV | |
| Update performance | `update-performance-button` | BUTTON | Live tracker update |
| Portfolio selector | `portfolio-selector-dropdown` | DIV | |
| Edit portfolio | `edit-portfolio-button` | BUTTON | |
| Standalone portfolio name | `standalone-portfolio-name` | INPUT | |
| Standalone add portfolio | `standalone-add-portfolio` | BUTTON | |

## Discovery Procedure

To verify or update these IDs at runtime:

```javascript
// Run via javascript_tool on backtes.to/backtester
// Wrap in async IIFE: (async () => { ... })()

// 1. Get all meaningful Dash component IDs
(async () => {
  const ids = Array.from(document.querySelectorAll('[id]'))
    .map(el => el.id)
    .filter(id => !id.startsWith('dark-reader') && !id.startsWith('claude-agent') &&
                  !id.startsWith('react-aria') && !id.startsWith('react-select') &&
                  !id.startsWith('clip') && !id.startsWith('{') &&
                  !id.startsWith('defs-') && !id.startsWith('topdefs-') &&
                  id.length > 2);
  return JSON.stringify(ids);
})()
```

```javascript
// 2. Find form-related elements with context
(async () => {
  const els = Array.from(document.querySelectorAll('[id]'))
    .filter(el => {
      const tag = el.tagName;
      const id = el.id;
      return (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT' ||
              id.includes('dropdown') || id.includes('input') || id.includes('button') ||
              id.includes('switch') || id.includes('table') || id.includes('etf'))
        && !id.startsWith('react-select') && !id.startsWith('react-aria');
    })
    .map(el => `${el.id} [${el.tagName}] ${(el.innerText || '').substring(0,40)}`);
  return els.join('\n');
})()
```

```javascript
// 3. Check login state (inside Account modal)
(async () => {
  const modal = document.querySelector('#login-modal');
  if (!modal) return 'Modal not open - click account-button first';
  const hasInputs = !!modal.querySelector('#username');
  const hasLogout = modal.innerText.includes('LOGOUT');
  return JSON.stringify({ loggedIn: hasLogout, hasLoginForm: hasInputs });
})()
```

**Last verified**: 2026-02-24 on live site.
