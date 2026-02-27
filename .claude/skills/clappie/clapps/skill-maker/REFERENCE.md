# Clappie Skill Maker

Complete guide for building skills, displays, and background apps for the clappie ecosystem.

## Hard Rule: No State in Skills

**NEVER put state, cache, or generated files in `.claude/skills/`.**

Skills are code. Code goes in `.claude/skills/`. Everything else goes in `recall/`:

| Type | Location |
|------|----------|
| Skill state/cache | `recall/<skillname>/` |
| Auth tokens | `recall/oauth/<provider>.json` |
| Logs | `recall/logs/...` |
| User data | `recall/memory/...` |

```javascript
// BAD - don't do this
const CACHE = join(__dirname, '.cache.json');

// GOOD - use recall/<skillname>/
const PROJECT_ROOT = join(__dirname, '../../..');
const CACHE = join(PROJECT_ROOT, 'recall/myskill/cache.json');
```

The only exceptions are:
- `.env.example` (template, not actual secrets)
- Temporary AppleScript files for macOS automation

---

## What Can You Build?

| Type | Purpose | Example |
|------|---------|---------|
| **CLI Skill** | Command-line interface for an API/service | `clappie front inbox`, `clappie whisper listen` |
| **Display** | Interactive terminal UI | Email inbox, settings panel, file picker |
| **Background App** | Background process with optional UI | Heartbeat checks, sidekick control |

## Decision Tree

```
Need background processing? → Background App
Need interactive UI? → Display (in skill or clapp)
Just need CLI commands? → CLI Skill
```

## Recommended Flow

**Before building, scope it with the user.**

Ask upfront what they want. Don't guess - different users want different things.

```
"Before I start building, let me understand what you need:

1. CORE FUNCTIONALITY (CLI commands)
   What do you want to do with [service]?
   Examples: list items, view details, create/update, search, etc.
   → "I want to list my repos, see PR details, check CI status"

2. WEBHOOKS & AUTOMATION (optional)
   Want to get notified when things happen?
   Examples: new PR opened, issue created, payment received, etc.
   → "Yes, notify me when PRs are opened or CI fails"
   → "No, I'll just check manually"

3. DISPLAYS (optional)
   Want visual UIs to browse your data?
   Examples: inbox view for PRs, dashboard for repos, etc.
   → "Yes, a simple PR inbox would be nice"
   → "No, CLI is fine for now"
"
```

**Then build in this order: CLI → Webhooks → Displays → Walk Through Setup.**

```
1. CLI/API       Core functionality
                 ├── Auth (OAuth, tokens, etc.)
                 ├── Commands the user asked for
                 └── Only what's needed, don't over-build

2. Webhooks      If user wants automation
                 ├── webhook.json + verify.js
                 ├── Route handlers in webhooks/routes/
                 └── Usually action: 'dirty' for sync streams

3. Displays      If user wants visual UIs
                 ├── Start simple - leverage utility/ displays
                 ├── List view → utility/list or utility/table
                 └── Detail view → utility/viewer or utility/markdown

4. Setup         ALWAYS walk user through .env.example
                 ├── Read the .env.example you just wrote
                 ├── Go step by step with the user
                 ├── Help them create accounts, apps, copy keys
                 └── Run the auth command together, verify it works
```

**CRITICAL: After building, walk the user through setup.**

Don't just say "see .env.example" - actually guide them through it:

```
"Great, the skill is built! Let's get you set up.

I wrote detailed instructions in .claude/skills/myservice/.env.example.
Let's go through them together:

**Step 1: Create a MyService account**
Go to https://myservice.com and click Sign Up.
Let me know when you've verified your email.

[wait for user]

**Step 2: Create an API application**
Now go to Developer Settings...
"
```

This is the difference between a skill that sits unused and one the user actually uses.

**Why scope first?**
- Prevents over-engineering (building webhooks nobody asked for)
- Prevents under-delivering (forgetting displays they wanted)
- User knows exactly what they're getting
- You build only what's needed

### Minimum Viable Displays

At minimum, most skills should have:

| Data Pattern | Display | Can Use |
|--------------|---------|---------|
| List of items | `index.js` (inbox/list view) | `utility/list`, `utility/table` |
| Item detail | `viewer.js` or `detail.js` | `utility/viewer`, `utility/markdown` |
| Create/edit | `compose.js` or `editor.js` | `utility/editor` |

**Example - wrapping utility/table for a quick list view:**

```javascript
// displays/index.js - minimal inbox using utility
export function create(ctx) {
  ctx.setTitle('My Items');

  // Fetch data using your CLI's API functions
  const items = await fetchItems();

  // Push to utility table with the data
  ctx.push('utility/table', {
    data: items.map(i => `${i.id},${i.title},${i.status}`).join('\n'),
    headers: 'ID,Title,Status'
  });
}
```

This takes 10 lines and gives users a visual interface. No excuses.

---

## Naming Philosophy

### Skill Names: Be Specific

Name skills after the **specific service or technology**, not generic categories.

| Good | Bad | Why |
|------|-----|-----|
| `whisper` | `voice` | Whisper is the actual service doing transcription |
| `gmail` | `email` | Gmail is specific; "email" is vague |
| `front` | `inbox` | Front is the service; inbox is a feature |
| `tailscale` | `vpn` | Tailscale is the tool; VPN is a category |

This prevents collisions (what if you add another email provider?) and makes it clear what's actually happening under the hood.

