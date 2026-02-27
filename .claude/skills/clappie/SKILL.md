---
name: clappie
description: >
  Clappie is a digital assistant layer that turns Claude Code into a full personal assistant
  with interactive terminal UIs called "clapps". It manages everything through one CLI: `clappie`.

  This is the core skill for the entire project. Load it whenever the user asks for ANYTHING
  personal-assistant related — not just when they say "clappie". Examples: emails, texts,
  notifications, inbox, dashboard, sidekicks, chores, heartbeat, background apps, displays,
  parties, memory, messages, todos, approval queue, status, automation, or any `[clappie]` prefixed message.
  If the user says "open notifications" or "spawn a sidekick" — that's this skill.
  Don't guess at how these systems work — load this skill, it has the docs.


  CORE SYSTEM - Terminal display engine with push/pop view navigation, mouse click handling,
  keyboard shortcuts, and two-way communication. Views send structured messages back to Claude
  prefixed with [clappie].


  SUBSYSTEMS (each has deep docs in REFERENCE.md files):

  - Sidekicks: Autonomous AI agents running in background tmux sessions. Spawn with prompts,
    send messages to users via Telegram/Slack, chain tasks, report back. Used for async work,
    notifications, and background processing.

  - Chores: Human approval queue. High-stakes actions (sending emails, deleting files, purchases)
    get drafted as chore files in chores/humans/ for user review before execution. Two modes -
    active (ask inline) and passive (background creates silently).

  - Heartbeat: AI-powered cron scheduler. Periodic check files in chores/bots/ trigger subagent
    spawns at configurable intervals. When you receive "[clappie] Heartbeat initiated", you must
    read check files, spawn agents, update metadata, and log results.

  - Notifications: Bidirectional sync system. External events dump to notifications/dirty/,
    AI processor creates curated items in notifications/clean/. Aggressive TLDR consolidation
    (4-6 items not 20). source_id tracks item lifecycle for cleanup when read elsewhere.

  - Background: Long-running apps (sidekick HTTP server, heartbeat scheduler) managed via
    .background marker files. Start/stop/list via clappie background commands.

  - Display Engine: Terminal UI framework with components (Button, Toggle, TextInput, Textarea,
    Checkbox, Radio, Select, Progress, Loader, etc). Create views, use ctx API for rendering.

  - Parties: Gamified AI swarm simulations. Define games with player roles and rules,
    spawn multiple AI agents that interact according to game mechanics. Full game engine,
    ledger system, identities, emerged memories. CLI: clappie parties.

  - Skill Maker: Complete guide for building new skills, displays, webhooks, and background
    apps. Use when user asks to build an integration, connect an API, or create a clappie feature.

  - OAuth: Shared token management across skills. Auth flows, auto-refresh, token storage.

  - Webhooks: Skills receive external webhooks (Telegram, Slack, etc). Convention-based
    routing with verification, route handlers, and user-overridable settings.

  - Memory: Persistent recall/memory/ files. Save user facts aggressively and silently.
    Profile synthesized at recall/profile.txt. Media saved to recall/files/.

  - Projects: Full workspace for apps, sites, APIs, data viz, cloned repos — anything.
    Build in projects/, serve locally, funnel through Tailscale on custom ports (8443+).
    Display shows all projects with one-click start/stop. Sidekicks can build and serve
    autonomously. Port 443 is sacred for webhooks — projects never touch it. Projects with
    their own .git/ must be listed in projects/.gitignore to protect from outer repo ops.

  - Tailscale: Background app running a live VPN dashboard. Shows connection status,
    public funnel URL, SSH access, devices. Auto-sets up funnel on port 443 for webhooks.
    Projects use custom ports (8443+), never 443.

  - Utility: Shared display components used across clapps — list picker, confirm dialog,
    text editor, file viewer, file picker, chart, table, markdown renderer, chore editor.

  - Example Demo Screens: Reference implementations showing display-engine patterns.
    11 screens covering all UI kit components, layouts, inputs, and error handling.


  COMMANDS: clappie list, clappie display push/pop/toast/close/kill,
  clappie background start/stop/list/kill, clappie sidekick spawn/send/complete/report/end/kill,
  clappie parties games/init/launch/end/show/rules/set/get/roll,
  clappie oauth auth/token/status/refresh/revoke, clappie whisper listen/say,
  clappie kill.
