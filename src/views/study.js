/* Practice tests, cram mode, four games and the tutor drawer. All of these sit on top of the daily cap. */
function courseIdeas(cid) {
  const us = unitsOf(cid).filter(u => u.status === 'ready');
  return us.map(u => ({ id: u.id, title: u.title, ideas: tbCards(u.id).map(c => ({ title: c.ideaTitle, points: (c.rubric || []).join('; ').slice(0, 400) })) })).filter(u => u.ideas.length);
}
function passPercent(course) {
  const ex = (course && course.exam) || {}, s = String(ex.passing || '');
  const of = /(\d+(?:\.\d+)?)\s*(?:of|\/|out of)\s*(\d+)/i.exec(s);
  if (of && +of[2] > 0) return L.clamp(Math.round(100 * of[1] / of[2]), 1, 100);
  const pc = /(\d+(?:\.\d+)?)\s*%/.exec(s); if (pc) return L.clamp(Math.round(+pc[1]), 1, 100);
  const n = /^\s*(\d+(?:\.\d+)?)\s*$/.exec(s);
  if (n && ex.questions && +n[1] <= ex.questions) return L.clamp(Math.round(100 * n[1] / ex.questions), 1, 100);
  return 70;
}
function fmtClock(sec) { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); }

/* ---------- Practice tests ---------- */
async function testGenerate(count) {
  const t = UI.test, c = S.courses[t.cid], units = courseIdeas(t.cid);
  const r = await task('testgen', t.qs.length ? 'Writing the next questions…' : 'Writing your test…', signal => ai(P.test({ course: c, units, n: count, mc: t.mc, avoid: t.qs.slice(-25).map(q => q.q.slice(0, 90)), offset: t.qs.length }), { signal }));
  if (!r || UI.test !== t) return false;
  const qs = L.arr(r.questions, count).map(q => L.validateTestQ(q, t.mc)).filter(Boolean).map(q => Object.assign(q, { unitId: units[q.unit] ? units[q.unit].id : null }));
  if (!qs.length) { toast(AI_COPY.invalid_json, true); return false; }
  t.qs.push(...qs); return true;
}
function testMaybeMore() { const t = UI.test; if (t && t.phase === 'run' && t.qs.length < t.cfg.n && t.qs.length - t.i <= 8 && !isBusy('testgen')) testGenerate(Math.min(20, t.cfg.n - t.qs.length)).then(() => render()); }
async function testMissEffects(t, it) {
  const c = S.courses[t.cid]; if (!c) return;
  const answer = it.type === 'mc' ? it.options[it.answer] : it.answer;
  await pullIdea(t.cid, it.unitId, it.idea);
  const mid = L.uid('m');
  await put('mistakes', mid, { cardId: null, courseId: t.cid, unitId: it.unitId, ideaTitle: L.str(it.idea, 160), prompt: L.str(it.q, 600), given: L.str(it.given, 800), why: L.str(it.explanation, 800), kind: 'test', guess: !!it.guess, day: today(), at: Date.now() }).catch(() => { });
  it.mistakeId = mid;
  if (t.newCards < 15) {
    const id = L.uid('k'); t.newCards++;
    await put('cards', id, L.newCard({ courseId: t.cid, unitId: it.unitId, ideaTitle: L.str(it.idea, 160), type: 'short', prompt: it.q, answer, rubric: [], explanation: it.explanation, quote: '', origin: 'added', fromTest: true, difficulty: it.difficulty, createdAt: Date.now(), fsrs: Object.assign(L.newFsrs(), { due: L.addDays(today(), 1) }) })).catch(() => { });
    it.missCardId = id;
  }
}
async function testSave(t) {
  const sc = L.scoreTest(t.items);
  t.result = sc;
  const doc = { courseId: t.cid, kind: t.kind, mc: t.mc, startedAt: t.startedAt, finishedAt: t.finishedAt, minutes: Math.round((t.finishedAt - t.startedAt) / 60000), percent: sc.percent, total: sc.total, correct: sc.correct, passMark: t.pass, passed: sc.percent >= t.pass, byUnit: sc.byUnit, planned: t.cfg.n };
  await put('tests', t.id, doc).catch(() => { });
  if (doc.passed && !t.passAwarded) { t.passAwarded = true; await bumpMeta(m => { if (t.kind === 'full') m.stats.simsPassed++; else m.stats.testsPassed++; }); }
}
async function testFinish() {
  const t = UI.test; if (!t || t.phase !== 'run') return;
  t.phase = 'grading'; t.finishedAt = Date.now(); render();
  const items = t.qs.map((q, i) => Object.assign({}, q, { given: q.type === 'mc' ? (t.answers[i] == null ? '' : q.options[t.answers[i]]) : L.str(t.answers[i], 2000), ok: q.type === 'mc' ? t.answers[i] === q.answer : false, graded: q.type === 'mc' }));
  const written = items.map((it, n) => ({ it, n })).filter(x => x.it.type === 'short');
  for (const x of written) if (!x.it.given.trim()) { x.it.graded = true; x.it.why = 'Left blank.'; }
  const todo = written.filter(x => !x.it.graded);
  for (let i = 0; i < todo.length && aiOn(); i += 25) {
    const part = todo.slice(i, i + 25);
    const r = await task('testgrade', `Grading written answers (${Math.min(i + 25, todo.length)} of ${todo.length})…`, signal => ai(P.gradeBatch({ items: part.map(x => ({ n: x.n, q: x.it.q, answer: x.it.answer, given: x.it.given })), strictness: settingsFor(t.cid).strictness }), { signal }));
    if (!r) break;
    for (const g of L.arr(r.results, 30)) { const x = part.find(p => p.n === Number(g && g.n)); if (x) { x.it.ok = g.ok === true; x.it.why = L.str(g.why, 300); x.it.graded = true; } }
  }
  t.items = items; t.newCards = 0; t.pass = passPercent(S.courses[t.cid]);
  for (const it of items) if (!it.ok && it.graded) await testMissEffects(t, it);
  const sc = L.scoreTest(items);
  await bumpMeta((m, day) => addXp(m, day, sc.correct * L.xpFor({ kind: 'testq' }) + L.xpFor({ kind: t.kind === 'full' ? 'fullTest' : 'quickTest' })));
  await testSave(t);
  t.phase = 'done'; render(); window.scrollTo(0, 0);
}
VIEWS.test = cid => {
  const c = S.courses[cid]; if (!c) return emptyBox('This course no longer exists.');
  let t = UI.test;
  if (!t || t.cid !== cid) t = UI.test = { cid, phase: 'setup', kind: 'quick', mc: /multiple|choice|mc/i.test((c.exam || {}).style || ''), qs: [], answers: [], i: 0 };
  const head = backLink('course-' + cid, c.title);
  if (t.phase === 'setup') {
    const units = courseIdeas(cid), full = L.examConfig(c, 'full'), past = list('tests').filter(x => x.courseId === cid).sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 6);
    return `<div class="reader stack-lg">${head}<div class="stack"><h1>Practice test</h1><p class="muted">Questions are written fresh each time from the units you've built. Misses are explained and go into review. Tests don't use your 20 daily units.</p></div>
    ${units.length ? `<div class="panel stack"><div class="field"><span>Length</span>${seg('test.kind', [['quick', 'Quick: 15 questions, 18 min'], ['full', `Full exam simulation: ${full.n} questions, ${full.minutes} min`]], t.kind)}</div>
      <div class="field"><span>Question format</span>${seg('test.mc', [['true', 'Multiple choice'], ['false', 'Written answers']], String(t.mc))}<span class="small muted">Chosen per test. Daily review always stays recall-based.</span></div>
      ${t.kind === 'full' ? `<p class="small muted">The first 20 questions are ready in about a minute; the rest are written in batches while you answer. The timer starts when the first batch is ready.</p>` : ''}
      <div class="row">${aiOn() ? `<button class="btn primary" data-act="test-start" ${isBusy('testgen') ? 'disabled' : ''}>Start test</button>` : needAI}</div>${busyHtml('testgen')}</div>` : emptyBox('Build at least one unit first. Tests are written from the ideas in built units.')}
    ${past.length ? `<div class="panel stack"><h3>Past tests</h3><div class="list">${past.map(x => `<div class="row between"><span>${new Date(num(x.finishedAt)).toLocaleDateString()} · ${x.kind === 'full' ? 'Full simulation' : 'Quick test'} · ${num(x.total)} questions</span><span class="row"><span class="num">${num(x.percent)}%</span>${chip(x.passed ? 'Passed' : 'Below ' + num(x.passMark) + '%', x.passed ? 'good' : 'due')}</span></div>`).join('')}</div></div>` : ''}</div>`;
  }
  if (t.phase === 'grading') return `<div class="reader stack-lg"><h1>Scoring your test</h1>${busyHtml('testgrade') || '<div class="status-line"><span class="spinner"></span>Saving results…</div>'}</div>`;
  if (t.phase === 'run') {
    const q = t.qs[t.i], answered = t.qs.filter((x, i) => x.type === 'mc' ? t.answers[i] != null : (t.answers[i] || '').trim()).length;
    const waiting = !q;
    if (t.expired) return `<div class="reader stack-lg"><div class="stack"><h1>Time is up</h1><p class="muted">${answered} of ${t.qs.length} questions answered. Your answers are kept as they are.</p></div><div><button class="btn primary" data-act="test-score">Score my test</button></div></div>`;
    return `<div class="reader stack"><div class="row between"><span class="small muted num">Question ${Math.min(t.i + 1, t.cfg.n)} of ${t.cfg.n}${t.qs.length < t.cfg.n ? ` · ${t.qs.length} written so far` : ''}</span><span class="chip due num" id="test-timer" aria-label="Time left">${fmtClock((t.endsAt - Date.now()) / 1000)}</span></div>${bar(100 * t.i / t.cfg.n)}
    ${waiting ? `<div class="qcard">${isBusy('testgen') ? busyHtml('testgen') : `<p>The next questions haven't been written yet.</p><div><button class="btn" data-act="test-more">Write more questions</button></div>`}</div>`
      : `<div class="qcard"><div class="qprompt">${inline(q.q)}</div>${q.type === 'mc' ? `<div class="options">${q.options.map((o, k) => `<button type="button" class="option ${t.answers[t.i] === k ? 'on' : ''}" data-act="test-pick" data-k="${k}" aria-pressed="${t.answers[t.i] === k}"><span class="letter">${'ABCDE'[k]}</span><span>${inline(o)}</span></button>`).join('')}</div>`
        : `<textarea id="f-test-answers-${t.i}" data-bind="test.answers.${t.i}" rows="4" placeholder="Your answer">${esc(t.answers[t.i] || '')}</textarea>`}</div>`}
    <div class="row between"><button class="btn" data-act="test-nav" data-d="-1" ${t.i ? '' : 'disabled'}>Back</button><div class="row">${t.i + 1 < t.cfg.n ? `<button class="btn primary" data-act="test-nav" data-d="1" ${waiting ? 'disabled' : ''}>Next</button>` : ''}<button class="btn ${t.i + 1 >= t.cfg.n ? 'primary' : ''}" data-act="test-finish">Finish test</button></div></div>
    <p class="small muted">${answered} of ${t.qs.length} answered.</p></div>`;
  }
  const r = t.result, us = unitsOf(cid);
  return `<div class="stack-lg">${head}<div class="stack"><span class="eyebrow">${t.kind === 'full' ? 'Full exam simulation' : 'Quick test'}</span><h1>${r.percent}% <span class="muted" style="font-size:1rem">· ${r.correct} of ${r.total}</span></h1><div class="row">${chip(r.percent >= t.pass ? 'Passed' : `Below the ${t.pass}% pass mark`, r.percent >= t.pass ? 'good' : 'due')}${t.qs.length < t.cfg.n ? chip(`Scored on the ${t.qs.length} questions written before you finished`) : ''}</div></div>
  ${r.weakUnits.length ? `<div class="panel stack"><h3>Weak units</h3>${r.weakUnits.map(u => `<div class="hbar"><span class="lbl">${esc((S.units[u] || {}).title || 'Unit')}</span>${bar(r.byUnit[u].pct, 'due')}<span class="num small">${r.byUnit[u].pct}%</span></div>`).join('')}</div>` : ''}
  <div class="stack"><h2>Every question</h2>${t.items.map((it, i) => `<div class="qcard"><div class="row between"><span class="small muted">Question ${i + 1}${it.unitId && S.units[it.unitId] ? ' · ' + esc(S.units[it.unitId].title) : ''}</span>${chip(it.guess ? 'Guess: counted as a miss' : it.ok ? 'Correct' : it.graded ? 'Missed' : 'Not graded', it.ok && !it.guess ? 'good' : it.graded ? 'bad' : 'due')}</div>
    <div class="qprompt">${inline(it.q)}</div><div class="answer-box"><span class="lbl">You answered</span><div class="body small">${it.given ? paras(it.given) : '<span class="muted">Nothing</span>'}</div></div>
    ${!it.ok || it.guess ? `<div class="answer-box"><span class="lbl">Correct answer</span><div class="body">${paras(it.type === 'mc' ? it.options[it.answer] : it.answer)}</div></div><div class="miss small"><b>Why</b> ${inline(it.explanation || it.why || 'No explanation was written for this question.')}</div>` : it.explanation ? `<div class="small muted">${inline(it.explanation)}</div>` : ''}
    <div class="row">${it.missCardId && S.cards[it.missCardId] ? `<button class="btn sm" data-act="test-explain" data-i="${i}">Explain or ask</button>` : ''}${!it.ok ? `<button class="btn sm" data-act="test-override" data-i="${i}">I was right: mark correct</button>` : !it.guess ? `<button class="btn sm ghost" data-act="test-guess" data-i="${i}">That was a guess</button>` : ''}</div></div>`).join('')}</div>
  <div class="row"><button class="btn primary" data-act="test-new">New test</button><a class="btn" href="#course-${cid}">Back to the course</a></div></div>`;
};
Object.assign(ACT, {
  'test-start': async () => {
    const t = UI.test; t.mc = String(t.mc) === 'true'; t.cfg = L.examConfig(S.courses[t.cid], t.kind); t.qs = []; t.answers = []; t.i = 0; t.id = L.uid('x');
    if (!(await testGenerate(Math.min(20, t.cfg.n)))) return;
    t.startedAt = Date.now(); t.endsAt = t.startedAt + t.cfg.minutes * 60000; t.phase = 'run'; render(); window.scrollTo(0, 0);
  },
  'test-pick': el => { const t = UI.test; t.answers[t.i] = +el.dataset.k; render(); },
  'test-nav': el => { const t = UI.test; t.i = L.clamp(t.i + (+el.dataset.d), 0, t.cfg.n - 1); render(); window.scrollTo(0, 0); testMaybeMore(); },
  'test-more': () => testMaybeMore(),
  'test-score': () => testFinish(),
  'test-finish': () => { const t = UI.test, blank = t.qs.filter((x, i) => x.type === 'mc' ? t.answers[i] == null : !(t.answers[i] || '').trim()).length; if (blank || t.qs.length < t.cfg.n) confirmBox('Finish the test now?', `${blank ? plural(blank, 'question') + ' unanswered. ' : ''}${t.qs.length < t.cfg.n ? `Only ${t.qs.length} of ${t.cfg.n} questions were written; you are scored on those.` : ''}`, 'Finish', testFinish, false); else testFinish(); },
  'test-override': async el => {
    const t = UI.test, it = t.items[+el.dataset.i]; if (!it || it.ok) return;
    it.ok = true; it.graded = true; it.overridden = true;
    if (it.missCardId) { await drop('cards', it.missCardId).catch(() => { }); it.missCardId = null; }
    if (it.mistakeId) { await drop('mistakes', it.mistakeId).catch(() => { }); it.mistakeId = null; }
    await testSave(t); render();
  },
  'test-guess': async el => { const t = UI.test, it = t.items[+el.dataset.i]; if (!it || !it.ok) return; it.ok = false; it.guess = true; await testMissEffects(t, it); await bumpMeta((m, day) => { const x = L.xpFor({ kind: 'testq' }); m.xp = Math.max(0, (m.xp || 0) - x); day.xp = Math.max(0, (day.xp || 0) - x); }); await testSave(t); render(); },
  'test-explain': el => { const it = UI.test.items[+el.dataset.i]; if (it && it.missCardId && S.cards[it.missCardId]) openExplain(it.missCardId, false); },
  'test-new': () => { const cid = UI.test.cid; UI.test = null; go('test-' + cid); }
});
function tickTest() {
  const t = UI.test; if (!t || t.phase !== 'run' || S.route !== 'test') return;
  const left = (t.endsAt - Date.now()) / 1000, el = $('#test-timer');
  if (el) el.textContent = fmtClock(left);
  if (left <= 0 && !t.expired) { t.expired = true; UI.modal = null; toast('Time is up.'); render(); }
}

