# Context Window v2

A study app that runs as a single claude.ai artifact: courses built from a goal, teach-back lessons, FSRS spaced review capped at 20 units a day, practice tests, cram mode, games, a tutor, a mind map and a weekly report.

- `SPEC.md` is the product spec (source of truth). `CLAUDE.md` holds the build instructions. `RUNTIME_API.md` summarizes the artifact runtime.
- `src/` is the source. `dist/context-window.html` is the one file that gets published.

## Build and test

Needs Node.js 20 or newer. The smoke test also needs Playwright with Chromium.

```powershell
.\build.ps1
node --test tests/logic.test.js
node tests/smoke.js
```

## Layout

| Path | What it holds |
| --- | --- |
| `src/logic.js` | Pure rules: FSRS-5 scheduling, the daily queue, streak and rest days, XP, badges, scoring, validators for Claude's output |
| `src/prompts.js` | Every prompt sent to Claude |
| `src/store.js` | Database wrapper with an in-memory fallback, backup and restore |
| `src/ai.js`, `src/voice.js`, `src/connectors.js` | Claude calls, voice in and out, Vault / Google Drive / Notion pickers |
| `src/views/` | Screens |
| `tests/logic.test.js` | Tests for the rules |
| `tests/smoke.js` | Drives a whole course in a headless browser against a mocked Claude |

## Decisions made on top of the spec (2026-11-27)

- The study day resets at 3 a.m.
- A unit passes when the average first-try teach-back score reaches the pass mark (lenient 60, standard 70, strict 80).
- After the 20-unit cap there is an optional extra round of 10 units that does not affect the streak.
- A full exam simulation is written in batches of 20 while you answer.
- Settings has "Back up everything" and "Restore from a backup file".
- Round 2 (see SPEC.md section 12): Add learning with a filing plan, per-addition depth, tutor feedback turned into weak spots, three-tab navigation, calmer look.
