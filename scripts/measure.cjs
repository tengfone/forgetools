// Windows-only perf probe: cold start to first visible window, idle memory, and memory
// after opening 5 tools. Works for any build whose web content exposes CDP:
//   node scripts/measure.cjs <exe> [runs=5]
// The webview is driven over CDP (env WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS for WebView2,
// --remote-debugging-port for Chromium shells). Memory = sum of the whole process tree.
// Informational only; never used as a gate.
const { spawn, execFileSync } = require('child_process');
const path = require('path');

const exe = path.resolve(process.argv[2] || '');
const runs = Number(process.argv[3] || 5);
const PORT = 9333;
const TOOLS = ['json', 'base64', 'hash', 'jwt', 'textDiff'];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ps = cmd => execFileSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' }).trim();

/** Working set + private bytes (MB) of pid and all descendants. */
function treeMemory(pid) {
  const out = ps(`$all = Get-CimInstance Win32_Process | Select ProcessId,ParentProcessId,WorkingSetSize,PrivatePageCount;
    $ids = @(${pid}); $i = 0; while ($i -lt $ids.Count) { $p = $ids[$i]; $ids += @($all | ? { $_.ParentProcessId -eq $p } | % ProcessId); $i++ }
    $s = $all | ? { $ids -contains $_.ProcessId }; '{0} {1} {2}' -f ($s | Measure WorkingSetSize -Sum).Sum, ($s | Measure PrivatePageCount -Sum).Sum, $s.Count`);
  const [ws, priv, n] = out.split(' ').map(Number);
  return { ws: +(ws / 1048576).toFixed(1), priv: +(priv / 1048576).toFixed(1), procs: n };
}
const killTree = pid => { try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } };

/** Minimal CDP client (Node's global WebSocket): attach to the app page and evaluate. */
async function cdpPage() {
  let target;
  for (let i = 0; i < 150 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find(t => t.type === 'page' && !t.url.startsWith('devtools'));
    } catch { /* not up yet */ }
    if (!target) await sleep(100);
  }
  if (!target) throw new Error('no CDP page target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); pending.delete(d.id); };
  const send = (method, params) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return {
    eval: async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value,
    close: () => ws.close(),
  };
}
async function waitFor(page, expr, timeout = 30000) {
  const t = performance.now();
  while (performance.now() - t < timeout) { if (await page.eval(expr).catch(() => false)) return; await sleep(20); }
  throw new Error('timeout: ' + expr);
}

async function once() {
  const env = { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` };
  const t0 = performance.now();
  const child = spawn(exe, [`--remote-debugging-port=${PORT}`], { env, stdio: 'ignore', detached: false });
  // First visible top-level window owned by the process (both apps show after first paint).
  let shown = 0;
  while (performance.now() - t0 < 30000) {
    const h = ps(`$p = Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue; if ($p) { $p.Refresh(); $p.MainWindowHandle } else { 0 }`);
    if (h && h !== '0') { shown = performance.now() - t0; break; }
    await sleep(25);
  }
  const page = await cdpPage();
  await waitFor(page, `!!document.querySelector('#toolsNav [data-tool-id]')`);
  const ready = performance.now() - t0;
  await sleep(5000);
  const idle = treeMemory(child.pid);
  for (const id of TOOLS) {
    await page.eval(`document.querySelector('#toolsNav [data-tool-id="${id}"]').click()`);
    await waitFor(page, `!document.getElementById('toolContainer').classList.contains('hidden')`);
    await sleep(800);
  }
  await sleep(3000);
  const five = treeMemory(child.pid);
  page.close();
  killTree(child.pid);
  await sleep(1500);
  return { shownMs: Math.round(shown), readyMs: Math.round(ready), idle, five };
}

(async () => {
  const res = [];
  for (let i = 0; i < runs; i++) { const r = await once(); console.log(JSON.stringify(r)); res.push(r); }
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  console.log(JSON.stringify({
    exe: path.basename(exe), runs,
    median: {
      shownMs: med(res.map(r => r.shownMs)), readyMs: med(res.map(r => r.readyMs)),
      idleWsMB: med(res.map(r => r.idle.ws)), idlePrivMB: med(res.map(r => r.idle.priv)),
      fiveToolsWsMB: med(res.map(r => r.five.ws)), fiveToolsPrivMB: med(res.map(r => r.five.priv)),
      procs: res[0].idle.procs,
    },
  }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
