/* Runs the app's own prompts and validators outside the browser, so a course can be generated and graded
   end to end with real model answers instead of canned ones.
   Usage: node tools/offline.js <step> <workdir>
     intake   workdir/manifest.json + material/*  ->  prompts/intake-*.txt
     plan     resp/intake-*.json                  ->  plan.json + prompts/lesson-*.txt
     verify   resp/lesson-*.json                  ->  prompts/verify-*.txt
     assemble resp/verify-*.json                  ->  db/<collection>/<id>.json, seed.json, course.md, report.json
   Model answers go in workdir/resp/<same name as the prompt>.json */
const fs = require('fs'), path = require('path');
const L = require('../src/logic.js'), P = require('../src/prompts.js');
const [step, W] = process.argv.slice(2);
if (!step || !W) { console.error('usage: node tools/offline.js <intake|plan|verify|assemble> <workdir>'); process.exit(1); }
const rd = f => fs.readFileSync(path.join(W, f), 'utf8'), has = f => fs.existsSync(path.join(W, f));
const wr = (f, s) => { fs.mkdirSync(path.dirname(path.join(W, f)), { recursive: true }); fs.writeFileSync(path.join(W, f), typeof s === 'string' ? s : JSON.stringify(s, null, 1)); };
const json = f => { let t = rd(f).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''); return JSON.parse(t); };
const CID = 'caicred', T = L.studyDay(), NOW = Date.now();
const cfg = has('course.json') ? JSON.parse(rd('course.json')) : {};
const COURSE = Object.assign({ title: 'AI Cred', goal: 'Get measurably better at using AI by working through my personalized AI CRED modules', why: '', level: 'some', minutesPerDay: 30, deadline: '', exam: { questions: null, minutes: null, style: '', passing: '' }, mix: { outline: false, own: true, ai: true }, outline: '' }, cfg.course || {});
const DEPTH = L.DEPTHS.includes(cfg.depth) ? cfg.depth : 'refresher';
const manifest = JSON.parse(rd('manifest.json'));
const sources = manifest.map((m, i) => { const text = rd('material/' + m.file).trim(), sid = 'saic' + String(i + 1).padStart(2, '0'); return Object.assign({}, m, { sid, text, segs: L.splitSegments(text).map((t, k) => ({ ref: sid + ':' + k, text: t })) }); });
const segText = {}; for (const s of sources) for (const g of s.segs) segText[g.ref] = g.text;
const material = (refs, cap = 60000) => { const out = []; let n = 0; for (const r of refs) { const t = segText[r]; if (!t || n + t.length > cap) continue; out.push(t); n += t.length; } return out.join('\n\n'); };

if (step === 'intake') {
  let n = 0;
  for (const s of sources) {
    for (let i = 0, part = 0; i < s.segs.length; part++) {
      const batch = []; let size = 0;
      while (i < s.segs.length && (size + s.segs[i].text.length <= 80000 || !batch.length)) { batch.push(s.segs[i]); size += s.segs[i].text.length; i++; }
      wr(`prompts/intake-${s.sid}-${part}.txt`, P.intake({ course: COURSE, units: [], moduleHint: L.str(s.module, 120), segments: batch, planned: [] })); n++;
    }
  }
  console.log(`${sources.length} sources, ${sources.reduce((a, s) => a + s.segs.length, 0)} segments, ${n} intake prompts`);
}

