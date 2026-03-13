# Troubleshooting Guide

## Diagnostic Commands

### Quick Health Check
```bash
# Container status
docker ps -a --filter name=pihole
docker inspect pihole --format '{{.State.Status}} (uptime: {{.State.StartedAt}})'

# DNS test
dig example.com @<PIHOLE_IP> +short +time=5

# Pi-hole status
docker exec pihole pihole status

# Container logs (last 50 lines)
docker logs pihole --tail 50

# Resource usage
docker stats pihole --no-stream
```

### System-Level Diagnostics
```bash
# Disk space
df -h

# Memory
free -m

# Docker disk usage
docker system df

# Network listeners
ss -tlnp | grep -E ':(53|80|443) '

# Firewall rules
iptables -L -n --line-numbers
```

## Common Issues

### 1. No DNS Resolution

**Symptoms**: Clients can't resolve any domains. `dig @pihole-ip example.com` returns no answer or times out.

**Check**:
```bash
# Is container running?
docker ps | grep pihole

# Is DNS port listening?
ss -ulnp | grep :53

# Can Pi-hole resolve internally?
docker exec pihole dig example.com @127.0.0.1 +short

# Check upstream connectivity
docker exec pihole dig example.com @1.1.1.1 +short
```

**Fixes**:
- Container not running: `cd /opt/pihole && docker compose up -d`
- Port conflict: Check if another process uses port 53: `ss -ulnp | grep :53`
- Upstream unreachable: Verify network from container: `docker exec pihole ping -c 3 1.1.1.1`
- Corrupted gravity: `docker exec pihole pihole -g`

### 2. Web UI Not Accessible

**Symptoms**: `http://pihole-ip/admin` doesn't load.

**Check**:
```bash
# Port 80 listening?
ss -tlnp | grep :80

# Container health
docker inspect pihole --format '{{.State.Health.Status}}'

# Web server running inside container?
docker exec pihole curl -s -o /dev/null -w "%{http_code}" http://localhost/admin/
```

**Fixes**:
- Port 80 blocked by firewall: `iptables -A INPUT -p tcp --dport 80 -j ACCEPT`
- lighttpd crashed: `docker restart pihole`
- Wrong bind address: Check docker-compose.yml ports section

### 3. Slow DNS Resolution

**Symptoms**: DNS works but responses are delayed (>100ms).

**Check**:
```bash
# Measure Pi-hole response time
dig example.com @<PIHOLE_IP> | grep "Query time"

# Measure upstream directly
dig example.com @1.1.1.1 | grep "Query time"

# Check if DNSSEC is causing delays
dig +dnssec example.com @<PIHOLE_IP> | grep "Query time"
```

**Fixes**:
- Slow upstream: Switch DNS providers
- DNSSEC overhead: Disable if not needed (Settings > DNS)
- Large gravity DB: Reduce adlist count
- Cache miss: Increase cache size in dnsmasq config

### 4. Container Restart Loop

**Symptoms**: Container keeps restarting. `docker ps` shows frequent restarts.

**Check**:
```bash
# View restart count
docker inspect pihole --format '{{.RestartCount}}'

# View exit code
docker inspect pihole --format '{{.State.ExitCode}}'

# Full logs
docker logs pihole 2>&1 | tail -100
```

**Common causes**:
- **Port 53 conflict**: Another service on port 53. Stop it or change Pi-hole port.
- **Corrupted config**: Remove `/opt/pihole/etc-pihole/pihole-FTL.db` and restart.
- **Permission issues**: Check volume ownership: `ls -la /opt/pihole/etc-pihole/`
- **Out of memory**: Increase VM RAM or reduce blocklists.

### 5. Gravity Update Fails

**Symptoms**: `pihole -g` shows download failures.

**Check**:
```bash
# Run gravity with verbose output
docker exec pihole pihole -g

# Test list URL directly
docker exec pihole curl -sI "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"

# Check DNS resolution from container
docker exec pihole nslookup raw.githubusercontent.com
```

**Fixes**:
- DNS bootstrap: Container can't resolve list URLs because Pi-hole IS the DNS. Add fallback:
  ```bash
  # Ensure container has working DNS for bootstrapping
  docker exec pihole sh -c 'echo "nameserver 1.1.1.1" > /etc/resolv.conf'
  ```
- Bad list URL: Check `sqlite3 /etc/pihole/gravity.db "SELECT address,status FROM adlist;"` for status != 0
- Network issue: Verify outbound HTTPS from container: `docker exec pihole curl -s https://example.com`

### 6. High Memory Usage

**Symptoms**: VM running out of RAM, OOM kills.

**Check**:
```bash
# Container memory usage
docker stats pihole --no-stream --format "{{.MemUsage}}"

# System memory
free -m

# Gravity DB size
docker exec pihole ls -lh /etc/pihole/gravity.db
```

**Fixes**:
- Too many blocklists: Remove lists with many overlapping domains
- Large query log: Reduce log retention in `/etc/pihole/pihole-FTL.conf`:
  ```
  MAXDBDAYS=7
  ```
- Increase VM RAM: `qm set <VMID> --memory 1024` (on Proxmox host)

### 7. SSH Connection Issues

**Symptoms**: Cannot SSH to the Pi-hole VM.

**Check** (from Proxmox console):
```bash
# Is SSH running?
rc-service sshd status

# Firewall blocking SSH?
iptables -L -n | grep 22

# SSH listening?
ss -tlnp | grep :22

# Check sshd config
cat /etc/ssh/sshd_config | grep -E '^(Port|PermitRootLogin|PasswordAuthentication)'
```