### Commands: Humanize the Verbs

Commands should feel like **natural actions**, not technical operations.

| Good | Bad | Feels Like |
|------|-----|------------|
| `listen` | `transcribe` | "Hey, listen to this audio" |
| `say` | `speak` | "Say this out loud" |
| `read` | `fetch` | "Read my emails" |
| `send` | `transmit` | "Send this message" |

The user is talking to an assistant, not operating a machine. Commands should sound like requests you'd make to a helpful friend.

### File Storage: Recall Over Tmp

**Default to `recall/` for persistence.** Only use `/tmp/` for truly ephemeral files.

```javascript
// BAD - files disappear on restart, hard to track
const OUTPUT = '/tmp/whisper-output.opus';

// GOOD - persistent, trackable, part of history
const OUTPUT_DIR = join(PROJECT_ROOT, 'recall/files/audio/out');
```

| Location | Use For |
|----------|---------|
| `recall/files/<type>/` | Generated outputs (audio, images, exports) |
| `recall/<skill>/` | Skill state, cache, working data |
| `recall/logs/` | Action logs, history |
| `/tmp/` | Only for downloads before processing, or true throwaway files |

**Why recall matters:**
- Files survive restarts
- User can review what was generated
- Creates an audit trail
- Memory can reference past files

---

## Part 1: CLI Skills

### File Structure

```
.claude/skills/myskill/
├── myskill.js       # CLI entry (or index.js)
├── SKILL.md         # Documentation for Claude
└── .env.example     # Required env vars (if any)
```

### Basic Template

```javascript
#!/usr/bin/env bun

// Required: meta export for clappie list discovery
export const meta = {
  name: 'myskill',
  description: 'What this skill does',
  commands: [
    { cmd: 'action <arg>', desc: 'Description' },
    { cmd: 'list [limit]', desc: 'List items' },
  ],
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'action':
      const arg = args[1];
      // Do something
      console.log(JSON.stringify({ result: arg }));
      break;

    case 'list':
      const limit = parseInt(args[1]) || 10;
      // Fetch and return data
      console.log(JSON.stringify([{ id: 1, name: 'Item' }]));
      break;

    default:
      console.log('Usage: clappie myskill <command>');
  }
}

// CRITICAL: Only run when executed directly, not when imported
if (import.meta.main) {
  main();
}
```

### Hard Rule: import.meta.main Guard

**ALWAYS wrap your main() call in `if (import.meta.main)`.**

```javascript
// BAD - breaks clappie list
main();

// GOOD - only runs when executed directly
if (import.meta.main) {
  main();
}
```

**Why this matters:** When you run `clappie list`, it imports every skill to read the `meta` export. If your script calls `main()` unconditionally, it will execute during import with `process.argv` set to `['bun', 'clappie.js', 'list']` - causing your skill to run with "list" as its command argument and fail with "Unknown command: list".

This is the ES module equivalent of Python's `if __name__ == "__main__"` pattern.

### SKILL.md Template

```markdown
---
name: myskill
description: Short description. Use when user asks about [keywords that trigger this skill].
---

# My Skill

One-line summary.

## Setup

Prerequisites, env vars, auth steps.

## Quick Reference

\`\`\`bash
clappie myskill action "value"
clappie myskill list 20
\`\`\`

## Handling [clappie] Messages

If your skill has displays, document how to handle UI events:

### `event: data`
Description of what to do.
```

### Skill Routing

Skills auto-route via clappie:

```bash
clappie myskill action "value"
# Routes to: .claude/skills/myskill/myskill.js action "value"
```

### Environment Variables & Setup Instructions

Each skill owns its own `.env.example` - keeps skills self-contained and portable.

```
.claude/skills/myskill/.env.example
```

**IMPORTANT: .env.example is your setup guide, not just a template.**

Even if no env vars are needed, ALWAYS create `.env.example` with detailed step-by-step setup instructions. Write for complete beginners - page by page, click by click.

**Format:**
```bash
# ═══════════════════════════════════════════════════════════════
# MyService Setup Guide
# ═══════════════════════════════════════════════════════════════
#
# STEP 1: Create a MyService account
# ──────────────────────────────────
# 1. Go to https://myservice.com
# 2. Click "Sign Up" in the top right
# 3. Enter your email and create a password
# 4. Verify your email (check spam folder)
#
# STEP 2: Create an API application
# ─────────────────────────────────
# 1. Log in to https://myservice.com/dashboard
# 2. Click your profile icon → "Developer Settings"
# 3. Click "New Application" button
# 4. Fill in:
#    - App Name: "Clappie" (or whatever you want)
#    - Redirect URL: https://localhost:9876/callback
#    - Permissions: Check "Read" and "Write"
# 5. Click "Create Application"
#
# STEP 3: Copy your credentials
# ─────────────────────────────
# 1. On the app page, find "Client ID" - copy it below
# 2. Click "Generate Secret" → copy the secret below
# 3. IMPORTANT: Save the secret somewhere safe, you can't see it again!
#
# STEP 4: Paste credentials below and copy to root .env
# ─────────────────────────────────────────────────────
MYSERVICE_CLIENT_ID=paste-your-client-id-here
MYSERVICE_CLIENT_SECRET=paste-your-secret-here

# STEP 5: Authenticate
# ────────────────────
# Run: clappie oauth auth myservice
# A browser will open - log in and authorize the app.
#
# ═══════════════════════════════════════════════════════════════
# You're done! Try: clappie myservice list
# ═══════════════════════════════════════════════════════════════
```

