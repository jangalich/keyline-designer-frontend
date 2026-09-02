/**
 * water.test.jsx
 *
 * THE WATER STEP, END TO END AGAINST THE REAL BACKEND.
 *
 * The second step definition, and therefore the first real test of whether the
 * step schema generalises. There is no fetch stub in here and no hand-written
 * payload: every figure below comes from api.py's own Flask app running
 * water_survey_areas.identify_water_survey_areas() over the reference parcel's
 * DEM, behind a committed landform.
 *
 * HOW TO RUN IT:
 *
 *     cd ../keyline-designer && python serve_test_backend.py 5099 &
 *     VITE_API_URL=http://127.0.0.1:5099 npx vitest run src/water.test.jsx
 *
 * SKIPPED, NOT FAILED, WITH NO SERVER -- landform.test.jsx's posture, and for
 * its reason: a red suite on a machine with no backend teaches nothing. The
 * sections that need no server (the map controls, the treatments, the shell
 * sweep) run either way.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import L from 'leaflet'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { useMap } from 'react-leaflet'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import App from './App.jsx'
import {
  COMMITTED,
  GENERATED,
  SessionProvider,
  selectDraft,
  selectStepFeatures,
  selectStepStatus,
  buildCommitBody,
  useSession,
} from './session/SessionStore'
import { API_URL } from './session/apiClient'
import {
  WATER_STEP,
  isSurveyZone,
  measure,
  registryProposalFeatures,
  surveyZoneFeatures,
  surveyZoneName,
  surveyZonePanel,
} from './wizard/stepDefinitions'
import TabStrip, { COLLAPSED_TAB_CAP, collapsedTabs } from './wizard/shell/TabStrip.jsx'
import { LANDFORM_STEP } from './wizard/stepDefinitions'
import WizardShell from './wizard/WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './wizard/WizardCursor.jsx'
import MapLayerStack from './map/MapLayerStack.jsx'
import { styleFor } from './map/layers.jsx'
import { patternIdFor } from './ProductionHatchPattern.jsx'
import { DrawingProgressProvider } from './map/DrawingProgress.jsx'
import { MapContainer } from 'react-leaflet'
import rings from './fixtures/rings.json'

const SRC = path.dirname(fileURLToPath(import.meta.url))

const toLatLng = (ring) => ring.map(([lng, lat]) => [lat, lng])
const BOUNDARY = toLatLng(rings.boundary)

/* ---------------------------------------------------------------------------
   Is the backend there?
   --------------------------------------------------------------------------- */

/**
 * THE REAL TOKENS, INTO jsdom, BEFORE ANYTHING RENDERS.
 *
 * The map's colours are read off the document with getComputedStyle -- Leaflet
 * cannot resolve a var() in a pathOption, so every map component in this
 * project reads the token and hands Leaflet the value. jsdom applies no
 * stylesheet, so index.css's :root block is not there and every one of those
 * reads returns an empty string. That is fine for a test about z-order or
 * classes; it makes "the two treatments are different colours" unaskable.
 *
 * So the tokens are set as inline custom properties on the document element,
 * WITH THE VALUES PARSED OUT OF index.css rather than written here. The test
 * still asserts against the shipped palette -- there is one source for these
 * numbers and it is the stylesheet -- and jsdom can now answer the question.
 *
 * BEFORE THE FIRST RENDER, because layers.jsx caches what it reads (main.jsx
 * imports App.jsx before index.css, so a module-evaluation read would return
 * empty strings; the cache is filled on first render instead).
 */
beforeAll(() => {
  const tokens = readFileSync(path.join(SRC, 'index.css'), 'utf8')
  for (const [, name, value] of tokens.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    document.documentElement.style.setProperty(name, value)
  }
  // THE PATTERN LEVELS TOO, and for the same reason: they are numbers rather
  // than colours, but they are read off the document by the same mechanism --
  // Leaflet cannot resolve a var() in a pathOption, so a level is a token read
  // at render. Without them every zone renders at opacity 0 under jsdom.
  for (const [, name, value] of tokens.matchAll(/(--pattern-[a-z-]+):\s*([\d.]+)\s*;/g)) {
    document.documentElement.style.setProperty(name, value)
  }
})

let live = false

beforeAll(async () => {
  try {
    const response = await fetch(`${API_URL}/api/health`)
    live = response.ok
  } catch {
    live = false
  }
  if (!live) {
    console.warn(
      `\n  No backend at ${API_URL}. The end-to-end sections are SKIPPED.\n` +
        '  Start one with: python serve_test_backend.py 5099\n'
    )
  }
})

/**
 * Two real generates and a real commit per test: landform over the DEM, then
 * water over six cached edges plus landform's committed answer.
 */
const LIVE_TIMEOUT_MS = 300000

const liveIt = (name, fn) =>
  it(name, async (context) => (live ? fn(context) : context.skip()), LIVE_TIMEOUT_MS)

/* ---------------------------------------------------------------------------
   The surface
   --------------------------------------------------------------------------- */

const mounted = []

