'use strict';

const { extractSection, extractTable } = require('./utils');

/**
 * Check that a named metric row exists in a section's table.
 * Matches metric name as case-insensitive substring of the first column.
 */
function metric_exists(content, params) {
  const section = extractSection(content, params.section);
  if (!section) {
    return { pass: false, message: `Section "${params.section}" not found` };
  }

  const table = extractTable(section);
  if (!table) {
    return { pass: false, message: `No table found in section "${params.section}"` };
  }

  const needle = params.metric.toLowerCase();
  const found = table.rows.some(row =>
    row[0] && row[0].toLowerCase().includes(needle)
  );

  if (found) {
    return { pass: true, message: `Metric "${params.metric}" found` };
  }
  return { pass: false, message: `Metric "${params.metric}" not found in "${params.section}"` };
}

/**
 * Check that a metric value falls within [min, max] range.
 * Parses numeric value from the second column (strips %, years, etc.).
 */
function metric_in_range(content, params) {
  const section = extractSection(content, params.section);
  if (!section) {
    return { pass: false, message: `Section "${params.section}" not found` };
  }

  const table = extractTable(section);
  if (!table) {
    return { pass: false, message: `No table found in section "${params.section}"` };
  }

  const needle = params.metric.toLowerCase();
  const row = table.rows.find(r =>
    r[0] && r[0].toLowerCase().includes(needle)
  );

  if (!row) {
    return { pass: false, message: `Metric "${params.metric}" not found` };
  }

  const rawValue = row[1] || '';
  const numMatch = rawValue.match(/-?[\d.]+/);
  if (!numMatch) {
    return { pass: false, message: `Cannot parse numeric value from "${rawValue}"` };
  }

  const value = parseFloat(numMatch[0]);
  const min = params.min != null ? params.min : -Infinity;
  const max = params.max != null ? params.max : Infinity;

  if (value >= min && value <= max) {
    return {
      pass: true,
      message: `${params.metric} = ${value} (within [${min}, ${max}])`
    };
  }
  return {
    pass: false,
    message: `${params.metric} = ${value} (outside [${min}, ${max}])`
  };
}

module.exports = { metric_exists, metric_in_range };
