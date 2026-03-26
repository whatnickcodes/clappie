# Home Server Config Runbook

## homeserver.txt

`recall/settings/homeserver.txt` — git-tracked, sourced by `~/.bashrc` on shell init.

All non-secret home server data (URLs, IPs, usernames, paths) goes here. Not every piece of data is a secret — only tokens, passwords, and keys belong in sops+age. This file acts as a version-controlled backup of infrastructure config.

**Format:** standard shell `KEY=value` pairs (comments with `#`).

**Load order:** homeserver.txt is sourced *before* sops secrets (`/run/wash/env`), so secrets can override if needed.

## What goes where

| Data | Where | Example |
|------|-------|---------|
| URLs, IPs, hostnames | `homeserver.txt` | `HA_URL=http://100.116.172.30:8123` |
| Usernames, paths | `homeserver.txt` | `HA_SSH_USER=wash` |
| Tokens, passwords, keys | sops+age → `/run/wash/env` | `HA_TOKEN`, `GH_PAT_*` |
