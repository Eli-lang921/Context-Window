# Artifact runtime APIs (contract 0.2.92), condensed

Read 2026-11-26 from the claude-artifacts `describe_capabilities` tool. If that tool is available in your session, re-read the full text; this is a summary.

## General
- `const x = await claude.use("name")` → namespace or `null` (unavailable; design for absence). Resolves after first script run; `null` after ~10 s with no viewer.
- `window.claude` only has `use`. Never read other members; never mutate a namespace.
- Consent prompts, rate limits and refusals arrive on the first *call*, not on `use()`.
- Values from Claude, connectors, db: never markup. Escape before building HTML.

## db
- Firestore-like: `db.collection(path)`, `db.doc("col/id")`; `get/set/update/delete`, `where/orderBy/limit`, `onSnapshot`.
- Even path segment counts are docs, odd are collections. 256 KB per doc, 25,000 docs per artifact.
- Rule for this app: `{db: {rules: [{path: "", read: "owner", write: "owner"}]}}`.
- Subscribe once per query, never in render; one write at a time per doc.

## sample (ask Claude)
- Declare `{sample: {images: true}}` (needed for photo ingest and image questions).
- `await sample(input, opts)` → `{text, truncated}`; `await sample.json(input, opts)` → parsed value.
- `input`: string, or `[{role:"user"|"assistant", content}]` starting and ending on user. No system role: put instructions in a leading user turn. Memoryless.
- opts: `onText({text, delta})` (text = whole answer so far), `signal` (new AbortController per call), `images: Blob[]` (check `(await sample.limits()).images`), `modelTier: "quick"|"default"|"complex"`, `cache` (default 5-min replay; use `false` for chat, regenerate, fresh tests), `tools` (page functions; never cached).
- Max 256 KiB of input text per call.
- Errors: rejected `{code, message, text?}`. Hide feature on `not_granted`, `sampling_disabled`, `not_declared`, `capability_disabled`, `capability_removed`; hide image UI only on `images_unavailable`; tell viewer on `rate_limited`, `session_expired`, `image_rejected`, `refused` (clear partial), `empty_completion`, `invalid_json` (offer Try again), `upstream_error`. **Never retry from a loop.** Call only on a user action or once at load with a stable prompt.
- Timing: default tier thinks 5-60 s before text. Show "Thinking..." and a Stop button.

## tts (Claude voice)
- Declare `{tts: {}}`. `null` in the Claude phone apps and Safari → fall back to `window.speechSynthesis`.
- `await t.speak(text, {voice, rate})`, text ≤ 2,000 chars; or `t.speak([{text, voice}, ...])` for a long reading; `t.add([...])` appends.
- Voices: "buttery" (default), "airy", "glassy", "rounded". Rate 0.7-1.5.
- `t.onState`, `t.onLine`, `t.pause/resume/stop`. Works only after the viewer clicked/typed. Rejects `busy` while dictating; `not_granted` → hide the control. Keep text on screen.

## dictation (voice input)
- Declare `{dictation: {}}`. `null` in some apps → hide mic, keep typing.
- Call `d.start()` directly from the click (nothing awaited before it); catch its promise.
- `d.onPartial(({text}))` replaces live guess; `d.onFinal(({text}))` appends; `d.onState` drives the button; `await d.stop()`.
- `not_granted` → never ask again; `dismissed` → may retry on a later click.

## mcp (Eli's connectors)
- Declare `{mcp: {servers: [{server: "Vault", tools: ["search_notes","read_note","list_notes"]}, {server: "Google Drive", tools: ["search_files","read_file_content"]}, {server: "Notion", tools: ["notion-search","notion-fetch"]}]}}`.
- Actions: `await mcp.callTool(server, tool, input)` → read `result.payload`. Display: `watchTool(...)`.
- Failures reject (`tool_error`, `server_not_connected`, authz errors). Retry only errors marked `retryable`. Use `describeTool` for exact args.

## downloads
- Declare `{downloads: {}}`. `await downloads.save({filename, data})`; `declined` = user said no; fall back to a copy-box.
