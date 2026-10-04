#!/usr/bin/env bash
#
# Produce a complete Docmost source tree in OUT_DIR (default: ./build):
#
#   1. shallow-clone upstream docmost/docmost at the tag pinned in UPSTREAM_VERSION
#      (no submodules: apps/server/src/ee is private and the server tolerates its absence)
#   2. copy the overlay from extensions/ on top of it
#   3. apply patches/*.patch, failing loudly if any patch does not apply cleanly
#
# Usage:
#   scripts/build-tree.sh [OUT_DIR]
#
# Environment overrides:
#   UPSTREAM_VERSION   git tag to build from (default: contents of ./UPSTREAM_VERSION)
#   UPSTREAM_REPO      git URL (default: https://github.com/docmost/docmost.git)
#   SKIP_PATCHES=1     clone + overlay only (useful when re-rolling patches after a bump)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT/build}"
UPSTREAM_REPO="${UPSTREAM_REPO:-https://github.com/docmost/docmost.git}"
UPSTREAM_VERSION="${UPSTREAM_VERSION:-}"
if [ -z "$UPSTREAM_VERSION" ]; then
  UPSTREAM_VERSION="$(tr -d '[:space:]' < "$ROOT/UPSTREAM_VERSION")"
fi
MARKER=".docmost-extensions-build"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

[ -n "$UPSTREAM_VERSION" ] || fail "UPSTREAM_VERSION is empty"
command -v git >/dev/null || fail "git is required"

# --- 0. reset OUT_DIR (only if we created it) --------------------------------
if [ -e "$OUT_DIR" ]; then
  if [ -f "$OUT_DIR/$MARKER" ] || [ -z "$(ls -A "$OUT_DIR")" ]; then
    log "Removing previous build tree at $OUT_DIR"
    rm -rf "$OUT_DIR"
  else
    fail "$OUT_DIR exists and was not created by this script; refusing to delete it"
  fi
fi

# --- 1. clone upstream at the pinned tag -------------------------------------
log "Cloning $UPSTREAM_REPO at $UPSTREAM_VERSION (shallow, no submodules)"
git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$UPSTREAM_VERSION" --no-recurse-submodules \
  "$UPSTREAM_REPO" "$OUT_DIR"
touch "$OUT_DIR/$MARKER"

actual_tag="$(git -C "$OUT_DIR" describe --tags --exact-match 2>/dev/null || true)"
[ "$actual_tag" = "$UPSTREAM_VERSION" ] \
  || fail "checked out '$actual_tag' but expected tag '$UPSTREAM_VERSION'"
log "Upstream commit: $(git -C "$OUT_DIR" rev-parse --short HEAD) ($actual_tag)"

# --- 2. copy the overlay ------------------------------------------------------
log "Copying overlay from extensions/"
overlay_count=0
while IFS= read -r -d '' rel; do
  rel="${rel#./}"
  if [ -e "$OUT_DIR/$rel" ]; then
    fail "overlay file '$rel' already exists upstream. Overlay files must be new files; edit existing upstream files with a patch in patches/ instead."
  fi
  mkdir -p "$OUT_DIR/$(dirname "$rel")"
  cp "$ROOT/extensions/$rel" "$OUT_DIR/$rel"
  overlay_count=$((overlay_count + 1))
done < <(cd "$ROOT/extensions" && find . -type f -not -name '.DS_Store' -print0)
log "Copied $overlay_count overlay file(s)"

# --- 3. apply patches ---------------------------------------------------------
if [ "${SKIP_PATCHES:-0}" = "1" ]; then
  log "SKIP_PATCHES=1: not applying patches"
else
  shopt -s nullglob
  patches=("$ROOT"/patches/*.patch)
  shopt -u nullglob
  if [ "${#patches[@]}" -eq 0 ]; then
    log "No patches to apply"
  else
    # Check every patch first so a failure leaves nothing half-applied.
    for p in "${patches[@]}"; do
      if ! git -C "$OUT_DIR" apply --check --whitespace=nowarn "$p"; then
        fail "patch '$(basename "$p")' does not apply to $UPSTREAM_VERSION. Re-roll it (see README: 'Bumping the upstream version')."
      fi
    done
    for p in "${patches[@]}"; do
      log "Applying $(basename "$p")"
      git -C "$OUT_DIR" apply --whitespace=nowarn "$p"
    done
  fi
fi

log "Changes relative to upstream $UPSTREAM_VERSION:"
git -C "$OUT_DIR" -c core.quotepath=off status --short -- . ":!$MARKER"
log "Source tree ready at $OUT_DIR"
