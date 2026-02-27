# Heartbeat Reference

AI-powered cron jobs. Heartbeat pings Claude at intervals. Claude reads plain text check files, spawns subagents, and logs results.

## Opening the Dashboard

```bash
clappie display push heartbeat
```

## The Heartbeat Message

When a heartbeat fires, Claude receives:

```
[clappie] Heartbeat initiated
Interval: 60s | Time: 2026-01-21 15:30:00
Checks:
  email-checker
  calendar-reminder

Execute each check listed above (files are in chores/bots/). Check [heartbeat-meta] last_run to skip if too recent. Spawn subagents for each. Update [heartbeat-meta] after. Log to recall/logs/heartbeat/YYYY-MM-DD.txt: [HH:MM:SS] check1 ✓|✗ | check2 ✓|✗ (brief note)
```

## Handling Heartbeat (IMPORTANT)

When you receive `[clappie] Heartbeat initiated`, you MUST:

**1. Read the check files**

The message lists check names. Files are in `chores/bots/{name}.txt`. Files with a `.` prefix are disabled and won't be listed.

**2. Decide what to run**

Check the `last_run` in each file's meta section. Skip if not enough time has passed based on the file's instructions.

**3. Spawn subagents**

Use Task tool for each check. File may specify agent (haiku/sonnet/opus). Default to haiku.

**4. Update check file metadata (CRITICAL)**

After each check, UPDATE the `[heartbeat-meta]` section at the bottom:

```
---
[heartbeat-meta]
last_run: 2026-01-21 15:30:00
run_count: 13
last_result: Found 1 urgent email, notification created
```

If `[heartbeat-meta]` doesn't exist, CREATE IT.

**5. Append ONE line to daily log**

```bash
echo "[15:30:00] email-checker ✓ | calendar-reminder ✓ (1 urgent, meeting in 30m)" >> recall/logs/heartbeat/2026-01-21.txt
```

**Format:** `[HH:MM:SS] check1 ✓|✗ | check2 ✓|✗ (brief note)`

- One line per heartbeat, no multi-line entries
- ✓ = ran, ✗ = failed, skip silently if nothing to do
- Keep notes short (parentheses at end)
- Do NOT log "skipped" entries

## Example Check File

```
Check my email for urgent messages from the boss.
If anything looks urgent, write a notification.
Run this every 5 minutes or so.
Use haiku.

---
[heartbeat-meta]
last_run: 2026-01-21 15:25:00
run_count: 12
last_result: No urgent emails
```

## Folder Structure

```
/chores/bots/                  # Check files (bot tasks)
├── email-checker.txt             # Enabled check
├── .calendar-reminder.txt        # Disabled check (dot prefix)
└── ...

/recall/logs/heartbeat/        # Logs
├── 2026-01-25.txt                # Daily log files
└── 2026-01-26.txt
```

**Enable/disable:** Rename file with/without dot prefix. `.foo.txt` = disabled, `foo.txt` = enabled.

## Check File Format

```
Description of what this heartbeat does.

Steps:
1. Do thing one
2. Do thing two
3. Log to recall/logs/heartbeat/YYYY-MM-DD.txt

[heartbeat-meta]
interval: 15m
model: haiku
```

## Meta Fields

- `interval` - How often to run (5m, 15m, 30m, 1h, 6h, 7d)
- `model` - Which model to use (haiku for lightweight, sonnet for complex)
- `time` - Optional specific time (e.g., "sunday 18:00")

## Logging Rules

**ALL heartbeat checks MUST log to the daily file:**
```
recall/logs/heartbeat/YYYY-MM-DD.txt
```

**Format:**
```
[HH:MM] check-name ✓ brief result
[HH:MM] check-name ✗ error description
```

**DO NOT:**
- Create standalone log files
- Create per-check dated files
- Use `.log` extension (always `.txt`)
- Create `archive/` subdirectories
- Improvise your own logging path

**DO:**
- Always use: `recall/logs/heartbeat/YYYY-MM-DD.txt`
- Include timestamp in `[HH:MM]` format
- Include check name + ✓/✗/⚡ status indicator
- Keep it brief - one line per run
- Append to the daily file, never create new files
