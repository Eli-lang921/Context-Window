/* Add learning: paste anything you learned, see where Claude would file it, adjust, approve, and it is built. */
const DEPTH_OPTS = [['refresher', 'Short refresher'], ['full', 'Full lesson'], ['review', 'Review cards only']];
const DEPTH_HINT = {
  refresher: 'A condensed recap of each idea, then you explain it back. Best when you already studied it elsewhere.',
  full: 'Analogy, how it works, a worked example and why it matters, then you explain it back.',
  review: 'No lesson to sit through. Ideas go straight into daily review; you can still open the recap.'
};
const FOUND_LABEL = { lesson: 'Lesson content', notes: 'Your notes', answers: 'Your answers', feedback: 'Tutor feedback', chat: 'Chat transcript' };
function addState(param) {
  const a = ui('add', () => ({ cid: '', newName: '', module: '', depth: 'refresher', title: '', text: '', kind: 'notes', plan: null, sid: null, inboxIds: [] }));
  if (param && S.courses[param] && S.courses[param].status === 'active' && !a.plan && a.picked !== param) { a.cid = param; a.picked = param; }
  return a;
}
function unitIdeaTitles(u) {
  const tb = tbCards(u.id).map(c => c.ideaTitle).filter(Boolean);
  return (tb.length ? tb : (u.lessons || []).flatMap(l => l.ideas || [])).slice(0, 40);
}
VIEWS.add = param => {
  const a = addState(param), cs = courseList().filter(c => c.status === 'active');
  if (a.cid !== 'new' && !(S.courses[a.cid] && S.courses[a.cid].status === 'active')) a.cid = cs.length === 1 ? cs[0].id : cs.length ? '' : 'new';
  if (a.plan) return planHtml(a);
  const c = S.courses[a.cid], us = c ? unitsOf(a.cid) : [], key = 'add';
  return `<div class="reader stack-lg">${backLink(c ? 'course-' + a.cid : 'home', c ? c.title : 'Today')}<div class="stack"><h1>Add learning</h1><p class="muted">Paste anything you learned: lesson text, your notes, your answers with the tutor's feedback, or a whole AI chat. Claude shows where it would file it before anything is built.</p></div>
  <div class="panel stack">
    <div class="field"><span>Course</span><div class="seg scroll" role="group">${cs.map(x => `<button type="button" data-act="set" data-key="add.cid" data-val="${x.id}" aria-pressed="${a.cid === x.id}" ${isBusy(key) ? 'disabled' : ''}>${esc(cut(x.title, 28))}</button>`).join('')}<button type="button" data-act="set" data-key="add.cid" data-val="new" aria-pressed="${a.cid === 'new'}" ${isBusy(key) ? 'disabled' : ''}>New course</button></div></div>
    ${a.cid === 'new' ? field('Name of the new course', textIn('add.newName', a.newName, 'placeholder="For example: AI Cred" maxlength="80"')) : ''}
    ${field('What you learned', `<textarea id="f-add-text" data-bind="add.text" rows="9" placeholder="Paste it here">${esc(a.text)}</textarea>`, `<span id="add-count">${a.text.length.toLocaleString()}</span> characters. Long pastes are split into ordered parts; nothing is cut.`)}
    <div class="field"><span>Or bring it in from</span>${materialPanel(c ? a.cid : '', 'add')}</div>
  </div>
  <div class="panel stack">
    ${field('Module <span class="muted">(optional)</span>', textIn('add.module', a.module, 'placeholder="For example: Module 2. Leave blank and Claude works it out." maxlength="120"'))}
    ${us.length ? `<div class="row quiet">${us.slice(0, 8).map(u => `<button type="button" class="btn sm ${a.module === u.title ? 'primary' : ''}" data-act="set" data-key="add.module" data-val="${esc(u.title)}">${esc(cut(u.title, 30))}</button>`).join('')}</div>` : ''}
    <div class="field"><span>How much teaching</span>${seg('add.depth', DEPTH_OPTS, a.depth)}<span class="small muted">${DEPTH_HINT[a.depth] || ''}</span></div>
    ${field('Name for this addition <span class="muted">(optional)</span>', textIn('add.title', a.title, 'placeholder="Claude names it if blank" maxlength="120"'))}
  </div>
  <div class="panel stack"><h3>Built with</h3>${modelPicker()}</div>
  <div class="row sticky-cta">${aiOn() ? `<button class="btn primary" data-act="add-plan" ${isBusy(key) ? 'disabled' : ''}>Read it and show the plan</button>${a.sid && S.sources[a.sid] ? '<button class="btn ghost" data-act="add-cancel">Discard</button>' : ''}` : needAI}</div>${busyHtml(key)}</div>`;
};
function planHtml(a) {
  const p = a.plan, c = S.courses[p.cid] || {}, us = unitsOf(p.cid), key = 'add';
  const nLessons = p.placements.reduce((n, x) => n + x.lessons.length, 0), nWeak = p.weakSpots.filter(w => w.keep).length;
  return `<div class="reader stack-lg"><div class="stack"><span class="eyebrow">${esc(c.title || 'Course')}</span><h1>Here is the plan</h1>
    <div class="row">${p.found.map(f => chip(FOUND_LABEL[f] || f)).join('')}</div>${p.note ? `<p class="muted">${esc(p.note)}</p>` : ''}</div>
  <div class="panel stack"><div class="field"><span>How much teaching</span>${seg('add.depth', DEPTH_OPTS, a.depth)}<span class="small muted">${DEPTH_HINT[a.depth] || ''}</span></div>${modelPicker()}</div>
  ${p.placements.length ? p.placements.map((pl, pi) => `<div class="panel plan-card stack"><div class="field"><span>Goes into</span><select id="plan-unit-${pi}" data-act-change="plan-unit" data-pi="${pi}">${us.map(u => `<option value="${u.id}" ${pl.unitId === u.id ? 'selected' : ''}>${esc(u.title)}</option>`).join('')}<option value="new" ${pl.unitId === 'new' ? 'selected' : ''}>A new module</option></select></div>
      ${pl.unitId === 'new' ? field('Name of the new module', `<input type="text" id="f-add-plan-placements-${pi}-newTitle" data-bind="add.plan.placements.${pi}.newTitle" value="${esc(pl.newTitle)}" maxlength="120">`) : ''}
      <div class="stack tight"><span class="small"><b>${plural(pl.lessons.length, 'topic')} to add</b></span>${pl.lessons.map((l, li) => `<div class="plan-lesson stack tight"><div class="row nowrap"><input type="text" id="f-add-plan-placements-${pi}-lessons-${li}-title" data-bind="add.plan.placements.${pi}.lessons.${li}.title" value="${esc(l.title)}" maxlength="120" aria-label="Topic title"><button type="button" class="btn sm ghost icon" data-act="plan-drop" data-pi="${pi}" data-li="${li}" aria-label="Leave this topic out">${icon('x')}</button></div><ul class="tightlist small muted">${l.ideas.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div></div>`).join('')
    : `<div class="empty">${p.weakSpots.length ? 'No new topics to teach in this paste. The weak spots below can still be saved.' : 'Claude found nothing new to file. The course may already cover it, or the paste has no teachable content.'}</div>`}
  ${p.weakSpots.length ? `<div class="panel stack"><h3>Weak spots from the feedback</h3><p class="small muted">Each one is logged in your mistake notebook and gets a review card aimed at the gap. Untick any that are wrong.</p>${p.weakSpots.map((w, i) => `<label class="tick"><input type="checkbox" id="ws-${i}" data-bind="add.plan.weakSpots.${i}.keep" ${w.keep ? 'checked' : ''}><span><b>${esc(w.idea || 'Feedback')}</b><br>${esc(w.gap)}${w.quote ? `<span class="quote small" style="display:block">“${esc(w.quote)}”</span>` : ''}${w.card ? `<span class="small muted" style="display:block">Review card: ${esc(cut(w.card.prompt, 160))}</span>` : ''}</span></label>`).join('')}</div>` : ''}
  ${p.skipped.length ? `<div class="stack tight"><h3>Already in your course</h3><ul class="tightlist small muted">${p.skipped.map(s => `<li>${esc(s.idea)}${s.reason ? ': ' + esc(s.reason) : ''}</li>`).join('')}</ul></div>` : ''}
  <div class="row sticky-cta"><button class="btn primary" data-act="add-approve" ${(nLessons || nWeak) && !isBusy(key) ? '' : 'disabled'}>${nLessons ? `Approve and build ${plural(nLessons, 'topic')}` : nWeak ? `Save ${plural(nWeak, 'weak spot')}` : 'Nothing to add'}</button><button class="btn ghost" data-act="add-cancel">Discard</button>${nLessons ? `<span class="small muted">About ${2 * nLessons} Claude calls.</span>` : ''}</div>${busyHtml(key)}</div>`;
}
function mergePlans(into, more) {
  const norm = s => String(s || '').toLowerCase().trim();
  for (const p of more.placements) { const hit = into.placements.find(x => norm(x.unit) === norm(p.unit)); if (hit) hit.lessons.push(...p.lessons); else into.placements.push(p); }
  for (const w of more.weakSpots) if (!into.weakSpots.some(x => norm(x.gap) === norm(w.gap))) into.weakSpots.push(w);
  for (const k of more.skipped) if (!into.skipped.some(x => norm(x.idea) === norm(k.idea))) into.skipped.push(k);
  into.found = [...new Set(into.found.concat(more.found))];
  into.title = into.title || more.title; into.note = into.note || more.note;
  return into;
}
Object.assign(ACT, {
  'add-plan': async () => {
    const a = UI.add, text = a.text.trim();
    if (a.planning || isBusy('add')) return;
    if (a.cid === '') { toast('Pick a course first.'); return; }
    if (a.cid === 'new' && !a.newName.trim()) { toast('Name the new course first.'); return; }
    if (text.length < 80) { toast('Paste at least a few sentences.'); return; }
    a.planning = true;
    if (a.cid === 'new') {
      try { a.cid = await createCourse({ title: a.newName, goal: '', level: 'some', minutes: '30', mixOwn: true, mixAi: true, strictness: globalSettings().strictness || 'standard' }, 'quick'); a.createdCid = a.cid; } catch (e) { a.cid = 'new'; a.planning = false; return; }
      a.newName = '';
    }
    const cid = a.cid;
    const plan = await task('add', 'Reading what you pasted…', async signal => {
      /* If the text was edited after an earlier plan, the saved copy is replaced so the plan always matches what is on screen. */
      if (a.sid && S.sources[a.sid] && (a.sidText !== text || S.sources[a.sid].courseId !== cid)) { await deleteSource(a.sid); a.sid = null; }
      if (!a.sid || !S.sources[a.sid]) { a.sid = await addSource(cid, { title: a.title.trim() || 'Added ' + today(), kind: a.kind, text }); a.sidText = text; if (a.sid) await patch('sources', a.sid, { staged: true }); }
      if (!a.sid) throw { userMessage: 'The material couldn\'t be saved, so nothing was planned.' };
      const segs = L.splitSegments(text).map((t, i) => ({ ref: a.sid + ':' + i, text: t })), refs = new Set(segs.map(s => s.ref));
      const units = unitsOf(cid).map(u => ({ title: u.title, ideas: unitIdeaTitles(u) }));
      let merged = { title: '', found: [], placements: [], weakSpots: [], skipped: [], note: '' };
      for (let i = 0, part = 1; i < segs.length; part++) {
        const batch = []; let size = 0;
        while (i < segs.length && (size + segs[i].text.length <= 80000 || !batch.length)) { batch.push(segs[i]); size += segs[i].text.length; i++; }
        if (S.busy.add && segs.length > batch.length) { S.busy.add.label = `Reading what you pasted (part ${Math.min(i, segs.length)} of ${segs.length})…`; render(); }
        const got = L.validateIntake(await ai(P.intake({ course: S.courses[cid], units, moduleHint: L.str(a.module, 120), segments: batch, planned: merged.placements.flatMap(p => p.lessons.map(l => p.unit + ' / ' + l.title)) }), { signal, build: true }));
        merged = mergePlans(merged, got);
      }
      for (const p of merged.placements) for (const l of p.lessons) l.segs = l.segs.filter(r => refs.has(r));
      return merged;
    });
    a.planning = false;
    if (!plan) { render(); return; }
    plan.cid = cid;
    const us = unitsOf(cid), hint = L.str(a.module, 120);
    for (const p of plan.placements) { p.unitId = L.matchUnit(p.unit, us) || (hint && plan.placements.length === 1 ? L.matchUnit(hint, us) : null) || 'new'; p.newTitle = p.unit; }
    plan.weakSpots = plan.weakSpots.slice(0, 20); plan.skipped = plan.skipped.slice(0, 30);
    for (const w of plan.weakSpots) { w.keep = true; if (!w.card) w.card = L.validateCard({ type: 'short', prompt: `Your tutor's feedback flagged a gap${w.idea ? ' on "' + w.idea + '"' : ''}. What was it, and what should you do instead?`, answer: w.gap, explanation: w.gap, origin: 'source', difficulty: 3 }); }
    a.plan = plan;
    if (!a.title.trim() && plan.title && S.sources[a.sid]) patch('sources', a.sid, { title: plan.title }).catch(() => { });
    render(); window.scrollTo(0, 0);
  },
  'plan-unit': el => { const p = UI.add && UI.add.plan && UI.add.plan.placements[+el.dataset.pi]; if (p) { p.unitId = el.value === 'new' || S.units[el.value] ? el.value : 'new'; render(); } },
  'plan-drop': el => { const pl = UI.add.plan.placements, pi = +el.dataset.pi; pl[pi].lessons.splice(+el.dataset.li, 1); if (!pl[pi].lessons.length) pl.splice(pi, 1); render(); },
  'add-cancel': () => confirmBox('Discard this addition?', 'The pasted material is removed and nothing is added to the course.', 'Discard', async () => { const a = UI.add, cid = a && a.cid; if (a && a.sid) await deleteSource(a.sid); delete UI.add; if (a && a.createdCid === cid && S.courses[cid] && !unitsOf(cid).length && !list('sources').some(s => s.courseId === cid)) { await deleteCourse(cid); go('home'); return; } go(S.courses[cid] ? 'course-' + cid : 'home'); }),
  'add-approve': async () => {
    const a = UI.add, plan = a && a.plan, cid = plan && plan.cid; if (!plan || !S.courses[cid] || S.courses[cid].status !== 'active' || isBusy('add')) return;
    const depth = L.DEPTHS.includes(a.depth) ? a.depth : 'refresher', t = today(), touched = [], names = [];
    let nLessons = 0;
    S.busy.add = { label: 'Filing it into your course…', ctl: new AbortController() }; render();
    try {
      for (const p of plan.placements) {
        if (p.done) { if (p.doneUid && !touched.includes(p.doneUid)) { touched.push(p.doneUid); names.push((S.units[p.doneUid] || {}).title || ''); } continue; }
        const add = p.lessons.filter(l => L.str(l.title)).map(l => ({ title: L.str(l.title, 120), ideas: l.ideas, segs: l.segs, depth, sid: a.sid, addedDay: t }));
        if (!add.length) continue;
        let uid = p.unitId !== 'new' && S.units[p.unitId] ? p.unitId : null;
        if (uid) { const u = S.units[uid]; await patch('units', uid, { lessons: (u.lessons || []).concat(add), passedAt: null, reviewOnly: false, status: u.status === 'draft' ? 'planned' : u.status }); }
        else { uid = L.uid('u'); await put('units', uid, { courseId: cid, n: unitsOf(cid).length, title: L.str(p.newTitle, 120) || L.str(p.unit, 120) || 'New module', summary: '', lessons: add, segs: [], origin: 'source', status: 'planned', createdAt: Date.now() }); }
        p.done = true; p.doneUid = uid;
        if (!touched.includes(uid)) { touched.push(uid); names.push(S.units[uid].title); }
        nLessons += add.length;
      }
      const weak = plan.weakSpots.filter(w => w.keep), home = touched[0] || null;
      for (let i = 0; i < weak.length; i++) {
        const w = weak[i];
        if (w.saved) continue;
        /* File the gap under the module it is about, not just the first module this paste touched. */
        const wp = w.unit && plan.placements.find(p => p.doneUid && [p.unit, p.newTitle].some(t => String(t || '').toLowerCase().trim() === w.unit.toLowerCase().trim()));
        const wHome = (wp && wp.doneUid) || (w.unit && L.matchUnit(w.unit, unitsOf(cid))) || home;
        let cardId = null;
        if (w.card) { cardId = L.uid('k'); await put('cards', cardId, L.newCard(Object.assign({}, w.card, { courseId: cid, unitId: wHome, ideaTitle: w.idea, quote: w.quote, origin: 'source', fromFeedback: true, createdAt: Date.now() + i, fsrs: Object.assign(L.newFsrs(), { due: t }) }))); }
        await put('mistakes', L.uid('m'), { cardId, courseId: cid, unitId: wHome, ideaId: null, ideaTitle: w.idea, prompt: w.card ? w.card.prompt : (w.idea || 'Feedback from your tutor'), given: '', why: w.gap + (w.quote ? ' Feedback said: "' + w.quote + '"' : ''), kind: 'feedback', guess: false, day: t, at: Date.now() + i });
        w.saved = true;
      }
      if (S.sources[a.sid]) await patch('sources', a.sid, { staged: false });
      const title = (S.sources[a.sid] || {}).title || plan.title || 'Addition';
      const summary = [nLessons ? plural(nLessons, 'topic') + ' in ' + names.join(', ') : '', weak.length ? plural(weak.length, 'weak spot') + ' from feedback' : ''].filter(Boolean).join(' · ');
      for (const id of a.inboxIds || []) drop('inbox', id).catch(() => { });
      await patch('courses', cid, { doneAt: null, mix: Object.assign({}, S.courses[cid].mix, { own: true }), log: [{ at: Date.now(), day: t, title, summary, depth }].concat(L.arr(S.courses[cid].log, 30)).slice(0, 30) });
    } catch (e) { delete S.busy.add; render(); return; }
    delete S.busy.add; delete UI.add;
    toast(nLessons ? 'Filed. Building the new topics now.' : 'Weak spots saved.');
    go('course-' + cid);
    /* One tap builds every touched module in turn; a Stop or an error ends the chain. */
    for (const uid of touched) { if (!(await buildUnit(uid))) break; }
  }
});
