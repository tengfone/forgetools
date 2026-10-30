// Records the README demo GIF (assets/demo.gif) from the e2e test build.
//   npm run build:e2e && npm run demo
// Requires ffmpeg on PATH. Runs as a WDIO spec (see scripts/demo.wdio.conf.mjs):
// screenshots are taken continuously while the scenes play, then resampled to a fixed FPS.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { waitForAppReady } from '../tests/e2e/helpers/tauriApp.mjs';

// Pacing pauses are the point of a recording (the viewer must see each scene), not test waits.
const hold = (ms) => browser.pause(ms);

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const frameDir = path.join(root, '.demo-frames');
const out = path.join(root, 'assets', 'demo.gif');
const W = 1200,
  H = 760,
  FPS = 15;
const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

it('records the demo', async () => {
  await browser.tauri.execute(
    async (_t, w, h) => {
      const T = window.__TAURI__;
      const win = T.window.getCurrentWindow();
      await win.setSize(new T.dpi.LogicalSize(w, h));
      await win.center();
    },
    W,
    H,
  );
  // Clean storage and a reloaded webview: starts on a clean welcome screen at the new size.
  await waitForAppReady();
  await hold(800);

  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir);
  const frames = [];
  let recording = true;
  const recorder = (async () => {
    while (recording) frames.push({ t: Date.now(), data: await browser.takeScreenshot() });
  })();

  const typeSlow = async (text, delay) => {
    for (const ch of text) {
      await browser.keys(ch);
      await hold(delay);
    }
  };
  const palette = async (query) => {
    await browser.keys(['Control', 'k']);
    await hold(350);
    await typeSlow(query, 80);
    await hold(600);
    await browser.keys('Enter');
    await hold(900);
  };

  await hold(1200);
  // 1. Paste anything -> auto-detect -> Enter opens the right tool
  await $('#homeSearch').setValue(JWT);
  await hold(1600);
  await browser.keys('Enter');
  await $('#jwt-header-out').waitForDisplayed();
  await hold(2800);
  // 2. Command palette -> Hash
  await palette('hash');
  await $('#hash-input').click();
  await typeSlow('hello forgetools', 55);
  await hold(2200);
  // 3. Timestamp
  await palette('timestamp');
  await $('#ts-now-btn').click();
  await hold(2200);
  // 4. Pipeline: chain decode -> format in one recipe
  await palette('pipeline');
  await $('#chain-sample').click();
  await hold(2400);
  // 5. Cron builder: plain-English schedule + next runs
  await palette('cron builder');
  await $('#cronb-sample').click();
  await hold(2400);
  // 6. Fake data
  await palette('fake data');
  await $('#fake-sample').click();
  await hold(2400);

  recording = false;
  await recorder;
  if (!frames.length) throw new Error('No frames captured');

  // Resample to constant FPS (hold the latest screenshot)
  const start = frames[0].t,
    end = frames[frames.length - 1].t;
  const count = Math.floor(((end - start) / 1000) * FPS);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const t = start + (i * 1000) / FPS;
    while (j + 1 < frames.length && frames[j + 1].t <= t) j++;
    fs.writeFileSync(path.join(frameDir, `f${String(i).padStart(5, '0')}.png`), Buffer.from(frames[j].data, 'base64'));
  }
  console.log(`Captured ${frames.length} screenshots -> ${count} frames`);

  const input = ['-framerate', String(FPS), '-i', path.join(frameDir, 'f%05d.png')];
  const pal = path.join(frameDir, 'palette.png');
  const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,scale=960:-1:flags=lanczos`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...input, '-vf', `${vf},palettegen=stats_mode=diff`, pal]);
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    ...input,
    '-i',
    pal,
    '-lavfi',
    `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    out,
  ]);
  fs.rmSync(frameDir, { recursive: true, force: true });
  console.log('Wrote', out, (fs.statSync(out).size / 1e6).toFixed(2), 'MB');
});
