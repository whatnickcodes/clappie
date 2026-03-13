#!/usr/bin/env node
/**
 * generate-report.js
 *
 * Generates a Markdown backtest report from results JSON.
 *
 * Usage:
 *   node generate-report.js results.json
 *   echo '{"status":"success",...}' | node generate-report.js
 *
 * Output: writes to docs/reports/[name]-[date].md and prints the path
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.resolve(__dirname, '../../docs/reports');

async function readResults() {
  const filePath = process.argv[2];
  if (filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  const chunks = [];
  process.stdin.setEncoding('utf-8');
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return JSON.parse(chunks.join(''));
}

function formatMetricValue(key, value) {
  if (!value) return 'N/A';
  const v = String(value).replace(',', '.');
  if (key === 'sharpe') return v;
  return `${v}%`;
}

const COMPOSITION_LABELS = {
  country:    'Country',
  continent:  'Continent',
  marketType: 'Market Type',
  currency:   'Currency',
  sector:     'Sector',
};

function renderCompositionTables(compositionData, screenshots) {
  if (!compositionData) return [];
  const lines = [];
  lines.push('## Portfolio Composition');
  lines.push('');

  for (const [key, title] of Object.entries(COMPOSITION_LABELS)) {
    const rows = compositionData[key];
    if (!rows || rows.length === 0) continue;
    lines.push(`### ${title}`);

    // Embed chart image if available
    const imgPath = screenshots && screenshots[`composition_${key}`];
    if (imgPath) {
      const relPath = path.relative(REPORTS_DIR, imgPath);
      lines.push(`![${title}](${relPath})`);
      lines.push('');
    }

    lines.push('| Category | Weight |');
    lines.push('|----------|--------|');
    for (const row of rows) {
      lines.push(`| ${row.label} | ${row.percentage}% |`);
    }
    lines.push('');
  }
  return lines;
}

function generateMarkdown(results) {
  const { portfolio, metrics, screenshots, settings, timestamp } = results;
  const date = timestamp || new Date().toISOString().split('T')[0];
  const portfolioName = portfolio.map(a =>
    `${Math.round(a.weight)}% ${a.name}`
  ).join(' / ');

  const lines = [];

  lines.push(`# Backtest Report: ${portfolioName}`);
  lines.push('');
  lines.push(`**Date**: ${date}`);
  lines.push('');
  lines.push(`**Source**: backtes.to`);
  lines.push('');

  // Portfolio Allocation
  lines.push('## Portfolio Allocation');
  lines.push('| Asset | Identifier | Weight |');
  lines.push('|-------|-----------|--------|');
  for (const a of portfolio) {
    lines.push(`| ${a.name} | ${a.identifier} | ${a.weight}% |`);
  }
  lines.push('');

  // Settings
  if (settings) {
    lines.push('## Settings');
    if (settings.startYear && settings.endYear) {
      lines.push(`- **Period**: ${settings.startYear} - ${settings.endYear}`);
    }
    if (settings.initialInvestment) {
      lines.push(`- **Initial investment**: EUR ${Number(settings.initialInvestment).toLocaleString('it-IT')}`);
    }
    if (settings.recurringAmount) {
      lines.push(`- **Recurring**: EUR ${Number(settings.recurringAmount).toLocaleString('it-IT')}/${settings.frequency || 'monthly'}`);
    }
    if (settings.rebalancing && settings.rebalancing !== 'no_rebalancing') {
      lines.push(`- **Rebalancing**: ${settings.rebalancing}`);
    }
    lines.push('');
  }

  // Performance Summary
  if (metrics && Object.keys(metrics).length > 0) {
    lines.push('## Performance Summary');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    if (metrics.cagr) lines.push(`| CAGR | ${formatMetricValue('cagr', metrics.cagr)} |`);
    if (metrics.volatility) lines.push(`| Volatility | ${formatMetricValue('volatility', metrics.volatility)} |`);
    if (metrics.maxDrawdown) lines.push(`| Max Drawdown | ${formatMetricValue('maxDrawdown', metrics.maxDrawdown)} |`);
    if (metrics.sharpe) lines.push(`| Sharpe Ratio | ${formatMetricValue('sharpe', metrics.sharpe)} |`);
    lines.push('');
  }

  // Screenshot sections
  const screenshotSections = [
    { key: 'summary', title: 'Summary' },
    { key: 'performance', title: 'Performance Chart' },
    { key: 'yearly', title: 'Yearly Returns Chart' },
    { key: 'risk', title: 'Risk Analysis' },
    { key: 'drawdown', title: 'Drawdown Analysis' },
    // composition screenshots now rendered inline with tables below
  ];

  if (screenshots) {
    // Backward compat: treat old `chart` as `performance`
    const imgs = { ...screenshots };
    if (imgs.chart && !imgs.performance) {
      imgs.performance = imgs.chart;
    }

    for (const { key, title } of screenshotSections) {
      if (imgs[key]) {
        const relPath = path.relative(REPORTS_DIR, imgs[key]);
        lines.push(`## ${title}`);
        lines.push(`![${title}](${relPath})`);
        lines.push('');
      }
    }
  }

  // Yearly Returns (if available)
  if (results.yearlyReturns && results.yearlyReturns.length > 0) {
    lines.push('## Yearly Returns');
    lines.push('| Year | Return |');
    lines.push('|------|--------|');
    for (const yr of results.yearlyReturns) {
      lines.push(`| ${yr.year} | ${yr.return}% |`);
    }
    lines.push('');
  }

  if (results.compositionData && Object.keys(results.compositionData).length > 0) {
    lines.push(...renderCompositionTables(results.compositionData, screenshots));
  }

  lines.push('---');
  lines.push('*Report generated by backtesto-agent*');

  return lines.join('\n');
}

async function main() {
  const results = await readResults();

  if (results.error) {
    console.error(JSON.stringify({ error: `Cannot generate report: ${results.error}` }));
    process.exit(1);
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const date = results.timestamp || new Date().toISOString().split('T')[0];
  const safeName = results.portfolio
    .map(a => a.name)
    .join('-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .substring(0, 50);

  const reportPath = path.join(REPORTS_DIR, `${safeName}-${date}.md`);
  const markdown = generateMarkdown(results);

  fs.writeFileSync(reportPath, markdown, 'utf-8');
  console.log(JSON.stringify({ status: 'success', path: reportPath }));
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
