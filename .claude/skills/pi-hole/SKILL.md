---
name: pi-hole
description: Full lifecycle management of Pi-hole DNS servers deployed as Docker containers on Alpine Linux LXC containers (or VMs) in Proxmox. Use when creating, configuring, managing, backing up, or troubleshooting Pi-hole instances. Triggers on Pi-hole, DNS sinkhole, ad blocking DNS, gravity lists, or Proxmox DNS tasks.
allowed-tools: Read, Grep, Bash(ssh *), Bash(scp *), Bash(bash *), Bash(chmod *), Bash(wc *), Bash(dig *), Bash(nslookup *)
---

# Pi-hole on Alpine Linux (Proxmox)

## Overview

Deploy and manage Pi-hole DNS sinkholes running as Docker containers on minimal Alpine Linux LXC containers in Proxmox. This skill covers the full lifecycle: container creation, Alpine setup, Pi-hole deployment via Docker Compose, DNS configuration, blocklist management, backup/restore, updates, and monitoring.

**Architecture**: Alpine Linux LXC container (minimal footprint) -> Docker + Docker Compose -> Official Pi-hole container. This avoids unsupported native Alpine installs while keeping resource usage low (256-512MB RAM, 2-4GB disk). VMs are supported as a fallback; see `references/proxmox_vm_guide.md`.

**Execution model**: All operations run over SSH from the user's workstation to the remote host. Scripts accept `--host` and `--user` flags for targeting.

## Before You Start

### Prerequisites
- Proxmox VE host with API/SSH access
- Alpine LXC template available (or internet to download via `pveam`)
- SSH key pair for host access
- Local tools: `ssh`, `scp`, `dig`, `curl`

### Why Docker on Alpine (not native Pi-hole)
Pi-hole does NOT officially support Alpine Linux (musl libc, no systemd). Running Pi-hole natively on Alpine requires extensive patching and breaks on updates. Docker on Alpine gives:
- Official Pi-hole image with full support
- Alpine's minimal footprint as host OS
- Clean separation of OS and application
- Simple updates via container replacement

## Quick Start

Three steps to a working Pi-hole:

### 1. Create Alpine LXC Container on Proxmox
```bash
bash scripts/create_alpine_lxc.sh \
  --proxmox-host 192.168.1.10 \
  --ctid 200 \
  --name pihole-01 \
  --ip 192.168.1.53/24 \
  --gateway 192.168.1.1 \
  --ssh-key ~/.ssh/id_ed25519.pub
```

### 2. Set up Alpine with Docker
```bash
bash scripts/setup_alpine.sh \
  --host 192.168.1.53 \
  --user root \
  --lxc
```

### 3. Deploy Pi-hole
```bash
bash scripts/install_pihole.sh \
  --host 192.168.1.53 \
  --user root \
  --password "your-admin-password" \
  --dns1 1.1.1.1 \
  --dns2 9.9.9.9 \
  --timezone "America/New_York"
```

Web UI available at `http://192.168.1.53/admin`, DNS on port 53.

> **Using a VM instead?** Replace step 1 with `create_alpine_vm.sh` and omit `--lxc` in step 2. See `references/proxmox_vm_guide.md`.

## Core Workflows

### Container Creation on Proxmox

Use `scripts/create_alpine_lxc.sh` to provision an LXC container via `pct`/`pveam` commands over SSH.

**Resource defaults**: 1 core, 512MB RAM, 4GB disk (sufficient for Pi-hole + Docker overhead).

**What the script does**:
1. Downloads Alpine LXC template via `pveam` if not cached
2. Checks CTID availability via `pct status`
3. Creates unprivileged container with `pct create` including `nesting=1,keyctl=1` for Docker support
4. Configures network (static IP, gateway, optional VLAN) at creation time via `--net0`
5. Injects SSH public key for root access
6. Starts container and waits for running state

**Post-creation**: SSH into the container and proceed to `setup_alpine.sh --lxc`.

For detailed `pct` options, template management, HA considerations, and resource tuning, see `references/proxmox_lxc_guide.md`.

> **VM fallback**: Use `scripts/create_alpine_vm.sh` to create a VM with `qm` instead. See `references/proxmox_vm_guide.md` for VM-specific details.

### Alpine Post-Install Setup

Use `scripts/setup_alpine.sh` to prepare Alpine for running Docker. Pass `--lxc` when targeting an LXC container (skips `qemu-guest-agent` and adds Docker-in-LXC verification).

**What the script does**:
1. Enables community repository in `/etc/apk/repositories`
2. Installs packages: `docker`, `docker-cli-compose`, `curl`, `bash`, `iptables` (plus `qemu-guest-agent` on VMs)
3. Enables and starts Docker via OpenRC
4. On LXC: runs `docker run --rm hello-world` to verify nesting works
5. Configures firewall rules (DNS 53, HTTP 80, HTTPS 443, SSH 22)
6. Hardens SSH (disable password auth, root login with key only)
7. Sets up automatic security updates via `apk upgrade` cron job

For Alpine-specific details (OpenRC, apk, musl gotchas), see `references/alpine_setup.md`.

