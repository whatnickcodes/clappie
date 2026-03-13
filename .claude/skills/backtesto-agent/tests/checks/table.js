'use strict';

const { extractSection, extractTable } = require('./utils');

/**
 * Check that a table under a section heading has required columns and min rows.
 * Column matching is case-insensitive substring (e.g. "Weight" matches "Scaled Weight").
 */
function table_has_columns(content, params) {
  const section = extractSection(content, params.section);
  if (!section) {
    return { pass: false, message: `Section "${params.section}" not found` };
  }

  const table = extractTable(section);
  if (!table) {
    return { pass: false, message: `No table found in section "${params.section}"` };
  }

  const missingCols = [];
  for (const col of params.columns) {
    const found = table.headers.some(h =>
      h.toLowerCase().includes(col.toLowerCase())
    );
    if (!found) {
      missingCols.push(col);
    }
  }

  if (missingCols.length > 0) {
    return {
      pass: false,
      message: `Missing columns in "${params.section}": ${missingCols.join(', ')} (found: ${table.headers.join(', ')})`
    };
  }

  const minRows = params.minRows || 1;
  if (table.rows.length < minRows) {
    return {
      pass: false,
      message: `Table in "${params.section}" has ${table.rows.length} rows, need at least ${minRows}`
    };
  }

  return {
    pass: true,
    message: `Table OK: ${table.headers.length} columns, ${table.rows.length} rows`
  };
}

/**
 * Check that a table in a section has at least N rows.
 */
function table_min_rows(content, params) {
  const section = extractSection(content, params.section);
  if (!section) {
    return { pass: false, message: `Section "${params.section}" not found` };
  }

  const table = extractTable(section);
  if (!table) {
    return { pass: false, message: `No table found in section "${params.section}"` };
  }

  const minRows = params.minRows || 1;
  if (table.rows.length < minRows) {
    return {
      pass: false,
      message: `Table has ${table.rows.length} rows, need at least ${minRows}`
    };
  }

  return { pass: true, message: `Table has ${table.rows.length} rows` };
}

/**
 * Check that the first column of a table in a section contains emoji characters.
 */
function table_has_emoji(content, params) {
  const section = extractSection(content, params.section);
  if (!section) {
    return { pass: false, message: `Section "${params.section}" not found` };
  }

  const table = extractTable(section);
  if (!table) {
    return { pass: false, message: `No table found in section "${params.section}"` };
  }

  if (table.rows.length === 0) {
    return { pass: false, message: `Table in "${params.section}" has no data rows` };
  }

  // Check first column cells for emoji characters
  const emojiRegex = /[\u{1F1E0}-\u{1F9FF}\u{2600}-\u{27BF}\u{1FA00}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/u;
  let emojiCount = 0;

  for (const row of table.rows) {
    if (row[0] && emojiRegex.test(row[0])) {
      emojiCount++;
    }
  }

  if (emojiCount === 0) {
    return {
      pass: false,
      message: `No emoji found in first column of "${params.section}" table`
    };
  }

  const ratio = emojiCount / table.rows.length;
  if (ratio < 0.5) {
    return {
      pass: false,
      message: `Only ${emojiCount}/${table.rows.length} rows have emoji in "${params.section}"`
    };
  }

  return {
    pass: true,
    message: `${emojiCount}/${table.rows.length} rows have emoji`
  };
}

module.exports = { table_has_columns, table_min_rows, table_has_emoji };
