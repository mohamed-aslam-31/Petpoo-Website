#!/usr/bin/env bash
# Runs automatically after a task agent merge, or on first project import.
set -euo pipefail

echo "[post-merge] Installing dependencies..."
pnpm install --frozen-lockfile

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[post-merge] Pushing database schema..."
  pnpm --filter @workspace/db run push
else
  echo "[post-merge] Skipping DB push — DATABASE_URL not set yet."
  echo "[post-merge] Run 'bash setup.sh' after connecting a database."
fi

echo "[post-merge] Done."
