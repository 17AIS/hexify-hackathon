# typify

A typing test modelled on monkeytype, except that it fights back. While you type, typify keeps re-levelling the words to match your speed. What looks like a speed test is really a way of finding your difficulty: you never pick the level, the test picks it for you. At the end, the results page shows the level you ended up at and turns your speed into the time it would take you to type real books, from a tweet up to *War and Peace*.

## Features

- Time modes of 15, 30, 60 and 120 seconds (30 is the default). The timer starts on your first keystroke.
- Five words sit ahead of the caret. Each word you finish is replaced by a new one at the end of the line, dealt at whatever level your rolling 5-second WPM has earned (1 to 10). The level, and the colour theme with it, changes when your caret reaches the first word at the new level. Every test starts at level 3.
- Backspace, error and extra-character rules follow monkeytype. Ctrl or Alt + Backspace deletes the whole word, and Tab or Esc restarts the test.
- The results page shows scaled, raw and net WPM, accuracy, consistency, level and a character breakdown. Every stat explains itself in a tooltip.
- A per-second graph shows net WPM, raw WPM and errors. Each level change gets a dotted line in that level's colour, a level strip runs underneath, and a colour key sits to the right.
- "Where you dragged" lists the words you typed slowest. From there you can start a level 11 ("Nemesis") practice session: those words plus lookalikes from every level, matched on shared letter pairs, with levelling switched off.
- A keyboard heatmap colours each key by how quickly you reached it and marks its error rate.
- A "what you could write" summary converts your speed into real-world texts.
- Every finished test is saved. The results page compares it with your last test, your recent average and your best for the same mode, shows a trend of past scores, flags slow words that keep coming back and lists previous reports, which you can reopen in full. The header's history button shows everything at once. History is anonymous and tied to your browser.
- The "vigil" theme uses a plum-ink base, and the accent follows a teal-to-ember level ramp. The browser's theme colour and the favicon follow it too. The font is Roboto Mono.

## Tech

The front end is static with no build step: plain HTML, CSS and native ES modules, and the graph is hand-drawn SVG. Netlify serves the `public/` directory. Test history lives in Netlify Database (Postgres, via Drizzle ORM) behind a single Netlify Function at `/api/tests`.

## Run locally

Run `npm install`, then `netlify dev` so the history API and database are available. Any static file server (`npx serve public`) still runs the test itself, but nothing gets saved.

Then open the URL it prints. Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://` URLs.

## Tuning

All the levelling thresholds live in the `CONFIG` object in `public/js/config.js`. That's the promotion tiers (70 WPM or more goes up 1 level, 100 or more goes up 2, 140 or more goes up 3), the drop tiers below level 10 (under 65 WPM drops 1 level, under 40 drops 2, under 20 drops 3), the level 10 drop tiers (you stay at 90 WPM or more; under 90 drops 1 level, 60 or less drops 2, 40 or less drops 5), the sustain time, the cooldown, the rolling-window length, and the start level.
