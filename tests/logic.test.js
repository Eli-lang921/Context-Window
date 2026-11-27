/* Run: node --test tests/logic.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/logic.js');

const T = '2026-11-27';
const card = (o = {}) => L.newCard(Object.assign({ id: L.uid('c'), courseId: 'A', unitId: 'u1', ideaId: 'i1', type: 'flash', fsrs: Object.assign(L.newFsrs(), { due: T, reps: 1, s: 3, d: 5, last: L.addDays(T, -3) }) }, o));

test('dates: study day rolls over at 3 a.m.', () => {
  assert.equal(L.studyDay(new Date(2026, 10, 28, 0, 30)), '2026-11-27');
  assert.equal(L.studyDay(new Date(2026, 10, 28, 2, 59)), '2026-11-27');
  assert.equal(L.studyDay(new Date(2026, 10, 28, 3, 0)), '2026-11-28');
  assert.equal(L.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(L.daysBetween('2026-11-27', '2026-12-04'), 7);
  assert.equal(L.weekday('2026-11-27'), 5);
  assert.ok(L.validDay('2026-02-28')); assert.ok(!L.validDay('soon')); assert.ok(!L.validDay(''));
  assert.notEqual(L.uid('x'), L.uid('x'));
});

test('FSRS: intervals grow on Good and reset on Again', () => {
  let f = L.newFsrs(), day = T; const seen = [];
  for (let i = 0; i < 6; i++) { f = L.rate(f, 'good', day); seen.push(f.interval); day = f.due; }
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] > seen[i - 1], 'interval grows: ' + seen.join(','));
  assert.equal(seen[0], 3);
  const before = f.s;
  f = L.rate(f, 'again', day);
  assert.equal(f.interval, 1); assert.equal(f.due, L.addDays(day, 1)); assert.equal(f.lapses, 1); assert.ok(f.s < before);
});

test('FSRS: rating order, retention target, bounds, errors', () => {
  const base = { s: 10, d: 5, reps: 3, lapses: 0, last: L.addDays(T, -10), due: T, interval: 10 };
  const iv = L.previewIntervals(base, T, 0.9);
  assert.equal(iv.again, 1); assert.ok(iv.hard < iv.good && iv.good < iv.easy);
  assert.ok(L.rate(base, 'good', T, 0.95).interval < L.rate(base, 'good', T, 0.85).interval);
  assert.equal(L.intervalFor(10, 0.9), 10);
  assert.ok(Math.abs(L.retrievability(10, 10) - 0.9) < 1e-9);
  assert.equal(L.newFsrs().due, null);
  const first = L.rate(null, 'easy', T); assert.ok(first.interval >= 10); assert.ok(first.d >= 1 && first.d <= 10);
  assert.ok(L.rate(base, 'good', L.addDays(T, -10)).s > 0, 'same-day review stays finite');
  assert.throws(() => L.rate(base, 'perfect', T));
  assert.equal(L.W.length, 19);
});

test('scores: pass marks, ratings, hints, override', () => {
  assert.equal(L.passMark('lenient'), 60); assert.equal(L.passMark('standard'), 70); assert.equal(L.passMark('strict'), 80); assert.equal(L.passMark('x'), 70);
  assert.equal(L.ratingFromScore(40, 'standard'), 'again'); assert.equal(L.ratingFromScore(60, 'standard'), 'hard');
  assert.equal(L.ratingFromScore(75, 'standard'), 'good'); assert.equal(L.ratingFromScore(95, 'standard'), 'easy');
  assert.equal(L.ratingFromScore(75, 'strict'), 'hard');
  assert.equal(L.verdictFromScore(70, 'standard'), 'correct'); assert.equal(L.verdictFromScore(55, 'standard'), 'partial'); assert.equal(L.verdictFromScore(20, 'standard'), 'incorrect');
  assert.equal(L.hintPenalty(1), 10); assert.equal(L.hintPenalty(5), 20);
  assert.equal(L.finalScore(85, 2), 65); assert.equal(L.finalScore(5, 2), 0); assert.equal(L.finalScore(140, 0), 100);
  const o = L.override({ verdict: 'incorrect', score: 30, rating: 'again' }, 'standard');
  assert.equal(o.verdict, 'correct'); assert.equal(o.rating, 'good'); assert.equal(o.score, 70); assert.ok(o.overridden);
  assert.equal(L.override({ verdict: 'incorrect', rating: 'again' }, 'standard').rating, 'good');
});

test('cards: costs, guess counts as a miss, leech, override flag', () => {
  assert.equal(L.cost({ type: 'flash' }), 1); assert.equal(L.cost({ type: 'short' }), 1); assert.equal(L.cost({ type: 'teachback' }), 3); assert.equal(L.cost({ type: 'apply' }), 3);
  let c = card();
  const g = L.applyResult(c, { rating: 'good', guess: true, today: T, mode: 'review' });
  assert.equal(g.lastRating, 'again'); assert.equal(g.fsrs.interval, 1); assert.equal(g.guessCount, 1); assert.equal(g.attempts.correct, 0); assert.equal(g.misses, 1);
  for (let i = 0; i < 3; i++) { c = L.applyResult(c, { rating: 'again', today: T, mode: 'review' }); assert.ok(!c.leech); }
  c = L.applyResult(c, { rating: 'again', today: T, mode: 'review' }); assert.ok(c.leech, '4 misses makes a leech');
  let o = card();
  o = L.applyResult(o, { rating: 'good', overridden: true, today: T, mode: 'review' }); assert.ok(!o.offerRewrite);
  o = L.applyResult(o, { rating: 'good', overridden: true, today: T, mode: 'review' }); assert.ok(o.offerRewrite, '2 overrides offers a rewrite');
  assert.throws(() => L.applyResult(card(), { rating: 'nope', today: T }));
  const s = L.applyResult(card({ type: 'teachback' }), { rating: 'good', score: 82, today: T, mode: 'review' });
  assert.equal(s.firstScore, 82); assert.equal(s.styleIdx, 1); assert.equal(L.styleFor(s), 'example');
  assert.equal(L.applyResult(s, { rating: 'easy', score: 95, today: T, mode: 'review' }).firstScore, 82);
});

test('cards: tests and games only move the schedule on a miss', () => {
  const far = card({ fsrs: Object.assign(L.newFsrs(), { due: L.addDays(T, 20), reps: 3, s: 20, d: 5, last: T, interval: 20 }) });
  const hit = L.applyResult(far, { rating: 'good', today: T, mode: 'light' });
  assert.equal(hit.fsrs.due, far.fsrs.due); assert.equal(hit.fsrs.s, far.fsrs.s);
  const miss = L.applyResult(far, { rating: 'again', today: T, mode: 'light' });
  assert.equal(miss.fsrs.due, L.addDays(T, 1)); assert.equal(miss.misses, 0, 'only real review misses count toward a leech'); assert.equal(miss.lastRating, 'again');
  assert.equal(hit.lastSeen, 'good'); assert.notEqual(hit.lastRating, 'good', 'a game hit does not clear a weak mark');
  const fresh = L.applyResult(L.newCard({ type: 'flash' }), { rating: 'again', today: T, mode: 'light' });
  assert.equal(fresh.fsrs.due, null, 'a card not yet learned stays locked');
});

test('mastery: only by hand, leaves the daily queue, checks in after ~60 days', () => {
  const m = L.markMastered(card(), T);
  assert.ok(m.mastered); assert.equal(m.masteredDue, L.addDays(T, 60));
  assert.equal(L.buildQueue([m], { today: T }).items.length, 0);
  assert.equal(L.buildQueue([m], { today: L.addDays(T, 60) }).items.length, 1);
  const ok = L.applyResult(m, { rating: 'good', today: L.addDays(T, 60), mode: 'review' });
  assert.ok(ok.mastered); assert.equal(ok.masteredDue, L.addDays(T, 120));
  const slip = L.applyResult(m, { rating: 'again', today: L.addDays(T, 60), mode: 'review' });
  assert.ok(!slip.mastered); assert.equal(slip.fsrs.interval, 1);
  assert.ok(!L.unmaster(m, T).mastered);
  const many = L.applyResult(card(), { rating: 'easy', today: T, mode: 'review' });
  assert.ok(!many.mastered, 'never automatic');
});

test('queue: 20-unit cap, costs, skip items that do not fit', () => {
  const cards = [];
  for (let i = 0; i < 8; i++) cards.push(card({ id: 't' + i, type: 'teachback', unitId: 'u' + (i % 3), fsrs: Object.assign(L.newFsrs(), { due: L.addDays(T, -10 + i), reps: 1, s: 3, d: 5 }) }));
  for (let i = 0; i < 5; i++) cards.push(card({ id: 'f' + i, type: 'flash', fsrs: Object.assign(L.newFsrs(), { due: T, reps: 1, s: 3, d: 5 }) }));
  const q = L.buildQueue(cards, { today: T });
  assert.equal(q.unitsPlanned, 20); assert.equal(q.items.filter(c => c.type === 'teachback').length, 6); assert.equal(q.items.filter(c => c.type === 'flash').length, 2);
  assert.equal(q.dueTotal, 13); assert.equal(q.backlog, 5); assert.equal(q.dueUnits, 29);
  assert.equal(L.buildQueue(cards, { today: T, used: 18 }).items.every(c => c.type === 'flash'), true);
  assert.equal(L.buildQueue(cards, { today: T, used: 20 }).items.length, 0);
  assert.equal(L.buildQueue(cards, { today: T, used: 25 }).items.length, 0);
  assert.equal(L.buildQueue(cards, { today: T, cap: L.EXTRA, exclude: q.items.map(c => c.id) }).unitsPlanned, 9);
  const rest = L.buildQueue(cards, { today: T, restDay: true });
  assert.equal(rest.items.length, 0); assert.equal(rest.backlog, 13); assert.ok(rest.restDay);
});

test('queue: deadline courses first, oldest due first, interleaved, not-due excluded', () => {
  const mk = (id, courseId, due, unitId = 'u1') => card({ id, courseId, unitId, type: 'apply', fsrs: Object.assign(L.newFsrs(), { due, reps: 1, s: 3, d: 5 }) });
  const cards = [mk('a-old', 'A', L.addDays(T, -9)), mk('b1', 'B', T), mk('b2', 'B', L.addDays(T, -1)), mk('a2', 'A', L.addDays(T, -8)), mk('later', 'B', L.addDays(T, 1)), mk('c1', 'C', L.addDays(T, -30))];
  const courses = { A: {}, B: { deadline: L.addDays(T, 10) }, C: { deadline: L.addDays(T, -2) } };
  const q = L.buildQueue(cards, { today: T, courses, cap: 6 });
  assert.deepEqual(q.items.map(c => c.id).sort(), ['b1', 'b2'], 'deadline course takes the units; a past deadline gives no priority');
  const all = L.buildQueue(cards, { today: T, courses });
  assert.ok(!all.items.some(c => c.id === 'later'));
  for (let i = 1; i < 3; i++) assert.notEqual(all.items[i].courseId, all.items[i - 1].courseId, 'courses alternate while possible');
  const noDl = L.buildQueue(cards, { today: T, cap: 3 });
  assert.equal(noDl.items[0].id, 'c1', 'oldest due first');
  assert.equal(L.buildQueue([card({ status: 'flagged' }), card({ courseId: 'Z' })], { today: T, courses: { Z: { archived: true } } }).items.length, 0);
  assert.deepEqual(L.interleave([{ courseId: 'A', unitId: 1 }, { courseId: 'A', unitId: 1 }, { courseId: 'A', unitId: 2 }]).map(x => x.unitId), [1, 2, 1]);
  const f = L.forecast(cards, T, 3); assert.equal(f[0].units, 15); assert.equal(f[1].units, 3); assert.equal(f[2].units, 0);
});

test('streak: finished days count, rest days skip without breaking', () => {
  assert.ok(L.dayDone(4, 0)); assert.ok(L.dayDone(20, 9)); assert.ok(!L.dayDone(19, 1));
  const d = n => L.addDays(T, n), days = {};
  for (const n of [-5, -4, -2, -1, 0]) days[d(n)] = { done: true };
  assert.equal(L.streak(days, T, []), 3);
  assert.equal(L.streak(days, T, [L.weekday(d(-3))]), 5, 'rest day bridges the gap');
  delete days[T];
  assert.equal(L.streak(days, T, []), 2, 'today not finished yet does not break it');
  assert.equal(L.streak({}, T, [0, 1, 2, 3, 4, 5, 6]), 0);
  assert.equal(L.streak({ [d(-3)]: { done: true } }, T, []), 0);
  assert.ok(L.isRestDay(T, [5])); assert.ok(!L.isRestDay(T, [1]));
});

test('XP and badges: effort-weighted, guesses earn nothing', () => {
  const x = (type, rating = 'good', score) => L.xpFor({ kind: 'card', type, rating, score });
  assert.ok(x('teachback', 'good', 80) > x('apply') && x('apply') > x('short') && x('short') > x('flash'));
  assert.equal(L.xpFor({ kind: 'card', type: 'teachback', rating: 'good', score: 90, guess: true }), 0);
  assert.ok(x('flash', 'again') < x('flash'));
  assert.ok(L.xpFor({ kind: 'fullTest' }) > L.xpFor({ kind: 'quickTest' }));
  assert.ok(L.xpFor({ kind: 'dayDone', streak: 10 }) > L.xpFor({ kind: 'dayDone', streak: 0 }));
  assert.equal(L.xpFor({ kind: 'dayDone', streak: 500 }), 70);
  assert.equal(L.xpFor({ kind: 'unitPass' }), 100); assert.equal(L.xpFor({ kind: 'nothing' }), 0);
  assert.equal(L.level(0), 1); assert.equal(L.level(400), 3);
  assert.deepEqual(L.earnedBadges({}), []);
  assert.deepEqual(L.earnedBadges({ bestStreak: 30, tb90: 10, simsPassed: 1 }), ['streak7', 'streak30', 'tb90x10', 'sim1']);
  assert.equal(L.earnedBadges({ bestStreak: 100, unitsPassed: 5, coursesDone: 1, tb90: 10, teachbacks: 50, testsPassed: 1, simsPassed: 1 }).length, L.BADGES.length);
});

test('units, pace and cram', () => {
  const tb = s => ({ type: 'teachback', firstScore: s });
  assert.equal(L.unitStatus([tb(80), tb(70)], 'standard').passed, true);
  assert.equal(L.unitStatus([tb(80), tb(70)], 'strict').passed, false);
  assert.equal(L.unitStatus([tb(95), {}], 'standard').passed, false, 'every idea must be attempted');
  assert.equal(L.unitStatus([], 'standard').passed, false);
  assert.equal(L.pace({}, { today: T, lessonsLeft: 4 }).mode, 'self');
  const on = L.pace({ deadline: L.addDays(T, 40), minutesPerDay: 45 }, { today: T, lessonsLeft: 30, lessonsTotal: 40, restDays: [] });
  assert.equal(on.status, 'on track'); assert.equal(on.lessonsPerDay, 1); assert.equal(on.daysLeft, 40); assert.equal(on.progress, 25); assert.ok(!on.cramSuggested);
  const behind = L.pace({ deadline: L.addDays(T, 8), minutesPerDay: 20 }, { today: T, lessonsLeft: 30, lessonsTotal: 40 });
  assert.equal(behind.status, 'behind');
  const cram = L.pace({ deadline: L.addDays(T, 5), minutesPerDay: 60 }, { today: T, lessonsLeft: 2, lessonsTotal: 40 });
  assert.ok(cram.cramSuggested);
  assert.equal(L.pace({ deadline: L.addDays(T, -1) }, { today: T, lessonsLeft: 2 }).status, 'past');
  assert.equal(L.pace({ deadline: L.addDays(T, 3) }, { today: T, lessonsLeft: 0 }).status, 'done');
  const weak = card({ id: 'weak', misses: 3, lastRating: 'again', yield: 'high' }), strong = card({ id: 'strong', lastScore: 95, yield: 'low', type: 'teachback' });
  const pick = L.cramSelect([strong, weak, L.markMastered(card({ id: 'm' }), T)], 2);
  assert.deepEqual(pick.map(c => c.id), ['weak', 'strong']);
  assert.equal(L.ideaLevel([]), 'new'); assert.equal(L.ideaLevel([card()]), 'new');
  assert.equal(L.ideaLevel([L.markMastered(card(), T)]), 'mastered');
  assert.equal(L.ideaLevel([card({ attempts: { n: 2, correct: 2 }, type: 'teachback', lastScore: 92 })]), 'strong');
  assert.equal(L.ideaLevel([card({ attempts: { n: 2, correct: 2 }, type: 'teachback', lastScore: 70 })]), 'learning');
  assert.equal(L.ideaLevel([card({ attempts: { n: 2, correct: 1 }, lastRating: 'again' })]), 'weak');
});

test('tests: exam sizes, scoring, weak units, cloze matching', () => {
  assert.deepEqual(L.examConfig({}, 'quick'), { n: 15, minutes: 18 });
  assert.deepEqual(L.examConfig({ exam: { questions: 80, minutes: 90 } }, 'full'), { n: 80, minutes: 90 });
  assert.deepEqual(L.examConfig({ exam: { questions: 'many' } }, 'full'), { n: 60, minutes: 90 });
  const r = L.scoreTest([{ ok: true, unitId: 'a' }, { ok: false, unitId: 'a' }, { ok: false, unitId: 'b' }, { ok: true, unitId: 'c' }]);
  assert.equal(r.percent, 50); assert.equal(r.correct, 2); assert.deepEqual(r.weakUnits, ['b', 'a']); assert.equal(r.misses.length, 2); assert.equal(r.byUnit.c.pct, 100);
  assert.equal(L.scoreTest([]).percent, 0);
  assert.ok(L.clozeMatch(' Elasticity ', 'elasticity')); assert.ok(L.clozeMatch('substitute', 'substitutes')); assert.ok(!L.clozeMatch('', 'x')); assert.ok(!L.clozeMatch('supply', 'demand'));
});

test('reporting and settings', () => {
  const cs = [card({ unitId: 'u1', attempts: { n: 4, correct: 1 }, ideaId: 'i1', misses: 3, lastRating: 'again' }), card({ unitId: 'u2', attempts: { n: 2, correct: 2 }, ideaId: 'i2', lastScore: 95, type: 'teachback', yield: 'low' }), card({ unitId: 'u3', ideaId: 'i3' })];
  const acc = L.accuracyBy(cs, 'unitId');
  assert.equal(acc.u1.pct, 25); assert.equal(acc.u2.pct, 100); assert.equal(acc.u3.pct, null);
  assert.deepEqual(L.weakestIdeas(cs).map(x => x.ideaId), ['i1']);
  const w = L.weekSummary({ [T]: { minutes: 20, units: 12, extra: 3, xp: 90, done: true }, [L.addDays(T, -2)]: { minutes: 5 }, [L.addDays(T, -9)]: { minutes: 99 } }, T);
  assert.equal(w.minutes, 25); assert.equal(w.units, 15); assert.equal(w.daysStudied, 2); assert.equal(w.perDay.length, 7); assert.equal(w.perDay[6].done, true);
  const s = L.settingsFor({ probing: 'deep', retention: 0.99, restDays: [6, 9, '0'], voiceRate: 4 }, { strictness: 'strict', probing: '' });
  assert.equal(s.probing, 'deep'); assert.equal(s.strictness, 'strict'); assert.equal(s.retention, 0.95); assert.deepEqual(s.restDays, [6, 0]); assert.equal(s.voiceRate, 1.5);
  assert.equal(L.settingsFor(null, null).retention, 0.9); assert.equal(L.settingsFor({ probing: 'x', strictness: 'y' }).probing, 'standard');
});

test('text: chunking keeps everything, segments split on paragraphs', () => {
  const long = 'x'.repeat(200001);
  const ch = L.chunkText(long); assert.equal(ch.length, 3); assert.equal(ch.join(''), long); assert.deepEqual(L.chunkText(''), ['']);
  const paras = Array.from({ length: 40 }, (_, i) => 'Paragraph ' + i + '. ' + 'word '.repeat(120)).join('\n\n');
  const segs = L.splitSegments(paras, 3000);
  assert.ok(segs.length > 5); assert.ok(segs.every(s => s.length <= 6000));
  assert.equal(segs.join('\n\n').replace(/\s+/g, ' '), paras.replace(/\s+/g, ' ').trim(), 'no text lost');
  const one = L.splitSegments('A sentence. '.repeat(3000), 3000); assert.ok(one.length > 3); assert.ok(one.every(s => s.length <= 6001));
  assert.deepEqual(L.splitSegments('  '), []);
  assert.ok(L.tokens('The price elasticity of demand').has('elasticity')); assert.ok(!L.tokens('the of').size);
  assert.ok(L.overlap(L.tokens('price elasticity'), L.tokens('elasticity of price')) > 0.9); assert.equal(L.overlap(new Set(), L.tokens('a b')), 0);
  assert.equal(L.slug('Micro-Economics: Unit 1!'), 'micro-economics-unit-1'); assert.equal(L.slug(''), 'item');
  const src = 'Intro text here. ' + 'pad '.repeat(200) + 'Demand falls when price rises, all else equal. ' + 'pad '.repeat(200);
  assert.ok(L.passageAround(src, 'Demand falls when price rises').includes('all else equal')); assert.equal(L.passageAround(src, 'not in there at all'), ''); assert.equal(L.passageAround('', 'x'), '');
});

test('safety: escaping and links', () => {
  assert.equal(L.esc('<img src=x onerror="a(\'b\')">&'), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  assert.equal(L.esc(null), ''); assert.equal(L.esc(5), '5');
  assert.equal(L.safeUrl('https://example.com/a'), 'https://example.com/a');
  for (const bad of ['javascript:alert(1)', 'http://example.com', 'data:text/html,x', '//x.com', null, 7]) assert.equal(L.safeUrl(bad), '');
});

test('validators: visuals', () => {
  assert.equal(L.validateVisual(null), null); assert.equal(L.validateVisual({ type: 'hologram' }), null);
  assert.equal(L.validateVisual({ type: 'flow', steps: [{ label: 'only one' }] }), null);
  assert.equal(L.validateVisual({ type: 'flow', steps: [{ label: 'a' }, { label: 'b' }], caption: 'c' }).steps.length, 2);
  assert.ok(L.validateVisual({ type: 'compare', left: { title: 'A', lines: ['x'] }, right: { title: 'B', lines: ['y'] } }));
  assert.equal(L.validateVisual({ type: 'compare', left: { lines: [] }, right: { lines: ['y'] } }), null);
  assert.ok(L.validateVisual({ type: 'steps', steps: [{ title: 'a' }, { text: 'b' }] }));
  assert.deepEqual(L.validateVisual({ type: 'table', columns: ['P', 'Q'], rows: [['1'], 'bad', ['2', '3', '4']] }).rows, [['1', ''], ['2', '3']]);
  assert.ok(L.validateVisual({ type: 'layers', layers: [{ label: 'a', size: 2 }, { label: 'b', size: -4 }] }).layers[1].size === 0);
  assert.equal(L.validateVisual({ type: 'spectrum', points: [{ pos: 250, label: 'hot' }] }).points[0].pos, 100);
  const ch = L.validateVisual({ type: 'chart', kind: 'pie', points: [{ label: '$1', value: 10 }, { label: '$2', value: '6' }, { label: 'bad', value: 'x' }], unit: 'units' });
  assert.equal(ch.kind, 'bar'); assert.equal(ch.points.length, 2);
  assert.equal(L.validateVisual({ type: 'chart', points: [{ label: 'a', value: 1 }] }), null);
});

test('validators: ideas, cards, syllabus, test questions', () => {
  const idea = L.validateIdea({
    title: 'Price elasticity', analogy: { text: 'Like a rubber band', origin: 'source' }, mechanism: { text: 'Percent change in quantity over percent change in price.', origin: 'source' },
    example: { steps: [{ label: 'Step', text: 'Price up 10%, quantity down 20%.' }], result: 'Elasticity is 2.' }, why: 'It predicts revenue.',
    keyPoints: ['ratio of percent changes', 'above 1 is elastic'], prompts: { beginner: 'Explain it to a friend.', bogus: 'x' }, hints: ['h1', 'h2', 'h3'],
    cloze: { sentence: 'Demand is elastic when the ratio is above one.', answer: 'elastic' }, yield: 'huge',
    cards: [{ type: 'flashcard', prompt: 'Define elasticity', answer: 'A ratio' }, { type: 'mc', prompt: 'x', answer: 'y' }, { type: 'short', prompt: 'p', answer: 'a', options: ['a', 'b'] }, { type: 'apply', prompt: 'p' }],
    terms: [{ term: 'elastic', def: 'responsive' }, { term: '', def: 'x' }], visual: { type: 'nope' }
  });
  assert.equal(idea.analogy.origin, 'added', 'analogies are always labelled added');
  assert.equal(idea.mechanism.origin, 'source'); assert.equal(idea.why.origin, 'added', 'unmarked text defaults to added');
  assert.equal(idea.example.origin, 'added'); assert.equal(idea.hints.length, 2); assert.equal(idea.yield, 'medium'); assert.equal(idea.visual, null);
  assert.equal(idea.cards.length, 1); assert.equal(idea.cards[0].type, 'flash'); assert.equal(idea.cards[0].origin, 'added');
  assert.equal(idea.prompts.beginner, 'Explain it to a friend.'); assert.equal(idea.prompts.compare, ''); assert.equal(idea.terms.length, 1); assert.ok(idea.cloze);
  assert.equal(L.validateIdea({ title: 't', mechanism: 'm', keyPoints: ['one'] }), null);
  assert.equal(L.validateIdea({ title: 't', keyPoints: ['a', 'b'] }), null); assert.equal(L.validateIdea('x'), null);
  assert.equal(L.validateIdea({ title: 't', mechanism: 'm', keyPoints: ['a', 'b'], cloze: { sentence: 'No match here', answer: 'zebra' } }).cloze, null);
  assert.equal(L.validateCard({ type: 'short', prompt: 'p', answer: 'a', difficulty: 9 }).difficulty, 5); assert.equal(L.validateCard(null), null);
  const syl = L.validateSyllabus({ units: [{ title: 'Supply and demand', lessons: [{ title: 'Demand', ideas: ['Law of demand', ''] }, { ideas: ['x'] }], segs: ['s1:0'], origin: 'weird' }, { summary: 'no title' }] });
  assert.equal(syl.units.length, 1); assert.equal(syl.units[0].lessons.length, 1); assert.deepEqual(syl.units[0].lessons[0].ideas, ['Law of demand']); assert.equal(syl.units[0].origin, 'added');
  assert.deepEqual(L.validateSyllabus(null).units, []);
  assert.equal(L.validateTestQ({ q: 'Which?', options: ['a', 'b', 'c', 'd'], answer: 2, unit: 1 }, true).answer, 2);
  assert.equal(L.validateTestQ({ q: 'Which?', options: ['a', 'b', 'c', 'd'], answer: 7 }, true), null);
  assert.equal(L.validateTestQ({ q: 'Which?', options: ['a'], answer: 0 }, true), null);
  assert.equal(L.validateTestQ({ q: 'Why?', answer: 'Because.' }, false).type, 'short'); assert.equal(L.validateTestQ({ q: 'Why?' }, false), null); assert.equal(L.validateTestQ({}, true), null);
  assert.equal(L.str(12), '12'); assert.equal(L.str({}), ''); assert.deepEqual(L.arr('x'), []);
  assert.deepEqual(L.validatePart('  '), null); assert.equal(L.validatePart('text').origin, 'added');
});

test('export: Obsidian markdown labels added content', () => {
  const idea = L.validateIdea({ title: 'Law of demand', analogy: 'Like a sale rack', mechanism: { text: 'Price up, quantity demanded down.', origin: 'source' }, example: { steps: [{ text: '$2 to $3: 100 to 80 cups.' }], result: '20 fewer cups', origin: 'source' }, why: { text: 'Explains pricing.', origin: 'source' }, keyPoints: ['inverse relation', 'all else equal'], quote: 'quantity demanded falls', terms: [{ term: 'demand', def: 'willingness to buy', fromSource: true }, { term: 'ceteris paribus', def: 'all else equal' }] });
  const md = L.guideMarkdown({ title: 'Micro CLEP' }, { title: 'Unit 1' }, [{ title: 'Demand', ideas: [idea] }], { summary: 'Short summary.', mustKnow: ['Law of demand'], formulas: [], pitfalls: ['Confusing demand with quantity demanded'] }, T);
  assert.ok(md.startsWith('---\ntags: [context-window, micro-clep]')); assert.ok(md.includes('# Unit 1')); assert.ok(md.includes('### Law of demand'));
  assert.ok(md.includes('Analogy (added background)')); assert.ok(md.includes('## Must know')); assert.ok(!md.includes('## Formulas')); assert.ok(md.includes('_(added background)_'));
  assert.ok(md.includes('1. $2 to $3')); assert.ok(L.guideMarkdown({ title: 'c' }, { title: 'u' }, [], null, T).includes('# u'));
  assert.ok(L.ideaMarkdown(L.validateIdea({ title: 't', mechanism: 'm', keyPoints: ['a', 'b'] })).includes('Added, not from your source'));
  assert.equal(L.clone({ a: [1] }).a[0], 1); assert.equal(L.clamp(5, 0, 3), 3);
  assert.equal(L.pullEarlier(L.markMastered(card(), T), T).masteredDue, L.addDays(T, 1));
});

test('queue: on the same due date teach-backs come first, then the weaker card', () => {
  const mk = (id, type, extra = {}) => L.newCard(Object.assign({ id, courseId: 'A', unitId: id, ideaId: id, type, fsrs: Object.assign(L.newFsrs(), { due: T, reps: 1, s: 3, d: 5 }) }, extra));
  const cards = [mk('f1', 'flash'), mk('f2', 'flash', { misses: 3 }), mk('s1', 'short'), mk('t1', 'teachback'), mk('t2', 'teachback')];
  const q = L.buildQueue(cards, { today: T, cap: 7 });
  assert.deepEqual(q.items.map(c => c.id).sort(), ['f2', 't1', 't2'], 'two teach-backs (6 units) then the weakest 1-unit card');
});

test('review fixes: day finishes when nothing more fits; best first-try score repairs a unit', () => {
  assert.ok(L.dayDone(18, 1, 0), '18 used, one 3-unit card left that cannot fit: the day still counts');
  assert.ok(!L.dayDone(18, 1, 1));
  let c = L.applyResult(card({ type: 'teachback' }), { rating: 'again', score: 40, today: T, mode: 'review' });
  assert.equal(L.unitStatus([c], 'standard').passed, false);
  c = L.applyResult(c, { rating: 'good', score: 88, today: T, mode: 'review' });
  assert.equal(c.firstScore, 40); assert.equal(c.bestScore, 88); assert.equal(L.passScoreOf(c), 88);
  assert.equal(L.unitStatus([c], 'standard').passed, true);
  assert.equal(L.passScoreOf({ firstScore: 72 }), 72);
});

test('add learning: intake plan validation and unit matching', () => {
  const plan = L.validateIntake({ title: 'Module 2 chat', found: ['chat', 'feedback', 'spam'],
    placements: [{ unit: 'Module 2: Prompting', isNew: false, lessons: [{ title: 'Structure', ideas: ['Role and task', ''], segs: ['s1:0'] }, { title: 'No ideas', ideas: [] }] }, { unit: '', lessons: [{ title: 'x', ideas: ['y'] }] }, { unit: 'Empty', lessons: [] }],
    weakSpots: [{ idea: 'Context', gap: 'Left out the audience', quote: 'you did not say who it is for', card: { type: 'short', prompt: 'What was missing?', answer: 'The audience' } }, { idea: 'no gap' }, { gap: 'Bad card', card: { type: 'mc', prompt: 'x', answer: 'y' } }],
    skipped: [{ idea: 'Tokens', reason: 'already covered in Module 1' }, {}], note: 5 });
  assert.equal(plan.placements.length, 1); assert.equal(plan.placements[0].lessons.length, 1); assert.deepEqual(plan.placements[0].lessons[0].ideas, ['Role and task']);
  assert.deepEqual(plan.found, ['chat', 'feedback']); assert.equal(plan.weakSpots.length, 2); assert.equal(plan.weakSpots[0].card.type, 'short'); assert.equal(plan.weakSpots[1].card, null);
  assert.equal(plan.skipped.length, 1); assert.equal(plan.note, '5');
  assert.deepEqual(L.validateIntake(null).placements, []); assert.deepEqual(L.validateIntake('x').weakSpots, []);
  const units = [{ id: 'a', title: 'Module 1: Foundations' }, { id: 'b', title: 'Module 2: Prompting' }, { id: 'c', title: 'Agents' }];
  assert.equal(L.matchUnit('module 2: prompting', units), 'b'); assert.equal(L.matchUnit('Module 2 - Advanced prompts', units), 'b', 'same module number joins the existing module');
  assert.equal(L.matchUnit('AGENTS', units), 'c'); assert.equal(L.matchUnit('Module 3: Tools', units), null); assert.equal(L.matchUnit('Evaluation', units), null); assert.equal(L.matchUnit('', units), null);
  assert.equal(L.matchUnit('Module 12', [{ id: 'x', title: 'Module 1' }]), null, 'module 12 is not module 1');
  assert.equal(L.matchUnit('Prompting part 2', [{ id: 'x', title: 'Agents part 2' }]), null, 'a shared "part 2" does not join unrelated modules');
  assert.deepEqual(L.DEPTHS, ['refresher', 'full', 'review']);
});
