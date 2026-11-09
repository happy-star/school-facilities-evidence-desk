#!/bin/sh
set -eu
export PUBLIC_DEMO=1
export PUBLIC_RELEASE=1
export NEXT_TELEMETRY_DISABLED=1
export PORT="${PORT:-3000}"
export HOSTNAME=0.0.0.0
exec node server.js
