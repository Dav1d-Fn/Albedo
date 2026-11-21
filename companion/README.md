# Companion (PC-Helfer)

Kleiner Dienst auf dem Gaming-PC. Er sucht die installierten Spiele und Programme und legt sie auf
Wunsch des Launchers als Sunshine-App an. Die Schnittstelle steht in [API.md](API.md).

Quellen: Steam (alle Library-Ordner), Heroic (Epic/GOG), Lutris, Prism-Launcher-Instanzen,
Programme aus `.desktop`-Dateien und drei Voreinstellungen (Desktop, Desktop ohne Profilwechsel,
Steam Big Picture). Cover kommen als PNG nach `~/.config/sunshine/covers/`.

## Voraussetzungen

`curl`, `magick` (ImageMagick), `sqlite3` (nur für Lutris), `gio`. Auf Fedora alles vorhanden.

## Installieren

```bash
cd companion
nice -n 19 cargo build --release -j 4
install -m 755 target/release/streaming-launcher-companion ~/.local/bin/
install -m 644 streaming-launcher-companion.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now streaming-launcher-companion
```

Beim ersten Start legt der Dienst `~/.config/streaming-launcher-companion/config.json` an
(nur für David lesbar):

```json
{
  "port": 47995,
  "sunshineUrl": "https://localhost:47990",
  "sunshineUser": "",
  "sunshinePassword": ""
}
```

Hier den Login der Sunshine-Weboberfläche eintragen, dann
`systemctl --user restart streaming-launcher-companion`. Ohne Login zeigt der Dienst die Spieleliste
trotzdem an, nur Hinzufügen und Entfernen gehen dann nicht.

## Prüfen

```bash
curl -s localhost:47995/api/health
curl -s localhost:47995/api/library | jq '.entries | length'
journalctl --user -u streaming-launcher-companion -f
```

Erreichbar ist der Dienst nur aus dem Heimnetz, über Tailscale und lokal (sonst 403).
Die Firewall muss Port 47995/tcp durchlassen.

## Update

Neu bauen, Binary wie oben nach `~/.local/bin/` kopieren, dann
`systemctl --user restart streaming-launcher-companion`.
