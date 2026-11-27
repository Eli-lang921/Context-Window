/* Pure logic: no DOM, no network. Tested in Node (tests/logic.test.js). */
const L = (() => {
  const CAP = 20, EXTRA = 10, ROLLOVER_HOUR = 3, MASTER_DAYS = 60, LEECH_AT = 4, REWRITE_AT = 2;
  const RATINGS = ['again', 'hard', 'good', 'easy'];
  const TYPES = ['teachback', 'flash', 'short', 'apply'];
  const COST = { flash: 1, short: 1, teachback: 3, apply: 3 };
  const STYLES = ['beginner', 'example', 'predict', 'compare'];
  const PROBES = { light: 2, standard: 4, deep: 6 };
  const PASS = { lenient: 60, standard: 70, strict: 80 };
  const DEFAULTS = {
    probing: 'standard', strictness: 'standard', retention: 0.9, restDays: [],
    voiceOn: true, voiceName: 'buttery', voiceRate: 1, buildModel: 'default', buildModelId: '',
    mix: { outline: true, ai: true, own: true }, sources: { paste: true, vault: true, drive: true, notion: true }
  };

  /* Which Claude builds a course (plans, lessons, self-check, guides). A tier follows whatever model the
     platform currently serves for it; a named model falls back to its tier when the viewer cannot use it. */
  const BUILD_MODELS = [
    { key: 'quick', label: 'Fast', hint: 'Haiku class. Quickest and lightest on your usage; plainer lessons.', tier: 'quick' },
    { key: 'default', label: 'Balanced', hint: 'Sonnet class. A good default for most material.', tier: 'default' },
    { key: 'complex', label: 'Most capable', hint: 'Opus class. Slower and heavier on your usage; best for dense or subtle material.', tier: 'complex' },
    { key: 'claude-fable-5-2', label: 'Fable 5.2', hint: 'A named model. If your plan cannot use it here, the most capable tier answers instead.', tier: 'complex', model: 'claude-fable-5-2' },
    { key: 'other', label: 'Other', hint: 'Any Claude model id you type. If it cannot answer, the most capable tier does.', tier: 'complex' }
  ];
  function modelOpts(choice, customId) {
    const m = BUILD_MODELS.find(x => x.key === choice) || BUILD_MODELS[1];
    const out = { modelTier: m.tier };
    const id = m.key === 'other' ? String(customId || '').trim() : m.model;
    if (id && /^claude-[a-z0-9.\-]{2,60}$/.test(id)) out.model = id;
    else if (m.key === 'other') out.modelTier = 'default';
    return out;
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const pad = n => String(n).padStart(2, '0');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => (typeof u === 'string' && /^https:\/\//i.test(u.trim()) ? u.trim() : '');

  /* ---------- Dates. A study day runs 3 a.m. to 3 a.m. ---------- */
  function dayStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function studyDay(now = new Date(), rollover = ROLLOVER_HOUR) { return dayStr(new Date(now.getTime() - rollover * 3600000)); }
  function parseDay(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(s, n) { const d = parseDay(s); d.setDate(d.getDate() + n); return dayStr(d); }
  function daysBetween(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000); }
  function weekday(s) { return parseDay(s).getDay(); }
  function validDay(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseDay(s)); }
  function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- FSRS-5 (default weights), day granularity ---------- */
  const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
  const DECAY = -0.5, FACTOR = 19 / 81;
  function retrievability(elapsedDays, s) { return s > 0 ? Math.pow(1 + FACTOR * Math.max(0, elapsedDays) / s, DECAY) : 0; }
  function intervalFor(s, retention = 0.9) {
    const r = clamp(Number(retention) || 0.9, 0.7, 0.97);
    return clamp(Math.round(s / FACTOR * (Math.pow(r, 1 / DECAY) - 1)), 1, 3650);
  }
  function initD(g) { return clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10); }
  function newFsrs() { return { s: 0, d: 0, due: null, last: null, reps: 0, lapses: 0, interval: 0 }; }
  function rate(fsrs, rating, today, retention = 0.9) {
    const g = RATINGS.indexOf(rating) + 1;
    if (!g) throw new Error('bad rating ' + rating);
    const f = Object.assign(newFsrs(), fsrs || {});
    if (!f.reps || !(f.s > 0)) { f.s = W[g - 1]; f.d = initD(g); }
    else {
      const elapsed = f.last ? Math.max(0, daysBetween(f.last, today)) : 0;
      const r = retrievability(elapsed, f.s), d = f.d;
      let nd = d + (-W[6] * (g - 3)) * (10 - d) / 9;
      nd = W[7] * initD(4) + (1 - W[7]) * nd;
      let ns;
      if (elapsed === 0) ns = f.s * Math.exp(W[17] * (g - 3 + W[18]));
      else if (g === 1) ns = Math.min(f.s, W[11] * Math.pow(d, -W[12]) * (Math.pow(f.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
      else ns = f.s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(f.s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));
      f.s = clamp(ns, 0.01, 36500); f.d = clamp(nd, 1, 10);
    }
    f.reps += 1; if (g === 1) f.lapses += 1;
    f.interval = g === 1 ? 1 : intervalFor(f.s, retention);
    f.due = addDays(today, f.interval); f.last = today;
    f.s = +f.s.toFixed(4); f.d = +f.d.toFixed(4);
    return f;
  }
  function previewIntervals(fsrs, today, retention) {
    const out = {}; for (const r of RATINGS) out[r] = rate(fsrs, r, today, retention).interval; return out;
  }

  /* ---------- Scores, verdicts, ratings ---------- */
  const passMark = strictness => PASS[strictness] || PASS.standard;
  function hintPenalty(n) { return 10 * clamp(n || 0, 0, 2); }
  function finalScore(raw, hints) { return clamp(Math.round(Number(raw) || 0) - hintPenalty(hints), 0, 100); }
  function ratingFromScore(score, strictness) {
    const p = passMark(strictness);
    if (score < p - 20) return 'again';
    if (score < p) return 'hard';
    if (score < Math.max(90, p + 10)) return 'good';
    return 'easy';
  }
  function verdictFromScore(score, strictness) {
    const p = passMark(strictness);
    return score >= p ? 'correct' : score >= p - 20 ? 'partial' : 'incorrect';
  }
  /* One-tap override: a fail becomes correct and the rating is recomputed. */
  function override(result, strictness) {
    const p = passMark(strictness);
    const score = result.score == null ? null : Math.max(result.score, p);
    return Object.assign({}, result, { verdict: 'correct', score, rating: score == null ? 'good' : ratingFromScore(score, strictness), overridden: true });
  }

  /* ---------- Cards ---------- */
  const cost = c => COST[c.type] || 1;
  function newCard(base) {
    return Object.assign({ type: 'flash', status: 'active', fsrs: newFsrs(), attempts: { n: 0, correct: 0 }, misses: 0, guessCount: 0, overrides: 0, mastered: false, masteredDue: null, leech: false, styleIdx: 0 }, base);
  }
  function dueDate(c) { return c.mastered ? c.masteredDue : (c.fsrs && c.fsrs.due) || null; }
  function isDue(c, today) { const d = c.status === 'active' ? dueDate(c) : null; return !!d && d <= today; }
  function pullEarlier(card, today) {
    const c = clone(card), tomorrow = addDays(today, 1);
    if (c.mastered) { if (!c.masteredDue || c.masteredDue > tomorrow) c.masteredDue = tomorrow; }
    else if (c.fsrs && c.fsrs.due && c.fsrs.due > tomorrow) c.fsrs.due = tomorrow;
    return c;
  }
  /* r: { rating, guess, overridden, score, mode: 'review' | 'light', today, retention }.
     'light' is for tests, games and cram: a miss pulls the review earlier, a hit changes nothing. */
  function applyResult(card, r) {
    let c = clone(card);
    const rating = r.guess ? 'again' : r.rating;
    if (!RATINGS.includes(rating)) throw new Error('bad rating ' + rating);
    const miss = rating === 'again';
    c.attempts = { n: ((c.attempts && c.attempts.n) || 0) + 1, correct: ((c.attempts && c.attempts.correct) || 0) + (miss ? 0 : 1) };
    /* Only misses in real review count toward a leech; a second look, test or game miss does not. */
    if (miss && r.mode !== 'light') c.misses = (c.misses || 0) + 1;
    if (r.guess) c.guessCount = (c.guessCount || 0) + 1;
    if (r.overridden) { c.overrides = (c.overrides || 0) + 1; if (c.overrides >= REWRITE_AT) c.offerRewrite = true; }
    if ((c.misses || 0) >= LEECH_AT) c.leech = true;
    if (r.score != null && !r.guess) { if (c.firstScore == null) c.firstScore = r.score; c.lastScore = r.score; c.bestScore = Math.max(c.bestScore == null ? 0 : c.bestScore, r.score); }
    if (r.mode === 'light') { if (miss) c = pullEarlier(c, r.today); }
    else if (c.mastered) {
      if (miss) { c.mastered = false; c.masteredDue = null; c.fsrs = rate(c.fsrs, 'again', r.today, r.retention); }
      else c.masteredDue = addDays(r.today, MASTER_DAYS);
    } else c.fsrs = rate(c.fsrs, rating, r.today, r.retention);
    if (c.type === 'teachback' && r.mode !== 'light') c.styleIdx = ((c.styleIdx || 0) + 1) % STYLES.length;
    /* lastSeen is what just happened; lastRating (used for 'weak') is not cleared by a hit in a test or game. */
    c.lastSeen = rating;
    if (r.mode !== 'light' || miss) c.lastRating = rating;
    c.lastAt = r.today; c.lastGuess = !!r.guess;
    return c;
  }
  function markMastered(card, today) { const c = clone(card); c.mastered = true; c.masteredDue = addDays(today, MASTER_DAYS); return c; }
  function unmaster(card, today) { const c = clone(card); c.mastered = false; c.masteredDue = null; if (!c.fsrs || !c.fsrs.due) c.fsrs = Object.assign(newFsrs(), c.fsrs, { due: today }); return c; }
  const styleFor = c => STYLES[(c.styleIdx || 0) % STYLES.length];

  /* ---------- Daily queue ----------
     Deadline courses first (nearest deadline), then oldest due; items that do not fit the remaining units
     are skipped for smaller ones; the result is interleaved across courses and units. */
  function buildQueue(cards, o = {}) {
    const today = o.today, cap = o.cap == null ? CAP : o.cap, courses = o.courses || {};
    const skip = o.exclude ? new Set(o.exclude) : null;
    const due = cards.filter(c => isDue(c, today) && !(skip && skip.has(c.id)) && !(courses[c.courseId] && courses[c.courseId].archived));
    const dl = c => { const k = courses[c.courseId]; return k && validDay(k.deadline) && k.deadline >= today ? k.deadline : '9999-12-31'; };
    /* Ties on the due date go to teach-backs first (they are most of review), then to the weaker card. */
    const tbFirst = c => (c.type === 'teachback' ? 0 : 1);
    due.sort((a, b) => dl(a) < dl(b) ? -1 : dl(a) > dl(b) ? 1 : dueDate(a) < dueDate(b) ? -1 : dueDate(a) > dueDate(b) ? 1 : tbFirst(a) - tbFirst(b) || weakness(b) - weakness(a) || (a.createdAt || 0) - (b.createdAt || 0));
    const dueUnits = due.reduce((n, c) => n + cost(c), 0);
    if (o.restDay) return { items: [], dueTotal: due.length, dueUnits, backlog: due.length, unitsPlanned: 0, restDay: true };
    let remaining = Math.max(0, cap - (o.used || 0));
    const picked = [];
    for (const c of due) {
      if (remaining <= 0) break;
      const k = cost(c);
      if (k <= remaining) { picked.push(c); remaining -= k; }
    }
    const unitsPlanned = picked.reduce((n, c) => n + cost(c), 0);
    return { items: interleave(picked), dueTotal: due.length, dueUnits, backlog: due.length - picked.length, unitsPlanned, restDay: false };
  }
  function interleave(items) {
    const pool = items.slice(), out = [];
    let last = null;
    while (pool.length) {
      let i = pool.findIndex(c => !last || c.courseId !== last.courseId);
      if (i < 0) i = pool.findIndex(c => c.unitId !== last.unitId);
      if (i < 0) i = pool.findIndex(c => c.ideaId !== last.ideaId);
      if (i < 0) i = 0;
      last = pool.splice(i, 1)[0]; out.push(last);
    }
    return out;
  }
  function forecast(cards, today, days = 7) {
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(today, i);
      const units = cards.filter(c => c.status === 'active' && dueDate(c) && (i === 0 ? dueDate(c) <= d : dueDate(c) === d)).reduce((n, c) => n + cost(c), 0);
      out.push({ date: d, units });
    }
    return out;
  }

  /* ---------- Streak and rest days ---------- */
  function isRestDay(day, restDays) { return (restDays || []).includes(weekday(day)); }
  /* A day counts when the due review was finished, or the whole cap was used. */
  function dayDone(unitsUsed, dueRemaining, servable) { return dueRemaining === 0 || unitsUsed >= CAP || servable === 0; }
  function streak(days, today, restDays) {
    days = days || {};
    const keys = Object.keys(days).filter(k => days[k] && days[k].done).sort();
    if (!keys.length) return 0;
    const first = keys[0];
    let n = 0, d = today;
    if (!(days[d] && days[d].done)) d = addDays(d, -1);
    while (d >= first) {
      if (days[d] && days[d].done) n++;
      else if (!isRestDay(d, restDays)) break;
      d = addDays(d, -1);
    }
    return n;
  }

  /* ---------- XP and badges ---------- */
  const XP = { flash: 5, short: 10, apply: 25, teachback: 30, testq: 8, quickTest: 40, fullTest: 120, unitPass: 100, game: 2, dayDone: 20 };
  function xpFor(e) {
    if (e.guess) return 0;
    if (e.kind === 'card') {
      if (e.rating === 'again') return e.type === 'teachback' ? 8 : 2;
      return (XP[e.type] || 5) + (e.type === 'teachback' && e.score != null ? Math.round(e.score / 5) : 0);
    }
    if (e.kind === 'dayDone') return XP.dayDone + Math.min(50, 2 * (e.streak || 0));
    return XP[e.kind] || 0;
  }
  const level = xp => Math.floor(Math.sqrt(Math.max(0, xp || 0) / 100)) + 1;
  const BADGES = [
    { id: 'streak7', name: '7-day streak', desc: 'Finish your review 7 days running', icon: 'flame', test: s => s.bestStreak >= 7 },
    { id: 'streak30', name: '30-day streak', desc: 'Finish your review 30 days running', icon: 'flame', test: s => s.bestStreak >= 30 },
    { id: 'streak100', name: '100-day streak', desc: 'Finish your review 100 days running', icon: 'flame', test: s => s.bestStreak >= 100 },
    { id: 'unit1', name: 'First unit', desc: 'Pass your first unit', icon: 'flag', test: s => s.unitsPassed >= 1 },
    { id: 'unit5', name: 'Five units', desc: 'Pass 5 units', icon: 'flag', test: s => s.unitsPassed >= 5 },
    { id: 'course1', name: 'Course complete', desc: 'Pass every unit in a course', icon: 'cap', test: s => s.coursesDone >= 1 },
    { id: 'tb90x10', name: 'Sharp explainer', desc: '10 teach-backs scored 90 or higher', icon: 'voice', test: s => s.tb90 >= 10 },
    { id: 'tb50', name: 'Fifty teach-backs', desc: 'Explain 50 ideas back', icon: 'voice', test: s => s.teachbacks >= 50 },
    { id: 'test1', name: 'Test passed', desc: 'Pass a quick practice test', icon: 'check', test: s => s.testsPassed >= 1 },
    { id: 'sim1', name: 'Exam ready', desc: 'Pass a full exam simulation', icon: 'star', test: s => s.simsPassed >= 1 }
  ];
  function earnedBadges(stats) { const s = Object.assign({ bestStreak: 0, unitsPassed: 0, coursesDone: 0, tb90: 0, teachbacks: 0, testsPassed: 0, simsPassed: 0 }, stats || {}); return BADGES.filter(b => b.test(s)).map(b => b.id); }

  /* ---------- Units, pace, cram ---------- */
  /* A unit passes when the average teach-back score across its ideas meets the pass mark. Each idea counts its best
     first-try score (the try before any re-teach), so a weak start can be repaired by explaining it again later. */
  const passScoreOf = c => (c.bestScore != null ? c.bestScore : c.firstScore);
  function unitStatus(tbCards, strictness) {
    const done = tbCards.filter(c => c.firstScore != null);
    const avg = done.length ? Math.round(done.reduce((n, c) => n + passScoreOf(c), 0) / done.length) : null;
    return { total: tbCards.length, attempted: done.length, avg, passed: tbCards.length > 0 && done.length === tbCards.length && avg >= passMark(strictness) };
  }
  function pace(course, o) {
    const today = o.today, left = Math.max(0, o.lessonsLeft || 0), total = Math.max(1, o.lessonsTotal || 1);
    if (!validDay(course.deadline)) return { mode: 'self', lessonsLeft: left };
    const daysLeft = daysBetween(today, course.deadline);
    if (left === 0) return { mode: 'deadline', status: 'done', daysLeft, lessonsLeft: 0, lessonsPerDay: 0, minutesNeeded: 0, cramSuggested: daysLeft >= 0 && daysLeft <= 5 };
    let studyDays = 0;
    const reserve = daysLeft > 10 ? 5 : 0;
    for (let i = 0; i < Math.max(0, daysLeft - reserve); i++) if (!isRestDay(addDays(today, i), o.restDays)) studyDays++;
    studyDays = Math.max(1, studyDays);
    const lessonsPerDay = Math.ceil(left / studyDays);
    const minutesNeeded = lessonsPerDay * 12 + 10;
    const minutes = Number(course.minutesPerDay) || 30;
    const status = daysLeft < 0 ? 'past' : minutesNeeded > minutes * 1.15 ? 'behind' : 'on track';
    return { mode: 'deadline', status, daysLeft, lessonsLeft: left, lessonsPerDay, minutesNeeded, progress: Math.round(100 * (total - left) / total), cramSuggested: daysLeft >= 0 && daysLeft <= 5 };
  }
  function weakness(c) {
    const yieldW = c.yield === 'high' ? 2 : c.yield === 'low' ? 0 : 1;
    const score = c.lastScore != null ? (100 - c.lastScore) / 25 : c.attempts && c.attempts.n ? 2 * (1 - c.attempts.correct / c.attempts.n) : 1;
    return 2 * (c.misses || 0) + score + yieldW + (c.leech ? 2 : 0) + (c.lastRating === 'again' ? 1.5 : 0);
  }
  function cramSelect(cards, limit = 40) {
    return cards.filter(c => c.status === 'active' && !c.mastered).map(c => ({ c, w: weakness(c) })).sort((a, b) => b.w - a.w || (a.c.createdAt || 0) - (b.c.createdAt || 0)).slice(0, limit).map(x => x.c);
  }
  /* Mind-map colour for one idea, from its cards. */
  function ideaLevel(cards) {
    if (!cards.length) return 'new';
    if (cards.every(c => c.mastered)) return 'mastered';
    const seen = cards.filter(c => c.attempts && c.attempts.n);
    if (!seen.length) return 'new';
    if (cards.some(c => c.leech || c.lastRating === 'again')) return 'weak';
    const tb = cards.find(c => c.type === 'teachback' && c.lastScore != null);
    const n = seen.reduce((s, c) => s + c.attempts.n, 0), ok = seen.reduce((s, c) => s + c.attempts.correct, 0);
    const pct = tb ? tb.lastScore : Math.round(100 * ok / n);
    return pct < 60 ? 'weak' : pct < 85 ? 'learning' : 'strong';
  }

  /* ---------- Tests ---------- */
  function examConfig(course, kind) {
    const ex = (course && course.exam) || {};
    if (kind === 'full') return { n: clamp(Math.round(Number(ex.questions) || 60), 10, 200), minutes: clamp(Math.round(Number(ex.minutes) || 90), 10, 300) };
    return { n: 15, minutes: 18 };
  }
  function scoreTest(items) {
    const byUnit = {};
    let correct = 0;
    for (const it of items) {
      const u = it.unitId || 'none';
      byUnit[u] = byUnit[u] || { n: 0, correct: 0 };
      byUnit[u].n++; if (it.ok) { byUnit[u].correct++; correct++; }
    }
    for (const u in byUnit) byUnit[u].pct = Math.round(100 * byUnit[u].correct / byUnit[u].n);
    const weakUnits = Object.keys(byUnit).filter(u => u !== 'none' && byUnit[u].pct < 70).sort((a, b) => byUnit[a].pct - byUnit[b].pct);
    return { total: items.length, correct, percent: items.length ? Math.round(100 * correct / items.length) : 0, byUnit, weakUnits, misses: items.filter(i => !i.ok) };
  }
  function clozeMatch(given, answer) {
    const n = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const a = n(given), b = n(answer);
    return !!a && (a === b || a === b.replace(/s$/, '') || a.replace(/s$/, '') === b);
  }

  /* ---------- Reporting ---------- */
  function accuracyBy(cards, key) {
    const by = {};
    for (const c of cards) {
      const k = c[key] || 'none', a = c.attempts || {};
      by[k] = by[k] || { n: 0, correct: 0, cards: 0 };
      by[k].cards++; by[k].n += a.n || 0; by[k].correct += a.correct || 0;
    }
    for (const k in by) by[k].pct = by[k].n ? Math.round(100 * by[k].correct / by[k].n) : null;
    return by;
  }
  function weakestIdeas(cards, limit = 5) {
    const by = {};
    for (const c of cards) {
      if (!c.ideaId || !(c.attempts && c.attempts.n)) continue;
      const k = c.ideaId; by[k] = by[k] || { ideaId: k, courseId: c.courseId, unitId: c.unitId, title: c.ideaTitle || '', w: 0, n: 0 };
      by[k].w += weakness(c); by[k].n++;
    }
    return Object.values(by).map(x => Object.assign(x, { w: +(x.w / x.n).toFixed(2) })).filter(x => x.w >= 2.5).sort((a, b) => b.w - a.w).slice(0, limit);
  }
  function weekSummary(days, today) {
    const out = { minutes: 0, units: 0, xp: 0, daysStudied: 0, perDay: [] };
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i), x = (days || {})[d] || {};
      out.minutes += x.minutes || 0; out.units += (x.units || 0) + (x.extra || 0); out.xp += x.xp || 0;
      if ((x.units || 0) + (x.extra || 0) > 0 || (x.minutes || 0) > 0) out.daysStudied++;
      out.perDay.push({ date: d, minutes: x.minutes || 0, units: (x.units || 0) + (x.extra || 0), done: !!x.done });
    }
    return out;
  }
  function settingsFor(globalDoc, courseDoc) {
    const g = Object.assign({}, DEFAULTS, globalDoc || {});
    const o = courseDoc || {};
    for (const k of ['probing', 'strictness', 'retention']) if (o[k] != null && o[k] !== '') g[k] = o[k];
    if (!PROBES[g.probing]) g.probing = 'standard';
    if (!PASS[g.strictness]) g.strictness = 'standard';
    g.retention = clamp(Number(g.retention) || 0.9, 0.8, 0.95);
    g.voiceRate = clamp(Number(g.voiceRate) || 1, 0.7, 1.5);
    if (!BUILD_MODELS.some(m => m.key === g.buildModel)) g.buildModel = 'default';
    g.buildModelId = typeof g.buildModelId === 'string' ? g.buildModelId.trim().slice(0, 64) : '';
    g.restDays = (Array.isArray(g.restDays) ? g.restDays : []).map(Number).filter(n => n >= 0 && n <= 6);
    return g;
  }

  /* ---------- Text ---------- */
  function chunkText(text, size = 90000) {
    const t = String(text || ''), out = [];
    for (let i = 0; i < t.length; i += size) out.push(t.slice(i, i + size));
    return out.length ? out : [''];
  }
  /* Split long material into ordered segments on paragraph breaks, so nothing is silently cut. */
  function splitSegments(text, target = 6000) {
    const paras = String(text || '').replace(/\r\n/g, '\n').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const out = []; let cur = '';
    const push = () => { if (cur) { out.push(cur); cur = ''; } };
    for (let p of paras) {
      while (p.length > target * 2) { push(); let cut = p.lastIndexOf('. ', target * 2); if (cut < target) cut = target * 2; out.push(p.slice(0, cut + 1).trim()); p = p.slice(cut + 1).trim(); }
      if (cur && cur.length + p.length + 2 > target) push();
      cur = cur ? cur + '\n\n' + p : p;
    }
    push();
    return out;
  }
  const STOP = new Set('the a an and or of to in on for is are was were be been it this that with as by at from what why how which when does do did can you your their its into than then them they these those about not but if so use used using'.split(' '));
  function tokens(s) { return new Set(String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w))); }
  function overlap(a, b) { if (!a.size || !b.size) return 0; let n = 0; for (const t of a) if (b.has(t)) n++; return n / Math.sqrt(a.size * b.size); }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item'; }
  /* The passage around a quote inside the source text, for the Explain button. */
  function passageAround(text, quote, span = 320) {
    const t = String(text || ''), q = String(quote || '').trim();
    if (!t || q.length < 8) return '';
    let i = t.indexOf(q);
    if (i < 0) i = t.toLowerCase().indexOf(q.toLowerCase().slice(0, 40));
    if (i < 0) return '';
    const a = Math.max(0, i - span), b = Math.min(t.length, i + q.length + span);
    return (a > 0 ? '…' : '') + t.slice(a, b).trim() + (b < t.length ? '…' : '');
  }

  /* ---------- Validators for AI output ---------- */
  function str(v, max = 2000) { return typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : ''; }
  function arr(v, max = 12) { return Array.isArray(v) ? v.slice(0, max) : []; }
  const origin = v => (v === 'source' ? 'source' : 'added');

  function validateVisual(v) {
    if (!v || typeof v !== 'object') return null;
    const type = str(v.type, 20);
    let out = null;
    if (type === 'flow') {
      const steps = arr(v.steps).map(s => ({ label: str(s && s.label, 120), detail: str(s && s.detail, 300) })).filter(s => s.label);
      if (steps.length >= 2) out = { type, steps, loop: !!v.loop, loopLabel: str(v.loopLabel, 120) };
    } else if (type === 'compare') {
      const side = s => s && typeof s === 'object' ? { title: str(s.title, 80), lines: arr(s.lines, 10).map(x => str(x, 300)).filter(Boolean) } : null;
      const l = side(v.left), r = side(v.right);
      if (l && r && l.lines.length && r.lines.length) out = { type, left: l, right: r, verdict: str(v.verdict, 300) };
    } else if (type === 'steps') {
      const steps = arr(v.steps, 10).map(s => ({ title: str(s && s.title, 120), text: str(s && s.text, 500) })).filter(s => s.title || s.text);
      if (steps.length >= 2) out = { type, steps };
    } else if (type === 'table') {
      const columns = arr(v.columns, 6).map(c => str(c, 80));
      const rows = arr(v.rows, 12).filter(Array.isArray).map(r => columns.map((_, i) => str(r[i], 300)));
      if (columns.length >= 2 && rows.length >= 1) out = { type, columns, rows };
    } else if (type === 'layers') {
      const layers = arr(v.layers, 8).map(x => ({ label: str(x && x.label, 100), detail: str(x && x.detail, 300), size: Math.max(0, Number(x && x.size) || 0) })).filter(x => x.label);
      if (layers.length >= 2) out = { type, layers };
    } else if (type === 'spectrum') {
      const points = arr(v.points, 8).map(p => ({ pos: clamp(Number(p && p.pos), 0, 100), label: str(p && p.label, 100), detail: str(p && p.detail, 300) })).filter(p => p.label && Number.isFinite(p.pos));
      if (points.length >= 1) out = { type, leftLabel: str(v.leftLabel, 60) || 'Low', rightLabel: str(v.rightLabel, 60) || 'High', points };
    } else if (type === 'chart') {
      const points = arr(v.points, 12).map(p => ({ label: str(p && p.label, 40), value: Number(p && p.value) })).filter(p => p.label && Number.isFinite(p.value));
      if (points.length >= 2) out = { type, kind: v.kind === 'line' ? 'line' : 'bar', points, unit: str(v.unit, 20), xLabel: str(v.xLabel, 60), yLabel: str(v.yLabel, 60) };
    }
    if (!out) return null;
    out.caption = str(v.caption, 300);
    return out;
  }
  function validatePart(p) {
    if (typeof p === 'string') return p.trim() ? { text: str(p, 3000), origin: 'added' } : null;
    if (!p || typeof p !== 'object' || !str(p.text)) return null;
    return { text: str(p.text, 3000), origin: origin(p.origin) };
  }
  function validateCard(raw) {
    if (!raw || typeof raw !== 'object') return null;
    let type = str(raw.type, 20).toLowerCase();
    if (type === 'flashcard') type = 'flash';
    if (type === 'short answer' || type === 'short_answer') type = 'short';
    if (!['flash', 'short', 'apply'].includes(type)) return null;
    if (Array.isArray(raw.options) || Array.isArray(raw.choices)) return null;
    const prompt = str(raw.prompt, 2000), answer = str(raw.answer, 2500);
    if (!prompt || !answer) return null;
    return { type, prompt, answer, rubric: arr(raw.rubric, 6).map(x => str(x, 300)).filter(Boolean), explanation: str(raw.explanation, 1200), quote: str(raw.quote, 600), origin: origin(raw.origin), difficulty: clamp(Math.round(Number(raw.difficulty) || 2), 1, 5) };
  }
  function validateIdea(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = str(raw.title, 140), mechanism = validatePart(raw.mechanism);
    const keyPoints = arr(raw.keyPoints, 6).map(x => str(x, 300)).filter(Boolean);
    if (!title || !mechanism || keyPoints.length < 2) return null;
    const analogy = validatePart(raw.analogy); if (analogy) analogy.origin = 'added';
    let example = null;
    if (raw.example && typeof raw.example === 'object') {
      const steps = arr(raw.example.steps, 8).map(s => ({ label: str(s && s.label, 120), text: str(s && s.text, 800) })).filter(s => s.text);
      if (steps.length) example = { title: str(raw.example.title, 120) || 'Worked example', steps, result: str(raw.example.result, 600), origin: origin(raw.example.origin) };
    }
    const pr = raw.prompts && typeof raw.prompts === 'object' ? raw.prompts : {};
    const prompts = {}; for (const s of STYLES) prompts[s] = str(pr[s], 500);
    let cloze = null;
    if (raw.cloze && str(raw.cloze.sentence) && str(raw.cloze.answer).length >= 4 && !STOP.has(str(raw.cloze.answer).toLowerCase()) && !/_{2,}/.test(str(raw.cloze.sentence)) && str(raw.cloze.sentence).toLowerCase().includes(str(raw.cloze.answer).toLowerCase())) cloze = { sentence: str(raw.cloze.sentence, 400), answer: str(raw.cloze.answer, 60) };
    return {
      title, analogy, mechanism, example, why: validatePart(raw.why), visual: validateVisual(raw.visual), visualOrigin: origin(raw.visualOrigin),
      quote: str(raw.quote, 600), keyPoints, prompts, hints: arr(raw.hints, 2).map(x => str(x, 300)).filter(Boolean), cloze,
      yield: ['high', 'medium', 'low'].includes(raw.yield) ? raw.yield : 'medium',
      terms: arr(raw.terms, 6).map(t => ({ term: str(t && t.term, 60), def: str(t && t.def, 400), fromSource: !!(t && t.fromSource) })).filter(t => t.term && t.def),
      cards: arr(raw.cards, 4).map(validateCard).filter(Boolean),
      sourceIssue: raw.sourceIssue && str(raw.sourceIssue.issue) ? { quote: str(raw.sourceIssue.quote, 500), issue: str(raw.sourceIssue.issue, 600) } : null
    };
  }
  function validateSyllabus(raw) {
    const units = arr(raw && raw.units, 30).map(u => ({
      title: str(u && u.title, 120), summary: str(u && u.summary, 500),
      lessons: arr(u && u.lessons, 5).map(l => ({ title: str(l && l.title, 120), ideas: arr(l && l.ideas, 4).map(x => str(x, 160)).filter(Boolean) })).filter(l => l.title),
      segs: arr(u && u.segs, 12).map(x => str(x, 40)).filter(Boolean),
      origin: ['source', 'added', 'mixed'].includes(u && u.origin) ? u.origin : 'added'
    })).filter(u => u.title);
    return { units, note: str(raw && raw.note, 600) };
  }
  function validateTestQ(raw, mc) {
    if (!raw || typeof raw !== 'object') return null;
    const q = str(raw.q || raw.prompt, 1500), explanation = str(raw.explanation, 1000);
    if (!q) return null;
    const base = { q, explanation, unit: Number.isInteger(raw.unit) ? raw.unit : -1, idea: str(raw.idea, 160), difficulty: clamp(Math.round(Number(raw.difficulty) || 2), 1, 5) };
    if (mc) {
      const options = arr(raw.options, 5).map(x => str(x, 400)).filter(Boolean), answer = Number(raw.answer);
      if (options.length < 3 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
      return Object.assign(base, { type: 'mc', options, answer });
    }
    const answer = str(raw.answer, 1200);
    return answer ? Object.assign(base, { type: 'short', answer }) : null;
  }

  /* ---------- Add learning: the filing plan Claude proposes for a paste ---------- */
  const DEPTHS = ['refresher', 'full', 'review'];
  const FOUND = ['lesson', 'notes', 'answers', 'feedback', 'chat'];
  function validateIntake(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const placements = arr(raw.placements, 12).map(p => ({
      unit: str(p && p.unit, 120), isNew: !!(p && p.isNew), kind: p && p.kind === 'gaps' ? 'gaps' : 'course',
      tasks: arr(p && p.tasks, 5).map(t => ({ title: str(t && t.title, 120) || 'Exercise', steps: arr(t && t.steps, 8).map(x => str(x, 500)).filter(Boolean), criteria: arr(t && t.criteria, 8).map(x => str(x, 500)).filter(Boolean) })).filter(t => t.criteria.length || t.steps.length),
      lessons: arr(p && p.lessons, 8).map(l => ({ title: str(l && l.title, 120), ideas: arr(l && l.ideas, 3).map(x => str(x, 160)).filter(Boolean), segs: arr(l && l.segs, 12).map(x => str(x, 60)).filter(Boolean), known: !!(l && l.known === true) })).filter(l => l.title && l.ideas.length)
    })).filter(p => p.unit && (p.lessons.length || p.tasks.length));
    /* A tip on an answer the tutor already graded strong is not a weak spot. */
    const weakSpots = arr(raw.weakSpots, 24).filter(w => !(w && w.kind === 'refinement')).map(w => ({ idea: str(w && w.idea, 160), unit: str(w && w.unit, 120), topic: str(w && w.topic, 120), gap: str(w && w.gap, 500), quote: str(w && w.quote, 400), card: validateCard(w && w.card) })).filter(w => w.gap);
    const skipped = arr(raw.skipped, 20).map(s => ({ idea: str(s && s.idea, 160), reason: str(s && s.reason, 200) })).filter(s => s.idea);
    const glossary = arr(raw.glossary, 24).map(t => ({ term: str(t && t.term, 60), def: str(t && t.def, 400), fromSource: !!(t && t.fromSource) })).filter(t => t.term && t.def);
    return { title: str(raw.title, 120), found: arr(raw.found, 6).map(x => str(x, 20)).filter(x => FOUND.includes(x)), profile: str(raw.profile, 1500), glossary, placements, weakSpots, skipped, note: str(raw.note, 400) };
  }
  /* The self-check pass returns repairs, not just complaints. validateFixes cleans them; applyFixes applies what it
     safely can and leaves the rest as flags on the idea or card. */
  const FIX_TARGETS = ['mechanism', 'analogy', 'example', 'why', 'keyPoints', 'hints', 'cloze', 'quote', 'card'];
  function validateFixes(raw, nIdeas) {
    return arr(raw && (raw.fixes || raw.flags), 30).map(f => {
      const idea = Number(f && f.idea); if (!Number.isInteger(idea) || idea < 0 || idea >= nIdeas) return null;
      const card = Number.isInteger(f.card) ? f.card : null;
      const target = FIX_TARGETS.includes(f.target) ? f.target : card != null ? 'card' : 'mechanism';
      let example = null;
      if (f.example && typeof f.example === 'object') { const steps = arr(f.example.steps, 8).map(s => ({ label: str(s && s.label, 120), text: str(s && s.text, 800) })).filter(s => s.text); if (steps.length) example = { title: str(f.example.title, 120) || 'Worked example', steps, result: str(f.example.result, 600) }; }
      return { idea, target, card: target === 'card' ? card : null, problem: str(f.problem, 500), severity: f.severity === 'high' ? 'high' : 'low', action: ['relabel', 'replace', 'drop', 'flag'].includes(f.action) ? f.action : 'flag', to: f.to === 'source' ? 'source' : 'added',
        text: str(f.text, 3000), example, points: arr(f.points, 6).map(x => str(x, 300)).filter(Boolean),
        cardFix: f.cardFix && typeof f.cardFix === 'object' ? { prompt: str(f.cardFix.prompt, 2000), answer: str(f.cardFix.answer, 2500), explanation: str(f.cardFix.explanation, 1200) } : null };
    }).filter(f => f && f.problem);
  }
  function applyFixes(ideas0, fixes) {
    const ideas = clone(ideas0), drop = {}; let applied = 0, open = 0;
    for (const i of ideas) { i.flags = i.flags || []; i.cards = i.cards || []; }
    for (const f of fixes) {
      const i = ideas[f.idea], c = f.target === 'card' && f.card != null ? i.cards[f.card] : null; let ok = false;
      if (f.action === 'relabel') { const part = c || i[f.target]; if (part && typeof part === 'object' && !Array.isArray(part)) { part.origin = f.to || 'added'; ok = true; } }
      else if (f.action === 'replace') {
        if (['mechanism', 'why', 'analogy'].includes(f.target) && f.text && i[f.target]) { i[f.target].text = f.text; ok = true; }
        else if (f.target === 'example' && f.example) { i.example = Object.assign({}, f.example, { origin: i.example ? i.example.origin : 'added' }); ok = true; }
        else if (f.target === 'keyPoints' && f.points.length >= 2) { i.keyPoints = f.points; ok = true; }
        else if (f.target === 'hints' && f.points.length) { i.hints = f.points.slice(0, 2); ok = true; }
        else if (f.target === 'cloze') { const ans = f.points[0] || ''; if (f.text && ans.length >= 4 && f.text.toLowerCase().includes(ans.toLowerCase())) { i.cloze = { sentence: f.text, answer: ans }; ok = true; } }
        else if (c && f.cardFix && f.cardFix.prompt && f.cardFix.answer) { c.prompt = f.cardFix.prompt; c.answer = f.cardFix.answer; if (f.cardFix.explanation) c.explanation = f.cardFix.explanation; ok = true; }
      } else if (f.action === 'drop') { if (c) { (drop[f.idea] = drop[f.idea] || new Set()).add(f.card); ok = true; } else if (f.target === 'analogy' && i.analogy) { i.analogy = null; ok = true; } else if (f.target === 'cloze') { i.cloze = null; ok = true; } else if (f.target === 'quote') { i.quote = ''; ok = true; } else if (f.target === 'hints') { i.hints = []; ok = true; } }
      if (ok) { applied++; continue; }
      open++;
      if (c) c.flag = f.problem; else i.flags.push({ problem: f.problem, severity: f.severity });
    }
    for (const k of Object.keys(drop)) ideas[k].cards = ideas[k].cards.filter((c, j) => !drop[k].has(j));
    return { ideas, applied, open };
  }
  /* Two prompts that ask nearly the same thing: the later card is not added. */
  /* Numbers are kept, so "step 1" and "step 2" are different questions. */
  function dupTokens(s) { const t = tokens(s); for (const n of String(s || '').match(/\d+/g) || []) t.add(n); return t; }
  function nearDuplicate(a, b) { const x = dupTokens(a), y = dupTokens(b); return x.size >= 3 && y.size >= 3 && overlap(x, y) >= 0.8; }
  /* Find the existing unit a planned placement belongs to: same title, or the same module number. */
  function matchUnit(title, units) {
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const t = norm(title); if (!t) return null;
    const exact = units.find(u => norm(u.title) === t); if (exact) return exact.id;
    const modNo = s => { const m = /\b(?:module|unit|week|chapter)\s+(\d+)\b/.exec(norm(s)); return m ? m[0].replace(/\s+/g, ' ') : null; };
    const n = modNo(title); if (!n) return null;
    const same = units.find(u => modNo(u.title) === n);
    return same ? same.id : null;
  }

  /* ---------- Markdown export (Obsidian) ---------- */
  function ideaMarkdown(i) {
    const lines = ['### ' + i.title, ''];
    if (i.analogy) lines.push('> **Analogy (added background):** ' + i.analogy.text.replace(/\n+/g, ' '), '');
    lines.push(i.mechanism.text + (i.mechanism.origin === 'added' ? '\n\n_(Added, not from your source.)_' : ''), '');
    if (i.example) { lines.push('**' + i.example.title + '**' + (i.example.origin === 'added' ? ' _(added)_' : ''), ''); i.example.steps.forEach((s, n) => lines.push((n + 1) + '. ' + (s.label ? '**' + s.label + '.** ' : '') + s.text)); if (i.example.result) lines.push('', 'Result: ' + i.example.result); lines.push(''); }
    if (i.why) lines.push('**Why it matters:** ' + i.why.text, '');
    lines.push('**Key points**', ''); i.keyPoints.forEach(k => lines.push('- ' + k));
    if (i.quote) lines.push('', '> "' + i.quote.replace(/\n/g, ' ') + '"');
    return lines.join('\n') + '\n';
  }
  function guideMarkdown(course, unit, lessons, guide, today) {
    const lines = ['---', 'tags: [context-window, ' + slug(course.title) + ']', 'exported: ' + today, '---', '', '# ' + unit.title, '', '_Course: ' + course.title + '_', ''];
    if (guide) {
      if (guide.summary) lines.push(guide.summary, '');
      if (guide.mustKnow && guide.mustKnow.length) { lines.push('## Must know', ''); guide.mustKnow.forEach(x => lines.push('- ' + x)); lines.push(''); }
      if (guide.formulas && guide.formulas.length) { lines.push('## Formulas and rules', ''); guide.formulas.forEach(x => lines.push('- ' + x)); lines.push(''); }
      if (guide.pitfalls && guide.pitfalls.length) { lines.push('## Common mistakes', ''); guide.pitfalls.forEach(x => lines.push('- ' + x)); lines.push(''); }
    }
    const terms = [];
    for (const l of lessons) {
      lines.push('## ' + l.title, '');
      for (const i of l.ideas || []) { lines.push(ideaMarkdown(i)); for (const t of i.terms || []) terms.push(t); }
    }
    if (terms.length) { lines.push('## Terms', ''); terms.forEach(t => lines.push('- **' + t.term + '**: ' + t.def + (t.fromSource ? '' : ' _(added background)_'))); }
    return lines.join('\n') + '\n';
  }

  return {
    CAP, EXTRA, ROLLOVER_HOUR, MASTER_DAYS, LEECH_AT, REWRITE_AT, RATINGS, TYPES, COST, STYLES, PROBES, PASS, DEFAULTS, BADGES, XP, W,
    clone, clamp, esc, safeUrl, dayStr, studyDay, addDays, daysBetween, weekday, validDay, uid,
    retrievability, intervalFor, newFsrs, rate, previewIntervals,
    passMark, hintPenalty, finalScore, ratingFromScore, verdictFromScore, override,
    cost, newCard, dueDate, isDue, pullEarlier, applyResult, markMastered, unmaster, styleFor,
    buildQueue, interleave, forecast, isRestDay, dayDone, streak, xpFor, level, earnedBadges,
    unitStatus, passScoreOf, pace, weakness, cramSelect, ideaLevel, examConfig, scoreTest, clozeMatch,
    accuracyBy, weakestIdeas, weekSummary, settingsFor,
    chunkText, splitSegments, tokens, overlap, slug, passageAround,
    DEPTHS, FOUND, validateIntake, validateFixes, applyFixes, nearDuplicate, matchUnit, BUILD_MODELS, modelOpts,
    str, arr, validateVisual, validatePart, validateCard, validateIdea, validateSyllabus, validateTestQ, ideaMarkdown, guideMarkdown
  };
})();
if (typeof module !== 'undefined') module.exports = L;
