/* One item at a time: flashcard, short answer, apply-it and teach-back. Used by lessons, review, cram and the notebook. */
const TYPE_LABEL = { teachback: 'Teach-back', flash: 'Flashcard', short: 'Short answer', apply: 'Apply it' };
const STYLE_LABEL = { beginner: 'Explain to a beginner', example: 'Give your own example', predict: 'Predict what happens', compare: 'Compare two ideas' };
const RATE_LABEL = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };

const bk = it => (it.ctx.lesson ? 'litem' : 'item');
function newItem(cardId, ctx) { return { cardId, ctx, phase: 'answer', input: '', res: null, note: '', tb: null, snippet: false }; }
function tbPrompt(card, style) {
  const p = card.prompts && card.prompts[style];
  if (p) return p;
  const t = card.ideaTitle || card.prompt;
  return { beginner: `Explain "${t}" as if to someone who has never heard of it.`, example: `Give your own example of "${t}" and say why it fits.`, predict: `Pick one thing about "${t}" that could change, and predict what happens.`, compare: `Compare "${t}" with a related idea: what is the same, and what differs?` }[style];
}
function ideaOf(card) { return { title: card.ideaTitle || card.prompt, keyPoints: card.rubric || [], summary: card.answer || '' }; }
function intervalText(n) { return n === 1 ? 'tomorrow' : n < 30 ? n + ' days' : n < 365 ? Math.round(n / 30) + ' mo' : (n / 365).toFixed(1) + ' yr'; }

function rateRow(it, card) {
  const cfg = settingsFor(card.courseId), light = it.ctx.mode === 'light';
  const iv = card.mastered ? null : L.previewIntervals(card.fsrs, today(), cfg.retention);
  const r = it.res || {};
  return `<div class="stack tight"><span class="small muted">${r.aiRating ? 'Claude set the rating from your score. Tap another to change it.' : 'How well did you know it?'}</span>
  <div class="rate">${L.RATINGS.map(k => `<button type="button" data-act="item-rate" data-r="${k}" class="${r.rating === k ? 'on' : ''} ${r.aiRating === k ? 'sugg' : ''}" aria-pressed="${r.rating === k}">${RATE_LABEL[k]}${iv && !light ? `<small>${k === 'again' ? 'tomorrow' : intervalText(iv[k])}</small>` : ''}</button>`).join('')}</div></div>`;
}
function itemTools(it, card) {
  return `<div class="tools"><button type="button" class="linkbtn small" data-act="item-explain">Explain</button>
    <button type="button" class="linkbtn small" data-act="item-more" aria-expanded="${!!it.more}">${it.more ? 'Less' : 'More'}</button>
    ${it.more ? `<button type="button" class="linkbtn small" data-act="item-ask">Ask a question</button>
    <button type="button" class="linkbtn small" data-act="item-master">${card.mastered ? 'Un-master' : 'Mark mastered'}</button>
    <button type="button" class="linkbtn small" data-act="item-report">Report</button>` : ''}</div>${busyHtml('item')}`;
}
function leechHtml(it, card) {
  let h = '';
  if (card.leech) h += `<div class="flag stack tight"><b>You've missed this ${num(card.misses)} times.</b><span class="small">Re-read the idea, or have the card rewritten more clearly.</span><div class="row"><button type="button" class="btn sm" data-act="item-snippet">${it.snippet ? 'Hide the lesson' : 'Show the lesson'}</button>${aiOn() ? `<button type="button" class="btn sm" data-act="item-rewrite" ${isBusy('item') ? 'disabled' : ''}>Rewrite this card</button>` : ''}</div>${it.snippet ? `<div class="prose small">${paras(card.type === 'teachback' ? card.answer : (S.cards[card.tbId] || {}).answer || card.explanation || card.answer)}</div>` : ''}</div>`;
  else if (card.offerRewrite) h += `<div class="flag stack tight"><b>You've overruled the grade on this ${num(card.overrides)} times.</b><span class="small">Claude can rewrite its model answer and rubric using your notes.</span>${aiOn() ? `<div><button type="button" class="btn sm" data-act="item-rewrite" ${isBusy('item') ? 'disabled' : ''}>Rewrite model answer</button></div>` : ''}</div>`;
  return h;
}
function verdictHtml(it, card) {
  const r = it.res; if (!r || r.verdict == null) return '';
  const cls = r.verdict === 'correct' ? 'correct' : r.verdict === 'partial' ? 'partial' : 'incorrect';
  const title = r.guess ? 'Counted as a miss (guess)' : r.verdict === 'correct' ? 'Correct' : r.verdict === 'partial' ? 'Partly right' : 'Not yet';
  return `<div class="verdict ${cls}"><div class="row between"><b>${title}${r.score != null ? ` · ${r.score}/100` : ''}</b><span class="small muted">${r.ai ? 'Claude\'s grade' : 'Self-graded'}${r.overridden ? ', changed by you' : ''}</span></div>
  ${r.reasoning ? `<div class="small">${inline(r.reasoning)}</div>` : ''}${r.missing && r.missing.length ? `<div class="small"><b>Missing:</b> ${r.missing.map(esc).join('; ')}</div>` : ''}</div>`;
}
function overrideRow(it) {
  const r = it.res || {}; let h = '';
  if (r.ai && r.verdict !== 'correct' && !r.guess) h += `<div class="row"><button type="button" class="btn sm" data-act="item-override">I was right: mark correct</button><input type="text" id="f-item-note" data-bind="${bk(it)}.note" value="${esc(it.note)}" placeholder="Why? (optional)" style="flex:1 1 160px"></div>`;
  if (!r.guess && r.rating && r.rating !== 'again') h += `<div><button type="button" class="btn sm ghost" data-act="item-guess">That was a guess</button></div>`;
  if (r.guess) h += `<div><button type="button" class="btn sm ghost" data-act="item-unguess">Undo: it wasn't a guess</button></div>`;
  return h;
}
function nextBtn(it) {
  const ok = it.res && it.res.rating;
  return `<div class="row"><button type="button" class="btn primary" data-act="item-next" ${ok && !isBusy('commit') ? '' : 'disabled'}>${it.ctx.lesson ? 'Continue' : 'Next'}</button>${ok ? '' : '<span class="small muted">Pick a rating first.</span>'}</div>`;
}

