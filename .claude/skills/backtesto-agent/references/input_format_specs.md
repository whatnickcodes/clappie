# Input Format Specifications

How to parse portfolio inputs from various formats into canonical JSON.

## Canonical Portfolio JSON Schema

```json
{
  "assets": [
    {
      "identifier": "string",
      "type": "isin | ticker | name",
      "name": "string (display name)",
      "weight": "number (0-100)"
    }
  ],
  "settings": {
    "startYear": "number | null",
    "endYear": "number | null",
    "initialInvestment": "number (default: 10000)",
    "recurringAmount": "number (default: 0)",
    "frequency": "monthly | quarterly | yearly (default: monthly)",
    "rebalancing": "no_rebalancing | monthly | quarterly | yearly (default: no_rebalancing)"
  }
}
```

## Format Detection Cascade

1. **Check if file path**: Does the input contain a path to an existing file?
   - `.xlsx` / `.xls` -> Excel parser
   - `.csv` / `.tsv` -> CSV parser
   - `.json` -> Direct JSON parse
   - `.txt` -> Text parser
2. **Check for structured text**: Does input match `\d+%?\s*[-:]?\s*[A-Z0-9]+` pattern?
3. **Fallback**: Treat as natural language, extract via LLM

## Excel Parsing (.xlsx / .xls)

Use `xlsx` npm package. Column detection is flexible and case-insensitive.

**Recognized column names:**

| Purpose | Accepted names |
|---------|---------------|
| Asset identifier | `isin`, `ticker`, `symbol`, `code`, `etf`, `fund`, `asset`, `nome`, `name` |
| Weight/allocation | `weight`, `allocation`, `%`, `percentage`, `percent`, `peso`, `allocazione` |
| Name (optional) | `name`, `description`, `nome`, `descrizione` |

**Detection logic:**
1. Read first sheet (or sheet named "Portfolio" / "Portafoglio" if exists)
2. Find header row (first row with 2+ recognized column names)
3. Map columns to purpose
4. Read data rows, skip empty rows
5. If weights are decimals (0-1 range), multiply by 100
6. Validate weights sum to ~100 (tolerance: +/- 1)

## CSV Parsing (.csv / .tsv)

**Delimiter auto-detection:**
1. Count occurrences of `,`, `;`, `\t`, `|` in first 5 lines
2. Pick delimiter with highest consistent count
3. If file extension is `.tsv`, force tab delimiter

Parse like Excel after delimiter detection.

## Structured Text Patterns

Match these patterns (case-insensitive):

```
# Pattern 1: "XX% TICKER"
60% VWCE, 40% AGGH
60% VWCE / 40% AGGH
60% VWCE + 40% AGGH

# Pattern 2: "TICKER XX%"
VWCE 60%, AGGH 40%

# Pattern 3: "XX% ISIN"
60% IE00BK5BQT80, 40% IE00BG47KH54

# Pattern 4: With names
60% VWCE (Vanguard FTSE All-World), 40% AGGH (iShares Core Global Aggregate Bond)

# Pattern 5: Ratio notation
VWCE/AGGH 60/40
60/40 VWCE/AGGH
```

**Regex patterns:**
```
/(\d+(?:\.\d+)?)\s*%?\s*[-:]?\s*([A-Z0-9]{2,12})/g     # XX% TICKER
/([A-Z0-9]{2,12})\s*[-:]?\s*(\d+(?:\.\d+)?)\s*%/g       # TICKER XX%
/([A-Z]{2}[A-Z0-9]{10})/g                                 # ISIN extraction
```

## Natural Language Parsing

For inputs like:
- "I want sixty percent world stocks and forty percent bonds"
- "backtest a portfolio with mostly VWCE and some AGGH"
- "put 10k into VWCE"

Extract:
1. Asset references (resolve names to tickers/ISINs)
2. Allocation percentages (if vague like "mostly/some", ask user to clarify)
3. Investment amounts and settings

## Identifier Resolution

Priority order for matching on backtes.to:

1. **ISIN** (e.g., `IE00BK5BQT80`) - Best: exact match in dropdown
2. **Ticker** (e.g., `VWCE`) - Good: search in dropdown, usually unique
3. **Name** (e.g., "Vanguard FTSE All-World") - Risky: may have multiple matches

Use `references/asset_catalog_sample.md` to pre-resolve tickers to ISINs before
searching on the site.

## Validation Rules

1. **Weights must sum to 100** (tolerance: +/- 0.5)
   - If sum < 99.5: ask user about remaining allocation
   - If sum > 100.5: ask user to correct
   - If within tolerance: normalize to exactly 100
2. **Minimum 1 asset, maximum 10 assets** (site limitation)
3. **Each weight must be > 0 and <= 100**
4. **Identifiers must be non-empty strings**
