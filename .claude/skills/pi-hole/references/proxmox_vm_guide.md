# Proxmox VM Guide for Pi-hole

> **Note**: VM deployment is the fallback approach. For the recommended LXC-based deployment, see `proxmox_lxc_guide.md`.

## VM Creation with `qm`

### Basic VM Creation
```bash
# Create VM with specific VMID
qm create <VMID> \
  --name <NAME> \
  --memory 512 \
  --cores 1 \
  --sockets 1 \
  --cpu host \
  --net0 virtio,bridge=vmbr0 \
  --scsihw virtio-scsi-single \
  --scsi0 <STORAGE>:4 \
  --ide2 <STORAGE>:iso/<ISO_FILENAME>,media=cdrom \
  --boot order=ide2 \
  --ostype l26 \
  --agent enabled=1
```

### Key `qm` Commands
| Command | Purpose |
|---------|---------|
| `qm create <VMID>` | Create new VM |
| `qm start <VMID>` | Start VM |
| `qm stop <VMID>` | Stop VM (hard) |
| `qm shutdown <VMID>` | Graceful shutdown |
| `qm destroy <VMID>` | Delete VM and disks |
| `qm set <VMID> --<option>` | Modify VM config |
| `qm config <VMID>` | Show VM config |
| `qm status <VMID>` | Show VM status |
| `qm clone <VMID> <NEW_VMID>` | Clone VM |
| `qm template <VMID>` | Convert to template |

### ISO Management
```bash
# Download Alpine ISO to Proxmox storage
wget -P /var/lib/vz/template/iso/ \
  https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/x86_64/alpine-virt-3.20.0-x86_64.iso

# Use alpine-virt (not alpine-standard) for VM deployments
# alpine-virt includes virtio drivers and is smaller
```

### Network Configuration
```bash
# Single NIC on default bridge
--net0 virtio,bridge=vmbr0

# With VLAN tag
--net0 virtio,bridge=vmbr0,tag=10

# Static IP (configured inside the VM, not via qm)
# Use setup-alpine or manual /etc/network/interfaces configuration
```

## Resource Sizing

### Minimum (Pi-hole only)
- **CPU**: 1 vCPU
- **RAM**: 256MB
- **Disk**: 2GB
- **Network**: 1 NIC
- Suitable for small networks (<50 devices)

### Recommended (Pi-hole + moderate blocklists)
- **CPU**: 1 vCPU
- **RAM**: 512MB
- **Disk**: 4GB
- **Network**: 1 NIC
- Suitable for home/small office (50-200 devices)

### Large deployment (heavy blocklists + logging)
- **CPU**: 2 vCPU
- **RAM**: 1024MB
- **Disk**: 8GB
- **Network**: 1 NIC
- Suitable for large networks (200+ devices) or long-term query logging

### Resource overhead breakdown
| Component | RAM | Disk |
|-----------|-----|------|
| Alpine Linux base | ~30MB | ~150MB |
| Docker daemon | ~50MB | ~500MB |
| Pi-hole container | ~100-200MB | ~500MB-1GB |
| Gravity DB (default lists) | ~20MB | ~50MB |
| Gravity DB (extensive lists) | ~100MB | ~300MB |
| Query log (7 days) | ~50MB | ~200MB |

## High Availability

### Primary + Secondary Setup
Run two Pi-hole instances on separate Proxmox nodes. Configure clients/DHCP with both DNS addresses.

```
Primary:   192.168.1.53  (VMID 200, Node pve1)
Secondary: 192.168.1.54  (VMID 201, Node pve2)
```

**Gravity Sync**: Use `gravity-sync` project or scripted `pihole -a -t` (Teleporter) exports + imports to keep blocklists synchronized between instances.

### Proxmox HA Group
```bash
# Add VM to HA group (requires Proxmox cluster)
ha-manager add vm:<VMID> --group <HA_GROUP> --state started --max_restart 3 --max_relocate 2
```

HA ensures the VM restarts on another node if the host fails. DNS interruption is brief (failover time) vs. full outage.

### Backup Schedule
```bash
# Proxmox vzdump backup
vzdump <VMID> --storage <BACKUP_STORAGE> --mode snapshot --compress zstd

# Schedule via Proxmox UI or cron
# Recommended: daily snapshots, weekly full backups
```

## VM Template Creation

After setting up a working Alpine + Docker VM, convert to template for quick cloning:

```bash
# Prepare the VM for templating
ssh root@alpine-vm "rc-service docker stop && apk cache clean && rm -rf /var/cache/apk/*"

# Stop and convert to template
qm stop <VMID>
qm template <VMID>

# Clone from template
qm clone <TEMPLATE_VMID> <NEW_VMID> --name pihole-02 --full
```

## Cloud-Init (Optional)

For automated Alpine configuration on first boot:

```bash
qm set <VMID> \
  --ide2 <STORAGE>:cloudinit \
  --ciuser root \
  --cipassword <TEMP_PASSWORD> \
  --sshkeys <PUBLIC_KEY_FILE> \
  --ipconfig0 ip=192.168.1.53/24,gw=192.168.1.1 \
  --nameserver 1.1.1.1
```

Note: Alpine cloud-init support requires `cloud-init` package installed in the image. The `alpine-virt` ISO does not include it by default.

## Firewall (Proxmox Level)

Proxmox has its own firewall that operates at the VM level:

```bash
# Enable firewall on the VM's network interface
qm set <VMID> --net0 virtio,bridge=vmbr0,firewall=1

# Configure rules via /etc/pve/firewall/<VMID>.fw or UI
# Required rules for Pi-hole:
# IN  ACCEPT -p tcp --dport 22   (SSH)
# IN  ACCEPT -p tcp --dport 53   (DNS TCP)
# IN  ACCEPT -p udp --dport 53   (DNS UDP)
# IN  ACCEPT -p tcp --dport 80   (Web UI)
```

This is in addition to any iptables rules inside the Alpine VM.

## Common Issues

### VM won't start after ISO removal
Set boot order to disk after install:
```bash
qm set <VMID> --boot order=scsi0
```

### No network after Alpine install
Ensure virtio drivers loaded and interface configured:
```bash
# Inside Alpine
echo "auto eth0" >> /etc/network/interfaces
echo "iface eth0 inet static" >> /etc/network/interfaces
echo "  address 192.168.1.53/24" >> /etc/network/interfaces
echo "  gateway 192.168.1.1" >> /etc/network/interfaces
rc-service networking restart
```

### QEMU guest agent not responding
Install and enable in Alpine:
```bash
apk add qemu-guest-agent
rc-update add qemu-guest-agent
rc-service qemu-guest-agent start
```
