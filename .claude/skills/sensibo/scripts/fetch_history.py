#!/usr/bin/env python3
"""CLI tool for fetching historical Sensibo sensor measurements.

Usage:
    python3 scripts/fetch_history.py --device-id abcd1234
    python3 scripts/fetch_history.py --device-id abcd1234 --days 3 --format csv
"""

import argparse
import csv
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sensibo_client import SensiboClient, SensiboAPIError


def compute_stats(measurements, key):
    """Compute min/max/avg for a given measurement key."""
    values = [m[key] for m in measurements if key in m and m[key] is not None]
    if not values:
        return None
    return {
        "min": round(min(values), 1),
        "max": round(max(values), 1),
        "avg": round(sum(values) / len(values), 1),
        "count": len(values),
    }


def format_csv(measurements):
    """Format measurements as CSV string."""
    if not measurements:
        return "No data"
    output = io.StringIO()
    # Determine available fields from first record
    sample = measurements[0]
    fields = ["time"]
    for key in ["temperature", "humidity", "feelsLike"]:
        if key in sample:
            fields.append(key)

    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for m in measurements:
        row = {k: m.get(k, "") for k in fields}
        writer.writerow(row)
    return output.getvalue()


def format_text(measurements, stats):
    """Format measurements and stats as readable text."""
    lines = []
    lines.append(f"Records: {len(measurements)}")
    if measurements:
        lines.append(f"Period:  {measurements[0].get('time', '?')} -> "
                     f"{measurements[-1].get('time', '?')}")
    lines.append("")

    lines.append("Summary statistics:")
    for key, label in [("temperature", "Temperature (C)"),
                       ("humidity", "Humidity (%)"),
                       ("feelsLike", "Feels like (C)")]:
        s = stats.get(key)
        if s:
            lines.append(f"  {label}: min={s['min']}, max={s['max']}, "
                         f"avg={s['avg']} ({s['count']} readings)")
    lines.append("")

    lines.append("Recent readings (last 10):")
    for m in measurements[-10:]:
        t = m.get("time", "?")
        temp = m.get("temperature", "?")
        hum = m.get("humidity", "?")
        fl = m.get("feelsLike")
        line = f"  {t}  temp={temp}C  hum={hum}%"
        if fl is not None:
            line += f"  feels={fl}C"
        lines.append(line)

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Fetch historical Sensibo sensor measurements"
    )
    parser.add_argument(
        "--device-id", required=True, help="Device ID (required)"
    )
    parser.add_argument(
        "--days", type=int, default=1,
        help="Number of days of history, max 7 (default: 1)",
    )
    parser.add_argument(
        "--format", choices=["text", "json", "csv"], default="text",
        help="Output format (default: text)",
    )
    args = parser.parse_args()

    try:
        client = SensiboClient()
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        data = client.get_historical_measurements(args.device_id, days=args.days)

        # The API returns a dict with measurement arrays keyed by type
        # Merge into a flat list of records
        measurements = []
        if isinstance(data, list):
            measurements = data
        elif isinstance(data, dict):
            # API returns {"temperature": [...], "humidity": [...]}
            # Merge by index assuming aligned timestamps
            temps = data.get("temperature", [])
            humids = data.get("humidity", [])
            feels = data.get("feelsLike", [])
            max_len = max(len(temps), len(humids), len(feels) if feels else 0)
            for i in range(max_len):
                record = {}
                if i < len(temps):
                    record["time"] = temps[i].get("time")
                    record["temperature"] = temps[i].get("value")
                if i < len(humids):
                    if "time" not in record:
                        record["time"] = humids[i].get("time")
                    record["humidity"] = humids[i].get("value")
                if feels and i < len(feels):
                    record["feelsLike"] = feels[i].get("value")
                measurements.append(record)

        if not measurements:
            print("No historical data available.")
            sys.exit(0)

        if args.format == "json":
            stats = {}
            for key in ["temperature", "humidity", "feelsLike"]:
                s = compute_stats(measurements, key)
                if s:
                    stats[key] = s
            output = {"measurements": measurements, "stats": stats}
            print(json.dumps(output, indent=2, default=str))
        elif args.format == "csv":
            print(format_csv(measurements), end="")
        else:
            stats = {}
            for key in ["temperature", "humidity", "feelsLike"]:
                s = compute_stats(measurements, key)
                if s:
                    stats[key] = s
            print(format_text(measurements, stats))

    except SensiboAPIError as e:
        print(f"API error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
