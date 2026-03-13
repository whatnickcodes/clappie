# Skill Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce SKILL.md context pressure and prevent step skipping by externalizing procedural detail, adding TOCs to reference files, improving frontmatter, and strengthening checkpoints.

**Architecture:** Move ~80 lines of procedural content from SKILL.md into the reference files that already own those domains. Add table of contents to 4 large reference files. Replace CHECKPOINT with GATE framing and add a workflow progress tracker.

**Tech Stack:** Markdown editing only — no code changes.

**Design doc:** `docs/plans/2026-02-19-skill-optimization-design.md`

---

### Task 1: Add TOC to `references/gamma_prompt_templates.md`

**Files:**
- Modify: `references/gamma_prompt_templates.md:1-3`

**Step 1: Add Contents section after the H1 heading (line 1)**

Insert between line 1 (`# Gamma Prompt Templates`) and line 3 (`## 1. REST API Parameter Reference`):

```markdown
## Contents
- [REST API Parameter Reference](#1-rest-api-parameter-reference)
- [textMode Decision Logic](#2-textmode-decision-logic)
- [Per-Slide Image Prompt Embedding](#3-per-slide-image-prompt-embedding)
- [additionalInstructions Patterns](#4-additionalinstructions-patterns)
- [textOptions for Medical Contexts](#5-textoptions-for-medical-contexts)
- [Theme Selection Workflow](#6-theme-selection-workflow)
- [Templates by Presentation Type](#7-templates-by-presentation-type)
- [Complete Request Template](#8-complete-request-template)
- [Image Options Summary](#image-options-summary)
- [Language Parameter](#language-parameter)
```

Note: Section 8 doesn't exist yet — it's added in Task 5.

**Step 2: Verify the file renders correctly**

Run: `head -20 references/gamma_prompt_templates.md`

**Step 3: Commit**

```bash
git add references/gamma_prompt_templates.md
git commit -m "docs: add TOC to gamma_prompt_templates.md"
```

---

### Task 2: Add TOC to `references/image_generation_models.md`

**Files:**
- Modify: `references/image_generation_models.md:1-3`

**Step 1: Add Contents section after the H1 heading**

Insert between line 1 and the first `##`:

```markdown
## Contents
- [All Available Models](#1a-all-available-models)
- [Premium Models — Prompting Frameworks](#1b-premium-models--prompting-frameworks)
- [Model Selection Matrix](#1c-model-selection-matrix)
- [Data-Driven Image Protocol](#1d-data-driven-image-protocol)
- [SPLICE Framework](#1e-splice-framework-general-reference)
- [Data Visualization Prompt Templates](#1f-data-visualization-prompt-templates)
```

**Step 2: Commit**

```bash
git add references/image_generation_models.md
git commit -m "docs: add TOC to image_generation_models.md"
```

---

### Task 3: Add TOC to `references/chrome_refinement_procedures.md`

**Files:**
- Modify: `references/chrome_refinement_procedures.md:1-3`

**Step 1: Add Contents section after the H1 heading**

```markdown
## Contents
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Step 1: Navigate to Presentation](#step-1-navigate-to-presentation)
- [Step 2: Review Slide Content](#step-2-review-slide-content)
- [Step 3: AI Image Regeneration (Standard)](#step-3-ai-image-regeneration-standard)
- [Step 3B: Image Regeneration via Chrome UI](#step-3b-image-regeneration-via-chrome-ui)
- [Step 4: Layout Adjustments](#step-4-layout-adjustments)
- [Step 5: Export](#step-5-export)
- [Step 6: User-Guided Refinements](#step-6-user-guided-refinements)
- [Fallback: When Chrome Automation is Unavailable](#fallback-when-chrome-automation-is-unavailable)
- [Error Recovery](#error-recovery)
```

**Step 2: Commit**

```bash
git add references/chrome_refinement_procedures.md
git commit -m "docs: add TOC to chrome_refinement_procedures.md"
```

---

### Task 4: Add TOC to `references/slide_structure_patterns.md`

**Files:**
- Modify: `references/slide_structure_patterns.md:1-3`

**Step 1: Add Contents section after the H1 heading**

```markdown
## Contents
- [Slide Types](#slide-types) — Title, Content, Comparison, Data, Summary, Reference
- [Formatting Rules](#formatting-rules) — Assertion headings, bullets, image guidance, speaker notes, color
```

**Step 2: Commit**