**Why this matters:**
- Users shouldn't need to Google how to set up an API
- Every service has different menus, terminology, gotchas
- Write the instructions YOU wish you had when setting it up
- Include screenshots paths if helpful: `# See: .claude/skills/myskill/docs/step2.png`

**In your code:**
```javascript
function getApiKey() {
  const key = process.env.MYSERVICE_API_KEY;
  if (!key) {
    throw new Error('MYSERVICE_API_KEY not set. See .claude/skills/myskill/.env.example');
  }
  return key;
}
```

**Root `.env.example`** only contains core clappie vars (Telegram, Slack). Skill-specific vars go in the skill folder.

### OAuth Authentication

If your skill needs OAuth, use the **shared OAuth system** instead of building your own.

**Step 1: Ship `oauth.json` in your skill folder:**

```json
{
  "key": "myservice",
  "name": "My Service",
  "authUrl": "https://myservice.com/oauth/authorize",
  "tokenUrl": "https://myservice.com/oauth/token",
  "envPrefix": "MYSERVICE",
  "pkce": true,
  "defaultScopes": ["read", "write"],
  "scopeDelimiter": " "
}
```

**Step 2: Document env vars in `.env.example`:**

```bash
# MyService OAuth
# Create app at: https://myservice.com/developers
MYSERVICE_CLIENT_ID=your-client-id
MYSERVICE_CLIENT_SECRET=your-client-secret
```

**Callback URL:** When setting up OAuth apps, use:
```
https://localhost:9876/callback
```

The OAuth server always uses HTTPS. If you've set up mkcert during clappie setup, there's no browser warning. Otherwise, users click through a self-signed cert warning (still works).

**Step 3: Import shared OAuth in your skill:**

```javascript
import { getAccessToken } from '../clappie/clapps/oauth/lib/tokens.js';

async function getToken() {
  try {
    return await getAccessToken('myservice');  // Auto-refreshes!
  } catch {
    return null;
  }
}
```

**User authenticates with:**
```bash
clappie oauth auth myservice
clappie oauth status              # Check all tokens
clappie oauth token myservice     # Get raw token
```

**OAuth provider options:**

| Field | Required | Description |
|-------|----------|-------------|
| `key` | Yes | Provider identifier (used in commands) |
| `name` | Yes | Display name |
| `authUrl` | Yes | OAuth authorization endpoint |
| `tokenUrl` | Yes | Token exchange endpoint |
| `envPrefix` | Yes | Env var prefix (e.g., `MYSERVICE` → `MYSERVICE_CLIENT_ID`) |
| `pkce` | No | Use PKCE flow (default: false) |
| `defaultScopes` | No | Default scopes to request |
| `scopeDelimiter` | No | Scope separator (default: space) |
| `useBasicAuth` | No | Use Basic auth for token request |
| `defaultExpiresIn` | No | Fallback expiry if not in response |
| `refreshExpiresIn` | No | Refresh token expiry (for status display) |
| `noRefresh` | No | Provider doesn't support refresh |
| `noExpiry` | No | Tokens don't expire |
| `captureFromCallback` | No | Extra params to save from callback (e.g., `["realmId"]`) |

**Tokens stored at:** `recall/oauth/<provider>.json` (auto-managed)

### Webhook Integration

If your skill receives webhooks, use the **shared webhook system**. This section is the authoritative guide for creating webhook integrations.

---

#### 1. Two Types of Webhooks

| Type | Pattern | Examples | Return |
|------|---------|----------|--------|
| **Chat/Messaging** | User sends message → spawn sidekick → AI responds | Telegram, Slack, Discord | `{ sidekick: true, ... }` |
| **Sync Streams** | Events flow in (opened, closed, read) → dump for batch processing | GitHub, email, calendar | `{ dirty: true, prefix: '...' }` |

**Rule of thumb:** If the event is part of a lifecycle (opened→updated→closed), use `{ dirty: true }`. The heartbeat needs ALL events to properly create AND cleanup items.

---

#### 2. File Structure Convention

```
.claude/skills/<skill>/
├── webhook.json              # Signing config + eventHeader (that's all)
└── webhooks/                 # PLURAL - all webhook code lives here
    ├── verify.js             # Signature verification (required)
    ├── send.js               # Send messages back (chat patterns only)
    ├── parse.js              # Parse payloads (optional)
    └── routes/               # Auto-discovered route handlers
        ├── event1.js
        ├── event2.js
        └── ...

recall/settings/<skill>/
├── enabled.txt               # Master enable switch (true/false)
├── webhook-path.txt          # Secret URL segment (auto-generated)
├── users.txt                 # Allowed user IDs (one per line)
└── webhooks/                 # ONLY route enable switches here
    ├── event1.txt            # Enable switch for route (true/false)
    └── event2.txt            # Enable switch for route (true/false)
```

**ALL skills with webhooks use `webhooks/routes/*.js`** - no exceptions. This ensures consistent auto-discovery.

---

#### 3. webhook.json Format

Minimal config - just signing and optional event routing:

