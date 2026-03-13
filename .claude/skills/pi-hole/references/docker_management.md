# Docker Management for Pi-hole

## Container Lifecycle Commands

```bash
# Start/stop
cd /opt/pihole
docker compose up -d          # Start in background
docker compose down            # Stop and remove containers
docker compose restart         # Restart all services
docker compose stop            # Stop without removing
docker compose start           # Start previously stopped

# Logs
docker logs pihole             # Full logs
docker logs pihole --tail 100  # Last 100 lines
docker logs pihole -f          # Follow/stream
docker logs pihole --since 1h  # Last hour

# Inspection
docker ps -a --filter name=pihole    # Container status
docker stats pihole --no-stream      # Resource usage snapshot
docker inspect pihole                # Full container details
docker exec pihole pihole status     # Pi-hole-specific status

# Shell access
docker exec -it pihole /bin/bash     # Interactive shell
docker exec pihole <command>         # Run single command
```

## Resource Limits in docker-compose.yml

```yaml
services:
  pihole:
    image: pihole/pihole:latest
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
        reservations:
          memory: 128M
          cpus: '0.25'
```

Note: `deploy.resources` requires Docker Compose v2. Use `docker compose config` to verify the configuration parses correctly.

## Compose Management

### Environment Files
```bash
# .env file in same directory as docker-compose.yml
# Automatically loaded by docker compose
TZ=America/New_York
WEBPASSWORD=your-admin-password
PIHOLE_DNS_=1.1.1.1;9.9.9.9
```

Reference in docker-compose.yml:
```yaml
environment:
  TZ: ${TZ}
  WEBPASSWORD: ${WEBPASSWORD}
```

### Override Files
```yaml
# docker-compose.override.yml (auto-loaded)
# Use for local customizations without modifying the main file
services:
  pihole:
    environment:
      DNSMASQ_LISTENING: local
    ports:
      - "8080:80/tcp"    # Different web UI port
```

### Multiple Compose Files
```bash
# Merge multiple files (later files override earlier)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Validate merged config
docker compose -f docker-compose.yml -f docker-compose.prod.yml config
```

### Validation
```bash
# Check compose file syntax
docker compose config

# Check with specific file
docker compose -f docker-compose.yml config --quiet
# Exit code 0 = valid, non-zero = errors
```

## Image Management

```bash
# Pull latest image
docker compose pull

# Pull specific version
docker pull pihole/pihole:2024.07.0

# Pin version in docker-compose.yml
image: pihole/pihole:2024.07.0    # Instead of :latest

# List local images
docker images | grep pihole

# Check current image digest
docker inspect pihole/pihole:latest --format '{{.RepoDigests}}'

# Remove unused images
docker image prune              # Dangling only
docker image prune -a           # All unused
```

### Pin-Then-Update Workflow
```yaml
# 1. Pin current version in docker-compose.yml before updating
image: pihole/pihole:2024.07.0

# 2. Test new version
# Change to new tag, pull, and test
image: pihole/pihole:2024.08.0

# 3. If broken, revert to pinned version
image: pihole/pihole:2024.07.0
```

## Volume and Data Management

### Pi-hole Volumes
```bash
# List volumes
docker volume ls

# Inspect volume details
docker volume inspect <volume_name>

# Pi-hole bind mount paths (from docker-compose.yml)
./etc-pihole:/etc/pihole         # Config, gravity DB, FTL DB
./etc-dnsmasq.d:/etc/dnsmasq.d   # Custom dnsmasq config
```

### Backup Volumes
```bash
# Tar the bind mount directories
tar czf pihole-data-$(date +%Y%m%d).tar.gz etc-pihole/ etc-dnsmasq.d/

# Or use Pi-hole's built-in Teleporter
docker exec pihole pihole -a -t
# Creates /etc/pihole/teleporter_*.tar.gz inside container
docker cp pihole:/etc/pihole/teleporter_*.tar.gz ./backups/
```

### Permission Issues in LXC
If Docker volumes have wrong permissions in an LXC container:
```bash
# Check UID mapping
cat /etc/subuid
cat /etc/subgid

# Fix ownership on bind mounts
chown -R 999:999 /opt/pihole/etc-pihole/
# (999 is typical pihole user inside container)

# Or use Docker user mapping
# In /etc/docker/daemon.json:
# { "userns-remap": "default" }
```

