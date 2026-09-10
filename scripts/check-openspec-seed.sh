#!/usr/bin/env bash
# scripts/check-openspec-seed.sh
set -e
ARCHIVE=${1:-docs/bmad-archive}
for s in spec-resource-planner spec-roadmap; do
  for c in $(grep -oE 'CAP-[0-9]+' "$ARCHIVE/specs/$s/SPEC.md" | sort -u); do
    grep -rq "was $s $c)" openspec/specs || { echo "MISSING $s $c"; exit 1; }
  done
done
openspec validate --specs --strict
echo "preservation OK"
