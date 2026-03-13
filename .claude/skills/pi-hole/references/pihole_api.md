# Pi-hole API Reference

## Overview

Pi-hole provides a REST API for querying statistics, managing blocklists, and controlling the service. The API is accessible at `http://<pihole-ip>/admin/api.php`.

**Authentication**: Most read endpoints are public. Write operations and detailed data require the API token, found in:
```bash
docker exec pihole cat /etc/pihole/setupVars.conf | grep WEBPASSWORD
```

Pass the token via query parameter: `?auth=<TOKEN>`

## Summary Statistics

### Dashboard Summary
```
GET /admin/api.php?summary
GET /admin/api.php?summaryRaw   # Numeric values without formatting
```

Response:
```json
{
  "domains_being_blocked": 312345,
  "dns_queries_today": 45678,
  "ads_blocked_today": 12345,
  "ads_percentage_today": 27.03,
  "unique_domains": 3456,
  "queries_forwarded": 23456,
  "queries_cached": 9876,
  "clients_ever_seen": 42,
  "unique_clients": 38,
  "dns_queries_all_types": 45678,
  "reply_NODATA": 1234,
  "reply_NXDOMAIN": 567,
  "reply_CNAME": 8901,
  "reply_IP": 34567,
  "privacy_level": 0,
  "status": "enabled",
  "gravity_last_updated": {
    "file_exists": true,
    "absolute": 1704067200
  }
}
```

### Over-Time Data
```
GET /admin/api.php?overTimeData10mins      # Queries over time (10-min intervals)
GET /admin/api.php?overTimeDataClients      # Per-client over time (auth required)
```

## Query Data

### Top Items
```
GET /admin/api.php?topItems=25&auth=<TOKEN>
```
Returns top 25 permitted and blocked domains.

### Top Clients
```
GET /admin/api.php?topClients=10&auth=<TOKEN>
```
Returns top 10 clients by query count.

### Query Types
```
GET /admin/api.php?getQueryTypes&auth=<TOKEN>
```
Response:
```json
{
  "querytypes": {
    "A (IPv4)": 65.23,
    "AAAA (IPv6)": 20.15,
    "ANY": 0.01,
    "SRV": 0.50,
    "SOA": 0.10,
    "PTR": 5.00,
    "TXT": 1.00,
    "HTTPS": 8.01
  }
}
```

### Forward Destinations
```
GET /admin/api.php?getForwardDestinations&auth=<TOKEN>
```
Shows which upstream resolvers are handling queries and their percentages.

### Recent Queries
```
GET /admin/api.php?getAllQueries=100&auth=<TOKEN>
```
Returns last 100 queries with timestamp, type, domain, client, and status.

### Query Log for Specific Client
```
GET /admin/api.php?getAllQueries&client=192.168.1.50&auth=<TOKEN>
```

### Query Log for Specific Domain
```
GET /admin/api.php?getAllQueries&domain=example.com&auth=<TOKEN>
```

## Control Endpoints

### Enable/Disable Pi-hole
```
GET /admin/api.php?enable&auth=<TOKEN>           # Enable blocking
GET /admin/api.php?disable&auth=<TOKEN>           # Disable blocking indefinitely
GET /admin/api.php?disable=300&auth=<TOKEN>       # Disable for 300 seconds
```

### Whitelist/Blacklist Management
```
GET /admin/api.php?list=white&add=example.com&auth=<TOKEN>
GET /admin/api.php?list=white&sub=example.com&auth=<TOKEN>    # Remove
GET /admin/api.php?list=black&add=ads.example.com&auth=<TOKEN>
GET /admin/api.php?list=black&sub=ads.example.com&auth=<TOKEN>
```

### Regex Management
```
GET /admin/api.php?list=regex_white&add=.*\.example\.com$&auth=<TOKEN>
GET /admin/api.php?list=regex_black&add=.*\.tracker\.com$&auth=<TOKEN>
```

## Teleporter (Backup/Restore)

### Export (Backup)
```bash
# Via CLI (generates tar.gz in /etc/pihole/)
docker exec pihole pihole -a -t

# Via API
GET /admin/api.php?teleporter&auth=<TOKEN>
# Returns tar.gz file as download
```

### Import (Restore)
```bash
# Via CLI
docker exec pihole pihole -a -t /path/to/backup.tar.gz

# Via web UI: Settings > Teleporter > Import
```

## Network Information

### Client Table
```
GET /admin/api.php?network&auth=<TOKEN>
```
Returns all seen clients with:
- IP address
- MAC address (if available)
- Hostname
- First seen / last query timestamps
- Number of queries

## Version Information
```
GET /admin/api.php?version
GET /admin/api.php?versions        # Detailed version info
```

## Gravity Management

### Update Gravity
```bash
# Via CLI (preferred for long-running operation)
docker exec pihole pihole -g

# Via API (may timeout for large lists)
GET /admin/api.php?updateGravity&auth=<TOKEN>
```

### Adlist Management via API
```
# List all adlists
GET /admin/api.php?list=adlist&auth=<TOKEN>

# Add adlist
POST /admin/api/lists
Content-Type: application/json
{
  "address": "https://example.com/list.txt",
  "comment": "My custom list"
}
```

## Using the API for Monitoring

### Health Check Script Pattern
```bash
# Quick status check
STATUS=$(curl -s "http://pihole/admin/api.php?summary" | jq -r '.status')
if [ "$STATUS" != "enabled" ]; then
  echo "ALERT: Pi-hole is $STATUS"
fi

# Block percentage check
BLOCKED=$(curl -s "http://pihole/admin/api.php?summaryRaw" | jq -r '.ads_percentage_today')
echo "Blocked: ${BLOCKED}%"

# Gravity age check
GRAVITY_TS=$(curl -s "http://pihole/admin/api.php?summary" | jq -r '.gravity_last_updated.absolute')
NOW=$(date +%s)
AGE_DAYS=$(( (NOW - GRAVITY_TS) / 86400 ))
if [ "$AGE_DAYS" -gt 7 ]; then
  echo "WARNING: Gravity is $AGE_DAYS days old"
fi
```

### Prometheus Integration
Pi-hole doesn't natively export Prometheus metrics, but community exporters exist:
- `ekofr/pihole-exporter` Docker image
- Exposes metrics at `:9617/metrics`

```yaml
# Add to docker-compose.yml
services:
  pihole-exporter:
    container_name: pihole-exporter
    image: ekofr/pihole-exporter:latest
    environment:
      PIHOLE_HOSTNAME: pihole
      PIHOLE_PASSWORD: "${WEBPASSWORD}"
    ports:
      - "9617:9617"
    restart: unless-stopped
```

## Error Handling

### Common API Errors
| Response | Meaning |
|----------|---------|
| `[]` (empty array) | Auth required or invalid token |
| `{"status":"disabled"}` | Pi-hole blocking is disabled |
| Connection refused | Container not running or port not exposed |
| Timeout | Gravity update in progress or overloaded |

### Rate Limiting
The API has no built-in rate limiting. For monitoring, poll no more frequently than every 30 seconds to avoid unnecessary load.
