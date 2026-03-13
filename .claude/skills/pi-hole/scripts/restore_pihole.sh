#!/usr/bin/env bash
set -euo pipefail

# Restore Pi-hole from a backup archive created by backup_pihole.sh.
# Uploads and applies Teleporter backup, restores docker-compose.yml and configs.

HOST=""
USER="root"
SSH_PORT=22
BACKUP_FILE=""
PIHOLE_DIR="/opt/pihole"
SKIP_CONFIRM=false

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Restore Pi-hole configuration from a backup archive.

Required:
  --host HOST            Target Pi-hole VM IP or hostname
  --backup FILE          Path to backup archive (.tar.gz)

Optional:
  --user USER            SSH user (default: root)
  --port PORT            SSH port (default: 22)
  --pihole-dir DIR       Pi-hole directory on VM (default: /opt/pihole)
  --yes                  Skip confirmation prompt
  --help                 Show this help

Example:
  $(basename "$0") --host 192.168.1.53 \\
    --backup ./backups/pihole-backup-20250101-120000.tar.gz
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
        --backup) BACKUP_FILE="$2"; shift 2 ;;
        --pihole-dir) PIHOLE_DIR="$2"; shift 2 ;;
        --yes) SKIP_CONFIRM=true; shift ;;
        --help) usage ;;
        *) die "Unknown option: $1" ;;
    esac
done

[[ -n "$HOST" ]] || die "Missing --host"
[[ -n "$BACKUP_FILE" ]] || die "Missing --backup"
[[ -f "$BACKUP_FILE" ]] || die "Backup file not found: ${BACKUP_FILE}"

SSH_TARGET="${USER}@${HOST}"
SSH_CMD="ssh -o BatchMode=yes -o ConnectTimeout=10 -p ${SSH_PORT} ${SSH_TARGET}"
SCP_CMD="scp -o BatchMode=yes -o ConnectTimeout=10 -P ${SSH_PORT}"

run_remote() {
    $SSH_CMD "$@"
}

# Validate backup archive
info "Validating backup archive..."
tar tzf "$BACKUP_FILE" > /dev/null 2>&1 || die "Invalid archive: ${BACKUP_FILE}"

# Show backup contents
echo "=== Backup Contents ==="
tar tzf "$BACKUP_FILE" | head -20
echo ""

# Confirm restore
if [[ "$SKIP_CONFIRM" == "false" ]]; then
    echo "This will restore Pi-hole on ${HOST} from: ${BACKUP_FILE}"
    echo "Current Pi-hole configuration will be OVERWRITTEN."
    read -rp "Continue? (y/N): " CONFIRM
    [[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
fi

# Verify connectivity
info "Connecting to ${HOST}..."
run_remote "true" || die "Cannot connect to ${HOST}"

# Upload backup
info "Uploading backup archive..."
$SCP_CMD "$BACKUP_FILE" "${SSH_TARGET}:/tmp/pihole-restore.tar.gz" || die "Upload failed"

# Extract on remote
info "Extracting archive..."
run_remote "cd /tmp && tar xzf pihole-restore.tar.gz"

# Find the extracted directory name
EXTRACT_DIR=$(run_remote "ls -d /tmp/pihole-backup-*/ 2>/dev/null | head -1" || echo "")
[[ -n "$EXTRACT_DIR" ]] || die "Could not find extracted backup directory"

# Restore docker-compose.yml if present
if run_remote "test -f ${EXTRACT_DIR}docker-compose.yml"; then
    info "Restoring docker-compose.yml..."
    run_remote "cp ${EXTRACT_DIR}docker-compose.yml ${PIHOLE_DIR}/docker-compose.yml"
fi

# Restore custom dnsmasq configs
CONF_COUNT=$(run_remote "ls ${EXTRACT_DIR}*.conf 2>/dev/null | wc -l" || echo "0")
if [[ "$CONF_COUNT" -gt 0 ]]; then
    info "Restoring ${CONF_COUNT} dnsmasq config(s)..."
    run_remote "cp ${EXTRACT_DIR}*.conf ${PIHOLE_DIR}/etc-dnsmasq.d/"
fi

# Restore custom.list (local DNS records)
if run_remote "test -f ${EXTRACT_DIR}custom.list"; then
    info "Restoring local DNS records..."
    run_remote "cp ${EXTRACT_DIR}custom.list ${PIHOLE_DIR}/etc-pihole/"
fi

# Ensure Pi-hole container is running
info "Ensuring Pi-hole container is running..."
run_remote "cd ${PIHOLE_DIR} && docker compose up -d"
sleep 10

# Restore Teleporter backup
TELEPORTER_FILE=$(run_remote "ls ${EXTRACT_DIR}teleporter_*.tar.gz 2>/dev/null | head -1" || echo "")
if [[ -n "$TELEPORTER_FILE" ]]; then
    info "Restoring Teleporter backup..."
    # Copy teleporter file into container
    run_remote "docker cp ${TELEPORTER_FILE} pihole:/tmp/teleporter-restore.tar.gz"
    run_remote "docker exec pihole pihole -a -t /tmp/teleporter-restore.tar.gz" || \
        echo "WARNING: Teleporter restore returned non-zero. Check Pi-hole logs."
else
    echo "WARNING: No Teleporter export found in backup. Only config files restored."
fi

# Restart Pi-hole to apply all changes
info "Restarting Pi-hole..."
run_remote "cd ${PIHOLE_DIR} && docker compose restart"
sleep 15

# Verify DNS
info "Verifying DNS resolution..."
if dig +short +time=5 example.com "@${HOST}" > /dev/null 2>&1; then
    info "DNS resolution working"
else
    echo "WARNING: DNS test failed. Pi-hole may need more time to initialize."
fi

# Cleanup
run_remote "rm -rf /tmp/pihole-restore.tar.gz /tmp/pihole-backup-*/"

info "Restore complete."
echo ""
echo "=== Verification ==="
echo "DNS test:  dig example.com @${HOST}"
echo "Web UI:    http://${HOST}/admin/"
echo "Logs:      ssh ${USER}@${HOST} 'docker logs pihole --tail 50'"
