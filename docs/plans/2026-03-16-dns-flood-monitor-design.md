# DNS Flood Monitor — Design

**Date:** 2026-03-16
**Context:** Marco hardened the VPS (iptables ANY blocking, hashlimits, dnsproxy --refuse-any, fail2ban jails) after Wash discovered a dhl.com ANY flood from the VPS relay. This check monitors Pi-hole downstream for signs that a flood is bypassing those defenses.

## Architecture

Single heartbeat check (`chores/bots/dns-flood-monitor.txt`) that SSHes to Pi-hole every 15m, grabs 4 metrics, and escalates based on thresholds. On critical detection, spawns an autonomous emergency sidekick.

## Metrics & Thresholds

| Metric | Collection method | Normal | Warning | Critical |
|--------|-------------------|--------|---------|----------|
| Queries/day | Pi-hole API or FTL query count | 5-15k | >50k | >50k + another metric |
| VPS query share | Pi-hole API topClients (IP: 100.101.18.71) | 30-60% | >80% | >80% + another metric |
| FTL db size | `du -sh pihole-FTL.db` | <500 MB | >1 GB | >1 GB + disk pressure |
| Disk usage | `df -h /` | <40% | >60% | >80% |

## Escalation Ladder

| Level | Trigger | Action |
|-------|---------|--------|
| Info | Any single metric at warning | Log only |
| Warning | 2+ metrics at warning OR queries >50k | Telegram alert to Marco |
| Critical | Disk >60% AND (queries >50k OR VPS share >80%) | Spawn emergency sidekick |
| Emergency | Disk >80% | Sidekick purges FTL.db immediately |

## Emergency Sidekick

Spawned at Critical/Emergency level with full context baked into prompt.

**Standing orders:**
1. Send Marco Telegram alert with all metrics
2. SSH in, monitor query rate over 2-3 min (sustained vs spike?)
3. If disk >80%: purge FTL.db immediately (autonomous authority per CLAUDE.md)
4. If disk <80% but flood confirmed: alert and wait — don't block VPS IP unless disk is about to fill
5. If Marco doesn't respond within 30 min and disk keeps climbing: purge FTL.db + reduce maxDBdays to 3 as emergency measure

**Exit criteria:** Sidekick completes when:
- Flood subsides (metrics return to normal), OR
- Marco acknowledges AND explicitly says he'll take care of the problem (acknowledgment alone is not enough — replying on Telegram doesn't mean he can access a laptop to fix), OR
- Emergency remediation is done and metrics stabilizing

## Files to create

- `chores/bots/dns-flood-monitor.txt` — heartbeat check file

## Verification

1. Read the check file, confirm it follows heartbeat format (instructions + [heartbeat-meta])
2. Confirm SSH command matches existing pihole-health pattern (`ssh -i /run/wash/ssh/wash-pihole-tailscale root@100.87.157.76`)
3. Wait for next heartbeat cycle and verify it runs + logs to `recall/logs/heartbeat/YYYY-MM-DD.txt`
