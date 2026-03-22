# Chores Reference

Chores are a safety buffer for high-stakes actions. Instead of YOLO-ing an email send or file delete, Claude pauses, drafts it as a chore, and checks with the human.

## Two Modes

**Active (in chat):** You're talking to the user, need to do something risky. Create the chore, then ask inline: "I drafted that email - want me to send it?" If they say yes, execute and delete the chore. If they want to review later, leave it pending.

**Passive (background):** Heartbeat or background task finds work to do. Create chores silently. User reviews them later via `clappie display push chores`.

## When to Create Chores

**ALWAYS** create a chore for:
- Sending emails, messages, or any communication
- Deleting files (except temp/cache)
- Making purchases or financial transactions
- Posting publicly (social media, forums, etc.)
- Sharing documents or changing permissions
- Unsubscribing from services
- Any irreversible or high-stakes action

## File Format

```
chores/humans/email-bob.txt
───────────────────────────

Send this email to Bob about the project:

To: bob@example.com
Subject: Re: Project update

Hey Bob,
The project is on track.
- User

---
[chore-meta]
status: pending
created: 2026-01-28 10:45
context: email-sweep heartbeat
icon: 📧
title: Email Bob about project update
summary: Quick update on project status
```

**Fields:**
- `title` - Main heading shown in UI (required)
- `summary` - Subtitle/description shown dimmed below title (optional)
- `icon` - Emoji shown before title
- `context` - Where this chore came from (e.g., "email-sweep heartbeat")

**Naming:** Just the name. `chores/humans/email-bob.txt`, not `chores/humans/email-bob-01-28-1045.txt`.

## Handling Approved Chores

You'll receive: `[clappie] Chore → approved → email-bob`

1. Read the chore file (user may have edited it!)
2. Execute the action
3. Call `completeChore(id, result)` - this logs to `recall/logs/chores/YYYY-MM-DD-HHMM-name.txt` and deletes the original

## Handling Bulk Approval

```
[clappie] Chores → approve all pending
  approved → email-bob-01-28-1045
  approved → unsubscribe-spam-01-28-1046
```

Read all listed chores, execute each, update each, log each.

User might also say in chat: "approve all chores" or "approve the emails but skip deletions". Use your judgment to filter appropriately.

## Inline Approval

If user approves in chat (not via the chores UI), just execute and call `deleteChore(id)` or `completeChore(id)`. The chore was just a draft - no need for ceremony.

## Rejection

You'll receive:
```
[clappie] Chore
  rejected → email-bob-01-28-1045
  feedback → too formal, make it casual
```

Chore gets logged to `recall/logs/chores/` with `-rejected` suffix and deleted from `chores/`.

## Folder Structure

```
/chores/humans/                       # Human approval queue
├── email-bob.txt                     # Pending (no dot)
├── .sent-alice.txt                   # Completed (dot prefix)
└── .rejected-spam.txt                # Rejected (dot prefix)

/recall/logs/chores/                  # Permanent log
├── 2026-01-28-1045-email-bob.txt     # Individual log per chore
└── 2026-01-28-1046-unsubscribe.txt
```

## Utility Views

```bash
clappie display push utility/editor -d file=chores/humans/email-bob.txt   # Edit a chore
clappie display push utility/preview -d file=chores/humans/email-bob.txt  # Preview read-only
```
