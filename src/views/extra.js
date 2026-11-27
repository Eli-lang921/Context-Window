/* Mind map, mistake notebook, study guide and audio recap, reports, progress (weekly report, stats, badges), home, settings. */
const LEVEL_LABEL = { new: 'Not started', weak: 'Weak', learning: 'Getting there', strong: 'Strong', mastered: 'Mastered' };
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/* ---------- Mind map ---------- */
VIEWS.map = cid => {
  const c = S.courses[cid]; if (!c) return emptyBox('This course no longer exists.');
  const us = unitsOf(cid), rows = [];
  for (const u of us) {
    const tb = tbCards(u.id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const ideas = tb.length ? tb.map(k => ({ id: k.ideaId, title: k.ideaTitle, level: L.ideaLevel(cardsOf('ideaId', k.ideaId)), lessonId: k.lessonId }))
      : (u.lessons || []).flatMap(l => l.ideas).slice(0, 8).map((t, i) => ({ id: null, title: t, level: 'new', planned: true }));
    rows.push({ u, ideas: ideas.length ? ideas : [{ id: null, title: 'Not planned yet', level: 'new', planned: true }] });
  }
  const RH = 34, W = 700; let y = 14; const parts = [];
  const node = (x, yy, w, text, cls, attrs, sub) => `<g class="mnode ${cls}" ${attrs}><rect x="${x}" y="${yy}" width="${w}" height="26" rx="13"/><text x="${x + 12}" y="${yy + 17}">${esc(cut(text, Math.floor(w / 7.2)))}</text>${sub ? `<title>${esc(sub)}</title>` : ''}</g>`;
  const mids = [];
  for (const r of rows) {
    const top = y, n = r.ideas.length, mid = top + (n * RH) / 2 - 17;
    const pct = r.ideas.filter(i => i.level === 'strong' || i.level === 'mastered').length;
    const ul = r.u.passedAt ? 'strong' : r.ideas.some(i => i.level === 'weak') ? 'weak' : r.ideas.some(i => i.level !== 'new') ? 'learning' : 'new';
    mids.push(mid + 13);
    r.ideas.forEach((i, k) => {
      const iy = top + k * RH;
      parts.push(`<path class="mlink" d="M370 ${mid + 13} C 400 ${mid + 13}, 400 ${iy + 13}, 430 ${iy + 13}"/>`);
      parts.push(node(430, iy, 260, i.title, 'lv-' + i.level + (i.planned ? ' planned' : '') + (UI.mapSel === i.id && i.id ? ' sel' : ''), i.id ? `data-act="map-sel" data-id="${esc(i.id)}" tabindex="0" role="button" aria-label="${esc(i.title)}: ${LEVEL_LABEL[i.level]}"` : '', `${i.title}: ${i.planned ? 'not built yet' : LEVEL_LABEL[i.level]}`));
    });
    parts.push(node(160, mid, 210, r.u.title, 'unit lv-' + ul + (UI.mapSel === r.u.id ? ' sel' : ''), `data-act="map-sel" data-id="${esc(r.u.id)}" tabindex="0" role="button" aria-label="Unit ${esc(r.u.title)}"`, `${r.u.title}: ${pct} of ${n} ideas strong`));
    y += n * RH + 12;
  }
  const H = Math.max(80, y + 6), cy = mids.length ? (mids[0] + mids[mids.length - 1]) / 2 : 40;
  const links = mids.map(m => `<path class="mlink" d="M130 ${cy} C 145 ${cy}, 145 ${m}, 160 ${m}"/>`).join('');
  const sel = UI.mapSel; let panel = '';
  if (sel && S.units[sel]) { const u = S.units[sel], up = unitProgress(Object.assign({ id: sel }, u)); panel = `<div class="panel stack tight"><span class="eyebrow">Unit</span><h3>${esc(u.title)}</h3><p class="small muted">${up.built ? `${up.done} of ${up.total} ideas explained back${up.avg != null ? ` · average ${up.avg}` : ''}` : 'Not built yet'}</p><div class="row">${up.built ? `<a class="btn sm primary" href="#learn-${sel}L0">Open first lesson</a><a class="btn sm" href="#guide-${sel}">Study guide</a>` : `<a class="btn sm primary" href="#course-${cid}">Build it from the course page</a>`}</div></div>`; }
  else if (sel) { const cs = cardsOf('ideaId', sel), tb = cs.find(k => k.type === 'teachback'); if (tb) panel = `<div class="panel stack tight"><span class="eyebrow">Idea · ${LEVEL_LABEL[L.ideaLevel(cs)]}</span><h3>${esc(tb.ideaTitle)}</h3><p class="small muted">${tb.lastScore == null ? 'Not explained back yet' : 'Last teach-back score ' + num(tb.lastScore)} · ${plural(cs.reduce((n, k) => n + (k.misses || 0), 0), 'miss', 'misses')}</p><div class="row"><a class="btn sm primary" href="#learn-${esc(tb.lessonId)}" data-ideajump="${esc(sel)}">Open the lesson</a>${cs.some(k => k.status === 'active' && k.fsrs && k.fsrs.reps) ? `<button class="btn sm" data-act="map-review" data-id="${esc(sel)}">Review this idea</button>` : ''}<button class="btn sm ghost" data-act="map-master" data-id="${esc(sel)}">${tb.mastered ? 'Un-master' : 'Mark mastered'}</button></div></div>`; }
  return `<div class="stack-lg">${backLink('course-' + cid, c.title)}<div class="stack"><h1>Mind map</h1><p class="muted">Every unit and idea, colored by how well you know it. Tap one to open its lesson or review it.</p></div>
  <div class="legend">${Object.entries(LEVEL_LABEL).map(([k, l]) => `<span class="lg lv-${k}"><i></i>${l}</span>`).join('')}</div>
  ${us.length ? `<div class="mapwrap"><svg class="mindmap" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="Course mind map">${links}${parts.filter(p => p.startsWith('<path')).join('')}${node(8, cy - 13, 122, c.title, 'root', '', c.title)}${parts.filter(p => !p.startsWith('<path')).join('')}</svg></div>` : emptyBox('No units yet.')}
  ${panel}</div>`;
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
  return `<div class="stack-lg"><h1>Progress</h1>${progressTabs('notebook')}<div class="stack"><h2>Mistake notebook</h2><p class="muted">Every miss, with why. Read it through before a test, or review the cards behind it.</p></div>
  ${cs.length > 1 ? seg('nbCourse', [['all', 'All courses']].concat(cs.map(c => [c.id, c.title])), f) : ''}
  ${shown.length ? `<div class="row">${reviewable.length ? `<button class="btn primary" data-act="nb-review">Review these ${plural(reviewable.length, 'card')}</button>` : ''}<button class="btn ghost" data-act="nb-clear">Clear this list</button></div>
  <div class="stack">${shown.slice(0, 120).map(m => `<div class="panel stack tight"><div class="row between"><div class="row">${chip({ review: 'Review', lesson: 'Lesson', test: 'Test', game: 'Game', cram: 'Cram', feedback: 'Tutor feedback' }[m.kind] || 'Review')}${m.guess ? chip('Guess', 'due') : ''}${m.ideaTitle ? chip(m.ideaTitle) : ''}</div><span class="small muted">${esc(m.day || '')}</span></div>
    <div class="qprompt small">${inline(m.prompt)}</div>${m.given ? `<div class="small"><b>You said:</b> ${esc(cut(m.given, 300))}</div>` : ''}${m.why ? `<div class="small"><b>Why it was a miss:</b> ${inline(m.why)}</div>` : ''}
    <div><button class="linkbtn small" data-act="nb-drop" data-id="${m.id}">Remove</button></div></div>`).join('')}</div>` : emptyBox('No misses logged. They appear here from review, lessons, tests, games and tutor feedback you paste.')}</div>`;
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
    const r = await task('guide-' + uid, 'Writing the cheat sheet…', signal => ai(P.guide({ course: S.courses[u.courseId], unit: u, ideas: unitIdeaBriefs(uid) }), { signal }));
    if (!r) return;
    const list5 = x => L.arr(x, 12).map(s => L.str(s, 400)).filter(Boolean);
    await patch('units', uid, { guide: { summary: L.str(r.summary, 800), mustKnow: list5(r.mustKnow), formulas: list5(r.formulas), pitfalls: list5(r.pitfalls) } }).catch(() => { }); render();
  },
  'recap-make': async el => {
    const uid = el.dataset.uid, u = S.units[uid];
    const r = await task('guide-' + uid, 'Writing the audio recap…', signal => ai(P.recap({ course: S.courses[u.courseId], unit: u, ideas: unitIdeaBriefs(uid) }), { signal }));
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
    <div class="row">${r.lessonId ? `<a class="btn sm" href="#learn-${esc(r.lessonId)}">Open the lesson</a>` : ''}${k ? `<button class="btn sm" data-act="card-edit" data-id="${esc(r.cardId)}">Edit card</button>${k.status !== 'retired' ? `<button class="btn sm ghost" data-act="card-retire" data-id="${esc(r.cardId)}">Retire card</button>` : ''}` : ''}<button class="btn sm ${r.status === 'open' ? 'primary' : ''}" data-act="rep-toggle" data-id="${r.id}">${r.status === 'open' ? 'Mark resolved' : 'Reopen'}</button></div></div>`; }).join('')}</div>` : tab === 'resolved' || !flagged.length ? emptyBox(tab === 'open' ? 'Nothing open. Use "Report" on any item or lesson.' : 'Nothing resolved yet.') : ''}</div>`;
};
MODALS.cardedit = d => { const c = S.cards[d.id]; if (!c) return '<p>This card was removed.</p>'; const e = ui('ce', () => ({ prompt: c.prompt, answer: c.answer, explanation: c.explanation || '' }));
  return `<h2>Edit card</h2>${c.type === 'teachback' ? '' : field('Question', areaIn('ce.prompt', e.prompt, 3))}${field(c.type === 'teachback' ? 'What the idea says' : 'Model answer', areaIn('ce.answer', e.answer, 4))}${c.type === 'teachback' ? '' : field('Explanation shown on a miss', areaIn('ce.explanation', e.explanation, 2))}<div class="row end"><button class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" data-act="card-save" data-id="${esc(d.id)}">Save</button></div>`; };
async function unlockIfLearned(id) { const c = S.cards[id], tb = c && S.cards[c.tbId]; if (c && c.status === 'active' && !(c.fsrs && c.fsrs.due) && (!tb || tb.firstScore != null)) await put('cards', id, Object.assign({}, c, { fsrs: Object.assign(L.newFsrs(), c.fsrs, { due: L.addDays(today(), 1) }) })).catch(() => { }); }
Object.assign(ACT, {
  'card-approve': async el => { await patch('cards', el.dataset.id, { status: 'active', flag: '' }).catch(() => { }); await unlockIfLearned(el.dataset.id); toast('Approved. It joins your review.'); render(); },
  'card-retire': async el => { await patch('cards', el.dataset.id, { status: 'retired' }).catch(() => { }); toast('Removed from review.'); render(); },
  'card-edit': el => { delete UI.ce; openModal('cardedit', { id: el.dataset.id }); },
  'card-save': async el => {
    const c = S.cards[el.dataset.id], e = UI.ce; if (!c || !e) return;
    const answer = L.str(e.answer, 2500), prompt = c.type === 'teachback' ? c.prompt : L.str(e.prompt, 2000);
    if (!answer || !prompt) { toast('The question and the answer can\'t be empty.', true); return; }
    await put('cards', el.dataset.id, Object.assign({}, c, { prompt, answer, explanation: L.str(e.explanation, 1200), status: c.status === 'flagged' ? 'active' : c.status, flag: '', editedAt: Date.now() })).catch(() => { });
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
  <div class="panel stack"><h3>Minutes per day</h3><div class="forecast" role="img" aria-label="Minutes studied on each of the last 7 days">${x.w.perDay.map(d => `<div><b class="num">${Math.round(d.minutes)}</b><i class="${d.done ? 'done' : ''}" style="height:${Math.round(78 * d.minutes / maxM)}%"></i><span>${new Date(d.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short' })}</span></div>`).join('')}</div><span class="small muted">Darker bars are days you finished your review.</span></div>
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
    <div class="panel stack due-panel"><div class="row between"><div><span class="eyebrow">Daily review</span><div class="stat-big num">${q.restDay ? 'Rest day' : q.unitsPlanned}<small>${q.restDay ? '' : ' units · ' + plural(q.items.length, 'item')}</small></div></div>
      ${q.items.length ? `<button class="btn primary" data-act="review-start">Start review</button>` : d.done ? chip('Done for today', 'good') : q.restDay ? `<a class="btn" href="#review">Options</a>` : chip('Nothing due', 'good')}</div>
      ${meter(Math.min(d.units, L.CAP), q.unitsPlanned)}<div class="small muted">${d.units} of ${L.CAP} units used today.${q.backlog && !q.restDay ? ` ${plural(q.backlog, 'more item')} wait for tomorrow.` : ''}${q.restDay ? ' Due items roll to tomorrow and your streak is safe.' : ''}</div>
      ${!q.items.length && !q.restDay && extra.items.length ? `<div class="row"><button class="btn sm" data-act="review-extra">Do ${Math.min(L.EXTRA, extra.unitsPlanned)} more units</button><span class="small muted">Optional. Doesn't affect your streak.</span></div>` : ''}</div>
    <div class="panel row between"><div class="grow"><b>Learned something new?</b><div class="small muted">Paste it and Claude files it into the right course.</div></div><a class="btn" href="#add">${icon('plus')}<span>Add learning</span></a></div>
    <div class="stack tight"><h2>Keep learning</h2>${active.length ? `<div class="panel list">${active.map(c => { const nx = nextLesson(c.id), p = coursePace(c); return `<div class="row between"><div class="grow"><a class="title-link" href="#course-${c.id}"><b>${esc(c.title)}</b></a>
        <div class="small muted">${p.mode === 'deadline' && p.status !== 'done' && p.status !== 'past' ? `Today: ${plural(p.lessonsPerDay, 'lesson')}, about ${p.minutesNeeded} min. ` : ''}${nx ? esc(cut(nx.unit.title, 50)) : unitsOf(c.id).length ? 'Every lesson done' : 'Empty so far'}${p.cramSuggested && !c.cram ? ' · cram mode suggested' : ''}</div></div>
        ${nx && !nx.build ? `<a class="btn sm primary" href="#learn-${nx.lid}">Continue</a>` : `<a class="btn sm" href="#course-${c.id}">Open</a>`}</div>`; }).join('')}</div>` : '<p class="small muted">No active course yet.</p>'}
      ${setup.length ? `<div class="panel list">${setup.map(c => `<div class="row between"><span class="grow">${esc(c.title)}</span><a class="btn sm" href="#course-${c.id}">Finish setup</a></div>`).join('')}</div>` : ''}</div>
  </div><div class="stack">
    <div class="panel stack"><h3>Weak spots</h3>${weak.length ? `<div class="list">${weak.map(i => `<div><b>${esc(i.title || 'Idea')}</b><div class="small muted">${esc((S.units[i.unitId] || {}).title || '')}</div></div>`).join('')}</div><a class="small" href="#notebook">Open the mistake notebook</a>` : '<p class="small muted">Ideas you keep missing show here.</p>'}</div>
    ${inbox ? `<div class="panel row between"><div class="grow"><b>${plural(inbox, 'item')} from chat</b><div class="small muted">Waiting under Add learning, "From chat".</div></div><a class="btn sm" href="#add">Open</a></div>` : ''}
    ${open ? `<div class="panel row between"><div class="grow"><b>${plural(open, 'flagged item')}</b><div class="small muted">Waiting for your look.</div></div><a class="btn sm" href="#reports">Reports</a></div>` : ''}
  </div></div></div>`;
};

/* ---------- More and Settings ---------- */
VIEWS.more = () => VIEWS.weekly();
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
VIEWS.prefs = () => {
  const g = settingsFor(), bk = ui('bk', () => ({ erase: false, file: null, note: '' }));
  return `<div class="reader stack-lg">${backLink('home', 'Today')}<div class="stack"><h1>Settings</h1><p class="muted">Defaults for every course. A course can override strictness, probing and retention on its Options tab.</p></div>
  <div class="panel stack"><h3>Teach-back</h3>
    <div class="field"><span>Probing depth</span>${seg('probing', PROBING, g.probing, 'pref')}<span class="small muted">How many follow-up questions before scoring. Deep adds edge cases and "why" chains.</span></div>
    <div class="field"><span>Grading strictness</span>${seg('strictness', STRICTNESS, g.strictness, 'pref')}<span class="small muted">Pass mark for a unit: lenient 60, standard 70, strict 80.</span></div></div>
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
async function savePref(changes) { await put('settings', 'global', Object.assign({}, globalSettings(), changes)).catch(() => { }); render(); }
Object.assign(ACT, {
  'pref': el => { const k = el.dataset.key, v = el.dataset.val; savePref({ [k]: k === 'retention' || k === 'voiceRate' ? Number(v) : k === 'voiceOn' ? v === 'true' : v }); if (k === 'voiceOn' && v !== 'true') Voice.stop(); },
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
