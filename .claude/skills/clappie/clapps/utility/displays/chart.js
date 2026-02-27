// Utility: Beautiful ASCII Bar Charts
// Simple horizontal bar charts that look premium in terminal

import { View, SectionHeading, Label } from '../../display-engine/ui-kit/index.js';
import { colors } from '../../display-engine/theme.js';
import { ansi } from '../../display-engine/layout/ansi.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

export const maxWidth = 60;

export function create(ctx) {
  const viewTitle = ctx.data?.title || 'Chart';
  ctx.setTitle(viewTitle);
  ctx.setDescription('Visualize data');

  const view = new View(ctx);

  // Parse state
  let series = [];
  let parseError = null;
  let chartTitle = '';
  let chartDescription = '';

  // Parse the data
  function parseData() {
    let rawData = ctx.data?.data || '';

    // If file path provided, read from file
    if (ctx.data?.file) {
      const filePath = join(PROJECT_ROOT, ctx.data.file);
      if (!existsSync(filePath)) {
        parseError = `File not found: ${ctx.data.file}`;
        return;
      }
      try {
        rawData = readFileSync(filePath, 'utf8');
      } catch (err) {
        parseError = `Failed to read file: ${err.message}`;
        return;
      }
    }

    if (!rawData.trim()) {
      parseError = 'No data provided';
      return;
    }

    const lines = rawData.trim().split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Title line (starts with #)
      if (trimmed.startsWith('# ')) {
        chartTitle = trimmed.slice(2).trim();
        continue;
      }

      // Description line (starts with ##)
      if (trimmed.startsWith('## ')) {
        chartDescription = trimmed.slice(3).trim();
        continue;
      }

      // Skip other comments
      if (trimmed.startsWith('#')) continue;

      // Parse "name: value" or "name: value1, value2, ..." format
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;

      const name = trimmed.slice(0, colonIdx).trim();
      const valuesStr = trimmed.slice(colonIdx + 1).trim();

      // Parse values - support comma-separated for summation
      const values = valuesStr.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));

      if (values.length > 0) {
        // Sum all values for this series
        const total = values.reduce((a, b) => a + b, 0);
        series.push({ name, value: total });
      }
    }

    if (series.length === 0) {
      parseError = 'No valid data found';
    }
  }

  // Format number with commas
  function formatNumber(val) {
    if (Math.abs(val) >= 1000000) {
      return (val / 1000000).toFixed(1) + 'M';
    }
    if (Math.abs(val) >= 1000) {
      return val.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    if (Number.isInteger(val)) {
      return val.toString();
    }
    return val.toFixed(1);
  }

  // Render the chart
  function render() {
    const c = colors();
    const fg = (r, g, b) => ansi.fg.rgb(r, g, b);
    const reset = ansi.reset;

    view.clear();

    // Title
    if (chartTitle) {
      view.add(SectionHeading({ text: chartTitle }));
    }

    // Description
    if (chartDescription) {
      view.add(Label({ text: chartDescription, dim: true }));
    }

    if (chartTitle || chartDescription) {
      view.space();
    }

    // Error state
    if (parseError) {
      view.add(Label({ text: parseError, dim: true }));
      view.render();
      return;
    }

    // No data
    if (series.length === 0) {
      view.add(Label({ text: 'No data to display', dim: true }));
      view.render();
      return;
    }

    // Calculate bar dimensions
    const maxVal = Math.max(...series.map(s => s.value), 0);
    if (maxVal === 0) {
      view.add(Label({ text: 'All values are zero', dim: true }));
      view.render();
      return;
    }

    // Find longest label for alignment
    const maxLabelLen = Math.max(...series.map(s => s.name.length));

    // Find longest value string for right alignment
    const formattedValues = series.map(s => formatNumber(s.value));
    const maxValueLen = Math.max(...formattedValues.map(v => v.length));

    // Calculate bar width (leave room for label, spacing, value)
    const contentWidth = ctx.width || 50;
    const barWidth = Math.max(10, contentWidth - maxLabelLen - maxValueLen - 4);

    // Render each bar
    series.forEach((s, idx) => {
      const barLen = Math.round((s.value / maxVal) * barWidth);
      const bar = '\u2588'.repeat(Math.max(0, barLen));
      const label = s.name.padEnd(maxLabelLen);
      const valStr = formatNumber(s.value).padStart(maxValueLen);

      // Color: primary for first bar, muted for others
      const barColor = idx === 0 ? fg(...c.primary) : fg(...c.textMuted);
      const labelColor = fg(...c.text);
      const valueColor = fg(...c.textMuted);

      const line = `${labelColor}${label}${reset}  ${barColor}${bar}${reset} ${valueColor}${valStr}${reset}`;
      view.add(Label({ text: line }));

      // Add spacing between bars for readability
      if (idx < series.length - 1) {
        view.add(Label({ text: '' }));
      }
    });

    view.render();
  }

  // Initialize
  parseData();

  return {
    init() { render(); },
    render,
    onKey(key) {
      if (key === 'ESCAPE') {
        ctx.pop();
        return true;
      }
      return view.handleKey(key);
    }
  };
}