```json
{
  "signing": {
    "verify": "webhooks/verify.js",
    "secretEnvVar": "MYSERVICE_WEBHOOK_SECRET"
  },
  "eventHeader": "X-MyService-Event"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `signing.verify` | Yes | Path to verification module (relative to skill) |
| `signing.secretEnvVar` | Yes | Env var containing the signing secret |
| `eventHeader` | No | HTTP header containing event type (enables auto-routing) |
| `send` | No | Module for sending messages back (chat patterns only) |

**Routes are auto-discovered from `webhooks/routes/*.js`** - no explicit `routes` field needed in webhook.json.

---

#### 4. Route Handler Format

Route handlers in `webhooks/routes/*.js` export a config object:

```javascript
export default {
  name: 'handler_name',           // Unique identifier
  path: '{webhook-path}',         // REQUIRED - URL path (use {webhook-path} for shared secret)
  description: 'What this handles',
  events: ['event_type'],         // Event header values that trigger this
  action: 'dirty',                // 'dirty' | 'sidekick' | 'run'
  prefix: 'prefix-name',          // Required if action: 'dirty'
  directive: '...',               // Required if action: 'sidekick'
  run: async (payload, ctx) => {},  // Required if action: 'run'
};
```

**Example - GitHub pull_request:**
```javascript
export default {
  name: 'pull_request',
  path: '{webhook-path}',
  description: 'Handle pull request events (opened, closed, merged, etc.)',
  events: ['pull_request'],
  action: 'dirty',
  prefix: 'github-pr',
};
```

**Example - GitHub star with custom logic:**
```javascript
export default {
  name: 'star',
  path: '{webhook-path}',
  description: 'Handle star events',
  events: ['star'],
  action: 'run',
  run: async (payload, ctx) => {
    // Custom logic here
    if (payload.action === 'created') {
      return { dirty: true, prefix: 'github-star' };
    }
    return { handled: true };  // Ignore unstars
  },
};
```

---

#### 5. The Three Actions

| Action | Required Field | What Happens |
|--------|----------------|--------------|
| `action: 'dirty'` | `prefix` | Dumps payload to `notifications/dirty/{prefix}-{timestamp}.json` |
| `action: 'sidekick'` | `directive` | Spawns AI sidekick with directive + payload |
| `action: 'run'` | `run(payload, ctx)` | Custom logic - must return `{ dirty: true }`, `{ sidekick: true }`, or `{ handled: true }` |

**dirty** - Fire and forget. Heartbeat processes later.
```javascript
{ action: 'dirty', prefix: 'github-pr' }
```

**sidekick** - Spawn Claude immediately.
```javascript
{ action: 'sidekick', directive: 'Check if this is urgent and notify user' }
```

**run** - Full control. Your function decides.
```javascript
{
  action: 'run',
  run: async (payload, ctx) => {
    if (payload.importance > 5) {
      return { sidekick: true, directive: 'High priority item' };
    }
    return { dirty: true, prefix: 'lowpri' };
  }
}
```

---

#### 6. Verification

Each skill defines verification once in `webhooks/verify.js`. All routes (built-in AND custom extensions) inherit it.

**Signature:** `function verify(req, rawBody, env) → boolean`

**Common patterns:**

**HMAC-SHA256 (GitHub):**
```javascript
import crypto from 'crypto';

export default function verify(req, rawBody, env) {
  const signature = req.headers.get('x-hub-signature-256');
  const secret = env.GITHUB_WEBHOOK_SECRET;

  if (!signature || !secret) return false;
  if (!signature.startsWith('sha256=')) return false;

  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
```

**Header token (Telegram):**
```javascript
export default function verify(req, rawBody, env) {
  const token = req.headers.get('x-telegram-bot-api-secret-token');
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  return token === secret;
}
```

**Timestamp + HMAC (Slack):**
```javascript
import crypto from 'crypto';

export default function verify(req, rawBody, env) {
  const signature = req.headers.get('x-slack-signature');
  const timestamp = req.headers.get('x-slack-request-timestamp');

  if (!signature || !timestamp) return false;

  // Reject old requests (5 min window)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const signingSecret = env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return false;

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const expected = 'v0=' + crypto.createHmac('sha256', signingSecret).update(sigBase).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
```

---

#### 7. URL Pattern (Convention)

All webhook URLs follow this pattern:

```
/webhooks/<skill>/{webhook-path}
```

- `<skill>` - Your skill folder name (e.g., `github`, `telegram-bot`)
- `{webhook-path}` - Auto-generated secret from `recall/settings/<skill>/webhook-path.txt`

**Example:** `/webhooks/github/a1b2c3d4e5f6`

The framework handles URL construction automatically. You don't configure full paths.

---

#### 8. Event Header Routing

When `eventHeader` is set in `webhook.json`, the router:

1. Reads the header value from the incoming request
2. Finds handlers in `webhooks/routes/*.js` where `events` array includes that value
3. Executes the matching handler

**Example flow:**
```
POST /webhooks/github/{path}
X-GitHub-Event: pull_request
                    ↓
Router reads "pull_request" from X-GitHub-Event
                    ↓
Matches webhooks/routes/pull_request.js (events: ['pull_request'])
                    ↓
Executes handler
```

---

#### 9. Framework Conventions (What You DON'T Need to Configure)

| Convention | Automatic Behavior |
|------------|-------------------|
| Route discovery | `webhooks/routes/*.js` auto-discovered |
| URL pattern | `/webhooks/<skill>/{webhook-path}` |
| Secret path | `webhook-path.txt` at root, auto-generated if missing |
| Enable switches | Match route names in `recall/settings/<skill>/webhooks/` |
| Verification | All routes inherit `verify.js` |
| Settings loading | `ctx.loadSkillSettingList('users')` etc. |

---

#### 10. User Extensions & Overrides

Users can customize webhook behavior by adding `.js` files to their settings folder:

```
recall/settings/<skill>/webhooks/
├── fork.txt                  # Enable built-in route (true/false)
├── fork.js                   # OR: Custom override (takes precedence!)
├── security-alerts.js        # Add new route (no built-in equivalent)
└── team-deployments.js       # Add new route
```

**Override Rules:**

| Files Present | Result |
|---------------|--------|
| `fork.txt` only | Built-in route, enabled if `true` |
| `fork.js` only | Custom extension handles all `fork` events |
| Both `fork.txt` + `fork.js` | **`.js` wins** - built-in is skipped |

**Extension Format:**

```javascript
// recall/settings/github/webhooks/fork.js
export default {
  name: 'fork',
  path: '{webhook-path}',              // REQUIRED - use same as built-in or customize
  description: 'Custom fork handler',
  events: ['fork'],                    // Which events trigger this
  action: 'run',                       // 'dirty' | 'sidekick' | 'run'

  // For action: 'run'
  run: async (payload, ctx) => {
    return {
      sidekick: true,
      content: `🍴 Someone forked the repo!`,
    };
  },

  // For action: 'sidekick'
  directive: 'Instructions for the sidekick...',

  // For action: 'dirty'
  prefix: 'github-fork',
};
```

**Extensions inherit from the skill:**
- Verification (`verify.js`)
- Send function (`send.js`)
- Event header routing (`eventHeader`)
- Secret URL segment (`webhook-path.txt`)

---

#### 11. Example: GitHub (Sync Stream Pattern)

**Structure:**
```
.claude/skills/github/
├── webhook.json
└── webhooks/
    ├── verify.js
    └── routes/
        ├── pull_request.js
        ├── issues.js
        ├── push.js
        ├── check_run.js
        └── ...
```

**webhook.json:**
```json
{
  "signing": {
    "verify": "webhooks/verify.js",
    "secretEnvVar": "GITHUB_WEBHOOK_SECRET"
  },
  "eventHeader": "X-GitHub-Event"
}
```

**webhooks/routes/pull_request.js:**
```javascript
export default {
  name: 'pull_request',
  description: 'Handle pull request events (opened, closed, merged, labeled, etc.)',
  events: ['pull_request'],
  action: 'dirty',
  prefix: 'github-pr',
};
```

**Why dirty for GitHub?** Because dirty/ is a SYNC STREAM, not just "new items":
- PR opened → creates clean item (source_id: github-pr-123)
- PR reviewed → updates clean item
- PR merged → DISMISSES clean item (source_id match)

Without the "merged" event, the clean item would never get cleaned up!

---

#### 12. Example: Telegram (Chat Pattern)

**Structure:**
```
.claude/skills/telegram-bot/
├── webhook.json
└── webhooks/
    ├── verify.js
    ├── send.js
    ├── parse.js
    └── routes/
        └── incoming-message.js
```

**webhook.json:**
```json
{
  "signing": {
    "verify": "webhooks/verify.js",
    "secretEnvVar": "TELEGRAM_WEBHOOK_SECRET"
  },
  "send": "webhooks/send.js"
}
```

Routes are auto-discovered from `webhooks/routes/`. No `routes` field needed.

**webhooks/send.js — Skill Extension Commands:**

Chat skills can register extra commands for their sidekicks by exporting a `sidekickCommands` map from `send.js`. These become available via `clappie sidekick <command>` when a sidekick's source matches the skill.

```javascript
// webhooks/send.js
export async function send(chatId, message, options = {}) { /* ... */ }
export async function setReaction(chatId, messageId, emoji) { /* ... */ }

