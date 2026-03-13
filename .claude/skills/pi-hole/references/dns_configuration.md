# DNS Configuration Guide

## Upstream DNS Providers

### Public Resolvers

#### Cloudflare
- **IPv4**: 1.1.1.1, 1.0.0.1
- **IPv6**: 2606:4700:4700::1111, 2606:4700:4700::1001
- **DoH**: `https://cloudflare-dns.com/dns-query`
- **DoT**: `tls://cloudflare-dns.com`
- **Features**: Fast, privacy-focused, DNSSEC

#### Quad9 (DNSSEC + Malware blocking)
- **IPv4**: 9.9.9.9, 149.112.112.112
- **IPv6**: 2620:fe::fe, 2620:fe::9
- **DoH**: `https://dns.quad9.net/dns-query`
- **DoT**: `tls://dns.quad9.net`
- **Features**: Security-focused, malware blocking, DNSSEC validation

#### Google
- **IPv4**: 8.8.8.8, 8.8.4.4
- **IPv6**: 2001:4860:4860::8888, 2001:4860:4860::8844
- **DoH**: `https://dns.google/dns-query`
- **DoT**: `tls://dns.google`
- **Features**: Reliable, DNSSEC

#### OpenDNS
- **IPv4**: 208.67.222.222, 208.67.220.220
- **IPv6**: 2620:119:35::35, 2620:119:53::53
- **DoH**: `https://doh.opendns.com/dns-query`
- **DoT**: `tls://dns.opendns.com`
- **Features**: Family filter options, customizable blocking

#### Mullvad
- **IPv4**: 194.242.2.2
- **IPv6**: 2a07:e340::2
- **DoH**: `https://dns.mullvad.net/dns-query`
- **DoT**: `tls://dns.mullvad.net`
- **Features**: Privacy, no logging, based in Sweden

### Setting Upstream in Pi-hole
Via environment variable in docker-compose.yml:
```yaml
environment:
  PIHOLE_DNS_: "1.1.1.1;9.9.9.9"
```

Via web UI: Settings > DNS > Upstream DNS Servers

Via CLI:
```bash
docker exec pihole pihole -a setdns "1.1.1.1,9.9.9.9"
```

## Conditional Forwarding

Forward queries for local domains to your LAN DNS server (usually the router).

### When to Use
- You want Pi-hole to resolve local hostnames (e.g., `printer.local`, `nas.home`)
- Your router/DHCP server maintains a local DNS table
- You need reverse DNS (PTR) lookups for local IPs

### Configuration
Via web UI: Settings > DNS > Conditional Forwarding

- **Local network**: `192.168.1.0/24` (your LAN CIDR)
- **Router IP**: `192.168.1.1` (your router/local DNS)
- **Local domain**: `local` or `home` or `lan`

Via custom dnsmasq config:
```bash
# /opt/pihole/etc-dnsmasq.d/05-conditional.conf
server=/local/192.168.1.1
server=/1.168.192.in-addr.arpa/192.168.1.1
```

### Multiple Local Domains
```bash
# /opt/pihole/etc-dnsmasq.d/05-conditional.conf
server=/home.lan/192.168.1.1
server=/iot.lan/192.168.10.1
server=/guest.lan/192.168.20.1
```

## DNSSEC

DNSSEC validates that DNS responses haven't been tampered with.

### Enable in Pi-hole
Via web UI: Settings > DNS > Enable DNSSEC

Via environment variable:
```yaml
environment:
  DNSSEC: "true"
```

### Requirements
- Upstream DNS must support DNSSEC (Cloudflare, Google, Quad9 all do)
- Do NOT enable DNSSEC if using a local forwarder that doesn't support it
- DNSSEC adds slight latency to first-time queries (validation overhead)

### Troubleshooting DNSSEC
```bash
# Test DNSSEC validation
dig +dnssec example.com @192.168.1.53

# Should see 'ad' flag in response (Authenticated Data)
# If queries fail with SERVFAIL, DNSSEC validation is failing
# Disable DNSSEC and test with upstream directly:
dig +dnssec example.com @1.1.1.1
```

## DNS over HTTPS (DoH)

