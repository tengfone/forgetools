// Audit capture: node scripts/audit-shots.js  -> docs-shots/audit/*.png + metrics JSON
const { _electron: electron } = require("@playwright/test");
const path = require("path");
const fs = require("fs");
const out = path.join(__dirname, "../docs-shots/audit");
fs.mkdirSync(out, { recursive: true });

(async () => {
  const app = await electron.launch({ args: [path.join(__dirname, "../out/main/main.js")], env: { ...process.env, FORGE_E2E: "1", NODE_ENV: "test" } });
  const w = await app.firstWindow();
  await w.waitForSelector("#toolsNav [data-tool-id]");
  await w.evaluate(() => { localStorage.setItem("pinned-tools", JSON.stringify(["json", "jwt"])); });
  await w.reload(); await w.waitForSelector("#toolsNav [data-tool-id]"); await w.waitForTimeout(500);
  const size = (width, height = 760) => app.evaluate(({ BrowserWindow }, [a, b]) => { const x = BrowserWindow.getAllWindows()[0]; x.unmaximize(); x.setContentSize(a, b); }, [width, height]);
  const metrics = {};
  const measure = async (name) => {
    metrics[name] = await w.evaluate(() => {
      const r = navigator.windowControlsOverlay?.getTitlebarAreaRect();
      const ctrl = document.getElementById("titlebarControls").getBoundingClientRect();
      const small = Array.from(document.querySelectorAll("button, [role=button], select, input:not([type=checkbox])"))
        .filter(e => e.offsetParent && e.closest(".titlebar, #sidebar, .tool-header"))
        .map(e => { const b = e.getBoundingClientRect(); return { id: e.id || e.className.split(" ")[0], w: b.width, h: b.height }; })
        .filter(b => b.w < 28 || b.h < 26);
      const over = document.documentElement.scrollWidth > innerWidth;
      return { vw: innerWidth, wco: r && { x: r.x, w: r.width, h: r.height, visible: navigator.windowControlsOverlay.visible }, ctrlRight: ctrl.right, small, hOverflow: over };
    });
  };
  const shot = async (name) => { await w.mouse.move(5, 300); await w.waitForTimeout(250); await measure(name); await w.screenshot({ path: path.join(out, name + ".png") }); };
  for (const theme of ["dark", "light"]) {
    await w.evaluate(t => { localStorage.setItem("theme", t); localStorage.removeItem("sidebar-collapsed"); }, theme);
    await w.reload(); await w.waitForSelector("#toolsNav [data-tool-id]"); await w.waitForTimeout(400);
    for (const width of [720, 1000, 1280, 1600]) {
      await size(width);
      await w.click("#railHome").catch(() => w.evaluate(() => document.getElementById("homeLogo").click()));
      await shot(`${theme}-${width}-home`);
      if (width < 900) {
        await w.click("#navMenuBtn"); await shot(`${theme}-${width}-drawer`); await w.keyboard.press("Escape");
      }
      await w.evaluate(() => document.querySelector('#toolsNav [data-tool-id="json"]').click());
      await w.waitForTimeout(600);
      await shot(`${theme}-${width}-tool-json`);
      if (width >= 900) {
        await w.keyboard.press("Control+B"); await shot(`${theme}-${width}-collapsed`); await w.keyboard.press("Control+B");
      }
    }
    await size(1280);
    await w.evaluate(() => document.querySelector('#toolsNav [data-tool-id="jwt"]').click());
    await w.waitForTimeout(500); await shot(`${theme}-1280-tool-jwt`);
    await w.keyboard.press("Control+K"); await w.waitForTimeout(200); await shot(`${theme}-1280-palette`); await w.keyboard.press("Escape");
    await w.click("#titlebarSettings"); await w.waitForTimeout(200); await shot(`${theme}-1280-settings`); await w.keyboard.press("Escape");
    await w.locator('#toolsNav [data-tool-id="base64"]').hover(); await w.waitForTimeout(200);
    await w.screenshot({ path: path.join(out, `${theme}-1280-navhover.png`), clip: { x: 0, y: 0, width: 400, height: 500 } });
    await w.locator("#themeToggle").focus(); await w.keyboard.press("Tab"); await w.keyboard.press("Shift+Tab"); await w.waitForTimeout(150);
    await w.screenshot({ path: path.join(out, `${theme}-1280-titlebar-focus.png`), clip: { x: 0, y: 0, width: 1280, height: 60 } });
  }
  fs.writeFileSync(path.join(out, "metrics.json"), JSON.stringify(metrics, null, 1));
  await w.evaluate(() => { localStorage.setItem("theme", "system"); localStorage.removeItem("pinned-tools"); });
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
