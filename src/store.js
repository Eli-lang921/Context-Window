/* State, utilities and storage: db wrapper with an in-memory fallback, one write chain per doc. */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = L.esc;
const clone = L.clone;
const plural = (n, w, p) => n + ' ' + (n === 1 ? w : (p || w + 's'));
const WATCHED = ['courses', 'units', 'sources', 'cards', 'tests', 'mistakes', 'glossary', 'inbox', 'reports', 'settings', 'meta'];
const LAZY = ['lessons', 'srctext'];
const ID_OK = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

const S = {
  store: null, sample: null, downloads: null, tts: null, dict: null, mcp: null,
  ready: false, memOnly: false, aiBlocked: null, imagesOk: false, conn: {},
  courses: {}, units: {}, sources: {}, cards: {}, tests: {}, mistakes: {}, glossary: {}, inbox: {}, reports: {}, settings: {}, meta: {},
  lessons: {}, busy: {}, route: 'home', param: '', session: null, tutor: { open: false, turns: [], busy: false }
};
/* UI holds everything the viewer has typed or toggled, so a re-render never loses it. */
const UI = {};
function ui(key, init) { if (!(key in UI)) UI[key] = typeof init === 'function' ? init() : init; return UI[key]; }

const today = () => L.studyDay();
const list = col => Object.entries(S[col]).map(([id, d]) => Object.assign({}, d, { id }));
const courseList = () => list('courses').sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
const unitsOf = cid => list('units').filter(u => u.courseId === cid).sort((a, b) => (a.n || 0) - (b.n || 0));
const cardsOf = (key, id) => list('cards').filter(c => c[key] === id);
const activeCards = () => list('cards').filter(c => c.status === 'active');
const globalSettings = () => S.settings.global || {};
const settingsFor = cid => L.settingsFor(globalSettings(), cid ? S.settings[cid] : null);
/* Numbers read back from the db are forced to numbers before they are shown. */
const num = v => (Number.isFinite(+v) ? +v : 0);
const metaMain = () => { const m = Object.assign({ days: {}, xp: 0, stats: {}, badges: {}, best: {} }, S.meta.main || {}); m.xp = num(m.xp); return m; };
const dayRec = () => { const d = metaMain().days[today()] || {}; return { units: num(d.units), extra: num(d.extra), minutes: num(d.minutes), xp: num(d.xp), done: d.done === true }; };

function toast(msg, err) {
  const box = $('#toast'); if (!box) return;
  const d = document.createElement('div');
  if (err) d.className = 'err';
  d.textContent = msg; box.appendChild(d);
  setTimeout(() => d.remove(), err ? 7000 : 3200);
}

class DbStore {
  constructor(db) { this.db = db; }
  watch(col, cb) {
    return this.db.collection(col).onSnapshot(snap => { const m = {}; for (const d of snap.docs) m[d.id] = d.data(); cb(m); }, e => storeError(e, 'Live updates stopped. Reload the page.'));
  }
  async get(path) { const s = await this.db.doc(path).get(); return s.exists ? clone(s.data()) : null; }
  async all(col) { const snap = await this.db.collection(col).get(); const m = {}; for (const d of snap.docs) m[d.id] = d.data(); return m; }
  async set(path, data) { await this.db.doc(path).set(data); }
  async del(path) { await this.db.doc(path).delete(); }
}
class MemStore {
  constructor() { this.cols = {}; this.subs = {}; }
  split(path) { const i = path.lastIndexOf('/'); return [path.slice(0, i), path.slice(i + 1)]; }
  emit(col) { const m = clone(this.cols[col] || {}); (this.subs[col] || []).forEach(cb => cb(m)); }
  watch(col, cb) { (this.subs[col] = this.subs[col] || []).push(cb); setTimeout(() => this.emit(col), 0); return () => { }; }
  async get(path) { const [c, id] = this.split(path); const v = (this.cols[c] || {})[id]; return v ? clone(v) : null; }
  async all(col) { return clone(this.cols[col] || {}); }
  async set(path, data) { const [c, id] = this.split(path); (this.cols[c] = this.cols[c] || {})[id] = clone(data); this.emit(c); }
  async del(path) { const [c, id] = this.split(path); if (this.cols[c]) delete this.cols[c][id]; this.emit(c); }
}

const chains = {}, pendingWrites = {};
function chain(path, fn) {
  pendingWrites[path] = (pendingWrites[path] || 0) + 1;
  const p = (chains[path] || Promise.resolve()).catch(() => { }).then(fn);
  chains[path] = p;
  const done = () => { pendingWrites[path]--; if (!pendingWrites[path]) { delete pendingWrites[path]; if (chains[path] === p) delete chains[path]; } };
  p.then(done, done);
  return p.catch(e => { storeError(e); throw e; });
}
function save(path, data) {
  if (JSON.stringify(data).length > 240000) { const e = { code: 'invalid_argument', message: 'doc too large' }; storeError(e); return Promise.reject(e); }
  return chain(path, () => S.store.set(path, data));
}
function remove(path) { return chain(path, () => S.store.del(path)); }
/* put/drop update local state at once, then write. */
function put(col, id, data) { const d = clone(data); delete d.id; S[col][id] = d; return save(col + '/' + id, d); }
function patch(col, id, changes) { return put(col, id, Object.assign({}, S[col][id] || {}, changes)); }
function drop(col, id) { delete S[col][id]; return remove(col + '/' + id); }
function storeError(e, msg) {
  const code = e && e.code;
  let m = msg || 'Couldn\'t save that change. Check your connection and try again; your work is still on screen.';
  if (code === 'quota_exceeded') m = 'Storage is full. Delete a course or some material you no longer need, then try again.';
  if (code === 'invalid_argument') m = 'That item is too large to save (over 256 KB). Split the material into smaller parts.';
  if (code === 'revoked' || code === 'not_granted') m = 'This page lost access to its storage. Reload it from claude.ai.';
  toast(m, true);
  console.warn('store error', code || e);
}
/* A snapshot never overwrites a doc that still has a local write in flight. */
function applySnapshot(col, m) {
  const cur = S[col], prefix = col + '/';
  for (const path of Object.keys(pendingWrites)) {
    if (!path.startsWith(prefix)) continue;
    const id = path.slice(prefix.length);
    if (id in cur) m[id] = cur[id]; else delete m[id];
  }
  S[col] = m;
}