### Pi-hole Installation

Use `scripts/install_pihole.sh` to deploy Pi-hole via Docker Compose.

**What the script does**:
1. Creates `/opt/pihole/` directory structure on the remote host
2. Generates `docker-compose.yml` with user-specified settings
3. Runs `docker compose up -d`
4. Waits for container health, verifies DNS resolution
5. Confirms web UI accessibility

**docker-compose.yml template** (generated by script):
```yaml
services:
  pihole:
    container_name: pihole
    image: pihole/pihole:latest
    ports:
      - "53:53/tcp"
      - "53:53/udp"
      - "80:80/tcp"
    environment:
      TZ: "${TIMEZONE}"
      WEBPASSWORD: "${PASSWORD}"
      PIHOLE_DNS_: "${DNS1};${DNS2}"
      DNSMASQ_LISTENING: "all"
    volumes:
      - ./etc-pihole:/etc/pihole
      - ./etc-dnsmasq.d:/etc/dnsmasq.d
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "dig", "+short", "+norecurse", "@127.0.0.1", "pi.hole"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### DNS Configuration

After installation, configure Pi-hole's DNS behavior.

**Upstream DNS**: Set via environment variable or web UI. Common choices:
| Provider | Primary | Secondary | DoH | DoT |
|----------|---------|-----------|-----|-----|
| Cloudflare | 1.1.1.1 | 1.0.0.1 | `cloudflare-dns.com` | `tls://cloudflare-dns.com` |
| Quad9 | 9.9.9.9 | 149.112.112.112 | `dns.quad9.net` | `tls://dns.quad9.net` |
| Google | 8.8.8.8 | 8.8.4.4 | `dns.google` | `tls://dns.google` |

**Conditional forwarding**: For local DNS resolution, configure Pi-hole to forward local domain queries to your LAN DNS/router:
```
# Via pihole web UI: Settings > DNS > Conditional Forwarding
# Or via API/config: local network CIDR + router IP + local domain
```

**DNSSEC**: Enable in Settings > DNS. Validates responses from upstream. Requires upstream DNS that supports DNSSEC.

For full DNS configuration details, DoH setup, and split-horizon DNS, see `references/dns_configuration.md`.

### Blocklist Management

Pi-hole uses "gravity" -- a compiled database of blocked domains from subscribed blocklists.

**Default lists**: Pi-hole ships with Steven Black's unified hosts list. Add more via:
- Web UI: Group Management > Adlists
- API: `POST /admin/api/lists`

**Recommended additional lists**:
- `https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts`
- `https://s3.amazonaws.com/lists.disconnect.me/simple_tracking.txt`
- `https://s3.amazonaws.com/lists.disconnect.me/simple_ad.txt`

**Update gravity** after adding lists:
```bash
ssh user@pihole-host "docker exec pihole pihole -g"
```

**Regex and exact filters**: For fine-grained control beyond blocklists:
```bash
# Add regex blacklist
ssh user@pihole-host "docker exec pihole pihole regex '.*\.tracker\.com$'"
# Add exact whitelist
ssh user@pihole-host "docker exec pihole pihole -w example.com"
```

For curated list recommendations, group management, and regex patterns, see `references/blocklist_management.md`.

### DHCP Configuration (Optional)

