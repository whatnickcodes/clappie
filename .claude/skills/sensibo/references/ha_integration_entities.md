# Home Assistant Sensibo Integration - Entity & Service Reference

## Overview

The Sensibo integration connects via the Sensibo cloud API. It creates entities for each Sensibo device on the account.

- **Polling interval**: 60 seconds (cloud API)
- **Manual refresh**: Use `homeassistant.update_entity` service
- **Configuration**: Via HA UI (Integrations page), requires API key
- **HACS**: Not needed -- Sensibo is a core HA integration
- **Tip**: Create a dedicated API user (not your main user) so automation actions are distinguishable in the Sensibo app logs

## Entity Naming Convention

Entities follow the pattern: `{domain}.{device_name}_{suffix}`

The `device_name` is derived from the room name set in the Sensibo app (lowercased, spaces replaced with underscores). For example, a device named "Bedroom" creates `climate.bedroom`.

## Entity Types

### Climate Entity

**Entity ID**: `climate.{device_name}`

The primary entity. Controls AC power, mode, temperature, fan, and swing.

**Attributes:**
| Attribute | Description |
|-----------|-------------|
| `hvac_modes` | List of supported modes (off, cool, heat, dry, fan_only, heat_cool) |
| `min_temp` / `max_temp` | Temperature range |
| `target_temp_step` | Temperature increment |
| `fan_modes` | List of fan speeds |
| `swing_modes` | List of swing positions |
| `current_temperature` | Room temperature from Sensibo sensor |
| `current_humidity` | Room humidity from Sensibo sensor |
| `temperature` | Target temperature |
| `hvac_mode` | Current mode |
| `fan_mode` | Current fan speed |
| `swing_mode` | Current swing position |

**Supported Features:**
- `climate.set_temperature`
- `climate.set_hvac_mode`
- `climate.set_fan_mode`
- `climate.set_swing_mode`
- `climate.turn_on` / `climate.turn_off`

### Sensor Entities

| Entity ID | Device Class | Unit | Default |
|-----------|-------------|------|---------|
| `sensor.{name}_temperature` | temperature | C/F | Enabled |
| `sensor.{name}_humidity` | humidity | % | Enabled |
| `sensor.{name}_feels_like` | temperature | C/F | **Disabled** |
| `sensor.{name}_climate_react_type` | - | - | **Disabled** |
| `sensor.{name}_climate_react_low` | temperature | C/F | **Disabled** |
| `sensor.{name}_climate_react_high` | temperature | C/F | **Disabled** |
| `sensor.{name}_timer_time` | timestamp | - | **Disabled** |
| `sensor.{name}_filter_last_reset` | timestamp | - | Enabled |

**Note**: Climate React sensor entities and feels-like are disabled by default. Enable them manually in the HA UI (Settings > Devices > Sensibo device > entities).

### Binary Sensor Entities

| Entity ID | Device Class | Description |
|-----------|-------------|-------------|
| `binary_sensor.{name}_room_occupied` | motion | Motion-detected room occupancy |
| `binary_sensor.{name}_filter_clean` | problem | Filter needs cleaning |

### Switch Entities

| Entity ID | Description |
|-----------|-------------|
| `switch.{name}_climate_react` | Enable/disable Climate React |
| `switch.{name}_timer` | Enable/disable timer |
| `switch.{name}_pure_boost` | Enable/disable Pure Boost (Pure models only) |

**Important**: The `climate_react` switch will throw an error if Climate React has never been configured on the device. You must use `sensibo.enable_climate_react` service or the Sensibo app at least once first.

### Select Entities

| Entity ID | Description |
|-----------|-------------|
| `select.{name}_light` | AC unit light (on/off/dim, if supported) |

### Number Entities

| Entity ID | Description | Default |
|-----------|-------------|---------|
| `number.{name}_calibration_temp` | Temperature calibration (-10 to +10, step 0.1) | **Disabled** |
| `number.{name}_calibration_hum` | Humidity calibration (-10 to +10, step 0.1) | **Disabled** |

### Button Entities

| Entity ID | Description |
|-----------|-------------|
| `button.{name}_reset_filter` | Reset the filter indicator |

### Update Entities

| Entity ID | Description |
|-----------|-------------|
| `update.{name}_firmware` | Firmware update status |

## Services

### Standard Climate Services

These are built-in HA climate services that work with Sensibo:

