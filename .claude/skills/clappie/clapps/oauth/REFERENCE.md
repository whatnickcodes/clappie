# OAuth Reference

Shared token management across skills. Auth flows, auto-refresh, multi-account, token storage.

## How It Works

1. **Skills ship providers** via `oauth.json` in their skill directory
2. **User authenticates** — opens browser, HTTPS callback on `localhost:9876`
3. **Tokens stored** in `recall/oauth/<provider>.json`
4. **Skills get tokens** via `clappie oauth token <provider>` — auto-refreshes if expired

## Commands

```bash
clappie oauth auth <provider>              # Start OAuth flow (opens browser)
clappie oauth auth <provider> --force      # Re-authenticate even if tokens exist
clappie oauth auth <provider> --scopes "scope1,scope2"  # Custom scopes
clappie oauth auth <provider> --account work            # Multi-account
clappie oauth token <provider>             # Get access token (auto-refresh)
clappie oauth token <provider> --json      # Full token object
clappie oauth status                       # Show all tokens + status
clappie oauth refresh <provider>           # Force refresh
clappie oauth revoke <provider>            # Delete tokens
clappie oauth providers                    # List available providers
```

Scripting: `TOKEN=$(clappie oauth token google)` — outputs just the token string.

## Provider Discovery

Providers come from two places (skill overrides user):

```
.claude/skills/<skill>/oauth.json          # Skills ship their own (higher priority)
recall/oauth/providers/<name>.json         # User-added custom providers
```

### oauth.json Format

```json
{
  "key": "google",
  "name": "Google",
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth",
  "tokenUrl": "https://oauth2.googleapis.com/token",
  "defaultScopes": ["openid", "email"],
  "envPrefix": "GOOGLE",
  "pkce": true,
  "extraAuthParams": { "access_type": "offline", "prompt": "consent" }
}
```

**Fields:**
- `key` — Provider identifier (used in all commands)
- `envPrefix` — Looks for `{PREFIX}_CLIENT_ID` and `{PREFIX}_CLIENT_SECRET` in `.env`
- `pkce` — Enable PKCE (S256 challenge)
- `defaultScopes` — Used if no `--scopes` flag
- `scopeDelimiter` — Scope separator (default: space)
- `useBasicAuth` — Send credentials as Basic auth header instead of body
- `noExpiry` — Token doesn't expire (e.g., GitHub)
- `noRefresh` — No refresh token support
- `defaultExpiresIn` — Default TTL in seconds if not in response
- `refreshExpiresIn` — Refresh token TTL in seconds
- `extraAuthParams` — Extra query params on auth URL
- `tokenRequestHeaders` — Extra headers on token exchange
- `tokenPath` — For nested token responses (e.g., Slack's `authed_user`)
- `captureFromCallback` — Capture extra callback params into metadata (e.g., QuickBooks `realmId`)

## Credentials

Client ID and secret come from `.env` at project root:

```
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
```

The env prefix is defined by the provider's `envPrefix` field. Claude can't access `.env` directly — the user must set these up.

## Token Storage

```
recall/oauth/
├── google.json              # Default account
├── google-work.json         # Named account
├── github.json
└── providers/               # User-added providers
    └── custom.json
```

Token files contain: `access_token`, `refresh_token`, `expires_at`, `scopes`, `created_at`, `metadata`.

## Auth Flow

1. CLI builds auth URL with state param (CSRF) and optional PKCE challenge
2. Starts HTTPS callback server on `localhost:9876`
3. Opens browser to provider's auth page
4. User authorizes, provider redirects to callback
5. Server exchanges code for tokens, saves to `recall/oauth/`
6. Browser shows success page, server shuts down

**HTTPS:** Uses mkcert certs from `recall/oauth/` if available (no browser warning). Falls back to self-signed (browser shows warning — user clicks through).

**Timeout:** 5 minutes to complete the flow.

## Auto-Refresh

`clappie oauth token <provider>` checks expiry before returning:
- Valid → returns token
- Expiring within 5 min → refreshes first, then returns
- Expired + has refresh token → refreshes
- Expired + no refresh token → error, tells user to re-auth
- Refresh token expired → error, tells user to re-auth

Some providers rotate refresh tokens on refresh — this is handled automatically.

## Display

```bash
clappie display push oauth
```

Visual UI showing all tokens with status (valid/expiring/expired), scopes, creation date, last refresh. Navigate with j/k, actions: F=refresh, A=re-auth, X=delete, R=reload list.

## Using Tokens in Skills

From a skill's code:

```javascript
import { getAccessToken } from '../clapps/oauth/lib/tokens.js';

const token = await getAccessToken('google');
// Auto-refreshes if needed, throws if expired with no refresh
```

From CLI/scripts:

```bash
TOKEN=$(clappie oauth token google)
curl -H "Authorization: Bearer $TOKEN" https://api.example.com/data
```
