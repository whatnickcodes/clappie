#!/usr/bin/env bash
set -euo pipefail

# Configure an Alpine Linux VM or LXC container for running Pi-hole via Docker.
# Installs Docker, configures firewall, hardens SSH.
# Runs commands over SSH on the target Alpine host.

HOST=""
USER="root"
SSH_PORT=22
SKIP_FIREWALL=false
SKIP_SSH_HARDEN=false
IS_LXC=false

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Set up an Alpine Linux VM or LXC container with Docker for Pi-hole hosting.

Required:
  --host HOST            Target Alpine host IP or hostname

Optional:
  --user USER            SSH user (default: root)
  --port PORT            SSH port (default: 22)
  --lxc                  Target is an LXC container (skips guest agent)
  --skip-firewall        Skip firewall configuration
  --skip-ssh-harden      Skip SSH hardening
  --help                 Show this help

Example:
  $(basename "$0") --host 192.168.1.53 --user root
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
        --skip-firewall) SKIP_FIREWALL=true; shift ;;
        --skip-ssh-harden) SKIP_SSH_HARDEN=true; shift ;;
        --lxc) IS_LXC=true; shift ;;
        --help) usage ;;
        *) die "Unknown option: $1" ;;
    esac
done

[[ -n "$HOST" ]] || die "Missing --host"

SSH_CMD="ssh -o BatchMode=yes -o ConnectTimeout=10 -p ${SSH_PORT} ${USER}@${HOST}"

run_remote() {
    $SSH_CMD "$@"
}

# Verify connectivity
info "Testing SSH connection to ${USER}@${HOST}..."
run_remote "uname -a" || die "Cannot connect to ${HOST}. Verify SSH access."

# Enable community repository
info "Enabling community repository..."
run_remote 'sed -i "s|#.*community|https://dl-cdn.alpinelinux.org/alpine/v$(cat /etc/alpine-release | cut -d. -f1,2)/community|" /etc/apk/repositories'

# Update package index
info "Updating package index..."
run_remote "apk update"

# Install required packages
info "Installing packages..."
PACKAGES="docker docker-cli-compose curl bash iptables ip6tables ca-certificates tzdata"
if [[ "$IS_LXC" == "false" ]]; then
    PACKAGES="${PACKAGES} qemu-guest-agent"
fi
run_remote "apk add ${PACKAGES}"

# Enable and start Docker
info "Enabling Docker..."
run_remote "rc-update add docker default && rc-service docker start"

# Verify Docker
info "Verifying Docker installation..."
run_remote "docker info > /dev/null 2>&1" || die "Docker failed to start"
run_remote "docker compose version" || die "Docker Compose not available"
if [[ "$IS_LXC" == "true" ]]; then
    info "Verifying Docker-in-LXC (running hello-world)..."
    run_remote "docker run --rm hello-world > /dev/null 2>&1" \
        || die "Docker cannot run containers. Check LXC nesting=1 and keyctl=1 features."
fi
info "Docker is running"

# Enable QEMU guest agent (VM only, not needed in LXC)
if [[ "$IS_LXC" == "false" ]]; then
    info "Enabling QEMU guest agent..."
    run_remote "rc-update add qemu-guest-agent default && rc-service qemu-guest-agent start" 2>/dev/null || true
fi

# Configure firewall
if [[ "$SKIP_FIREWALL" == "false" ]]; then
    info "Configuring firewall..."
    run_remote bash <<'FIREWALL_EOF'
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

# Docker forwarding
iptables -A FORWARD -i docker0 -j ACCEPT
iptables -A FORWARD -o docker0 -j ACCEPT

# Save rules
rc-service iptables save
rc-update add iptables default
FIREWALL_EOF
    info "Firewall configured"
fi

# Harden SSH
if [[ "$SKIP_SSH_HARDEN" == "false" ]]; then
    info "Hardening SSH..."
    run_remote bash <<'SSH_EOF'
# Backup original config
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak

# Apply hardening settings
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^#\?X11Forwarding.*/X11Forwarding no/' /etc/ssh/sshd_config
sed -i 's/^#\?MaxAuthTries.*/MaxAuthTries 3/' /etc/ssh/sshd_config

rc-service sshd restart
SSH_EOF
    info "SSH hardened (key-only auth, no password login)"
fi

# Set up automatic security updates
info "Configuring automatic security updates..."
run_remote bash <<'CRON_EOF'
echo "0 4 * * * /sbin/apk upgrade --no-cache >> /var/log/apk-upgrade.log 2>&1" | crontab -
rc-update add crond default
rc-service crond start
CRON_EOF

# Create Pi-hole directory
info "Creating /opt/pihole directory..."
run_remote "mkdir -p /opt/pihole"

HOST_TYPE="VM"
[[ "$IS_LXC" == "true" ]] && HOST_TYPE="LXC container"

info "Alpine setup complete."
echo ""
echo "=== Summary ==="
echo "Host: ${HOST} (${HOST_TYPE})"
echo "Docker: installed and running"
echo "Firewall: $(if [[ "$SKIP_FIREWALL" == "true" ]]; then echo "skipped"; else echo "configured (SSH, DNS, HTTP)"; fi)"
echo "SSH: $(if [[ "$SKIP_SSH_HARDEN" == "true" ]]; then echo "skipped"; else echo "hardened (key-only)"; fi)"
echo "Auto-updates: enabled (daily at 04:00)"
echo ""
echo "Next step: bash install_pihole.sh --host ${HOST} --user ${USER}"
