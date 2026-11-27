/* Events and start-up. */
function setPath(obj, key, value) {
  const ks = key.split('.'); let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = value;
}
Object.assign(ACT, {
  'set': el => { setPath(UI, el.dataset.key, el.dataset.val); if (el.dataset.key === 'mat.tab') { UI.mat.results = null; UI.mat.note = ''; if (el.dataset.val === 'photo') ensureLimits(); } render(); },
  'toggle': el => { const ks = el.dataset.key.split('.'); let o = UI; for (const k of ks.slice(0, -1)) o = o[k] || (o[k] = {}); o[ks[ks.length - 1]] = !o[ks[ks.length - 1]]; render(); },
  'close-modal': () => closeModal(),
  'confirm-yes': () => { const fn = CONFIRM.fn; CONFIRM.fn = null; UI.modal = null; render(); if (fn) return fn(); },
  'copy': el => { const t = document.getElementById(el.dataset.target); if (t) copyText(t.value != null && /TEXTAREA|INPUT/.test(t.tagName) ? t.value : t.textContent, t); },
  'term': el => showTerm(el),
  'ai-stop': el => { const b = S.busy[el.dataset.key]; if (b && b.ctl) b.ctl.abort(); },
  'speak': el => { const k = el.dataset.key; if (SPEAKS[k] != null) Voice.toggle(SPEAKS[k], k); },
  'mic': el => Dict.click(el.dataset.target)
});
function ensureLimits() {
  if (S.limitsAsked || !S.sample || typeof S.sample.limits !== 'function') return;
  S.limitsAsked = true;
  S.sample.limits().then(l => { S.imagesOk = !!(l && l.images); if (l && l.images && l.images.maxCount) S.imageMax = Math.min(8, l.images.maxCount); render(); }).catch(() => { });
}
function runAct(name, el, ev) {
  const fn = ACT[name]; if (!fn) return;
  try { const r = fn(el, ev); if (r && r.catch) r.catch(e => { console.error('action', name, e); toast('That didn\'t work. Try again.', true); }); }
  catch (e) { console.error('action', name, e); toast('That didn\'t work. Try again.', true); }
}
document.addEventListener('click', ev => {
  Clock.last = Date.now();
  if (ev.target.id === 'modal') { closeModal(); return; }
  const el = ev.target.closest('[data-act]');
  if (!el) { if (!ev.target.closest('.pop')) hideTerm(); return; }
  if (el.tagName === 'A' || el.disabled) return;
  if (el.dataset.act !== 'term') hideTerm();
  runAct(el.dataset.act, el, ev);
});
document.addEventListener('input', ev => {
  Clock.last = Date.now();
  const el = ev.target, k = el.dataset && el.dataset.bind; if (!k) return;
  setPath(UI, k, el.type === 'checkbox' ? el.checked : el.value);
  if (el.id === 'f-add-text') { const n = $('#add-count'); if (n) n.textContent = el.value.length.toLocaleString(); }
});
document.addEventListener('change', ev => {
  const el = ev.target; if (!el.dataset) return;
  if (el.dataset.actChange) runAct(el.dataset.actChange, el, ev);
  else if (el.dataset.bind && (el.type === 'checkbox' || el.type === 'date')) render();
});
document.addEventListener('keydown', ev => {
  Clock.last = Date.now();
  const el = ev.target;
  if (ev.key === 'Escape') { hideTerm(); if (UI.modal) closeModal(); else if (S.tutor.open) { S.tutor.open = false; Voice.stop(); render(); } return; }
  if (ev.key === 'Enter' && !ev.shiftKey && el.id === 'f-tutorIn') { ev.preventDefault(); tutorSend(); return; }
  if (ev.key === 'Enter' && el.id === 'f-game-input') { ev.preventDefault(); runAct('fill-check', el, ev); return; }
  if (ev.key === 'Enter' && el.id === 'f-mat-q') { ev.preventDefault(); const b = $('[data-act="mat-search"]'); if (b && !b.disabled) runAct('mat-search', b, ev); return; }
  if ((ev.key === 'Enter' || ev.key === ' ') && el.getAttribute && el.getAttribute('role') === 'button' && el.dataset.act) { ev.preventDefault(); runAct(el.dataset.act, el, ev); }
});
window.addEventListener('hashchange', onRoute);

async function boot() {
  onRoute();
  const c = window.claude, names = ['db', 'sample', 'downloads', 'tts', 'dictation', 'mcp'];
  const got = await Promise.all(names.map(n => (c && typeof c.use === 'function' ? Promise.resolve().then(() => c.use(n)).catch(() => null) : null)));
  const [db, sample, downloads, tts, dictation, mcp] = got;
  S.store = db ? new DbStore(db) : new MemStore();
  S.memOnly = !db; S.sample = sample || null; S.downloads = downloads || null; S.tts = tts || null; S.dict = dictation || null; S.mcp = mcp || null;
  S.imagesOk = !!sample; S.imageMax = 5;
  if (S.tts && typeof S.tts.onState === 'function') { try { S.tts.onState(({ state }) => { if (state === 'idle' && Voice.mode === 'tts' && Voice.state !== 'idle') Voice.set('idle'); }); } catch (e) { } }
  const pending = new Set(WATCHED);
  const ready = () => { if (S.ready) return; S.ready = true; renderBanner(); onRoute(); render(); firstOpenToday(); };
  for (const col of WATCHED) {
    try { S.store.watch(col, m => { applySnapshot(col, m); if (pending.delete(col) && !pending.size) ready(); else if (S.ready) softRender(); }); }
    catch (e) { pending.delete(col); }
  }
  setTimeout(ready, 8000);
  setInterval(() => { tickTest(); tickGame(); }, 1000);
  setInterval(tickClock, 30000);
}
/* A day with nothing due still keeps the streak once you have started studying. */
function firstOpenToday() {
  const d = dayRec(); if (d.done || !activeCards().some(c => c.fsrs && c.fsrs.reps)) return;
  if (todayPlan({ restDay: false }).dueTotal === 0) bumpMeta((m, day) => { day.done = true; });
}
boot();
