#!/usr/bin/env bash
set -euo pipefail

# Create an Alpine Linux VM on Proxmox for hosting Pi-hole via Docker.
# Runs qm commands over SSH on the Proxmox host.

PROXMOX_HOST=""
PROXMOX_USER="root"
VMID=""
VM_NAME="pihole"
IP=""
GATEWAY=""
STORAGE="local-lvm"
ISO_STORAGE="local"
MEMORY=512
CORES=1
DISK_SIZE="4G"
BRIDGE="vmbr0"
ALPINE_VERSION="3.20"
VLAN_TAG=""

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Create an Alpine Linux VM on Proxmox for Pi-hole deployment.

Required:
  --proxmox-host HOST    Proxmox host IP or hostname
  --vmid ID              VM ID (e.g., 200)
  --ip IP                Static IP for the VM (e.g., 192.168.1.53)
  --gateway GW           Default gateway (e.g., 192.168.1.1)

Optional:
  --proxmox-user USER    SSH user for Proxmox (default: root)
  --name NAME            VM name (default: pihole)
  --storage STORE        Proxmox storage for disk (default: local-lvm)
  --iso-storage STORE    Proxmox storage for ISOs (default: local)
  --memory MB            RAM in MB (default: 512)
  --cores N              CPU cores (default: 1)
  --disk SIZE            Disk size (default: 4G)
  --bridge BRIDGE        Network bridge (default: vmbr0)
  --vlan-tag TAG         VLAN tag (optional)
  --alpine-version VER   Alpine version (default: 3.20)
  --help                 Show this help

Example:
  $(basename "$0") --proxmox-host 192.168.1.10 --vmid 200 \\
    --ip 192.168.1.53 --gateway 192.168.1.1
EOF
    exit 0
}

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "INFO: $*"; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --proxmox-host) PROXMOX_HOST="$2"; shift 2 ;;
        --proxmox-user) PROXMOX_USER="$2"; shift 2 ;;
        --vmid) VMID="$2"; shift 2 ;;
        --name) VM_NAME="$2"; shift 2 ;;
        --ip) IP="$2"; shift 2 ;;
        --gateway) GATEWAY="$2"; shift 2 ;;
        --storage) STORAGE="$2"; shift 2 ;;
        --iso-storage) ISO_STORAGE="$2"; shift 2 ;;
        --memory) MEMORY="$2"; shift 2 ;;
        --cores) CORES="$2"; shift 2 ;;
        --disk) DISK_SIZE="$2"; shift 2 ;;
        --bridge) BRIDGE="$2"; shift 2 ;;
        --vlan-tag) VLAN_TAG="$2"; shift 2 ;;
        --alpine-version) ALPINE_VERSION="$2"; shift 2 ;;
        --help) usage ;;
        *) die "Unknown option: $1" ;;
    esac
done

[[ -n "$PROXMOX_HOST" ]] || die "Missing --proxmox-host"
[[ -n "$VMID" ]] || die "Missing --vmid"
[[ -n "$IP" ]] || die "Missing --ip"
[[ -n "$GATEWAY" ]] || die "Missing --gateway"

PVE_SSH="${PROXMOX_USER}@${PROXMOX_HOST}"

run_pve() {
    ssh -o BatchMode=yes -o ConnectTimeout=10 "$PVE_SSH" "$@"
}

# Determine Alpine ISO filename and URL
ISO_FILENAME="alpine-virt-${ALPINE_VERSION}.0-x86_64.iso"
ISO_URL="https://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VERSION}/releases/x86_64/${ISO_FILENAME}"

# Check if ISO exists on Proxmox, download if not
info "Checking for Alpine ISO on Proxmox..."
ISO_PATH="/var/lib/vz/template/iso/${ISO_FILENAME}"
if run_pve "test -f ${ISO_PATH}"; then
    info "ISO already present: ${ISO_FILENAME}"
else
    info "Downloading Alpine ISO to Proxmox..."
    run_pve "wget -q -O '${ISO_PATH}' '${ISO_URL}'" || die "Failed to download Alpine ISO"
    info "ISO downloaded successfully"
fi

# Check if VMID already exists
if run_pve "qm status ${VMID}" 2>/dev/null; then
    die "VM ${VMID} already exists. Choose a different VMID or remove the existing VM."
fi

# Build network config
NET_CONFIG="virtio,bridge=${BRIDGE}"
[[ -n "$VLAN_TAG" ]] && NET_CONFIG="${NET_CONFIG},tag=${VLAN_TAG}"

# Create VM
info "Creating VM ${VMID} (${VM_NAME})..."
run_pve "qm create ${VMID} \
    --name '${VM_NAME}' \
    --memory ${MEMORY} \
    --cores ${CORES} \
    --sockets 1 \
    --cpu host \
    --net0 '${NET_CONFIG}' \
    --scsihw virtio-scsi-single \
    --scsi0 '${STORAGE}:${DISK_SIZE}' \
    --ide2 '${ISO_STORAGE}:iso/${ISO_FILENAME},media=cdrom' \
    --boot order=ide2 \
    --ostype l26 \
    --agent enabled=1 \
    --description 'Pi-hole DNS (Alpine + Docker) - IP: ${IP}'" \
    || die "Failed to create VM"

info "VM ${VMID} created successfully"

# Start VM
info "Starting VM ${VMID}..."
run_pve "qm start ${VMID}" || die "Failed to start VM"

info "VM ${VMID} is running."
echo ""
echo "=== Next Steps ==="
echo "1. Connect to VM console: ssh ${PVE_SSH} then 'qm terminal ${VMID}'"
echo "   Or use Proxmox web UI console"
echo "2. Run 'setup-alpine' inside the VM:"
echo "   - Keyboard layout: us"
echo "   - Hostname: ${VM_NAME}"
echo "   - Interface: eth0, static IP: ${IP}/24, gateway: ${GATEWAY}"
echo "   - DNS: ${GATEWAY} (temporary, Pi-hole will handle DNS later)"
echo "   - Root password: set a temporary one"
echo "   - Timezone: your timezone"
echo "   - Disk: sda, sys mode"
echo "3. After install completes and VM reboots:"
echo "   - Remove ISO: ssh ${PVE_SSH} 'qm set ${VMID} --ide2 none --boot order=scsi0'"
echo "   - Verify SSH: ssh root@${IP}"
echo "   - Run: bash setup_alpine.sh --host ${IP} --user root"
