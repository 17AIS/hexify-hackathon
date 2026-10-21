import { CONFIG, LEVELS, WORDS_AHEAD, MIN_LEVEL, MAX_LEVEL, PRACTICE_LEVEL, TIME_MODES, DEFAULT_TIME, levelLabel } from './config.js'
import { TypingTest } from './engine.js'
import { renderResults } from './results.js'
import { buildPractice } from './practice.js'
import {
  loadHistory, saveTest, getReport, formatWhen,
  renderComparison, renderComparisonLoading, renderComparisonError, renderHistoryPage,
} from './history.js'

const $ = (id) => document.getElementById(id)
const els = {
  body: document.body,
  modes: $('modes'),
  historyBtn: $('historyBtn'),
  liveBtn: $('liveBtn'),
  liveWpm: $('liveWpmNum'),
  test: $('test'),
  results: $('results'),
  timer: $('timer'),
  meter: $('batchMeter'),
  badge: $('badge'),
  badgeNum: $('badgeNum'),
  badgeLabel: $('badgeLabel'),
  badgeBars: $('badgeBars'),
  badgePending: $('badgePending'),
  wrap: $('wordsWrap'),
  words: $('words'),
  caret: $('caret'),
  flash: $('levelFlash'),
  restart: $('restart'),
  input: $('hiddenInput'),
  hint: $('hint'),
  themeColor: document.querySelector('meta[name="theme-color"]'),
  favicon: document.querySelector('link[rel="icon"]'),
}

let duration = DEFAULT_TIME
let test
let phase = 'idle' // idle | running | results
let startPerf = 0
let loopId = 0
let idleTimer = 0
let badgeKey = ''
let disposeChart = null
let practice = null // { words, slow, similar } while a level 11 session is on
let themeLevel = 0
let caretFollow = 0
let view = 0 // bumped on every page change, so late history fetches don't render over a newer page

const LIVE_KEY = 'typify:live-wpm'
const START_KEY = 'typify:start-level'

const clampLevel = (n) => Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, n))
let startLevel = clampLevel(Number(localStorage.getItem(START_KEY)) || CONFIG.startLevel)

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const elapsed = () => (performance.now() - startPerf) / 1000
const restartAnim = (node, cls) => {
  node.classList.remove(cls)
  void node.offsetWidth
  node.classList.add(cls)
}

/* ---------- setup ---------- */

els.badgeBars.innerHTML = LEVELS.map((l) => `<i style="--j:${l.level}; --wl: var(--level-${l.level})"></i>`).join('')
els.badgeBars.addEventListener('mousedown', (e) => e.preventDefault())
els.badgeBars.addEventListener('pointermove', (e) => canPickLevel() && previewLevel(barAt(e.clientX)))
els.badgeBars.addEventListener('pointerleave', () => previewLevel(0))
els.badgeBars.addEventListener('click', (e) => canPickLevel() && setStartLevel(barAt(e.clientX)))
els.badgeBars.addEventListener('keydown', (e) => {
  const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]
  if (!step || !canPickLevel()) return
  e.preventDefault()
  setStartLevel(startLevel + step)
  els.badgeBars.focus()
})
els.meter.innerHTML = Array.from({ length: WORDS_AHEAD }, () => '<i></i>').join('')
els.modes.innerHTML =
  `<span class="modes-label"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>time</span>` +
  TIME_MODES.map((t) => `<button type="button" data-time="${t}" aria-pressed="${t === duration}">${t}</button>`).join('')

els.modes.addEventListener('mousedown', (e) => e.preventDefault())
els.modes.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-time]')
  if (!btn) return
  duration = Number(btn.dataset.time)
  for (const b of els.modes.querySelectorAll('button')) b.setAttribute('aria-pressed', b === btn)
  newTest({ practice: null })
})
els.restart.addEventListener('mousedown', (e) => e.preventDefault())
els.restart.addEventListener('click', () => newTest())
els.wrap.addEventListener('click', () => els.input.focus({ preventScroll: true }))
els.hint.addEventListener('mousedown', (e) => e.preventDefault())
els.hint.addEventListener('click', (e) => e.target.closest('[data-exit]') && newTest({ practice: null }))
els.liveBtn.addEventListener('mousedown', (e) => e.preventDefault())
els.liveBtn.addEventListener('click', () => setLiveWpm(els.body.dataset.live !== 'on'))
setLiveWpm(localStorage.getItem(LIVE_KEY) === 'on')
els.historyBtn.addEventListener('mousedown', (e) => e.preventDefault())
els.historyBtn.addEventListener('click', () => showHistory())
els.results.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]')
  if (open) openReport(Number(open.dataset.open))
  else if (e.target.closest('[data-history]')) showHistory()
})

