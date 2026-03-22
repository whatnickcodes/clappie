---
name: telegram-bot
description: Telegram bot integration for receiving messages and reactions. Use when setting up Telegram webhooks or managing Telegram bot configuration.
---

# Telegram Bot Skill

Telegram bot integration for receiving messages/reactions and spawning sidekicks.

## Setup

### 1. Create Bot with BotFather

1. Open Telegram, search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow prompts
3. Copy the **bot token** (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Get Your User ID

1. Search for [@userinfobot](https://t.me/userinfobot) in Telegram
2. Send any message - it replies with your user ID (a number like `YOUR_USER_ID`)

### 3. Add to .env

```bash
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
TELEGRAM_WEBHOOK_SECRET=any-random-secret-string-you-make-up
```

The `TELEGRAM_WEBHOOK_SECRET` can be anything - it's used to verify webhooks are from Telegram.

### 4. Configure Settings

```bash
# Enable the bot
echo "true" > recall/settings/telegram-bot/enabled.txt

# Allow your Telegram user ID
echo "YOUR_USER_ID" > recall/settings/telegram-bot/users.txt

# Enable incoming messages
mkdir -p recall/settings/telegram-bot/webhooks
echo "true" > recall/settings/telegram-bot/webhooks/incoming-message.txt
```

### 5. Start Sidekick Server

```bash
clappie background start sidekicks
```

### 6. Expose via Tailscale Funnel

**Telegram only allows ports 80, 88, 443, or 8443.** Use Tailscale Funnel to proxy:

```bash
# Expose port 7777 on HTTPS (Tailscale handles certs)
tailscale funnel 7777
```

This gives you a URL like `https://your-machine.tail1234.ts.net`

### 7. Set Webhook URL

Get your webhook path and set the webhook:

```bash
# Get the webhook path
WEBHOOK_PATH=$(cat recall/settings/telegram-bot/webhook-path.txt)

# Set webhook with Telegram (IMPORTANT: include secret_token!)
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://your-machine.tail1234.ts.net/webhooks/telegram-bot/${WEBHOOK_PATH}" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

**Critical:** The `secret_token` parameter must match your `TELEGRAM_WEBHOOK_SECRET` env var, or signature verification will fail.

### 8. Verify Webhook

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

Should show your URL with `pending_update_count: 0` and no errors.

## Settings

All settings in `recall/settings/telegram-bot/`:

| File | Description | Required |
|------|-------------|----------|
| `enabled.txt` | Set to `true` to enable | Yes |
| `webhook-path.txt` | Secret URL segment (auto-generated) | Auto |
| `users.txt` | Allowed Telegram user IDs (one per line) | Yes |
| `webhooks/incoming-message.txt` | Enable incoming messages | Yes |
| `sidekick-prompt.txt` | Custom prompt/personality for sidekicks (overrides skill defaults) | No |

## CLI Commands

```bash
clappie telegram send <chatId> <message>      # Send text message
clappie telegram photo <chatId> <path>        # Send photo
clappie telegram document <chatId> <path>     # Send document
clappie telegram voice <chatId> <path>        # Send voice message
clappie telegram video <chatId> <path>        # Send video
clappie telegram sticker <chatId> <id>        # Send sticker
clappie telegram react <chatId> <msgId> <emoji>  # React to message
clappie telegram webhook <url>                # Set webhook URL
clappie telegram webhook-info                 # Get webhook status
clappie telegram me                           # Get bot info
```

## Sidekick Extension Commands

When a Telegram sidekick is running, these extra commands are available (registered via `sidekickCommands` in `webhooks/send.js`). The sidekick ID is auto-detected from the `CLAPPIE_SIDEKICK_ID` env var -- no need to type it. Explicit ID still works as an override.

```bash
clappie sidekick react <msgId> 👍                  # React to a message
clappie sidekick combo <msgId> 👍 🔥 🎉            # Sequential reaction combo
clappie sidekick sticker <setName> [index]          # Send sticker from set
clappie sidekick sticker <setName> random            # Random sticker from set
clappie sidekick send-file photo "/path" "caption"
clappie sidekick send-file document "/path" "caption"
clappie sidekick send-file voice "/path"
clappie sidekick send-file video "/path" "caption"
```

These are only available to sidekicks with `source: telegram-bot`. Internal sidekicks or Slack sidekicks can't use them.

## Reactions

When a user reacts to a message, the sidekick receives:
```
[Reacted with 👍]
```

Direct CLI (not sidekick):
```bash
clappie telegram react YOUR_USER_ID 123 👍
```

## How It Works

1. User sends message to bot
2. Telegram POSTs to `/webhooks/telegram-bot/{webhook-path}`
3. Server verifies `X-Telegram-Bot-Api-Secret-Token` header matches `TELEGRAM_WEBHOOK_SECRET`
4. Handler parses message, downloads any attachments
5. Sidekick spawns with message content
6. Claude can reply via `clappie sidekick send`, `clappie sidekick react`, etc.

## Troubleshooting

**"Invalid signature" errors**
When setting webhook, you MUST include `secret_token`:
```bash
curl -X POST "https://api.telegram.org/bot.../setWebhook" \
  -d "url=https://..." \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

**"Bad port" error from Telegram**
Telegram only allows ports 80, 88, 443, 8443. Use Tailscale Funnel or another reverse proxy.

**"Not found" when visiting webhook URL in browser**
Normal - webhooks only accept POST requests.

**Messages not received**
- Is Tailscale Funnel running?
- Is sidekick server running? (`clappie background start sidekicks`)
- Is user ID in `users.txt`?
- Check `getWebhookInfo` for errors

**Bot doesn't respond**
- Check sidekick logs: `tail -f recall/logs/sidekicks/*.txt`
- Make sure `enabled.txt` is `true`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Secret for webhook verification (you make this up) |
