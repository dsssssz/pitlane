#!/usr/bin/env bash
# Оценка времени/веса печати (PrusaSlicer CLI). Профили — средний «стол-качалка» (Ender/Prusa MK3), без поддержек.
set -euo pipefail
cd "$(dirname "$0")"; T=$(mktemp -d); S=../stl
one() { prusa-slicer --export-gcode --load "$2" --center 125,105 --output "$T/$1.gcode" "$S/pitlane-gps-C_$1.stl" >/dev/null
  local g t; g=$(grep -m1 '^; filament used \[g\]' "$T/$1.gcode" | sed 's/.*= //'); t=$(grep -m1 '^; estimated printing time (normal mode)' "$T/$1.gcode" | sed 's/.*= //')
  printf '  "%s": {"g": %s, "time": "%s", "profile": "%s"}' "$1" "$g" "$t" "$2"; }
{ echo "{"; one body asa-0.2.ini; echo ","; one lid asa-0.2.ini; echo ","; one lightpipe petg-clear-0.12.ini; echo; echo "}"; } > estimates.json
cat estimates.json; rm -rf "$T"
