#!/usr/bin/env bash
set -euo pipefail

# Create an Alpine Linux LXC container on Proxmox for hosting Pi-hole via Docker.
# Runs pct/pveam commands over SSH on the Proxmox host.

PROXMOX_HOST=""
PROXMOX_USER="root"
CTID=""
CT_NAME="pihole"
IP=""
GATEWAY=""
STORAGE="local-lvm"
MEMORY=512
CORES=1
DISK_SIZE=4
BRIDGE="vmbr0"
ALPINE_VERSION="3.20"
VLAN_TAG=""
SSH_KEY=""

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Create an Alpine Linux LXC container on Proxmox for Pi-hole deployment.
Enables nesting=1 and keyctl=1 for Docker-in-LXC support.

Required:
  --proxmox-host HOST    Proxmox host IP or hostname
  --ctid ID              Container ID (e.g., 200)
  --ip IP/CIDR           Static IP for the container (e.g., 192.168.1.53/24)
  --gateway GW           Default gateway (e.g., 192.168.1.1)
  --ssh-key PATH         Path to SSH public key file

Optional:
  --proxmox-user USER    SSH user for Proxmox (default: root)
  --name NAME            Container name (default: pihole)
  --storage STORE        Proxmox storage for rootfs (default: local-lvm)
  --memory MB            RAM in MB (default: 512)
  --cores N              CPU cores (default: 1)
  --disk GB              Disk size in GB (default: 4)
  --bridge BRIDGE        Network bridge (default: vmbr0)
  --vlan-tag TAG         VLAN tag (optional)
  --alpine-version VER   Alpine version (default: 3.20)
  --help                 Show this help

Example:
  $(basename "$0") --proxmox-host 192.168.1.10 --ctid 200 \\
    --ip 192.168.1.53/24 --gateway 192.168.1.1 \\
    --ssh-key ~/.ssh/id_ed25519.pub
EOF
    exit 0
}

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "INFO: $*"; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --proxmox-host) PROXMOX_HOST="$2"; shift 2 ;;
        --proxmox-user) PROXMOX_USER="$2"; shift 2 ;;
        --ctid) CTID="$2"; shift 2 ;;
        --name) CT_NAME="$2"; shift 2 ;;
        --ip) IP="$2"; shift 2 ;;
        --gateway) GATEWAY="$2"; shift 2 ;;
        --storage) STORAGE="$2"; shift 2 ;;
        --memory) MEMORY="$2"; shift 2 ;;
        --cores) CORES="$2"; shift 2 ;;
        --disk) DISK_SIZE="$2"; shift 2 ;;
        --bridge) BRIDGE="$2"; shift 2 ;;
        --vlan-tag) VLAN_TAG="$2"; shift 2 ;;
        --alpine-version) ALPINE_VERSION="$2"; shift 2 ;;
        --ssh-key) SSH_KEY="$2"; shift 2 ;;
        --help) usage ;;
        *) die "Unknown option: $1" ;;
    esac
done

[[ -n "$PROXMOX_HOST" ]] || die "Missing --proxmox-host"
[[ -n "$CTID" ]] || die "Missing --ctid"
[[ -n "$IP" ]] || die "Missing --ip (use CIDR notation, e.g., 192.168.1.53/24)"
[[ -n "$GATEWAY" ]] || die "Missing --gateway"
[[ -n "$SSH_KEY" ]] || die "Missing --ssh-key (path to public key file)"
[[ -f "$SSH_KEY" ]] || die "SSH key file not found: $SSH_KEY"

PVE_SSH="${PROXMOX_USER}@${PROXMOX_HOST}"

run_pve() {
    ssh -o BatchMode=yes -o ConnectTimeout=10 "$PVE_SSH" "$@"
}

# Upload SSH public key to Proxmox host (needed for pct create --ssh-public-keys)
info "Uploading SSH public key to Proxmox host..."
REMOTE_KEY_PATH="/tmp/pihole_ssh_key_${CTID}.pub"
scp -o BatchMode=yes -o ConnectTimeout=10 "$SSH_KEY" "${PVE_SSH}:${REMOTE_KEY_PATH}" \
    || die "Failed to upload SSH key to Proxmox host"

# Find and download Alpine LXC template
info "Checking for Alpine LXC template..."
run_pve "pveam update" >/dev/null 2>&1 || true

TEMPLATE_NAME=$(run_pve "pveam available --section system | grep 'alpine-${ALPINE_VERSION}' | awk '{print \$2}' | head -1")
[[ -n "$TEMPLATE_NAME" ]] || die "No Alpine ${ALPINE_VERSION} template found. Check available templates with: pveam available --section system | grep alpine"

# Determine template storage (use local for templates)
TEMPLATE_STORAGE="local"

if ! run_pve "pveam list ${TEMPLATE_STORAGE} | grep -q '${TEMPLATE_NAME}'"; then
    info "Downloading template: ${TEMPLATE_NAME}..."
    run_pve "pveam download ${TEMPLATE_STORAGE} ${TEMPLATE_NAME}" || die "Failed to download template"
    info "Template downloaded successfully"
else
    info "Template already present: ${TEMPLATE_NAME}"
fi

# Check if CTID already exists
if run_pve "pct status ${CTID}" 2>/dev/null; then
    die "Container ${CTID} already exists. Choose a different CTID or remove the existing container."
fi

# Build network config
NET_CONFIG="name=eth0,bridge=${BRIDGE},ip=${IP},gw=${GATEWAY}"
[[ -n "$VLAN_TAG" ]] && NET_CONFIG="${NET_CONFIG},tag=${VLAN_TAG}"

# Create container
info "Creating container ${CTID} (${CT_NAME})..."
run_pve "pct create ${CTID} ${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE_NAME} \
    --hostname '${CT_NAME}' \
    --memory ${MEMORY} \
    --cores ${CORES} \
    --rootfs ${STORAGE}:${DISK_SIZE} \
    --net0 '${NET_CONFIG}' \
    --unprivileged 1 \
    --features nesting=1,keyctl=1 \
    --ssh-public-keys '${REMOTE_KEY_PATH}' \
    --ostype alpine \
    --start 0" \
    || die "Failed to create container"

# Clean up temporary SSH key on Proxmox host
run_pve "rm -f '${REMOTE_KEY_PATH}'" 2>/dev/null || true

info "Container ${CTID} created successfully"

# Start container
info "Starting container ${CTID}..."
run_pve "pct start ${CTID}" || die "Failed to start container"

# Wait for container to be running
info "Waiting for container to reach running state..."
for i in $(seq 1 30); do
    STATUS=$(run_pve "pct status ${CTID}" 2>/dev/null | awk '{print $2}')
    if [[ "$STATUS" == "running" ]]; then
        break
    fi
    sleep 1
done

STATUS=$(run_pve "pct status ${CTID}" 2>/dev/null | awk '{print $2}')
[[ "$STATUS" == "running" ]] || die "Container ${CTID} did not reach running state (current: ${STATUS})"

# Extract IP without CIDR for display
DISPLAY_IP="${IP%%/*}"

info "Container ${CTID} is running."
echo ""
echo "=== Next Steps ==="
echo "1. Verify SSH access: ssh root@${DISPLAY_IP}"
echo "2. Run Alpine setup with LXC flag:"
echo "   bash setup_alpine.sh --host ${DISPLAY_IP} --user root --lxc"
echo "3. Then install Pi-hole:"
echo "   bash install_pihole.sh --host ${DISPLAY_IP} --user root --password 'your-password'"
