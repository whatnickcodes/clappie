#!/usr/bin/env bash
set -euo pipefail

# Backup Pi-hole configuration and gravity database.
# Creates a timestamped archive containing Teleporter export,
# docker-compose.yml, and custom dnsmasq configs.

HOST=""
USER="root"
SSH_PORT=22
OUTPUT_DIR="."
PIHOLE_DIR="/opt/pihole"

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Backup Pi-hole configuration from a remote host.

Required:
  --host HOST            Target Pi-hole VM IP or hostname

Optional:
  --user USER            SSH user (default: root)
  --port PORT            SSH port (default: 22)
  --output DIR           Local directory for backup archive (default: current dir)
  --pihole-dir DIR       Pi-hole directory on VM (default: /opt/pihole)
  --help                 Show this help

Example:
  $(basename "$0") --host 192.168.1.53 --output ./backups/
EOF
    exit 0
}

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "INFO: $*"; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --host) HOST="$2"; shift 2 ;;
        --user) USER="$2"; shift 2 ;;
        --port) SSH_PORT="$2"; shift 2 ;;
        --output) OUTPUT_DIR="$2"; shift 2 ;;
        --pihole-dir) PIHOLE_DIR="$2"; shift 2 ;;
        --help) usage ;;
        *) die "Unknown option: $1" ;;
    esac
done

[[ -n "$HOST" ]] || die "Missing --host"

SSH_TARGET="${USER}@${HOST}"
SSH_CMD="ssh -o BatchMode=yes -o ConnectTimeout=10 -p ${SSH_PORT} ${SSH_TARGET}"
SCP_CMD="scp -o BatchMode=yes -o ConnectTimeout=10 -P ${SSH_PORT}"

run_remote() {
    $SSH_CMD "$@"
}

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="pihole-backup-${TIMESTAMP}"
REMOTE_TMP="/tmp/${BACKUP_NAME}"

# Verify connectivity
info "Connecting to ${HOST}..."
run_remote "docker ps | grep -q pihole" || die "Pi-hole container not running on ${HOST}"

# Create remote temp directory
run_remote "mkdir -p ${REMOTE_TMP}"

# Export Teleporter backup
info "Creating Teleporter export..."
run_remote "docker exec pihole pihole -a -t" || die "Teleporter export failed"

# Move Teleporter file to temp directory
run_remote "mv ${PIHOLE_DIR}/etc-pihole/teleporter_*.tar.gz ${REMOTE_TMP}/" 2>/dev/null || \
    run_remote "mv /tmp/teleporter_*.tar.gz ${REMOTE_TMP}/" 2>/dev/null || \
    echo "WARNING: Could not locate Teleporter export file"

# Copy docker-compose.yml
info "Backing up docker-compose.yml..."
run_remote "cp ${PIHOLE_DIR}/docker-compose.yml ${REMOTE_TMP}/" 2>/dev/null || \
    echo "WARNING: docker-compose.yml not found"

# Copy custom dnsmasq configs
info "Backing up custom dnsmasq configs..."
run_remote "cp ${PIHOLE_DIR}/etc-dnsmasq.d/*.conf ${REMOTE_TMP}/ 2>/dev/null" || true

# Copy custom.list (local DNS records)
run_remote "cp ${PIHOLE_DIR}/etc-pihole/custom.list ${REMOTE_TMP}/ 2>/dev/null" || true

# Create archive on remote host
info "Creating archive..."
run_remote "cd /tmp && tar czf ${BACKUP_NAME}.tar.gz ${BACKUP_NAME}/"

# Download archive
mkdir -p "${OUTPUT_DIR}"
info "Downloading backup..."
$SCP_CMD "${SSH_TARGET}:/tmp/${BACKUP_NAME}.tar.gz" "${OUTPUT_DIR}/" || die "Failed to download backup"

# Cleanup remote temp files
run_remote "rm -rf ${REMOTE_TMP} /tmp/${BACKUP_NAME}.tar.gz"

# Verify local file
BACKUP_FILE="${OUTPUT_DIR}/${BACKUP_NAME}.tar.gz"
if [[ -f "$BACKUP_FILE" ]]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    info "Backup complete: ${BACKUP_FILE} (${BACKUP_SIZE})"
    echo ""
    echo "=== Backup Contents ==="
    tar tzf "$BACKUP_FILE" | head -20
    echo ""
    echo "Restore with: bash restore_pihole.sh --host ${HOST} --backup ${BACKUP_FILE}"
else
    die "Backup file not found at ${BACKUP_FILE}"
fi
