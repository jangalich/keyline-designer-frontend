/**
 * trees.test.jsx
 *
 * THE TREES STEP: the fourth definition. LANDFORM-SHAPED -- select-only
 * candidates PLUS zones the user draws -- and sourced like roads: every
 * upstream decision reaches it as a committed edge, and a drawn zone is
 * warned about what the user has COMMITTED rather than about the exclusion
 * gates.
 *
 * READ THE DEFINITION'S HEADER FIRST. Tree zones are a marginal-land crop; a
 * HIGH score means steep, wet, poor-soil ground near a stream, and that is
 * good. Half of this file exists to assert that the step never says otherwise
 * -- no hydric or slope caution, factor rows that read as merits, weights
 * that come off the wire rather than out of this repo.
 *
 * HOW TO RUN THE END-TO-END SECTIONS:
 *
 *     cd ../keyline-designer && python serve_test_backend.py 5099 &
 *     VITE_API_URL=http://127.0.0.1:5099 npx vitest run src/trees.test.jsx
 *
 * THE SAME SERVER EVERY OTHER LIVE SUITE DRIVES. It could not generate trees
 * once: its harness's water-features mock carried a shape no fetch produces,
 * and the tree scorer read `["streams"]` off it. The harness was fixed on the
 * backend (test_step_commit.py section 14 walks all four steps through it and
 * reports the figures the other suites assert), so section 1 runs here.
 *
 * SKIPPED, NOT FAILED, WITH NO SERVER -- roads.test.jsx's posture. Every
 * section that needs no server runs either way, over a hand-built payload in
 * the backend's own shape (step_orchestrator.build_trees_payload) and over
 * the captured landform session, which is real backend output.
 *
 * Sections (the branch's numbered tests in brackets):
 *   1  [1]  END TO END: production, water and roads committed -> generate ->
 *           tabs -> select a subset -> draw a zone -> commit -> the document
 *           carries both kinds.
 *   2  [2]  CAUTIONS record ALL FOUR grounds where crossed -- production,
 *           water, road and canopy, the last two off the payload's own
 *           `crossing_grounds` -- through the real gesture, in the server's
 *           own words, with canopy's copy kept distinct.
 *   3  [3]  A drawn zone on hydric, steep ground records NO caution for
 *           either -- with a control showing the same ring DOES trip both on
 *           landform's grounds.
 *   4  [4]  A factor whose gate is false renders an em dash, never 0.5 or 50.
 *   5  [5]  A drawn zone shows its factors ABSENT, not zeroed.
 *   6  [6]  No eligible highlight renders; the off-parcel scrim DOES.
 *   7  [7]  The search space renders nothing, and --tree is told from --field.
 *   8  [8]  The factor weights come off the payload; the definition carries
 *           no 40/30/20/10.
 *   9  [9]  The generating-state flash is asserted in roads.test.jsx section
 *           15, where the generate fixtures already live -- the surface it
 *           was reported on. See "the pair goes on the PRESS".
 *  10 [10]  Real-pointer hit-testing is in wizard/pointer.test.jsx, which
 *           derives its cases from the registry and grew a trees section.
 *  11       THE SCHEMA: what the definition declares, and the sweep.
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
  LANDFORM_STEP,
  REOPEN_BUTTON,
  STEP_DEFINITIONS,
  TREES_GROUNDS_LAYER,
  TREES_SHAPE,
  TREES_STEP,
  TREE_CROSSING_GROUND_TYPES,
  TREE_FACTORS,
  TREE_ZONE_LAYER,
  defineStep,
  registryProposalFeatures,
  roadNetworks,
  treeCrossingGrounds,
  treeFactorField,
  treeFactorsByWeight,
} from './wizard/stepDefinitions'
import { MACHINE_STATES } from './wizard/useStepMachine.js'
import { resetStepCatalog } from './wizard/stepCatalog.jsx'
import WizardShell from './wizard/WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './wizard/WizardCursor.jsx'
import MapLayerStack from './map/MapLayerStack.jsx'
import { composeLayerStack, resolveLayer } from './map/layerStack.js'
import { DrawingProgressProvider } from './map/DrawingProgress.jsx'
import { injectZonePatterns, marksItsOwnEdge, zoneMark } from './ProductionHatchPattern.jsx'
import { toMultiPolygon } from './geo.js'
import { CAUTION_MIN_ACRES, cautionsFor, clampToBoundary, exclusionGrounds } from './zoneGeometry.js'
import captured from './fixtures/landform-session.json'
import rings from './fixtures/rings.json'

const SRC = path.dirname(fileURLToPath(import.meta.url))

const toLatLng = (ring) => ring.map(([lng, lat]) => [lat, lng])
/** The reference parcel, and the ring landform.test.jsx draws over its hydric soil. */
const BOUNDARY = toLatLng(rings.boundary)
const HYDRIC_RING = toLatLng(rings.hydric)

/** roads.test.jsx's surveyed access point A: on the parcel's west edge, and it routes. */
const ACCESS_A = [40.6434533, -79.9836992]

/**
 * A drawable ring over one shipped ground: a small box around a vertex of the
 * ground's own geometry, the first such box that clamps to the parcel and
 * clears the caution floor against that ground alone. Off the geometry the
 * server shipped, so it crosses by construction rather than by a survey of
 * the fixture.
 */
function boxOver(ground, parcel, halfDegrees = 0.00025) {
  const rings = toMultiPolygon(ground.geometry_wgs84).flatMap((polygon) => polygon)
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      const candidate = [
        [lat - halfDegrees, lng - halfDegrees],
        [lat - halfDegrees, lng + halfDegrees],
        [lat + halfDegrees, lng + halfDegrees],
        [lat + halfDegrees, lng - halfDegrees],
      ]
      const { multi } = clampToBoundary(candidate, parcel)
      if (!multi.length) continue
      if (cautionsFor(multi, [ground]).length) return candidate
    }
  }
  return null
}

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
   The surface -- roads.test.jsx's harness, with a trees reading
   --------------------------------------------------------------------------- */

const mounted = []

