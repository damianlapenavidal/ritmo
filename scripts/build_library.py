#!/usr/bin/env python3
"""Build library/exercises.json from Free Exercise DB (public domain, Unlicense).

Source: https://github.com/yuhonas/free-exercise-db, pinned to COMMIT so the data and the
image URLs never change under the app. Images are not copied into this repo; the app loads
them from raw.githubusercontent.com at the same pinned commit, as the dataset's README suggests.

Usage: python3 scripts/build_library.py            (downloads dist/exercises.json at COMMIT)
       python3 scripts/build_library.py file.json  (uses a local copy)
Standard library only.
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

COMMIT = "f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5"
SOURCE = f"https://raw.githubusercontent.com/yuhonas/free-exercise-db/{COMMIT}/dist/exercises.json"
IMAGE_BASE = f"https://raw.githubusercontent.com/yuhonas/free-exercise-db/{COMMIT}/exercises/"
OUT = Path(__file__).resolve().parent.parent / "library/exercises.json"

# Free Exercise DB muscle names -> the muscle groups Ritmo and analyze.py count sets for.
MUSCLES = {
    "quadriceps": "quads", "hamstrings": "hamstrings", "glutes": "glutes", "abductors": "glutes",
    "adductors": "adductors", "calves": "calves", "chest": "chest", "shoulders": "shoulders",
    "lats": "back", "middle back": "back", "lower back": "back", "traps": "back",
    "biceps": "arms", "triceps": "arms", "forearms": "arms", "abdominals": "core",
}


def group(muscles: list[str]) -> list[str]:
    out = []
    for m in muscles:
        g = MUSCLES.get(m)
        if g and g not in out:
            out.append(g)
    return out


def compact(e: dict) -> dict:
    return {
        "id": e["id"],
        "name": e["name"],
        "level": e.get("level"),
        "equipment": e.get("equipment"),
        "category": e.get("category"),
        "mechanic": e.get("mechanic"),
        "primary": e.get("primaryMuscles") or [],
        "secondary": e.get("secondaryMuscles") or [],
        "groups": group((e.get("primaryMuscles") or []) + (e.get("secondaryMuscles") or [])),
        "steps": e.get("instructions") or [],
        "images": e.get("images") or [],
    }


def main():
    if len(sys.argv) > 1:
        data = json.loads(Path(sys.argv[1]).read_text())
    else:
        with urllib.request.urlopen(SOURCE, timeout=60) as r:
            data = json.loads(r.read())
    items = sorted((compact(e) for e in data), key=lambda e: e["name"].lower())
    doc = {
        "source": "Free Exercise DB by yuhonas, based on wrkout/exercises.json",
        "url": "https://github.com/yuhonas/free-exercise-db",
        "commit": COMMIT,
        "license": "Unlicense (public domain)",
        "image_base": IMAGE_BASE,
        "count": len(items),
        "exercises": items,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"wrote {OUT} ({len(items)} exercises, {OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
