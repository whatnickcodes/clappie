---
name: spesa-skill
description: Build and run a reliable Esselunga online shopping flow from Google Tasks with task-note-aware product selection, interactive disambiguation, delivery-slot setup, preference memory updates, and checkout handling up to and including payment authorization when user-approved.
---

# Esselunga Grocery Shopper

## When To Use
Use this skill when the user asks to shop on `spesaonline.esselunga.it` using a Google Tasks grocery list, including:
- item search/addition
- delivery mode + slot selection
- interactive resolution of ambiguous results
- task-note-aware product selection and post-purchase note updates
- checkout/payment orchestration
- preference capture for future runs

## Out Of Scope
- post-order modifications after order submission (future extension)

## Inputs (Required Before Shopping)
- delivery mode: `home` or `locker`
- slot constraints: day/date + time window + location/locker
- Google Tasks list identifier (or explicit confirmation of the dedicated list)

If any required input is missing, ask immediately before taking shopping actions.

## Run Contract
1. Read open tasks from the configured grocery list and treat both task title and task notes as source data.
2. Normalize each task to `product_query`, `quantity`, and `notes`.
3. Treat task notes as item-specific guidance that overrides generic preferences when selecting among plausible products.
4. Preserve existing task-note guidance; do not overwrite it during the run.
5. After an item is added to the cart, append a short structured purchase note with what was actually chosen and the purchased amount.
6. Open Esselunga with persistent browser profile when available; pause for manual login/captcha when needed.
7. Apply task-specific notes first, then user/global preferences, then interactive disambiguation.
8. Use interactive disambiguation when confidence is not high or multiple candidates remain.
9. Update preference memory only from explicit user statements.
10. Keep an internal reconciliation map (`task -> cart line / unresolved reason`) throughout the run.
11. Revalidate slot before checkout; if lost, rebook using user-provided constraints.
12. On cart page, inspect right-column offers (`Buoni Acquisto` and similar) and propose/apply only eligible offers.
13. Payment defaults:
   - if Express checkout is unavailable, use `Nuova carta o altro metodo`
   - invoice default is `No` unless explicitly requested
   - for 3DS push auth (for example AmEx SafeKey), wait 30s; if no redirect, trigger SMS fallback (`In alternativa ricevi il codice di identificazione`)
14. Stop before final irreversible confirmation unless user explicitly asks to proceed.
15. After completion (or stop), reconcile back to Google Tasks:
   - `completed` for matched/resolved items
   - `needsAction` + short blocker note for unresolved items
   - task notes updated with useful purchase details for future sessions

## Disambiguation Protocol
1. Show up to 5 candidate products with brand, size, and price.
2. Evaluate task notes before generic preferences; if the notes identify a preferred product or tie-breaker, use that guidance.
3. If mandatory constraints are not visible in search cards, open product detail pages to validate required attributes before choosing.
4. For hard-constraint requests, inspect enough results to avoid shallow ranking bias (default: first ~20 results) before concluding no valid match.
5. Ask a direct selection question when multiple valid candidates remain.
6. If no candidate satisfies a hard requirement, do not auto-add a non-compliant item; keep the task unresolved and add a short blocker note.
7. If a fallback substitution is accepted (explicitly by user, or by configured fallback policy), record the substitution note in task sync output.
8. If the user resolves ambiguity or corrects the choice for this specific item, write that guidance into that task item's notes.
9. If the user provides a broader reusable brand/rule preference that applies across future items, append it to the configured preference-memory file.
10. Apply stored preferences to next items in the same run.

## Task Notes Rules
- Treat task notes as item-scoped memory for that specific grocery line.
- When the user picks between multiple plausible results for that item, record the winning specification in that task's notes.
- When the user corrects a wrong choice for that item, record the correction in that task's notes.
- Preserve existing note content and append purchase updates instead of replacing earlier guidance.
- Keep purchase updates short and useful, for example chosen product, brand/variant, pack size, purchased amount, or another concrete tie-breaker that would help a future run.

## Preference Memory Rules
- Use this file only for cross-item or recurring preferences, not for one-item corrections that belong in task notes.
- Update memory only from explicit user statements.
- Keep entries short and product-specific.
- Add run-scoped exceptions under `Session overrides`.

## Resources
- Use `references/workflow.md` for detailed run sequence and checkout guardrails.
- Use `references/preferences-format.md` when editing preference memory files.
- Use `scripts/normalize_tasks.py` for deterministic task normalization.