```bash
git add references/slide_structure_patterns.md
git commit -m "docs: add TOC to slide_structure_patterns.md"
```

---

### Task 5: Move Full-Text Retrieval cascade to `references/pubmed_search_strategies.md`

**Files:**
- Modify: `references/pubmed_search_strategies.md` (append new section)
- Source content: `SKILL.md` lines 169-195 (to be removed in Task 8)

**Step 1: Append the new section at the end of `pubmed_search_strategies.md`**

Copy lines 169-195 from SKILL.md **verbatim** and wrap in a new `##` section:

```markdown

## Full-Text Retrieval Cascade

After building the Figure Data Extraction Table, identify articles where abstract data is insufficient for accurate figure reproduction (missing exact values, CIs, or time-series data points). For these articles, attempt full-text retrieval using this priority cascade:

**Path 1 — PMC (fast, structured):**
Use `mcp__claude_ai_PubMed__convert_article_ids` to check for PMC ID, then `mcp__claude_ai_PubMed__get_full_text_article`. Extract only Results and Discussion sections via a dedicated subagent to conserve context.

**Path 2 — WebFetch via DOI (fast, parallel):**
For articles with DOI but no PMC access:
```
Tool: WebFetch
url: https://doi.org/[DOI]
prompt: "Extract the Results and Discussion sections of this research article. Include all numerical outcomes, effect sizes, confidence intervals, p-values, and time-series data points. Ignore headers, footers, navigation, and references."
```
WebFetch converts HTML→markdown automatically. Run in parallel via multiple WebFetch calls. If the response indicates a paywall or incomplete content (< 500 words of results), flag for Path 3.

**Path 3 — Chrome MCP via DOI (fallback for paywalled articles):**
If Path 2 fails for ≥2 articles and institutional access may help:
1. Check VPN status: `pgrep -x openfortivpn` (returns PID if connected)
2. If not connected, prompt the user: "X articles need institutional access for full text. Please connect VPN (`uniprvpn`) and confirm, or say 'skip' to proceed with abstracts only."
3. After VPN confirmed, for each flagged article:
   - `mcp__claude-in-chrome__navigate` → `https://doi.org/[DOI]`
   - `mcp__claude-in-chrome__get_page_text` → extract full text
   - Process with a Task subagent to extract Results/Discussion only
4. After all articles retrieved, user may disconnect VPN.

**Graceful degradation:** If full text is unavailable after all paths, proceed with abstract + metadata. Note in the Figure Data Extraction Table which values are "from abstract" vs "from full text" so data-viz prompts can flag approximate values.
```

**Step 2: Commit**

```bash
git add references/pubmed_search_strategies.md
git commit -m "docs: add Full-Text Retrieval Cascade section to pubmed_search_strategies.md"
```

---

### Task 6: Move Gamma JSON template to `references/gamma_prompt_templates.md`

**Files:**
- Modify: `references/gamma_prompt_templates.md` (append new section before "Image Options Summary")
- Source content: `SKILL.md` lines 351-388 (to be removed in Task 8)

**Step 1: Insert new section before `## Image Options Summary` (currently line 554)**

Copy lines 351-388 from SKILL.md **verbatim** as a new section:

```markdown

## 8. Complete Request Template

Write the JSON payload using the Write tool (sandbox-safe for large content):
```
Tool: Write
file_path: $TMPDIR/gamma_input.json
content: {
  "inputText": "[populated template with [IMAGE:] annotations and ALL evidence inline]",
  "textMode": "preserve",
  "numCards": [target slide count],
  "imageOptions": {
    "source": "aiGenerated",
    "model": "[selected model]"
  },
  "textOptions": {
    "amount": "[per type]",
    "audience": "[from Step 0]",
    "tone": "[per type]",
    "language": "[from Step 0]"
  },
  "additionalInstructions": "[compiled layout hints]",
  "themeId": "[from step 2, if available]"
}
```
Then send via curl:
```bash
RESPONSE=$(curl -s -X POST "https://public-api.gamma.app/v1.0/generations" \
  -H "X-API-KEY: $GAMMA_API_KEY" \
  -H "Content-Type: application/json" \
  -d @"$TMPDIR/gamma_input.json")
GENERATION_ID=$(echo "$RESPONSE" | jq -r '.generationId')
```

Poll for completion (generation takes 30-120 seconds):
```bash
KEY="$GAMMA_API_KEY" && curl -s -H "X-API-KEY: ${KEY}" \
  "https://public-api.gamma.app/v1.0/generations/$GENERATION_ID"
