/* Mind map, mistake notebook, study guide and audio recap, reports, progress (weekly report, stats, badges), home, settings. */
const LEVEL_LABEL = { new: 'Not started', weak: 'Weak', learning: 'Getting there', strong: 'Strong', mastered: 'Mastered' };
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/* ---------- Mind map: module, then topic, then idea, each idea colored by how well you know it ---------- */
VIEWS.map = cid => {
  const c = S.courses[cid]; if (!c) return emptyBox('This course no longer exists.');
  const us = unitsOf(cid), sel = UI.mapSel;
  const dot = (lv, title, id) => id ? `<button type="button" class="mnode lv-${lv} ${sel === id ? 'sel' : ''}" data-act="map-sel" data-id="${esc(id)}" aria-label="${esc(title)}: ${LEVEL_LABEL[lv]}"><i></i><span>${esc(title)}</span></button>` : `<span class="mnode planned lv-new"><i></i><span>${esc(title)}</span></span>`;
  const mods = us.map(u => {
    const tb = tbCards(u.id), strong = tb.filter(k => ['strong', 'mastered'].includes(L.ideaLevel(cardsOf('ideaId', k.ideaId)))).length;
    const topics = (u.lessons || []).map((l, n) => { const lid = u.id + 'L' + n, mine = tb.filter(k => k.lessonId === lid).sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
      return `<div class="mtopic"><span class="small mtitle">${l.built ? `<a href="#learn-${lid}">${esc(l.title)}</a>` : esc(l.title) + ' ' + chip('Not built yet')}</span><div class="mideas">${mine.length ? mine.map(k => dot(L.ideaLevel(cardsOf('ideaId', k.ideaId)), k.ideaTitle, k.ideaId)).join('') : (l.ideas || []).map(x => dot('new', x, null)).join('')}</div></div>`; }).join('');
    return `<div class="mmod"><button type="button" class="mnode unit ${sel === u.id ? 'sel' : ''}" data-act="map-sel" data-id="${esc(u.id)}"><b>${esc(u.title)}</b><span class="small muted">${tb.length ? `${strong} of ${plural(tb.length, 'idea')} strong` : 'Not built yet'}${u.kind === 'gaps' ? ' · written by Claude, not in your course' : ''}</span></button><div class="mtopics">${topics || '<span class="small muted">No topics yet.</span>'}</div></div>`;
  }).join('');
  let panel = '';
  if (sel && S.units[sel]) { const u = S.units[sel], up = unitProgress(Object.assign({ id: sel }, u)); panel = `<div class="panel stack tight"><span class="eyebrow">Module</span><h3>${esc(u.title)}</h3><p class="small muted">${up.built ? `${up.done} of ${up.total} ideas explained back${up.avg != null ? ` · average ${up.avg}` : ''}` : 'Not built yet'}</p><div class="row">${up.built ? `<a class="btn sm primary" href="#learn-${sel}L0">Open first topic</a><a class="btn sm" href="#guide-${sel}">Study guide</a>` : `<a class="btn sm primary" href="#course-${cid}">Build it from the course page</a>`}</div></div>`; }
  else if (sel) { const cs = cardsOf('ideaId', sel), tb = cs.find(k => k.type === 'teachback'); if (tb) panel = `<div class="panel stack tight"><span class="eyebrow">Idea · ${LEVEL_LABEL[L.ideaLevel(cs)]}</span><h3>${esc(tb.ideaTitle)}</h3><p class="small muted">${tb.lastScore == null ? 'Not explained back yet' : 'Last teach-back score ' + num(tb.lastScore)} · ${plural(cs.reduce((n, k) => n + (k.misses || 0), 0), 'miss', 'misses')}</p><div class="row"><a class="btn sm primary" href="#learn-${esc(tb.lessonId)}">Open the topic</a>${cs.some(k => k.status === 'active' && k.fsrs && k.fsrs.reps) ? `<button class="btn sm" data-act="map-review" data-id="${esc(sel)}">Review this idea</button>` : ''}<button class="btn sm ghost" data-act="map-master" data-id="${esc(sel)}">${tb.mastered ? 'Un-master' : 'Mark mastered'}</button></div></div>`; }
  return `<div class="stack-lg">${backLink('course-' + cid, c.title)}<div class="stack"><h1>Mind map</h1><p class="muted">Every module, topic and idea, colored by how well you know it. Tap one to open or review it.</p></div>
  <div class="legend">${Object.entries(LEVEL_LABEL).map(([k, l]) => `<span class="lg lv-${k}"><i></i>${l}</span>`).join('')}</div>
  ${panel}${us.length ? `<div class="mindmap stack">${mods}</div>` : emptyBox('No modules yet.')}</div>`;
};
Object.assign(ACT, {
  'map-sel': el => { UI.mapSel = UI.mapSel === el.dataset.id ? null : el.dataset.id; render(); },
  'map-review': el => { const cs = cardsOf('ideaId', el.dataset.id).filter(k => k.status === 'active' && k.fsrs && k.fsrs.reps); if (cs.length) startSession({ kind: 'idea', title: 'Idea review', ids: cs.map(k => k.id), mode: 'light', bucket: 'none', back: 'map-' + S.param }); },
  'map-master': async el => { const cs = cardsOf('ideaId', el.dataset.id), on = !cs.some(k => k.mastered), t = today(); for (const k of cs) await put('cards', k.id, on ? L.markMastered(k, t) : L.unmaster(k, t)).catch(() => { }); toast(on ? 'Marked mastered.' : 'Back in regular review.'); render(); }
});

