/* Loads dist/context-window.html in a headless browser with a mocked window.claude and drives a whole course.
   Run: node tests/smoke.js   (needs Playwright with Chromium) */
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('playwright');

const XSS = '<img src=x onerror="window.__xss=1">';
const dist = fs.readFileSync(path.join(__dirname, '..', 'dist', 'context-window.html'), 'utf8');
const SKELETON = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box}body{margin:0;padding:0;font:14px sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';

/* Runs inside the page before its script: an in-memory db plus canned Claude answers keyed by the TASK line. */
function installMock(mode) {
  window.__calls = []; window.__spoken = []; window.__saved = [];
  if (mode === 'none') { window.claude = { use: async () => null }; return; }
  const X = '<img src=x onerror="window.__xss=1">';
  const cols = {}, subs = {};
  const snap = col => ({ docs: Object.entries(cols[col] || {}).map(([id, d]) => ({ id, data: () => JSON.parse(JSON.stringify(d)) })) });
  const emit = col => (subs[col] || []).forEach(cb => setTimeout(() => cb(snap(col)), 0));
  const split = p => { const i = p.lastIndexOf('/'); return [p.slice(0, i), p.slice(i + 1)]; };
  const db = {
    collection: col => ({ onSnapshot: cb => { (subs[col] = subs[col] || []).push(cb); setTimeout(() => cb(snap(col)), 0); return () => { }; }, get: async () => snap(col) }),
    doc: p => { const [c, id] = split(p); return {
      get: async () => { const d = (cols[c] || {})[id]; return { exists: !!d, data: () => JSON.parse(JSON.stringify(d)) }; },
      set: async data => { (cols[c] = cols[c] || {})[id] = JSON.parse(JSON.stringify(data)); emit(c); },
      delete: async () => { if (cols[c]) delete cols[c][id]; emit(c); } }; }
  };
  window.__db = cols;
  const idea = n => ({ title: 'Idea ' + n + ' ' + X, analogy: { text: 'Like a sale rack ' + X }, mechanism: { text: 'When the **price** rises, the quantity demanded falls. ' + X, origin: 'source' },
    example: { title: 'Coffee', steps: [{ label: 'Start', text: 'At $2, 100 cups sell.' }, { label: 'Change', text: 'At $3, 80 cups sell.' }], result: '20 fewer cups', origin: 'added' }, why: { text: 'It predicts sales.', origin: 'added' },
    visual: { type: 'chart', kind: 'bar', points: [{ label: '$2', value: 100 }, { label: '$3', value: 80 }], unit: 'cups', caption: 'Quantity falls as price rises ' + X }, visualOrigin: 'added',
    quote: 'quantity demanded falls', keyPoints: ['inverse relation ' + X, 'all else equal', 'movement along the curve'], prompts: { beginner: 'Explain idea ' + n + ' to a beginner.', example: 'Give an example.', predict: 'Predict.', compare: 'Compare.' },
    hints: ['Think about price.', 'Think about quantity.'], cloze: { sentence: 'When price rises the quantity demanded falls.', answer: 'quantity' }, yield: 'high',
    terms: n === 1 ? [{ term: 'quantity demanded', def: 'How much buyers want ' + X, fromSource: true }, { term: 'price', def: 'What you pay', fromSource: false }] : [{ term: 'substitution', def: 'Switching ' + X, fromSource: true }, { term: 'income', def: 'What you earn', fromSource: false }],
    cards: [{ type: 'flash', prompt: 'Define demand ' + n + ' ' + X, answer: 'Willingness to buy', rubric: [], explanation: 'Because.', quote: '', origin: 'source', difficulty: 1 }, { type: 'short', prompt: 'Why does demand ' + n + ' slope down?', answer: 'Price up, quantity down', rubric: ['inverse'], explanation: 'Law of demand.', origin: 'added', difficulty: 2 }, { type: 'apply', prompt: 'Apply ' + n, answer: 'Do it', rubric: ['a'], explanation: 'e', origin: 'added', difficulty: 4 }], sourceIssue: n === 1 ? { quote: 'bad quote', issue: 'Looks wrong ' + X } : null });
  const answer = prompt => {
    const text = typeof prompt === 'string' ? prompt : prompt.map(m => m.content).join('\n');
    const task = (/TASK: ([A-Z -]+)/.exec(text) || [])[1] || '?'; window.__calls.push(task);
    if (task === 'DIGEST') return { segments: [...text.matchAll(/=== SEGMENT (\S+) ===/g)].map(m => ({ ref: m[1], summary: 'Covers the law of demand and price ' + X })) };
    if (task === 'SYLLABUS') return { units: [1, 2].map(n => ({ title: 'Unit ' + n + ' ' + X, summary: 'Summary ' + n, lessons: [{ title: 'Lesson A' + n, ideas: ['Idea 1'] }, { title: 'Lesson B' + n, ideas: ['Idea 2'] }], segs: (text.match(/^(s\w+:\d+): /m) || []).slice(1, 2), origin: n === 1 ? 'source' : 'added' })), note: 'Gap note ' + X };
    if (task === 'UNIT PLAN') return { lessons: [{ title: 'Planned lesson', ideas: ['Planned idea'] }] };
    if (task === 'LESSON') return { ideas: [idea(/Lesson B/.test(text) ? 2 : 1)] };
    if (task === 'SELF-CHECK') return { flags: [{ idea: 0, card: 2, problem: 'Answer is vague ' + X, severity: 'low' }, { idea: 0, card: null, problem: 'Check the numbers', severity: 'high' }] };
    if (task === 'PLACEMENT') return { items: [{ unit: 0, prompt: 'Explain unit 1', keyPoints: ['a', 'b'] }, { unit: 1, prompt: 'Explain unit 2', keyPoints: ['a', 'b'] }] };
    if (task === 'PLACEMENT GRADE') return { results: [{ unit: 0, score: 40 }, { unit: 1, score: 50 }] };
    if (task === 'PROBE') return { probes: ['Why does it slope down? ' + X, 'What if income rises?'] };
    if (task === 'TEACH-BACK GRADE') return { points: [{ point: 'p', hit: true, note: 'said it' }, { point: 'p', hit: true }, { point: 'p', hit: /second try|LEARNER: """second/.test(text), note: 'missed ' + X }], score: /LEARNER: """second/.test(text) ? 92 : 78, feedback: 'Good ' + X, reteach: 'Movement along the curve means only price changed. Try again?', misconception: '' };
    if (task === 'HINT') return { hint: 'Look at the example ' + X };
    if (task === 'GRADE') return { score: 30, reasoning: 'Missing the reason ' + X, missing: ['inverse'] };
    if (task === 'GRADE TEST') return { results: [...text.matchAll(/ITEM (\d+)/g)].map(m => ({ n: +m[1], ok: false, why: 'No' })) };
    if (task === 'PRACTICE TEST') { const n = +(/Write (\d+) fresh/.exec(text) || [])[1] || 5, mc = /multiple choice, 4 options/.test(text); return { questions: Array.from({ length: n }, (_, i) => mc ? { q: 'Question ' + i + ' ' + X, options: ['A ' + X, 'B', 'C', 'D'], answer: 1, explanation: 'Because B', unit: 0, idea: 'Idea 1 ' + X, difficulty: 2 } : { q: 'Written ' + i, answer: 'Model', explanation: 'Why', unit: 0, idea: 'x', difficulty: 2 }) }; }
    if (task === 'CRAM SELECTION') return { ids: [...text.matchAll(/^(\S+L\d+i\d+) \|/gm)].map(m => m[1]), plan: 'Do these ' + X };
    if (task === 'EXPLAIN' || task === 'QUESTION') return { parts: [{ from: 'source', text: 'From source ' + X }, { from: 'general', text: 'General' }], visual: { type: 'flow', steps: [{ label: 'a' }, { label: 'b' }] } };
    if (task === 'AUDIO RECAP') return { lines: ['First paragraph of the recap.', 'Second paragraph ' + X] };
    if (task === 'STUDY GUIDE') return { summary: 'Guide summary ' + X, mustKnow: ['One'], formulas: [], pitfalls: ['Two'] };
    if (task === 'WEEKLY REPORT') return { summary: 'A steady week ' + X, focus: ['Focus one'] };
    if (task === 'TUTOR') return { parts: [{ from: 'source', text: 'Tutor answer ' + X }, { from: 'general', text: 'Extra' }] };
    if (task === 'REWRITE CARD') return { prompt: 'Rewritten', answer: 'New answer', rubric: ['x', 'y'], explanation: 'New' };
    if (task === 'TRANSCRIBE') return { title: 'Photo', text: 'Transcribed text that is long enough to be accepted as material for the course.' };
    return {};
  };
  const sample = Object.assign(async p => ({ text: JSON.stringify(answer(p)), truncated: false }), { json: async p => { await new Promise(r => setTimeout(r, 5)); return answer(p); }, limits: async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 1e6, mediaTypes: ['image/png'] } }) });
  const caps = {
    db, sample, downloads: { save: async r => { window.__saved.push(r.filename); return { status: 'saved' }; } },
    tts: { speak: async l => { window.__spoken.push(l); return { playedMs: 1 }; }, stop: async () => { }, onState: () => () => { } }, dictation: null,
    mcp: { callTool: async (server, tool) => { if (server === 'Notion') throw { code: 'server_not_connected', message: 'x' }; return { payload: tool === 'search_notes' ? '## notes/Econ.md\nsnippet' : tool === 'read_note' ? 'Vault note text about elasticity, long enough to count as real material.' : { files: [{ id: 'f1', title: 'Drive doc ' + X, mimeType: 'application/vnd.google-apps.document' }] } }; } }
  };
  window.claude = { use: async name => (name in caps ? caps[name] : null) };
}