```
**Important:** Always assign `$GAMMA_API_KEY` to an intermediate variable before using in curl — direct interpolation in chained commands is unreliable.
Poll every 15 seconds until `status` is `"completed"`. Extract `gammaUrl` for Step 7.
```

**Step 2: Commit**

```bash
git add references/gamma_prompt_templates.md
git commit -m "docs: add Complete Request Template section to gamma_prompt_templates.md"
```

---

### Task 7: Update SKILL.md frontmatter

**Files:**
- Modify: `SKILL.md:1-10`

**Step 1: Replace the frontmatter description**

Old:
```yaml
description: |
  Orchestrates medical literature research and presentation creation.
  Searches PubMed, curates evidence, generates structured outlines, and
  creates presentations via Gamma.app with Chrome-based refinements.
  Use when creating medical presentations, lectures, debates, case
  presentations, or literature reviews.
```

New:
```yaml
description: |
  Creates evidence-based medical presentations from PubMed literature.
  Searches PubMed, curates evidence with GRADE quality assessment, builds
  slide outlines with data-viz figures, and generates presentations via
  Gamma REST API with Chrome-based refinements and Google Drive delivery.
  Use when creating medical lectures, journal club debates, case
  presentations, or systematic literature reviews. Triggers on requests
  for slides, presentations, or talks on medical/clinical topics.
```

**Step 2: Commit**

```bash
git add SKILL.md
git commit -m "docs: improve SKILL.md frontmatter description for better discovery"
```

---

### Task 8: Add Workflow State tracker to SKILL.md

**Files:**
- Modify: `SKILL.md:30-31` (between "---" after invocation and "## Step 0")

**Step 1: Insert the Workflow State section after the invocation section's closing `---` (line 30) and before `## Step 0` (line 32)**

```markdown

## Workflow State

At each GATE, before presenting to the user, prepend a compact progress line:

```
Progress: [Step 0 ✓] [Step 1 ✓] [Step 2 ✓] → Step 3 | Sources: 24 | Slides: — | Gate: 3/5
```

Update the tracker fields as you complete each step:
- **Sources**: total curated articles (after Step 3)
- **Slides**: slide count (after Step 4)
- **Gate**: current gate number / 5

This keeps you oriented in long conversations and gives the user a quick status overview.

```

**Step 2: Commit**

```bash
git add SKILL.md
git commit -m "docs: add workflow state tracker to SKILL.md"
```

---

### Task 9: Rename CHECKPOINTs to GATEs in SKILL.md

**Files:**
- Modify: `SKILL.md` (5 locations)

**Step 1: Replace all 5 checkpoint labels**

| Old | New |
|---|---|
| `**CHECKPOINT 1 — Present inferred parameters and WAIT for user confirmation:**` | `**GATE 1 of 5 — Present inferred parameters and WAIT for user confirmation:**` |
| `**CHECKPOINT 2 — Present the search strategy and WAIT for user approval:**` | `**GATE 2 of 5 — Present the search strategy and WAIT for user approval:**` |
| `**CHECKPOINT 3 — Present the evidence summary and WAIT for user review:**` | `**GATE 3 of 5 — Present the evidence summary and WAIT for user review:**` |
| `**CHECKPOINT 4 — Present the full outline and WAIT for user approval:**` | `**GATE 4 of 5 — Present the full outline and WAIT for user approval:**` |
| `**CHECKPOINT 5 — Present available refinements and WAIT for user selection:**` (in Step 7, point 5) | `**GATE 5 of 5 — Present available refinements and WAIT for user selection:**` |

Also update the `**Do NOT proceed` lines to include gate reference where they exist.

**Step 2: Commit**

```bash
git add SKILL.md
git commit -m "docs: rename CHECKPOINTs to GATEs for stronger stop semantics"
```

---

### Task 10: Externalize Step 3 procedural detail from SKILL.md

**Files:**
- Modify: `SKILL.md` Step 3 (lines ~169-195)

**Step 1: Replace the Full-Text Retrieval subsection**

Remove lines 169-195 (the `### Full-Text Retrieval for Figure Data` subsection with Paths 1-3 and graceful degradation) and replace with a compact dispatch:

```markdown
### Full-Text Retrieval for Figure Data

For articles where abstract data is insufficient for figure reproduction, follow the retrieval cascade in `references/pubmed_search_strategies.md` § Full-Text Retrieval Cascade (3 paths: PMC → WebFetch via DOI → Chrome MCP with VPN). Graceful degradation: proceed with abstract data if full text unavailable, noting "from abstract" in the extraction table.
```

