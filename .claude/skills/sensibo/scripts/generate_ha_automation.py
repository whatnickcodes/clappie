#!/usr/bin/env python3
"""Generate Home Assistant automations that replicate Sensibo Climate React.

Reads Climate React configuration from the Sensibo API (or a JSON file)
and outputs HA automation YAML that replicates the same behavior using
numeric_state triggers and climate service calls.

Usage:
    # From API
    python3 scripts/generate_ha_automation.py \
        --device-id abcd1234 \
        --climate-entity climate.bedroom_ac

    # From file
    python3 scripts/generate_ha_automation.py \
        --input-file climate_react.json \
        --climate-entity climate.bedroom_ac

    # With options
    python3 scripts/generate_ha_automation.py \
        --device-id abcd1234 \
        --climate-entity climate.bedroom_ac \
        --sensor-entity sensor.bedroom_temperature \
        --hysteresis 5 \
        --mode two-automations
"""

import argparse
import json
import sys
from pathlib import Path

try:
    import yaml

    HAS_YAML = True
except ImportError:
    HAS_YAML = False

sys.path.insert(0, str(Path(__file__).parent))


# ── YAML output helpers ──────────────────────────────────────────

def yaml_dump(data):
    """Dump data as YAML string."""
    if HAS_YAML:
        return yaml.dump(data, default_flow_style=False, sort_keys=False, allow_unicode=True)
    # Fallback: manual YAML formatting
    return _manual_yaml_dump(data, indent=0)


def _manual_yaml_dump(obj, indent=0):
    """Simple YAML serializer for when PyYAML is not installed."""
    prefix = "  " * indent
    lines = []

    if isinstance(obj, dict):
        for key, value in obj.items():
            if isinstance(value, (dict, list)):
                lines.append(f"{prefix}{key}:")
                lines.append(_manual_yaml_dump(value, indent + 1))
            elif isinstance(value, bool):
                lines.append(f"{prefix}{key}: {'true' if value else 'false'}")
            elif isinstance(value, str) and ("{" in value or ":" in value or "#" in value):
                lines.append(f'{prefix}{key}: "{value}"')
            elif value is None:
                lines.append(f"{prefix}{key}:")
            else:
                lines.append(f"{prefix}{key}: {value}")
    elif isinstance(obj, list):
        for item in obj:
            if isinstance(item, dict):
                first = True
                for key, value in item.items():
                    if first:
                        lines.append(f"{prefix}- {key}:")
                        first = False
                    else:
                        lines.append(f"{prefix}  {key}:")
                    if isinstance(value, (dict, list)):
                        lines.append(_manual_yaml_dump(value, indent + 2))
                    elif isinstance(value, bool):
                        # Re-append with value on same line
                        lines[-1] = f"{lines[-1]} {'true' if value else 'false'}"
                    elif value is None:
                        pass
                    else:
                        lines[-1] = f"{lines[-1]} {value}"
            else:
                lines.append(f"{prefix}- {obj}")
    else:
        lines.append(f"{prefix}{obj}")

    return "\n".join(lines)


# ── Climate React -> HA translation ──────────────────────────────

SENSOR_TYPE_MAP = {
    "temperature": "temperature",
    "humidity": "humidity",
    "feelsLike": "feels_like_temperature",
}

DEFAULT_SENSOR_ENTITY_PATTERNS = {
    "temperature": "sensor.{device_name}_temperature",
    "humidity": "sensor.{device_name}_humidity",
    "feelsLike": "sensor.{device_name}_feels_like",
}


def ac_state_to_ha_action(ac_state, climate_entity):
    """Convert a Sensibo AC state dict to an HA service call action."""
    if not ac_state.get("on", True):
        return {
            "action": "climate.turn_off",
            "target": {"entity_id": climate_entity},
        }

    service_data = {}
    mode = ac_state.get("mode")
    if mode:
        # Translate Sensibo mode names to HA hvac_mode names
        sensibo_to_ha_mode = {
            "fan": "fan_only",
            "auto": "heat_cool",
        }
        ha_mode = sensibo_to_ha_mode.get(mode.lower(), mode.lower())
        service_data["hvac_mode"] = ha_mode

    temp = ac_state.get("targetTemperature")
    if temp is not None:
        service_data["temperature"] = temp

    action = {
        "action": "climate.set_temperature",
        "target": {"entity_id": climate_entity},
        "data": service_data,
    }

    # Additional service calls for fan/swing
    actions = [action]

    fan = ac_state.get("fanLevel")
    if fan:
        actions.append({
            "action": "climate.set_fan_mode",
            "target": {"entity_id": climate_entity},
            "data": {"fan_mode": fan.lower()},
        })

    swing = ac_state.get("swing")
    if swing:
        actions.append({
            "action": "climate.set_swing_mode",
            "target": {"entity_id": climate_entity},
            "data": {"swing_mode": swing.lower()},
        })

    return actions if len(actions) > 1 else actions[0]


