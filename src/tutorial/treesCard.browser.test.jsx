/**
 * @vitest-environment node
 *
 * treesCard.browser.test.jsx
 *
 * THE TREES CARD IN A REAL ENGINE, on cards-harness.html: what jsdom cannot
 * answer because it applies no stylesheet and resolves no var().
 *
 *   - the tree rule strokes in --tree at production's weight, a tree zone has
 *     no stroke, and the production rule is oxide at weight 1;
 *   - frozen at the loop's moments, the engine draws the story: the windbreak
 *     part-traced mid-trace, Zone 2 gone after the untick;
 *   - under reduced motion nothing runs, the cursor is gone, and the card
 *     rests on its finished frame;
 *   - at 380px nothing overflows and every label sits in its box;
 *   - AND THE TWO CROPS ARE TOLD APART WHERE THEY MEET, at 380px, measured
 *     off the pixels rather than assumed from the tokens: the windbreak sits
 *     a few pixels above Block 1, and the two hatches share spacing and
 *     weight, so what separates them there is rise and colour alone.
 *
 * Node, not jsdom, for the reason layout.test.jsx gives. Skipped where there
 * is no Chromium.
 */

import { existsSync } from 'node:fs'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const CHROMIUM = '/opt/pw-browsers/chromium'
const available = existsSync(CHROMIUM)
const describeIf = available ? describe : describe.skip
const SLOW = 60_000

let server = null
let browser = null

beforeAll(async () => {
  if (!available) return
  const { createServer } = await import('vite')
  const { chromium } = await import('playwright')
  server = await createServer({ server: { port: 0 }, logLevel: 'error' })
  await server.listen()
  browser = await chromium.launch({ executablePath: CHROMIUM })
}, 120_000)

afterAll(async () => {
  await browser?.close()
  await server?.close()
})

async function openHarness({ width = 1280, height = 860, reduced = false, at = null, dpr = 1 } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr })
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
  const base = server.resolvedUrls.local[0].replace(/\/$/, '')
  const query = at == null ? '' : `&at=${at}`
  await page.goto(`${base}/src/tutorial/cards-harness.html?step=trees${query}`, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="tutorial-step-card"]')
  await page.evaluate(() => document.fonts.ready)
  return page
}

/** What the engine is drawing: each named element's effective opacity, through its ancestors. */
function readFrame() {
  const svg = document.querySelector('.tutorial-anim--trees')
  const opacity = (sel) => {
    let value = 1
    for (let node = svg.querySelector(sel); node && node !== svg; node = node.parentElement) {
      value *= Number(getComputedStyle(node).opacity)
    }
    return Math.round(value * 100) / 100
  }
  const offsets = [1, 2, 3, 4].map((n) =>
    Math.round(Number.parseFloat(getComputedStyle(svg.querySelector(`.tutorial-anim__segment--trees-${n}`)).strokeDashoffset) * 100) / 100
  )
  return {
    zone1: opacity('[data-layer="tree-zones"] [data-zone="1"]'),
    zone2: opacity('[data-layer="tree-zones"] [data-zone="2"]'),
    windbreak: opacity('.tutorial-anim__windbreak'),
    tick2: opacity('.tutorial-anim__tick--trees-2'),
    tab2: opacity('.tutorial-anim__tab--trees-2'),
    drawnTab: opacity('.tutorial-anim__tab--trees-drawn-1'),
    offsets,
  }
}

/**
 * THE MEASURE, run in the page on a screenshot of the diagram: for a patch
 * given in scene units, the ink of its rules and which way they run.
 *
 * INK is the mean of the patch's darkest 8% -- the rules, not the gaps: a
 * 1px rule on an 8-unit pitch covers about an eighth of a patch -- and
 * GROUND the mean of its middle fifth, both in CIE Lab, so lightness and hue
 * can be read apart. `da` and `dL` are the ink's shift from its own ground:
 * which way, and how far, the rule moves the colour it is drawn on. RISE is
 * read by
 * shifting the patch along each diagonal: a ruling is unchanged when moved
 * along its own rules, so the diagonal that changes it least is the one it
 * runs on. `ratio` is how much more the other diagonal changes it.
 */