function loadPlan() {
  const norm = x => String(x || '').toLowerCase().trim(), units = [], weak = [], skipped = [], log = [], stats = { placements: 0, lessons: 0, weakRaw: 0, noCard: 0 };
  for (const s of sources) {
    let merged = { title: '', found: [], placements: [], weakSpots: [], skipped: [], note: '' };
    for (let part = 0; has(`resp/intake-${s.sid}-${part}.json`); part++) {
      const raw = json(`resp/intake-${s.sid}-${part}.json`), got = L.validateIntake(raw);
      stats.weakRaw += L.arr(raw.weakSpots, 99).length;
      for (const p of got.placements) { const hit = merged.placements.find(x => norm(x.unit) === norm(p.unit)); if (hit) hit.lessons.push(...p.lessons); else merged.placements.push(p); }
      merged.weakSpots.push(...got.weakSpots); merged.skipped.push(...got.skipped); merged.found = [...new Set(merged.found.concat(got.found))]; merged.title = merged.title || got.title; merged.note = merged.note || got.note;
    }
    const refs = new Set(s.segs.map(g => g.ref)), touched = [];
    for (const p of merged.placements) {
      let uid = L.matchUnit(p.unit, units) || (s.module && merged.placements.length === 1 ? L.matchUnit(s.module, units) : null);
      if (!uid) { uid = 'uaic' + (units.length + 1); units.push({ id: uid, title: p.unit, lessons: [] }); }
      const u = units.find(x => x.id === uid);
      for (const l of p.lessons) u.lessons.push({ title: l.title, ideas: l.ideas, segs: l.segs.filter(r => refs.has(r)), depth: DEPTH, sid: s.sid, addedDay: T });
      if (!touched.includes(u.title)) touched.push(u.title);
      stats.placements++; stats.lessons += p.lessons.length;
    }
    for (const w of merged.weakSpots) { if (!w.card) { stats.noCard++; w.card = L.validateCard({ type: 'short', prompt: `Your tutor's feedback flagged a gap${w.idea ? ' on "' + w.idea + '"' : ''}. What was it, and what should you do instead?`, answer: w.gap, explanation: w.gap, origin: 'source', difficulty: 3 }); } weak.push(Object.assign({ sid: s.sid, unitTitle: touched[0] || '' }, w)); }
    skipped.push(...merged.skipped.map(k => Object.assign({ sid: s.sid }, k)));
    log.push({ sid: s.sid, title: merged.title || s.title, found: merged.found, note: merged.note, units: touched, lessons: merged.placements.reduce((a, p) => a + p.lessons.length, 0), weak: merged.weakSpots.length });
  }
  return { units, weak, skipped, log, stats };
}

if (step === 'plan') {
  const plan = loadPlan(); wr('plan.json', plan);
  let n = 0;
  for (const u of plan.units) {
    const prior = [];
    u.lessons.forEach((les, k) => {
      const refs = les.segs.length ? les.segs : sources.find(s => s.sid === les.sid).segs.map(g => g.ref);
      wr(`prompts/lesson-${u.id}L${k}.txt`, P.lesson({ course: COURSE, unit: u, lesson: les, prior: prior.slice(), material: material(refs), mix: COURSE.mix, depth: les.depth })); n++;
      prior.push(...les.ideas);
    });
  }
  console.log(JSON.stringify({ units: plan.units.map(u => `${u.title} (${u.lessons.length} topics)`), weakSpots: plan.weak.length, skipped: plan.skipped.length, lessonPrompts: n, stats: plan.stats }, null, 1));
}

function loadLessons(plan) {
  const out = [], stats = { ideasRaw: 0, ideasKept: 0, cardsRaw: 0, cardsKept: 0, rejected: [] };
  for (const u of plan.units) u.lessons.forEach((les, k) => {
    const lid = `${u.id}L${k}`; if (!has(`resp/lesson-${lid}.json`)) { stats.rejected.push(lid + ': no response'); return; }
    let raw; try { raw = json(`resp/lesson-${lid}.json`); } catch (e) { stats.rejected.push(lid + ': not JSON'); return; }
    const rawIdeas = L.arr(raw && raw.ideas, 99); stats.ideasRaw += rawIdeas.length;
    for (const r of rawIdeas) stats.cardsRaw += L.arr(r && r.cards, 99).length;
    const ideas = rawIdeas.slice(0, 5).map((r, i) => { const v = L.validateIdea(r); if (!v) stats.rejected.push(`${lid} idea ${i}: failed validation (${r && r.title})`); return v; }).filter(Boolean);
    stats.ideasKept += ideas.length; for (const i of ideas) stats.cardsKept += i.cards.length;
    out.push({ lid, uid: u.id, n: k, les, ideas });
  });
  return { lessons: out, stats };
}

