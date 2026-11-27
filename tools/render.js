/* Renders the built page with a seeded database and saves screenshots, so screens can be judged with real content.
   Usage: node tools/render.js <seed.json> <outdir>   (needs Playwright with Chromium) */
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('playwright');
const [seedPath, out] = process.argv.slice(2);
if (!seedPath || !out) { console.error('usage: node tools/render.js <seed.json> <outdir>'); process.exit(1); }
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const dist = fs.readFileSync(path.join(__dirname, '..', 'dist', 'context-window.html'), 'utf8');
const SKELETON = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box}body{margin:0;padding:0;font:14px sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
function install(seedData) {
  const cols = JSON.parse(JSON.stringify(seedData)), subs = {};
  const snap = c => ({ docs: Object.entries(cols[c] || {}).map(([id, d]) => ({ id, data: () => JSON.parse(JSON.stringify(d)) })) });
  const emit = c => (subs[c] || []).forEach(cb => setTimeout(() => cb(snap(c)), 0));
  const split = p => { const i = p.lastIndexOf('/'); return [p.slice(0, i), p.slice(i + 1)]; };
  const db = { collection: c => ({ onSnapshot: cb => { (subs[c] = subs[c] || []).push(cb); setTimeout(() => cb(snap(c)), 0); return () => { }; }, get: async () => snap(c) }),
    doc: p => { const [c, id] = split(p); return { get: async () => { const d = (cols[c] || {})[id]; return { exists: !!d, data: () => JSON.parse(JSON.stringify(d)) }; }, set: async data => { (cols[c] = cols[c] || {})[id] = JSON.parse(JSON.stringify(data)); emit(c); }, delete: async () => { if (cols[c]) delete cols[c][id]; emit(c); } }; } };
  const sample = Object.assign(async () => { throw { code: 'upstream_error', message: 'render harness' }; }, { json: async () => { throw { code: 'upstream_error', message: 'render harness' }; }, limits: async () => ({ maxPromptBytes: 262144 }) });
  const caps = { db, sample, downloads: { save: async () => ({ status: 'saved' }) }, tts: null, dictation: null, mcp: null };
  window.claude = { use: async n => (n in caps ? caps[n] : null) };
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(), errors = [];
  const file = path.join(os.tmpdir(), `cw-render-${process.pid}.html`); fs.writeFileSync(file, SKELETON + dist + '</body></html>');
  const cid = Object.keys(seed.courses)[0], units = Object.entries(seed.units).sort((a, b) => a[1].n - b[1].n), lids = Object.keys(seed.lessons).sort();
  for (const [w, h, scheme] of [[1100, 1400, 'light'], [390, 1600, 'dark']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme }), page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push(`${w}: ${m.text()}`); }); page.on('pageerror', e => errors.push(`${w}: ${e.message}`));
    await page.addInitScript(install, seed); await page.goto('file://' + file); await page.waitForFunction(() => typeof S !== 'undefined' && S.ready);
    const shot = async (hash, name, pre) => { await page.evaluate(x => { location.hash = x; }, hash); await page.waitForTimeout(250); if (pre) { await pre(); await page.waitForTimeout(200); } const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); if (wide) errors.push(`${w}: ${hash} scrolls sideways`); await page.screenshot({ path: path.join(out, `${name}-${w}.png`), fullPage: true }); };
    await shot('home', 'home'); await shot('course-' + cid, 'course');
    for (const lid of lids.slice(0, 2)) await shot('learn-' + lid, 'lesson-' + lid);
    if (lids[0]) await shot('learn-' + lids[0], 'teachback', async () => { const b = page.locator('[data-act="learn-explain"]').first(); if (await b.count()) await b.click(); });
    await shot('review', 'review', async () => { const b = page.locator('[data-act="review-start"]').first(); if (await b.count()) await b.click(); });
    await shot('map-' + cid, 'map'); await shot('notebook', 'notebook'); await shot('reports', 'reports');
    if (units[0]) await shot('guide-' + units[0][0], 'guide', async () => { await page.waitForTimeout(400); });
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify({ shots: fs.readdirSync(out).length, errors }, null, 1));
})().catch(e => { console.error('RENDER FAILED: ' + e.message); process.exit(1); });
