// Records the README media from the browser mock (see docs/media/README.md).
//
//   node docs/media/record.mjs export   real games from the companion on this PC -> docs/media/capture-data/
//   node docs/media/record.mjs record   every scene -> docs/media/*.gif / *.png (needs `npm run dev`)
//   node docs/media/record.mjs record hero library   only these scenes
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const mediaFolder = path.dirname(new URL(import.meta.url).pathname);
const captureFolder = path.join(mediaFolder, "capture-data");
const companion = "http://localhost:47995";
/** `npm run dev` serves 1430; APP_URL for a server on another port. */
const appUrl = process.env.APP_URL ?? "http://localhost:1430/?record";

/** The home rail, in this order (Sunshine app names). */
const railGames = ["Clair Obscur: Expedition 33", "Baldur's Gate 3", "Forza Horizon 5", "Resident Evil Village", "Subnautica", "Desktop"];

/** Only these sources show up in "Add games" (no programs or emulators of this PC). */
const shownSources = ["preset:", "steam:"];

/** The game whose picture dialog is shown. */
const pictureGame = "Subnautica";

/** German texts of an older companion that ignores Accept-Language. */
const englishTexts = { "Voreinstellungen": "Presets", "Desktop (ohne Profilwechsel)": "Desktop (no display switch)" };

/** Neutral address in the QR code and on the phone page, never the real one. */
const neutralHost = "192.168.1.20:47995";

// ------------------------------------------------------------------ export

class CompanionExport
{
  async run()
  {
    rmSync(captureFolder, { recursive: true, force: true });
    mkdirSync(captureFolder, { recursive: true });
    const library = await this.json("/api/library");
    // Desktop (no display switch) has German text in its cover picture.
    const entries = library.entries.filter((entry) => shownSources.some((source) => entry.id.startsWith(source)) && entry.hasCover && entry.id !== "preset:desktop-plain");
    const pictures = {};
    for (const [entryIndex, entry] of entries.entries())
    {
      pictures[entry.id] = {};
      // Hero and logo for every entry: a game added in the "library" scene shows them on the home screen.
      for (const kind of ["cover", "hero", "logo"])
      {
        const fileName = await this.download(`/api/${kind}/${encodeURIComponent(entry.id)}`, `${kind}-${entryIndex}`);
        if (fileName !== null)
        {
          pictures[entry.id][kind] = fileName;
        }
      }
    }
    const pictureEntry = entries.find((entry) => entry.name === pictureGame);
    const search = {};
    for (const kind of ["cover", "hero", "logo"])
    {
      search[kind] = { candidates: await this.shopPictures(pictureGame, Number(pictureEntry.id.split(":")[1]), kind), problem: null };
    }
    const uploadToken = await this.uploadToken(pictureEntry.id);
    await this.savePhonePage(uploadToken.url);
    const libraryEntries = entries.map(({ id, name, group, hasCover, hasHero, hasLogo }) =>
    {
      return { id, name: englishTexts[name] ?? name, group: englishTexts[group] ?? group, hasCover, hasHero, hasLogo, screenshotCount: 0 };
    });
    writeFileSync(path.join(captureFolder, "data.json"), JSON.stringify({ games: railGames, library: libraryEntries, pictures, search, uploadToken }, null, 2));
    console.log(`exported ${entries.length} entries to ${captureFolder}`);
    const missing = railGames.filter((name) => !entries.some((entry) => entry.name === name));
    if (missing.length > 0)
    {
      console.log("not in the companion's library (placeholder cover):", missing.join(", "));
    }
  }

  /** The phone page behind the QR code, saved so it can be shown next to the dialog. */
  async savePhonePage(uploadUrl)
  {
    const response = await fetch(companion + new URL(uploadUrl).pathname, { headers: { "Accept-Language": "en" } });
    let page = await response.text();
    // An older companion answers in German only; the texts as in companion/src/upload_page.rs.
    const germanToEnglish = { 'lang="de"': 'lang="en"', "Bild hochladen": "Upload image", "Cover (Hochformat)": "Cover (portrait)", "Bild auswählen": "Choose image" };
    for (const [german, english] of Object.entries(germanToEnglish))
    {
      page = page.replaceAll(german, english);
    }
    writeFileSync(path.join(captureFolder, "phone.html"), page);
  }

  async json(apiPath)
  {
    const response = await fetch(companion + apiPath, { headers: { "Accept-Language": "en" } });
    return response.json();
  }

  /** Saves the picture with an extension (Vite would otherwise read it as code); null when there is none. */
  async download(apiPath, baseName)
  {
    const response = await fetch(companion + apiPath);
    if (!response.ok)
    {
      return null;
    }
    const extension = response.headers.get("content-type")?.includes("png") ? ".png" : ".jpg";
    writeFileSync(path.join(captureFolder, baseName + extension), Buffer.from(await response.arrayBuffer()));
    return baseName + extension;
  }