/* ---------- Cram mode ---------- */
function cramCards(cid) {
  const c = S.courses[cid], all = cardsOf('courseId', cid).filter(x => x.status === 'active' && !x.mastered && x.fsrs && x.fsrs.reps > 0);
  if (c && c.cramIdeas && c.cramIdeas.length) { const want = new Set(c.cramIdeas); const picked = all.filter(x => want.has(x.ideaId)); if (picked.length) return L.cramSelect(picked, 40); }
  return L.cramSelect(all, 40);
}
async function cramPick(cid) {
  const c = S.courses[cid], ideas = {};
  for (const k of cardsOf('courseId', cid).filter(x => x.type === 'teachback' && x.status === 'active')) ideas[k.ideaId] = { id: k.ideaId, unit: (S.units[k.unitId] || {}).title || '', title: k.ideaTitle, score: k.lastScore == null ? null : k.lastScore, misses: cardsOf('ideaId', k.ideaId).reduce((n, x) => n + (x.misses || 0), 0) };
  const listIdeas = Object.values(ideas).slice(0, 200);
  if (!aiOn() || !listIdeas.length) return;
  const r = await task('cram-' + cid, 'Picking the highest-yield ideas…', signal => ai(P.cram({ course: c, ideas: listIdeas, limit: 20 }), { signal }));
  if (!r) return;
  const ids = L.arr(r.ids, 20).map(x => L.str(x, 80)).filter(x => ideas[x]);
  if (ids.length) await patch('courses', cid, { cramIdeas: ids, cramPlan: L.str(r.plan, 400), cramAt: Date.now() }).catch(() => { });
}
VIEWS.cram = cid => {
  const c = S.courses[cid]; if (!c) return emptyBox('This course no longer exists.');
  const cs = cramCards(cid), p = coursePace(Object.assign({ id: cid }, c));
  return `<div class="reader stack-lg">${backLink('course-' + cid, c.title)}<div class="stack"><span class="eyebrow">Cram mode${p.mode === 'deadline' ? ` · ${p.daysLeft} days left` : ''}</span><h1>High-yield review</h1><p class="muted">Only the ideas most likely to matter and where you're weakest. Cram sits on top of daily review: a miss pulls that card earlier, a hit doesn't push it later.</p></div>
  ${c.cram ? `<div class="panel stack">${c.cramPlan ? `<div class="added small">${addedTag('Claude\'s suggestion')}${esc(c.cramPlan)}</div>` : ''}<p>${cs.length ? `${plural(cs.length, 'item')} selected${c.cramIdeas && c.cramIdeas.length ? ` from ${plural(c.cramIdeas.length, 'high-yield idea')} Claude picked` : ', ranked by your misses and scores'}.` : 'Nothing to cram yet. Finish at least one lesson first.'}</p>
    <div class="row">${cs.length ? `<button class="btn primary" data-act="cram-start" data-cid="${cid}">Start cram session</button>` : ''}${aiOn() ? `<button class="btn" data-act="cram-pick" data-cid="${cid}" ${isBusy('cram-' + cid) ? 'disabled' : ''}>Re-pick with Claude</button>` : ''}<button class="btn ghost" data-act="cram-off" data-cid="${cid}">Turn off cram mode</button></div>${busyHtml('cram-' + cid)}</div>`
    : `<div class="panel stack"><p>Cram mode is off for this course.</p><div><button class="btn primary" data-act="cram-on" data-cid="${cid}">Turn on cram mode</button></div></div>`}</div>`;
};
Object.assign(ACT, {
  'cram-on': async el => { const cid = el.dataset.cid; await patch('courses', cid, { cram: true }).catch(() => { }); go('cram-' + cid); await cramPick(cid); render(); },
  'cram-off': async el => { await patch('courses', el.dataset.cid, { cram: false }).catch(() => { }); go('course-' + el.dataset.cid); },
  'cram-pick': async el => { await cramPick(el.dataset.cid); render(); },
  'cram-start': el => { const cs = cramCards(el.dataset.cid); if (cs.length) startSession({ kind: 'cram', title: 'Cram', ids: L.interleave(cs).map(c => c.id), mode: 'light', bucket: 'none', back: 'cram-' + el.dataset.cid }); }
});

