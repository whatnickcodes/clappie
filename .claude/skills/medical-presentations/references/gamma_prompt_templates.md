# Gamma Prompt Templates

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

## 1. REST API Parameter Reference

Generation uses `POST https://public-api.gamma.app/v1.0/generations` with `X-API-KEY: $GAMMA_API_KEY` header.

```json
{
  // Required
  "inputText": "string",          // Full content — all evidence, citations, data inline
                                   // Gamma cannot access PubMed or external sources
  "textMode": "generate | preserve | condense",  // See Section 2

  // Content control
  "numCards": 20,                  // Target slide count
  "format": "presentation",       // Default for this skill

  // Image generation
  "imageOptions": {
    "source": "aiGenerated",      // Always for this skill
    "style": "photorealistic",    // Default — can also be "illustration", "abstract"
    "model": "imagen-4-pro"       // See image_generation_models.md for all 45 accepted values
                                   // Key: imagen-4-pro, gemini-3-pro-image, recraft-v4,
                                   //   gpt-image-1-medium, gemini-2.5-flash-image, gpt-image-1-high
  },

  // Text generation options
  "textOptions": {
    "amount": "brief | medium | detailed",    // See Section 5
    "audience": "anesthesia residents",
    "tone": "professional | academic | conversational",
    "language": "en"              // "en", "it", etc.
  },

  // Layout hints
  "additionalInstructions": "",   // Per-slide layout guidance — see Section 4

  // Theme
  "themeId": ""                   // From GET /v1.0/themes
}
```

Before generating, fetch themes:
```bash
curl -s -H "X-API-KEY: $GAMMA_API_KEY" "https://public-api.gamma.app/v1.0/themes"
```

After generating, poll for completion:
```bash
curl -s -H "X-API-KEY: $GAMMA_API_KEY" "https://public-api.gamma.app/v1.0/generations/{generationId}"
# Returns: { "status": "completed", "gammaUrl": "https://gamma.app/docs/..." }
```

---

## 2. textMode Decision Logic

| Mode | When to Use | Behavior |
|---|---|---|
| `"generate"` | Short outlines where Gamma should expand content. Title slides, learning objectives, background slides. | Gamma interprets content as outline and generates fuller text |
| `"preserve"` | **Required** when using `[IMAGE:]` annotations or exact citations. Evidence slides, data slides, any slide with specific numbers/formatting. | Gamma keeps content as-is, only formats into slides |
| `"condense"` | Long-form articles or documents being converted to slides | Gamma summarizes and distills content |

**Rule for this skill:** When `[IMAGE:]` annotations are present in `inputText`, always use `textMode: "preserve"`. This ensures Gamma passes through the image prompts to the generation engine rather than rewriting them.

---

## 3. Per-Slide Image Prompt Embedding

Embed `[IMAGE:]` annotations in `inputText` to control per-slide image generation. Place at the end of each slide's content, before the `---` separator.

### Format

```markdown
## Slide Heading

- Content bullet 1
- Content bullet 2
- Evidence citation (Author, Year)

[IMAGE: {full model-specific prompt from image_generation_models.md templates}]

---
```

### Rules

1. **One `[IMAGE:]` per slide** — the annotation controls the image for that slide
2. **Full prompt inside** — include the complete model-specific prompt, not a brief description
3. **Model choice is global** via `imageOptions.model` — the `[IMAGE:]` annotation provides the per-slide prompt context
4. **Data-viz prompts** should include every data point from the evidence table
5. **Slides without `[IMAGE:]`** get Gamma's default AI image based on slide content
6. When any slide uses `[IMAGE:]`, set `textMode: "preserve"` for the entire generation

### Example

```markdown
## IV Magnesium Reduces Postoperative Opioid Consumption by 24-35%

- Meta-analysis of 25 RCTs (N=1,461): weighted mean difference -10.5 mg morphine equivalents (De Oliveira et al., 2013)
- Dose-response relationship: 30-50 mg/kg bolus + infusion most effective (Albrecht et al., 2013)
- Effect most pronounced in first 24 hours post-surgery

[IMAGE: Forest plot showing meta-analysis of IV magnesium vs placebo for postoperative opioid consumption. Title: "Figure 1: Meta-analysis of IV Magnesium vs Placebo — 24h Morphine Consumption (6 RCTs)". Studies (top to bottom): De Oliveira 2013, N=429, MD=-10.5mg [-13.2, -7.8], weight=22%. Albrecht 2013, N=384, MD=-8.7mg [-11.4, -6.0], weight=20%. Shin 2020, N=120, MD=-12.1mg [-17.8, -6.4], weight=12%. Zarauza 2000, N=82, MD=-6.2mg [-13.1, 0.7], weight=9%. Koinig 1998, N=60, MD=-14.8mg [-22.0, -7.6], weight=8%. Pooled: MD=-10.5mg [-12.8, -8.2], p<0.001. Vertical dashed line at 0. X-axis: "Mean Difference in Morphine (mg), 95% CI". Left: "Favors Magnesium" Right: "Favors Placebo". Style: clean academic, navy squares, gold pooled diamond, light grid.]

---
```