// The readout is always rendered; this only shows or hides it.
function setLiveWpm(on) {
  els.body.dataset.live = on ? 'on' : ''
  els.liveBtn.setAttribute('aria-pressed', on)
  try {
    localStorage.setItem(LIVE_KEY, on ? 'on' : 'off')
  } catch {}
}

// The level bars double as a picker for where the next test starts, but only
// before you start typing and outside a level 11 session.
function canPickLevel() {
  return phase === 'idle' && !practice
}

// The bar under the pointer, or the nearest one if it's in a gap.
function barAt(x) {
  let best = 0
  let dist = Infinity
  ;[...els.badgeBars.children].forEach((bar, k) => {
    const box = bar.getBoundingClientRect()
    const d = Math.abs(x - (box.left + box.width / 2))
    if (d < dist) [best, dist] = [k + 1, d]
  })
  return best
}

function previewLevel(level) {
  ;[...els.badgeBars.children].forEach((bar, k) => bar.classList.toggle('preview', k < level))
}

function setStartLevel(level) {
  level = clampLevel(level)
  if (level === startLevel) return
  startLevel = level
  try {
    localStorage.setItem(START_KEY, level)
  } catch {}
  newTest()
}

/* ---------- theme ---------- */

// The accent follows the level under the caret, and so does the browser chrome.
function setTheme(level) {
  if (level === themeLevel) return
  themeLevel = level
  const root = document.documentElement
  root.dataset.level = level
  const hex = getComputedStyle(root).getPropertyValue(`--level-${level}`).trim()
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
  if (!hex) return
  els.themeColor.setAttribute('content', hex)
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='${bg}'/><path d='M8 22h4V16H8zM14 22h4V12h-4zM20 22h4V8h-4z' fill='${hex}'/></svg>`
  els.favicon.setAttribute('href', `data:image/svg+xml,${encodeURIComponent(svg)}`)
}

/* ---------- lifecycle ---------- */

// Tab, Esc and the restart button keep the current kind of test; pass
// `{ practice }` to switch between a normal run and a level 11 session.
function newTest(opts = {}) {
  if ('practice' in opts) practice = opts.practice
  view++
  clearInterval(loopId)
  disposeChart?.()
  disposeChart = null
  test = new TypingTest({ duration, practice: practice?.words, startLevel })
  phase = 'idle'
  els.body.dataset.phase = 'idle'
  els.body.dataset.practice = practice ? 'on' : ''
  els.badgeBars.tabIndex = practice ? -1 : 0
  renderHint()
  els.results.hidden = true
  els.results.innerHTML = ''
  els.test.hidden = false
  restartAnim(els.test, 'enter')
  badgeKey = ''
  renderTimer(duration)
  renderLive()
  renderWords(true)
  renderBadge()
  setTheme(test.level)
  setCaretIdle(true)
  els.input.value = ''
  els.input.focus({ preventScroll: true })
}

function start() {
  startPerf = performance.now()
  phase = 'running'
  els.body.dataset.phase = 'running'
  previewLevel(0)
  els.badgeBars.tabIndex = -1
  loopId = setInterval(tick, 50)
}

function tick() {
  const t = elapsed()
  if (t >= duration) return finish()
  test.sampleUpTo(t)
  renderTimer(duration - t)
  renderLive()
  renderBadge()
}

function finish() {
  clearInterval(loopId)
  test.finish()
  const r = test.results()
  showReport(r)
  const token = view
  const compare = els.results.querySelector('#compare')
  renderComparisonLoading(compare)
  saveTest(r)
    .then(async (row) => {
      const all = await loadHistory().catch(() => [row])
      if (token === view) renderComparison(compare, row, all, { onForget: showHistory })
    })
    .catch(() => token === view && renderComparisonError(compare))
}

/* ---------- results, saved reports and history ---------- */

// Swap the test for a results-style page. `render` returns the chart disposer, if any.
function showPage(render) {
  view++
  clearInterval(loopId)
  disposeChart?.()
  phase = 'results'
  els.body.dataset.phase = 'results'
  els.test.hidden = true
  els.results.hidden = false
  disposeChart = render() ?? null
  els.results.querySelector('#again')?.addEventListener('click', () => newTest({ practice: null }))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function showReport(r, opts) {
  const next = r.slowWords.length ? buildPractice(r.slowWords) : null
  setTheme(r.finalLevel)
  showPage(() => renderResults(els.results, r, next, opts))
  els.results.querySelector('#practise')?.addEventListener('click', () => newTest({ practice: next }))
}

// Reopen a saved report, compared against the tests that came before it.
async function openReport(id) {
  const token = view
  try {
    const [all, r] = await Promise.all([loadHistory(), getReport(id)])
    if (token !== view) return
    const row = all.find((t) => t.id === id)
    showReport(r, { when: formatWhen(row.createdAt) })
    renderComparison(els.results.querySelector('#compare'), row, all, { onForget: showHistory })
  } catch {
    if (token === view) showHistory()
  }
}

async function showHistory() {
  const token = ++view
  const all = await loadHistory().catch(() => null)
  if (token !== view) return
  showPage(() => renderHistoryPage(els.results, all, { onForget: showHistory }))
}

/* ---------- input ---------- */

document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' || e.key === 'Escape') {
    e.preventDefault()
    newTest()
loadHistory().catch(() => {})
    return
  }
  if (e.metaKey) return
  if (e.key === 'Backspace') {
    if (phase !== 'running') return
    e.preventDefault()
    onBackspace(e.ctrlKey || e.altKey)
    return
  }
  if (e.ctrlKey || e.altKey) return
  if (e.key.length !== 1) return
  if (phase === 'results') return
  e.preventDefault()
  feed(e.key)
})

// Fallback for virtual keyboards that report keydown as "Unidentified".
els.input.addEventListener('input', (e) => {
  if (phase !== 'results' && e.data) for (const ch of e.data) feed(ch)
  els.input.value = ''
})

function feed(ch) {
  if (ch === ' ') return onSpace()
  if (phase === 'idle') start()
  const t = elapsed()
  if (t >= duration) return finish()
  test.sampleUpTo(t)
  if (!test.typeChar(ch, t)) return
  renderWord(test.current)
  afterInput()
}

function onSpace() {
  if (phase !== 'running') return
  const t = elapsed()
  if (t >= duration) return finish()
  test.sampleUpTo(t)
  const res = test.space(t)
  if (!res) return
  renderWord(test.current - 1)
  renderWord(test.current)
  if (res.advanced) {
    syncWords()
    followCaret(320)
  }
  if (res.levelChange) levelShift(res.levelChange)
  afterInput()
}

function onBackspace(wholeWord) {
  const before = test.current
  if (!test.backspace(wholeWord)) return
  renderWord(before)
  if (test.current !== before) renderWord(test.current)
  afterInput()
}

function afterInput() {
  placeCaret()
  renderMeter()
  renderBadge()
  setCaretIdle(false)
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => setCaretIdle(true), 600)
}

/* ---------- rendering ---------- */

function renderTimer(remaining) {
  els.timer.textContent = Math.max(0, Math.ceil(remaining - 1e-9))
}

// The same rolling 5 second WPM the levelling uses, so it updates once a second.
function renderLive() {
  els.liveWpm.textContent = Math.round(test.samples.at(-1)?.live ?? 0)
}

const wordNode = (i) => els.words.querySelector(`.word[data-i="${i}"]`)

function wordShell(i, cls, delay) {
  const node = document.createElement('div')
  node.className = `word ${cls}`
  node.dataset.i = i
  node.style.setProperty('--i', delay)
  node.style.setProperty('--wl', `var(--level-${test.stream[i].level})`)
  return node
}

function renderWords(animate) {
  els.words.innerHTML = ''
  for (let i = test.first; i < test.stream.length; i++) {
    els.words.appendChild(wordShell(i, animate ? 'enter' : '', i - test.first))
    renderWord(i)
  }
  placeCaret()
  renderMeter()
}

// Drop words that scrolled off the front and deal new ones onto the end.
function syncWords() {
  for (const node of [...els.words.querySelectorAll('.word[data-i]')]) {
    if (Number(node.dataset.i) >= test.first) continue
    node.removeAttribute('data-i')
    node.style.width = `${node.offsetWidth}px`
    void node.offsetWidth
    node.classList.add('leaving')
    setTimeout(() => node.remove(), 300)
  }
  for (let i = test.first; i < test.stream.length; i++) {
    if (wordNode(i)) continue
    els.words.appendChild(wordShell(i, 'dealt', 0))
    renderWord(i)
  }
}

// Keep the caret glued to its word while neighbours collapse and reflow.
function followCaret(ms) {
  cancelAnimationFrame(caretFollow)
  const until = performance.now() + ms
  const step = (now) => {
    placeCaret()
    if (now < until) caretFollow = requestAnimationFrame(step)
  }
  caretFollow = requestAnimationFrame(step)
}

function renderWord(i) {
  const node = wordNode(i)
  if (!node) return
  const { word, typed } = test.stream[i]
  let html = ''
  for (let p = 0; p < word.length; p++) {
    const cls = p >= typed.length ? '' : typed[p] === word[p] ? ' ok' : ' bad'
    html += `<span class="ch${cls}">${word[p]}</span>`
  }
  for (let p = word.length; p < typed.length; p++) {
    html += `<span class="ch extra">${escapeHtml(typed[p])}</span>`
  }
  node.innerHTML = html
  node.classList.toggle('active', i === test.current)
  node.classList.toggle('done', test.stream[i].committed)
  node.classList.toggle('errored', test.isErrored(i))
}

function placeCaret() {
  const word = wordNode(test.current)
  if (!word) return
  const chars = word.children
  const pos = test.stream[test.current].typed.length
  const ch = chars[Math.min(pos, chars.length - 1)]
  const x = word.offsetLeft + ch.offsetLeft + (pos >= chars.length ? ch.offsetWidth : 0)
  const y = word.offsetTop + ch.offsetTop
  els.caret.style.height = `${ch.offsetHeight}px`
  els.caret.style.transform = `translate(${x}px, ${y}px)`
}

function setCaretIdle(idle) {
  els.caret.classList.toggle('blink', idle)
}

// One dot per word ahead, coloured by the level it was dealt at.
function renderMeter() {
  ;[...els.meter.children].forEach((dot, k) => {
    const w = test.stream[test.head + k]
    dot.style.setProperty('--wl', `var(--level-${w.level})`)
    dot.className = test.head + k === test.current ? 'now' : w.level !== test.level ? 'shift' : ''
  })
}

function renderHint() {
  els.hint.innerHTML = practice
    ? `level ${PRACTICE_LEVEL} · ${practice.slow.length} of your slowest words and ${practice.similar.length} lookalikes — levelling is off · <button type="button" data-exit>back to the ramp</button>`
    : 'start typing — the words will find your level'
}

function renderBadge() {
  const { level, pendingLevel, wordsUntilChange: until } = test
  const key = `${level}:${pendingLevel}:${until}`
  if (key === badgeKey) return
  badgeKey = key
  const pending = pendingLevel !== null
  const up = pending && pendingLevel > level
  const when = until === null ? 'queued' : until === 1 ? 'next word' : `in ${until} words`
  els.badgeNum.textContent = level
  els.badgeLabel.textContent = levelLabel(level)
  els.badge.classList.toggle('pending', pending)
  els.badge.dataset.dir = pending ? (up ? 'up' : 'down') : ''
  els.badge.style.setProperty('--pulse', pending ? `var(--level-${pendingLevel})` : 'var(--accent)')
  els.badgePending.innerHTML = pending
    ? `<span class="arrow">${up ? '▲' : '▼'}</span>${pendingLevel}<span class="next">${when}</span>`
    : ''
  ;[...els.badgeBars.children].forEach((bar, k) => {
    const j = k + 1
    bar.className = j <= level ? 'on' : ''
    if (pending && ((up && j > level && j <= pendingLevel) || (!up && j <= level && j > pendingLevel))) {
      bar.className += ' ghost'
    }
  })
  els.badgeBars.setAttribute('aria-valuenow', level)
  els.badgeBars.setAttribute('aria-valuetext', `start at level ${level}, ${levelLabel(level)}`)
  els.badge.setAttribute(
    'aria-label',
    level > MAX_LEVEL
      ? `Level ${level} practice, ${levelLabel(level)}`
      : `Level ${level} of ${MAX_LEVEL}, ${levelLabel(level)}` + (pending ? `. Changing to level ${pendingLevel} ${when}.` : ''),
  )
}

// The caret just landed on a word dealt at a new level: retheme and announce it.
function levelShift(change) {
  const up = change.toLevel > change.fromLevel
  setTheme(change.toLevel)
  els.wrap.dataset.dir = up ? 'up' : 'down'
  restartAnim(els.wrap, 'shift')
  restartAnim(els.badge, 'changed')
  els.badge.dataset.changed = up ? 'up' : 'down'
  els.flash.innerHTML = `<span class="arrow">${up ? '▲' : '▼'}</span>level ${change.toLevel}<span class="flash-label">${levelLabel(change.toLevel)}</span>`
  restartAnim(els.flash, 'show')
}

window.addEventListener('resize', () => phase !== 'results' && placeCaret())
document.fonts?.ready.then(() => placeCaret())

newTest()
loadHistory().catch(() => {})
