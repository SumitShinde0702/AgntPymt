#!/bin/sh
set -e
cd /app
echo "Running database migrations…"
node db/dist/migrate.js
echo "Starting AgntPymt API on port ${PORT:-8080}…"
exec npm run start -w server
