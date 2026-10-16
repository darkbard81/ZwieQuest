#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export PORT="${PORT:-3011}"
export HOST="${HOST:-127.0.0.1}"
export PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://card.krdp.ddns.net}"
exec node src/server.js