async function measure(page, patches) {
  const box = await page.evaluate(() => {
    const r = document.querySelector('.tutorial-anim--trees').getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  const shot = await page.screenshot({ clip: box })
  return page.evaluate(
    async ({ b64, patches }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const g = canvas.getContext('2d')
      g.drawImage(img, 0, 0)
      const k = img.width / 400
      const lab = ([r, gr, b]) => {
        const lin = (u) => ((u /= 255) <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4)
        const [R, G, B] = [r, gr, b].map(lin)
        const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
        const X = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047)
        const Y = f(0.2126 * R + 0.7152 * G + 0.0722 * B)
        const Z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883)
        return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]
      }
      const out = {}
      // A patch is a polygon in scene units; a pixel is in it if its centre is.
      const contains = (poly, x, y) => {
        let inside = false
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, yi] = poly[i]
          const [xj, yj] = poly[j]
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
        }
        return inside
      }
      for (const [name, poly] of Object.entries(patches)) {
        const xs = poly.map(([x]) => x)
        const ys = poly.map(([, y]) => y)
        const X = Math.floor(Math.min(...xs) * k)
        const Y = Math.floor(Math.min(...ys) * k)
        const W = Math.ceil(Math.max(...xs) * k) - X
        const H = Math.ceil(Math.max(...ys) * k) - Y
        const d = g.getImageData(X, Y, W, H).data
        const mask = []
        for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) mask.push(contains(poly, (X + x + 0.5) / k, (Y + y + 0.5) / k))
        const all = []
        for (let i = 0; i < d.length; i += 4) all.push([d[i], d[i + 1], d[i + 2]])
        const lumAll = all.map(([r, gr, b]) => 0.2126 * r + 0.7152 * gr + 0.0722 * b)
        const px = all.filter((_, i) => mask[i])
        const lum = lumAll.filter((_, i) => mask[i])
        const sorted = [...lum].sort((a, b) => a - b)
        const q = (f) => sorted[Math.floor(lum.length * f)]
        const mean = (set) => [0, 1, 2].map((j) => set.reduce((s, p) => s + p[j], 0) / set.length)
        const ink = mean(px.filter((_, i) => lum[i] <= q(0.08)))
        const ground = mean(px.filter((_, i) => lum[i] >= q(0.4) && lum[i] <= q(0.6)))
        const s = Math.max(1, Math.round(2 * k))
        let up = 0
        let down = 0
        for (let y = s; y < H - s; y += 1) {
          for (let x = 0; x < W - s; x += 1) {
            const here = y * W + x
            const upward = (y - s) * W + x + s
            const downward = (y + s) * W + x + s
            if (!mask[here] || !mask[upward] || !mask[downward]) continue
            up += Math.abs(lumAll[here] - lumAll[upward])
            down += Math.abs(lumAll[here] - lumAll[downward])
          }
        }
        const [L, a, b] = lab(ink)
        const [gL, ga] = lab(ground)
        out[name] = {
          L: +L.toFixed(1),
          a: +a.toFixed(1),
          b: +b.toFixed(1),
          dL: +(L - gL).toFixed(1),
          da: +(a - ga).toFixed(1),
          rise: up < down ? 'up' : 'down',
          ratio: +((Math.max(up, down) + 1) / (Math.min(up, down) + 1)).toFixed(2),
          px: px.length,
        }
      }
      return out
    },
    { b64: shot.toString('base64'), patches }
  )
}

const rect = (x0, y0, x1, y1) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

/**
 * THE PATCHES, in scene units, each wholly inside its shape and clear of
 * every other mark: the windbreak's own parallelogram inset to 65% about its
 * centre (clear of its heavy drawn edges, whose long sides themselves run
 * "/"), the top of Block 1 just below it, and larger samples of each mark.
 */
const inset = (corners, f) => {
  const cx = corners.reduce((s, [x]) => s + x, 0) / corners.length
  const cy = corners.reduce((s, [, y]) => s + y, 0) / corners.length
  return corners.map(([x, y]) => [cx + f * (x - cx), cy + f * (y - cy)])
}
const PATCHES = {
  windbreak: inset(
    [
      [100, 74],
      [144, 65],
      [147, 78],
      [103, 87],
    ],
    0.65
  ),
  blockTop: rect(134, 88, 162, 96),
  block: rect(128, 100, 168, 138),
  zone1: rect(232, 86, 278, 104),
}

const deltaE = (p, q) => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b)

