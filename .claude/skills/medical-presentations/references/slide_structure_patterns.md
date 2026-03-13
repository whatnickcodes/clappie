# Slide Structure Patterns

## Contents
- [Slide Types](#slide-types) — Title, Content, Comparison, Data, Methods Companion, Summary, Reference
- [Formatting Rules](#formatting-rules) — Assertion headings, bullets, intervention reproducibility, image guidance, speaker notes, color

## Slide Types

### Title Slide
- **Heading**: Presentation title (concise, assertion-optional)
- **Subtitle**: Presenter name, credentials, institution
- **Footer**: Date, event/conference name
- **Image**: Relevant clinical or abstract medical image
- **Notes**: No speaker notes needed

### Content Slide
- **Heading**: Assertion-style (states the takeaway, not the topic)
  - Good: "Lung-protective ventilation reduces mortality in ARDS"
  - Bad: "Lung-protective ventilation"
- **Body**: 3-5 bullet points maximum
  - First level: key claims
  - Second level: supporting detail (sparingly)
- **Citation**: Inline `(Author, Year)` on every evidence-based claim
- **Image**: Optional — clinical photo, diagram, or algorithm
- **Notes**: Expanded talking points, additional citations, transition to next slide

### Comparison Slide
- **Heading**: Assertion or neutral comparison title
- **Layout**: Two-column or table format
- **Columns**: Intervention A vs Intervention B
- **Rows**: Mechanism, efficacy, safety, cost, evidence level
- **Highlight**: Bold or color the "winner" per row when evidence supports it
- **Notes**: Nuances not visible in the table, specific study details

### Data Slide
- **Heading**: Assertion stating the data's main finding
- **Visual**: Chart, graph, or forest plot (primary element)
- **Source**: Full citation below the visual
- **Annotation**: Key numbers called out (p-value, CI, NNT, effect size)
- **Minimize text**: Let the visual communicate
- **Notes**: How to interpret the data, limitations, context

### Methods Companion Slide
- **When**: Follows a Data Slide when intervention/control description > 20 words
- **Heading**: Same assertion as the preceding Data Slide, appended with ": Methods"
- **Body**:
  - **Intervention**: Protocol details (drug, dose, route, timing, duration)
  - **Control**: Protocol details (standard care description, comparator specifics)
  - **Population**: Key inclusion criteria (N, setting)
- **Image**: None (text-only slide) or same imageType as preceding data slide
- **Notes**: Additional methodological details, exclusion criteria

### Summary/Takeaway Slide
- **Heading**: "Key Takeaways" or "Clinical Pearls"
- **Body**: 3-5 numbered points
  - Each maps to a learning objective (for lectures)
  - Each includes evidence level in brackets: `[Level A]`
- **No new information**: Only synthesis of what was presented
- **Notes**: Recap of the narrative arc

### Reference Slide
- **Heading**: "References" or "Selected References"
- **Format**: Vancouver style (numbered), sorted by appearance order
- **Font**: Smaller than body text (readable but not primary focus)
- **Split**: Multiple slides if >15 references
- **Include**: DOI or PMID for each where available

## Formatting Rules

### Assertion-Style Headings
Every content slide heading should state a conclusion, not a topic:

| Topic heading (avoid) | Assertion heading (use) |
|----------------------|------------------------|
| "Propofol pharmacology" | "Propofol provides rapid onset with predictable recovery" |
| "ARDS ventilation strategies" | "Low tidal volume ventilation is the standard of care in ARDS" |
| "Pain management options" | "Multimodal analgesia reduces opioid consumption by 30-50%" |

Exception: Title slides and reference slides use descriptive headings.

### Bullet Point Patterns
- **Parallel structure**: All bullets in a list use the same grammatical form
- **Front-load key information**: Most important word/phrase first
- **One idea per bullet**: Split compound statements
- **Evidence tagging**: End clinical claims with `(Author, Year)` or `[Level X]`
- **Maximum depth**: Two levels only (bullet + sub-bullet)

### Intervention Reproducibility Rule

Every Data Slide comparing intervention vs control must specify both protocols with enough detail for the viewer to replicate the intervention. Apply this threshold:

- **≤ 20 words** (intervention + control description combined): include below the chart on the Data Slide itself, above the citation
- **> 20 words**: add a **Methods Companion Slide** immediately after the Data Slide and increment the slide count

This rule applies during Step 4 outline generation. The Segment C subagent counts words for each intervention/control pair from the Figure Data Extraction Table's Intervention Protocol and Control Protocol columns.

### Image Guidance (Enhanced)

#### 3A. Image Type Taxonomy

| Image Type | Description | Recommended Models | API String |
|---|---|---|---|
| `photorealistic` | Clinical scenes, anatomy, equipment, procedures | Imagen 4 | `imagen-4-pro` |
| `illustration` | Medical illustrations, anatomical drawings | Recraft V4, Imagen 4 | `recraft-v4`, `imagen-4-pro` |
| `vector` | Flowcharts, algorithms, icon-based diagrams | Recraft V3 SVG | `recraft-v3-svg` |
| `infographic` | Text-heavy summary visuals with labels and sections | Nano Banana Pro, Gemini 2.5 Flash | `gemini-3-pro-image`, `gemini-2.5-flash-image` |
| `data-viz` | Scientific article figures reproduced from study data: forest plots, bar charts, KM curves, line graphs. Includes figure number, title, axis labels, statistical annotations, and source caption. | GPT Image, GPT Image Detailed, Nano Banana Pro | `gpt-image-1-medium`, `gpt-image-1-high`, `gemini-3-pro-image` |

See `image_generation_models.md` for full model details, prompting frameworks, and the model selection matrix.

#### 3B. imageStrategy Block Format

For each slide in the Step 4 outline, include an `imageStrategy` block specifying the image approach:

```yaml
imageStrategy:
  imageType: data-viz | photorealistic | illustration | vector | infographic
  targetModel: [API string from selection matrix]
  figureSource: direct | synthesized | composite  # for data-viz only
  imagePrompt: |
    [Full prompt built from templates in image_generation_models.md]
    [Include all data points for data-viz types]
  dataVerificationRequired: true | false
```

**Field descriptions:**
- `imageType` — from the taxonomy above; determines prompt framework
- `targetModel` — API model string (e.g., `gpt-image-1-high`, `imagen-4-pro`, `gemini-3-pro-image`)
- `imagePrompt` — complete prompt following the model-specific framework from `image_generation_models.md`
- `dataVerificationRequired` — `true` for any `data-viz` or `infographic` slide with exact numeric values

**At GATE 4** (Step 5), present imageStrategy as a compact summary table:

```
| Slide | Type | Image Type | Target Model | Verification |
|-------|------|-----------|--------------|-------------|
| 1     | Title | photorealistic | Imagen 4 Pro | No |
| 5     | Evidence | data-viz | GPT Image Detailed | Yes |
| 8     | Mechanism | illustration | Recraft V3 | No |
```

Full prompts are available on request but not shown by default to keep the checkpoint concise.

#### 3C. Per-Slide-Type Prompt Patterns

Reference prompts for common slide types. Use the model-specific frameworks from `image_generation_models.md` and adapt these skeletons:

**Title slide:**
```
Photorealistic wide shot of [clinical setting relevant to topic].
Professional medical environment, clean lighting, educational tone.
Style: photorealistic, 16:9 composition, shallow depth of field.
```

**Evidence slide (scientific figure reproduction):**
```
Figure [N]: [Chart type] reproducing [source figure or synthesized data] from [Author, Year].
[Full dataset extracted from the evidence table]
Axis labels with units, statistical annotations (p-value, CI, effect size).
Source caption: "[Author] et al, [Journal], [Year]"
See data-viz templates in image_generation_models.md for model-specific prompts.
```

**Comparison slide:**
```
Split composition or side-by-side: [Option A] vs [Option B].
Left panel: [visual representation of A]. Right panel: [visual representation of B].
Clean dividing line, matching style on both sides.
```

**Data slide:**
```
[Use forest plot / bar chart / KM curve / line graph template from image_generation_models.md]
[Include ALL data points from the evidence table]
```

**Mechanism slide:**
```
Medical diagram showing [pathway/mechanism].
[Labeled steps from start to end]
[Color-coded: intervention points in red, therapeutic effects in green]
Clean academic style, white background.
```

**Summary slide:**
```
Medical infographic summarizing [N] key takeaways.
[Numbered list with evidence levels]
Clean, professional, icon per takeaway.
```

#### 3D. Data Verification Protocol

For slides where `dataVerificationRequired: true`:

1. **Before generation**: confirm all values in the imagePrompt match the evidence table from Step 3
2. **After MCP generation** (Step 6): note these slides for verification in Step 7
3. **During Chrome review** (Step 7): visually inspect each data-viz slide:
   - [ ] Study names/labels match source
   - [ ] Numeric values (effect sizes, CIs, p-values) match source
   - [ ] Axis labels and ranges are correct
   - [ ] Direction of effect is correct
   - [ ] Legend and annotations are accurate
4. **If discrepancy found**: regenerate with corrected/more explicit prompt (up to 2 attempts)
5. **If still incorrect after 2 attempts**: flag for user with note "AI-generated values approximate — verify against evidence table"

### Speaker Notes Format
```
[TRANSITION]: How this connects from the previous slide
[KEY POINT]: The main message of this slide
[EVIDENCE]: Full citation and context for the claim
[CLINICAL TIP]: Practical application note
[TIMING]: Approximate time to spend on this slide
```

### Color and Emphasis
- **Bold**: Key terms, drug names, critical values
- **Color highlight**: Statistically significant results, safety warnings
- **Red/warning**: Contraindications, critical safety information
- **Green/positive**: Recommended practices, positive outcomes
