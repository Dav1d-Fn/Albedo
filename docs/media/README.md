# README media

The GIFs and pictures here are recorded from the browser mock (`npm run dev`) with
[`record.mjs`](record.mjs): Playwright presses keys like a controller, records the page as video,
and ffmpeg turns it into a GIF. Redo them after UI changes.

## Steps

1. **Export real games** from the companion running on this PC (`localhost:47995`):

   ```bash
   node docs/media/record.mjs export
   ```

   Writes `docs/media/capture-data/` (in `.gitignore`): the library entries of the sources in
   `shownSources`, their covers, title images and logos, Steam store pictures for the picture dialog
   and the phone upload page. The home rail (`railGames`) and the game of the picture dialog
   (`pictureGame`) are set at the top of the script. The QR code gets the neutral address
   `192.168.1.20`, never the PC's real one.

2. **Start the UI** with `npm run dev`. `http://localhost:1430/?record` now shows the exported
   games in English (`src/dev/RecordingData.ts`).

3. **Record** every scene, or only some:

   ```bash
   nice -n 19 node docs/media/record.mjs record
   ```

   ```bash
   nice -n 19 node docs/media/record.mjs record hero library
   ```

   Scenes: `hero`, `profiles`, `devices`, `library`, `qr-upload`, `stats`.

## Setup and options

- Needs `ffmpeg` on the system and Playwright's video encoder: `npx playwright-core install ffmpeg`.
  Chromium comes from `npx playwright-core install chromium`, or point `CHROMIUM` at any
  Chromium/Chrome binary.
- `APP_URL` if the dev server runs on another port, e.g. `APP_URL="http://localhost:1450/?record"`.
- GIFs are 720 px wide at 10 FPS and should stay under ~5 MB each; a changing backdrop costs the
  most, so keep scenes short.
- Before committing, look at the frames (nothing cut off, no German, no error toast, no private data).
