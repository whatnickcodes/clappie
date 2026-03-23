# Trigger Index

Use this file first. Open only the docs/skills required by your active symptom or task.

## Home Operations (redirect to homeops)

| Trigger / Symptom | Open First | Then Open |
|---|---|---|
| DNS, Pi-hole, DNSSEC, relay queries | `/home/wash/homeops/docs/index/trigger-index.md` | Follow homeops routing |
| HA infrastructure issues (not config) | `/home/wash/homeops/docs/index/trigger-index.md` | Follow homeops routing |
| LXC containers, Proxmox, backups, restore | `/home/wash/homeops/docs/index/trigger-index.md` | Follow homeops routing |
| SSH/API access, Tailscale, security posture | `~/.ssh/config` for hosts/ports/keys, `/home/wash/homeops/docs/index/trigger-index.md` | Follow homeops routing |
| Zoidberg server ops, status, troubleshooting | `/home/wash/homeops/docs/index/trigger-index.md` | Follow homeops routing |
| Incident diagnosis, post-mortem | `/home/wash/homeops/docs/index/trigger-index.md` | Follow homeops routing |

## Clappie Subsystems

| Trigger / Symptom | Open First | Then Open |
|---|---|---|
| Heartbeat checks, scheduling, bot tasks | `.claude/skills/clappie/clapps/heartbeat/REFERENCE.md` | `chores/bots/` check files |
| Sidekicks, spawning agents, background AI | `.claude/skills/clappie/clapps/sidekicks/REFERENCE.md` | — |
| Chores, human approval queue | `.claude/skills/clappie/clapps/chores/REFERENCE.md` | `chores/humans/` |
| Notifications, dirty/clean sync | `.claude/skills/clappie/clapps/notifications/REFERENCE.md` | — |
| Display engine, terminal UI, views | `.claude/skills/clappie/clapps/display-engine/REFERENCE.md` | — |
| Background apps, start/stop/list | `.claude/skills/clappie/clapps/background/REFERENCE.md` | — |
| Parties, AI swarm simulations, games | `.claude/skills/clappie/clapps/parties/REFERENCE.md` | — |
| OAuth, token management, auth flows | `.claude/skills/clappie/clapps/oauth/REFERENCE.md` | — |
| Projects, workspace, serving apps | `.claude/skills/clappie/clapps/projects/REFERENCE.md` | — |
| Building new skills, displays, webhooks | `.claude/skills/clappie/clapps/skill-maker/REFERENCE.md` | — |

## Domain Skills

| Trigger / Symptom | Open First | Then Open |
|---|---|---|
| Email, calendar, contacts, Drive, Google tasks | Load `google-workspace` skill | — |
| Weather data, climate logging, Sensibo calibration | `recall/files/weather-man/README.md` | Load `sensibo` skill |
| Smart AC, Climate React, Sensibo devices | Load `sensibo` skill | `recall/files/weather-man/README.md` |
| HA automations, scripts, blueprints, Jinja2 | Load `ha-automation` skill | — |
| HA dashboards, Lovelace, cards, themes | Load `ha-dashboard` skill | — |
| HA config management, deployment, CLI, logs | Load `home-assistant-manager` skill | — |
| Medical presentations, PubMed, literature reviews | Load `medical-presentations` skill | — |
| Backtesting, portfolio analysis, ETFs | Load `backtesto-agent` skill | — |
| Anesthesia shift scheduling, Google Sheets sync | Load `shift-scheduler` skill | — |
| University lectures, timetable sync | Load `xscheduler` skill | — |
| LXC container creation, Proxmox management | Load `container-management` skill | — |
| Pi-hole Docker, DNS sinkhole, ad blocking | Load `pi-hole` skill | — |
| Upload/sync files to S3, R2, cloud storage | Load `rclone` skill | — |
| Research, investigation, fact-finding | Load `investigate` skill | — |
| Image prompts, text-to-image, Gemini/FLUX/Imagen | Load `prompting-text-to-image-models` skill | — |
| Prompt writing, optimization for any AI tool | Load `prompt-master` skill | — |
| Presentations, documents, social posts (Gamma) | Use `mcp__claude_ai_Gamma__generate` | — |

## Skills Management

| Trigger / Symptom | Open First | Then Open |
|---|---|---|
| Install or find a skill | Load `skills-discovery` skill | — |
| Create a new skill | Load `skill-creator` skill | — |
| Deploy skill to another machine | Load `skill-deployer` skill | — |
| Port skill between Claude Code / Gemini CLI | Load `skill-porter` skill | — |

## Session Lifecycle

| Trigger / Symptom | Open First | Then Open |
|---|---|---|
| Session wrap-up, commit, push, update docs | Load `finalize` skill | — |
| Secrets handling, sops+age, env vars | `CLAUDE.md` § Secrets | `OPERATIONS.md` in homeops |