def build_two_automations(config, climate_entity, sensor_entity, hysteresis_minutes):
    """Build two separate automations: one for above-high, one for below-low."""
    cr_type = config.get("type", "temperature")
    low_thresh = config.get("lowTemperatureThreshold")
    high_thresh = config.get("highTemperatureThreshold")
    low_state = config.get("lowTemperatureState", {})
    high_state = config.get("highTemperatureState", {})

    device_name = config.get("deviceUid", "sensibo")

    high_action = ac_state_to_ha_action(high_state, climate_entity)
    low_action = ac_state_to_ha_action(low_state, climate_entity)

    automations = []

    # Above high threshold automation
    above = {
        "alias": f"Climate React - {device_name} - Above {high_thresh}",
        "description": (
            f"Replicate Sensibo Climate React: when {cr_type} rises above "
            f"{high_thresh}, activate cooling/high state."
        ),
        "triggers": [
            {
                "trigger": "numeric_state",
                "entity_id": sensor_entity,
                "above": high_thresh,
                "for": {"minutes": hysteresis_minutes},
            }
        ],
        "conditions": [],
        "actions": high_action if isinstance(high_action, list) else [high_action],
        "mode": "single",
    }
    automations.append(above)

    # Below low threshold automation
    below = {
        "alias": f"Climate React - {device_name} - Below {low_thresh}",
        "description": (
            f"Replicate Sensibo Climate React: when {cr_type} drops below "
            f"{low_thresh}, activate heating/low state."
        ),
        "triggers": [
            {
                "trigger": "numeric_state",
                "entity_id": sensor_entity,
                "below": low_thresh,
                "for": {"minutes": hysteresis_minutes},
            }
        ],
        "conditions": [],
        "actions": low_action if isinstance(low_action, list) else [low_action],
        "mode": "single",
    }
    automations.append(below)

    return automations


def build_single_automation(config, climate_entity, sensor_entity, hysteresis_minutes):
    """Build a single automation with choose actions for above/below."""
    cr_type = config.get("type", "temperature")
    low_thresh = config.get("lowTemperatureThreshold")
    high_thresh = config.get("highTemperatureThreshold")
    low_state = config.get("lowTemperatureState", {})
    high_state = config.get("highTemperatureState", {})

    device_name = config.get("deviceUid", "sensibo")

    high_action = ac_state_to_ha_action(high_state, climate_entity)
    low_action = ac_state_to_ha_action(low_state, climate_entity)

    automation = {
        "alias": f"Climate React - {device_name}",
        "description": (
            f"Replicate Sensibo Climate React for {device_name}. "
            f"Monitors {cr_type} and reacts at thresholds "
            f"{low_thresh}/{high_thresh}."
        ),
        "triggers": [
            {
                "trigger": "numeric_state",
                "entity_id": sensor_entity,
                "above": high_thresh,
                "for": {"minutes": hysteresis_minutes},
            },
            {
                "trigger": "numeric_state",
                "entity_id": sensor_entity,
                "below": low_thresh,
                "for": {"minutes": hysteresis_minutes},
            },
        ],
        "conditions": [],
        "actions": [
            {
                "choose": [
                    {
                        "conditions": [
                            {
                                "condition": "numeric_state",
                                "entity_id": sensor_entity,
                                "above": high_thresh,
                            }
                        ],
                        "sequence": high_action if isinstance(high_action, list) else [high_action],
                    },
                    {
                        "conditions": [
                            {
                                "condition": "numeric_state",
                                "entity_id": sensor_entity,
                                "below": low_thresh,
                            }
                        ],
                        "sequence": low_action if isinstance(low_action, list) else [low_action],
                    },
                ]
            }
        ],
        "mode": "single",
    }

    return [automation]


