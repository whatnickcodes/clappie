# Operations Runbook

L2 reference — loaded via trigger-index when a specific topic comes up.
Do NOT preload this file. Read only the section you need.

## Filesystem Access

### homeops repo: restricted writes

Read anything in `/home/wash/homeops`. Write ONLY to `washnotes/`.

**How to write washnotes:**
Auth: credential helper in `.git/config` reads `$GH_PAT_HOMEOPS_CLAUDE` from the environment.

1. `cd ~/homeops && git fetch origin main && git checkout main && git pull --ff-only`
2. Create/edit `.md` files under `washnotes/`
3. Stage, commit, push to `main`: `git push origin main`

**When to write washnotes:**
- After substantive investigation confirming an operational pattern, failure mode, or root cause
- After detecting doc/reality mismatch during health checks
- During heartbeat/autonomous sessions: write without asking (operator not present)

### clappie repo: workspace writes

Full read/write. Commit and push directly to `main`.

Auth: credential helper reads `$GH_PAT_CLAPPIE_WASH` from the environment.

1. `cd ~/clappie && git pull --ff-only`
2. Stage and commit
3. `git push origin main`

## Secrets

### Prime Directive

All secrets MUST be stored encrypted via sops+age. No plaintext on persistent disk — ever.

### Loading secrets

```
export $(sed 's/="\(.*\)"$/=\1/' /run/wash/env | xargs -d '\n')
```

NOT `source /run/wash/env` — file has no `export` keywords; `source` sets shell vars but doesn't export to subprocesses. The `sed` strips wrapping double-quotes; `-d '\n'` prevents xargs from interpreting quotes.

### Storing new secrets

When you receive or recognize a secret (API tokens, PATs, bearer/JWT, passwords, private keys, HMAC secrets, webhook URLs with embedded auth, bot tokens), hold it in session memory only. Instruct the operator to run `store-clappie-secret.sh` from the workstation. You cannot execute privileged steps yourself (no sudo).

### Secrets Inventory

All secrets: sops bootstrap → `/run/wash/env` → env var. No special cases.

**GitHub credential hierarchy:** Scoped PATs (`GH_PAT_*`) are the default for all git operations — minimum permissions per repo. `GH_OAUTH_TOKEN` is a broad OAuth token (`repo`, `workflow`, `gist`, `read:org`) stored separately from `GH_TOKEN` to prevent accidental use. Requires explicit operator approval per use. See `/home/wash/CLAUDE.md` (immutable, operator-controlled).

| Secret | Read | If missing |
|--------|------|------------|
| Any env var (`ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `GH_PAT_*`, `GH_OAUTH_TOKEN`, `HA_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`) | `printenv VAR_NAME` | `store-clappie-secret.sh VAR_NAME` |
| SSH keys (`wash-ha-tailscale`, `wash-pihole-tailscale`) | `ls /run/wash/ssh/<key-name>` | `inject-clappie-key.sh --restart` |

## On-Call Operations

Wash is a 24/7 on-call admin. Between operator sessions, periodic health checks (via Clappie heartbeat/chores) detect failures and trigger autonomous remediation.

### Autonomous Authority (Wash CAN do without asking)
- SSH to Pi-hole LXC and run `health-check.sh`
- Restart Pi-hole Docker container: `docker restart pihole`
- Apply known-safe config fixes (DNSSEC disable, rate-limit verify)
- Run `pihole reloaddns` after config changes
- Run disk cleanup: `health-check.sh --cleanup`
- Check HA API connectivity (read-only GET requests)
- Pull latest homeops

### Escalation Required (Wash MUST alert Marco before acting)
- 2+ failed restart/remediation attempts
- Pi-hole LXC unreachable (Proxmox-level problem)
- Data loss risk (disk >95%, backup chain broken)
- HA unreachable after 3 consecutive connectivity checks
- Any docker-compose recreate / container destroy-and-recreate
- Any action requiring Proxmox host access
- Any action requiring `admin` (sudo) on Zoidberg
- Documentation inaccuracies found during staleness audits — write to `washnotes/staleness-report-*.md`, escalate via Telegram if safety-critical

### Escalation Format (via Telegram)
> "Warning: [Service] [failure mode]. Tried: [what]. Still broken: [what]. Need: [specific action]."

## Access Dead Ends

When a task requires access you can't currently reach, don't just report the gap — probe it:
1. Try the access path
2. Read the failure (401 vs timeout vs DNS error — each means something different)
3. Diagnose what's specifically missing
4. Escalate with evidence

## Tailscale & Funnel

Wash has Tailscale operator rights (`tailscale set --operator=wash`) — can manage `tailscale serve` and `tailscale funnel` without sudo.

**Funnel (public HTTPS ingress):**
- `tailscale funnel --bg 7777` — exposes port 443 (public) → localhost:7777 (Sidekick HQ)
- Used for Telegram webhook delivery (`https://zoidberg.sole-fir.ts.net/telegram/webhook`)
- Verify: `tailscale funnel status`

**If webhook stops working:**
1. Check funnel is running: `tailscale funnel status`
2. Check Sidekick HQ is listening on 7777: `lsof -ti :7777`
3. Re-register webhook: Sidekick HQ does this on startup if `TELEGRAM_WEBHOOK_SECRET` is set

## Home Server Config

Non-secret config (URLs, IPs, ports) lives in `recall/settings/homeserver.txt`.
See `recall/settings/README.md` for the config runbook.

## Clappie Runtime

Clappie is available via shell function in `~/.bashrc`:
- `clappie` — attach to existing `wash` tmux session, or create one
- `clappie <command>` — run a subcommand (must be inside tmux)

The tmux session is always named `wash`. A watchdog timer (`wash-clappie-watchdog.timer`) checks every 5 minutes and recreates it if it dies.

Always use `clappie <command>` directly. Never use `bun .claude/skills/clappie/clappie.js` as a prefix unless it fails multiple times.

Skills:
- Core Clappie skill: `.claude/skills/clappie/` — load for assistant tasks
- Homeops skills: `.claude/skills/` — ha-automation, pi-hole, sensibo, etc.
- Additional skills deployed from cohort manifests, discoverable in `.claude/skills/`
