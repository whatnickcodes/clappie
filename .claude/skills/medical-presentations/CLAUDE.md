# presentations

Medical-presentations skill for evidence-based presentation generation. Searches PubMed, curates evidence with GRADE quality assessment, builds slide outlines with data-viz figures, and generates presentations via Gamma REST API with Chrome-based refinements and Google Drive delivery.

## Information Recording Principles

This project uses **progressive disclosure**: SKILL.md is the runtime entrypoint (< 500 lines), reference files hold domain details loaded on demand.

| Record in... | What belongs there |
|---|---|
| `SKILL.md` | Workflow steps, GATEs, imageStrategy format, error handling per step |
| `references/*.md` | Model frameworks, prompt templates, search strategies, rubrics, slide patterns |
| `CLAUDE.md` | Project structure, dev conventions, reference index |

**When adding information**: determine if it's workflow (SKILL.md) or domain knowledge (references/). Never duplicate across both.

## Reference Index

| When working on... | Read first | Contains |
|---|---|---|
| PubMed search logic | `references/pubmed_search_strategies.md` | MeSH terms, query patterns, progressive broadening, agent dispatch, full-text retrieval cascade |
| Evidence grading | `references/evidence_quality_rubric.md` | A/B/C/D hierarchy, GRADE mapping, conflict resolution, minimums per type |
| Slide outline structure | `references/presentation_types.md` | 4 templates (lecture/debate/case/review), slide counts, audience mapping, duration-to-slides conversion model |
| Slide formatting / imageStrategy | `references/slide_structure_patterns.md` | Slide types, assertion headings, Methods Companion Slide, Intervention Reproducibility Rule, image taxonomy, imageStrategy block, data verification |
| Image models / prompts | `references/image_generation_models.md` | All REST API models, prompting frameworks (Nano Banana Pro/Recraft V4/GPT Image), model selection matrix, scientific figure reproduction protocol, data-viz templates |
| Gamma API generation | `references/gamma_prompt_templates.md` | REST API params, textMode logic, `[IMAGE:]` annotations, textOptions, theme selection, inputText templates, complete request template |
| Chrome refinement | `references/chrome_refinement_procedures.md` | Browser automation for Gamma, model regeneration via Chrome UI, data verification checklist, export, fallback |

## Skill

- **Entrypoint:** `SKILL.md` (registered via `~/.claude/skills/medical-presentations` symlink)
- **Invoke:** `/medical-presentations <topic> [--type lecture|debate|case|review] [--lang en|it]`
- **Pattern:** Subagent orchestration — thin main thread with 5 GATEs, heavy work in Task subagents writing state files to `$TMPDIR/medical-pres/`

## External Dependencies

| Service | Method | Purpose |
|---|---|---|
| PubMed | MCP (`mcp__claude_ai_PubMed__*`) | Literature search, metadata, full text |
| Gamma | REST API (`$GAMMA_API_KEY`) | Presentation generation (all 45 models) |
| Chrome | MCP (`mcp__claude-in-chrome__*`) | Browser automation for refinements |
| Google Workspace | MCP (`mcp__google_workspace__*`) | Drive upload, Doc creation |

## Project Structure

```
SKILL.md                       # Skill workflow (8 steps, 5 GATEs, ~420 lines)
.security-scan-passed          # Validation marker
CLAUDE.md                      # This file
references/                    # 7 domain reference files (see index above)
.claude/
  settings.local.json          # Permission config
```

## Modifying Files

| To change... | Edit | Also update |
|---|---|---|
| Workflow steps or GATEs | `SKILL.md` | — |
| Image type taxonomy or imageStrategy | `references/slide_structure_patterns.md` | `SKILL.md` Segment C dispatch, `references/image_generation_models.md` model matrix |
| Model recommendations | `references/image_generation_models.md` | `references/slide_structure_patterns.md` taxonomy, `references/chrome_refinement_procedures.md` model list |
| Prompt templates | `references/image_generation_models.md` (Section 1F) | — |
| Chrome procedures | `references/chrome_refinement_procedures.md` | `SKILL.md` Segment E dispatch if workflow changes |
| Gamma API usage | `references/gamma_prompt_templates.md` | `SKILL.md` Segment D dispatch if params change |
| Evidence grading | `references/evidence_quality_rubric.md` | — |
| Search strategies | `references/pubmed_search_strategies.md` | — |
| Duration/pacing model | `references/presentation_types.md` | `SKILL.md` Step 0 if algorithm changes |

## Reference Trigger Index

| Trigger | File | Key content |
|---|---|---|
| Changing image types or models | `image_generation_models.md` | Model matrix, prompting frameworks, data-viz templates |
| Modifying slide structure | `slide_structure_patterns.md` | Taxonomy, Methods Companion Slide, Intervention Reproducibility Rule, imageStrategy block, assertion heading rules |
| Updating search queries | `pubmed_search_strategies.md` | MeSH terms, agent dispatch, broadening, full-text retrieval |
| Adjusting evidence criteria | `evidence_quality_rubric.md` | GRADE mapping, conflict resolution |
| Changing presentation templates | `presentation_types.md` | Lecture/debate/case/review structures |
| Modifying Gamma generation | `gamma_prompt_templates.md` | REST params, textMode, inputText templates, complete request template |
| Updating browser automation | `chrome_refinement_procedures.md` | Regeneration, verification, export, fallback |