describeIf('the trees card, in a real engine', () => {
  it(
    'strokes the tree rule in --tree at weight 1, with no stroke on the zone, and the production rule in oxide at weight 1',
    async () => {
      const page = await openHarness({ reduced: true })
      const read = await page.evaluate(() => {
        const token = (name) => {
          const probe = document.createElement('div')
          probe.style.color = `var(${name})`
          document.body.appendChild(probe)
          const value = getComputedStyle(probe).color
          probe.remove()
          return value
        }
        const svg = document.querySelector('.tutorial-anim--trees')
        const style = (sel) => getComputedStyle(svg.querySelector(sel))
        const tree = style('.farm-scene__tree-line')
        const production = style('.farm-scene__hatch-line')
        const zone = style('.farm-scene__tree-zone')
        return {
          tree: token('--tree'),
          oxide: token('--oxide'),
          treeLine: { stroke: tree.stroke, width: tree.strokeWidth },
          productionLine: { stroke: production.stroke, width: production.strokeWidth },
          zone: { stroke: zone.stroke, fill: zone.fill },
        }
      })
      expect(read.treeLine).toEqual({ stroke: read.tree, width: '1px' })
      expect(read.productionLine).toEqual({ stroke: read.oxide, width: '1px' })
      expect(read.zone.stroke).toBe('none')
      expect(read.zone.fill).toMatch(/^url\("?#farm-tree-hatch-/)
      await page.close()
    },
    SLOW
  )

  it(
    'draws the story at its moments: the windbreak part-traced, then both zones on, then Zone 2 off',
    async () => {
      const frames = {}
      for (const at of [0.05, 0.335, 0.5, 0.7]) {
        const page = await openHarness({ at })
        frames[at] = await page.evaluate(readFrame)
        await page.close()
      }
      // Opening: both zones, no windbreak, no drawn tab.
      expect(frames[0.05]).toMatchObject({ zone1: 1, zone2: 1, windbreak: 0, drawnTab: 0, offsets: [1, 1, 1, 1] })
      // Mid-trace: two edges drawn, the third drawing, the fourth not begun.
      const mid = frames[0.335]
      expect(mid.offsets.slice(0, 2)).toEqual([0, 0])
      expect(mid.offsets[2]).toBeGreaterThan(0)
      expect(mid.offsets[2]).toBeLessThan(1)
      expect(mid.offsets[3]).toBe(1)
      expect(mid.windbreak).toBe(0)
      // Closed: the windbreak in, its tab in, both generated zones still on.
      expect(frames[0.5]).toMatchObject({ zone1: 1, zone2: 1, windbreak: 1, drawnTab: 1, offsets: [0, 0, 0, 0] })
      // Unticked: Zone 2 off the map, its tick gone, its tab dimmed.
      expect(frames[0.7]).toMatchObject({ zone1: 1, zone2: 0, tick2: 0, tab2: 0.45, windbreak: 1, offsets: [0, 0, 0, 0] })
    },
    SLOW
  )

  it(
    'runs nothing under reduced motion, and rests on the finished frame with no cursor',
    async () => {
      const page = await openHarness({ reduced: true })
      const read = await page.evaluate(() => {
        const svg = document.querySelector('.tutorial-anim--trees')
        return {
          running: svg.getAnimations({ subtree: true }).filter((a) => a instanceof CSSAnimation).length,
          cursor: getComputedStyle(svg.querySelector('.tutorial-anim__cursor')).display,
        }
      })
      const frame = await page.evaluate(readFrame)
      expect(read.running).toBe(0)
      expect(read.cursor).toBe('none')
      expect(frame).toEqual({ zone1: 1, zone2: 0, windbreak: 1, tick2: 0, tab2: 0.45, drawnTab: 1, offsets: [0, 0, 0, 0] })
      await page.close()
    },
    SLOW
  )

  it(
    'fits at 380px: no page overflow, and every tab and button label inside its box',
    async () => {
      const page = await openHarness({ width: 380, height: 760, reduced: true })
      const read = await page.evaluate(() => {
        const card = document.querySelector('.tutorial__card')
        const inside = (inner, outer) =>
          inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5
        const boxes = [
          ...[...document.querySelectorAll('.tutorial-anim__tab')].map((g) => [g.querySelector('text'), g.querySelector('.tutorial-anim__tab-card')]),
          ...[...document.querySelectorAll('.tutorial-anim__draw-button, .tutorial-anim__commit-button')].map((g) => [
            g.querySelector('text'),
            g.querySelector('rect'),
          ]),
        ]
        return {
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          cardOverflow: card.scrollWidth - card.clientWidth,
          fits: boxes.map(([text, rect]) => [text.textContent, inside(text.getBoundingClientRect(), rect.getBoundingClientRect())]),
        }
      })
      expect(read.pageOverflow).toBe(0)
      expect(read.cardOverflow).toBe(0)
      expect(read.fits).toHaveLength(5)
      for (const [label, fits] of read.fits) expect(fits, label).toBe(true)
      await page.close()
    },
    SLOW
  )

  it(
    'tells the two crops apart where they meet at 380px -- by rise and by hue, since they share spacing and weight',
    async () => {
      for (const dpr of [1, 2]) {
        const page = await openHarness({ width: 380, height: 760, reduced: true, dpr })
        const read = await measure(page, PATCHES)
        // Printed on every run: this is the margin, looked at rather than trusted.
        console.log(`[trees card @380px, ${dpr}x]`, JSON.stringify(read))

        // RISE: each crop runs its own way, and clearly -- both where they
        // meet and on the larger samples.
        for (const tree of ['windbreak', 'zone1']) {
          expect(read[tree].rise, `${tree} @${dpr}x`).toBe('down')
          expect(read[tree].ratio, `${tree} @${dpr}x`).toBeGreaterThanOrEqual(1.25)
        }
        for (const production of ['blockTop', 'block']) {
          expect(read[production].rise, `${production} @${dpr}x`).toBe('up')
          expect(read[production].ratio, `${production} @${dpr}x`).toBeGreaterThanOrEqual(1.25)
        }

        // HUE: each rule pulls its own ground a different way -- the tree
        // rule toward green (a* falls), the production rule toward rust (a*
        // rises). Where they meet, the two inks are apart by more than a
        // just-noticeable step in Lab.
        for (const tree of ['windbreak', 'zone1']) expect(read[tree].da, `${tree} @${dpr}x`).toBeLessThan(-2)
        for (const production of ['blockTop', 'block']) expect(read[production].da, `${production} @${dpr}x`).toBeGreaterThan(1)
        expect(deltaE(read.windbreak, read.blockTop), `ΔE @${dpr}x`).toBeGreaterThan(5)
        await page.close()
      }
    },
    SLOW
  )
})
