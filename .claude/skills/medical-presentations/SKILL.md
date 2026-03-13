---
name: medical-presentations
description: |
  Creates evidence-based medical presentations from PubMed literature.
  Searches PubMed, curates evidence with GRADE quality assessment, builds
  slide outlines with data-viz figures, and generates presentations via
  Gamma REST API with Chrome-based refinements and Google Drive delivery.
  Use when creating medical lectures, journal club debates, case
  presentations, or systematic literature reviews. Triggers on requests
  for slides, presentations, or talks on medical/clinical topics.
argument-hint: "topic --type lecture|debate|case|review"
---

# medical-presentations

## Invocation

This skill accepts natural language, structured flags, or both:

```
/medical-presentations prepare a 30-minute university lecture on ARDS management for anesthesia residents
/medical-presentations I need a debate presentation on propofol vs sevoflurane for journal club
/medical-presentations "sepsis management" --type lecture --lang it
/medical-presentations a 4-hour university lecture on fluid management in the OR for anesthesia residents
/medical-presentations 60 slides on sepsis management --type lecture --audience "ICU residents"
```

Flags (optional, override inferred values):
- `--type`: lecture | debate | case | review
- `--lang`: en | it (default: en)
- `--audience`: e.g., "anesthesia residents", "medical students"
- `--duration`: e.g., "30 minutes", "4 hours", "40 slides"

---

## Workflow State

At each GATE, before presenting to the user, prepend a compact progress line:

```
Progress: [Step 0 ✓] [Step 1 ✓] [Step 2 ✓] → Step 3 | Sources: 24 | Slides: — | Gate: 3/5
```

Update the tracker fields as you complete each step:
- **Sources**: total curated articles (after Step 3)
- **Slides**: target slide count from length resolution (after Step 0), actual outline count (after Step 4)
- **Gate**: current gate number / 5

## State Management

The main thread is a thin orchestrator. Heavy work happens in Task subagents that write results to disk state files. The main thread only sees compact summaries for GATE presentations.

**State directory:** `$TMPDIR/medical-pres/` (created at Step 0 via Bash `mkdir -p`)

| File | Written by | Contains |
|------|-----------|----------|
| `state-gate1.json` | Main thread (Step 0) | Confirmed parameters |
| `state-gate2.json` | Main thread (Step 1) | Approved search strategy + queries |
| `state-gate3.json` | Segment B subagent | Evidence table, figure data extraction table, findings, gaps, conflicts |
| `state-gate4.json` | Segment C subagent | Full slide-by-slide outline with imageStrategy |
| `state-gate5.json` | Segment D subagent | Gamma URL, generation ID, metadata |
| `state-final.json` | Segment E subagent | All delivery links |

**Protocol:**
- Subagents write full data to disk via **Bash** (e.g., `python3 -c "import json; ..."` or heredoc). Do NOT use the Write tool for `$TMPDIR` paths — it triggers permission prompts that the Bash sandbox already allows.
- They return only compact summaries to the main thread (word limits per segment).
- Main thread reads state files only when the user requests detail beyond the summary.
- **Reference file rule:** For Segments B-E, only the dispatched subagent reads reference files. Main thread reads state files and user messages. (Segment A may read references directly since Steps 0-1 are lightweight.)

---

## Segment A: Parameters and Search Strategy (Main Thread)

Steps 0-1 run directly in the main thread — they are interactive and lightweight.

### Step 0: Extract Parameters and Confirm

Parse the user's input (natural language and/or flags) to extract:

| Parameter | Source | Default |
|-----------|--------|---------|
| **Topic** | Required from input | — |
| **Type** | `--type` flag or inferred from keywords ("debate", "case", "review", "lecture") | `lecture` |
| **Language** | `--lang` flag or inferred | `en` |
| **Audience** | `--audience` flag or inferred | `medical professionals` |
| **Length** | Slide count ("40 slides") or time duration ("2 hours", "4-hour lesson") from input or `--duration` flag | Type-dependent (see `references/presentation_types.md`) |
| **Special instructions** | Any remaining context | none |

**Length resolution** — read `references/presentation_types.md` § Duration Conversion:

1. If the user specified a **slide count** (e.g., "40 slides"): use directly as target slide count
2. If the user specified a **time duration** (e.g., "4 hours"):
   - Compute net teaching time using the break model
   - Divide by the weighted average pacing for the confirmed type
   - Round to nearest 5 slides
3. If **neither** specified: use the Typical Slide Count range for the confirmed type
4. For sessions > 60 min net: prepare a **module question** for GATE 1 (multi-module vs single deck)

Create state directory: `mkdir -p $TMPDIR/medical-pres`

