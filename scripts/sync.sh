#!/usr/bin/env bash
# Sync this local checkout with work done by a Claude Code cloud agent (or vice versa).
#
# Usage:
#   ./scripts/sync.sh              Pull the latest work from origin into your current branch
#   ./scripts/sync.sh pull         Same as above
#   ./scripts/sync.sh pull <branch>  Pull a specific branch (e.g. feat/wbs-schedule-gantt)
#   ./scripts/sync.sh push         Push your local commits so a cloud agent can pick them up
#   ./scripts/sync.sh status       Just show where local and origin stand, no changes made
#
# The script never discards work: if it finds uncommitted changes it stops and tells you
# what to do instead of stashing/resetting for you.

set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-pull}"
BRANCH="${2:-$(git branch --show-current)}"

if [ -z "$BRANCH" ]; then
  echo "Not on a branch (detached HEAD?). Pass a branch name explicitly:"
  echo "  ./scripts/sync.sh pull feat/wbs-schedule-gantt"
  exit 1
fi

require_clean_tree() {
  if [ -n "$(git status --porcelain)" ]; then
    echo "You have uncommitted changes. Commit or stash them first:"
    echo ""
    git status --short
    echo ""
    echo "  git add -A && git commit -m \"...\"   # to commit"
    echo "  git stash -u                          # or to shelve temporarily"
    exit 1
  fi
}

post_pull_hooks() {
  local before="$1" after="$2"
  local changed
  changed="$(git diff --name-only "$before" "$after")"

  if echo "$changed" | grep -qx "package.json\|package-lock.json"; then
    echo ""
    echo "package.json changed -> running npm install"
    npm install
  fi

  if echo "$changed" | grep -q '^prisma/schema\.prisma$'; then
    echo ""
    echo "prisma/schema.prisma changed -> running npx prisma generate"
    npx prisma generate
  fi

  if echo "$changed" | grep -q '^prisma/migrations/'; then
    echo ""
    echo "New Prisma migration(s) detected. Apply them to your local dev.db with:"
    echo "  npx prisma migrate deploy"
  fi
}

case "$MODE" in
  status)
    git fetch origin "$BRANCH" --quiet
    echo "Local branch:  $BRANCH"
    echo "Local HEAD:    $(git rev-parse --short HEAD)"
    echo "Origin HEAD:   $(git rev-parse --short "origin/$BRANCH")"
    ahead=$(git rev-list --count "origin/$BRANCH..HEAD")
    behind=$(git rev-list --count "HEAD..origin/$BRANCH")
    echo "Ahead/behind:  $ahead ahead, $behind behind origin/$BRANCH"
    [ -n "$(git status --porcelain)" ] && echo "Working tree:  DIRTY (uncommitted changes present)" || echo "Working tree:  clean"
    ;;

  pull)
    require_clean_tree
    echo "Fetching origin/$BRANCH ..."
    git fetch origin "$BRANCH"

    if ! git show-ref --verify --quiet "refs/heads/$BRANCH"; then
      echo "Local branch '$BRANCH' doesn't exist yet, creating it from origin/$BRANCH"
      git checkout -b "$BRANCH" "origin/$BRANCH"
      exit 0
    fi

    git checkout "$BRANCH"
    BEFORE="$(git rev-parse HEAD)"

    if git merge-base --is-ancestor HEAD "origin/$BRANCH"; then
      echo "Fast-forwarding $BRANCH to origin/$BRANCH ..."
      git merge --ff-only "origin/$BRANCH"
    elif git merge-base --is-ancestor "origin/$BRANCH" HEAD; then
      echo "Local $BRANCH is already ahead of origin/$BRANCH -- nothing to pull."
      echo "Run './scripts/sync.sh push' to publish your commits."
      exit 0
    else
      echo "Local and origin/$BRANCH have diverged. Rebasing local commits on top of origin/$BRANCH ..."
      git rebase "origin/$BRANCH" || {
        echo ""
        echo "Rebase hit a conflict. Resolve it, then run:"
        echo "  git rebase --continue"
        echo "or abort with:"
        echo "  git rebase --abort"
        exit 1
      }
    fi

    AFTER="$(git rev-parse HEAD)"
    if [ "$BEFORE" = "$AFTER" ]; then
      echo "Already up to date."
    else
      echo ""
      echo "Pulled $(git rev-list --count "$BEFORE..$AFTER") new commit(s):"
      git log --oneline "$BEFORE..$AFTER"
      post_pull_hooks "$BEFORE" "$AFTER"
    fi
    ;;

  push)
    require_clean_tree
    git fetch origin "$BRANCH" --quiet
    ahead=$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo 0)
    behind=$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo 0)

    if [ "$behind" -gt 0 ]; then
      echo "origin/$BRANCH has $behind commit(s) you don't have locally."
      echo "Run './scripts/sync.sh pull' first, then push."
      exit 1
    fi

    if [ "$ahead" -eq 0 ]; then
      echo "Nothing to push -- local $BRANCH matches origin/$BRANCH."
      exit 0
    fi

    echo "Pushing $ahead local commit(s) on $BRANCH to origin ..."
    git log --oneline "origin/$BRANCH..HEAD"
    echo ""
    git push -u origin "$BRANCH"
    echo ""
    echo "Pushed. A cloud agent resuming this branch will now see your changes."
    ;;

  *)
    echo "Unknown mode: $MODE"
    echo "Usage: ./scripts/sync.sh [pull|push|status] [branch]"
    exit 1
    ;;
esac
