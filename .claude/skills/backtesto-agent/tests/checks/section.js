'use strict';

const { extractSection } = require('./utils');

/**
 * Check that a regex pattern exists somewhere in the report content.
 * Uses multiline mode so ^ matches line starts.
 */
function section_exists(content, params) {
  const regex = new RegExp(params.pattern, 'm');
  if (regex.test(content)) {
    return { pass: true, message: `Pattern found: ${params.pattern}` };
  }
  return { pass: false, message: `Pattern not found: ${params.pattern}` };
}

/**
 * Check that a section contains bullet items with specified bold field names.
 * Looks for lines matching: - **FieldName**: ...
 */
function has_bullet_fields(content, params) {
  const section = extractSection(content, params.section);
  if (!section) {
    return { pass: false, message: `Section "${params.section}" not found` };
  }

  const missing = [];
  for (const field of params.fields) {
    const regex = new RegExp(`-\\s+\\*\\*${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*:`, 'i');
    if (!regex.test(section)) {
      missing.push(field);
    }
  }

  if (missing.length === 0) {
    return { pass: true, message: `All ${params.fields.length} fields present` };
  }
  return { pass: false, message: `Missing fields: ${missing.join(', ')}` };
}

/**
 * Check that all report headings (## and ###) are covered by at least one
 * manifest entry. Receives the full manifest via params._allChecks.
 * params.ignore — array of heading texts to skip.
 */
function manifest_covers_sections(content, params) {
  // Extract all ## and ### headings from the report
  const headings = [];
  for (const line of content.split('\n')) {
    const m = line.match(/^(#{2,3})\s+(.+)/);
    if (m) headings.push(m[2].trim());
  }

  // Build covered set from manifest entries that reference sections
  const covered = new Set();
  const allChecks = params._allChecks || [];
  for (const entry of allChecks) {
    // section param directly names a heading
    if (entry.section) covered.add(entry.section.toLowerCase());
    // pattern like "^## Portfolio Allocation" names a heading
    if (entry.pattern) {
      const pm = entry.pattern.match(/^(?:\^)?#{1,6}\s+(.+)/);
      if (pm) covered.add(pm[1].replace(/\\s\+/g, ' ').toLowerCase());
    }
  }

  // Known headings to skip (not feature sections)
  const ignore = (params.ignore || []).map(s => s.toLowerCase());

  const uncovered = headings.filter(h => {
    const lower = h.toLowerCase();
    if (ignore.includes(lower)) return false;
    if (covered.has(lower)) return false;
    // Substring match: "Performance Comparison" covered by section:"Performance Comparison"
    for (const c of covered) {
      if (lower.includes(c) || c.includes(lower)) return false;
    }
    return true;
  });

  if (uncovered.length === 0) {
    return { pass: true, message: `All ${headings.length} sections covered by manifest` };
  }
  return {
    pass: false,
    message: `${uncovered.length} section(s) not covered by manifest checks: ${uncovered.join(', ')}`
  };
}

module.exports = { section_exists, has_bullet_fields, manifest_covers_sections };
