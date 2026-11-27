/* Page shell: icons, safe text formatting, visuals, router, render loop, shared study engine. */
const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  review: '<path d="M4 6h16v10H4z"/><path d="M8 20h8M12 16v4"/>',
  courses: '<path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z"/>',
  progress: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  sound: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>', cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  voice: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>', check: '<path d="M4 12l5 5L20 6"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.500l6.1-.9z"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', plus: '<path d="M12 5v14M5 12h14"/>'
};
function icon(name) { return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`; }

/* Inline text: escape first, then **bold**, `code`, [[glossary term]]. Nothing from Claude, connectors or the db reaches HTML unescaped. */
function inline(text) {
  return esc(text).split(/`([^`]+)`/).map((p, i) => i % 2 ? `<code>${p}</code>` : p.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[\[([^\]]+)\]\]/g, '$1')).join('');
}
function paras(text) { return String(text || '').split(/\n\s*\n/).filter(p => p.trim()).map(p => `<p>${inline(p.trim()).replace(/\n/g, '<br>')}</p>`).join(''); }
/* Underline glossary terms (first use only) so a tap defines them. Works on already-escaped HTML text nodes only. */
function withTerms(html, seen, courseId) {
  const terms = Object.entries(S.glossary).filter(([, g]) => !courseId || g.courseId === courseId).sort((a, b) => b[1].term.length - a[1].term.length).slice(0, 80);
  if (!terms.length) return html;
  return html.split(/(<[^>]+>)/).map(part => {
    if (part.startsWith('<')) return part;
    for (const [key, g] of terms) {
      if (seen.has(key)) continue;
      const t = esc(g.term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('(^|[^A-Za-z0-9])(' + t + ')(?![A-Za-z0-9])', 'i');
      if (re.test(part)) { seen.add(key); part = part.replace(re, (m, a, b) => `${a}\u0001${key}\u0002${b}\u0003`); }
    }
    return part;
  }).join('').replace(/\u0001([^\u0002]+)\u0002([^\u0003]+)\u0003/g, (m, key, word) => `<button type="button" class="term" data-act="term" data-term="${esc(key)}">${word}</button>`);
}
const addedTag = (label = 'Added, not from your source') => `<span class="origin-tag">${esc(label)}</span>`;
function partsHtml(parts) {
  return L.arr(parts, 6).map(p => ({ from: p && p.from === 'source' ? 'source' : 'general', text: L.str(p && p.text, 3000) })).filter(p => p.text)
    .map(p => `<div class="part ${p.from === 'general' ? 'general' : ''}">${p.from === 'general' ? addedTag('General knowledge, not from your material') : ''}${paras(p.text)}</div>`).join('');
}

/* ---------- Visuals: specs are validated by L.validateVisual, so this never draws an empty panel ---------- */
const VIS_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
function chartSvg(v) {
  const W = 320, H = 180, padL = 38, padB = 30, padT = 14, padR = 8;
  const vals = v.points.map(p => p.value), max = Math.max(0, ...vals), min = Math.min(0, ...vals), span = (max - min) || 1;
  const x0 = padL, x1 = W - padR, y0 = H - padB, y1 = padT, n = v.points.length, bw = (x1 - x0) / n;
  const y = val => y0 - (val - min) / span * (y0 - y1);
  const fmt = n => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : String(+n.toFixed(2)));
  let marks = '';
  if (v.kind === 'line') {
    marks = `<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="${v.points.map((p, i) => `${(x0 + bw * (i + .5)).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}"/>` +
      v.points.map((p, i) => `<circle cx="${(x0 + bw * (i + .5)).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.5" fill="var(--accent)"/>`).join('');
  } else marks = v.points.map((p, i) => { const top = Math.min(y(p.value), y(0)), h = Math.abs(y(p.value) - y(0)); return `<rect x="${(x0 + bw * i + bw * .15).toFixed(1)}" y="${top.toFixed(1)}" width="${(bw * .7).toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="3" fill="var(--accent)"/>`; }).join('');
  const labels = v.points.map((p, i) => `<text x="${(x0 + bw * (i + .5)).toFixed(1)}" y="${H - padB + 13}" text-anchor="middle" class="ct">${esc(p.label.slice(0, Math.max(3, Math.floor(bw / 6))))}</text><text x="${(x0 + bw * (i + .5)).toFixed(1)}" y="${(Math.min(y(p.value), y(0)) - 4).toFixed(1)}" text-anchor="middle" class="ct cv">${esc(fmt(p.value))}</text>`).join('');
  return `<div class="vchart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(v.caption || 'Chart')}"><line x1="${x0}" y1="${y(0).toFixed(1)}" x2="${x1}" y2="${y(0).toFixed(1)}" stroke="var(--line)" stroke-width="1"/><text x="4" y="${y1 + 4}" class="ct">${esc(fmt(max))}</text><text x="4" y="${y0}" class="ct">${esc(fmt(min))}</text>${marks}${labels}${v.xLabel ? `<text x="${(x0 + x1) / 2}" y="${H - 3}" text-anchor="middle" class="ct">${esc(v.xLabel)}</text>` : ''}</svg>${v.yLabel || v.unit ? `<div class="small muted">${esc([v.yLabel, v.unit].filter(Boolean).join(', '))}</div>` : ''}</div>`;
}
function renderVisual(raw, label) {
  const v = L.validateVisual(raw); if (!v) return '';
  let body = '';
  if (v.type === 'flow') body = `<div class="vflow">${v.steps.map((s, i) => (i ? '<div class="arrow" aria-hidden="true">→</div>' : '') + `<div class="node"><span class="n">${i + 1}</span><b>${inline(s.label)}</b>${s.detail ? `<small>${inline(s.detail)}</small>` : ''}</div>`).join('')}${v.loop ? `<div class="loop">↺ ${esc(v.loopLabel || 'Repeats from step 1')}</div>` : ''}</div>`;
  else if (v.type === 'compare') { const side = s => `<div><b>${esc(s.title)}</b><ul>${s.lines.map(x => `<li>${inline(x)}</li>`).join('')}</ul></div>`; body = `<div class="vcompare">${side(v.left)}${side(v.right)}${v.verdict ? `<div class="vverdict">${inline(v.verdict)}</div>` : ''}</div>`; }
  else if (v.type === 'steps') body = `<ol class="vsteps">${v.steps.map((s, i) => `<li><span class="k">${i + 1}</span><div><b>${inline(s.title)}</b>${s.text ? `<div class="small">${inline(s.text)}</div>` : ''}</div></li>`).join('')}</ol>`;
  else if (v.type === 'table') body = `<div class="vtable"><table><thead><tr>${v.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${v.rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  else if (v.type === 'layers') { const total = v.layers.reduce((s, l) => s + (l.size || 1), 0); body = `<div class="vlayers"><div class="stackbar">${v.layers.map((l, i) => `<span style="flex:${l.size || 1};background:${VIS_COLORS[i % 6]}">${Math.round(100 * (l.size || 1) / total)}%</span>`).join('')}</div><ul>${v.layers.map((l, i) => `<li><i style="background:${VIS_COLORS[i % 6]}"></i><div><b>${inline(l.label)}</b>${l.detail ? ` · <span class="muted">${inline(l.detail)}</span>` : ''}</div></li>`).join('')}</ul></div>`; }
  else if (v.type === 'spectrum') body = `<div class="vspec"><div class="ends"><span>${esc(v.leftLabel)}</span><span>${esc(v.rightLabel)}</span></div><div class="track">${v.points.map((p, i) => `<span class="dot" style="left:${p.pos}%">${i + 1}</span>`).join('')}</div><ol>${v.points.map(p => `<li><b>${inline(p.label)}</b>${p.detail ? ` · ${inline(p.detail)}` : ''}</li>`).join('')}</ol></div>`;
  else if (v.type === 'chart') body = chartSvg(v);
  return `<figure class="vis">${label ? addedTag(label) : ''}${body}${v.caption ? `<figcaption>${inline(v.caption)}</figcaption>` : ''}</figure>`;
}

/* ---------- Small building blocks ---------- */
const chip = (text, cls = '') => `<span class="chip ${cls}">${esc(text)}</span>`;
function seg(key, options, value, act = 'set') {
  return `<div class="seg" role="group">${options.map(([v, l]) => `<button type="button" data-act="${act}" data-key="${esc(key)}" data-val="${esc(v)}" aria-pressed="${String(value) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
}
function field(label, inner, hint) { return `<label class="field"><span>${label}</span>${inner}${hint ? `<span class="small muted">${hint}</span>` : ''}</label>`; }
function textIn(key, value, attrs = '') { return `<input type="text" id="f-${esc(key.replace(/[^a-z0-9]/gi, '-'))}" data-bind="${esc(key)}" value="${esc(value == null ? '' : value)}" ${attrs}>`; }
function areaIn(key, value, rows = 3, attrs = '') { return `<textarea id="f-${esc(key.replace(/[^a-z0-9]/gi, '-'))}" data-bind="${esc(key)}" rows="${rows}" ${attrs}>${esc(value == null ? '' : value)}</textarea>`; }
const fid = key => 'f-' + key.replace(/[^a-z0-9]/gi, '-');
function meter(used, planned) { return `<div class="window" role="img" aria-label="${used} of ${L.CAP} review units used today">${Array.from({ length: L.CAP }, (_, i) => `<span class="${i < used ? 'used' : i < used + planned ? 'plan' : ''}"></span>`).join('')}</div>`; }
function bar(pct, cls = '') { return `<div class="bar ${cls}"><i style="width:${L.clamp(Math.round(pct) || 0, 0, 100)}%"></i></div>`; }
const emptyBox = html => `<div class="empty">${html}</div>`;
const backLink = (hash, label) => `<a class="back small" href="#${esc(hash)}">← ${esc(label)}</a>`;
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---------- Files ---------- */
async function offerFile(filename, data, fallbackText) {
  if (S.downloads) {
    try { await S.downloads.save({ filename, data }); toast('Saved ' + filename); return; }
    catch (e) { if (e && e.code === 'declined') return; if (e && e.code === 'rate_limited') { toast('A save prompt is already open.', true); return; } }
  }
  openModal('copybox', { title: filename, note: 'Downloads aren\'t available in this view. Copy the text instead.', text: fallbackText == null ? String(data) : fallbackText });
}
async function copyText(text, el) {
  try { await navigator.clipboard.writeText(text); toast('Copied.'); }
  catch (e) { if (el && el.select) el.select(); toast('Copy is blocked here. The text is selected; press Ctrl+C.'); }
}
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); }); }
async function pdfText(file) {
  const base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  if (!window.pdfjsLib) { await loadScript(base + 'pdf.min.js'); window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js'; }
  const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i); const c = await p.getTextContent(); out.push(c.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('')); }
  return out.join('\n\n').replace(/[ \t]+\n/g, '\n').trim();
}

/* ---------- Modals (rendered from state, so they survive a re-render) ---------- */
const MODALS = {};
function openModal(kind, data = {}) { UI.modal = { kind, data }; render(); const f = $('#modal .modal input, #modal .modal textarea, #modal .modal button'); if (f) f.focus(); }
function closeModal() { if (UI.modal) { UI.modal = null; render(); } }
MODALS.copybox = d => `<h2>${esc(d.title)}</h2><p class="small muted">${esc(d.note || '')}</p><textarea id="copy-text" rows="12" class="mono" readonly>${esc(d.text)}</textarea><div class="row end"><button class="btn" data-act="copy" data-target="copy-text">Copy</button><button class="btn ghost" data-act="close-modal">Close</button></div>`;
MODALS.confirm = d => `<h2>${esc(d.title)}</h2><p>${esc(d.body || '')}</p><div class="row end"><button class="btn ghost" data-act="close-modal">Cancel</button><button class="btn ${d.danger ? 'danger' : 'primary'}" data-act="confirm-yes">${esc(d.yes || 'Confirm')}</button></div>`;
const CONFIRM = {};
function confirmBox(title, body, yes, fn, danger = true) { CONFIRM.fn = fn; openModal('confirm', { title, body, yes, danger }); }

/* ---------- Router ---------- */
const VIEWS = {};
const NAV = [['home', 'Today'], ['courses', 'Courses'], ['progress', 'Progress']];
const NAV_OF = { course: 'courses', newcourse: 'courses', syllabus: 'courses', learn: 'courses', map: 'courses', test: 'courses', cram: 'courses', games: 'courses', guide: 'courses', placement: 'courses', add: 'courses', review: 'home', weekly: 'progress', stats: 'progress', badges: 'progress', progress: 'progress', notebook: 'progress', reports: 'progress', more: 'progress', prefs: '' };
function parseHash() {
  const h = (location.hash || '').replace(/^#/, '');
  const m = /^([a-z]+)(?:-([A-Za-z0-9-]+))?$/.exec(h);
  if (m && VIEWS[m[1]]) return { route: m[1], param: m[2] || '' };
  return { route: 'home', param: '' };
}
function go(hash) { if (location.hash === '#' + hash) { onRoute(); } else location.hash = hash; }
function onRoute() {
  const r = parseHash();
  const changed = r.route !== S.route || r.param !== S.param;
  S.route = r.route; S.param = r.param;
  if (changed) { Voice.stop(); UI.modal = null; hideTerm(); if (S.session && S.session.idx >= S.session.ids.length && S.session.seen) { S.session = null; UI.item = null; } }
  render();
  if (changed) window.scrollTo(0, 0);
}
function renderNav() {
  const cur = NAV_OF[S.route] || S.route;
  const q = S.ready ? todayPlan() : { unitsPlanned: 0 };
  const flagged = S.ready ? openReportCount() : 0;
  const item = ([k, l], withIcon) => `<a href="#${k}" ${cur === k ? 'aria-current="page"' : ''}>${withIcon ? icon(k) : ''}<span>${l}</span>${k === 'home' && q.unitsPlanned ? `<span class="count">${q.unitsPlanned}</span>` : ''}${k === 'progress' && flagged ? `<span class="count">${flagged}</span>` : ''}</a>`;
  $('#nav').innerHTML = NAV.map(n => item(n, false)).join('');
  $('#tabbar').innerHTML = NAV.map(n => item(n, true)).join('') + `<button type="button" data-act="tutor-open">${icon('chat')}<span>Tutor</span></button>`;
  const g = $('#gear'); if (g) g.setAttribute('aria-current', S.route === 'prefs' ? 'page' : 'false');
}
function renderBanner() {
  const msgs = [];
  if (S.ready && S.memOnly) msgs.push(['bad', 'Storage isn\'t available in this view, so nothing you do here is kept after you close the page. Open this artifact from claude.ai while signed in to save your work.']);
  if (S.ready && !S.sample) msgs.push(['info', 'Claude isn\'t available in this view. You can still review your cards and grade yourself; building lessons, grading, tests and the tutor need Claude.']);
  else if (S.aiBlocked) msgs.push(['info', AI_COPY[S.aiBlocked] || AI_COPY.not_granted]);
  $('#banner').innerHTML = msgs.map(([c, m]) => `<div class="banner ${c}">${esc(m)}</div>`).join('');
}
let renderQueued = false;
function render() {
  const v = $('#view'); if (!v) return;
  const ae = document.activeElement, keep = ae && ae.id && (v.contains(ae) || ($('#overlays') && $('#overlays').contains(ae))) ? ae.id : null;
  const sel = keep && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
  const y = window.scrollY, msgs = $('#tutor-msgs'), my = msgs ? msgs.scrollTop : null;
  renderNav();
  let html;
  try { html = S.ready ? (VIEWS[S.route] || VIEWS.home)(S.param) : `<div class="empty"><span class="spinner"></span> Opening your courses…</div>`; }
  catch (e) { console.error('render', S.route, e); html = emptyBox('This screen hit a problem. <a href="#home">Go to Home</a> and try again.'); }
  v.innerHTML = html;
  $('#overlays').innerHTML = (S.ready ? tutorHtml() : '') + (UI.modal && MODALS[UI.modal.kind] ? `<div class="modal-back" id="modal"><div class="modal" role="dialog" aria-modal="true">${MODALS[UI.modal.kind](UI.modal.data)}</div></div>` : '');
  if (keep) { const el = document.getElementById(keep); if (el) { el.focus({ preventScroll: true }); if (sel) { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { } } } }
  window.scrollTo(0, y);
  const m2 = $('#tutor-msgs'); if (m2) m2.scrollTop = my == null ? m2.scrollHeight : my;
}
function softRender() {
  if (renderQueued) return; renderQueued = true;
  setTimeout(() => { renderQueued = false; const ae = document.activeElement; if (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) { renderNav(); return; } render(); }, 150);
}
function showTerm(el) {
  hideTerm();
  const g = S.glossary[el.dataset.term]; if (!g) return;
  const p = document.createElement('div'); p.className = 'pop'; p.id = 'pop'; p.setAttribute('role', 'tooltip');
  p.innerHTML = `<b>${esc(g.term)}</b>${esc(g.def)}${g.fromSource ? '' : `<div>${addedTag('Added background, not from your source')}</div>`}`;
  document.body.appendChild(p);
  const r = el.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight;
  let top = r.bottom + 6; if (top + h > window.innerHeight - 8) top = r.top - h - 6;
  p.style.left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8) + 'px'; p.style.top = Math.max(8, top) + 'px';
}
function hideTerm() { const p = $('#pop'); if (p) p.remove(); }

/* ---------- Study engine: one place that records every answer ---------- */
function todayPlan(opts = {}) {
  const t = today(), g = settingsFor(), d = dayRec();
  return L.buildQueue(activeCards(), Object.assign({ today: t, used: d.units, courses: S.courses, restDay: L.isRestDay(t, g.restDays) && !UI.restOverride }, opts));
}
function currentStreak() { return L.streak(metaMain().days, today(), settingsFor().restDays); }
function openReportCount() { return list('reports').filter(r => r.status === 'open').length + list('cards').filter(c => c.status === 'flagged').length; }
function awardBadges(m) {
  const ids = L.earnedBadges(m.stats); const fresh = [];
  for (const id of ids) if (!m.badges[id]) { m.badges[id] = today(); fresh.push(id); }
  return fresh;
}
async function bumpMeta(fn) {
  let fresh = [];
  await saveMeta(m => {
    const t = today();
    m.days[t] = Object.assign({ units: 0, extra: 0, minutes: 0, xp: 0, done: false }, m.days[t] || {});
    m.stats = Object.assign({ bestStreak: 0, unitsPassed: 0, coursesDone: 0, tb90: 0, teachbacks: 0, testsPassed: 0, simsPassed: 0 }, m.stats || {});
    m.badges = m.badges || {}; m.best = m.best || {};
    fn(m, m.days[t]);
    m.stats.bestStreak = Math.max(m.stats.bestStreak || 0, L.streak(m.days, t, settingsFor().restDays));
    fresh = awardBadges(m);
  });
  for (const id of fresh) { const b = L.BADGES.find(x => x.id === id); if (b) toast('Badge earned: ' + b.name); }
}
function addXp(m, day, n) { if (n > 0) { m.xp = (m.xp || 0) + n; day.xp = (day.xp || 0) + n; } }
async function logMistake(card, info) {
  const id = L.uid('m');
  try { await put('mistakes', id, { cardId: card.id || null, courseId: card.courseId, unitId: card.unitId || null, ideaId: card.ideaId || null, ideaTitle: L.str(card.ideaTitle, 160), prompt: L.str(info.prompt || card.prompt, 600), given: L.str(info.given, 800), why: L.str(info.why, 800), kind: info.kind || 'review', guess: !!info.guess, day: today(), at: Date.now() }); } catch (e) { }
  const all = list('mistakes').sort((a, b) => b.at - a.at);
  for (const old of all.slice(400)) drop('mistakes', old.id).catch(() => { });
}
/* r: { rating, guess, overridden, score, given, why, note, mode: 'review'|'light', bucket: 'cap'|'extra'|'none', kind } */
async function commitCard(cardId, r) {
  const card = S.cards[cardId]; if (!card) return null;
  const cfg = settingsFor(card.courseId), t = today();
  const next = L.applyResult(card, { rating: r.rating, guess: r.guess, overridden: r.overridden, score: r.score, mode: r.mode || 'review', today: t, retention: cfg.retention });
  if (r.overridden && r.note) next.overrideNotes = L.arr(next.overrideNotes, 5).concat(L.str(r.note, 300)).slice(-5);
  try { await put('cards', cardId, next); } catch (e) { return null; }
  const miss = next.lastSeen === 'again';
  if (miss) await logMistake(Object.assign({ id: cardId }, card), { given: r.given, why: r.why || card.explanation, kind: r.kind || 'review', guess: r.guess });
  const xp = r.mode === 'light' ? (miss ? 0 : L.xpFor({ kind: 'game' })) : L.xpFor({ kind: 'card', type: card.type, rating: next.lastSeen, score: r.score, guess: r.guess });
  await bumpMeta((m, day) => {
    if (r.bucket === 'cap') day.units += L.cost(card); else if (r.bucket === 'extra') day.extra += L.cost(card);
    addXp(m, day, xp);
    if (card.type === 'teachback' && r.mode !== 'light' && !r.guess) { m.stats.teachbacks++; if ((r.score || 0) >= 90) m.stats.tb90++; }
  });
  if (card.type === 'teachback' && r.mode !== 'light') await checkUnitPass(card.unitId);
  if (r.bucket === 'cap') await checkDayDone();
  return next;
}
async function checkDayDone() {
  const d = dayRec(); if (d.done) return;
  const q = todayPlan({ restDay: false });
  if (!L.dayDone(d.units, q.dueTotal, q.items.length)) return;
  await bumpMeta((m, day) => { day.done = true; addXp(m, day, L.xpFor({ kind: 'dayDone', streak: L.streak(m.days, today(), settingsFor().restDays) })); });
  toast('Today\'s review is done. Streak kept.');
}
async function checkUnitPass(unitId) {
  const unit = S.units[unitId]; if (!unit || unit.passedAt) return;
  if ((unit.lessons || []).some(l => !l.built)) return;
  const st = L.unitStatus(cardsOf('unitId', unitId).filter(c => c.type === 'teachback' && c.status !== 'retired'), settingsFor(unit.courseId).strictness);
  if (!st.passed) return;
  const first = !unit.passCounted;
  await patch('units', unitId, { passedAt: Date.now(), passScore: st.avg, passCounted: true }).catch(() => { });
  const all = unitsOf(unit.courseId), courseDone = all.length > 0 && all.every(u => u.passedAt || u.id === unitId);
  const course = S.courses[unit.courseId], firstDone = courseDone && course && !course.doneCounted;
  if (courseDone && course && !course.doneAt) await patch('courses', unit.courseId, { doneAt: Date.now(), doneCounted: true }).catch(() => { });
  if (first || firstDone) await bumpMeta((m, day) => { if (first) { m.stats.unitsPassed++; addXp(m, day, L.xpFor({ kind: 'unitPass' })); } if (firstDone) m.stats.coursesDone++; });
  toast(`Module passed: ${unit.title} (${st.avg}).`);
}
/* Pull every card of an idea (or a unit, when the idea is unknown) earlier after a miss in a test or game. */
async function pullIdea(courseId, unitId, ideaTitle) {
  const t = today();
  const all = list('cards').filter(c => c.courseId === courseId && c.status === 'active' && c.ideaTitle), want = String(ideaTitle || '').toLowerCase();
  let cs = want ? all.filter(c => c.ideaTitle.toLowerCase() === want) : [];
  if (!cs.length && want) { const wt = L.tokens(want); let best = null, bw = 0.4; for (const c of all) { const w = L.overlap(wt, L.tokens(c.ideaTitle)) + (c.unitId === unitId ? 0.05 : 0); if (w > bw) { bw = w; best = c.ideaId; } } if (best) cs = all.filter(c => c.ideaId === best); }
  if (!cs.length && unitId) cs = all.filter(c => c.unitId === unitId && c.type === 'teachback').sort((a, b) => L.weakness(b) - L.weakness(a)).slice(0, 3);
  if (!cs.length) return 0;
  for (const c of cs) { const n = L.pullEarlier(c, t); if (JSON.stringify(n.fsrs) !== JSON.stringify(c.fsrs) || n.masteredDue !== c.masteredDue) await put('cards', c.id, n).catch(() => { }); }
  return cs.length;
}
/* Study minutes: counted while the page is visible and was used in the last two minutes. */
const Clock = { last: Date.now(), acc: 0 };
function tickClock() {
  if (typeof document === 'undefined' || document.hidden || !S.ready || Date.now() - Clock.last > 120000) return;
  Clock.acc += 0.5;
  if (Clock.acc >= 2) { const add = Clock.acc; Clock.acc = 0; saveMeta(m => { const t = today(); m.days[t] = Object.assign({ units: 0, extra: 0, minutes: 0, xp: 0, done: false }, m.days[t] || {}); m.days[t].minutes = +(m.days[t].minutes + add).toFixed(1); }); }
}