/* ---------- Mistake notebook ---------- */
VIEWS.notebook = () => {
  const f = ui('nbCourse', 'all'), all = list('mistakes').sort((a, b) => b.at - a.at);
  const shown = all.filter(m => f === 'all' || m.courseId === f), cs = courseList().filter(c => all.some(m => m.courseId === c.id));
  const reviewable = [...new Set(shown.map(m => m.cardId).filter(id => id && S.cards[id] && S.cards[id].status === 'active'))];
  const KIND = { review: 'Review', lesson: 'Lesson', test: 'Test', game: 'Game', cram: 'Cram', feedback: 'Tutor feedback' };
  const entry = m => { const fb = m.kind === 'feedback', lu = m.lessonId ? S.units[m.lessonId.replace(/L\d+$/, '')] : null, lid = lu && ((lu.lessons || [])[+m.lessonId.split('L').pop()] || {}).built ? m.lessonId : null;
    return `<div class="panel stack tight"><div class="row between"><div class="row">${chip(KIND[m.kind] || 'Review')}${m.guess ? chip('Guess', 'due') : ''}</div><span class="small muted">${esc(m.day || '')}</span></div>${m.ideaTitle ? `<b class="small">${esc(m.ideaTitle)}</b>` : ''}
    ${fb && m.lessonId ? '' : `<div class="qprompt small">${inline(m.prompt)}</div>`}${m.given ? `<div class="small"><b>You said:</b> ${esc(cut(m.given, 300))}</div>` : ''}${m.why ? `<div class="small"><b>${fb ? 'Your tutor said:' : 'Why it was a miss:'}</b> ${inline(m.why)}</div>` : ''}
    <div class="row">${lid ? `<a class="btn sm" href="#learn-${esc(lid)}">Open the topic that teaches this</a>` : fb && m.lessonId ? `<span class="small muted">${inline(m.prompt)} (not built yet)</span>` : ''}<button class="linkbtn small" data-act="nb-drop" data-id="${m.id}">Remove</button></div></div>`; };
  /* Grouped by module, newest first inside each group. */
  const groups = []; for (const m of shown.slice(0, 120)) { const key = m.unitId && S.units[m.unitId] ? m.unitId : ''; let g = groups.find(x => x.key === key); if (!g) { g = { key, title: key ? S.units[key].title : 'Not tied to a module', n: key ? num(S.units[key].n) : 999, items: [] }; groups.push(g); } g.items.push(m); }
  groups.sort((x, y) => x.n - y.n);
  return `<div class="stack-lg"><h1>Progress</h1>${progressTabs('notebook')}<div class="stack"><h2>Mistake notebook</h2><p class="muted">Every miss and every weak spot your tutor named, grouped by module. Read it through before a test, or review the cards behind it.</p></div>
  ${cs.length > 1 ? seg('nbCourse', [['all', 'All courses']].concat(cs.map(c => [c.id, c.title])), f) : ''}
  ${shown.length ? `${reviewable.length ? `<div class="row"><button class="btn primary" data-act="nb-review">Review these ${plural(reviewable.length, 'card')}</button></div>` : ''}
  <div class="stack">${groups.map((g, gi) => { const open = ui('nb-' + g.key, groups.length === 1 || gi === 0); return `<div class="stack tight"><button type="button" class="btn ghost nbgroup" data-act="toggle" data-key="nb-${esc(g.key)}" aria-expanded="${!!open}"><b>${esc(g.title)}</b><span class="muted">${plural(g.items.length, 'entry', 'entries')} · ${open ? 'Hide' : 'Show'}</span></button>${open ? g.items.map(entry).join('') : ''}</div>`; }).join('')}</div>
  <div><button class="linkbtn small" data-act="nb-clear">Clear this list</button></div>` : emptyBox('No misses logged. They appear here from review, lessons, tests, games and tutor feedback you paste.')}</div>`;
};
Object.assign(ACT, {
  'nb-review': () => { const f = UI.nbCourse; const ids = [...new Set(list('mistakes').filter(m => f === 'all' || m.courseId === f).sort((a, b) => b.at - a.at).map(m => m.cardId).filter(id => id && S.cards[id] && S.cards[id].status === 'active'))].slice(0, 30); if (ids.length) startSession({ kind: 'notebook', title: 'Mistake review', ids, mode: 'light', bucket: 'none', back: 'notebook' }); },
  'nb-drop': el => { drop('mistakes', el.dataset.id).catch(() => { }); render(); },
  'nb-clear': () => confirmBox('Clear this list?', 'The misses are removed from the notebook. Your cards and schedule are not changed.', 'Clear', async () => { const f = UI.nbCourse; for (const m of list('mistakes').filter(m => f === 'all' || m.courseId === f)) await drop('mistakes', m.id).catch(() => { }); render(); })
});

/* ---------- Study guide and audio recap ---------- */
function unitLessons(uid) { const u = S.units[uid]; return u ? lessonIds(Object.assign({ id: uid }, u)).map(l => S.lessons[l]) : []; }
function unitIdeaBriefs(uid) { return unitLessons(uid).filter(Boolean).flatMap(l => l.ideas).map(i => ({ title: i.title, points: i.keyPoints.join('; ') })); }
VIEWS.guide = uid => {
  const u = S.units[uid]; if (!u) return emptyBox('This unit no longer exists.');
  const cid = u.courseId, c = S.courses[cid] || {}, ids = lessonIds(Object.assign({ id: uid }, u));
  ids.forEach(needLesson);
  const lessons = ids.map(l => S.lessons[l]).filter(Boolean), g = u.guide, rc = u.recap, key = 'guide-' + uid;
  if (!lessons.length) return `<div class="reader">${backLink('course-' + cid, c.title || 'Course')}${ids.some(l => lessonLoading[l] === true) ? emptyBox('<span class="spinner"></span> Loading…') : emptyBox('Build this unit first.')}</div>`;
  return `<div class="reader stack-lg">${backLink('course-' + cid, c.title || 'Course')}<div class="stack"><span class="eyebrow">Study guide</span><h1>${esc(u.title)}</h1></div>
  <div class="row"><button class="btn" data-act="guide-export" data-uid="${uid}">Export to Obsidian</button>${aiOn() ? `<button class="btn" data-act="guide-make" data-uid="${uid}" ${isBusy(key) ? 'disabled' : ''}>${g ? 'Rewrite cheat sheet' : 'Write cheat sheet'}</button>` : ''}</div>${busyHtml(key)}
  ${g ? `<div class="panel stack"><h3>Cheat sheet</h3><p>${esc(g.summary)}</p>${[['Must know', g.mustKnow], ['Formulas and rules', g.formulas], ['Common mistakes', g.pitfalls]].filter(x => x[1] && x[1].length).map(([t, xs]) => `<div><b>${t}</b><ul class="tightlist">${xs.map(x => `<li>${inline(x)}</li>`).join('')}</ul></div>`).join('')}</div>` : ''}
  <div class="panel stack"><div class="row between"><h3>Audio recap</h3>${rc ? speakBtn('recap-' + uid, 'Play recap', rc.lines) : ''}</div>
    ${rc ? `<p class="small muted">About ${Math.max(1, Math.round(rc.lines.join(' ').split(/\s+/).length / 150))} minutes, one narrator.${Voice.usingFallback() && Voice.canSpeak() ? ' Claude\'s voice isn\'t offered in this app, so your device\'s voice reads it.' : ''}${Voice.canSpeak() ? '' : ' No voice is available in this view; read it below.'}</p><details><summary class="small">Show the script</summary><div class="prose small">${rc.lines.map(x => `<p>${esc(x)}</p>`).join('')}</div></details>` : '<p class="small muted">A 3-5 minute spoken summary of this unit.</p>'}
    ${aiOn() ? `<div><button class="btn sm" data-act="recap-make" data-uid="${uid}" ${isBusy(key) ? 'disabled' : ''}>${rc ? 'Rewrite recap' : 'Write the recap'}</button></div>` : rc ? '' : needAI}</div>
  ${lessons.map(l => `<section class="stack"><h2>${esc(l.title)}</h2>${l.ideas.map(i => `<div class="panel stack tight"><div class="row between"><h3>${esc(i.title)}</h3>${speakBtn('idea-' + i.id, 'Read aloud', ideaSpeech(i))}</div><div class="prose small">${paras(i.mechanism.text)}</div><ul class="tightlist small">${i.keyPoints.map(k => `<li>${esc(k)}</li>`).join('')}</ul>${i.terms.length ? `<div class="small">${i.terms.map(t => `<b>${esc(t.term)}</b>: ${esc(t.def)}`).join(' · ')}</div>` : ''}</div>`).join('')}</section>`).join('')}</div>`;
};
Object.assign(ACT, {
  'guide-export': async el => { const uid = el.dataset.uid, u = S.units[uid], c = S.courses[u.courseId] || { title: 'Course' }; const md = L.guideMarkdown(c, u, unitLessons(uid).filter(Boolean), u.guide, today()); await offerFile(L.slug(c.title + '-' + u.title) + '.md', md, md); },
  'guide-make': async el => {
    const uid = el.dataset.uid, u = S.units[uid];
    const r = await task('guide-' + uid, 'Writing the cheat sheet…', signal => ai(P.guide({ course: S.courses[u.courseId], unit: u, ideas: unitIdeaBriefs(uid) }), { signal, build: true }));
    if (!r) return;
    const list5 = x => L.arr(x, 12).map(s => L.str(s, 400)).filter(Boolean);
    await patch('units', uid, { guide: { summary: L.str(r.summary, 800), mustKnow: list5(r.mustKnow), formulas: list5(r.formulas), pitfalls: list5(r.pitfalls) } }).catch(() => { }); render();
  },
  'recap-make': async el => {
    const uid = el.dataset.uid, u = S.units[uid];
    const r = await task('guide-' + uid, 'Writing the audio recap…', signal => ai(P.recap({ course: S.courses[u.courseId], unit: u, ideas: unitIdeaBriefs(uid) }), { signal, build: true }));
    if (!r) return;
    const lines = L.arr(r.lines, 14).map(s => L.str(s, 1900)).filter(Boolean);
    if (!lines.length) { toast(AI_COPY.invalid_json, true); return; }
    await patch('units', uid, { recap: { lines, at: Date.now() } }).catch(() => { }); render();
  }
});

