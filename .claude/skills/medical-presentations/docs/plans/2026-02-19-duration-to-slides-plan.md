# Duration-to-Slides Conversion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable the medical-presentations skill to accept both slide counts ("40 slides") and time durations ("4-hour lesson"), with transparent conversion and multi-module support.

**Architecture:** Add a Duration Conversion section to `references/presentation_types.md` containing the pacing model and conversion tables. Update SKILL.md Step 0 to parse both input formats, compute target slide count, and present the conversion at GATE 1. Update Step 4 to use the computed target instead of hardcoded ranges.

**Tech Stack:** Markdown skill files only (no code). Changes touch 2 files: `references/presentation_types.md` and `SKILL.md`.

---

### Task 1: Add Duration Conversion section to presentation_types.md

**Files:**
- Modify: `references/presentation_types.md` (append after line 142, after the Literature Review section)

**Step 1: Append the Duration Conversion section**

Add the following after the `## Literature Review` section (after line 142):

```markdown
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
```

**Step 2: Verify the edit**

Read `references/presentation_types.md` and confirm:
- The Duration Conversion section appears after line 142
- All 6 subsections are present (Input Formats, Break Model, Pacing Rates, Distribution, Weighted Average, Quick Reference)
- No content was lost from the existing file

**Step 3: Commit**

```bash
git add references/presentation_types.md
git commit -m "feat: add duration-to-slides conversion model to presentation_types.md"
```

---

### Task 2: Update SKILL.md Step 0 parameter table and parsing

**Files:**
- Modify: `SKILL.md:51-61` (parameter table in Step 0)

**Step 1: Replace the parameter table**

Replace the current parameter table (lines 51-61) with:

```markdown
| Parameter | Source | Default |
|-----------|--------|---------|
| **Topic** | Required from input | — |
| **Type** | `--type` flag or inferred from keywords ("debate", "case", "review", "lecture") | `lecture` |
| **Language** | `--lang` flag or inferred | `en` |
| **Audience** | `--audience` flag or inferred | `medical professionals` |
| **Length** | Slide count ("40 slides") or time duration ("2 hours", "4-hour lesson") from input or `--duration` flag | Type-dependent (see `references/presentation_types.md`) |
| **Special instructions** | Any remaining context | none |
```

**Step 2: Verify the edit**

Read `SKILL.md` lines 49-62 and confirm the table has 6 rows with `Length` replacing `Duration`, and the description mentions both formats.

---

### Task 3: Add duration parsing logic to SKILL.md Step 0

**Files:**
- Modify: `SKILL.md` (insert after the parameter table, before GATE 1)

**Step 1: Insert parsing instructions**

Insert the following after the parameter table and before `**GATE 1 of 5**`:

```markdown
**Length resolution** — read `references/presentation_types.md` § Duration Conversion:

1. If the user specified a **slide count** (e.g., "40 slides"): use directly as target slide count
2. If the user specified a **time duration** (e.g., "4 hours"):
   - Compute net teaching time using the break model
   - Divide by the weighted average pacing for the confirmed type
   - Round to nearest 5 slides
3. If **neither** specified: use the Typical Slide Count range for the confirmed type
4. For sessions > 60 min net: prepare a **module question** for GATE 1 (multi-module vs single deck)
```

**Step 2: Verify the edit**

Read the area around the parameter table and confirm the 4-point parsing logic appears between the table and GATE 1.

---

### Task 4: Update GATE 1 output format in SKILL.md

**Files:**
- Modify: `SKILL.md:62-76` (GATE 1 block)

**Step 1: Replace the GATE 1 confirmation block**

Replace the current GATE 1 block with:

~~~markdown
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
~~~

**Step 2: Verify the edit**

Read the GATE 1 section and confirm it shows all three length variants (time-based, slide-based, default) and includes the module question for long sessions.

---

### Task 5: Update SKILL.md Step 4 to use target slide count

**Files:**
- Modify: `SKILL.md:221-232` (Step 4 outline generation instructions)

**Step 1: Update the outline generation instructions**

In Step 4, find the line "5. Target slide count per presentation type" and replace it with:

```markdown
5. Use the **target slide count** from Step 0 (not the default range from presentation_types.md)
6. If multi-module format was selected: divide slides into modules of roughly equal size, each with its own title slide and summary. Insert module break markers in the outline.
```

Renumber the subsequent item (currently "6. **Build imageStrategy...**") to "7."

**Step 2: Verify the edit**

Read Step 4 and confirm the numbered list references the Step 0 target and includes module boundary logic.

---

### Task 6: Update SKILL.md invocation examples

**Files:**
- Modify: `SKILL.md:20-24` (invocation examples block)

**Step 1: Add duration and slide-count examples**

Add two new examples to the invocation block:

```
/medical-presentations a 4-hour university lecture on fluid management in the OR for anesthesia residents
/medical-presentations 60 slides on sepsis management --type lecture --audience "ICU residents"
```

**Step 2: Verify the edit**

Read the invocation block and confirm it has 5 examples (3 existing + 2 new).

---

### Task 7: Update Workflow State tracker description

**Files:**
- Modify: `SKILL.md:39-46` (Workflow State section)

**Step 1: Update the Slides field description**

In the Workflow State section, update the Slides bullet to mention it comes from the duration conversion:

```markdown
- **Slides**: target slide count from duration conversion (after Step 0), actual outline count (after Step 4)
```

**Step 2: Verify the edit**

Read lines 39-46 and confirm the Slides field description references duration conversion.

---

### Task 8: Verify SKILL.md line count and commit all SKILL.md changes

**Step 1: Count lines**

```bash
wc -l SKILL.md
```

Expected: ~430-445 lines (was 417, adding ~15-25 lines). Must stay under 500 (Anthropic best practice).

**Step 2: Read full SKILL.md and verify coherence**

Skim the full file to confirm:
- No duplicate content between SKILL.md and presentation_types.md
- Step 0 → Step 4 flow is coherent (target computed in Step 0, used in Step 4)
- GATE 1 output format is clear
- No broken references

**Step 3: Commit**

```bash
git add SKILL.md
git commit -m "feat: add duration/slide-count length parameter with conversion at GATE 1

Support both '40 slides' and '4-hour lesson' inputs.
Auto-calculate breaks for sessions > 60 min.
Multi-module option for long sessions."
```

---

### Task 9: Update CLAUDE.md reference index if needed

**Step 1: Check CLAUDE.md**

Read `CLAUDE.md` and verify the Reference Index entry for `presentation_types.md` mentions duration conversion. Currently says: "4 templates (lecture/debate/case/review), slide counts, audience mapping".

**Step 2: Update if needed**

If the description doesn't mention duration/pacing, update the "Contains" column to:

```
4 templates (lecture/debate/case/review), slide counts, audience mapping, duration-to-slides conversion model
```

**Step 3: Commit if changed**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md reference index for duration conversion"
```
