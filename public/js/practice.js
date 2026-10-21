// Level 11: a practice pool built from your slowest words plus their lookalikes
// from every level, matched on shared letter pairs.
import { LEVELS } from './config.js'

const ALL_WORDS = [...new Set(LEVELS.flatMap((l) => l.words))]
const PER_WORD = 3
const MIN_POOL = 14

function bigrams(word) {
  const out = new Set()
  for (let i = 0; i < word.length - 1; i++) out.add(word.slice(i, i + 2))
  return out
}

// Dice coefficient on letter pairs, nudged towards words of a similar length.
function similarity(a, b) {
  const A = bigrams(a)
  const B = bigrams(b)
  if (!A.size || !B.size) return 0
  let shared = 0
  for (const g of A) if (B.has(g)) shared++
  const dice = (2 * shared) / (A.size + B.size)
  return dice - Math.abs(a.length - b.length) * 0.025
}

// Returns { words, slow, similar } — `words` is the pool the engine samples from.
export function buildPractice(slowWords) {
  const slow = [...new Set(slowWords.map((w) => w.word))]
  const taken = new Set(slow)
  const ranked = slow.map((s) =>
    ALL_WORDS.filter((w) => !taken.has(w))
      .map((w) => ({ w, score: similarity(s, w) }))
      .sort((a, b) => b.score - a.score),
  )
  const similar = []
  // Round-robin so every slow word gets its lookalikes before any gets more.
  for (let round = 0; slow.length && (round < PER_WORD || slow.length + similar.length < MIN_POOL); round++) {
    let added = false
    for (const list of ranked) {
      const next = list.find(({ w }) => !taken.has(w))
      if (!next) continue
      taken.add(next.w)
      similar.push(next.w)
      added = true
    }
    if (!added) break
  }
  return { words: [...slow, ...similar], slow, similar }
}
