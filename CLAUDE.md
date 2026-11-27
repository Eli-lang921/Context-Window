# Build instructions: Context Window v2

You are building v2 of Eli's "Context Window" study app, a single-page claude.ai artifact. Read `SPEC.md` first; it is the source of truth (84 answers from Eli). `RUNTIME_API.md` has the artifact runtime APIs you need. Eli is not a developer: do the work yourself, give him short plain-language updates, and give any commands he must run as PowerShell.

## v1 reference (optional)

v1 is the live artifact (slug above). If you have the `claude-artifacts` tools, `read_artifact` it to reuse its
visual renderer (flow/compare/steps/table/layers/spectrum), PDF text extraction (pdf.js 3.11.174 from cdnjs),
inbox hand-off, glossary popovers and error-copy map. If not, build from SPEC.md; v2 is a rewrite anyway.

## Ground rules

1. **Ask before**: permanently deleting the old db data (he confirmed in an earlier session; confirm once more here), publishing, or changing the artifact's capabilities. Everything else, proceed.
2. **One build, all features** (Eli chose this over phases). Still work in the order below and keep tests green between steps.
3. Never invent connector tool arguments; use `describeTool` at runtime or the names in SPEC.md section 3.
4. All text from Claude, connectors or the db is data: escape `& < > " '` before it joins HTML. Links only if they start with `https://`.
5. Every capability can be `null`. The page must render and work (review, self-grading) with no AI, no db (in-memory store with a warning banner), no voice.

## Project layout to create

```
src/
  logic.js      pure functions, no DOM: FSRS, queue (20-unit cap, costs), streak + rest days, XP, badges,
                leech detection, guess/override effects, test scoring, text chunking, validators
  prompts.js    every Claude prompt (each starts with a TASK line, demands JSON only)
  store.js      db wrapper + in-memory fallback, write chains per doc
  ai.js         sample wrapper: error-code copy, abort, image support, JSON validation
  voice.js      tts with speechSynthesis fallback; dictation mic button
  connectors.js Vault / Google Drive / Notion pickers via mcp
  views/*.js    home, courses, course-setup wizard, syllabus editor, course page, mind map, lesson player
                (learn → teach-back → probe → score → re-teach/retry), review session, practice test,
                cram, games (match, fill-blank, speed, jeopardy), tutor drawer, mistake notebook,
                study guide, weekly report, stats, badges, reports, settings
  style.css     calm and minimal (SPEC.md section 12), no mascot, no confetti/sounds/level-up animations
tests/
  logic.test.js node tests for every logic.js function
  smoke.js      loads dist/context-window.html in a headless browser with a mocked window.claude
build.ps1 / build.sh   concatenate into dist/context-window.html (one self-contained file)
```

## Data model (db collections; doc size limit 256 KB, 25,000 docs)

courses, units, sources, srctext (chunked, ~90k chars per doc), lessons (per unit lesson: ideas[] with
analogy/mechanism/example/why/visual), cards (type: teachback|flash|short|apply; FSRS state; attempts;
overrides; guessCount; mastered; leech), tests (results), mistakes, glossary, inbox (chat hand-off, keep v1
contract), reports, settings (global doc + per-course override doc), meta (streak, xp, badges, daily units,
study minutes, rest days).

## Build order

1. `logic.js` + tests first. FSRS: implement FSRS-4.5/5 default weights with target retention (default 0.9);
   test that intervals grow on Good and reset on Again. Queue: 20-unit cap, costs flash/short 1, teachback/apply 3,
   deadline courses first, oldest-due first, interleave courses/topics, skip items that don't fit for smaller ones.
   Guess = Again. Override flips verdict and recomputes rating. 2+ overrides on one card → flag "offer rewrite".
   4+ misses → leech. Mastered → due every ~60 days and excluded from daily queue.
   Streak: day counts when due review is finished (or cap reached); rest days skip and roll due cards forward.
2. Prompts: syllabus (from goal + chosen source mix), unit plan, idea lesson (fixed 4-part shape + visual),
   teach-back prompt (rotating styles), teach-back grader (rubric checklist, 0-100, probes per level, hint),
   re-teach gap, card generation, self-check verifier, placement, practice test (MC on/off per session),
   cram selection, explain (with source quote + optional visual), ask-a-question (optional image),
   audio recap script (450-750 words, single narrator), study guide, weekly report summary, tutor.
   Mark every AI-added claim `origin: "added"`.
3. Store + AI + voice + connectors modules.
4. Views, in this order: settings → course setup + syllabus editor → lesson player → review → tests/cram →
   games → tutor → mind map → reports/notebook/guide → weekly report/stats/badges → home.
5. Build, run `tests/logic.test.js` and `tests/smoke.js` (every route renders, no console errors, a mocked
   teach-back round-trip works, a mocked review session updates FSRS state).
6. **Independent review** (Eli asked for this): spawn a separate agent that has not seen your work, give it
   SPEC.md and dist/context-window.html, ask it to list every spec item that is missing, wrong or broken,
   plus bugs and safety issues (unescaped AI text, loops calling Claude, no-null-capability crashes).
   Fix what it finds; re-run tests.
7. Publish (below), then tell Eli in 3-5 lines what changed and what to try first.

## Publishing: two paths

**Path A: this session has the `claude-artifacts` tools** (look for tools named like `mcp__claude-artifacts__publish_version`).
1. `read_declaration` on slug `0e54b446-af7a-4cf2-971b-8ab318050a8d`.
2. Confirm the wipe with Eli, then delete every doc in the v1 collections (sources, srctext, lessons, progress,
   drafts, questions, topics, glossary, reports, inbox, meta). Use the db tools; list each collection first.
3. `declare_capabilities` with the full set from SPEC.md section 0 (shared_live: "public" while it is public).
4. `publish_files` (or `publish_version`) with dist/context-window.html as index.html, base_version from step 1.
5. Open it with the db tools to check it reads/writes.

**Path B: no artifact tools here** (likely in the local terminal; unverified).
Finish at dist/context-window.html, then tell Eli exactly this:
> "Open a chat in your AI CRED learning project on claude.ai, attach `dist/context-window.html`, and say:
> Publish this as the new version of my Context Window artifact. Follow CLAUDE.md Path A steps 1-5. I confirm the wipe."

## Done means

Every SPEC.md item either works or is listed to Eli as not done with the reason. Tests pass. Reviewer findings fixed or explained.
