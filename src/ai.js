/* Claude calls: one wrapper with plain-language errors, Stop support, images and JSON output.
   Never retried from a loop: every call starts from a tap. */
const AI_COPY = {
  not_granted: 'Claude is not allowed for this page yet. Allow it when the page asks, or from the artifact\'s Permissions menu.',
  sampling_disabled: 'Claude is not available on this account.', not_declared: 'Claude is not available on this page.',
  capability_disabled: 'Claude is not available in this view.', capability_removed: 'Claude is not available in this view.',
  images_unavailable: 'Photos can\'t be read in this view. Type or paste the text instead.',
  image_rejected: 'That photo couldn\'t be used. Try a smaller or clearer one (JPEG or PNG).',
  rate_limited: 'You\'ve reached a usage limit. Wait a while, then try again.', session_expired: 'Sign in to claude.ai again, then retry.',
  prompt_too_large: 'That was too much text for one request. Split the material into smaller parts.',
  refused: 'Claude declined to work with this material.', empty_completion: 'Claude returned nothing. Try again.',
  invalid_json: 'Claude\'s answer came back in an unreadable shape. Try again.', upstream_error: 'The connection to Claude dropped. Try again.',
  cancelled: 'Stopped.', no_ai: 'This step needs Claude, which is not available in this view.'
};
const AI_HIDE = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];
const aiCopy = e => AI_COPY[e && e.code] || (e && e.code ? AI_COPY.upstream_error : 'Something went wrong. Try again.');
const aiOn = () => !!S.sample && !S.aiBlocked;

async function ai(prompt, opts = {}) {
  if (!aiOn()) throw { code: 'no_ai', message: 'no sample capability' };
  const o = { modelTier: opts.tier || 'default', cache: false };
  /* Course-building calls use the model the learner chose in Settings. */
  if (opts.build) { const g = settingsFor(); Object.assign(o, L.modelOpts(g.buildModel, g.buildModelId)); }
  if (opts.signal) o.signal = opts.signal;
  if (opts.images && opts.images.length) o.images = opts.images;
  try { return await S.sample.json(prompt, o); }
  catch (e) {
    if (e && AI_HIDE.includes(e.code)) { S.aiBlocked = e.code; renderBanner(); }
    if (e && e.code === 'images_unavailable') S.imagesOk = false;
    throw e;
  }
}
/* Run one Claude task under a key: shows "Thinking…" with a Stop button, reports errors, re-renders. */
async function task(key, label, fn) {
  if (S.busy[key]) return null;
  const ctl = new AbortController();
  S.busy[key] = { ctl, label, since: Date.now() };
  render();
  try { return await fn(ctl.signal); }
  catch (e) {
    if (ctl.signal.aborted || (e && e.code === 'cancelled')) toast('Stopped.');
    else { console.warn('ai task', key, e && (e.code || e.message)); toast(e && e.code ? aiCopy(e) : (e && e.userMessage) || 'Something went wrong. Try again.', true); }
    return null;
  } finally { delete S.busy[key]; render(); }
}
function busyHtml(key) {
  const b = S.busy[key]; if (!b) return '';
  return `<div class="status-line" role="status"><span class="spinner"></span><span>${esc(b.label || 'Thinking…')}</span><button type="button" class="btn sm ghost" data-act="ai-stop" data-key="${esc(key)}">Stop</button></div>`;
}
const isBusy = key => !!S.busy[key];
const needAI = `<span class="small muted">Needs Claude, which is not available in this view.</span>`;