const errors = [];
let step = 'start';
const fail = msg => { throw new Error(`[${step}] ${msg}`); };
async function open(browser, mode, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${step}] console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${step}] pageerror: ${e.message}`));
  await page.addInitScript(installMock, mode);
  const file = path.join(os.tmpdir(), `cw-smoke-${process.pid}-${mode}.html`);
  fs.writeFileSync(file, SKELETON + dist + '</body></html>');
  await page.goto('file://' + file);
  await page.waitForFunction(() => typeof S !== 'undefined' && S.ready);
  return page;
}
const idle = page => page.waitForFunction(() => !Object.keys(S.busy).length, null, { timeout: 15000 });
async function act(page, name, extra = '') { step = name; const b = page.locator(`#view [data-act="${name}"]${extra}, #overlays [data-act="${name}"]${extra}`).first(); await b.waitFor({ timeout: 5000 }); await b.click(); await page.waitForTimeout(40); await idle(page); }
async function goto(page, hash) { step = 'route ' + hash; await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(80); await idle(page);
  const state = await page.evaluate(() => ({ html: document.getElementById('view').innerHTML, wide: document.documentElement.scrollWidth > window.innerWidth + 1, xss: window.__xss, img: !!document.querySelector('#view img, #overlays img') }));
  if (process.env.SHOTS && /^(home|learn|review|course-|map|badges|weekly|games)/.test(hash)) { const w = page.viewportSize().width; await page.emulateMedia({ colorScheme: w < 500 ? 'dark' : 'light' }); await page.screenshot({ path: path.join(process.env.SHOTS, hash.replace(/-.*/, '') + '-' + w + '.png'), fullPage: false }); }
  if (state.html.length < 80) fail('view is empty'); if (/hit a problem/.test(state.html)) fail('view crashed');
  if (state.xss || state.img) fail('unescaped markup reached the page'); if (state.wide) fail('page scrolls sideways');
  return state.html; }
