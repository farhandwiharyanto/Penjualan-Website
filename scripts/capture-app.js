// Memotret halaman aplikasi yang butuh interaksi dulu (mis. login) memakai Chrome headless
// lewat DevTools Protocol — tanpa dependency tambahan (WebSocket bawaan Node 22+).
// Berbeda dengan `npm run thumbs` yang hanya memotret URL apa adanya.
//
//   node scripts/capture-app.js --url <url> --out public/uploads/thumb-x.png
//        [--eval "<js dijalankan setelah halaman siap>"] [--goto <url setelah eval>] [--wait 3000] [--size 1280x800]
//
// Contoh (login dulu, lalu potret dashboard):
//   node scripts/capture-app.js --url https://app.example.com/login \
//     --eval "setVal('input[type=text]','sales'); setVal('input[type=password]','password'); document.querySelector('form').requestSubmit()" \
//     --wait 5000 --out public/uploads/thumb-app.png
// Di dalam --eval tersedia helper setVal(selector, value) yang memicu event input (cocok untuk Vue/React),
// wait(ms), dan boleh memakai `await` (mis. isi form, await wait(3000), lalu klik tombol berikutnya).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const url = opt('url'), out = opt('out');
if (!url || !out) { console.error('Pakai: node scripts/capture-app.js --url <url> --out <file.png> [--eval <js>] [--goto <url>] [--wait ms] [--size WxH]'); process.exit(1); }
const [W, H] = opt('size', '1280x800').split('x').map(Number);
const wait = parseInt(opt('wait', '3000'), 10);

const CHROME = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => fs.existsSync(p));
if (!CHROME) { console.error('Chrome/Chromium tidak ditemukan. Set CHROME_BIN=<path>.'); process.exit(1); }

const port = 9222 + Math.floor(Math.random() * 1000);
const profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${W},${H}`, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // tunggu port debugging siap
  let targets;
  for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); } }
  if (!targets) throw new Error('Chrome tidak merespons di port debugging');
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = {};
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error('Error di --eval: ' + (r.result.exceptionDetails.exception || {}).description);
    return r.result && r.result.result && r.result.result.value;
  };

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(wait);
  if (opt('eval')) {
    const helper = `function setVal(sel, v){ const el=document.querySelector(sel); if(!el) throw new Error('tidak ada elemen '+sel);
      const proto = el.tagName==='TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,'value').set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }
      const wait = ms => new Promise(r => setTimeout(r, ms));`;
    await evaluate(`(async function(){ ${helper}; ${opt('eval')} })()`);
    await sleep(wait);
  }
  if (opt('goto')) { await send('Page.navigate', { url: opt('goto') }); await sleep(wait); }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log(`✔ ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB) — ${await evaluate('location.href')}`);
  ws.close();
})().catch(e => { console.error('✖', e.message); process.exitCode = 1; })
  .finally(async () => { chrome.kill(); await sleep(500); fs.rmSync(profile, { recursive: true, force: true }); });