---

## 4. additionalInstructions Patterns

Compile per-slide layout hints from the outline into a single `additionalInstructions` string. This guides Gamma's layout engine without altering content.

### Format

```
additionalInstructions: "Slide 1: full-bleed image with title overlay, minimal text.
Slide 3: two-column layout — learning objectives left, key image right.
Slide 5: data visualization dominates slide, minimal surrounding text.
Slide 8: two-column comparison table.
Slide 12: chart/graph as primary element, 3-line caption below.
Slide 15: full-width image with text overlay for key takeaway.
Data visualization slides: chart should occupy at least 60% of slide area.
Evidence slides: keep citations small but readable below main content."
```

### Common Layout Patterns

| Slide Type | Layout Hint |
|---|---|
| Title | "full-bleed image with title overlay" |
| Learning Objectives | "bulleted list, clean layout, optional icon per objective" |
| Evidence / Data | "chart or graph as primary element, minimal surrounding text" |
| Comparison | "two-column layout or comparison table" |
| Clinical Application | "algorithm or flowchart centered, step labels" |
| Key Takeaways | "numbered list with evidence level badges" |
| References | "small text, two-column, dense but readable" |

---

## 5. textOptions for Medical Contexts

Set `textOptions` based on the confirmed parameters from Step 0.

### audience

Match the audience from Step 0:
- `"anesthesia residents"` — intermediate clinical knowledge assumed
- `"medical students"` — explain fundamentals, define terms
- `"attending physicians"` — advanced, focus on nuance and evidence gaps
- `"nurses"` / `"CRNAs"` — practical application focus

### tone

| Presentation Type | Recommended Tone |
|---|---|
| Lecture | `"professional"` |
| Literature Review | `"academic"` |
| Case Presentation | `"conversational"` |
| Debate | `"professional"` |

### amount

| Presentation Type | Recommended Amount | Rationale |
|---|---|---|
| Lecture | `"medium"` | Balanced density for educational flow |
| Literature Review | `"detailed"` | Dense evidence requires more text |
| Case Presentation | `"medium"` | Narrative flow, not text-heavy |
| Debate | `"medium"` | Focused arguments, not verbose |

---

## 6. Theme Selection Workflow

Before generating, fetch themes via `GET /v1.0/themes` (see Section 1 for curl command).

### Selection Criteria for Medical Presentations

1. **Clean, professional** — avoid playful or artistic themes
2. **High contrast** — text must be readable against backgrounds
3. **Sans-serif typography** — modern, clean readability
4. **Neutral color palette** — blues, grays, whites preferred for medical authority
5. **Minimal decorative elements** — content should dominate

### Selection Process

1. Call `get_themes` and review available options
2. Filter for professional/clean themes
3. If a medical or scientific theme is available, prefer it
4. Otherwise select the most neutral professional theme
5. Pass the selected `themeId` to the `generate` call

If no suitable theme is found or `get_themes` fails, omit `themeId` and let Gamma use its default.

---

## 7. Templates by Presentation Type

### Template: Lecture