---

# Clappie

Turns Claude Code into a digital assistant with interactive terminal UIs (clapps). Push views, handle user input, communicate back to Claude.

## Be Proactive

**Don't tell the user to run commands - just run them yourself.**

When the user says "open notifications", "show me my emails", "view the dashboard", etc. - just run `clappie display push <name>`. Act autonomously.

**Display name lookup:** Run `clappie list displays` if you're not certain. Common mappings:

| User says | Display name |
|-----------|-------------|
| "background manager", "background apps" | `background` |
| "sidekicks", "active sidekicks" | `sidekicks` |
| "notifications", "inbox" | `notifications` |
| "chores", "todo", "approval queue" | `chores` |
| "heartbeat", "dashboard", "status" | `heartbeat` or `heartbeat/dashboard` |
| "projects", "scratch pad" | `projects` |

Displays are often nested (e.g., `example-demo-screens/hello-world`). Skill displays use `/skill/view` format. When in doubt, check first.

## Data Directories

| Directory | Purpose |
|-----------|---------|
| `chores/humans/` | Human approval queue (pending chores) |
| `chores/bots/` | Heartbeat check files |
| `notifications/dirty/` | Raw sync stream from integrations |
| `notifications/clean/` | Curated items for user review |
| `recall/memory/` | Persistent memory files |
| `recall/logs/` | All logs (flat subdirectories) |
| `recall/settings/` | Runtime settings per skill |
| `recall/files/` | Saved media and documents |
| `projects/` | Workspace for apps, sites, repos, data viz — serve via Tailscale |

## Logging Rules

All logs live in `recall/logs/` with flat structure:

```
recall/logs/
├── chores/        # YYYY-MM-DD-HHMM-name.txt
├── heartbeat/     # YYYY-MM-DD.txt (daily, append [HH:MM] entries)
├── sidekicks/     # YYYY-MM-DD-HHMM-source-slug.txt
└── notifications/ # YYYY-MM-DD.txt (daily processing log)
```

**Rules:** No files at root of `recall/logs/`. No nested subdirectories. No `.log` extension — always `.txt`. No improvised paths.

## Commands

```bash
# Discovery
clappie list                            # List everything
clappie list skills                     # Just skills and commands
clappie list displays                   # Just displays + navigation
clappie list background                 # Just background apps + commands
clappie list sidekick                   # Just sidekick commands

# Displays
clappie display push <view> [options]   # Push view onto stack
clappie display pop                     # Go back
clappie display toast "<msg>" [-t ms]   # Toast notification
clappie display close                   # Close display
clappie display list                    # List running instances
clappie display kill                    # Kill displays only

# Background
clappie background start [app]          # Start all or one
clappie background stop [app]           # Stop all or one
clappie background list                 # List apps + status
clappie background kill                 # Kill background only

# Sidekicks
clappie sidekick spawn "prompt"         # Spawn with task
clappie sidekick spawn "prompt" --model haiku
clappie sidekick send "message"         # Send to user
clappie sidekick complete "summary"     # End sidekick
clappie sidekick report "message"       # Report to main Claude
clappie sidekick end <name|@squad|all>  # End gracefully
clappie sidekick kill <name|@squad|all> # Force kill
clappie sidekick message <name> "text"  # DM another sidekick
clappie sidekick broadcast "text"       # Message all
clappie sidekick list [--squad X]       # Show active

# Parties
clappie parties games                    # List games + sims
clappie parties init <game> [context]    # Create ledger
clappie parties set <key> <val>          # Set shared state
clappie parties set <who> <key> <val>    # Set player state
clappie parties launch <sim>             # Spawn all agents
clappie parties end <sim>                # End simulation
clappie parties show <sim>               # Print ledger
clappie parties rules <game>             # Print rules
clappie parties cards <game>             # List players
clappie parties card <game> <name>       # Print player's rules
clappie parties get [who] [key]          # Read state ("me" for self)
clappie parties roll <spec>              # 1d6, 2d20, coin, pick "a,b,c"
clappie parties identity list            # List identities
clappie parties identity show <name>     # Show identity details

# OAuth
clappie oauth auth <provider>           # Start OAuth flow
clappie oauth token <provider>          # Get access token
clappie oauth status                    # Show all tokens
clappie oauth refresh <provider>        # Force refresh
clappie oauth revoke <provider>         # Delete tokens
clappie oauth providers                 # List available providers

# Skill routing
clappie whisper listen <file>           # Transcribe audio
clappie whisper say "text"              # Text-to-speech

# Kill everything
clappie kill                            # Displays + background
```