// Skill extension commands — auto-discovered by sidekick server
export const sidekickCommands = {
  async react(chatId, messageId, emoji) {
    await setReaction(chatId, messageId, emoji);
    return { reacted: true, emoji };
  },

  async 'send-file'(chatId, type, filePath, caption) {
    const typeMap = { photo: sendPhoto, document: sendDocument };
    const fn = typeMap[type];
    if (!fn) throw new Error(`Unsupported: ${type}`);
    await fn(chatId, filePath, caption);
    return { sent: true, type };
  },
};
```

- First argument is always `chatId` (injected by server from sidekick metadata)
- Remaining arguments come from CLI positional args (sidekick ID is auto-detected from `CLAPPIE_SIDEKICK_ID` env var, so users don't type it)
- No registration needed — server loads `sidekickCommands` from the skill's `send.js` at runtime
- Document available commands in the skill's `sidekick-prompt.txt` so sidekick AI knows about them

**webhooks/routes/incoming-message.js:**
```javascript
import { parseMessage, getScope, isAllowedUser } from '../parse.js';

export default {
  name: 'incoming-message',
  path: '{webhook-path}',
  description: 'Handle incoming Telegram messages',
  events: ['*'],  // Catch-all
  action: 'run',

  run: async (payload, ctx) => {
    const msg = parseMessage(payload);
    if (!msg) return { handled: true };

    // Check allowed users
    const allowedUsers = ctx.loadSkillSettingList('users');
    if (allowedUsers.length > 0 && !isAllowedUser(msg.userId, allowedUsers)) {
      return { handled: true };
    }

    return {
      sidekick: true,
      conversationId: msg.chatId,
      userId: msg.userId,
      content: msg.text,
      context: `telegram user ${msg.userId}`,
      scope: getScope(msg),
      attachments: msg.attachments,
    };
  }
};
```

**Key concepts:**
- `scope` determines which sidekick receives follow-up messages
- `conversationId` is used for replies
- Downloads attachments before spawning sidekick

---

#### 13. Handler Return Types Summary

| Return | When to Use | Example |
|--------|-------------|---------|
| `{ sidekick: true, ... }` | Chat/messaging - need AI response | Telegram, Slack DMs |
| `{ dirty: true, prefix: '...' }` | Sync streams - dump for batch processing | GitHub events, email sync |
| `{ handled: true }` | Ignore silently | Unauthorized user, noise |
| `{ handled: true, challenge: '...' }` | URL verification challenges | Slack Events API |

**Sidekick return fields:**
```javascript
{
  sidekick: true,
  conversationId: 'chat123',        // For replies
  userId: 'user456',
  content: 'message text',
  context: 'telegram user 456',     // Routing hint
  scope: 'telegram-bot:chat123',    // Sidekick scope
  attachments: [...],               // Downloaded files
}
```

---

#### 14. Settings Reference

All settings in `recall/settings/<skill>/`:

| File | Description | Required |
|------|-------------|----------|
| `enabled.txt` | Master enable switch (`true`/`false`) | Yes |
| `users.txt` | Allowed user IDs (one per line) | Yes |
| `webhook-path.txt` | Secret URL segment (auto-generated) | Auto |
| `sidekick-prompt.txt` | Custom prompt/personality for sidekicks (overrides skill defaults) | No |
| `webhooks/<event>.txt` | Enable switch for specific event (`true`/`false`) | No |

---

### Custom Webhooks (No Skill Needed)

For quick one-off webhooks without creating a full skill, drop a `.js` file in `recall/settings/sidekicks/webhooks/`.

**Location:** `recall/settings/sidekicks/webhooks/<name>.js`
**URL:** `https://your-host/webhooks/custom/<path>`

