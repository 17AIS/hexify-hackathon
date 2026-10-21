// Pure test engine: no DOM, no clock. The UI feeds it keystrokes stamped with
// seconds-since-start and asks it to sample each whole second.
import { CONFIG, LEVELS, WORDS_AHEAD, MIN_LEVEL, MAX_LEVEL, PRACTICE_LEVEL, CHARS_PER_REAL_WORD } from './config.js'

const MAX_EXTRA = 12
// Gaps longer than this are pauses, not key-to-key travel, so the heatmap skips them.
const MAX_KEY_GAP = 1.5

export const levelMultiplier = (level) => 1 + 0.1 * (level - 1)

// One random word from `pool`, avoiding anything in `avoid` while the pool allows.
export function sampleWord(pool, avoid, rng = Math.random) {
  const fresh = pool.filter((w) => !avoid.has(w))
  const from = fresh.length ? fresh : pool
  return from[Math.floor(rng() * from.length)]
}

export class TypingTest {
  // `practice` is a word pool for a level 11 session; levelling is off while it runs.
  // `startLevel` overrides the config's starting level for a normal run.
  constructor({ duration, config = CONFIG, rng = Math.random, practice = null, startLevel = config.startLevel }) {
    this.duration = duration
    this.cfg = config
    this.rng = rng
    this.practice = practice ? [...new Set(practice)] : null

    this.startLevel = this.practice ? PRACTICE_LEVEL : Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(startLevel) || config.startLevel))
    this.level = this.startLevel // level of the word under the caret
    this.target = this.startLevel // level new words are sampled at
    this.peakLevel = this.startLevel
    this.cooldownUntil = 0
    this.promoteStreak = 0
    this.demoteStreak = 0

    this.keys = [] // { t, ok, exp, ch } — every keystroke that produced a character (incl. space)
    this.samples = [] // one per whole second
    this.levelChanges = [] // { timeSeconds, fromLevel, toLevel }
    // Every word ever dealt: { word, level, typed, committed, arrive, done }.
    // `arrive` is when the caret reached it, `done` when it was first committed.
    this.stream = []
    this.current = 0
    this.head = 0 // furthest word the caret has reached
    this.lastSampled = 0
    this.finished = false

    while (this.stream.length < WORDS_AHEAD) this.#deal()
  }

  get pendingLevel() {
    return this.target !== this.level ? this.target : null
  }

  // Oldest word still on screen: the previous word stays so it can be fixed.
  get first() {
    return Math.max(0, this.head - 1)
  }

  // How many words until the caret reaches one at a different level, or null.
  get wordsUntilChange() {
    for (let i = this.head + 1; i < this.stream.length; i++) {
      if (this.stream[i].level !== this.level) return i - this.head
    }
    return null
  }

  #pool(level) {
    return level === PRACTICE_LEVEL ? this.practice : [...new Set(LEVELS[level - 1].words)]
  }

  #deal() {
    const avoid = new Set(this.stream.slice(-WORDS_AHEAD).map((w) => w.word))
    this.stream.push({
      word: sampleWord(this.#pool(this.target), avoid, this.rng),
      level: this.target,
      typed: '',
      committed: false,
      arrive: null,
      done: null,
    })
  }

  isErrored(i) {
    const w = this.stream[i]
    return w.committed && w.typed !== w.word
  }

  typeChar(ch, t) {
    if (this.finished) return false
    const w = this.stream[this.current]
    if (w.typed.length >= w.word.length + MAX_EXTRA) return false
    if (w.arrive === null) w.arrive = t
    const pos = w.typed.length
    const exp = pos < w.word.length ? w.word[pos] : null
    this.keys.push({ t, ok: exp === ch, exp, ch })
    w.typed += ch
    return true
  }

  // Returns null when ignored, otherwise { advanced, levelChange }. `advanced`
  // means a fresh word was dealt onto the end and the oldest one left the screen.
  space(t) {
    if (this.finished) return null
    const w = this.stream[this.current]
    if (w.typed.length === 0) return null
    this.keys.push({ t, ok: w.typed === w.word, exp: ' ', ch: ' ' })
    w.committed = true
    if (w.done === null) w.done = t
    this.current++
    if (this.current <= this.head) return { advanced: false, levelChange: null }

    this.head = this.current
    this.stream[this.head].arrive = t
    this.#deal()
    // The level changes the moment the caret lands on a word dealt at a new level.
    let levelChange = null
    const next = this.stream[this.head].level
    if (next !== this.level) {
      levelChange = { timeSeconds: Math.round(t * 100) / 100, fromLevel: this.level, toLevel: next }
      this.levelChanges.push(levelChange)
      this.level = next
      this.peakLevel = Math.max(this.peakLevel, this.level)
    }
    return { advanced: true, levelChange }
  }

  // Returns true when something changed.
  backspace(wholeWord) {
    if (this.finished) return false
    const i = this.current
    const w = this.stream[i]
    if (w.typed.length > 0) {
      w.typed = wholeWord ? '' : w.typed.slice(0, -1)
      return true
    }
    // At position 0: step back only into an on-screen word committed with mistakes.
    if (i > this.first && this.isErrored(i - 1)) {
      this.current = i - 1
      this.stream[i - 1].committed = false
      if (wholeWord) this.stream[i - 1].typed = ''
      return true
    }
    return false
  }

  // Sample every whole second up to `t`. Returns the samples taken.
  sampleUpTo(t) {
    const taken = []
    const until = Math.min(Math.floor(t), this.duration)
    while (this.lastSampled < until) {
      this.lastSampled++
      taken.push(this.#sample(this.lastSampled))
    }
    return taken
  }

  #sample(s) {
    const win = Math.min(s, this.cfg.windowSeconds)
    let winOk = 0, winAll = 0, secOk = 0, secAll = 0, secErr = 0
    for (const k of this.keys) {
      if (k.t >= s - win && k.t < s) {
        winAll++
        if (k.ok) winOk++
      }
      if (k.t >= s - 1 && k.t < s) {
        secAll++
        if (k.ok) secOk++
        else secErr++
      }
    }
    const live = (winOk / 5) * (60 / win)
    const liveRaw = (winAll / 5) * (60 / win)
    if (!this.practice) this.#level(s, live)
    const sample = {
      t: s,
      live,
      liveRaw,
      net: (secOk / 5) * 60,
      raw: (secAll / 5) * 60,
      errors: secErr,
      level: this.level,
      pending: this.pendingLevel,
    }
    this.samples.push(sample)
    return sample
  }

  #level(s, live) {
    const { promoteSteps, demoteSteps, topDemoteSteps, sustainSeconds } = this.cfg
    // Level 10 rules apply only while you're there with no drop already queued.
    const atTop = this.level === MAX_LEVEL && this.target === MAX_LEVEL
    const drops = atTop ? topDemoteSteps : demoteSteps
    const minPromote = Math.min(...promoteSteps.map((p) => p.wpm))
    this.promoteStreak = !atTop && live >= minPromote ? this.promoteStreak + 1 : 0
    this.demoteStreak = this.#dropStep(drops, live) !== undefined ? this.demoteStreak + 1 : 0
    if (s < this.cooldownUntil) return
    if (this.promoteStreak >= sustainSeconds) this.#trigger(this.#promoteBy(live, sustainSeconds), s)
    else if (this.demoteStreak >= sustainSeconds) this.#trigger(-this.#dropBy(drops, live, sustainSeconds), s)
  }

  // The jump is set by the slowest second of the sustain window, so a single
  // burst can't buy a bigger step than you actually held.
  #promoteBy(live, sustainSeconds) {
    const held = Math.min(live, ...this.samples.slice(-(sustainSeconds - 1)).map((x) => x.live))
    const step = [...this.cfg.promoteSteps].sort((a, b) => b.wpm - a.wpm).find((p) => held >= p.wpm)
    return step ? step.levels : 1
  }

  // The harshest drop in `steps` whose speed `wpm` falls into, or undefined.
  #dropStep(steps, wpm) {
    return steps.find((p) => (p.under !== undefined ? wpm < p.under : wpm <= p.atMost))
  }

  // Mirrors #promoteBy: the drop is set by the fastest second of the window, so
  // a single stumble can't cost more than you actually held.
  #dropBy(steps, live, sustainSeconds) {
    const held = Math.max(live, ...this.samples.slice(-(sustainSeconds - 1)).map((x) => x.live))
    return this.#dropStep(steps, held)?.levels ?? 1
  }

  #trigger(dir, s) {
    this.promoteStreak = 0
    this.demoteStreak = 0
    this.cooldownUntil = s + this.cfg.cooldownSeconds
    // Triggers stack on top of the target; an opposite one walks it back.
    this.target = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, this.target + dir))
  }

  finish() {
    if (this.finished) return
    this.sampleUpTo(this.duration)
    this.finished = true
  }

  // Committed words ranked by time per character, slowest first. Time runs from
  // the caret reaching the word to the space, so hesitation counts.
  wordTimes() {
    const best = new Map()
    for (const w of this.stream) {
      if (w.done === null || w.arrive === null || w.done <= w.arrive || w.done > this.duration) continue
      const secs = w.done - w.arrive
      const entry = {
        word: w.word,
        level: w.level,
        errored: w.typed !== w.word,
        msPerChar: (secs * 1000) / (w.word.length + 1),
        wpm: (w.word.length + 1) / 5 / (secs / 60),
      }
      const seen = best.get(w.word)
      if (!seen || entry.msPerChar > seen.msPerChar) best.set(w.word, { ...entry, errored: entry.errored || !!seen?.errored })
    }
    return [...best.values()].sort((a, b) => b.msPerChar - a.msPerChar)
  }

  // The words that dragged: well over your median pace, or committed with a mistake.
  slowWords(max = 8) {
    const times = this.wordTimes()
    if (times.length < 4) return []
    const sorted = times.map((w) => w.msPerChar).sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const slow = times.filter((w) => w.msPerChar >= median * 1.2 || w.errored)
    return (slow.length >= 3 ? slow : times.slice(0, 3)).slice(0, max).map((w) => ({ ...w, vsMedian: w.msPerChar / median }))
  }

  // Per key (the key you were meant to hit): presses, misses and the mean gap
  // from the previous keystroke for correct presses.
  keyStats() {
    const stats = {}
    let prev = null
    for (const k of this.keys) {
      if (k.t >= this.duration) break
      const key = (k.exp ?? k.ch).toLowerCase()
      const s = (stats[key] ??= { presses: 0, misses: 0, time: 0, timed: 0 })
      s.presses++
      if (!k.ok) s.misses++
      else if (prev !== null && k.t - prev > 0 && k.t - prev < MAX_KEY_GAP) {
        s.time += k.t - prev
        s.timed++
      }
      prev = k.t
    }
    for (const s of Object.values(stats)) {
      s.ms = s.timed ? (s.time / s.timed) * 1000 : null
      s.errorRate = s.misses / s.presses
    }
    return stats
  }

  results() {
    const minutes = this.duration / 60
    const keys = this.keys.filter((k) => k.t < this.duration)
    const all = keys.length
    const correct = keys.filter((k) => k.ok).length

    const nets = this.samples.map((s) => s.net)
    const mean = nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : 0
    const sd = nets.length
      ? Math.sqrt(nets.reduce((a, b) => a + (b - mean) ** 2, 0) / nets.length)
      : 0
    const consistency = mean > 0 ? Math.max(0, Math.min(100, 100 - (sd / mean) * 100)) : 0

    const scaled = this.samples.length
      ? this.samples.reduce((a, s) => a + s.net * levelMultiplier(s.level), 0) / this.samples.length
      : 0

    const chars = { correct: 0, incorrect: 0, extra: 0, missed: 0 }
    for (const { word, typed, committed } of this.stream) {
      const n = Math.min(word.length, typed.length)
      for (let p = 0; p < n; p++) {
        if (typed[p] === word[p]) chars.correct++
        else chars.incorrect++
      }
      chars.extra += Math.max(0, typed.length - word.length)
      if (committed) chars.missed += Math.max(0, word.length - typed.length)
    }

    return {
      duration: this.duration,
      practice: !!this.practice,
      raw: all / 5 / minutes,
      net: correct / 5 / minutes,
      scaled,
      realWordsPerMinute: (scaled * 5) / CHARS_PER_REAL_WORD,
      accuracy: all ? (correct / all) * 100 : 0,
      consistency,
      startLevel: this.startLevel,
      finalLevel: this.level,
      peakLevel: this.peakLevel,
      chars,
      samples: this.samples,
      levelChanges: this.levelChanges,
      slowWords: this.slowWords(),
      keyStats: this.keyStats(),
    }
  }
}
