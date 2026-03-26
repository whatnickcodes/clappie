# Secrets Management

## Prime Directive

All secrets **must** be stored encrypted via sops+age. No plaintext on persistent disk — ever.

When you receive or recognize a secret, hold it in session memory only, determine the variable name, then instruct the operator to run `store-clappie-secret.sh` from the workstation. You cannot execute privileged steps yourself (no sudo).

**Recognize automatically:** API tokens, PATs, bearer/JWT tokens, passwords, private keys, HMAC secrets, webhook URLs with embedded auth, bot tokens. When uncertain, default to yes.

## GitHub Credential Hierarchy

Scoped PATs (`GH_PAT_*`) are the **default** for all git operations — they have minimum permissions for their target repo. `GH_OAUTH_TOKEN` is a broad OAuth token (`repo`, `workflow`, `gist`, `read:org` scopes) that grants access across all repos. It is stored as `GH_OAUTH_TOKEN` (not `GH_TOKEN`) so it is never auto-used. See `/home/wash/CLAUDE.md` (immutable, operator-controlled) for the mandatory approval workflow.

## Secrets Inventory

All secrets: sops bootstrap → `/run/wash/env` → env var. No special cases.

| Secret | How to read | If missing |
|--------|-------------|------------|
| `ANTHROPIC_API_KEY` | `printenv ANTHROPIC_API_KEY` | Ask operator: `store-clappie-secret.sh ANTHROPIC_API_KEY` |
| `TELEGRAM_BOT_TOKEN` | `printenv TELEGRAM_BOT_TOKEN` | Ask operator: `store-clappie-secret.sh TELEGRAM_BOT_TOKEN` |
| `GH_PAT_HOMEOPS_CLAUDE` | `printenv GH_PAT_HOMEOPS_CLAUDE` | Ask operator: `store-clappie-secret.sh GH_PAT_HOMEOPS_CLAUDE` |
| `GH_PAT_CLAPPIE_WASH` | `printenv GH_PAT_CLAPPIE_WASH` | Ask operator: `store-clappie-secret.sh GH_PAT_CLAPPIE_WASH` |
| `GH_PAT_PIHOLE_MANAGEMENT` | `printenv GH_PAT_PIHOLE_MANAGEMENT` | Ask operator: `store-clappie-secret.sh GH_PAT_PIHOLE_MANAGEMENT` |
| `GH_OAUTH_TOKEN` | `printenv GH_OAUTH_TOKEN` | Ask operator: `store-clappie-secret.sh GH_OAUTH_TOKEN` |
| `HA_TOKEN` | `printenv HA_TOKEN` | Ask operator: `store-clappie-secret.sh HA_TOKEN` |
| `TELEGRAM_WEBHOOK_SECRET` | `printenv TELEGRAM_WEBHOOK_SECRET` | Ask operator: `store-clappie-secret.sh TELEGRAM_WEBHOOK_SECRET` |
| `SSH_KEY_WASH_HA_TAILSCALE` | `ls /run/wash/ssh/wash-ha-tailscale` | Ask operator: restart service (`inject-clappie-key.sh --restart`) |
| `SSH_KEY_WASH_PIHOLE_TAILSCALE` | `ls /run/wash/ssh/wash-pihole-tailscale` | Ask operator: restart service (`inject-clappie-key.sh --restart`) |
