# Alpine Linux Setup for Pi-hole

## Package Management (apk)

### Repository Configuration
```bash
# /etc/apk/repositories
# Enable main + community repos (community required for Docker)
https://dl-cdn.alpinelinux.org/alpine/v3.20/main
https://dl-cdn.alpinelinux.org/alpine/v3.20/community
```

### Essential Commands
```bash
apk update                    # Refresh package index
apk upgrade                   # Upgrade all packages
apk add <package>             # Install package
apk del <package>             # Remove package
apk search <term>             # Search packages
apk info -a <package>         # Package details
apk cache clean               # Clear download cache
```

### Required Packages for Pi-hole Host
```bash
apk add \
  docker \
  docker-cli-compose \
  curl \
  bash \
  iptables \
  ip6tables \
  qemu-guest-agent \    # VM only -- skip on LXC containers
  ca-certificates \
  tzdata
```

## OpenRC (Init System)

Alpine uses OpenRC, not systemd. Key differences:

### Service Management
| systemd | OpenRC |
|---------|--------|
| `systemctl start svc` | `rc-service svc start` |
| `systemctl stop svc` | `rc-service svc stop` |
| `systemctl restart svc` | `rc-service svc restart` |
| `systemctl enable svc` | `rc-update add svc` |
| `systemctl disable svc` | `rc-update del svc` |
| `systemctl status svc` | `rc-service svc status` |
| `systemctl list-units` | `rc-status` |

### Runlevels
```bash
rc-update add docker default      # Start Docker at default runlevel
rc-update add qemu-guest-agent default
rc-update add iptables default    # Persist firewall rules across reboots
rc-status                         # Show all services and their states
```

### Docker on OpenRC
```bash
# Enable and start
rc-update add docker default
rc-service docker start

# Verify
docker info
docker compose version
```

Docker logs go to `/var/log/docker.log` (not journalctl).

## musl libc Considerations

Alpine uses musl libc instead of glibc. This is why Pi-hole cannot run natively:

- **DNS resolution**: musl's `getaddrinfo()` behaves differently. Pi-hole's FTL engine expects glibc behavior.
- **Binary compatibility**: Precompiled binaries built for glibc won't work. Pi-hole's install script downloads glibc-targeted binaries.
- **Locale support**: musl has minimal locale support. Pi-hole's web interface may have display issues natively.

**Docker solves this**: The Pi-hole Docker image runs on Debian/Ubuntu inside the container with glibc. The host OS (Alpine with musl) only runs Docker.

## Network Configuration

### Static IP Setup
```bash
# /etc/network/interfaces
auto lo
iface lo inet loopback

auto eth0
iface eth0 inet static
    address 192.168.1.53/24
    gateway 192.168.1.1
```

```bash
# Apply changes
rc-service networking restart

# DNS resolution for the host itself
echo "nameserver 127.0.0.1" > /etc/resolv.conf
echo "nameserver 1.1.1.1" >> /etc/resolv.conf
```

### Hostname
```bash
echo "pihole-01" > /etc/hostname
hostname -F /etc/hostname
```

## Firewall (iptables)

### Pi-hole Required Rules
```bash
# Flush existing rules
iptables -F
iptables -X

# Default policies
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT

# Allow established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# SSH
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# DNS (TCP + UDP)
iptables -A INPUT -p tcp --dport 53 -j ACCEPT
iptables -A INPUT -p udp --dport 53 -j ACCEPT

# HTTP (Pi-hole web UI)
iptables -A INPUT -p tcp --dport 80 -j ACCEPT

# HTTPS (if configured)
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# DHCP (only if Pi-hole DHCP enabled)
# iptables -A INPUT -p udp --dport 67 -j ACCEPT

# Docker forwarding
iptables -A FORWARD -i docker0 -j ACCEPT
iptables -A FORWARD -o docker0 -j ACCEPT

# Save rules (persist across reboots)
rc-service iptables save
rc-update add iptables default
```