/* ---------- Reports: flagged items, source issues, your own reports ---------- */
function reportTarget(r) {
  const les = r.lessonId && S.lessons[r.lessonId], unit = S.units[r.unitId] || (r.lessonId && S.units[(/^(.+)L\d+$/.exec(r.lessonId) || [])[1]]);
  const idea = les && r.idea != null ? les.ideas[r.idea] : null;
  return { unit, where: [unit && unit.title, idea && idea.title].filter(Boolean).join(' · ') };
}
function reportText(r) {
  const t = reportTarget(r), k = r.cardId && S.cards[r.cardId];
  return `${r.kind === 'issue' ? 'Possible error in my source' : r.kind === 'flag' ? 'Self-check flag' : 'My report'} (${r.reason})${t.where ? ` on ${t.where}` : ''}\n${r.text || ''}${r.quote ? `\nSource says: "${r.quote}"` : ''}${k ? `\nQuestion: ${k.prompt}\nModel answer: ${k.answer}` : ''}`;
}
VIEWS.reports = () => {
  const tab = ui('repTab', 'open');
  const flagged = list('cards').filter(c => c.status === 'flagged'), all = list('reports').sort((a, b) => b.createdAt - a.createdAt);
  const shown = all.filter(r => r.status === tab), openN = all.filter(r => r.status === 'open').length + flagged.length;
  return `<div class="stack-lg"><h1>Progress</h1>${progressTabs('reports')}<div class="row between"><h2>Reports</h2>${tab === 'open' && openN ? '<button class="btn sm" data-act="rep-copy">Copy all for a chat</button>' : ''}</div>
  <p class="muted">Items the self-check pass flagged wait here for your approval. Source problems and your own reports are listed too.</p>
  ${seg('repTab', [['open', `Open (${openN})`], ['resolved', `Resolved (${all.length - (openN - flagged.length)})`]], tab)}
  ${tab === 'open' && flagged.length ? `<div class="stack"><h2>Cards waiting for approval</h2>${flagged.map(c => `<div class="qcard"><div class="meta">${chip(TYPE_LABEL[c.type])}${chip((S.units[c.unitId] || {}).title || '')}${c.origin === 'added' ? chip('Added by Claude', 'added') : ''}</div><div class="flag small"><b>Self-check:</b> ${esc(c.flag || 'Flagged')}</div><div class="qprompt">${inline(c.prompt)}</div><div class="answer-box"><span class="lbl">Model answer</span><div class="body small">${paras(c.answer)}</div></div>
    <div class="row"><button class="btn sm primary" data-act="card-approve" data-id="${c.id}">Approve</button><button class="btn sm" data-act="card-edit" data-id="${c.id}">Edit</button><button class="btn sm ghost" data-act="card-retire" data-id="${c.id}">Discard</button></div></div>`).join('')}</div>` : ''}
  ${shown.length ? `<div class="stack">${shown.map(r => { const t = reportTarget(r), k = r.cardId && S.cards[r.cardId]; return `<div class="panel stack tight"><div class="row between"><div class="row">${chip(r.kind === 'issue' ? 'Your source may be wrong' : r.kind === 'flag' ? 'Self-check flag' : 'Your report', r.kind === 'issue' ? 'due' : r.kind === 'flag' ? 'added' : 'accent')}${chip(r.reason || '')}</div><span class="small muted">${new Date(num(r.createdAt)).toLocaleDateString()}</span></div>
    ${t.where ? `<div class="small muted">${esc(t.where)}</div>` : ''}<div>${esc(r.text || 'No note.')}</div>${r.quote ? `<div class="quote small">“${esc(r.quote)}”</div>` : ''}${k ? `<div class="small"><b>Card:</b> ${esc(cut(k.prompt, 200))}</div>` : ''}
    <div class="row">${r.lessonId ? `<a class="btn sm" href="#learn-${esc(r.lessonId)}">Open the lesson</a>` : ''}${k ? `<button class="btn sm" data-act="card-edit" data-id="${esc(r.cardId)}">Edit card</button>${k.status !== 'retired' ? `<button class="btn sm ghost" data-act="card-retire" data-id="${esc(r.cardId)}">Retire card</button>` : ''}` : ''}<button class="btn sm ${r.status === 'open' ? 'primary' : ''}" data-act="rep-toggle" data-id="${r.id}">${r.status === 'open' ? 'Mark resolved' : 'Reopen'}</button></div></div>`; }).join('')}</div>` : tab === 'resolved' || !flagged.length ? emptyBox(tab === 'open' ? 'Nothing open. Use "Report" on any item or lesson.' : 'Nothing resolved yet.') : ''}${deletedHtml()}</div>`;
};
MODALS.cardedit = d => { const c = S.cards[d.id]; if (!c) return '<p>This card was removed.</p>'; const tb = c.type === 'teachback', e = ui('ce', () => ({ prompt: c.prompt, answer: c.answer, explanation: c.explanation || '', rubric: (c.rubric || []).join('\n') }));
  return `<h2>${tb ? 'Edit this idea\'s explain-back' : 'Edit card'}</h2><p class="small muted">Your edits replace this card for you. ${c.orig ? 'You can reset it to the original any time.' : 'The original is kept so you can reset it.'}</p>${tb ? '' : field('Question', areaIn('ce.prompt', e.prompt, 3))}${field(tb ? 'What the idea says' : 'Model answer', areaIn('ce.answer', e.answer, 4))}${field((tb ? 'Key points your explanation is scored against' : 'Key points a good answer includes') + ', one per line', areaIn('ce.rubric', e.rubric, 4))}${tb ? '' : field('Explanation shown on a miss', areaIn('ce.explanation', e.explanation, 2))}
  <div class="row between"><span class="row">${c.orig ? `<button type="button" class="linkbtn small" data-act="card-reset" data-id="${esc(d.id)}">Reset to original</button>` : ''}<button type="button" class="linkbtn small" data-act="card-delete" data-id="${esc(d.id)}">Delete</button></span><span class="row"><button class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" data-act="card-save" data-id="${esc(d.id)}">Save</button></span></div>`; };