async function renderApp() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let session = null
  let cursor = null
  let map = null

  function Probe() {
    session = useSession()
    cursor = useWizardCursor()
    return null
  }
  function MapProbe() {
    map = useMap()
    return null
  }

  await React.act(async () => {
    root.render(
      <SessionProvider autoResume={false} proposalFeatures={registryProposalFeatures}>
        <WizardCursorProvider>
          <DrawingProgressProvider>
            <Probe />
            <MapContainer center={BOUNDARY[0]} zoom={17} style={{ height: 600, width: 600 }}>
              <MapProbe />
              <MapLayerStack />
            </MapContainer>
            <WizardShell />
          </DrawingProgressProvider>
        </WizardCursorProvider>
      </SessionProvider>
    )
  })

  const ui = {
    container,
    get state() {
      return session.state
    },
    get cursor() {
      return cursor
    },
    get map() {
      return map
    },
    get water() {
      return session.state.steps.water?.proposals ?? null
    },
    find: (id) => container.querySelector(`[data-testid="${id}"]`),
    text: (id) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? null,
    all: (selector) => [...container.querySelectorAll(selector)],
    async run(fn) {
      let out
      await React.act(async () => {
        out = await fn(session.actions, cursor)
      })
      return out
    },
    async click(id) {
      const element = container.querySelector(`[data-testid="${id}"]`)
      if (!element) throw new Error(`no element with data-testid="${id}"`)
      await React.act(async () => element.click())
    },
    async toggle(featureId) {
      await React.act(async () => session.actions.toggleSelection('water', featureId))
    },
    async focus(featureId) {
      await React.act(async () => cursor.focusFeature(featureId))
    },
    /** A click on bare map, the way Leaflet delivers one to its listeners. */
    async clickMap() {
      await React.act(async () => map.fire('click', { latlng: L.latLng(...BOUNDARY[0]) }))
    },
    async waitFor(what, predicate, timeoutMs = 240000) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        await React.act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 25))
        })
        if (predicate()) return
      }
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for: ${what}\n` +
          `  landform=${selectStepStatus(this.state, 'landform')} ` +
          `water=${selectStepStatus(this.state, 'water')} ` +
          `error=${JSON.stringify(this.state.steps.water?.error)}`
      )
    },
    async unmount() {
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
  mounted.push(ui)
  return ui
}

afterAll(async () => {
  for (const ui of mounted.splice(0)) await ui.unmount()
})

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

/**
 * Boundary committed, landform generated AND COMMITTED, water generated.
 *
 * THE LANDFORM COMMIT IS NOT SETUP CONVENIENCE. The water step's registry
 * entry consumes landform's `production_areas` as a COMMITTED edge -- the
 * first committed edge in the table -- and refuses to generate at all before
 * it lands, because siting a pond against zones the user rejected is precisely
 * the plausible-wrong-answer this branch of the pipeline exists to refuse.
 */
async function throughWaterGenerate(ui) {
  await ui.run((a) => a.setDraftInput('boundary', 'ring', BOUNDARY))
  await ui.click('commit-boundary')
  await ui.waitFor('the session to exist', () => Boolean(ui.state.sessionId))

  await ui.click('generate-landform')
  await ui.waitFor(
    'landform to generate',
    () => selectStepStatus(ui.state, 'landform') === GENERATED
  )
  await ui.waitFor('the landform draft', () => ui.state.drafts.landform !== undefined)
  await ui.click('commit-landform')
  await ui.waitFor(
    'landform to commit',
    () => selectStepStatus(ui.state, 'landform') === COMMITTED
  )

  // The cursor auto-advances off a committed step, so water is already open.
  expect(ui.cursor.cursorStepId).toBe('water')
  await ui.click('generate-water')
  await ui.waitFor('water to generate', () => selectStepStatus(ui.state, 'water') === GENERATED)
  await ui.waitFor('the water draft', () => ui.state.drafts.water !== undefined)
  return ui
}

/** Open the strip past its one-row cap, the way the "+N more" cell does. */
async function expandTabs(ui) {
  if (ui.find('tabs-more-water')) await ui.click('tabs-more-water')
}

/** Every zone envelope in the live payload, grouped by survey type. */
function zonesByType(payload) {
  const zones = surveyZoneFeatures(payload)
  return {
    embankment: zones.filter((f) => f.properties.survey_type === 'embankment'),
    excavated: zones.filter((f) => f.properties.survey_type === 'excavated'),
  }
}

/* ===========================================================================
   1. END TO END
   =========================================================================== */

describe('1. end to end against the real backend', () => {
  liveIt(
    'commits landform, generates water, tabs both types, selects across both, commits, and the document carries them',
    async () => {
      const ui = await renderApp()
      await throughWaterGenerate(ui)

      const payload = ui.water
      expect(sortedKeys(payload)).toEqual(['summary', 'survey_zones', 'zones'])

      // BOTH TYPES, FROM ONE ENTRY POINT AND ONE COLLECTION.
      const { embankment, excavated } = zonesByType(payload)
      expect(embankment.length).toBeGreaterThan(0)
      expect(excavated.length).toBeGreaterThan(0)
      expect(payload.summary.embankment_zone_count).toBe(embankment.length)
      expect(payload.summary.excavated_zone_count).toBe(excavated.length)

      // A TAB PER ZONE ENVELOPE, AND ONLY PER ENVELOPE. The collection also
      // carries every member footprint; none of them is a proposal, a tab or
      // a committable feature.
      const memberCount = payload.survey_zones.features.filter((f) => !isSurveyZone(f)).length
      expect(memberCount).toBeGreaterThan(0)
      // THE STRIP COLLAPSES TO ONE ROW and offers "+N more"; expanding it is
      // the affordance, and the count under test is the count of TABS rather
      // than the count the collapsed row happens to fit.
      await expandTabs(ui)
      const tabs = ui.all('[data-testid^="tab-"][data-tab-id]')
      expect(tabs.length).toBe(embankment.length + excavated.length)

      // MULTI-SELECT ACROSS BOTH TYPES. The seed takes every envelope; drop
      // one of each type so the commit is a real choice spanning both layers.
      const dropped = [embankment[embankment.length - 1].id, excavated[excavated.length - 1].id]
      for (const id of dropped) await ui.toggle(id)

      const kept = selectDraft(ui.state, 'water').selectedFeatureIds
      expect(kept).not.toContain(dropped[0])
      expect(kept).not.toContain(dropped[1])
      const keptTypes = new Set(
        kept.map(
          (id) => surveyZoneFeatures(payload).find((f) => f.id === id).properties.survey_type
        )
      )
      expect([...keptTypes].sort()).toEqual(['embankment', 'excavated'])

      // THE BODY THE COMMIT WOULD SEND, through the store's own assembler and
      // the registry's own answer to which collection it reads.
      const body = buildCommitBody(ui.state, 'water', registryProposalFeatures)
      expect(body.features.features.map((f) => f.id).sort()).toEqual([...kept].sort())
      for (const feature of body.features.features) {
        expect(['survey_zone_embankment', 'survey_zone_excavated']).toContain(
          feature.properties.layer
        )
      }

      await ui.click('commit-water')
      await ui.waitFor('water to commit', () => selectStepStatus(ui.state, 'water') === COMMITTED)

      // THE DOCUMENT CARRIES THEM -- both types, exactly the kept set.
      const committed = selectStepFeatures(ui.state, 'water')
      expect(committed.features.map((f) => f.id).sort()).toEqual([...kept].sort())
      const committedTypes = new Set(committed.features.map((f) => f.properties.survey_type))
      expect([...committedTypes].sort()).toEqual(['embankment', 'excavated'])

      await ui.unmount()
    }
  )
})

function sortedKeys(object) {
  return Object.keys(object ?? {}).sort()
}

/* ===========================================================================
   2. RANK IS PER TYPE
   =========================================================================== */

describe('2. rank carries its type', () => {
  it('names a zone by its type and rank, so two rank-1 zones are different things', () => {
    expect(surveyZoneName({ survey_type: 'embankment', rank: 1 })).toBe('Embankment 1')
    expect(surveyZoneName({ survey_type: 'excavated', rank: 1 })).toBe('Excavated 1')
    expect(surveyZoneName({ survey_type: 'embankment', rank: 1 })).not.toBe(
      surveyZoneName({ survey_type: 'excavated', rank: 1 })
    )
  })

  liveIt('shows both rank 1s on the strip, distinguishable', async () => {
    const ui = await renderApp()
    await throughWaterGenerate(ui)

    const { embankment, excavated } = zonesByType(ui.water)
    // rank_survey_zones_per_type() ranks each type independently, so both
    // exist on the same parcel.
    const e1 = embankment.find((f) => f.properties.rank === 1)
    const x1 = excavated.find((f) => f.properties.rank === 1)
    expect(e1).toBeDefined()
    expect(x1).toBeDefined()

    await expandTabs(ui)
    const names = [ui.text(`tab-focus-${e1.id}`), ui.text(`tab-focus-${x1.id}`)]
    expect(names[0]).toContain('Embankment 1')
    expect(names[1]).toContain('Excavated 1')
    expect(names[0]).not.toBe(names[1])

    await ui.unmount()
  })
})

/* ===========================================================================
   3. TWO TREATMENTS
   =========================================================================== */

describe('3. two treatments, both cased', () => {
  it('declares two editable layers over one payload key, filtered and treated apart', () => {
    const editable = WATER_STEP.layers.filter((l) => l.band === 'editable')
    expect(editable.map((l) => l.id)).toEqual(['water-embankment', 'water-excavated'])
    // ONE KEY, TWO LAYERS -- the shape `filter` exists for.
    expect(editable.every((l) => l.key === 'survey_zones')).toBe(true)
    expect(editable.map((l) => l.treatment)).toEqual(['survey-embankment', 'survey-excavated'])

    // The filters actually separate them, and neither takes a member.
    const embankment = { properties: { layer: 'survey_zone_embankment' } }
    const excavated = { properties: { layer: 'survey_zone_excavated' } }
    const member = { properties: { layer: 'survey_zone_member_embankment' } }
    expect(editable[0].filter(embankment)).toBe(true)
    expect(editable[0].filter(excavated)).toBe(false)
    expect(editable[0].filter(member)).toBe(false)
    expect(editable[1].filter(excavated)).toBe(true)
    expect(editable[1].filter(member)).toBe(false)
  })

  it('derives the embankment blue against a stated ceiling, and names both at :root', () => {
    const tokens = readFileSync(path.join(SRC, 'index.css'), 'utf8')
    const excavated = tokens.match(/--survey-excavated:\s*(#[0-9a-fA-F]{6})/)
    const embankment = tokens.match(/--survey-embankment:\s*(#[0-9a-fA-F]{6})/)
    const halo = tokens.match(/--halo:\s*(#[0-9a-fA-F]{6})/)
    expect(excavated).not.toBeNull()
    expect(embankment).not.toBeNull()

    // BOTH BLUE, ONE LIGHTER -- and a TONAL PAIR rather than two colours:
    // same hue and saturation, so the step is carried by the pattern and only
    // the type is carried by the value.
    expect(isBlue(embankment[1])).toBe(true)
    expect(isBlue(excavated[1])).toBe(true)
    expect(luminance(embankment[1])).toBeGreaterThan(luminance(excavated[1]))
    expect(Math.abs(hueOf(embankment[1]) - hueOf(excavated[1]))).toBeLessThan(2)
    expect(Math.abs(saturationOf(embankment[1]) - saturationOf(excavated[1]))).toBeLessThan(0.05)

    /**
     * THE CEILING, DERIVED HERE RATHER THAN TAKEN ON TRUST.
     *
     * The embankment blue has to clear the excavated blue AND the --halo its
     * own stipple dots sit on, and it has to be LIGHTER than the excavated
     * one -- so it is squeezed between the two. The best any colour between
     * two others can manage against both is the geometric mean of the pair's
     * own contrast: at the midpoint the two ratios are equal, and any move
     * from it raises one only by lowering the other.
     *
     * #3d5a6c is 7.30:1 from --halo, so the ceiling is sqrt(7.30) = 2.70:1.
     * 3:1 IS NOT REACHABLE and asking for it would have meant changing the
     * given excavated blue. Computed from the tokens rather than written down,
     * so retuning either end moves the target instead of stranding it.
     */
    const ceiling = Math.sqrt(contrast(excavated[1], halo[1]))
    expect(ceiling).toBeLessThan(3)

    const vsExcavated = contrast(embankment[1], excavated[1])
    const vsHalo = contrast(embankment[1], halo[1])

    // ON THE CEILING, TO WITHIN A THOUSANDTH, ON BOTH SIDES. A one-sided
    // assertion would pass for a colour that bought one ratio with the other,
    // which is exactly the failure this is here to catch.
    expect(vsExcavated).toBeGreaterThan(ceiling - 0.01)
    expect(vsHalo).toBeGreaterThan(ceiling - 0.01)
    expect(Math.abs(vsExcavated - vsHalo)).toBeLessThan(0.01)

    // AND THE EXCAVATED BLUE CLEARS ITS OWN CASING COMFORTABLY -- it is the
    // dark end, so nothing is squeezing it.
    expect(contrast(excavated[1], halo[1])).toBeGreaterThanOrEqual(3)
  })

  it('keeps every colour literal at :root', () => {
    // The renderer reads a token by the name the layer declared; no literal
    // reaches the component stylesheet, the stack, the definitions or the
    // pattern host.
    const components = readFileSync(path.join(SRC, 'App.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      ''
    )
    expect(components.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([])
    for (const file of [
      'map/layers.jsx',
      'map/layerStack.js',
      'wizard/stepDefinitions.js',
      'ProductionHatchPattern.jsx',
    ]) {
      const source = readFileSync(path.join(SRC, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      expect(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([])
    }
  })

  it('cases the pattern\'s own marks, now that no zone has an edge to case', () => {
    const patterns = readFileSync(path.join(SRC, 'ProductionHatchPattern.jsx'), 'utf8')
    // THE CASING MOVED INTO THE PATTERN. A stipple dot carries a --halo ring
    // under it -- the same halo-casing rule the boundary and the drawn zones
    // use, applied to the marks that now do the work, because a pattern has no
    // outline to lay a casing under.
    expect(patterns).toContain('STIPPLE_HALO_PX')
    expect(patterns).toContain("readToken('--halo')")
    expect(patterns).toMatch(/stippleTile\(spec, colour, halo\)/)

    // AND THE ZONE ITSELF IS NOT CASED. layers.jsx cases a drawn shape and
    // nothing else; a treated layer used to be cased and no longer is.
    const layers = readFileSync(path.join(SRC, 'map', 'layers.jsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    expect(layers).toMatch(/\{isDrawn\s*$/m)
    expect(layers).not.toMatch(/isDrawn \|\| treatment/)
  })

  liveIt('renders the two types into two panes with two classes', async () => {
    const ui = await renderApp()
    await throughWaterGenerate(ui)

    const embankmentPane = ui.container.querySelector('.leaflet-water--water-embankment-pane')
    const excavatedPane = ui.container.querySelector('.leaflet-water--water-excavated-pane')
    expect(embankmentPane).not.toBeNull()
    expect(excavatedPane).not.toBeNull()

    // Each pane holds ONLY its own type's zones, and each path carries its own
    // treatment class. Two casing paths per zone (the halo pass) plus the line.
    const embankmentPaths = [...embankmentPane.querySelectorAll('.zone--survey-embankment')]
    const excavatedPaths = [...excavatedPane.querySelectorAll('.zone--survey-excavated')]
    const { embankment, excavated } = zonesByType(ui.water)
    expect(embankmentPaths.length).toBe(embankment.length)
    expect(excavatedPaths.length).toBe(excavated.length)
    expect(embankmentPane.querySelector('.zone--survey-excavated')).toBeNull()

    // DISTINCT FILLS, EACH POINTING AT ITS OWN PATTERN -- and NO STROKE on
    // either. This assertion used to compare the two paths' `stroke`
    // attributes, back when a treatment was a cased line; the mark is the
    // pattern now and a zone carries no edge in any state.
    const fills = new Set([
      embankmentPaths[0].getAttribute('fill'),
      excavatedPaths[0].getAttribute('fill'),
    ])
    expect(fills.size).toBe(2)
    expect([...fills].every((fill) => fill.startsWith('url(#zone-pattern-'))).toBe(true)
    for (const path of [embankmentPaths[0], excavatedPaths[0]]) {
      expect(path.getAttribute('stroke')).toBe('none')
    }

    await ui.unmount()
  })
})

/** WCAG relative luminance -- the same one the contrast ratio below needs. */
function luminance(hex) {
  const channel = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two hex colours. */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Blue dominates, which is what "the blue family" means numerically. */
function isBlue(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return b > r && b > g
}

/** Hue in degrees, for asserting the two survey values are one tonal pair. */
function hueOf(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return h * 60
}

/** HSV saturation, the other half of "same colour, different lightness". */
function saturationOf(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max
}

/* ===========================================================================
   4. THE EYE
   =========================================================================== */

describe('4. the eye hides and excludes; the tab stays', () => {
  liveIt('takes a zone off the map and out of the commit body, and leaves its tab', async () => {
    const ui = await renderApp()
    await throughWaterGenerate(ui)

    const { embankment } = zonesByType(ui.water)
    const victim = embankment[0]
    const pane = () => ui.container.querySelector('.leaflet-water--water-embankment-pane')

    expect(pane().querySelectorAll('.zone--survey-embankment').length).toBe(embankment.length)

    await ui.click(`tab-eye-${victim.id}`)

    // HIDDEN FROM THE MAP ENTIRELY -- not dimmed, not dashed.
    expect(pane().querySelectorAll('.zone--survey-embankment').length).toBe(
      embankment.length - 1
    )
    // OUT OF THE COMMIT BODY.
    const body = buildCommitBody(ui.state, 'water', registryProposalFeatures)
    expect(body.features.features.map((f) => f.id)).not.toContain(victim.id)
    // THE TAB STAYS, with its eye closed, so it can be put back.
    const tab = ui.find(`tab-${victim.id}`)
    expect(tab).not.toBeNull()
    expect(tab.getAttribute('data-eye')).toBe('off')

    await ui.click(`tab-eye-${victim.id}`)
    expect(pane().querySelectorAll('.zone--survey-embankment').length).toBe(embankment.length)

    await ui.unmount()
  })
})

/* ===========================================================================
   5. NO × ON ANY WATER TAB
   =========================================================================== */

describe('5. nothing here can be destroyed', () => {
  it('declares no removable tab, and no delete tool', () => {
    // SELECT ONLY. No draw, no delete -- so there is no verb that could
    // destroy anything and no shape the user authored to destroy.
    expect(WATER_STEP.tools).toEqual(['select'])

    const tabs = WATER_STEP.tabs({
      proposals: FIXTURE,
      draft: { selectedFeatureIds: [], drawnFeatures: [] },
    })
    expect(tabs.length).toBeGreaterThan(0)
    expect(tabs.every((tab) => tab.eye)).toBe(true)
    expect(tabs.some((tab) => tab.removable)).toBe(false)
  })

  liveIt('renders no × in the strip', async () => {
    const ui = await renderApp()
    await throughWaterGenerate(ui)

    const tabs = ui.all('[data-testid^="tab-"][data-tab-id]')
    expect(tabs.length).toBeGreaterThan(0)
    for (const tab of tabs) {
      expect(tab.querySelector('.chrome-tab__remove')).toBeNull()
      // The eye is there on every one of them, which is the other half of the
      // asymmetry: the only removal is the one that can be undone.
      expect(tab.querySelector('.chrome-tab__eye')).not.toBeNull()
    }
    expect(ui.all('[data-testid^="tab-remove-"]')).toHaveLength(0)

    await ui.unmount()
  })
})

/* ===========================================================================
   6. THE EMPTY COMMIT
   =========================================================================== */

describe('6. an empty commit is a decision', () => {
  it('renames the button rather than blocking it', () => {
    expect(WATER_STEP.commit.canCommit({ committableCount: 0 })).toBe(true)
    expect(WATER_STEP.commit.blockedReason({ committableCount: 0 })).toBeNull()
    expect(WATER_STEP.commit.label({ committableCount: 0 })).toBe('Commit no water zones')
    expect(WATER_STEP.commit.label({ committableCount: 2 })).toBe('Commit water zones')
  })

  liveIt('states the decision on the button, and the empty commit lands', async () => {
    const ui = await renderApp()
    await throughWaterGenerate(ui)

    // Close every eye. The strip stays; the commit becomes an empty one.
    for (const feature of surveyZoneFeatures(ui.water)) await ui.toggle(feature.id)
    expect(selectDraft(ui.state, 'water').selectedFeatureIds).toEqual([])

    // THE BUTTON SAYS WHAT IT WOULD DO. Not "Commit water zones" over an
    // empty selection -- the decision is named before it is recorded.
    const button = ui.find('commit-water')
    expect(button.textContent).toContain('Commit no water zones')
    expect(button.disabled).toBe(false)

    await ui.click('commit-water')
    await ui.waitFor('the empty commit to land', () => selectStepStatus(ui.state, 'water') === COMMITTED)

    // min_features: 0. Zero features IS the answer, and the document records it.
    expect(selectStepFeatures(ui.state, 'water').features).toEqual([])

    await ui.unmount()
  })
})

/* ===========================================================================
   7. THE SENTINELS
   =========================================================================== */

describe('7. an unchecked overlap is not a measured zero', () => {
  it('prints an em dash for null and 0.0 for zero, and they are different strings', () => {
    expect(measure(null)).toBe('—')
    expect(measure(undefined)).toBe('—')
    expect(measure(0)).toBe('0.0')
    expect(measure(null)).not.toBe(measure(0))
  })

  it('carries the difference all the way into the panel, per overlap', () => {
    // ONE ZONE, THREE OVERLAPS, THREE DIFFERENT ANSWERS, and the panel says
    // three different things about them:
    //   canopy      NEVER CHECKED -- a row, valued null, rendered as an em
    //               dash. Absence would be indistinguishable from the zero.
    //   road        CHECKED, GENUINELY NONE -- NO ROW AT ALL. Nothing to
    //               caution anybody about is the cheapest cut there is.
    //   production  6.4% -- a row with the figure.
    const zone = fixtureZone({
      canopy_overlap_pct: null,
      road_overlap_pct: 0.0,
      production_overlap_pct: 6.4,
    })
    const rows = [
      ...alwaysRows(zone.properties),
      { key: 'production_overlap_pct', label: 'on committed production ground', value: 6.4, unit: 'percent' },
      { key: 'canopy_overlap_pct', label: 'under tree canopy', value: null, unit: 'percent' },
    ]
    const detail = WATER_STEP.detail(
      { proposals: payloadOf([zone], {}, { panels: { [zone.id]: rows } }) },
      zone.id
    )

    const field = (label) => detail.fields.find((f) => f.label === label)
    expect(field('under tree canopy (percent)').value).toBe('—')
    expect(field('on committed production ground (percent)').value).toBe('6.4')
    // A MEASURED ZERO IS NOT ON THE PANEL, and its absence is not this side's
    // doing -- the backend never sent a row for it.
    expect(detail.fields.some((f) => f.label.startsWith('removed by existing farm road'))).toBe(false)
    // DISTINGUISHABLE ON SCREEN, which is the whole point of the sentinel:
    // nothing on this path can turn the null into the figure beside it.
    expect(field('under tree canopy (percent)').value).not.toBe(
      field('on committed production ground (percent)').value
    )
  })

  liveIt('renders the live payload\'s own rows, coercing none of them', async () => {
    const ui = await renderApp()
    await throughWaterGenerate(ui)

    // The reference parcel measures all three overlaps, so its zones carry
    // genuine zeros -- and a genuine zero is a row the backend DOES NOT SEND.
    // What must reach the screen is exactly the rows it did send, with every
    // value as it sent it.
    const zones = surveyZoneFeatures(ui.water)
    const withZero = zones.find((f) =>
      ['canopy_overlap_pct', 'road_overlap_pct', 'production_overlap_pct'].some(
        (k) => f.properties[k] === 0
      )
    )
    expect(withZero, 'a checked-zero overlap on the reference parcel').toBeDefined()

    await ui.focus(withZero.id)
    const rows = surveyZonePanel(ui.water, withZero.id)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      // A ZERO OVERLAP IS NOT A ROW. If one ever is, the panel is showing a
      // measured absence where the design says nothing.
      if (row.key.endsWith('_overlap_pct')) expect(row.value).not.toBe(0)
      const rendered = ui.text(
        `detail-value-${row.unit ? `${row.label} (${row.unit})` : row.label}`
      )
      expect(rendered).not.toBeNull()
      if (row.value == null) expect(rendered).toBe('—')
    }

    await ui.unmount()
  })
})

/* ===========================================================================
   8. THE AGREEMENT REPORT
   =========================================================================== */

describe('8. cross_type_overlaps is a finding about the ground', () => {
  it('reaches the panel as the backend\'s either-type row, naming the other zone', () => {
    // THE RESOLUTION FROM ZONE ID TO A NAME IS THE BACKEND'S NOW.
    // cross_type_overlaps names zones by INTERNAL id, which means nothing to a
    // reader, and the fraction has a threshold (CROSS_TYPE_OVERLAP_NOTE_
    // FRACTION) below which the finding does not fire. Both of those are
    // decisions about a measurement; both moved to build_zone_panel(), which
    // ships one row valued with the other zone's type-and-rank name. This side
    // renders it.
    const embankment = fixtureZone({
      zone_id: 1,
      survey_type: 'embankment',
      rank: 1,
      cross_type_overlaps: [{ zone_id: 4, fraction: 0.6 }],
    })
    const excavated = fixtureZone({
      zone_id: 4,
      survey_type: 'excavated',
      rank: 2,
      layer: 'survey_zone_excavated',
      cross_type_overlaps: [{ zone_id: 1, fraction: 0.6 }],
    })
    const rows = [
      ...alwaysRows(embankment.properties),
      { key: 'either_type_candidate', label: 'also a candidate as', value: 'excavated 2', unit: null },
    ]
    const detail = WATER_STEP.detail(
      {
        proposals: payloadOf([embankment, excavated], {}, {
          panels: { [embankment.id]: rows },
        }),
      },
      embankment.id
    )
    const field = detail.fields.find((f) => f.label === 'also a candidate as')
    expect(field.value).toBe('excavated 2')
    // PROSE, not a figure: it is categorical and has no decimal point to hold
    // still in the aligned column.
    expect(field.measured).toBe(false)
  })

  liveIt('renders, and does not move when the selection does', async () => {
    const ui = await renderApp()
    await throughWaterGenerate(ui)

    const zones = surveyZoneFeatures(ui.water)
    const overlapping = zones.find((f) => (f.properties.cross_type_overlaps ?? []).length > 0)
    expect(overlapping, 'the two surfaces agree somewhere on the reference parcel').toBeDefined()

    await ui.focus(overlapping.id)
    const before = surveyZonePanel(ui.water, overlapping.id)
    expect(before.length).toBeGreaterThan(0)
    const renderedBefore = ui
      .all('[data-testid^="detail-value-"]')
      .map((n) => n.textContent)

    // CHANGE THE SELECTION -- take the OTHER zone out of the commit entirely.
    const other = zones.find(
      (f) => f.properties.zone_id === overlapping.properties.cross_type_overlaps[0].zone_id
    )
    await ui.toggle(other.id)
    expect(selectDraft(ui.state, 'water').selectedFeatureIds).not.toContain(other.id)

    // IT IS COMPUTED AT GENERATE TIME AGAINST SURVIVING ZONES AND IS NOT
    // RECOMPUTED AGAINST THE COMMIT SET. Closing a zone's eye does not make
    // the other instrument stop agreeing with it -- nor does it move any other
    // row on this zone's panel, because the whole panel is a reading of the
    // GROUND and the commit set is not one of its inputs.
    expect(surveyZonePanel(ui.water, overlapping.id)).toEqual(before)
    expect(ui.all('[data-testid^="detail-value-"]').map((n) => n.textContent)).toEqual(
      renderedBefore
    )

    await ui.unmount()
  })
})

/* ===========================================================================
   THE MARK IS THE PATTERN: NO ZONE CARRIES A STROKE IN ANY STATE
   =========================================================================== */

/**
 * The four colours styleFor is handed. Values are irrelevant to every
 * assertion below -- what is under test is whether a stroke is set at all and
 * which pattern the fill points at -- so these are named rather than read.
 */
const COLORS = { field: 'F', accent: 'A', ink: 'I', halo: 'H' }

describe('the pattern is the mark', () => {
  /**
   * EVERY STATE A ZONE CAN BE IN, THROUGH THE REAL styleFor.
   *
   * ASSERTED ON THE ABSENCE OF A STROKE, NOT ON A CLASS NAME. A class says
   * which rule was chosen; `stroke: false` is the thing that is actually true
   * of the rendered path, and it is what a reader looking at the map sees.
   */
  const states = [
    { name: 'uncommitted, in the commit, not being read', style: { treatment: 'production' } },
    { name: 'focused -- the one being read', style: { treatment: 'production', isFocused: true } },
    { name: 'committed', style: { treatment: 'production', isCommitted: true } },
    { name: 'water, uncommitted', style: { treatment: 'survey-embankment' } },
    { name: 'water, focused', style: { treatment: 'survey-excavated', isFocused: true } },
    { name: 'water, committed', style: { treatment: 'survey-excavated', isCommitted: true } },
    { name: 'a layer that declared no treatment', style: {} },
  ]

  for (const state of states) {
    it(`renders no stroke: ${state.name}`, () => {
      const style = styleFor({ ...state.style, colors: COLORS })
      expect(style.stroke).toBe(false)
      // Not merely `stroke: false` with a weight left behind for something to
      // switch back on.
      expect(style.weight).toBeUndefined()
      expect(style.dashArray).toBeUndefined()
    })
  }

  it('leaves the unselected state with nothing to draw at all', () => {
    // THE FOURTH STATE IS AN ABSENCE. A zone whose eye is closed is not drawn
    // -- FeatureLayer filters it before any style is chosen -- so "does it
    // carry a stroke" has no path to ask it of. That is the eye's own
    // treatment and it predates the pattern scheme.
    const layers = readFileSync(path.join(SRC, 'map', 'layers.jsx'), 'utf8')
    expect(layers).toMatch(/isEditable\s*\n?\s*\?\s*layer\.features\.filter/)
  })

  it('DOES still outline a drawn zone, which is the distinction rather than an exception', () => {
    // A drawn zone's edge was placed vertex by vertex, deliberately and
    // exactly, so a hard line is TRUE of it. The pattern says what the ground
    // is for; the edge says whether its boundary is a suggestion or a decision.
    const drawn = styleFor({ isDrawn: true, treatment: 'production', colors: COLORS })
    expect(drawn.stroke).toBe(true)
    expect(drawn.weight).toBeGreaterThan(0)
    // ...and it carries the pattern too, so it is the same KIND of ground.
    expect(drawn.fillColor).toContain('url(#')
  })

  it('keeps the 422 outline, which is not a zone state', () => {
    // REPORTED RATHER THAN QUIETLY REMOVED. A rejection is the server refusing
    // this exact shape; it has to be findable among zones that all look
    // correct, and the pattern language has no level for "this one is wrong".
    const rejected = styleFor({ rejection: { reason: 'no' }, colors: COLORS })
    expect(rejected.stroke).toBe(true)
    expect(rejected.className).toBe('zone--rejected')
  })
})

/* ===========================================================================
   WATER STIPPLES, PRODUCTION HATCHES, COMMITTED MUTES
   =========================================================================== */

describe('one pattern per step, three levels per pattern', () => {
  it('points each treatment at its own pattern, and water is not production', () => {
    const production = styleFor({ treatment: 'production', colors: COLORS })
    const embankment = styleFor({ treatment: 'survey-embankment', colors: COLORS })
    const excavated = styleFor({ treatment: 'survey-excavated', colors: COLORS })

    expect(production.fillColor).toBe(`url(#${patternIdFor('production')})`)
    expect(embankment.fillColor).toBe(`url(#${patternIdFor('survey-embankment')})`)
    expect(excavated.fillColor).toBe(`url(#${patternIdFor('survey-excavated')})`)
    // WATER NO LONGER INHERITS PRODUCTION'S MARK, which is what the blanket
    // stylesheet rule used to make unavoidable.
    expect(embankment.fillColor).not.toBe(production.fillColor)
  })

  it('draws water as stipple and production as hatch', () => {
    const patterns = readFileSync(path.join(SRC, 'ProductionHatchPattern.jsx'), 'utf8')
    const spec = (treatment) =>
      patterns.match(new RegExp(`treatment: '${treatment}', kind: '(\\w+)'`))?.[1]
    expect(spec('production')).toBe('hatch')
    expect(spec('survey-embankment')).toBe('stipple')
    expect(spec('survey-excavated')).toBe('stipple')
  })

  it('is ONE pattern in two values for the two survey types, not two patterns', () => {
    // The STEP distinction is carried by the pattern; the TYPE distinction
    // within a step by the value. A reader learns one new mark per step.
    const patterns = readFileSync(path.join(SRC, 'ProductionHatchPattern.jsx'), 'utf8')
    const stipples = [...patterns.matchAll(/kind: 'stipple'/g)]
    expect(stipples).toHaveLength(2)
    expect(patterns).toContain("token: '--survey-embankment'")
    expect(patterns).toContain("token: '--survey-excavated'")
  })

  it('declares the three levels as tokens, so the remaining steps inherit them', () => {
    const tokens = readFileSync(path.join(SRC, 'index.css'), 'utf8')
    const level = (name) => Number(tokens.match(new RegExp(`--pattern-${name}:\\s*([\\d.]+)`))[1])

    // THREE LEVELS PER STEP, declared once rather than per step.
    expect(level('committed')).toBeLessThan(level('active'))
    expect(level('active')).toBeLessThan(level('focused'))
    expect(level('focused')).toBe(1)

    // ...and layers.jsx reads them rather than owning them.
    const layers = readFileSync(path.join(SRC, 'map', 'layers.jsx'), 'utf8')
    expect(layers).toContain('--pattern-${name}')
    // Every fill opacity a ZONE takes comes from a level; the only literal
    // left is the rejection overlay, which is not a zone state.
    const literals = layers.replace(/\/\*[\s\S]*?\*\//g, '').match(/fillOpacity: [\d.]+/g) ?? []
    // Exactly one, and it belongs to the rejection overlay -- which is not a
    // zone state and has no level in the scheme.
    expect(literals).toEqual(['fillOpacity: 0.25'])
  })

  it('mutes a committed zone and keeps its pattern', () => {
    const active = styleFor({ treatment: 'production', colors: COLORS })
    const committed = styleFor({ treatment: 'production', isCommitted: true, colors: COLORS })

    // SAME MARK, QUIETER. Not an outline, and not a different pattern: it is
    // the same ground for the same purpose, and what changed is that the
    // decision is made.
    expect(committed.fillColor).toBe(active.fillColor)
    expect(committed.fillOpacity).toBeLessThan(active.fillOpacity)
    expect(committed.stroke).toBe(false)
  })

  it('lets a committed production layer and an active water layer share the map', () => {
    // THE STATE FROM THE ROADS STEP ONWARD, and the two must stay readable
    // together: different patterns, different colours, and the committed one
    // the quieter of the two.
    const committedProduction = styleFor({
      treatment: 'production',
      isCommitted: true,
      colors: COLORS,
    })
    const activeWater = styleFor({ treatment: 'survey-embankment', colors: COLORS })

    expect(committedProduction.fillColor).not.toBe(activeWater.fillColor)
    expect(committedProduction.fillOpacity).toBeLessThan(activeWater.fillOpacity)
    // Neither is invisible.
    expect(committedProduction.fillOpacity).toBeGreaterThan(0.15)
    expect(activeWater.fillOpacity).toBeGreaterThan(0.15)
  })

  it('declares the committed layers so a committed step keeps its own mark', () => {
    const committedOf = (definition) =>
      definition.layers.filter((l) => l.band === 'committed' && l.kind === 'polygon')

    expect(committedOf(LANDFORM_STEP).map((l) => l.treatment)).toEqual(['production'])
    // Water's committed half is split the same way its proposals are, so the
    // two survey types stay told apart once committed.
    expect(committedOf(WATER_STEP).map((l) => l.treatment)).toEqual([
      'survey-embankment',
      'survey-excavated',
    ])
  })

  it('moves selection UP rather than moving everything else down', () => {
    // REPORTED DIRECTION: focused is MORE present. Both express the same
    // relationship; this one changes one mark instead of every other one, and
    // dimming the rest would also dim earlier steps' committed layers, which
    // are not part of this step's selection.
    const active = styleFor({ treatment: 'survey-embankment', colors: COLORS })
    const focused = styleFor({ treatment: 'survey-embankment', isFocused: true, colors: COLORS })
    expect(focused.fillOpacity).toBeGreaterThan(active.fillOpacity)

    // FAR ENOUGH APART TO SEE WITH THE WHOLE PARCEL IN FRAME. A pattern is
    // mostly unfilled, so a small step in opacity is invisible at that zoom --
    // and an indicator you can only see zoomed in is not an indicator. The
    // rendered check is in layout.test.jsx, which has a browser; this is the
    // ratio that check rests on.
    expect(focused.fillOpacity / active.fillOpacity).toBeGreaterThanOrEqual(1.7)
  })
})

