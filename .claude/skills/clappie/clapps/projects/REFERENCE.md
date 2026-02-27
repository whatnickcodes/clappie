# Projects Reference

The `projects/` directory is your workspace. Anything that needs to exist as its own thing goes here — websites, apps, APIs, data visualizations, reports, cloned repos, serious long-term projects, quick one-off demos. Build, edit, serve, share.

You have full access to create, modify, and manage anything in `projects/`. Treat it like a real workspace, not a sandbox.

## Architecture — READ THIS FIRST

**Port 443 is for webhooks. Projects use custom funnel ports (8443+). Never touch 443.**

```
Port 443  (default)  →  WEBHOOKS ONLY  →  tailscale funnel --bg 7777
Port 8443            →  Project #1     →  tailscale funnel --bg --https 8443 3000
Port 8444            →  Project #2     →  tailscale funnel --bg --https 8444 3001
Port 8445            →  Project #3     →  tailscale funnel --bg --https 8445 3002
```

**Why custom ports?**
- Path-based routing (`/project-name`) breaks apps — they expect root `/`, relative paths for CSS/JS/images break
- Serving on `:443` would overwrite the webhook funnel and break Telegram/Slack/GitHub integrations
- Each project on its own port = clean URLs, no conflicts, apps work normally

**Why `tailscale funnel` not `tailscale serve`?**
- `tailscale serve` (tailnet-only) does NOT work on custom ports — TLS certificate issue, browsers reject the connection
- `tailscale funnel` (public) works on any port — Tailscale's edge servers handle TLS properly
- Yes, project URLs are technically public, but they're not guessable and it's fine for most projects

**URLs look like:** `https://nicholass-macbook-pro.tail614af1.ts.net:8443`

## Display

```bash
clappie display push projects
```

Shows:
- **Top banner** — Tailscale hostname + clickable URLs for all live projects (easy to copy, away from buttons)
- **Project list** — green dot if serving, grey if stopped, auto-detected type tag
- **Controls** — click [Serve]/[Stop] or press Enter, R to refresh

Auto-detects project type from files:
- `index.html` → static site (served with `static-server.js` — proper Bun file server with MIME types and SPA fallback)
- `package.json` with dev/start script → node app (`PORT=<port> bun run dev`)
- `index.js` or `server.js` → script (`PORT=<port> bun run <entry>`)

**Port pools:**
- Local ports (what the server listens on): 3000, 3001, 3002, 3003, 5000, 5001, 8080, 8081, 8082
- External funnel ports (what the URL uses): 8443, 8444, 8445, 8446, 8447, 8448

## The Pipeline

```
1. Build it       →  projects/cool-app/                    (code, static site, whatever)
2. Serve locally  →  bun static-server.js ./project 3000   (localhost:3000)
3. Funnel it      →  tailscale funnel --bg --https 8443 3000
4. Share URL      →  https://hostname.ts.net:8443
```

The display does steps 2-4 automatically when you click [Serve].

A sidekick or heartbeat task can do all 4 steps autonomously — build an app, serve it, funnel it, send the link — zero human intervention.

## The projects/ Directory

```
projects/
├── .gitignore                  # Lists projects with their own git (see below)
├── hello-world/                # Test project
├── clappie-docs-website/       # Public docs site
├── stock-dashboard/            # Quick data viz
├── my-cloned-repo/             # Cloned from GitHub (has own .git/)
└── serious-side-project/       # Long-term work (has own .git/)
```

**Rules:**
- One directory per project. No loose files at root.
- Self-contained — each project has everything it needs to run.
- No secrets — don't put API keys in project code. Use `.env` at repo root or `clappie oauth token`.

### Git behavior

The outer clappie repo tracks `projects/` by default. Quick apps and one-off builds get committed to the clappie repo normally.

**Projects with their own `.git/`** (cloned repos, serious standalone work) MUST be added to `projects/.gitignore`. Otherwise the outer repo sees them as untracked and `git clean` operations can destroy them.

```
# projects/.gitignore
my-cloned-repo/
serious-side-project/
```

**Rule: if a project has its own git, add it to `projects/.gitignore`.**

**Who creates projects?**
- **You (Claude)** — when the user asks for something that needs a web UI, app, or shareable output.
- **Sidekicks** — background agents building things autonomously (user asks via Telegram "make me a chart").
- **Heartbeat tasks** — scheduled jobs that generate reports or dashboards.
- **The user** — their own projects, cloned repos, anything they want to work on or serve.

## Serving Manually (without the display)

### Static sites

```bash
# Use the built-in static server (has MIME types, SPA fallback)
bun .claude/skills/clappie/clapps/projects/static-server.js ./projects/my-site 3000

# Funnel on a custom port (NOT 443 — that's for webhooks)
tailscale funnel --bg --https 8443 3000
# URL: https://hostname.ts.net:8443
```

### Bun/Node apps

```bash
cd projects/my-app && PORT=3000 bun run dev
tailscale funnel --bg --https 8443 3000
```

### Important: DO NOT use these commands

```bash
# WRONG — breaks webhook funnel on :443
tailscale funnel --bg 3000

# WRONG — not a valid bun CLI command
bun --serve . --port 3000

# WRONG — path-based routing breaks apps
tailscale funnel --set-path /my-app --bg 3000

# WRONG — tailscale serve on custom ports has TLS cert issues
tailscale serve --bg --https 8443 3000
```

### Checking status

```bash
tailscale funnel status              # Shows all active funnels + ports
tailscale funnel --https 8443 off    # Stop a specific project funnel
lsof -ti :3000 | xargs kill          # Kill local server on a port
```

## The Full Autonomous Flow

When a Telegram user says "make me a stock dashboard for AAPL":

```
1. Webhook hits sidekick server (funnel on :443 → localhost:7777)
2. Sidekick spawns with prompt: "Build a stock dashboard for AAPL"
3. Sidekick creates projects/stock-dashboard-aapl/
4. Sidekick writes HTML/JS/CSS (or a Bun server)
5. Sidekick starts: bun static-server.js ./projects/stock-dashboard-aapl 3000
6. Sidekick funnels: tailscale funnel --bg --https 8443 3000
7. Sidekick sends: clappie sidekick send "Dashboard: https://hostname.ts.net:8443"
8. User gets the link, opens it, sees the dashboard
```

## Project Patterns

### Quick static site
```
projects/my-thing/
├── index.html
├── style.css
└── script.js
```

### Bun server app
```
projects/my-api/
├── index.js          # Bun.serve({ port: 3000, fetch(req) { ... } })
├── package.json      # Optional, for dependencies
└── public/           # Static assets
```

### Build step project
```
projects/my-site/
├── src/              # Source files
├── dist/             # Built output
├── build.js          # Build script
└── package.json
```

### Cloned repo / standalone project
```
projects/my-repo/
├── .git/             # Its own git — ADD TO projects/.gitignore
├── src/
├── package.json
└── README.md
```

## Stopping a Server

```bash
# Stop the local server
lsof -ti :3000 | xargs kill

# Remove the funnel (use the right port!)
tailscale funnel --https 8443 off
```

Only delete project directories if the user asks. Don't assume projects are temporary.

## [clappie] Messages

The display sends these messages to Claude:

```
[clappie] Projects → open → my-project-name
```

When received, explore the project directory and help the user with it.
