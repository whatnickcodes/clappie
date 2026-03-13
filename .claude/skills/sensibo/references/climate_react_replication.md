# Climate React -> Home Assistant Automation Translation Guide

## Why Replicate Climate React in HA?

- **Reliability**: HA automations run locally, independent of Sensibo cloud.
- **Flexibility**: Add time-based conditions, presence detection, multiple sensors, hysteresis.
- **Integration**: Combine with other HA automations, scripts, and dashboards.
- **Control**: Full visibility into automation traces and debugging.

**Trade-off**: You lose the Sensibo app's Climate React UI. Manage via HA UI/YAML instead.

## Conceptual Mapping

| Climate React Field | HA Automation Concept |
|--------------------|-----------------------|
| `type` (temperature/humidity/feelsLike) | Sensor entity used in trigger |
| `highTemperatureThreshold` | `numeric_state` trigger with `above:` |
| `lowTemperatureThreshold` | `numeric_state` trigger with `below:` |
| `highTemperatureState` | Action sequence (climate service calls) |
| `lowTemperatureState` | Action sequence (climate service calls) |
| `enabled` | Automation enabled/disabled toggle |
| Dead zone (between thresholds) | No trigger fires = no action |

## Sensor Entity Selection

| Climate React Type | HA Sensor Entity |
|-------------------|-----------------|
| `temperature` | `sensor.{name}_temperature` |
| `humidity` | `sensor.{name}_humidity` |
| `feelsLike` | Custom template sensor (see below) or `sensor.{name}_feels_like` |

## Template 1: Two Separate Automations (Recommended)

This is the clearest approach -- one automation per threshold crossing.

### Above High Threshold (Cooling)

```yaml
alias: Climate React - Bedroom - Above 26C
description: >
  When temperature rises above 26C for 5 minutes,
  activate cooling mode.
triggers:
  - trigger: numeric_state
    entity_id: sensor.bedroom_temperature
    above: 26
    for:
      minutes: 5
conditions: []
actions:
  - action: climate.set_temperature
    target:
      entity_id: climate.bedroom
    data:
      hvac_mode: cool
      temperature: 24
  - action: climate.set_fan_mode
    target:
      entity_id: climate.bedroom
    data:
      fan_mode: auto
mode: single
```

### Below Low Threshold (Heating)

```yaml
alias: Climate React - Bedroom - Below 22C
description: >
  When temperature drops below 22C for 5 minutes,
  activate heating mode.
triggers:
  - trigger: numeric_state
    entity_id: sensor.bedroom_temperature
    below: 22
    for:
      minutes: 5
conditions: []
actions:
  - action: climate.set_temperature
    target:
      entity_id: climate.bedroom
    data:
      hvac_mode: heat
      temperature: 24
  - action: climate.set_fan_mode
    target:
      entity_id: climate.bedroom
    data:
      fan_mode: auto
mode: single
```

### Turn Off When Comfortable (Optional)

```yaml
alias: Climate React - Bedroom - Comfortable Range
description: >
  When temperature returns to comfortable range, turn off AC.
triggers:
  - trigger: numeric_state
    entity_id: sensor.bedroom_temperature
    above: 22.5
    below: 25.5
    for:
      minutes: 10
conditions: []
actions:
  - action: climate.turn_off
    target:
      entity_id: climate.bedroom
mode: single
```

## Template 2: Single Automation with Choose

Use a single automation with `choose` to keep everything in one place.

```yaml
alias: Climate React - Bedroom
description: >
  Replicate Sensibo Climate React. Monitors temperature and
  reacts at thresholds 22/26.
triggers:
  - trigger: numeric_state
    entity_id: sensor.bedroom_temperature
    above: 26
    for:
      minutes: 5
  - trigger: numeric_state
    entity_id: sensor.bedroom_temperature
    below: 22
    for:
      minutes: 5
conditions: []
actions:
  - choose:
      - conditions:
          - condition: numeric_state
            entity_id: sensor.bedroom_temperature
            above: 26
        sequence:
          - action: climate.set_temperature
            target:
              entity_id: climate.bedroom
            data:
              hvac_mode: cool
              temperature: 24
      - conditions:
          - condition: numeric_state
            entity_id: sensor.bedroom_temperature
            below: 22
        sequence:
          - action: climate.set_temperature
            target:
              entity_id: climate.bedroom
            data:
              hvac_mode: heat
              temperature: 24
mode: single
```

## Feels-Like Template Sensor

When Climate React uses `feelsLike` type, you need a template sensor because the HA integration may not expose a feels-like sensor. This uses a simplified heat index formula:

