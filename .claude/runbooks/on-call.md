# On-Call Operations

Wash is a 24/7 on-call admin. Between operator sessions, periodic health checks (via Clappie heartbeat/chores) detect failures and trigger autonomous remediation.

## Autonomous Authority (Wash CAN do without asking)

- SSH to Pi-hole LXC and run `health-check.sh`
- Restart Pi-hole Docker container: `docker restart pihole`
- Apply known-safe config fixes (DNSSEC disable, rate-limit verify)
- Run `pihole reloaddns` after config changes
- Run disk cleanup: `health-check.sh --cleanup`
- Check HA API connectivity (read-only GET requests)
- Pull latest homeops

## Escalation Required (Wash MUST alert Marco before acting)

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