function itemHtml(it) {
  const card = S.cards[it.cardId];
  if (!card) return emptyBox('This item was removed.') + `<div class="row"><button type="button" class="btn" data-act="item-skip">Next</button></div>`;
  const course = S.courses[card.courseId] || {}, unit = S.units[card.unitId] || {};
  const meta = `<div class="meta">${chip(TYPE_LABEL[card.type] || 'Card', 'type-' + card.type)}${course.title ? chip(course.title) : ''}${unit.title ? chip(unit.title) : ''}${card.origin === 'added' ? chip('Added by Claude', 'added') : ''}${card.mastered ? chip('Mastered check-in', 'good') : ''}${card.leech ? chip('Leech', 'bad') : ''}</div>`;
  const body = card.type === 'teachback' ? tbHtml(it, card) : plainHtml(it, card);
  return `<div class="qcard" id="item">${meta}${body}</div>`;
}
function plainHtml(it, card) {
  const head = `<div class="qprompt">${inline(card.prompt)}</div>`;
  if (it.phase === 'answer') {
    if (card.type === 'flash') return head + `<div class="row"><button type="button" class="btn primary" data-act="item-reveal">Show answer</button></div>`;
    return head + `<label class="field"><span>${card.type === 'apply' ? 'Your response' : 'Your answer'}</span><textarea id="f-item-input" data-bind="${bk(it)}.input" rows="${card.type === 'apply' ? 6 : 3}" placeholder="Answer in your own words">${esc(it.input)}</textarea></label>
    <div class="row">${micBtn('f-item-input')}<button type="button" class="btn primary" data-act="item-submit" ${isBusy('item') ? 'disabled' : ''}>${aiOn() ? 'Check my answer' : 'Show model answer'}</button><button type="button" class="btn ghost" data-act="item-dunno" ${isBusy('item') ? 'disabled' : ''}>I don't know</button></div>${micHint()}${busyHtml('item')}`;
  }
  const r = it.res || {}, miss = r.rating === 'again' || r.verdict === 'incorrect';
  return head + (it.input ? `<div class="answer-box"><span class="lbl">You wrote</span><div class="body small">${paras(it.input)}</div></div>` : '') + verdictHtml(it, card) +
    `<div class="answer-box"><span class="lbl">${card.type === 'flash' ? 'Answer' : 'Model answer'}</span><div class="body">${paras(card.answer)}</div>${card.rubric && card.rubric.length ? `<div class="small"><b>A good answer includes:</b> ${card.rubric.map(esc).join('; ')}</div>` : ''}</div>
    ${miss && card.explanation ? `<div class="miss"><b>Why</b><div class="small">${inline(card.explanation)}</div>${card.quote ? `<div class="quote small">From your source: “${esc(card.quote)}”</div>` : ''}</div>` : ''}
    ${leechHtml(it, card)}${rateRow(it, card)}${overrideRow(it)}${itemTools(it, card)}${nextBtn(it)}`;
}

