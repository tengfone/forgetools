// Dev probe: launch a built binary with WebView2 CDP enabled, collect CSP violations and
// console errors, open a Monaco tool and a few custom tools, report. Not part of the test suite.
//   node scripts/csp-probe.cjs <exe>
const { spawn, execFileSync } = require('child_process');
const PORT = 9334;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(process.argv[2], [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }, stdio: 'ignore' });
  let t;
  for (let i = 0; i < 200 && !t; i++) {
    try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => x.type === 'page'); } catch {}
    if (!t) await sleep(100);
  }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let id = 0; const pend = new Map(); const logs = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id) { pend.get(d.id)?.(d); return; }
    if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + d.params.exceptionDetails.exception?.description);
    if (d.method === 'Log.entryAdded') logs.push(`LOG ${d.params.entry.level} ${d.params.entry.text}`);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('ERR ' + d.params.args.map(a => a.value ?? a.description).join(' '));
  };
  const send = (method, params) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result;
  await send('Runtime.enable'); await send('Log.enable');
  await ev(`window.__csp = []; document.addEventListener('securitypolicyviolation', e => __csp.push(e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sourceFile||'') + ':' + e.lineNumber))`);
  await send('Page.reload', {}); await sleep(2500);
  await ev(`window.__csp = []; document.addEventListener('securitypolicyviolation', e => __csp.push(e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sourceFile||'') + ':' + e.lineNumber))`);
  const click = id => ev(`document.querySelector('#toolsNav [data-tool-id="${id}"]').click()`);
  await click('json'); await sleep(2500);
  await ev(`document.getElementById('sampleBtn').click()`); await sleep(1500);
  const monaco = await ev(`JSON.stringify({ monaco: !!window.monaco, lines: (document.querySelector('#outputEditor .view-lines')?.textContent||'').length, tokens: document.querySelectorAll('#outputEditor .mtk1, #outputEditor [class*=mtk]').length })`);
  for (const tool of ['passwordHash', 'favicon', 'cssJsFormat', 'textDiff']) { await click(tool); await sleep(700); }
  // A runtime inline style set from code (CSSOM is never blocked) and a style attribute via markup
  const styles = await ev(`(() => { const d = document.createElement('div'); d.setAttribute('style','width:37px'); document.body.appendChild(d); const w = getComputedStyle(d).width; d.remove(); return w; })()`);
  const csp = await ev(`JSON.stringify(window.__csp)`);
  const meta = await ev(`document.querySelector('meta[http-equiv]')?.content ?? null`);
  console.log(JSON.stringify({ monaco: monaco.value, styleAttr: styles.value, csp: JSON.parse(csp.value), meta: meta.value, logs }, null, 2));
  ws.close();
  execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
})().catch(e => { console.error(e); process.exit(1); });