/* ===========================================================================
   THE TAB STRIP DOES NOT LOSE THE SELECTION
   =========================================================================== */

describe('the collapsed strip keeps the focused tab', () => {
  const tabsOf = (n) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, name: `T${i}` }))

  it('showed the first few and nothing else, which is the bug', () => {
    // THE CAUSE, STATED AS ARITHMETIC. A collapsed strip takes the first `cap`
    // tabs in declaration order. Focus anything past that -- by clicking it on
    // the MAP, which is the only way to focus a tab you cannot see -- and the
    // detail panel described a zone while no tab on screen was marked, so the
    // strip read as having dropped the selection and offered no way back.
    const tabs = tabsOf(6)
    const naive = tabs.slice(0, COLLAPSED_TAB_CAP)
    expect(naive.some((t) => t.id === 't5')).toBe(false)
  })

  it('swaps the focused tab into the last slot, at the same footprint', () => {
    const tabs = tabsOf(6)
    const shown = collapsedTabs(tabs, 't5')
    expect(shown.map((t) => t.id)).toEqual(['t0', 't1', 't5'])
    // THE COUNT IS UNCHANGED. The strip's premise is a constant footprint --
    // chrome that grows a row when you click something eats the document to
    // describe it -- so the focused tab takes a slot rather than adding one.
    expect(shown).toHaveLength(COLLAPSED_TAB_CAP)
  })

  it('changes nothing when the focus is already shown, or absent', () => {
    const tabs = tabsOf(6)
    expect(collapsedTabs(tabs, 't1').map((t) => t.id)).toEqual(['t0', 't1', 't2'])
    expect(collapsedTabs(tabs, null).map((t) => t.id)).toEqual(['t0', 't1', 't2'])
    // A focus on something the strip is not carrying -- a drawn shape just
    // destroyed -- is not a reason to drop a tab.
    expect(collapsedTabs(tabs, 'gone').map((t) => t.id)).toEqual(['t0', 't1', 't2'])
  })

  it('is one component, so landform had the same bug latent', () => {
    // NOT A WATER BUG. It needs only more tabs than a row holds plus a focus
    // past the cap. Landform reaches it at four zones; water reaches it on the
    // reference parcel every time, because six zones ordered embankment-first
    // mean the three a collapsed row holds are all embankment and clicking ANY
    // excavated zone focuses a tab that is not on screen.
    const landformTabs = tabsOf(5)
    expect(collapsedTabs(landformTabs, 't4').map((t) => t.id)).toContain('t4')
    const strip = readFileSync(path.join(SRC, 'wizard', 'shell', 'TabStrip.jsx'), 'utf8')
    expect(strip).toContain('collapsedTabs(tabs, focusedFeatureId)')
    // ...and the strip still names no step, which is how one component serves
    // both.
    const code = strip.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const stepId of ['landform', 'water', 'boundary']) {
      expect(code).not.toMatch(new RegExp(`['"\`]${stepId}['"\`]`))
    }
  })

  liveIt('keeps every visible tab and marks the focused one, clicking a zone on the map', async () => {
    const ui = await renderApp()
    await throughWaterGenerate(ui)

    const zones = surveyZoneFeatures(ui.water)
    const before = ui.all('[data-tab-id]').length
    expect(before).toBeGreaterThan(0)

    // THE ZONE THE OLD STRIP COULD NOT SHOW: the last one, past the cap.
    const hidden = zones[zones.length - 1]
    expect(ui.find(`tab-${hidden.id}`)).toBeNull()

    await ui.focus(hidden.id)

    // THE STRIP PERSISTS at the same footprint...
    expect(ui.all('[data-tab-id]').length).toBe(before)
    // ...the focused tab is now one of them, and it is MARKED ACTIVE...
    const tab = ui.find(`tab-${hidden.id}`)
    expect(tab).not.toBeNull()
    expect(tab.getAttribute('data-focused')).toBe('true')
    expect(ui.all('.chrome-tab--focused')).toHaveLength(1)
    // ...and the panel is describing that same zone.
    expect(ui.text(`detail-name-water`)).toBe(surveyZoneName(hidden.properties))

    // SELECTING ANOTHER REPLACES IT rather than adding a second mark.
    await ui.focus(zones[0].id)
    expect(ui.all('.chrome-tab--focused')).toHaveLength(1)
    expect(ui.find(`tab-${zones[0].id}`).getAttribute('data-focused')).toBe('true')

    await ui.unmount()
  })

  liveIt('deselects and closes the panel on a bare-map click, for water', async () => {
    const ui = await renderApp()
    await throughWaterGenerate(ui)

    const zones = surveyZoneFeatures(ui.water)
    await ui.focus(zones[0].id)
    expect(ui.find('detail-water')).not.toBeNull()

    await ui.clickMap()

    expect(ui.cursor.focusedFeatureId).toBeNull()
    expect(ui.find('detail-water')).toBeNull()
    // THE STRIP IS UNTOUCHED BY EITHER GESTURE.
    expect(ui.all('[data-tab-id]').length).toBeGreaterThan(0)
    expect(ui.all('.chrome-tab--focused')).toHaveLength(0)

    await ui.unmount()
  })

  liveIt('deselects and closes the panel on a bare-map click, for landform too', async () => {
    // THE SAME WIRING SERVES BOTH -- MapLayerStack mounts one BackgroundClick
    // for whatever step the cursor is on -- and the point of asserting it
    // twice is that "wired for water" was one of the two candidate causes of
    // the strip bug and turned out not to be the cause at all.
    const ui = await renderApp()
    await ui.run((a) => a.setDraftInput('boundary', 'ring', BOUNDARY))
    await ui.click('commit-boundary')
    await ui.waitFor('the session', () => Boolean(ui.state.sessionId))
    await ui.click('generate-landform')
    await ui.waitFor('landform', () => selectStepStatus(ui.state, 'landform') === GENERATED)
    await ui.waitFor('its draft', () => ui.state.drafts.landform !== undefined)

    const zone = ui.state.steps.landform.proposals.suggested_zones.features[0]
    await ui.focus(zone.id)
    expect(ui.find('detail-landform')).not.toBeNull()

    await ui.clickMap()
    expect(ui.cursor.focusedFeatureId).toBeNull()
    expect(ui.find('detail-landform')).toBeNull()
    expect(ui.all('[data-tab-id]').length).toBeGreaterThan(0)

    await ui.unmount()
  })
})

