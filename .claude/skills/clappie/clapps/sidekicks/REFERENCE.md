# Sidekicks Reference

Sidekicks are autonomous Claude sessions running in background tmux panes. They're the universal unit of async AI work.

## When to Use Sidekicks

- **Notifications:** `clappie sidekick spawn "telegram user 123: Mom emailed about dinner"`
- **Background tasks:** `clappie sidekick spawn "Check emails, summarize unread, save to recall/logs/"`
- **Chained work:** From within a sidekick, spawn another: `clappie sidekick spawn "Follow up on X"`

## Spawning

```bash
clappie sidekick spawn "Check my unread emails and summarize them"
clappie sidekick spawn "Notify telegram user YOUR_ID: Urgent - production alert"
clappie sidekick spawn "quick task" --model haiku        # Use specific model
clappie sidekick spawn "complex research" --model opus   # Default from settings
```

Include hints in the prompt for routing:
- `telegram user <id>` - enables Telegram replies
- `slack channel #<name>` - enables Slack integration

Model defaults: `recall/settings/sidekicks/default-model.txt` (currently `opus`)

## Inside a Sidekick

Sidekicks run in background. **No terminal UI.** The `CLAPPIE_SIDEKICK_ID` env var is set automatically in every sidekick tmux pane, so you never need to type the ID for self-commands. Explicit ID still works as an override (e.g., for cross-sidekick operations).

Core commands:

```bash
clappie sidekick send "your message"          # Send message to user (if integration enabled)
clappie sidekick log "checked 5 emails"       # Log actions (always do this)
clappie sidekick report "Found 3 critical emails, created chores"  # Report to main Claude terminal
clappie sidekick complete "summary of what was done"               # Complete when done
clappie sidekick spawn "follow up task here"  # Chain to another sidekick
```

## Skill Extension Commands

Skills (Telegram, Slack, etc.) can register extra commands for their sidekicks via `sidekickCommands` in their `webhooks/send.js`. These are automatically available based on the sidekick's source — no server changes needed.

```bash
# Telegram sidekicks get (ID auto-detected from env):
clappie sidekick react [id] <msgId> 👍
clappie sidekick combo [id] <msgId> 👍 🔥 🎉
clappie sidekick sticker [id] <setName> [index|random]
clappie sidekick send-file [id] photo "/path" "caption"

# Slack sidekicks get (ID auto-detected from env):
clappie sidekick react [id] <ts> :emoji:
clappie sidekick send-file [id] photo "/path" "caption"
```

Internal sidekicks (no source) don't get these. If a sidekick tries a command its source doesn't support, the server returns an error. ID is optional — auto-detected from env, but can be passed explicitly to override.

## Prompt Layering

Sidekick prompts are assembled from three layers:
1. **Base** (`clapps/sidekicks/sidekick-prompt.txt`) — universal identity, commands, style
2. **Skill** (`.claude/skills/{source}/sidekick-prompt.txt`) — source-specific commands (telegram reactions, slack formatting)
3. **User** (`recall/settings/{source}/sidekick-prompt.txt`) — personality, tone, preferences

Internal sidekicks only get the base layer. Telegram sidekicks get base + telegram skill + telegram user settings. This keeps prompts modular — edit the user layer without touching code.

## Follow-up Attribution

When a user sends a follow-up message to an existing sidekick, it's prefixed with sender identity:
```
[telegram @nick] what's the weather?
[slack-bot @sarah] check the API instead
```
This lets the sidekick know who is talking, especially in group/channel contexts.

## Lifecycle

- **User-initiated** (Telegram/Slack webhook): Stay open, wait for replies
- **AI-initiated** (heartbeat, chained): Complete when task done, or stay open if expecting reply

## Reply Routing

If you spawn a sidekick with `telegram user <id>` and send a message, the user's reply will route back to that sidekick. Conversations work naturally.

## Logs

All sidekicks logged to: `recall/logs/sidekicks/<sidekickId>.txt`
