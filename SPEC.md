# Context Window v2: product spec

Source: an 84-question interview with Eli on 2026-11-26. Every rule below is his answer unless marked **[assumption]** (he left it open; flagged so he can change it). Benchmark product: StudyFetch. Also borrows from NotebookLM, ChatGPT Study Mode, Khanmigo, Anki (FSRS).

Eli is not a developer. He uses a Windows PC and a phone equally (phone for review, PC for lessons).

---

## 0. Platform and data

- Stays a **claude.ai artifact** (not a standalone website). Runs on Eli's Claude plan, no API key.
- Existing artifact: slug `0e54b446-af7a-4cf2-971b-8ab318050a8d`, URL https://claude.ai/artifact/2me4YGGE8sCw6o3ufYkiVA, runtime contract `0.2.92`. Publish v2 as a new version of this same artifact.
- **Old data: wipe.** Eli confirmed on 2026-11-26 that the 19 existing db documents (v1 sources, lessons, questions, review history) should be **permanently deleted**. Confirm once more in the build session before deleting (different session; deletion cannot be undone).
- Sharing is currently "public link". Data is owner-only, so outsiders see an empty shell. The build tools cannot change sharing; tell Eli he can set it to private from the artifact's share menu.
- Capabilities to declare (whole declaration): `db` (rule: path "" read owner, write owner), `sample` with `images: true`, `downloads`, `tts`, `dictation`, `mcp` (see section 3). Order: existing page gaining capabilities → declare first, then publish.

## 1. Courses (the core new concept)

- Subjects: **anything**: AI/tech, finance/investing/business, college and CLEP exam courses, general.
- A course is **goal-first**: Eli states a goal (e.g. "pass Microeconomics CLEP"), the AI drafts a syllabus of units.
- Course setup asks: goal + why it matters to him, current level (beginner / some / rusty), minutes per day available, exam format details (length, question style, passing score), optional target date (deadline), syllabus source, grading strictness.
- **Syllabus source is chosen per course and can be mixed**: official outline Eli pastes (e.g. College Board CLEP outline, Modern States order), AI's own knowledge, his own material. Example mix: official outline as skeleton, his notes as content, AI fills gaps.
- **Eli reviews and edits the syllabus before anything is built**: reorder, rename, add, cut units.
- **Gap filling**: when a unit has thin or no material from him, AI fills from its own knowledge, **clearly labeled** "added, not from your source", followed by an **AI self-check pass** that flags shaky claims.
- **Unit size**: 30-45 minutes, 3-5 short lessons, one sitting.
- **Soft gates**: the app recommends passing a unit before the next, but he can skip ahead.
- **Optional placement test** at course start: 1-2 short teach-back prompts per unit, ~10 min. Units he aces become "review only".
- **Deadline optional**. With a deadline, the course paces lessons + review into a daily plan sized to his minutes/day. Without one, self-paced.
- **Cram mode**: suggested ~5 days before a course's deadline; he chooses whether to turn it on. Cram = high-yield items only.
- Several courses can run at once.
- **Course mind map** (from NotebookLM): clickable map of units and ideas, each node colored by how well he knows it; clicking opens the lesson or reviews it.
- **Study guide / cheat sheet** per unit, exportable to Obsidian Markdown. **[assumption: Q83 no preference]**
- **Mistake notebook**: every miss logged with why; reviewable before tests. **[assumption: Q83 no preference]**

## 2. Lessons: teach-back first

- "The majority of teaching" is **teach-back**. Flow: **learn, then explain**.
- Chunk size: **one key idea (~200-300 words)** plus its visual or example, then Eli explains it back.
- Every key idea is taught in a fixed shape: **analogy → how it works (key terms in bold) → worked example with real numbers → why it matters**. Short ideas skip the analogy.
- Visuals: **one per key idea where it helps** (diagram, chart, table). v1's validated visual shapes (flow, compare, steps, table, layers, spectrum) can be reused; add a simple chart shape for numbers.
- Teach-back prompt styles **rotate**: explain to a beginner / give your own example / predict what happens if... / compare two ideas.
- Answer by **typing or talking, his choice** (dictation mic button).
- AI response: **probe, then score**. Probing depth is a setting with **3 levels**: Light = 1-2 follow-ups, Standard = 3-4, Deep = up to 6 plus edge cases and "why" chains. (He said it can be more than 1-2.)
- Score display: **rubric checklist (each key point hit/missed) + 0-100**.
- **Hints**: up to 2 per teach-back, each with a small score cost, nudging without giving the answer.
- If key points are missed: **re-teach the gap (short targeted re-explanation), retry once**; still weak goes to review.
- In voice mode, the tutor's follow-up questions are **spoken aloud in a Claude voice, with a mute toggle**.
- Strictness of grading is **per course** (strict for exams, lenient for casual), via settings override.

## 3. Adding material

