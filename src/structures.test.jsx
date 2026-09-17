/**
 * structures.test.jsx
 *
 * THE STRUCTURES STEP: the fifth definition. Up to three generated
 * candidates, select-only, PLUS up to two sites the user PLACES -- and a
 * placed site is SCORED with the full candidate measurement set, composite
 * included, so it ranks beside the generated ones. That is the deliberate
 * divergence from trees, and half of this file exists to hold it: a placed
 * site that breaks a siting rule is placed and scored and told what it
 * breaks, never refused; the one refusal is the parcel.
 *
 * HOW TO RUN THE END-TO-END SECTIONS:
 *
 *     cd ../keyline-designer && python serve_test_backend.py 5099 &
 *     VITE_API_URL=http://127.0.0.1:5099 npx vitest run src/structures.test.jsx
 *
 * THE SAME SERVER EVERY OTHER LIVE SUITE DRIVES. The structures generate
 * reads its canopy, its mapped roads and its farmland classes off the cache
 * the harness fills, so it runs network-free and in about a second.
 *
 * SKIPPED, NOT FAILED, WITH NO SERVER -- trees.test.jsx's posture. Every
 * section that needs no server runs either way, over a hand-built payload in
 * the backend's own shape (step_orchestrator.build_structures_payload) and a
 * placed Feature in wire_translation.placed_structure_site_to_feature()'s.
 *
 * Sections (the branch's numbered tests in brackets):
 *   1  [1]  END TO END: the four prior steps committed -> generate -> three
 *           tabs -> place a site -> it scores and gets a tab -> a site on
 *           the canopy scores AND names what it breaks -> a third placed site
 *           is refused by the SERVER at commit -> × frees the slot -> commit
 *           several -> the document carries them -> reopen -> the placed
 *           sites come home scored -> commit none.
 *   2  [2]  NOT ARMED ON ENTRY; "Place a site" arms it.
 *   3  [3]  An off-parcel click is refused and places nothing -- before any
 *           request here, and through the server's own 400 when it answers.
 *   4  [4]  A gate-violating site SCORES and shows its violations -- a tab,
 *           a notice, a panel group -- not a rejection.
 *   5  [5]  Placed and generated tabs are distinguishable at equal rank.
 *   6  [6]  The placed cap of 2 is reflected; a third attempt is refused.
 *   7  [7]  × on placed tabs only; destroying one frees a slot.
 *   8  [8]  Committing several succeeds; committing none succeeds.
 *   9  [9]  road_proximity_source renders its consequence for all three.
 *  10 [10]  No caution markers render on this step.
 *  11 [11]  Real-pointer hit-testing is in wizard/pointer.test.jsx, which
 *           derives its cases from the registry and grew a structures section.
 *  12       THE SCHEMA: what the definition declares, the two fields it
 *           added, the mark, the token, and the sweep.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import L from 'leaflet'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MapContainer, useMap } from 'react-leaflet'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  COMMITTED,
  GENERATED,
  NOT_STARTED,
  PROVENANCE_GENERATED,
  PROVENANCE_USER_ADDED,
  SessionProvider,
  buildCommitBody,
  selectDraft,
  selectStepFeatures,
  selectStepProvenance,
  selectStepStatus,
  useSession,
} from './session/SessionStore'
import { API_URL } from './session/apiClient'
import {
  ACCESS_POINT_INPUT,
  COMMIT_BUTTON,
  GENERATE_BUTTON,
  LAYER_KINDS,
  MAX_PLACED_SITES,
  REOPEN_BUTTON,
  ROAD_PROXIMITY_CONSEQUENCE,
  ROAD_PROXIMITY_SOURCES,
  SITE_ORIGIN_GENERATED,
  SITE_ORIGIN_PLACED,
  STEP_DEFINITIONS,
  STRUCTURES_STEP,
  STRUCTURE_SITE_INPUT,
  STRUCTURE_SITE_LAYER,
  aspectPhrase,
  defineStep,
  gateStatement,
  isPlacedSite,
  placeSiteBlocked,
  placedCap,
  placedSlotsRemaining,
  registryProposalFeatures,
  roadNetworks,
  roadProximitySource,
  structureSiteFootprint,
  structureSiteName,
  structureSites,
  violatedGates,
  violatedRuleRows,
} from './wizard/stepDefinitions'
import { breakLabel, denominated, isBreak, panelBody } from './wizard/shell/panelFormat.js'
import { MACHINE_STATES } from './wizard/useStepMachine.js'
import { resetStepCatalog } from './wizard/stepCatalog.jsx'
import WizardShell from './wizard/WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './wizard/WizardCursor.jsx'
import MapLayerStack from './map/MapLayerStack.jsx'
import { resolveLayer } from './map/layerStack.js'
import { DrawingProgressProvider } from './map/DrawingProgress.jsx'
import {
  PIN_GLYPH_PATH,
  PIN_GLYPH_TIP,
  PIN_GLYPH_VIEWBOX,
  marksItsOwnEdge,
  zoneMark,
} from './ProductionHatchPattern.jsx'
import { SITE_PIN_HALO_WIDTH, SITE_PIN_SIZE, sitePinIcon } from './map/layers.jsx'
import { pointInRing, pointToGeoJSON } from './geo.js'
import rings from './fixtures/rings.json'

const SRC = path.dirname(fileURLToPath(import.meta.url))

const toLatLng = (ring) => ring.map(([lng, lat]) => [lat, lng])
/** The reference parcel. */
const BOUNDARY = toLatLng(rings.boundary)

/** roads.test.jsx's surveyed access point A: on the parcel's west edge, and it routes. */
const ACCESS_A = [40.6434533, -79.9836992]

/**
 * THREE SPOTS ON THE REFERENCE PARCEL, SURVEYED AGAINST THE SERVED BACKEND
 * (a probe over the same fixture the live section drives), [lat, lng]:
 *
 *   CLEAN    twelve metres west of the rank-1 candidate's pad. Scores in the
 *            sixties and clears every siting rule; ranks 4th, below the three.
 *   CANOPY   the centre of the fixture's canopy block -- inside the parcel,
 *            under fifteen metres of HAG. Scores 55.0 and breaks two rules:
 *            outside_existing_canopy and within_road_proximity_buffer.
 *   EDGE     close to the north-west vertex. Its pad is CLIPPED by the
 *            boundary to about half an acre-tenth, which is the case the
 *            rehydration caveat is about.
 *   OFF      a hundredth of a degree west of the parcel. Not theirs.
 */
const CLEAN = [40.64328007915633, -79.98334560864593]
const CANOPY = [40.64445861283241, -79.98139260998191]
const EDGE = [40.645782939126406, -79.9837669354553]
const OFF = [40.6458343, -79.9938154]

/* ---------------------------------------------------------------------------
   Tokens into jsdom, and is the backend there?
   --------------------------------------------------------------------------- */

beforeAll(() => {
  const tokens = readFileSync(path.join(SRC, 'index.css'), 'utf8')
  for (const [, name, value] of tokens.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    document.documentElement.style.setProperty(name, value)
  }
  for (const [, name, value] of tokens.matchAll(/(--(?:pattern|tint)-[a-z-]+):\s*([\d.]+)\s*;/g)) {
    document.documentElement.style.setProperty(name, value)
  }
  for (const [, name, target] of tokens.matchAll(/(--[a-z0-9-]+):\s*var\((--[a-z0-9-]+)\)\s*;/g)) {
    const resolved = document.documentElement.style.getPropertyValue(target)
    if (resolved) document.documentElement.style.setProperty(name, resolved)
  }
})

let live = false
const realFetch = globalThis.fetch

