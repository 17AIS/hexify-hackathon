import { PRACTICE_LEVEL, levelLabel } from './config.js'

/* ---------- storage ---------- */

// History is anonymous: each browser gets a random id and only ever sees its own tests.
const CLIENT_KEY = 'typify:client'
const RECENT = 10 // "recent average" window
const TREND = 30 // bars in the trend strip
const LIST = 12 // rows shown before "show all"

function clientId() {
  let id = localStorage.getItem(CLIENT_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(CLIENT_KEY, id)
  }
  return id
}

async function api(path = '', init = {}) {
  const res = await fetch(`/api/tests${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-typify-client': clientId() },
  })
  if (!res.ok) throw new Error(`history request failed (${res.status})`)
  return res.status === 204 ? null : res.json()
}

let rows = null // promise of summaries, newest first
const reports = new Map() // id → full results() object

const newestFirst = (list) => list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

export function loadHistory() {
  rows ??= api().then(newestFirst).catch((err) => {
    rows = null
    throw err
  })
  return rows
}

export async function saveTest(r) {
  const listing = loadHistory().catch(() => null)
  const row = await api('', { method: 'POST', body: JSON.stringify(r) })
  reports.set(row.id, r)
  const list = await listing
  if (list && !list.some((x) => x.id === row.id)) {
    list.unshift(row)
    newestFirst(list)
  }
  return row
}

export async function getReport(id) {
  if (!reports.has(id)) reports.set(id, (await api(`/${id}`)).report)
  return reports.get(id)
}

export async function clearHistory() {
  await api('', { method: 'DELETE' })
  reports.clear()
  rows = Promise.resolve([])
}

/* ---------- formatting ---------- */

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const fmt = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const ordinal = (n) => {
  const teen = n % 100 >= 11 && n % 100 <= 13
  return `${n}${teen ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}
const modeLabel = (t) => `${t.duration}s${t.practice ? ` · lvl ${PRACTICE_LEVEL}` : ''}`

export function formatWhen(iso) {
  const d = new Date(iso)
  const mins = (Date.now() - d) / 60000
  if (mins < 1) return 'just now'
  if (mins < 60) return `${Math.floor(mins)} min ago`
  if (mins < 60 * 24) return `${Math.floor(mins / 60)} h ago`
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const METRICS = [
  { key: 'scaled', label: 'scaled wpm', d: 0, eps: 0.5 },
  { key: 'net', label: 'net wpm', d: 0, eps: 0.5 },
  { key: 'raw', label: 'raw wpm', d: 0, eps: 0.5 },
  { key: 'accuracy', label: 'accuracy', d: 1, eps: 0.05, suffix: '%' },
  { key: 'consistency', label: 'consistency', d: 0, eps: 0.5, suffix: '%' },
  { key: 'finalLevel', label: 'level', d: 0, eps: 0.5 },
]

// Contrast words for the one-line verdict against the recent average.
const CONTRAST = {
  net: ['faster', 'slower', ' net wpm'],
  accuracy: ['more accurate', 'less accurate', '%'],
  consistency: ['steadier', 'choppier', '%'],
  finalLevel: ['settled higher', 'settled lower', ' lvl'],
}

function delta(value, ref, m) {
  const diff = value - ref
  const dir = Math.abs(diff) < m.eps ? 'flat' : diff > 0 ? 'up' : 'down'
  const sign = dir === 'flat' ? '±' : diff > 0 ? '+' : '−'
  return `<span class="delta ${dir}">${sign}${fmt(Math.abs(dir === 'flat' ? 0 : diff), m.d)}</span>`
}

const cell = (t, m) => `${fmt(t[m.key], m.d)}${m.suffix ?? ''}`

/* ---------- comparison ---------- */

// The tests worth comparing against: same length and kind if there are any,
// otherwise any test of the same kind, otherwise anything at all.
function peers(current, past) {
  const same = past.filter((p) => p.duration === current.duration && p.practice === current.practice)
  const tests = (n) => `test${n === 1 ? '' : 's'}`
  if (same.length) return { pool: same, label: (n) => `${modeLabel(current)} ${tests(n)}` }
  const kind = past.filter((p) => p.practice === current.practice)
  if (kind.length) return { pool: kind, label: (n) => `${current.practice ? 'practice' : 'ramp'} ${tests(n)} of any length` }
  return { pool: past, label: tests }
}

function verdict(current, pool, label) {
  const best = Math.max(...pool.map((p) => p.scaled))
  const rank = 1 + pool.filter((p) => p.scaled > current.scaled).length
  if (current.scaled > best) {
    return `<strong>New personal best.</strong> ${fmt(current.scaled - best, 1)} scaled wpm past your previous best of ${fmt(best)} across ${pool.length} ${label(pool.length)}.`
  }
  return `Your <strong>${ordinal(rank)} best</strong> of ${pool.length + 1} ${label(pool.length + 1)}, ${fmt(best - current.scaled, 1)} scaled wpm off your best of ${fmt(best)}.`
}

function contrast(current, recent) {
  const better = []
  const worse = []
  for (const [key, [up, down, unit]] of Object.entries(CONTRAST)) {
    const m = METRICS.find((x) => x.key === key)
    const diff = current[key] - mean(recent.map((p) => p[key]))
    if (Math.abs(diff) < Math.max(m.eps, key === 'accuracy' ? 0.5 : 1)) continue
    const amount = `${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff), m.d)}${unit}`
    ;(diff > 0 ? better : worse).push(`${diff > 0 ? up : down} <span class="dim">(${amount})</span>`)
  }
  const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0])
  const against = recent.length === 1 ? 'Against last time' : `Against your last ${recent.length}`
  if (!better.length && !worse.length) return `${against}: right on your average across the board.`
  if (!worse.length) return `${against}: ${list(better)}.`
  if (!better.length) return `${against}: ${list(worse)}.`
  return `${against}: ${list(better)}, but ${list(worse)}.`
}

// Slow words that also dragged in recent tests.
function repeatOffenders(current, recent) {
  const counts = new Map()
  for (const p of recent) for (const w of new Set((p.slowWords ?? []).map((s) => s.word))) counts.set(w, (counts.get(w) ?? 0) + 1)
  return (current.slowWords ?? [])
    .filter((w) => counts.has(w.word))
    .map((w) => ({ ...w, times: counts.get(w.word) + 1 }))
    .sort((a, b) => b.times - a.times)
}

function trend(list, currentId) {
  if (!list.length) return ''
  const shown = list.slice(0, TREND).reverse()
  const top = Math.max(...shown.map((t) => t.scaled), 1)
  return `<ol class="trend" aria-label="Scaled wpm, oldest to newest">
    ${shown.map((t) => {
      const now = t.id === currentId
      const tip = `${formatWhen(t.createdAt)} · ${modeLabel(t)}\n${fmt(t.scaled)} scaled · ${fmt(t.net)} net · ${fmt(t.accuracy, 1)}%\nsettled at level ${t.finalLevel}${now ? '' : '\nclick to open'}`
      return `<li style="--h:${((t.scaled / top) * 100).toFixed(1)}%; --wl: var(--level-${t.finalLevel})">
        <button type="button" class="${now ? 'now' : ''}" ${now ? 'disabled' : `data-open="${t.id}"`} data-tip="${escapeHtml(tip)}" aria-label="${escapeHtml(tip.replaceAll('\n', ', '))}"></button>
      </li>`
    }).join('')}
  </ol>`
}

function historyList(list, currentId) {
  if (!list.length) return ''
  const item = (t, k) => `<li class="${k >= LIST ? 'more' : ''}" style="--wl: var(--level-${t.finalLevel})">
      <button type="button" class="hist-row${t.id === currentId ? ' now' : ''}" ${t.id === currentId ? 'disabled' : `data-open="${t.id}"`}>
        <span class="hist-when">${t.id === currentId ? 'this test' : formatWhen(t.createdAt)}</span>
        <span class="hist-mode">${modeLabel(t)}</span>
        <span class="hist-num"><b>${fmt(t.scaled)}</b> <span class="dim">scaled</span></span>
        <span class="hist-num">${fmt(t.net)} <span class="dim">net</span></span>
        <span class="hist-num">${fmt(t.accuracy, 1)}<span class="dim">%</span></span>
        <span class="hist-level"><i></i>${t.finalLevel} <span class="dim">${levelLabel(t.finalLevel)}</span></span>
      </button>
    </li>`
  return `<ol class="hist-list" data-collapsed="${list.length > LIST}">${list.map(item).join('')}</ol>
    <div class="hist-actions">
      ${list.length > LIST ? `<button type="button" class="hist-link" data-expand>show all ${list.length} reports</button>` : ''}
      <button type="button" class="hist-link danger" data-forget>forget my history</button>
    </div>`
}

// Wires up "show all" and "forget"; opening a report is handled by the caller.
function bind(root, onForget) {
  root.querySelector('[data-expand]')?.addEventListener('click', (e) => {
    root.querySelector('.hist-list').dataset.collapsed = 'false'
    e.currentTarget.remove()
  })
  root.querySelector('[data-forget]')?.addEventListener('click', async (e) => {
    if (!confirm('Delete every saved report from this browser’s history? This can’t be undone.')) return
    e.currentTarget.disabled = true
    try {
      await clearHistory()
      onForget()
    } catch {
      e.currentTarget.disabled = false
      e.currentTarget.textContent = 'couldn’t delete — try again'
    }
  })
}

export function renderComparisonLoading(root) {
  root.innerHTML = `<h2 class="section-kicker">against your past attempts</h2><p class="compare-note dim">saving this test and fetching your history…</p>`
}

export function renderComparisonError(root) {
  root.innerHTML = `<h2 class="section-kicker">against your past attempts</h2><p class="compare-note dim">couldn’t reach your history, so this test wasn’t saved.</p>`
}

// `current` is a summary row; `all` is the full history, newest first.
export function renderComparison(root, current, all, { onForget }) {
  const past = all.filter((t) => new Date(t.createdAt) < new Date(current.createdAt))
  const kicker = '<h2 class="section-kicker">against your past attempts</h2>'
  if (!past.length) {
    root.innerHTML = `${kicker}
      <p class="compare-verdict">${all.length > 1 ? 'Your earliest report on record.' : '<strong>First test on record.</strong> The next one has something to beat.'}</p>
      ${historyList(all, current.id)}`
    bind(root, onForget)
    return
  }

  const { pool, label } = peers(current, past)
  const last = pool[0]
  const recent = pool.slice(0, RECENT)
  const avg = Object.fromEntries(METRICS.map((m) => [m.key, mean(recent.map((p) => p[m.key]))]))
  const best = Object.fromEntries(METRICS.map((m) => [m.key, Math.max(...pool.map((p) => p[m.key]))]))
  const offenders = repeatOffenders(current, recent)
  const trendList = [current, ...pool]

  root.innerHTML = `${kicker}
    <p class="compare-verdict">${verdict(current, pool, label)}</p>
    <p class="compare-contrast">${contrast(current, recent)}</p>

    <div class="compare-grid">
      <table class="compare-table">
        <thead>
          <tr>
            <th scope="col"></th>
            <th scope="col">this test</th>
            <th scope="col" data-tip="${escapeHtml(`${formatWhen(last.createdAt)} · ${modeLabel(last)}`)}">last time</th>
            <th scope="col">avg of last ${recent.length}</th>
            <th scope="col">best</th>
          </tr>
        </thead>
        <tbody>
          ${METRICS.map((m) => `<tr>
            <th scope="row">${m.label}</th>
            <td class="cur">${cell(current, m)}</td>
            <td>${cell(last, m)} ${delta(current[m.key], last[m.key], m)}</td>
            <td>${cell(avg, m)} ${delta(current[m.key], avg[m.key], m)}</td>
            <td>${cell(best, m)} ${delta(current[m.key], best[m.key], m)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="compare-trend">
        <div class="trend-label"><span>scaled wpm over your ${label(2)}</span><span class="dim">oldest → newest</span></div>
        ${trend(trendList, current.id)}
      </div>
    </div>

    ${(current.slowWords ?? []).length ? `<div class="offenders">
      <span class="dim">${offenders.length ? 'still dragging from earlier tests:' : 'none of this test’s slow words dragged in your recent tests.'}</span>
      ${offenders.map((w) => `<span class="slow-chip" style="--wl: var(--level-${w.level})">${escapeHtml(w.word)}<span class="dim"> ×${w.times}</span></span>`).join('')}
    </div>` : ''}

    <h2 class="section-kicker hist-kicker">previous reports</h2>
    ${historyList(all, current.id)}`
  bind(root, onForget)
}

// The standalone history page, reachable from the header.
// `all` is null when the history couldn't be fetched.
export function renderHistoryPage(root, all, { onForget }) {
  const failed = all === null
  all ??= []
  const ramp = all.filter((t) => !t.practice)
  const recent = ramp.slice(0, RECENT)
  const seconds = all.reduce((a, t) => a + t.duration, 0)
  const tiles = all.length
    ? `<div class="res-stats">
        ${[
          ['tests', fmt(all.length)],
          ['time typed', seconds >= 60 ? `${fmt(seconds / 60, 1)}<span class="dim"> min</span>` : `${seconds}<span class="dim"> s</span>`],
          ['best scaled', ramp.length ? fmt(Math.max(...ramp.map((t) => t.scaled))) : '—'],
          [`avg of last ${recent.length || ''}`.trim(), recent.length ? fmt(mean(recent.map((t) => t.scaled))) : '—'],
          ['highest level', ramp.length ? Math.max(...ramp.map((t) => t.peakLevel)) : '—'],
        ].map(([label, value], i) => `<div class="stat" style="--i:${i + 1}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`).join('')}
      </div>`
    : ''
  root.innerHTML = `
    <div class="settled reveal" style="--i:0">
      <div class="settled-kicker">your history</div>
      <p class="compare-verdict">${failed ? 'Couldn’t reach your history right now. Try again in a moment.' : all.length ? 'Every test you finish in this browser is saved here. Open any report to see it again, compared with the tests before it.' : '<strong>Nothing saved yet.</strong> Finish a test and it lands here.'}</p>
    </div>
    ${tiles}
    ${ramp.length ? `<section class="compare reveal" style="--i:6">
      <div class="trend-label"><span>scaled wpm, ramp tests</span><span class="dim">oldest → newest</span></div>
      ${trend(ramp, null)}
    </section>` : ''}
    ${all.length ? `<section class="compare reveal" style="--i:7"><h2 class="section-kicker">all reports</h2>${historyList(all, null)}</section>` : ''}
    <div class="res-actions reveal" style="--i:8">
      <button class="again" id="again" type="button">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" /></svg>
        back to the test
      </button>
      <span class="hint-keys"><kbd>tab</kbd> or <kbd>esc</kbd></span>
    </div>`
  bind(root, onForget)
}
