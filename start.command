#!/bin/sh
# macOS / Linux: double-click (macOS) or run ./start.command
cd "$(dirname "$0")" || exit 1
PORT=8000
URL="http://localhost:$PORT/"
if command -v python3 >/dev/null 2>&1; then PY=python3; elif command -v python >/dev/null 2>&1; then PY=python; else
  echo "Python is needed on macOS/Linux (it ships with macOS). Install it or use XAMPP."; read -r _; exit 1
fi
( sleep 1; (open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null) ) &
echo "Supercar Dash Sim is running at $URL - close this window to stop it."
exec "$PY" -m http.server "$PORT"
