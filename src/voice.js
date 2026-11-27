/* Voice out: Claude voice (tts) with the browser's speechSynthesis as fallback. Voice in: dictation mic button. */
const Voice = {
  state: 'idle', key: null, mode: null,
  canSpeak() { return !!S.tts || (typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'); },
  usingFallback() { return !S.tts; },
  on() { return this.canSpeak() && settingsFor().voiceOn !== false; },
  /* Split text into lines of at most `max` characters on sentence ends. */
  lines(text, max) {
    const paras = (Array.isArray(text) ? text : String(text || '').split(/\n\s*\n/)).map(p => String(p).replace(/[*`\[\]#]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const out = [];
    for (let p of paras) {
      while (p.length > max) { let cut = p.lastIndexOf('. ', max); if (cut < max / 2) cut = p.lastIndexOf(' ', max); if (cut < 1) cut = max; out.push(p.slice(0, cut + 1).trim()); p = p.slice(cut + 1).trim(); }
      if (p) out.push(p);
    }
    return out;
  },
  set(state, key) { this.state = state; this.key = state === 'idle' ? null : key; refreshSpeakers(); },
  async speak(text, key) {
    if (!this.canSpeak()) return;
    const cfg = settingsFor();
    await this.stop();
    if (S.tts) {
      const lines = this.lines(text, 1900).map(t => ({ text: t, voice: cfg.voiceName }));
      if (!lines.length) return;
      this.mode = 'tts'; this.set('speaking', key);
      try { await S.tts.speak(lines, { rate: cfg.voiceRate }); }
      catch (e) {
        if (e && e.code === 'not_granted') { S.tts = null; toast('Claude voice is turned off for this page. Using your device\'s voice instead.'); }
        else if (e && e.code === 'busy') toast('Finish dictating first, then play it.');
        else if (e && e.code === 'rate_limited') toast('Voice is busy. Try again in a moment.', true);
      }
      if (this.key === key) this.set('idle');
      return;
    }
    const synth = window.speechSynthesis, lines = this.lines(text, 220);
    if (!lines.length) return;
    this.mode = 'synth'; this.set('speaking', key);
    const token = (this.token = {});
    for (const line of lines) {
      if (this.token !== token) return;
      await new Promise(res => { const u = new SpeechSynthesisUtterance(line); u.rate = cfg.voiceRate; u.onend = res; u.onerror = res; synth.speak(u); });
    }
    if (this.token === token) this.set('idle');
  },
  async stop() {
    this.token = null;
    try { if (this.mode === 'tts' && S.tts) await S.tts.stop(); else if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { }
    this.set('idle');
  },
  toggle(text, key) { if (this.state !== 'idle' && this.key === key) return this.stop(); return this.speak(text, key); }
};
const SPEAKS = {};
function speakBtn(key, label, text) {
  if (!Voice.canSpeak()) return '';
  if (text != null) SPEAKS[key] = text;
  const on = Voice.state !== 'idle' && Voice.key === key;
  return `<button type="button" class="btn sm ${on ? 'primary' : ''}" data-act="speak" data-key="${esc(key)}" data-speaker="${esc(key)}" data-label="${esc(label || 'Read aloud')}" aria-pressed="${on}">${icon(on ? 'stop' : 'sound')}<span>${on ? 'Stop' : esc(label || 'Read aloud')}</span></button>`;
}
function refreshSpeakers() {
  if (typeof document === 'undefined') return;
  $$('[data-speaker]').forEach(b => {
    const on = Voice.state !== 'idle' && Voice.key === b.dataset.speaker;
    b.classList.toggle('primary', on); b.setAttribute('aria-pressed', on);
    const s = b.querySelector('span'); if (s) s.textContent = on ? 'Stop' : (b.dataset.label || 'Read aloud');
  });
}

/* Dictation: start() is called straight from the tap, with nothing awaited before it. */
const Dict = {
  listening: false, target: null, denied: false, wired: false, partial: '',
  available() { return !!S.dict && !this.denied; },
  wire() {
    if (this.wired || !S.dict) return; this.wired = true;
    S.dict.onPartial(({ text }) => { this.partial = text || ''; const el = $('#dict-live'); if (el) el.textContent = this.partial; });
    S.dict.onFinal(({ text }) => {
      this.partial = ''; const live = $('#dict-live'); if (live) live.textContent = '';
      const el = this.target && document.getElementById(this.target); if (!el || !text) return;
      el.value = (el.value ? el.value.replace(/\s*$/, ' ') : '') + text.trim();
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    S.dict.onState(({ state }) => { const was = this.listening; this.listening = state === 'listening' || state === 'starting'; if (was !== this.listening) refreshMics(); });
  },
  click(targetId) {
    if (!S.dict) return;
    this.wire();
    if (this.listening) { S.dict.stop().catch(() => { }); return; }
    this.target = targetId;
    S.dict.start().catch(e => {
      if (e && e.code === 'not_granted') { this.denied = true; toast('Microphone access was declined for this page. Typing still works.'); render(); }
      else if (e && e.code !== 'dismissed') toast('Dictation couldn\'t start. Typing still works.', true);
    });
    Voice.stop();
  }
};
function micBtn(targetId) {
  if (!Dict.available()) return '';
  const on = Dict.listening && Dict.target === targetId;
  return `<button type="button" class="btn sm ${on ? 'danger' : ''}" data-act="mic" data-target="${esc(targetId)}" data-mic="${esc(targetId)}" aria-pressed="${on}">${icon('mic')}<span>${on ? 'Stop' : 'Talk'}</span></button>`;
}
function refreshMics() {
  $$('[data-mic]').forEach(b => { const on = Dict.listening && Dict.target === b.dataset.mic; b.classList.toggle('danger', on); b.setAttribute('aria-pressed', on); const s = b.querySelector('span'); if (s) s.textContent = on ? 'Stop' : 'Talk'; });
}
/* Shown under answer boxes when the in-page mic is not offered (the Claude phone and desktop apps). */
function micHint() {
  if (Dict.available()) return `<span class="small muted" id="dict-live" aria-live="polite"></span>`;
  return `<span class="small muted">To answer by voice here, tap the mic key on your keyboard.</span>`;
}
