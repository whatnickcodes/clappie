# Duration-to-Slides Conversion Design

## Problem

The medical-presentations skill captures a `--duration` flag but never converts it to a target slide count. Users should be able to say "4-hour lesson" or "40 slides" interchangeably, with transparent conversion at GATE 1.

## Design Decisions

1. **Both formats are first-class** — "40 slides" and "2-hour lesson" are equally valid inputs
2. **Variable pacing by slide type** — data slides take longer than content slides
3. **Auto-calculated breaks** for sessions > 60 min (15 min per ~60 min of teaching)
4. **Multi-module option** for sessions > 60 min — user chooses at GATE 1
5. **Conversion shown transparently** at GATE 1 for user validation

## Duration Conversion Model

### Pacing Rates by Slide Type

| Slide Type | Minutes/Slide | Notes |
|---|---|---|
| Title | 1.0 | Brief intro |
| Content | 2.0 | Standard evidence delivery |
| Comparison | 2.5 | Two-column needs explanation |
| Data / Data-viz | 3.5 | Chart interpretation + discussion |
| Summary/Takeaway | 2.0 | Recap |
| Interactive/Discussion | 5.0 | Audience engagement |
| Reference | 0.5 | Quick acknowledgment |

### Break Model

| Gross Duration | Break Pattern | Net Teaching Time |
|---|---|---|
| ≤ 60 min | No breaks | = gross |
| 61–120 min | 1 × 15 min | gross − 15 |
| 121–240 min | 1 break per 50–60 min of teaching (15 min each) | gross − (breaks × 15) |
| > 240 min | Same formula, capped at 4 breaks | gross − (breaks × 15) |

### Slide-Type Distribution per Presentation Type

| Slide Type | Lecture | Debate | Case | Review |
|---|---|---|---|---|
| Title | 3% | 4% | 5% | 3% |
| Content | 55% | 45% | 40% | 40% |
| Comparison | 5% | 20% | 5% | 10% |
| Data/Data-viz | 15% | 10% | 10% | 25% |
| Interactive | 10% | 10% | 25% | 5% |
| Summary | 7% | 7% | 10% | 10% |
| Reference | 5% | 4% | 5% | 7% |

### Weighted Pacing (min/slide)

- **Lecture**: ~2.3 min/slide
- **Debate**: ~2.4 min/slide
- **Case**: ~2.7 min/slide (more interactive)
- **Review**: ~2.4 min/slide (more data)

### Example Conversions

| Input | Type | Gross | Net | Target Slides |
|---|---|---|---|---|
| "30 minutes" | Lecture | 30 min | 30 min | ~13 slides |
| "1 hour" | Lecture | 60 min | 60 min | ~26 slides |
| "2-hour lesson" | Lecture | 120 min | 105 min | ~46 slides |
| "4-hour lesson" | Lecture | 240 min | 195 min | ~85 slides |
| "4-hour lesson" | Case | 240 min | 195 min | ~72 slides |
| "40 slides" | any | — | — | 40 slides (no conversion) |

## Files to Change

### 1. `references/presentation_types.md` — new section

Add "## Duration Conversion" section after the four type definitions containing:
- Pacing rates table
- Break model table
- Slide-type distribution table
- Weighted pacing summary
- Conversion formula description

### 2. `SKILL.md` — Step 0 and Step 4 edits

**Step 0:**
- Update parameter table: Duration accepts both "40 slides" and "2 hours"
- Add parsing logic: detect slides vs time input
- For time-based input: read `presentation_types.md` § Duration Conversion, compute target slide count
- For sessions > 60 min: ask module preference at GATE 1
- Show conversion transparently at GATE 1

**Step 4:**
- Use target slide count from Step 0 instead of hardcoded "Typical Slide Count"
- If multi-module: generate module boundaries in outline

### 3. `SKILL.md` — Invocation examples

Add:
```
/medical-presentations a 4-hour university lecture on fluid management in the OR
/medical-presentations 60 slides on sepsis for ICU residents --type lecture
```

## GATE 1 Output Format (Updated)

```
I've extracted the following parameters:
- Topic: [topic]
- Type: [type]
- Language: [language]
- Audience: [audience]
- Duration: 4 hours (gross) → 195 min net (3 × 15-min breaks) → ~85 slides
- Format: [ask if > 60 min] Multi-module (4 modules of ~20 slides) or Single deck?
- Special instructions: [any]

Shall I proceed with these, or would you like to adjust anything?
```

## Files NOT Changed

- `references/slide_structure_patterns.md` — no changes needed
- `references/image_generation_models.md` — no changes needed
- `references/gamma_prompt_templates.md` — no changes needed
- `CLAUDE.md` — no changes needed (reference index already covers presentation_types.md)
