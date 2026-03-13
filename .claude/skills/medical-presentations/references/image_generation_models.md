# Image Generation Models

## Contents
- [All Available Models](#1a-all-available-models)
- [Premium Models — Prompting Frameworks](#1b-premium-models--prompting-frameworks)
- [Model Selection Matrix](#1c-model-selection-matrix)
- [Data-Driven Image Protocol](#1d-data-driven-image-protocol)
- [SPLICE Framework](#1e-splice-framework-general-reference)
- [Data Visualization Prompt Templates](#1f-data-visualization-prompt-templates)

## 1A. All Available Models

This skill uses the Gamma REST API directly (`POST /v1.0/generations` with `X-API-KEY: $GAMMA_API_KEY`). All 45 models (31 image + 7 video) are available.

### Image Models (31)

| Model | API String |
|---|---|
| Flux Fast 1.1 | `flux-1-quick` |
| Flux Kontext Fast | `flux-kontext-fast` |
| Imagen 3 Fast | `imagen-3-flash` |
| Luma Photon Flash | `luma-photon-flash-1` |
| Flux Pro | `flux-1-pro` |
| Imagen 3 | `imagen-3-pro` |
| Ideogram 3 Turbo | `ideogram-v3-turbo` |
| Luma Photon | `luma-photon-1` |
| Ideogram 3 Flash | `ideogram-v3-flash` |
| Leonardo Phoenix | `leonardo-phoenix` |
| Leonardo SDXL Gamma LoRA | `leonardo-sdxl-gamma-lora` |
| Leonardo SDXL MrPeepers LoRA | `leonardo-sdxl-mrpeepers-lora` |
| Flux Kontext Pro | `flux-kontext-pro` |
| Gemini 2.5 Flash | `gemini-2.5-flash-image` |
| Ideogram 3 | `ideogram-v3` |
| Imagen 4 | `imagen-4-pro` |
| Imagen 4 Fast | `imagen-4-fast` |
| Recraft V3 | `recraft-v3` |
| Recraft V4 | `recraft-v4` |
| Recraft V4 SVG | `recraft-v4-svg` |
| Recraft V4 Pro | `recraft-v4-pro` |
| Qwen Image | `qwen-image` |
| Qwen Image Fast | `qwen-image-fast` |
| GPT Image | `gpt-image-1-medium` |
| GPT Image Mini (low/med/high) | `gpt-image-1-mini-low` / `medium` / `high` |
| Flux Ultra | `flux-1-ultra` |
| Imagen 4 Ultra | `imagen-4-ultra` |
| DALL-E 3 | `dall-e-3` |
| Flux Kontext Max | `flux-kontext-max` |
| Recraft V3 SVG | `recraft-v3-svg` |
| Ideogram 3.0 Quality | `ideogram-v3-quality` |
| Nano Banana Pro | `gemini-3-pro-image` |
| Nano Banana Pro HD | `gemini-3-pro-image-hd` |
| GPT Image Detailed | `gpt-image-1-high` |
| Flux 2 Pro | `flux-2-pro` |
| Flux 2 Flex | `flux-2-flex` |
| Flux 2 Max | `flux-2-max` |
| Flux 2 Klein | `flux-2-klein` |

### Video Models (7)

| Model | API String |
|---|---|
| Veo 3.1 Fast | `veo-3.1-fast` |
| Veo 3.1 | `veo-3.1` |
| Luma Ray 2 Flash | `luma-ray-2-flash` |
| Luma Ray 2 | `luma-ray-2` |
| Leonardo Motion 2 Fast | `leonardo-motion-2-fast` |
| Leonardo Motion 2 | `leonardo-motion-2` |

### Key Recommendations for This Skill

| Priority | Model | API String | Use Case |
|---|---|---|---|
| 1 | Imagen 4 | `imagen-4-pro` | Photorealistic clinical scenes, anatomy |
| 2 | Nano Banana Pro | `gemini-3-pro-image` | Text-in-image, infographics, data labels |
| 3 | Recraft V4 | `recraft-v4` | Mechanism diagrams, pathway illustrations |
| 4 | GPT Image | `gpt-image-1-medium` | Complex data visualizations |
| 5 | Recraft V3 SVG | `recraft-v3-svg` | Vector flowcharts, icons |
| 6 | Gemini 2.5 Flash | `gemini-2.5-flash-image` | Text-in-image content, diagrams with labels |
| 7 | GPT Image Detailed | `gpt-image-1-high` | Highest quality data-viz |

---

## 1B. Premium Models — Prompting Frameworks

Models with specialized prompting requirements. All are available via REST API.

### Nano Banana Pro (Gemini 3 Pro Image)

**Access:** REST API (`gemini-3-pro-image`). Also `gemini-3-pro-image-hd` for higher resolution. Available in Chrome UI.

**Capabilities:**
- Best text-in-image rendering among all models
- Google Search grounding for factual accuracy
- Medical infographics with precise labels
- Scientific figures with precise text labels and data annotations

**Prompting Framework (6 Elements):**
```
Subject | Composition | Action/Content | Setting | Style | Editing
```

**Rules:**
- ALL CAPS for critical requirements (e.g., "MUST show exact values")
- Hex color codes for specific colors (e.g., `#1a5276`)
- Dashed lists for structured data
- Search grounding toggle: enable when factual accuracy matters
- Avoid negative phrasing — state what you want, not what to avoid

**Medical Examples:**

_Forest plot:_
```
Subject: Forest plot showing meta-analysis results
Composition: Academic chart layout, centered, portrait orientation
Action/Content: Meta-analysis of magnesium vs placebo for postoperative pain.
- De Oliveira et al, 2013: MD -0.87, 95% CI -1.24 to -0.51
- Albrecht et al, 2013: MD -0.74, 95% CI -1.10 to -0.38
- Pooled effect: MD -0.78, 95% CI -1.01 to -0.55, p<0.001
- Vertical line of no effect at 0
- X-axis: Mean Difference (95% CI)
MUST SHOW EXACT NUMERICAL VALUES for each study
Setting: Clean white background with subtle grid
Style: Academic textbook, sans-serif font, #2c3e50 text, #e74c3c pooled diamond
Editing: High resolution, sharp text rendering
```

_Infographic:_
```
Subject: Medical infographic on ARDS management
Composition: Vertical layout, 3 sections, top-to-bottom flow
Action/Content: Key interventions with evidence levels:
- Low tidal volume (6 mL/kg): Mortality reduction 22% [Level A]
- Prone positioning: NNT = 6 for severe ARDS [Level A]
- Conservative fluid strategy: Shorter ICU stay [Level B]
MUST LABEL each intervention with evidence level
Setting: Clean presentation slide
Style: Medical textbook, #2980b9 headers, #27ae60 evidence markers
Editing: Infographic layout with icons per section
```

_Scientific figure (grouped bar chart):_
```
Subject: Grouped bar chart reproducing study results
Composition: Academic chart layout, centered, clean white background
Action/Content: Grouped bar chart comparing Magnesium vs Placebo for postoperative outcomes.
- Title: "Figure 2: Postoperative Outcomes — IV Magnesium vs Placebo"
- X-axis categories: Pain Score 24h, Morphine 48h (mg), PONV Incidence (%)
- Magnesium group (#2980b9): 3.2, 34, 18
- Placebo group (#e74c3c): 4.8, 52, 31
- MUST LABEL exact values above each bar
- Annotation: "35% Reduction" bracket between Morphine bars
- Source: "De Oliveira et al, Anesthesiology, 2013"
Setting: Clean white background, light gray grid lines
Style: Academic publication, sans-serif font, #2c3e50 text, bold axis labels
Editing: High resolution, sharp text rendering, crisp bar edges
```

### Recraft V4

**Access:** REST API (`recraft-v4`). Also `recraft-v4-svg` (vector) and `recraft-v4-pro`. Available in Chrome UI.

**Capabilities:**
- Strong illustration and diagram generation
- Precise color palette control
- Clean labeled pathway diagrams
- Mechanism illustrations

**Prompting Framework (General to Specific):**
```
Style -> Content -> Background -> Style Detail
```

**Rules:**
- Specify hex color palette constraints explicitly
- Use synonyms when key terms are ambiguous
- No negative phrasing (don't say "no text" — say "clean, unlabeled")
- Layer detail from general composition to specific elements

**Medical Examples:**

_Mechanism diagram:_
```
Style: Clean medical illustration, flat design with subtle shadows
Content: Diagram showing magnesium's mechanism of analgesia:
  Central box: "Mg2+" with arrow blocking "NMDA Receptor"
  Downstream: reduced calcium influx -> decreased central sensitization
  Side pathway: "Voltage-gated Ca2+ channels" blocked
  Labels: each step clearly labeled in #2c3e50, 14pt sans-serif
Background: White with subtle #f0f3f4 gradient
Style Detail: Palette limited to #2980b9 (primary), #e74c3c (inhibition), #27ae60 (therapeutic effect), #7f8c8d (neutral arrows)
```

_Labeled pathway:_
```
Style: Academic medical diagram, clean lines
Content: Pain signaling pathway from peripheral nociceptor to cortex
  Step 1: Nociceptor activation (peripheral nerve ending)
  Step 2: Dorsal horn synapse (spinal cord cross-section)
  Step 3: Ascending spinothalamic tract
  Step 4: Thalamic relay
  Step 5: Somatosensory cortex
  Each step labeled with number and description
  Intervention points marked with red X for analgesic targets
Background: Light gray (#f8f9fa) with white content area
Style Detail: Anatomically simplified but accurate, #1a5276 labels, #c0392b intervention markers, directional arrows in #2c3e50
```

### GPT Image (Detailed) — `gpt-image-1-high`

**Access:** API (`gpt-image-1-high`, Ultra Only tier, 120 credits). Also available in Chrome UI.

**Capabilities:**
- Best complex instruction-following among all models
- Handles dense data layouts with many labels
- Accurate numeric rendering in charts
- Multi-element compositions

**Prompting Framework (Segmented Labeled):**
```
Background/Context -> Subject + Details -> Constraints -> Style -> Quality
```

**Rules:**
- Use quality="high" for dense data layouts
- Specify exact values for all data points
- Use labeled segments, not paragraphs
- Separate visual elements clearly

**Medical Examples:**

_Forest plot:_
```
Background: Clean white academic chart background with light gray grid lines
Subject: Forest plot meta-analysis showing 6 RCTs comparing IV magnesium vs placebo for postoperative pain reduction
Details:
  Study 1: De Oliveira 2013, N=429, MD=-0.87 [-1.24, -0.51], weight=18%
  Study 2: Albrecht 2013, N=384, MD=-0.74 [-1.10, -0.38], weight=16%
  Study 3: Shin 2020, N=120, MD=-1.12 [-1.78, -0.46], weight=10%
  Study 4: Zarauza 2000, N=82, MD=-0.45 [-1.32, 0.42], weight=8%
  Study 5: Koinig 1998, N=60, MD=-1.35 [-2.18, -0.52], weight=7%
  Study 6: Pooled: MD=-0.82 [-1.05, -0.59], p<0.001
Constraints: Each study = square proportional to weight + horizontal CI line. Pooled = diamond. Vertical dashed line at x=0.
Style: Academic publication quality, navy (#1a3a5c) squares, gold (#d4a017) pooled diamond, sans-serif labels
Quality: high
```

_Time-series:_
```
Background: Clean white with light grid, textbook-style page margins
Subject: Line graph showing morphine consumption over 48 hours post-surgery
Details:
  Control group (blue #2980b9): 0h=0mg, 6h=12mg, 12h=22mg, 24h=38mg, 36h=48mg, 48h=52mg
  Magnesium group (green #27ae60): 0h=0mg, 6h=8mg, 12h=14mg, 24h=24mg, 36h=30mg, 48h=34mg
  X-axis: "Time (hours)" from 0 to 48
  Y-axis: "Cumulative Morphine (mg)" from 0 to 60
Constraints: Data points marked with filled circles. Annotation arrow: "35% Reduction" between curves at 48h.
Style: Academic, sans-serif, clean lines
Quality: high
```

_Cumulative incidence:_
```
Background: White academic chart area with thin border
Subject: Cumulative incidence curve of chronic post-surgical pain at 6 months
Details:
  Magnesium group (orange #e67e22): 5% at 1mo, 8% at 2mo, 10% at 3mo, 11% at 6mo
  Control group (blue #3498db): 8% at 1mo, 15% at 2mo, 20% at 3mo, 24% at 6mo
  X-axis: "Months After Surgery" 0-6
  Y-axis: "Cumulative Incidence (%)" 0-30
Constraints: Shaded area between curves. Error bars at each time point. Caption: "Figure 3. p=0.008, HR 0.54 (0.34-0.86)"
Style: Academic publication, clean, labeled
Quality: high
```

### GPT Image (Standard) — `gpt-image-1-medium`

**Access:** API (`gpt-image-1-medium`, Standard tier, 30 credits). Also available in Chrome UI.

**Capabilities:**
- Same framework as GPT Image Detailed at lower quality/cost
- Good balance of instruction-following and cost for most data-viz slides
- Suitable for simple-to-moderate data visualizations

**Use the same Segmented Labeled framework as GPT Image (Detailed)**, but omit `Quality: high` (defaults to medium). Best for bar charts, simple line graphs, and illustrations that don't require extremely dense data.

---

## 1C. Model Selection Matrix

Maps content type to recommended model and API string. All models available via REST API.

| Content Type | Primary Model | API String | Fallback |
|---|---|---|---|
| Photorealistic clinical scene | Imagen 4 | `imagen-4-pro` | `imagen-3-pro` |
| Forest plot with study data | GPT Image Detailed | `gpt-image-1-high` | `gpt-image-1-medium` |
| Bar/line chart with numeric labels | GPT Image | `gpt-image-1-medium` | `gemini-2.5-flash-image` |
| Kaplan-Meier / incidence curve | GPT Image Detailed | `gpt-image-1-high` | `gpt-image-1-medium` |
| Scientific figure with text labels | Nano Banana Pro | `gemini-3-pro-image` | `gpt-image-1-high` |
| Infographic with text labels | Nano Banana Pro | `gemini-3-pro-image` | `gemini-2.5-flash-image` |
| Mechanism / pathway diagram | Recraft V4 | `recraft-v4` | `recraft-v3` |
| Branded illustration | Recraft V3 | `recraft-v3` | `recraft-v4` |
| Vector flowchart / icons | Recraft V3 SVG | `recraft-v3-svg` | `recraft-v4-svg` |
| Anatomical illustration | Imagen 4 | `imagen-4-pro` | `recraft-v4` |
| Clinical equipment / OR scene | Imagen 4 | `imagen-4-pro` | `flux-1-pro` |
| Text-heavy diagram with labels | Nano Banana Pro | `gemini-3-pro-image` | `gemini-2.5-flash-image` |

---

## 1D. Data-Driven Image Protocol

For slides requiring charts/graphs with real study data (forest plots, bar charts, KM curves, line graphs).

### Purpose: Reproducing Scientific Article Figures

Every data-viz image should look like it belongs in a published paper. The goal is not decorative illustration but **faithful reproduction of key figures from cited studies** using data extracted during evidence curation. This means:

- **Data fidelity** — exact values from the source article, not approximations
- **Scientific conventions** — figure numbers, axis labels with units, legends, statistical annotations, source captions
- **Chart type accuracy** — the chart type must match how the data was originally presented or how it is best communicated (forest plot for meta-analysis, KM curve for time-to-event, etc.)
- **Clinical communication annotations** — callouts like "25% Reduction" arrows, NNT labels, or significance markers that make the figure immediately interpretable for the audience

The image model renders the figure; the data and structure come entirely from the evidence table (Step 3).

### Step-by-Step Protocol

1. **Extract exact values** from the evidence table (Step 3):
   - Study names and years
   - Effect sizes (MD, RR, OR, HR) with confidence intervals
   - p-values
   - Sample sizes (N per group, total)
   - Percentages and rates at specific time points
   - Time-point curve data (values at each measured interval for line graphs / KM curves)
   - Number at risk at each time point (for survival analyses)
   - Per-study weights (for forest plots / meta-analyses)

1.5. **Identify the source figure** for each data-viz image. Classify as one of:
   - **Direct reproduction** — replicating a specific figure from an article (e.g., "reproduce Figure 3 from De Oliveira 2013")
   - **Synthesized from text/tables** — assembling a figure from data scattered across the article's text, tables, or supplementary materials
   - **Composite from multiple studies** — combining data from 2+ studies into a single figure (e.g., a forest plot from a meta-analysis)

   Record this as `figureSource` in the slide's `imageStrategy` block.

2. **Choose chart type** matching the data structure:
   - **Forest plot** — meta-analysis with multiple studies showing pooled effect
   - **Grouped bar chart** — discrete comparisons across categories/time points
   - **Kaplan-Meier / cumulative incidence curve** — time-to-event data
   - **Line graph** — continuous outcomes over time (e.g., pain scores, drug levels)
   - **Stacked bar / waterfall** — component breakdowns, sequential effects

3. **Build structured prompt** using the model-specific framework (Section 1B) with:
   - Chart type and title (include figure number)
   - Every data row with exact numbers
   - Axis labels with units and ranges
   - Statistical annotations (pooled effect, p-values, % differences)
   - Visual style: hex color palette, background style
   - Legend specification

4. **Verify after generation**: cross-reference every visible value against source data

5. **Fallback**: if AI-generated values don't match source data after 2 regeneration attempts, flag the slide for manual correction and include source data in the companion evidence document

### Verification Checklist

For each data-viz image, verify:
- [ ] All study names/labels are correct
- [ ] All numeric values match source data (effect sizes, CIs, p-values)
- [ ] Axis labels and ranges are appropriate
- [ ] Direction of effect is correct (favors intervention vs control on correct side)
- [ ] Legend matches the data series
- [ ] Statistical annotations are accurate

---

## 1E. SPLICE Framework (General Reference)

For non-data-viz images (clinical scenes, procedures, concepts):

```
S — Style & Medium: photorealistic, illustration, diagram, watercolor, etc.
P — Perspective & Composition: close-up, wide shot, overhead, centered, rule-of-thirds
L — Lighting & Atmosphere: studio lighting, natural, dramatic, warm/cool temperature
I — Identity of Subject: specific clinical scenario, anatomy, equipment, procedure
C — Cultural & Contextual Details: clinical setting, PPE, patient demographics, locale
E — Emotion & Energy: calm clinical environment, urgency of emergency, educational tone
```

Use SPLICE for `photorealistic` and `illustration` image types. For `data-viz` and `infographic` types, use the model-specific frameworks in Section 1B instead.

---

## 1F. Data Visualization Prompt Templates

Concrete templates derived from target examples. Replace placeholders `[...]` with actual data from the evidence table.

### Forest Plot Template

```
Forest plot showing meta-analysis of [intervention] vs [comparator] for [outcome].
Title: "Figure [N]: Meta-analysis of [intervention] vs [comparator] — [outcome] ([K] RCTs)"

Studies (top to bottom):
  [Author1] et al, [Year]: [point estimate], 95% CI [[lower]-[upper]], N=[n], weight=[w]%
  [Author2] et al, [Year]: [point estimate], 95% CI [[lower]-[upper]], N=[n], weight=[w]%
  [Author3] et al, [Year]: [point estimate], 95% CI [[lower]-[upper]], N=[n], weight=[w]%
  [repeat for each study]

Pooled effect: diamond at bottom showing [pooled estimate], 95% CI [[lower]-[upper]], p=[value]
Vertical dashed line of no effect at [0 for MD | 1.0 for RR/OR]
X-axis: "[Mean Difference | Risk Ratio | Odds Ratio] (95% CI)"
Left label: "Favors [intervention]" | Right label: "Favors [comparator]"
Caption: "Pooled [MD/RR/OR]: [value] ([CI]), I2=[heterogeneity]%"

Style: clean academic, [color scheme] color scheme, light grid background
Each study shown as square (proportional to weight) with horizontal CI line
Diamond for pooled effect
```

### Grouped Bar Chart Template

```
Grouped bar chart comparing [Group A] vs [Group B] across [categories/time points].
Title: "[Outcome] — [Group A] vs [Group B]"

X-axis: [Category label] — values: [list categories/time points]
Y-axis: [Metric] ([unit]) — range [min] to [max]

For each category, two bars:
  [Group A] ([hex color]): [exact value] [unit]
  [Group B] ([hex color]): [exact value] [unit]
  [repeat for each category]

Each bar labeled with exact value above or inside
Legend: [Group A hex] = [Group A name], [Group B hex] = [Group B name]
Source: "[Author] et al, [Journal], [Year]"

Style: clean presentation slide, white background, bold section headers
Annotation: "[X]% difference" with bracket between key bars if applicable
```

### Cumulative Incidence / Kaplan-Meier Curve Template

```
[Cumulative incidence | Kaplan-Meier survival] curve of [outcome] over [timeframe].
Title: "Figure [N]: [Outcome] — [Group A] vs [Group B]"

X-axis: Time Since [event] ([unit]) — 0 to [max]
Y-axis: [Cumulative Incidence (%) | Survival Probability] — [0 to 100 | 0.0 to 1.0]

Curves:
  [Group A] ([hex color, e.g., #e67e22]): [value]% at [time1], [value]% at [time2], [value]% at [time3]
  [Group B] ([hex color, e.g., #3498db]): [value]% at [time1], [value]% at [time2], [value]% at [time3]

Error bars / confidence bands at [interval] intervals
Shaded area between curves highlighting difference
Number at risk table below x-axis (if available)

Caption: "Figure [N]. [description]. [HR/RR] [value] (95% CI [lower]-[upper]), p=[value]"
Style: academic publication, clean white background, labeled curves
```

### Time-Series Line Graph Template

```
Line graph showing [metric] over [timeframe] for [number] groups.
Title: "Figure [N]: [Metric] Over Time — [Intervention] vs [Control]"

X-axis: Time ([unit]) — 0 to [max], intervals of [step]
Y-axis: [Metric] ([unit]) — [min] to [max]

Curves with data points:
  [Group A / Control] ([hex color]): values at t=[t1]:[v1], t=[t2]:[v2], t=[t3]:[v3], ...
  [Group B / Intervention] ([hex color]): values at t=[t1]:[v1], t=[t2]:[v2], t=[t3]:[v3], ...

Data points marked with filled circles
Annotation: "[X]% Reduction" with dashed arrow between curves at peak divergence point
Grid background with light gray lines

Caption: "Figure [N]: [description]. Data represents [mean/median] values +/- [SD/SEM/IQR]."
Source: "[Author] et al, [Journal], [Year]"
Style: [academic textbook | clean presentation], labeled, grid lines
```

### Infographic Template

```
Medical infographic summarizing [topic / key interventions].
Title: "[Topic] — Evidence-Based Summary"

Sections (top to bottom):
  Section 1: [Intervention/Finding] — [key statistic] [Level X]
  Section 2: [Intervention/Finding] — [key statistic] [Level X]
  Section 3: [Intervention/Finding] — [key statistic] [Level X]

Each section includes:
  - Icon or mini-illustration representing the intervention
  - Bold headline with the finding
  - Supporting statistic with source
  - Evidence level badge

Color palette: [hex primary], [hex secondary], [hex accent]
Layout: vertical flow with connecting arrows or numbered steps
Style: clean medical infographic, sans-serif, professional
Footer: "Based on [N] studies, [date range]"
```