MODALS.cardnew = d => { const e = ui('cn', () => ({ type: 'flash', prompt: '', answer: '', uid: d.uid || '' })), us = !d.lid && d.cid ? unitsOf(d.cid) : [];
  return `<h2>New card</h2><p class="small muted">Your own question. It joins your review today.</p><div class="field"><span>Kind</span>${seg('cn.type', [['flash', 'Flashcard'], ['short', 'Short answer']], e.type)}</div>
  ${us.length ? `<label class="field"><span>Module</span><select id="f-cn-uid" data-bind="cn.uid">${us.map(u => `<option value="${u.id}" ${e.uid === u.id ? 'selected' : ''}>${esc(u.title)}</option>`).join('')}</select></label>` : ''}${field('Question', areaIn('cn.prompt', e.prompt, 3))}${field('Answer', areaIn('cn.answer', e.answer, 4))}
  <div class="row end"><button class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" data-act="card-new-save">Add card</button></div>`; };
function deletedHtml() {
  const gone = list('cards').filter(c => c.status === 'retired' && !c.removedWithTopic).sort((a, b) => num(b.deletedAt) - num(a.deletedAt)); if (!gone.length) return '';
  const open = ui('showDeleted', false);
  return `<div class="stack"><button type="button" class="btn ghost nbgroup" data-act="toggle" data-key="showDeleted" aria-expanded="${!!open}"><b>Deleted questions</b><span class="muted">${gone.length} · ${open ? 'Hide' : 'Show'}</span></button>
  ${open ? gone.slice(0, 80).map(c => `<div class="panel stack tight"><div class="row">${chip(TYPE_LABEL[c.type] || 'Card')}${chip((S.units[c.unitId] || {}).title || '')}</div><div class="small">${inline(cut(c.type === 'teachback' ? c.ideaTitle || c.prompt : c.prompt, 260))}</div><div class="row"><button class="btn sm" data-act="card-restore" data-id="${esc(c.id)}">Restore</button><button class="linkbtn small" data-act="card-purge" data-id="${esc(c.id)}">Delete forever</button></div></div>`).join('') : ''}</div>`;
}
async function unlockIfLearned(id) { const c = S.cards[id], tb = c && S.cards[c.tbId]; if (c && c.status === 'active' && !(c.fsrs && c.fsrs.due) && (!tb || tb.firstScore != null)) await put('cards', id, Object.assign({}, c, { fsrs: Object.assign(L.newFsrs(), c.fsrs, { due: L.addDays(today(), 1) }) })).catch(() => { }); }
Object.assign(ACT, {
  'card-approve': async el => { await patch('cards', el.dataset.id, { status: 'active', flag: '' }).catch(() => { }); await unlockIfLearned(el.dataset.id); toast('Approved. It joins your review.'); render(); },
  'card-retire': async el => { await patch('cards', el.dataset.id, { status: 'retired', deletedAt: Date.now() }).catch(() => { }); toast('Removed from review. Restore it under Deleted questions.'); render(); },
  'card-delete': el => { const id = el.dataset.id, c = S.cards[id]; if (!c) return;
    confirmBox('Delete this question?', (c.type === 'teachback' ? 'The idea leaves review and stops counting toward passing its module. ' : 'It leaves review. ') + 'You can restore it under Progress, Reports, Deleted questions.', 'Delete', async () => {
      await patch('cards', id, { status: 'retired', deletedAt: Date.now() }).catch(() => { }); UI.modal = null; delete UI.ce; toast('Deleted. Restore it under Progress, then Reports.');
      const it = typeof curItem === 'function' ? curItem() : null;
      if (S.route === 'review' && it && it.cardId === id && S.session) await afterItem(null, { skipped: true }); else { if (c.unitId) await checkUnitPass(c.unitId); render(); }
    }); },
  'card-restore': async el => { const id = el.dataset.id; await patch('cards', id, { status: 'active', deletedAt: null }).catch(() => { }); await unlockIfLearned(id); toast('Restored. It is back in review.'); render(); },
  'card-purge': el => confirmBox('Delete this question forever?', 'This removes it and its review history. It cannot be undone.', 'Delete forever', async () => { await drop('cards', el.dataset.id).catch(() => { }); UI.modal = null; render(); }),
  'card-reset': async el => { const c = S.cards[el.dataset.id]; if (!c || !c.orig) return; const next = Object.assign({}, c, c.orig, { editedAt: null }); delete next.orig; await put('cards', el.dataset.id, next).catch(() => { }); delete UI.ce; UI.modal = null; toast('Back to the original.'); render(); },
  'card-new': el => { delete UI.cn; const lid = el.dataset.lid || ''; let cid = el.dataset.cid || '', uid = '', ideaId = '';
    if (lid) { const m = /^(.+)L(\d+)$/.exec(lid), u = m && S.units[m[1]]; if (!u) return; uid = m[1]; cid = u.courseId; const les = S.lessons[lid], i = les && les.ideas[+el.dataset.i]; ideaId = i ? i.id : ''; }
    if (!S.courses[cid]) return; openModal('cardnew', { cid, uid, lid, ideaId }); },
  'card-new-save': async () => {
    const d = (UI.modal && UI.modal.data) || {}, e = UI.cn; if (!e || !S.courses[d.cid]) return;
    const prompt = L.str(e.prompt, 2000), answer = L.str(e.answer, 2500);
    if (!prompt || !answer) { toast('Write a question and an answer first.', true); return; }
    const uid = d.uid || (S.units[e.uid] && S.units[e.uid].courseId === d.cid ? e.uid : (unitsOf(d.cid)[0] || {}).id) || null, tb = d.ideaId ? S.cards[d.ideaId + 't'] : null;
    try { await put('cards', L.uid('k'), L.newCard({ type: e.type === 'short' ? 'short' : 'flash', prompt, answer, rubric: [], explanation: '', origin: 'mine', custom: true, courseId: d.cid, unitId: uid, lessonId: d.lid || null, ideaId: d.ideaId || null, ideaTitle: tb ? tb.ideaTitle : '', tbId: tb ? d.ideaId + 't' : null, createdAt: Date.now(), fsrs: Object.assign(L.newFsrs(), { due: today() }) })); } catch (err) { toast('The card could not be saved.', true); return; }
    delete UI.cn; UI.modal = null; toast('Card added. It is in today\'s review.'); render();
  },
  'card-edit': el => { delete UI.ce; openModal('cardedit', { id: el.dataset.id }); },
  'card-save': async el => {
    const c = S.cards[el.dataset.id], e = UI.ce; if (!c || !e) return;
    const answer = L.str(e.answer, 2500), prompt = c.type === 'teachback' ? c.prompt : L.str(e.prompt, 2000);
    if (!answer || !prompt) { toast('The question and the answer can\'t be empty.', true); return; }
    let rubric = String(e.rubric == null ? (c.rubric || []).join('\n') : e.rubric).split('\n').map(x => L.str(x, 300)).filter(Boolean).slice(0, 6);
    if (c.type === 'teachback' && rubric.length < 2) { toast('An explain-back needs at least two key points.', true); return; }
    /* The first edit keeps the original so it can be reset. */
    const orig = c.orig || { prompt: c.prompt, answer: c.answer, explanation: c.explanation || '', rubric: c.rubric || [] };
    await put('cards', el.dataset.id, Object.assign({}, c, { prompt, answer, rubric, orig, explanation: c.type === 'teachback' ? c.explanation : L.str(e.explanation, 1200), status: c.status === 'flagged' ? 'active' : c.status, flag: '', editedAt: Date.now() })).catch(() => { });
    await unlockIfLearned(el.dataset.id); delete UI.ce; UI.modal = null; toast('Saved.'); render();
  },
  'rep-toggle': el => { const r = S.reports[el.dataset.id]; if (r) patch('reports', el.dataset.id, { status: r.status === 'open' ? 'resolved' : 'open', resolvedAt: Date.now() }).catch(() => { }); render(); },
  'rep-copy': () => {
    const flagged = list('cards').filter(c => c.status === 'flagged').map(c => `Self-check flag on a card: ${c.flag}\nQuestion: ${c.prompt}\nModel answer: ${c.answer}`);
    const txt = flagged.concat(list('reports').filter(r => r.status === 'open').map(reportText)).join('\n\n---\n\n');
    openModal('copybox', { title: 'Open reports', note: 'Paste this into a chat with Claude for a second look.', text: 'Please review these flagged items from my Context Window study app and suggest fixes:\n\n' + txt });
  }
});