**GATE 1 of 5 — Present inferred parameters and WAIT for user confirmation:**

```
I've extracted the following parameters:
- Topic: [topic]
- Type: [type]
- Language: [language]
- Audience: [audience]
- Length: [if time-based] 4 hours (gross) → 195 min net (3 × 15-min breaks) → ~85 slides
          [if slide-based] 40 slides (~92 min at lecture pace)
          [if default] 20-35 slides (default for lecture, 30-45 min)
- [if > 60 min net] Format: Multi-module (4 modules of ~20 slides with breaks) or Single continuous deck?
- Special instructions: [any]

Shall I proceed with these, or would you like to adjust anything?
```

**Do NOT proceed until the user confirms.**

After confirmation, write `$TMPDIR/medical-pres/state-gate1.json` with all confirmed parameters.

---

### Step 1: Propose PubMed Search Strategy

Read `references/pubmed_search_strategies.md` and `references/evidence_quality_rubric.md`.

Based on the confirmed topic and type, construct a search strategy:

1. Identify relevant MeSH terms for the topic
2. Build 3-5 parallel search queries (see Agent Strategy in `references/pubmed_search_strategies.md`):
   - Agent 1: Systematic reviews and meta-analyses
   - Agent 2: Recent RCTs (last 5 years)
   - Agent 3: Clinical practice guidelines
   - Agent 4: Landmark/high-impact studies (if known)
   - Agent 5: Related articles from top hits
3. Set date filters based on topic pace
4. Define minimum evidence requirements from `references/evidence_quality_rubric.md`

**GATE 2 of 5 — Present the search strategy and WAIT for user approval:**

```
Proposed PubMed search strategy for "[topic]":

Query 1 (Reviews/Meta-analyses): [query]
Query 2 (RCTs): [query]
Query 3 (Guidelines): [query]
[...]

Date filter: Last [N] years
Target: [minimum sources] sources, [minimum Level A/B] at Level A-B

Approve this strategy, or would you like to adjust the queries?
```

**Do NOT execute searches until the user approves.**

After approval, write `$TMPDIR/medical-pres/state-gate2.json` with the approved queries, date filters, and minimum requirements.

---

## Segment B: PubMed Search and Evidence Curation (Subagent)

After GATE 2 approval, dispatch a single Task subagent for Steps 2-3. This is the heaviest segment.

### Subagent Dispatch

```
Task(subagent_type="general-purpose", description="PubMed search and evidence curation"):

"You are executing Steps 2-3 of the medical-presentations workflow.

Read $TMPDIR/medical-pres/state-gate2.json for approved search queries.
Read references/pubmed_search_strategies.md and references/evidence_quality_rubric.md.

STEP 2 — Execute PubMed Searches:
Launch 3-5 parallel Task agents (multiple Task calls in same message — do NOT use run_in_background).
Each agent:
1. mcp__claude_ai_PubMed__search_articles with its assigned query
2. For top 5-10 results: mcp__claude_ai_PubMed__get_article_metadata for abstracts
3. For Level A evidence with PMC access: attempt mcp__claude_ai_PubMed__get_full_text_article
4. mcp__claude_ai_PubMed__find_related_articles on highest-quality PMIDs
5. Return: PMID, DOI, title, authors, year, journal, study design, N, key findings, evidence level
6. Verify article type in metadata — reject letters, editorials, comments, errata. Only accept original research, reviews, meta-analyses, guidelines, trials

Error handling:
- PubMed unavailable: fall back to WebSearch targeting PMC, Cochrane, society guidelines
- 0 results: apply progressive broadening from pubmed_search_strategies.md
- Agent timeout: retry once with simplified query, proceed with partial results

STEP 3 — Curate and Extract:
Collect all results, deduplicate. For each article:
1. Assign evidence level (A/B/C/D) per evidence_quality_rubric.md
2. Assess risk of bias (low/moderate/high) and applicability (direct/indirect)
3. Extract key finding with effect size, CI, p-value

Build evidence summary table:
| # | Citation | Design | N | Level | Key Finding | Bias | Applicability |

Build Figure Data Extraction Table:
| Study | Chart Type | Extracted Data | Intervention Protocol | Control Protocol |

Data requirements by chart type:
- Forest plot: study name, N, effect size, 95% CI, weight
- Line graph: time points, values per group, measure units
- Grouped bar: group labels, category labels, exact values
- KM curve: event rates per time point, HR, CI, number at risk

For articles needing full text for figure data, follow retrieval cascade in pubmed_search_strategies.md § Full-Text Retrieval Cascade.

Write COMPLETE results to $TMPDIR/medical-pres/state-gate3.json via Bash (python3 json.dump or heredoc — NOT the Write tool) as JSON with keys:
evidenceTable, figureDataTable, strongestFindings, gaps, conflicts, articleCount, levelDistribution

Return ONLY a compact summary (500 words max):
- Total article count and level distribution (e.g., '24 articles: 3A, 8B, 10C, 3D')
- Top 3 strongest findings with citations and effect sizes
- Figure-ready dataset count and chart types
- Evidence gaps (bullet list)
- Conflicting evidence (if any)"
```

