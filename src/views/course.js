/* Courses: list, setup, material, syllabus editor, course page, unit building, placement, lesson player. */
const LEVELS = [['beginner', 'Beginner'], ['some', 'Some knowledge'], ['rusty', 'Rusty']];
const STRICTNESS = [['lenient', 'Lenient'], ['standard', 'Standard'], ['strict', 'Strict']];
const PROBING = [['light', 'Light (1-2)'], ['standard', 'Standard (3-4)'], ['deep', 'Deep (up to 6)']];
const KIND_LABEL = { notes: 'Notes', file: 'File', photo: 'Photos', chat: 'From chat', vault: 'Obsidian', drive: 'Google Drive', notion: 'Notion', transcript: 'Transcript', article: 'Article' };

function lessonIds(unit) { return (unit.lessons || []).map((l, n) => unit.id + 'L' + n); }
function tbCards(unitId) { return cardsOf('unitId', unitId).filter(c => c.type === 'teachback' && c.status !== 'retired'); }
function unitProgress(unit) {
  const tb = tbCards(unit.id), done = tb.filter(c => c.firstScore != null).length;
  const st = L.unitStatus(tb, settingsFor(unit.courseId).strictness);
  const ls = unit.lessons || [], builtN = ls.filter(l => l.built).length;
  return { built: builtN > 0, pending: ls.length - builtN, lessons: ls.length, total: tb.length, done, avg: st.avg, passed: !!unit.passedAt };
}
/* A "review cards only" lesson has no lesson to sit through, so it counts as done once it is built. */
function lessonDone(lid) {
  const m = /^(.+)L(\d+)$/.exec(lid), u = m && S.units[m[1]], l = u && (u.lessons || [])[+m[2]];
  if (l && l.depth === 'review') return !!l.built;
  const cs = cardsOf('lessonId', lid).filter(c => c.type === 'teachback' && c.status !== 'retired');
  return cs.length > 0 && cs.every(c => c.firstScore != null);
}
function nextLesson(cid) {
  for (const u of unitsOf(cid)) {
    if (u.passedAt && u.reviewOnly) continue;
    const ls = u.lessons || [];
    if (!ls.length) { if ((u.tasks || []).length) continue; return { unit: u, build: true }; }
    for (let n = 0; n < ls.length; n++) { if (!ls[n].built) return { unit: u, build: true }; if (!lessonDone(u.id + 'L' + n)) return { unit: u, lid: u.id + 'L' + n }; }
  }
  return null;
}
function coursePace(c) {
  const us = unitsOf(c.id); let left = 0, total = 0;
  for (const u of us) {
    const ls = u.lessons || [], n = Math.max(1, ls.length || 4); total += n;
    if (u.passedAt) continue;
    left += ls.length ? ls.filter((l, k) => !l.built || !lessonDone(u.id + 'L' + k)).length : n;
  }
  return L.pace(c, { today: today(), lessonsLeft: left, lessonsTotal: total, restDays: settingsFor().restDays });
}
function paceChip(c) {
  const p = coursePace(c);
  if (p.mode === 'self') return '';
  if (p.status === 'done') return chip('All lessons done', 'good');
  if (p.status === 'past') return chip('Target date passed', 'bad');
  return chip(p.status === 'behind' ? `Behind · ${p.daysLeft} days left` : `On track · ${p.daysLeft} days left`, p.status === 'behind' ? 'bad' : 'good');
}

VIEWS.courses = () => {
  const cs = courseList();
  return `<div class="stack-lg"><div class="row between"><h1>Courses</h1><a class="btn primary" href="#newcourse">New course</a></div>
  ${cs.length ? `<div class="grid">${cs.map(c => { const us = unitsOf(c.id), passed = us.filter(u => u.passedAt).length; return `<a class="panel deck" href="#course-${c.id}"><div class="row between"><h3>${esc(c.title)}</h3>${c.status === 'active' ? paceChip(c) : chip(c.status === 'syllabus' ? 'Syllabus to review' : 'Setting up', 'due')}</div>
    <p class="small muted clamp2">${esc(c.goal || '')}</p>${bar(us.length ? 100 * passed / us.length : 0, 'good')}<div class="stats"><span><b>${passed}</b> of ${us.length} units passed</span><span><b>${cardsOf('courseId', c.id).filter(x => L.isDue(x, today())).length}</b> due</span></div></a>`; }).join('')}</div>`
    : emptyBox('No courses yet. Name one and start adding what you learn; Claude files each addition into modules and topics.')}</div>`;
};

/* ---------- New course: a name is enough; everything else is optional ---------- */
VIEWS.newcourse = () => {
  const g = settingsFor();
  const w = ui('wiz', () => ({ title: '', goal: '', why: '', level: 'beginner', minutes: '30', examQuestions: '', examMinutes: '', examStyle: '', examPassing: '', deadline: '', mixOutline: false, mixOwn: g.mix.own !== false, mixAi: g.mix.ai !== false, outline: '', strictness: globalSettings().strictness || 'standard', more: false }));
  return `<div class="reader stack-lg">${backLink('courses', 'Courses')}<div class="stack"><h1>New course</h1><p class="muted">Name it and start adding what you learn. Claude files each addition into modules and topics as the course grows.</p></div>
  <div class="panel stack">
    ${field('Course name', textIn('wiz.title', w.title, 'placeholder="For example: AI Cred" maxlength="80"'))}
    ${field('What you want from it <span class="muted">(optional)</span>', textIn('wiz.goal', w.goal, 'placeholder="For example: use AI well at work, or pass the Microeconomics CLEP" maxlength="200"'), 'Used to pick examples that fit you.')}
    <div class="row"><button class="btn primary" data-act="course-create" data-mode="quick">Create and add learning</button><button class="btn ghost" data-act="toggle" data-key="wiz.more" aria-expanded="${!!w.more}">${w.more ? 'Hide options' : 'More options'}</button></div>
  </div>
  ${w.more ? `<div class="panel stack"><h3>Pace and grading</h3>
    <div class="field"><span>Where you are now</span>${seg('wiz.level', LEVELS, w.level)}</div>
    <div class="row top">${field('Minutes per day', textIn('wiz.minutes', w.minutes, 'inputmode="numeric" maxlength="3" style="max-width:8em"'))}
    ${field('Target date <span class="muted">(optional)</span>', `<input type="date" id="f-wiz-deadline" data-bind="wiz.deadline" value="${esc(w.deadline)}" min="${today()}">`, 'With a date, lessons and review are paced to your minutes per day.')}</div>
    ${field('Why it matters to you', areaIn('wiz.why', w.why, 2, 'maxlength="500"'))}
    <div class="field"><span>Grading strictness</span>${seg('wiz.strictness', STRICTNESS, w.strictness)}<span class="small muted">Sets the pass mark for a module: lenient 60, standard 70, strict 80.</span></div>
  </div>
  <div class="panel stack"><h3>Exam <span class="muted small">(skip if there is none)</span></h3>
    <div class="row top">${field('Questions', textIn('wiz.examQuestions', w.examQuestions, 'inputmode="numeric" maxlength="3" placeholder="80"'))}${field('Minutes', textIn('wiz.examMinutes', w.examMinutes, 'inputmode="numeric" maxlength="3" placeholder="90"'))}${field('Passing score', textIn('wiz.examPassing', w.examPassing, 'maxlength="40" placeholder="50 of 80, or 70%"'))}</div>
    ${field('Question style', textIn('wiz.examStyle', w.examStyle, 'maxlength="200" placeholder="Multiple choice, 5 options, graphs to read"'))}
  </div>
  <div class="panel stack"><h3>Plan the whole course up front</h3><p class="small muted">For a course with a fixed outline, such as an exam. Claude drafts every module first and you edit the list before anything is built. Anything Claude adds from its own knowledge is labeled "Added, not from your source".</p>
    <label class="tick"><input type="checkbox" id="mix-outline" data-bind="wiz.mixOutline" ${w.mixOutline ? 'checked' : ''}><span><b>An official outline I paste</b> as the skeleton</span></label>
    <label class="tick"><input type="checkbox" id="mix-own" data-bind="wiz.mixOwn" ${w.mixOwn ? 'checked' : ''}><span><b>My own material</b> as the content</span></label>
    <label class="tick"><input type="checkbox" id="mix-ai" data-bind="wiz.mixAi" ${w.mixAi ? 'checked' : ''}><span><b>Claude's own knowledge</b> to fill gaps</span></label>
    ${w.mixOutline ? field('Official outline', areaIn('wiz.outline', w.outline, 6, 'placeholder="Paste the outline here" maxlength="40000"')) : ''}
    <div><button class="btn" data-act="course-create" data-mode="plan">Create and plan the syllabus</button></div>
  </div>` : ''}</div>`;
};
function courseFromWiz(w, base = {}) {
  const num2 = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
  return Object.assign({}, base, {
    title: L.str(w.title, 80) || L.str(w.goal, 60), goal: L.str(w.goal, 200) || L.str(w.title, 80), why: L.str(w.why, 500), level: LEVELS.some(l => l[0] === w.level) ? w.level : 'beginner',
    minutesPerDay: num2(w.minutes, 5, 600) || 30, deadline: L.validDay(w.deadline) ? w.deadline : '',
    exam: { questions: num2(w.examQuestions, 1, 500), minutes: num2(w.examMinutes, 1, 600), style: L.str(w.examStyle, 200), passing: L.str(w.examPassing, 40) },
    mix: { outline: !!w.mixOutline, own: !!w.mixOwn, ai: !!w.mixAi || (!w.mixOutline && !w.mixOwn) }, outline: w.mixOutline ? L.str(w.outline, 40000) : ''
  });
}
async function createCourse(w, mode) {
  const id = L.uid('c'), quick = mode !== 'plan';
  const doc = courseFromWiz(w, { status: quick ? 'active' : 'setup', createdAt: Date.now() });
  if (quick) { doc.mix = Object.assign({}, doc.mix, { own: true }); doc.startedDay = today(); }
  await put('courses', id, doc); await put('settings', id, { strictness: w.strictness || 'standard' });
  return id;
}
Object.assign(ACT, {
  'course-create': async el => {
    const w = UI.wiz;
    if (!w.title.trim() && !w.goal.trim()) { toast('Give the course a name first.'); return; }
    let id; try { id = await createCourse(w, el.dataset.mode); } catch (e) { return; }
    delete UI.wiz; go(el.dataset.mode === 'plan' ? 'course-' + id : 'add-' + id);
  }
});

