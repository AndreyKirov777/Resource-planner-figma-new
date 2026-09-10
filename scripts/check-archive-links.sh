#!/usr/bin/env bash
# scripts/check-archive-links.sh
# Every relative markdown link inside the archive still resolves.
# Fenced blocks are skipped for the same reason the fixer skips them:
# they quote other files' text, at other depths.
set -u
ARCHIVE=${1:-docs/bmad-archive}
find "$ARCHIVE" -name '*.md' | while read -r f; do
  d=$(dirname "$f")
  awk '/^[[:space:]]*```/ {fence=!fence; next} !fence' "$f" \
  | grep -oE '\]\([^)#]+' | sed 's/^](//' | while read -r t; do
      case "$t" in http*|'#'*|*'*'*|*live-verification-results*) continue;; esac
      [ -e "$d/$t" ] || echo "BROKEN $f -> $t"
    done
done
