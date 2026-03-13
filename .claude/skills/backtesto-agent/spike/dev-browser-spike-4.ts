/**
 * Spike 4 — Efficient Frontier: Set Constraints + Export Chart
 *
 * Navigates to Benchmark & Correlazioni tab, expands constraint panel,
 * fills per-asset min/max values, recalculates the frontier, exports
 * the chart via Plotly.toImage, and extracts optimal portfolio weights.
 *
 * Assumes: spike-2 composed a portfolio, spike-3 ran the backtest with
 * a benchmark configured. The "Benchmark & Correlazioni" tab must exist.
 *
 * Run from dev-browser skill dir:
 *   cd skills/dev-browser && npx tsx /path/to/this/file.ts
 */

import { connect } from "@/client.js";
import * as fs from "fs";
import * as path from "path";

const SCREENSHOT_DIR = path.resolve(
  import.meta.dirname ?? ".",
  "screenshots"
);

// Test constraints: 60% VWCE [30-90], 40% AGGH [20-60]
const CONSTRAINTS = [
  { index: 0, ticker: "VWCE", min: 30, max: 90 },
  { index: 1, ticker: "AGGH", min: 20, max: 60 },
];

async function main() {
  const startTime = Date.now();
  console.log("[spike-4] Connecting to Chrome...");

  const client = await connect();
  const page = await client.page("backtest");

  // Verify we're on a page with results and a benchmark tab
  const preCheck = await page.evaluate(() => {
    const tabs = document.querySelectorAll("#backtester-results-tabs a.nav-link");
    const tabNames = Array.from(tabs).map((t) => (t as HTMLElement).textContent?.trim());
    return {
      hasTabs: tabs.length > 0,
      tabNames,
      hasBenchmarkTab: tabNames.some((n) => n?.includes("Benchmark")),
      url: window.location.href,
    };
  });
  console.log("[spike-4] Pre-check:", JSON.stringify(preCheck));
  if (!preCheck.hasBenchmarkTab) {
    throw new Error("No Benchmark & Correlazioni tab — run spike-3 with benchmark first");
  }

  // Step 1: Click Benchmark & Correlazioni tab
  console.log("[spike-4] Clicking Benchmark & Correlazioni tab...");
  await page.evaluate(() => {
    const tabs = document.querySelectorAll("#backtester-results-tabs a.nav-link");
    for (const tab of tabs) {
      if ((tab as HTMLElement).textContent?.trim().includes("Benchmark")) {
        (tab as HTMLElement).click();
        return true;
      }
    }
    return false;
  });
  await new Promise((r) => setTimeout(r, 3000));

  // Step 2: Scroll to efficient frontier area
  console.log("[spike-4] Scrolling to efficient frontier...");
  await page.evaluate(() => {
    const plot = document.querySelector("#efficient-frontier-plot");
    const toggle = document.querySelector("#ef-constraints-toggle");
    const target = toggle || plot;
    if (target) {
      (target as HTMLElement).scrollIntoView({ behavior: "instant", block: "center" });
    }
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Step 3: Check if constraint panel is collapsed, expand if needed
  console.log("[spike-4] Expanding constraint panel...");
  const expanded = await page.evaluate(() => {
    const collapse = document.querySelector("#ef-constraints-collapse");
    const isExpanded = collapse?.classList.contains("show") || collapse?.classList.contains("in");
    if (!isExpanded) {
      const toggle = document.querySelector("#ef-constraints-toggle") as HTMLElement;
      if (toggle) toggle.click();
    }
    return isExpanded;
  });
  console.log(`[spike-4] Panel was ${expanded ? "already expanded" : "collapsed, expanded now"}`);
  await new Promise((r) => setTimeout(r, 1500));

  // Step 4: Verify asset labels match expected portfolio
  const labels = await page.evaluate(() => {
    const result: Array<{ index: number; label: string }> = [];
    for (let i = 0; i < 15; i++) {
      const el = document.getElementById(`ef-label-${i}`);
      if (!el || !el.textContent?.trim()) break;
      result.push({ index: i, label: el.textContent.trim() });
    }
    return result;
  });
  console.log("[spike-4] Asset labels:", JSON.stringify(labels));

  // Step 5: Fill min/max constraints using nativeInputValueSetter
  console.log("[spike-4] Setting constraints...");
  for (const c of CONSTRAINTS) {
    const setResult = await page.evaluate(
      (idx: number, min: number, max: number) => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        if (!setter) return { error: "no setter" };

        const minInput = document.getElementById(`ef-min-${idx}`) as HTMLInputElement;
        const maxInput = document.getElementById(`ef-max-${idx}`) as HTMLInputElement;
        if (!minInput || !maxInput) return { error: `inputs not found for index ${idx}` };

        // Set min
        setter.call(minInput, String(min));
        minInput.dispatchEvent(new Event("input", { bubbles: true }));
        minInput.dispatchEvent(new Event("change", { bubbles: true }));

        // Set max
        setter.call(maxInput, String(max));
        maxInput.dispatchEvent(new Event("input", { bubbles: true }));
        maxInput.dispatchEvent(new Event("change", { bubbles: true }));

        return {
          success: true,
          minValue: minInput.value,
          maxValue: maxInput.value,
        };
      },
      c.index,
      c.min,
      c.max
    );
    console.log(`[spike-4]   ${c.ticker} [${c.min}-${c.max}]:`, JSON.stringify(setResult));
  }

  // Step 6: Click recalculate button
  console.log("[spike-4] Clicking recalculate...");
  await page.evaluate(() => {
    const btn = document.querySelector("#efficient-frontier-ricalcola-button") as HTMLElement;
    if (btn) {
      btn.scrollIntoView({ behavior: "instant", block: "center" });
      btn.click();
    }
  });

  // Step 7: Wait for loading to clear (poll 2s, max 30s)
  console.log("[spike-4] Waiting for frontier recalculation...");
  const calcStart = Date.now();
  let calcDone = false;
  while (Date.now() - calcStart < 30000) {
    const loading = await page.evaluate(() => {
      const loader = document.querySelector("#ef-ricalcola-loading");
      if (!loader) return false;
      const style = window.getComputedStyle(loader);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    if (!loading) {
      calcDone = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  const calcElapsed = Date.now() - calcStart;
  console.log(
    `[spike-4] Recalculation ${calcDone ? "done" : "TIMEOUT"} after ${calcElapsed}ms`
  );
  if (!calcDone) {
    console.warn("[spike-4] Recalculation may still be in progress");
  }

  // Extra wait for chart to render
  await new Promise((r) => setTimeout(r, 2000));

  // Step 8: Export efficient frontier chart via Plotly.toImage
  console.log("[spike-4] Exporting frontier chart...");
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const chartResult = await page.evaluate(async () => {
    const el = document.querySelector("#efficient-frontier-plot .js-plotly-plot");
    if (!el) return { error: "chart element not found" };

    const origDPR = window.devicePixelRatio;
    Object.defineProperty(window, "devicePixelRatio", {
      value: 1,
      configurable: true,
      writable: true,
    });

    try {
      // @ts-ignore - Plotly is a global on the site
      const dataUrl = await Plotly.toImage(el, {
        format: "png",
        width: 1400,
        height: 700,
      });
      return { success: true, dataUrl };
    } catch (err) {
      return { error: String(err) };
    } finally {
      Object.defineProperty(window, "devicePixelRatio", {
        value: origDPR,
        configurable: true,
        writable: true,
      });
    }
  }) as { success?: boolean; dataUrl?: string; error?: string };

  if (chartResult.success && chartResult.dataUrl) {
    const base64 = chartResult.dataUrl.replace(/^data:image\/png;base64,/, "");
    const filePath = path.join(SCREENSHOT_DIR, "spike-4-efficient-frontier.png");
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    const size = fs.statSync(filePath).size;
    console.log(`[spike-4] Chart exported: ${(size / 1024).toFixed(1)} KB -> ${filePath}`);
  } else {
    console.error(`[spike-4] Chart export failed: ${chartResult.error}`);
  }

  // Step 9: Extract optimal portfolio weights from trace customdata
  console.log("[spike-4] Extracting optimal weights...");
  const optimalWeights = await page.evaluate(() => {
    const plot = document.querySelector(
      "#efficient-frontier-plot .js-plotly-plot"
    ) as any;
    if (!plot?.data) return { error: "no plot data" };

    const extract = (name: string) => {
      const trace = plot.data.find((d: any) => d.name === name);
      if (!trace) return null;
      return {
        volatility: trace.x?.[0],
        return: trace.y?.[0],
        weights: trace.customdata?.[0],
      };
    };

    return {
      maxSharpe: extract("Max Sharpe"),
      minVolatility: extract("Min Volatility"),
      maxReturn: extract("Max Return"),
      currentPortfolio: extract("Current Portfolio"),
      traceNames: plot.data.map((d: any) => d.name),
    };
  });
  console.log("[spike-4] Optimal weights:", JSON.stringify(optimalWeights, null, 2));

  // Final screenshot
  const finalScreenshot = path.join(SCREENSHOT_DIR, "spike-4-final.png");
  await page.screenshot({ path: finalScreenshot, fullPage: false });

  const elapsed = Date.now() - startTime;
  console.log(`\n[spike-4] DONE in ${elapsed}ms`);
  console.log("[spike-4] Summary:");
  console.log(`  - Tab navigation: OK`);
  console.log(`  - Constraints set: ${CONSTRAINTS.length} assets`);
  console.log(`  - Recalculation: ${calcDone ? "OK" : "TIMEOUT"} (${calcElapsed}ms)`);
  console.log(
    `  - Chart export: ${chartResult.success ? "OK" : "FAILED"}`
  );
  console.log(
    `  - Optimal weights: ${optimalWeights.maxSharpe ? "extracted" : "NOT found"}`
  );
  console.log(`  - Total time: ${elapsed}ms`);

  await client.disconnect();
}

main().catch((err) => {
  console.error("[spike-4] FATAL:", err);
  process.exit(1);
});