### Restrict SSH to Specific Subnets
```bash
# Replace the broad SSH rule with:
iptables -A INPUT -p tcp -s 192.168.1.0/24 --dport 22 -j ACCEPT
```

## SSH Hardening

### `/etc/ssh/sshd_config` Recommended Settings
```
Port 22
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
ChallengeResponseAuthentication no
UsePAM no
X11Forwarding no
AllowTcpForwarding no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
```

```bash
# Apply changes
rc-service sshd restart
```

### SSH Key Setup
```bash
# On the workstation
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@192.168.1.53

# Or manually on the VM
mkdir -p /root/.ssh
chmod 700 /root/.ssh
# Paste public key into /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

## Automatic Updates

### Cron-Based Security Updates
```bash
# Add to root's crontab
echo "0 4 * * * /sbin/apk upgrade --no-cache >> /var/log/apk-upgrade.log 2>&1" | crontab -

# Enable cron daemon
rc-update add crond default
rc-service crond start
```

### Manual Upgrade Process
```bash
# Update package index and upgrade
apk update && apk upgrade

# For major Alpine version upgrades:
# 1. Update /etc/apk/repositories to new version
# 2. apk update && apk upgrade --available
# 3. Reboot
```

## Disk Management

### Check Disk Usage
```bash
df -h                  # Filesystem usage
du -sh /opt/pihole/    # Pi-hole data size
du -sh /var/lib/docker/ # Docker storage usage
```

### Docker Disk Cleanup
```bash
docker system prune -a      # Remove unused images, containers, volumes
docker image prune           # Remove dangling images only
```

### Extend Disk (if needed)
On Proxmox host:
```bash
qm resize <VMID> scsi0 +2G
```

Inside Alpine VM:
```bash
apk add e2fsprogs-extra
resize2fs /dev/sda3    # Adjust device path as needed
```

## Timezone Configuration
```bash
apk add tzdata
cp /usr/share/zoneinfo/America/New_York /etc/localtime
echo "America/New_York" > /etc/timezone
apk del tzdata    # Optional: remove after setting timezone
```

## Logging

### System Logs
```bash
# Alpine uses busybox syslog by default
cat /var/log/messages          # System log
cat /var/log/docker.log        # Docker daemon log
docker logs pihole             # Pi-hole container log
docker logs pihole --tail 100  # Last 100 lines
docker logs pihole -f          # Follow/stream logs
```

### Log Rotation
```bash
# /etc/logrotate.d/docker
/var/log/docker.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
}
```

## LXC-Specific Notes

When running Alpine as an LXC container (instead of a VM), several differences apply.

### No Guest Agent
`qemu-guest-agent` is not needed in LXC containers. The Proxmox host manages the container directly via `pct` without requiring a guest agent. The `setup_alpine.sh --lxc` flag skips this package automatically.

### Docker Requirements
LXC containers must have `nesting=1` and `keyctl=1` features enabled for Docker to function:
```bash
# Check features (on Proxmox host)
pct config <CTID> | grep features
# Must show: nesting=1,keyctl=1

# Fix if missing (container must be stopped)
pct set <CTID> --features nesting=1,keyctl=1
```

Without these features, Docker will fail to start or fall back to the slow `vfs` storage driver.

### /dev/net/tun
Some Docker networking features require the TUN device. If not available inside the container:
```bash
mkdir -p /dev/net
mknod /dev/net/tun c 10 200
chmod 666 /dev/net/tun
```

### Shared Kernel Modules
LXC containers share the host kernel. Kernel modules (like `overlay`, `br_netfilter`) must be loaded on the Proxmox host, not inside the container:
```bash
# On the Proxmox host
modprobe overlay
modprobe br_netfilter
```

### Disk Resize
Unlike VMs (which need guest-side `resize2fs`), LXC disk resize is handled entirely from the Proxmox host:
```bash
pct resize <CTID> rootfs +2G
```
The filesystem expands automatically without guest intervention.
