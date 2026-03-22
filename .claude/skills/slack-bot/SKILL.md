---
name: slack-bot
description: Slack bot integration for receiving messages and reactions. Use when setting up Slack webhooks or managing Slack bot configuration.
---

# Slack Bot Skill

Slack bot integration for receiving messages/reactions and spawning sidekicks. Threads become separate sidekicks.

## Setup

### 1. Create Slack App

1. Go to https://api.slack.com/apps → **Create New App** → **From scratch**
2. Name it (e.g., "Clappie") and select your workspace

### 2. Configure Bot Scopes

Go to **OAuth & Permissions** → **Bot Token Scopes** and add:

| Scope | Purpose |
|-------|---------|
| `chat:write` | Send messages |
| `files:read` | Read uploaded files |
| `files:write` | Upload files |
| `users:read` | Get user info |
| `reactions:write` | Add reactions to messages |
| `reactions:read` | See reactions on messages |

### 3. Subscribe to Events

Go to **Event Subscriptions** → Enable Events → **Subscribe to bot events**:

| Event | Purpose |
|-------|---------|
| `message.channels` | Messages in public channels |
| `message.groups` | Messages in private channels |
| `message.im` | Direct messages |
| `message.mpim` | Group DMs |
| `reaction_added` | User adds reaction |
| `reaction_removed` | User removes reaction |

**Don't set the Request URL yet** - you need Tailscale Funnel first.

### 4. Install to Workspace

Go to **Install App** → **Install to Workspace** → Authorize

Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### 5. Get Signing Secret

Go to **Basic Information** → **App Credentials** → Copy **Signing Secret**

### 6. Add to .env

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
```

### 7. Configure Settings

```bash
# Enable the bot
echo "true" > recall/settings/slack-bot/enabled.txt

# Allow your Slack user ID (find via Slack profile → ⋮ → Copy member ID)
echo "U01ABCDEF" > recall/settings/slack-bot/users.txt

# Enable incoming messages
mkdir -p recall/settings/slack-bot/webhooks
echo "true" > recall/settings/slack-bot/webhooks/incoming-message.txt
```

### 8. Start Sidekick Server

```bash
clappie background start sidekicks
```

### 9. Expose via Tailscale Funnel

**Slack requires ports 80, 443, or 8443.** Use Tailscale Funnel to proxy:

```bash
# Expose port 7777 on HTTPS (Tailscale handles certs)
tailscale funnel 7777
```

This gives you a URL like `https://your-machine.tail1234.ts.net`

### 10. Set Webhook URL in Slack

1. Get your webhook path:
   ```bash
   cat recall/settings/slack-bot/webhook-path.txt
   ```

2. Go back to **Event Subscriptions** in Slack app settings

3. Set **Request URL** to:
   ```
   https://your-machine.tail1234.ts.net/webhooks/slack-bot/{webhook-path}
   ```
   Replace `{webhook-path}` with the value from step 1

4. Slack will send a verification challenge - it should show ✓ Verified

### 11. Invite Bot to Channel

In Slack, invite the bot to channels where you want it:
```
/invite @YourBotName
```

## Settings

All settings in `recall/settings/slack-bot/`:

| File | Description | Required |
|------|-------------|----------|
| `enabled.txt` | Set to `true` to enable | Yes |
| `webhook-path.txt` | Secret URL segment (auto-generated) | Auto |
| `users.txt` | Allowed Slack user IDs (one per line) | Yes |
| `channels.txt` | Allowed channel IDs (optional) | No |
| `webhooks/incoming-message.txt` | Enable incoming messages | Yes |
| `sidekick-prompt.txt` | Custom prompt/personality for sidekicks (overrides skill defaults) | No |

## CLI Commands

```bash
clappie slack-bot send <channel> <message>        # Send message
clappie slack-bot thread <channel:ts> <message>   # Reply in thread
clappie slack-bot photo <channel> <path>          # Send image
clappie slack-bot document <channel> <path>       # Send file
clappie slack-bot react <channel> <ts> <emoji>    # Add reaction
```

## Sidekick Extension Commands

When a Slack sidekick is running, these extra commands are available (registered via `sidekickCommands` in `webhooks/send.js`). The sidekick ID is auto-detected from the `CLAPPIE_SIDEKICK_ID` env var -- no need to type it. Explicit ID still works as an override.

```bash
clappie sidekick react <ts> :emoji:                  # React to a message
clappie sidekick send-file photo "/path" "caption"    # Upload image
clappie sidekick send-file document "/path" "caption" # Upload file
```

These are only available to sidekicks with `source: slack-bot`. Telegram-specific commands like `combo` and `sticker` are not available.

## Threading

- Main channel messages → one sidekick per channel (until complete)
- Threaded replies → separate sidekick per thread
- `conversationId` = `channel` or `channel:thread_ts`
- Bot replies stay in thread automatically

## Reactions

When a user reacts to a message, the sidekick receives:
```
[Reacted with :thumbsup:]
```

Direct CLI (not sidekick):
```bash
clappie slack-bot react C01234 1234567890.123456 :eyes:
```

## Troubleshooting

**"Not found" when visiting webhook URL in browser**
Normal - webhooks only accept POST requests. The GET response confirms the endpoint is active.

**Verification fails in Slack**
- Check Tailscale Funnel is running (`tailscale funnel 7777`)
- Check sidekick server is running (`clappie background start sidekicks`)
- Check signing secret matches

**Messages not received**
- Is bot invited to the channel?
- Is user ID in `users.txt`?
- Is `enabled.txt` set to `true`?
- Check `webhooks/incoming-message.txt` is `true`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Bot token (xoxb-...) |
| `SLACK_SIGNING_SECRET` | Signing secret for verification |
