// Records the README demo GIF.
//   npm run build && node scripts/record-demo.js
// Requires ffmpeg on PATH. Writes assets/demo.gif.
// Frames are captured with the Chrome DevTools screencast because Playwright's
// recordVideo hangs with Electron.
const { _electron: electron } = require("@playwright/test");
const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const frameDir = path.join(root, ".demo-frames");
const out = path.join(root, "assets", "demo.gif");
const W = 1200, H = 760, FPS = 15;

const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

(async () => {
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir);

  const app = await electron.launch({ args: [path.join(root, "out/main/main.js")] });
  const win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }, [w, h]) => {
    const b = BrowserWindow.getAllWindows()[0];
    b.setContentSize(w, h);
    b.center();
  }, [W, H]);
  // Start from a clean welcome screen
  await win.evaluate(() => localStorage.removeItem("recent-tools"));
  await win.reload();
  await win.waitForSelector("#welcomePaste", { timeout: 20000 });
  await win.waitForTimeout(800);

  // Screencast frames arrive only when the page repaints; we resample to a
  // fixed frame rate later using timestamps.
  const frames = [];
  const cdp = await win.context().newCDPSession(win);
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    frames.push({ t: metadata.timestamp, data });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  const t0 = Date.now() / 1000;

  const palette = async (query) => {
    await win.keyboard.press("Control+K");
    await win.waitForTimeout(350);
    await win.locator("#cmdInput").pressSequentially(query, { delay: 80 });
    await win.waitForTimeout(600);
    await win.keyboard.press("Enter");
    await win.waitForTimeout(900);
  };

  await win.waitForTimeout(1200);

  // 1. Paste anything -> auto-detect -> Enter opens the right tool
  await win.locator("#welcomePaste").focus();
  await win.locator("#welcomePaste").fill(JWT);
  await win.waitForTimeout(1600);
  await win.keyboard.press("Enter");
  await win.waitForSelector("#jwt-header-out");
  await win.waitForTimeout(2800);

  // 2. Command palette -> Hash
  await palette("hash");
  await win.locator("#hash-input").pressSequentially("hello forgetools", { delay: 55 });
  await win.waitForTimeout(2200);

  // 3. Timestamp
  await palette("timestamp");
  await win.locator("#ts-now-btn").click().catch(() => {});
  await win.waitForTimeout(2200);

  // 4. UUID generator
  await palette("uuid");
  await win.locator("#uuid-generate-btn").click().catch(() => {});
  await win.waitForTimeout(500);
  await win.locator("#uuid-generate-btn").click().catch(() => {});
  await win.waitForTimeout(2200);

  const tEnd = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  await app.close();

  if (!frames.length) throw new Error("No frames captured");
  frames.sort((a, b) => a.t - b.t);

  // Resample to constant FPS (hold last frame between repaints)
  const start = Math.max(t0, frames[0].t);
  const count = Math.floor((tEnd - start) * FPS);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const t = start + i / FPS;
    while (j + 1 < frames.length && frames[j + 1].t <= t) j++;
    fs.writeFileSync(path.join(frameDir, `f${String(i).padStart(5, "0")}.png`), Buffer.from(frames[j].data, "base64"));
  }
  console.log(`Captured ${frames.length} repaints -> ${count} frames`);

  const input = ["-framerate", String(FPS), "-i", path.join(frameDir, "f%05d.png")];
  const pal = path.join(frameDir, "palette.png");
  const vf = "scale=960:-1:flags=lanczos";
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...input, "-vf", `${vf},palettegen=stats_mode=diff`, pal]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...input, "-i", pal, "-lavfi",
    `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`, out]);
  fs.rmSync(frameDir, { recursive: true, force: true });
  console.log("Wrote", out, (fs.statSync(out).size / 1e6).toFixed(2), "MB");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