/* ---------- Teach-back ---------- */
function tbState(it, card) { return it.tb || (it.tb = { stage: 'explain', style: L.styleFor(card), turns: [], probes: [], pi: 0, hints: [], grade: null, first: null, retried: false, ticks: {} }); }
function convoHtml(tb) { return tb.turns.length ? `<div class="convo">${tb.turns.map(t => `<div class="${t.role === 'tutor' ? 'bot' : 'me'}">${paras(t.text)}</div>`).join('')}</div>` : ''; }
function checklistHtml(card, grade) {
  return `<ul class="checklist">${(card.rubric || []).map((p, i) => { const g = (grade.points || [])[i] || {}; return `<li class="${g.hit ? 'hit' : 'missed'}"><span class="mark" aria-hidden="true">${g.hit ? '✓' : '✗'}</span><div><b>${esc(p)}</b>${g.note ? `<div class="small muted">${esc(g.note)}</div>` : ''}</div><span class="sr">${g.hit ? 'covered' : 'missed'}</span></li>`; }).join('')}</ul>`;
}
function tbHtml(it, card) {
  const tb = tbState(it, card), cfg = settingsFor(card.courseId);
  const head = `<div class="eyebrow">${esc(STYLE_LABEL[tb.style])}</div><div class="qprompt">${inline(tbPrompt(card, tb.style))}</div>`;
  const hints = tb.hints.length ? `<div class="hints">${tb.hints.map((h, i) => `<div class="hint"><b>Hint ${i + 1}</b> (−10): ${inline(h)}</div>`).join('')}</div>` : '';
  if (tb.stage === 'explain' || tb.stage === 'retry') {
    const retry = tb.stage === 'retry';
    return head + (retry ? `<div class="added prose">${addedTag('Re-teach of the gap, added by Claude')}${paras(tb.grade.reteach)}</div>` : '') + hints +
      `<label class="field"><span>${retry ? 'Try again in your own words' : 'Explain it back in your own words'}</span><textarea id="f-item-input" data-bind="${bk(it)}.input" rows="6" placeholder="Type, or talk it through">${esc(it.input)}</textarea></label>
      <div class="row">${micBtn('f-item-input')}<button type="button" class="btn primary" data-act="${retry ? 'tb-retry-submit' : 'tb-submit'}" ${isBusy('item') ? 'disabled' : ''}>${retry ? 'Submit second try' : 'Submit explanation'}</button>
      ${!retry && tb.hints.length < 2 ? `<button type="button" class="btn" data-act="tb-hint" ${isBusy('item') ? 'disabled' : ''}>Hint (${2 - tb.hints.length} left, −10 each)</button>` : ''}
      ${retry ? '' : `<button type="button" class="btn ghost" data-act="tb-dunno" ${isBusy('item') ? 'disabled' : ''}>I don't know</button>`}</div>${micHint()}${busyHtml('item')}`;
  }
  if (tb.stage === 'probing') {
    const q = tb.probes[tb.pi];
    return head + convoHtml(tb) + `<div class="probe"><div class="row between"><span class="eyebrow">Follow-up ${tb.pi + 1} of ${tb.probes.length} · ${esc(cfg.probing)} probing</span><span class="row">${speakBtn('probe', 'Hear it', q)}${Voice.canSpeak() ? `<button type="button" class="btn sm ghost" data-act="voice-mute" aria-pressed="${cfg.voiceOn === false}">${cfg.voiceOn === false ? 'Unmute' : 'Mute'}</button>` : ''}</span></div><div class="qprompt">${inline(q)}</div></div>
      <label class="field"><span>Your answer</span><textarea id="f-item-input" data-bind="${bk(it)}.input" rows="3" placeholder="A few sentences">${esc(it.input)}</textarea></label>
      <div class="row">${micBtn('f-item-input')}<button type="button" class="btn primary" data-act="tb-probe-answer" ${isBusy('item') ? 'disabled' : ''}>Answer</button><button type="button" class="btn ghost" data-act="tb-probe-skip" ${isBusy('item') ? 'disabled' : ''}>Skip this one</button></div>${micHint()}${busyHtml('item')}`;
  }
  if (tb.stage === 'self') {
    return head + convoHtml(tb) + `<div class="answer-box"><span class="lbl">Grade yourself</span><div class="small">Claude isn't available, so tick each key point your explanation covered.</div>
      ${(card.rubric || []).map((p, i) => `<label class="tick"><input type="checkbox" id="tick-${i}" data-act-change="tb-tick" data-i="${i}" ${tb.ticks[i] ? 'checked' : ''}><span>${esc(p)}</span></label>`).join('')}</div>
      <div class="row"><button type="button" class="btn primary" data-act="tb-self-score">Score me</button></div>`;
  }
  const g = tb.grade || { points: [] }, r = it.res || {};
  const gap = (g.points || []).some(p => !p.hit);
  const offerRetry = tb.stage === 'scored' && gap && !tb.retried && g.reteach;
  return head + convoHtml(tb) + `<div class="scorebox"><div class="score num">${r.score == null ? '–' : r.score}<small>/100</small></div><div class="stack tight" style="flex:1;min-width:0"><b>${r.guess ? 'Counted as a miss (guess)' : r.verdict === 'correct' ? 'You\'ve got it' : r.verdict === 'partial' ? 'Partly there' : 'Not yet'}</b>
    ${g.feedback ? `<div class="small">${inline(g.feedback)}</div>` : ''}${tb.hints.length ? `<div class="small muted">Includes −${L.hintPenalty(tb.hints.length)} for ${plural(tb.hints.length, 'hint')}.</div>` : ''}${tb.retried ? `<div class="small muted">First try: ${tb.first}. The first try is what counts toward passing the unit.</div>` : ''}
    <span class="small muted">${r.ai ? 'Claude\'s grade' : 'Self-graded'}${r.overridden ? ', changed by you' : ''}</span></div></div>
    ${checklistHtml(card, g)}${g.misconception ? `<div class="flag small"><b>Watch for:</b> ${inline(g.misconception)}</div>` : ''}
    ${offerRetry ? `<div class="added prose">${addedTag('Re-teach of the gap, added by Claude')}${paras(g.reteach)}</div><div class="row"><button type="button" class="btn primary" data-act="tb-retry">Try once more</button><button type="button" class="btn ghost" data-act="tb-skip-retry">Skip the retry</button></div>`
      : `${leechHtml(it, card)}${rateRow(it, card)}${overrideRow(it)}${itemTools(it, card)}${nextBtn(it)}`}`;
}
function setRes(it, card, score, extra = {}) {
  const st = settingsFor(card.courseId).strictness;
  const rating = L.ratingFromScore(score, st);
  it.res = Object.assign({ score, verdict: L.verdictFromScore(score, st), rating, aiRating: extra.ai ? rating : null }, extra);
}
function normGrade(card, g) {
  const pts = L.arr(g && g.points, 8);
  return {
    points: (card.rubric || []).map((p, i) => ({ point: p, hit: !!(pts[i] && pts[i].hit === true), note: L.str(pts[i] && pts[i].note, 200) })),
    score: L.clamp(Math.round(Number(g && g.score) || 0), 0, 100), feedback: L.str(g && g.feedback, 700), reteach: L.str(g && g.reteach, 1200), misconception: L.str(g && g.misconception, 300)
  };
}
async function tbGrade(it, card, retry) {
  const tb = it.tb, cfg = settingsFor(card.courseId);
  const g = await task('item', 'Scoring your explanation…', signal => ai(P.gradeTeachback({ idea: ideaOf(card), turns: tb.turns, strictness: cfg.strictness, retry }), { signal }));
  if (!g) return false;
  tb.grade = normGrade(card, g);
  const score = L.finalScore(tb.grade.score, tb.hints.length);
  if (!retry) tb.first = score;
  setRes(it, card, score, { ai: true });
  if (retry && it.res.rating === 'easy') { it.res.rating = 'good'; it.res.aiRating = 'good'; }
  tb.stage = retry ? 'final' : 'scored'; it.phase = 'graded';
  return true;
}
function probeSay(tb) { if (Voice.on() && tb.probes[tb.pi]) Voice.speak(tb.probes[tb.pi], 'probe'); }