  /** Same pictures the launcher's search finds without a SteamGridDB key (art_search.rs). */
  async shopPictures(gameName, appId, kind)
  {
    const fileName = { hero: "library_hero.jpg", logo: "logo.png" }[kind] ?? "library_600x900_2x.jpg";
    const searchUrl = "https://store.steampowered.com/api/storesearch/?cc=us&l=english&term=" + encodeURIComponent(gameName);
    const found = (await (await fetch(searchUrl)).json()).items ?? [];
    const shopGames = [{ id: appId, name: gameName }, ...found.filter((item) => item.id !== appId)].slice(0, 6);
    const candidates = [];
    for (const shopGame of shopGames)
    {
      const imageUrl = `https://shared.steamstatic.com/store_item_assets/steam/apps/${shopGame.id}/${fileName}`;
      if ((await fetch(imageUrl, { method: "HEAD" })).ok)
      {
        candidates.push({ imageUrl, thumbnailUrl: imageUrl, source: "Steam store", label: shopGame.name });
      }
    }
    return candidates;
  }

  /** A real upload link from the companion, but with the neutral address as Host (fetch cannot set Host). */
  uploadToken(entryId)
  {
    return new Promise((resolve, reject) =>
    {
      const body = JSON.stringify({ id: entryId, kind: "cover" });
      const request = http.request(companion + "/api/upload-token", { method: "POST", headers: { Host: neutralHost, "Content-Type": "application/json" } }, (response) =>
      {
        let text = "";
        response.on("data", (chunk) => text += chunk);
        response.on("end", () => resolve(JSON.parse(text)));
      });
      request.on("error", reject);
      request.end(body);
    });
  }
}

// ------------------------------------------------------------------ recording

/** One browser page as the Deck (or TV) screen, keys pressed like controller buttons. */
class Scene
{
  constructor(name, width, height)
  {
    this.name = name;
    this.width = width;
    this.height = height;
  }

  async open(browser)
  {
    this.videoFolder = path.join(captureFolder, "video-" + this.name);
    rmSync(this.videoFolder, { recursive: true, force: true });
    this.context = await browser.newContext({
      viewport: { width: this.width, height: this.height },
      locale: "en-US",
      recordVideo: { dir: this.videoFolder, size: { width: this.width, height: this.height } },
    });
    this.page = await this.context.newPage();
    this.startedAt = Date.now();
    await this.page.goto(appUrl);
    await this.page.waitForLoadState("networkidle");
  }

  /** Press a key ("ArrowRight", "x", "q", "e", "Enter", "Escape", "m", "y"), then wait. */
  async press(key, waitMilliseconds = 900, times = 1)
  {
    for (let pressIndex = 0; pressIndex < times; pressIndex++)
    {
      await this.page.keyboard.press(key);
      await this.page.waitForTimeout(waitMilliseconds);
    }
  }

  async wait(milliseconds)
  {
    await this.page.waitForTimeout(milliseconds);
  }

  /** Marks where the GIF starts (everything before, like loading, is cut away). */
  markStart()
  {
    this.clipStart = (Date.now() - this.startedAt) / 1000;
  }

  /** Closes the page and turns its video into `<name>.gif`. */
  async toGif({ outputWidth, fps })
  {
    const clipEnd = (Date.now() - this.startedAt) / 1000;
    await this.context.close();
    const video = path.join(this.videoFolder, readdirSync(this.videoFolder)[0]);
    const gif = path.join(mediaFolder, this.name + ".gif");
    // hqdn3d evens out the video's compression noise, so unchanged areas stay unchanged between GIF frames.
    const filters = `fps=${fps},scale=${outputWidth}:-1:flags=lanczos,hqdn3d=0:0:6:6,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`;
    // The video's clock starts a little before page creation; the small offset keeps the first frame clean.
    execFileSync("nice", ["-n", "19", "ffmpeg", "-y", "-loglevel", "error", "-ss", String(this.clipStart + 0.3), "-to", String(clipEnd), "-i", video, "-vf", filters, "-loop", "0", gif]);
    console.log("wrote", gif);
  }
}

