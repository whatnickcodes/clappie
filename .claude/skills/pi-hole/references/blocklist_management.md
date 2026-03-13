# Blocklist Management

## How Gravity Works

Pi-hole's gravity system:
1. Downloads all subscribed blocklists (adlists)
2. Parses domains from each list
3. Deduplicates and compiles into a SQLite database (`/etc/pihole/gravity.db`)
4. DNS queries are checked against this database

### Update Gravity
```bash
# Manually trigger gravity update
docker exec pihole pihole -g

# View gravity stats
docker exec pihole pihole -g --check

# Gravity updates automatically weekly via cron inside the container
```

## Curated Blocklists

### Essential (Low False Positives)
These are well-maintained and safe for most users:

| List | URL | Domains |
|------|-----|---------|
| Steven Black Unified | `https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts` | ~170k |
| Pi-hole Default | Included by default | ~300k |
| OISD Basic | `https://small.oisd.nl/` | ~70k |

### Moderate (Some False Positives)
More aggressive blocking, may require whitelist maintenance:

| List | URL | Focus |
|------|-----|-------|
| Disconnect Tracking | `https://s3.amazonaws.com/lists.disconnect.me/simple_tracking.txt` | Trackers |
| Disconnect Ads | `https://s3.amazonaws.com/lists.disconnect.me/simple_ad.txt` | Ads |
| OISD Full | `https://big.oisd.nl/` | Comprehensive |
| Hagezi Multi Pro | `https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/hosts/pro.txt` | Multi-purpose |

### Aggressive (Expect False Positives)
For high-security or IoT networks where breakage is acceptable:

| List | URL | Focus |
|------|-----|-------|
| Energized Ultimate | `https://block.energized.pro/ultimate/formats/hosts.txt` | Everything |
| NoTracking | `https://raw.githubusercontent.com/notracking/hosts-blocklists/master/hostnames.txt` | Trackers |

### Specialized
| List | URL | Focus |
|------|-----|-------|
| Phishing Army | `https://phishing.army/download/phishing_army_blocklist.txt` | Phishing |
| CoinBlocker | `https://zerodot1.gitlab.io/CoinBlockerLists/hosts_browser` | Cryptomining |
| WindowsSpyBlocker | `https://raw.githubusercontent.com/nicehash/WindowsSpyBlocker/master/data/hosts/spy.txt` | Windows telemetry |

## Adding Blocklists

### Via Web UI
1. Login to Pi-hole admin
2. Group Management > Adlists
3. Paste URL, add comment, submit
4. Tools > Update Gravity

### Via CLI
```bash
# Add a list
docker exec pihole pihole -a adlist add "https://example.com/blocklist.txt"

# Update gravity after adding
docker exec pihole pihole -g
```

### Via SQLite Direct
```bash
docker exec pihole sqlite3 /etc/pihole/gravity.db \
  "INSERT INTO adlist (address, enabled, comment) VALUES ('https://example.com/list.txt', 1, 'My list');"
docker exec pihole pihole -g
```

## Regex Filters

### Blacklist Regex
Block domains matching a pattern:
```bash
# Block all subdomains of tracker.com
docker exec pihole pihole regex '(^|\.)tracker\.com$'

# Block domains containing "ads"
docker exec pihole pihole regex '.*ads.*\.com$'

# Block telemetry patterns
docker exec pihole pihole regex '(^|\.)telemetry\.'
docker exec pihole pihole regex '(^|\.)analytics\.'
docker exec pihole pihole regex '(^|\.)metrics\.'
```

### Whitelist Regex
Allow domains matching a pattern (overrides blocklists):
```bash
# Allow all microsoft update domains
docker exec pihole pihole --white-regex '.*\.update\.microsoft\.com$'

# Allow specific CDN
docker exec pihole pihole --white-regex '.*\.cloudfront\.net$'
```

### Useful Regex Patterns
```
# Block all .ru and .cn TLDs (aggressive)
(^|\.).*\.ru$
(^|\.).*\.cn$

# Block domains with numbers-heavy patterns (often malware)
(^|\.)([0-9]{3,}|[a-z]{20,})\.[a-z]{2,}$

# Block common ad server patterns
(^|\.)ad[sv]?[0-9]*\.
(^|\.)banner[0-9]*\.
(^|\.)track(er|ing)?[0-9]*\.
```

## Group Management

Groups allow different blocklist policies for different clients.

### Create Groups
Via web UI: Group Management > Groups

### Assign Clients to Groups
Via web UI: Group Management > Clients
- Add client by IP, MAC, or CIDR range
- Assign to one or more groups

### Assign Adlists to Groups
Via web UI: Group Management > Adlists
- Each adlist can be assigned to specific groups
- Default group applies to all clients

### Example Setup
```
Group: "Kids"
  - Clients: 192.168.1.50, 192.168.1.51
  - Adlists: Default + Safe Search enforcement + Social media blocks

Group: "IoT"
  - Clients: 192.168.1.100-192.168.1.200
  - Adlists: Default + Aggressive blocking

Group: "Adults"
  - Clients: 192.168.1.10, 192.168.1.11
  - Adlists: Default only (minimal blocking)
```

## Whitelisting

### Common Whitelist Entries
Services that break when blocked:

```bash
# Microsoft
pihole -w login.microsoftonline.com
pihole -w login.live.com
pihole -w account.live.com

# Apple
pihole -w apple.com
pihole -w icloud.com
pihole -w mask.icloud.com
pihole -w mask-h2.icloud.com

# Google
pihole -w clients4.google.com
pihole -w clients2.google.com

# Captive portals
pihole -w connectivitycheck.gstatic.com
pihole -w captive.apple.com
pihole -w detectportal.firefox.com

# CDNs (if needed)
pihole -w cdn.jsdelivr.net
pihole -w cdnjs.cloudflare.com
```

### Bulk Whitelist
```bash
# From a file (one domain per line)
while read domain; do
  docker exec pihole pihole -w "$domain"
done < whitelist.txt
```

## Monitoring Blocklist Health

### Check List Status
```bash
# View all adlists and their status
docker exec pihole sqlite3 /etc/pihole/gravity.db \
  "SELECT id, address, enabled, number, status FROM adlist;"
```

### Gravity Database Stats
```bash
# Total domains in gravity
docker exec pihole sqlite3 /etc/pihole/gravity.db \
  "SELECT COUNT(DISTINCT domain) FROM gravity;"

# Domains per list
docker exec pihole sqlite3 /etc/pihole/gravity.db \
  "SELECT adlist_id, COUNT(*) as domains FROM gravity GROUP BY adlist_id;"
```

### List Health Indicators
- **Status 0**: List downloaded successfully
- **Status 1**: Download failed (check URL)
- **Status 2**: List unchanged since last update
- **Status 3**: List not available (404 or timeout)

Remove lists with persistent status 1 or 3 to keep gravity clean.
