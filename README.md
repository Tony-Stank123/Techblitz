# TECH BLITZ — The Jane Protocol (frontend)

Frontend prototype for **TECH BLITZ**, a solo, timed technical-investigation event. Players act as Patrick Jane, work through four detectives' cases (Cho, Rigsby, Van Pelt, Lisbon — two puzzles each) for the **Frostpeak Lodge** case, then name the killer.

> **Status:** complete frontend prototype. **No backend is integrated yet.** All submissions go to a local mock (see *Mock vs real*). Audit results: [`QA-REPORT.md`](QA-REPORT.md).

---

## 1. Technology stack

| Layer | What it is |
|---|---|
| App | **One self-contained file:** `tech-blitz-jane-protocol.html` (HTML5 + CSS + vanilla JavaScript, ES2022). No framework, no build step, no runtime dependencies. |
| Routing | Hash routes (`#/briefing`, `#/challenge/cho-a`, …) handled by `render()` in the same file. |
| Images & fonts | Embedded in the HTML as `data:` URIs. Source files live in `assets/` (byte-identical, checked by `npm test`). |
| Fonts | Bebas Neue, Inter, IBM Plex Mono (SIL Open Font License 1.1), **bundled**, so the site works with no internet. Google Fonts is linked only as a secondary fallback. |
| Tooling (dev only) | ESLint 8 + eslint-plugin-html, html-validate 8, Playwright 1.56, axe-core 4 — used **only** for the QA commands below. |

## 2. Prerequisites

- **To run the app:** any modern browser. Nothing else.
- **To run the QA commands:** Node.js **18+** and npm. The browser tests need Chromium (installed with `npm run test:install`).

## 3. Install

```bash
npm ci                 # installs the pinned dev tools from package-lock.json
npm run test:install   # one-time: downloads Chromium for the browser tests
```

## 4. Run locally

```bash
npm start              # serves the project at http://localhost:8080  (PORT=xxxx to change)
```

Or simply **open `tech-blitz-jane-protocol.html` in a browser**. It works straight from disk.

`npm start` uses a tiny zero-dependency server (`qa/serve.mjs`) that refuses to serve anything under `puzzles/server-only/`.

## 5. Lint, validate, test

| Command | What it does |
|---|---|
| `npm run lint` | ESLint (`eslint:recommended`) on the inline JavaScript |
| `npm run validate` | html-validate (recommended rules) on the HTML file |
| `npm test` | 13 automated checks, **run offline** (all network blocked): answer-key leak scan, data/asset integrity, every route, fonts, overflow at 3 widths, clock, submit flow, evidence, deduction, axe accessibility |
| `npm run check` | All three in sequence |

There is **no production build**: the HTML file *is* the deliverable. To deploy, serve `tech-blitz-jane-protocol.html` as a static file. **Do not deploy `puzzles/server-only/`** (see §11).

## 6. Routes

| Route | Screen |
|---|---|
| `#/` | Landing page (hero, case intro, detective strip) |
| `#/briefing` | 01 Case briefing — synopsis, timeline, your role. Opening it **starts the case clock** |
| `#/evidence` | 02 Evidence archive — search, filter, detail drawer (`#/evidence?open=EV-02` deep-links a record) |
| `#/suspects` | 03 Suspects — booking-photo board and profile dialogs |
| `#/investigation` | 04 Dashboard — progress, four detective sections |
| `#/investigation/:detective` | One detective's case (`cho`, `rigsby`, `van-pelt`, `lisbon`) |
| `#/challenge/:id` | Puzzle workspace (`cho-a`, `cho-b`, … `lisbon-b`) |
| `#/final-deduction` | 05 Accusation (locked until all four cases are closed) |
| `#/results` | 06 Case summary |
| anything else | "File not found" |

## 7. Code structure (inside `tech-blitz-jane-protocol.html`)

The file is organised in commented sections (`/* ============ NAME ============ */`). **Edit content in the config objects, not in the markup.**

| Object / function | Purpose |
|---|---|
| `DATA` | Event copy, synopsis, timeline, suspects, detectives (incl. "in the field" lines), `timing`, evidence records |
| `DATA.timing` | Case clock: `readingMin: 5`, `sectionMin: { cho:15, rigsby:15, 'van-pelt':15, lisbon:20 }`, `closeOnTimeout: true` |
| `PUZZLES` | Public puzzle content: an exact copy of `puzzles/puzzles.public.json` (checked by `npm test`) |
| `FORMATS` / `fmtOf()` | Answer-box shape per puzzle (time `hh:mm`, text, number with `mine =` / `gone =` prefix). UI guidance only, never used for checking |
| `API` | **The mock backend seam**: `submit`, `requestHint`, `accuse` (see §10) |
| `S` | All in-memory app state (submissions, clock start `t0`, hints, accusation, UI state) |
| `ASSETS`, `PORTRAITS`, `ID_CARD` | Embedded character images and their thumbnail framing |
| `MOTIF` | The hidden smile motif: asset, ink colour, and per-page placements |
| `render()` | Router. Each screen is a function returning HTML (`landing`, `briefing`, `evidence`, `suspectsPage`, `dashboard`, `detectivePage`, `workspace`, `deduction`, `results`, `notFound`) plus a `bind…()` for its events |
| `windows()`, `pstatus()` | Case-clock windows and per-puzzle status (`available`, `locked`, `away`, `expired`, `submitted`) |

Other folders:

```
tech blitz frontend/
├── tech-blitz-jane-protocol.html   the whole app
├── assets/                          source files for everything embedded in the HTML
│   ├── detectives/                  Cho, Rigsby, Van Pelt, Lisbon, Jane (WebP, transparent)
│   ├── fonts/                       7 × .woff2 + OFL licence texts
│   ├── cbi-id-jane.webp             landing-page ID card
│   ├── motif-smile-mask.webp        smile motif (shape mask; colour comes from CSS)
│   └── texture-scratches.webp       archival background texture
├── puzzles/
│   ├── puzzles.public.json          participant-safe puzzle content
│   └── server-only/puzzles.answers.json   ANSWER KEY + hints + reveal: backend only
├── qa/   serve.mjs (local server), smoke.test.mjs (npm test)
├── package.json, package-lock.json, .eslintrc.json, .htmlvalidate.json, .gitignore
├── README.md, QA-REPORT.md
```

## 8. Assets

Everything the page displays is **embedded** in the HTML, so there are no broken paths and it works offline. Each embedded image and font has a byte-identical source file in `assets/`. If you move to file-based assets, use those files.

Images are WebP with transparency preserved. Characters are rendered greyscale in CSS. The suspect "mugshots" are drawn in SVG by `mugshot()`, so there are no files for those.

## 9. Mock vs real

| Area | Status |
|---|---|
| Navigation, routes, layouts, responsive design, accessibility | **Real**: fully implemented and tested |
| Case clock (reading 5 min → Cho 15 → Rigsby 15 → Van Pelt 15 → Lisbon 20), case locking, Part B unlocking after Part A | **Real, but client-side**: the clock runs in the browser from when the player opens the briefing |
| Answer submission: confirm dialog, "Answer recorded" receipt, lock-on-submit, raw value sent exactly as typed | **Real UI, mock transport**: `API.submit` returns a fake receipt after 700 ms |
| Hints: one per part, available after 5 min, +60 s penalty notice | **UI only**: `API.requestHint` returns `hint: null`. Hint **text lives server-side** and is never in the page |
| Final accusation | **Real UI, mock transport** (`API.accuse`) |
| Answer checking, scoring, ranking, results, solution reveal | **Not implemented** (server responsibility by design; the UI never shows right/wrong) |
| Participant identity | **Placeholder**: every player is `P-DEMO-001` |
| Persistence | **Not implemented**: a page reload clears all state (see §11) |

## 10. Where the backend plugs in

All three calls are in the `API` object, with the intended endpoint written beside each:

| Mock | Intended endpoint | Request body the UI already sends |
|---|---|---|
| `API.submit(payload)` | `POST /api/submissions` | `{ participant_id, puzzle_id, submitted_answer, timestamp }` → expects `{ status:'recorded', recorded_at }` |
| `API.requestHint(payload)` | `POST /api/hints` | `{ participant_id, puzzle_id, timestamp }` → server enforces the 5-min rule, logs the penalty, returns hint text |
| `API.accuse(payload)` | `POST /api/accusation` | `{ participant_id, suspect_id, timestamp }` |

Also needed server-side:
1. **Serve puzzles one at a time, only once unlocked** (replace the embedded `PUZZLES`). Cho Part B's text reveals Part A's answer, and Lisbon Part B's reveals Lisbon Part A's.
2. **Own the clock**: send `t0` / the case windows from the server and reject submissions outside a window. A browser clock can be changed by the player.
3. **Hydrate state on load**: fill `S.subs`, `S.hints`, `S.accusation`, `S.t0` from the server, so a reload doesn't reset anything.
4. **Normalize and check answers** against `puzzles/server-only/puzzles.answers.json`. Organizers decided: **case-insensitive**. Other variants are listed there under `normalization`.

Keep frontend-only: routing, formatting (`FORMATS`), the field-card/lock UI, the motif and textures.

## 11. Known limitations and open items

**Before the event:**
- **Reload resets everything** (answers, accusation, clock) until the backend persists state. In the prototype a refresh would let a player re-answer and restart their clock.
- **"Prototype: time controls" (+1 min / Next phase) are visible to players** in the sidebar. They exist for testing; hide or remove them for the event (search `proto-ctl`).
- **Closing-panel copy** ("Four case files are on Lisbon's desk…") appears even if every case timed out with no answers. Product decision pending.
- **Do not publish `puzzles/server-only/`** or commit it to a public repo: it contains every answer.

**Content and licensing:**
- Character images are studio promo photos of the actors. Confirm usage rights before a public deployment.
- Question Set D says to use "the same reveal monologue as Question Set v2", which hasn't been provided. Marked `MISSING` in the answers file.
- `PUZZLES` content is verbatim from *Question Set D* (Oct 13, 2026). Two documented, organizer-requested deviations: verdict steps removed, and suspect names removed from case headings.

**Technical:**
- `→`, `⌀`, `✕` aren't in the bundled fonts' Latin subset, so they render in the system font (unchanged from before).
- Tested in **Chromium only** (desktop and phone-sized viewports). Not tested in Firefox, Safari, on physical phones, with a real screen reader, or on the lab PCs.

## 12. Environment variables

**None.** The frontend needs no configuration, keys or secrets. When the backend arrives, its base URL will be the first variable to introduce (e.g. `API_BASE_URL`); there is deliberately no `.env.example` until one exists.

## 13. Notes for the backend developer

- The UI **never** shows correctness: no green/red, no ✓/✕, no "try again". Keep the API responses free of verdict fields during the event.
- Answers are sent **raw** (no trimming or case changes). Normalize on the server. The time box always produces `H:MM`, e.g. `9:43`.
- Cases unlock **by the clock, not by correctness**; Part B unlocks on Part A **submission**.
- `npm test` includes a leak scan: if any accepted answer, hint or reveal text ever ends up in the page, the test fails.