| Service | Description |
|---------|-------------|
| `climate.set_temperature` | Set target temperature (and optionally hvac_mode) |
| `climate.set_hvac_mode` | Set mode: off, cool, heat, dry, fan_only, heat_cool |
| `climate.set_fan_mode` | Set fan speed |
| `climate.set_swing_mode` | Set swing position |
| `climate.turn_on` | Turn AC on (resumes last mode) |
| `climate.turn_off` | Turn AC off |

### Sensibo-Specific Services

| Service | Description |
|---------|-------------|
| `sensibo.enable_climate_react` | Configure and activate Climate React |
| `sensibo.full_state` | Set the complete AC state in one call |
| `sensibo.assume_state` | Sync Sensibo state without sending IR command |
| `sensibo.enable_timer` | Set a timer for future AC state change |
| `sensibo.get_device_capabilities` | Query valid values for a given HVAC mode |
| `sensibo.enable_pure_boost` | Configure Pure Boost (Pure models only) |

#### `sensibo.enable_climate_react`

**Critical**: State objects must use **Sensibo API camelCase** naming (e.g., `fanLevel`, `targetTemperature`, `temperatureUnit`), NOT Home Assistant snake_case. Use `sensibo.get_device_capabilities` to discover valid values.

```yaml
action: sensibo.enable_climate_react
target:
  entity_id: climate.bedroom
data:
  smart_type: temperature
  high_temperature_threshold: 26.0
  low_temperature_threshold: 22.0
  low_temperature_state:
    "on": false
  high_temperature_state:
    "on": true
    fanLevel: auto
    targetTemperature: 24
    mode: cool
    temperatureUnit: C
```

#### `sensibo.full_state`

```yaml
action: sensibo.full_state
target:
  entity_id: climate.bedroom
data:
  mode: cool
  target_temperature: 24
  fan_mode: auto
  swing_mode: stopped
  horizontal_swing_mode: stopped
  light: "on"
```

#### `sensibo.assume_state`

Sync Sensibo's knowledge of the device state without sending an IR command. Useful when the AC was controlled by its physical remote.

```yaml
action: sensibo.assume_state
target:
  entity_id: climate.bedroom
data:
  state: "on"
```

#### `sensibo.get_device_capabilities`

Returns available fan levels, swing modes, and temperatures for the given HVAC mode. Use before calling `full_state` or `enable_climate_react`.

```yaml
action: sensibo.get_device_capabilities
target:
  entity_id: climate.bedroom
data:
  hvac_mode: cool
```

#### `sensibo.enable_timer`

```yaml
action: sensibo.enable_timer
target:
  entity_id: climate.bedroom
data:
  minutes: 60
```

## Mode Mapping

| Sensibo Mode | HA HVAC Mode |
|-------------|--------------|
| `cool` | `cool` |
| `heat` | `heat` |
| `fan` | `fan_only` |
| `dry` | `dry` |
| `auto` | `heat_cool` |
| (AC off) | `off` |

**Note**: When mapping from HA `fan_only` back to Sensibo API, use `fan`. When mapping from HA `heat_cool`, use `auto`.

## Fan Level Mapping

Fan levels pass through directly between the Sensibo API and HA, lowercased:
`quiet`, `low`, `medium_low`, `medium`, `medium_high`, `high`, `strong`, `auto`

## Important Notes

1. **60-second polling delay**: Changes made via the Sensibo app or API may take up to 60 seconds to reflect in HA entities.
2. **Cloud dependency**: The integration requires internet connectivity. If Sensibo cloud is down, entities become unavailable.
3. **Climate React via HA**: You can control Climate React through the `switch.{name}_climate_react` entity. But for full automation control, use HA automations instead (see `climate_react_replication.md`).
4. **Disabled-by-default entities**: Climate React sensors, feels-like, calibration numbers, and timer sensors must be manually enabled in the HA UI.
5. **Climate React switch prerequisite**: The switch errors if Climate React was never configured. Use `sensibo.enable_climate_react` service or the Sensibo app first.
6. **camelCase in service calls**: The `sensibo.enable_climate_react` and `sensibo.full_state` services require Sensibo API field names (camelCase), not HA-style snake_case, for state objects.
7. **Multiple devices**: Each Sensibo device gets its own set of entities. Use the device name to distinguish them.
8. **Temperature unit**: The integration respects the HA instance's configured temperature unit, converting if needed.
