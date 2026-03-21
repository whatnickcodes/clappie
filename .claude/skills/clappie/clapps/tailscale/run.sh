#!/bin/bash
# Tailscale Dashboard - Live status with big visual indicator
# Polls every 2 seconds and redraws on state change

# ─────────────────────────────────────────────────────────────────────────────
# COLORS
# ─────────────────────────────────────────────────────────────────────────────

RESET="\033[0m"
BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[32m"
BRIGHT_GREEN="\033[92m"
YELLOW="\033[33m"
BLUE="\033[34m"
CYAN="\033[36m"
RED="\033[31m"
BRIGHT_RED="\033[91m"
MAGENTA="\033[35m"
WHITE="\033[97m"
BG_GREEN="\033[42m"
BG_RED="\033[41m"

# Track start time for uptime
START_TIME=$(date +%s)
LAST_STATE=""

# ─────────────────────────────────────────────────────────────────────────────
# CLEANUP ON EXIT
# ─────────────────────────────────────────────────────────────────────────────

cleanup() {
    tput cnorm  # Show cursor
    echo ""
    echo -e "${GREEN}Dashboard closed. Tailscale remains running.${RESET}"
    exit 0
}
trap cleanup SIGINT SIGTERM SIGHUP EXIT

# ─────────────────────────────────────────────────────────────────────────────
# UTILITIES
# ─────────────────────────────────────────────────────────────────────────────

format_bytes() {
    local bytes=$1
    if [ $bytes -ge 1073741824 ]; then
        printf "%.1fGB" $(echo "$bytes/1073741824" | bc -l)
    elif [ $bytes -ge 1048576 ]; then
        printf "%.1fMB" $(echo "$bytes/1048576" | bc -l)
    elif [ $bytes -ge 1024 ]; then
        printf "%.1fKB" $(echo "$bytes/1024" | bc -l)
    else
        printf "%dB" $bytes
    fi
}

format_uptime() {
    local seconds=$1
    local days=$((seconds / 86400))
    local hours=$(((seconds % 86400) / 3600))
    local mins=$(((seconds % 3600) / 60))
    local secs=$((seconds % 60))

    if [ $days -gt 0 ]; then
        printf "%dd %dh %dm" $days $hours $mins
    elif [ $hours -gt 0 ]; then
        printf "%dh %dm" $hours $mins
    elif [ $mins -gt 0 ]; then
        printf "%dm %ds" $mins $secs
    else
        printf "%ds" $secs
    fi
}

center_text() {
    local text="$1"
    local width=$(tput cols)
    local len=${#text}
    local pad=$(( (width - len) / 2 ))
    printf "%${pad}s%s" "" "$text"
}

# ─────────────────────────────────────────────────────────────────────────────
# BIG STATUS INDICATOR
# ─────────────────────────────────────────────────────────────────────────────

draw_status_on() {
    echo ""
    echo -e "  ${BRIGHT_GREEN}╺┳╸┏━┓╻╻  ┏━┓┏━╸┏━┓╻  ┏━╸${RESET}"
    echo -e "  ${BRIGHT_GREEN} ┃ ┣━┫┃┃  ┗━┓┃  ┣━┫┃  ┣╸ ${RESET}"
    echo -e "  ${BRIGHT_GREEN} ╹ ╹ ╹╹┗━╸┗━┛┗━╸╹ ╹┗━╸┗━╸${RESET}"
    echo ""
    echo -e "  ${BG_GREEN}${WHITE}${BOLD} ● CONNECTED ${RESET}"
    echo ""
}

draw_status_off() {
    echo ""
    echo -e "  ${DIM}╺┳╸┏━┓╻╻  ┏━┓┏━╸┏━┓╻  ┏━╸${RESET}"
    echo -e "  ${DIM} ┃ ┣━┫┃┃  ┗━┓┃  ┣━┫┃  ┣╸ ${RESET}"
    echo -e "  ${DIM} ╹ ╹ ╹╹┗━╸┗━┛┗━╸╹ ╹┗━╸┗━╸${RESET}"
    echo ""
    echo -e "  ${BG_RED}${WHITE}${BOLD} ○ DISCONNECTED ${RESET}"
    echo ""
}

draw_status_connecting() {
    echo ""
    echo -e "  ${YELLOW}╺┳╸┏━┓╻╻  ┏━┓┏━╸┏━┓╻  ┏━╸${RESET}"
    echo -e "  ${YELLOW} ┃ ┣━┫┃┃  ┗━┓┃  ┣━┫┃  ┣╸ ${RESET}"
    echo -e "  ${YELLOW} ╹ ╹ ╹╹┗━╸┗━┛┗━╸╹ ╹┗━╸┗━╸${RESET}"
    echo ""
    echo -e "  ${YELLOW}${BOLD} ◐ CONNECTING... ${RESET}"
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# MAIN DASHBOARD DRAW
# ─────────────────────────────────────────────────────────────────────────────

draw_dashboard() {
    local state="$1"

    clear
    tput civis  # Hide cursor

    # Draw big status
    case "$state" in
        Running)
            draw_status_on
            ;;
        Starting|NeedsLogin|NoState)
            draw_status_connecting
            ;;
        *)
            draw_status_off
            ;;
    esac

    # Only show details if connected
    if [ "$state" = "Running" ]; then
        # Gather info
        local JSON=$(tailscale status --json 2>/dev/null)
        local FUNNEL_URL=$(tailscale funnel status 2>&1 | grep -o 'https://[^ ]*' | head -1)
        [ -z "$FUNNEL_URL" ] && FUNNEL_URL="(not configured)"

        local OUR_IP=$(echo "$JSON" | jq -r '.TailscaleIPs[0] // empty' 2>/dev/null)
        [ -z "$OUR_IP" ] && OUR_IP=$(tailscale ip -4 2>/dev/null)

        local DNS_NAME=$(echo "$JSON" | jq -r '.Self.DNSName // empty' 2>/dev/null | sed 's/\.$//')
        [ -z "$DNS_NAME" ] && DNS_NAME="(unknown)"

        local USERNAME=$(whoami)
        local RELAY=$(echo "$JSON" | jq -r '.Self.Relay // empty' 2>/dev/null)

        # Funnel URL (big and green)
        echo -e "  ${BOLD}Public URL${RESET}"
        echo -e "  ${BRIGHT_GREEN}${BOLD}$FUNNEL_URL${RESET}"
        echo ""

        # SSH access
        echo -e "  ${BOLD}SSH${RESET}  ${CYAN}ssh ${USERNAME}@${DNS_NAME}${RESET}"
        echo -e "       ${DIM}or${RESET} ${CYAN}ssh ${USERNAME}@${OUR_IP}${RESET}"
        echo ""

        # Network info (compact)
        echo -e "  ${BOLD}Network${RESET}  ${DIM}IP${RESET} ${OUR_IP}  ${DIM}Relay${RESET} ${RELAY:-direct}"
        echo ""

        # Serves (tailscale serve + funnel)
        SERVE_LINES=$(tailscale serve status 2>/dev/null | grep '|--' || true)
        if [ -n "$SERVE_LINES" ]; then
            SERVE_RAW=$(tailscale serve status 2>/dev/null)
            echo -e "  ${BOLD}Serves${RESET}"
            while IFS= read -r sline; do
                spath=$(echo "$sline" | sed 's/.*|--[[:space:]]*//' | awk '{print $1}')
                starget=$(echo "$sline" | awk '{print $NF}')
                sport=$(echo "$starget" | grep -o ':[0-9]*$' | tr -d ':')
                if [ "$spath" = "/" ]; then
                    path_label=""
                else
                    path_label=" ${DIM}→${RESET} ${CYAN}${spath}${RESET}"
                fi
                if echo "$SERVE_RAW" | grep -q "Funnel on"; then
                    echo -e "    ${YELLOW}🌐${RESET}  port ${BOLD}${sport}${RESET}${path_label}  ${DIM}internet${RESET}"
                else
                    echo -e "    🔒  port ${BOLD}${sport}${RESET}${path_label}  ${DIM}your devices only${RESET}"
                fi
            done <<< "$SERVE_LINES"
            echo ""
        fi

        # Devices (compact)
        echo -e "  ${BOLD}Devices${RESET}"
        tailscale status 2>/dev/null | head -10 | while read -r line; do
            if [ -n "$line" ]; then
                # Skip funnel info lines
                [[ "$line" == *"# Funnel"* ]] && continue
                [[ "$line" == *"#"* ]] && continue

                if echo "$line" | grep -q "offline"; then
                    echo -e "    ${DIM}○${RESET} ${DIM}$line${RESET}"
                elif echo "$line" | grep -q -- "-$"; then
                    echo -e "    ${YELLOW}◐${RESET} $line"
                else
                    echo -e "    ${GREEN}●${RESET} $line"
                fi
            fi
        done
        echo ""
    else
        echo ""
        echo -e "  ${DIM}Tailscale is not connected${RESET}"
        echo -e "  ${DIM}Waiting for connection...${RESET}"
        echo ""
    fi

    # Stats bar at bottom
    local NOW=$(date +%s)
    local UPTIME=$((NOW - START_TIME))

    local METRICS=$(tailscale metrics 2>/dev/null)
    local IN_DERP=$(echo "$METRICS" | grep 'tailscaled_inbound_bytes_total{path="derp"}' | awk '{print $2}' | cut -d. -f1)
    local IN_DIRECT=$(echo "$METRICS" | grep 'tailscaled_inbound_bytes_total{path="direct_ipv4"}' | awk '{print $2}' | cut -d. -f1)
    local OUT_DERP=$(echo "$METRICS" | grep 'tailscaled_outbound_bytes_total{path="derp"}' | awk '{print $2}' | cut -d. -f1)
    local OUT_DIRECT=$(echo "$METRICS" | grep 'tailscaled_outbound_bytes_total{path="direct_ipv4"}' | awk '{print $2}' | cut -d. -f1)
    local IN_TOTAL=$((${IN_DERP:-0} + ${IN_DIRECT:-0}))
    local OUT_TOTAL=$((${OUT_DERP:-0} + ${OUT_DIRECT:-0}))

    echo ""
    echo -e "  ${DIM}uptime${RESET} $(format_uptime $UPTIME)  ${DIM}↓${RESET} $(format_bytes $IN_TOTAL)  ${DIM}↑${RESET} $(format_bytes $OUT_TOTAL)  ${DIM}@${RESET} $(date '+%H:%M:%S')"
    echo ""
    if [ "$CURRENT_STATE" = "Running" ]; then
        echo -e "  ${DIM}t${RESET} toggle  ${DIM}Ctrl+C${RESET} quit"
    else
        echo -e "  ${DIM}t${RESET} connect  ${DIM}Ctrl+C${RESET} quit"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# INITIAL CONNECTION
# ─────────────────────────────────────────────────────────────────────────────

clear
echo ""
echo -e "  ${CYAN}${BOLD}Starting Tailscale...${RESET}"
echo ""

# Bring up Tailscale
tailscale up 2>/dev/null

# Setup funnel
echo -e "  ${DIM}Setting up funnel on port 7777...${RESET}"
tailscale funnel reset 2>/dev/null
tailscale funnel --bg 7777 2>/dev/null

sleep 1

# ─────────────────────────────────────────────────────────────────────────────
# MAIN LOOP - Poll every 2 seconds, redraw on state change
# ─────────────────────────────────────────────────────────────────────────────

while true; do
    # Get current state
    CURRENT_STATE=$(tailscale status --json 2>/dev/null | jq -r '.BackendState // "Stopped"')

    # Redraw if state changed OR first run OR every 30 seconds for stats
    ELAPSED=$(($(date +%s) - START_TIME))
    if [ "$CURRENT_STATE" != "$LAST_STATE" ] || [ $((ELAPSED % 30)) -eq 0 ]; then
        draw_dashboard "$CURRENT_STATE"
        LAST_STATE="$CURRENT_STATE"
    fi

    # Wait 2 seconds, but listen for keypress
    KEY=""
    read -rsn1 -t 2 KEY </dev/tty 2>/dev/null || KEY=""
    if [ "$KEY" = "t" ] || [ "$KEY" = "T" ]; then
        if [ "$CURRENT_STATE" = "Running" ]; then
            clear
            echo ""
            echo -e "  ${YELLOW}Disconnecting...${RESET}"
            tailscale funnel reset 2>/dev/null
            tailscale down 2>/dev/null
            LAST_STATE=""  # Force redraw
        else
            clear
            echo ""
            echo -e "  ${CYAN}Connecting...${RESET}"
            tailscale up 2>/dev/null
            tailscale funnel --bg 7777 2>/dev/null
            sleep 1
            LAST_STATE=""  # Force redraw
        fi
    fi
done
