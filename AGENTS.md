# AGENTS.md — typify

## What this is
typify is a single-page, front-end-only typing test in the style of monkeytype. It silently changes the difficulty of the words (levels 1–10) based on your live typing speed. Level 11 is an opt-in practice session built from your slowest words. It has no accounts. Finished tests are saved to Netlify Database through one function, under an anonymous per-browser id, so you can reopen old reports and compare attempts.

## Architecture
- No build step for the front end. `public/` is the publish directory (see `netlify.toml`). Don't add a bundler or framework unless asked. The site was built as static files on purpose.
- `db/schema.ts` (Drizzle, `drizzle-orm@beta`) defines the `tests` table: headline numbers as columns plus the full `results()` object as `report` jsonb. Migrations live in `netlify/database/migrations/` (generate with `npx drizzle-kit generate --name …`).
- `netlify/functions/tests.ts` serves `/api/tests` (GET list of summaries with slow words, POST save, DELETE all) and `/api/tests/:id` (GET full report, DELETE one). Every request needs an `x-typify-client` UUID header, and rows are scoped to it.
- `public/index.html` is the shell: header with the mode picker, the test section and the results section.
- `public/js/config.js` holds the exported `CONFIG` (the levelling tunables, including the tiered `promoteSteps` and `demoteSteps`, plus `startLevel: 3`), `LEVELS` (the word pools, kept verbatim from the brief apart from Australian spellings: harbour, yoghurt, wilfulness), `TEXTS` (the literature table), `WORDS_AHEAD`, `PRACTICE_LEVEL`/`levelLabel` and the time modes.
- `public/js/engine.js` is `TypingTest`, a pure engine with no DOM and no clock. The UI passes in keystrokes stamped with seconds since the start and calls `sampleUpTo(t)`. The engine owns the word stream, the backspace rules, the once-per-second sampling, the levelling state machine, slow-word and per-key stats, and `results()`.
- `public/js/practice.js` builds the level 11 pool: slow words plus lookalikes (bigram Dice similarity across all levels).
- `public/js/heatmap.js` renders the results keyboard heatmap.
- `public/js/app.js` handles the DOM: keyboard input, rendering words and the caret, the level badge, the deal/fold word animation, the live theme (`data-level` on `<html>`, theme-color meta, favicon) and the test lifecycle (idle → running → results).
- `public/js/history.js` owns the anonymous client id (localStorage `typify:client`), the API calls and a cache, plus the "against your past attempts" comparison (last / recent average / best, verdict, contrast line, trend bars, repeat slow words), the report list and the standalone history page.
- `public/js/results.js` renders the results page (with an empty `#compare` section that `app.js` fills once the test is saved, and a banner when reopening a saved report), the count-up animation, the literature payoff and `formatDuration`.
- `public/js/chart.js` is a hand-rolled SVG chart that redraws itself on resize.
- `public/styles.css` holds all styling. The "vigil" tokens and the `--level-1`…`--level-11` ramp are CSS variables in `:root`; `--accent` is a registered `@property` so it transitions as `data-level` changes.

## Key rules and decisions
- **Start level is 3.** The brief said both 1 and 5 and the user first picked 5, then later asked for 3. That's the default: before the first keystroke of a normal test, clicking the badge's level bars (or arrow keys while they're focused) picks the starting level, which is saved in localStorage `typify:start-level` and passed to `TypingTest` as `startLevel`.
- **Scaled WPM** is the mean over each second of `net WPM in that second × (1 + 0.1 × (level − 1))`. The user confirmed this per-second net formula over a raw-WPM alternative.
- Live WPM counts correct keystrokes in the window `[s − win, s)`, where `win = min(s, 5)`.
- Promotion is tiered via `CONFIG.promoteSteps`: rolling WPM held at 70+/100+/140+ for the sustain time jumps +1/+2/+3 (the step uses the slowest second of the window). Below level 10, demotion is tiered via `CONFIG.demoteSteps`: held under 65/40/20 drops 1/2/3 (the step uses the fastest second of the window), and 65–69 holds. Targets clamp to 1–10.
- Level 10 has its own demotion via `CONFIG.topDemoteSteps`. Staying needs 100 WPM, but 90–99 is a grace band that also holds. Rolling WPM held under 90 / ≤60 / ≤40 for the sustain time drops 1/2/5 (the step uses the fastest second of the window). Promotion is off there. These rules only apply while both `level` and `target` are 10. Once a drop is queued, the normal rules take over again.
- Sustain streaks keep counting during the cooldown, but a trigger can't fire until the cooldown ends. Any trigger resets both streaks.
- Levelling is per word. `WORDS_AHEAD` (5, so a level change reaches the caret within 5 words; it was 10) words sit ahead of the caret, plus the previous word, which stays so it can be fixed. Each commit deals one new word at the end, at the *target* level. Triggers move the target (they stack, and an opposite one walks it back). `level` is the level of the word under the caret, and it changes (along with the theme) when the caret first reaches a word dealt at a new level. That's the moment the change is recorded in `levelChanges`.
- Level 11 practice turns levelling off. Tab/Esc restart the same kind of test; the mode picker, "next test" and "back to the ramp" return to normal.
- Slow words are measured as time per letter from the caret reaching the word to its space. A word counts as slow at ≥1.2× your median or if it was committed with a mistake. Heatmap key speed is the gap from the previous keystroke on correct presses, and gaps over 1.5s are skipped.
- Raw WPM, net WPM and accuracy are counted per keystroke, including correct spaces, so deleted characters still count. The `characters` stat (correct/incorrect/extra/missed) comes from the final state of each word.
- The graph's net and raw lines plot the rolling 5-second values the engine actually used. Consistency uses the instantaneous per-second net WPM.
- The caret is positioned from `offsetLeft` and `offsetTop` (`.word` and `.words` are `position: relative`), so it ignores the transforms used by the entrance animations.
- The header's "live wpm" toggle (localStorage `typify:live-wpm`, `data-live` on `<body>`) shows the rolling 5-second WPM from the latest sample next to the batch meter. It's off by default.
- Keydown listens on `document`. A hidden input only exists so virtual keyboards can type.

- Comparisons use tests older than the one shown, of the same length and kind (ramp vs level 11) when any exist, falling back to the same kind, then anything. "Recent" means the last 10.

## Conventions
- Plain modern JS (ES2022, private `#methods`), 2-space indent, single quotes, no semicolons, except the verbatim `LEVELS` data.
- Use the colour tokens and never hard-code new hex values. Per-level colour is passed as `--wl: var(--level-N)`. SVG gradient stops get their colour from a CSS class.
