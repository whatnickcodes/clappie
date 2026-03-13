'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Extract content under a markdown heading.
 * Finds the first heading matching `sectionName` (case-insensitive substring)
 * and returns content until the next heading of same or higher level.
 */
function extractSection(content, sectionName) {
  const lines = content.split('\n');
  let startIdx = -1;
  let headingLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match && match[2].toLowerCase().includes(sectionName.toLowerCase())) {
      startIdx = i;
      headingLevel = match[1].length;
      break;
    }
  }

  if (startIdx === -1) return null;

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= headingLevel) {
      endIdx = i;
      break;
    }
  }

  return lines.slice(startIdx, endIdx).join('\n');
}

/**
 * Extract the first markdown table from content.
 * Returns { headers: string[], rows: string[][] } or null.
 */
function extractTable(content) {
  if (!content) return null;

  const lines = content.split('\n');
  let tableStart = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
      tableStart = i;
      break;
    }
  }

  if (tableStart === -1) return null;

  // Header row
  const headerLine = lines[tableStart].trim();
  const headers = headerLine
    .split('|')
    .map(h => h.trim())
    .filter(h => h.length > 0);

  // Skip separator row (|---|---|)
  let dataStart = tableStart + 1;
  if (dataStart < lines.length && /^\|[\s-:|]+\|$/.test(lines[dataStart].trim())) {
    dataStart++;
  }

  // Data rows
  const rows = [];
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|') || !line.endsWith('|')) break;
    const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
    rows.push(cells);
  }

  return { headers, rows };
}

/**
 * Extract all image references from markdown content.
 * Returns array of { alt, src } objects.
 */
function extractImageRefs(content) {
  const refs = [];
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    refs.push({ alt: match[1], src: match[2] });
  }
  return refs;
}

/**
 * Read PNG dimensions from IHDR chunk (first 24 bytes).
 * Returns { width, height } or null on error.
 */
function pngDimensions(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(24);
    fs.readSync(fd, buf, 0, 24, 0);
    fs.closeSync(fd);

    // Verify PNG signature
    const sig = buf.slice(0, 8);
    if (sig[0] !== 0x89 || sig[1] !== 0x50 || sig[2] !== 0x4E || sig[3] !== 0x47) {
      return null;
    }

    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20)
    };
  } catch {
    return null;
  }
}

module.exports = {
  extractSection,
  extractTable,
  extractImageRefs,
  pngDimensions
};