beforeAll(async () => {
  try {
    const response = await realFetch(`${API_URL}/api/health`)
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

const LIVE_TIMEOUT_MS = 600000
const liveIt = (name, fn) =>
  it(name, async (context) => (live ? fn(context) : context.skip()), LIVE_TIMEOUT_MS)

/* ---------------------------------------------------------------------------
   The surface -- trees.test.jsx's harness, with a structures reading
   --------------------------------------------------------------------------- */

const mounted = []

async function renderApp({ center = BOUNDARY[0], zoom = 19 } = {}) {
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
            <MapContainer center={center} zoom={zoom} style={{ height: 600, width: 600 }}>
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
    get actions() {
      return session.actions
    },
    get map() {
      return map
    },
    get structures() {
      return session.state.steps.structures?.proposals ?? null
    },
    get placed() {
      return selectDraft(session.state, 'structures').drawnFeatures
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
    async focus(id) {
      await React.act(async () => cursor.focusFeature(id))
    },
    /** Expand a collapsed strip: five tabs overflow a row, and the placed ones are last. */
    async expand() {
      if (this.find('tabs-more-structures')) await this.click('tabs-more-structures')
    },
    async clickMap(latlng) {
      await React.act(async () => map.fire('click', { latlng: L.latLng(...latlng) }))
    },
    /**
     * Place a site through the real gesture: arm, click the spot, wait for
     * the answer -- a new placed site, or a notice saying why not.
     */
    async place(point) {
      const before = this.placed.length
      await this.click('place-structures')
      expect(this.cursor.armed).toBe('draw')
      await this.clickMap(point)
      await this.waitFor(
        'the placement to settle',
        () => this.placed.length !== before || this.find('structures-notice') !== null,
        60000
      )
    },
    async waitFor(what, predicate, timeoutMs = 400000) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        await React.act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 25))
        })
        if (predicate()) return
      }
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for: ${what}\n` +
          `  structures=${selectStepStatus(this.state, 'structures')} ` +
          `error=${JSON.stringify(this.state.steps.structures?.error)}`
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
  resetStepCatalog()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  globalThis.fetch = realFetch
})

/* ---------------------------------------------------------------------------
   The live flow up to the structures step
   --------------------------------------------------------------------------- */

/**
 * Boundary; landform committed whole; water committed with ONE zone (roads'
 * reason); one road network from access point A; trees committed whole. The
 * cursor lands on structures with nothing generated.
 */
async function throughTreesCommit(ui) {
  await ui.run((a) => a.setDraftInput('boundary', 'ring', BOUNDARY))
  await ui.click('commit-boundary')
  await ui.waitFor('the session to exist', () => Boolean(ui.state.sessionId))

  await ui.click('generate-landform')
  await ui.waitFor('landform to generate', () => selectStepStatus(ui.state, 'landform') === GENERATED)
  await ui.waitFor('the landform draft', () => ui.state.drafts.landform !== undefined)
  await ui.click('commit-landform')
  await ui.waitFor('landform to commit', () => selectStepStatus(ui.state, 'landform') === COMMITTED)

  await ui.click('generate-water')
  await ui.waitFor('water to generate', () => selectStepStatus(ui.state, 'water') === GENERATED)
  await ui.waitFor('the water draft', () => ui.state.drafts.water !== undefined)
  const zones = registryProposalFeatures(ui.state.steps.water.proposals, 'water')
  expect(zones.length).toBeGreaterThan(0)
  await ui.run((a) => a.setSelection('water', [zones[0].id]))
  await ui.click('commit-water')
  await ui.waitFor('water to commit', () => selectStepStatus(ui.state, 'water') === COMMITTED)

  expect(ui.cursor.cursorStepId).toBe('roads')
  await ui.click('access-roads')
  await ui.clickMap(ACCESS_A)
  expect(selectDraft(ui.state, 'roads').inputs[ACCESS_POINT_INPUT]).toBeDefined()
  await ui.click('generate-roads')
  await ui.waitFor(
    'a network from A',
    () => roadNetworks(ui.state.steps.roads?.proposals).length === 1 && ui.state.drafts.roads !== undefined
  )
  await ui.click('commit-roads')
  await ui.waitFor('roads to commit', () => selectStepStatus(ui.state, 'roads') === COMMITTED)

  expect(ui.cursor.cursorStepId).toBe('trees')
  await ui.click('generate-trees')
  await ui.waitFor('trees to generate', () => selectStepStatus(ui.state, 'trees') === GENERATED)
  await ui.waitFor('the trees draft', () => ui.state.drafts.trees !== undefined)
  await ui.click('commit-trees')
  await ui.waitFor('trees to commit', () => selectStepStatus(ui.state, 'trees') === COMMITTED)

  expect(ui.cursor.cursorStepId).toBe('structures')
  return ui
}

/**
 * The ruled row a notice's sentence sits in.
 *
 * The instruction bar's notices are rows: a one-word kind label in the data
 * face, then the sentence. The test id is on the SENTENCE -- that is what the
 * assertions in this file compare against a definition's declared copy -- and
 * the tone class, which colours the whole row, is on the row.
 */
const noticeRow = (el) => el.closest('.chrome-bar__notice')

/** The measurement set every site carries, generated or placed. */
const MEASUREMENT_FIELDS = [
  'rank',
  'suitability_score',
  'slope_score',
  'aspect_score',
  'shading_score',
  'production_proximity_score',
  'avg_slope_pct',
  'aspect',
  'aspect_degrees',
  'footprint_area_acres',
  'distance_to_road_ft',
  'road_proximity_source',
  'distance_to_production_zone_ft',
  'production_zone_relationship',
  'distance_to_water_zone_ft',
  'constraints_satisfied',
  'site_origin',
]

/* ===========================================================================
   0b. ARMING THE PLACEMENT CLEARS THE FOCUS
   =========================================================================== */

describe('0b. arming clears the focus', () => {
  /**
   * THE SAME RULE LANDFORM'S DRAW TOOL TAKES, and it arrives here by having
   * one door: "Place a site" is an armButton() like every other arming
   * gesture, and WizardCursor's arm() blurs before it arms. This step shared
   * the bug -- a site's panel stayed open over the placement -- and shares
   * the fix without a line of its own.
   *
   * THE SELECTION IS UNTOUCHED, which matters more here than on landform: a
   * placed site is committable, and a gesture that emptied the commit while
   * the user reached for a second site would lose the first.
   */
  liveIt('closes an open site panel when "Place a site" is armed', async () => {
    const ui = await renderApp()
    await throughTreesCommit(ui)
    await ui.click('generate-structures')
    await ui.waitFor('structures to generate', () => selectStepStatus(ui.state, 'structures') === GENERATED)
    await ui.waitFor('the structures draft', () => ui.state.drafts.structures !== undefined)

    const siteId = ui.structures.structure_sites.features[0].id
    await ui.focus(siteId)
    expect(ui.cursor.focusedFeatureId).toBe(siteId)
    expect(ui.find('detail-structures')).not.toBeNull()

    const selected = selectDraft(ui.state, 'structures').selectedFeatureIds
    await ui.click('place-structures')

    expect(ui.cursor.armed).toBe('draw')
    expect(ui.cursor.focusedFeatureId).toBeNull()
    expect(ui.find('detail-structures')).toBeNull()
    expect(selectDraft(ui.state, 'structures').selectedFeatureIds).toEqual(selected)

    await ui.unmount()
  })
})

/* ===========================================================================
   1. END TO END
   =========================================================================== */

describe('1. end to end against the real backend', () => {
  liveIt(
    'generates over the four commits, places two sites (one on the canopy), has a third refused by the server, commits several, reopens, and commits none',
    async () => {
      const ui = await renderApp()
      await throughTreesCommit(ui)

      // THE STEP OPENS EMPTY: nothing generated, nothing armed, one button.
      expect(ui.structures).toBeNull()
      expect(ui.cursor.armed).toBeNull()
      expect(ui.text('armed-tool')).toBe('No map tool is active.')
      expect(ui.all('[data-tab-id]')).toHaveLength(0)
      expect(ui.text('generate-structures')).toBe('Generate structure sites')
      expect(ui.find('place-structures')).toBeNull()

      await ui.click('generate-structures')
      await ui.waitFor('structures to generate', () => selectStepStatus(ui.state, 'structures') === GENERATED)
      await ui.waitFor('the structures draft', () => ui.state.drafts.structures !== undefined)

      // THE PAYLOAD IS THE BACKEND'S OWN SHAPE, exactly (test_structures_step.py
      // asserts the same four keys), and its handshake names the input and
      // the cap this side mirrors.
      expect(Object.keys(ui.structures).sort()).toEqual(['placement', 'sites', 'structure_sites', 'summary'])
      expect(ui.structures.placement).toEqual({ input: STRUCTURE_SITE_INPUT, shape: 'lon_lat', max_placed: MAX_PLACED_SITES })
      expect(ui.structures.summary.max_placed).toBe(MAX_PLACED_SITES)
      expect(ui.structures.summary.max_candidates).toBe(3)
      // NO crossing_grounds KEY: the contract declares crossings absent.
      expect(ui.structures).not.toHaveProperty('crossing_grounds')

      // [1] THREE TABS, one per generated candidate, in rank order, every one
      // checked, none removable.
      const candidates = registryProposalFeatures(ui.structures, 'structures')
      expect(candidates).toHaveLength(3)
      expect(ui.all('[data-tab-id]')).toHaveLength(3)
      candidates.forEach((feature, index) => {
        const p = feature.properties
        expect(p.rank).toBe(index + 1)
        expect(p.site_origin).toBe(SITE_ORIGIN_GENERATED)
        expect(feature.geometry.type).toBe('Polygon')
        expect(p).not.toHaveProperty('constraints_violated')
        expect(ui.text(`tab-focus-${feature.id}`)).toContain(`Site ${p.rank}`)
        expect(ui.text(`tab-focus-${feature.id}`)).toContain(Number(p.suitability_score).toFixed(1))
        expect(ui.find(`tab-remove-${feature.id}`)).toBeNull()
        expect(ui.find(`tab-${feature.id}`).classList.contains('chrome-tab--drawn')).toBe(false)
      })
      expect(selectDraft(ui.state, 'structures').selectedFeatureIds.sort()).toEqual(
        candidates.map((f) => f.id).sort()
      )

      // [3] ft to road IS A MEASUREMENT ON THIS PARCEL, and it is asserted
      // because it was not. Every reported distance used to run from the
      // 0.1-acre PAD; the road-proximity constraint tunes candidates to sit
      // close to a road, shapely returns 0.0 for geometries that intersect,
      // and the pad intersected the road by construction -- so the tab's
      // headline figure read 0.0 on nine of eleven clearing footprints here.
      // It is measured from the site's own point now. A zero would be that
      // bug back, so nothing on this parcel may read one.
      const roadFeet = candidates.map((f) => f.properties.distance_to_road_ft)
      for (const feet of roadFeet) {
        expect(typeof feet, 'the tier is selected_road_corridor, so it is measured').toBe('number')
        expect(feet, 'ft to road is not 0.0 on any candidate').toBeGreaterThan(0)
      }
      // AND IT REACHES THE STRIP AS A FIGURE, not as a dash and not as a zero.
      for (const feature of candidates) {
        const values = [...ui.find(`tab-focus-${feature.id}`).querySelectorAll('.chrome-tab__value')]
        expect(values.map((n) => n.textContent)).toEqual([
          Number(feature.properties.distance_to_road_ft).toFixed(0),
          Number(feature.properties.suitability_score).toFixed(1),
        ])
        expect(values[0].textContent).not.toBe('0')
      }
      // THE TAB'S LABELS: the measurement, then the score, bare -- the
      // denominator is the panel's.
      expect(
        [...ui.find(`tab-focus-${candidates[0].id}`).querySelectorAll('.chrome-tab__label')].map((n) => n.textContent)
      ).toEqual(['ft to road', 'score'])

      // [9] THE ROAD TIER, LIVE: a road was committed, so the distances are
      // to it, and the bar says so.
      expect(roadProximitySource(ui.structures)).toBe('selected_road_corridor')
      expect(ui.find('notice-road-selected_road_corridor-structures').textContent).toBe(
        ROAD_PROXIMITY_CONSEQUENCE.selected_road_corridor.text
      )
      expect(ui.find('notice-road-real_mapped_road-structures')).toBeNull()
      expect(ui.find('notice-road-unavailable-structures')).toBeNull()

      // [2] NOT ARMED ON ENTRY; "Place a site" arms it, and nothing else does.
      expect(ui.cursor.armed).toBeNull()
      expect(ui.text('place-structures')).toBe('Place a site')
      expect(ui.find('place-structures').disabled).toBe(false)
      expect(ui.find('tool-draw').dataset.armed).toBe('false')

      // [1] PLACE A SITE: it is scored, gets a tab ranked among the three,
      // carries the whole measurement set, and the tool goes down.
      await ui.place(CLEAN)
      expect(ui.placed).toHaveLength(1)
      expect(ui.cursor.armed).toBeNull()
      const clean = ui.placed[0]
      expect(clean.geometry).toEqual({ type: 'Point', coordinates: pointToGeoJSON(CLEAN) })
      expect(clean.id).toMatch(/^structure-site-placed-/)
      expect(clean.properties.layer).toBe(STRUCTURE_SITE_LAYER)
      expect(clean.properties.site_origin).toBe(SITE_ORIGIN_PLACED)
      expect(clean.properties.constraints_violated).toEqual([])
      for (const field of MEASUREMENT_FIELDS) expect(clean.properties, field).toHaveProperty(field)
      expect(typeof clean.properties.suitability_score).toBe('number')
      expect(clean.properties.footprint_wgs84.type).toBe('Polygon')
      // IT RANKS: 1 + the generated candidates scoring strictly higher.
      const higher = candidates.filter((f) => f.properties.suitability_score > clean.properties.suitability_score).length
      expect(clean.properties.rank).toBe(higher + 1)
      // THE TAB: placed, checked, removable, named by what its rank IS.
      expect(ui.all('[data-tab-id]')).toHaveLength(4)
      expect(ui.text(`tab-focus-${clean.id}`)).toContain(`Placed 1 · would rank ${clean.properties.rank}`)
      expect(ui.find(`tab-${clean.id}`).classList.contains('chrome-tab--drawn')).toBe(true)
      expect(ui.find(`tab-${clean.id}`).dataset.checked).toBe('true')
      expect(ui.find(`tab-remove-${clean.id}`)).not.toBeNull()
      expect(selectDraft(ui.state, 'structures').selectedFeatureIds).toContain(clean.id)
      // THE SITE IS ON THE MAP AS A PIN, marked as the user's; the three
      // generated sites are three pins in their own pane.
      expect(ui.all('.leaflet-structures--structures-placed-pane .site-pin.site-pin--placed')).toHaveLength(1)
      expect(ui.all('.leaflet-structures--structures-candidates-pane .site-pin')).toHaveLength(3)
      expect(ui.all('.leaflet-structures--structures-candidates-pane .site-pin--placed')).toHaveLength(0)
      // A clean site raises no notice and no caution.
      expect(ui.find('structures-notice')).toBeNull()
      expect(ui.find(`notice-violates-${clean.id}-structures`)).toBeNull()

      // THE PANEL FOR THE PLACED SITE: the same rows as a generated one,
      // through the shared format, and no caution run -- it breaks nothing.
      await ui.focus(clean.id)
      expect(ui.text('detail-name-structures')).toBe(`Placed 1 · would rank ${clean.properties.rank}`)
      expect(ui.text('detail-value-/100 score')).toBe(clean.properties.suitability_score.toFixed(1))
      expect(ui.text('detail-value-ft to road')).toBe(Number(clean.properties.distance_to_road_ft).toFixed(0))
      expect(ui.text('detail-value-aspect')).toBe(`${clean.properties.dominant_aspect} facing`)
      expect(clean.properties.aspect_available).toBe(true)
      expect(ui.text('detail-value-position')).toBe(clean.properties.elevation_position)
      expect(ui.text('detail-value-avg slope %')).toBe(clean.properties.avg_slope_pct.toFixed(1))
      expect(ui.text('detail-value-solar rating')).toBe(clean.properties.solar_rating)
      expect(ui.find('detail-heading-structures')).toBeNull()
      expect(ui.find('detail-cautions-structures')).toBeNull()
      // [7] RANK IS ON THE TAB AND NOT IN THE PANEL, and neither is the
      // parcel-level prime-farmland flag or any of the four factors.
      expect(ui.find('detail-value-rank')).toBeNull()
      expect(ui.find('detail-value-prime farmland')).toBeNull()
      expect(ui.find('detail-fields-merits')).toBeNull()
      await ui.focus(null)

      // [3] OFF THE PARCEL: refused in a sentence, nothing placed, the tool
      // down. No request went out for it -- the parcel is the one refusal
      // this side can make with certainty.
      await ui.place(OFF)
      expect(ui.placed).toHaveLength(1)
      expect(ui.text('structures-notice')).toBe(
        'That spot is outside the property boundary, so no site was placed there.'
      )
      expect(ui.cursor.armed).toBeNull()

      // [4] ON THE CANOPY: SCORED, PLACED, AND TOLD WHAT IT BREAKS. The server
      // scored it and named the gates; the tab, the bar and the panel say
      // both facts. This is the divergence from trees, live.
      await ui.place(CANOPY)
      expect(ui.placed).toHaveLength(2)
      const canopy = ui.placed[1]
      expect(typeof canopy.properties.suitability_score).toBe('number')
      expect(canopy.properties.constraints_violated).toContain('outside_existing_canopy')
      await ui.expand()
      expect(ui.text(`tab-focus-${canopy.id}`)).toContain(`Placed 2 · would rank ${canopy.properties.rank}`)
      expect(ui.text(`tab-focus-${canopy.id}`)).toContain(canopy.properties.suitability_score.toFixed(1))
      const gesture = ui.find('structures-notice')
      expect(gesture.textContent).toContain('Placed, and scored')
      expect(gesture.textContent).toContain('placed, not refused')
      const violates = ui.find(`notice-violates-${canopy.id}-structures`)
      expect(violates.textContent).toContain('Placed 2 scores')
      expect(violates.textContent).toContain('sits under existing tree canopy')
      await ui.focus(canopy.id)
      // THE CAUTION RUN, LAST: the heading, then one term per broken gate.
      const heading = ui.find('detail-heading-structures')
      expect(heading.textContent).toMatch(/^siting rules? broken$/)
      const broken = [...ui.find('detail-rows-structures').querySelectorAll('[data-row="term"]')]
      expect(broken.map((node) => node.textContent)).toContain('sits under existing tree canopy')
      expect(broken).toHaveLength(canopy.properties.constraints_violated.length)
      expect(ui.text('detail-value-/100 score')).toBe(canopy.properties.suitability_score.toFixed(1))
      await ui.focus(null)
      // [10] AND NO CAUTION MARKER, for either placed site: this step records
      // no crossings, and a broken siting rule is a fact on the panel.
      expect(ui.all('.caution-marker')).toHaveLength(0)
      expect(canopy.properties).not.toHaveProperty('cautions')

      // [6] THE CAP IS REFLECTED: two placed, the button is disabled with
      // the reason, the bar says so.
      expect(placedSlotsRemaining({ proposals: ui.structures, draft: selectDraft(ui.state, 'structures') })).toBe(0)
      expect(ui.find('place-structures').disabled).toBe(true)
      expect(ui.find('place-structures').getAttribute('title')).toContain('2 sites are placed')
      expect(ui.find('notice-cap-structures')).not.toBeNull()

      // [6] AND THE SERVER OWNS IT. A third placed site pushed into the draft
      // behind the button's back is refused AT COMMIT, by the server, naming
      // the rule -- the UI reflects the cap and does not own it.
      const third = await ui.run((a) =>
        a.scorePlacedFeature('structures', { [STRUCTURE_SITE_INPUT]: pointToGeoJSON([CLEAN[0], CLEAN[1] + 0.0003]) })
      )
      expect(third.feature).toBeDefined()
      await ui.run((a) => a.addDrawnFeature('structures', third.feature))
      expect(ui.placed).toHaveLength(3)
      await ui.click('commit-structures')
      await ui.waitFor('the 422', () => ui.state.steps.structures?.error?.kind === 'rejected', 60000)
      expect(selectStepStatus(ui.state, 'structures')).toBe(GENERATED)
      const rejection = ui.state.steps.structures.error.rejections[0]
      expect(rejection.code).toBe('too_many_user_added_features')
      expect(rejection.reason).toContain('at most 2 user-added')

      // [7] × ON THE THIRD FREES THE SLOT. Placed tabs carry the ×; generated
      // ones do not; the count comes back under the cap.
      await ui.expand()
      for (const feature of candidates) expect(ui.find(`tab-remove-${feature.id}`)).toBeNull()
      for (const feature of ui.placed) expect(ui.find(`tab-remove-${feature.id}`)).not.toBeNull()
      await ui.click(`tab-remove-${third.feature.id}`)
      expect(ui.placed).toHaveLength(2)
      expect(ui.placed.map((f) => f.id)).toEqual([clean.id, canopy.id])
      expect(ui.find('undo-structures')).not.toBeNull()
      await ui.run((a) => a.clearStepError('structures'))

      // [8] COMMIT SEVERAL: two generated (the third un-checked) and both
      // placed sites, the canopy one included. The document carries them
      // with their provenance, and a placed site's stored properties are
      // the scored ones, byte for byte.
      const dropped = candidates[2]
      await ui.expand()
      await ui.click(`tab-check-${dropped.id}`)
      expect(ui.text('commit-structures')).toBe('Commit structure sites')
      await ui.click('commit-structures')
      await ui.waitFor('structures to commit', () => selectStepStatus(ui.state, 'structures') === COMMITTED)
      const committed = selectStepFeatures(ui.state, 'structures').features
      const provenance = selectStepProvenance(ui.state, 'structures')
      expect(committed.map((f) => f.id).sort()).toEqual(
        [candidates[0].id, candidates[1].id, clean.id, canopy.id].sort()
      )
      expect(provenance[candidates[0].id]).toBe(PROVENANCE_GENERATED)
      expect(provenance[candidates[1].id]).toBe(PROVENANCE_GENERATED)
      expect(provenance[clean.id]).toBe(PROVENANCE_USER_ADDED)
      expect(provenance[canopy.id]).toBe(PROVENANCE_USER_ADDED)
      for (const placed of [clean, canopy]) {
        const stored = committed.find((f) => f.id === placed.id)
        expect(stored.geometry).toEqual(placed.geometry)
        for (const field of MEASUREMENT_FIELDS) expect(stored.properties[field]).toEqual(placed.properties[field])
        expect(stored.properties.constraints_violated).toEqual(placed.properties.constraints_violated)
        // NO CROSSINGS KEY, declared absent rather than recorded empty.
        expect(stored.properties).not.toHaveProperty('exclusion_crossings')
      }
      // The cursor moved on; the committed sites are in the committed band
      // as pins at the committed level -- four of them, the two points and
      // the two pads alike.
      expect(ui.cursor.cursorStepId).toBe('fencing')
      expect(ui.all('.leaflet-structures--structures-committed-pane .site-pin--committed')).toHaveLength(4)
      // AND THE COMMITTED ACCESS POINT IS STILL THERE, marked committed --
      // ink at the committed level by App.css's rule -- beside the pins.
      expect(ui.all('.access-point-marker--committed')).toHaveLength(1)
      expect(ui.all('.access-point-marker:not(.access-point-marker--committed)')).toHaveLength(0)

      // REOPEN: the placed sites come home from the document as placed
      // sites, scored -- their measurement set INHERITED from the wire, not
      // re-scored -- and the panel reads them as before.
      await ui.run((_, c) => c.open('structures'))
      await ui.click('edit-structures')
      await ui.click('reopen-confirm-yes-structures')
      await ui.waitFor('structures to reopen', () => selectStepStatus(ui.state, 'structures') === GENERATED)
      await ui.waitFor('the reopened payload', () => ui.structures != null && ui.state.drafts.structures !== undefined)
      expect(ui.placed.map((f) => f.id).sort()).toEqual([clean.id, canopy.id].sort())
      const home = ui.placed.find((f) => f.id === clean.id)
      expect(home.properties.suitability_score).toBe(clean.properties.suitability_score)
      expect(home.properties.footprint_area_acres).toBe(clean.properties.footprint_area_acres)
      await ui.expand()
      expect(ui.text(`tab-focus-${clean.id}`)).toContain(clean.properties.suitability_score.toFixed(1))
      expect(selectDraft(ui.state, 'structures').selectedFeatureIds.sort()).toEqual(
        [candidates[0].id, candidates[1].id, clean.id, canopy.id].sort()
      )
      expect(ui.find('place-structures').disabled).toBe(true)

      // THE REHYDRATION CAVEAT, MEASURED. A pad against the boundary is
      // CLIPPED when it is scored, and the rehydrator derives it again
      // UNCLIPPED -- so the server-side site dict's area can differ from the
      // scored one. What this client ever holds is the FEATURE'S OWN
      // properties, which the document stores as committed and hands back on
      // reopen: replace the canopy site with one on the edge, commit, reopen,
      // and every measurement is the scored one, byte for byte, never the
      // pad's nominal tenth of an acre and never a re-derivation.
      //
      // THE PAD'S ACREAGE IS NO LONGER A PANEL ROW -- every pad is the same
      // tenth of an acre unless the boundary clipped it, which is not a
      // question a reader brings to one site -- so the claim is made where it
      // actually lives, on the feature. What the PANEL shows through the
      // round trip is asserted on the rows it has.
      await ui.expand()
      await ui.click(`tab-remove-${canopy.id}`)
      expect(ui.placed).toHaveLength(1)
      await ui.place(EDGE)
      expect(ui.placed).toHaveLength(2)
      const edge = ui.placed[1]
      expect(edge.properties.footprint_area_acres).toBeLessThan(0.1)
      expect(edge.properties.footprint_area_acres).toBeGreaterThan(0)
      const scoredArea = edge.properties.footprint_area_acres
      await ui.focus(edge.id)
      const edgePanel = [
        ui.text('detail-value-/100 score'),
        ui.text('detail-value-ft to road'),
        ui.text('detail-value-aspect'),
        ui.text('detail-value-position'),
        ui.text('detail-value-avg slope %'),
        ui.text('detail-value-solar rating'),
      ]
      await ui.focus(null)
      await ui.click('commit-structures')
      await ui.waitFor('structures to commit again', () => selectStepStatus(ui.state, 'structures') === COMMITTED)
      const storedEdge = selectStepFeatures(ui.state, 'structures').features.find((f) => f.id === edge.id)
      expect(storedEdge.properties.footprint_area_acres).toBe(scoredArea)
      await ui.run((_, c) => c.open('structures'))
      await ui.click('edit-structures')
      await ui.click('reopen-confirm-yes-structures')
      await ui.waitFor('structures to reopen again', () => selectStepStatus(ui.state, 'structures') === GENERATED)
      await ui.waitFor('the reopened payload again', () => ui.structures != null && ui.state.drafts.structures !== undefined)
      const rehydrated = ui.placed.find((f) => f.id === edge.id)
      expect(rehydrated.properties.footprint_area_acres).toBe(scoredArea)
      await ui.focus(edge.id)
      expect([
        ui.text('detail-value-/100 score'),
        ui.text('detail-value-ft to road'),
        ui.text('detail-value-aspect'),
        ui.text('detail-value-position'),
        ui.text('detail-value-avg slope %'),
        ui.text('detail-value-solar rating'),
      ]).toEqual(edgePanel)
      await ui.focus(null)
      console.log(
        `STRUCTURES REHYDRATION: edge pad scored at ${scoredArea} acres, ` +
          `stored at ${storedEdge.properties.footprint_area_acres}, and the panel reads ` +
          `${JSON.stringify(edgePanel)} before and after reopen`
      )

      // [8] COMMIT NONE: every box off, the button renames itself, the
      // document carries an empty decision.
      for (const id of selectDraft(ui.state, 'structures').selectedFeatureIds) {
        await ui.expand()
        await ui.click(`tab-check-${id}`)
      }
      expect(selectDraft(ui.state, 'structures').selectedFeatureIds).toEqual([])
      expect(ui.text('commit-structures')).toBe('Commit no structure sites')
      await ui.click('commit-structures')
      await ui.waitFor('the empty commit', () => selectStepStatus(ui.state, 'structures') === COMMITTED)
      expect(selectStepFeatures(ui.state, 'structures').features).toEqual([])
      expect(ui.cursor.cursorStepId).toBe('fencing')

      console.log(
        `STRUCTURES LIVE: ${candidates.length} generated (${candidates.map((f) => f.properties.suitability_score).join(', ')}); ` +
          `placed clean ${clean.properties.suitability_score} would rank ${clean.properties.rank}; ` +
          `placed canopy ${canopy.properties.suitability_score} would rank ${canopy.properties.rank} ` +
          `breaking ${JSON.stringify(canopy.properties.constraints_violated)}; road tier selected_road_corridor (asserted above); ` +
          `ft to road ${JSON.stringify(roadFeet)} on the generated candidates and ` +
          `${clean.properties.distance_to_road_ft} / ${canopy.properties.distance_to_road_ft} on the placed ones — ` +
          'none 0.0, which is what this read before the distances moved to the point'
      )
      await ui.unmount()
    }
  )
})

/* ===========================================================================
   The offline payload -- the backend's shape, over the interaction fixture
   =========================================================================== */

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

/** A parcel over the interaction fixture's ground, [lat, lng]. */
const RING = [
  [40.71, -74.02],
  [40.71, -73.98],
  [40.73, -73.98],
  [40.73, -74.02],
]

const box = (west, east, south, north) => ({
  type: 'Polygon',
  coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
})

/** A pad: a small box around a [lng, lat] centre. */
const pad = ([lng, lat], half = 0.00012) => box(lng - half, lng + half, lat - half, lat + half)

const PRODUCTION_POLY = box(-74.015, -74.008, 40.712, 40.718)
const WATER_POLY = box(-74.005, -73.998, 40.715, 40.72)

const SITE_1 = 'solar-candidate-1'
const SITE_2 = 'solar-candidate-2'
const SITE_3 = 'solar-candidate-3'

/**
 * A generated candidate in _structure_site_properties()'s shape: the
 * measurement set, the guarantee, no violated list, `site_origin` generated.
 */
function candidate(id, rank, centre, extra = {}) {
  return {
    type: 'Feature',
    id,
    geometry: pad(centre),
    properties: {
      layer: STRUCTURE_SITE_LAYER,
      label: 'Structure site',
      confidence: 'medium',
      confidence_notes: 'fixture',
      rank,
      suitability_score: 70 - rank,
      slope_score: 0.812,
      aspect_score: 0.9,
      shading_score: 0.75,
      production_proximity_score: 0.5,
      avg_slope_pct: 5.2,
      // THREE SPELLINGS OF ONE DIRECTION. `aspect` is the 16-point
      // abbreviation the report quotes; `dominant_aspect` is the same bearing
      // as production's own 8-point WHOLE WORD, which is what the panel
      // prints; `aspect_degrees` is what both were derived from.
      // `aspect_available` false would mean the ground faces nowhere well
      // enough to name, and the word would be null rather than absent.
      aspect: 'NE',
      dominant_aspect: 'northeast',
      aspect_available: true,
      aspect_degrees: 50.0,
      // THE PANEL'S TWO BANDED WORDS AND THE FIGURES THEY BAND -- both words
      // are the backend's (SOLAR_RATING_BANDS; production's imported
      // ELEVATION_POSITION_BANDS), and both figures ride beside them for the
      // report. The panel renders the words and never the cuts.
      solar_value: 91.5,
      solar_rating: 'excellent',
      elevation_percentile_of_parcel: 80.3,
      elevation_position: 'upper field',
      footprint_area_acres: 0.1,
      distance_to_road_ft: 45.9,
      road_proximity_source: 'selected_road_corridor',
      distance_to_production_zone_ft: 12.0,
      // NEGATIVE INSIDE A BLOCK, positive outside, 0.0 on the edge, null with
      // no blocks. On the wire for the narrative; never in the panel.
      signed_distance_to_production_ft: 12.0,
      production_zone_relationship: 'adjacent',
      distance_to_water_zone_ft: 300.5,
      constraints_satisfied: [
        'outside_water_candidate_zone',
        'outside_existing_canopy',
        'max_slope<=20pct',
        'suitability_score>=40',
        'outside_tree_zone_candidate_buffer',
        'within_road_proximity_buffer',
      ],
      site_origin: SITE_ORIGIN_GENERATED,
      prime_farmland_conflict: false,
      prime_farmland_note: 'fixture',
      ...extra,
    },
  }
}

/**
 * A placed site in placed_structure_site_to_feature()'s shape: a Point, the
 * same property block plus `constraints_violated`, the placed point and the
 * pad, `site_origin` user_placed, and a rank that is a comparison.
 */
function placedSite(point, { rank = 4, score = 55.0, violated = [], id, area = 0.1 } = {}) {
  const [lng, lat] = point
  return {
    type: 'Feature',
    id: id ?? `structure-site-placed-${Math.abs(Math.round(lng * 1e6 + lat * 1e6))}`,
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      ...candidate('x', rank, point).properties,
      suitability_score: score,
      footprint_area_acres: area,
      constraints_satisfied: candidate('x', rank, point).properties.constraints_satisfied.filter(
        (name) => !violated.includes(name)
      ),
      constraints_violated: violated,
      site_origin: SITE_ORIGIN_PLACED,
      placed_lon_lat: [lng, lat],
      footprint_wgs84: pad(point),
      label: 'Placed structure site',
      confidence: 'low',
    },
  }
}

/**
 * The structures payload in step_orchestrator.build_structures_payload()'s
 * shape: `structure_sites`, the projected `sites` rows, the narrative block
 * under `summary` with the caps, the run flags and the weights, and the
 * placement handshake. No `crossing_grounds` key, ever.
 */
function structuresPayload({
  source = 'selected_road_corridor',
  candidates = 3,
  weights,
  treeZones = true,
  prime = false,
  maxPlaced = MAX_PLACED_SITES,
} = {}) {
  const features = [
    candidate(SITE_1, 1, [-74.012, 40.7215]),
    // THREE DIFFERENT BAND WORDS ACROSS THE THREE CANDIDATES, so a test that
    // asserts the panel renders the word cannot pass by rendering a constant.
    candidate(SITE_2, 2, [-74.006, 40.7225], {
      solar_value: 81.4,
      solar_rating: 'great',
      elevation_position: 'mid field',
      elevation_percentile_of_parcel: 51.0,
    }),
    candidate(SITE_3, 3, [-73.996, 40.7135], {
      solar_value: 62.0,
      solar_rating: 'good',
      elevation_position: 'lower field',
      elevation_percentile_of_parcel: 11.4,
      signed_distance_to_production_ft: -32.8,
      production_zone_relationship: 'inside',
    }),
  ]
    .slice(0, candidates)
    .map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        road_proximity_source: source,
        distance_to_road_ft: source === 'unavailable' ? null : feature.properties.distance_to_road_ft,
        prime_farmland_conflict: prime,
      },
    }))
  const factor_weights_pct = weights ?? { slope: 25.0, aspect: 25.0, shading: 25.0, production_proximity: 25.0 }
  return {
    structure_sites: { type: 'FeatureCollection', features },
    sites: features.map((f) => ({ feature_id: f.id, ...f.properties })),
    summary: {
      site_found: features.length > 0,
      candidate_count: features.length,
      // PROMOTED TO A STEP-LEVEL KEY, beside candidate_count. It is true of
      // the whole run, and with ft-to-road the tab's headline figure its
      // meaning depends entirely on it. The same string stays in `gates`,
      // where the report reads it: one value in two places by design.
      road_proximity_source: source,
      gates: {
        existing_canopy_excluded: true,
        water_zone_excluded: true,
        tree_zone_exclusion_checked: treeZones,
        road_proximity_source: source,
        prime_farmland_checked: true,
        hydric_gate_checked: true,
        floodplain_gate_checked: true,
        drainage_gates_checked: ['outside_hydric_soil', 'outside_floodplain'],
      },
      // EVERY BAND SET THIS STEP PUBLISHES, so the frontend holds no
      // threshold -- and the score's own axis, which is what the panel's
      // "/100 score" is read off. LANDFORM'S SPELLING (`scales.range[1]`) at
      // a DIFFERENT DEPTH: build_structures_payload forwards the narrative
      // whole under `summary`, and the scales block rides the narrative.
      scales: {
        range: [0.0, 100.0],
        direction: 'higher_is_better',
        applies_to: ['score', 'factors.*'],
        solar_rating: {
          range: [0.0, 100.0],
          direction: 'higher_is_better',
          bands: { fair: [0.0, 60.0], good: [60.0, 78.0], great: [78.0, 90.0], excellent: [90.0, 100.0] },
          band_bounds: 'lower_inclusive_upper_exclusive_last_band_inclusive',
          composed_of: ['aspect_score', 'shading_score'],
          weight_of_composite_pct: 50.0,
          not_a: 'rank_among_candidates',
          calibration: 'unvalidated_starting_values',
          applies_to: ['solar_value', 'solar_rating'],
        },
        elevation_position: {
          range: [0.0, 100.0],
          direction: 'higher_is_upslope',
          bands: { 'lower field': [0.0, 33.3], 'mid field': [33.3, 66.7], 'upper field': [66.7, 100.0] },
          band_bounds: 'lower_inclusive_upper_exclusive_last_band_inclusive',
          applies_to: ['elevation_percentile_of_parcel', 'elevation_position'],
        },
      },
      no_candidates: null,
      selected_site: null,
      max_candidates: 3,
      max_placed: maxPlaced,
      run_flags: {
        shading_is_rough_proxy: true,
        road_proximity_source: source,
        tree_zone_exclusion_available: treeZones,
        drainage_gates_checked: ['outside_hydric_soil', 'outside_floodplain'],
        spacing_meters: 25.0,
        max_structure_footprint_acres: 0.1,
      },
      factor_weights_pct,
    },
    placement: { input: STRUCTURE_SITE_INPUT, shape: 'lon_lat', max_placed: maxPlaced },
  }
}

function committedStep(revision, features, extra = {}) {
  return {
    status: COMMITTED,
    revision,
    features: { type: 'FeatureCollection', features },
    provenance: Object.fromEntries(features.map((f) => [f.id, 'generated'])),
    ...extra,
  }
}

function serverDocument({ structures = { status: NOT_STARTED }, revision = 5 } = {}) {
  const entries = {}
  for (const stepId of [...STEP_ORDER].sort()) entries[stepId] = { status: NOT_STARTED }
  entries.landform = committedStep(1, [
    { type: 'Feature', id: 'production-area-1', properties: { layer: 'production_area_candidate' }, geometry: PRODUCTION_POLY },
  ])
  entries.water = committedStep(1, [
    { type: 'Feature', id: 'survey-zone-1', properties: { layer: 'survey_zone_embankment', survey_type: 'embankment', rank: 1 }, geometry: WATER_POLY },
  ])
  entries.roads = committedStep(
    1,
    [
      {
        type: 'Feature',
        id: 'road-corridor-1',
        properties: { layer: 'suggested_road_corridor', network_id: 'net-1', access_point: [-74.02, 40.72], branch_index: 0, branch_role: 'trunk' },
        geometry: { type: 'LineString', coordinates: [[-74.02, 40.72], [-74.01, 40.72]] },
      },
    ],
    { inputs: { access_points: [[-74.02, 40.72]] } }
  )
  entries.trees = committedStep(1, [
    { type: 'Feature', id: 'tree-zone-candidate-1', properties: { layer: 'tree_zone_candidate', rank: 1 }, geometry: box(-73.99, -73.985, 40.712, 40.716) },
  ])
  entries.structures = structures
  return {
    schema_version: 1,
    session_id: 'sess-structures',
    document_revision: revision,
    created_at: '2026-01-01T00:00:00+00:00',
    updated_at: '2026-01-01T00:00:00+00:00',
    boundary: RING.map(([lat, lng]) => [lng, lat]),
    step_order: [...STEP_ORDER],
    steps: entries,
  }
}

function installFetch(routes) {
  const calls = []
  const STEPS_ROUTE = { method: 'GET', pattern: /^\/api\/steps$/, responses: { body: { step_order: [...STEP_ORDER] } } }
  routes = [...routes, STEPS_ROUTE]
  const cursors = new Map()
  globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
    const method = init.method ?? 'GET'
    const url = new URL(rawUrl)
    calls.push({ method, path: url.pathname, body: init.body ? JSON.parse(init.body) : null })
    const route = routes.find((r) => r.method === method && r.pattern.test(url.pathname))
    if (!route) throw new Error(`no route for ${method} ${url.pathname}`)
    const responses = Array.isArray(route.responses) ? route.responses : [route.responses]
    const index = Math.min(cursors.get(route) ?? 0, responses.length - 1)
    cursors.set(route, index + 1)
    const answer = typeof responses[index] === 'function' ? await responses[index](calls[calls.length - 1]) : responses[index]
    const { status = 200, body } = answer
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  })
  return calls
}

const route = (method, pattern, responses) => ({ method, pattern, responses })

/**
 * THE SCORE ROUTE, as the served backend answers it: a Feature for a point
 * on the parcel, a 400 naming the input for one off it. `answer(point)`
 * decides which, per call, so a test can hand back a violating site, a
 * refusal, or a deferred answer.
 */
function scoreRoute(answer) {
  return route('POST', /\/steps\/structures\/score$/, async (call) => {
    const point = call.body?.params?.[STRUCTURE_SITE_INPUT]
    return answer(point, call)
  })
}

const REFUSAL_400 = (point) => ({
  status: 400,
  body: {
    error:
      `step 'structures' placed 'site' was rejected: placed site [${point[0].toFixed(6)}, ${point[1].toFixed(6)}] ` +
      'lies outside the parcel boundary. The parcel is the one hard limit on where a structure can be placed; ' +
      'everything else this step checks is measured and reported, never refused.',
  },
})

/** A generated structures step over the fixture payload, resumed into, on the structures cursor. */
async function generatedStructures({ payload = structuresPayload(), score = (point) => ({ body: { feature: placedSite(point) } }), structures } = {}) {
  const document = serverDocument({ structures: structures ?? { status: GENERATED } })
  const calls = installFetch([
    route('GET', /^\/api\/sessions\/sess-structures$/, { body: document }),
    route('GET', /\/steps\/structures\/layers$/, { body: payload }),
    scoreRoute(score),
  ])
  const ui = await renderApp({ center: [40.72, -74.0], zoom: 17 })
  await ui.run((a) => a.resume('sess-structures'))
  await ui.waitFor('the structures payload', () => ui.structures != null, 5000)
  await ui.waitFor('the structures draft', () => ui.state.drafts.structures !== undefined, 5000)
  expect(ui.cursor.cursorStepId).toBe('structures')
  return { ui, calls, document }
}

/** The step's context as its tabs and detail read it, over a payload and a draft. */
const contextOver = (proposals, draft = {}) => ({
  proposals,
  draft: { selectedFeatureIds: [], drawnFeatures: [], inputs: {}, ...draft },
})

/**
 * THE PANEL'S BODY AS THE PANEL COMPOSES IT -- the tab's own rows, the
 * format's rule, then the step's. trees.test.jsx's helper, and it is the
 * whole point of the shared format that the same three lines read any step.
 */
const bodyFor = (payload, featureId = SITE_1, draft = {}) => {
  const context = contextOver(payload, draft)
  const tab = STRUCTURES_STEP.tabs(context).find((entry) => entry.id === featureId)
  return panelBody(tab, STRUCTURES_STEP.detail(context, featureId).rows)
}

/** Inside the fixture parcel, away from everything. [lat, lng]. */
const INSIDE = [40.7245, -74.015]
const INSIDE_2 = [40.7255, -74.017]
const INSIDE_3 = [40.7265, -74.019]
/** Outside it. */
const OUTSIDE = [40.735, -74.03]

/* ===========================================================================
   2. NOT ARMED ON ENTRY; "PLACE A SITE" ARMS IT
   =========================================================================== */

describe('2. the placement tool is not armed on entry, and "Place a site" arms it', () => {
  it('declares the placement as a button in reviewing, never as an arming on entry', () => {
    expect(STRUCTURES_STEP.buttons.idle).toEqual([GENERATE_BUTTON])
    expect(STRUCTURES_STEP.buttons.reviewing.map((b) => b.key)).toEqual(['place', 'commit'])
    expect(STRUCTURES_STEP.buttons.reviewing[0].tone).toBe('secondary')
    expect(STRUCTURES_STEP.buttons.reviewing[1]).toBe(COMMIT_BUTTON)
    expect(STRUCTURES_STEP.buttons.editing.map((b) => b.key)).toEqual(['cancel'])
    expect(STRUCTURES_STEP.buttons.committed).toEqual([REOPEN_BUTTON])
    expect(STRUCTURES_STEP.tools).toEqual(['select', 'draw', 'delete'])
    expect(STRUCTURES_STEP.placement).toMatchObject({ input: STRUCTURE_SITE_INPUT, max: MAX_PLACED_SITES })
    expect(typeof STRUCTURES_STEP.placement.place).toBe('function')
    expect(STRUCTURES_STEP.shape).toBeNull()
  })

  it('opens on structures with nothing armed; the button arms draw; a placement disarms it; cancel disarms it', async () => {
    const { ui } = await generatedStructures()
    expect(ui.cursor.armed).toBeNull()
    expect(ui.text('armed-tool')).toBe('No map tool is active.')
    expect(ui.find('tool-draw')).not.toBeNull()
    expect(ui.find('tool-draw').dataset.armed).toBe('false')
    expect(ui.find('tool-draw').dataset.layer).toBe('structures-placed')
    expect(ui.text('place-structures')).toBe('Place a site')
    expect(ui.find('instruction-structures').textContent).toContain('place your own')

    // A click on the map with nothing armed places nothing.
    await ui.clickMap(INSIDE)
    expect(ui.placed).toHaveLength(0)

    await ui.click('place-structures')
    expect(ui.cursor.armed).toBe('draw')
    expect(ui.find('tool-draw').dataset.armed).toBe('true')
    expect(ui.find('instruction-structures').textContent).toBe(
      'Click a spot inside the property boundary. It is measured where it lands.'
    )
    expect(ui.find('cancel-structures')).not.toBeNull()
    expect(ui.find('place-structures')).toBeNull()

    await ui.click('cancel-structures')
    expect(ui.cursor.armed).toBeNull()
    expect(ui.placed).toHaveLength(0)

    // Armed, one click places one site, and the tool goes down with it.
    await ui.place(INSIDE)
    expect(ui.placed).toHaveLength(1)
    expect(ui.cursor.armed).toBeNull()
    await ui.clickMap(INSIDE_2)
    expect(ui.placed).toHaveLength(1)
    await ui.unmount()
  })

  it('shows the pending marker between the click and the answer, and never a second one', async () => {
    let release = null
    const { ui } = await generatedStructures({
      score: (point) => new Promise((resolve) => {
        release = () => resolve({ body: { feature: placedSite(point) } })
      }),
    })
    await ui.click('place-structures')
    await ui.clickMap(INSIDE)
    expect(ui.all('.site-pin--pending')).toHaveLength(1)
    // A second click while the first is out is dropped, not queued.
    await ui.clickMap(INSIDE_2)
    expect(ui.all('.site-pin--pending')).toHaveLength(1)
    await ui.run(async () => release())
    await ui.waitFor('the placement', () => ui.placed.length === 1, 5000)
    expect(ui.all('.site-pin--pending')).toHaveLength(0)
    expect(ui.placed[0].geometry.coordinates).toEqual(pointToGeoJSON(INSIDE))
    await ui.unmount()
  })
})

/* ===========================================================================
   3. OFF THE PARCEL: REFUSED, AND NOTHING PLACED
   =========================================================================== */

describe('3. an off-parcel click is refused and places nothing', () => {
  it('knows in or out, over the raw degrees', () => {
    expect(pointInRing(INSIDE, RING)).toBe(true)
    expect(pointInRing(OUTSIDE, RING)).toBe(false)
    expect(pointInRing(CLEAN, BOUNDARY)).toBe(true)
    expect(pointInRing(CANOPY, BOUNDARY)).toBe(true)
    expect(pointInRing(OFF, BOUNDARY)).toBe(false)
    expect(pointInRing(INSIDE, [])).toBe(false)
  })

  it('refuses before any request, in a sentence, and the tool goes down', async () => {
    const { ui, calls } = await generatedStructures()
    await ui.place(OUTSIDE)
    expect(ui.placed).toHaveLength(0)
    expect(ui.text('structures-notice')).toBe(
      'That spot is outside the property boundary, so no site was placed there.'
    )
    expect(calls.filter((c) => c.path.endsWith('/score'))).toHaveLength(0)
    expect(ui.cursor.armed).toBeNull()
    // NOT A STEP ERROR: the bar carries a gesture notice, the step is fine.
    expect(ui.state.steps.structures.error).toBeNull()
    expect(ui.find('failed-layer-structures')).toBeNull()
    // And the next placement clears it.
    await ui.place(INSIDE)
    expect(ui.placed).toHaveLength(1)
    expect(ui.find('structures-notice')).toBeNull()
    await ui.unmount()
  })

  it('takes the SERVER’s refusal the same way when it is the server that says no', async () => {
    // A point this side thinks is inside but the server cannot measure (a pad
    // keeping too little of itself on the parcel): a 400 naming the input.
    const { ui, calls } = await generatedStructures({ score: (point) => REFUSAL_400(point) })
    await ui.place(INSIDE)
    expect(calls.filter((c) => c.path.endsWith('/score'))).toHaveLength(1)
    expect(calls.find((c) => c.path.endsWith('/score')).body).toEqual({
      params: { [STRUCTURE_SITE_INPUT]: pointToGeoJSON(INSIDE) },
    })
    expect(ui.placed).toHaveLength(0)
    const notice = ui.text('structures-notice')
    expect(notice).toMatch(/^No site was placed there: placed site \[/)
    expect(notice).toContain('lies outside the parcel boundary')
    // The route's own prefix is not printed.
    expect(notice).not.toContain("step 'structures'")
    expect(notice).not.toContain('was rejected:')
    expect(ui.state.steps.structures.error).toBeNull()
    expect(ui.cursor.armed).toBeNull()
    await ui.unmount()
  })

  it('reports a failure that is not a refusal through the step’s own error, once', async () => {
    const { ui } = await generatedStructures({ score: () => ({ status: 500, body: { error: 'boom' } }) })
    await ui.click('place-structures')
    await ui.clickMap(INSIDE)
    await ui.waitFor('the step error', () => ui.state.steps.structures.error != null, 5000)
    expect(ui.placed).toHaveLength(0)
    // The store reported it; the gesture adds no second sentence.
    expect(ui.find('structures-notice')).toBeNull()
    expect(ui.state.steps.structures.error.kind).toBe('network')
    expect(ui.cursor.armed).toBeNull()
    await ui.unmount()
  })
})

/* ===========================================================================
   4. A GATE-VIOLATING SITE SCORES AND SHOWS ITS VIOLATIONS
   =========================================================================== */

describe('4. a site that breaks a siting rule is scored, placed, and told what it breaks', () => {
  const VIOLATED = ['outside_existing_canopy', 'within_road_proximity_buffer']

  it('states every gate as a fact about the spot, reading the thresholds off the name', () => {
    expect(gateStatement('outside_existing_canopy')).toBe('sits under existing tree canopy')
    expect(gateStatement('outside_water_candidate_zone')).toBe('sits on the committed water ground')
    expect(gateStatement('outside_tree_zone_candidate_buffer')).toBe('sits inside a committed tree zone’s clearance')
    expect(gateStatement('within_road_proximity_buffer')).toBe('is farther from a road than the siting rule allows')
    expect(gateStatement('max_slope<=20pct')).toBe('averages more than 20% slope')
    expect(gateStatement('suitability_score>=40')).toBe('scores below the floor of 40')
    // A name this side does not know is shown as the server spelled it.
    expect(gateStatement('some_new_gate')).toBe('fails the rule the server calls some_new_gate')
  })

  /**
   * [test 5] THE TWO DRAINAGE GATES ARE TWO, AND THE PANEL NAMES WHICH.
   *
   * This is the test the backend's split exists for. The step used to receive
   * roads' COMBINED hydric-plus-floodplain union, and one union could only
   * ever have produced one sentence -- roads' own "wet ground" -- which could
   * not have told a user which ground they were standing on. They are separate
   * hard gates on the wire now, a site can break either or both, and a reader
   * deciding whether to put a building somewhere needs to know whether the
   * soil drains badly or the water arrives from somewhere else.
   */
  it('[test 5] tells hydric soil and the floodplain apart, as two grounds and not one', () => {
    const hydric = gateStatement('outside_hydric_soil')
    const floodplain = gateStatement('outside_floodplain')

    // TWO DIFFERENT STATEMENTS, neither the server's raw name.
    expect(hydric).not.toBe(floodplain)
    expect(hydric).not.toMatch(/outside_|the server calls/)
    expect(floodplain).not.toMatch(/outside_|the server calls/)
    // EACH NAMES ITS OWN GROUND, and neither borrows the other's noun.
    expect(hydric).toContain('hydric')
    expect(floodplain).toContain('floodplain')
    expect(hydric).not.toContain('floodplain')
    expect(floodplain).not.toContain('hydric')
    // "wet (hydric) soil" IS THE APP'S EXISTING WORD for the first of them --
    // the exclusion layer's own label, which landform's cautions print.
    expect(hydric).toContain('wet (hydric) soil')

    // BOTH, ON ONE SITE: the panel names which, in the wire's order.
    const both = placedSite(pointToGeoJSON(INSIDE), {
      id: 'p-wet',
      score: 51.3,
      violated: ['outside_hydric_soil', 'outside_floodplain'],
    })
    const context = contextOver(structuresPayload(), { drawnFeatures: [both], selectedFeatureIds: ['p-wet'] })
    const terms = STRUCTURES_STEP.detail(context, 'p-wet').rows.filter((row) => row.kind === 'term')
    expect(terms.map((row) => row.value)).toEqual([hydric, floodplain])

    // AND EITHER ALONE, so neither is only ever seen beside the other.
    for (const [gate, statement] of [['outside_hydric_soil', hydric], ['outside_floodplain', floodplain]]) {
      const one = placedSite(pointToGeoJSON(INSIDE_2), { id: `p-${gate}`, violated: [gate] })
      const rows = STRUCTURES_STEP.detail(
        contextOver(structuresPayload(), { drawnFeatures: [one] }),
        `p-${gate}`
      ).rows
      expect(rows.filter((row) => row.kind === 'term').map((row) => row.value)).toEqual([statement])
      expect(breakLabel(rows.find((row) => isBreak(row)))).toBe('siting rule broken')
    }
  })

  it('places it with a tab, a notice and a panel group -- not a rejection', async () => {
    const { ui } = await generatedStructures({
      score: (point) => ({ body: { feature: placedSite(point, { rank: 4, score: 59.2, violated: VIOLATED }) } }),
    })
    await ui.place(INSIDE)
    expect(ui.placed).toHaveLength(1)
    const site = ui.placed[0]
    expect(site.properties.suitability_score).toBe(59.2)
    expect(violatedGates(site)).toEqual(VIOLATED)

    // THE TAB: scored, checked, named by where it would sit.
    expect(ui.text(`tab-focus-${site.id}`)).toContain('Placed 1 · would rank 4')
    expect(ui.text(`tab-focus-${site.id}`)).toContain('59.2')
    expect(ui.find(`tab-${site.id}`).dataset.checked).toBe('true')

    // THE GESTURE NOTICE: placed and scored, and what it breaks, as a count.
    const gesture = ui.find('structures-notice')
    expect(gesture.textContent).toContain('Placed, and scored 59.2 where it landed. It breaks 2 of the siting rules')
    expect(gesture.textContent).toContain('placed, not refused')
    expect([...gesture.querySelectorAll('.measure')].map((n) => n.textContent)).toEqual(['59.2', '2'])

    // THE STEP NOTICE: the same two facts, per placed site, as a caution.
    const notice = ui.find(`notice-violates-${site.id}-structures`)
    // THE TONE IS THE ROW'S, NOT THE SENTENCE'S. A notice is a ruled row now
    // -- a kind label in the data face, then what it says -- and the test id
    // names what it says, which is what every reader of it here wants. The
    // tone decides the whole row's colour, so it is read off the row.
    expect(noticeRow(notice).className).toContain('chrome-bar__notice--caution')
    expect(notice.textContent).toBe(
      'Placed 1 scores 59.2 and breaks 2 siting rules the generated sites clear: it sits under existing ' +
        'tree canopy; it is farther from a road than the siting rule allows.'
    )

    // THE PANEL: the score AND the rules, stated as facts, the rules LAST.
    await ui.focus(site.id)
    expect(ui.text('detail-name-structures')).toBe('Placed 1 · would rank 4')
    expect(ui.text('detail-value-/100 score')).toBe('59.2')
    const rows = ui.find('detail-rows-structures')
    expect(ui.text('detail-heading-structures')).toBe('siting rules broken')
    const terms = [...rows.querySelectorAll('[data-row="term"]')].map((node) => node.textContent)
    expect(terms).toEqual([
      'sits under existing tree canopy',
      'is farther from a road than the siting rule allows',
    ])
    // LAST IN THE BODY: nothing follows the caution run.
    const children = [...rows.children]
    const lastTerm = ui.find('detail-term-is farther from a road than the siting rule allows')
    expect(children.indexOf(lastTerm.parentElement)).toBe(children.length - 1)
    // AND NOT AN ERROR TREATMENT ANYWHERE IN IT: the site was placed and
    // scored, which is the whole divergence from trees.
    expect(rows.textContent).not.toMatch(/error|reject|refus/i)
    expect(ui.find('detail-cautions-structures')).toBeNull()

    // NOT AN ERROR ANYWHERE: the step has none, the feature is in the commit.
    expect(ui.state.steps.structures.error).toBeNull()
    const body = buildCommitBody(ui.state, 'structures', registryProposalFeatures)
    expect(body.features.features.map((f) => f.id)).toContain(site.id)
    expect(body.provenance[site.id]).toBe(PROVENANCE_USER_ADDED)
    // Sent verbatim: the Point, and the properties the server gave it.
    const sent = body.features.features.find((f) => f.id === site.id)
    expect(sent).toBe(site)
    expect(sent.geometry.type).toBe('Point')
    expect(sent.properties.constraints_violated).toEqual(VIOLATED)
    await ui.unmount()
  })

  it('says one rule in the singular, and a clean site clears them all', () => {
    const payload = structuresPayload()
    const one = placedSite(pointToGeoJSON(INSIDE), { violated: ['max_slope<=20pct'], score: 44.0, id: 'p-1' })
    const clean = placedSite(pointToGeoJSON(INSIDE_2), { score: 66.6, id: 'p-2' })
    const context = contextOver(payload, { drawnFeatures: [one, clean], selectedFeatureIds: ['p-1', 'p-2'] })
    const notices = STRUCTURES_STEP.notices(context)
    const violates = notices.find((n) => n.key === 'violates-p-1')
    expect(violates.text.map((p) => p.measure ?? p).join('')).toBe(
      'Placed 1 scores 44.0 and breaks a siting rule the generated sites clear: it averages more than 20% slope.'
    )
    expect(notices.find((n) => n.key === 'violates-p-2')).toBeUndefined()
    // [test 6] A CLEAN PLACED SITE CARRIES NO CAUTION RUN, and neither does a
    // generated candidate -- for two different reasons that render the same.
    // The placed one has `constraints_violated: []`, a real answer; the
    // generated one never carries the key at all, because the gates are HARD
    // for it. A row saying it cleared them would be a sentence about nothing.
    const detail = STRUCTURES_STEP.detail(context, 'p-2')
    expect(detail.rows.filter((row) => row.kind === 'term')).toEqual([])
    expect(detail.rows.filter((row) => isBreak(row))).toEqual([])
    expect(detail.rows[detail.rows.length - 1].label).toBe('solar rating')
    const generated = STRUCTURES_STEP.detail(context, SITE_1)
    expect(generated.rows.filter((row) => row.kind === 'term')).toEqual([])
    expect(generated.rows.filter((row) => isBreak(row))).toEqual([])
    expect(violatedGates(registryProposalFeatures(payload, 'structures')[0])).toEqual([])
    expect(
      registryProposalFeatures(payload, 'structures')[0].properties
    ).not.toHaveProperty('constraints_violated')
  })
})

/* ===========================================================================
   5. PLACED AND GENERATED TABS AT EQUAL RANK
   =========================================================================== */

describe('5. a placed site and a generated candidate sharing a rank read apart', () => {
  it('names the two kinds by what their rank IS', () => {
    const generated = candidate(SITE_2, 2, [-74.0, 40.72])
    const placed = placedSite([-74.0, 40.72], { rank: 2, id: 'p-1' })
    expect(structureSiteName(generated)).toBe('Site 2')
    expect(structureSiteName(placed, 0)).toBe('Placed 1 · would rank 2')
    expect(structureSiteName(placed, 1)).toBe('Placed 2 · would rank 2')
    expect(isPlacedSite(generated)).toBe(false)
    expect(isPlacedSite(placed)).toBe(true)
  })

  it('renders both tabs, same rank, different identity rows, and only the placed one drawn and removable', async () => {
    const { ui } = await generatedStructures({
      score: (point) => ({ body: { feature: placedSite(point, { rank: 2, score: 68.0 }) } }),
    })
    await ui.place(INSIDE)
    const placed = ui.placed[0]
    expect(placed.properties.rank).toBe(2)
    const generated = structureSites(ui.structures).find((f) => f.properties.rank === 2)
    expect(generated.id).toBe(SITE_2)

    // TWO TABS SAYING "2", and the strip tells them apart three ways: the
    // name, the drawn class, and the ×.
    expect(ui.text(`tab-focus-${generated.id}`)).toContain('Site 2')
    expect(ui.text(`tab-focus-${generated.id}`)).not.toContain('Placed')
    expect(ui.text(`tab-focus-${placed.id}`)).toContain('Placed 1 · would rank 2')
    expect(ui.text(`tab-focus-${placed.id}`)).not.toContain('Site 2')
    expect(ui.find(`tab-${generated.id}`).classList.contains('chrome-tab--drawn')).toBe(false)
    expect(ui.find(`tab-${placed.id}`).classList.contains('chrome-tab--drawn')).toBe(true)
    expect(ui.find(`tab-remove-${generated.id}`)).toBeNull()
    expect(ui.find(`tab-remove-${placed.id}`)).not.toBeNull()
    // The generated ranks are never renumbered by a placed site landing.
    expect(structureSites(ui.structures).map((f) => f.properties.rank)).toEqual([1, 2, 3])

    // AND THE PANELS SAY IT IN THEIR HEADERS, which is where the identity
    // lives under the shared format -- the panel takes the TAB'S OWN NAME
    // rather than restating it, so the strip and the panel cannot disagree
    // about which of two sites at rank 2 is being read.
    await ui.focus(placed.id)
    expect(ui.text('detail-name-structures')).toBe('Placed 1 · would rank 2')
    await ui.focus(generated.id)
    expect(ui.text('detail-name-structures')).toBe('Site 2')
    // AND NEITHER CARRIES A `rank` ROW OR AN `origin` ONE. Rank is a
    // comparison against the shortlist and not a measurement of the spot; the
    // header already says which kind of site this is.
    expect(ui.find('detail-value-rank')).toBeNull()
    expect(ui.find('detail-value-origin')).toBeNull()
    await ui.unmount()
  })

  it('[test 2] carries three rows: identity, the road distance, then the score', () => {
    const payload = structuresPayload()
    const placed = placedSite(pointToGeoJSON(INSIDE), { rank: 2, score: 68.0, id: 'p-1' })
    placed.properties.distance_to_road_ft = 12.4
    const tabs = STRUCTURES_STEP.tabs(contextOver(payload, { drawnFeatures: [placed], selectedFeatureIds: [SITE_1, 'p-1'] }))
    expect(tabs.map((t) => t.name)).toEqual(['Site 1', 'Site 2', 'Site 3', 'Placed 1 · would rank 2'])
    // THE MEASUREMENT FIRST, THEN THE SCORE -- the shape every other scored
    // step's strip takes, and the score's denominator is declared here and
    // printed only by the panel.
    for (const tab of tabs) {
      expect(tab.rows.map((r) => r.label)).toEqual(['ft to road', 'score'])
      expect(tab.rows[1].denominator).toBe(100)
      expect(tab.checkbox).toBe(true)
    }
    expect(tabs[0].rows[0].value).toBe('46')
    expect(tabs[0].rows[1].value).toBe('69.0')
    expect(tabs[3].rows).toEqual([
      { value: '12', label: 'ft to road' },
      { value: '68.0', label: 'score', denominator: 100 },
    ])
    expect(tabs[3]).toMatchObject({ drawn: true, removable: true, selected: true })
    expect(tabs[1].selected).toBe(false)
    expect(tabs.slice(0, 3).every((t) => !t.drawn && !t.removable)).toBe(true)
  })
})

/* ===========================================================================
   6. THE CAP OF TWO, REFLECTED
   =========================================================================== */

describe('6. the placed cap of 2 is reflected, and a third attempt is refused', () => {
  it('counts the slots off the payload’s own cap, falling back to the mirrored constant', () => {
    const payload = structuresPayload()
    const one = placedSite(pointToGeoJSON(INSIDE), { id: 'p-1' })
    const two = placedSite(pointToGeoJSON(INSIDE_2), { id: 'p-2' })
    expect(placedCap(payload)).toBe(2)
    expect(placedCap(null)).toBe(MAX_PLACED_SITES)
    expect(placedCap(structuresPayload({ maxPlaced: 1 }))).toBe(1)
    expect(placedSlotsRemaining(contextOver(payload))).toBe(2)
    expect(placedSlotsRemaining(contextOver(payload, { drawnFeatures: [one] }))).toBe(1)
    expect(placedSlotsRemaining(contextOver(payload, { drawnFeatures: [one, two] }))).toBe(0)
    expect(placeSiteBlocked(contextOver(payload, { drawnFeatures: [one] }))).toBeNull()
    expect(placeSiteBlocked(contextOver(payload, { drawnFeatures: [one, two] }))).toBe(
      '2 sites are placed, which is the most this step takes. Remove one to place another.'
    )
    expect(placeSiteBlocked(contextOver(structuresPayload({ maxPlaced: 1 }), { drawnFeatures: [one] }))).toBe(
      '1 site is placed, which is the most this step takes. Remove it to place another.'
    )
  })

  it('disables the button at two, says why, and the tool’s own guard refuses a third', async () => {
    const { ui, calls } = await generatedStructures()
    await ui.place(INSIDE)
    expect(ui.find('place-structures').disabled).toBe(false)
    expect(ui.find('notice-cap-structures')).toBeNull()
    await ui.place(INSIDE_2)
    expect(ui.placed).toHaveLength(2)
    const button = ui.find('place-structures')
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('title')).toBe(
      '2 sites are placed, which is the most this step takes. Remove one to place another.'
    )
    expect(ui.find('notice-cap-structures').textContent).toContain('2 sites are placed')
    expect(ui.find('notice-cap-structures').querySelector('.measure').textContent).toBe('2')

    // A THIRD ATTEMPT THROUGH THE GESTURE ITSELF -- the button is disabled,
    // so it is armed through the register directly -- is refused by the
    // placement's own reading before any request, and nothing is placed. The
    // reading is the PAYLOAD's cap, the same one the button read.
    const scored = calls.filter((c) => c.path.endsWith('/score')).length
    await ui.run((_, cursor) => cursor.arm('draw'))
    await ui.clickMap(INSIDE_3)
    await ui.waitFor('the refusal', () => ui.find('structures-notice') !== null, 5000)
    expect(ui.placed).toHaveLength(2)
    expect(ui.text('structures-notice')).toBe(
      '2 sites are already placed, which is the most this step takes. Remove one to place another.'
    )
    expect(calls.filter((c) => c.path.endsWith('/score'))).toHaveLength(scored)
    await ui.unmount()
  })

  it('does not own the cap: the SERVER refuses a third at commit, per feature, and the reason reaches the bar', async () => {
    const three = [INSIDE, INSIDE_2, INSIDE_3].map((p, i) => placedSite(pointToGeoJSON(p), { id: `p-${i + 1}` }))
    const rejection = {
      status: 422,
      body: {
        error: 'This structures commit could not be saved.',
        rejections: [
          {
            code: 'too_many_user_added_features',
            feature_id: null,
            reason: 'This step takes at most 2 user-added feature(s); 3 were committed (p-1, p-2, p-3).',
          },
        ],
      },
    }
    const { ui } = await generatedStructures()
    installFetch([route('POST', /\/steps\/structures\/commit$/, rejection)])
    for (const site of three) await ui.run((a) => a.addDrawnFeature('structures', site))
    expect(ui.placed).toHaveLength(3)
    await ui.click('commit-structures')
    await ui.waitFor('the 422', () => ui.state.steps.structures?.error?.kind === 'rejected', 5000)
    expect(selectStepStatus(ui.state, 'structures')).toBe(GENERATED)
    expect(ui.state.steps.structures.error.rejections[0].code).toBe('too_many_user_added_features')
    await ui.unmount()
  })
})

/* ===========================================================================
   7. THE × ON PLACED TABS ONLY; DESTROYING ONE FREES A SLOT
   =========================================================================== */

describe('7. × on placed tabs only, and destroying one frees a slot', () => {
  it('declares removable on the placed tabs and on nothing generated; there is no server verb behind it', () => {
    const payload = structuresPayload()
    const placed = placedSite(pointToGeoJSON(INSIDE), { id: 'p-1' })
    const tabs = STRUCTURES_STEP.tabs(contextOver(payload, { drawnFeatures: [placed] }))
    expect(tabs.map((t) => Boolean(t.removable))).toEqual([false, false, false, true])
    expect(STRUCTURES_STEP.removeTab).toBeNull()
  })

  it('destroys the site, frees the slot, offers an undo, and takes the focus with it', async () => {
    const { ui } = await generatedStructures()
    await ui.place(INSIDE)
    await ui.place(INSIDE_2)
    const [first, second] = ui.placed
    expect(ui.find('place-structures').disabled).toBe(true)
    // Five tabs overflow a collapsed row; the placed ones are the last two.
    if (ui.find('tabs-more-structures')) await ui.click('tabs-more-structures')
    for (const feature of structureSites(ui.structures)) expect(ui.find(`tab-remove-${feature.id}`)).toBeNull()
    expect(ui.find(`tab-remove-${first.id}`).getAttribute('aria-label')).toBe(`Delete ${structureSiteName(first, 0)}`)

    await ui.focus(second.id)
    expect(ui.find('detail-structures')).not.toBeNull()
    await ui.click(`tab-remove-${second.id}`)
    expect(ui.placed.map((f) => f.id)).toEqual([first.id])
    expect(ui.find(`tab-${second.id}`)).toBeNull()
    expect(ui.cursor.focusedFeatureId).toBeNull()
    expect(ui.find('detail-structures')).toBeNull()
    expect(selectDraft(ui.state, 'structures').selectedFeatureIds).not.toContain(second.id)
    // THE SLOT IS FREE AGAIN.
    expect(ui.find('place-structures').disabled).toBe(false)
    expect(ui.find('notice-cap-structures')).toBeNull()
    expect(ui.all('.leaflet-structures--structures-placed-pane .site-pin--placed')).toHaveLength(1)
    // And the way back, for a few seconds.
    expect(ui.find('undo-structures')).not.toBeNull()
    await ui.click('undo-action-structures')
    expect(ui.placed.map((f) => f.id)).toEqual([first.id, second.id])
    expect(ui.find('place-structures').disabled).toBe(true)
    await ui.unmount()
  })

  it('is destroyed by the delete tool on the map as well, and the same spot can be placed again', async () => {
    const { ui } = await generatedStructures()
    await ui.place(INSIDE)
    const site = ui.placed[0]
    // THE SAME SPOT TWICE IS THE SAME SITE, and is refused rather than doubled.
    await ui.place(INSIDE)
    expect(ui.placed).toHaveLength(1)
    expect(ui.text('structures-notice')).toBe('A site is already placed at that spot.')
    // Remove it through the store's own delete (the map's armed delete
    // gesture ends in this call), and place it again.
    await ui.run((a) => a.removeDrawnFeature('structures', site.id))
    expect(ui.placed).toHaveLength(0)
    await ui.place(INSIDE)
    expect(ui.placed).toHaveLength(1)
    expect(ui.placed[0].id).toBe(site.id)
    await ui.unmount()
  })
})

/* ===========================================================================
   8. COMMITTING SEVERAL, AND COMMITTING NONE
   =========================================================================== */

describe('8. committing several sites succeeds; committing none succeeds', () => {
  it('names the empty commit and never blocks it', () => {
    expect(STRUCTURES_STEP.commit.label({ committableCount: 0 })).toBe('Commit no structure sites')
    expect(STRUCTURES_STEP.commit.label({ committableCount: 3 })).toBe('Commit structure sites')
    expect(STRUCTURES_STEP.commit.canCommit({ committableCount: 0 })).toBe(true)
    expect(STRUCTURES_STEP.commit.blockedReason({ committableCount: 0 })).toBeNull()
  })

  it('sends the generated as generated and the placed as user_added, the Points verbatim', async () => {
    const { ui } = await generatedStructures()
    await ui.place(INSIDE)
    await ui.place(INSIDE_2)
    await ui.click(`tab-check-${SITE_3}`)
    const body = buildCommitBody(ui.state, 'structures', registryProposalFeatures)
    expect(body.features.features.map((f) => f.id)).toEqual([SITE_1, SITE_2, ...ui.placed.map((f) => f.id)])
    expect(body.provenance).toEqual({
      [SITE_1]: PROVENANCE_GENERATED,
      [SITE_2]: PROVENANCE_GENERATED,
      [ui.placed[0].id]: PROVENANCE_USER_ADDED,
      [ui.placed[1].id]: PROVENANCE_USER_ADDED,
    })
    for (const placed of ui.placed) {
      const sent = body.features.features.find((f) => f.id === placed.id)
      expect(sent).toBe(placed)
      expect(sent.geometry.type).toBe('Point')
    }
    expect(body.inputs).toBeUndefined()

    // NONE: every box off, the label renames, the body is empty and legal.
    for (const id of [SITE_1, SITE_2, ...ui.placed.map((f) => f.id)]) {
      if (ui.find('tabs-more-structures')) await ui.click('tabs-more-structures')
      await ui.click(`tab-check-${id}`)
    }
    expect(ui.text('commit-structures')).toBe('Commit no structure sites')
    expect(ui.find('commit-structures').disabled).toBe(false)
    const none = buildCommitBody(ui.state, 'structures', registryProposalFeatures)
    expect(none.features.features).toEqual([])
    expect(none.provenance).toEqual({})
    await ui.unmount()
  })

  it('seeds a reopened step from the document: the placed sites come home as placed sites, scored', async () => {
    const placed = placedSite(pointToGeoJSON(INSIDE), { id: 'p-home', score: 61.5, rank: 4, area: 0.084 })
    const generated = candidate(SITE_1, 1, [-74.012, 40.7215])
    const { ui } = await generatedStructures({
      structures: {
        status: GENERATED,
        revision: 2,
        features: { type: 'FeatureCollection', features: [generated, placed] },
        provenance: { [SITE_1]: 'generated', 'p-home': 'user_added' },
      },
    })
    expect(ui.placed).toHaveLength(1)
    expect(ui.placed[0]).toEqual(placed)
    expect(selectDraft(ui.state, 'structures').selectedFeatureIds.sort()).toEqual([SITE_1, 'p-home'].sort())
    // WHAT THE PANEL SHOWS IS THE FEATURE'S OWN STORED PROPERTIES -- what it
    // was scored with -- and nothing re-derived from the point. The clipped
    // pad it was scored over rides the feature and is not a panel row.
    expect(ui.placed[0].properties.footprint_area_acres).toBe(0.084)
    await ui.focus('p-home')
    expect(ui.text('detail-name-structures')).toBe('Placed 1 · would rank 4')
    expect(ui.text('detail-value-/100 score')).toBe('61.5')
    expect(ui.text('detail-value-solar rating')).toBe('excellent')
    expect(ui.all('.leaflet-structures--structures-placed-pane .site-pin--placed')).toHaveLength(1)
    await ui.unmount()
  })

  it('says what a reset costs, in its own terms', () => {
    const state = (steps) => ({ steps, drafts: {}, stepOrder: STEP_ORDER })
    expect(STRUCTURES_STEP.resetNote(state({ structures: { status: COMMITTED, features: { type: 'FeatureCollection', features: [] }, provenance: {} } }))).toBe(
      'the decision to site no structure on this parcel'
    )
    const two = state({
      structures: {
        status: COMMITTED,
        features: { type: 'FeatureCollection', features: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
        provenance: { a: 'generated', b: 'user_added', c: 'user_added' },
      },
    })
    expect(STRUCTURES_STEP.resetNote(two).map((p) => p.measure ?? p).join('')).toBe(
      '3 committed structure sites, 2 of them placed by hand'
    )
  })
})

/* ===========================================================================
   9. road_proximity_source RENDERS ITS CONSEQUENCE FOR ALL THREE VALUES
   =========================================================================== */

describe('9. road_proximity_source renders its consequence for all three values', () => {
  it('[test 8] reads the tier off the promoted key, then the run flags, then the gates', () => {
    expect(ROAD_PROXIMITY_SOURCES).toEqual(['selected_road_corridor', 'real_mapped_road', 'unavailable'])
    for (const source of ROAD_PROXIMITY_SOURCES) {
      expect(roadProximitySource(structuresPayload({ source }))).toBe(source)
      // THE PROMOTED STEP-LEVEL KEY, which is where the backend put it when
      // ft-to-road became the tab's headline figure.
      expect(roadProximitySource({ summary: { road_proximity_source: source } })).toBe(source)
      // And the two places it also still rides, either of which answers alone.
      expect(roadProximitySource({ summary: { run_flags: { road_proximity_source: source } } })).toBe(source)
      expect(roadProximitySource({ summary: { gates: { road_proximity_source: source } } })).toBe(source)
      // THREE SENTENCES, ONE PER VALUE, each saying what follows for the user.
      const consequence = ROAD_PROXIMITY_CONSEQUENCE[source]
      expect(consequence.text.length).toBeGreaterThan(40)
      expect(['advisory', 'caution']).toContain(consequence.tone)
    }
    expect(Object.keys(ROAD_PROXIMITY_CONSEQUENCE).sort()).toEqual([...ROAD_PROXIMITY_SOURCES].sort())
    expect(roadProximitySource(null)).toBeNull()
    expect(roadProximitySource({ summary: {} })).toBeNull()
    expect(roadProximitySource({ summary: { run_flags: { road_proximity_source: 'something_else' } } })).toBeNull()
  })

  for (const source of ROAD_PROXIMITY_SOURCES) {
    it(`renders the consequence of ${source} in the bar, the tab and the panel`, async () => {
      const { ui } = await generatedStructures({
        payload: structuresPayload({ source }),
        score: (point) => {
          const site = placedSite(point)
          site.properties.road_proximity_source = source
          if (source === 'unavailable') site.properties.distance_to_road_ft = null
          return { body: { feature: site } }
        },
      })
      const expected = ROAD_PROXIMITY_CONSEQUENCE[source]
      const notice = ui.find(`notice-road-${source}-structures`)
      expect(notice, `${source} says its consequence`).not.toBeNull()
      expect(notice.textContent).toBe(expected.text)
      expect(noticeRow(notice).className).toContain(`chrome-bar__notice--${expected.tone}`)
      for (const other of ROAD_PROXIMITY_SOURCES.filter((s) => s !== source)) {
        expect(ui.find(`notice-road-${other}-structures`)).toBeNull()
      }

      await ui.place(INSIDE)
      const site = ui.placed[0]
      const tab = ui.find(`tab-focus-${site.id}`)
      const labels = [...tab.querySelectorAll('.chrome-tab__label')].map((n) => n.textContent)
      const values = [...tab.querySelectorAll('.chrome-tab__value')].map((n) => n.textContent)
      await ui.focus(site.id)
      if (source === 'selected_road_corridor') {
        expect(expected.tone).toBe('advisory')
        expect(labels).toEqual(['ft to road', 'score'])
        expect(values[0]).toBe('46')
        expect(notice.textContent).toContain('the road you committed')
        expect(notice.textContent).toContain('not a road that has been built yet')
      } else if (source === 'real_mapped_road') {
        expect(expected.tone).toBe('caution')
        expect(notice.textContent).toContain('No road was committed')
        expect(notice.textContent).toContain('farm roads already mapped')
        expect(labels).toEqual(['ft to farm road', 'score'])
        expect(values[0]).toBe('46')
      } else {
        expect(expected.tone).toBe('caution')
        expect(notice.textContent).toContain('switched off')
        expect(notice.textContent).toContain('reads as unmeasured')
        expect(labels).toEqual(['ft to road', 'score'])
        // NULL IS AN EM DASH AND NEVER A ZERO.
        expect(values[0]).toBe('—')
        expect(ui.text('detail-value-ft to road')).toBe('—')
      }
      // THE TIER IS SAID ONCE, AT STEP LEVEL, AND NEVER IN THE PANEL: it is
      // true of every candidate in the run, and a row repeating it down every
      // panel is the same sentence as many times as there are sites.
      expect(ui.find('detail-value-road measured to')).toBeNull()
      await ui.unmount()
    })
  }

  it('says the other two run-level caveats too: the tree-zone check, and shading as a proxy', () => {
    const notices = STRUCTURES_STEP.notices(contextOver(structuresPayload({ treeZones: false })))
    expect(notices.find((n) => n.key === 'unchecked-tree-zones')).toMatchObject({ tone: 'caution' })
    expect(STRUCTURES_STEP.notices(contextOver(structuresPayload())).find((n) => n.key === 'unchecked-tree-zones')).toBeUndefined()
    const shading = STRUCTURES_STEP.notices(contextOver(structuresPayload())).find((n) => n.key === 'shading-proxy')
    expect(shading.tone).toBe('advisory')
    expect(shading.text.map((p) => p.measure ?? p).join('')).toContain('25% of every score')
    // The prime-farmland flag is said once, at step level, as a parcel fact.
    expect(STRUCTURES_STEP.notices(contextOver(structuresPayload({ prime: true }))).find((n) => n.key === 'prime-farmland').text).toContain('somewhere on this parcel')
    expect(STRUCTURES_STEP.notices(contextOver(structuresPayload())).find((n) => n.key === 'prime-farmland')).toBeUndefined()
  })
})

/* ===========================================================================
   10. NO CAUTION MARKERS ON THIS STEP
   =========================================================================== */

describe('10. no caution markers render on this step', () => {
  it('declares no reference layer, no shape, and no cautions on either kind', () => {
    expect(STRUCTURES_STEP.layers.filter((l) => l.kind === 'reference')).toEqual([])
    expect(STRUCTURES_STEP.layers.filter((l) => l.kind === 'highlight')).toEqual([])
    expect(STRUCTURES_STEP.shape).toBeNull()
    const payload = structuresPayload()
    const placed = placedSite(pointToGeoJSON(INSIDE), { id: 'p-1', violated: ['outside_existing_canopy'] })
    const context = contextOver(payload, { drawnFeatures: [placed] })
    expect(STRUCTURES_STEP.detail(context, SITE_1).cautions).toEqual([])
    expect(STRUCTURES_STEP.detail(context, 'p-1').cautions).toEqual([])
    // The definition's source builds no caution path: no cautionsFor, no
    // clampToBoundary, no crossing ground.
    const source = readFileSync(path.join(SRC, 'wizard', 'stepDefinitions.js'), 'utf8')
    const section = source
      // ...and closes where the NEXT section opens: fencing follows it now.
      .slice(source.indexOf('   THE STRUCTURES STEP\n'), source.indexOf('   THE FENCING STEP\n'))
      // The slice opens inside the section's own header comment.
      .replace(/^[\s\S]*?\*\//, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(section.length).toBeGreaterThan(1000)
    expect(section).not.toMatch(/cautionsFor|clampToBoundary|crossing_grounds|exclusion_crossings/)
    // The only `cautions` this section writes is the empty list, twice.
    expect(section.match(/cautions:\s*\[\]/g)).toHaveLength(1)
    expect(section.match(/cautions/g)).toHaveLength(1)
  })

  it('draws no caution marker for a placed site that breaks a rule, nor for anything else', async () => {
    const { ui } = await generatedStructures({
      score: (point) => ({ body: { feature: placedSite(point, { violated: ['outside_existing_canopy', 'outside_water_candidate_zone'] }) } }),
    })
    await ui.place(INSIDE)
    await ui.focus(ui.placed[0].id)
    expect(ui.all('.caution-marker')).toHaveLength(0)
    expect(ui.all('.leaflet-map-cautions-pane')).toHaveLength(0)
    expect(ui.find('detail-cautions-structures')).toBeNull()
    expect(ui.placed[0].properties).not.toHaveProperty('cautions')
    // The scrim IS there, on this step as on every step.
    expect(ui.all('.stack-layer--kind-scrim path')).toHaveLength(1)
    await ui.unmount()
  })
})

/* ===========================================================================
   11. THE PANEL THROUGH THE SHARED FORMAT -- the sixth and last migration
   =========================================================================== */

describe('11. the panel renders through the shared format', () => {
  it('[test 1] declares rows, in declared order, with one break and no label', () => {
    const detail = STRUCTURES_STEP.detail(contextOver(structuresPayload()), SITE_1)
    // THE SHARED FORMAT, not groups and not fields. With this there is no
    // step-specific panel rendering left anywhere in the build.
    expect(detail.groups).toBeUndefined()
    expect(detail.fields).toBeUndefined()
    expect(Array.isArray(detail.rows)).toBe(true)

    const body = bodyFor(structuresPayload())
    // ONE FLAT LIST WITH ONE BREAK IN IT, in the order the panel draws it.
    expect(body.map((row) => (row.panelBreak ? `--- ${row.label ?? ''}` : `${row.value} | ${row.label ?? ''}`))).toEqual([
      '46 | ft to road',
      '69.0 | /100 score',
      '--- ',
      'northeast facing | aspect',
      'upper field | position',
      '5.2 | avg slope %',
      'excellent | solar rating',
    ])

    // ONE BREAK, AND IT IS THE FORMAT'S OWN -- drawn between the tab's rows
    // and the step's without being asked. This step declares none.
    const breaks = body.filter((row) => isBreak(row))
    expect(breaks).toHaveLength(1)
    expect(breakLabel(breaks[0])).toBeNull()
    expect(STRUCTURES_STEP.detail(contextOver(structuresPayload()), SITE_1).rows.filter(isBreak)).toEqual([])

    // NO HEADING, WHICH IS THE DEFAULT. Trees earned the one label in the
    // build because three bare terms say nothing about what they are; every
    // row here labels itself, and a heading over them would say what the
    // reader can already see.
    expect(body.every((row) => breakLabel(row) == null)).toBe(true)

    // THE TWO FACES, and the categoricals are not in the number track.
    const kinds = body.filter((row) => !isBreak(row)).map((row) => row.kind)
    expect(kinds).toEqual(['measured', 'measured', 'categorical', 'categorical', 'measured', 'categorical'])
  })

  it('[test 2] the tab says "score" and "ft to road"; the panel adds "/100"', () => {
    const context = contextOver(structuresPayload())
    const tab = STRUCTURES_STEP.tabs(context).find((entry) => entry.id === SITE_1)

    // TWO MEASURED ROWS, the measurement first and the score second -- the
    // shape every other scored step's strip takes.
    expect(tab.rows.map((row) => row.label)).toEqual(['ft to road', 'score'])
    expect(tab.rows.map((row) => row.value)).toEqual(['46', '69.0'])

    // THE STRIP'S LABEL IS THE BARE WORD; the denominator is declared beside
    // it and rendered only by the panel -- one declaration, two renderings.
    const scoreRow = tab.rows[1]
    expect(scoreRow.denominator).toBe(100)
    expect(denominated(scoreRow.label, scoreRow.denominator)).toBe('/100 score')
    expect(bodyFor(structuresPayload()).find((row) => row.value === '69.0').label).toBe('/100 score')
    // AND ft to road CARRIES NONE: feet are not out of anything.
    expect(tab.rows[0].denominator).toBeUndefined()
    expect(bodyFor(structuresPayload()).find((row) => row.value === '46').label).toBe('ft to road')

    // THE 100 IS THE PAYLOAD'S, IN LANDFORM'S OWN SPELLING (`scales.range[1]`)
    // AT A DIFFERENT DEPTH -- `summary.scales`, because
    // build_structures_payload forwards the narrative whole under `summary`
    // and the scales block rides the narrative. THE FIFTH SHAPE, and
    // scoreDenominator() learned nothing: the carrier has been an argument
    // since roads, whose block rides each network.
    const payload = structuresPayload()
    expect(payload.summary.scales.range[1]).toBe(100)
    expect(payload.scales).toBeUndefined()

    // AND A PAYLOAD WITHOUT ONE PRINTS NOTHING IT CANNOT BACK.
    const unscaled = structuresPayload()
    delete unscaled.summary.scales
    const bare = STRUCTURES_STEP.tabs(contextOver(unscaled)).find((e) => e.id === SITE_1).rows[1]
    expect(bare.denominator).toBeUndefined()
    expect(denominated(bare.label, bare.denominator)).toBe('score')
  })

  /**
   * [test 4] THE SOLAR RATING IS A CATEGORICAL, RENDERED AND NEVER DERIVED.
   *
   * The bands are on the wire (summary.scales.solar_rating.bands) with their
   * cuts and their bound convention; the panel prints the word the backend
   * banded. A frontend holding the cuts is a second copy of a calibration the
   * backend's own comment calls unvalidated starting values.
   */
  it('[test 4] renders the backend’s solar rating word, and holds no threshold', () => {
    const payload = structuresPayload()
    // THREE SITES, THREE WORDS: a panel rendering a constant would pass one
    // of these and fail the other two.
    expect(bodyFor(payload, SITE_1).find((row) => row.label === 'solar rating').value).toBe('excellent')
    expect(bodyFor(payload, SITE_2).find((row) => row.label === 'solar rating').value).toBe('great')
    expect(bodyFor(payload, SITE_3).find((row) => row.label === 'solar rating').value).toBe('good')

    // A CATEGORICAL, not a figure: it takes the value position and stays out
    // of the number track.
    expect(bodyFor(payload, SITE_1).find((row) => row.label === 'solar rating').kind).toBe('categorical')

    // NULL IS AN EM DASH, AND IS NEVER RECOMPUTED from the value the wire
    // still carries beside the word.
    const missing = structuresPayload()
    missing.structure_sites.features[0].properties.solar_rating = null
    expect(missing.structure_sites.features[0].properties.solar_value).toBe(91.5)
    expect(bodyFor(missing, SITE_1).find((row) => row.label === 'solar rating').value).toBe('—')

    // AND A WORD THIS SIDE HAS NEVER HEARD OF IS RENDERED AS SENT, which is
    // what "no threshold here" means when the bands are next tuned.
    const retuned = structuresPayload()
    retuned.structure_sites.features[0].properties.solar_rating = 'outstanding'
    expect(bodyFor(retuned, SITE_1).find((row) => row.label === 'solar rating').value).toBe('outstanding')

    // `solar_value` IS ON THE WIRE AND NOT IN THE PANEL. The distribution is
    // tight WITHIN a parcel and wide BETWEEN parcels, so the word separates
    // parcels honestly while the number carries the detail -- production's
    // own argument for shipping the elevation percentile beside its word.
    const labels = bodyFor(payload, SITE_1).map((row) => row.label ?? '')
    expect(labels).not.toContain('solar value')
    expect(bodyFor(payload, SITE_1).map((row) => row.value)).not.toContain('91.5')

    // NO BAND NAME AND NO CUT IS WRITTEN IN THIS APP. Every client module is
    // read, COMMENTS STRIPPED, for the four words: what would break the panel
    // is a band name in CODE -- a literal to compare against, a lookup keyed
    // by one, a default -- and the panel's words reach it only as data off
    // the payload. (scoreBandName()'s own note names one of them in prose to
    // explain the rule it obeys, which is the opposite of holding it.)
    const files = [
      'wizard/stepDefinitions.js',
      'wizard/shell/DetailPanel.jsx',
      'wizard/shell/panelFormat.js',
      'wizard/shell/TabStrip.jsx',
      'wizard/stepCatalog.jsx',
      'session/SessionStore.jsx',
      'App.css',
      'index.css',
    ]
    for (const file of files) {
      const code = readFileSync(path.join(SRC, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      for (const band of ['fair', 'good', 'great', 'excellent']) {
        expect(code, `${file} spells no band name`).not.toMatch(
          new RegExp(`['"\`]${band}['"\`]`, 'i')
        )
      }
    }
    // AND NOT THE CUTS -- 60, 78, 90 -- anywhere in the structures section,
    // comment included: a cut in a comment is a copy that goes stale too.
    const source = readFileSync(path.join(SRC, 'wizard', 'stepDefinitions.js'), 'utf8')
    const section = source.slice(source.indexOf('   THE STRUCTURES STEP\n'), source.indexOf('   THE FENCING STEP\n'))
    for (const cut of ['60', '78', '90']) {
      expect(section.match(new RegExp(`\\b${cut}(\\.0)?\\b`, 'g')) ?? [], `no ${cut} cut`).toEqual([])
    }
    // AND THE CODE READS NEITHER the band constant nor the figure the word
    // bands. The comment above the rows NAMES `solar_value`, to say why it is
    // not shown; naming a field in order to explain its absence is the
    // opposite of reading it.
    const structuresCode = section.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(structuresCode).not.toMatch(/SOLAR_RATING_BANDS|solar_value|\.bands\b/)
    expect(structuresCode).toContain('p.solar_rating ?? EM_DASH')
    // The band block IS on the wire, which is what makes the absence a
    // reading rather than a gap.
    expect(Object.keys(payload.summary.scales.solar_rating.bands)).toEqual(['fair', 'good', 'great', 'excellent'])
  })

  /**
   * THE ASPECT ROW IS LANDFORM'S ROW, THROUGH LANDFORM'S FUNCTION.
   *
   * It rendered as ONE LETTER before this: the row read `p.aspect`, which is
   * the wire's 16-point ABBREVIATION ("S", "NNW"), and the panel sets every
   * line below its header in lower case -- so a south-facing site's aspect
   * said "s". The backend ships the 8-point whole word beside it now, under
   * production's own two field names, and this side reads the pair it already
   * knew how to read.
   */
  it('[test 4] says "northeast facing", not the abbreviation, off one function with landform', () => {
    const payload = structuresPayload()
    const aspect = bodyFor(payload, SITE_1).find((row) => row.label === 'aspect')

    expect(aspect.value).toBe('northeast facing')
    expect(aspect.kind).toBe('categorical')
    // NOT THE ABBREVIATION, in any casing -- which is the whole defect.
    expect(aspect.value).not.toBe('NE')
    expect(aspect.value).not.toBe('ne')
    // A PHRASE, NOT A COMPOUND: "northeast-facing" is an adjective waiting
    // for a noun it never gets.
    expect(aspect.value).not.toMatch(/-facing/)

    // ONE FUNCTION, TWO PANELS. The structures row IS aspectPhrase(), the
    // same call landform's panel makes, so the two steps cannot come to say
    // this field differently.
    const p = registryProposalFeatures(payload, 'structures')[0].properties
    expect(aspectPhrase(p)).toBe(aspect.value)
    expect(aspectPhrase({ dominant_aspect: 'south', aspect_available: true })).toBe('south facing')
    const source = readFileSync(path.join(SRC, 'wizard', 'stepDefinitions.js'), 'utf8')
    const section = source.slice(source.indexOf('   THE STRUCTURES STEP\n'), source.indexOf('   THE FENCING STEP\n'))
    expect(section).toContain("categoricalRow(aspectPhrase(p), 'aspect')")

    // PRODUCTION'S 8-POINT VOCABULARY, NOT THE WIRE'S 16-POINT ONE. This is
    // the reason the word ships from the backend rather than being expanded
    // here: a client-side table would say "north-northwest facing" one panel
    // along from production's "north facing" about the same kind of fact.
    // NO COMPASS TABLE EXISTS ON THIS SIDE -- the finer points are not
    // spelled anywhere in the app.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const finer of ['north-northwest', 'east-southeast', 'south-southeast', 'west-northwest']) {
      expect(code, `no ${finer} anywhere on this side`).not.toContain(finer)
    }
    for (const abbreviation of ['NNW', 'ESE', 'SSE', 'WNW', 'NNE', 'SSW', 'WSW', 'ENE']) {
      expect(code, `no ${abbreviation} table on this side`).not.toMatch(
        new RegExp(`['"\`]${abbreviation}['"\`]`)
      )
    }

    // GROUND THAT FACES NOWHERE GETS AN EM DASH, never a fabricated
    // direction: `aspect_available` false is the backend saying there is no
    // well-defined downhill direction here, and a word invented for it would
    // be a fact about the land nobody established.
    const flat = structuresPayload()
    Object.assign(flat.structure_sites.features[0].properties, {
      dominant_aspect: null,
      aspect_available: false,
      aspect: 'flat',
      aspect_degrees: null,
    })
    expect(bodyFor(flat, SITE_1).find((row) => row.label === 'aspect').value).toBe('—')
    // AND THE DEGREES ARE NOT BANDED INTO ONE either, when the wire still
    // carries them and the flag says no.
    const unflagged = structuresPayload()
    Object.assign(unflagged.structure_sites.features[0].properties, {
      dominant_aspect: null,
      aspect_available: false,
      aspect_degrees: 181.0,
    })
    expect(bodyFor(unflagged, SITE_1).find((row) => row.label === 'aspect').value).toBe('—')
  })

  it('[tests 5, 6] the caution run is last, only when non-empty, and a generated candidate has none', () => {
    const payload = structuresPayload()
    const breaking = placedSite(pointToGeoJSON(INSIDE), {
      id: 'p-breaks',
      score: 59.2,
      violated: ['outside_hydric_soil', 'within_road_proximity_buffer'],
    })
    const clean = placedSite(pointToGeoJSON(INSIDE_2), { id: 'p-clean', score: 66.6 })
    const draft = { drawnFeatures: [breaking, clean], selectedFeatureIds: ['p-breaks', 'p-clean'] }

    // LAST: the run sits under everything the panel says about the ground.
    const body = bodyFor(payload, 'p-breaks', draft)
    expect(body.map((row) => (row.panelBreak ? `--- ${row.label ?? ''}` : `${row.value} | ${row.label ?? ''}`))).toEqual([
      '46 | ft to road',
      '59.2 | /100 score',
      '--- ',
      'northeast facing | aspect',
      'upper field | position',
      '5.2 | avg slope %',
      'excellent | solar rating',
      '--- siting rules broken',
      'sits on wet (hydric) soil, which drains badly | ',
      'is farther from a road than the siting rule allows | ',
    ])
    // TERMS, not value-and-label pairs: a broken rule is a name on a list and
    // the heading over it is what says what the list is.
    const terms = body.filter((row) => row.kind === 'term')
    expect(terms).toHaveLength(2)
    for (const term of terms) expect(term).not.toHaveProperty('label')
    expect(body[body.length - 1]).toBe(terms[1])

    // [test 6] A CLEAN PLACED SITE AND A GENERATED CANDIDATE BOTH RENDER
    // NOTHING -- no heading, no second rule, and the panel ends at the solar
    // rating. Two different reasons, one rendering: the placed one's
    // `constraints_violated` is [], and the generated one never carries the
    // key, because the gates are hard for it.
    for (const id of ['p-clean', SITE_1]) {
      const rows = bodyFor(payload, id, draft)
      expect(rows.filter((row) => isBreak(row))).toHaveLength(1)
      expect(rows.some((row) => breakLabel(row) != null)).toBe(false)
      expect(rows.some((row) => row.kind === 'term')).toBe(false)
      expect(rows[rows.length - 1].label).toBe('solar rating')
    }

    // THE ROWS COME OFF ONE FUNCTION, and it answers nothing for an empty or
    // absent list -- the singular heading when there is exactly one.
    expect(violatedRuleRows([])).toEqual([])
    expect(violatedRuleRows(null)).toEqual([])
    expect(violatedRuleRows(undefined)).toEqual([])
    expect(breakLabel(violatedRuleRows(['outside_floodplain'])[0])).toBe('siting rule broken')
    expect(breakLabel(violatedRuleRows(['outside_floodplain', 'outside_hydric_soil'])[0])).toBe('siting rules broken')
    // "RULE(S)" IS A FORM FIELD, never a heading.
    for (const row of violatedRuleRows(['outside_floodplain'])) {
      expect(String(breakLabel(row) ?? '')).not.toMatch(/\(s\)/i)
    }
  })

  it('[tests 1, 5] and the panel in the DOM is that body, with the rules under the second rule', async () => {
    const { ui } = await generatedStructures()
    await ui.focus(SITE_1)

    expect(ui.text('detail-name-structures')).toBe('Site 1')
    const rows = ui.find('detail-rows-structures')
    expect(rows).not.toBeNull()
    // ONE GRID FOR THE WHOLE BODY -- the tab's rows and the step's together,
    // which is what holds one decimal point down the panel.
    expect(ui.text('detail-value-ft to road')).toBe('46')
    expect(ui.text('detail-value-/100 score')).toBe('69.0')
    // THE WHOLE WORD AND "facing", NEVER THE ABBREVIATION. `aspect` on the
    // wire is "NE"; a panel that printed it showed "ne", and on a due-south
    // site a single letter, because every line below the header is set in
    // lower case. This is landform's row through landform's own function.
    expect(ui.text('detail-value-aspect')).toBe('northeast facing')
    expect(ui.text('detail-value-position')).toBe('upper field')
    expect(ui.text('detail-value-avg slope %')).toBe('5.2')
    expect(ui.text('detail-value-solar rating')).toBe('excellent')
    // ONE RULE AND NO HEADING on a site that breaks nothing.
    expect([...rows.children].filter((node) => node.tagName === 'HR')).toHaveLength(1)
    expect(ui.find('detail-heading-structures')).toBeNull()
    // AND THE OLD GROUP CONTAINERS ARE GONE FROM THE DOM WITH IT.
    expect(ui.find('detail-fields-structures')).toBeNull()
    expect(ui.find('detail-fields-ground')).toBeNull()
    expect(ui.find('detail-fields-distances')).toBeNull()
    await ui.unmount()
  })

  it('[test 5] renders both drainage gates in the DOM, told apart', async () => {
    const { ui } = await generatedStructures({
      score: (point) => ({
        body: {
          feature: placedSite(point, {
            score: 51.3,
            violated: ['outside_hydric_soil', 'outside_floodplain'],
          }),
        },
      }),
    })
    await ui.place(INSIDE)
    const site = ui.placed[0]
    await ui.focus(site.id)

    const heading = ui.find('detail-heading-structures')
    expect(heading.tagName).toBe('H4')
    expect(heading.textContent).toBe('siting rules broken')
    const rows = ui.find('detail-rows-structures')
    const children = [...rows.children]
    const hrs = children.filter((node) => node.tagName === 'HR')
    expect(hrs).toHaveLength(2)
    expect(children.indexOf(heading)).toBe(children.indexOf(hrs[1]) + 1)

    // THE TWO GROUNDS, DISTINGUISHABLE, each in its own term.
    const terms = [...rows.querySelectorAll('[data-row="term"]')].map((node) => node.textContent)
    expect(terms).toHaveLength(2)
    expect(terms[0]).toContain('wet (hydric) soil')
    expect(terms[1]).toContain('floodplain')
    expect(terms[0]).not.toBe(terms[1])
    // NOT A CROSSING AND NOT A CAUTION LIST: this step records no crossings,
    // so the panel's own caution list stays empty and no marker is drawn.
    expect(ui.find('detail-cautions-structures')).toBeNull()
    expect(ui.all('.caution-marker')).toHaveLength(0)
    await ui.unmount()
  })
})