---

#### Enabling & Disabling

| File | Status |
|------|--------|
| `my-webhook.js` | **Enabled** - receives webhooks |
| `.my-webhook.js` | **Disabled** - ignored (dot prefix) |

To disable a webhook, just add a `.` prefix to the filename. Same convention as heartbeat checks.

---

#### The Three Action Types

**1. action: 'dirty'** - Dump for batch processing

Best for: events that are part of a lifecycle, non-urgent stuff, bulk processing.

```javascript
// recall/settings/sidekicks/webhooks/my-app-events.js
export default {
  name: 'my-app-events',
  path: 'my-app-events',
  description: 'Dump events for heartbeat to process',
  action: 'dirty',
  prefix: 'myapp',  // Creates notifications/dirty/myapp-{timestamp}.json
  signing: 'none',
};
```

**2. action: 'sidekick'** - Spawn Claude

Best for: urgent events, things needing AI decision-making, notifications.

```javascript
// recall/settings/sidekicks/webhooks/alerts.js
export default {
  name: 'alerts',
  path: 'alerts',
  description: 'Spawn Claude to handle alerts',
  action: 'sidekick',
  directive: `You received an alert webhook.

If it looks urgent, notify me via Telegram.
If it's minor, just log it and complete the sidekick.`,
  signing: 'none',
};
```

**3. action: 'run'** - Full control

Best for: conditional routing, filtering, custom logic.

```javascript
// recall/settings/sidekicks/webhooks/smart-router.js
export default {
  name: 'smart-router',
  path: 'smart-router',
  description: 'Route based on payload content',
  action: 'run',
  signing: 'none',

  run: async (payload, ctx) => {
    // Route high priority to sidekick
    if (payload.priority === 'high') {
      return {
        sidekick: true,
        directive: 'URGENT! Handle this immediately.',
        content: JSON.stringify(payload, null, 2),
      };
    }

    // Route low priority to dirty
    if (payload.priority === 'low') {
      return { dirty: true, prefix: 'lowpri' };
    }

    // Ignore everything else
    return { handled: true };
  },
};
```

---

#### Reusing Skill Verification

You can piggyback on any skill's signature verification by setting `signing: '<skill-name>'`.

```javascript
// recall/settings/sidekicks/webhooks/github-custom.js
export default {
  name: 'github-custom',
  path: 'github-custom',
  description: 'Custom webhook using GitHub signature verification',
  action: 'dirty',
  prefix: 'github-custom',

  // Reuse GitHub's verify.js and GITHUB_WEBHOOK_SECRET
  signing: 'github',
};
```

This uses:
- The skill's `webhooks/verify.js` function
- The skill's `secretEnvVar` from `webhook.json`

Great for: GitHub Apps, custom integrations that share secrets with existing skills.

---

#### Config Reference

```javascript
export default {
  // Required
  name: 'webhook-name',           // Identifier
  path: 'url-path',               // URL after /webhooks/custom/
  action: 'dirty',                // 'dirty' | 'sidekick' | 'run'

  // Optional
  description: 'What this does',
  signing: 'none',                // 'none' | 'hmac' | '<skill-name>'
  secretEnvVar: 'MY_SECRET',      // For signing: 'hmac'

  // For action: 'dirty'
  prefix: 'my-prefix',            // Dirty file prefix

  // For action: 'sidekick'
  directive: 'Instructions...',   // AI instructions (payload appended)

  // For action: 'run'
  run: async (payload, ctx) => {
    // Return one of:
    // { handled: true }                    - Done, do nothing
    // { dirty: true, prefix: '...' }       - Dump to dirty
    // { sidekick: true, directive: '...' }  - Spawn Claude
  },
};
```

---

#### Testing

```bash
# Simple test (no signing)
curl -X POST https://your-host/webhooks/custom/my-webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# With HMAC signing
SECRET="your-secret"
PAYLOAD='{"test": true}'
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)
curl -X POST https://your-host/webhooks/custom/my-webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  -d "$PAYLOAD"
```

---

#### Demo Files

See working examples in `recall/settings/sidekicks/webhooks/`:

| File | Action | Description |
|------|--------|-------------|
| `.demo-dirty.js` | dirty | Dump to notifications/dirty/ |
| `.demo-sidekick.js` | sidekick | Spawn Claude with instructions |
| `.demo-run.js` | run | Custom routing logic |
| `.demo-github-signing.js` | run | Reuses GitHub verification |

*(All demos are disabled by default - remove the `.` prefix to enable)*

---

## Part 2: Displays

Interactive terminal UIs. Can be part of a skill or a standalone clapp.

### File Locations

**External skill display:**
```
.claude/skills/myskill/displays/
├── index.js     # Default view
└── detail.js    # Additional view
```

**Clappie internal clapp:**
```
.claude/skills/clappie/clapps/myapp/displays/
├── index.js     # Default view
└── settings.js  # Additional view
```

### Access Patterns

```bash
# External skill (leading slash)
clappie display push /myskill/index
clappie display push /myskill/detail

