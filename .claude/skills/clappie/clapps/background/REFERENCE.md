# Background Reference

Long-running apps that persist across display sessions. Managed via `.background` marker files.

## How It Works

Background apps are discovered by scanning clapp directories for `.background` marker files. Each file contains the command to run (e.g., `bun .claude/skills/clappie/clapps/sidekicks/server.js`).

## Commands

```bash
clappie background start                # Start all background apps
clappie background start <app>          # Start one (e.g., sidekick, heartbeat)
clappie background stop [app]           # Stop all or one background app
clappie background list                 # List background apps + status
clappie background kill                 # Kill background sessions only
```

## .background File Format

Place a `.background` file in any clapp directory. Contents = the shell command to run:

```
bun .claude/skills/clappie/clapps/sidekicks/server.js
```

The filename is always `.background` (no prefix, no extension beyond the dot). The background manager discovers these automatically.

## Current Background Apps

- **sidekicks** - HTTP server for sidekick coordination (webhook routing, state management)
- **heartbeat** - Scheduled cron runner (pings Claude at intervals)

## Session Management

Background apps run in named tmux sessions. They persist independently of display sessions — `clappie display kill` won't touch them. Use `clappie background kill` or `clappie kill` (kills everything) to stop them.

## Viewing

```bash
clappie display push background         # Background manager UI
```