Pi-hole can serve as DHCP server (disable your router's DHCP first).

Enable in docker-compose.yml by adding:
```yaml
    network_mode: host
    cap_add:
      - NET_ADMIN
```

Then enable DHCP in web UI: Settings > DHCP. Set range, gateway, and lease time.

**Warning**: Using `network_mode: host` changes port binding behavior. The container shares the host network stack directly.

### Backup and Restore

**Backup** with `scripts/backup_pihole.sh`:
```bash
bash scripts/backup_pihole.sh \
  --host 192.168.1.53 \
  --user root \
  --output ./backups/
```
Creates timestamped archive containing:
- Pi-hole Teleporter export (settings, blocklists, DNS records, DHCP leases)
- docker-compose.yml
- Custom dnsmasq configs

**Restore** with `scripts/restore_pihole.sh`:
```bash
bash scripts/restore_pihole.sh \
  --host 192.168.1.53 \
  --user root \
  --backup ./backups/pihole-backup-20250101-120000.tar.gz
```

For backup scheduling and disaster recovery procedures, see `references/troubleshooting.md`.

### Updates

Update Pi-hole by pulling the latest Docker image:
```bash
ssh user@pihole-host "cd /opt/pihole && docker compose pull && docker compose up -d"
```

**Before updating**:
1. Run a backup (see above)
2. Check release notes for breaking changes
3. Test DNS resolution after update

**Rollback**: If an update breaks things:
```bash
ssh user@pihole-host "cd /opt/pihole && docker compose down"
ssh user@pihole-host "docker pull pihole/pihole:<previous-tag>"
# Edit docker-compose.yml to pin version, then:
ssh user@pihole-host "cd /opt/pihole && docker compose up -d"
```

### Docker Management

Essential container lifecycle commands for day-to-day operations:

```bash
docker compose up -d           # Start Pi-hole
docker compose down            # Stop and remove
docker compose restart         # Restart
docker logs pihole --tail 50   # Recent logs
docker stats pihole --no-stream  # Resource usage
docker exec pihole pihole status  # Pi-hole status
docker exec -it pihole /bin/bash  # Shell access
```

For compose management (env files, overrides, profiles), resource limits, image pinning, volume backups, network debugging, and Docker daemon troubleshooting on Alpine, see `references/docker_management.md`.

### Monitoring and Health Checks

Use `scripts/health_check.sh` for comprehensive health verification:
```bash
bash scripts/health_check.sh \
  --host 192.168.1.53 \
  --user root
```

**Checks performed**:
- DNS resolution (dig test against Pi-hole)
- Container status and uptime
- Disk usage on host
- Pi-hole API stats (queries today, blocked percentage, status)
- Upstream DNS connectivity

**Pi-hole API endpoints** for monitoring integration:
```
GET http://pihole/admin/api.php?summary    # Dashboard stats
GET http://pihole/admin/api.php?topItems   # Top domains/advertisers
GET http://pihole/admin/api.php?getQueryTypes  # Query type distribution
```

For full API reference and monitoring integration, see `references/pihole_api.md`.

## Critical Rules

1. **Never install Pi-hole natively on Alpine** -- always use Docker. Native installs are unsupported and will break.
2. **Always back up before updates** -- use `backup_pihole.sh` before pulling new images.
3. **DNS is critical infrastructure** -- test resolution after ANY change. A broken Pi-hole means no DNS for the network.
4. **Use static IP for the Pi-hole host (LXC or VM)** -- DHCP-assigned IPs will cause DNS failures when the lease changes.
5. **LXC containers must have nesting=1 for Docker** -- without `nesting=1,keyctl=1` features, Docker cannot create containers inside LXC.
6. **Keep the web password secure** -- it's passed as an environment variable. Don't commit it to version control.
7. **Port 53 conflicts** -- if another service uses port 53 on the host (like systemd-resolved), it must be stopped first. Alpine doesn't have systemd-resolved, so this is typically not an issue.
8. **Firewall before exposure** -- the setup script configures iptables. Verify rules before exposing the host to untrusted networks.
9. **Container volumes are persistent** -- Pi-hole data lives in `./etc-pihole/` and `./etc-dnsmasq.d/` on the host. Deleting the container does NOT delete data. Deleting these directories DOES.
10. **macOS requires a .venv for Python** -- if running on macOS, always create and activate a Python virtual environment (`python3 -m venv .venv && source .venv/bin/activate`) before any Python operation (pip install, running scripts, etc.). macOS system Python is restricted and will fail without a venv.

## Troubleshooting Quick Reference

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| No DNS resolution | Container not running | `docker compose up -d` |
| Web UI unreachable | Port 80 blocked or container unhealthy | Check `iptables -L` and `docker ps` |
| Slow DNS | Upstream DNS slow or DNSSEC validation delays | Test upstream directly with `dig` |
| High memory | Too many blocklists loaded | Reduce adlists, check `docker stats` |
| Gravity update fails | Network issue or bad list URL | Check `docker exec pihole pihole -g` output |
| Container restart loop | Port conflict or corrupted config | Check `docker logs pihole`, verify ports |
| SSH connection refused | Firewall or SSH not running | Check Proxmox console, verify `rc-service sshd status` |
| Docker won't start (LXC) | Missing nesting/keyctl features | `pct set <CTID> --features nesting=1,keyctl=1` and restart |

For detailed troubleshooting procedures, see `references/troubleshooting.md`.

## Bundled Resources

### Scripts (`scripts/`)
| Script | Purpose |
|--------|---------|
| `create_alpine_lxc.sh` | Create Alpine Linux LXC container on Proxmox via `pct` |
| `create_alpine_vm.sh` | Create Alpine Linux VM on Proxmox via `qm` (fallback) |
| `setup_alpine.sh` | Post-install Alpine setup with Docker (supports `--lxc`) |
| `install_pihole.sh` | Deploy Pi-hole via Docker Compose |
| `backup_pihole.sh` | Backup Pi-hole config and gravity |
| `restore_pihole.sh` | Restore Pi-hole from backup archive |
| `health_check.sh` | Comprehensive health and DNS checks |

### References (`references/`)
| Document | Content |
|----------|---------|
| `proxmox_lxc_guide.md` | LXC creation, `pct` commands, nesting, Docker-in-LXC, HA |
| `proxmox_vm_guide.md` | VM creation, `qm` commands, resource sizing, HA (fallback) |
| `alpine_setup.md` | OpenRC, apk, musl libc notes, hardening, LXC notes |
| `docker_management.md` | Container lifecycle, compose, images, volumes, debugging |
| `dns_configuration.md` | Upstream DNS, conditional forwarding, DNSSEC, DoH |
| `blocklist_management.md` | Gravity, curated lists, regex filters, groups |
| `pihole_api.md` | REST API endpoints for monitoring and control |
| `troubleshooting.md` | Common issues, diagnostic commands, recovery |