# Internal clapp (no leading slash)
clappie display push myapp           # Loads index.js
clappie display push myapp/settings  # Loads settings.js
```

### Display Template

```javascript
import { View, Button, Toggle, TextInput, SectionHeading } from '../../clappie/clapps/display-engine/ui-kit/index.js';

// Optional: export layout = 'full' for dashboards
export const maxWidth = 50;

export function create(ctx) {
  ctx.setTitle('My View');
  ctx.setDescription('Optional subtitle');

  const view = new View(ctx);
  let inputValue = '';

  function render() {
    view.clear();

    view.add(SectionHeading({ text: 'SETTINGS' }));
    view.space();

    view.add(TextInput({
      label: 'Name',
      value: inputValue,
      width: 30,
      onChange: (v) => { inputValue = v; }
    }));
    view.space();

    view.add(Button({
      label: 'Save',
      shortcut: 'S',
      onPress: () => {
        ctx.submit({ component: 'MyView', value: inputValue });
        ctx.pop();
      }
    }));

    view.render();
  }

  return {
    init() { render(); },
    render,  // CRITICAL: Required for theme toggle to work
    onKey(key) { return view.handleKey(key); },
    cleanup() { /* Optional: cleanup timers, etc */ },
  };
}
```

### Context API

```javascript
// Data & State
ctx.data                      // Data passed via -d flags
ctx.width, ctx.height         // Terminal dimensions

// Navigation
ctx.push('viewName', data)    // Push new view onto stack
ctx.pop()                     // Go back

// Display Control
ctx.draw(lines)               // Render array of strings
ctx.setTitle(title)           // Set header title
ctx.setDescription(desc)      // Set header subtitle
ctx.setLayout({ layout, maxWidth })  // Change layout dynamically

// Communication to Claude
ctx.send(text)                // Type in Claude pane (no Enter)
ctx.submit({ component, value })  // Type + Enter (auto-formatted)
ctx.toast(msg)                // Show notification
```

### Available Components

Import from `display-engine/ui-kit/index.js`:

**Block (full-width):**
- `SectionHeading` - Section header with decorative line
- `ButtonFilled` - Primary action button
- `ButtonFullWidth` - Full-width button
- `ToggleBlock` - Side-by-side toggle `[ ON ] [ OFF ]`
- `SelectBlock` - Side-by-side options
- `Divider` - Horizontal separator

**Inline (compact):**
- `Button`, `ButtonGhost`, `ButtonInline` - Various button styles
- `Toggle` - Simple switch
- `TextInput` - Single-line input
- `Textarea` - Multi-line input
- `Checkbox`, `Radio` - Selection controls
- `Select` - Dropdown
- `Progress`, `Loader` - Progress indicators
- `Label` - Text line
- `Alert` - Info/warning/error box

### Communicating Back to Claude

**Always use arrow format, not JSON:**

```javascript
// Good - human readable
ctx.submit({ component: 'Form', value: 'submitted' });
// Claude sees: [clappie] Form → submitted

// Good - multi-field
ctx.submit(`Settings
  Theme → dark
  Notifications → enabled`);
// Claude sees:
// [clappie] Settings
//   Theme → dark
//   Notifications → enabled

// Bad - JSON is ugly in chat
ctx.submit({ component: 'Form', value: JSON.stringify(data) });
```

### Utility Displays

Reusable displays available to any skill:

```javascript
// Confirmation dialog
ctx.push('utility/confirm', { message: 'Delete this item?' });

// File picker
ctx.push('utility/file-picker', { startDir: 'documents/' });

// Text editor
ctx.push('utility/editor', { file: 'path/to/file.txt' });

