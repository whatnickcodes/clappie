#!/usr/bin/env python3
"""Normalize Google Tasks grocery tasks into structured JSON.

Supported input formats via stdin:
- plain text lines (one task title per line)
- tab-separated lines: ``title<TAB>notes``
- JSON array of strings or task objects with ``title``/``notes`` fields

Output: JSON array with product_query, quantity, unit, raw, and notes.
"""

from __future__ import annotations

import json
import re
import sys

QUANTITY_PATTERNS = [
    re.compile(r"\bx\s*(\d+)\b", re.IGNORECASE),
    re.compile(r"\b(\d+)\s*x\b", re.IGNORECASE),
]
WEIGHT_PATTERNS = [
    re.compile(r"\b(\d+(?:[\.,]\d+)?)\s*kg\b", re.IGNORECASE),
    re.compile(r"\b(\d+(?:[\.,]\d+)?)\s*g\b", re.IGNORECASE),
]


def normalize_task(raw: str, notes: str = "") -> dict[str, object]:
    line = raw.strip()
    quantity = 1
    unit = "item"

    for pattern in QUANTITY_PATTERNS:
        match = pattern.search(line)
        if match:
            quantity = int(match.group(1))
            break

    for pattern in WEIGHT_PATTERNS:
        match = pattern.search(line)
        if match:
            quantity = float(match.group(1).replace(",", "."))
            unit = "kg" if "kg" in match.group(0).lower() else "g"
            break

    cleaned = re.sub(r"\bx\s*\d+\b", "", line, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b\d+\s*x\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -_")

    return {
        "raw": raw.rstrip("\n"),
        "product_query": cleaned or line,
        "quantity": quantity,
        "unit": unit,
        "notes": notes.strip(),
    }


def parse_tasks(blob: str) -> list[tuple[str, str]]:
    text = blob.strip()
    if not text:
        return []

    if text.startswith("["):
        data = json.loads(text)
        tasks: list[tuple[str, str]] = []
        for entry in data:
            if isinstance(entry, str):
                tasks.append((entry, ""))
                continue
            if isinstance(entry, dict):
                title = str(entry.get("title", "")).strip()
                notes = str(entry.get("notes", "")).strip()
                if title:
                    tasks.append((title, notes))
        return tasks

    tasks = []
    for raw_line in blob.splitlines():
        line = raw_line.rstrip("\n")
        if not line.strip():
            continue
        if "\t" in line:
            title, notes = line.split("\t", 1)
            tasks.append((title, notes))
        else:
            tasks.append((line, ""))
    return tasks


def main() -> int:
    tasks = parse_tasks(sys.stdin.read())
    normalized = [normalize_task(title, notes) for title, notes in tasks]
    json.dump(normalized, sys.stdout, ensure_ascii=True, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