def build_feels_like_template_sensor():
    """Generate a template sensor YAML for feels-like (heat index) calculation."""
    return {
        "template": [
            {
                "sensor": [
                    {
                        "name": "Sensibo Feels Like Temperature",
                        "unique_id": "sensibo_feels_like_temp",
                        "unit_of_measurement": "C",
                        "device_class": "temperature",
                        "state_class": "measurement",
                        "state": (
                            "{{ ( states('sensor.sensibo_temperature') | float * 1.8 + 32 "
                            "- 0.55 * (1 - states('sensor.sensibo_humidity') | float / 100) "
                            "* (states('sensor.sensibo_temperature') | float * 1.8 + 32 - 58) "
                            "- 32) / 1.8 | round(1) }}"
                        ),
                    }
                ]
            }
        ]
    }


# ── Main ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Generate HA automations from Sensibo Climate React config"
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--device-id", help="Fetch Climate React config from API")
    source.add_argument("--input-file", help="Read Climate React config from JSON file")

    parser.add_argument(
        "--climate-entity", required=True,
        help="HA climate entity ID (e.g. climate.bedroom_ac)",
    )
    parser.add_argument(
        "--sensor-entity",
        help="Override the trigger sensor entity ID",
    )
    parser.add_argument(
        "--hysteresis", type=int, default=5,
        help="Minutes for trigger 'for' duration (default: 5)",
    )
    parser.add_argument(
        "--mode", choices=["two-automations", "single-choose"],
        default="two-automations",
        help="Output style (default: two-automations)",
    )
    args = parser.parse_args()

    # Load Climate React config
    if args.device_id:
        try:
            from sensibo_client import SensiboClient
            client = SensiboClient()
            config = client.get_climate_react(args.device_id)
        except Exception as e:
            print(f"Error fetching Climate React config: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        try:
            with open(args.input_file) as f:
                config = json.load(f)
        except (IOError, json.JSONDecodeError) as e:
            print(f"Error reading input file: {e}", file=sys.stderr)
            sys.exit(1)

    # Validate config
    if not config:
        print("Error: Climate React is not configured on this device.", file=sys.stderr)
        sys.exit(1)

    cr_type = config.get("type", "temperature")
    if cr_type not in SENSOR_TYPE_MAP:
        print(f"Warning: Unknown Climate React type '{cr_type}', defaulting to temperature.",
              file=sys.stderr)

    # Determine sensor entity
    if args.sensor_entity:
        sensor_entity = args.sensor_entity
    else:
        # Derive from climate entity name
        name = args.climate_entity.replace("climate.", "")
        sensor_suffix = SENSOR_TYPE_MAP.get(cr_type, "temperature")
        sensor_entity = f"sensor.{name}_{sensor_suffix}"

    # Inject deviceUid for automation naming
    if "deviceUid" not in config and args.device_id:
        config["deviceUid"] = args.device_id

    # Build automations
    if args.mode == "two-automations":
        automations = build_two_automations(
            config, args.climate_entity, sensor_entity, args.hysteresis
        )
    else:
        automations = build_single_automation(
            config, args.climate_entity, sensor_entity, args.hysteresis
        )

    # Output
    output_parts = []

    if cr_type == "feelsLike":
        output_parts.append("# Template sensor for feels-like temperature")
        output_parts.append("# Add this to your configuration.yaml or a template package")
        output_parts.append(yaml_dump(build_feels_like_template_sensor()))
        output_parts.append("")
        output_parts.append("# ---")
        output_parts.append("")

    output_parts.append("# Home Assistant automations replicating Sensibo Climate React")
    output_parts.append(f"# Source: device {config.get('deviceUid', 'unknown')}")
    output_parts.append(f"# Type: {cr_type}, Thresholds: "
                        f"{config.get('lowTemperatureThreshold')} / "
                        f"{config.get('highTemperatureThreshold')}")
    output_parts.append(f"# Mode: {args.mode}, Hysteresis: {args.hysteresis} min")
    output_parts.append("")
    output_parts.append(yaml_dump(automations))

    print("\n".join(output_parts))

    # Reminder
    print("# IMPORTANT: Disable native Climate React on the Sensibo device",
          file=sys.stderr)
    print("# to avoid conflicts with these HA automations.", file=sys.stderr)


if __name__ == "__main__":
    main()
