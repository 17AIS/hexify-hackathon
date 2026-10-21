import { LEVELS, TEXTS, MAX_LEVEL, PRACTICE_LEVEL, levelLabel } from './config.js'
import { mountChart } from './chart.js'
import { renderHeatmap } from './heatmap.js'

const UNITS = [
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
]

const plural = (n, unit) => `${n.toLocaleString('en-US')} ${unit}${n === 1 ? '' : 's'}`

// Largest two sensible units, e.g. "14 days, 6 hours".
export function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return 'forever'
  let rest = Math.round(totalSeconds)
  if (rest < 1) return 'under a second'
  const i = UNITS.findIndex(([, size]) => rest >= size)
  const [unit, size] = UNITS[i]
  const first = Math.floor(rest / size)
  rest -= first * size
  const next = UNITS[i + 1]
  const second = next ? Math.floor(rest / next[1]) : 0
  return second ? `${plural(first, unit)}, ${plural(second, next[0])}` : plural(first, unit)
}

const TIPS = {
  scaled:
    'Net WPM weighted by the difficulty you earned it at. Each second’s net speed is multiplied by 1 + 0.1 × (level − 1) — ×1.0 at level 1, ×1.9 at level 10, ×2.0 for level 11 practice — then averaged across the test.',
  raw: 'Every keystroke counts, right or wrong: all characters typed ÷ 5, per minute.',
  net: 'Only correct keystrokes count: correct characters ÷ 5, per minute.',
  accuracy: 'Correct keystrokes as a share of every keystroke you made, including ones you later deleted.',
  consistency: 'How steady your pace was: 100 − the coefficient of variation of your per-second net WPM. Higher is steadier.',
  level: 'The level the test finished you on, with the highest level you reached in parentheses. You never pick it — your speed does.',
  characters: 'correct / incorrect / extra / missed. Extra: typed past the end of a word. Missed: left untyped when you pressed space.',
  test: 'The time mode you ran.',
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const fmt = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const titleHtml = (t) => (t.italic ? `<cite>${t.title}</cite>` : t.title)

function stat({ key, label, value, count, decimals = 0, suffix = '', cls = '', i }) {
  const exact = count !== undefined ? `${fmt(count, 2)}${suffix}\n` : ''
  const val = count !== undefined
    ? `<span class="count" data-count="${count}" data-decimals="${decimals}">0</span>${suffix}`
    : value
  return `<div class="stat ${cls}" style="--i:${i}" tabindex="0" data-tip="${escapeHtml(exact + TIPS[key])}">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${val}</div>
  </div>`
}

// Slowest words as chips in the colour of the level they were dealt at, plus the
// way into a level 11 session built from them.
function slowSection(r, practice) {
  if (!r.slowWords.length) return ''
  const chips = r.slowWords
    .map((w, k) => `<li class="slow-word${w.errored ? ' errored' : ''}" style="--wl: var(--level-${w.level}); --k:${k}" tabindex="0" data-tip="${escapeHtml(
      `${w.word} · level ${w.level}\n${fmt(w.wpm)} wpm on this word, ${fmt(w.vsMedian, 1)}× your median time per letter${w.errored ? '\ncommitted with a mistake' : ''}`,
    )}">
      <span class="slow-text">${w.word}</span>
      <span class="slow-wpm">${fmt(w.wpm)}<span class="dim"> wpm</span></span>
    </li>`)
    .join('')
  const action = practice
    ? `<div class="practise-row">
        <button class="practise" id="practise" type="button">
          <span class="practise-num">${PRACTICE_LEVEL}</span>
          <span class="practise-copy">
            <span>practise level ${PRACTICE_LEVEL} · ${levelLabel(PRACTICE_LEVEL)}</span>
            <span class="practise-sub">${practice.slow.length} slow words + ${practice.similar.length} lookalikes</span>
          </span>
        </button>
        <p class="practise-preview"><span class="dim">lookalikes:</span> ${practice.similar.slice(0, 12).join(' ')}${practice.similar.length > 12 ? ' …' : ''}</p>
      </div>`
    : ''
  return `<section class="slow reveal" style="--i:9" aria-labelledby="slow-title">
      <h2 id="slow-title" class="section-kicker">where you dragged</h2>
      <ol class="slow-words">${chips}</ol>
      ${action}
    </section>`
}

// `when` is set when reopening a saved report, and adds a banner saying so.
export function renderResults(root, r, practice, { when } = {}) {
  const changes = r.levelChanges.length
  const ups = r.levelChanges.filter((c) => c.toLevel > c.fromLevel).length
  const downs = changes - ups

  const durations = TEXTS.map((t) => (r.realWordsPerMinute > 0 ? (t.words / r.realWordsPerMinute) * 60 : Infinity))
  const finite = durations.filter(Number.isFinite)
  const maxLog = Math.log10((finite.length ? Math.max(...finite) : 1) + 1)
  const largest = TEXTS.at(-1)

  const headline = r.realWordsPerMinute > 0
    ? `If you were to continue typing at this speed for <strong>${formatDuration(durations.at(-1))}</strong>, you would write the entirety of ${titleHtml(largest)}.`
    : `At this speed, ${titleHtml(largest)} stays unwritten. Press <kbd>tab</kbd> and give Tolstoy a fighting chance.`

  const levelChangesText = changes
    ? `${changes} level change${changes === 1 ? '' : 's'} · ${ups} up, ${downs} down`
    : 'no level changes — you held your ground'

  const heatmap = renderHeatmap(r.keyStats)
  const visited = new Set([r.startLevel, ...r.levelChanges.map((c) => c.toLevel)])
  const keyLevels = r.practice ? [...LEVELS.map((l) => l.level), PRACTICE_LEVEL] : LEVELS.map((l) => l.level)

  root.innerHTML = `
    ${when ? `<div class="past-banner reveal" style="--i:0">
      <span>saved report · ${escapeHtml(when)}</span>
      <button type="button" class="hist-link" data-history>all reports</button>
    </div>` : ''}
    <div class="settled reveal" style="--i:0">
      <div class="settled-kicker">the test settled you at</div>
      <div class="settled-main">
        <span class="settled-num">${r.finalLevel}</span>
        <span class="settled-copy">
          <span class="settled-label">level ${r.finalLevel} · ${levelLabel(r.finalLevel)}</span>
          <span class="settled-meta">${r.practice ? 'practice session · levelling was off' : `started at ${r.startLevel} · peaked at ${r.peakLevel} · ${levelChangesText}`}</span>
        </span>
      </div>
      <div class="settled-scale" aria-hidden="true">
        ${LEVELS.map((l) => `<i class="${l.level <= r.finalLevel ? 'on' : ''} ${l.level === r.peakLevel ? 'peak' : ''}" style="--j:${l.level}; --wl: var(--level-${l.level})"></i>`).join('')}
      </div>
    </div>

    <div class="res-top">
      <div class="res-head">
        ${stat({ key: 'scaled', label: 'scaled wpm', count: r.scaled, cls: 'big', i: 1 })}
        ${stat({ key: 'raw', label: 'raw wpm', count: r.raw, cls: 'big', i: 2 })}
      </div>
      <div class="res-chart reveal" style="--i:2">
        <div class="legend">
          <span><i class="k k-net"></i>net wpm</span>
          <span><i class="k k-raw"></i>raw wpm</span>
          <span><i class="k k-err"></i>errors</span>
          <span><i class="k k-mark"></i>level change</span>
        </div>
        <div class="chart-row">
          <div class="chart" id="chart"></div>
          <ol class="level-key" aria-label="Level colours">
            ${keyLevels.map((l) => `<li class="${visited.has(l) ? 'on' : ''}" style="--wl: var(--level-${l})"><i></i><b>${l}</b><span>${levelLabel(l)}</span></li>`).join('')}
          </ol>
        </div>
      </div>
    </div>

    <div class="res-stats">
      ${stat({ key: 'net', label: 'net wpm', count: r.net, i: 3 })}
      ${stat({ key: 'accuracy', label: 'accuracy', count: r.accuracy, suffix: '%', i: 4 })}
      ${stat({ key: 'consistency', label: 'consistency', count: r.consistency, suffix: '%', i: 5 })}
      ${stat({ key: 'level', label: 'level', value: `${r.finalLevel} <span class="dim">(${r.peakLevel})</span>`, i: 6 })}
      ${stat({ key: 'characters', label: 'characters', value: `${r.chars.correct}<span class="slash">/</span>${r.chars.incorrect}<span class="slash">/</span>${r.chars.extra}<span class="slash">/</span>${r.chars.missed}`, i: 7 })}
      ${stat({ key: 'test', label: 'test', value: `time ${r.duration}s${r.practice ? ` <span class="dim">· lvl ${PRACTICE_LEVEL}</span>` : ''}`, i: 8 })}
    </div>

    <section class="compare reveal" id="compare" style="--i:9" aria-live="polite"></section>

    ${slowSection(r, practice)}

    ${heatmap ? `<section class="heat reveal" style="--i:10" aria-labelledby="heat-title">
      <h2 id="heat-title" class="section-kicker">your keyboard, by reach time and misses</h2>
      ${heatmap}
    </section>` : ''}

    <section class="payoff reveal" style="--i:11" aria-labelledby="payoff-title">
      <h2 id="payoff-title" class="payoff-kicker">what you could write at ${fmt(r.scaled)} scaled wpm</h2>
      <p class="payoff-headline">${headline}</p>
      <ol class="texts">
        ${TEXTS.map((t, k) => {
          const d = durations[k]
          const w = Number.isFinite(d) ? (Math.log10(d + 1) / maxLog) * 100 : 0
          return `<li style="--k:${k}">
            <span class="text-name">${titleHtml(t)}<span class="text-words">${t.note ? `${t.note} · ` : ''}${t.words.toLocaleString('en-US')} words</span></span>
            <span class="text-bar"><i style="--w:${w.toFixed(1)}%"></i></span>
            <span class="text-time">${formatDuration(d)}</span>
          </li>`
        }).join('')}
      </ol>
      <p class="footnote">
        WPM is a 5-character normalisation, not real words. An average English word runs
        4.7 letters plus a space = 5.7 characters, so your ${fmt(r.scaled, 1)} scaled wpm is
        ${fmt(r.realWordsPerMinute, 1)} real words per minute (scaled wpm × 5 ÷ 5.7).
        Bar lengths are logarithmic.
      </p>
    </section>

    <div class="res-actions reveal" style="--i:12">
      <button class="again" id="again" type="button">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" /></svg>
        next test
      </button>
      <span class="hint-keys"><kbd>tab</kbd> or <kbd>esc</kbd></span>
    </div>
  `

  countUp(root)
  const chartEl = root.querySelector('#chart')
  return mountChart(chartEl, {
    samples: r.samples,
    levelChanges: r.levelChanges,
    duration: r.duration,
    startLevel: r.startLevel,
    topLevel: r.practice ? PRACTICE_LEVEL : MAX_LEVEL,
  })
}

function countUp(root) {
  const nodes = [...root.querySelectorAll('.count')]
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const total = 900
  const t0 = performance.now() + 150
  const frame = (now) => {
    const p = Math.max(0, Math.min(1, (now - t0) / total))
    const e = 1 - (1 - p) ** 4
    for (const n of nodes) {
      const target = Number(n.dataset.count)
      n.textContent = fmt(reduce ? target : target * e, Number(n.dataset.decimals))
    }
    if (p < 1 && !reduce) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
