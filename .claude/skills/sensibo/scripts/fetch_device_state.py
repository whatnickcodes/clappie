#!/usr/bin/env python3
"""CLI tool to query Sensibo device state and Climate React configuration.

Usage:
    python3 scripts/fetch_device_state.py
    python3 scripts/fetch_device_state.py --device-id abcd1234
    python3 scripts/fetch_device_state.py --format json
"""

import argparse
import json
import sys
from pathlib import Path

# Allow importing sensibo_client from the same directory
sys.path.insert(0, str(Path(__file__).parent))
from sensibo_client import SensiboClient, SensiboAPIError


def format_ac_state(state):
    """Format AC state dict as readable text."""
    if not state:
        return "  (no AC state available)"
    lines = []
    lines.append(f"  Power:       {'ON' if state.get('on') else 'OFF'}")
    lines.append(f"  Mode:        {state.get('mode', 'N/A')}")
    lines.append(f"  Temperature: {state.get('targetTemperature', 'N/A')}"
                 f"{state.get('temperatureUnit', '')}")
    lines.append(f"  Fan level:   {state.get('fanLevel', 'N/A')}")
    lines.append(f"  Swing:       {state.get('swing', 'N/A')}")
    if state.get("horizontalSwing"):
        lines.append(f"  H. Swing:    {state['horizontalSwing']}")
    if state.get("light") is not None:
        lines.append(f"  Light:       {'ON' if state['light'] else 'OFF'}")
    return "\n".join(lines)


def format_climate_react(sm):
    """Format Climate React (smartMode) config as readable text."""
    if not sm:
        return "  (not configured)"
    lines = []
    lines.append(f"  Enabled:     {sm.get('enabled', False)}")
    lines.append(f"  Type:        {sm.get('type', 'N/A')}")
    low = sm.get("lowTemperatureThreshold")
    high = sm.get("highTemperatureThreshold")
    lines.append(f"  Low thresh:  {low}")
    lines.append(f"  High thresh: {high}")
    low_state = sm.get("lowTemperatureState", {})
    high_state = sm.get("highTemperatureState", {})
    lines.append(f"  Below low -> mode={low_state.get('mode')}, "
                 f"temp={low_state.get('targetTemperature')}, "
                 f"on={low_state.get('on')}")
    lines.append(f"  Above high-> mode={high_state.get('mode')}, "
                 f"temp={high_state.get('targetTemperature')}, "
                 f"on={high_state.get('on')}")
    return "\n".join(lines)


def print_device_text(device, climate_react):
    """Print device info in human-readable text format."""
    room = device.get("room", {})
    measurements = device.get("measurements", {})

    print(f"Device: {room.get('name', 'Unknown')} ({device.get('id', 'N/A')})")
    print(f"  Model:       {device.get('productModel', 'N/A')}")
    print(f"  FW version:  {device.get('firmwareVersion', 'N/A')}")
    print(f"  Connected:   {device.get('connectionStatus', {}).get('isAlive', 'N/A')}")
    print()

    print("Sensor readings:")
    print(f"  Temperature: {measurements.get('temperature', 'N/A')}C")
    print(f"  Humidity:    {measurements.get('humidity', 'N/A')}%")
    if "feelsLike" in measurements:
        print(f"  Feels like:  {measurements['feelsLike']}C")
    print()

    print("AC state:")
    print(format_ac_state(device.get("acState")))
    print()

    print("Climate React:")
    print(format_climate_react(climate_react))


def main():
    parser = argparse.ArgumentParser(
        description="Query Sensibo device state and Climate React config"
    )
    parser.add_argument(
        "--device-id",
        help="Specific device ID. If omitted, shows all devices.",
    )
    parser.add_argument(
        "--format",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text)",
    )
    args = parser.parse_args()

    try:
        client = SensiboClient()
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        if args.device_id:
            device_ids = [args.device_id]
        else:
            devices = client.get_devices(fields="id,room")
            device_ids = [d["id"] for d in devices]
            if not device_ids:
                print("No devices found on this account.")
                sys.exit(0)

        results = []
        for did in device_ids:
            device = client.get_device(did)
            climate_react = client.get_climate_react(did)
            results.append({"device": device, "climate_react": climate_react})

        if args.format == "json":
            print(json.dumps(results, indent=2, default=str))
        else:
            for i, r in enumerate(results):
                if i > 0:
                    print("\n" + "=" * 50 + "\n")
                print_device_text(r["device"], r["climate_react"])

    except SensiboAPIError as e:
        print(f"API error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