## Options

```bash
-f, --focus         # Switch focus to display pane (default: stay in chat)
-d key=value        # Pass data (repeatable)
-d body=@/tmp/f.txt # Pass file contents
-t, --duration <ms> # Toast duration
```

## View Naming

```bash
heartbeat                         # clapps/heartbeat/displays/index.js
heartbeat/dashboard               # clapps/heartbeat/displays/dashboard.js
example-demo-screens/hello-world  # clapps/example-demo-screens/displays/hello-world.js
/email/inbox                      # .claude/skills/email/displays/inbox.js (external skill)
```

- No slash = clappie clapp (loads `index.js`)
- Has slash = clappie clapp with specific view
- Leading `/` = external third-party skill

## [clappie] Messages

Views communicate back to Claude by typing into the chat window via tmux. All messages are prefixed with `[clappie]`.

**ctx.submit()** — types + Enter (hard submit):
```
[clappie] Counter → 5
[clappie] Toggle → yes
```

**ctx.send()** — types only, no Enter (user can review):
```javascript
ctx.send("draft an email to bob@example.com")
```

**Multi-field format:**
```
[clappie] FormName
  Field1 → hello
  Field2 → world
```

Use arrow format, not JSON. It's going to a chat window — keep it human-readable.

## Data Formats (-d flag)

```bash
-d key=value              # Simple string
-d key=@/path/to/file     # Read from file (for long content)
-d '{"json": true}'       # JSON (must start with { or [)
```

**For long text:** Write to temp file first, then `-d body=@/tmp/draft.txt`.

## Subsystems — Read REFERENCE.md for Full Docs

### Sidekicks
Autonomous AI agents in background tmux sessions. Spawn with prompts, send messages, chain work. Commands: spawn, send, complete, report, end, kill, message, broadcast, list.
**Full reference:** Read [clapps/sidekicks/REFERENCE.md](clapps/sidekicks/REFERENCE.md) for lifecycle, prompt layering, reply routing, skill extension commands.

### Chores
Human approval queue for high-stakes actions (emails, deletes, purchases). Files in `chores/humans/`. Two modes: active (inline) and passive (background). When you receive `[clappie] Chore → approved → <id>`, read the chore file, execute, and complete it.
**Full reference:** Read [clapps/chores/REFERENCE.md](clapps/chores/REFERENCE.md) for file format, approval/rejection handling, meta fields.

### Notifications
Bidirectional sync: `dirty/` (raw dumps) → `clean/` (curated items). Aggressive TLDR consolidation — 4-6 clean items, not 20. Everything goes to clean, no exceptions. `source_id` connects items for lifecycle tracking.
**Full reference:** Read [clapps/notifications/REFERENCE.md](clapps/notifications/REFERENCE.md) for dirty/clean flow, file formats, triage rules, source_id sync.

### Heartbeat
AI-powered cron. Check files in `chores/bots/`. Spawns subagents at intervals. When you receive `[clappie] Heartbeat initiated`, read check files, spawn agents, update metadata, log results.
**Full reference:** Read [clapps/heartbeat/REFERENCE.md](clapps/heartbeat/REFERENCE.md) for handling heartbeat messages, check file format, meta fields.