/**
 * ZOOM 19 FOR THE LIVE FLOW -- landform.test.jsx's, not roads'. The hydric
 * ring is a 10 m rectangle, and at zoom 17 its vertices sit inside the draw
 * tool's 15 px hit radius of one another: the second click reads as a click
 * on the first vertex and the ring never closes. The offline fixture's rings
 * are hundreds of metres across and draw at 17.
 */
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
    get trees() {
      return session.state.steps.trees?.proposals ?? null
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
    async clickMap(latlng) {
      await React.act(async () => map.fire('click', { latlng: L.latLng(...latlng) }))
    },
    /** Draw a ring through the real gesture: arm, click each vertex, close on the first. */
    async draw(ring) {
      await this.click('draw-trees')
      for (const point of ring) await this.clickMap(point)
      await this.clickMap(ring[0])
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
          `  trees=${selectStepStatus(this.state, 'trees')} ` +
          `error=${JSON.stringify(this.state.steps.trees?.error)}`
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
   The live flow up to the trees step
   --------------------------------------------------------------------------- */

/**
 * Boundary; landform generated and committed whole; water committed WITH ONE
 * ZONE (roads.test.jsx's reason: with every zone committed the pond exclusion
 * covers the ground the router needs); one road network routed from access
 * point A and committed. The cursor lands on trees with nothing generated.
 */
async function throughRoadsCommit(ui) {
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
  expect(selectStepFeatures(ui.state, 'roads').features.length).toBeGreaterThan(0)

  expect(ui.cursor.cursorStepId).toBe('trees')
  return ui
}

/* ===========================================================================
   1. END TO END
   =========================================================================== */

describe('1. end to end against the real backend', () => {
  liveIt(
    'generates over the three commits, selects a subset, draws a zone, commits, and the document carries both kinds',
    async () => {
      const ui = await renderApp()
      await throughRoadsCommit(ui)

      // THE STEP OPENS EMPTY: nothing generated, nothing armed, one button.
      expect(ui.trees).toBeNull()
      expect(ui.cursor.armed).toBeNull()
      expect(ui.all('[data-tab-id]')).toHaveLength(0)
      expect(ui.text('generate-trees')).toBe('Generate tree zones')

      await ui.click('generate-trees')
      await ui.waitFor('trees to generate', () => selectStepStatus(ui.state, 'trees') === GENERATED)
      await ui.waitFor('the trees draft', () => ui.state.drafts.trees !== undefined)

      // THE PAYLOAD IS THE BACKEND'S OWN SHAPE, exactly (test_trees_step.py
      // asserts the same five keys), and the candidates it carries are what
      // the strip tabs.
      expect(Object.keys(ui.trees).sort()).toEqual(['crossing_grounds', 'search_space', 'summary', 'tree_zones', 'zones'])
      // ALL FOUR GROUNDS, from the server, in its words, each with geometry.
      const shipped = ui.trees.crossing_grounds
      expect(shipped.map((g) => g.type)).toEqual(['production', 'water', 'road', 'canopy'])
      expect(shipped.map((g) => g.label)).toEqual([
        'committed production area',
        'committed water zone',
        'committed road corridor',
        'tree canopy root zone',
      ])
      for (const g of shipped) expect(['Polygon', 'MultiPolygon']).toContain(g.geometry_wgs84.type)
      const candidates = registryProposalFeatures(ui.trees, 'trees')
      expect(candidates.length, 'the fixture yields tree zone candidates').toBeGreaterThan(0)
      expect(ui.all('[data-tab-id]')).toHaveLength(candidates.length)

      // THE DISPLAY-ONLY SMOOTHED OUTLINE CAME OVER THE WIRE, from the real
      // backend through real JSON. A tree zone is a union of 5 m DEM cells and
      // its edge is a pixel staircase; this is that edge smoothed, computed
      // server-side by the same function the PDF's layout map uses, and it is
      // what map/layers.jsx draws. It is a RENDERING of `geometry`, never a
      // replacement for it -- the two are different shapes here, and every
      // measurement on this page reads the second one.
      for (const candidate of candidates) {
        const outline = candidate.properties.display_only_smoothed_outline
        expect(outline, `${candidate.id} carries a smoothed outline`).toBeTruthy()
        expect(['Polygon', 'MultiPolygon']).toContain(outline.type)
        expect(JSON.stringify(outline)).not.toBe(JSON.stringify(candidate.geometry))
      }
      for (const row of ui.trees.zones) {
        expect(ui.text(`tab-focus-${row.feature_id}`)).toContain(`Zone ${row.rank}`)
        // THE SCORE IS PRINTED AS SENT: already 0-100, one decimal.
        expect(ui.text(`tab-focus-${row.feature_id}`)).toContain(Number(row.score).toFixed(1))
      }
      // EVERY CANDIDATE STARTS SELECTED.
      expect(selectDraft(ui.state, 'trees').selectedFeatureIds.sort()).toEqual(
        candidates.map((f) => f.id).sort()
      )

      // THE PANEL FOR ONE ZONE: the merits, weighted off the payload.
      const first = ui.trees.zones[0]
      await ui.focus(first.feature_id)
      expect(ui.text('detail-name-trees')).toBe(`Zone ${first.rank}`)
      const weights = ui.trees.summary.selection.factor_weights_pct
      const merits = ui.find('detail-fields-merits')
      expect(merits).not.toBeNull()
      for (const factor of TREE_FACTORS) {
        expect(merits.textContent).toContain(`${factor.label} · ${weights[factor.key].toFixed(0)}% of the score`)
      }
      await ui.focus(null)

      // A SUBSET: un-check the first candidate.
      await ui.click(`tab-check-${first.feature_id}`)
      expect(selectDraft(ui.state, 'trees').selectedFeatureIds).not.toContain(first.feature_id)

      // DRAW A ZONE, through the real gesture, over the hydric ring.
      await ui.draw(HYDRIC_RING)
      let drawn = selectDraft(ui.state, 'trees').drawnFeatures
      expect(drawn).toHaveLength(1)
      expect(drawn[0].properties.layer).toBe(TREE_ZONE_LAYER)
      expect(ui.all('[data-tab-id]')).toHaveLength(candidates.length + 1)
      expect(ui.find(`tab-remove-${drawn[0].id}`)).not.toBeNull()
      // [3] STEEP, WET GROUND IS THE POINT: no hydric and no slope caution.
      expect(drawn[0].properties.cautions.map((c) => c.type)).not.toContain('hydric')
      expect(drawn[0].properties.cautions.map((c) => c.type)).not.toContain('slope')

      // [1] ROAD AND CANOPY WARN WHERE CROSSED. A box is found over each of
      // those two grounds -- off the shipped geometry itself, so it crosses
      // by construction -- and drawn through the real gesture.
      for (const type of ['road', 'canopy']) {
        const ground = shipped.find((g) => g.type === type)
        const ring = boxOver(ground, BOUNDARY)
        expect(ring, `a drawable box over the ${type} ground`).not.toBeNull()
        await ui.draw(ring)
        drawn = selectDraft(ui.state, 'trees').drawnFeatures
        const latest = drawn[drawn.length - 1]
        expect(latest.properties.cautions.map((c) => c.type), `the ${type} crossing warns while drawing`).toContain(type)
        expect(latest.properties.cautions.find((c) => c.type === type).label).toBe(ground.label)
      }
      expect(drawn).toHaveLength(3)
      // The canopy notice carries canopy's own copy.
      expect(ui.find(`notice-canopy-${drawn[2].id}-trees`).textContent).toContain('there are already trees here')

      expect(ui.text('commit-trees')).toBe('Commit tree zones')
      await ui.click('commit-trees')
      await ui.waitFor('trees to commit', () => selectStepStatus(ui.state, 'trees') === COMMITTED)

      // THE DOCUMENT CARRIES BOTH KINDS: the kept candidates as generated,
      // the drawn zones as user_added, and the un-checked one absent.
      const committed = selectStepFeatures(ui.state, 'trees').features
      const provenance = selectStepProvenance(ui.state, 'trees')
      const kept = candidates.filter((f) => f.id !== first.feature_id).map((f) => f.id)
      expect(committed.map((f) => f.id).sort()).toEqual([...kept, ...drawn.map((f) => f.id)].sort())
      for (const id of kept) expect(provenance[id]).toBe(PROVENANCE_GENERATED)
      for (const f of drawn) expect(provenance[f.id]).toBe(PROVENANCE_USER_ADDED)

      // [3] TWO IMPLEMENTATIONS, ONE ANSWER, ALL FOUR GROUNDS. For every
      // drawn ring the server recorded what it crosses against ITS four
      // grounds -- never hydric or slope -- and the client's cautions over
      // the SHIPPED grounds name the same grounds in the same order with the
      // same labels, agreeing on acreage to within the projection difference
      // (lon/lat with a cosine scale here, UTM metres there, two places).
      const lines = []
      for (const feature of drawn) {
        const recorded = committed.find((f) => f.id === feature.id).properties.exclusion_crossings
        expect(Array.isArray(recorded)).toBe(true)
        expect(recorded.map((c) => c.type)).not.toContain('hydric')
        expect(recorded.map((c) => c.type)).not.toContain('slope')
        const client = feature.properties.cautions
        expect(client.map((c) => c.type)).toEqual(recorded.map((c) => c.type))
        expect(client.map((c) => c.label)).toEqual(recorded.map((c) => c.label))
        for (let i = 0; i < recorded.length; i++) {
          expect(Math.abs(client[i].acres - recorded[i].acres)).toBeLessThanOrEqual(0.02 + 0.02 * client[i].acres)
        }
        lines.push(
          `${feature.properties.label} client ${JSON.stringify(client.map((c) => [c.type, Number(c.acres.toFixed(2))]))}` +
            ` server ${JSON.stringify(recorded.map((c) => [c.type, c.acres]))}`
        )
      }
      // The road and the canopy each appear in at least one record: the two
      // grounds the client could not warn about before are warned about and
      // recorded alike.
      const everyType = new Set(drawn.flatMap((f) => f.properties.cautions.map((c) => c.type)))
      expect(everyType.has('road')).toBe(true)
      expect(everyType.has('canopy')).toBe(true)
      console.log('TREES CROSSINGS AGREEMENT\n  ' + lines.join('\n  '))

      // The cursor moved on, and the committed zones are drawn in the
      // committed band at the tree mark.
      expect(ui.cursor.cursorStepId).toBe('structures')
      expect(
        ui.container.querySelectorAll('.leaflet-trees--trees-committed-pane path.zone--tree')
      ).toHaveLength(committed.length)

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

/** The committed production area and the committed water zone, as the document carries them. */
const PRODUCTION_POLY = box(-74.015, -74.008, 40.712, 40.718)
const WATER_POLY = box(-74.005, -73.998, 40.715, 40.72)
/** The road's CELL FOOTPRINT -- a strip with width along the committed LineString -- and the canopy mask. */
const ROAD_FOOTPRINT = box(-74.02, -74.01, 40.7198, 40.7202)
const CANOPY_POLY = box(-73.99, -73.982, 40.724, 40.729)
/** The four grounds as the payload ships them: the server's types and labels, geometry in WGS84. */
const GROUNDS = [
  { type: 'production', label: 'committed production area', geometry_wgs84: PRODUCTION_POLY },
  { type: 'water', label: 'committed water zone', geometry_wgs84: WATER_POLY },
  { type: 'road', label: 'committed road corridor', geometry_wgs84: ROAD_FOOTPRINT },
  { type: 'canopy', label: 'tree canopy root zone', geometry_wgs84: CANOPY_POLY },
]
/** A ring the user draws across production AND water, [lat, lng]. */
const ACROSS_BOTH = [
  [40.713, -74.012],
  [40.713, -74.0],
  [40.719, -74.0],
  [40.719, -74.012],
]
/** One across the road footprint, one across the canopy. */
const ACROSS_ROAD = [
  [40.7196, -74.018],
  [40.7196, -74.012],
  [40.7204, -74.012],
  [40.7204, -74.018],
]
const ACROSS_CANOPY = [
  [40.725, -73.989],
  [40.725, -73.984],
  [40.728, -73.984],
  [40.728, -73.989],
]
/** And one across none of the four. */
const CLEAR = [
  [40.724, -74.018],
  [40.724, -74.012],
  [40.728, -74.012],
  [40.728, -74.018],
]

const ZONE_A = 'tree-zone-candidate-1'
const ZONE_B = 'tree-zone-candidate-2'

function candidate(id, rank, geometry, extra = {}) {
  return {
    type: 'Feature',
    id,
    geometry,
    properties: {
      layer: TREE_ZONE_LAYER,
      label: 'Tree zone candidate',
      confidence: 'medium',
      confidence_notes: 'fixture',
      rank,
      area_acres: 2.1,
      tree_suitability_score: 58.3,
      hydric_overlap_factor: 0.6,
      slope_factor: 0.48,
      soil_marginality_factor: 1.0,
      stream_proximity_factor: 0.12,
      avg_slope_pct: 24.0,
      soil_marginality_data_available: true,
      hydric_data_available: true,
      stream_data_available: true,
      ...extra,
    },
  }
}

/**
 * The trees payload in step_orchestrator.build_trees_payload()'s shape:
 * `tree_zones`, the tabular `zones` keyed by feature id, the narrative's
 * step-level block under `summary`, and the search space.
 */
function treesPayload({ gates, weights, candidates = 2, grounds = GROUNDS } = {}) {
  const features = [
    candidate(ZONE_A, 1, box(-74.0, -73.99, 40.722, 40.728)),
    candidate(ZONE_B, 2, box(-73.99, -73.985, 40.712, 40.716), { tree_suitability_score: 41.0, area_acres: 0.4 }),
  ].slice(0, candidates)
  const factor_weights_pct = weights ?? { hydric_overlap: 40, slope: 30, soil_marginality: 20, stream_proximity: 10 }
  return {
    tree_zones: { type: 'FeatureCollection', features },
    zones: features.map((f) => ({
      feature_id: f.id,
      rank: f.properties.rank,
      position_in_parcel: f.properties.rank === 1 ? 'north' : 'south-east',
      area_acres: f.properties.area_acres,
      score: f.properties.tree_suitability_score,
      avg_slope_pct: f.properties.avg_slope_pct,
      factors: {
        hydric_overlap: f.properties.hydric_overlap_factor * 100,
        slope: f.properties.slope_factor * 100,
        soil_marginality: f.properties.soil_marginality_factor * 100,
        stream_proximity: f.properties.stream_proximity_factor * 100,
      },
    })),
    summary: {
      candidate_count: features.length,
      search_space: {
        parcel_acres: 40.2,
        claimed_acres: 12.1,
        search_space_acres: 26.3,
        search_space_pct_of_parcel: 65.4,
        boundary_setback_ft: 16.4,
        production_clearance_ft: 16.4,
        water_clearance_ft: 16.4,
      },
      selection: {
        min_suitability_score: 31,
        min_zone_acres: 0.1,
        existing_canopy_excluded: true,
        factor_weights_pct,
      },
      gates: gates ?? {
        soil_marginality_data_available: true,
        hydric_data_available: true,
        stream_data_available: true,
      },
    },
    search_space: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'tree-search-space',
          properties: { layer: 'tree_search_space_diagnostic' },
          geometry: box(-74.019, -73.981, 40.711, 40.729),
        },
      ],
    },
    crossing_grounds: grounds,
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

function serverDocument({ trees = { status: NOT_STARTED }, water, revision = 4 } = {}) {
  const entries = {}
  for (const stepId of [...STEP_ORDER].sort()) entries[stepId] = { status: NOT_STARTED }
  entries.landform = committedStep(1, [
    { type: 'Feature', id: 'production-area-1', properties: { layer: 'production_area_candidate' }, geometry: PRODUCTION_POLY },
  ])
  entries.water =
    water ??
    committedStep(1, [
      { type: 'Feature', id: 'survey-zone-1', properties: { layer: 'survey_zone_embankment', survey_type: 'embankment', rank: 1 }, geometry: WATER_POLY },
    ])
  entries.roads = committedStep(1, [
    {
      type: 'Feature',
      id: 'road-corridor-1',
      properties: { layer: 'suggested_road_corridor', network_id: 'net-1', access_point: [-74.02, 40.72], branch_index: 0, branch_role: 'trunk' },
      geometry: { type: 'LineString', coordinates: [[-74.02, 40.72], [-74.01, 40.72]] },
    },
  ], { inputs: { access_points: [[-74.02, 40.72]] } })
  entries.trees = trees
  return {
    schema_version: 1,
    session_id: 'sess-trees',
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

/** A generated trees step over the fixture payload, resumed into, on the trees cursor. */
async function generatedTrees({ payload = treesPayload(), water } = {}) {
  const document = serverDocument({ trees: { status: GENERATED }, water })
  const calls = installFetch([
    route('GET', /^\/api\/sessions\/sess-trees$/, { body: document }),
    route('GET', /\/steps\/trees\/layers$/, { body: payload }),
  ])
  const ui = await renderApp({ center: [40.72, -74.0], zoom: 17 })
  await ui.run((a) => a.resume('sess-trees'))
  await ui.waitFor('the trees payload', () => ui.trees != null, 5000)
  await ui.waitFor('the trees draft', () => ui.state.drafts.trees !== undefined, 5000)
  expect(ui.cursor.cursorStepId).toBe('trees')
  return { ui, calls, document }
}

/** The step's context as its tabs and detail read it, over a payload and a draft. */
const contextOver = (proposals, draft = {}) => ({
  proposals,
  draft: { selectedFeatureIds: [], drawnFeatures: [], inputs: {}, ...draft },
})

/* ===========================================================================
   2. CAUTIONS -- the committed grounds, through the real gesture
   =========================================================================== */

describe('2. cautions record all four grounds where crossed', () => {
  it('reads the four grounds off its own payload, and declares no gate', () => {
    // THE DECLARATION: one reference layer over the payload's
    // `crossing_grounds`, landform's exclusion declaration exactly. Nothing
    // is unioned, nothing is read off another step's document.
    const grounds = TREES_STEP.layers.find((layer) => layer.id === TREES_GROUNDS_LAYER)
    expect(grounds).toMatchObject({ kind: 'reference', source: 'proposals', key: 'crossing_grounds', band: 'context' })
    expect(TREES_STEP.layers.filter((layer) => layer.kind === 'reference')).toHaveLength(1)
    expect(TREE_CROSSING_GROUND_TYPES).toEqual(['production', 'water', 'road', 'canopy'])
    for (const gate of ['hydric', 'slope', 'setback', 'roads']) {
      expect(TREE_CROSSING_GROUND_TYPES).not.toContain(gate)
    }
    // THE PAYLOAD'S LIST IS THE GROUNDS, verbatim -- types, labels and
    // geometry are the server's; with no payload there are none.
    expect(treeCrossingGrounds({ [TREES_GROUNDS_LAYER]: GROUNDS })).toBe(GROUNDS)
    expect(treeCrossingGrounds({})).toEqual([])
    expect(treeCrossingGrounds(null)).toEqual([])
  })

  it('resolves the grounds through the stack off the trees payload, and a ground the server omitted is simply absent', () => {
    const state = {
      steps: { trees: { status: GENERATED, revision: 0, proposals: treesPayload(), error: null } },
      drafts: {},
    }
    const layer = TREES_STEP.layers.find((entry) => entry.id === TREES_GROUNDS_LAYER)
    const resolved = resolveLayer(state, TREES_STEP, layer)
    expect(resolved.kind).toBe('reference')
    expect(resolved.data.map((g) => g.type)).toEqual(['production', 'water', 'road', 'canopy'])
    for (const ground of resolved.data) expect(Object.keys(ground).sort()).toEqual(['geometry_wgs84', 'label', 'type'])

    // NO SENTINEL: "no water zone on this parcel" is a ground the server
    // does not ship, so the clip never sees it -- it is not present with a
    // null geometry, and nothing here reads a flag.
    const three = GROUNDS.filter((g) => g.type !== 'water')
    const { multi } = clampToBoundary(ACROSS_BOTH, RING)
    expect(cautionsFor(multi, three).map((c) => c.type)).toEqual(['production'])
    expect(cautionsFor(multi, GROUNDS).map((c) => c.type)).toEqual(['production', 'water'])
  })

  it('warns about every ground while drawing across it, marks the map, and carries the cautions on the feature', async () => {
    const { ui } = await generatedTrees()

    // A ring across none of the four: no caution, no marker.
    await ui.draw(CLEAR)
    let drawn = selectDraft(ui.state, 'trees').drawnFeatures
    expect(drawn).toHaveLength(1)
    expect(drawn[0].properties.cautions).toEqual([])
    expect(ui.all('.caution-marker')).toHaveLength(0)

    // ACROSS PRODUCTION AND WATER: the panel says so while the ring is going
    // down, in the server's words...
    await ui.click('draw-trees')
    for (const point of ACROSS_BOTH) await ui.clickMap(point)
    expect(ui.find('detail-cautions-trees')).not.toBeNull()
    expect(ui.text('caution-production')).toContain('committed production area')
    expect(ui.text('caution-water')).toContain('committed water zone')
    // ...and the closed shape carries them, in the payload's order, each
    // with a place to put its marker.
    await ui.clickMap(ACROSS_BOTH[0])
    drawn = selectDraft(ui.state, 'trees').drawnFeatures
    expect(drawn).toHaveLength(2)
    const both = drawn[1].properties.cautions
    expect(both.map((c) => [c.type, c.label])).toEqual([
      ['production', 'committed production area'],
      ['water', 'committed water zone'],
    ])
    for (const c of both) {
      expect(c.acres).toBeGreaterThan(CAUTION_MIN_ACRES)
      expect(c.at).toHaveLength(2)
    }
    expect(ui.all('.caution-marker')).toHaveLength(2)

    // [test 1] ACROSS THE ROAD -- the cell footprint, which the client could
    // not warn about before the payload carried it.
    await ui.draw(ACROSS_ROAD)
    drawn = selectDraft(ui.state, 'trees').drawnFeatures
    expect(drawn).toHaveLength(3)
    expect(drawn[2].properties.cautions.map((c) => [c.type, c.label])).toEqual([
      ['road', 'committed road corridor'],
    ])

    // [test 1] ACROSS THE CANOPY: the caution line carries the gate's own
    // label, and the step says the one thing about canopy that is a
    // different kind of statement -- there are already trees here.
    await ui.draw(ACROSS_CANOPY)
    drawn = selectDraft(ui.state, 'trees').drawnFeatures
    expect(drawn).toHaveLength(4)
    const canopy = drawn[3].properties.cautions
    expect(canopy.map((c) => [c.type, c.label])).toEqual([['canopy', 'tree canopy root zone']])
    await ui.focus(drawn[3].id)
    expect(ui.text('caution-canopy')).toContain('tree canopy root zone')
    const notice = ui.find(`notice-canopy-${drawn[3].id}-trees`)
    expect(notice, 'the canopy notice names the drawn zone').not.toBeNull()
    expect(notice.textContent).toContain('Drawn 4 sits on')
    expect(notice.textContent).toContain('acres of existing canopy: there are already trees here')
    expect(notice.textContent).toContain('a caution, not a rule')
    expect(notice.querySelector('.measure').textContent).toBe(canopy[0].acres.toFixed(1))
    // The committed-ground crossings carry NO such notice: their line in the
    // panel already says what was overlapped.
    expect(ui.find(`notice-canopy-${drawn[1].id}-trees`)).toBeNull()
    expect(ui.all('.caution-marker')).toHaveLength(1)

    // THE FEATURE IS WHAT THE COMMIT SENDS: the contract's four properties,
    // the trees layer, and nothing a pipeline would have scored.
    expect(drawn[1].properties).toMatchObject({ layer: TREE_ZONE_LAYER, confidence: 'low' })
    expect(drawn[1].properties.confidence_notes).toMatch(/drawn by hand/i)
    for (const scored of ['tree_suitability_score', 'rank', 'hydric_overlap_factor', 'slope_factor']) {
      expect(drawn[1].properties).not.toHaveProperty(scored)
    }
    await ui.unmount()
  })

  it('is the ONE clip, shared: landform still reads its gates through the same function', () => {
    // Generalised, not forked. Landform's grounds are its exclusion gates
    // with the data_available rule applied in the adapter; trees' are the
    // payload's list as shipped; the clip reads {type, label, geometry_wgs84}
    // and nothing else.
    const grounds = exclusionGrounds(captured.payload.exclusion_layers)
    expect(grounds.map((g) => g.type)).toEqual(['canopy', 'slope', 'hydric', 'roads', 'setback'])
    for (const g of grounds) expect(Object.keys(g).sort()).toEqual(['geometry_wgs84', 'label', 'type'])
    const unavailable = exclusionGrounds([
      { type: 'hydric', label: 'wet (hydric) soil', data_available: false, geometry_wgs84: null },
      { type: 'slope', label: 'slope above 20.0%', data_available: true, geometry_wgs84: null },
    ])
    expect(unavailable).toEqual([])
    for (const g of GROUNDS) expect(Object.keys(g).sort()).toEqual(['geometry_wgs84', 'label', 'type'])
  })
})

/* ===========================================================================
   3. NO HYDRIC OR SLOPE CAUTION -- with a control
   =========================================================================== */

describe('3. a drawn zone on hydric, steep ground records no caution for either', () => {
  it('reports neither for the captured hydric ring, where landform reports both', () => {
    // THE CONTROL: the same ring, clamped to the same parcel, against
    // LANDFORM's grounds trips the hydric gate (landform.test.jsx section 4
    // commits it with that crossing recorded) -- so the ring IS on hydric
    // ground and the trees answer below is a decision, not an accident.
    const { multi } = clampToBoundary(HYDRIC_RING, BOUNDARY)
    const onLandform = cautionsFor(multi, exclusionGrounds(captured.payload.exclusion_layers))
    expect(onLandform.map((c) => c.type)).toContain('hydric')

    // TREES: the committed production areas and water zone of the captured
    // session (its document, as the store would hold it) are the grounds.
    // The captured session's committed production areas as the ONE ground
    // its payload would ship for them (one geometry per ground); no water
    // zone, no road, and the captured canopy gate as the canopy ground.
    const committed = captured.document_committed.steps.landform.features.features
    const canopyGate = captured.payload.exclusion_layers.find((layer) => layer.type === 'canopy')
    const references = {
      [TREES_GROUNDS_LAYER]: [
        {
          type: 'production',
          label: 'committed production area',
          geometry_wgs84: {
            type: 'MultiPolygon',
            coordinates: committed.flatMap((feature) => toMultiPolygon(feature.geometry)),
          },
        },
        { type: 'canopy', label: canopyGate.label, geometry_wgs84: canopyGate.geometry_wgs84 },
      ],
    }
    const live = TREES_SHAPE.live({ points: HYDRIC_RING, parcel: BOUNDARY, references })
    const closed = TREES_SHAPE.close({ points: HYDRIC_RING, parcel: BOUNDARY, references })
    for (const cautions of [live, closed.feature.properties.cautions]) {
      expect(cautions.map((c) => c.type)).not.toContain('hydric')
      expect(cautions.map((c) => c.type)).not.toContain('slope')
      for (const c of cautions) expect(TREE_CROSSING_GROUND_TYPES).toContain(c.type)
    }
    console.log(
      `HYDRIC RING  landform ${JSON.stringify(onLandform.map((c) => c.type))}` +
        `  trees ${JSON.stringify(closed.feature.properties.cautions.map((c) => c.type))}`
    )
  })

  /**
   * [frontend test 2] THE DISPLAY-ONLY OUTLINE CHANGES NO CAUTION -- BYTE FOR
   * BYTE.
   *
   * WHAT THE FIELD IS. Production and tree zones are unions of 5 m DEM cells,
   * so their edges are pixel staircases; the server now ships a SMOOTHED
   * rendering of each one beside the geometry, and layers.jsx draws that
   * instead. It is display only: every measurement -- the clamp, the
   * crossings, the acreage, the commit body -- reads `geometry`.
   *
   * THE FAILURE THIS FORECLOSES is the exact one the crossing-grounds work
   * closed from the other side. If the map DREW the smoothed ring while the
   * cautions were clipped against the unsmoothed one, a drawn zone could
   * visually miss a crossing it records -- the client and the server
   * disagreeing about the same shape again.
   *
   * SO IT IS ASSERTED AS AN IDENTITY, NOT AS AN ABSENCE. The whole draw is
   * run twice over the same ring: once with every feature and every ground
   * carrying the property, once with it stripped everywhere. Same clamped
   * geometry, same live cautions, same closed feature, same JSON.
   *
   * AND WITH A CONTROL, so the identity is a measurement. The smoothed ring
   * put through the same clip gives a DIFFERENT answer -- so a reader that had
   * wired the display field into the caution path would have been caught here
   * rather than agreeing by luck.
   */
  it('records byte-identical cautions with and without the display-only outline', () => {
    const committed = captured.document_committed.steps.landform.features.features
    const canopyGate = captured.payload.exclusion_layers.find((layer) => layer.type === 'canopy')
    const productionGround = {
      type: 'production',
      label: 'committed production area',
      geometry_wgs84: {
        type: 'MultiPolygon',
        coordinates: committed.flatMap((feature) => toMultiPolygon(feature.geometry)),
      },
    }
    const grounds = [
      productionGround,
      { type: 'canopy', label: canopyGate.label, geometry_wgs84: canopyGate.geometry_wgs84 },
    ]

    // THE FIELD, AS THE SERVER SHIPS IT: a smoothed rendering of the same
    // shape, on every feature and on every ground object the step is handed.
    // Deliberately a VISIBLY DIFFERENT ring -- the whole parcel -- so that
    // anything reading it instead of `geometry` gives a wrong answer loudly.
    const OUTLINE_PROPERTY = 'display_only_smoothed_outline'
    const parcelRing = { type: 'Polygon', coordinates: [BOUNDARY.map(([lat, lng]) => [lng, lat])] }
    const withField = {
      [TREES_GROUNDS_LAYER]: grounds.map((ground) => ({
        ...ground,
        [OUTLINE_PROPERTY]: parcelRing,
      })),
    }
    const withoutField = { [TREES_GROUNDS_LAYER]: grounds }

    const args = (references) => ({ points: HYDRIC_RING, parcel: BOUNDARY, references })
    const liveWith = TREES_SHAPE.live(args(withField))
    const liveWithout = TREES_SHAPE.live(args(withoutField))
    const closedWith = TREES_SHAPE.close(args(withField))
    const closedWithout = TREES_SHAPE.close(args(withoutField))

    // NON-VACUOUS: the ring actually crosses something, so "identical" is a
    // statement about a real answer rather than about two empty lists.
    expect(liveWithout.length).toBeGreaterThan(0)

    // The MINTED ID is the one field that legitimately differs between two
    // draws -- it carries a timestamp and a random tail, by design -- so it is
    // normalised away and everything else is compared verbatim.
    const withoutId = ({ id, ...rest }) => JSON.stringify(rest)
    expect(JSON.stringify(liveWith)).toBe(JSON.stringify(liveWithout))
    expect(withoutId(closedWith.feature)).toBe(withoutId(closedWithout.feature))
    expect(JSON.stringify(closedWith.multi)).toBe(JSON.stringify(closedWithout.multi))
    // AND THE COMMIT BODY CARRIES NO TRACE OF IT: the drawn feature the client
    // authors has its own properties and this is not one of them.
    expect(closedWith.feature.properties).not.toHaveProperty(OUTLINE_PROPERTY)

    // THE CONTROL. Clipping the SAME ring against the smoothed stand-in
    // instead of the real ground gives a different answer -- so the identity
    // above is a measurement of what the caution path reads, not a
    // coincidence of two shapes that happen to agree.
    const { multi } = clampToBoundary(HYDRIC_RING, BOUNDARY)
    const real = cautionsFor(multi, grounds)
    const smoothedInstead = cautionsFor(
      multi,
      grounds.map((ground) => ({ ...ground, geometry_wgs84: parcelRing }))
    )
    expect(JSON.stringify(smoothedInstead)).not.toBe(JSON.stringify(real))
    console.log(
      `DISPLAY OUTLINE  cautions ${JSON.stringify(liveWith.map((c) => [c.type, c.acres]))} ` +
        `with the field and without it; reading it instead would have given ` +
        `${JSON.stringify(smoothedInstead.map((c) => [c.type, c.acres]))}`
    )
  })

  it('has no hydric or slope ground to measure against, by declaration', () => {
    // Not "the grounds happened to be clear": the step declares no such
    // ground, so no drawn zone anywhere can be warned about the ground the
    // step exists to find.
    for (const type of TREE_CROSSING_GROUND_TYPES) {
      expect(['hydric', 'slope']).not.toContain(type)
    }
    // And the definition's own text never wires one in.
    const source = readFileSync(path.join(SRC, 'wizard', 'stepDefinitions.js'), 'utf8')
    const section = source.slice(source.indexOf('   THE TREES STEP\n'), source.indexOf('The registry, and the order steps run in'))
    expect(section).not.toMatch(/type: 'hydric'/)
    expect(section).not.toMatch(/type: 'slope'/)
  })
})

/* ===========================================================================
   4. THE SENTINEL PATH IS IN THE FACTOR ROWS
   =========================================================================== */

describe('4. a factor whose gate is false renders an em dash', () => {
  it('never prints the neutral default as a measurement', () => {
    // THE BACKEND'S OWN CASE: prime-farmland data unavailable, so
    // soil_marginality_factor is _NEUTRAL_FACTOR_VALUE (0.5) and the row
    // would read 50.0 -- indistinguishable from a measured 50.0 without the
    // gate. The payload says the gate is false; the row says nothing.
    const payload = treesPayload({
      gates: { soil_marginality_data_available: false, hydric_data_available: true, stream_data_available: true },
    })
    payload.zones[0].factors.soil_marginality = 50
    payload.tree_zones.features[0].properties.soil_marginality_factor = 0.5
    payload.tree_zones.features[0].properties.soil_marginality_data_available = false

    const detail = TREES_STEP.detail(contextOver(payload), ZONE_A)
    const merits = detail.groups.find((g) => g.id === 'merits')
    const soil = merits.fields.find((f) => f.label.startsWith('poor farmland'))
    expect(soil.value).toBe('—')
    expect(soil.measured).toBe(true)
    expect(soil.value).not.toBe('50.0')
    expect(soil.value).not.toBe('0.5')
    // The measured factors still print.
    expect(merits.fields.find((f) => f.label.startsWith('wet ground')).value).toBe('60.0')
    expect(merits.fields.find((f) => f.label.startsWith('steep ground')).value).toBe('48.0')

    // EVERY GATE, INDEPENDENTLY. Each false flag blanks exactly its own row.
    for (const factor of TREE_FACTORS.filter((f) => f.gate)) {
      const gates = { soil_marginality_data_available: true, hydric_data_available: true, stream_data_available: true }
      gates[factor.gate] = false
      const rows = TREES_STEP.detail(contextOver(treesPayload({ gates })), ZONE_A).groups.find((g) => g.id === 'merits').fields
      for (const row of rows) {
        const own = row.label.startsWith(factor.label)
        expect(row.value === '—', `${row.label} with ${factor.gate}=false`).toBe(own)
      }
    }
    // SLOPE HAS NO GATE and is always a measurement.
    expect(TREE_FACTORS.find((f) => f.key === 'slope').gate).toBeNull()
    expect(treeFactorField(TREE_FACTORS[1], { factors: { slope: 0 } }, {}, {}).value).toBe('0.0')
  })

  it('says so at the step level too, in consequence terms and keyed on the flag', () => {
    const payload = treesPayload({
      gates: { soil_marginality_data_available: false, hydric_data_available: false, stream_data_available: true },
    })
    const notices = TREES_STEP.notices(contextOver(payload))
    const keys = notices.map((n) => n.key)
    expect(keys).toContain('unchecked-hydric_data_available')
    expect(keys).toContain('unchecked-soil_marginality_data_available')
    expect(keys).not.toContain('unchecked-stream_data_available')
    const hydric = notices.find((n) => n.key === 'unchecked-hydric_data_available')
    expect(hydric.tone).toBe('caution')
    const text = hydric.text.map((part) => part.measure ?? part).join('')
    expect(text).toMatch(/wet ground/)
    expect(text).toContain('40% of every score')
    // The share is a MEASURED part, off the payload, not prose.
    expect(hydric.text.some((part) => part.measure === '40')).toBe(true)
  })
})

/* ===========================================================================
   5. A DRAWN ZONE SHOWS ABSENCE, NOT ZEROS
   =========================================================================== */

describe('5. a drawn zone shows its factors absent', () => {
  it('renders no factor group, no zero, and says why', () => {
    const drawn = TREES_SHAPE.close({ points: CLEAR, parcel: RING, references: {} }).feature
    const detail = TREES_STEP.detail(contextOver(treesPayload(), { drawnFeatures: [drawn] }), drawn.id)
    expect(detail.name).toBe('Drawn tree zone')
    expect(detail.groups).toBeUndefined()
    const labels = detail.fields.map((f) => f.label)
    for (const factor of TREE_FACTORS) {
      expect(labels.some((label) => label.startsWith(factor.label)), `no ${factor.label} row`).toBe(false)
    }
    for (const field of detail.fields) {
      expect(field.value).not.toBe('0.0')
      expect(field.value).not.toBe('0')
    }
    expect(detail.fields.find((f) => f.label === 'score').value).toBe('—')
    expect(detail.fields.find((f) => f.label === 'scoring').value).toMatch(/not scored/)
    expect(detail.fields.find((f) => f.label === 'acres').measured).toBe(true)
    // And the tab prints the same absence.
    const tab = TREES_STEP.tabs(contextOver(treesPayload(), { drawnFeatures: [drawn] })).find((t) => t.id === drawn.id)
    expect(tab.rows.find((r) => r.label === 'score').value).toBe('—')
    expect(tab).toMatchObject({ drawn: true, checkbox: true, removable: true })
  })

  it('renders the absence in the panel', async () => {
    const { ui } = await generatedTrees()
    await ui.draw(CLEAR)
    const drawn = selectDraft(ui.state, 'trees').drawnFeatures[0]
    await ui.focus(drawn.id)
    expect(ui.text('detail-name-trees')).toBe('Drawn tree zone')
    expect(ui.find('detail-fields-merits')).toBeNull()
    expect(ui.text('detail-value-score')).toBe('—')
    expect(ui.text('detail-value-scoring')).toMatch(/not scored/)
    await ui.unmount()
  })
})

/* ===========================================================================
   6, 7. NOTHING IS HIGHLIGHTED, AND THE SEARCH SPACE RENDERS NOTHING
   =========================================================================== */

describe('6 & 7. no eligible highlight, the off-parcel scrim, and the search space renders nothing', () => {
  it('declares the off-parcel scrim, no highlight, and no layer over the search space', () => {
    // THE SCRIM IS NOT AN ELIGIBILITY MASK. It marks what is not the user's
    // land at all, which is true at every step, and matters most on the
    // step worked right up against the parcel edge.
    expect(TREES_STEP.layers.filter((layer) => layer.kind === 'scrim').map((layer) => layer.id)).toEqual([
      'trees-offparcel',
    ])
    for (const layer of TREES_STEP.layers) {
      expect(layer.kind).not.toBe('highlight')
      expect(layer.key).not.toBe('search_space')
    }
    expect(TREES_STEP.layers.filter((l) => l.kind === 'polygon').map((l) => l.id)).toEqual([
      'trees-candidates',
      'trees-drawn',
      'trees-committed',
    ])
  })

  it('draws candidates, drawn zones and the prior commits -- and nothing else', async () => {
    const { ui } = await generatedTrees()
    await ui.draw(CLEAR)

    // THE PANES: the scrim, no highlight, no search space.
    expect(ui.all('.stack-layer--kind-scrim')).toHaveLength(1)
    expect(ui.all('.stack-layer--kind-scrim path')).toHaveLength(1)
    expect(ui.all('.stack-layer--kind-highlight')).toHaveLength(0)
    expect(ui.all('[class*="search"]')).toHaveLength(0)
    // The search space polygon is in the payload and on no path.
    expect(ui.trees.search_space.features).toHaveLength(1)
    const panes = ui.all('.stack-layer').map((pane) => pane.className.match(/leaflet-([a-z-]+)-pane/)?.[1])
    // The grounds are a pane too -- a reference layer's pane exists and
    // paints nothing, which is how landform's exclusion gates have always
    // been carried. The boundary is the parcel every band sits in.
    expect(panes.sort()).toEqual(
      [
        'trees--trees-offparcel',
        'trees--trees-grounds',
        'boundary--boundary-committed',
        'landform--landform-committed',
        'water--water-committed-embankment',
        'roads--roads-committed',
        'roads--roads-committed-access-point',
        'trees--trees-candidates',
        'trees--trees-drawn',
      ].sort()
    )
    // Every path on the map is a tree zone in its band, a prior commit, or a
    // road; the search space's box is none of them.
    const candidatePaths = ui.all('.leaflet-trees--trees-candidates-pane path')
    expect(candidatePaths).toHaveLength(2)
    for (const el of candidatePaths) expect(el.classList.contains('zone--tree')).toBe(true)
    expect(ui.all('.leaflet-trees--trees-drawn-pane path.zone--drawn')).toHaveLength(1)
    // And the two ground panes paint nothing.
    expect(ui.all('.stack-layer--kind-reference path')).toHaveLength(0)
    await ui.unmount()
  })

  /**
   * THE TREE MARK IS PRODUCTION'S HATCH, MIRRORED -- and the stipple is gone,
   * not layered underneath it.
   *
   * WHY THE MARK MOVED. A dot field said "not water", which was a real
   * problem and the wrong pair to solve for. Production and trees are the two
   * CROPS, and the two layers that legitimately share ground -- production is
   * one of trees' four crossing grounds -- so the pair that has to read as a
   * pair is this one. A ruled field mirrored about the vertical is how a map
   * has always said "the same kind of ground, the other crop".
   *
   * NO OUTLINE, AS A CONSEQUENCE. marksItsOwnEdge() draws an edge for marks
   * whose extent cannot be inferred (a wash has no gaps; a fine dot field's
   * edge is where the density falls off). A hatch's extent is where the ruling
   * stops. Trees inherits production's no-edge rule by becoming a hatch,
   * which is the rule the map has always wanted for a recommendation.
   */
  it('carries the tree mark: production\'s hatch mirrored, in --tree, with no stipple left', () => {
    const mark = zoneMark('tree')
    expect(mark.kind).toBe('pattern')
    expect(mark.fill).toBe('url(#zone-pattern-tree)')
    // A HATCH DRAWS NO EDGE, in any state, on any band.
    expect(mark.stroke).toBeNull()
    expect(marksItsOwnEdge(mark)).toBe(false)
    for (const layer of TREES_STEP.layers.filter((l) => l.kind === 'polygon')) {
      expect(layer.treatment).toBe('tree')
    }

    // THE STIPPLE IS GONE FROM THE TABLE, not merely unreferenced: the mark
    // source names no dot field for trees, and the one stipple row left is
    // water's excavated type.
    const marks = readFileSync(path.join(SRC, 'ProductionHatchPattern.jsx'), 'utf8')
    const treeRow = marks.slice(marks.indexOf("treatment: 'tree'"))
    expect(treeRow.slice(0, treeRow.indexOf('}'))).not.toMatch(/stipple|grid|radius|tile/)
    expect(zoneMark('survey-excavated').kind).toBe('stipple')
  })

  /**
   * [frontend test 4] THE OPPOSITE DIAGONAL, AT PRODUCTION'S SPACING --
   * asserted on the PATTERN CHROMIUM WOULD PAINT, not on the table it came
   * from. injectZonePatterns() writes both <pattern> defs; the two are read
   * back and compared.
   *
   * MIRRORED, MEASURED AS A MIRROR. The tree tile's path must be production's
   * reflected in y about the tile's own centre line -- so every point (x, y)
   * on one has (x, size - y) on the other. That is a stronger statement than
   * "the numbers differ": it fails a tile drawn at some other angle, and it
   * fails one drawn at the right angle but a different phase.
   *
   * AND THE SAME PITCH. Same tile size, same stroke width -- the spacing is
   * what makes the two one family, and the mirror is what tells them apart.
   */
  it('rules the tree hatch on the opposite diagonal at production\'s spacing', () => {
    const teardown = injectZonePatterns(document.body)
    try {
      const tileOf = (treatment) => {
        const pattern = document.getElementById(`zone-pattern-${treatment}`)
        const path = pattern.querySelector('path')
        return {
          size: [pattern.getAttribute('width'), pattern.getAttribute('height')].map(Number),
          weight: Number(path.getAttribute('stroke-width')),
          stroke: path.getAttribute('stroke'),
          points: path
            .getAttribute('d')
            .split(/[ML]\s*/)
            .filter(Boolean)
            .map((pair) => pair.trim().split(',').map(Number)),
        }
      }
      const production = tileOf('production')
      const tree = tileOf('tree')

      // SAME PITCH, SAME WEIGHT. The tile IS the spacing for a hatch.
      expect(tree.size).toEqual(production.size)
      expect(tree.weight).toBe(production.weight)
      const [size] = production.size

      // OPPOSITE DIAGONAL, as an exact reflection in y.
      expect(tree.points).toHaveLength(production.points.length)
      for (const [index, [x, y]] of production.points.entries()) {
        expect([x, y], `point ${index} mirrors`).toEqual([tree.points[index][0], size - tree.points[index][1]])
      }
      // AND THE TWO ARE NOT THE SAME RULING -- the mirror is a real one, so a
      // tile that happened to be symmetric would fail here.
      expect(tree.points).not.toEqual(production.points)

      // Each in its own colour, read from its own token.
      expect(production.stroke).toBe(document.documentElement.style.getPropertyValue('--oxide'))
      expect(tree.stroke).toBe(document.documentElement.style.getPropertyValue('--tree'))
      console.log(
        `TREE HATCH  ${size}px pitch, ${tree.weight}px stroke, both -- ` +
          `production ${JSON.stringify(production.points)} tree ${JSON.stringify(tree.points)}`
      )
    } finally {
      teardown()
    }
  })

  /**
   * [frontend test 6] THE THREE LEVELS STILL HOLD FOR THE TREE MARK.
   *
   * A hatch is ink at full strength and takes the --pattern-* scale, which is
   * what the mark was already on as a stipple (see fillLevelFor's note) -- so
   * the levels are inherited rather than re-tuned. What is asserted here is
   * that they are still THREE DISTINCT, ORDERED values and that the tree mark
   * is on that scale and not on the wash's.
   */
  it('keeps the three pattern levels for the tree mark', () => {
    const level = (name) => Number(document.documentElement.style.getPropertyValue(`--pattern-${name}`))
    const [committed, active, focused] = ['committed', 'active', 'focused'].map(level)
    expect(committed).toBeGreaterThan(0)
    expect(committed).toBeLessThan(active)
    expect(active).toBeLessThan(focused)
    // A hatch is ink, so it is on the pattern scale -- never the tint scale.
    expect(zoneMark('tree').kind).not.toBe('tint')
    console.log(
      `TREE LEVELS  committed ${committed} active ${active} focused ${focused} (--pattern-*)`
    )
  })

  /**
   * [test 5] --tree IS TOLD FROM --field. Green as map geometry is within
   * the rule (green is never a control) -- but --field is also green and
   * also map geometry, the boundary ring, and a tree zone drawn against the
   * parcel edge runs its outline beside that ring. So the two are held apart
   * by a MEASURED ratio, not only by hue: the same reading water.test.jsx
   * holds its two blues to.
   */
  it('holds --tree at least 2:1 from --field, and reports the ratio', () => {
    const token = (name) => document.documentElement.style.getPropertyValue(name).trim()
    const luminance = (hex) => {
      const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
      const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const ratio = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    const tree = token('--tree')
    const field = token('--field')
    expect(tree).toMatch(/^#[0-9a-f]{6}$/i)
    const treeVsField = ratio(tree, field)
    const treeVsHalo = ratio(tree, token('--halo'))
    const treeVsExcavated = ratio(tree, token('--survey-excavated'))
    console.log(
      `TREE MARK  --tree ${tree} vs --field ${field} ${treeVsField.toFixed(2)}:1  ` +
        `vs --halo ${treeVsHalo.toFixed(2)}:1  vs --survey-excavated ${treeVsExcavated.toFixed(2)}:1`
    )
    expect(treeVsField, '--tree must be told from --field by value').toBeGreaterThanOrEqual(2.0)
    // And it still holds on its own over the halo's value, uncased.
    expect(treeVsHalo).toBeGreaterThanOrEqual(3.0)
  })
})

/* ===========================================================================
   8. THE WEIGHTS COME OFF THE PAYLOAD
   =========================================================================== */

describe('8. the factor weights come from the payload', () => {
  it('labels and orders the rows by the weights the payload carries', () => {
    const weights = { hydric_overlap: 15, slope: 25, soil_marginality: 5, stream_proximity: 55 }
    const detail = TREES_STEP.detail(contextOver(treesPayload({ weights })), ZONE_A)
    const rows = detail.groups.find((g) => g.id === 'merits').fields
    expect(rows.map((r) => r.label)).toEqual([
      'near a stream · 55% of the score',
      'steep ground · 25% of the score',
      'wet ground · 15% of the score',
      'poor farmland · 5% of the score',
    ])
    expect(treeFactorsByWeight(weights).map((f) => f.key)).toEqual([
      'stream_proximity',
      'slope',
      'hydric_overlap',
      'soil_marginality',
    ])
    // The credit is the row's figure, the share is on the label, and both
    // are the payload's.
    expect(rows[0]).toMatchObject({ value: '12.0', measured: true })
  })

  it('writes down no weight of its own', () => {
    const source = readFileSync(path.join(SRC, 'wizard', 'stepDefinitions.js'), 'utf8')
    const section = source.slice(source.indexOf('   THE TREES STEP\n'), source.indexOf('The registry, and the order steps run in'))
    expect(section.length).toBeGreaterThan(1000)
    // No 40, 30, 20 or 10 anywhere in the trees section -- not as a literal,
    // not in a comment, not as a default.
    expect(section.match(/\b(40|30|20|10)\b/g) ?? []).toEqual([])
    // Nor the floor.
    expect(section).not.toMatch(/\b31(\.0)?\b/)
  })

  it('explains what drove the score and what the floor was, off the payload', () => {
    const detail = TREES_STEP.detail(contextOver(treesPayload()), ZONE_A)
    const zone = detail.groups.find((g) => g.id === 'zone').fields
    expect(zone.find((f) => f.label === 'score floor')).toMatchObject({ value: '31.0', measured: true })
    expect(zone.find((f) => f.label === 'score')).toMatchObject({ value: '58.3', measured: true })
    expect(zone.find((f) => f.label === 'position').value).toBe('north')
    expect(zone.find((f) => f.label === 'position').measured).toBeFalsy()
    expect(detail.groups.find((g) => g.id === 'merits').label).toBe('What earned the score')

    // THE STEP-LEVEL FIGURES: the ground that was scored, measured.
    const notices = TREES_STEP.notices(contextOver(treesPayload()))
    const space = notices.find((n) => n.key === 'search-space')
    expect(space.text.map((p) => p.measure ?? p).join('')).toBe(
      'After production, water and roads, 26.3 of the parcel’s 40.2 acres were left to score.'
    )
    // And a generate that found nothing names the floor it applied.
    const none = TREES_STEP.notices(contextOver(treesPayload({ candidates: 0 })))
    const empty = none.find((n) => n.key === 'no-candidates')
    expect(empty.tone).toBe('caution')
    expect(empty.text.map((p) => p.measure ?? p).join('')).toContain('scored 31.0 or better')
  })
})

/* ===========================================================================
   11. THE SCHEMA
   =========================================================================== */

describe('11. the schema: what the definition declares, and the sweep', () => {
  it('is landform-shaped: select, draw, delete; multiple; no accumulate; the trees collection', () => {
    expect(STEP_DEFINITIONS.map((d) => d.id)).toEqual(['boundary', 'landform', 'water', 'roads', 'trees'])
    expect(TREES_STEP.tools).toEqual(['select', 'draw', 'delete'])
    expect(TREES_STEP.selection).toEqual({ mode: 'multiple', follows: null })
    expect(TREES_STEP.accumulate).toBeNull()
    expect(TREES_STEP.inputs).toEqual([])
    expect(TREES_STEP.proposalCollection).toBe('tree_zones')
    expect(TREES_STEP.generate.label).toBe('Generate tree zones')
    expect(TREES_STEP.generate.params({ inputs: {} })).toBeNull()
    expect(TREES_STEP.shape.close).toBe(TREES_SHAPE.close)
    expect(TREES_STEP.shape.live).toBe(TREES_SHAPE.live)
    expect(TREES_STEP.reopen).toEqual({ label: 'Edit this step', confirmTitle: 'Reopen trees?' })
    // The commit renames itself over an empty selection, and is never blocked.
    expect(TREES_STEP.commit.label({ committableCount: 0 })).toBe('Commit no tree zones')
    expect(TREES_STEP.commit.label({ committableCount: 2 })).toBe('Commit tree zones')
    expect(TREES_STEP.commit.canCommit({ committableCount: 0 })).toBe(true)
    // Landform's chrome shape exactly.
    expect(Object.keys(TREES_STEP.buttons).sort()).toEqual(Object.keys(LANDFORM_STEP.buttons).sort())
    expect(TREES_STEP.buttons.idle).toEqual([GENERATE_BUTTON])
    expect(TREES_STEP.buttons.reviewing.map((b) => b.key)).toEqual(['draw', 'commit'])
    expect(TREES_STEP.buttons.reviewing[1]).toBe(COMMIT_BUTTON)
    expect(TREES_STEP.buttons.editing.map((b) => b.key)).toEqual(['cancel'])
    expect(TREES_STEP.buttons.committed).toEqual([REOPEN_BUTTON])
    for (const state of MACHINE_STATES) expect(typeof TREES_STEP.instructions[state]).toBe('string')
    // The commit reads the trees collection, and only it.
    const payload = treesPayload()
    expect(registryProposalFeatures(payload, 'trees').map((f) => f.id)).toEqual([ZONE_A, ZONE_B])
    expect(() => registryProposalFeatures({ suggested_zones: { features: [] } }, 'trees')).toThrow(/tree_zones/)
  })

  it('declares no `step` on any layer: the grounds come off the payload, not another step\'s commit', () => {
    // The field that briefly let a reference layer read another step's
    // committed collection is gone with its only consumer. A layer is its
    // own step's, and the four grounds arrive under the trees payload.
    for (const definition of STEP_DEFINITIONS) {
      for (const layer of definition.layers) expect(layer).not.toHaveProperty('step')
    }
    const source = readFileSync(path.join(SRC, 'wizard', 'stepDefinitions.js'), 'utf8')
    expect(source).not.toMatch(/step: 'landform'/)
    const stack = readFileSync(path.join(SRC, 'map', 'layerStack.js'), 'utf8')
    expect(stack).not.toMatch(/layer\.step/)
  })

  it('composes the stack with the grounds resolved, the scrim, and the prior commits drawn', () => {
    const document = serverDocument({ trees: { status: GENERATED } })
    const state = {
      sessionId: 'sess-trees',
      document,
      stepOrder: [...STEP_ORDER],
      steps: Object.fromEntries(
        Object.entries(document.steps).map(([id, entry]) => [
          id,
          { ...entry, proposals: id === 'trees' ? treesPayload() : null, error: null },
        ])
      ),
      drafts: { trees: { selectedFeatureIds: [ZONE_A, ZONE_B], drawnFeatures: [], inputs: {}, seeded: true } },
      jobs: {},
    }
    const definitions = new Map(STEP_DEFINITIONS.map((d) => [d.id, d]))
    const stack = composeLayerStack({ state, definitions, cursorStepId: 'trees' })
    const references = stack.filter((l) => l.kind === 'reference')
    expect(references.map((l) => l.layerId)).toEqual([TREES_GROUNDS_LAYER])
    expect(references[0].data.map((g) => g.type)).toEqual(['production', 'water', 'road', 'canopy'])
    expect(stack.filter((l) => l.band === 'committed').map((l) => l.stepId)).toEqual([
      'boundary',
      'landform',
      'water',
      'roads',
      'roads',
    ])
    expect(stack.filter((l) => l.kind === 'scrim').map((l) => l.layerId)).toEqual(['trees-offparcel'])
    expect(stack.filter((l) => l.kind === 'highlight')).toEqual([])
  })

  it('says what a reset costs, in its own terms', () => {
    const state = {
      steps: {
        trees: {
          ...committedStep(1, [
            { type: 'Feature', id: 'a', properties: {}, geometry: null },
            { type: 'Feature', id: 'b', properties: {}, geometry: null },
          ]),
          provenance: { a: 'generated', b: 'user_added' },
        },
      },
    }
    const note = TREES_STEP.resetNote(state)
    expect(note.map((p) => p.measure ?? p).join('')).toBe('2 committed tree zones, 1 of them drawn by hand')
    expect(TREES_STEP.resetNote({ steps: { trees: committedStep(1, []) } })).toBe(
      'the decision to plant no tree crop on this parcel'
    )
  })

  it('keeps every shell component free of the step id', () => {
    for (const file of [
      'wizard/WizardShell.jsx',
      'wizard/WizardCursor.jsx',
      'wizard/useStepMachine.js',
      'wizard/shell/TabStrip.jsx',
      'wizard/shell/DetailPanel.jsx',
      'wizard/shell/ActionBanner.jsx',
      'wizard/shell/InstructionBar.jsx',
      'wizard/shell/chromeState.js',
      'map/layerStack.js',
      'map/layers.jsx',
      'map/StepTools.jsx',
      'map/tools/DrawGesture.jsx',
      'map/CautionMarkers.jsx',
      'zoneGeometry.js',
    ]) {
      const code = readFileSync(path.join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      expect(code, `${file} names 'trees'`).not.toMatch(/['"`.]trees\b/)
      expect(code, `${file} names 'tree_zone'`).not.toMatch(/tree_zone/)
    }
  })
})
