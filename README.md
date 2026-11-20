# Streaming-Launcher

Per Controller bedienbares Menü für Moonlight auf dem Steam Deck. Zeigt die Spiele (Sunshine-Apps)
vom Gaming-PC und startet Moonlight mit Auflösung, FPS, Bitrate, Codec und HDR des aktiven
Geräte-Modus (Handheld/TV). Wenn Moonlight beendet wird, ist man wieder im Launcher.

## Auf dem PC ausprobieren

```bash
npm install
npm run tauri dev
```

- Beim ersten Start öffnet sich „Verbindung“: PC wählen (wird per mDNS gefunden) oder IP eintippen,
  dann „Koppeln“ → die angezeigte PIN in der Sunshine-Weboberfläche unter „PIN“ eingeben.
- Probelauf ohne an sich selbst zu streamen: `STREAMING_LAUNCHER_DRY_RUN=1 npm run tauri dev`
  (loggt den Moonlight-Befehl, startet statt Moonlight nur `sleep 2`).
- Nur Oberfläche im Browser, mit Testdaten: `npm run dev` und http://localhost:1430 öffnen.
- Einstellungen: `~/.config/de.davidf.streaminglauncher/settings.json`

Tasten: Pfeile, Enter = A, Esc = B, X = Gerät, Q/E = L1/R1 (Modus), Y = merken/neu laden, M = Profile.

## Aufs Steam Deck

1. **Bauen (Fedora):**
   ```bash
   nice -n 19 npm run tauri build -- --bundles appimage
   ```
   Ergebnis: `src-tauri/target/release/bundle/appimage/Streaming-Launcher_0.1.0_amd64.AppImage`.
   Fedora hat eine neuere glibc als SteamOS. Meldet das AppImage auf dem Deck `GLIBC_2.xx not found`,
   im Container mit älterer Basis bauen (z. B. `distrobox create -i ubuntu:22.04`, dort Rust, Node
   und die Tauri-Abhängigkeiten installieren und denselben Befehl ausführen).
2. **Rüberkopieren:** z. B. `scp …AppImage deck@steamdeck:~/Applications/`, dann auf dem Deck `chmod +x`.
3. **Moonlight** auf dem Deck als Flatpak (Discover) installieren. Das ist der Standard-Befehl des Launchers.
4. **Als Nicht-Steam-Spiel eintragen:** Desktop-Modus → Steam → „Spiel hinzufügen“ → „Ein Nicht-Steam-Spiel
   hinzufügen“ → AppImage wählen. Danach im Game Mode starten.
5. Im Launcher einmal **koppeln** (PIN in Sunshine eingeben). Danach kommt die Liste über `moonlight list`.

Falls das Fenster im Game Mode schwarz bleibt (WebKitGTK unter gamescope), in den Startoptionen
`WEBKIT_DISABLE_DMABUF_RENDERER=1 %command%` setzen. Controller: Der Launcher liest das Gamepad selbst
(`gilrs`); die Steam-Input-Vorlage „Gamepad“ reicht. Tastatur geht immer.

Noch nicht auf dem Deck getestet: Fensterwechsel Launcher ↔ Moonlight unter gamescope, Dock-Erkennung
über `/sys/class/drm`.