async function saveMeta(mutator) {
  const m = clone(metaMain());
  mutator(m);
  for (const d of Object.keys(m.days)) if (L.daysBetween(d, today()) > 400) delete m.days[d];
  try { await put('meta', 'main', m); } catch (e) { }
}

/* ---------- Source text and lessons (loaded on demand) ---------- */
const textCache = {};
async function loadSourceText(sid) {
  if (textCache[sid] != null) return textCache[sid];
  const s = S.sources[sid]; if (!s) return '';
  const parts = [];
  for (let i = 0; i < (s.chunks || 0); i++) { const c = await S.store.get(`srctext/${sid}-${i}`); parts.push(c ? c.text : ''); }
  return (textCache[sid] = parts.join(''));
}
async function getLesson(lid) {
  if (S.lessons[lid]) return S.lessons[lid];
  const l = await S.store.get('lessons/' + lid);
  if (l) S.lessons[lid] = l;
  return l;
}
async function putLesson(lid, lesson) { S.lessons[lid] = lesson; await save('lessons/' + lid, lesson); }
async function addSource(courseId, { title, kind, text }) {
  text = String(text || '').trim();
  if (text.length < 40) { toast('That material is too short to use. Add at least a few sentences.', true); return null; }
  const sid = L.uid('s'), chunks = L.chunkText(text);
  try {
    for (let i = 0; i < chunks.length; i++) await save(`srctext/${sid}-${i}`, { sid, n: i, text: chunks[i] });
    await put('sources', sid, { courseId, title: L.str(title, 120) || 'Untitled material', kind: kind || 'notes', chars: text.length, chunks: chunks.length, segCount: L.splitSegments(text).length, createdAt: Date.now() });
  } catch (e) { return null; }
  textCache[sid] = text;
  return sid;
}
async function deleteSource(sid) {
  const s = S.sources[sid]; if (!s) return;
  for (let i = 0; i < (s.chunks || 0); i++) await remove(`srctext/${sid}-${i}`).catch(() => { });
  delete textCache[sid];
  await drop('sources', sid).catch(() => { });
}
/* The text of the segments a unit draws on, capped so one call stays well under the 256 KiB input limit. */
async function unitMaterial(unit, cap = 60000) {
  const out = []; let size = 0;
  for (const ref of unit.segs || []) {
    const m = /^(.+):(\d+)$/.exec(ref); if (!m || !S.sources[m[1]]) continue;
    const seg = L.splitSegments(await loadSourceText(m[1]))[+m[2]];
    if (!seg || size + seg.length > cap) continue;
    out.push(seg); size += seg.length;
  }
  return out.join('\n\n');
}

/* ---------- Backup and restore ---------- */
async function buildBackup() {
  const data = {};
  for (const col of WATCHED) data[col] = clone(S[col]);
  for (const col of LAZY) data[col] = await S.store.all(col);
  return { app: 'context-window', version: 2, exportedAt: new Date().toISOString(), data };
}
function checkBackup(obj) {
  if (!obj || obj.app !== 'context-window' || obj.version !== 2 || !obj.data || typeof obj.data !== 'object') return { ok: false, reason: 'This file is not a Context Window v2 backup.' };
  let n = 0;
  for (const col of Object.keys(obj.data)) {
    if (!WATCHED.includes(col) && !LAZY.includes(col)) return { ok: false, reason: 'The backup has a section this version does not know: ' + col.slice(0, 40) };
    const docs = obj.data[col];
    if (!docs || typeof docs !== 'object' || Array.isArray(docs)) return { ok: false, reason: 'The backup is damaged (' + col + ').' };
    for (const [id, d] of Object.entries(docs)) {
      if (!ID_OK.test(id) || !d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, reason: 'The backup is damaged (' + col + ').' };
      n++;
    }
  }
  return n > 24000 ? { ok: false, reason: 'The backup holds more items than this page can store.' } : { ok: true, count: n };
}
async function restoreBackup(obj, erase, onProgress) {
  const check = checkBackup(obj); if (!check.ok) throw new Error(check.reason);
  let done = 0;
  if (erase) {
    for (const col of WATCHED.concat(LAZY)) {
      const ids = Object.keys(LAZY.includes(col) ? await S.store.all(col) : S[col]);
      for (const id of ids) { if (!(obj.data[col] && obj.data[col][id])) await remove(col + '/' + id); }
    }
  }
  for (const col of Object.keys(obj.data)) {
    for (const [id, d] of Object.entries(obj.data[col])) {
      await save(col + '/' + id, d);
      if (++done % 20 === 0 && onProgress) onProgress(done, check.count);
    }
  }
  for (const k of Object.keys(S.lessons)) delete S.lessons[k];
  for (const k of Object.keys(textCache)) delete textCache[k];
  return check.count;
}