/* ===========================================================================
   RESUME: A GENERATED STEP COMES BACK WITH WHAT IT IS DECIDING ABOUT
   =========================================================================== */

describe('resuming into a generated water step', () => {
  liveIt('fetches its own proposals, rather than offering an empty commit', async () => {
    const first = await renderApp()
    await throughWaterGenerate(first)
    const sessionId = first.state.sessionId
    const expected = surveyZoneFeatures(first.water).map((f) => f.id)
    expect(expected.length).toBeGreaterThan(0)
    await first.unmount()

    // A SECOND CLIENT, sharing only the session id -- a reload, another tab, a
    // bookmark. The document alone says where the wizard is.
    const ui = await renderApp()
    await ui.run((a) => a.resume(sessionId))
    await ui.waitFor(
      'the resumed document',
      () => selectStepStatus(ui.state, 'water') === GENERATED
    )
    expect(ui.cursor.cursorStepId).toBe('water')

    /**
     * NOBODY ASKS FOR THEM HERE. The machine fetches the proposals of the step
     * the cursor is on when the document says `generated` and none are in the
     * store -- which is the whole of the fix, and the reason this waits rather
     * than calling loadLayers.
     *
     * WHAT IT LOOKED LIKE BEFORE. `resume` hydrates the document and fetches
     * no payload, and `loadLayers` was called by nothing but tests. So water
     * came back `generated` with no proposals, deriveMachineState read
     * `status === GENERATED` as REVIEWING, and the step rendered: no zones on
     * the map, no tabs in the strip, and a primary button reading "Commit no
     * water zones" -- a legal empty commit under min_features: 0, one click
     * from recording "no water system on this parcel" on a parcel with six
     * candidate survey areas.
     */
    await ui.waitFor(
      'the proposals to arrive with nothing having asked for them',
      () => ui.water != null
    )
    expect(surveyZoneFeatures(ui.water).map((f) => f.id)).toEqual(expected)

    // THE STEP IS WHOLE AGAIN: tabs to decide with, and a commit button that
    // names what it would actually do.
    await ui.waitFor('the draft to be seeded', () => ui.state.drafts.water !== undefined)
    expect(ui.all('[data-tab-id]').length).toBeGreaterThan(0)
    expect(ui.find('commit-water').textContent).toContain('Commit water zones')
    expect(ui.find('commit-water').textContent).not.toContain('no water zones')

    await ui.unmount()
  })

  liveIt('asks once, and does not ask again once they are in the store', async () => {
    const first = await renderApp()
    await throughWaterGenerate(first)
    const sessionId = first.state.sessionId
    await first.unmount()

    // COUNT THE FETCHES. A generated step with no proposals is a state the
    // failure path leaves untouched, so an unguarded effect would re-fire on
    // the very state change its own failure caused. One attempt per episode is
    // what the ref in useStepMachine buys, and this is the assertion that it
    // is actually one.
    const real = globalThis.fetch
    let layerCalls = 0
    globalThis.fetch = (url, init) => {
      if (String(url).endsWith('/steps/water/layers')) layerCalls++
      return real(url, init)
    }
    try {
      const ui = await renderApp()
      await ui.run((a) => a.resume(sessionId))
      await ui.waitFor('the proposals', () => ui.water != null)
      // Several more store writes, each of which re-runs the effect.
      const zones = surveyZoneFeatures(ui.water)
      await ui.toggle(zones[0].id)
      await ui.focus(zones[1].id)
      await ui.toggle(zones[0].id)
      expect(layerCalls).toBe(1)
      await ui.unmount()
    } finally {
      globalThis.fetch = real
    }
  })

  liveIt('leaves a committed step alone -- it has features, not proposals', async () => {
    const first = await renderApp()
    await throughWaterGenerate(first)
    await first.click('commit-water')
    await first.waitFor('water to commit', () => selectStepStatus(first.state, 'water') === COMMITTED)
    const sessionId = first.state.sessionId
    await first.unmount()

    const real = globalThis.fetch
    let layerCalls = 0
    globalThis.fetch = (url, init) => {
      if (String(url).endsWith('/steps/water/layers')) layerCalls++
      return real(url, init)
    }
    try {
      const ui = await renderApp()
      await ui.run((a) => a.resume(sessionId))
      await ui.waitFor(
        'the resumed document',
        () => selectStepStatus(ui.state, 'water') === COMMITTED
      )
      // A COMMITTED STEP'S GROUND IS IN THE DOCUMENT. Fetching its proposals
      // would be a request for the recommendation it has already decided
      // against, and the backend answers 409 for exactly that reason.
      await ui.waitFor('a few renders to pass', () => true)
      expect(layerCalls).toBe(0)
      expect(selectStepFeatures(ui.state, 'water').features.length).toBeGreaterThan(0)
      await ui.unmount()
    } finally {
      globalThis.fetch = real
    }
  })
})

