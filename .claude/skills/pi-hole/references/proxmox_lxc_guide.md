# Proxmox LXC Guide for Pi-hole

## LXC Creation with `pct`

### Basic Container Creation
```bash
# Create unprivileged Alpine LXC with Docker support
pct create <CTID> <STORAGE>:vztmpl/<TEMPLATE> \
  --hostname <NAME> \
  --memory 512 \
  --cores 1 \
  --rootfs <STORAGE>:4 \
  --net0 name=eth0,bridge=vmbr0,ip=192.168.1.53/24,gw=192.168.1.1 \
  --unprivileged 1 \
  --features nesting=1,keyctl=1 \
  --ssh-public-keys /path/to/id_ed25519.pub \
  --ostype alpine \
  --start 0
```

**`nesting=1`** is required for Docker. It allows the container to create nested namespaces (cgroups, mount, PID) which Docker uses for container isolation. Without it, `dockerd` fails at startup.

**`keyctl=1`** enables the `keyctl()` system call needed by Docker's overlay2 storage driver on newer kernels.

**`--unprivileged 1`** runs the container with user namespace mapping for better isolation. Docker works in unprivileged containers when nesting and keyctl are enabled.

### Key `pct` Commands
| Command | Purpose |
|---------|---------|
| `pct create <CTID>` | Create new container |
| `pct start <CTID>` | Start container |
| `pct stop <CTID>` | Stop container (hard) |
| `pct shutdown <CTID>` | Graceful shutdown |
| `pct destroy <CTID>` | Delete container and storage |
| `pct set <CTID> --<option>` | Modify container config |
| `pct config <CTID>` | Show container config |
| `pct status <CTID>` | Show container status |
| `pct clone <CTID> <NEW_CTID>` | Clone container |
| `pct enter <CTID>` | Attach to container shell |
| `pct exec <CTID> -- <cmd>` | Run command in container |
| `pct list` | List all containers |

## Template Management with `pveam`

```bash
# Update template database
pveam update

# List available Alpine templates
pveam available --section system | grep alpine

# Download template to storage
pveam download <STORAGE> <TEMPLATE_NAME>
# Example: pveam download local alpine-3.20-default_20240908_amd64.tar.xz

# List downloaded templates
pveam list <STORAGE>
```

Template names follow the pattern: `alpine-<VERSION>-default_<DATE>_amd64.tar.xz`. Use `pveam available` to find the exact name for your target version.

## Resource Sizing

LXC containers have lower overhead than VMs (no kernel, no QEMU process), so requirements are slightly reduced.

### Minimum (Pi-hole only)
- **CPU**: 1 core
- **RAM**: 256MB
- **Disk**: 2GB
- Suitable for small networks (<50 devices)

### Recommended (Pi-hole + moderate blocklists)
- **CPU**: 1 core
- **RAM**: 512MB
- **Disk**: 4GB
- Suitable for home/small office (50-200 devices)

### Large deployment (heavy blocklists + logging)
- **CPU**: 2 cores
- **RAM**: 1024MB
- **Disk**: 8GB
- Suitable for large networks (200+ devices) or long-term query logging

### Overhead comparison vs VM
| Component | LXC | VM |
|-----------|-----|-----|
| Kernel | Shared with host | Dedicated (~30MB) |
| Init system | OpenRC only | OpenRC + QEMU overhead |
| Base idle RAM | ~15MB | ~50MB |
| Boot time | 1-2 seconds | 10-30 seconds |

## Network Configuration

### At Creation Time
```bash
# Static IP on default bridge
--net0 name=eth0,bridge=vmbr0,ip=192.168.1.53/24,gw=192.168.1.1

# With VLAN tag
--net0 name=eth0,bridge=vmbr0,ip=192.168.1.53/24,gw=192.168.1.1,tag=10

# DHCP (not recommended for Pi-hole)
--net0 name=eth0,bridge=vmbr0,ip=dhcp
```

### Post-Creation Changes
```bash
# Change IP address
pct set <CTID> --net0 name=eth0,bridge=vmbr0,ip=192.168.1.54/24,gw=192.168.1.1

# Add VLAN tag
pct set <CTID> --net0 name=eth0,bridge=vmbr0,ip=192.168.1.53/24,gw=192.168.1.1,tag=10
```

Network changes via `pct set` require a container restart to take effect.

### DNS Configuration
```bash
# Set DNS server for the container itself
pct set <CTID> --nameserver 1.1.1.1
# Set search domain
pct set <CTID> --searchdomain local.lan
```

## Storage