Encrypt DNS queries between Pi-hole and upstream resolvers. Prevents ISP snooping on DNS traffic.

### Using cloudflared as DoH Proxy

Run cloudflared as a sidecar container:

```yaml
# Add to docker-compose.yml
services:
  cloudflared:
    container_name: cloudflared
    image: cloudflare/cloudflared:latest
    command: proxy-dns --port 5053 --upstream https://cloudflare-dns.com/dns-query
    restart: unless-stopped

  pihole:
    # ... existing config ...
    environment:
      PIHOLE_DNS_: "cloudflared#5053"
    depends_on:
      - cloudflared
```

### Using Unbound as Recursive Resolver

For maximum privacy, run your own recursive resolver instead of forwarding to any upstream:

```yaml
# Add to docker-compose.yml
services:
  unbound:
    container_name: unbound
    image: mvance/unbound:latest
    volumes:
      - ./unbound:/opt/unbound/etc/unbound
    restart: unless-stopped

  pihole:
    environment:
      PIHOLE_DNS_: "unbound#53"
    depends_on:
      - unbound
```

Unbound resolves from root DNS servers directly. No third-party sees your queries.

## Split-Horizon DNS

Serve different DNS results for internal vs. external clients.

### Local DNS Records
Add custom A records via Pi-hole:
```bash
# Via web UI: Local DNS > DNS Records
# Or via file:
# /opt/pihole/etc-pihole/custom.list
192.168.1.100 nas.home.lan
192.168.1.101 proxmox.home.lan
192.168.1.102 homeassistant.home.lan
```

### CNAME Records
```bash
# /opt/pihole/etc-dnsmasq.d/05-cname.conf
cname=ha.home.lan,homeassistant.home.lan
cname=pve.home.lan,proxmox.home.lan
```

## Rate Limiting

Pi-hole v5.x+ includes rate limiting to prevent DNS amplification:

```bash
# /opt/pihole/etc-pihole/pihole-FTL.conf
RATE_LIMIT=1000/60
# Allows 1000 queries per 60 seconds per client
# Set to 0/0 to disable
```

## Cache Configuration

### Tuning DNS Cache
```bash
# /opt/pihole/etc-dnsmasq.d/05-cache.conf
cache-size=10000         # Default is 10000, increase for large networks
min-cache-ttl=300        # Minimum TTL in seconds (overrides short TTLs)
```

### Flush Cache
```bash
docker exec pihole pihole restartdns reload
# Or:
docker exec pihole pihole flush
```

## Multiple Pi-hole Instances

### Primary + Secondary
Configure clients with both Pi-hole IPs as DNS servers. Each Pi-hole operates independently.

**Sync blocklists** between instances:
```bash
# Export from primary
ssh root@pihole-primary "docker exec pihole pihole -a -t"
scp root@pihole-primary:/opt/pihole/etc-pihole/teleporter_*.tar.gz /tmp/

# Import to secondary
scp /tmp/teleporter_*.tar.gz root@pihole-secondary:/tmp/
ssh root@pihole-secondary "docker exec pihole pihole -a -t /tmp/teleporter_*.tar.gz"
```

### Separate by Network Segment
Run dedicated Pi-holes for different VLANs:
```
VLAN 10 (trusted):  192.168.10.53 - standard blocklists
VLAN 20 (IoT):      192.168.20.53 - aggressive blocking
VLAN 30 (guest):    192.168.30.53 - moderate blocking + safe search
```

## Testing DNS

### Verify Pi-hole is Working
```bash
# Should resolve (not blocked)
dig example.com @192.168.1.53

# Should be blocked (returns 0.0.0.0 or NXDOMAIN)
dig ads.google.com @192.168.1.53

# Check response time
dig example.com @192.168.1.53 | grep "Query time"

# Verify DNSSEC
dig +dnssec +short cloudflare.com @192.168.1.53
```

### Compare with Upstream
```bash
# Direct upstream (bypassing Pi-hole)
dig example.com @1.1.1.1

# Through Pi-hole
dig example.com @192.168.1.53

# Response times should be similar (Pi-hole adds <1ms for cached, ~5ms uncached)
```