/* ===========================================================================
   9 & 10. THE TWO MAP CONTROLS
   =========================================================================== */

describe('9. the zoom moves in half steps', () => {
  it('sets both zoomDelta and zoomSnap, because one without the other is a no-op', () => {
    const app = readFileSync(path.join(SRC, 'App.jsx'), 'utf8')
    expect(app).toContain('zoomDelta={0.5}')
    // A fractional delta with the default snap of 1 rounds straight back to a
    // whole level. Both, or neither means anything.
    expect(app).toContain('zoomSnap={0.5}')
  })

  it('moves the live map by half a level per press', async () => {
    const ui = await renderAppShell()
    const map = ui.map
    expect(map.options.zoomDelta).toBe(0.5)
    expect(map.options.zoomSnap).toBe(0.5)

    /**
     * ONE jsdom FACT HAS TO BE CORRECTED FIRST, and it is a fact about jsdom
     * rather than about this setting.
     *
     * Leaflet's _limitZoom() reads `Browser.any3d ? this.options.zoomSnap : 1`
     * -- a fractional resting zoom is only offered where CSS 3D transforms are
     * available, because that is what a fractional level is rendered WITH.
     * jsdom's feature detection sets any3d false, so every zoom snaps to a
     * whole level there no matter what zoomSnap says, and 4.5 rounds to 5.
     *
     * A real browser sets it true. Restoring it here is what makes this a test
     * of the setting rather than a test of jsdom's transform support; it is
     * put back afterwards so no other suite inherits it.
     */
    const any3d = L.Browser.any3d
    L.Browser.any3d = true
    try {
      const before = map.getZoom()
      await React.act(async () => {
        ui.container.querySelector('.leaflet-control-zoom-in').click()
      })
      // HALF A LEVEL, not a whole one: the delta MOVED it and the snap LET IT
      // REST there. Either one alone leaves this at `before + 1`.
      expect(map.getZoom()).toBeCloseTo(before + 0.5, 5)

      await React.act(async () => {
        ui.container.querySelector('.leaflet-control-zoom-out').click()
      })
      expect(map.getZoom()).toBeCloseTo(before, 5)
    } finally {
      L.Browser.any3d = any3d
    }

    await ui.unmount()
  })

  it('would round straight back to a whole level with the snap left at its default', async () => {
    // THE REASON BOTH FIELDS ARE SET, demonstrated rather than asserted in a
    // comment. Same map, same delta, Leaflet's default snap of 1.
    const ui = await renderAppShell()
    const map = ui.map
    const any3d = L.Browser.any3d
    const snap = map.options.zoomSnap
    L.Browser.any3d = true
    map.options.zoomSnap = 1
    try {
      const before = map.getZoom()
      await React.act(async () => {
        ui.container.querySelector('.leaflet-control-zoom-in').click()
      })
      expect(map.getZoom()).toBe(before + 1)
    } finally {
      L.Browser.any3d = any3d
      map.options.zoomSnap = snap
    }
    await ui.unmount()
  })
})