### GATE 3 of 5 — Evidence Review (Main Thread)

Present the subagent's compact summary to the user:

```
Evidence summary for "[topic]" ([N] articles curated):

[Compact summary from subagent return]

Approve this evidence base, or would you like me to search for additional evidence on specific aspects?
(Say "show full table" to see the complete evidence and figure data tables.)
```

If user requests full details: read and present `$TMPDIR/medical-pres/state-gate3.json`.

**Do NOT proceed to outline until the user approves the evidence.**

---

## Segment C: Outline Generation (Subagent)

After GATE 3 approval, dispatch a subagent for Steps 4-5.

### Subagent Dispatch

```
Task(subagent_type="general-purpose", description="Slide outline generation"):

"You are executing Step 4 of the medical-presentations workflow.

Read $TMPDIR/medical-pres/state-gate3.json for the evidence table and figure data.
Read $TMPDIR/medical-pres/state-gate1.json for confirmed parameters (type, audience, length, language).
Read references/presentation_types.md, references/slide_structure_patterns.md, and references/image_generation_models.md.

Generate a detailed slide-by-slide outline:
1. Select structural template from presentation_types.md for the confirmed type
2. Apply assertion-style headings per slide_structure_patterns.md
3. Map evidence to slides (which citations support which claims)
4. Use the target slide count from state-gate1.json (not the default range)
5. If multi-module: divide into modules with title slides, summaries, and break markers
6. Build imageStrategy block for each slide using model selection matrix from image_generation_models.md

For each slide specify: number, type, heading, 3-5 content points, evidence citations, imageStrategy (imageType, targetModel, figureSource for data-viz, imagePrompt, dataVerificationRequired), speaker notes.

For data-viz slides: use Figure Data Extraction Table as data source. Choose model by complexity (GPT Image Detailed for dense plots, Nano Banana Pro for precise labels, GPT Image for simpler figures). Build prompts from data-viz templates in image_generation_models.md Section 1F.

INTERVENTION REPRODUCIBILITY RULE: For each data-viz slide comparing interventions, apply the rule from slide_structure_patterns.md. Count words for intervention + control description. If ≤20 words total, include below the chart on the data-viz slide. If >20 words, add a Methods Companion Slide immediately after and increment slide count.

Write the COMPLETE outline to $TMPDIR/medical-pres/state-gate4.json via Bash (NOT the Write tool) as JSON with keys:
title, slides (array of slide objects), imageStrategySummary, totalSlides, dataVerificationCount

Return ONLY a compact summary (300 words max):
- Presentation title and slide count
- Slide titles list (numbered)
- Image strategy table: | Slide # | Type | Image Type | Model | Verify |
- Data verification count"
```

### GATE 4 of 5 — Outline Review (Main Thread)

Present the subagent's compact summary:

```
Presentation outline: "[Title]"
Type: [type] | Slides: [count] | Duration: ~[minutes] min

[Numbered slide titles from summary]

Image strategy summary:
[Table from summary]

Data verification required: [M] slides

Options:
1. Approve — proceed to Gamma generation
2. Modify specific slides — tell me which slides to change
3. Restructure — change the overall flow
4. Add/remove content — specify what to add or cut
5. Adjust image strategy — change models or prompts for specific slides
(Say "show full outline" to see complete slide details.)
```

If user requests full outline: read and present `$TMPDIR/medical-pres/state-gate4.json`.

If the user requests modifications: apply changes to `state-gate4.json` (re-dispatch subagent if major restructuring, or edit state file directly for minor tweaks). Re-present and wait for approval.

**Do NOT proceed to Gamma generation until the user approves.**

---

## Segment D: Gamma Generation (Subagent)

After GATE 4 approval, ask the user about theme preference, then dispatch.

**Theme question (main thread):** "Do you have a preferred Gamma theme? If so, provide the themeId. Otherwise I'll select a professional default from the standard themes."

### Subagent Dispatch