```markdown
inputText: |
  # [Title]
  ## Presenter: [Name], [Credentials]
  ## Date: [Date] | Institution: [Institution]

  [IMAGE: Photorealistic wide shot of [clinical setting relevant to topic]. Professional medical environment, clean lighting, educational tone. Style: photorealistic, 16:9 composition.]

  ---

  ## Learning Objectives
  By the end of this lecture, learners will be able to:
  1. [Objective 1 — verb from Bloom's taxonomy]
  2. [Objective 2]
  3. [Objective 3]

  ---

  ## Background and Epidemiology
  [2-3 paragraphs with inline citations: "According to Smith et al. (2023), ..."]
  [Include incidence/prevalence numbers with sources]

  ---

  ## Pathophysiology
  [Mechanism explanation with citations]

  [IMAGE: {mechanism diagram prompt per image_generation_models.md — Recraft V4 or GPT Image framework}]

  ---

  ## Evidence: [Theme 1]
  ### Key Study: [Author] et al., [Year] — [Journal]
  - Design: [RCT/meta-analysis/etc.], N=[number]
  - Findings: [Primary outcome with effect size, CI, p-value]
  - Evidence Level: [A/B/C/D]

  [IMAGE: {forest plot or bar chart prompt with exact data from evidence table}]

  ---

  ## Evidence: [Theme 2]
  [Same format — include data-viz [IMAGE:] if quantitative comparison]

  ---

  ## Current Guidelines
  [Society name] ([Year]):
  - Recommendation 1 (Grade: [Strong/Conditional])
  - Recommendation 2

  ---

  ## Clinical Application
  [Decision algorithm or practical guidance]

  [IMAGE: {flowchart or algorithm prompt — Recraft V3 SVG or Ideogram framework}]

  ---

  ## Controversies and Future Directions
  [Unresolved questions with evidence gaps]
  [Ongoing trials: NCT numbers if available]

  ---

  ## Key Takeaways
  1. [Takeaway 1] [Level A]
  2. [Takeaway 2] [Level B]
  3. [Takeaway 3]

  ---

  ## References
  1. Author A et al. Title. Journal. Year;Vol:Pages. PMID: XXXXX
  [All references, Vancouver format]
```

**Settings:**
```
textMode: "preserve"          # Required when [IMAGE:] annotations present
numCards: 20-35
imageOptions:
  source: "aiGenerated"
  style: "photorealistic"
  model: "imagen-4-pro"       # Default — override per outline's dominant model
textOptions:
  amount: "medium"
  audience: [from Step 0]
  tone: "professional"
  language: [from Step 0]
additionalInstructions: [compiled from outline — see Section 4]
```

### Template: Debate

```markdown
inputText: |
  # [Question framed as debate title]
  ## [Event/Journal Club name] | [Date]

  [IMAGE: Dramatic split-composition image representing clinical dilemma. Left side: [Option A visual]. Right side: [Option B visual]. Style: photorealistic, high contrast.]

  ---

  ## Clinical Scenario
  [Brief case vignette that frames the dilemma]

  ---

  ## Position A: [FOR statement]

  ### Evidence Supporting Position A
  1. [Author] ([Year]): [Design], N=[n]. [Key finding with numbers]. Level [X].
  2. [Author] ([Year]): [Design], N=[n]. [Key finding with numbers]. Level [X].

  [IMAGE: {grouped bar chart or forest plot with Position A data}]

  ---

  ## Position B: [AGAINST statement]

  ### Evidence Supporting Position B
  [Same format]

  [IMAGE: {grouped bar chart or forest plot with Position B data}]

  ---

  ## Head-to-Head Comparison
  | Criterion | Position A | Position B |
  |-----------|-----------|-----------|
  | Best evidence level | [Level] | [Level] |
  | Effect size | [number] | [number] |
  | Safety profile | [summary] | [summary] |
  | Guideline support | [societies] | [societies] |

  ---

  ## Synthesis
  [Balanced conclusion with clinical context]

  ---

  ## Discussion Questions
  1. [Question for audience]
  2. [Question for audience]

  ---

  ## References
  [All references, Vancouver format, both positions]
```

**Settings:**
```
textMode: "preserve"
numCards: 15-25
imageOptions:
  source: "aiGenerated"
  style: "photorealistic"
  model: "imagen-4-pro"       # Override if data-viz dominates
textOptions:
  amount: "medium"
  audience: [from Step 0]
  tone: "professional"
  language: [from Step 0]
```

### Template: Case Presentation