const ACT = {};
/* The lesson player and a review session each keep their own item, so opening a lesson never disturbs a session. */
const curItem = () => (S.route === 'learn' ? UI.litem : UI.item);
const curCard = () => { const it = curItem(); return it && S.cards[it.cardId]; };
Object.assign(ACT, {
  'item-reveal': () => { const it = curItem(); it.phase = 'graded'; it.res = { verdict: null, rating: null }; render(); },
  'item-dunno': () => { const it = curItem(); it.phase = 'graded'; it.res = { verdict: 'incorrect', score: 0, rating: 'again', ai: false }; render(); },
  'item-submit': async () => {
    const it = curItem(), card = curCard(); if (!card) return;
    if (!it.input.trim()) { if (aiOn()) { toast('Write an answer first, or tap "I don\'t know".'); return; } }
    if (!aiOn() || !it.input.trim()) { it.phase = 'graded'; it.res = { verdict: null, rating: null }; render(); return; }
    const g = await task('item', 'Grading…', signal => ai(P.gradeShort({ card, answer: it.input, strictness: settingsFor(card.courseId).strictness }), { signal, tier: 'quick' }));
    if (!g) return;
    setRes(it, card, L.clamp(Math.round(Number(g.score) || 0), 0, 100), { ai: true, reasoning: L.str(g.reasoning, 600), missing: L.arr(g.missing, 6).map(x => L.str(x, 200)).filter(Boolean) });
    it.phase = 'graded'; render();
  },
  'item-selfgrade': () => { const it = curItem(); it.phase = 'graded'; it.res = { verdict: null, rating: null }; render(); },
  'item-rate': el => { const it = curItem(); if (!it || !it.res) return; const r = el.dataset.r; if (it.res.rating !== r && it.res.aiRating) it.res.overridden = it.res.overridden || (it.res.aiRating === 'again' && r !== 'again'); it.res.rating = r; it.res.guess = false; render(); },
  'item-override': () => { const it = curItem(), card = curCard(); if (!it || !card) return; it.res = L.override(it.res, settingsFor(card.courseId).strictness); it.res.guess = false; render(); },
  'item-guess': () => { const it = curItem(); if (!it.res) return; it.res.before = { rating: it.res.rating, verdict: it.res.verdict }; it.res.guess = true; it.res.rating = 'again'; render(); },
  'item-unguess': () => { const it = curItem(); if (!it.res || !it.res.before) return; Object.assign(it.res, it.res.before, { guess: false }); render(); },
  'item-more': () => { const it = curItem(); if (it) { it.more = !it.more; render(); } },
  'item-snippet': () => { curItem().snippet = !curItem().snippet; render(); },
  'item-skip': () => afterItem(null),
  'item-next': async () => {
    const it = curItem(), card = curCard(); if (!it || !card || !it.res || !it.res.rating || isBusy('commit')) return;
    S.busy.commit = { label: 'Saving…', ctl: new AbortController() };
    const r = it.res, tb = it.tb;
    const done = await commitCard(it.cardId, { rating: r.rating, guess: r.guess, overridden: r.overridden, note: it.note, score: card.type === 'teachback' ? (r.overridden || !tb || tb.first == null ? r.score : tb.first) : r.score, given: tb ? tb.turns.filter(t => t.role !== 'tutor').map(t => t.text).join(' / ') : it.input, why: tb && tb.grade ? (tb.grade.points || []).filter(p => !p.hit).map(p => p.point).join('; ') : (r.missing || []).join('; '), mode: it.ctx.mode, bucket: it.ctx.bucket, kind: it.ctx.kind });
    delete S.busy.commit;
    if (!done) { render(); return; }
    Voice.stop();
    await afterItem(done);
  },
  'tb-tick': el => { const it = curItem(); if (it && it.tb) it.tb.ticks[+el.dataset.i] = el.checked; },
  'tb-dunno': () => { const it = curItem(), card = curCard(), tb = tbState(it, card); tb.grade = { points: (card.rubric || []).map(p => ({ point: p, hit: false })), feedback: 'Here are the key points. You\'ll see this idea again tomorrow.' }; tb.first = 0; tb.stage = 'final'; tb.retried = true; it.phase = 'graded'; it.res = { score: 0, verdict: 'incorrect', rating: 'again', ai: false }; render(); },
  'tb-hint': async () => {
    const it = curItem(), card = curCard(), tb = tbState(it, card); if (tb.hints.length >= 2) return;
    const n = tb.hints.length + 1, stored = (card.hints || [])[n - 1];
    let h = null;
    if (aiOn()) { const g = await task('item', 'Finding a hint…', signal => ai(P.hint({ idea: ideaOf(card), draft: it.input, n }), { signal, tier: 'quick' })); h = g && L.str(g.hint, 400); }
    h = h || stored || 'Look back at how the worked example moved from the starting numbers to the result.';
    if (tb.hints.length < 2) tb.hints.push(h);
    render();
  },
  'tb-submit': async () => {
    const it = curItem(), card = curCard(), tb = tbState(it, card), cfg = settingsFor(card.courseId);
    if (!it.input.trim()) { toast('Explain it in your own words first, or tap "I don\'t know".'); return; }
    tb.turns.push({ role: 'learner', text: it.input.trim() }); it.input = '';
    if (!aiOn()) { tb.stage = 'self'; render(); return; }
    const n = L.PROBES[cfg.probing] || 4;
    const g = await task('item', 'Reading your explanation…', signal => ai(P.probe({ idea: ideaOf(card), turns: tb.turns, n, level: cfg.probing, strictness: cfg.strictness }), { signal }));
    if (!g) { it.input = tb.turns.pop().text; render(); return; }
    tb.probes = L.arr(g.probes, n).map(x => L.str(x, 500)).filter(Boolean);
    if (tb.probes.length) { tb.stage = 'probing'; tb.pi = 0; render(); probeSay(tb); }
    else { if (!(await tbGrade(it, card, false))) it.input = tb.turns.pop().text; render(); }
  },
  'tb-probe-answer': async (el, ev, skip) => {
    const it = curItem(), card = curCard(), tb = it.tb; if (!tb || tb.stage !== 'probing') return;
    if (!skip && !it.input.trim()) { toast('Answer it, or tap "Skip this one".'); return; }
    const typed = it.input;
    tb.turns.push({ role: 'tutor', text: tb.probes[tb.pi] }, { role: 'learner', text: skip ? '(skipped)' : it.input.trim() });
    it.input = ''; tb.pi++; Voice.stop();
    if (tb.pi < tb.probes.length) { render(); probeSay(tb); return; }
    const ok = await tbGrade(it, card, false);
    if (!ok) { tb.pi--; tb.turns.splice(-2); it.input = typed; }
    render();
  },
  'tb-probe-skip': (el, ev) => ACT['tb-probe-answer'](el, ev, true),
  'tb-self-score': () => {
    const it = curItem(), card = curCard(), tb = it.tb, pts = card.rubric || [];
    tb.grade = { points: pts.map((p, i) => ({ point: p, hit: !!tb.ticks[i] })), feedback: '' };
    const score = L.finalScore(pts.length ? Math.round(100 * pts.filter((p, i) => tb.ticks[i]).length / pts.length) : 0, tb.hints.length);
    tb.first = score; tb.retried = true; tb.stage = 'final'; it.phase = 'graded'; setRes(it, card, score, { ai: false }); render();
  },
  'tb-retry': () => { const it = curItem(); it.tb.stage = 'retry'; it.tb.retried = true; it.input = ''; render(); },
  'tb-skip-retry': () => { const it = curItem(); it.tb.retried = true; it.tb.stage = 'final'; render(); },
  'tb-retry-submit': async () => {
    const it = curItem(), card = curCard(), tb = it.tb;
    if (!it.input.trim()) { toast('Give it one more try in your own words.'); return; }
    tb.turns.push({ role: 'tutor', text: tb.grade.reteach }, { role: 'learner', text: it.input.trim() }); it.input = '';
    const ok = await tbGrade(it, card, true);
    if (!ok) { it.input = tb.turns.pop().text; tb.turns.pop(); }
    render();
  },
  'item-master': async () => {
    const card = curCard(); if (!card) return;
    const group = card.ideaId ? cardsOf('ideaId', card.ideaId) : [Object.assign({ id: curItem().cardId }, card)];
    const on = !card.mastered, t = today();
    for (const c of group) await put('cards', c.id, on ? L.markMastered(c, t) : L.unmaster(c, t)).catch(() => { });
    toast(on ? `Marked mastered. It leaves daily review and checks in every ${L.MASTER_DAYS} days.` : 'Back in regular review.');
    if (on && curItem() && !curItem().ctx.lesson) await afterItem(null); else render();
  },
  'item-report': () => openModal('report', { cardId: curItem().cardId }),
  'item-explain': () => openExplain(curItem().cardId, false),
  'item-ask': () => openExplain(curItem().cardId, true),
  'item-rewrite': async () => {
    const it = curItem(), card = curCard(); if (!card) return;
    const g = await task('item', 'Rewriting the card…', signal => ai(P.rewriteCard({ card: { type: card.type, prompt: card.type === 'teachback' ? card.ideaTitle : card.prompt, answer: card.answer, rubric: card.rubric, explanation: card.explanation }, notes: card.overrideNotes }), { signal }));
    if (!g) return;
    const answer = L.str(g.answer, 2500), rubric = L.arr(g.rubric, 6).map(x => L.str(x, 300)).filter(Boolean);
    if (!answer || (card.type === 'teachback' && rubric.length < 2)) { toast('The rewrite came back unusable. The card is unchanged.', true); return; }
    const next = Object.assign({}, card, { answer, rubric: rubric.length ? rubric : card.rubric, explanation: L.str(g.explanation, 1200) || card.explanation, overrides: 0, offerRewrite: false, leech: false, misses: 0, rewrittenAt: Date.now() });
    if (card.type !== 'teachback' && L.str(g.prompt)) next.prompt = L.str(g.prompt, 2000);
    await put('cards', it.cardId, next).catch(() => { });
    toast('Card rewritten.'); render();
  }
});