const fill = (page, id, v) => page.fill('#' + id, v);

(async () => {
  const browser = await chromium.launch();
  try {
    /* 1. No capabilities at all: the page still renders every static route. */
    let page = await open(browser, 'none');
    for (const r of ['home', 'review', 'courses', 'newcourse', 'weekly', 'stats', 'badges', 'notebook', 'reports', 'prefs', 'more']) await goto(page, r);
    if (!(await page.locator('.banner').count())) fail('no warning banner without storage');
    await goto(page, 'newcourse'); await fill(page, 'f-wiz-goal', 'Learn offline'); await act(page, 'course-create');
    if (!/Setting up/.test(await page.locator('#view').innerHTML())) fail('course not created in memory store');
    await page.context().close();

    /* 2. Full flow with mocked Claude, db, voice and connectors. */
    page = await open(browser, 'full');
    await goto(page, 'home');
    await goto(page, 'newcourse');
    await fill(page, 'f-wiz-goal', 'Pass Microeconomics CLEP ' + XSS); await fill(page, 'f-wiz-examQuestions', '30'); await fill(page, 'f-wiz-examMinutes', '40'); await fill(page, 'f-wiz-examStyle', 'Multiple choice');
    await fill(page, 'f-wiz-outline', 'Outline: supply and demand'); await act(page, 'course-create');
    const cid = await page.evaluate(() => Object.keys(S.courses)[0]);
    await fill(page, 'f-mat-title', 'Chapter 1 ' + XSS); await fill(page, 'f-mat-text', ('The law of demand says quantity demanded falls when price rises. ' + XSS + ' ').repeat(40) + '\n\n' + 'Second part about supply. '.repeat(400));
    await act(page, 'mat-add-paste');
    if ((await page.evaluate(() => Object.values(S.sources)[0].segCount)) < 2) fail('long material was not split into parts');
    await act(page, 'set', '[data-val="vault"]'); await fill(page, 'f-mat-q', 'econ'); await act(page, 'mat-search'); await act(page, 'mat-conn-add');
    await act(page, 'set', '[data-val="drive"]'); await fill(page, 'f-mat-q', "it's"); await act(page, 'mat-search');
    await act(page, 'set', '[data-val="notion"]'); await fill(page, 'f-mat-q', 'x'); await act(page, 'mat-search');
    if (await page.locator('[data-val="notion"]').count()) fail('unconnected connector was not hidden');
    if ((await page.evaluate(() => Object.keys(S.sources).length)) !== 2) fail('vault note was not added');
    await act(page, 'syl-draft'); step = 'syllabus';
    await page.waitForFunction(() => S.route === 'syllabus'); await goto(page, 'syllabus-' + cid);
    if ((await page.evaluate(() => Object.keys(S.units).length)) !== 2) fail('syllabus units missing');
    await act(page, 'unit-move', '[data-d="1"]:not([disabled])'); await act(page, 'unit-move', '[data-d="-1"]:not([disabled])');
    await fill(page, 'f-newunit', 'Extra unit'); await act(page, 'unit-add'); step = 'unit-cut'; await page.locator('#view [data-act="unit-cut"]').nth(2).click(); await page.waitForTimeout(40); await act(page, 'confirm-yes');
    await act(page, 'syl-approve'); await goto(page, 'course-' + cid);
    await goto(page, 'placement-' + cid); await act(page, 'place-start'); await fill(page, 'f-place-answers-0', 'Something'); await act(page, 'place-grade');
    await goto(page, 'course-' + cid); await act(page, 'unit-build');
    const info = await page.evaluate(() => { const u = Object.entries(S.units).sort((a, b) => a[1].n - b[1].n)[0]; return { uid: u[0], status: u[1].status, cards: Object.values(S.cards).length, flagged: Object.values(S.cards).filter(c => c.status === 'flagged').length, reports: Object.keys(S.reports).length, glossary: Object.keys(S.glossary).length }; });
    if (info.status !== 'ready' || info.cards !== 8 || info.flagged !== 2 || info.reports < 3 || info.glossary !== 4) fail('unit build produced ' + JSON.stringify(info));
    const lid = info.uid + 'L0';

    /* Teach-back round trip in the lesson player: read, explain, hint, probes, score, re-teach, retry, rate, continue. */
    await goto(page, 'learn-' + lid);
    if (!/Added background, not from your source/.test(await page.locator('#view').innerHTML())) fail('added content is not labeled');
    await act(page, 'speak'); if (!(await page.evaluate(() => window.__spoken.length))) fail('read-aloud did not speak');
    await act(page, 'term'); if (!(await page.locator('#pop').count())) fail('glossary popover missing');
    await act(page, 'learn-explain'); await act(page, 'tb-hint'); await fill(page, 'f-item-input', 'Price up means quantity down ' + XSS); await act(page, 'tb-submit');
    step = 'probes'; if (!/Follow-up 1 of 2/.test(await page.locator('#view').innerHTML())) fail('probe stage missing: ' + (await page.locator('#item').innerText()).slice(0, 600) + JSON.stringify(await page.evaluate(() => [UI.item.tb, UI.item.input, window.__calls.slice(-3)])));
    if ((await page.evaluate(() => window.__spoken.length)) < 2) fail('follow-up was not spoken aloud');
    await fill(page, 'f-item-input', 'Because of substitution'); await act(page, 'tb-probe-answer'); await act(page, 'tb-probe-skip');
    step = 'score'; let html = await page.locator('#view').innerHTML();
    if (!/68<small>/.test(html) || !/checklist/.test(html) || !/Re-teach of the gap/.test(html)) fail('score, checklist or re-teach missing (78 minus one hint should be 68)');
    await act(page, 'tb-retry'); await fill(page, 'f-item-input', 'second try: only price changed'); await act(page, 'tb-retry-submit');
    await act(page, 'item-guess'); await act(page, 'item-unguess'); await act(page, 'item-explain'); await act(page, 'ex-explain'); await fill(page, 'f-ex-ask', 'Why?'); await act(page, 'ex-ask'); await act(page, 'close-modal');
    await act(page, 'item-next');
    const tb = await page.evaluate(id => { const c = S.cards[id + 'i0t']; return { first: c.firstScore, reps: c.fsrs.reps, due: c.fsrs.due, sib: S.cards[id + 'i0c0'].fsrs.due, xp: S.meta.main.xp, tbs: S.meta.main.stats.teachbacks }; }, lid);
    if (tb.first !== 68 || tb.reps !== 1 || !tb.due || !tb.sib || !(tb.xp > 0) || tb.tbs !== 1) fail('teach-back was not recorded: ' + JSON.stringify(tb));
    await goto(page, 'learn-' + info.uid + 'L1'); await act(page, 'learn-explain'); await fill(page, 'f-item-input', 'my lesson answer'); await act(page, 'tb-submit'); await act(page, 'tb-probe-skip'); await act(page, 'tb-probe-skip'); await act(page, 'tb-skip-retry'); await act(page, 'item-next');
    if (!(await page.evaluate(u => !!S.units[u].passedAt, info.uid))) fail('unit did not pass at average ' + await page.evaluate(u => JSON.stringify(Object.values(S.cards).filter(c => c.unitId === u && c.type === 'teachback').map(c => c.firstScore)), info.uid));

    /* Review session: make everything due, answer one of each kind, check FSRS state and the cap. */
    await page.evaluate(() => { const t = L.studyDay(); for (const [id, c] of Object.entries(S.cards)) if (c.status === 'active') put('cards', id, Object.assign({}, c, { fsrs: Object.assign({}, c.fsrs, { due: t, reps: c.fsrs.reps || 1, s: c.fsrs.s || 2, d: c.fsrs.d || 5, last: L.addDays(t, -2) }) })); });
    await goto(page, 'review'); await act(page, 'review-start');
    const before = await page.evaluate(() => JSON.parse(JSON.stringify(S.cards)));
    let seen = 0, kinds = {};
    while (seen++ < 20) {
      const st = await page.evaluate(() => (S.session && UI.item ? { type: S.cards[UI.item.cardId].type, id: UI.item.cardId, second: S.session.idx >= S.session.firstCount } : null));
      if (!st) break; step = 'review ' + st.type; kinds[st.type] = 1;
      if (st.type === 'flash') { await act(page, 'item-reveal'); await act(page, 'item-rate', '[data-r="good"]'); }
      else if (st.type === 'teachback') { await fill(page, 'f-item-input', 'second explanation'); await act(page, 'tb-submit'); await act(page, 'tb-probe-skip'); await act(page, 'tb-probe-skip'); }
      else { await fill(page, 'f-item-input', 'an answer'); await act(page, 'item-submit'); if (!st.second && st.type === 'short' && !kinds.overrode) { kinds.overrode = 1; await fill(page, 'f-item-note', 'I said the same thing'); await act(page, 'item-override'); } }
      await act(page, 'item-next');
    }
    const after = await page.evaluate(() => ({ cards: JSON.parse(JSON.stringify(S.cards)), day: dayRec(), mistakes: Object.keys(S.mistakes).length, done: !UI.item }));
    const changed = Object.keys(before).filter(id => before[id].fsrs.due !== after.cards[id].fsrs.due);
    if (!after.done || changed.length < 4 || !kinds.flash || !kinds.teachback || !kinds.short) fail('review session did not complete: ' + JSON.stringify({ changed: changed.length, kinds }));
    for (const id of changed) { const a = after.cards[id]; if (!(a.fsrs.due > before[id].fsrs.due) || a.fsrs.reps !== before[id].fsrs.reps + 1) fail('FSRS state not advanced for ' + id); }
    if (after.day.units < 6 || after.day.units > 20 || !after.day.done) fail('daily units or streak day wrong: ' + JSON.stringify(after.day));
    if (!Object.values(after.cards).some(c => c.overrides === 1 && c.lastRating === 'good')) fail('override was not recorded');
    if (!after.mistakes) fail('misses were not logged to the notebook');
    await goto(page, 'review');

    /* Tests, cram, games, tutor, map, guide, reports, progress, settings. */
    await goto(page, 'test-' + cid); await act(page, 'test-start'); await act(page, 'test-pick', '[data-k="1"]'); await act(page, 'test-nav', '[data-d="1"]'); await act(page, 'test-pick', '[data-k="0"]'); await act(page, 'test-finish'); await act(page, 'confirm-yes');
    step = 'test result'; await page.waitForFunction(() => UI.test && UI.test.phase === 'done');
    const tr = await page.evaluate(() => ({ correct: UI.test.result.correct, total: UI.test.result.total, saved: Object.values(S.tests)[0], newCards: Object.values(S.cards).filter(c => c.fromTest).length }));
    if (tr.correct !== 1 || tr.total !== 15 || !tr.saved || tr.newCards !== 14) fail('test scoring wrong: ' + JSON.stringify(tr));
    await act(page, 'test-override'); await act(page, 'test-guess');
    if ((await page.evaluate(() => UI.test.result.correct)) !== 1) fail('override then guess should leave 1 correct');
    await act(page, 'test-new'); await act(page, 'set', '[data-val="false"]'); await act(page, 'test-start'); await fill(page, 'f-test-answers-0', 'my answer'); await act(page, 'test-finish'); await act(page, 'confirm-yes'); await page.waitForFunction(() => UI.test && UI.test.phase === 'done');
    await goto(page, 'course-' + cid); await goto(page, 'cram-' + cid); await act(page, 'cram-on'); await page.waitForFunction(() => S.route === 'cram'); await goto(page, 'cram-' + cid);
    if (!(await page.evaluate(c => (S.courses[c].cramIdeas || []).length, cid))) fail('cram selection empty');
    await act(page, 'cram-start'); await act(page, 'session-end');
    await goto(page, 'games-' + cid);
    for (const kind of ['match', 'fill', 'speed', 'board']) {
      await goto(page, 'games-' + cid); await act(page, 'game-start', `[data-kind="${kind}"]`); step = 'game ' + kind;
      if (kind === 'match') { const ks = await page.evaluate(() => UI.game.left.map(x => x.k)); await page.locator(`[data-side="l"][data-k="${ks[0]}"]`).click(); await page.locator(`[data-side="r"][data-k="${ks[1]}"]`).click(); for (const k of ks) { await page.locator(`[data-side="l"][data-k="${k}"]`).click(); await page.locator(`[data-side="r"][data-k="${k}"]`).click(); } await page.waitForFunction(() => UI.game.done); }
      if (kind === 'fill') { await fill(page, 'f-game-input', 'quantity'); await act(page, 'fill-check'); await act(page, 'fill-next'); await fill(page, 'f-game-input', 'wrong'); await act(page, 'fill-check'); await act(page, 'fill-override'); await act(page, 'fill-next'); }
      if (kind === 'speed') { await act(page, 'speed-go'); await act(page, 'speed-show'); await act(page, 'speed-mark', '[data-ok="1"]'); await act(page, 'speed-show'); await act(page, 'speed-mark', '[data-ok="0"]'); }
      if (kind === 'board') { await act(page, 'board-open'); await act(page, 'board-show'); await act(page, 'board-mark', '[data-ok="1"]'); }
      await goto(page, 'games-' + cid); await act(page, 'game-quit');
    }
    await act(page, 'tutor-open'); await fill(page, 'f-tutorIn', 'What is demand? ' + XSS); await act(page, 'tutor-send');
    step = 'tutor'; if (!/General knowledge, not from your material/.test(await page.locator('#overlays').innerHTML())) fail('tutor did not label general knowledge');
    await act(page, 'voice-mute'); await act(page, 'tutor-close');
    await goto(page, 'map-' + cid); await page.locator('.mnode.unit[data-act]').first().click(); await page.waitForTimeout(40); await page.locator('.mnode[data-act]:not(.unit)').first().click(); await act(page, 'map-master'); await act(page, 'map-master');
    await goto(page, 'guide-' + info.uid); await page.waitForTimeout(150); await goto(page, 'guide-' + info.uid); await act(page, 'guide-make'); await act(page, 'recap-make'); await act(page, 'guide-export');
    if (!(await page.evaluate(() => window.__saved.some(f => /\.md$/.test(f))))) fail('Obsidian export did not save');
    await goto(page, 'reports'); await act(page, 'card-approve'); await act(page, 'card-edit'); await act(page, 'card-save'); await act(page, 'rep-toggle'); await act(page, 'rep-copy'); await act(page, 'close-modal');
    await goto(page, 'notebook'); await act(page, 'nb-review'); await act(page, 'session-end'); await goto(page, 'notebook');
    await goto(page, 'weekly'); await act(page, 'weekly-ai'); await goto(page, 'stats'); await goto(page, 'badges'); await goto(page, 'progress'); await goto(page, 'more');
    await goto(page, 'prefs'); await act(page, 'pref', '[data-val="deep"]'); await act(page, 'pref-rest', '[data-d="0"]'); await act(page, 'backup-make');
    const pf = await page.evaluate(() => ({ g: S.settings.global, saved: window.__saved }));
    if (pf.g.probing !== 'deep' || pf.g.restDays[0] !== 0 || !pf.saved.some(f => /backup.*\.json$/.test(f))) fail('settings or backup failed');
    const rt = await page.evaluate(async () => { const b = await buildBackup(), n = Object.keys(S.cards).length; const ck = checkBackup(JSON.parse(JSON.stringify(b))); await drop('cards', Object.keys(S.cards)[0]); await restoreBackup(b, true); await new Promise(r => setTimeout(r, 60)); return { ok: ck.ok, same: Object.keys(S.cards).length === n, lessons: Object.keys(b.data.lessons).length, text: Object.keys(b.data.srctext).length, bad: checkBackup({ app: 'x' }).ok }; });
    if (!rt.ok || !rt.same || rt.lessons !== 2 || rt.text < 2 || rt.bad) fail('backup and restore round trip failed: ' + JSON.stringify(rt));
    await goto(page, 'home'); await goto(page, 'courses'); await goto(page, 'course-' + cid); await act(page, 'set', '[data-val="options"]'); await act(page, 'course-opt', '[data-val="strict"]'); await act(page, 'set', '[data-val="material"]');
    const calls = await page.evaluate(() => [...new Set(window.__calls)]);
    for (const t of ['DIGEST', 'SYLLABUS', 'LESSON', 'SELF-CHECK', 'PLACEMENT', 'PROBE', 'TEACH-BACK GRADE', 'HINT', 'GRADE', 'PRACTICE TEST', 'GRADE TEST', 'CRAM SELECTION', 'EXPLAIN', 'QUESTION', 'AUDIO RECAP', 'STUDY GUIDE', 'WEEKLY REPORT', 'TUTOR']) if (!calls.includes(t)) fail('prompt never used: ' + t);
    if (calls.includes('?')) fail('a prompt had no TASK line');

    /* 3. Phone width: same data, every route, no sideways scroll. */
    await page.setViewportSize({ width: 390, height: 800 });
    for (const r of ['home', 'review', 'courses', 'newcourse', 'course-' + cid, 'syllabus-' + cid, 'learn-' + lid, 'map-' + cid, 'test-' + cid, 'cram-' + cid, 'games-' + cid, 'guide-' + info.uid, 'placement-' + cid, 'notebook', 'reports', 'weekly', 'stats', 'badges', 'prefs', 'more']) await goto(page, r);
    await goto(page, 'course-' + cid); await act(page, 'set', '[data-val="options"]'); await act(page, 'course-delete'); await act(page, 'confirm-yes'); await page.waitForTimeout(400);
    const left = await page.evaluate(() => ({ c: Object.keys(S.courses).length, u: Object.keys(S.units).length, k: Object.keys(S.cards).length, s: Object.keys(S.sources).length, t: Object.keys(window.__db.srctext || {}).length, l: Object.keys(window.__db.lessons || {}).length }));
    if (left.c || left.u || left.k || left.s || left.t || left.l) fail('deleting a course left data behind: ' + JSON.stringify(left));
    step = 'done';
  } finally { await browser.close(); }
  if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('smoke: all checks passed');
})().catch(e => { console.error('SMOKE FAILED: ' + e.message); if (errors.length) console.error(errors.join('\n')); process.exit(1); });
