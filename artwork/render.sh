#!/usr/bin/env bash
# Renders artwork/source/artwork.html into the Steam pictures (artwork/steam/) and the app icon source.
# Needs Google Chrome or Chromium and `npm install` (for the Inter font).
set -euo pipefail
cd "$(dirname "$0")"
CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser)"
mkdir -p steam

# name  width  height  scale
render()
{
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
        --force-device-scale-factor="$4" --window-size="$2,$3" --virtual-time-budget=2000 \
        --screenshot="$PWD/steam/$1.png" "file://$PWD/source/artwork.html?kind=$1" 2>/dev/null
}

render cover 600 900 1
render wide 920 430 1
render hero 1920 620 2
render logo 1280 400 1
render icon 512 512 2

# App icons for Tauri from the 1024 px icon.
if [[ "${1:-}" == "--app-icons" ]]
then
    (cd .. && npx tauri icon artwork/steam/icon.png)
fi
ls -la steam