describe('10. the attribution sits in the top-left card gap', () => {
  it('is placed top-left and keeps the floating-card treatment', () => {
    const app = readFileSync(path.join(SRC, 'App.jsx'), 'utf8')
    expect(app).toContain('attributionControl={false}')
    expect(app).toMatch(/<AttributionControl position="topleft"/)

    const css = readFileSync(path.join(SRC, 'App.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const rule = ruleFor(css, '.leaflet-container .leaflet-control-attribution')
    // A REGION, NOT A BARE LINE: opaque surface, hairline, inset -- the same
    // three the rail, the bar, the panel and the banner have.
    expect(rule).toContain('background: var(--paper)')
    expect(rule).toContain('border: var(--hairline)')
    expect(rule).toContain('border-radius: var(--radius)')
    // MUTED INK, SMALL. It is a licensing requirement, not a feature.
    expect(rule).toContain('color: var(--ink-muted)')
    expect(rule).toContain('font-size: var(--text-xs)')
    // AND NOT A CONTROL: no accent anywhere in it.
    expect(rule).not.toContain('--oxide')

    // The corner it lands in does NOT take the chrome-dodging offsets the
    // other three take -- those would put it under the bar and beside the
    // rail, which is the one place it does not fit.
    const corner = ruleFor(css, '.map-stage .leaflet-top.leaflet-left')
    expect(corner).toContain('top: var(--space-3)')
    expect(corner).toContain('left: var(--space-3)')
  })

  it('needs no short-viewport fallback, because the gap is not viewport-sized', () => {
    const css = readFileSync(path.join(SRC, 'App.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

    // THE WORRY WAS REAL AND THE MEASUREMENT ANSWERED IT. The gap is made by
    // the rail being top-inset, so a shorter window might have closed it up --
    // in which case the credit belongs bottom-left, below the rail, rather
    // than back over the open map.
    //
    // It cannot close. The gap is the chrome grid's first row, which is `auto`
    // and sized to the instruction bar's content, and the rail sits in the row
    // below it with align-self: start. Neither is a function of the viewport.
    // layout.test.jsx measures it in Chromium at four heights.
    //
    // So no height query moves this corner. One was written and deleted: at
    // its threshold it relocated the credit on a window where nothing was
    // colliding, which is a second layout rather than insurance.
    expect(css).not.toMatch(/@media[^{]*max-height[^{]*\{[^}]*leaflet-top/)

    const grid = ruleFor(css, '.chrome')
    expect(grid).toContain('grid-template-rows: auto 1fr auto')
    expect(ruleFor(css, '.chrome-rail')).toContain('align-self: start')
  })

  /* THE GEOMETRY IS MEASURED IN CHROMIUM, in layout.test.jsx, at four
     heights. jsdom computes no layout, so what these three add is the
     STRUCTURAL half of the same claim: the credit is in Leaflet's top-left
     corner, it is not inside the rail, and it still says what the licence
     requires -- at every height, without a browser. */
  for (const height of [1200, 800, 560]) {
    it(`renders the licence line in the top-left corner at ${height}px`, async () => {
      const ui = await renderAppShell({ height })

      const credit = ui.container.querySelector('.leaflet-control-attribution')
      expect(credit).not.toBeNull()
      // STILL THE LICENSING LINE, at every height.
      expect(credit.textContent).toContain('Esri')

      // IN THE TOP-LEFT CORNER OF THE MAP'S CONTROL CONTAINER, which is the
      // structural half of the claim: jsdom lays nothing out, so the DOM
      // position is what can be asserted and the geometry is asserted
      // separately below.
      const corner = credit.closest('.leaflet-top.leaflet-left')
      expect(corner).not.toBeNull()

      // AND CLEAR OF THE RAIL. The rail begins in the grid row below the
      // instruction bar; the credit sits in the row above it. Neither is
      // inside the other, and they are in different regions of the DOM --
      // the credit is Leaflet's, the rail is the chrome's.
      const rail = ui.container.querySelector('.chrome-rail')
      if (rail) {
        expect(rail.contains(credit)).toBe(false)
        expect(credit.contains(rail)).toBe(false)
      }

      await ui.unmount()
    })
  }

  /**
   * THE GEOMETRY, COMPUTED RATHER THAN RENDERED.
   *
   * jsdom has no layout engine, so no test in this file can read a real
   * bounding box. What CAN be checked is the arithmetic the layout rests on:
   * the credit sits at --space-3 from the top, the rail begins below a row
   * whose height is the instruction bar's, and the credit's own height has to
   * fit in the gap between them. At the three heights above the stage is the
   * same shape (its height has a 34rem floor and the rows are content-sized),
   * which is exactly why the fallback is keyed on a height query rather than
   * left to chance.
   */
  it('leaves the credit room in the gap the rail does not use', () => {
    const css = readFileSync(path.join(SRC, 'App.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const stage = ruleFor(css, '.map-stage')
    // The bar's row is what the gap is made of, and it is 3.5rem.
    expect(stage).toMatch(/--bar-height:\s*3\.5rem/)
    // The credit is one line at --text-xs (0.75rem) over --leading-body plus
    // its own inset: comfortably under 3.5rem, which is the gap. The rail's
    // own inset is the same --space-3, so the two never share a pixel row.
    const rail = ruleFor(css, '.chrome-rail')
    expect(rail).toContain('align-self: start')
    expect(rail).toContain('margin: var(--space-3)')
  })
})

/** The rule body for one selector, comments already stripped. */
function ruleFor(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`(^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'))
  if (!match) throw new Error(`no rule for ${selector}`)
  return match[2]
}

/**
 * The whole page, for the map controls -- App mounts its own MapContainer.
 *
 * THE MAP IS CAUGHT AT ITS CONSTRUCTOR, and the alternatives are all worse.
 * The other suites reach their map with a `useMap()` probe rendered inside a
 * MapContainer they own; there is nothing to render inside App's. Rebuilding a
 * MapContainer here with the same props would test a copy of the options and
 * assert nothing about the shipped one, which is the whole question. Leaflet
 * keeps no registry and writes no back-pointer, so this wraps L.Map's own
 * initialize for the length of the render and keeps what came out: the REAL
 * map object App made, with the options App passed it.
 */
async function renderAppShell({ height = 800 } = {}) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.innerHeight = height
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  const built = []
  const initialize = L.Map.prototype.initialize
  L.Map.prototype.initialize = function (...args) {
    initialize.apply(this, args)
    built.push(this)
  }

  try {
    await React.act(async () => {
      root.render(<App />)
    })
  } finally {
    L.Map.prototype.initialize = initialize
  }

  const ui = {
    container,
    get map() {
      return built[built.length - 1] ?? null
    },
    async unmount() {
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
  mounted.push(ui)
  return ui
}

/* ===========================================================================
   11. THE SHELL STILL NAMES NO STEP
   =========================================================================== */

describe('11. the shell names no step, after a second definition', () => {
  it('holds no step id and no payload key in the shell, the machine or the stack', () => {
    const generic = [
      'wizard/useStepMachine.js',
      'wizard/WizardShell.jsx',
      'wizard/WizardCursor.jsx',
      'wizard/shell/chromeState.js',
      'wizard/shell/StepRail.jsx',
      'wizard/shell/InstructionBar.jsx',
      'wizard/shell/DetailPanel.jsx',
      'wizard/shell/TabStrip.jsx',
      'wizard/shell/ActionBanner.jsx',
      // THE STACK AND THE RENDERER TOO. Both grew a field for this step; the
      // test of whether the field stayed generic is that neither learned a name.
      'map/layerStack.js',
      'map/layers.jsx',
    ]
    const steps = ['boundary', 'landform', 'water', 'roads', 'trees', 'structures', 'fencing']
    const payloadKeys = [
      'suggested_zones',
      'eligible_union',
      'exclusion_layers',
      'survey_zones',
      'survey_zone_embankment',
      'survey_zone_excavated',
      'survey_type',
      'mean_suitability',
    ]

    for (const file of generic) {
      const code = readFileSync(path.join(SRC, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      for (const stepId of steps) {
        expect(code, `${file} names the step '${stepId}'`).not.toMatch(
          new RegExp(`['"\`]${stepId}['"\`]`)
        )
      }
      for (const key of payloadKeys) {
        expect(code, `${file} names the payload key '${key}'`).not.toContain(key)
      }
    }

    // ...and everything this step does differently IS DECLARED.
    expect(WATER_STEP.tools).toEqual(['select'])
    expect(WATER_STEP.shape).toBeNull()
    expect(WATER_STEP.proposalCollection).toBe('survey_zones')
    expect(typeof WATER_STEP.detail).toBe('function')
  })
})

/* ===========================================================================
   THE PANEL: THE SERVER'S ROWS, THIS SIDE'S TYPOGRAPHY
   =========================================================================== */

describe('the panel', () => {
  it('renders the backend\'s rows, in the backend\'s order, under its labels', () => {
    const zone = fixtureZone({})
    const detail = WATER_STEP.detail({ proposals: payloadOf([zone]) }, zone.id)

    expect(detail.fields.map((f) => f.label)).toEqual([
      'area to survey (acres)',
      'survey type',
      'suitability',
      'rank',
      'water delivery',
    ])
    // THE ORDER IS THE BACKEND'S ARGUMENT, so there is no grouping over here
    // re-asserting one this side no longer decides.
    expect(detail.groups).toBeUndefined()
    // AND NO SEPARATE CAUTION CHANNEL: that channel carries the exclusion
    // layers' own {type, label, acres} and a survey zone crosses none of them.
    expect(detail.cautions).toEqual([])
  })

  it('joins on feature_id, which the payload gave it', () => {
    const zone = fixtureZone({ zone_id: 4 })
    const proposals = payloadOf([zone])
    // The row's own id is the INTERNAL zone id and is not the wire id; the
    // join is on feature_id or it is on nothing.
    expect(proposals.zones[0].id).toBe(4)
    expect(proposals.zones[0].feature_id).toBe(zone.id)
    expect(surveyZonePanel(proposals, zone.id)).toHaveLength(5)
    expect(surveyZonePanel(proposals, 'water-survey-zone-999')).toEqual([])
    // A feature with no row of its own has nothing to say, and the panel
    // says nothing rather than inventing a shape for it.
    expect(WATER_STEP.detail({ proposals }, 'water-survey-zone-999')).toBeNull()
  })

  it('reads rank and suitability against the scales block', () => {
    const embankment = fixtureZone({ zone_id: 1, survey_type: 'embankment', rank: 1 })
    const second = fixtureZone({ zone_id: 2, survey_type: 'embankment', rank: 2 })
    const detail = WATER_STEP.detail(
      { proposals: payloadOf([embankment, second]) },
      embankment.id
    )
    const value = (label) => detail.fields.find((f) => f.label === label).value

    // "1" alone is not a reading. rank is PER TYPE and the scale carries the
    // denominator.
    expect(value('rank')).toBe('1 of 2')
    // 0.7933 against a theoretical 1.0 understates what was attainable here:
    // the soil criterion's parcel range caps the blend, and the scale carries
    // the parcel's own measured ceiling.
    expect(value('suitability')).toBe('0.7933 of 0.82')
  })

  it('falls back to the bare number when a payload carries no scales', () => {
    // An older payload is OLDER, not wrong, and a missing denominator must
    // never blank a measurement.
    const zone = fixtureZone({})
    const proposals = payloadOf([zone])
    delete proposals.scales
    const detail = WATER_STEP.detail({ proposals }, zone.id)
    const value = (label) => detail.fields.find((f) => f.label === label).value
    expect(value('rank')).toBe('1')
    expect(value('suitability')).toBe('0.7933')
  })

  it('puts figures in the aligned column and categorical readings in prose', () => {
    const zone = fixtureZone({})
    const detail = WATER_STEP.detail({ proposals: payloadOf([zone]) }, zone.id)
    const measured = Object.fromEntries(detail.fields.map((f) => [f.label, f.measured]))
    expect(measured['area to survey (acres)']).toBe(true)
    expect(measured['suitability']).toBe(true)
    // The survey type and the water-delivery answer have no decimal point to
    // hold still, and a word in the aligned column widens it for every row.
    expect(measured['survey type']).toBe(false)
    expect(measured['water delivery']).toBe(false)
  })

  it('renders a fired boolean as yes, and a null as an em dash', () => {
    const zone = fixtureZone({})
    const rows = [
      ...alwaysRows(zone.properties),
      { key: 'sparse_anchor', label: 'little of the claim is anchoring ground', value: true, unit: null },
      { key: 'road_overlap_pct', label: 'removed by existing farm road', value: null, unit: 'percent' },
    ]
    const detail = WATER_STEP.detail(
      { proposals: payloadOf([zone], {}, { panels: { [zone.id]: rows } }) },
      zone.id
    )
    const value = (label) => detail.fields.find((f) => f.label === label).value
    // A boolean row is PRESENT ONLY WHEN IT FIRES, so true is the only value
    // one can carry and there is no "no" case to render.
    expect(value('little of the claim is anchoring ground')).toBe('yes')
    expect(value('removed by existing farm road (percent)')).toBe('—')
  })

  it('never puts excavated vocabulary on an embankment panel', () => {
    // THE FAILURE THIS REPLACED. The old panel read `member_acres` and
    // `member_count` off every zone under the labels "anchor acres" and
    // "members" -- excavated vocabulary, on a valley compartment that has
    // neither, rendering an em dash for a question that does not apply. The
    // rows are the backend's now and it dispatches on type; what is asserted
    // here is that this side adds no vocabulary of its own on the way through.
    const embankment = fixtureZone({ zone_id: 1, survey_type: 'embankment' })
    const detail = WATER_STEP.detail({ proposals: payloadOf([embankment]) }, embankment.id)
    const text = detail.fields.map((f) => `${f.label} ${f.value}`).join(' ')
    for (const word of ['member', 'anchor acres', 'depression', 'catchment', 'elevation m']) {
      expect(text.toLowerCase()).not.toContain(word)
    }
  })

  it('prints numbers as the backend sent them, adding no second rounding', () => {
    const zone = fixtureZone({})
    const rows = [
      { key: 'zone_acres', label: 'area to survey', value: 0.3, unit: 'acres' },
      { key: 'survey_type', label: 'survey type', value: 'embankment', unit: null },
      { key: 'suitability', label: 'suitability', value: 0.7933, unit: null },
      { key: 'rank', label: 'rank', value: 1, unit: null },
      { key: 'water_delivery', label: 'water delivery', value: 'gravity_feed', unit: null },
      { key: 'water_delivery_differential', label: 'elevation above production area', value: 7.6, unit: 'feet' },
    ]
    const proposals = payloadOf([zone], {}, { panels: { [zone.id]: rows } })
    delete proposals.scales
    const detail = WATER_STEP.detail({ proposals }, zone.id)
    // The pipeline rounds at its own documented boundary and those values are
    // contractually FINAL; a toFixed() here would be a second boundary for
    // numbers that already have one.
    expect(detail.fields.map((f) => f.value)).toEqual([
      '0.3',
      'embankment',
      '0.7933',
      '1',
      'gravity_feed',
      '7.6',
    ])
  })
})

/* ===========================================================================
   THE NOTICES
   =========================================================================== */

describe('notices', () => {
  it('names each check that did not run, in consequence terms, keyed on the flag', () => {
    const zone = fixtureZone({
      canopy_overlap_pct: null,
      road_overlap_pct: null,
      production_overlap_pct: 4.0,
    })
    const notices = WATER_STEP.notices({
      proposals: payloadOf([zone], { soil_checked: false, zone_count: 1 }),
      draft: { selectedFeatureIds: [], drawnFeatures: [] },
    })
    const keys = notices.map((n) => n.key)
    expect(keys).toContain('unchecked-soil')
    expect(keys).toContain('unchecked-canopy_overlap_pct')
    expect(keys).toContain('unchecked-road_overlap_pct')
    // MEASURED, SO NOT NAMED. production was checked and came back 4.0.
    expect(keys).not.toContain('unchecked-production_overlap_pct')

    // CONSEQUENCE, NOT THE LAYER'S NAME.
    const soil = notices.find((n) => n.key === 'unchecked-soil')
    expect(soil.text).toContain('was unavailable')
    expect(soil.text).toContain('Walk them')
  })

  it('says what the generate found and is not showing, from the wire count', () => {
    const zone = fixtureZone({})
    const none = WATER_STEP.notices({
      proposals: payloadOf([zone], { dropped_count: 0 }),
      draft: { selectedFeatureIds: [], drawnFeatures: [] },
    })
    expect(none.map((n) => n.key)).not.toContain('dropped')

    const some = WATER_STEP.notices({
      proposals: payloadOf([zone], { dropped_count: 3 }),
      draft: { selectedFeatureIds: [], drawnFeatures: [] },
    })
    const dropped = some.find((n) => n.key === 'dropped')
    expect(dropped).toBeDefined()
    // THE FIGURE IS MEASURED AND SET AS ONE, mid-sentence.
    expect(dropped.text.some((part) => part?.measure === '3')).toBe(true)
    // THE FLOOR ITSELF IS NOT QUOTED: MIN_SURVEY_REGION_AREA_ACRES is a
    // backend constant and no key in this payload carries it.
    expect(dropped.text.join('')).not.toMatch(/0\.1/)
  })

  liveIt('says nothing untrue about the reference parcel', async () => {
    const ui = await renderApp()
    await throughWaterGenerate(ui)

    const notices = WATER_STEP.notices({
      proposals: ui.water,
      draft: selectDraft(ui.state, 'water'),
    })
    const keys = notices.map((n) => n.key)

    // The live run reaches soil, canopy, roads and the committed production
    // areas, and drops nothing at the floor -- so it claims none of them.
    expect(ui.water.summary.soil_checked).toBe(true)
    expect(keys).not.toContain('unchecked-soil')
    expect(keys.filter((k) => k.startsWith('unchecked-'))).toEqual([])
    expect(ui.water.summary.dropped_count).toBe(0)
    expect(keys).not.toContain('dropped')

    await ui.unmount()
  })
})

/* ===========================================================================
   A fixture, for the cases the reference parcel does not produce
   ===========================================================================
   THE REFERENCE RUN REACHES EVERY DATA SOURCE, so an unchecked overlap is a
   state the live backend will not hand this suite. The sentinel is the thing
   most worth testing and the least reachable, which is exactly when a fixture
   earns its place -- and it is shaped as one FEATURE off the real payload
   rather than as a payload of its own.
   =========================================================================== */

function fixtureZone(overrides) {
  const {
    zone_id = 1,
    survey_type = 'embankment',
    layer = `survey_zone_${survey_type}`,
    ...properties
  } = overrides
  return {
    type: 'Feature',
    id: `water-survey-zone-${zone_id}`,
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
    properties: {
      layer,
      zone_id,
      survey_type,
      rank: 1,
      member_count: 1,
      member_acres: 0.3,
      zone_acres: 0.3,
      mean_suitability: 0.7933,
      slope_median_pct: 4.0,
      depression_depth_max_m: 0.0,
      contributing_area_acres_at_wettest_cell: 10.51,
      representative_elevation_m: 312.4,
      canopy_overlap_pct: 0.0,
      road_overlap_pct: 0.0,
      production_overlap_pct: 0.0,
      primary_production_area_relationship: {
        above_production_area: true,
        production_area_id: 0,
        elevation_differential_m: 2.31,
        distance_m: 130.1,
      },
      has_service_relationship: true,
      served_production_area_ids: [0, 1, 2],
      cross_type_overlaps: [],
      flags: [],
      sparse_anchor: false,
      below_min_area: false,
      ...properties,
    },
  }
}

/**
 * THE FIVE ALWAYS-ROWS, in the backend's order and with the backend's labels.
 *
 * A FIXTURE OF THE WIRE, not a reimplementation of build_zone_panel(). Which
 * rows fire under which conditions is the backend's decision and is asserted
 * in test_water_survey_areas.py against the builder itself; what this side has
 * to be exercised on is RENDERING a row set it did not choose -- so the tests
 * below hand it row sets directly, including ones no single real zone would
 * produce, which is the point.
 */
function alwaysRows(properties) {
  return [
    { key: 'zone_acres', label: 'area to survey', value: properties.zone_acres, unit: 'acres' },
    { key: 'survey_type', label: 'survey type', value: properties.survey_type, unit: null },
    { key: 'suitability', label: 'suitability', value: properties.mean_suitability, unit: null },
    { key: 'rank', label: 'rank', value: properties.rank, unit: null },
    { key: 'water_delivery', label: 'water delivery', value: 'gravity_feed', unit: null },
  ]
}

/**
 * The payload's `scales` block: how to read every scored value on a panel.
 * The per-type rank COUNT is derived from the fixture's own features so a
 * rank renders "1 of 2" against a set that really holds two.
 */
function scalesOf(features) {
  const countOf = (type) => features.filter((f) => f.properties.survey_type === type).length
  return {
    suitability: {
      min: 0.0,
      max: 1.0,
      higher_is_better: true,
      parcel_observed_max: { embankment: 0.82, excavated: 0.6 },
    },
    rank: { embankment: { count: countOf('embankment') }, excavated: { count: countOf('excavated') } },
    overlap_pct: { min: 0, max: 100 },
    boundary_adjacency_pct: { min: 0, max: 100 },
  }
}

/**
 * `panels` maps a feature id to the exact row list the backend would have
 * sent for it; anything unlisted gets the five always-rows, which is what a
 * zone with no cautions and a gravity feed actually produces.
 */
function payloadOf(features, summary = {}, { panels = {}, scales } = {}) {
  return {
    survey_zones: { type: 'FeatureCollection', features },
    zones: features.map((feature) => ({
      id: feature.properties.zone_id,
      // CARRIED, NEVER REBUILT -- the feature's own wire id, which is what
      // the panel joins on. See surveyZonePanel().
      feature_id: feature.id,
      panel: panels[feature.id] ?? alwaysRows(feature.properties),
    })),
    scales: scales ?? scalesOf(features),
    summary: {
      zone_count: features.length,
      dropped_count: 0,
      soil_checked: true,
      embankment_zone_count: features.length,
      excavated_zone_count: 0,
      ...summary,
    },
  }
}

const FIXTURE = payloadOf([
  fixtureZone({ zone_id: 1, survey_type: 'embankment' }),
  fixtureZone({ zone_id: 4, survey_type: 'excavated' }),
])
