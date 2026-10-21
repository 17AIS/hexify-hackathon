// Hand-rolled SVG results graph: net/raw WPM lines, error scatter on a right axis,
// dotted level-change markers and a level step strip underneath, both in the
// colour of the level they lead to.
const NS = 'http://www.w3.org/2000/svg'

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  if (parent) parent.appendChild(node)
  return node
}

function niceStep(raw) {
  for (const s of [5, 10, 20, 25, 50, 100, 200, 250, 500]) if (raw <= s) return s
  return 1000
}

export function mountChart(container, data, { animate = true } = {}) {
  let lastWidth = 0
  const draw = (withAnimation) => {
    const width = Math.round(container.clientWidth)
    if (!width || width === lastWidth) return
    lastWidth = width
    render(container, data, width, withAnimation)
  }
  draw(animate)
  const ro = new ResizeObserver(() => draw(false))
  ro.observe(container)
  return () => ro.disconnect()
}

function render(container, { samples, levelChanges, duration, startLevel, topLevel }, W, animate) {
  container.innerHTML = ''
  const narrow = W < 520
  const H = narrow ? 230 : 260
  const m = { l: 38, r: 30, t: 24, b: 22 }
  const stripH = 26
  const plotB = H - m.b - stripH - 10
  const stripT = plotB + 10
  const stripB = stripT + stripH
  const plotR = W - m.r

  const x = (t) => m.l + ((Math.max(1, Math.min(duration, t)) - 1) / (duration - 1)) * (plotR - m.l)
  const maxV = Math.max(10, ...samples.map((s) => Math.max(s.live, s.liveRaw)))
  const step = niceStep(maxV / 4)
  const yMax = Math.ceil(maxV / step) * step
  const y = (v) => plotB - (v / yMax) * (plotB - m.t)

  const maxErr = Math.max(1, ...samples.map((s) => s.errors))
  const eStep = maxErr <= 4 ? 1 : Math.ceil(maxErr / 4)
  const eMax = Math.ceil(maxErr / eStep) * eStep
  const ye = (v) => plotB - (v / eMax) * (plotB - m.t)
  const yl = (lvl) => stripB - (lvl / topLevel) * stripH

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    width: '100%',
    height: H,
    class: 'chart-svg' + (animate ? ' draw' : ''),
    role: 'img',
    'aria-label': 'Words per minute and errors for each second of the test',
  }, container)

  const defs = el('defs', {}, svg)
  const grad = el('linearGradient', { id: 'netFill', x1: 0, y1: 0, x2: 0, y2: 1 }, defs)
  el('stop', { offset: '0%', class: 'net-stop', 'stop-opacity': 0.22 }, grad)
  el('stop', { offset: '100%', class: 'net-stop', 'stop-opacity': 0 }, grad)

  // Grid + left axis.
  const grid = el('g', { class: 'grid' }, svg)
  for (let v = 0; v <= yMax; v += step) {
    el('line', { x1: m.l, x2: plotR, y1: y(v), y2: y(v) }, grid)
    el('text', { x: m.l - 8, y: y(v) + 3.5, 'text-anchor': 'end', class: 'axis' }, grid).textContent = v
  }
  for (let v = 0; v <= eMax; v += eStep) {
    el('text', { x: plotR + 8, y: ye(v) + 3.5, 'text-anchor': 'start', class: 'axis axis-err' }, grid).textContent = v
  }
  const vLabel = el('text', { x: 10, y: (m.t + plotB) / 2, class: 'axis-title', transform: `rotate(-90 10 ${(m.t + plotB) / 2})`, 'text-anchor': 'middle' }, grid)
  vLabel.textContent = 'words per minute'
  const eLabel = el('text', { x: W - 6, y: (m.t + plotB) / 2, class: 'axis-title', transform: `rotate(90 ${W - 6} ${(m.t + plotB) / 2})`, 'text-anchor': 'middle' }, grid)
  eLabel.textContent = 'errors'

  // X ticks.
  const xStep = duration <= 15 ? 1 : duration <= 30 ? (narrow ? 5 : 2) : duration <= 60 ? (narrow ? 10 : 5) : narrow ? 20 : 10
  for (let t = 1; t <= duration; t++) {
    if (t !== 1 && t % xStep !== 0) continue
    el('text', { x: x(t), y: H - 6, 'text-anchor': 'middle', class: 'axis' }, grid).textContent = t
  }

  // Level strip.
  const strip = el('g', { class: 'strip' }, svg)
  el('rect', { x: m.l, y: stripT, width: plotR - m.l, height: stripH, rx: 3, class: 'strip-bg' }, strip)
  el('text', { x: m.l - 8, y: stripT + stripH / 2 + 3.5, 'text-anchor': 'end', class: 'axis' }, strip).textContent = 'lvl'
  // One coloured step per level held, numbered where there's room.
  const segs = [[1, startLevel], ...levelChanges.map((c) => [c.timeSeconds, c.toLevel])]
  segs.forEach(([t, l], i) => {
    const end = i + 1 < segs.length ? segs[i + 1][0] : duration
    const x0 = x(t), x1 = x(end), top = yl(l)
    const g = el('g', { class: 'strip-seg', style: `--wl: var(--level-${l})` }, strip)
    el('rect', { x: x0, y: top, width: Math.max(0, x1 - x0), height: stripB - top, class: 'strip-fill' }, g)
    el('line', { x1: x0, x2: x1, y1: top, y2: top, class: 'strip-line' }, g)
    if (x1 - x0 >= 22) el('text', { x: x0 + 5, y: stripB - 6, class: 'strip-num' }, g).textContent = l
  })

  // Lines.
  const line = (key) => samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(s[key]).toFixed(1)}`).join('')
  if (samples.length) {
    const netD = line('live')
    el('path', { d: `${netD}L${x(samples.at(-1).t)},${plotB}L${x(samples[0].t)},${plotB}Z`, class: 'net-fill', fill: 'url(#netFill)' }, svg)
    el('path', { d: line('liveRaw'), class: 'raw-line', pathLength: 1 }, svg)
    el('path', { d: netD, class: 'net-line', pathLength: 1 }, svg)
  }

  // Error scatter (crosses, like monkeytype).
  const errs = el('g', { class: 'errs' }, svg)
  for (const s of samples) {
    if (!s.errors) continue
    const cx = x(s.t), cy = ye(s.errors), r = 3.2
    const g = el('g', { class: 'err', style: `--d:${((s.t / duration) * 1.1 + 0.35).toFixed(2)}s` }, errs)
    el('path', { d: `M${cx - r},${cy - r}L${cx + r},${cy + r}M${cx + r},${cy - r}L${cx - r},${cy + r}` }, g)
  }

  // Hover: crosshair + per-second readout.
  const tip = document.createElement('div')
  tip.className = 'chart-tip'
  container.appendChild(tip)
  const showTip = (px, py, html) => {
    tip.innerHTML = html
    tip.style.left = `${Math.max(70, Math.min(W - 70, px))}px`
    tip.style.top = `${py}px`
    tip.classList.add('show')
  }
  const hideTip = () => tip.classList.remove('show')

  const cross = el('g', { class: 'cross' }, svg)
  const crossLine = el('line', { y1: m.t, y2: stripB }, cross)
  const dotNet = el('circle', { r: 3.5, class: 'dot-net' }, cross)
  const dotRaw = el('circle', { r: 2.5, class: 'dot-raw' }, cross)
  const overlay = el('rect', { x: m.l, y: m.t, width: plotR - m.l, height: stripB - m.t, class: 'overlay' }, svg)
  overlay.addEventListener('pointermove', (e) => {
    if (!samples.length) return
    const box = svg.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    const t = Math.round(1 + ((px - m.l) / (plotR - m.l)) * (duration - 1))
    const s = samples[Math.max(0, Math.min(samples.length - 1, t - 1))]
    const cx = x(s.t)
    crossLine.setAttribute('x1', cx)
    crossLine.setAttribute('x2', cx)
    dotNet.setAttribute('cx', cx)
    dotNet.setAttribute('cy', y(s.live))
    dotRaw.setAttribute('cx', cx)
    dotRaw.setAttribute('cy', y(s.liveRaw))
    cross.classList.add('show')
    showTip(cx, m.t, `<b>${s.t}s</b>
      <span><i class="k k-net"></i>net <em>${Math.round(s.live)}</em></span>
      <span><i class="k k-raw"></i>raw <em>${Math.round(s.liveRaw)}</em></span>
      <span><i class="k k-err"></i>errors <em>${s.errors}</em></span>
      <span><i class="k k-lvl" style="--wl: var(--level-${s.level})"></i>level <em>${s.level}</em></span>`)
  })
  overlay.addEventListener('pointerleave', () => {
    cross.classList.remove('show')
    hideTip()
  })

  // Level-change markers sit above the overlay so they win the hover.
  const marks = el('g', { class: 'marks' }, svg)
  for (const c of levelChanges) {
    const up = c.toLevel > c.fromLevel
    const cx = x(c.timeSeconds)
    const g = el('g', {
      class: `mark ${up ? 'up' : 'down'}`,
      style: `--d:${((c.timeSeconds / duration) * 1.1 + 0.3).toFixed(2)}s; --wl: var(--level-${c.toLevel})`,
    }, marks)
    el('line', { x1: cx, x2: cx, y1: m.t - 4, y2: stripB }, g)
    el('text', { x: cx, y: m.t - 10, 'text-anchor': 'middle', class: 'mark-tag' }, g).textContent =
      `${up ? '▲' : '▼'}${c.toLevel}`
    const hit = el('rect', { x: cx - 8, y: m.t - 22, width: 16, height: stripB - m.t + 22, class: 'mark-hit' }, g)
    const label = up ? `Level ${c.toLevel}` : `Level ${c.fromLevel} → ${c.toLevel}`
    hit.addEventListener('pointerenter', () => {
      g.classList.add('hover')
      showTip(cx, m.t - 14, `<b>${label}</b><span class="sub">at ${c.timeSeconds.toFixed(1)}s</span>`)
    })
    hit.addEventListener('pointerleave', () => {
      g.classList.remove('hover')
      hideTip()
    })
  }
}
