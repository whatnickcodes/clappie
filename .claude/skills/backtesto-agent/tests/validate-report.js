#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// Check modules
const sectionChecks = require('./checks/section');
const tableChecks = require('./checks/table');
const metricChecks = require('./checks/metric');
const imageChecks = require('./checks/image');
const markdownChecks = require('./checks/markdown');

// Registry: check type -> { module, fn }
const CHECK_REGISTRY = {
  section_exists: sectionChecks.section_exists,
  has_bullet_fields: sectionChecks.has_bullet_fields,
  table_has_columns: tableChecks.table_has_columns,
  table_min_rows: tableChecks.table_min_rows,
  table_has_emoji: tableChecks.table_has_emoji,
  metric_exists: metricChecks.metric_exists,
  metric_in_range: metricChecks.metric_in_range,
  image_exists: imageChecks.image_exists,
  all_referenced_images_exist: imageChecks.all_referenced_images_exist,
  valid_markdown: markdownChecks.valid_markdown,
  has_footer: markdownChecks.has_footer,
  manifest_covers_sections: sectionChecks.manifest_covers_sections
};

function usage() {
  console.error(`Usage: node validate-report.js <report.md> [options]

Options:
  --manifest <path>     Custom manifest file (default: test-manifest.json)
  --images-dir <path>   Images directory (default: same dir as report)
  --extra-checks <json> Additional checks as JSON string`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0) usage();

  const opts = {
    reportPath: null,
    manifestPath: path.join(__dirname, 'test-manifest.json'),
    imagesDir: null,
    extraChecks: null
  };

  let i = 0;
  while (i < args.length) {
    if (args[i] === '--manifest' && args[i + 1]) {
      opts.manifestPath = args[++i];
    } else if (args[i] === '--images-dir' && args[i + 1]) {
      opts.imagesDir = args[++i];
    } else if (args[i] === '--extra-checks' && args[i + 1]) {
      opts.extraChecks = JSON.parse(args[++i]);
    } else if (!args[i].startsWith('--')) {
      opts.reportPath = args[i];
    }
    i++;
  }

  if (!opts.reportPath) usage();
  return opts;
}

/**
 * Detect if the report has a benchmark section.
 */
function detectBenchmark(content) {
  return /^##\s+Benchmark/m.test(content);
}

function runValidator(opts) {
  const startTime = Date.now();

  // Read report
  const reportPath = path.resolve(opts.reportPath);
  if (!fs.existsSync(reportPath)) {
    console.error(`Error: Report not found: ${reportPath}`);
    process.exit(2);
  }
  const content = fs.readFileSync(reportPath, 'utf-8');
  const reportDir = opts.imagesDir
    ? path.resolve(opts.imagesDir)
    : path.dirname(reportPath);

  // Read manifest
  const manifestPath = path.resolve(opts.manifestPath);
  if (!fs.existsSync(manifestPath)) {
    console.error(`Error: Manifest not found: ${manifestPath}`);
    process.exit(2);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  // Merge extra checks
  let checks = [...manifest.checks];
  if (opts.extraChecks) {
    checks = checks.concat(opts.extraChecks);
  }

  const hasBenchmark = detectBenchmark(content);
  const results = [];

  for (const entry of checks) {
    // Skip benchmark-only checks when no benchmark
    if (entry.when_benchmark && !hasBenchmark) {
      continue;
    }

    const checkFn = CHECK_REGISTRY[entry.check];
    if (!checkFn) {
      results.push({
        id: entry.id,
        status: 'FAIL',
        message: `Unknown check type: ${entry.check}`
      });
      continue;
    }

    try {
      // Inject full manifest so introspection checks can see all entries
      const params = { ...entry, _allChecks: checks };

      // Image checks get reportDir as third argument
      let result;
      if (entry.check === 'image_exists' || entry.check === 'all_referenced_images_exist') {
        result = checkFn(content, params, reportDir);
      } else {
        result = checkFn(content, params);
      }

      results.push({
        id: entry.id,
        status: result.pass ? 'PASS' : (entry.required ? 'FAIL' : 'WARN'),
        message: result.message
      });
    } catch (err) {
      results.push({
        id: entry.id,
        status: entry.required ? 'FAIL' : 'WARN',
        message: `Error: ${err.message}`
      });
    }
  }

  const duration = Date.now() - startTime;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  const overallStatus = failed === 0 ? 'PASS' : 'FAIL';

  const output = {
    status: overallStatus,
    report: path.basename(reportPath),
    benchmark_detected: hasBenchmark,
    summary: {
      total: results.length,
      passed,
      failed,
      warned
    },
    checks: results,
    duration_ms: duration
  };

  console.log(JSON.stringify(output, null, 2));
  process.exit(overallStatus === 'PASS' ? 0 : 1);
}

runValidator(parseArgs(process.argv));
