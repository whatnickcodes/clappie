# Test Suite

Manifest-driven E2E validation for backtest reports. Data (what to check) is separate from code (how to check) — adding a feature = adding a JSON entry to the manifest.

## Reference Report

The **gold-standard reference** report is:

- **File**: `docs/reports/test-portfolio-benchmark-2026-02-27.md`
- **Fixture**: `tests/fixtures/test-portfolio.json` (12 assets + SWDA benchmark)
- **Validated**: 2026-02-27 — **60/60 PASS** (0 failures, 0 warnings, includes benchmark)
- **Images**: 20 chart PNGs in `docs/reports/images/test-portfolio-benchmark-*.png`
- **Sections**: 25 (all covered by manifest)

This report demonstrates the expected output for a complex multi-asset portfolio with benchmark. Use it as the exemplar when:
- Generating new reports (match structure, section ordering, image+table pairing)
- Adding new manifest checks (verify they pass against the reference)
- Debugging format issues (compare your output section-by-section)

### When to Update the Reference

Regenerate the reference report when:
- The report format spec changes (new sections, reordered sections)
- New manifest checks are added that the current reference doesn't cover
- The test fixture composition changes

To regenerate: load `test-portfolio.json` fixture on backtes.to, run backtest, export all charts, validate with `node tests/validate-report.js`.

## Trigger Conditions

Activate when the user says: "run tests", "test the skill", "validate the pipeline", "E2E test", or "validate report".

## Validation-Only Mode

When the user says "validate report [path]":

```bash
node tests/validate-report.js <path-to-report.md>
```

Parse the JSON output and present the PASS/FAIL summary with details on any failures/warnings.

## Full E2E Test Workflow

When the user says "run tests" or "E2E test":

1. Read `tests/fixtures/test-portfolio.json` for the reference portfolio
2. Open Portafogli modal → search for "Test Portfolio"
   - Missing? Create from fixture via Portfolio Management Contract
3. Load the portfolio → set benchmark (SWDA, IE00B4L5Y983) → run backtest
4. Generate report to `docs/reports/test-portfolio-[YYYY-MM-DD].md` following report_format_spec.md
5. Run the validator:
   ```bash
   node tests/validate-report.js docs/reports/test-portfolio-[YYYY-MM-DD].md
   ```
6. Parse JSON output → present PASS/FAIL with details

## Manifest Structure

`tests/test-manifest.json` — each entry specifies:
- `id`: unique check identifier
- `check`: check function type (section_exists, table_has_columns, image_exists, etc.)
- `required`: true = failure means test fails; false = warning only
- `when_benchmark`: true = only checked when benchmark is detected in report

## Adding Checks for New Features

1. Add entries to `tests/test-manifest.json` using existing check types
2. New check type needed? Add module in `tests/checks/`, register in validate-report.js
3. Available check types: `section_exists`, `has_bullet_fields`, `table_has_columns`, `table_min_rows`, `table_has_emoji`, `metric_exists`, `metric_in_range`, `image_exists`, `all_referenced_images_exist`, `valid_markdown`, `has_footer`, `manifest_covers_sections`

## Pre-Merge Requirement

Before merging any feature branch that adds or modifies report sections, run the validator. The `manifest_covers_sections` check automatically detects report headings (## and ###) not covered by any manifest entry — if the manifest doesn't grow with the report, the validator fails.

**Merge checklist:**
1. Update `references/report_format_spec.md` if adding new report sections
2. Add corresponding entries to `tests/test-manifest.json` for each new section
3. Run `node tests/validate-report.js docs/reports/test-portfolio-*.md` — must exit 0
4. Merge only after all checks pass
