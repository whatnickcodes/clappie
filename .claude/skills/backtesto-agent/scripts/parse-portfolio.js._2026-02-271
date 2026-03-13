#!/usr/bin/env node
/**
 * parse-portfolio.js
 *
 * Parses portfolio input from Excel, CSV, or text into canonical JSON.
 * Usage:
 *   node parse-portfolio.js <file>        # parse file
 *   echo "60% VWCE, 40% AGGH" | node parse-portfolio.js  # parse stdin
 */

const fs = require('fs');
const path = require('path');

// Lazy-load heavy deps only when needed
let XLSX, csvParse;

// Asset catalog for ticker -> ISIN resolution
const ASSET_CATALOG = {
  VWCE: 'IE00BK5BQT80', SWDA: 'IE00B4L5Y983', IWDA: 'IE00B4L5Y983',
  VWRL: 'IE00B3RBWM25', IMIE: 'IE00BKM4GZ66', EIMI: 'IE00BKM4GZ66',
  CSSPX: 'IE00B5BMR087', SXR8: 'IE00B5BMR087', VUAA: 'IE00BFMXXD54',
  VUSA: 'IE00B3XXRP09', EQQQ: 'IE0032077012', QQQ3: 'IE00BFZXGZ54',
  AGGH: 'IE00BG47KH54', VAGF: 'IE00BG47KB92', EUNA: 'IE00B3F81409',
  SGLD: 'JE00B588CD74', PHAU: 'JE00B1VS3770',
  V60A: 'IE00BMVB5P51', V80A: 'IE00BMVB5R75',
  IUSN: 'IE00BF4RFH31', WSML: 'IE00BF4RFH31',
  SMEA: 'IE00B4K48X80', SEGA: 'IE00B4WXJJ64',
  IEAC: 'IE00B3F81R35', VECP: 'IE00BZ163G84',
};

function resolveIdentifier(raw) {
  const trimmed = raw.trim().toUpperCase();
  // ISIN pattern: 2 letters + 10 alphanumeric
  if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(trimmed)) {
    return { identifier: trimmed, type: 'isin', name: trimmed };
  }
  // Ticker lookup
  if (ASSET_CATALOG[trimmed]) {
    return { identifier: ASSET_CATALOG[trimmed], type: 'isin', name: trimmed };
  }
  // Unknown ticker - pass through
  return { identifier: trimmed, type: 'ticker', name: trimmed };
}

function parseStructuredText(text) {
  const assets = [];

  // Pattern 1: "XX% TICKER" or "XX TICKER"
  const p1 = /(\d+(?:\.\d+)?)\s*%?\s*[-:\/]?\s*([A-Z0-9]{2,12})/gi;
  // Pattern 2: "TICKER XX%"
  const p2 = /([A-Z][A-Z0-9]{1,11})\s*[-:\/]?\s*(\d+(?:\.\d+)?)\s*%/gi;

  let matches = [...text.matchAll(p1)];
  if (matches.length > 0) {
    for (const m of matches) {
      const resolved = resolveIdentifier(m[2]);
      assets.push({ ...resolved, weight: parseFloat(m[1]) });
    }
  } else {
    matches = [...text.matchAll(p2)];
    for (const m of matches) {
      const resolved = resolveIdentifier(m[1]);
      assets.push({ ...resolved, weight: parseFloat(m[2]) });
    }
  }

  return assets.length > 0 ? assets : null;
}

async function parseExcel(filePath) {
  if (!XLSX) XLSX = require('xlsx');
  const workbook = XLSX.readFile(filePath);

  // Prefer sheet named Portfolio/Portafoglio, else first sheet
  let sheetName = workbook.SheetNames.find(n =>
    /portfolio|portafoglio/i.test(n)
  ) || workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (rows.length === 0) throw new Error('Empty spreadsheet');

  // Find columns
  const headers = Object.keys(rows[0]);
  const idCol = headers.find(h =>
    /^(isin|ticker|symbol|code|etf|fund|asset|nome|name)$/i.test(h.trim())
  );
  const weightCol = headers.find(h =>
    /^(weight|allocation|%|percentage|percent|peso|allocazione)$/i.test(h.trim())
  );

  if (!idCol || !weightCol) {
    throw new Error(`Cannot find required columns. Found: ${headers.join(', ')}`);
  }

  const assets = [];
  for (const row of rows) {
    const rawId = String(row[idCol]).trim();
    let weight = parseFloat(row[weightCol]);
    if (!rawId || isNaN(weight)) continue;

    // Detect decimal format (0.6 vs 60)
    if (weight > 0 && weight <= 1 && rows.every(r => parseFloat(r[weightCol]) <= 1)) {
      weight *= 100;
    }

    const resolved = resolveIdentifier(rawId);
    const nameCol = headers.find(h => /^(name|description|nome|descrizione)$/i.test(h.trim()));
    if (nameCol && row[nameCol]) resolved.name = row[nameCol];

    assets.push({ ...resolved, weight });
  }

  return assets;
}