/* ---------- Material ---------- */
function inboxGroups() {
  const groups = {};
  for (const [id, d] of Object.entries(S.inbox)) {
    const g = d.group || id;
    groups[g] = groups[g] || { key: g, title: d.title || 'From chat', kind: d.kind || 'notes', parts: [], ids: [], createdAt: d.createdAt || 0 };
    groups[g].parts.push({ n: d.part || 0, text: String(d.text || '') }); groups[g].ids.push(id);
  }
  return Object.values(groups).map(g => Object.assign(g, { text: g.parts.sort((a, b) => a.n - b.n).map(p => p.text).join('') })).sort((a, b) => b.createdAt - a.createdAt);
}
/* mode: 'full' (list + add straight into the course), 'add' (bring text into the Add learning box), 'list' (sources only). */
function materialPanel(cid, mode = 'full') {
  const m = ui('mat', () => ({ tab: 'paste', title: '', text: '', q: '', results: null, note: '' }));
  UI.matMode = mode;
  const srcs = cid ? list('sources').filter(s => s.courseId === cid).sort((a, b) => a.createdAt - b.createdAt) : [];
  const inbox = inboxGroups(), g = settingsFor(), key = 'mat-' + cid;
  const listHtml = srcs.length ? `<div class="list">${srcs.map(s => `<div class="row between"><div class="grow"><b>${esc(s.title)}</b>${s.staged ? ' ' + chip('Not filed yet', 'due') : ''}<div class="small muted">${esc(KIND_LABEL[s.kind] || 'Material')} · ${num(s.chars).toLocaleString()} characters${num(s.segCount) > 1 ? ` · split into ${num(s.segCount)} ordered parts` : ''}</div></div><div class="row">${s.staged && S.courses[cid] && S.courses[cid].status === 'active' ? `<button class="btn sm" data-act="mat-replan" data-sid="${s.id}">Plan it</button>` : ''}<button class="btn sm ghost" data-act="mat-del" data-sid="${s.id}">Remove</button></div></div>`).join('')}</div>` : '<p class="small muted">No sources yet.</p>';
  if (mode === 'list') return `<div class="panel stack" id="material"><div class="row between"><h3>Sources</h3><span class="small muted">${plural(srcs.length, 'source')}</span></div>${listHtml}<p class="small muted">Removing a source keeps the lessons already built from it.</p></div>`;
  const tabs = [['paste', mode === 'add' ? 'Type or paste' : 'Paste'], ['file', 'File'], ['photo', 'Photos'], ['chat', `From chat${inbox.length ? ` (${inbox.length})` : ''}`]].filter(([k]) => k !== 'paste' || mode === 'add' || g.sources.paste !== false).concat(connList().map(k => [k, CONNECTORS[k].label]), [['link', 'Web or YouTube']]);
  if (!tabs.some(t => t[0] === m.tab)) m.tab = tabs[0][0];
  let body = '';
  if (m.tab === 'paste') body = mode === 'add' ? '' : `${field('Title', textIn('mat.title', m.title, 'maxlength="120" placeholder="Chapter 3 notes"'))}${field('Text', areaIn('mat.text', m.text, 7, 'placeholder="Paste notes, a transcript or an article"'), `${m.text.length.toLocaleString()} characters. Long material is split into ordered parts; nothing is cut.`)}<div><button class="btn primary" data-act="mat-add-paste" data-cid="${cid}">Add material</button></div>`;
  else if (m.tab === 'file') body = `${field('Choose a .txt, .md or .pdf file', `<input type="file" id="mat-file" accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf" data-act-change="mat-file" data-cid="${cid}">`)}`;
  else if (m.tab === 'photo') body = aiOn() && S.imagesOk ? `${field('Photos of pages, slides or handwritten notes', `<input type="file" id="mat-photo" accept="image/png,image/jpeg,image/webp" multiple data-act-change="mat-photo" data-cid="${cid}">`, `Claude reads the image and writes out the text. Up to ${S.imageMax || 5} photos at a time.`)}` : `<p class="small muted">Reading photos needs Claude with image support, which is not available in this view. Type or paste the text instead.</p>`;
  else if (m.tab === 'chat') body = inbox.length ? `<div class="list">${inbox.map(x => `<div class="row between"><div class="grow"><b>${esc(x.title)}</b><div class="small muted">${x.text.length.toLocaleString()} characters</div></div><div class="row"><button class="btn sm primary" data-act="mat-inbox-use" data-cid="${cid}" data-key="${esc(x.key)}">Use</button><button class="btn sm ghost" data-act="mat-inbox-drop" data-key="${esc(x.key)}">Discard</button></div></div>`).join('')}</div>` : `<p class="small muted">Nothing waiting. See "Web or YouTube" for how to send material here from a chat.</p>`;
  else if (m.tab === 'link') body = `<p class="small">This page can't open websites or videos itself. Claude can, from a chat:</p><ol class="small steps"><li>Open a chat with Claude in your AI CRED learning project.</li><li>Paste the link with the message below.</li><li>The text appears under <b>From chat</b> here.</li></ol><pre id="link-msg">Send this to Context Window (my study artifact): [paste link]</pre><div><button class="btn sm" data-act="copy" data-target="link-msg">Copy message</button></div>`;
  else body = `<p class="small muted">${esc(CONNECTORS[m.tab].hint)}</p><div class="row nowrap">${textIn('mat.q', m.q, 'placeholder="Search words" maxlength="200"')}<button class="btn" data-act="mat-search" data-cid="${cid}" ${isBusy(key) ? 'disabled' : ''}>Search</button></div>
    ${m.results && m.resultsFor === m.tab ? (m.results.length ? `<div class="list">${m.results.map((r, i) => `<div class="row between"><div class="grow"><b>${esc(r.title)}</b><div class="small muted">${esc(r.sub || '')}</div></div><button class="btn sm primary" data-act="mat-conn-add" data-cid="${cid}" data-i="${i}" ${isBusy(key) ? 'disabled' : ''}>Use</button></div>`).join('')}</div>` : '<p class="small muted">No matches. Try one or two distinctive words.</p>') : ''}`;
  const tabsHtml = `<div class="seg scroll" role="group" aria-label="Bring it in from">${tabs.map(([k, l]) => `<button type="button" data-act="set" data-key="mat.tab" data-val="${k}" aria-pressed="${m.tab === k}">${esc(l)}</button>`).join('')}</div>`;
  const tail = `${body}${m.note ? `<div class="small muted">${esc(m.note)}</div>` : ''}${busyHtml(key)}`;
  if (mode === 'add') return `<div class="stack tight">${tabsHtml}${tail}</div>`;
  return `<div class="panel stack" id="material"><div class="row between"><h3>Material</h3><span class="small muted">${plural(srcs.length, 'source')}</span></div>${srcs.length ? listHtml : '<p class="small muted">No material yet. Without any, Claude builds the course from its own knowledge and labels it as added.</p>'}${tabsHtml}${tail}</div>`;
}
async function matAdd(cid, src) {
  if (UI.matMode === 'add') {
    const a = UI.add, t = String(src.text || '').trim();
    if (!a) return null;
    if (!t) { toast('That came back empty.', true); return null; }
    a.text = a.text.trim() ? a.text.trim() + '\n\n' + t : t;
    if (!a.title.trim()) a.title = L.str(src.title, 120);
    a.kind = src.kind || a.kind;
    Object.assign(UI.mat, { note: '', results: null, tab: 'paste' });
    toast('Brought in. Check it below, then tap the plan button.'); render();
    return 'staged';
  }
  const sid = await addSource(cid, src);
  if (sid) { const n = S.sources[sid].segCount; toast(n > 1 ? `Added. Split into ${n} ordered parts.` : 'Added.'); Object.assign(UI.mat, { title: '', text: '', note: '' }); }
  render(); return sid;
}
Object.assign(ACT, {
  'mat-replan': async el => { const sid = el.dataset.sid, s = S.sources[sid]; if (!s) return; const text = await loadSourceText(sid); UI.add = { cid: s.courseId, picked: s.courseId, newName: '', module: '', depth: 'refresher', title: s.title, text, kind: s.kind || 'notes', plan: null, sid, sidText: text.trim(), inboxIds: [] }; go('add-' + s.courseId); },
  'mat-add-paste': el => matAdd(el.dataset.cid, { title: UI.mat.title, kind: 'notes', text: UI.mat.text }),
  'mat-file': async el => {
    const f = el.files && el.files[0], cid = el.dataset.cid; if (!f) return;
    UI.mat.note = 'Reading ' + f.name + '…'; render();
    try {
      const pdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
      const text = pdf ? await pdfText(f) : await f.text();
      if (!text.trim()) { UI.mat.note = 'This file has no selectable text (it may be scanned pages). Use Photos instead.'; render(); return; }
      UI.mat.note = ''; await matAdd(cid, { title: f.name.replace(/\.[^.]+$/, ''), kind: 'file', text });
    } catch (e) { console.warn(e); UI.mat.note = 'Couldn\'t read that file. Try copying its text into Paste instead.'; render(); }
  },
  'mat-photo': async el => {
    const cid = el.dataset.cid, picked = Array.from(el.files || []).filter(f => /^image\//.test(f.type)), files = picked.slice(0, S.imageMax || 5);
    if (!files.length) return;
    if (picked.length > files.length) toast(`Only the first ${files.length} photos are read at once. Add the other ${picked.length - files.length} in a second go.`, true);
    const r = await task('mat-' + cid, `Reading ${plural(files.length, 'photo')}…`, signal => ai(P.transcribe({ hint: (S.courses[cid] || {}).title }), { signal, images: files }));
    if (!r) return;
    await matAdd(cid, { title: L.str(r.title, 120) || 'Photo notes', kind: 'photo', text: L.str(r.text, 400000) });
  },
  'mat-inbox-use': async el => {
    const g = inboxGroups().find(x => x.key === el.dataset.key); if (!g) return;
    const sid = await matAdd(el.dataset.cid, { title: g.title, kind: 'chat', text: g.text });
    if (sid === 'staged') UI.add.inboxIds = (UI.add.inboxIds || []).concat(g.ids);
    else if (sid) for (const id of g.ids) drop('inbox', id).catch(() => { });
  },
  'mat-inbox-drop': el => { const g = inboxGroups().find(x => x.key === el.dataset.key); if (g) for (const id of g.ids) drop('inbox', id).catch(() => { }); render(); },
  'mat-search': async el => {
    const m = UI.mat, tab = m.tab;
    const r = await task('mat-' + el.dataset.cid, 'Searching ' + CONNECTORS[tab].label + '…', () => connSearch(tab, m.q));
    if (r) { m.results = r; m.resultsFor = tab; }
    render();
  },
  'mat-conn-add': async el => {
    const m = UI.mat, r = (m.results || [])[+el.dataset.i], tab = m.tab; if (!r) return;
    const text = await task('mat-' + el.dataset.cid, 'Reading ' + r.title + '…', () => connRead(tab, r.id));
    if (text == null) return;
    if (!String(text).trim()) { toast('That item came back empty.', true); return; }
    await matAdd(el.dataset.cid, { title: r.title, kind: tab, text });
  },
  'mat-del': el => confirmBox('Remove this material?', 'Lessons already built from it stay. New lessons can no longer draw on it.', 'Remove', async () => { await deleteSource(el.dataset.sid); render(); })
});

/* ---------- Syllabus ---------- */
async function digestSources(cid, signal, key) {
  for (const s of list('sources').filter(x => x.courseId === cid && !x.digest)) {
    const segs = L.splitSegments(await loadSourceText(s.id)), digest = [];
    for (let i = 0; i < segs.length;) {
      const batch = []; let size = 0;
      while (i < segs.length && (size + segs[i].length <= 90000 || !batch.length)) { batch.push({ ref: s.id + ':' + i, text: segs[i] }); size += segs[i].length; i++; }
      if (S.busy[key]) { S.busy[key].label = `Reading "${s.title}" (part ${Math.min(i, segs.length)} of ${segs.length})…`; render(); }
      const r = await ai(P.digest({ segments: batch }), { signal, tier: 'quick' });
      const got = {}; for (const x of L.arr(r && r.segments, 200)) got[L.str(x && x.ref, 60)] = L.str(x && x.summary, 400);
      for (const b of batch) digest.push({ ref: b.ref, summary: got[b.ref] || b.text.slice(0, 160) });
    }
    await patch('sources', s.id, { digest });
  }
}
async function draftSyllabus(cid) {
  const key = 'syl-' + cid;
  const ok = await task(key, 'Drafting your syllabus…', async signal => {
    const c = S.courses[cid];
    if (c.mix.own) await digestSources(cid, signal, key);
    if (S.busy[key]) { S.busy[key].label = 'Drafting your syllabus…'; render(); }
    const digests = c.mix.own ? list('sources').filter(x => x.courseId === cid).flatMap(s => s.digest || []).slice(0, 500) : [];
    const syl = L.validateSyllabus(await ai(P.syllabus({ course: c, outline: c.mix.outline ? c.outline : '', digests, mix: c.mix }), { signal, build: true }));
    if (!syl.units.length) throw { code: 'empty_completion' };
    const refs = new Set(digests.map(d => d.ref));
    for (const u of unitsOf(cid)) if (u.status !== 'ready') await drop('units', u.id);
    const base = unitsOf(cid).length;
    for (let i = 0; i < syl.units.length; i++) { const u = syl.units[i]; await put('units', L.uid('u'), Object.assign(u, { segs: u.segs.filter(r => refs.has(r)), courseId: cid, n: base + i, status: 'draft', createdAt: Date.now() })); }
    await patch('courses', cid, { status: 'syllabus', syllabusNote: syl.note });
    return true;
  });
  if (ok) go('syllabus-' + cid);
}
function originChip(o) { return o === 'source' ? chip('From your material', 'good') : o === 'mixed' ? chip('Your material + added', 'added') : chip('Added, not from your source', 'added'); }
VIEWS.syllabus = cid => {
  const c = S.courses[cid]; if (!c) return emptyBox('This course no longer exists. <a href="#courses">Courses</a>');
  const us = unitsOf(cid), key = 'syl-' + cid;
  const used = new Set(us.flatMap(u => u.segs || [])), loose = list('sources').filter(s => s.courseId === cid).flatMap(s => s.digest || []).filter(d => !used.has(d.ref)).length;
  return `<div class="reader stack-lg">${backLink('course-' + cid, c.title)}<div class="stack"><span class="eyebrow">Modules</span><h1>${c.status === 'active' ? 'Edit modules' : 'Review the syllabus'}</h1>
  <p class="muted">Reorder, rename, add or cut modules. Nothing is built until you choose to.</p>${c.syllabusNote ? `<div class="added small">${addedTag('Claude\'s note on gaps')}${esc(c.syllabusNote)}</div>` : ''}${loose ? `<div class="flag small">${plural(loose, 'part')} of your material ${loose === 1 ? 'is' : 'are'} not tied to any unit yet. A unit still draws on a loose part when its topic matches; add a unit if something you need is missing.</div>` : ''}</div>
  <div class="stack">${us.map((u, i) => `<div class="panel stack tight"><div class="row between"><span class="eyebrow">Unit ${i + 1}</span><div class="row">${originChip(u.origin)}${u.status === 'ready' ? chip('Built', 'good') : ''}
    <button class="btn sm ghost icon" data-act="unit-move" data-uid="${u.id}" data-d="-1" ${i ? '' : 'disabled'} aria-label="Move up">${icon('up')}</button><button class="btn sm ghost icon" data-act="unit-move" data-uid="${u.id}" data-d="1" ${i < us.length - 1 ? '' : 'disabled'} aria-label="Move down">${icon('down')}</button><button class="btn sm ghost icon" data-act="unit-cut" data-uid="${u.id}" aria-label="Cut unit">${icon('x')}</button></div></div>
    <input type="text" id="ut-${u.id}" value="${esc(u.title)}" data-act-change="unit-edit" data-uid="${u.id}" data-f="title" maxlength="120" aria-label="Unit title">
    <textarea id="us-${u.id}" rows="2" data-act-change="unit-edit" data-uid="${u.id}" data-f="summary" maxlength="500" aria-label="Unit summary">${esc(u.summary || '')}</textarea>
    ${(u.lessons || []).length ? `<ol class="small lessons">${u.lessons.map(l => `<li><b>${esc(l.title)}</b>${l.ideas.length ? `<span class="muted">: ${l.ideas.map(esc).join('; ')}</span>` : ''}</li>`).join('')}</ol>` : '<span class="small muted">Lessons are planned when you build this unit.</span>'}</div>`).join('') || emptyBox('No units yet.')}</div>
  <div class="panel stack"><h3>Add a unit</h3><div class="row nowrap">${textIn('newunit', ui('newunit', ''), 'placeholder="Unit title" maxlength="120"')}<button class="btn" data-act="unit-add" data-cid="${cid}">Add</button></div></div>
  <div class="row">${c.status !== 'active' ? `<button class="btn primary" data-act="syl-approve" data-cid="${cid}" ${us.length ? '' : 'disabled'}>Approve syllabus</button>` : `<a class="btn primary" href="#course-${cid}">Done</a>`}
  ${aiOn() && c.status !== 'active' ? `<button class="btn" data-act="syl-draft" data-cid="${cid}" ${isBusy(key) ? 'disabled' : ''}>Draft again</button>` : ''}</div>${c.status !== 'active' && us.some(u => u.status === 'ready') ? '<p class="small muted">Drafting again keeps modules you have already built.</p>' : ''}${busyHtml(key)}</div>`;
};
Object.assign(ACT, {
  'syl-draft': el => draftSyllabus(el.dataset.cid),
  'syl-approve': async el => {
    const cid = el.dataset.cid;
    for (const u of unitsOf(cid)) if (u.status === 'draft') await patch('units', u.id, { status: 'planned' }).catch(() => { });
    await patch('courses', cid, { status: 'active', startedDay: today() }).catch(() => { });
    go('course-' + cid);
  },
  'unit-edit': el => { const u = S.units[el.dataset.uid]; if (!u) return; const v = L.str(el.value, el.dataset.f === 'title' ? 120 : 500); if (el.dataset.f === 'title' && !v) { el.value = u.title; return; } patch('units', el.dataset.uid, { [el.dataset.f]: v }).catch(() => { }); },
  'unit-move': async el => {
    const u = S.units[el.dataset.uid]; if (!u) return;
    const us = unitsOf(u.courseId), i = us.findIndex(x => x.id === el.dataset.uid), j = i + (+el.dataset.d);
    if (j < 0 || j >= us.length) return;
    [us[i], us[j]] = [us[j], us[i]];
    for (let k = 0; k < us.length; k++) if (us[k].n !== k) await patch('units', us[k].id, { n: k }).catch(() => { });
    render();
  },
  'unit-cut': el => { const u = S.units[el.dataset.uid]; if (!u) return; confirmBox(`Cut "${u.title}"?`, u.status === 'ready' ? 'Its lessons, cards and review history are deleted. This can\'t be undone.' : 'It is removed from the syllabus.', 'Cut unit', async () => { await deleteUnit(el.dataset.uid); render(); }); },
  'unit-add': async el => {
    const t = L.str(UI.newunit, 120); if (!t) { toast('Give the unit a title.'); return; }
    const c = S.courses[el.dataset.cid];
    await put('units', L.uid('u'), { courseId: el.dataset.cid, n: unitsOf(el.dataset.cid).length, title: t, summary: '', lessons: [], segs: [], origin: 'added', status: c.status === 'active' ? 'planned' : 'draft', createdAt: Date.now() }).catch(() => { });
    UI.newunit = ''; render();
  }
});
async function deleteUnit(uid) {
  const u = S.units[uid]; if (!u) return;
  for (const c of cardsOf('unitId', uid)) await drop('cards', c.id).catch(() => { });
  for (const lid of lessonIds(Object.assign({ id: uid }, u))) { delete S.lessons[lid]; await remove('lessons/' + lid).catch(() => { }); }
  for (const g of list('glossary').filter(g => g.unitId === uid)) await drop('glossary', g.id).catch(() => { });
  for (const r of list('reports').filter(r => r.unitId === uid)) await drop('reports', r.id).catch(() => { });
  for (const m of list('mistakes').filter(m => m.unitId === uid)) await drop('mistakes', m.id).catch(() => { });
  await drop('units', uid).catch(() => { });
}
async function deleteCourse(cid) {
  for (const u of unitsOf(cid)) await deleteUnit(u.id);
  for (const s of list('sources').filter(s => s.courseId === cid)) await deleteSource(s.id);
  for (const col of ['tests', 'mistakes', 'glossary', 'cards', 'reports']) for (const d of list(col).filter(d => d.courseId === cid)) await drop(col, d.id).catch(() => { });
  if (S.settings[cid]) await drop('settings', cid).catch(() => { });
  await drop('courses', cid).catch(() => { });
}

/* ---------- Unit building: lesson, then a self-check pass, then cards are added automatically ---------- */
async function unitMaterialSmart(unit) {
  let text = await unitMaterial(unit);
  const have = new Set(unit.segs || []), want = L.tokens(unit.title + ' ' + (unit.summary || '') + ' ' + (unit.lessons || []).map(l => l.title + ' ' + l.ideas.join(' ')).join(' '));
  const extra = list('sources').filter(s => s.courseId === unit.courseId).flatMap(s => s.digest || []).filter(d => !have.has(d.ref)).map(d => ({ d, w: L.overlap(want, L.tokens(d.summary)) })).filter(x => x.w > 0.18).sort((a, b) => b.w - a.w).slice(0, 3);
  if (extra.length) { const more = await unitMaterial({ segs: extra.map(x => x.d.ref) }, Math.max(0, 60000 - text.length)); if (more) text = text ? text + '\n\n' + more : more; }
  return text;
}
async function buildUnit(uid) {
  const key = 'build-' + uid;
  return task(key, 'Planning the module…', async signal => {
    let unit = Object.assign({ id: uid }, S.units[uid]); const c = S.courses[unit.courseId], cid = unit.courseId;
    const material = c.mix.own ? await unitMaterialSmart(unit) : '';
    const label = t => { if (S.busy[key]) { S.busy[key].label = t; render(); } };
    if (!(unit.lessons || []).length) {
      const r = await ai(P.unitPlan({ course: c, unit, others: unitsOf(cid).filter(u => u.id !== uid).map(u => u.title), material }), { signal, build: true });
      const lessons = L.validateSyllabus({ units: [{ title: unit.title, lessons: r && r.lessons }] }).units[0].lessons.filter(l => l.ideas.length);
      if (!lessons.length) throw { code: 'empty_completion' };
      await patch('units', uid, { lessons }); unit = Object.assign({ id: uid }, S.units[uid]);
    }
    const prior = [], N = unit.lessons.length, t = today();
    const markBuilt = async n => { const ls = (S.units[uid].lessons || []).map((l, k) => (k === n ? Object.assign({}, l, { built: true }) : l)); await patch('units', uid, { lessons: ls, status: 'ready' }); };
    for (let n = 0; n < N; n++) {
      const lid = uid + 'L' + n, les = unit.lessons[n];
      const have = await getLesson(lid);
      if (have) { prior.push(...have.ideas.map(i => i.title)); if (!les.built) await markBuilt(n); continue; }
      const depth = L.DEPTHS.includes(les.depth) ? les.depth : 'full', early = unit.reviewOnly || depth === 'review';
      /* A topic added through Add learning carries its own source segments; older ones draw on the module's. */
      let lesSegs = les.segs && les.segs.length ? les.segs : null;
      if (!lesSegs && les.sid && S.sources[les.sid]) lesSegs = Array.from({ length: num(S.sources[les.sid].segCount) }, (_, i) => les.sid + ':' + i);
      const lesMat = lesSegs ? await unitMaterial({ segs: lesSegs }) : material;
      /* Every lesson is told what the rest of the course teaches and how it defines its terms, so ideas are not repeated or contradicted. */
      const others = [...new Set(list('cards').filter(k => k.courseId === cid && k.type === 'teachback' && k.unitId !== uid && k.status !== 'retired').map(k => k.ideaTitle).concat(unitsOf(cid).filter(u => u.id !== uid).flatMap(u => (u.lessons || []).filter(l => !l.built).flatMap(l => l.ideas || []))))].filter(Boolean).slice(0, 80);
      const glossary = list('glossary').filter(g => g.courseId === cid).slice(0, 40).map(g => ({ term: g.term, def: g.def }));
      label(`Writing topic ${n + 1} of ${N}: ${les.title}`);
      const raw = await ai(P.lesson({ course: c, unit, lesson: les.ideas.length ? les : { title: les.title, ideas: [les.title] }, prior, material: lesMat, mix: c.mix, depth, others, glossary, profile: L.str(c.profile, 1500), gaps: L.arr(les.gaps, 6), kind: unit.kind }), { signal, build: true });
      let ideas = L.arr(raw && raw.ideas, 5).map(L.validateIdea).filter(Boolean);
      if (!ideas.length) throw { code: 'invalid_json' };
      label(`Self-checking topic ${n + 1} of ${N}…`);
      /* The self-check returns repairs. What it can fix is fixed before you see it; only what it cannot fix is flagged. */
      let checked = true, fixed = 0;
      try {
        const v = await ai(P.verify({ ideas: ideas.map(i => ({ title: i.title, analogy: i.analogy, mechanism: i.mechanism, example: i.example, why: i.why, keyPoints: i.keyPoints, hints: i.hints, cards: i.cards.map(k => ({ type: k.type, prompt: k.prompt, answer: k.answer, origin: k.origin })) })), material: lesMat, glossary }), { signal, build: true });
        const r = L.applyFixes(ideas, L.validateFixes(v, ideas.length)); ideas = r.ideas; fixed = r.applied;
      } catch (e) { if (signal.aborted) throw e; checked = false; }
      const doc = { courseId: cid, unitId: uid, n, title: les.title, depth, checked, fixed, createdAt: Date.now(), ideas: [] };
      const seen = list('cards').filter(k => k.courseId === cid && k.status !== 'retired' && k.type !== 'teachback').map(k => k.prompt);
      for (let k = 0; k < ideas.length; k++) {
        const idea = ideas[k], ideaId = lid + 'i' + k;
        const cards = idea.cards || []; delete idea.cards;
        idea.id = ideaId; idea.flags = idea.flags || [];
        doc.ideas.push(idea);
        const common = { courseId: cid, unitId: uid, lessonId: lid, ideaId, ideaTitle: idea.title, yield: idea.yield, createdAt: Date.now() + k };
        const tbId = ideaId + 't', fsrs = () => (early ? Object.assign(L.newFsrs(), { due: t }) : L.newFsrs());
        await put('cards', tbId, L.newCard(Object.assign({}, common, { type: 'teachback', prompt: idea.title, answer: idea.mechanism.text + (idea.why ? '\n\n' + idea.why.text : ''), rubric: idea.keyPoints, prompts: idea.prompts, hints: idea.hints, cloze: idea.cloze, quote: idea.quote, origin: idea.mechanism.origin, tbId, fsrs: fsrs() }, unit.reviewOnly ? { firstScore: unit.placeScore || 85, lastScore: unit.placeScore || 85 } : {})));
        let j = 0;
        for (const cd of cards) {
          if (seen.some(x => L.nearDuplicate(x, cd.prompt))) continue;
          seen.push(cd.prompt);
          const body = Object.assign({}, cd), flag = L.str(body.flag, 500); delete body.flag;
          await put('cards', ideaId + 'c' + j, L.newCard(Object.assign({}, common, body, { tbId, createdAt: Date.now() + k + j + 1, status: flag ? 'flagged' : 'active', flag, fsrs: fsrs() }))); j++;
        }
        for (const f of idea.flags) await put('reports', L.uid('r'), { kind: 'flag', courseId: cid, unitId: uid, lessonId: lid, idea: k, reason: f.severity === 'high' ? 'wrong' : 'unclear', text: f.problem, status: 'open', createdAt: Date.now() });
        if (idea.sourceIssue) await put('reports', L.uid('r'), { kind: 'issue', courseId: cid, unitId: uid, lessonId: lid, idea: k, reason: 'source', text: idea.sourceIssue.issue, quote: idea.sourceIssue.quote, status: 'open', createdAt: Date.now() });
        for (const term of idea.terms) { const g = L.slug(term.term) + '~' + cid; if (!S.glossary[g]) await put('glossary', g, { term: term.term, def: term.def, fromSource: term.fromSource, courseId: cid, unitId: uid, ideaId, ideaTitle: idea.title }); }
      }
      if (!checked) await put('reports', L.uid('r'), { kind: 'flag', courseId: cid, unitId: uid, lessonId: lid, idea: null, reason: 'unclear', text: `The self-check pass did not run for the topic "${les.title}". Its content has not had a second look.`, status: 'open', createdAt: Date.now() });
      await putLesson(lid, doc);
      await markBuilt(n);
      prior.push(...doc.ideas.map(i => i.title));
      render();
    }
    await patch('units', uid, Object.assign({ status: 'ready', builtAt: Date.now() }, unit.reviewOnly ? { passedAt: Date.now(), passScore: unit.placeScore || 85 } : {}));
    return true;
  });
}
function tasksHtml(u) {
  const ts = L.arr(u.tasks, 12); if (!ts.length) return '';
  const all = ts.flatMap(x => x.criteria || []), done = all.filter(x => x.done).length, open = ui('tasks-' + u.id, false);
  return `<div class="tasks stack tight"><button type="button" class="linkbtn small" data-act="toggle" data-key="tasks-${u.id}" aria-expanded="${!!open}">Exercise checklist: ${done} of ${all.length} done ${open ? '(hide)' : '(show)'}</button>
  ${open ? ts.map((x, ti) => `<div class="stack tight"><b class="small">${esc(x.title)}</b>${(x.criteria || []).map((k, ci) => `<label class="tick small"><input type="checkbox" id="tk-${u.id}-${ti}-${ci}" data-act-change="task-tick" data-uid="${u.id}" data-t="${ti}" data-c="${ci}" ${k.done ? 'checked' : ''}><span>${esc(k.text)}</span></label>`).join('')}</div>`).join('') : ''}</div>`;
}
function feedbackRow(cid) {
  const notes = list('mistakes').filter(m => m.kind === 'feedback' && (!cid || m.courseId === cid)).length; if (!notes) return '';
  const cards = list('cards').filter(k => k.fromFeedback && k.status === 'active' && (!cid || k.courseId === cid)).length;
  return `<div class="note row between"><span class="grow"><b>From your tutor's feedback: ${plural(notes, 'weak spot')}.</b> ${cards ? plural(cards, 'review card') + ' aimed at them; the rest steer the topics that teach them.' : 'The topics that teach them are aimed at these gaps.'}</span><span class="row">${cards ? `<button class="btn sm" data-act="fb-review" data-cid="${esc(cid || '')}">Review these</button>` : ''}<a class="btn sm ghost" href="#notebook">See them</a></span></div>`;
}

/* ---------- Course page ---------- */
VIEWS.course = cid => {
  const c0 = S.courses[cid]; if (!c0) return emptyBox('This course no longer exists. <a href="#courses">Courses</a>');
  const c = Object.assign({ id: cid }, c0), us = unitsOf(cid), key = 'syl-' + cid;
  if (c.status !== 'active') {
    return `<div class="reader stack-lg">${backLink('courses', 'Courses')}<div class="stack"><span class="eyebrow">Planning the syllabus</span><h1>${esc(c.title)}</h1><p class="muted">${esc(c.goal)}</p></div>
    ${c.mix.own ? materialPanel(cid) : `<div class="panel small muted">This course doesn't use your own material. <button class="linkbtn" data-act="course-mix-own" data-cid="${cid}">Add material after all</button></div>`}
    <div class="panel stack"><h3>Syllabus</h3>${c.status === 'syllabus' ? `<p>A draft is ready with ${plural(us.length, 'module')}.</p><div class="row"><a class="btn primary" href="#syllabus-${cid}">Review the syllabus</a></div>`
      : `<p class="small muted">Sources: ${[c.mix.outline && 'official outline', c.mix.own && 'your material', c.mix.ai && 'Claude\'s knowledge'].filter(Boolean).join(', ')}. Add your material above first.</p><div class="row">${aiOn() ? `<button class="btn primary" data-act="syl-draft" data-cid="${cid}" ${isBusy(key) ? 'disabled' : ''}>Draft the syllabus</button>` : needAI}<button class="btn ghost" data-act="course-skip-plan" data-cid="${cid}">Skip planning: just add learning</button></div>`}${busyHtml(key)}</div>
    <div class="row"><button class="btn ghost danger" data-act="course-delete" data-cid="${cid}">Delete course</button></div></div>`;
  }
  const p = coursePace(c), nx = nextLesson(cid), cfg = settingsFor(cid), ov = S.settings[cid] || {};
  const due = cardsOf('courseId', cid).filter(x => L.isDue(x, today())).length, passed = us.filter(u => u.passedAt).length;
  const anyBuilt = us.some(u => (u.lessons || []).some(l => l.built));
  const tab = ui('ctab-' + cid, 'units'), menu = ui('cmenu-' + cid, false), log = L.arr(c.log, 30);
  const head = `${backLink('courses', 'Courses')}<div class="stack tight"><div class="row between"><h1>${esc(c.title)}</h1><div class="row">${us.length ? paceChip(c) : ''}${c.cram ? chip('Cram mode on', 'due') : ''}</div></div>${c.goal && c.goal !== c.title ? `<p class="muted">${esc(c.goal)}</p>` : ''}
    ${us.length ? `${bar(100 * passed / us.length, 'good')}<div class="small muted">${passed} of ${plural(us.length, 'module')} passed · ${due} due for review</div>` : ''}</div>`;
  if (tab === 'material' || tab === 'options') {
    return `<div class="reader stack-lg">${head}<div><button class="btn sm" data-act="set" data-key="ctab-${cid}" data-val="units">← Back to modules</button></div>
    ${tab === 'material' ? materialPanel(cid, 'list') + `<div><a class="btn primary" href="#add-${cid}">Add learning</a></div>` : `<div class="panel stack"><h3>Options for this course</h3><p class="small muted">These override your defaults in Settings.</p>
      <div class="field"><span>Grading strictness</span>${seg('strictness', [['', 'Default']].concat(STRICTNESS), ov.strictness || '', 'course-opt')}</div>
      <div class="field"><span>Probing depth</span>${seg('probing', [['', 'Default']].concat(PROBING), ov.probing || '', 'course-opt')}</div>
      <div class="field"><span>Target retention</span>${seg('retention', [['', 'Default'], ['0.85', '85%'], ['0.9', '90%'], ['0.93', '93%'], ['0.95', '95%']], ov.retention ? String(ov.retention) : '', 'course-opt')}</div>
      <div class="row top">${field('Minutes per day', `<input type="text" id="co-min" value="${esc(c.minutesPerDay)}" inputmode="numeric" maxlength="3" data-act-change="course-field" data-f="minutesPerDay" style="max-width:8em">`)}${field('Target date', `<input type="date" id="co-dl" value="${esc(c.deadline || '')}" data-act-change="course-field" data-f="deadline">`)}</div>
      <p class="small muted">Pass mark for a module: ${L.passMark(cfg.strictness)}.</p></div>
      <div class="panel stack"><h3>About this course</h3>${field('What you want from it', `<input type="text" id="co-goal" value="${esc(c.goal || '')}" maxlength="200" data-act-change="course-field" data-f="goal">`)}
      <div class="row top">${field('Exam questions', `<input type="text" id="co-exq" value="${esc((c.exam || {}).questions || '')}" inputmode="numeric" maxlength="3" data-act-change="course-field" data-f="exam.questions">`)}${field('Exam minutes', `<input type="text" id="co-exm" value="${esc((c.exam || {}).minutes || '')}" inputmode="numeric" maxlength="3" data-act-change="course-field" data-f="exam.minutes">`)}${field('Passing score', `<input type="text" id="co-exp" value="${esc((c.exam || {}).passing || '')}" maxlength="40" data-act-change="course-field" data-f="exam.passing">`)}</div>
      ${field('Exam question style', `<input type="text" id="co-exs" value="${esc((c.exam || {}).style || '')}" maxlength="200" data-act-change="course-field" data-f="exam.style">`)}</div>
      <div class="row"><button class="btn ghost danger" data-act="course-delete" data-cid="${cid}">Delete course</button></div>`}</div>`;
  }
  const tools = [[`#test-${cid}`, 'Practice test', 'Quick test or full exam simulation'], [`#games-${cid}`, 'Games', 'Match, fill the blank, speed round, quiz board'], [`#cram-${cid}`, 'Cram mode', 'High-yield review before a deadline'],
    !c.placementDone && !anyBuilt && us.length && aiOn() ? [`#placement-${cid}`, 'Placement test', 'Skip modules you already know'] : null, [`#syllabus-${cid}`, 'Edit modules', 'Rename, reorder, add or cut']].filter(Boolean);
  return `<div class="stack-lg">${head}
  <div class="row actions">${nx ? (nx.build ? `<button class="btn primary" data-act="unit-build" data-uid="${nx.unit.id}" ${aiOn() && !isBusy('build-' + nx.unit.id) ? '' : 'disabled'}>Build: ${esc(cut(nx.unit.title, 40))}</button>` : `<a class="btn primary" href="#learn-${nx.lid}">Continue: ${esc(cut(((nx.unit.lessons || [])[+nx.lid.split('L').pop()] || {}).title || nx.unit.title, 44))}</a>`) : ''}
    <a class="btn ${nx ? '' : 'primary'}" href="#add-${cid}">${icon('plus')}<span>Add learning</span></a></div>
  <div class="row quiet"><button class="btn sm ghost" data-act="tutor-open">${icon('chat')}<span>Tutor</span></button><a class="btn sm ghost" href="#map-${cid}">Mind map</a><button class="btn sm ghost" data-act="toggle" data-key="cmenu-${cid}" aria-expanded="${!!menu}">${menu ? 'Hide tools' : 'More tools'}</button></div>
  ${menu ? `<div class="menu">${tools.map(([h, t, d]) => `<a href="${h}"><b>${t}</b><span class="small muted">${d}</span></a>`).join('')}<button type="button" data-act="set" data-key="ctab-${cid}" data-val="material"><b>Sources</b><span class="small muted">What you have added</span></button><button type="button" data-act="set" data-key="ctab-${cid}" data-val="options"><b>Course options</b><span class="small muted">Strictness, probing, pace, delete</span></button></div>` : ''}
  ${feedbackRow(cid)}
  ${c.profile ? `<div class="stack tight"><button type="button" class="linkbtn small" data-act="toggle" data-key="about-${cid}" aria-expanded="${!!ui('about-' + cid, false)}">${ui('about-' + cid, false) ? 'Hide' : 'About you, from what you pasted'}</button>${ui('about-' + cid, false) ? `<p class="small muted">${esc(c.profile)}</p>` : ''}</div>` : ''}
  ${p.mode === 'deadline' && p.status !== 'done' && p.status !== 'past' && us.length ? `<div class="note"><b>Today's plan:</b> ${plural(p.lessonsPerDay, 'lesson')}, about ${p.minutesNeeded} minutes with review. You set aside ${num(c.minutesPerDay)} minutes a day.${p.status === 'behind' ? ' That is more than your daily time, so the target date is at risk: add minutes, move the date, or cut modules.' : ''}</div>` : ''}
  ${p.cramSuggested && !c.cram ? `<div class="note row between"><span><b>${p.daysLeft} days to your target date.</b> Cram mode reviews only the highest-yield ideas, on top of daily review.</span><button class="btn sm" data-act="cram-on" data-cid="${cid}">Turn on cram mode</button></div>` : ''}
  ${us.length ? `<div class="stack"><h2>Modules</h2>${us.map((u, i) => { const up = unitProgress(u), bkey = 'build-' + u.id; const gate = i > 0 && !us[i - 1].passedAt && !u.passedAt && !up.built;
    return `<div class="panel stack tight unit"><div class="row between"><h3 class="grow">${esc(u.title)}</h3><div class="row">${u.reviewOnly ? chip('Review only', 'accent') : ''}${u.passedAt ? chip('Passed' + (u.passScore ? ' · ' + num(u.passScore) : ''), 'good') : up.built && up.total && up.done === up.total && !up.pending ? chip('Below pass mark · ' + up.avg, 'due') : ''}${u.kind === 'gaps' ? chip('From your assessment', 'added') : u.origin === 'added' ? chip('Added by Claude', 'added') : ''}</div></div>
      ${u.summary ? `<p class="small muted">${esc(u.summary)}</p>` : ''}${gate ? `<div class="small muted">Recommended after you pass the module before it. You can still start it now.</div>` : ''}
      ${up.total ? bar(100 * up.done / up.total) : ''}
      ${(u.lessons || []).length ? `<ol class="lessons small">${u.lessons.map((l, n) => { const lid = u.id + 'L' + n; return `<li>${l.built ? `<a href="#learn-${lid}">${esc(l.title)}</a>` : `<span class="muted">${esc(l.title)}</span>`} ${!l.built ? chip('Not built yet') : l.depth === 'review' ? chip('Review cards only') : lessonDone(lid) ? chip('Done', 'good') : nx && nx.lid === lid ? chip('Next', 'accent') : ''}${(l.gaps || []).length ? ' ' + chip('Aimed at a weak spot', 'due') : ''}</li>`; }).join('')}</ol>` : '<span class="small muted">Topics are planned when you build this module.</span>'}
      ${tasksHtml(u)}
      <div class="row">${up.pending || (!up.lessons && !(u.tasks || []).length) ? (aiOn() ? `<button class="btn sm ${isBusy(bkey) ? '' : 'primary'}" data-act="unit-build" data-uid="${u.id}" ${isBusy(bkey) ? 'disabled' : ''}>${up.built ? `Build ${plural(up.pending, 'new topic')}` : 'Build this module'}</button>` : needAI) : ''}${up.built ? `<a class="btn sm ghost" href="#guide-${u.id}">Study guide and audio recap</a>` : ''}</div>${busyHtml(bkey)}</div>`; }).join('')}</div>`
    : `<div class="empty stack"><b>This course is empty.</b><span>Paste what you have learned and Claude will file it into modules and topics, then teach and review it with you.</span><div><a class="btn primary" href="#add-${cid}">Add your first learning</a></div></div>`}
  ${log.length ? `<div class="stack tight"><h2>Recently added</h2><div class="panel list">${log.slice(0, 10).map(x => `<div class="row between"><span class="grow"><b>${esc(x.title)}</b><br><span class="small muted">${esc(x.summary || '')}</span></span><span class="small muted">${esc(x.day || '')}</span></div>`).join('')}</div></div>` : ''}</div>`;
};
Object.assign(ACT, {
  'unit-build': el => buildUnit(el.dataset.uid),
  'task-tick': el => { const u = S.units[el.dataset.uid]; if (!u) return; const tasks = clone(L.arr(u.tasks, 12)), k = (tasks[+el.dataset.t] || { criteria: [] }).criteria[+el.dataset.c]; if (!k) return; k.done = el.checked; patch('units', el.dataset.uid, { tasks }).then(render, () => { }); },
  'fb-review': el => { const cid = el.dataset.cid, ids = list('cards').filter(k => k.fromFeedback && k.status === 'active' && (!cid || k.courseId === cid)).map(k => k.id).slice(0, 30); if (ids.length) startSession({ kind: 'feedback', title: 'Tutor feedback', ids, mode: 'review', bucket: 'extra', back: cid ? 'course-' + cid : 'home' }); },
  'course-skip-plan': async el => { await patch('courses', el.dataset.cid, { status: 'active', startedDay: today(), mix: Object.assign({}, S.courses[el.dataset.cid].mix, { own: true }) }).catch(() => { }); go('add-' + el.dataset.cid); },
  'course-mix-own': el => { const c = S.courses[el.dataset.cid]; patch('courses', el.dataset.cid, { mix: Object.assign({}, c.mix, { own: true }) }).then(render, () => { }); },
  'course-opt': el => { const cid = S.param, k = el.dataset.key, v = el.dataset.val; const cur = Object.assign({}, S.settings[cid] || {}); if (v === '') delete cur[k]; else cur[k] = k === 'retention' ? Number(v) : v; put('settings', cid, cur).then(render, () => { }); render(); },
  'course-field': el => { const cid = S.param, f = el.dataset.f; let v = el.value;
    if (f === 'goal') { patch('courses', cid, { goal: L.str(v, 200) }).then(render, () => { }); return; }
    if (f.startsWith('exam.')) { const k = f.slice(5), ex = Object.assign({}, S.courses[cid].exam || {}); if (k === 'questions' || k === 'minutes') { const n = Math.round(Number(v)); ex[k] = v.trim() && n >= 1 && n <= 600 ? n : null; } else ex[k] = L.str(v, k === 'style' ? 200 : 40); patch('courses', cid, { exam: ex }).then(render, () => { }); return; } if (f === 'minutesPerDay') { v = Math.round(Number(v)); if (!(v >= 5 && v <= 600)) { el.value = S.courses[cid].minutesPerDay; return; } } else if (v && !L.validDay(v)) return; patch('courses', cid, { [f]: v }).then(render, () => { }); },
  'course-delete': el => { const c = S.courses[el.dataset.cid]; if (!c) return; confirmBox(`Delete "${c.title}"?`, 'This deletes its units, lessons, cards, review history, tests and material. It can\'t be undone.', 'Delete course', async () => { UI.modal = null; go('courses'); await deleteCourse(el.dataset.cid); toast('Course deleted.'); render(); }); },
  'place-skip': el => patch('courses', el.dataset.cid, { placementDone: true }).then(render, () => { })
});

/* ---------- Placement test ---------- */
VIEWS.placement = cid => {
  const c = S.courses[cid]; if (!c) return emptyBox('This course no longer exists.');
  const pl = ui('place', () => ({ cid, items: null, answers: [], results: null }));
  if (pl.cid !== cid) { UI.place = { cid, items: null, answers: [], results: null }; return VIEWS.placement(cid); }
  const us = unitsOf(cid), key = 'place';
  if (pl.results) return `<div class="reader stack-lg">${backLink('course-' + cid, c.title)}<h1>Placement results</h1><div class="panel list">${pl.results.map(r => `<div class="row between"><span>${esc((us[r.unit] || {}).title || 'Unit')}</span><span class="row"><span class="num">${r.score}</span>${r.score >= 85 ? chip('Review only', 'accent') : chip('Full lessons')}</span></div>`).join('')}</div><p class="small muted">Units scored 85 or higher skip the lessons. Their cards go straight into review once the unit is built.</p><a class="btn primary" href="#course-${cid}">Back to the course</a></div>`;
  if (!pl.items) return `<div class="reader stack-lg">${backLink('course-' + cid, c.title)}<div class="stack"><h1>Placement test</h1><p class="muted">One short explain-it prompt per unit, about 10 minutes. Leave blank what you don't know.</p></div><div class="row">${aiOn() ? `<button class="btn primary" data-act="place-start" data-cid="${cid}" ${isBusy(key) ? 'disabled' : ''}>Start</button>` : needAI}</div>${busyHtml(key)}</div>`;
  return `<div class="reader stack-lg">${backLink('course-' + cid, c.title)}<h1>Placement test</h1>${pl.items.map((it, i) => `<div class="qcard"><span class="eyebrow">${esc((us[it.unit] || {}).title || '')}</span><div class="qprompt">${inline(it.prompt)}</div><textarea id="f-place-answers-${i}" data-bind="place.answers.${i}" rows="3" placeholder="Your explanation, or leave blank">${esc(pl.answers[i] || '')}</textarea></div>`).join('')}
  <div class="row"><button class="btn primary" data-act="place-grade" data-cid="${cid}" ${isBusy(key) ? 'disabled' : ''}>Score my answers</button></div>${busyHtml(key)}</div>`;
};
Object.assign(ACT, {
  'place-start': async el => {
    const cid = el.dataset.cid, us = unitsOf(cid);
    const r = await task('place', 'Writing your placement test…', signal => ai(P.placement({ course: S.courses[cid], units: us }), { signal }));
    if (!r) return;
    const items = L.arr(r.items, 30).map(x => ({ unit: Number(x && x.unit), prompt: L.str(x && x.prompt, 600), keyPoints: L.arr(x && x.keyPoints, 5).map(k => L.str(k, 200)).filter(Boolean) })).filter(x => x.prompt && us[x.unit]);
    if (!items.length) { toast(AI_COPY.invalid_json, true); return; }
    UI.place.items = items; UI.place.answers = items.map(() => ''); render();
  },
  'place-grade': async el => {
    const cid = el.dataset.cid, pl = UI.place, us = unitsOf(cid);
    const r = await task('place', 'Scoring…', signal => ai(P.placementGrade({ items: pl.items.map((it, i) => Object.assign({}, it, { answer: L.str(pl.answers[i], 3000) })) }), { signal }));
    if (!r) return;
    const by = {}; for (const x of L.arr(r.results, 40)) { const u = Number(x && x.unit); if (us[u]) by[u] = L.clamp(Math.round(Number(x.score) || 0), 0, 100); }
    pl.results = pl.items.map((it, i) => ({ unit: it.unit, score: (pl.answers[i] || '').trim() ? (by[it.unit] || 0) : 0 }));
    for (const x of pl.results) if (x.score >= 85 && us[x.unit].status !== 'ready') await patch('units', us[x.unit].id, { reviewOnly: true, placeScore: x.score }).catch(() => { });
    await patch('courses', cid, { placementDone: true }).catch(() => { });
    render();
  }
});

/* ---------- Lesson player: learn one idea, then explain it back ---------- */
const lessonLoading = {};
function needLesson(lid) {
  if (S.lessons[lid] || lessonLoading[lid]) return;
  lessonLoading[lid] = true;
  getLesson(lid).then(l => { lessonLoading[lid] = l ? false : 'missing'; render(); }, () => { lessonLoading[lid] = 'missing'; render(); });
}
function ideaSpeech(i) { return [i.title, i.analogy && i.analogy.text, i.mechanism.text, i.example && (i.example.title + '. ' + i.example.steps.map(s => s.text).join(' ') + ' ' + (i.example.result || '')), i.why && 'Why it matters. ' + i.why.text].filter(Boolean); }
function ideaHtml(i, courseId) {
  const seen = new Set(), t = html => withTerms(html, seen, courseId);
  const ex = i.example;
  return `<div class="idea stack">
    ${(i.flags || []).map(f => `<div class="flag small"><b>Self-check flagged this:</b> ${esc(f.problem)}</div>`).join('')}
    ${i.analogy ? `<div class="analogy prose"><span class="part-label">Analogy</span>${addedTag('Added background, not from your source')}${t(paras(i.analogy.text))}</div>` : ''}
    <div class="prose ${i.mechanism.origin === 'added' ? 'added' : ''}"><span class="part-label">How it works</span>${i.mechanism.origin === 'added' ? addedTag() : ''}${t(paras(i.mechanism.text))}</div>
    ${renderVisual(i.visual, i.visualOrigin === 'added' ? 'Diagram added by Claude' : '')}
    ${ex ? `<div class="example ${ex.origin === 'added' ? 'added' : ''}"><span class="part-label">Worked example</span>${ex.origin === 'added' ? addedTag('Added example, not from your source') : ''}<b>${esc(ex.title)}</b><ol>${ex.steps.map(s => `<li>${s.label ? `<b>${inline(s.label)}.</b> ` : ''}${inline(s.text)}</li>`).join('')}</ol>${ex.result ? `<div class="sense"><b>Result:</b> ${inline(ex.result)}</div>` : ''}</div>` : ''}
    ${i.why ? `<div class="prose why ${i.why.origin === 'added' ? 'added' : ''}"><span class="part-label">Why it matters</span>${i.why.origin === 'added' ? addedTag() : ''}${t(paras(i.why.text))}</div>` : ''}
    ${i.quote ? `<div class="quote small">From your source: “${esc(i.quote)}”</div>` : ''}
    ${i.sourceIssue ? `<div class="issue"><b>Your source may be wrong here</b><div class="small">${esc(i.sourceIssue.issue)}</div>${i.sourceIssue.quote ? `<blockquote>“${esc(i.sourceIssue.quote)}”</blockquote>` : ''}<div class="small muted">Shown as written in your source, not corrected. Check it against another reference.</div></div>` : ''}</div>`;
}
VIEWS.learn = lid => {
  const m = /^(.+)L(\d+)$/.exec(lid), unit = m && S.units[m[1]];
  if (!unit) return emptyBox('This lesson no longer exists. <a href="#courses">Courses</a>');
  const uid = m[1], n = +m[2], cid = unit.courseId;
  const les = S.lessons[lid];
  if (!les) { needLesson(lid); return lessonLoading[lid] === 'missing' ? emptyBox(`This lesson hasn't been built yet. <a href="#course-${cid}">Back to the course</a>`) : emptyBox('<span class="spinner"></span> Loading the lesson…'); }
  const ideas = les.ideas, tbOf = i => S.cards[i.id + 't'];
  let st = UI.learn;
  if (!st || st.lid !== lid) { const first = ideas.findIndex(i => { const c = tbOf(i); return c && c.firstScore == null; }); st = UI.learn = { lid, i: first < 0 ? 0 : first, step: first < 0 ? 'done' : 'read' }; }
  const head = `${backLink('course-' + cid, (S.courses[cid] || {}).title || 'Course')}<div class="lesson-head"><span class="eyebrow">${esc(unit.title)} · topic ${n + 1} of ${unit.lessons.length}</span><h1>${esc(les.title)}</h1>
    <div class="dots" role="img" aria-label="Idea ${Math.min(st.i + 1, ideas.length)} of ${ideas.length}">${ideas.map((i, k) => { const c = tbOf(i); return `<button type="button" class="dot ${c && c.firstScore != null ? 'done' : ''} ${k === st.i && st.step !== 'done' ? 'cur' : ''}" data-act="learn-goto" data-i="${k}" aria-label="Idea ${k + 1}: ${esc(i.title)}"></button>`; }).join('')}</div>${les.checked === false ? '<div class="flag small">The self-check pass did not run for this topic. Treat added content with care.</div>' : les.fixed ? `<div class="small muted">The self-check pass corrected ${plural(num(les.fixed), 'thing')} here before you saw it.</div>` : ''}</div>`;
  if (st.step === 'done') {
    const nextLid = n + 1 < unit.lessons.length && unit.lessons[n + 1].built ? uid + 'L' + (n + 1) : null, up = unitProgress(Object.assign({ id: uid }, unit));
    return `<div class="reader">${head}<div class="panel stack"><h2>Lesson complete</h2><div class="list">${ideas.map((i, k) => { const c = tbOf(i) || {}; return `<div class="row between"><button class="linkbtn" data-act="learn-goto" data-i="${k}">${esc(i.title)}</button><span class="num">${c.firstScore == null ? '–' : num(L.passScoreOf(c))}</span></div>`; }).join('')}</div>
      <p class="small muted">Scores are your best first try at each teach-back (before any re-teach). Explain an idea again to raise it. The unit passes when the average reaches ${L.passMark(settingsFor(cid).strictness)}.${up.total && up.done === up.total ? ` Unit average so far: ${up.avg}.` : ''} Review cards for these ideas start tomorrow.</p>
      <div class="row">${nextLid ? `<a class="btn primary" href="#learn-${nextLid}">Next lesson</a>` : `<a class="btn primary" href="#course-${cid}">Back to the course</a>`}<a class="btn" href="#guide-${uid}">Study guide</a></div></div></div>`;
  }
  const idea = ideas[st.i], card = tbOf(idea);
  const title = `<div class="row between"><h2><span class="secno">${st.i + 1}/${ideas.length}</span>${esc(idea.title)}</h2>${speakBtn('idea-' + idea.id, 'Read aloud', ideaSpeech(idea))}</div>`;
  if (st.step === 'read' || !card) {
    const done = card && card.firstScore != null;
    return `<div class="reader">${head}${title}${ideaHtml(idea, cid)}<div class="row sticky-cta">${!card ? '' : done ? `<button class="btn primary" data-act="learn-next">Next idea</button><button class="btn" data-act="learn-explain">Explain it again</button>` : `<button class="btn primary" data-act="learn-explain">I've read it: explain it back</button>`}
      <button class="btn ghost sm" data-act="lesson-report" data-lid="${lid}" data-i="${st.i}">Report</button></div></div>`;
  }
  if (!UI.litem || UI.litem.cardId !== idea.id + 't' || !UI.litem.ctx.lesson) UI.litem = newItem(idea.id + 't', { lesson: true, mode: 'review', bucket: 'none', kind: 'lesson' });
  return `<div class="reader">${head}${title}<details class="peek"><summary>Peek at the lesson</summary>${ideaHtml(idea, cid)}</details>${itemHtml(UI.litem)}</div>`;
};
async function lessonAdvance(saved) {
  const st = UI.learn, les = st && S.lessons[st.lid]; if (!les) { render(); return; }
  const idea = les.ideas[st.i], tomorrow = L.addDays(today(), 1);
  if (saved) for (const c of cardsOf('ideaId', idea.id)) if (c.type !== 'teachback' && c.status !== 'retired' && !(c.fsrs && c.fsrs.due)) await put('cards', c.id, Object.assign({}, c, { fsrs: Object.assign(L.newFsrs(), c.fsrs, { due: tomorrow }) })).catch(() => { });
  UI.litem = null;
  const next = les.ideas.findIndex((i, k) => k > st.i && S.cards[i.id + 't'] && S.cards[i.id + 't'].firstScore == null);
  if (next >= 0) { st.i = next; st.step = 'read'; } else st.step = 'done';
  render(); window.scrollTo(0, 0);
}
Object.assign(ACT, {
  'learn-explain': () => { UI.learn.step = 'explain'; UI.litem = null; Voice.stop(); render(); window.scrollTo(0, 0); },
  'learn-next': () => { const st = UI.learn, les = S.lessons[st.lid]; if (st.i + 1 < les.ideas.length) { st.i++; st.step = 'read'; } else st.step = 'done'; Voice.stop(); render(); window.scrollTo(0, 0); },
  'learn-goto': el => { UI.learn.i = +el.dataset.i; UI.learn.step = 'read'; UI.litem = null; Voice.stop(); render(); window.scrollTo(0, 0); },
  'lesson-report': el => openModal('report', { lessonId: el.dataset.lid, idea: +el.dataset.i })
});
