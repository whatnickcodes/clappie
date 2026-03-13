#!/usr/bin/env bash
set -euo pipefail

# Perform health checks on a Pi-hole instance.
# Tests DNS resolution, container status, disk usage, and API stats.

HOST=""
USER="root"
SSH_PORT=22
PIHOLE_DIR="/opt/pihole"
QUIET=false
TEST_DOMAIN="example.com"

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Run health checks on a Pi-hole instance.

Required:
  --host HOST            Target Pi-hole VM IP or hostname

Optional:
  --user USER            SSH user (default: root)
  --port PORT            SSH port (default: 22)
  --pihole-dir DIR       Pi-hole directory on VM (default: /opt/pihole)
  --quiet                Only output failures (exit code indicates status)
  --test-domain DOMAIN   Domain for DNS test (default: example.com)
  --help                 Show this help

Exit codes:
  0  All checks passed
  1  One or more checks failed
  2  Cannot connect to host

Example:
  $(basename "$0") --host 192.168.1.53
EOF
    exit 0
}

die() { echo "CRITICAL: $*" >&2; exit 2; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --host) HOST="$2"; shift 2 ;;
        --user) USER="$2"; shift 2 ;;
        --port) SSH_PORT="$2"; shift 2 ;;
        --pihole-dir) PIHOLE_DIR="$2"; shift 2 ;;
        --quiet) QUIET=true; shift ;;
        --test-domain) TEST_DOMAIN="$2"; shift 2 ;;
        --help) usage ;;
        *) die "Unknown option: $1" ;;
    esac
done

[[ -n "$HOST" ]] || die "Missing --host"

SSH_CMD="ssh -o BatchMode=yes -o ConnectTimeout=10 -p ${SSH_PORT} ${USER}@${HOST}"

run_remote() {
    $SSH_CMD "$@"
}

PASS=0
FAIL=0
WARN=0

check_pass() {
    PASS=$((PASS + 1))
    [[ "$QUIET" == "false" ]] && echo "  PASS: $*"
}

check_fail() {
    FAIL=$((FAIL + 1))
    echo "  FAIL: $*"
}

check_warn() {
    WARN=$((WARN + 1))
    [[ "$QUIET" == "false" ]] && echo "  WARN: $*"
}

section() {
    [[ "$QUIET" == "false" ]] && echo "" && echo "=== $* ==="
}

# 1. SSH Connectivity
section "SSH Connectivity"
if run_remote "true" 2>/dev/null; then
    check_pass "SSH connection to ${HOST}"
else
    die "Cannot SSH to ${HOST}"
fi

# 2. Container Status
section "Container Status"
CONTAINER_STATUS=$(run_remote "docker inspect pihole --format '{{.State.Status}}'" 2>/dev/null || echo "not_found")
if [[ "$CONTAINER_STATUS" == "running" ]]; then
    check_pass "Container is running"
else
    check_fail "Container status: ${CONTAINER_STATUS}"
fi

CONTAINER_HEALTH=$(run_remote "docker inspect pihole --format '{{.State.Health.Status}}'" 2>/dev/null || echo "unknown")
if [[ "$CONTAINER_HEALTH" == "healthy" ]]; then
    check_pass "Container health: healthy"
elif [[ "$CONTAINER_HEALTH" == "starting" ]]; then
    check_warn "Container health: starting (still initializing)"
else
    check_fail "Container health: ${CONTAINER_HEALTH}"
fi

UPTIME=$(run_remote "docker inspect pihole --format '{{.State.StartedAt}}'" 2>/dev/null || echo "unknown")
[[ "$QUIET" == "false" ]] && echo "  INFO: Container started at: ${UPTIME}"

RESTART_COUNT=$(run_remote "docker inspect pihole --format '{{.RestartCount}}'" 2>/dev/null || echo "unknown")
if [[ "$RESTART_COUNT" != "unknown" && "$RESTART_COUNT" -gt 5 ]]; then
    check_warn "High restart count: ${RESTART_COUNT}"
elif [[ "$RESTART_COUNT" != "unknown" ]]; then
    check_pass "Restart count: ${RESTART_COUNT}"
fi

# 3. DNS Resolution
section "DNS Resolution"
if dig +short +time=5 +retry=1 "$TEST_DOMAIN" "@${HOST}" > /dev/null 2>&1; then
    RESOLVED=$(dig +short +time=5 "$TEST_DOMAIN" "@${HOST}" 2>/dev/null | head -1)
    check_pass "DNS resolution: ${TEST_DOMAIN} -> ${RESOLVED}"
else
    check_fail "DNS resolution failed for ${TEST_DOMAIN}"
fi

# Test a known-blocked domain
BLOCKED_TEST=$(dig +short +time=5 "ads.google.com" "@${HOST}" 2>/dev/null | head -1 || echo "")
if [[ "$BLOCKED_TEST" == "0.0.0.0" || "$BLOCKED_TEST" == "" || "$BLOCKED_TEST" == "::1" ]]; then
    check_pass "Ad blocking active (ads.google.com blocked)"
else
    check_warn "ads.google.com resolved to ${BLOCKED_TEST} (may not be blocked)"
