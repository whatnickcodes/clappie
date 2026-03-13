'use strict';

/**
 * Basic markdown validity checks:
 * - No unclosed image syntax ![...
 * - No broken table rows (mismatched pipe counts within a table)
 */
function valid_markdown(content) {
  const errors = [];

  // Check for unclosed image references: ![... without closing ](...)
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Line has ![ but no matching ](...)
    if (/!\[[^\]]*$/.test(line) && !/!\[[^\]]*\]\([^)]*\)/.test(line)) {
      errors.push(`Line ${i + 1}: Unclosed image reference`);
    }
  }

  // Check table consistency: rows within a table should have same pipe count
  let inTable = false;
  let tablePipeCount = 0;
  let tableStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const isTableRow = trimmed.startsWith('|') && trimmed.endsWith('|');

    if (isTableRow) {
      const pipeCount = (trimmed.match(/\|/g) || []).length;
      if (!inTable) {
        inTable = true;
        tablePipeCount = pipeCount;
        tableStartLine = i + 1;
      } else if (pipeCount !== tablePipeCount) {
        // Allow separator rows to differ slightly
        if (!/^\|[\s-:|]+\|$/.test(trimmed)) {
          errors.push(`Line ${i + 1}: Table pipe count ${pipeCount} != ${tablePipeCount} (table started at line ${tableStartLine})`);
        }
      }
    } else {
      inTable = false;
    }
  }

  if (errors.length === 0) {
    return { pass: true, message: 'Markdown syntax OK' };
  }

  return { pass: false, message: errors.join('; ') };
}

/**
 * Check for footer: horizontal rule (---) followed by signature text.
 */
function has_footer(content, params) {
  const pattern = params.pattern || 'backtesto-agent';

  // Look for --- followed (within a few lines) by the pattern
  const lines = content.split('\n');
  let foundSeparator = false;

  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
    const trimmed = lines[i].trim();
    if (trimmed.toLowerCase().includes(pattern.toLowerCase())) {
      // Check for --- within previous 3 lines
      for (let j = Math.max(0, i - 3); j < i; j++) {
        if (lines[j].trim() === '---') {
          foundSeparator = true;
          break;
        }
      }
      if (foundSeparator) {
        return { pass: true, message: 'Footer with separator found' };
      }
      return { pass: false, message: `Found "${pattern}" but no --- separator above it` };
    }
  }

  return { pass: false, message: `Footer pattern "${pattern}" not found in last 10 lines` };
}

module.exports = { valid_markdown, has_footer };
