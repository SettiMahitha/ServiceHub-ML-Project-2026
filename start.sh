#!/bin/sh
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get it from https://nodejs.org (LTS) and run this again."; exit 1
fi
( sleep 1; (xdg-open http://localhost:3000 || open http://localhost:3000) >/dev/null 2>&1 ) &
node server.js
