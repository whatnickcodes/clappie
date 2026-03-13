'use strict';

const fs = require('fs');
const path = require('path');
const { extractSection, extractImageRefs, pngDimensions } = require('./utils');

/**
 * Check that a section contains at least one image reference
 * and the referenced file exists (with optional size/dimension checks).
 *
 * If `section` is provided, scope image search to that section.
 * If `pattern` is provided (glob-like), match against image filenames.
 */
function image_exists(content, params, reportDir) {
  let searchContent = content;

  if (params.section) {
    const section = extractSection(content, params.section);
    if (!section) {
      return { pass: false, message: `Section "${params.section}" not found` };
    }
    searchContent = section;
  }

  let refs = extractImageRefs(searchContent);

  if (params.pattern) {
    const globToRegex = params.pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(globToRegex, 'i');
    refs = refs.filter(ref => regex.test(ref.src));
  }

  if (refs.length === 0) {
    const scope = params.section ? ` in "${params.section}"` : '';
    const filter = params.pattern ? ` matching "${params.pattern}"` : '';
    return { pass: false, message: `No image references found${scope}${filter}` };
  }

  // Check that at least one referenced image file exists
  const errors = [];
  let anyFound = false;

  for (const ref of refs) {
    const imgPath = path.resolve(reportDir, ref.src);
    if (!fs.existsSync(imgPath)) {
      errors.push(`Missing: ${ref.src}`);
      continue;
    }

    anyFound = true;
    const stats = fs.statSync(imgPath);

    if (params.minSizeKB && stats.size < params.minSizeKB * 1024) {
      errors.push(`${ref.src}: ${(stats.size / 1024).toFixed(1)} KB < ${params.minSizeKB} KB min`);
      continue;
    }

    if ((params.minWidth || params.minHeight) && imgPath.endsWith('.png')) {
      const dims = pngDimensions(imgPath);
      if (dims) {
        if (params.minWidth && dims.width < params.minWidth) {
          errors.push(`${ref.src}: width ${dims.width} < ${params.minWidth}`);
        }
        if (params.minHeight && dims.height < params.minHeight) {
          errors.push(`${ref.src}: height ${dims.height} < ${params.minHeight}`);
        }
      }
    }
  }

  if (!anyFound) {
    return { pass: false, message: `All referenced images missing: ${errors.join('; ')}` };
  }

  if (errors.length > 0) {
    return { pass: false, message: errors.join('; ') };
  }

  return { pass: true, message: `${refs.length} image(s) OK` };
}

/**
 * Check that every ![...](images/...) reference in the report resolves to a real file.
 */
function all_referenced_images_exist(content, params, reportDir) {
  const refs = extractImageRefs(content);

  if (refs.length === 0) {
    return { pass: true, message: 'No image references to check' };
  }

  const missing = [];
  for (const ref of refs) {
    const imgPath = path.resolve(reportDir, ref.src);
    if (!fs.existsSync(imgPath)) {
      missing.push(ref.src);
    }
  }

  if (missing.length === 0) {
    return { pass: true, message: `All ${refs.length} images exist` };
  }

  return {
    pass: false,
    message: `${missing.length}/${refs.length} images missing: ${missing.join(', ')}`
  };
}

module.exports = { image_exists, all_referenced_images_exist };