async function parseCsv(filePath) {
  if (!csvParse) csvParse = require('csv-parse/sync');

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').slice(0, 5).join('\n');

  // Auto-detect delimiter
  const delimiters = [',', ';', '\t', '|'];
  const counts = delimiters.map(d => (lines.match(new RegExp('\\' + d, 'g')) || []).length);
  const delimiter = delimiters[counts.indexOf(Math.max(...counts))];

  const records = csvParse.parse(content, {
    delimiter,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  // Reuse Excel column detection logic
  if (records.length === 0) throw new Error('Empty CSV');

  const headers = Object.keys(records[0]);
  const idCol = headers.find(h =>
    /^(isin|ticker|symbol|code|etf|fund|asset|nome|name)$/i.test(h.trim())
  );
  const weightCol = headers.find(h =>
    /^(weight|allocation|%|percentage|percent|peso|allocazione)$/i.test(h.trim())
  );

  if (!idCol || !weightCol) {
    throw new Error(`Cannot find required columns. Found: ${headers.join(', ')}`);
  }

  const assets = [];
  for (const row of records) {
    const rawId = String(row[idCol]).trim();
    let weight = parseFloat(row[weightCol]);
    if (!rawId || isNaN(weight)) continue;

    if (weight > 0 && weight <= 1 && records.every(r => parseFloat(r[weightCol]) <= 1)) {
      weight *= 100;
    }

    const resolved = resolveIdentifier(rawId);
    assets.push({ ...resolved, weight });
  }

  return assets;
}

function validate(assets) {
  if (!assets || assets.length === 0) {
    throw new Error('No assets found in input');
  }
  if (assets.length > 10) {
    throw new Error(`Too many assets (${assets.length}). Maximum is 10.`);
  }

  const sum = assets.reduce((s, a) => s + a.weight, 0);
  if (sum < 99.5 || sum > 100.5) {
    throw new Error(`Weights sum to ${sum.toFixed(1)}%, expected ~100%`);
  }

  // Normalize to exactly 100
  const factor = 100 / sum;
  for (const a of assets) {
    a.weight = Math.round(a.weight * factor * 100) / 100;
  }

  return assets;
}

async function main() {
  let input;
  const filePath = process.argv[2];

  if (filePath) {
    const ext = path.extname(filePath).toLowerCase();
    let assets;

    if (ext === '.xlsx' || ext === '.xls') {
      assets = await parseExcel(filePath);
    } else if (ext === '.csv' || ext === '.tsv') {
      assets = await parseCsv(filePath);
    } else if (ext === '.json') {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (data.assets) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      throw new Error('JSON file missing "assets" array');
    } else {
      // Treat as text file
      input = fs.readFileSync(filePath, 'utf-8');
      assets = parseStructuredText(input);
    }

    if (!assets) throw new Error('Could not parse portfolio from file');
    const validated = validate(assets);

    const result = {
      assets: validated,
      settings: {
        startYear: null,
        endYear: null,
        initialInvestment: 10000,
        recurringAmount: 0,
        frequency: 'monthly',
        rebalancing: 'no_rebalancing',
      },
    };
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Read from stdin
    const chunks = [];
    process.stdin.setEncoding('utf-8');
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    input = chunks.join('');

    const assets = parseStructuredText(input);
    if (!assets) throw new Error('Could not parse portfolio from text input');
    const validated = validate(assets);

    const result = {
      assets: validated,
      settings: {
        startYear: null,
        endYear: null,
        initialInvestment: 10000,
        recurringAmount: 0,
        frequency: 'monthly',
        rebalancing: 'no_rebalancing',
      },
    };
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