### Display Engine
Terminal UI framework. Views with buttons, toggles, inputs, forms. Components: Button, Toggle, TextInput, Textarea, Checkbox, Radio, Select, Progress, Loader, etc.
**Full reference:** Read [clapps/display-engine/REFERENCE.md](clapps/display-engine/REFERENCE.md) for creating views, ctx API, components, layout modes.

### Background
Long-running apps (sidekick server, heartbeat). Managed via `.background` marker files in clapp directories.
**Full reference:** Read [clapps/background/REFERENCE.md](clapps/background/REFERENCE.md) for discovery, start/stop, socket management.

### OAuth
Shared token management across skills. Auth flows via HTTPS callback server, auto-refresh, multi-account, PKCE support. Skills ship `oauth.json` to register providers. Commands: auth, token, status, refresh, revoke, providers.
**Full reference:** Read [clapps/oauth/REFERENCE.md](clapps/oauth/REFERENCE.md) for provider config, token lifecycle, credentials, auth flow.

### Utility
Shared display components used across clapps: list picker, confirm dialog, text editor, file viewer, file picker, file preview, chart, table, markdown renderer, chore editor. Push with `utility/<name>`.
**Full reference:** Read [clapps/utility/REFERENCE.md](clapps/utility/REFERENCE.md) for all components, data options, and usage patterns.

### Tailscale
Background app running a live Tailscale VPN dashboard. Shows connection status, public funnel URL, SSH access, devices, throughput. Auto-sets up funnel on **port 443 → localhost:7777** for webhooks. Port 443 is sacred — webhooks (Telegram, Slack, etc) depend on it. Projects use custom ports (8443+), never 443.
**Full reference:** Read [clapps/tailscale/REFERENCE.md](clapps/tailscale/REFERENCE.md) for setup, controls, requirements.

### Projects
Full workspace for anything that needs to exist as its own thing — websites, apps, APIs, data viz, cloned repos, serious long-term projects, quick demos. Build in `projects/`, serve locally, funnel through Tailscale on **custom external ports** (8443, 8444, ...), share the link. Display shows all projects with one-click start/stop. You have full access to create, modify, and manage anything in `projects/`.

**Git:** The outer clappie repo tracks `projects/` by default. Quick builds get committed normally. Projects with their own `.git/` (cloned repos, standalone work) MUST be added to `projects/.gitignore` — otherwise `git clean` can destroy them.

**Be smart about git:** When creating a project, judge whether it needs its own git. Quick demos, one-off visualizations, throwaway prototypes — no, just let the outer repo track them. But if the user is starting something serious (a work project, a portfolio site, an app they'll iterate on, anything they'd want its own commit history for) — `git init` it, add it to `projects/.gitignore`, and tell them. If it's ambiguous, ask.

**CRITICAL: Port 443 is reserved for webhooks. NEVER funnel projects on 443.** Projects use `tailscale funnel --bg --https 8443 <localPort>`. Do NOT use `tailscale serve` on custom ports (TLS cert issue). Do NOT use path-based routing like `--set-path /name` (breaks apps). Each project gets its own external port → clean URL like `https://hostname.ts.net:8443`.

**Full reference:** Read [clapps/projects/REFERENCE.md](clapps/projects/REFERENCE.md) for the full architecture, pipeline, git behavior, DO NOT commands, project patterns, and autonomous flow.

### Parties
Gamified AI swarm simulations layered on sidekicks. Define games (scenario blueprints) with player roles, rules, and state. Launch simulations with shared ledgers. Spawn multiple AI agents that interact via structured game mechanics — council debates, red vs blue, D&D campaigns, survival games, and custom topologies. Supports identities (persistent AI characters) and emerged memories.
**Full reference:** Read [clapps/parties/REFERENCE.md](clapps/parties/REFERENCE.md) for game design, simulation lifecycle, ledger format, identities, and CLI commands.