```yaml
# Add to configuration.yaml under 'template:'
template:
  - sensor:
      - name: "Bedroom Feels Like Temperature"
        unique_id: bedroom_feels_like_temp
        unit_of_measurement: "C"
        device_class: temperature
        state_class: measurement
        state: >
          {% set t = states('sensor.bedroom_temperature') | float %}
          {% set h = states('sensor.bedroom_humidity') | float %}
          {% set tf = t * 1.8 + 32 %}
          {% set hi = tf - 0.55 * (1 - h / 100) * (tf - 58) %}
          {{ ((hi - 32) / 1.8) | round(1) }}
        availability: >
          {{ states('sensor.bedroom_temperature') not in ['unknown', 'unavailable']
             and states('sensor.bedroom_humidity') not in ['unknown', 'unavailable'] }}
```

Then use `sensor.bedroom_feels_like_temperature` as the trigger entity in the automation.

## Hysteresis Best Practices

### The Problem

Without hysteresis, an oscillating sensor reading near a threshold causes rapid toggling:
- 25.9C -> 26.1C (trigger!) -> AC cools -> 25.9C -> AC stops -> 26.1C (trigger!)

### Solutions

1. **`for:` duration** (primary): Require the threshold to be exceeded for N minutes before triggering.
   ```yaml
   triggers:
     - trigger: numeric_state
       entity_id: sensor.bedroom_temperature
       above: 26
       for:
         minutes: 5
   ```

2. **Separate thresholds with gap**: Use non-overlapping thresholds with a dead zone.
   - Cool above 26, heat below 22 = 4-degree dead zone.

3. **`mode: single`**: Prevents the automation from running multiple times simultaneously.

4. **Rate limiting with `last_triggered`**:
   ```yaml
   conditions:
     - condition: template
       value_template: >
         {{ (now() - state_attr('automation.climate_react_bedroom_above_26c',
            'last_triggered')).total_seconds() > 600 }}
   ```

### Recommended Defaults

| Setting | Value | Rationale |
|---------|-------|-----------|
| `for:` duration | 5 minutes | Filters noise without excessive delay |
| Dead zone | 2-4 degrees | Prevents rapid mode switching |
| Rate limit | 10 minutes | Minimum time between triggers |

## Advanced Patterns

### Using an External Sensor

Replace the Sensibo sensor with any HA sensor:

```yaml
triggers:
  - trigger: numeric_state
    entity_id: sensor.bedroom_xiaomi_temperature  # External sensor
    above: 26
    for:
      minutes: 5
```

### Time-Based Conditions

Only run during certain hours:

```yaml
conditions:
  - condition: time
    after: "22:00:00"
    before: "08:00:00"
```

### Presence Detection

Only run when someone is home:

```yaml
conditions:
  - condition: state
    entity_id: person.marco
    state: "home"
```

### Night Mode with Different Settings

```yaml
actions:
  - choose:
      - conditions:
          - condition: time
            after: "22:00:00"
            before: "07:00:00"
        sequence:
          - action: climate.set_temperature
            target:
              entity_id: climate.bedroom
            data:
              hvac_mode: cool
              temperature: 22
          - action: climate.set_fan_mode
            target:
              entity_id: climate.bedroom
            data:
              fan_mode: quiet
    default:
      - action: climate.set_temperature
        target:
          entity_id: climate.bedroom
        data:
          hvac_mode: cool
          temperature: 24
          fan_mode: auto
```

### Multi-Room Coordination

Trigger based on one room, control multiple ACs:

```yaml
actions:
  - action: climate.set_temperature
    target:
      entity_id:
        - climate.living_room
        - climate.kitchen
    data:
      hvac_mode: cool
      temperature: 24
```

## Migration Checklist

When switching from native Climate React to HA automations:

1. **Document current Climate React config**: Run `fetch_device_state.py` to capture the current configuration.
2. **Generate HA automations**: Run `generate_ha_automation.py` to create the automation YAML.
3. **Review generated YAML**: Verify thresholds, modes, and temperatures match your intent.
4. **Add automations to HA**: Copy YAML to `automations.yaml` or create via UI.
5. **Test automations**: Verify they trigger correctly by checking automation traces.
6. **Disable native Climate React**: Use the Sensibo app or:
   ```yaml
   action: switch.turn_off
   target:
     entity_id: switch.bedroom_climate_react
   ```
   Or via API: set `enabled: false` in the smartMode config.
7. **Monitor for 24-48 hours**: Check HA logs and automation traces for issues.

**Warning**: Do NOT run both native Climate React AND HA automations simultaneously. They will conflict and cause unpredictable behavior (rapid toggling, conflicting commands).
