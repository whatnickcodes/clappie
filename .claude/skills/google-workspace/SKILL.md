---
name: google-workspace
description: >
  Use when the operator mentions email, Gmail, calendar, events, meetings,
  Drive, files, documents, spreadsheets, slides, presentations, tasks, todos,
  contacts, forms, chat, or any Google Workspace service. 83 tools via mcporter.
---

# Google Workspace

- **User email:** `marco.baciarello@gmail.com` (single-user mode, hardcoded)
- **List tools:** `mcporter list google-workspace`
- **Tool schema:** `mcporter list google-workspace --schema <tool_name>`
- **Full inventory:** `references/tool-catalog.md` — 83 tools across 12 services, with tiers and params

Every call requires `user_google_email=marco.baciarello@gmail.com`:

```bash
mcporter call google-workspace.search_gmail_messages \
  query="is:unread" \
  user_google_email=marco.baciarello@gmail.com
```

## Gotchas

- **JSON params:** List/dict values must be passed as JSON strings
- **Batch limits:** `get_gmail_messages_content_batch` / `get_gmail_threads_content_batch` cap at 25 items
- **Gmail search syntax:** Use Gmail operators (`is:unread`, `from:`, `after:2026/03/01`), NOT Drive query syntax
- **Calendar dates:** RFC 3339 with offset (`2026-03-14T09:00:00+01:00`). Use `Europe/Rome` for Italian times
- **Docs table insertion:** Always `inspect_doc_structure` first to get valid insertion indices
- **Sheets range notation:** `SheetName!A1:Z100` — call `get_spreadsheet_info` first for exact sheet names
- **Labels by ID:** `list_gmail_labels` first. Archive = remove `INBOX`, delete = add `TRASH`
- **Custom Search:** Not configured (requires `GOOGLE_PSE_API_KEY` + `GOOGLE_PSE_ENGINE_ID` env vars)