### Skill Maker
Complete guide for building skills, displays, webhooks, and background apps for the clappie ecosystem. Covers skill anatomy (SKILL.md, CLI entry, oauth.json, webhook.json, .env.example), display creation, background app markers, webhook routing, and OAuth integration. Use when creating new skills or connecting new APIs.
**Full reference:** Read [clapps/skill-maker/REFERENCE.md](clapps/skill-maker/REFERENCE.md) for the full build guide.

### Example Demo Screens
Reference implementations showing display-engine patterns. 11 screens covering minimal views, all UI kit components, layouts, inputs, and error handling. Push `example-demo-screens/hello-world` to start.
**Full reference:** Read [clapps/example-demo-screens/REFERENCE.md](clapps/example-demo-screens/REFERENCE.md) for the full screen list.

## Webhooks Convention

Skills receive webhooks from external services (GitHub, Telegram, Slack, etc.).

**Skill code:**
```
.claude/skills/<skill>/
├── webhook.json              # Config: signing, eventHeader
└── webhooks/
    ├── verify.js             # Signature verification
    ├── send.js               # Reply function + sidekickCommands
    └── routes/<event>.js     # Route handlers (MUST have path: field)
```

**Runtime settings:**
```
recall/settings/<skill>/
├── enabled.txt               # Master switch (true/false)
├── webhook-path.txt          # Secret URL segment
└── webhooks/<route>.txt      # Per-route enable (true/false)
```

Users can override built-in routes by placing `.js` files in `recall/settings/<skill>/webhooks/`.

**Setting up webhooks:** Each skill (telegram-bot, slack-bot) has setup instructions in its own SKILL.md. See [clapps/skill-maker/REFERENCE.md](clapps/skill-maker/REFERENCE.md) for complete webhook documentation including route handler format, verification, and testing.

## Memory

Save to `recall/memory/` whenever you learn something about the user — no matter how small. Don't ask permission. Don't mention you're saving. Just do it silently.

### What to save

- Personal details (name, location, timezone, birthday, family, pets)
- Preferences (coding style, tools, OS, editor, languages, frameworks)
- Opinions and pet peeves (hated naming conventions, favorite patterns, things that annoy them)
- Work context (employer, role, projects, clients, deadlines)
- Communication style (casual/formal, emoji usage, humor, swearing)
- People they mention (coworkers, friends, contacts — names, roles, relationships)
- Recurring requests or workflows
- Things they explicitly say to remember
- Corrections — if they correct you, save what the right answer was
- Anything significant, interesting, or potentially useful later

### How to save

```
recall/memory/
├── personal.txt        # name, location, family, life stuff
├── preferences.txt     # likes, dislikes, opinions, pet peeves
├── work.txt            # job, projects, clients, deadlines
├── people.txt          # contacts, relationships, who's who
├── technical.txt       # coding style, tools, stack, patterns
└── (whatever).txt      # create new files as categories emerge
```

One fact per line, terse, newest at bottom. No timestamps needed.

### When to read

- **Don't bulk-load memory at session start.** That wastes context.
- Read specific files when they're relevant to the current task.
- If the user asks something personal or preference-related, check memory first.

### User profile

A heartbeat periodically reads all memory files, chat logs, and writing patterns to build `recall/profile.txt` — a polished summary of who the user is. Memory files are the raw source, profile is the distilled output.

### Media and files

Save images, documents, or anything non-text to `recall/files/` with descriptive names. Reference them from memory files if relevant: `See recall/files/apartment-floorplan.png`.

## Shell Shortcut

Users can add this to `~/.zshrc` or `~/.bashrc`:

```bash
clappie() {
  if [[ $# -eq 0 ]]; then
    cd ~/clappie && tmux new-session -s "clappie-$(date +%s)" "claude --model opus"
  elif [[ -z "$TMUX" ]]; then
    echo "Start clappie first: clappie"
  else
    bun ~/clappie/.claude/skills/clappie/clappie.js "$@"
  fi
}
```

No args = start tmux + claude. With args = run CLI command.

## Requirements

- **tmux** - Must run inside tmux
- **Bun** - JavaScript runtime