/* ---------- Progress: weekly report, stats, badges ---------- */
function progressTabs(tab) { const n = openReportCount(); return `<div class="seg scroll" role="group">${[['weekly', 'This week'], ['stats', 'Stats'], ['notebook', 'Mistakes'], ['reports', 'Reports' + (n ? ` (${n})` : '')], ['badges', 'Badges']].map(([k, l]) => `<a href="#${k}" class="segbtn" aria-current="${tab === k ? 'page' : 'false'}">${l}</a>`).join('')}</div>`; }
function progressShell(tab, body) { return `<div class="stack-lg"><h1>Progress</h1>${progressTabs(tab)}${body}</div>`; }
function weeklyNumbers() {
  const m = metaMain(), t = today(), w = L.weekSummary(m.days, t), cs = courseList().filter(c => c.status === 'active');
  const cards = list('cards').filter(c => c.status !== 'retired');
  return { m, w, cs, cards, streak: currentStreak(), weak: L.weakestIdeas(cards, 5), byCourse: L.accuracyBy(cards, 'courseId'), byUnit: L.accuracyBy(cards, 'unitId') };
}
VIEWS.weekly = () => {
  const x = weeklyNumbers(), maxM = Math.max(1, ...x.w.perDay.map(d => d.minutes));
  return progressShell('weekly', `<div class="grid"><div class="panel"><span class="eyebrow">Time studied, last 7 days</span><div class="stat-big num">${Math.round(x.w.minutes)}<small> min</small></div><div class="small muted">${plural(x.w.daysStudied, 'day')} studied · ${x.w.units} review units</div></div>
    <div class="panel"><span class="eyebrow">Streak</span><div class="stat-big num">${x.streak}<small> ${x.streak === 1 ? 'day' : 'days'}</small></div><div class="small muted">Best ${num(x.m.stats.bestStreak) || x.streak}. Rest days don't break it.</div></div>
    <div class="panel"><span class="eyebrow">XP this week</span><div class="stat-big num">${x.w.xp}</div><div class="small muted">${x.m.xp || 0} in total</div></div></div>
  <div class="panel stack"><h3>Minutes per day</h3><div class="forecast" role="img" aria-label="Minutes studied on each of the last 7 days">${x.w.perDay.map(d => `<div><b class="num">${Math.round(d.minutes)}</b><i class="${d.done ? 'done' : ''}" style="height:${Math.round(78 * d.minutes / maxM)}%"></i><span>${new Date(d.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short' })}</span></div>`).join('')}</div><span class="small muted">Solid bars are days you finished your review.</span></div>
  <div class="grid-2"><div class="panel stack"><h3>Accuracy by course and unit</h3>${x.cs.length ? x.cs.map(c => { const a = x.byCourse[c.id] || {}; return `<div class="stack tight"><div class="hbar"><b class="lbl">${esc(c.title)}</b>${bar(a.pct || 0, 'good')}<span class="num small">${a.pct == null ? 'no data' : a.pct + '%'}</span></div>${unitsOf(c.id).filter(u => (x.byUnit[u.id] || {}).n).map(u => { const b = x.byUnit[u.id]; return `<div class="hbar sub"><span class="lbl">${esc(u.title)}</span>${bar(b.pct, b.pct < 70 ? 'due' : 'good')}<span class="num small">${b.pct}% · ${b.n}</span></div>`; }).join('')}</div>`; }).join('') : '<p class="small muted">No active courses.</p>'}<span class="small muted">Bars run 0 to 100%. The number after the dot is how many answers it is based on. Guesses count as misses.</span></div>
  <div class="stack"><div class="panel stack"><h3>Weakest ideas</h3>${x.weak.length ? `<div class="list">${x.weak.map(i => { const tb = list('cards').find(k => k.ideaId === i.ideaId && k.type === 'teachback'); return `<div class="row between"><span class="grow">${esc(i.title || 'Idea')}<br><span class="small muted">${esc((S.units[i.unitId] || {}).title || '')}</span></span>${tb ? `<a class="btn sm" href="#learn-${esc(tb.lessonId)}">Re-read</a>` : ''}</div>`; }).join('')}</div><p class="small"><b>Suggested focus:</b> re-read ${x.weak.length === 1 ? 'this idea' : 'the top ' + Math.min(3, x.weak.length)} and explain ${x.weak.length === 1 ? 'it' : 'them'} back before new lessons.</p>` : '<p class="small muted">Nothing stands out as weak yet.</p>'}</div>
    <div class="panel stack"><h3>Deadline pace</h3>${x.cs.length ? `<div class="list">${x.cs.map(c => { const p = coursePace(c); return `<div class="row between"><span class="grow">${esc(c.title)}${p.mode === 'deadline' && p.status !== 'done' ? `<br><span class="small muted">${p.lessonsLeft} lessons left · ${plural(p.lessonsPerDay, 'lesson')} a day needed</span>` : ''}</span>${paceChip(c)}</div>`; }).join('')}</div>` : '<p class="small muted">No active courses.</p>'}</div></div></div>
  <div class="panel stack"><div class="row between"><h3>Summary</h3>${aiOn() ? `<button class="btn sm" data-act="weekly-ai" ${isBusy('weekly') ? 'disabled' : ''}>${UI.weeklyAI ? 'Rewrite' : 'Summarize my week'}</button>` : ''}</div>${busyHtml('weekly')}${UI.weeklyAI ? `<p>${esc(UI.weeklyAI.summary)}</p>${UI.weeklyAI.focus.length ? `<ul class="tightlist">${UI.weeklyAI.focus.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}` : '<p class="small muted">Optional: Claude turns the numbers above into a short plain summary.</p>'}</div>`);
};
ACT['weekly-ai'] = async () => {
  const x = weeklyNumbers();
  const stats = { minutes: Math.round(x.w.minutes), daysStudied: x.w.daysStudied, reviewUnits: x.w.units, streak: x.streak, courses: x.cs.map(c => { const p = coursePace(c), a = x.byCourse[c.id] || {}; return { title: c.title, accuracyPercent: a.pct, pace: p.mode === 'deadline' ? p.status : 'self-paced', daysLeft: p.daysLeft, lessonsLeft: p.lessonsLeft }; }), weakestIdeas: x.weak.map(i => i.title) };
  const r = await task('weekly', 'Summarizing…', signal => ai(P.weekly({ stats }), { signal, tier: 'quick' }));
  if (r) { UI.weeklyAI = { summary: L.str(r.summary, 1200), focus: L.arr(r.focus, 4).map(f => L.str(f, 300)).filter(Boolean) }; render(); }
};
VIEWS.stats = () => {
  const m = metaMain(), cards = list('cards').filter(c => c.status === 'active'), t = today();
  const fc = L.forecast(cards, t, 7), maxF = Math.max(1, ...fc.map(f => f.units));
  const n = cards.reduce((s, c) => s + ((c.attempts || {}).n || 0), 0), ok = cards.reduce((s, c) => s + ((c.attempts || {}).correct || 0), 0);
  const missed = cards.filter(c => c.misses).sort((a, b) => b.misses - a.misses).slice(0, 6), tests = list('tests').sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 6);
  const byType = k => cards.filter(c => c.type === k).length;
  return progressShell('stats', `<div class="grid"><div class="panel"><span class="eyebrow">Level ${L.level(m.xp)}</span><div class="stat-big num">${m.xp || 0}<small> XP</small></div><div class="small muted">Teach-backs and tests earn the most. A guess earns none.</div></div>
    <div class="panel"><span class="eyebrow">Cards in review</span><div class="stat-big num">${cards.length}</div><div class="small muted">${byType('teachback')} teach-back · ${byType('apply')} apply-it · ${byType('short')} short · ${byType('flash')} flash</div></div>
    <div class="panel"><span class="eyebrow">Overall accuracy</span><div class="stat-big num">${n ? Math.round(100 * ok / n) + '%' : '–'}</div><div class="small muted">${n} answers. ${cards.filter(c => c.mastered).length} cards marked mastered.</div></div></div>
  <div class="grid-2"><div class="panel stack"><h3>Due over the next 7 days</h3><div class="forecast" role="img" aria-label="Review units due on each of the next 7 days">${fc.map((f, i) => `<div><b class="num">${f.units}</b><i style="height:${Math.round(78 * f.units / maxF)}%"></i><span>${i ? new Date(f.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short' }) : 'Today'}</span></div>`).join('')}</div><span class="small muted">Units, before the ${L.CAP}-unit daily cap. Today includes anything overdue.</span></div>
  <div class="panel stack"><h3>Most missed</h3>${missed.length ? `<div class="list">${missed.map(c => `<div class="small">${chip(plural(num(c.misses), 'miss', 'misses'), 'bad')}${c.leech ? chip('Leech', 'bad') : ''} ${esc(cut(c.type === 'teachback' ? c.ideaTitle : c.prompt, 140))}</div>`).join('')}</div>` : '<p class="small muted">Nothing missed yet.</p>'}</div></div>
  <div class="panel stack"><h3>Practice tests</h3>${tests.length ? `<div class="list">${tests.map(x => `<div class="row between"><span>${new Date(num(x.finishedAt)).toLocaleDateString()} · ${esc((S.courses[x.courseId] || {}).title || 'Course')} · ${x.kind === 'full' ? 'Full simulation' : 'Quick test'}</span><span class="num">${num(x.percent)}%</span></div>`).join('')}</div>` : '<p class="small muted">No tests taken yet.</p>'}</div>`);
};
VIEWS.badges = () => {
  const m = metaMain();
  return progressShell('badges', `<div class="grid badges">${L.BADGES.map(b => { const got = m.badges[b.id]; return `<div class="badge ${got ? 'earned' : 'locked'}"><span class="medal">${icon(b.icon)}</span><b>${esc(b.name)}</b><span class="small muted">${esc(b.desc)}</span>${got ? chip('Earned ' + got, 'good') : chip('Locked')}</div>`; }).join('')}</div>`);
};
VIEWS.progress = () => VIEWS.weekly();

/* ---------- Today ---------- */
VIEWS.home = () => {
  const cs = courseList(), active = cs.filter(c => c.status === 'active'), m = metaMain(), d = dayRec(), q = todayPlan(), streak = currentStreak();
  const inbox = inboxGroups().length, open = openReportCount(), extra = todayPlan({ cap: L.EXTRA, used: d.extra, restDay: false });
  if (!cs.length) return `<div class="reader stack-lg hero"><div class="stack"><span class="eyebrow">Context Window</span><h1>Paste what you learned. Explain it back. Keep it.</h1><p class="muted lead">Add anything you are learning: lesson text, your notes, or a whole AI chat with its feedback. Claude files it into a course, has you explain each idea back, and brings it round again in a short daily review.</p></div>
    ${renderVisual({ type: 'flow', steps: [{ label: 'Paste what you learned', detail: 'Notes, lessons, chats, feedback' }, { label: 'Check the plan', detail: 'Claude files it by module and topic' }, { label: 'Explain it back', detail: 'One idea at a time' }, { label: 'Daily review', detail: '20 units a day at most' }] })}
    <div class="row"><a class="btn primary" href="#add">Add your first learning</a><a class="btn ghost" href="#newcourse">Or set up a course first</a>${inbox ? chip(plural(inbox, 'item') + ' waiting from chat', 'accent') : ''}</div></div>`;
  const weak = L.weakestIdeas(list('cards'), 3), setup = cs.filter(c => c.status !== 'active');
  return `<div class="stack-lg"><div class="row between"><div><span class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span><h1>Today</h1></div><span class="small muted num">${plural(streak, 'day')} streak · ${m.xp} XP</span></div>
  <div class="grid-2"><div class="stack">
    <div class="panel stack due-panel"><div class="row between"><div><span class="eyebrow">Daily review</span><div class="stat-big num">${q.restDay ? 'Rest day' : q.items.length}<small>${q.restDay ? '' : (q.items.length === 1 ? ' card due' : ' cards due') + (q.unitsPlanned ? ' · about ' + q.unitsPlanned + ' min' : '')}</small></div></div>
      ${q.items.length ? `<button class="btn primary" data-act="review-start">Start review</button>` : d.done ? chip('Done for today', 'good') : q.restDay ? `<a class="btn" href="#review">Options</a>` : chip('Nothing due', 'good')}</div>
      ${meter(Math.min(d.units, L.CAP), q.unitsPlanned)}<div class="small muted">${d.units} of today's ${L.CAP} review units used.${q.backlog && !q.restDay ? ` ${plural(q.backlog, 'more item')} wait for tomorrow.` : ''}${q.restDay ? ' Due items roll to tomorrow and your streak is safe.' : ''}</div>
      ${!q.items.length && !q.restDay && extra.items.length ? `<div class="row"><button class="btn sm" data-act="review-extra">Do ${Math.min(L.EXTRA, extra.unitsPlanned)} more units</button><span class="small muted">Optional. Doesn't affect your streak.</span></div>` : ''}</div>
    <div class="panel row between"><div class="grow"><b>Learned something new?</b><div class="small muted">Paste it and Claude files it into the right course.</div></div><a class="btn" href="#add">${icon('plus')}<span>Add learning</span></a></div>
    <div class="stack tight"><h2>Keep learning</h2>${active.length ? `<div class="panel list">${active.map(c => { const nx = nextLesson(c.id), p = coursePace(c); return `<div class="row between"><div class="grow"><a class="title-link" href="#course-${c.id}"><b>${esc(c.title)}</b></a>
        <div class="small muted">${p.mode === 'deadline' && p.status !== 'done' && p.status !== 'past' ? `Today: ${plural(p.lessonsPerDay, 'lesson')}, about ${p.minutesNeeded} min. ` : ''}${nx ? 'Next: ' + esc(cut((nx.lid && ((nx.unit.lessons || [])[+nx.lid.split('L').pop()] || {}).title) || nx.unit.title, 60)) : unitsOf(c.id).length ? 'Every topic done' : 'Empty so far'}${p.cramSuggested && !c.cram ? ' · cram mode suggested' : ''}</div></div>
        ${nx && !nx.build ? `<a class="btn sm primary" href="#learn-${nx.lid}">Continue</a>` : `<a class="btn sm" href="#course-${c.id}">Open</a>`}</div>`; }).join('')}</div>` : '<p class="small muted">No active course yet.</p>'}
      ${setup.length ? `<div class="panel list">${setup.map(c => `<div class="row between"><span class="grow">${esc(c.title)}</span><a class="btn sm" href="#course-${c.id}">Finish setup</a></div>`).join('')}</div>` : ''}</div>
  </div><div class="stack">
    ${feedbackRow('', true)}
    ${weak.length ? `<div class="panel stack"><h3>Ideas you keep missing</h3><div class="list">${weak.map(i => `<div><b>${esc(i.title || 'Idea')}</b><div class="small muted">${esc((S.units[i.unitId] || {}).title || '')}</div></div>`).join('')}</div><a class="small" href="#notebook">Open the mistake notebook</a></div>` : ''}
    ${inbox ? `<div class="panel row between"><div class="grow"><b>${plural(inbox, 'item')} from chat</b><div class="small muted">Waiting under Add learning, "From chat".</div></div><a class="btn sm" href="#add">Open</a></div>` : ''}
    ${open ? `<div class="panel row between"><div class="grow"><b>${plural(open, 'flagged item')}</b><div class="small muted">Waiting for your look.</div></div><a class="btn sm" href="#reports">Reports</a></div>` : ''}
  </div></div></div>`;
};

/* ---------- More and Settings ---------- */
VIEWS.more = () => VIEWS.weekly();
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
VIEWS.prefs = () => {
  const g = settingsFor(), bk = ui('bk', () => ({ erase: false, file: null, note: '' }));
  return `<div class="reader stack-lg">${backLink('home', 'Today')}<div class="stack"><h1>Settings</h1><p class="muted">Defaults for every course. A course can override strictness, probing and retention under its More tools, Course options.</p></div>
  <div class="panel stack"><h3>Teach-back</h3>
    <div class="field"><span>Probing depth</span>${seg('probing', PROBING, g.probing, 'pref')}<span class="small muted">How many follow-up questions before scoring. Deep adds edge cases and "why" chains.</span></div>
    <div class="field"><span>Grading strictness</span>${seg('strictness', STRICTNESS, g.strictness, 'pref')}<span class="small muted">Pass mark for a unit: lenient 60, standard 70, strict 80.</span></div></div>
  <div class="panel stack"><h3>Model for building courses</h3><p class="small muted">Used when Claude files what you paste, writes lessons, runs the self-check and writes study guides. Grading, hints and the tutor keep the standard model so they stay quick.</p>
    ${modelPicker()}
    ${aiOn() ? `<div class="row"><button class="btn sm" data-act="model-test" ${isBusy('modeltest') ? 'disabled' : ''}>Test this choice</button>${UI.modelTest ? `<span class="small muted">${esc(UI.modelTest)}</span>` : ''}</div>${busyHtml('modeltest')}` : ''}</div>
  <div class="panel stack"><h3>Review schedule</h3>
    <div class="field"><span>Target retention</span>${seg('retention', [['0.85', '85%'], ['0.9', '90%'], ['0.93', '93%'], ['0.95', '95%']], String(g.retention), 'pref')}<span class="small muted">The chance you still remember a card when it comes due. Higher means more frequent reviews. The daily cap stays ${L.CAP} units, and the study day resets at 3 a.m.</span></div>
    <div class="field"><span>Weekly rest days</span><div class="seg" role="group">${DAYS.map((d, i) => `<button type="button" data-act="pref-rest" data-d="${i}" aria-pressed="${g.restDays.includes(i)}">${d}</button>`).join('')}</div><span class="small muted">Rest days don't break your streak. Their due cards roll to the next day.</span></div></div>
  <div class="panel stack"><h3>Voice</h3><p class="small muted">${S.tts ? 'Claude\'s voice is available here.' : Voice.canSpeak() ? 'Claude\'s voice isn\'t offered in this app or browser, so your device\'s built-in voice is used.' : 'No voice output is available in this view.'} ${S.dict ? 'The in-page mic is available.' : 'The in-page mic isn\'t offered here (it is absent in the Claude phone and desktop apps); use the mic key on your keyboard.'}</p>
    <div class="field"><span>Spoken follow-ups and tutor replies</span>${seg('voiceOn', [['true', 'On'], ['false', 'Muted']], String(g.voiceOn !== false), 'pref')}</div>
    ${S.tts ? `<div class="field"><span>Claude voice</span>${seg('voiceName', [['buttery', 'Buttery'], ['airy', 'Airy'], ['glassy', 'Glassy'], ['rounded', 'Rounded']], g.voiceName, 'pref')}</div>` : ''}
    <div class="field"><span>Speed</span>${seg('voiceRate', [['0.8', 'Slow'], ['1', 'Normal'], ['1.2', 'Fast'], ['1.4', 'Faster']], String(g.voiceRate), 'pref')}</div>
    ${Voice.canSpeak() ? `<div>${speakBtn('voice-test', 'Test the voice', 'This is how lessons and follow-up questions will sound.')}</div>` : ''}</div>
  <div class="panel stack"><h3>New courses</h3><div class="field"><span>Default syllabus sources</span>${[['outline', 'An official outline I paste'], ['own', 'My own material'], ['ai', 'Claude\'s knowledge fills gaps']].map(([k, l]) => `<label class="tick"><input type="checkbox" id="mix-${k}" data-act-change="pref-mix" data-k="${k}" ${g.mix[k] !== false ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
    <div class="field"><span>Material sources to offer</span>${[['paste', 'Paste'], ['vault', 'Obsidian vault'], ['drive', 'Google Drive'], ['notion', 'Notion']].map(([k, l]) => `<label class="tick"><input type="checkbox" id="src-${k}" data-act-change="pref-src" data-k="${k}" ${g.sources[k] !== false ? 'checked' : ''}><span>${l}${k !== 'paste' && (!S.mcp || S.conn[k] === 'off') ? ' <span class="muted">(not connected in this view)</span>' : ''}</span></label>`).join('')}<span class="small muted">Files, photos and chat hand-off are always offered.</span></div></div>
  <div class="panel stack"><h3>Backup</h3><p class="small muted">One file with every course, lesson, card, your progress and settings. Keep a copy somewhere safe.</p>
    <div class="row"><button class="btn" data-act="backup-make" ${isBusy('backup') ? 'disabled' : ''}>Back up everything</button></div>
    <div class="field"><span>Restore from a backup file</span><input type="file" id="bk-file" accept=".json,application/json" data-act-change="backup-file"></div>
    ${bk.file ? `<div class="flag stack tight"><b>${esc(bk.note)}</b><label class="tick"><input type="checkbox" id="bk-erase" data-bind="bk.erase" ${bk.erase ? 'checked' : ''}><span>Erase what is here first, so the page matches the backup exactly</span></label><span class="small">${bk.erase ? 'Everything not in the backup is deleted. This can\'t be undone.' : 'Items in the backup overwrite items with the same id. Everything else stays.'}</span><div class="row"><button class="btn primary" data-act="backup-restore" ${isBusy('backup') ? 'disabled' : ''}>Restore now</button><button class="btn ghost" data-act="backup-cancel">Cancel</button></div></div>` : bk.note ? `<div class="small muted">${esc(bk.note)}</div>` : ''}${busyHtml('backup')}</div>
  <div class="panel stack tight"><h3>Sharing and reminders</h3><p class="small">Your data is visible only to you. To stop the page itself opening for others, set sharing to private from the artifact's Share menu.</p><p class="small">A daily phone reminder is set up outside this page: ask Claude in a chat to schedule one at the time you want.</p></div></div>`;
};
function modelPicker() {
  const g = settingsFor(), cur = L.BUILD_MODELS.find(m => m.key === g.buildModel) || L.BUILD_MODELS[1];
  return `<div class="field"><span>Model</span>${seg('buildModel', L.BUILD_MODELS.map(m => [m.key, m.label]), g.buildModel, 'pref')}<span class="small muted">${esc(cur.hint)}</span></div>
    ${g.buildModel === 'other' ? field('Model id', `<input type="text" id="pref-model-id" value="${esc(g.buildModelId)}" maxlength="64" placeholder="claude-opus-5-5" data-act-change="pref-model-id" autocomplete="off" spellcheck="false">`, 'A Claude API model id, for example claude-sonnet-5-5. Use "Test this choice" in Settings to see which model actually answers.') : ''}`;
}
async function savePref(changes) { await put('settings', 'global', Object.assign({}, globalSettings(), changes)).catch(() => { }); render(); }
Object.assign(ACT, {
  'pref': el => { const k = el.dataset.key, v = el.dataset.val; if (k === 'buildModel') UI.modelTest = ''; savePref({ [k]: k === 'retention' || k === 'voiceRate' ? Number(v) : k === 'voiceOn' ? v === 'true' : v }); if (k === 'voiceOn' && v !== 'true') Voice.stop(); },
  'pref-model-id': el => { const v = el.value.trim().toLowerCase().slice(0, 64); UI.modelTest = ''; savePref({ buildModelId: v }); },
  'model-test': async () => {
    const g = settingsFor(), o = Object.assign({ cache: false }, L.modelOpts(g.buildModel, g.buildModelId));
    UI.modelTest = '';
    const r = await task('modeltest', 'Asking the model…', signal => S.sample('Reply with the single word OK.', Object.assign({ signal }, o)));
    if (r) { UI.modelTest = r.modelApplied ? `Answered by ${r.modelApplied}.` : `${o.model ? 'That model could not answer here, so the ' : 'Answered by the '}${{ quick: 'fast', default: 'balanced', complex: 'most capable' }[r.modelTierApplied] || 'standard'} tier ${o.model ? 'answered instead' : ''}.`.replace(' .', '.'); render(); }
  },
  'pref-rest': el => { const d = +el.dataset.d, cur = settingsFor().restDays; savePref({ restDays: cur.includes(d) ? cur.filter(x => x !== d) : cur.concat(d).sort() }); },
  'pref-mix': el => savePref({ mix: Object.assign({}, settingsFor().mix, { [el.dataset.k]: el.checked }) }),
  'pref-src': el => savePref({ sources: Object.assign({}, settingsFor().sources, { [el.dataset.k]: el.checked }) }),
  'backup-make': async () => {
    const data = await task('backup', 'Collecting your data…', async () => JSON.stringify(await buildBackup()));
    if (data) await offerFile('context-window-backup-' + today() + '.json', data, data.length > 400000 ? 'This backup is too large to copy by hand. Open the page in a browser on your computer to save it as a file.' : data);
  },
  'backup-file': async el => {
    const f = el.files && el.files[0], bk = UI.bk; if (!f) return;
    try { const obj = JSON.parse(await f.text()), ck = checkBackup(obj); if (!ck.ok) { bk.file = null; bk.note = ck.reason; } else { bk.file = obj; bk.note = `Backup from ${String(obj.exportedAt || '').slice(0, 10) || 'an unknown date'} with ${ck.count.toLocaleString()} items.`; } }
    catch (e) { bk.file = null; bk.note = 'That file couldn\'t be read as a backup.'; }
    render();
  },
  'backup-cancel': () => { UI.bk = { erase: false, file: null, note: '' }; render(); },
  'backup-restore': async () => {
    const bk = UI.bk; if (!bk.file) return;
    const n = await task('backup', 'Restoring…', async () => restoreBackup(bk.file, bk.erase, (done, total) => { if (S.busy.backup) { S.busy.backup.label = `Restoring ${done} of ${total}…`; const el = $('.status-line span:nth-child(2)'); if (el) el.textContent = S.busy.backup.label; } }));
    if (n != null) { UI.bk = { erase: false, file: null, note: `Restored ${n.toLocaleString()} items.` }; toast('Backup restored.'); render(); }
  }
});