```
Task(subagent_type="general-purpose", description="Gamma presentation generation"):

"You are executing Step 6 of the medical-presentations workflow.

Read $TMPDIR/medical-pres/state-gate4.json for the approved outline.
Read $TMPDIR/medical-pres/state-gate1.json for parameters (audience, language, type).
Read references/gamma_prompt_templates.md.

Generate the presentation via Gamma REST API:
1. Select template for the presentation type
2. Theme: [themeId from user or 'auto-select per gamma_prompt_templates.md Section 6']
3. Determine image model from outline's dominant imageStrategy
4. Build inputText with ALL evidence inline, assertion headings, [IMAGE:] annotations, speaker notes
5. Set textOptions per gamma_prompt_templates.md Section 5
6. Compile additionalInstructions from outline layout hints

Build and send JSON payload:
- Write payload to $TMPDIR/gamma_input.json via Bash (python3 json.dump or heredoc — NOT the Write tool, which triggers permission prompts)
- Send: KEY=$GAMMA_API_KEY && curl -s -X POST https://public-api.gamma.app/v1.0/generations -H 'X-API-KEY: '${KEY} -H 'Content-Type: application/json' -d @$TMPDIR/gamma_input.json
- Poll every 15s: KEY=$GAMMA_API_KEY && curl -s -H 'X-API-KEY: '${KEY} https://public-api.gamma.app/v1.0/generations/$GENERATION_ID
- Wait until status is 'completed', extract gammaUrl

Error handling:
- 401: report 'API key invalid'
- 400: check model string against image_generation_models.md
- Pending >3 min: retry with simplified inputText
- 5xx: create Markdown version locally, report to user

Write to $TMPDIR/medical-pres/state-gate5.json via Bash (NOT the Write tool):
{ gammaUrl, generationId, model, themeId, slideCount }

Return: Gamma URL + generation status"
```

---

## Segment E: Refinements and Delivery (Subagent)

### GATE 5 of 5 — Refinement Options (Main Thread)

Present BEFORE dispatching the subagent:

```
Presentation generated: [Gamma URL from Segment D return]

Data verification needed: [M] slides (from state-gate4.json summary)

Actions: 1) Regenerate images 2) Verify data-viz 3) Adjust layouts 4) Edit text
5) Reorder slides 6) Export PPTX 7) Export PDF 8) Skip — proceed to delivery
Which actions? (Select multiple, or "8" to skip)
```

**Do NOT dispatch until the user selects actions.**

### Subagent Dispatch

```
Task(subagent_type="general-purpose", description="Chrome refinements and delivery"):

"You are executing Steps 7-8 of the medical-presentations workflow.

Read $TMPDIR/medical-pres/state-gate5.json for the Gamma URL.
Read $TMPDIR/medical-pres/state-gate4.json for the outline (verification reference).
Read references/chrome_refinement_procedures.md.

STEP 7 — Browser Refinements:
User selected actions: [list from GATE 5]

1. Get browser context: mcp__claude-in-chrome__tabs_context_mcp
2. Open Gamma URL in new tab: mcp__claude-in-chrome__tabs_create_mcp then navigate
3. Execute selected refinements per chrome_refinement_procedures.md:
   - Image regeneration: § Step 3/3B
   - Data verification: § Data Verification After Premium Regeneration
   - Layout adjustments: § Step 4
   - Export: § Step 5

Error handling:
- Chrome unavailable: provide Gamma URL + manual instructions from § Fallback, proceed to Step 8
- Extension not responding: tabs_context_mcp to refresh, retry once (2 attempts total), then manual fallback

STEP 8 — Deliver to Google Drive:
1. Export PPTX + PDF from Gamma (if not done above)
2. Upload to Drive: mcp__google_workspace__create_drive_file, name '[Topic] - [Type] - [Date]', email [user_email]
3. Create evidence doc: mcp__google_workspace__create_doc with full evidence table from state-gate3.json
4. If Google Workspace unavailable: save locally under assets/[topic-slug]/

Write to $TMPDIR/medical-pres/state-final.json via Bash (NOT the Write tool):
{ gammaUrl, driveUrl, evidenceDocUrl, exportPaths }

Return: All delivery links (Gamma URL, Drive link, Evidence Doc link)"
```

---

## Resources

See `CLAUDE.md` Reference Index for contents of each file. All are in `references/`:
- `evidence_quality_rubric.md` — evidence hierarchy, GRADE mapping, conflict resolution
- `pubmed_search_strategies.md` — MeSH terms, query patterns, progressive broadening
- `presentation_types.md` — lecture/debate/case/review templates
- `slide_structure_patterns.md` — slide types, imageStrategy blocks, data verification
- `image_generation_models.md` — all models, prompting frameworks, data-viz templates
- `gamma_prompt_templates.md` — REST API params, textMode, inputText templates
- `chrome_refinement_procedures.md` — browser automation, regeneration, export, fallback
