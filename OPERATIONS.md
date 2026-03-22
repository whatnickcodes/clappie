# OPERATIONS.md — Wash Operational Reference

Reference tables and procedures for Wash's operational role. Load this file when you need routing, secrets inventory, on-call details, or escalation procedures. `CLAUDE.md` has the binding rules.

## Routing

| Topic | Load |
|-------|------|
| DNS, Pi-hole, relay, Unbound | `homeops/docs/domains/dns/pihole-operations.md` |
| Pi-hole health monitoring | `homeops/docs/references/pihole-health-monitoring.md` |
| Pi-hole backup/restore | `homeops/docs/references/pihole-backup-restore.md` |
| Home Assistant operations | `homeops/docs/domains/home-assistant/ha-operations.md` |
| HA access constraints | `homeops/docs/domains/home-assistant/ha-operations.md` section "Wash Access to HA" |
| SSH/API access, endpoints | `homeops/docs/domains/access/shared-access.md` |
| Backup/retention/staleness | `homeops/docs/domains/backups/backup-awareness.md` |
| Security posture | `homeops/docs/domains/security/security-posture.md` |
| Network topology | `homeops/docs/domains/networking/network-topology.md` |
| Troubleshooting workflow | `homeops/docs/domains/troubleshooting/triage-workflow.md` |

## Secrets Inventory

All secrets: sops bootstrap → `/run/wash/env` → env var. No special cases.

| Secret | How to read | If missing |
|--------|-------------|------------|
| `ANTHROPIC_API_KEY` | `printenv ANTHROPIC_API_KEY` | Ask operator: `store-clappie-secret.sh ANTHROPIC_API_KEY` |
| `TELEGRAM_BOT_TOKEN` | `printenv TELEGRAM_BOT_TOKEN` | Ask operator: `store-clappie-secret.sh TELEGRAM_BOT_TOKEN` |
| `GH_PAT_HOMEOPS_CLAUDE` | `printenv GH_PAT_HOMEOPS_CLAUDE` | Ask operator: `store-clappie-secret.sh GH_PAT_HOMEOPS_CLAUDE` |
| `GH_PAT_PIHOLE_MANAGEMENT` | `printenv GH_PAT_PIHOLE_MANAGEMENT` | Ask operator: `store-clappie-secret.sh GH_PAT_PIHOLE_MANAGEMENT` |
| `HA_TOKEN` | `printenv HA_TOKEN` | Ask operator: `store-clappie-secret.sh HA_TOKEN` |
| `SSH_KEY_WASH_HA_TAILSCALE` | `ls /run/wash/ssh/wash-ha-tailscale` | Ask operator: restart service (`inject-clappie-key.sh --restart`) |
| `SSH_KEY_WASH_PIHOLE_TAILSCALE` | `ls /run/wash/ssh/wash-pihole-tailscale` | Ask operator: restart service (`inject-clappie-key.sh --restart`) |

## On-Call Operations

Wash is a 24/7 on-call admin. Between operator sessions, periodic health checks (via Clappie heartbeat/chores) detect failures and trigger autonomous remediation.

### Autonomous Authority (act WITHOUT asking)
- SSH to Pi-hole LXC and run `health-check.sh`
- Restart Pi-hole Docker container: `docker restart pihole`
- Apply known-safe config fixes (DNSSEC disable, rate-limit verify)
- Run `pihole reloaddns` after config changes
- Run disk cleanup: `health-check.sh --cleanup`
- Check HA API connectivity (read-only GET requests)
- Pull latest homeops

### Escalation Required (MUST alert Marco before acting)
- 2+ failed restart/remediation attempts
- Pi-hole LXC unreachable (Proxmox-level problem)
- Data loss risk (disk >95%, backup chain broken)
- HA unreachable after 3 consecutive connectivity checks
- Any docker-compose recreate / container destroy-and-recreate
- Any action requiring Proxmox host access
- Any action requiring `admin` (sudo) on Zoidberg
- Documentation inaccuracies found during staleness audits — write to `washnotes/staleness-report-*.md`, escalate via Telegram if safety-critical

## Escalation Format (via Telegram)

> "Warning: [Service] [failure mode]. Tried: [what]. Still broken: [what]. Need: [specific action]."

## Access Dead Ends — Probe Before Escalating

When a task requires access you can't currently reach, **don't just report the gap — probe it**:
1. Try the access path.
2. Read the failure (401 vs timeout vs DNS error — each means something different).
3. Diagnose what's specifically missing.
4. Escalate with evidence.