// Table viewer
ctx.push('utility/table', { data: 'name,age\nBob,30' });
```

---

## Part 3: Background Apps

Background processes that run independently. Can have displays.

### File Structure

```
.claude/skills/clappie/clapps/myapp/
├── .background        # Marker file (required)
├── displays/
│   └── index.js     # Optional UI
└── daemon.js        # Optional background process
```

### The .background Marker

Create an empty `.background` file or with config:

```
# .background
name: My App
noCliStop: false
```

### Commands

```bash
clappie background start              # Start all background apps
clappie background start myapp        # Start specific app
clappie background stop myapp         # Stop specific app
clappie background stop               # Stop all apps
```

### Background App with Display

The display can submit messages to Claude when running in background context:

```javascript
// In displays/index.js
export function create(ctx) {
  // ctx.submit() works if CLAPPIE_ALLOW_SENDKEYS=1
  // This is set automatically for background sessions
}
```

---

## Part 4: Writing Good SKILL.md

### Frontmatter (Required)

```yaml
---
name: skill-name
description: What it does. Use when [trigger keywords].
---
```

The description is crucial - Claude uses it to decide when to invoke your skill.

### Structure

1. **Title + Summary** - One line what it does
2. **Setup** - Prerequisites, env vars, auth
3. **Quick Reference** - Code blocks with common commands
4. **Handling [clappie] Messages** - How to respond to UI events
5. **Examples** - Real-world usage patterns

### Best Practices

- Keep SKILL.md under 500 lines
- Use code blocks for commands
- Document all [clappie] message formats
- Include trigger keywords in description
- Reference helper files if needed (don't duplicate)

---

## Examples

### CLI-Only: Whisper Skill

```
.claude/skills/whisper/
├── whisper.js     # listen, say, voices commands
├── SKILL.md
└── .env.example   # OPENAI_API_KEY
```

### CLI + Displays: Front Skill

```
.claude/skills/front/
├── front.js              # API commands (imports shared OAuth)
├── oauth.json   # OAuth config (shared system discovers this)
├── SKILL.md
├── .env.example          # FRONT_CLIENT_ID, FRONT_CLIENT_SECRET
└── displays/
    ├── inbox.js          # Inbox browser
    └── reader.js         # Thread reader
```

User authenticates with: `clappie oauth auth front`

### Background App: Heartbeat

```
.claude/skills/clappie/clapps/heartbeat/
├── .background
└── displays/
    └── index.js   # Dashboard + settings
```

---

## Checklist

Before shipping your integration:

### Core (Required)

- [ ] **No state in `.claude/skills/`** - cache, logs, data go in `recall/`
- [ ] `meta` export with name, description, commands
- [ ] **`main()` wrapped in `if (import.meta.main)`** - breaks `clappie list` if missing!
- [ ] SKILL.md with proper frontmatter (`name`, `description`)
- [ ] Commands appear in `clappie list skills`
- [ ] **`.env.example` with DETAILED step-by-step setup guide** (even if no vars needed!)
- [ ] **Walk user through setup after building** - don't just say "see .env.example"

### Displays Checklist (if user requested displays)

If the user wants displays (asked during scoping):
- [ ] **List view** (inbox, browser, dashboard) - can use `utility/list` or `utility/table`
- [ ] **Detail view** (viewer, reader) - can use `utility/viewer` or `utility/markdown`
- [ ] Displays export `create(ctx)` returning `{ init, render, onKey }`
- [ ] `render` method exported (for theme changes)
- [ ] Colors fetched inside render functions
- [ ] Works in both light and dark mode
- [ ] [clappie] message handling documented in SKILL.md

### OAuth Checklist (if applicable)

- [ ] `oauth.json` with correct authUrl, tokenUrl, envPrefix
- [ ] `.env.example` documents `PREFIX_CLIENT_ID` and `PREFIX_CLIENT_SECRET`
- [ ] Skill imports `getAccessToken` from shared OAuth (not custom auth code)
- [ ] Error messages tell user to run `clappie oauth auth <provider>`
- [ ] Provider appears in `clappie oauth providers`
- [ ] SKILL.md setup docs use `clappie oauth auth <provider>`

### Webhook Checklist (if applicable)

**For Sync Streams (GitHub-style):**
- [ ] `webhook.json` with `signing` config and `eventHeader`
- [ ] `webhooks/verify.js` validates signatures
- [ ] `webhooks/routes/*.js` handlers with `events`, `action`, and `prefix`
- [ ] All handlers use `action: 'dirty'` (let heartbeat be smart)
- [ ] Settings documented in SKILL.md with table format
- [ ] `recall/settings/<skill>/enabled.txt` set to `true` to enable

**For Chat Patterns (Telegram-style):**
- [ ] `webhook.json` with `signing` config and `send` module
- [ ] `webhooks/verify.js` validates signatures
- [ ] `webhooks/routes/incoming-message.js` with `action: 'run'`
- [ ] `webhooks/send.js` exports functions to send messages back
- [ ] `webhooks/send.js` exports `sidekickCommands` map for skill extension commands
- [ ] `webhooks/parse.js` extracts message fields from payload
- [ ] Skill `sidekick-prompt.txt` documents available extension commands
- [ ] Settings documented in SKILL.md with table format
- [ ] `recall/settings/<skill>/enabled.txt` set to `true` to enable
- [ ] `recall/settings/<skill>/webhooks/incoming-message.txt` set to `true`
- [ ] `recall/settings/<skill>/users.txt` lists allowed user IDs
- [ ] Handler returns proper `scope` for sidekick routing
