// Results keyboard: each key coloured by how fast you reached it (teal is quick,
// ember is slow, borrowing the level ramp) with a pink-red bar for its error rate.
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const STEPS = 10

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const pct = (n) => `${Math.round(n * 100)}%`

export function renderHeatmap(stats) {
  const timed = Object.entries(stats).filter(([, s]) => s.ms !== null)
  if (!timed.length) return ''
  const msList = timed.map(([, s]) => s.ms)
  const lo = Math.min(...msList)
  const hi = Math.max(...msList)
  const step = (ms) => (hi > lo ? 1 + Math.round(((ms - lo) / (hi - lo)) * (STEPS - 1)) : 1)

  const key = (ch, label = ch, cls = '') => {
    const s = stats[ch]
    if (!s) {
      return `<div class="kb-key none ${cls}" data-tip="${escapeHtml(label)} · not typed"><span class="kb-ch">${label}</span></div>`
    }
    const tip = [
      `${label} · ${s.presses} press${s.presses === 1 ? '' : 'es'}`,
      s.ms !== null ? `${Math.round(s.ms)} ms average reach` : 'never hit cleanly in rhythm',
      `${pct(s.errorRate)} missed`,
    ].join('\n')
    const fill = s.ms !== null ? `--kc: var(--level-${step(s.ms)});` : ''
    const faint = s.timed < 2 ? ' faint' : ''
    return `<div class="kb-key ${s.ms === null ? 'untimed' : ''}${faint} ${cls}" style="${fill}--er:${Math.min(1, s.errorRate).toFixed(3)}" tabindex="0" data-tip="${escapeHtml(tip)}">
      <span class="kb-ch">${label}</span>
      <span class="kb-ms">${s.ms !== null ? Math.round(s.ms) : '–'}</span>
      ${s.misses ? `<span class="kb-err"><i></i></span>` : ''}
    </div>`
  }

  const letters = timed.filter(([ch]) => /^[a-z]$/.test(ch))
  const bySpeed = [...letters].sort((a, b) => a[1].ms - b[1].ms)
  const byErr = Object.entries(stats)
    .filter(([ch, s]) => /^[a-z]$/.test(ch) && s.misses && s.presses >= 2)
    .sort((a, b) => b[1].errorRate - a[1].errorRate)
  const facts = []
  if (bySpeed.length) facts.push(`quickest <b>${bySpeed[0][0]}</b> ${Math.round(bySpeed[0][1].ms)} ms`)
  if (bySpeed.length > 1) facts.push(`slowest <b>${bySpeed.at(-1)[0]}</b> ${Math.round(bySpeed.at(-1)[1].ms)} ms`)
  if (byErr.length) facts.push(`shakiest <b>${byErr[0][0]}</b> ${pct(byErr[0][1].errorRate)} missed`)

  return `<div class="kb" role="img" aria-label="Keyboard heatmap of per-key speed and error rate">
      ${ROWS.map((row, r) => `<div class="kb-row" style="--r:${r}">${[...row].map((ch) => key(ch)).join('')}</div>`).join('')}
      <div class="kb-row kb-row-space" style="--r:3">${key(' ', 'space', 'kb-space')}</div>
    </div>
    <div class="kb-foot">
      <div class="kb-scale" aria-hidden="true">
        <span>${Math.round(lo)} ms</span>
        <span class="kb-ramp">${Array.from({ length: STEPS }, (_, k) => `<i style="--kc: var(--level-${k + 1})"></i>`).join('')}</span>
        <span>${Math.round(hi)} ms</span>
        <span class="kb-err-key"><i></i>error rate</span>
      </div>
      ${facts.length ? `<p class="kb-facts">${facts.join('<span class="dot">·</span>')}</p>` : ''}
    </div>`
}
