#!/usr/bin/env bash
# Copies src/core into the edge function's shared folder and rewrites imports for Deno
# (Deno needs explicit .ts extensions). Run after any change to src/core.
set -euo pipefail
cd "$(dirname "$0")/.."
dest=supabase/functions/_shared/core
rm -rf "$dest" && mkdir -p "$dest"
for f in src/core/*.ts; do
  sed -E "s#from '(\./[A-Za-z0-9_-]+)'#from '\1.ts'#g" "$f" > "$dest/$(basename "$f")"
done
echo "Synced $(ls "$dest" | wc -l | tr -d ' ') files to $dest"
