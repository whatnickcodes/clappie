# Workflow Reference

## 1) Preconditions
1. Confirm required run inputs exist: mode, slot constraints, and target task list.
2. If slot day/date or time window is missing, ask first and block run until provided.
3. Treat post-order modifications as out of scope for this version.

## 2) Task Intake
1. Read open tasks only from the configured list.
2. Read both task title and task notes.
3. Normalize each task to `product_query`, `quantity`, `notes`.
4. Treat task notes as item-specific guidance and carry them through the run.
5. Parse quantity hints from patterns such as `xN`, `N x`, `Nkg`, `N g`.

## 3) Browser Session
1. Navigate to Esselunga and confirm authenticated state.
2. Apply minimum cookie policy (required only).
3. If login/captcha/2FA is required, pause for user action and resume.
4. If first-run client name is requested, use `Codex on <local machine name>`.

## 4) Delivery Setup
1. Apply requested delivery mode (`home` or `locker`).
2. Set location/store/locker from run constraints.
3. Set day/date and time window from run constraints.

## 5) Item Resolution
1. Search each normalized item.
2. Apply task-note guidance first, then known preferences and hard constraints.
3. If task notes specify a previously preferred brand, format, or variant, treat that as the default tie-breaker for this item.
4. If mandatory attributes are not visible in cards, open product detail pages.
5. For hard constraints, inspect approximately first 20 results before fallback/no-match.
6. If multiple valid candidates remain, ask user before adding.
7. If the user resolves ambiguity or corrects the choice for that item, store that item-specific guidance in that task's notes.
8. Once the item is added to cart, append a short purchase note to the task notes instead of replacing earlier guidance.
9. Keep unresolved items with a short blocker reason.

## 6) Checkout Guardrails
1. Revalidate delivery slot on cart page; if missing, rebook against user constraints.
2. Inspect right-column offer panels (`Buoni Acquisto` etc.) and apply only eligible offers.
3. Payment defaults:
   - if Express is unavailable, choose `Nuova carta o altro metodo`
   - invoice default is `No`
   - PayPal default funding is `Blu American Express` when available
4. 3DS push flow:
   - wait 30 seconds for push approval/redirect
   - if no redirect, use SMS fallback (`In alternativa ricevi il codice di identificazione`)

## 7) Run Finalization
1. Maintain an internal task/cart reconciliation map during execution.
2. Sync results back to Google Tasks:
   - resolved -> `completed`
   - unresolved -> `needsAction` + blocker note
3. For resolved items, persist useful purchase details in the task notes before or during reconciliation.
4. Stop before irreversible confirmation unless user explicitly instructs to proceed.
