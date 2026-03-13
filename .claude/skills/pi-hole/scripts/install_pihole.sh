#!/usr/bin/env bash
set -euo pipefail

# Deploy Pi-hole via Docker Compose on an Alpine Linux VM.
# Generates docker-compose.yml, deploys the container, and verifies operation.

HOST=""
USER="root"
SSH_PORT=22
PASSWORD=""
DNS1="1.1.1.1"
DNS2="9.9.9.9"
TIMEZONE="UTC"
PIHOLE_DIR="/opt/pihole"
IMAGE_TAG="latest"

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Deploy Pi-hole via Docker Compose on a remote Alpine VM.

Required:
  --host HOST            Target VM IP or hostname
  --password PASS        Pi-hole web admin password

Optional:
  --user USER            SSH user (default: root)
  --port PORT            SSH port (default: 22)
  --dns1 IP              Primary upstream DNS (default: 1.1.1.1)
  --dns2 IP              Secondary upstream DNS (default: 9.9.9.9)
  --timezone TZ          Timezone (default: UTC)
  --pihole-dir DIR       Install directory on VM (default: /opt/pihole)
  --image-tag TAG        Pi-hole Docker image tag (default: latest)
  --help                 Show this help

Example:
  $(basename "$0") --host 192.168.1.53 --password "s3cureP@ss" \\
    --dns1 1.1.1.1 --dns2 9.9.9.9 --timezone "America/New_York"
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
        --password) PASSWORD="$2"; shift 2 ;;
        --dns1) DNS1="$2"; shift 2 ;;
        --dns2) DNS2="$2"; shift 2 ;;
        --timezone) TIMEZONE="$2"; shift 2 ;;
        --pihole-dir) PIHOLE_DIR="$2"; shift 2 ;;
        --image-tag) IMAGE_TAG="$2"; shift 2 ;;
        --help) usage ;;
        *) die "Unknown option: $1" ;;
    esac
done

[[ -n "$HOST" ]] || die "Missing --host"
[[ -n "$PASSWORD" ]] || die "Missing --password"

SSH_CMD="ssh -o BatchMode=yes -o ConnectTimeout=10 -p ${SSH_PORT} ${USER}@${HOST}"

run_remote() {
    $SSH_CMD "$@"
}

# Verify connectivity and Docker
info "Verifying connection and Docker..."
run_remote "docker info > /dev/null 2>&1" || die "Cannot connect or Docker not running on ${HOST}"

# Create directory structure
info "Creating directory structure..."
run_remote "mkdir -p ${PIHOLE_DIR}/etc-pihole ${PIHOLE_DIR}/etc-dnsmasq.d ${PIHOLE_DIR}/backups"

# Generate docker-compose.yml
info "Generating docker-compose.yml..."
# Use heredoc with variable substitution on the local side
COMPOSE_CONTENT="services:
  pihole:
    container_name: pihole
    image: pihole/pihole:${IMAGE_TAG}
    ports:
      - \"53:53/tcp\"
      - \"53:53/udp\"
      - \"80:80/tcp\"
    environment:
      TZ: \"${TIMEZONE}\"
      WEBPASSWORD: \"${PASSWORD}\"
      PIHOLE_DNS_: \"${DNS1};${DNS2}\"
      DNSMASQ_LISTENING: \"all\"
    volumes:
      - ./etc-pihole:/etc/pihole
      - ./etc-dnsmasq.d:/etc/dnsmasq.d
    restart: unless-stopped
    healthcheck:
      test: [\"CMD\", \"dig\", \"+short\", \"+norecurse\", \"@127.0.0.1\", \"pi.hole\"]
      interval: 30s
      timeout: 10s
      retries: 3"

echo "$COMPOSE_CONTENT" | run_remote "cat > ${PIHOLE_DIR}/docker-compose.yml"

# Deploy Pi-hole
info "Pulling Pi-hole image..."
run_remote "cd ${PIHOLE_DIR} && docker compose pull"

info "Starting Pi-hole container..."
run_remote "cd ${PIHOLE_DIR} && docker compose up -d"

# Wait for container to be healthy
info "Waiting for Pi-hole to become healthy..."
MAX_WAIT=120
WAIT=0
while [[ $WAIT -lt $MAX_WAIT ]]; do
    STATUS=$(run_remote "docker inspect pihole --format '{{.State.Health.Status}}'" 2>/dev/null || echo "unknown")
    if [[ "$STATUS" == "healthy" ]]; then
        break
    fi
    sleep 5
    WAIT=$((WAIT + 5))
    info "Waiting... (${WAIT}s, status: ${STATUS})"
done

if [[ "$STATUS" != "healthy" ]]; then
    echo "WARNING: Container not yet healthy after ${MAX_WAIT}s (status: ${STATUS})"
    echo "Check logs: ssh ${USER}@${HOST} 'docker logs pihole'"
fi

# Verify DNS resolution
info "Testing DNS resolution..."
if dig +short +time=5 example.com "@${HOST}" > /dev/null 2>&1; then
    RESOLVED=$(dig +short +time=5 example.com "@${HOST}" 2>/dev/null | head -1)
    info "DNS working: example.com -> ${RESOLVED}"
else
    echo "WARNING: DNS test failed. Pi-hole may still be initializing."
    echo "Retry: dig example.com @${HOST}"
fi

# Verify web UI
info "Testing web UI..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://${HOST}/admin/" 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "302" ]]; then
    info "Web UI accessible at http://${HOST}/admin/"
else
    echo "WARNING: Web UI returned HTTP ${HTTP_CODE}. May still be starting."
fi

info "Pi-hole deployment complete."
echo ""
echo "=== Pi-hole Details ==="
echo "Host: ${HOST}"
echo "DNS: ${HOST}:53"
echo "Web UI: http://${HOST}/admin/"
echo "Upstream DNS: ${DNS1}, ${DNS2}"
echo "Timezone: ${TIMEZONE}"
echo "Data directory: ${PIHOLE_DIR}"
echo ""
echo "=== Configure Your Network ==="
echo "Set your router/DHCP to use ${HOST} as the DNS server."
echo "Or set individual devices to use ${HOST} for DNS."