**Step 2: Verify the checkpoint text below is unchanged**

The `**GATE 3 of 5**` block (formerly CHECKPOINT 3) must remain intact and verbatim.

**Step 3: Commit**

```bash
git add SKILL.md
git commit -m "refactor: externalize full-text retrieval detail from SKILL.md Step 3"
```

---

### Task 11: Externalize Step 6 procedural detail from SKILL.md

**Files:**
- Modify: `SKILL.md` Step 6 (lines ~351-388)

**Step 1: Replace the JSON template and curl commands**

Remove the detailed JSON payload template (point 7) and curl/poll commands (point 8) and replace with:

```markdown
7. **Build and send the JSON payload** following the complete template in `references/gamma_prompt_templates.md` § Complete Request Template. Write payload to `$TMPDIR/gamma_input.json` via the Write tool, then send via curl. Poll every 15 seconds until `status` is `"completed"`. Extract `gammaUrl` for Step 7.
```

Remove the old point 8 entirely (it's now part of the reference file's template section).

**Step 2: Verify error handling section below is unchanged**

The `### Error Handling` block for Step 6 must remain intact.

**Step 3: Commit**

```bash
git add SKILL.md
git commit -m "refactor: externalize Gamma JSON template from SKILL.md Step 6"
```

---

### Task 12: Slim Step 7 to dispatch in SKILL.md

**Files:**
- Modify: `SKILL.md` Step 7 (lines ~401-454)

**Step 1: Replace the detailed substeps with a compact dispatch**

Keep the opening, the GATE 5 checkpoint, and error handling. Replace the detailed substeps (points 1-4 and 6-7) with references to chrome_refinement_procedures.md:

```markdown
## Step 7: Browser-Based Refinements

Read `references/chrome_refinement_procedures.md`.

Follow the procedures in `references/chrome_refinement_procedures.md` to:
1. Get browser context and open the Gamma URL in a new tab (§ Step 1)
2. Review slide content against the approved outline (§ Step 2)
3. Identify slides needing data verification (`dataVerificationRequired: true`) or image fixes

**GATE 5 of 5 — Present available refinements and WAIT for user selection:**

   ```
   Presentation generated: [Gamma URL]

   Data verification needed: [M] slides | Image issues: [N] slides
   [Tables of slides needing verification and image fixes]

   Actions: 1) Regenerate images 2) Verify data-viz 3) Adjust layouts 4) Edit text
   5) Reorder slides 6) Export PPTX 7) Export PDF 8) Skip — proceed to delivery
   Which actions? (Select multiple, or "8" to skip)
   ```

Execute selected refinements per `references/chrome_refinement_procedures.md` (§ Step 3/3B for images, § Step 4 for layouts, § Step 5 for export). Report verification results to user after completion.
```

Keep the existing `### Error Handling` section for Step 7 unchanged.

**Step 2: Commit**

```bash
git add SKILL.md
git commit -m "refactor: slim SKILL.md Step 7 to dispatch to chrome_refinement_procedures.md"
```

---

### Task 13: Verification

**Files:**
- Read: All modified files

**Step 1: Count SKILL.md lines**

Run: `wc -l SKILL.md`
Expected: ~410-425 lines (down from 486)

**Step 2: Verify all reference file TOCs exist**

Run: `head -15 references/gamma_prompt_templates.md references/image_generation_models.md references/chrome_refinement_procedures.md references/slide_structure_patterns.md`
Expected: Each starts with `# Title` then `## Contents` with anchored links.

**Step 3: Verify new sections exist in reference files**

Run: `grep "^## Full-Text Retrieval Cascade" references/pubmed_search_strategies.md`
Expected: Match found.

Run: `grep "^## 8. Complete Request Template" references/gamma_prompt_templates.md`
Expected: Match found.

**Step 4: Verify no content was lost**

Run: `grep -c "GATE" SKILL.md`
Expected: 5 (one per gate)

Run: `grep -c "CHECKPOINT" SKILL.md`
Expected: 0 (all renamed)

**Step 5: Verify SKILL.md still has all 9 steps (0-8)**

Run: `grep "^## Step" SKILL.md`
Expected: Step 0 through Step 8 all present.

**Step 6: Commit verification pass**

No commit needed — this is a read-only verification task.
