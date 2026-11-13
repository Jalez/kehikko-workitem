#!/usr/bin/env bash
#
# What a host runs to start this module: no arguments, foreground, `exec`.
#
#   - No arguments, because a registration names a directory and this script,
#     never a command line a host would hand to a shell.
#   - No port here. It is PREFERRED_PORT in manifest.ts, and `serves()` in
#     vite.config.ts acts on it: takes it when free, honours $PORT from a host,
#     and moves (rewriting the registration) when something else has it.
#   - `exec` in the foreground, so the pid a host holds is the one that stops it.
#
# It does not register. That is `bun run register`, a person's decision.
set -euo pipefail
cd "$(dirname "$0")"

# Install when nothing is installed, AND whenever bun.lock or package.json is
# newer than the last install here — the same rule as the host's own run.sh. A
# pull that moves the protocol pin leaves the old package in node_modules, and
# a page that imports a name the old package does not have draws nothing.
# `--frozen-lockfile`, so a start installs exactly what bun.lock says and never
# rewrites it behind somebody's back. The stamp is written only after an
# install that succeeded.
INSTALLED=node_modules/.kehikot-installed
VITE_FORCE=
if [ ! -d node_modules ] || [ ! -f "$INSTALLED" ] || [ bun.lock -nt "$INSTALLED" ] || [ package.json -nt "$INSTALLED" ]; then
  echo "installing…" >&2
  if [ -f bun.lock ]; then
    bun install --frozen-lockfile >&2 || { echo "bun install --frozen-lockfile failed: bun.lock does not match package.json. Run \`bun install\` and commit bun.lock." >&2; exit 1; }
  else
    bun install >&2
  fi
  touch "$INSTALLED"
  # Rebuild Vite's pre-bundle rather than trust one made from the old packages.
  VITE_FORCE=--force
fi

# The built page when dist/ is a build of exactly this commit (`bun run build`):
# one small Bun process and a static page. Vite otherwise, for a checkout being
# worked on.
BUILT=
if [ -f dist/.kehikot-built ] && [ -f dist/index.html ]; then
  read -r BUILT < dist/.kehikot-built || true
fi
if [ -n "$BUILT" ] && [ "$BUILT" = "$(git rev-parse HEAD 2>/dev/null)" ]; then
  exec bun run serve.ts
fi
if [ -n "$BUILT" ]; then
  echo "workitem: dist/ is a build of ${BUILT:0:7}, not of this checkout, so Vite serves the page. \`bun run build\` would make it current." >&2
fi

exec bunx vite $VITE_FORCE