/* ---------- Explain / Ask (every item) ---------- */
async function openExplain(cardId, askFirst) {
  const card = S.cards[cardId]; if (!card) return;
  UI.ex = { cardId, passage: '', explain: null, answer: null, image: null, ask: '', askFirst };
  openModal('explain', {});
  const unit = S.units[card.unitId];
  if (unit && card.quote) { try { UI.ex.passage = L.passageAround(await unitMaterial(unit, 200000), card.quote); } catch (e) { } if (UI.modal && UI.modal.kind === 'explain') render(); }
}
MODALS.explain = () => {
  const x = UI.ex, card = S.cards[x.cardId]; if (!card) return '<p>This item was removed.</p>';
  const res = r => r ? `<div class="stack tight">${partsHtml(r.parts)}${renderVisual(r.visual, 'Diagram added by Claude')}</div>` : '';
  return `<div class="row between"><h2>${esc(card.type === 'teachback' ? card.ideaTitle : 'About this item')}</h2><button class="btn sm ghost" data-act="close-modal">Close</button></div>
  <div class="stack"><span class="eyebrow">Where it came from</span>${card.quote ? `<div class="quote">“${esc(card.quote)}”</div>${x.passage ? `<details><summary class="small">Show the passage around it</summary><div class="prose small passage">${paras(x.passage)}</div></details>` : ''}` : `<div class="added small">${addedTag()}This item comes from Claude's own knowledge. There is no source passage.</div>`}</div>
  <div class="stack"><div class="row between"><span class="eyebrow">Explanation</span>${aiOn() ? `<button class="btn sm" data-act="ex-explain" ${isBusy('ex') ? 'disabled' : ''}>${x.explain ? 'Explain again' : 'Explain it'}</button>` : ''}</div>
  ${card.explanation ? `<div class="small">${inline(card.explanation)}</div>` : ''}${res(x.explain)}</div>
  <div class="stack"><span class="eyebrow">Ask a question</span>${aiOn() ? `<textarea id="f-ex-ask" data-bind="ex.ask" rows="2" placeholder="A quick question about this item">${esc(x.ask)}</textarea>
  <div class="row">${S.imagesOk ? `<label class="btn sm">Attach an image<input type="file" id="ex-image" accept="image/png,image/jpeg,image/webp" data-act-change="ex-image" hidden></label>${x.image ? chip('1 image attached', 'accent') : ''}` : ''}<button class="btn sm primary" data-act="ex-ask" ${isBusy('ex') ? 'disabled' : ''}>Ask</button></div>${res(x.answer)}` : needAI}</div>${busyHtml('ex')}`;
};
Object.assign(ACT, {
  'ex-explain': async () => {
    const x = UI.ex, card = S.cards[x.cardId]; if (!card) return;
    const tbc = card.type === 'teachback' ? card : S.cards[card.tbId];
    const g = await task('ex', 'Explaining…', signal => ai(P.explain({ card: { prompt: card.type === 'teachback' ? card.ideaTitle : card.prompt, answer: card.answer, rubric: card.rubric }, passage: x.passage || card.quote, lessonText: tbc ? tbc.answer : '' }), { signal }));
    if (g) { x.explain = { parts: g.parts, visual: g.visual }; render(); }
  },
  'ex-image': el => { const f = el.files && el.files[0]; UI.ex.image = f && /^image\//.test(f.type) ? f : null; render(); },
  'ex-ask': async () => {
    const x = UI.ex, card = S.cards[x.cardId]; if (!card) return;
    if (!x.ask.trim()) { toast('Type your question first.'); return; }
    const g = await task('ex', 'Thinking…', signal => ai(P.ask({ card: { prompt: card.type === 'teachback' ? card.ideaTitle : card.prompt, answer: card.answer }, question: x.ask.trim().slice(0, 2000), passage: x.passage || card.quote, hasImage: !!x.image }), { signal, images: x.image ? [x.image] : null }));
    if (g) { x.answer = { parts: g.parts, visual: g.visual }; render(); }
  }
});
MODALS.report = d => `<h2>Report a problem</h2><p class="small muted">The item stays in place until you edit or retire it under Reports.</p>
  <div class="field"><span>What's wrong?</span>${seg('rep.reason', [['wrong', 'It\'s wrong'], ['unclear', 'It\'s unclear'], ['broken', 'Something is broken']], ui('rep', () => ({ reason: 'wrong', note: '' })).reason)}</div>
  ${field('Note <span class="muted">(optional)</span>', areaIn('rep.note', UI.rep.note, 3))}
  <div class="row end"><button class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" data-act="report-save" data-card="${esc(d.cardId || '')}" data-lesson="${esc(d.lessonId || '')}" data-idea="${esc(d.idea == null ? '' : d.idea)}">Save report</button></div>`;
