# Notifications Reference

External events (emails, Slack messages, calendar alerts) flow through a bidirectional sync system.

## The Big Idea: dirty/ is a Sync Stream

**dirty/ is not just "new stuff" - it's ALL state changes.**

Integrations dump everything: new items, read receipts, closures, status changes. No schema required - raw dumps, JSON, plain text, whatever. The AI processor figures out what to do:

- **New item?** → Create clean item
- **Status change?** → Find existing clean item by `source_id`, update or dismiss it
- **Noise?** → Ignore

**This is why webhooks should be DUMB.** Don't filter at the webhook level. Dump everything to dirty/. The heartbeat processor is smart - it handles both creation AND cleanup.

**Example - GitHub PR lifecycle:**
```
PR opened  → dirty/ → AI creates clean item (source_id: github-pr-org/repo-123)
PR closed  → dirty/ → AI finds that clean item, DISMISSES it
```

**Example - Email sync:**
```
dirty/gmail-sync.txt:
NEW EMAILS: mom, sarah
RECENTLY READ: xyz001, xyz002

AI creates clean items for mom & sarah
AI finds clean items for xyz001 & xyz002, DISMISSES them
```

**The pattern:** `source_id` connects everything. Same ID in dirty/ = same item to create/update/dismiss.

## Bidirectional Sync

```
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL → CLAPPIE                       │
├─────────────────────────────────────────────────────────────┤
│  Phone/App activity                                         │
│        ↓                                                    │
│  Integration dumps to dirty/ (any format, AI parses)        │
│        ↓                                                    │
│  Processor creates clean item OR cleans up existing         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    CLAPPIE → EXTERNAL                       │
├─────────────────────────────────────────────────────────────┤
│  User approves chore / dismisses clean item in Clappie      │
│        ↓                                                    │
│  AI marks as read/handled in external app                   │
│        ↓                                                    │
│  External app synced                                        │
└─────────────────────────────────────────────────────────────┘
```

## Flow (New Items)

```
External Source → dirty/ → heartbeat → ALWAYS clean/
                                              │
                          ┌───────────────────┼───────────────────┐
                          ↓                   ↓                   ↓
                      + chore/            + telegram           (just clean item)
                    (needs approval)     (urgent ping)       (info or auto-handled)
```

Everything lands in clean. Chores and telegram are additive, not alternative paths.

## Flow (Cleanup)

```
External app (user read on phone)
        ↓
Integration dumps "these IDs were read" to dirty/ (any format)
        ↓
AI parses, finds matching clean/chore by source_id
        ↓
Dismisses clean item, completes chore
```

## Directories

| Directory | Purpose |
|-----------|---------|
| `notifications/dirty/` | Sync stream from integrations. New items AND status changes. |
| `notifications/clean/` | Curated items for user review. What matters. |
| `notifications/instructions.txt` | User preferences for triage rules. |

## The Golden Rule

**EVERYTHING goes to clean. No exceptions.**

Clean is the complete record. Even auto-handled stuff. User sees what happened, nothing disappears silently.

```
dirty → ALWAYS clean → optionally chores/telegram
         ↑
         └── NEVER skip this step (for NEW items)
```

## Aggressive Consolidation

**Your job is to TLDR aggressively.** The user should see 4-6 clean items, not 20. Group ruthlessly:

```
GOOD (5 items):                         BAD (18 items):
─────────────────                       ──────────────────
🚨 2 fires need you                     🚨 Board demo broken
💼 Work stuff piling up                 🚨 P1 bug assigned
🐙 PR updates                           📧 Sarah rate limits
👨‍👩‍👧 Family wants to see you              📧 Marcus incident
🤖 8 things auto-handled                📧 Q1 roadmap email
                                        💬 Jenny slack question
                                        💬 David slack question
                                        ... (12 more items)
```

**Grouping rules:**
- Similar sources/topics → combine
- Auto-handled stuff → one item: "X things handled automatically"
- PR activity → one item: "PR updates"
- Personal/family → one item unless urgent

**EXCEPTION: Items with chores stay separate.** The UI needs the Chore button to link correctly. So if something spawns a chore, it gets its own clean item.

## Clean Item Content

Be descriptive. Tell the user what happened AND what you did:

```
🚨  Rachel needs API fixed NOW

VP Engineering emailed - board demo tomorrow at 2pm, investor
dashboard timing out. She needs it working by EOD for dry run.

Action: Drafted reply saying you're on it, ETA 1 hour.

---
[meta]
source: email
created: 2026-01-29 16:45
icon: 🚨
title: Rachel needs API fixed NOW
summary: Board demo tomorrow, drafted reply - you're on it
chore: reply-rachel-board-demo
```

## Merging with Existing Clean Items

When processing, CHECK what's already in clean/. If there's overlap, UPDATE the existing item instead of creating duplicates:

- New email from Sarah? Check if there's already a Sarah item → merge into it
- More PR activity? Check for existing PR item → append to it
- Always consolidate, never fragment

## File Format

**dirty/** - raw dumps, messy, whatever format the integration spits out.

**clean/** - curated, organized:

```
Full context goes here. This is the body - can be long.
If grouping multiple items (3 emails from Sarah), put them all here.
User sees this when they click "View" to edit the file.

---
[meta]
source: email
created: 2026-01-29 08:15
icon: 📧
title: Sarah's having API troubles again
summary: 3 messages about rate limits, wants to bump staging
chore: reply-sarah-api
```

**Fields:**
- `source` - where it came from (email, slack, imessage, github, etc.)
- `source_id` - unique ID from the source (email_id, message_id, etc.) **CRITICAL for sync**
- `created` - timestamp
- `icon` - emoji for the list
- `title` - shown in list, keep it short
- `summary` - shown below title, can be longer when needed
- `chore` - linked chore id (optional, only if action needs approval)

**source_id is essential** - this is how cleanup works. When you read an email on your phone, the integration dumps something like "RECENTLY READ: abc123, def456" to dirty/. The AI parses it, finds clean items/chores with matching source_ids, and dismisses them.

**Tone:** Titles and summaries can be a little fun. Don't be stiff. "Sarah's having API troubles again" > "Email from Sarah Chen regarding API".

## How Triage Works

1. Integrations dump to `dirty/` - any format (raw dumps, lists, JSON, plain text)
2. A heartbeat (`chores/bots/clean-notifications.txt`) runs periodically
3. AI reads each file, figures out what's new vs what's been read
4. For new items: creates clean item (with `source_id`), optionally chore + telegram
5. For read items: finds matching clean/chore by `source_id`, dismisses them
6. Deletes processed files from `dirty/`
7. Logs everything to `recall/logs/notifications/YYYY-MM-DD.txt`

**Reverse sync (Clappie → External):**
When user approves a chore or dismisses a clean item in Clappie, the AI should mark it as read/handled in the external app (Gmail, iMessage, etc.).

## Configuration

Edit `notifications/instructions.txt` to customize:
- Which senders go straight to archive (newsletters, marketing)
- Keywords that trigger urgent pings
- Auto-reply rules
- Sender priorities

## Viewing

```bash
clappie display push notifications          # View clean/ inbox
```

User can archive, reply (creates chore), or dismiss from the UI.

## Adding New Sources

To pipe a new source into the system, just write files to `dirty/` with the standard format. The heartbeat handles the rest. No code changes needed.