const scenes =
{
  /** Home: browse the rail, switch Handheld -> TV with X and back. */
  async hero(browser)
  {
    const scene = new Scene("hero", 1280, 800);
    await scene.open(browser);
    await scene.wait(2500);
    scene.markStart();
    await scene.wait(1000);
    await scene.press("ArrowRight", 1200, 2);
    await scene.press("x", 2100);
    await scene.press("ArrowRight", 1300);
    await scene.press("x", 2000);
    await scene.toGif({ outputWidth: 720, fps: 10 });
  },

  /** Profiles: R1 on the home screen, then on a game's page, Y remembers it for that game. */
  async profiles(browser)
  {
    const scene = new Scene("profiles", 1280, 800);
    await scene.open(browser);
    await scene.wait(2500);
    scene.markStart();
    await scene.wait(800);
    await scene.press("e", 1100, 2);
    await scene.press("q", 1100, 2);
    await scene.press("Enter", 1500);
    await scene.press("e", 1100, 2);
    await scene.press("y", 2000);
    await scene.press("Escape", 1500);
    await scene.toGif({ outputWidth: 720, fps: 10 });
  },

  /** Device editor: device settings, a profile's values, then the TV device. */
  async devices(browser)
  {
    const scene = new Scene("devices", 1280, 800);
    await scene.open(browser);
    await scene.wait(2500);
    scene.markStart();
    await scene.wait(600);
    await scene.press("m", 1300);
    await scene.press("ArrowUp", 1800);
    await scene.press("ArrowDown", 900, 2);
    await scene.press("ArrowRight", 900);
    await scene.press("ArrowDown", 700, 2);
    await scene.press("ArrowRight", 600, 3);
    await scene.press("Escape", 900);
    await scene.press("e", 2200);
    await scene.press("Escape", 1200);
    await scene.toGif({ outputWidth: 720, fps: 10 });
  },

  /** Add games: the last tile, groups with L1/R1, A adds a Steam game, back home it is in the rail. */
  async library(browser)
  {
    const scene = new Scene("library", 1280, 800);
    await scene.open(browser);
    await scene.wait(2500);
    scene.markStart();
    await scene.wait(600);
    await scene.press("ArrowRight", 350, 6);
    await scene.press("Enter", 1800);
    await scene.press("e", 2000);
    await scene.press("ArrowRight", 450, 5);
    await scene.press("ArrowDown", 1000);
    await scene.press("Enter", 2400);
    await scene.press("Escape", 2500);
    await scene.toGif({ outputWidth: 720, fps: 10 });
  },

  /** Picture dialog with QR code and Steam store pictures, next to the phone page behind the QR code. */
  async "qr-upload"(browser)
  {
    const deck = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: "en-US" });
    await deck.goto(appUrl);
    await deck.waitForTimeout(2500);
    const steps = ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "Enter", "ArrowRight", "ArrowRight", "ArrowRight", "Enter", "ArrowDown", "ArrowRight"];
    for (const key of steps)
    {
      await deck.keyboard.press(key);
      await deck.waitForTimeout(700);
    }
    await deck.waitForTimeout(1500);
    const deckShot = path.join(captureFolder, "qr-deck.png");
    await deck.screenshot({ path: deckShot });
    await deck.close();

    // The phone page in a simple phone frame, as tall as the Deck screen.
    const phone = await browser.newPage({ viewport: { width: 440, height: 800 }, colorScheme: "dark", locale: "en-US" });
    const phonePageUrl = new URL("/docs/media/capture-data/phone.html", appUrl).href;
    await phone.setContent(`<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b0d12">
      <iframe src="${phonePageUrl}" style="width:360px;height:700px;border:12px solid #2a2f3a;border-radius:40px;background:#121212"></iframe></body>`);
    await phone.waitForTimeout(1000);
    const phoneShot = path.join(captureFolder, "qr-phone.png");
    await phone.screenshot({ path: phoneShot });
    await phone.close();

    const output = path.join(mediaFolder, "qr-upload.png");
    // Deck screen and phone side by side, scaled to 1200 px wide.
    const layout = "[0][1]hstack,scale=1200:-1";
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", deckShot, "-i", phoneShot, "-filter_complex", layout, output]);
    console.log("wrote", output);
  },

  /** Statistics after a stream (the mock's stream ends after 3 s). */
  async stats(browser)
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: "en-US" });
    await page.goto(appUrl);
    await page.waitForTimeout(2500);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(5000);
    const output = path.join(mediaFolder, "stats.png");
    await page.screenshot({ path: output });
    await page.close();
    // Smaller file: 1000 px wide is enough for the README.
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", output, "-vf", "scale=1000:-1", output + ".tmp.png"]);
    renameSync(output + ".tmp.png", output);
    console.log("wrote", output);
  },
};

async function main()
{
  const [mode, ...sceneNames] = process.argv.slice(2);
  if (mode === "export")
  {
    await new CompanionExport().run();
    return;
  }
  if (mode !== "record")
  {
    console.log("usage: node docs/media/record.mjs export | record [scene …]");
    process.exit(1);
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  for (const sceneName of sceneNames.length > 0 ? sceneNames : Object.keys(scenes))
  {
    await scenes[sceneName](browser);
  }
  await browser.close();
}

await main();