if (step === 'verify') {
  const plan = JSON.parse(rd('plan.json')), { lessons, stats } = loadLessons(plan);
  for (const x of lessons) {
    if (!x.ideas.length) continue;
    const refs = x.les.segs.length ? x.les.segs : sources.find(s => s.sid === x.les.sid).segs.map(g => g.ref);
    wr(`prompts/verify-${x.lid}.txt`, P.verify({ ideas: x.ideas.map(i => ({ title: i.title, analogy: i.analogy, mechanism: i.mechanism, example: i.example, why: i.why, keyPoints: i.keyPoints, cards: i.cards.map(k => ({ type: k.type, prompt: k.prompt, answer: k.answer, origin: k.origin })) })), material: material(refs) }));
  }
  console.log(JSON.stringify(stats, null, 1));
}

if (step === 'assemble') {
  const plan = JSON.parse(rd('plan.json')), { lessons, stats } = loadLessons(plan), db = {};
  const put = (col, id, doc) => { (db[col] = db[col] || {})[id] = doc; };
  let nFlags = 0, unchecked = 0;
  put('courses', CID, Object.assign({}, COURSE, { status: 'active', createdAt: NOW, startedDay: T, log: plan.log.slice().reverse().map((x, i) => ({ at: NOW - i, day: T, title: x.title, summary: [x.lessons ? `${x.lessons} topic${x.lessons === 1 ? '' : 's'} in ${x.units.join(', ')}` : '', x.weak ? `${x.weak} weak spot${x.weak === 1 ? '' : 's'} from feedback` : ''].filter(Boolean).join(' · '), depth: DEPTH })) }));
  put('settings', CID, { strictness: 'standard' });
  for (const s of sources) {
    const chunks = L.chunkText(s.text);
    chunks.forEach((c, i) => put('srctext', `${s.sid}-${i}`, { sid: s.sid, n: i, text: c }));
    const lg = plan.log.find(x => x.sid === s.sid);
    put('sources', s.sid, { courseId: CID, title: L.str((lg && lg.title) || s.title, 120), kind: 'notes', chars: s.text.length, chunks: chunks.length, segCount: s.segs.length, createdAt: NOW, staged: false });
  }
  plan.units.forEach((u, n) => put('units', u.id, { courseId: CID, n, title: L.str(u.title, 120), summary: '', lessons: u.lessons.map((l, k) => Object.assign({}, l, { built: lessons.some(x => x.lid === `${u.id}L${k}` && x.ideas.length) })), segs: [], origin: 'source', status: 'ready', createdAt: NOW + n, builtAt: NOW }));
  for (const x of lessons) {
    if (!x.ideas.length) continue;
    const { lid, uid } = x, early = x.les.depth === 'review';
    let flags = [], checked = true;
    if (has(`resp/verify-${lid}.json`)) { try { const v = json(`resp/verify-${lid}.json`); flags = L.arr(v && v.flags, 20).map(f => ({ idea: Number(f && f.idea), card: f && Number.isInteger(f.card) ? f.card : null, problem: L.str(f && f.problem, 500), severity: f && f.severity === 'high' ? 'high' : 'low' })).filter(f => f.problem && Number.isInteger(f.idea) && x.ideas[f.idea]); } catch (e) { checked = false; } } else checked = false;
    if (!checked) unchecked++;
    nFlags += flags.length;
    const doc = { courseId: CID, unitId: uid, n: x.n, title: x.les.title, depth: x.les.depth, checked, createdAt: NOW, ideas: [] };
    x.ideas.forEach((idea0, k) => {
      const idea = L.clone(idea0), ideaId = lid + 'i' + k, mine = flags.filter(f => f.idea === k), cards = idea.cards; delete idea.cards;
      idea.id = ideaId; idea.flags = mine.filter(f => f.card == null).map(f => ({ problem: f.problem, severity: f.severity })); doc.ideas.push(idea);
      const common = { courseId: CID, unitId: uid, lessonId: lid, ideaId, ideaTitle: idea.title, yield: idea.yield, createdAt: NOW + k }, tbId = ideaId + 't', fsrs = () => (early ? Object.assign(L.newFsrs(), { due: T }) : L.newFsrs());
      put('cards', tbId, L.newCard(Object.assign({}, common, { type: 'teachback', prompt: idea.title, answer: idea.mechanism.text + (idea.why ? '\n\n' + idea.why.text : ''), rubric: idea.keyPoints, prompts: idea.prompts, hints: idea.hints, cloze: idea.cloze, quote: idea.quote, origin: idea.mechanism.origin, tbId, fsrs: fsrs() })));
      cards.forEach((c, j) => { const f = mine.find(m => m.card === j); put('cards', ideaId + 'c' + j, L.newCard(Object.assign({}, common, c, { tbId, createdAt: NOW + k + j + 1, status: f ? 'flagged' : 'active', flag: f ? f.problem : '', fsrs: fsrs() }))); });
      idea.flags.forEach((f, j) => put('reports', `r${lid}i${k}f${j}`, { kind: 'flag', courseId: CID, unitId: uid, lessonId: lid, idea: k, reason: f.severity === 'high' ? 'wrong' : 'unclear', text: f.problem, status: 'open', createdAt: NOW }));
      if (idea.sourceIssue) put('reports', `r${lid}i${k}s`, { kind: 'issue', courseId: CID, unitId: uid, lessonId: lid, idea: k, reason: 'source', text: idea.sourceIssue.issue, quote: idea.sourceIssue.quote, status: 'open', createdAt: NOW });
      for (const t of idea.terms) { const g = L.slug(t.term) + '~' + CID; if (!(db.glossary || {})[g]) put('glossary', g, { term: t.term, def: t.def, fromSource: t.fromSource, courseId: CID, unitId: uid, ideaId, ideaTitle: idea.title }); }
    });
    if (!checked) put('reports', `r${lid}nocheck`, { kind: 'flag', courseId: CID, unitId: uid, lessonId: lid, idea: null, reason: 'unclear', text: `The self-check pass did not run for the lesson "${x.les.title}". Its content has not had a second look.`, status: 'open', createdAt: NOW });
    put('lessons', lid, doc);
  }
  plan.weak.forEach((w, i) => {
    const unit = plan.units.find(u => u.title === w.unitTitle), home = unit ? unit.id : null, cardId = 'kfb' + (i + 1);
    put('cards', cardId, L.newCard(Object.assign({}, w.card, { courseId: CID, unitId: home, ideaTitle: w.idea, quote: w.quote, origin: 'source', fromFeedback: true, createdAt: NOW + i, fsrs: Object.assign(L.newFsrs(), { due: T }) })));
    put('mistakes', 'mfb' + (i + 1), { cardId, courseId: CID, unitId: home, ideaId: null, ideaTitle: w.idea, prompt: w.card.prompt, given: '', why: w.gap + (w.quote ? ' Feedback said: "' + w.quote + '"' : ''), kind: 'feedback', guess: false, day: T, at: NOW + i });
  });
  let count = 0, big = [];
  for (const [col, docs] of Object.entries(db)) for (const [id, d] of Object.entries(docs)) { wr(`db/${col}/${id}.json`, JSON.stringify(d)); count++; const n = JSON.stringify(d).length; if (n > 240000) big.push(`${col}/${id} ${n}`); }
  wr('seed.json', JSON.stringify(db));
  /* A readable copy of the whole generated course for graders. */
  const md = ['# Generated course: ' + COURSE.title, ''];
  for (const u of plan.units) {
    md.push('## MODULE: ' + u.title, '');
    u.lessons.forEach((les, k) => {
      const x = lessons.find(z => z.lid === `${u.id}L${k}`);
      md.push(`### TOPIC ${u.id}L${k}: ${les.title}  [depth: ${les.depth}; from ${les.sid}]`, '');
      if (!x || !x.ideas.length) { md.push('_NOT BUILT_', ''); return; }
      const doc = db.lessons[x.lid];
      doc.ideas.forEach((i, n) => {
        md.push(`#### IDEA ${n}: ${i.title}  (yield: ${i.yield})`, i.analogy ? `ANALOGY [added]: ${i.analogy.text}` : 'ANALOGY: none', `HOW IT WORKS [${i.mechanism.origin}]: ${i.mechanism.text}`,
          i.example ? `EXAMPLE [${i.example.origin}] ${i.example.title}: ${i.example.steps.map(s => (s.label ? s.label + ': ' : '') + s.text).join(' | ')} => ${i.example.result}` : 'EXAMPLE: none', i.why ? `WHY [${i.why.origin}]: ${i.why.text}` : 'WHY: none',
          `VISUAL: ${i.visual ? i.visual.type + ' (' + (i.visual.caption || 'no caption') + ')' : 'none'}`, `QUOTE: ${i.quote || 'none'}`, `KEY POINTS: ${i.keyPoints.join(' || ')}`, `TEACH-BACK PROMPTS: ${Object.entries(i.prompts).map(([s, t]) => s + ': ' + t).join(' || ')}`,
          `HINTS: ${i.hints.join(' || ')}`, `CLOZE: ${i.cloze ? i.cloze.sentence + ' [' + i.cloze.answer + ']' : 'none'}`, `TERMS: ${i.terms.map(t => t.term + ' = ' + t.def + (t.fromSource ? '' : ' [added]')).join(' || ') || 'none'}`);
        Object.entries(db.cards).filter(([id]) => id.startsWith(i.id + 'c')).forEach(([id, c]) => md.push(`CARD ${c.type} [${c.origin}] d${c.difficulty}${c.status === 'flagged' ? ' FLAGGED(' + c.flag + ')' : ''}: Q: ${c.prompt} A: ${c.answer} RUBRIC: ${(c.rubric || []).join('; ')} WHY: ${c.explanation}`));
        for (const f of i.flags) md.push(`SELF-CHECK FLAG (${f.severity}): ${f.problem}`);
        if (i.sourceIssue) md.push(`SOURCE ISSUE: ${i.sourceIssue.issue} ("${i.sourceIssue.quote}")`);
        md.push('');
      });
    });
  }
  md.push('## WEAK SPOTS FROM FEEDBACK', ''); for (const w of plan.weak) md.push(`- [${w.sid}; module: ${w.unitTitle || 'none'}] ${w.idea}: ${w.gap} (feedback: "${w.quote}") CARD ${w.card.type}: Q: ${w.card.prompt} A: ${w.card.answer}`);
  md.push('', '## SKIPPED AS ALREADY COVERED', ''); for (const k of plan.skipped) md.push(`- [${k.sid}] ${k.idea}: ${k.reason}`);
  md.push('', '## PER-SOURCE PLAN LOG', ''); for (const x of plan.log) md.push(`- ${x.sid} "${x.title}": found ${x.found.join(', ') || 'nothing'}; ${x.lessons} topics into ${x.units.join(', ') || 'no module'}; ${x.weak} weak spots. Note: ${x.note || 'none'}`);
  wr('course.md', md.join('\n'));
  const words = s => String(s || '').split(/\s+/).filter(Boolean).length, ideasAll = Object.values(db.lessons || {}).flatMap(l => l.ideas);
  const report = { docs: count, tooBig: big, byCollection: Object.fromEntries(Object.entries(db).map(([c, d]) => [c, Object.keys(d).length])), validation: stats, planStats: plan.stats, selfCheckFlags: nFlags, lessonsUnchecked: unchecked,
    ideaWords: { avg: Math.round(ideasAll.reduce((a, i) => a + words(i.mechanism.text) + words(i.analogy && i.analogy.text) + words(i.why && i.why.text) + (i.example ? i.example.steps.reduce((b, s) => b + words(s.text), 0) : 0), 0) / Math.max(1, ideasAll.length)), mechanismAvg: Math.round(ideasAll.reduce((a, i) => a + words(i.mechanism.text), 0) / Math.max(1, ideasAll.length)) },
    shape: { ideas: ideasAll.length, withAnalogy: ideasAll.filter(i => i.analogy).length, withExample: ideasAll.filter(i => i.example).length, withVisual: ideasAll.filter(i => i.visual).length, withQuote: ideasAll.filter(i => i.quote).length, withCloze: ideasAll.filter(i => i.cloze).length, sourceMechanism: ideasAll.filter(i => i.mechanism.origin === 'source').length, allFourPrompts: ideasAll.filter(i => L.STYLES.every(s => i.prompts[s])).length, twoHints: ideasAll.filter(i => i.hints.length === 2).length },
    quoteVerbatim: ideasAll.filter(i => i.quote).map(i => ({ idea: i.title, ok: sources.some(s => s.text.replace(/\s+/g, ' ').includes(i.quote.replace(/\s+/g, ' '))) })).filter(q => !q.ok).map(q => q.idea) };
  wr('report.json', report); console.log(JSON.stringify(report, null, 1));
}
