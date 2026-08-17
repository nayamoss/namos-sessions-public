#!/usr/bin/env bash
# Provision an isolated Convex dev deployment for the current git worktree.
#
# Why this exists (see GitHub issue #170): every worktree under .worktrees/*
# previously inherited the SAME .env.local / CONVEX_DEPLOYMENT from the repo
# root by copy-paste. `npx convex dev`/`--once` replaces the entire function
# set and reconciles the schema against whatever the pushing worktree's
# convex/ directory currently contains — so two agents on two branches,
# each verifying locally against that one shared deployment, silently erase
# each other's in-progress schema/functions. No data is lost (documents
# survive), but deployed code/indexes do not.
#
# Run this ONCE per worktree, right after creating it and before running
# `npx convex dev` or copying any .env.local into it. It creates a brand
# new dev deployment scoped to this worktree's branch name, selects it
# (writing CONVEX_DEPLOYMENT into this worktree's own .env.local), and
# pushes the current convex/ schema and functions to it so it's usable
# immediately.
#
# Usage: from inside the worktree directory, run:
#   ./scripts/setup-worktree-convex.sh
#
# Safe to re-run: if this worktree already has its own non-shared deployment
# selected, it exits without creating a duplicate.

set -euo pipefail

if [ ! -f "convex.json" ] && [ ! -d "convex" ]; then
  echo "error: run this from the repo/worktree root (no convex/ directory found here)." >&2
  exit 1
fi

# Refuse to run against the shared root checkout — this script is for worktrees only.
git_common_dir="$(git rev-parse --git-common-dir 2>/dev/null || true)"
git_dir="$(git rev-parse --git-dir 2>/dev/null || true)"
if [ "$git_common_dir" = "$git_dir" ]; then
  echo "error: this looks like the main checkout, not a worktree." >&2
  echo "Do not provision a throwaway deployment for the shared root — only for" >&2
  echo "worktrees under .worktrees/*, where isolation actually matters." >&2
  exit 1
fi

branch="$(git branch --show-current)"
if [ -z "$branch" ]; then
  echo "error: could not determine current branch (detached HEAD?)." >&2
  exit 1
fi

# Convex deployment references must be simple slugs.
slug="$(echo "$branch" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')"
ref="dev/$slug"

if [ -f ".env.local" ] && grep -q "^CONVEX_DEPLOYMENT=" .env.local 2>/dev/null; then
  current="$(grep "^CONVEX_DEPLOYMENT=" .env.local | head -1)"
  if echo "$current" | grep -q "$slug"; then
    echo "Already provisioned: $current"
    exit 0
  fi
  echo "warning: .env.local already has a CONVEX_DEPLOYMENT that does not match this branch:"
  echo "  $current"
  echo "Overwriting it with a fresh isolated deployment for '$ref'."
fi

echo "Creating isolated dev deployment '$ref' for branch '$branch'..."
npx convex deployment create "$ref" --type dev --select

echo "Pushing current schema and functions to the new deployment..."
npx convex dev --once

echo ""
echo "Done. This worktree now has its own Convex deployment — safe to run"
echo "'npx convex dev' here without affecting any other worktree."
