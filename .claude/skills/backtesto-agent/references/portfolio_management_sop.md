# Portfolio Management Contract

Standalone save/load operations for managing portfolios on backtes.to.
Requires authentication. Chrome-only (no Playwright fallback).

## Save Portfolio

Save the current backtester composition to the site.

1. **Auth guard** — verify logged in using the auth check from Step 2 of the Run Contract. If not logged in, authenticate first.

2. **Read current composition** — extract assets from the backtester table:
   ```
   Tool: javascript_tool
   Code: (async () => {
     const table = document.querySelector('#portfolio-table');
     if (!table) return { error: 'No portfolio table found' };
     const cells = Array.from(table.querySelectorAll('.dash-cell-value'));
     const texts = cells.map(c => c.textContent?.trim());
     const deduped = texts.filter((t, i) => i === 0 || t !== texts[i - 1]);
     const assets = [];
     for (let i = 0; i < deduped.length; i += 2) {
       const name = deduped[i];
       const weight = parseFloat(deduped[i + 1]);
       if (name && !isNaN(weight)) assets.push({ name, weight });
     }
     return { assets, total: assets.reduce((s, a) => s + a.weight, 0) };
   })()
   ```
   If no assets or total is 0, abort: "Nothing to save — add ETFs to the portfolio first."

3. **Generate default name** — build from top 3 assets by weight:
   - Resolve full ETF names to tickers via `references/asset_catalog_sample.md` or LLM knowledge
   - Format: `{TICKER1}-{TICKER2}-{TICKER3}-{W1}-{W2}-{W3}` (weights as rounded integers)
   - Examples: `VWCE-100`, `VWCE-AGGH-60-40`, `SWDA-EIMI-AGGH-50-30-20`
   - If fewer than 3 assets, use all of them

4. **Duplicate detection** — open Portafogli modal and check for existing duplicate:
   ```
   Tool: computer → click `show-portfolios-btn`
   Tool: computer → wait 2s
   Tool: computer → click `btn-user-portfolios` (ensure correct tab)
   Tool: javascript_tool → extract all portfolio cards (see dash_element_map.md card extraction snippet)
   ```
   Compare current composition against each saved portfolio:
   - Match if same ETFs (by name) with same weights (within 0.5% tolerance)
   - If exact match found: notify user "Overwriting existing portfolio '[name]'"
   - Delete the duplicate: click its `{"index": N, "type": "delete-portfolio"}` button, wait 2s
   - Close modal: click `close-portfolios-modal`
   - If no match: close modal and proceed

5. **Ask user for name** — present the auto-generated name:
   > "Saving portfolio as **VWCE-AGGH-60-40**. Want a different name? (proceeding with default otherwise)"

   If user provides a name, use it. Otherwise proceed with the default.

6. **Execute save**:
   ```
   Tool: computer → click `save-portfolio-button`
   Tool: computer → wait 1s
   Tool: computer → triple_click on `#portfolio-name-input` (select all existing text)
   Tool: computer → type [chosen portfolio name]
   Tool: computer → click `#confirm-save-portfolio`
   Tool: computer → wait 2s
   ```

7. **Verify** — confirm the portfolio was saved:
   ```
   Tool: computer → click `show-portfolios-btn`
   Tool: computer → wait 2s
   Tool: javascript_tool → extract portfolio card names, confirm new name appears
   Tool: computer → click `close-portfolios-modal`
   ```
   Report to user: "Portfolio '[name]' saved successfully."

## Load Portfolio

Load a saved portfolio into the backtester by name or description.

1. **Read portfolio list** — open the Portafogli modal and extract all saved portfolios:
   ```
   Tool: computer → click `show-portfolios-btn`
   Tool: computer → wait 2s
   Tool: computer → click `btn-user-portfolios` (ensure correct tab)
   Tool: javascript_tool → extract all portfolio cards (see dash_element_map.md card extraction snippet)
   ```

2. **Smart match** — match the user's request against the portfolio list:
   - **Exact name match** (case-insensitive): "load Andy 2026" → matches "Andy 2026"
   - **Partial name match**: "load Andy" → matches "Andy 2026", "Andy + Marco 2026"
   - **Composition match**: "load the one with VWCE" → matches portfolios containing VWCE
   - **If single match**: proceed to load
   - **If multiple matches**: list all candidates with index and composition, ask user to pick
   - **If no match**: report "No portfolio found matching '[query]'" and list all available portfolios

3. **Execute load** — click the matched portfolio's load button:
   ```
   Tool: javascript_tool
   Code: (async () => {
     const btn = document.querySelector(`button[id='{"index":${N},"type":"load-portfolio"}']`);
     if (btn) { btn.click(); return { clicked: true }; }
     return { error: 'Button not found' };
   })()
   Tool: computer → wait 2s
   ```

4. **Close modal**:
   ```
   Tool: computer → click `close-portfolios-modal`
   ```

5. **Verify** — confirm the backtester now has the loaded portfolio:
   ```
   Tool: javascript_tool → read portfolio-table contents (same as Save step 2)
   ```
   Report to user: "Loaded portfolio '[name]' — [N] assets, ready to backtest."
