#!/bin/sh
# Runs every suite. Uses lua if there is one, and falls back to lupa otherwise.
set -e
cd "$(dirname "$0")/.."

if command -v lua5.4 >/dev/null 2>&1; then RUN="lua5.4"
elif command -v lua >/dev/null 2>&1;   then RUN="lua"
else RUN="python3 tools/run_lua.py"
fi

fail=0
for suite in tests/test_theory.lua tests/test_catalogue.lua tests/test_midi.lua \
             tests/test_place.lua tests/test_ui.lua; do
  [ -f "$suite" ] || continue
  printf '%-26s ' "$(basename "$suite")"
  if ! $RUN "$suite"; then fail=1; fi
done

printf '%-26s ' "docs/CATALOGUE.md"
tmp="${TMPDIR:-/tmp}/midi_catalogue_check.md"
$RUN tools/catalogue_md.lua > "$tmp"
if cmp -s "$tmp" docs/CATALOGUE.md; then
  echo "up to date"
else
  echo "STALE - run: $RUN tools/catalogue_md.lua > docs/CATALOGUE.md"
  fail=1
fi

exit $fail