```markdown
inputText: |
  # [Evocative case title]
  ## Case Presentation | [Date]

  [IMAGE: Photorealistic clinical scenario matching the case context. [Specific scene description]. Style: photorealistic, cinematic lighting.]

  ---

  ## Patient Presentation
  [Demographics, chief complaint, relevant history]

  ---

  ## Initial Assessment
  [Labs, imaging, monitoring data]
  [Relevant positives AND negatives]

  ---

  ## Clinical Question
  What is your differential diagnosis?
  [List 3-5 possibilities with brief rationale]

  ---

  ## Workup and Diagnosis
  [Definitive findings with citation: "Based on [guideline] criteria..."]

  ---

  ## Management Decision
  Evidence-based options:
  - Option A: [Intervention] — supported by [Author] ([Year]), Level [X]
  - Option B: [Alternative] — supported by [Author] ([Year]), Level [X]

  ---

  ## Our Approach
  [What was actually done, rationale citing evidence]

  ---

  ## Outcome
  [Patient course, complications if any]

  [IMAGE: {line graph or time-series showing patient trajectory if data available}]

  ---

  ## Evidence Review
  [3-5 key studies supporting management]

  [IMAGE: {forest plot or summary chart if quantitative data available}]

  ---

  ## Lessons Learned
  1. [Teaching point 1] [Level X]
  2. [Teaching point 2] [Level X]
  3. [Teaching point 3] [Level X]

  ---

  ## References
  [Vancouver format]
```

**Settings:**
```
textMode: "preserve"
numCards: 15-20
imageOptions:
  source: "aiGenerated"
  style: "photorealistic"
  model: "imagen-4-pro"
textOptions:
  amount: "medium"
  audience: [from Step 0]
  tone: "conversational"
  language: [from Step 0]
```

### Template: Literature Review

```markdown
inputText: |
  # [Review question — PICO format]
  ## Literature Review | [Date]

  ---

  ## PICO Framework
  - **P**opulation: [target population]
  - **I**ntervention: [primary intervention]
  - **C**omparison: [comparator]
  - **O**utcome: [primary outcome(s)]

  ---

  ## Search Methodology
  - Databases: PubMed [, others]
  - Search terms: [key MeSH terms]
  - Date range: [start]-[end]
  - Results: [X] identified, [Y] included

  ---

  ## Evidence Landscape
  | Study Type | Count | Evidence Level |
  |-----------|-------|---------------|
  | Meta-analyses | [n] | A |
  | RCTs | [n] | A-B |
  | Cohort studies | [n] | B-C |

  [IMAGE: {bar chart showing study type distribution and evidence levels}]

  ---

  ## Theme 1: [Outcome/subtopic]
  [3-5 study summaries with full data]

  [IMAGE: {forest plot with theme 1 study data}]

  ---

  ## Theme 2: [Outcome/subtopic]
  [Same format]

  [IMAGE: {relevant data visualization for theme 2}]

  ---

  ## Theme 3: [Outcome/subtopic]
  [Same format]

  [IMAGE: {relevant data visualization for theme 3}]

  ---

  ## Quality Assessment
  [Risk of bias summary, GRADE evidence profile]

  ---

  ## Evidence Gaps
  [What's missing, populations underrepresented]

  ---

  ## Clinical Implications
  [What evidence means for practice, GRADE recommendation strength]

  ---

  ## Conclusion
  [Synthesis statement with confidence level]

  ---

  ## References
  [Comprehensive Vancouver format]
```

**Settings:**
```
textMode: "preserve"
numCards: 25-40
imageOptions:
  source: "aiGenerated"
  style: "photorealistic"
  model: "imagen-4-pro"       # Override to gpt-image-1-medium if data-viz heavy
textOptions:
  amount: "detailed"
  audience: [from Step 0]
  tone: "academic"
  language: [from Step 0]
```

---

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
KEY="$GAMMA_API_KEY" && RESPONSE=$(curl -s -X POST "https://public-api.gamma.app/v1.0/generations" \
  -H "X-API-KEY: ${KEY}" \
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

---

## Image Options Summary

### Default (non-data-viz presentations)
```json
{
  "source": "aiGenerated",
  "style": "photorealistic",
  "model": "imagen-4-pro"
}
```

### Data-viz heavy presentations
```json
{
  "source": "aiGenerated",
  "style": "photorealistic",
  "model": "gpt-image-1-medium"
}
```
### Text-in-image / infographic presentations
```json
{
  "source": "aiGenerated",
  "style": "photorealistic",
  "model": "gemini-3-pro-image"
}
```

### Model Selection from Outline

Analyze the `imageStrategy` blocks across all slides. All 45 REST API models are available — pick the best model for the dominant slide type. No tier restrictions apply.

---

## Language Parameter

Set based on user preference:
- `"en"` — English (default)
- `"it"` — Italian

The language applies to both `textOptions.language` and the `inputText` content. Write `inputText` in the target language.
