# Tailscale Reference

Background app that runs a live Tailscale VPN dashboard in a dedicated terminal window.

## How It Works

Runs as a background app via `.background` marker file. When started, it:

1. Brings up Tailscale (`tailscale up`)
2. Sets up a funnel on port 7777 (`tailscale funnel --bg 7777`)
3. Polls status every 2 seconds, redraws on state change
4. Opens in a Ghostty terminal window attached to tmux

On exit (Ctrl+C or stop), it disconnects Tailscale and resets the funnel.

## Starting / Stopping

```bash
clappie background start tailscale        # Start the dashboard
clappie background stop tailscale         # Stop + disconnect
clappie background list                   # Check status
```

## Dashboard Display

When connected, shows:
- **Status banner** — ASCII art "TAILSCALE" with colored CONNECTED/DISCONNECTED/CONNECTING indicator
- **Public URL** — Tailscale funnel URL (green, prominent)
- **SSH access** — `ssh user@hostname` and `ssh user@ip` commands
- **Network** — Tailscale IP and relay status
- **Serves** — Active funnel/serve entries with port and access level
- **Devices** — Connected peers with online/offline status icons
- **Stats bar** — Uptime, bytes in/out, current time

## Keyboard Controls

- `t` — Toggle connection (connect/disconnect)
- `Ctrl+C` — Quit (disconnects and cleans up)

## .background File

```
Tailscale
status: tailscale status --json 2>/dev/null | grep -q '"BackendState": "Running"'
start: tmux kill-session ... && tmux new-session -d -s background-tailscale "run.sh" && open -na Ghostty ...
stop: tailscale down && tmux kill-session -t background-tailscale 2>/dev/null
```

The `status` command lets the background manager check if Tailscale is running without starting the dashboard.

## Requirements

- **Tailscale** CLI installed and configured
- **Ghostty** terminal (used to open the dashboard window)
- **jq** for JSON parsing
