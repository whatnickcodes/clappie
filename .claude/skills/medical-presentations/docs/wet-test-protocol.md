# Wet Test Protocol — medical-presentations Skill

Manual end-to-end test for the full skill workflow. Run after all dry (structural) tests pass.

## Invocation

```
/medical-presentations "IV magnesium for postoperative analgesia" --type lecture --lang en --audience "anesthesia residents" --duration "30 minutes"
```

## Checkpoint Checklists

### Checkpoint 1 — Parameter Extraction (Step 0)

- [ ] Topic correctly identified: "IV magnesium for postoperative analgesia"
- [ ] Type: lecture
- [ ] Language: en
- [ ] Audience: anesthesia residents
- [ ] Duration: 30 minutes
- [ ] User prompted to confirm or adjust before proceeding

### Checkpoint 2 — Search Strategy (Step 1)

- [ ] 3–5 PubMed search queries proposed
- [ ] MeSH terms relevant to magnesium + analgesia
- [ ] Agent strategy includes: systematic reviews, RCTs, guidelines
- [ ] Date filter specified
- [ ] Minimum evidence requirements stated (3+ Level A/B, 15–25 total)
- [ ] User prompted to approve strategy before execution

### Checkpoint 3 — Evidence Curation (Step 3)

- [ ] Evidence summary table with columns: #, Citation, Design, N, Level, Key Finding, Bias, Notes
- [ ] Each article assigned Level (A/B/C/D) and risk of bias
- [ ] Strongest findings highlighted (top 3)
- [ ] Figure Data Extraction Table present with chart types and extracted data
- [ ] Evidence gaps and conflicts noted
- [ ] User prompted to approve evidence base before outline

### Checkpoint 4 — Outline Review (Step 5)

- [ ] Full slide-by-slide outline presented
- [ ] Assertion-style headings on content slides
- [ ] imageStrategy summary table: Slide, Type, Image Type, Target Model, Verification
- [ ] Data-viz slides marked with dataVerificationRequired: true
- [ ] figureSource specified for each data-viz slide (direct/synthesized/composite)
- [ ] Slide count within range (20–35 for lecture)
- [ ] User given options: approve, modify slides, restructure, add/remove, adjust images

### Checkpoint 5 — Refinement (Step 7)

- [ ] Gamma URL provided
- [ ] Data verification needed count reported
- [ ] Image issues identified (if any)
- [ ] Available actions listed (regenerate, verify, layout, edit, reorder, export, skip)
- [ ] User prompted to select actions

## Post-Completion Checks

- [ ] Gamma presentation URL accessible
- [ ] Google Drive file created (or local fallback noted)
- [ ] Evidence companion document created
- [ ] All data-viz slides verified (or flagged as approximate)

## Overall Success Criteria

1. All 5 checkpoints reached and paused for user input
2. No step skipped or auto-proceeded without confirmation
3. Evidence table contains 15+ sources with 3+ at Level A/B
4. Outline includes imageStrategy blocks for all slides
5. Gamma generation completed with presentation URL
6. At least one data-viz slide generated and verified
7. Final deliverables (Gamma URL + Drive links) shared with user
