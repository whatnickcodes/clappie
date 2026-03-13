# Presentation Types

## Lecture

### Purpose
Structured educational presentation delivering evidence-based knowledge on a clinical topic to a defined audience (residents, students, peers).

### Structural Elements
1. **Title slide** — topic, presenter, date, institution
2. **Learning objectives** — 3-5 measurable objectives (Bloom's taxonomy: explain, compare, apply)
3. **Background/Epidemiology** — why this topic matters, incidence, prevalence
4. **Pathophysiology/Mechanism** — underlying science relevant to clinical application
5. **Clinical Evidence** — systematic presentation of key studies (chronological or thematic)
6. **Current Guidelines** — society recommendations (ASA, ESA, ESAIC, SCCM)
7. **Clinical Application** — practical algorithms, decision trees, case vignettes
8. **Controversies/Future Directions** — unresolved questions, ongoing trials
9. **Key Takeaways** — 3-5 bullet summary, one per learning objective
10. **References** — formatted citations

### Typical Slide Count
20-35 slides for 30-45 minutes

### Audience Expectations
- Progressive complexity: basics → advanced
- Evidence citations on every clinical claim
- Practical takeaways they can use next shift

### Evidence Mapping
- Background: Level C-D acceptable (descriptive)
- Clinical evidence: Level A-B preferred, at least 3 studies
- Guidelines: Current (within 5 years) from recognized societies
- Controversies: Any level, clearly labeled

---

## Debate

### Purpose
Two-position presentation arguing for and against a clinical practice or intervention. Used in journal clubs, grand rounds, or teaching sessions.

### Structural Elements
1. **Title slide** — topic framed as a question (e.g., "Propofol vs Sevoflurane for cardiac surgery: which is superior?")
2. **Clinical scenario** — case vignette framing the dilemma
3. **Position A: FOR** (4-6 slides)
   - Key supporting evidence (strongest studies first)
   - Mechanistic rationale
   - Guideline support
4. **Position B: AGAINST** (4-6 slides)
   - Key opposing evidence
   - Limitations of Position A evidence
   - Alternative mechanistic arguments
5. **Head-to-head comparison** — summary table comparing evidence quality, effect sizes
6. **Synthesis** — balanced conclusion with clinical context
7. **Audience poll/discussion** — structured prompt for audience engagement
8. **References** — both positions

### Typical Slide Count
15-25 slides for 20-30 minutes

### Audience Expectations
- Fair representation of both sides
- Clear evidence quality labeling per position
- Honest about evidence gaps
- Engaging — audience should feel the tension

### Evidence Mapping
- Each position: minimum 2 Level A-B studies
- Head-to-head: prioritize direct comparison studies
- Flag when one position has clearly stronger evidence (don't force false equivalence)

---

## Case Presentation

### Purpose
Clinical case-based presentation that teaches through a patient narrative. Evidence is integrated as the case unfolds rather than presented systematically.

### Structural Elements
1. **Title slide** — case title (anonymized, evocative: "The Unexpected Difficult Airway")
2. **Patient presentation** — demographics, chief complaint, history
3. **Initial assessment** — exam findings, labs, imaging
4. **Clinical question #1** — "What is your differential?" (audience engagement)
5. **Workup and diagnosis** — reveal with supporting evidence
6. **Management decision point** — "How would you manage this?" (evidence-based options)
7. **What we did** — actual management with outcome
8. **Evidence review** — targeted literature supporting the management approach
9. **Complications/follow-up** — what happened, was it expected?
10. **Lessons learned** — 3-5 teaching points with evidence level
11. **References**

### Typical Slide Count
15-20 slides for 15-25 minutes

### Audience Expectations
- Narrative arc — tells a story
- Interactive decision points (even if presentation, not live)
- Evidence woven into the story, not dumped separately
- Honest about complications and what could be done differently

### Evidence Mapping
- Diagnosis: supportive guidelines/criteria
- Management: Level A-B for primary intervention
- Complications: case series or larger studies showing incidence
- Teaching points: linked to specific evidence levels

---

## Literature Review

### Purpose
Comprehensive overview of the current evidence landscape on a focused clinical question. Synthesizes multiple studies into a cohesive narrative with quality assessment.

### Structural Elements
1. **Title slide** — review question (PICO format preferred)
2. **PICO framework** — Population, Intervention, Comparison, Outcome
3. **Search methodology** — databases, terms, inclusion/exclusion, PRISMA-style summary
4. **Evidence landscape** — how many studies found, quality distribution, timeline
5. **Thematic analysis** (grouped by outcome or intervention variant)
   - Theme 1: 3-5 slides with study summaries and forest-plot-style data
   - Theme 2: 3-5 slides
   - Theme 3: 3-5 slides
6. **Quality assessment** — risk of bias summary, GRADE table
7. **Evidence gaps** — what's missing, where is more research needed
8. **Clinical implications** — what the evidence means for practice
9. **Conclusion** — synthesis statement with confidence level
10. **References** — comprehensive, formatted

### Typical Slide Count
25-40 slides for 30-50 minutes

### Audience Expectations
- Methodological rigor visible
- Quantitative where possible (effect sizes, NNT, CI)
- Transparent about limitations
- Clear bottom-line message despite complexity

### Evidence Mapping
- All levels included with explicit quality labels
- Evidence table required (minimum 10 studies)
- GRADE summary table for primary outcomes
- Forest plot or summary figure if meta-analytic data available

---

## Duration Conversion

When a user specifies a time-based duration (e.g., "4-hour lesson") instead of a slide count, convert to a target slide count using the model below.

### Input Formats

| Format | Examples | Handling |
|---|---|---|
| Slide count | "40 slides", "30 cards", "60 slides" | Use directly as target — no conversion needed |
| Time duration | "30 minutes", "2 hours", "4-hour lesson" | Convert using pacing model below |
| Neither specified | — | Use type-dependent default from Typical Slide Count above |

### Break Model

For sessions > 60 minutes, auto-calculate breaks (user can override at GATE 1):

| Gross Duration | Break Pattern | Net Teaching Time |
|---|---|---|
| ≤ 60 min | No breaks | = gross |
| 61–120 min | 1 × 15 min | gross − 15 |
| 121–240 min | 1 break per 50–60 min of teaching, 15 min each | gross − (breaks × 15) |
| > 240 min | Same formula, capped at 4 breaks | gross − (breaks × 15) |

### Pacing Rates by Slide Type

| Slide Type | Minutes/Slide |
|---|---|
| Title | 1.0 |
| Content | 2.0 |
| Comparison | 2.5 |
| Data / Data-viz | 3.5 |
| Summary/Takeaway | 2.0 |
| Interactive/Discussion | 5.0 |
| Reference | 0.5 |

### Slide-Type Distribution by Presentation Type

| Slide Type | Lecture | Debate | Case | Review |
|---|---|---|---|---|
| Title | 3% | 4% | 5% | 3% |
| Content | 55% | 45% | 40% | 40% |
| Comparison | 5% | 20% | 5% | 10% |
| Data/Data-viz | 15% | 10% | 10% | 25% |
| Interactive | 10% | 10% | 25% | 5% |
| Summary | 7% | 7% | 10% | 10% |
| Reference | 5% | 4% | 5% | 7% |

### Weighted Average Pacing

Computed from distributions × pacing rates:

| Type | Avg min/slide |
|---|---|
| Lecture | 2.3 |
| Debate | 2.4 |
| Case | 2.7 |
| Review | 2.4 |

### Conversion Formula

1. Parse gross duration from user input
2. Compute net teaching time using break model
3. Divide net time by weighted avg pacing for the presentation type
4. Round to nearest 5 slides

### Quick Reference

| Input | Type | Net min | Target Slides |
|---|---|---|---|
| "30 minutes" | Lecture | 30 | ~13 |
| "1 hour" | Lecture | 60 | ~26 |
| "2-hour lesson" | Lecture | 105 | ~45 |
| "4-hour lesson" | Lecture | 195 | ~85 |
| "4-hour lesson" | Case | 195 | ~70 |