/* ===========================================================================
   12. THE SCHEMA
   =========================================================================== */

describe('12. what the definition declares, and the sweep', () => {
  it('is registered fifth, landform-shaped with a placement instead of a shape', () => {
    expect(STEP_DEFINITIONS.map((d) => d.id)).toEqual(['boundary', 'landform', 'water', 'roads', 'trees', 'structures', 'fencing'])
    expect(STRUCTURES_STEP.selection).toEqual({ mode: 'multiple', follows: null })
    expect(STRUCTURES_STEP.accumulate).toBeNull()
    expect(STRUCTURES_STEP.inputs).toEqual([])
    expect(STRUCTURES_STEP.groupOf).toBeNull()
    expect(STRUCTURES_STEP.proposalCollection).toBe('structure_sites')
    expect(STRUCTURES_STEP.generate.label).toBe('Generate structure sites')
    expect(STRUCTURES_STEP.generate.params({ inputs: {} })).toBeNull()
    expect(STRUCTURES_STEP.reopen).toEqual({ label: 'Edit this step', confirmTitle: 'Reopen structures?' })
    expect(Object.keys(STRUCTURES_STEP.instructions).sort()).toEqual([...MACHINE_STATES].sort())
    expect(Object.keys(STRUCTURES_STEP.buttons).sort()).toEqual([...MACHINE_STATES].sort())
    expect(registryProposalFeatures(structuresPayload(), 'structures').map((f) => f.id)).toEqual([SITE_1, SITE_2, SITE_3])
  })

  it('declares the four layers: the scrim, and three site layers at the structure mark, two with the footprint reader', () => {
    expect(STRUCTURES_STEP.layers.map((l) => [l.id, l.band, l.kind, l.source])).toEqual([
      ['structures-offparcel', 'context', 'scrim', 'document'],
      ['structures-candidates', 'editable', 'polygon', 'proposals'],
      ['structures-placed', 'editable', 'polygon', 'draft'],
      ['structures-committed', 'committed', 'polygon', 'document'],
    ])
    for (const layer of STRUCTURES_STEP.layers.filter((l) => l.kind === 'polygon')) {
      expect(layer.treatment).toBe('structure')
      expect(layer.show).toBe('all')
    }
    expect(STRUCTURES_STEP.layers.find((l) => l.id === 'structures-candidates').footprint).toBeNull()
    expect(STRUCTURES_STEP.layers.find((l) => l.id === 'structures-placed').footprint).toBe(structureSiteFootprint)
    expect(STRUCTURES_STEP.layers.find((l) => l.id === 'structures-committed').footprint).toBe(structureSiteFootprint)
    expect(LAYER_KINDS).not.toContain('site')
  })

  it('draws a placed site’s PAD, not a marker, and the geometry stays the point', () => {
    const point = pointToGeoJSON(INSIDE)
    const placed = placedSite(point, { id: 'p-1' })
    expect(structureSiteFootprint(placed)).toEqual(placed.properties.footprint_wgs84)
    expect(structureSiteFootprint(candidate(SITE_1, 1, point))).toBeNull()
    expect(structureSiteFootprint({ geometry: { type: 'Point', coordinates: point }, properties: {} })).toBeNull()

    const state = {
      steps: { structures: { status: GENERATED, revision: 0, proposals: structuresPayload(), error: null } },
      drafts: { structures: { selectedFeatureIds: ['p-1'], drawnFeatures: [placed], inputs: {} } },
      document: serverDocument(),
      stepOrder: STEP_ORDER,
    }
    const layer = STRUCTURES_STEP.layers.find((l) => l.id === 'structures-placed')
    const resolved = resolveLayer(state, STRUCTURES_STEP, layer)
    expect(resolved.footprint).toBe(structureSiteFootprint)
    expect(resolved.features[0].geometry.type).toBe('Point')
    // THE READER IS CALLED IN THE RENDERER AND NOWHERE ELSE.
    const layers = readFileSync(path.join(SRC, 'map', 'layers.jsx'), 'utf8')
    expect(layers).toContain('layer?.footprint === \'function\' ? layer.footprint(feature)')
    for (const file of ['map/layerStack.js', 'map/StepTools.jsx', 'map/tools/DrawGesture.jsx', 'map/tools/DeleteGesture.jsx']) {
      const code = readFileSync(path.join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(code, `${file} calls no footprint reader`).not.toMatch(/footprint\(/)
    }
  })

  it('refuses a footprint on a non-polygon layer, a placement with no place(), and a placement beside a shape', () => {
    const base = { id: 'x', status: () => NOT_STARTED, commit: { run: () => {} } }
    expect(() => defineStep({ ...base, layers: [{ id: 'l', band: 'editable', kind: 'point', source: 'draft', key: 'k', points: () => [], footprint: () => null }] })).toThrow(/footprint/)
    expect(() => defineStep({ ...base, layers: [{ id: 'l', band: 'editable', kind: 'polygon', source: 'draft', footprint: 'no' }] })).toThrow(/footprint/)
    expect(() => defineStep({ ...base, tools: ['draw'], placement: { input: 'site', max: 2 } })).toThrow(/place\(\)/)
    expect(() => defineStep({ ...base, tools: ['draw'], placement: { input: '', max: 2, place: () => {} } })).toThrow(/placement\.input/)
    expect(() => defineStep({ ...base, tools: ['draw'], placement: { input: 'site', max: 0, place: () => {} } })).toThrow(/placement\.max/)
    expect(() => defineStep({ ...base, tools: ['select'], placement: { input: 'site', max: 2, place: () => {} } })).toThrow(/'draw' tool/)
    expect(() => defineStep({ ...base, tools: ['draw'], shape: { live: () => [], close: () => null }, placement: { input: 'site', max: 2, place: () => {} } })).toThrow(/both/)
    expect(() => defineStep({ ...base, tools: ['draw'], placement: { input: 'site', max: 2, place: () => {} } })).not.toThrow()
    expect(defineStep(base).placement).toBeNull()
  })

  /**
   * [1] THE SITE IS A PIN GLYPH WITH NO INTERIOR ICON. The printed map draws
   * a pin carrying a barn; this map draws the pin's silhouette and nothing
   * inside it. Two paths -- the halo pass and the body -- both the one
   * silhouette, and no other drawing element in the icon.
   */
  it('[1] renders every site as a pin glyph: the silhouette twice, nothing inside it', async () => {
    const { ui } = await generatedStructures()
    await ui.place(INSIDE)
    const pins = ui.all('.site-pin')
    expect(pins).toHaveLength(4)
    for (const pin of pins) {
      const svg = pin.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg.getAttribute('viewBox')).toBe(PIN_GLYPH_VIEWBOX)
      const paths = [...svg.querySelectorAll('path')]
      expect(paths).toHaveLength(2)
      expect(paths.map((p) => p.getAttribute('d'))).toEqual([PIN_GLYPH_PATH, PIN_GLYPH_PATH])
      expect(paths.map((p) => p.getAttribute('class'))).toEqual(['site-pin__halo', 'site-pin__body'])
      // NO INTERIOR ICON: no third path, no group, no circle, no text, no image.
      expect(svg.querySelectorAll('*')).toHaveLength(2)
      // AND NO COLOUR IN THE SVG: every colour is a token App.css reads.
      expect(svg.outerHTML).not.toMatch(/fill=|stroke=|#[0-9a-fA-F]{3,8}\b|rgb/)
    }
    // No pad is drawn for a site any more, in either pane: the only paths
    // there are the pins' own two.
    expect(ui.all('.leaflet-structures--structures-candidates-pane path:not([class^="site-pin"])')).toHaveLength(0)
    expect(ui.all('.leaflet-structures--structures-placed-pane path:not([class^="site-pin"])')).toHaveLength(0)
    expect(ui.all('.leaflet-structures--structures-placed-pane path.zone--drawn')).toHaveLength(0)
    // The placed pin says it is the user's; the generated ones do not.
    expect(ui.all('.leaflet-structures--structures-placed-pane .site-pin--placed')).toHaveLength(1)
    expect(ui.all('.leaflet-structures--structures-candidates-pane .site-pin--placed')).toHaveLength(0)
    await ui.unmount()
  })

  it('is the silhouette the backend draws, copied on purpose and said so', () => {
    // THE PATH IS THE BACKEND ASSET'S <path d>, verbatim -- the classic
    // teardrop -- and the copy is recorded as a deliberate divergence where
    // the path is defined.
    expect(PIN_GLYPH_PATH).toBe(
      'M12 2C8.13401 2 5 5.13401 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13401 15.866 2 12 2Z'
    )
    const marks = readFileSync(path.join(SRC, 'ProductionHatchPattern.jsx'), 'utf8')
    const note = marks.slice(marks.indexOf('THE PIN SILHOUETTE'), marks.indexOf('export const PIN_GLYPH_VIEWBOX'))
    expect(note).toMatch(/DELIBERATE DIVERGENCE/)
    expect(note).toMatch(/one-implementation rule/i)
    expect(note).toMatch(/fixed silhouette/i)
    expect(note).toMatch(/interior icon/i)
  })

  /**
   * [2] OCHRE, AT FIXED SCREEN SIZE ACROSS ZOOM LEVELS. The mark's colour is
   * the live-point token, read by App.css; the icon's box is the same number
   * of pixels at any zoom, because a pointer is a pointer, not a footprint.
   */
  it('[2] is ochre, and the same size on screen at every zoom', async () => {
    const mark = zoneMark('structure')
    expect(mark.kind).toBe('pin')
    expect(marksItsOwnEdge(mark)).toBe(false)
    const token = (name) => document.documentElement.style.getPropertyValue(name).trim()
    expect(mark.fill).toBe(token('--ochre'))
    expect(mark.stroke).toBeNull()
    expect(token('--structure')).toBe('')
    const css = readFileSync(path.join(SRC, 'index.css'), 'utf8')
    expect(css).not.toMatch(/--structure:\s*#/)
    const app = readFileSync(path.join(SRC, 'App.css'), 'utf8')
    const body = app.slice(app.indexOf('.site-pin__body {'), app.indexOf('}', app.indexOf('.site-pin__body {')))
    expect(body).toContain('fill: var(--ochre)')
    // THE HALO: --halo, at the width the harness measured with.
    const halo = app.slice(app.indexOf('.site-pin__halo {'), app.indexOf('}', app.indexOf('.site-pin__halo {')))
    expect(halo).toContain('stroke: var(--halo)')
    expect(halo).toContain(`stroke-width: ${SITE_PIN_HALO_WIDTH};`)
    // The pin never takes the borrowed red, as a token or as a literal.
    expect(css.toLowerCase()).not.toContain('#d64545')
    expect(app.toLowerCase()).not.toContain('#d64545')
    expect(app.slice(app.indexOf('.site-pin'))).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)

    const { ui } = await generatedStructures()
    const sizeAt = () =>
      ui.all('.site-pin').map((pin) => [pin.style.width, pin.style.height].join('x'))
    const zoomed = []
    for (const zoom of [14, 16, 18]) {
      await ui.run(async () => ui.map.setZoom(zoom, { animate: false }))
      const sizes = new Set(sizeAt())
      expect(sizes.size).toBe(1)
      zoomed.push([...sizes][0])
    }
    expect(new Set(zoomed).size).toBe(1)
    expect(zoomed[0]).toBe(`${SITE_PIN_SIZE}px x ${SITE_PIN_SIZE}px`.replace(' x ', 'x'))
    // Anchored at the tip, so the pin points at the site.
    const [tipX, tipY] = PIN_GLYPH_TIP
    const scale = SITE_PIN_SIZE / 24
    const icon = sitePinIcon()
    expect(icon.options.iconAnchor).toEqual([tipX * scale, tipY * scale])
    await ui.unmount()
  })

  /**
   * [4] AN ACTIVE ACCESS POINT IS OCHRE; A COMMITTED ONE IS INK AT COMMITTED
   * MUTING -- read off the stylesheet's own rules, and off the classes the
   * renderer puts on each. The live reading of the same rules, in a real
   * engine, is pointer.test.jsx's.
   */
  it('[4] reads the access point as ochre while live and as ink at committed muting once committed', async () => {
    const app = readFileSync(path.join(SRC, 'App.css'), 'utf8')
    const rule = (selector) => {
      const at = app.indexOf(`\n${selector} {`)
      expect(at, `${selector} is styled`).toBeGreaterThan(-1)
      return app.slice(at, app.indexOf('}', at))
    }
    expect(rule('.access-point-marker')).toContain('background: var(--ochre)')
    const committed = rule('.access-point-marker--committed')
    expect(committed).toContain('background: var(--ink)')
    expect(committed).toContain('opacity: var(--pattern-committed)')
    // --road IS --ink: the token the road line is drawn in, so the committed
    // point and the committed line are one colour.
    const css = readFileSync(path.join(SRC, 'index.css'), 'utf8')
    expect(css).toMatch(/--road:\s*var\(--ink\);/)
    // MUTED, AND THE NUMBER IS index.css's TO CHOOSE. This asserted 0.4 --
    // a copy of the token's value, which is the second source of truth this
    // repo warns about everywhere else, and it broke the day the scale was
    // raised to 0.55 without anything about the access point changing. What
    // the marker actually claims is that a committed point is QUIETER than a
    // live one and is still drawn, so that is what is asserted.
    const committedLevel = Number(
      document.documentElement.style.getPropertyValue('--pattern-committed')
    )
    expect(committedLevel).toBeGreaterThan(0)
    expect(committedLevel).toBeLessThan(1)

    // ON THE MAP: the committed roads layer's point carries the committed
    // class, the structures step's candidates are live pins, and nothing
    // else ochre is on the surface.
    const { ui } = await generatedStructures()
    expect(ui.all('.access-point-marker')).toHaveLength(1)
    expect(ui.all('.access-point-marker--committed')).toHaveLength(1)
    expect(ui.all('.site-pin')).toHaveLength(3)
    expect(ui.all('.site-pin--committed')).toHaveLength(0)
    await ui.unmount()
  })

  /**
   * [5] NO TWO POINT MARKERS SHARE A COLOUR ON ONE MAP AT ANY STEP -- the
   * stylesheet half. Every point-marker class in App.css is read for the
   * token it fills with, and every pair of kinds that can be on one map at
   * one step is held to two different tokens. The rendered half, with real
   * computed colours, walks every step in pointer.test.jsx.
   */
  it('[5] gives every point-marker kind that can share a map a different token', () => {
    const app = readFileSync(path.join(SRC, 'App.css'), 'utf8')
    const fillOf = (selector, property) => {
      const at = app.indexOf(`\n${selector} {`)
      expect(at, `${selector} is styled`).toBeGreaterThan(-1)
      const block = app.slice(at, app.indexOf('}', at))
      const match = block.match(new RegExp(`${property}:\\s*var\\((--[a-z-]+)\\)`))
      expect(match, `${selector} reads a token for ${property}`).not.toBeNull()
      return match[1]
    }
    const MARKERS = {
      'vertex (a ring being drawn)': fillOf('.vertex-marker', 'background'),
      'caution': fillOf('.caution-marker', 'background'),
      'access point, live': fillOf('.access-point-marker', 'background'),
      'access point, committed': fillOf('.access-point-marker--committed', 'background'),
      'site pin, live': fillOf('.site-pin__body', 'fill'),
      'site pin, pending': fillOf('.site-pin--pending .site-pin__body', 'fill'),
      'site pin, rejected': fillOf('.site-pin--rejected .site-pin__body', 'fill'),
    }
    // EVERY MARKER READS A TOKEN, never a literal.
    for (const token of Object.values(MARKERS)) expect(token).toMatch(/^--[a-z-]+$/)
    // WHAT SHARES A MAP, BY STEP. A live access point exists only on roads;
    // a live site pin only on structures; the committed access point from
    // trees onward; a vertex while any ring is drawn; a caution wherever a
    // drawn zone crosses a ground.
    const STEPS = {
      boundary: ['vertex (a ring being drawn)'],
      landform: ['vertex (a ring being drawn)', 'caution'],
      water: ['caution'],
      roads: ['access point, live'],
      trees: ['vertex (a ring being drawn)', 'caution', 'access point, committed'],
      structures: ['access point, committed', 'site pin, live', 'site pin, pending', 'site pin, rejected'],
      fencing: ['access point, committed', 'site pin, committed'],
    }
    MARKERS['site pin, committed'] = MARKERS['site pin, live']
    const clashes = []
    for (const [step, kinds] of Object.entries(STEPS)) {
      for (let i = 0; i < kinds.length; i++) {
        for (let j = i + 1; j < kinds.length; j++) {
          const a = kinds[i]
          const b = kinds[j]
          if (MARKERS[a] === MARKERS[b]) clashes.push(`${step}: ${a} and ${b} both ${MARKERS[a]}`)
        }
      }
    }
    expect(clashes).toEqual([])
    // THE RULE IS WRITTEN WHERE THE TOKENS ARE, so the next step inherits it.
    const css = readFileSync(path.join(SRC, 'index.css'), 'utf8')
    const note = css.slice(css.indexOf('OCHRE MEANS A LIVE POINT MARKER'), css.indexOf('--ochre: #'))
    expect(note.length).toBeGreaterThan(200)
    expect(note).toMatch(/ONCE COMMITTED, A POINT MARKER JOINS ITS LAYER'S SETTLED TREATMENT/)
    expect(note).toMatch(/fencing/)
    // And the live access point and the live pin are the SAME token: one
    // colour for one concept, on two steps that never share a map.
    expect(MARKERS['access point, live']).toBe('--ochre')
    expect(MARKERS['site pin, live']).toBe('--ochre')
    expect(MARKERS['access point, committed']).toBe('--ink')
  })

  it('writes down no weight, no floor, no slope ceiling and no band cut of its own; every figure comes off the wire', () => {
    const source = readFileSync(path.join(SRC, 'wizard', 'stepDefinitions.js'), 'utf8')
    const section = source
      // ...and closes where the NEXT section opens: fencing follows it now.
      .slice(source.indexOf('   THE STRUCTURES STEP\n'), source.indexOf('   THE FENCING STEP\n'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(section.length).toBeGreaterThan(1000)
    // The four weights are 25 each on the backend; the floor is 40; the
    // slope ceiling is 20. None is written here, in any form.
    expect(section.match(/\b(25|40|20|0\.25|0\.4)\b/g) ?? []).toEqual([])
    expect(section).not.toMatch(/SCORE_WEIGHT|MIN_SUITABILITY|MAX_SOLAR_SLOPE/)
    // NOR THE SCORE'S OWN SCALE: the denominator is read off the payload.
    expect(section.match(/\b100\b/g) ?? []).toEqual([])
    expect(section).toContain('scoreDenominator(proposals?.summary)')
    // The weights are still READ -- by the notices, where the share of every
    // score a rough reading carries is a step-level fact -- off the payload.
    const shading = STRUCTURES_STEP.notices(
      contextOver(structuresPayload({ weights: { slope: 10.0, aspect: 50.0, shading: 30.0, production_proximity: 10.0 } }))
    ).find((n) => n.key === 'shading-proxy')
    expect(shading.text.map((p) => p.measure ?? p).join('')).toContain('30% of every score')
  })

  it('[test 7] keeps rank, prime farmland, the four factors and the signed production distance out of the panel', () => {
    const payload = structuresPayload({ prime: true })
    const body = bodyFor(payload, SITE_1)
    const labels = body.map((row) => row.label ?? '')
    const values = body.map((row) => row.value)

    // RANK IS A COMPARISON AGAINST THE SHORTLIST, not a measurement of the
    // spot -- and the TAB already carries it, in the name.
    expect(labels).not.toContain('rank')
    expect(body.some((row) => String(row.value).includes('would sit'))).toBe(false)
    expect(STRUCTURES_STEP.tabs(contextOver(payload)).find((t) => t.id === SITE_1).name).toBe('Site 1')

    // PRIME FARMLAND IS PARCEL-LEVEL SSURGO inherited from the run: every
    // site carries the same answer, so it is said ONCE, at step level.
    expect(labels).not.toContain('prime farmland')
    expect(body.some((row) => String(row.value).includes('parcel-level flag'))).toBe(false)
    expect(
      STRUCTURES_STEP.notices(contextOver(payload)).find((n) => n.key === 'prime-farmland')
    ).toBeDefined()

    // THE FOUR SCORING FACTORS, consistent with the other five steps. Not
    // their labels, not their shares, and not the figures themselves --
    // 0.812 / 0.900 / 0.750 / 0.500 on this payload.
    for (const label of ['gentle ground', 'sun-facing', 'open to the sky', 'at the edge of production ground']) {
      expect(labels.some((l) => l.startsWith(label)), `no ${label} row`).toBe(false)
    }
    expect(labels.some((l) => l.includes('% of the score'))).toBe(false)
    for (const gone of ['0.812', '0.900', '0.750', '0.500']) expect(values).not.toContain(gone)

    // THE SIGNED PRODUCTION DISTANCE. Settled when the fields were specced:
    // the NARRATIVE reads it, the panel does not. Site 3's is negative -- it
    // sits inside a block -- which is the one reading that could not be
    // mistaken for the unsigned figure, so it is the one asserted absent.
    const inside = bodyFor(payload, SITE_3)
    expect(inside.map((row) => row.label ?? '')).not.toContain('ft to production ground')
    expect(inside.map((row) => row.value)).not.toContain('-33')
    expect(inside.some((row) => String(row.value).includes('-'))).toBe(false)
    // ON THE WIRE, WHICH IS WHAT MAKES ITS ABSENCE A PANEL DECISION.
    const site3 = registryProposalFeatures(payload, 'structures')[2]
    expect(site3.properties.signed_distance_to_production_ft).toBe(-32.8)
    expect(site3.properties.production_zone_relationship).toBe('inside')

    // AND THE REST OF WHAT LEFT: the pad's acreage and the other two
    // distances. Every pad is the same tenth of an acre unless clipped.
    for (const label of ['pad acres', 'aspect \u00b0', 'facing', 'ft to production ground', 'ft to water zone', 'origin']) {
      expect(labels).not.toContain(label)
    }
    // ALL OF IT IS STILL ON THE WIRE.
    const p = registryProposalFeatures(payload, 'structures')[0].properties
    expect(p.footprint_area_acres).toBe(0.1)
    expect(p.aspect_degrees).toBe(50.0)
    expect(p.distance_to_water_zone_ft).toBe(300.5)
    expect(p.prime_farmland_conflict).toBe(true)
    expect(payload.summary.factor_weights_pct).toMatchObject({ shading: 25.0 })
  })

  it('names no step in the shell, the stack or the tools, and imports the new tool from the draw gesture alone', () => {
    const files = [
      'wizard/WizardShell.jsx',
      'wizard/shell/TabStrip.jsx',
      'wizard/shell/DetailPanel.jsx',
      'wizard/shell/ActionBanner.jsx',
      'wizard/shell/InstructionBar.jsx',
      'wizard/shell/chromeState.js',
      'wizard/useStepMachine.js',
      'map/layerStack.js',
      'map/layers.jsx',
      'map/StepTools.jsx',
      'map/tools/DrawGesture.jsx',
      'map/tools/DeleteGesture.jsx',
      'map/tools/SelectGesture.jsx',
      'PlaceSiteTool.jsx',
      'session/SessionStore.jsx',
      'session/apiClient.js',
    ]
    for (const file of files) {
      const code = readFileSync(path.join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(code, `${file} names no step`).not.toMatch(/['"`](landform|water|roads|trees|structures|fencing)['"`]/)
      expect(code, `${file} names no step id`).not.toMatch(/stepId === ['"]/)
    }
    // ONE IMPORTER, and it is the draw gesture -- the arrangement the access
    // point tool has.
    const importers = []
    const walk = (dir) => {
      for (const entry of readFileSync !== null ? require('node:fs').readdirSync(dir, { withFileTypes: true }) : []) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.(jsx?|tsx?)$/.test(entry.name) && !entry.name.endsWith('.test.jsx') && entry.name !== 'PlaceSiteTool.jsx') {
          if (/from '[^']*PlaceSiteTool\.jsx'/.test(readFileSync(full, 'utf8'))) importers.push(entry.name)
        }
      }
    }
    walk(SRC)
    expect(importers).toEqual(['DrawGesture.jsx'])
  })
})
