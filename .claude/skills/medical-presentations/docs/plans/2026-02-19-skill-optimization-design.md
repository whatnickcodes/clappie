# Skill Optimization Design

**Date:** 2026-02-19
**Status:** Approved
**Problems:** Context window exhaustion during workflow; steps skipped/confused in long conversations

## Approach: Slim SKILL.md + Structured References + Checkpoint Strengthening

Combined strategy addressing both context pressure and step reliability.

## Changes

### 1. SKILL.md Externalization (~80 lines out)

Move procedural detail to the reference files where it naturally belongs:

| Content | From | To |
|---|---|---|
| Full-Text Retrieval cascade (Paths 1-3 + graceful degradation) | SKILL.md Step 3, lines 169-195 | `references/pubmed_search_strategies.md` § Full-Text Retrieval Cascade |
| Gamma JSON payload template + curl commands | SKILL.md Step 6, lines 351-388 | `references/gamma_prompt_templates.md` § Complete Request Template |
| Detailed Chrome review/refinement substeps | SKILL.md Step 7, lines 405-448 | Slim to dispatch — detail already in `references/chrome_refinement_procedures.md` |

Each step retains: purpose (1-2 sentences), file + section reference, checkpoint text (verbatim), error handling (compact), key constraints.

### 2. Reference File TOCs

Add table of contents to the 4 largest reference files:

- `gamma_prompt_templates.md` (594 lines)
- `image_generation_models.md` (496 lines)
- `chrome_refinement_procedures.md` (229 lines)
- `slide_structure_patterns.md` (197 lines)

Format: `## Contents` with `- [Section Name](#anchor)` links.

Step-level directives in SKILL.md reference specific sections: `Read references/file.md § Section Name.`

### 3. Frontmatter Improvements

Updated description with:
- Trigger keywords: "slides", "talks", "clinical topics"
- Key differentiators: "GRADE quality assessment", "data-viz figures", "Google Drive delivery"
- Third-person voice per Anthropic guidelines
- No `context: fork` — skill needs inline execution for 5 user checkpoints

### 4. Checkpoint Strengthening

- Rename `CHECKPOINT N` → `GATE N of 5` (hard-stop framing with positional awareness)
- Add Workflow State tracker section after invocation:
  ```
  Progress: [Step 0 ✓] [Step 1 ✓] → Step 2 | Sources: — | Slides: — | Gate: 2/5
  ```

## Expected Outcome

- SKILL.md: ~416 lines (from 486), 84 lines headroom
- All content moved intact (no deletions)
- Reference files gain TOCs for targeted section loading
- Stronger checkpoint discipline prevents step skipping
- Workflow progress tracker maintains Claude orientation

## Files Changed

| File | Change type |
|---|---|
| `SKILL.md` | Externalize + gates + tracker |
| `references/pubmed_search_strategies.md` | Add Full-Text Retrieval Cascade section |
| `references/gamma_prompt_templates.md` | Add Complete Request Template section + TOC |
| `references/image_generation_models.md` | Add TOC |
| `references/chrome_refinement_procedures.md` | Add TOC |
| `references/slide_structure_patterns.md` | Add TOC |

## Not Changed

- `references/evidence_quality_rubric.md` (68 lines, already lean)
- `references/presentation_types.md` (141 lines, clean structure)
- `CLAUDE.md` (already well-structured with multi-entry-point indexing)