## Network Troubleshooting

### Inspect Docker Networks
```bash
# List networks
docker network ls

# Inspect specific network
docker network inspect bridge

# Check container network settings
docker inspect pihole --format '{{json .NetworkSettings.Networks}}' | python3 -m json.tool
```

### DNS from Inside Container
```bash
# Test DNS resolution from within the container
docker exec pihole dig example.com @127.0.0.1 +short

# Test upstream connectivity
docker exec pihole dig example.com @1.1.1.1 +short

# Check resolv.conf inside container
docker exec pihole cat /etc/resolv.conf
```

### Port Conflicts
```bash
# Find what's using a port
ss -tlnp | grep :53
ss -ulnp | grep :53

# Common conflict: another DNS service on port 53
# Fix: stop the conflicting service before starting Pi-hole
```

### NAT and iptables
```bash
# Docker manages its own iptables rules for port mapping
iptables -t nat -L -n        # NAT rules (Docker port forwarding)
iptables -L DOCKER -n        # Docker filter chain

# If Docker networking breaks after firewall changes,
# restart Docker to recreate its iptables rules:
rc-service docker restart
```

## Docker Daemon Troubleshooting on Alpine

### Service Status
```bash
# Check if Docker is running
rc-service docker status

# Start Docker
rc-service docker start

# View Docker daemon log
cat /var/log/docker.log | tail -50
# Or: docker info (if daemon is running)
```

### Storage Driver Issues
```bash
# Check current driver
docker info --format '{{.Driver}}'
# Should be: overlay2

# If using vfs (very slow), Docker can't use overlay2
# Common in LXC without nesting=1
# Fix: enable nesting on the Proxmox host
# pct set <CTID> --features nesting=1,keyctl=1
```

### Disk Full
```bash
# Check disk space
df -h
docker system df              # Docker-specific usage

# Clean up
docker system prune           # Remove stopped containers, unused networks, dangling images
docker system prune -a        # Also remove unused images
docker volume prune           # Remove unused volumes (CAREFUL: may delete data)
```

### Docker Won't Start in LXC
```bash
# 1. Check nesting is enabled
# On Proxmox host:
pct config <CTID> | grep features
# Must show: nesting=1,keyctl=1

# 2. Check kernel modules (loaded on Proxmox host, shared with LXC)
lsmod | grep overlay
lsmod | grep br_netfilter

# 3. Check Docker daemon log for specific errors
cat /var/log/docker.log | tail -30

# 4. Common fix: stop container, enable features, restart
# On Proxmox host:
pct stop <CTID>
pct set <CTID> --features nesting=1,keyctl=1
pct start <CTID>
```

## Debugging Container Issues

### Exit Codes
```bash
# Check why container stopped
docker inspect pihole --format '{{.State.ExitCode}}'
# 0 = normal, 1 = app error, 137 = OOM killed, 139 = segfault

# Check OOM kill
docker inspect pihole --format '{{.State.OOMKilled}}'
```

### Health Check
```bash
# View health check status
docker inspect pihole --format '{{.State.Health.Status}}'

# View health check log (last 5 results)
docker inspect pihole --format '{{json .State.Health}}' | python3 -m json.tool
```

### Export Filesystem for Analysis
```bash
# Export container filesystem as tar (for offline inspection)
docker export pihole > pihole-fs.tar

# Or copy specific files out
docker cp pihole:/etc/pihole/pihole-FTL.conf ./
docker cp pihole:/var/log/pihole/ ./pihole-logs/
```

## Update Workflow

### Standard Update
```bash
# 1. Backup first
cd /opt/pihole
tar czf backup-pre-update-$(date +%Y%m%d).tar.gz etc-pihole/ etc-dnsmasq.d/ docker-compose.yml

# 2. Pull new image
docker compose pull

# 3. Recreate container with new image
docker compose up -d

# 4. Verify
docker exec pihole pihole status
dig example.com @127.0.0.1 +short
```

### Rollback
```bash
# If update breaks things:
docker compose down

# Edit docker-compose.yml to pin previous version
# image: pihole/pihole:2024.07.0

docker compose up -d
```