### Root Filesystem
```bash
# Set at creation
--rootfs <STORAGE>:4    # 4GB on specified storage

# Resize after creation
pct resize <CTID> rootfs +2G
```

No guest-side tools needed for resize -- the filesystem expands automatically on next boot (or immediately if the container is running, depending on storage type).

### Bind Mounts
```bash
# Mount host directory into container (useful for shared data)
pct set <CTID> --mp0 /host/path,mp=/container/path

# Read-only bind mount
pct set <CTID> --mp0 /host/path,mp=/container/path,ro=1
```

## Docker-in-LXC Requirements

### Mandatory Settings
| Setting | Value | Why |
|---------|-------|-----|
| `features` | `nesting=1,keyctl=1` | Allows nested namespaces and keyctl syscall |
| `unprivileged` | `1` | Recommended; Docker works with user namespaces |

### Storage Driver
Docker defaults to `overlay2` on Alpine. Verify after install:
```bash
docker info --format '{{.Driver}}'
```

If Docker falls back to `vfs` (very slow), check that `nesting=1` and `keyctl=1` are set.

### Verify Docker Works
```bash
# Quick test after install
docker run --rm hello-world

# If this fails with permission errors, check:
pct config <CTID> | grep features
# Should show: nesting=1,keyctl=1
```

## High Availability

### HA Group Configuration
```bash
# Add container to HA group (requires Proxmox cluster)
# Note: LXC uses ct: prefix (not vm:)
ha-manager add ct:<CTID> --group <HA_GROUP> --state started --max_restart 3 --max_relocate 2
```

HA ensures the container restarts on another node if the host fails. LXC migration is faster than VM migration due to smaller state.

### Primary + Secondary Setup
Run two Pi-hole containers on separate nodes:
```
Primary:   192.168.1.53  (CTID 200, Node pve1)
Secondary: 192.168.1.54  (CTID 201, Node pve2)
```

## Backup with `vzdump`

```bash
# Snapshot backup
vzdump <CTID> --storage <BACKUP_STORAGE> --mode snapshot --compress zstd

# Stop-mode backup (brief downtime, most consistent)
vzdump <CTID> --storage <BACKUP_STORAGE> --mode stop --compress zstd

# Schedule via Proxmox UI or cron
# Recommended: daily snapshots, weekly full backups
```

LXC backups are significantly smaller and faster than VM backups (no disk image overhead).

## LXC vs VM Comparison

| Aspect | LXC Container | VM |
|--------|--------------|-----|
| Boot time | 1-2 seconds | 10-30 seconds |
| RAM overhead | ~15MB | ~50MB (kernel + QEMU) |
| Isolation | Shared kernel, namespace isolation | Full hardware virtualization |
| Docker support | Yes (with nesting=1, keyctl=1) | Yes (native) |
| Management tool | `pct` | `qm` |
| Guest agent | Not needed | `qemu-guest-agent` |
| Disk resize | `pct resize` (no guest tools) | `qm resize` + guest-side `resize2fs` |
| Backup size | Smaller (rootfs only) | Larger (full disk image) |
| Migration speed | Fast (container state only) | Slower (RAM + disk) |
| Kernel modules | Shared from host | Independent |

**When to use VM instead of LXC**:
- You need full kernel isolation (multi-tenant or untrusted workloads)
- You need custom kernel modules not loaded on the Proxmox host
- You need to run non-Linux operating systems

## Common Issues

### Docker Won't Start in LXC
```bash
# Check features
pct config <CTID> | grep features
# Must include: nesting=1,keyctl=1

# Fix if missing (container must be stopped)
pct stop <CTID>
pct set <CTID> --features nesting=1,keyctl=1
pct start <CTID>
```

### /dev/net/tun Not Available
Some Docker features need TUN device. If missing:
```bash
# Inside the container
mkdir -p /dev/net
mknod /dev/net/tun c 10 200
chmod 666 /dev/net/tun
```

For persistence, add to container startup script or create a service.

### AppArmor Blocking Docker
If Docker fails with AppArmor-related errors:
```bash
# On the Proxmox host, check container config
# /etc/pve/lxc/<CTID>.conf
# Add if needed:
lxc.apparmor.profile: unconfined
```

Restart the container after changing this setting.

### Container Won't Start
```bash
# Check config for errors
pct config <CTID>

# Check Proxmox task log
journalctl -u pve-container@<CTID> --no-pager -n 50

# Common fixes:
# - Storage not available: verify storage is online
# - Template missing: re-download with pveam
# - Resource conflict: check if CTID is already in use
```
