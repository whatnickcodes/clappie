---
name: sensibo
description: >
  Provides knowledge of Sensibo smart AC controllers, their REST API,
  and Home Assistant integration. Use when querying, configuring, or
  automating Sensibo devices, replicating Climate React with HA
  automations, or troubleshooting Sensibo issues.
allowed-tools: Read, Grep, Bash(python3 *)
---

# Sensibo Smart AC Controller

## Overview

Sensibo Air is a smart AC controller that connects any IR-controlled air conditioner to WiFi, enabling remote control, scheduling, and Climate React (automatic temperature/humidity-based AC control). This skill covers the Sensibo REST API v2, Home Assistant integration, and replicating Climate React logic as HA automations for local, reliable climate control.

## Quick Reference

### API Authentication

- **Base URL**: `https://home.sensibo.com/api/v2`
- **Auth**: Query parameter `?apiKey=YOUR_KEY`
- **Get key**: <https://home.sensibo.com/me/api>
- **Env var**: `SENSIBO_API_KEY`

### Key API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/users/me/pods?fields=*` | GET | List all devices |
| `/pods/{id}?fields=*` | GET | Get device details |
| `/pods/{id}/acStates` | POST | Set full AC state |
| `/pods/{id}/acStates/{prop}` | PATCH | Set single AC property |
| `/pods/{id}?fields=smartMode` | GET | Get Climate React config |
| `/pods/{id}/smartmode` | PUT | Set Climate React config |
| `/pods/{id}/historicalMeasurements?days=N` | GET | Historical sensor data |
| `/pods/{id}/timer` | GET/PUT/DELETE | Timer management |

### HA Entities Summary

| Entity | Description |
|--------|-------------|
| `climate.{name}` | Primary AC control |
| `sensor.{name}_temperature` | Room temperature |
| `sensor.{name}_humidity` | Room humidity |
| `switch.{name}_climate_react` | Climate React on/off |
| `number.{name}_climate_react_low` | Low threshold |
| `number.{name}_climate_react_high` | High threshold |
| `binary_sensor.{name}_filter_clean` | Filter status |

**HA polling interval**: 60 seconds. **Mode mapping**: Sensibo `fan` = HA `fan_only`; Sensibo `auto` = HA `heat_cool`.

## Workflows

### Query Device State

1. Set `SENSIBO_API_KEY` env var
2. Run: `python3 scripts/fetch_device_state.py [--device-id ID] [--format json|text]`
3. Output: device info, sensor readings, AC state, Climate React config

### Replicate Climate React in HA

This is the primary use case. Converts a Sensibo Climate React configuration into Home Assistant automations.

1. Fetch current config: `python3 scripts/fetch_device_state.py --device-id ID --format json`
2. Generate automations:
   ```bash
   python3 scripts/generate_ha_automation.py \
     --device-id ID \
     --climate-entity climate.bedroom \
     --hysteresis 5 \
     --mode two-automations
   ```
3. Review the generated YAML -- verify thresholds, modes, temperatures
4. Add automations to HA (paste into automations.yaml or import via UI)
5. Test: check automation traces in HA
6. Disable native Climate React:
   ```yaml
   action: switch.turn_off
   target:
     entity_id: switch.bedroom_climate_react
   ```
7. Monitor for 24-48 hours

See `references/climate_react_replication.md` for templates, advanced patterns, and migration checklist.

### Fetch Historical Data

1. Run: `python3 scripts/fetch_history.py --device-id ID --days 3 --format csv`
2. Output: time-series data + summary statistics (min/max/avg)

### Direct AC Control

Use `sensibo_client.py` in Python scripts:

```python
from sensibo_client import SensiboClient
client = SensiboClient()
client.set_ac_state("deviceId", {
    "on": True, "mode": "cool",
    "targetTemperature": 24, "fanLevel": "auto"
})
```

Or set a single property:

```python
client.set_ac_state_property("deviceId", "targetTemperature", 22)
```

## Climate React Translation Rules

| Climate React | HA Automation |
|--------------|---------------|
| `type: temperature` | Trigger on `sensor.{name}_temperature` |
| `type: humidity` | Trigger on `sensor.{name}_humidity` |
| `type: feelsLike` | Trigger on template sensor (needs heat index formula) |
| `highTemperatureThreshold: N` | `trigger: numeric_state, above: N` |
| `lowTemperatureThreshold: N` | `trigger: numeric_state, below: N` |
| `highTemperatureState: {on, mode, temp, fan}` | `climate.set_temperature` + `climate.set_fan_mode` |
| `lowTemperatureState: {on: false}` | `climate.turn_off` |
| Dead zone (between thresholds) | No trigger = no action |
| `enabled: true/false` | Automation toggle or `switch.{name}_climate_react` |

Full mapping details and YAML templates: `references/climate_react_replication.md`

## Critical Rules

1. **Never hardcode API keys** in scripts or YAML. Always use `SENSIBO_API_KEY` env var.
2. **Confirm device ID** before any write operation. Device IDs are case-sensitive 8-char strings.
3. **Always use hysteresis** (`for:` duration >= 5 min) in HA automations to prevent rapid toggling.
4. **Disable native Climate React** before enabling HA automations that replicate it. Running both simultaneously causes conflicts and rapid AC cycling.
5. **Mode name differences**: Sensibo API uses `fan` and `auto`; HA uses `fan_only` and `heat_cool`. Translate when building HA service calls.
6. **60-second polling delay**: HA entities may lag behind API changes by up to 60 seconds.
7. **Cloud dependency**: Both the API and HA integration require Sensibo cloud. Native Climate React runs on-device and works offline.
8. **macOS requires a .venv for Python**: Always create and activate a virtual environment before running scripts on macOS.

## Bundled Resources

### Scripts (`scripts/`)

| Script | Purpose |
|--------|---------|
| `sensibo_client.py` | Reusable API client library |
| `fetch_device_state.py` | Query device state + Climate React config |
| `fetch_history.py` | Historical sensor measurements |
| `generate_ha_automation.py` | Climate React -> HA automation YAML |

### References (`references/`)

| Document | Content |
|----------|---------|
| `api_endpoints.md` | Full Sensibo API v2 reference |
| `ha_integration_entities.md` | HA entity/service reference |
| `climate_react_replication.md` | Translation guide with YAML templates |
| `troubleshooting.md` | Common issues and solutions |