/* ---------- Games ---------- */
const GAMES = { match: ['Match', 'Pair terms with definitions against the clock.'], fill: ['Fill the blank', 'A key word is removed from a sentence about each idea.'], speed: ['Speed round', '60 seconds of rapid recall. Beat your best.'], board: ['Quiz board', 'Categories are your units; points rise with difficulty.'] };
function gamePool(cid) {
  const cards = cardsOf('courseId', cid).filter(c => c.status === 'active');
  return { terms: list('glossary').filter(g => g.courseId === cid), cloze: cards.filter(c => c.type === 'teachback' && c.cloze), quick: cards.filter(c => c.type === 'flash' || c.type === 'short'), cards };
}
async function gameBest(key, value, lowerWins) {
  const cur = metaMain().best[key];
  if (cur == null || (lowerWins ? value < cur : value > cur)) { await bumpMeta(m => { m.best[key] = value; }); return true; }
  return false;
}
async function gameResult(cardId, ok, cid, ideaTitle) {
  if (cardId && S.cards[cardId]) await commitCard(cardId, { rating: ok ? 'good' : 'again', mode: 'light', bucket: 'none', kind: 'game' });
  else { if (!ok) await pullIdea(cid, null, ideaTitle); else await bumpMeta((m, d) => addXp(m, d, L.xpFor({ kind: 'game' }))); }
}
VIEWS.games = cid => {
  const c = S.courses[cid]; if (!c) return emptyBox('This course no longer exists.');
  const g = UI.game && UI.game.cid === cid ? UI.game : null, pool = gamePool(cid), best = metaMain().best;
  const head = backLink(g ? 'games-' + cid : 'course-' + cid, g ? 'Games' : c.title);
  if (!g) {
    const ready = { match: pool.terms.length >= 4, fill: pool.cloze.length >= 2, speed: pool.quick.length >= 4, board: pool.quick.length >= 4 };
    const bestText = k => { const b = best[k + '-' + cid]; return b == null ? '' : k === 'match' ? `Best: ${fmtClock(b)}` : `Best: ${b}`; };
    return `<div class="stack-lg">${head}<div class="stack"><h1>Games</h1><p class="muted">Games run on top of daily review. A miss pulls that idea's review earlier; a hit doesn't push it later.</p></div>
    <div class="grid">${Object.entries(GAMES).map(([k, [name, desc]]) => `<div class="panel stack game-${k}"><h3>${name}</h3><p class="small muted">${desc}</p><div class="row between"><button class="btn primary sm" data-act="game-start" data-kind="${k}" data-cid="${cid}" ${ready[k] ? '' : 'disabled'}>Play</button><span class="small muted num">${ready[k] ? esc(bestText(k)) : 'Finish more lessons to unlock'}</span></div></div>`).join('')}</div></div>`;
  }
  let body = '';
  if (g.kind === 'match') {
    const cell = (side, x) => `<button type="button" class="tile ${g.matched[x.k] ? 'matched' : ''} ${g.sel && g.sel.side === side && g.sel.k === x.k ? 'on' : ''} ${g.bad && g.bad[side] === x.k ? 'bad' : ''}" data-act="match-pick" data-side="${side}" data-k="${esc(x.k)}" ${g.matched[x.k] ? 'disabled' : ''}>${esc(x.text)}</button>`;
    body = g.done ? `<div class="panel stack"><h2>Matched in ${fmtClock(g.ms / 1000)}</h2><p>${plural(g.wrong, 'wrong pair')}.${g.isBest ? ' New best time.' : ''}</p></div>`
      : `<div class="row between"><span class="chip num" id="game-clock">${fmtClock((Date.now() - g.start) / 1000)}</span><span class="small muted">${plural(g.wrong, 'wrong pair')}</span></div><div class="matchgrid"><div class="stack tight">${g.left.map(x => cell('l', x)).join('')}</div><div class="stack tight">${g.right.map(x => cell('r', x)).join('')}</div></div>`;
  } else if (g.kind === 'fill') {
    const it = g.items[g.i];
    body = g.done ? `<div class="panel stack"><h2>${g.score} of ${g.items.length}</h2>${g.isBest ? '<p>New best.</p>' : ''}</div>`
      : `<div class="small muted num">${g.i + 1} of ${g.items.length} · ${g.score} right</div><div class="qcard"><span class="eyebrow">${esc(it.ideaTitle || '')}</span><div class="qprompt">${inline(it.blanked)}</div>
        ${g.checked ? `<div class="verdict ${g.ok ? 'correct' : 'incorrect'}"><b>${g.ok ? 'Correct' : 'The word was: ' + esc(it.answer)}</b>${g.ok ? '' : `<span class="small">You wrote: ${esc(g.input || 'nothing')}</span>`}</div><div class="row">${g.ok ? '' : '<button class="btn sm" data-act="fill-override">I was right</button>'}<button class="btn primary" data-act="fill-next">Next</button></div>`
          : `<div class="row nowrap"><input type="text" id="f-game-input" data-bind="game.input" value="${esc(g.input)}" placeholder="The missing word" maxlength="80" autocomplete="off"><button class="btn primary" data-act="fill-check">Check</button></div>`}</div>`;
  } else if (g.kind === 'speed') {
    const c2 = S.cards[g.ids[g.i]];
    body = g.done ? `<div class="panel stack"><h2>${g.score} recalled in 60 seconds</h2><p>${plural(g.missed, 'miss', 'misses')}.${g.isBest ? ' New best.' : ''}</p></div>`
      : !g.start ? `<div class="panel stack"><p>You get 60 seconds. Say the answer to yourself, show it, then mark it.</p><div><button class="btn primary" data-act="speed-go">Start the clock</button></div></div>`
        : `<div class="row between"><span class="chip due num" id="game-clock">${fmtClock((g.end - Date.now()) / 1000)}</span><span class="small muted num">${g.score} right</span></div><div class="qcard"><div class="qprompt">${inline(c2 ? c2.prompt : '')}</div>${g.shown ? `<div class="answer-box"><div class="body">${paras(c2 ? c2.answer : '')}</div></div><div class="row"><button class="btn primary" data-act="speed-mark" data-ok="1">Got it</button><button class="btn" data-act="speed-mark" data-ok="0">Missed</button></div>` : `<div><button class="btn primary" data-act="speed-show">Show answer</button></div>`}</div>`;
  } else if (g.kind === 'board') {
    if (g.open) {
      const cell = g.cols[g.open[0]].cells[g.open[1]], c2 = S.cards[cell.id];
      body = `<div class="qcard"><span class="eyebrow">${esc(g.cols[g.open[0]].title)} · ${cell.pts} points</span><div class="qprompt">${inline(c2 ? c2.prompt : '')}</div>${g.shown ? `<div class="answer-box"><div class="body">${paras(c2 ? c2.answer : '')}</div></div><div class="row"><button class="btn primary" data-act="board-mark" data-ok="1">Got it: +${cell.pts}</button><button class="btn" data-act="board-mark" data-ok="0">Missed</button></div>` : `<div><button class="btn primary" data-act="board-show">Show answer</button></div>`}</div>`;
    } else {
      const left = g.cols.reduce((n, col) => n + col.cells.filter(x => x.state == null).length, 0);
      body = `<div class="row between"><b class="num">${g.score} points</b>${left ? `<span class="small muted">${plural(left, 'square')} left</span>` : chip(g.isBest ? 'Board cleared. New best.' : 'Board cleared', 'good')}</div><div class="board-wrap"><div class="board" style="grid-template-columns:repeat(${g.cols.length},minmax(96px,1fr))">${g.cols.map(col => `<div class="bhead">${esc(col.title)}</div>`).join('')}${[0, 1, 2, 3, 4].map(r => g.cols.map((col, ci) => { const x = col.cells[r]; return x ? `<button type="button" class="bcell ${x.state === true ? 'won' : x.state === false ? 'lost' : ''}" data-act="board-open" data-c="${ci}" data-r="${r}" ${x.state == null ? '' : 'disabled'}>${x.pts}</button>` : '<span class="bcell none"></span>'; }).join('')).join('')}</div></div>`;
    }
  }
  return `<div class="reader stack-lg">${head}<div class="row between"><h1>${GAMES[g.kind][0]}</h1><button class="btn sm ghost" data-act="game-quit">Quit</button></div>${body}${g.done || (g.kind === 'board' && !g.open && g.cols.every(col => col.cells.every(x => x.state != null))) ? `<div class="row"><button class="btn primary" data-act="game-start" data-kind="${g.kind}" data-cid="${cid}">Play again</button><button class="btn" data-act="game-quit">All games</button></div>` : ''}</div>`;
};
Object.assign(ACT, {
  'game-start': el => {
    const cid = el.dataset.cid, kind = el.dataset.kind, pool = gamePool(cid), g = UI.game = { cid, kind, done: false };
    if (kind === 'match') { const ts = shuffle(pool.terms).slice(0, 6); Object.assign(g, { left: shuffle(ts.map(t => ({ k: t.id, text: t.term }))), right: shuffle(ts.map(t => ({ k: t.id, text: t.def }))), matched: {}, sel: null, wrong: 0, start: Date.now() }); }
    else if (kind === 'fill') Object.assign(g, { items: shuffle(pool.cloze).slice(0, 8).map(c => ({ cardId: c.id, ideaTitle: c.ideaTitle, answer: c.cloze.answer, blanked: c.cloze.sentence.replace(new RegExp(c.cloze.answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '_____') })), i: 0, input: '', checked: false, score: 0 });
    else if (kind === 'speed') Object.assign(g, { ids: shuffle(pool.quick).map(c => c.id), i: 0, shown: false, score: 0, missed: 0, start: 0 });
    else {
      const cols = unitsOf(cid).filter(u => u.status === 'ready').map(u => ({ title: u.title, cells: shuffle(pool.quick.filter(c => c.unitId === u.id)).slice(0, 5).sort((a, b) => (a.difficulty || 2) - (b.difficulty || 2)).map((c, i) => ({ id: c.id, pts: (i + 1) * 100, state: null })) })).filter(col => col.cells.length).slice(0, 5);
      Object.assign(g, { cols, open: null, shown: false, score: 0 });
    }
    go('games-' + cid); render();
  },
  'game-quit': () => { const cid = UI.game && UI.game.cid; UI.game = null; if (cid) go('games-' + cid); else render(); },
  'match-pick': async el => {
    const g = UI.game, side = el.dataset.side, k = el.dataset.k; g.bad = null;
    if (!g.sel || g.sel.side === side) { g.sel = { side, k }; render(); return; }
    if (g.sel.k === k) { g.matched[k] = true; g.sel = null; gameResult(null, true, g.cid); }
    else { g.wrong++; g.bad = { [side]: k, [g.sel.side]: g.sel.k }; const term = S.glossary[side === 'l' ? k : g.sel.k]; g.sel = null; gameResult(null, false, g.cid, term && term.ideaTitle); }
    if (g.left.every(x => g.matched[x.k])) { g.done = true; g.ms = Date.now() - g.start; g.isBest = await gameBest('match-' + g.cid, Math.round(g.ms / 1000), true); }
    render();
  },
  'fill-check': async () => { const g = UI.game, it = g.items[g.i]; g.ok = L.clozeMatch(g.input, it.answer); g.checked = true; if (g.ok) g.score++; render(); },
  'fill-override': () => { const g = UI.game; if (!g.ok) { g.ok = true; g.score++; g.overridden = true; } render(); },
  'fill-next': async () => {
    const g = UI.game, it = g.items[g.i];
    await gameResult(it.cardId, g.ok, g.cid);
    g.i++; g.input = ''; g.checked = false; g.ok = false;
    if (g.i >= g.items.length) { g.done = true; g.isBest = await gameBest('fill-' + g.cid, g.score, false); }
    render();
  },
  'speed-go': () => { const g = UI.game; g.start = Date.now(); g.end = g.start + 60000; render(); },
  'speed-show': () => { UI.game.shown = true; render(); },
  'speed-mark': el => { const g = UI.game, ok = el.dataset.ok === '1'; gameResult(g.ids[g.i], ok, g.cid); if (ok) g.score++; else g.missed++; g.i = (g.i + 1) % g.ids.length; g.shown = false; render(); },
  'board-open': el => { const g = UI.game; g.open = [+el.dataset.c, +el.dataset.r]; g.shown = false; render(); },
  'board-show': () => { UI.game.shown = true; render(); },
  'board-mark': async el => {
    const g = UI.game, cell = g.cols[g.open[0]].cells[g.open[1]], ok = el.dataset.ok === '1';
    cell.state = ok; if (ok) g.score += cell.pts; g.open = null;
    await gameResult(cell.id, ok, g.cid);
    if (g.cols.every(col => col.cells.every(x => x.state != null))) g.isBest = await gameBest('board-' + g.cid, g.score, false);
    render();
  }
});
async function tickGame() {
  const g = UI.game; if (!g || S.route !== 'games' || g.done) return;
  const el = $('#game-clock');
  if (g.kind === 'match' && el) el.textContent = fmtClock((Date.now() - g.start) / 1000);
  if (g.kind === 'speed' && g.start) {
    if (el) el.textContent = fmtClock((g.end - Date.now()) / 1000);
    if (Date.now() >= g.end) { g.done = true; g.isBest = await gameBest('speed-' + g.cid, g.score, false); render(); }
  }
}

/* ---------- Tutor: always available; current course first, then everything; general knowledge labeled ---------- */
function currentCourseId() {
  const p = S.param;
  if (S.courses[p]) return p;
  if (S.units[p]) return S.units[p].courseId;
  const m = /^(.+)L\d+$/.exec(p || ''); if (m && S.units[m[1]]) return S.units[m[1]].courseId;
  if (UI.item && S.cards[UI.item.cardId]) return S.cards[UI.item.cardId].courseId;
  return null;
}
async function tutorMaterial(cid, question) {
  const q = L.tokens(question), parts = []; let size = 0;
  const rank = scope => {
    const ideas = list('cards').filter(c => c.type === 'teachback' && (!scope || c.courseId === scope)).map(c => ({ w: L.overlap(q, L.tokens(c.ideaTitle + ' ' + c.answer)), text: `=== Lesson idea: ${c.ideaTitle} ===\n${c.answer}\nKey points: ${(c.rubric || []).join('; ')}` }));
    const segs = list('sources').filter(s => !scope || s.courseId === scope).flatMap(s => (s.digest || []).map(d => ({ w: L.overlap(q, L.tokens(d.summary)), ref: d.ref, title: s.title })));
    return { ideas: ideas.filter(x => x.w > 0.12).sort((a, b) => b.w - a.w).slice(0, 4), segs: segs.filter(x => x.w > 0.12).sort((a, b) => b.w - a.w).slice(0, 3) };
  };
  let r = rank(cid);
  if (cid && !r.ideas.length && !r.segs.length) r = rank(null);
  for (const x of r.ideas) { parts.push(x.text); size += x.text.length; }
  for (const x of r.segs) { const t = await unitMaterial({ segs: [x.ref] }, 12000); if (t && size + t.length < 40000) { parts.push(`=== Your material: ${x.title} ===\n${t}`); size += t.length; } }
  return parts.join('\n\n');
}
function tutorHtml() {
  const t = S.tutor, cid = currentCourseId(), c = cid && S.courses[cid];
  if ((S.route === 'test' && UI.test && UI.test.phase === 'run') || ((S.route === 'add' || S.route === 'newcourse') && !t.open)) return '';
  if (!t.open) return `<button type="button" class="btn primary fab" data-act="tutor-open">${icon('chat')}<span>Tutor</span></button>`;
  const cfg = settingsFor();
  return `<div class="drawer" id="drawer" role="dialog" aria-label="Tutor"><div class="row between"><h3>Tutor</h3><div class="row">${Voice.canSpeak() ? `<button class="btn sm ghost" data-act="voice-mute" aria-pressed="${cfg.voiceOn === false}">${icon(cfg.voiceOn === false ? 'x' : 'sound')}<span>${cfg.voiceOn === false ? 'Muted' : 'Voice on'}</span></button>` : ''}<button class="btn sm ghost" data-act="tutor-close">Close</button></div></div>
  <p class="small muted">${c ? `Answers from "${esc(c.title)}" first, then your other material.` : 'Answers from your material first.'} Anything else is labeled as general knowledge.</p>
  ${aiOn() ? `<div class="tutor"><div class="msgs" id="tutor-msgs">${t.turns.length ? t.turns.map(m => m.role === 'user' ? `<div class="me">${esc(m.content)}</div>` : `<div class="bot">${partsHtml(m.parts)}</div>`).join('') : '<p class="small muted">Ask about anything you\'re studying. The tutor knows your recent mistakes.</p>'}${busyHtml('tutor')}</div>
  <div class="stack tight"><textarea id="f-tutorIn" data-bind="tutorIn" rows="2" placeholder="${c ? 'Ask about this course' : 'Ask about anything you\'ve added'}" ${isBusy('tutor') ? 'disabled' : ''}>${esc(ui('tutorIn', ''))}</textarea><div class="row between"><div class="row">${micBtn('f-tutorIn')}${t.turns.length ? '<button class="btn sm ghost" data-act="tutor-clear">New chat</button>' : ''}</div><button class="btn primary" data-act="tutor-send" ${isBusy('tutor') ? 'disabled' : ''}>Ask</button></div>${micHint()}</div></div>` : `<p>${needAI}</p>`}</div>`;
}
async function tutorSend() {
  const t = S.tutor, msg = L.str(UI.tutorIn, 2000); if (!msg || isBusy('tutor')) return;
  const cid = currentCourseId();
  t.turns.push({ role: 'user', content: msg }); UI.tutorIn = '';
  const r = await task('tutor', 'Thinking…', async signal => {
    const material = await tutorMaterial(cid, msg);
    const weak = list('mistakes').filter(m => !cid || m.courseId === cid).sort((a, b) => b.at - a.at).slice(0, 8).map(m => m.ideaTitle || m.prompt.slice(0, 80));
    const convo = t.turns.slice(-8).map(m => ({ role: m.role, content: m.role === 'user' ? m.content : (m.parts || []).map(p => (p.from === 'general' ? '[general] ' : '[source] ') + p.text).join('\n') }));
    while (convo.length && convo[0].role !== 'user') convo.shift();
    convo[0] = { role: 'user', content: P.tutor({ course: cid ? S.courses[cid] : null, material, mistakes: [...new Set(weak)] }) + '\n\nLEARNER: ' + convo[0].content };
    return ai(convo, { signal });
  });
  if (!r) { const last = t.turns.pop(); UI.tutorIn = last ? last.content : ''; render(); return; }
  const parts = L.arr(r.parts, 6).map(p => ({ from: p && p.from === 'source' ? 'source' : 'general', text: L.str(p && p.text, 3000) })).filter(p => p.text);
  t.turns.push({ role: 'assistant', parts: parts.length ? parts : [{ from: 'general', text: 'No answer came back. Try rephrasing.' }] });
  render();
  if (Voice.on() && parts.length) Voice.speak(parts.map(p => p.text), 'tutor');
}
Object.assign(ACT, {
  'tutor-open': () => { S.tutor.open = true; render(); const el = $('#f-tutorIn'); if (el) el.focus(); },
  'tutor-close': () => { S.tutor.open = false; Voice.stop(); render(); },
  'tutor-clear': () => { S.tutor.turns = []; Voice.stop(); render(); },
  'tutor-send': () => tutorSend(),
  'voice-mute': async () => { const g = Object.assign({}, globalSettings()); g.voiceOn = settingsFor().voiceOn === false; if (!g.voiceOn) Voice.stop(); await put('settings', 'global', g).catch(() => { }); render(); }
});