ACT['report-save'] = async el => {
  const r = UI.rep || { reason: 'wrong', note: '' };
  const k = S.cards[el.dataset.card], lu = (/^(.+)L\d+$/.exec(el.dataset.lesson || '') || [])[1], un = k ? k.unitId : lu, co = k ? k.courseId : (S.units[lu] || {}).courseId;
  await put('reports', L.uid('r'), { kind: 'user', unitId: un || null, courseId: co || null, cardId: el.dataset.card || null, lessonId: el.dataset.lesson || null, idea: el.dataset.idea === '' ? null : +el.dataset.idea, reason: r.reason, text: L.str(r.note, 1000), status: 'open', createdAt: Date.now() }).catch(() => { });
  UI.rep = { reason: 'wrong', note: '' }; UI.modal = null; toast('Reported. Find it under Progress, then Reports.'); render();
};

/* ---------- Sessions ---------- */
function startSession(o) {
  S.session = { kind: o.kind, title: o.title, ids: o.ids.slice(), idx: 0, firstCount: o.ids.length, requeued: [], results: [], mode: o.mode || 'review', bucket: o.bucket || 'none', back: o.back || 'home', day: today() };
  UI.item = o.ids.length ? newItem(o.ids[0], { mode: S.session.mode, bucket: S.session.bucket, kind: o.kind }) : null;
  go('review');
}
async function afterItem(saved) {
  const it = curItem();
  if (it && it.ctx.lesson) return lessonAdvance(saved);
  const s = S.session; if (!s) { render(); return; }
  if (saved) {
    const second = s.idx >= s.firstCount;
    if (!second) s.results.push(saved.lastSeen);
    if (saved.lastSeen === 'again' && !second && !s.requeued.includes(it.cardId)) { s.requeued.push(it.cardId); s.ids.push(it.cardId); }
  }
  s.idx++;
  const second = s.idx >= s.firstCount;
  UI.item = s.idx < s.ids.length ? newItem(s.ids[s.idx], second ? { mode: 'light', bucket: 'none', kind: s.kind } : { mode: s.mode, bucket: s.bucket, kind: s.kind }) : null;
  render(); window.scrollTo(0, 0);
}
function sessionHtml() {
  const s = S.session;
  if (s.idx < s.ids.length && UI.item) {
    const second = s.idx >= s.firstCount;
    return `<div class="reader"><div class="row between"><span class="small muted num">${esc(s.title)} · ${s.idx + 1} of ${s.ids.length}${second ? ' · second look at a miss' : ''}</span><button class="linkbtn small" data-act="session-end">End session</button></div>${bar(100 * s.idx / s.ids.length)}${itemHtml(UI.item)}</div>`;
  }
  s.seen = true;
  const counts = L.RATINGS.map(k => [k, s.results.filter(x => x === k).length]);
  const d = dayRec(), plan = todayPlan(), extra = s.kind === 'review' || s.kind === 'extra' ? todayPlan({ cap: L.EXTRA, used: d.extra, restDay: false }) : null;
  return `<div class="reader stack-lg"><div class="stack"><span class="eyebrow">Session done</span><h1>${plural(s.results.length, 'item')} reviewed</h1></div>
  <div class="panel stack">${s.kind === 'review' || s.kind === 'extra' ? meter(Math.min(d.units, L.CAP), 0) : ''}<div class="row">${counts.map(([k, n]) => chip(RATE_LABEL[k] + ' ' + n, k === 'again' ? 'bad' : k === 'hard' ? 'due' : k === 'good' ? 'good' : 'accent')).join('')}</div>
  ${s.requeued.length ? `<p class="small muted">${plural(s.requeued.length, 'miss', 'misses')} shown again at the end, and due again tomorrow.</p>` : ''}
  <div class="row">${s.kind === 'review' && plan.items.length ? '<button class="btn primary" data-act="review-start">Keep going</button>' : ''}
  ${extra && !plan.items.length && extra.items.length ? `<button class="btn" data-act="review-extra">Do ${Math.min(L.EXTRA, extra.unitsPlanned)} more units</button><span class="small muted">Optional. Doesn't affect your streak.</span>` : ''}
  <a class="btn" href="#${esc(s.back)}">Done</a></div></div></div>`;
}
Object.assign(ACT, {
  'session-end': () => { const s = S.session; if (s) { s.ids = s.ids.slice(0, s.idx); UI.item = null; } Voice.stop(); render(); },
  'review-start': () => { const q = todayPlan(); if (!q.items.length) { render(); return; } startSession({ kind: 'review', title: 'Daily review', ids: q.items.map(c => c.id), mode: 'review', bucket: 'cap', back: 'home' }); },
  'review-extra': () => { const q = todayPlan({ cap: L.EXTRA, used: dayRec().extra, restDay: false }); if (!q.items.length) { render(); return; } startSession({ kind: 'extra', title: 'Extra round', ids: q.items.map(c => c.id), mode: 'review', bucket: 'extra', back: 'home' }); },
  'rest-override': () => { UI.restOverride = true; render(); }
});
VIEWS.review = () => {
  if (S.session && S.session.day === today()) return sessionHtml();
  const d = dayRec(), q = todayPlan(), cfg = settingsFor(), extra = todayPlan({ cap: L.EXTRA, used: d.extra, restDay: false });
  const mix = k => q.items.filter(c => c.type === k).length;
  return `<div class="reader stack-lg"><div class="stack"><span class="eyebrow">Daily review</span><h1>${q.restDay ? 'Rest day' : q.items.length ? `${q.unitsPlanned} units due` : d.done ? 'Done for today' : 'Nothing due right now'}</h1></div>
  <div class="panel stack">${meter(Math.min(d.units, L.CAP), q.unitsPlanned)}
  <p class="small muted">The daily window holds ${L.CAP} units. A flashcard or short answer costs 1; a teach-back or apply-it costs 3. Exam-deadline courses come first, then the oldest due.${q.backlog && !q.restDay ? ` ${plural(q.backlog, 'more item')} wait for tomorrow.` : ''}</p>
  ${q.restDay ? `<p>Today is one of your rest days, so your streak is safe and ${plural(q.dueTotal, 'due item')} roll to tomorrow.</p><div><button class="btn" data-act="rest-override">Review anyway</button></div>`
    : q.items.length ? `<div class="row"><button class="btn primary" data-act="review-start">Start review</button><span class="small muted">${[['teachback', 'teach-back'], ['apply', 'apply-it'], ['short', 'short answer'], ['flash', 'flashcard']].filter(([k]) => mix(k)).map(([k, l]) => plural(mix(k), l)).join(' · ')}</span></div>`
      : `<p>${activeCards().length ? 'Come back tomorrow, or keep going with a lesson.' : 'Cards appear here after you finish your first lesson.'}</p>${extra.items.length ? `<div class="row"><button class="btn" data-act="review-extra">Do ${Math.min(L.EXTRA, extra.unitsPlanned)} more units</button><span class="small muted">Optional extra round, once a day. ${plural(extra.dueTotal, 'item')} still due. Doesn't affect your streak.</span></div>` : ''}`}
  </div><p class="small muted">Target retention ${Math.round(cfg.retention * 100)}%. Probing: ${esc(cfg.probing)}. Change these in Settings (the gear icon).</p></div>`;
};