All of these:
- Paste text; PDF upload (v1 already does both with pdf.js).
- **Photos** of textbook pages or handwritten notes → Claude reads the image (`sample` with images).
- **YouTube / web links** via chat hand-off (the page cannot fetch URLs): Eli pastes the link to Claude in a chat, Claude writes the transcript/text into the artifact's `inbox` collection. Keep v1's inbox contract: `{title, kind, text, createdAt, optional group/part}`.
- **Pull from Obsidian vault, Google Drive, Notion**. He picks the source **when creating a course or learning session**. Declare `mcp` servers:
  - `Vault`: `search_notes` {query, limit}, `read_note` {path}, `list_notes` {dir?}
  - `Google Drive`: `search_files` {query (Drive query syntax, e.g. `fullText contains 'elasticity'`), pageSize}, `read_file_content` {fileId}
  - `Notion`: `notion-search` {query, page_size}, `notion-fetch` {id}
  Confirm exact tool names/args with `describeTool` at runtime; handle `server_not_connected` by hiding that source.
- **Long material auto-splits** into several ordered lessons (v1 cut silently at 100,000 characters). `sample` input cap is 256 KiB per call.
- Generated questions: **AI self-check pass, then auto-add**. A second AI pass checks each item against the source; flagged items wait for his approval. (Replaces v1's approve-every-question flow.)

## 4. Daily spaced review

- Scheduler: **switch from SM-2 to FSRS**, target retention setting default 90%.
- **Daily cap stays 20 units** (he chose this twice, knowingly accepting fewer teach-backs per day). Not a setting. Applies to spaced review only; tests, games and cram are on top.
- Unit costs: flashcard 1, short answer 1, **teach-back 3**, apply-it 3. (~5-6 teach-backs/day max.)
- Mix: **teach-back is most of review**; the rest is **AI-balanced by weakness** (flashcards for terms, short answer for facts, apply-it for skills).
- **One mixed queue** across all courses; deadline courses get priority; topics interleaved; oldest-due first (as v1).
- **Mastery is never automatic.** Only Eli marks an idea mastered. Everything else keeps going through review intervals. Mastered ideas leave daily review and get a **rare check-in every ~60 days**.
- Misses: **re-show at session end + tomorrow** (v1 behavior).
- **Leeches** (4+ misses): re-show the lesson snippet and offer a clearer rewrite of the card.
- After a teach-back, **AI sets the rating** (score → Again/Hard/Good/Easy) and he can override with one tap.
- **Grade override everywhere**: on any AI-graded item (teach-back, short answer, tests, games) he can flip a fail to correct. One tap; optional "why" note. If he overrides the same question **2+ times**, offer a rewrite of its model answer/rubric using his notes.
- **"That was a guess" button** on every correct answer. Effect: **treated as a miss** (same as Again: end of session + tomorrow; not counted as correct).
- No pre-answer confidence rating (he said the guess button is enough).
- **Explain button on every item** (not just misses), showing the exact source passage it came from. Plus a separate **"Ask a question"** button for a quick question instead of the full explanation. Both support **diagrams in the answer** and **attaching an image** to the question.
- Games and practice tests affect the schedule **only through misses**: a miss pulls that card's review earlier; hits don't push it later.

## 5. Practice tests, cram, games

- **Practice tests**: both a quick 15-20 min test and a **full exam simulation** (e.g. CLEP length, timed).
- Test questions are **generated fresh each test** from course material.
- **Multiple choice is optional, switched per test/session** (not per course). Daily review stays recall-based.
- Scoring: **percent score + per-question review**: weak units listed, every miss explained, misses go into review.
- **Games (all four)**: Match (terms ↔ definitions, timed), Fill the blank (key word removed from a real source sentence), Speed round (60 s rapid recall, beat your best), Jeopardy-style board (categories = units, points = difficulty).

## 6. Tutor

- Always-available tutor chat (like StudyFetch's Spark.E). Scope: **current course first, then all his material**; general knowledge always labeled (v1's source/general parts).
- Tutor **remembers his weak spots** (gets the mistake-notebook summary in its prompt). **[assumption: Q83 no preference]**
- Voice: dictation in, Claude voice out, mute toggle.

## 7. Audio

- **Read-aloud** on any lesson, and an **audio recap of 3-5 minutes per unit**, **single narrator** (not two-host).
- `tts` is not offered in the Claude phone apps or Safari → **fall back to the phone browser's built-in `speechSynthesis` voice**.
- `tts.speak` takes up to 2,000 characters per line; pass a recap as an array of paragraph lines.

## 8. Motivation and reporting

- **Daily streak**: kept by finishing the day's due review (or the whole 20-unit cap if more is due).
- **Weekly rest days he picks** don't break the streak; their due cards roll to the next day.
- **XP weighted to effort**: teach-back and tests earn most, flashcards least; bonuses for streaks and passing units. A "That was a guess" earns no XP.
- **Badges**: streak milestones (7/30/100 days), unit and course completion, teach-back quality (e.g. 10 scores of 90+), test scores (passing a full exam sim).
- **No playful extras**: no confetti, no sound effects, no level-up animations, no goal ring (he answered "nothing" to that question).
- **Look: playful, StudyFetch-like** (brighter colors, more color-coding, rounded, game-feel badges) but **no mascot**.
- **Weekly progress report, in-app page only**: time studied + streak, accuracy by course and unit, weakest ideas + suggested focus, deadline pace (on track / behind per course).
- Daily phone reminder: wanted, set up as a scheduled task **after** the build; Eli gives the time then.

## 9. Settings

- **Global defaults + per-course overrides.** At minimum: probing level (Light/Standard/Deep), grading strictness (lenient/standard/strict), FSRS target retention, rest days, voice (on/mute, voice name, rate), syllabus source mix, default material sources.

## 10. Kept from v1

- Labeling of added content ("Added background, not from your source"), source-issue flags ("Your source may be wrong here"), Reports page for flagged items with "copy all for a chat", Obsidian Markdown export, glossary tap-to-define, no-JS-markup safety (escape all AI/connector text), graceful absence of every capability (`claude.use()` can return null).

## 11. Not in scope (for now)

- Debate mode (Khanmigo-style). **[assumption: Q83 no preference]**
- Two-host podcast recaps, explainer videos, live lecture recording.
- Standalone website.

---

## 12. Round 2 (2026-11-27): Add learning, simpler screens, calmer look

Eli's answers in a second interview. Where this section conflicts with sections 1-10, this section wins.

- **Use case**: Eli is taking a course called AI Cred (an AI tutor that teaches, grades and gives personalized feedback). He pastes what he learned into Context Window, which teaches it, reviews it and organizes it. A course must keep growing as he adds more.
- **What he pastes**: lesson content, his own notes, his answers with the tutor's feedback, whole AI chats and transcripts. The app must cope with a raw mix of these.
- **Add learning** is the main action (header button, Today, every course): pick a course (or name a new one), paste or bring text in (file, photos, chat hand-off, Vault, Drive, Notion), optionally name the module, pick the depth.
- **Plan first**: Claude proposes where the paste goes before anything is built. Eli can change the target module, rename or drop topics, untick weak spots, then approve. Discarding removes the pasted material.
- **Depth chosen per addition**: short refresher (default; condensed recap then teach-back), full lesson (as section 2), or review cards only (no lesson to sit through; the ideas' cards are due the same day).
- **Organization**: a unit is a module (he names it, or Claude infers it); lessons inside it are topics. A paste for an existing module extends that module instead of creating a duplicate. Ideas the course already covers are listed as skipped, not rebuilt.
- **Feedback becomes weak spots**: explicit corrections in pasted tutor feedback are logged in the mistake notebook (kind "Tutor feedback") and each gets a review card aimed at the gap, due the same day. Praise is ignored. Claude must not invent gaps.
- **Course log**: each course lists what was added and when.
- **Quick start**: a new course needs only a name. Deadline, exam details, strictness and the goal-first syllabus planning of section 1 stay available under "More options".
- **Navigation**: three tabs (Today, Courses, Progress). Settings is a gear icon. The course page is one page: Continue, Add learning, Tutor, Mind map, then the modules; practice tests, games, cram, placement, sources, module editing and options sit in a "More tools" menu. Mistake notebook, reports and badges are tabs under Progress. On an item, Explain stays visible; Ask, Mark mastered and Report fold under "More".
- **Look**: calmer and more minimal (mostly neutral, one accent, flat cards, quieter type). This replaces "playful, StudyFetch-like" in section 8. Badges and XP stay, toned down.
- **Model for building (added 2026-11-27)**: Eli chooses which Claude builds a course: Fast, Balanced (default), Most capable, Fable 5.2, or any model id he types. The choice sits in Settings and on the Add learning screen. It applies to filing plans, syllabus, lessons, the self-check and study guides; grading, hints and the tutor keep the standard model. A named model that cannot answer falls back to a tier without an error, and "Test this choice" shows which model actually answered.

## 13. Round 3 fixes (2026-11-27, from grading a real AI Cred course build)

Three independent graders scored the first generated AI Cred course 64 (fidelity), 46 (teaching) and 55 (product). These rules fix the causes:

- **Three kinds of pasted content**: concepts become topics to learn; exercise instructions and done-when criteria become a per-module **exercise checklist** (tick boxes, never review cards); facts about the learner (scores, projects, strengths) become an **About you** note on the course, used only to make examples personal.
- **One idea, taught once**: every lesson build is told what the rest of the course teaches and how the course glossary defines its terms.
- **Weak spots**: filed under the module they belong to. If a planned topic teaches the gap, that topic is aimed at it and no separate card is made; otherwise one review card that makes the learner do the skill. Praise and small polish on strong answers are not weak spots. Limit 24 per paste.
- **Gaps the material names but does not teach** may go in one module ("From your assessment"), taught from Claude's own knowledge and labelled as added.
- **Self-check repairs**: the second pass returns fixes (relabel as added, replace text, drop a card), which are applied before the learner sees the topic. Only what it cannot fix stays as an open flag in plain language.
- **Lesson rules**: hard word limit per idea; examples use only facts the material states about the learner (invented figures only inside "Suppose"); key points are claims, not logistics; hints never state a key point; at most one extra card per idea; near-duplicate cards are dropped across the course.
- **Screens**: the course page shows the next topic, the exercise checklist, a "From your tutor's feedback" row and About you; the mind map is a module > topic > idea outline; on phones the Tutor sits in the tab bar.