**Fixes**:
- SSH not started: `rc-service sshd start && rc-update add sshd`
- Firewall blocking: `iptables -I INPUT -p tcp --dport 22 -j ACCEPT`
- Key auth failing: Check `/root/.ssh/authorized_keys` permissions (700 for dir, 600 for file)
- Password auth disabled but no key: Access via Proxmox console, fix sshd_config

### 8. Docker Won't Start

**Symptoms**: Docker service fails to start on Alpine.

**Check**:
```bash
rc-service docker status
cat /var/log/docker.log | tail -20
```

**Fixes**:
- Missing modules: `modprobe overlay && modprobe br_netfilter`
- Disk full: `df -h` -- clean up with `docker system prune`
- Corrupted state: `rm -rf /var/lib/docker/runtimes` and restart

### 9. Docker Won't Start in LXC

**Symptoms**: Docker service fails to start inside an LXC container. Logs may show permission denied, operation not permitted, or overlay mount failures.

**Check**:
```bash
# On Proxmox host: verify container features
pct config <CTID> | grep features
# Must include: nesting=1,keyctl=1

# Inside container: check storage driver
docker info --format '{{.Driver}}' 2>/dev/null
# Should be overlay2. If vfs, nesting is likely disabled.

# Check daemon log
cat /var/log/docker.log | tail -30
```

**Fixes**:
```bash
# On Proxmox host:
pct stop <CTID>
pct set <CTID> --features nesting=1,keyctl=1
pct start <CTID>

# Then inside container:
rc-service docker start
docker run --rm hello-world    # Verify
```

If Docker still fails, check that `overlay` and `br_netfilter` kernel modules are loaded on the Proxmox host: `lsmod | grep overlay`.

### 10. LXC Container Issues

**Container won't start**:
```bash
# Check config for errors
pct config <CTID>
# Check Proxmox task log
journalctl -u pve-container@<CTID> --no-pager -n 50
# Common causes: storage offline, CTID conflict, template missing
```

**No network in LXC**:
```bash
# Verify network config
pct config <CTID> | grep net
# Check inside container
pct exec <CTID> -- ip addr
pct exec <CTID> -- ping -c 3 1.1.1.1
# Fix: reconfigure network
pct set <CTID> --net0 name=eth0,bridge=vmbr0,ip=<IP>/24,gw=<GATEWAY>
# Restart container for network changes
pct reboot <CTID>
```

**Can't SSH to LXC**:
```bash
# Access via Proxmox console
pct enter <CTID>
# Check SSH is running
rc-service sshd status
# Check authorized_keys
cat /root/.ssh/authorized_keys
# Verify firewall isn't blocking
iptables -L -n | grep 22
```

## Recovery Procedures

### Full Recovery from Backup
```bash
# 1. Stop current Pi-hole
ssh root@pihole "cd /opt/pihole && docker compose down"

# 2. Restore docker-compose.yml
scp backup/docker-compose.yml root@pihole:/opt/pihole/

# 3. Start fresh container
ssh root@pihole "cd /opt/pihole && docker compose up -d"

# 4. Wait for container to be healthy
sleep 30

# 5. Restore Teleporter backup
scp backup/teleporter_*.tar.gz root@pihole:/tmp/
ssh root@pihole "docker exec pihole pihole -a -t /tmp/teleporter_*.tar.gz"

# 6. Verify
dig example.com @pihole-ip +short
```

### Emergency: Disable Pi-hole Blocking
If Pi-hole is causing network issues and you need to restore connectivity:

```bash
# Option 1: Disable blocking temporarily (5 minutes)
ssh root@pihole "docker exec pihole pihole disable 300"

# Option 2: Stop Pi-hole entirely
ssh root@pihole "docker stop pihole"

# Option 3: Change client DNS to bypass Pi-hole
# Update DHCP server to hand out 1.1.1.1 / 8.8.8.8 instead

# Option 4: Via API (if web UI accessible)
curl "http://pihole-ip/admin/api.php?disable=300&auth=<TOKEN>"
```

### Rebuild from Scratch
If the Pi-hole host is completely broken:
1. Create new Alpine LXC container (`create_alpine_lxc.sh`) or VM (`create_alpine_vm.sh`)
2. Setup Alpine (`setup_alpine.sh --lxc` for LXC, or without for VM)
3. Install Pi-hole (`install_pihole.sh`)
4. Restore from backup (`restore_pihole.sh`)

Total data to restore is small (<10MB typically): blocklists, settings, custom DNS records.

## Backup Scheduling

### Automated Backups via Cron
```bash
# On the Pi-hole VM, add to root crontab:
0 2 * * * cd /opt/pihole && docker exec pihole pihole -a -t && \
  mv /opt/pihole/etc-pihole/teleporter_*.tar.gz /opt/pihole/backups/ 2>/dev/null

# Or from your workstation (remote backup):
0 3 * * * /path/to/backup_pihole.sh --host 192.168.1.53 --user root --output /backups/pihole/
```

### Backup Retention
Keep at least:
- Daily backups: 7 days
- Weekly backups: 4 weeks
- Before-update backups: indefinitely until next successful update verified

### Verify Backups
Periodically test restoration on a separate host to ensure backups are valid:
```bash
# Spin up test LXC/VM, install Pi-hole, restore backup, verify DNS works
```

## Docker Debugging

For detailed Docker troubleshooting beyond Pi-hole-specific issues (container lifecycle, compose management, resource limits, image management, volume/network debugging, and Alpine-specific Docker daemon issues), see `docker_management.md`.