fi

# 4. Upstream DNS
section "Upstream DNS"
UPSTREAM_OK=$(run_remote "docker exec pihole dig +short +time=5 example.com @1.1.1.1" 2>/dev/null || echo "")
if [[ -n "$UPSTREAM_OK" ]]; then
    check_pass "Upstream DNS (1.1.1.1) reachable"
else
    check_fail "Upstream DNS (1.1.1.1) unreachable from container"
fi

# 5. Disk Usage
section "Disk Usage"
DISK_USAGE=$(run_remote "df / --output=pcent | tail -1 | tr -d ' %'" 2>/dev/null || echo "unknown")
if [[ "$DISK_USAGE" != "unknown" ]]; then
    if [[ "$DISK_USAGE" -gt 90 ]]; then
        check_fail "Disk usage: ${DISK_USAGE}% (critical)"
    elif [[ "$DISK_USAGE" -gt 80 ]]; then
        check_warn "Disk usage: ${DISK_USAGE}% (high)"
    else
        check_pass "Disk usage: ${DISK_USAGE}%"
    fi
fi

DOCKER_DISK=$(run_remote "docker system df --format '{{.Size}}' 2>/dev/null | head -1" || echo "unknown")
[[ "$QUIET" == "false" ]] && echo "  INFO: Docker images size: ${DOCKER_DISK}"

# 6. Memory Usage
section "Memory Usage"
MEM_INFO=$(run_remote "free -m | grep Mem" 2>/dev/null || echo "")
if [[ -n "$MEM_INFO" ]]; then
    MEM_TOTAL=$(echo "$MEM_INFO" | awk '{print $2}')
    MEM_USED=$(echo "$MEM_INFO" | awk '{print $3}')
    MEM_PCT=$((MEM_USED * 100 / MEM_TOTAL))
    if [[ "$MEM_PCT" -gt 90 ]]; then
        check_fail "Memory usage: ${MEM_USED}/${MEM_TOTAL}MB (${MEM_PCT}%)"
    elif [[ "$MEM_PCT" -gt 80 ]]; then
        check_warn "Memory usage: ${MEM_USED}/${MEM_TOTAL}MB (${MEM_PCT}%)"
    else
        check_pass "Memory usage: ${MEM_USED}/${MEM_TOTAL}MB (${MEM_PCT}%)"
    fi
fi

# 7. Pi-hole API Stats
section "Pi-hole Stats"
API_RESPONSE=$(curl -s --connect-timeout 5 "http://${HOST}/admin/api.php?summary" 2>/dev/null || echo "")
if [[ -n "$API_RESPONSE" && "$API_RESPONSE" != "{}" ]]; then
    check_pass "API responding"

    STATUS=$(echo "$API_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
    if [[ "$STATUS" == "enabled" ]]; then
        check_pass "Blocking status: enabled"
    else
        check_warn "Blocking status: ${STATUS}"
    fi

    QUERIES=$(echo "$API_RESPONSE" | grep -o '"dns_queries_today":[0-9]*' | cut -d: -f2 || echo "?")
    BLOCKED=$(echo "$API_RESPONSE" | grep -o '"ads_blocked_today":[0-9]*' | cut -d: -f2 || echo "?")
    PCT=$(echo "$API_RESPONSE" | grep -o '"ads_percentage_today":[0-9.]*' | cut -d: -f2 || echo "?")
    DOMAINS=$(echo "$API_RESPONSE" | grep -o '"domains_being_blocked":[0-9]*' | cut -d: -f2 || echo "?")

    [[ "$QUIET" == "false" ]] && echo "  INFO: Queries today: ${QUERIES}"
    [[ "$QUIET" == "false" ]] && echo "  INFO: Blocked today: ${BLOCKED} (${PCT}%)"
    [[ "$QUIET" == "false" ]] && echo "  INFO: Domains on blocklist: ${DOMAINS}"

    # Check gravity age
    GRAVITY_TS=$(echo "$API_RESPONSE" | grep -o '"absolute":[0-9]*' | cut -d: -f2 || echo "0")
    if [[ "$GRAVITY_TS" -gt 0 ]]; then
        NOW=$(date +%s)
        AGE_DAYS=$(( (NOW - GRAVITY_TS) / 86400 ))
        if [[ "$AGE_DAYS" -gt 14 ]]; then
            check_warn "Gravity is ${AGE_DAYS} days old (update recommended)"
        else
            check_pass "Gravity age: ${AGE_DAYS} days"
        fi
    fi
else
    check_fail "API not responding"
fi

# Summary
echo ""
echo "=== Health Check Summary ==="
echo "Host: ${HOST}"
echo "Passed: ${PASS}"
echo "Failed: ${FAIL}"
echo "Warnings: ${WARN}"

if [[ "$FAIL" -gt 0 ]]; then
    echo ""
    echo "STATUS: UNHEALTHY (${FAIL} check(s) failed)"
    exit 1
elif [[ "$WARN" -gt 0 ]]; then
    echo ""
    echo "STATUS: DEGRADED (${WARN} warning(s))"
    exit 0
else
    echo ""
    echo "STATUS: HEALTHY"
    exit 0
fi
