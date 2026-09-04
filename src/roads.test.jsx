/**
 * roads.test.jsx
 *
 * THE ROADS STEP: the third definition, and the first that ACCUMULATES
 * candidates across generates, COLLECTS AN INPUT, and treats the eye as a
 * RADIO. Every one of those was a place the step schema had no word, and the
 * word was added to the schema (stepDefinitions.js, LAYER SCHEMA items 6-11)
 * rather than the shell learning which step it was rendering.
 *
 * HOW TO RUN THE END-TO-END SECTIONS:
 *
 *     cd ../keyline-designer && python serve_test_backend.py 5099 &
 *     VITE_API_URL=http://127.0.0.1:5099 npx vitest run src/roads.test.jsx
 *
 * SKIPPED, NOT FAILED, WITH NO SERVER -- water.test.jsx's posture. Every
 * section that needs no server (the radio, the visibility exception, the
 * markers, the bare-map click, the committed dim, the inputs guard, the
 * sentinels, the sweep) runs either way, over a hand-built payload in the
 * backend's own shape.
 *
 * THE ACCESS POINTS BELOW WERE SURVEYED against the live backend's own
 * fixture (test_step_commit's DEM, the reference parcel) with ONE water zone
 * committed. With every zone committed the pond exclusion covers the ground
 * the router needs and every edge routes nothing -- so the end-to-end flow
 * commits water with one zone, which is also the multi-select decision the
 * water step exists to record. Each of the four routes a DIFFERENT network:
 * A on the west edge (four branches), B on the north edge (four), D beside
 * it (six, and the one the cap test fills its freed slot with), and C on the
 * north-east edge a trunk alone.
 *
 * RE-SURVEYED FOR THIS BRANCH'S ROUTING CONSTANTS, and one of the four had
 * to move -- see the note on ACCESS_C. A survey is only true of the numbers
 * it was taken under.
 *
 * Sections (the branch's numbered tests in brackets):
 *   1  [1]  END TO END: place -> generate -> tab; add a second; both tabs,
 *           both markers; focus each; commit one; the document carries it.
 *   2  [2]  NOT ARMED ON ENTRY; "Add access point" arms it.
 *   3  [3]  THE CAP: a fourth add is refused, and the UI says why.
 *   4  [4]  DISCARD calls the server verb and frees a slot.
 *   5  [5]  RADIO EYE: turning on network 2 turns off network 1.
 *   6  [6]  ONLY THE FOCUSED NETWORK IS DRAWN; the others are absent.
 *   7  [7]  MARKERS PERSIST whatever the focus or the eye.
 *   8  [8]  A MARKER CLICK focuses its network, as its tab does.
 *   9  [9]  BARE-MAP CLICK: markers and tabs stay, no network is drawn.
 *  10 [10]  THE COMMITTED NETWORK renders dimmed and persists.
 *  11 [11]  INPUTS: the body carries access_points; a missing one refuses.
 *  12 [12]  REOPEN restores every candidate with the prior selection.
 *  13 [13]  SENTINELS: a null grade renders an em dash, never 0.0.
 *  14       THE SCHEMA: what the definition declares, and the sweep.
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
  SessionProvider,
  buildCommitBody,
  selectDraft,
  selectStepFeatures,
  selectFailedLayer,
  selectNoCandidate,
  selectStepInputs,
  selectStepStatus,
  useSession,
} from './session/SessionStore'
import { API_URL } from './session/apiClient'
import {
  ACCESS_POINTS_LIST,
  ACCESS_POINT_INPUT,
  COMMIT_BUTTON,
  LAYER_KINDS,
  LAYER_SHOW,
  MAX_ROAD_NETWORKS,
  ROADS_STEP,
  STEP_DEFINITIONS,
  accessPointParams,
  commitInputsFor,
  defineStep,
  documentStep,
  measure,
  recordedAccessPoints,
  registryProposalFeatures,
  requiredInputsMissing,
  roadNetworkName,
  roadNetworks,
} from './wizard/stepDefinitions'
import { GENERATING, MACHINE_STATES, REVIEWING } from './wizard/useStepMachine.js'
import { selectionAfterEye, tabIsFocused } from './wizard/shell/TabStrip.jsx'
import { resetStepCatalog } from './wizard/stepCatalog.jsx'
import WizardShell from './wizard/WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './wizard/WizardCursor.jsx'
import MapLayerStack from './map/MapLayerStack.jsx'
import { visibleFeatures } from './map/layers.jsx'
import { DrawingProgressProvider } from './map/DrawingProgress.jsx'
import { zoneMark } from './ProductionHatchPattern.jsx'
import rings from './fixtures/rings.json'

const SRC = path.dirname(fileURLToPath(import.meta.url))

const toLatLng = (ring) => ring.map(([lng, lat]) => [lat, lng])
const BOUNDARY = toLatLng(rings.boundary)

/* THE FOUR SURVEYED ACCESS POINTS, [lat, lng] as a map click delivers them,
   each exactly on the parcel's edge. See the header.

   C MOVED, AND THE OLD ONE IS WHY THIS SURVEY HAD TO BE RE-RUN. It was
   [40.6434565, -79.9825183], and against this same server it now routes
   NOTHING: PRODUCTION_SERVICE_RADIUS_METERS is 25 m rather than 100, so a
   road cell serves a sixteenth of the ground it used to, and the cheapest
   extension from that point already costs more per acre than the router will
   pay. The generate fails with `no_candidate` instead of returning a
   network -- correctly -- and a test that waits for a tab from it waits
   forever. So the ring was swept again with ONE water zone committed, the
   configuration these sections actually drive, and C is now a point that
   routes a trunk alone. A, B and D were re-measured and still route. */
const ACCESS_A = [40.6434533, -79.9836992]
const ACCESS_B = [40.6458784, -79.9829624]
const ACCESS_C = [40.6450957852739, -79.9813830891847]
const ACCESS_D = [40.6458453, -79.98361]

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
  // AND THE ALIASES. A token in :root may be another token rather than a
  // literal -- `--road: var(--ink)` is one, deliberately, so the road line is
  // a REFERENCE to the ink and not a fourth brown to keep in step by hand.
  // jsdom does not resolve var() in a computed custom property, so the two
  // passes above would leave an aliased token unset here and every reader of
  // it reading ''. Resolved in source order against what is already set,
  // which is enough because :root defines a token before it aliases it.
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
   The surface
   --------------------------------------------------------------------------- */

const mounted = []

async function renderApp({ center = BOUNDARY[0], definitions } = {}) {
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
        <WizardCursorProvider {...(definitions ? { definitions } : {})}>
          <DrawingProgressProvider>
            <Probe />
            <MapContainer center={center} zoom={17} style={{ height: 600, width: 600 }}>
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
    /**
     * The store's actions, UNWRAPPED.
     *
     * `run` below wraps a call in React.act and AWAITS it, which is right for
     * an action that settles on its own. It deadlocks on one that is
     * deliberately held open -- a generate whose job stays `running` until the
     * test releases it -- because the assertions that have to happen DURING it
     * would be a second, overlapping act(). Those tests start the call here
     * and drive the clock with waitFor, which does its ticking inside act.
     */
    get actions() {
      return session.actions
    },
    get map() {
      return map
    },
    get roads() {
      return session.state.steps.roads?.proposals ?? null
    },
    get networks() {
      return roadNetworks(this.roads)
    },
    find: (id) => container.querySelector(`[data-testid="${id}"]`),
    text: (id) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? null,
    all: (selector) => [...container.querySelectorAll(selector)],
    /** The road branch lines drawn in a pane -- the coloured pass, not the casing. */
    drawnBranches: (paneClass) =>
      [...container.querySelectorAll(`.${paneClass} path.road--road`)].filter(
        (el) => !el.classList.contains('road--casing')
      ),
    markers: () => [...container.querySelectorAll('.access-point-marker')],
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
    /** A click on bare map, the way Leaflet delivers one to its listeners. */
    async clickMap(latlng = BOUNDARY[0]) {
      await React.act(async () => map.fire('click', { latlng: L.latLng(...latlng) }))
    },
    /** A DOM click on a marker's own element, which Leaflet turns into the marker's click. */
    async clickMarker(index) {
      const element = this.markers()[index]
      if (!element) throw new Error(`no access-point marker at index ${index}`)
      await React.act(async () => {
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
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
          `  roads=${selectStepStatus(this.state, 'roads')} ` +
          `error=${JSON.stringify(this.state.steps.roads?.error)}`
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
   The live flow up to the roads step
   --------------------------------------------------------------------------- */

/**
 * Boundary, landform generated and committed, water generated and committed
 * WITH ONE ZONE -- see the header for why one -- so the cursor lands on
 * roads with nothing placed and nothing armed.
 */
async function throughWaterCommit(ui) {
  await ui.run((a) => a.setDraftInput('boundary', 'ring', BOUNDARY))
  await ui.click('commit-boundary')
  await ui.waitFor('the session to exist', () => Boolean(ui.state.sessionId))

  await ui.click('generate-landform')
  await ui.waitFor('landform to generate', () => selectStepStatus(ui.state, 'landform') === GENERATED)
  await ui.waitFor('the landform draft', () => ui.state.drafts.landform !== undefined)
  await ui.click('commit-landform')
  await ui.waitFor('landform to commit', () => selectStepStatus(ui.state, 'landform') === COMMITTED)

  expect(ui.cursor.cursorStepId).toBe('water')
  await ui.click('generate-water')
  await ui.waitFor('water to generate', () => selectStepStatus(ui.state, 'water') === GENERATED)
  await ui.waitFor('the water draft', () => ui.state.drafts.water !== undefined)
  const zones = registryProposalFeatures(ui.state.steps.water.proposals, 'water')
  expect(zones.length).toBeGreaterThan(0)
  await ui.run((a) => a.setSelection('water', [zones[0].id]))
  await ui.click('commit-water')
  await ui.waitFor('water to commit', () => selectStepStatus(ui.state, 'water') === COMMITTED)
  expect(selectStepFeatures(ui.state, 'water').features).toHaveLength(1)

  expect(ui.cursor.cursorStepId).toBe('roads')
  return ui
}

/** Arm, click the boundary at `point`, and generate. Resolves when the network is in. */
async function placeAndGenerate(ui, point) {
  const before = ui.networks.length
  await ui.click('access-roads')
  expect(ui.cursor.armed).toBe('draw')
  await ui.clickMap(point)
  expect(selectDraft(ui.state, 'roads').inputs[ACCESS_POINT_INPUT]).toBeDefined()
  await ui.click('generate-roads')
  await ui.waitFor(
    `a network from ${point}`,
    () => ui.networks.length === before + 1 && ui.state.drafts.roads !== undefined
  )
  expect(ui.cursor.armed).toBeNull()
  return ui.networks[ui.networks.length - 1]
}

/* ===========================================================================
   1. END TO END
   =========================================================================== */

describe('1. end to end against the real backend', () => {
  liveIt(
    'places an access point, generates, adds a second, focuses each, commits one, and the document carries it',
    async () => {
      const ui = await renderApp()
      await throughWaterCommit(ui)

      // THE STEP OPENS WITH NO CANDIDATES AND NOTHING ARMED.
      expect(ui.networks).toEqual([])
      expect(ui.cursor.armed).toBeNull()
      expect(ui.all('[data-tab-id]')).toHaveLength(0)
      expect(ui.text('access-roads')).toBe('Add access point')

      // ONE POINT, ONE GENERATE, ONE NETWORK, ONE TAB.
      const first = await placeAndGenerate(ui, ACCESS_A)
      expect(first.network_found).toBe(true)
      expect(ui.all('[data-tab-id]')).toHaveLength(1)
      expect(ui.find(`tab-${first.network_id}`)).not.toBeNull()
      expect(ui.text(`tab-focus-${first.network_id}`)).toContain('Access point 1')
      // Placed and generated, the pending point is gone from the draft and
      // the server has recorded it.
      expect(selectDraft(ui.state, 'roads').inputs[ACCESS_POINT_INPUT]).toBeUndefined()
      expect(recordedAccessPoints(ui.state, 'roads')).toHaveLength(1)
      // The new network is focused and selected, so it is the one drawn.
      expect(ui.cursor.focusedFeatureId).toBe(first.network_id)
      expect(ui.drawnBranches('leaflet-roads--roads-networks-pane')).toHaveLength(
        first.feature_ids.length
      )

      // A SECOND POINT ACCUMULATES: both tabs, both markers, the first untouched.
      const firstBefore = JSON.stringify(ui.networks[0])
      const second = await placeAndGenerate(ui, ACCESS_B)
      expect(ui.networks).toHaveLength(2)
      expect(JSON.stringify(ui.networks[0])).toBe(firstBefore)
      expect(second.network_id).not.toBe(first.network_id)
      expect(ui.all('[data-tab-id]')).toHaveLength(2)
      expect(ui.markers().length).toBe(2)
      expect(recordedAccessPoints(ui.state, 'roads')).toHaveLength(2)

      // FOCUS EACH: the tab, then the marker, then the line -- one state.
      await ui.click(`tab-focus-${first.network_id}`)
      expect(ui.cursor.focusedFeatureId).toBe(first.network_id)
      expect(ui.find(`tab-${first.network_id}`).getAttribute('data-focused')).toBe('true')
      expect(ui.text('detail-name-roads')).toBe('Access point 1')
      await ui.click(`tab-focus-${second.network_id}`)
      expect(ui.find(`tab-${second.network_id}`).getAttribute('data-focused')).toBe('true')
      expect(ui.find(`tab-${first.network_id}`).getAttribute('data-focused')).toBe('false')
      expect(ui.text('detail-name-roads')).toBe('Access point 2')

      // THE RADIO: the first was seeded on; turning the second on turns it off.
      expect(ui.find(`tab-${first.network_id}`).getAttribute('data-eye')).toBe('on')
      expect(ui.find(`tab-${second.network_id}`).getAttribute('data-eye')).toBe('off')
      await ui.click(`tab-eye-${second.network_id}`)
      expect(ui.find(`tab-${second.network_id}`).getAttribute('data-eye')).toBe('on')
      expect(ui.find(`tab-${first.network_id}`).getAttribute('data-eye')).toBe('off')
      // ...and back, so the first is what commits.
      await ui.click(`tab-eye-${first.network_id}`)
      expect(ui.find(`tab-${first.network_id}`).getAttribute('data-eye')).toBe('on')
      expect(ui.find(`tab-${second.network_id}`).getAttribute('data-eye')).toBe('off')

      // THE BODY: the first network's branches, and EVERY access point tried.
      const body = buildCommitBody(ui.state, 'roads', registryProposalFeatures, {
        inputs: commitInputsFor(ROADS_STEP, { state: ui.state, stepId: 'roads', draft: selectDraft(ui.state, 'roads'), definition: ROADS_STEP }),
      })
      expect(body.features.features.map((f) => f.id).sort()).toEqual([...first.feature_ids].sort())
      expect(body.inputs[ACCESS_POINTS_LIST]).toHaveLength(2)
      expect(body.inputs[ACCESS_POINTS_LIST][0]).toEqual(first.access_point)
      expect(body.inputs[ACCESS_POINTS_LIST][1]).toEqual(second.access_point)

      expect(ui.text('commit-roads')).toBe('Commit this network')
      await ui.click('commit-roads')
      await ui.waitFor('roads to commit', () => selectStepStatus(ui.state, 'roads') === COMMITTED)

      // THE DOCUMENT CARRIES IT: the first network's branches, whole, and the
      // two access points as the step's inputs.
      const committed = selectStepFeatures(ui.state, 'roads')
      expect(committed.features.map((f) => f.id).sort()).toEqual([...first.feature_ids].sort())
      expect(new Set(committed.features.map((f) => f.properties.network_id))).toEqual(
        new Set([first.network_id])
      )
      expect(selectStepInputs(ui.state, 'roads')).toEqual({
        [ACCESS_POINTS_LIST]: [first.access_point, second.access_point],
      })
      // The cursor moved on, and the committed network is drawn in the
      // committed band, whole, with its access point.
      expect(ui.cursor.cursorStepId).toBe('trees')
      expect(ui.drawnBranches('leaflet-roads--roads-committed-pane')).toHaveLength(
        first.feature_ids.length
      )
      expect(ui.container.querySelectorAll('.access-point-marker--committed')).toHaveLength(1)

      await ui.unmount()
    }
  )
})

/* ===========================================================================
   2, 3, 4. NOT ARMED; THE CAP; DISCARD
   =========================================================================== */

describe('2. the tool is not armed on entry', () => {
  it('declares no auto-arming: the idle state offers one button and arms nothing', () => {
    expect(ROADS_STEP.buttons.idle.map((b) => b.key)).toEqual(['access'])
    expect(ROADS_STEP.tools).toEqual(['select', 'draw'])
  })

  liveIt('opens on roads with nothing armed, and "Add access point" arms the draw', async () => {
    const ui = await renderApp()
    await throughWaterCommit(ui)
    expect(ui.cursor.armed).toBeNull()
    expect(ui.text('armed-tool')).toBe('No map tool is active.')
    expect(ui.text('access-roads')).toBe('Add access point')
    await ui.click('access-roads')
    expect(ui.cursor.armed).toBe('draw')
    expect(ui.find('cancel-roads')).not.toBeNull()
    expect(ui.find('generate-roads').disabled).toBe(true)
    // A click off the boundary places nothing; one on it places the point.
    await ui.clickMap([40.6445, -79.982])
    expect(selectDraft(ui.state, 'roads').inputs[ACCESS_POINT_INPUT]).toBeUndefined()
    await ui.clickMap(ACCESS_A)
    expect(selectDraft(ui.state, 'roads').inputs[ACCESS_POINT_INPUT]).toBeDefined()
    expect(ui.find('generate-roads').disabled).toBe(false)
    expect(ui.container.querySelectorAll('.access-point-marker--pending')).toHaveLength(1)
    // Cancel puts the tool down and takes the point with it.
    await ui.click('cancel-roads')
    expect(ui.cursor.armed).toBeNull()
    expect(selectDraft(ui.state, 'roads').inputs[ACCESS_POINT_INPUT]).toBeUndefined()
    await ui.unmount()
  })
})

describe('3 & 4. the cap, and the discard', () => {
  liveIt(
    'refuses a fourth access point with the reason, and a discard calls the server and frees the slot',
    async () => {
      const ui = await renderApp()
      await throughWaterCommit(ui)
      const a = await placeAndGenerate(ui, ACCESS_A)
      const b = await placeAndGenerate(ui, ACCESS_B)
      const c = await placeAndGenerate(ui, ACCESS_C)
      expect(ui.networks.map((n) => n.network_id)).toEqual([a.network_id, b.network_id, c.network_id])
      expect(recordedAccessPoints(ui.state, 'roads')).toHaveLength(MAX_ROAD_NETWORKS)

      // THE UI REFLECTS THE CAP: the button is refused with the reason, and
      // the bar says so.
      const add = ui.find('access-roads')
      expect(add.disabled).toBe(true)
      expect(add.getAttribute('title')).toContain(`${MAX_ROAD_NETWORKS} access points are placed`)
      expect(ui.find('notice-cap-roads')).not.toBeNull()

      // THE SERVER OWNS IT: a fourth generate sent anyway is a 409 naming the
      // three held, surfaced as the step's error.
      await ui.run((a) =>
        a.generate('roads', { [ACCESS_POINT_INPUT]: [ACCESS_D[1], ACCESS_D[0]] })
      )
      await ui.waitFor('the cap refusal', () => ui.state.steps.roads.error != null)
      expect(ui.state.steps.roads.error.message).toMatch(/maximum of 3/)
      expect(ui.networks).toHaveLength(3)

      // DISCARD IS A SERVER VERB. Spy on the wire: one POST .../discard, then
      // the layers refetch, and the slot is free.
      const discards = []
      globalThis.fetch = (url, init) => {
        if (String(url).endsWith('/steps/roads/discard')) discards.push(JSON.parse(init.body))
        return realFetch(url, init)
      }
      await ui.click(`tab-remove-${b.network_id}`)
      await ui.waitFor('the discard to land', () => ui.networks.length === 2)
      expect(discards).toHaveLength(1)
      expect(discards[0].params[ACCESS_POINT_INPUT]).toEqual(b.access_point)
      expect(ui.networks.map((n) => n.network_id)).toEqual([a.network_id, c.network_id])
      expect(recordedAccessPoints(ui.state, 'roads')).toEqual([a.access_point, c.access_point])
      expect(ui.all('[data-tab-id]')).toHaveLength(2)
      expect(ui.find('access-roads').disabled).toBe(false)
      expect(ui.find('notice-cap-roads')).toBeNull()
      // The freed slot takes D.
      const d = await placeAndGenerate(ui, ACCESS_D)
      expect(ui.networks.map((n) => n.network_id)).toEqual([a.network_id, c.network_id, d.network_id])
      await ui.unmount()
    }
  )
})

/* ===========================================================================
   The offline payload -- the backend's shape, over the interaction fixture
   =========================================================================== */

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

const RING = [
  [40.71, -74.02],
  [40.71, -73.98],
  [40.73, -73.98],
  [40.73, -74.02],
]

function branch(networkId, index, role, coordinates, extra = {}) {
  return {
    type: 'Feature',
    id: `road-corridor-${networkId}-${index + 1}`,
    geometry: { type: 'LineString', coordinates },
    properties: {
      layer: 'suggested_road_corridor',
      label: 'Suggested road corridor',
      confidence: 'low',
      confidence_notes: 'fixture',
      branch_index: index,
      branch_role: role,
      joins_branch_index: index === 0 ? null : 0,
      length_ft: 400.5,
      avg_grade_pct: 4.2,
      max_grade_pct: 9.8,
      steep_ft: 0,
      newly_served_acres: 1.25,
      crosses_floodplain: false,
      crosses_production_zone: true,
      total_length_ft: 801,
      total_served_acres: 2.5,
      unserved_acres: 0.5,
      stop_reason: 'cost_per_acre_exceeded',
      network_id: networkId,
      access_point: extra.access_point,
      ...extra.properties,
    },
  }
}

const NET_A = 'aaaaaaaaaa'
const NET_B = 'bbbbbbbbbb'
const AP_A = [-74.02, 40.72] // west edge, [lon, lat]
const AP_B = [-74.0, 40.73] // north edge

function narrative(found = true) {
  return {
    network_found: found,
    stop_reason: found ? 'cost_per_acre_exceeded' : 'corridor_too_short',
    determination: {
      grade_ceiling_pct: 35,
      steep_grade_threshold_pct: 10,
      max_grade_pct: found ? 9.8 : null,
      steep_ft: found ? 0 : null,
      water_zone_excluded: true,
      floodplain_data_available: true,
      floodplain_data_is_fallback: false,
      canopy_data_available: true,
    },
    access: {
      branch_count: found ? 2 : 0,
      total_length_ft: found ? 801 : 0,
      served_acres: found ? 2.5 : 0,
      unserved_acres: 0.5,
      served_pct_of_production: found ? 83.3 : 0,
      service_radius_ft: 328.1,
      reaches_water_zone: false,
    },
    branches: [],
  }
}

function roadsPayload() {
  const features = [
    branch(NET_A, 0, 'trunk', [[-74.02, 40.72], [-74.01, 40.72], [-74.005, 40.722]], { access_point: AP_A }),
    branch(NET_A, 1, 'spur', [[-74.01, 40.72], [-74.01, 40.715]], { access_point: AP_A }),
    branch(NET_B, 0, 'trunk', [[-74.0, 40.73], [-74.0, 40.725], [-73.995, 40.722]], { access_point: AP_B }),
    branch(NET_B, 1, 'water_spur', [[-74.0, 40.725], [-73.99, 40.725]], {
      access_point: AP_B,
      // THE SENTINELS: a grade never measured on this branch, and a steep
      // length never measured. Null, and printed as a dash.
      properties: { avg_grade_pct: null, steep_ft: null },
    }),
  ]
  return {
    road_corridors: { type: 'FeatureCollection', features },
    networks: [
      { network_id: NET_A, access_point: AP_A, feature_ids: [features[0].id, features[1].id], ...narrative() },
      { network_id: NET_B, access_point: AP_B, feature_ids: [features[2].id, features[3].id], ...narrative() },
    ],
    summary: { network_count: 2, max_networks: 3, slots_remaining: 1 },
  }
}

const POLY = {
  type: 'Polygon',
  coordinates: [[[-74.015, 40.712], [-74.008, 40.712], [-74.008, 40.718], [-74.015, 40.718], [-74.015, 40.712]]],
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

function serverDocument({ roads = { status: NOT_STARTED }, revision = 3 } = {}) {
  const entries = {}
  for (const stepId of [...STEP_ORDER].sort()) entries[stepId] = { status: NOT_STARTED }
  entries.landform = committedStep(1, [
    { type: 'Feature', id: 'production-area-1', properties: { layer: 'production_area_candidate' }, geometry: POLY },
  ])
  entries.water = committedStep(1, [])
  entries.roads = roads
  return {
    schema_version: 1,
    session_id: 'sess-roads',
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
    // AWAITED, so a route may HOLD ITS ANSWER. A function response that
    // returns a promise lets a test keep a request in flight and look at the
    // UI while it is -- which is the only way to see a state that lasts
    // exactly as long as a round trip.
    const answer = typeof responses[index] === 'function' ? await responses[index](calls[calls.length - 1]) : responses[index]
    const { status = 200, body } = answer
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  })
  return calls
}

const route = (method, pattern, responses) => ({ method, pattern, responses })

/** A generated roads step over the fixture payload, resumed into, on the roads cursor. */
async function generatedRoads({ recorded = [AP_A, AP_B] } = {}) {
  const document = serverDocument({
    roads: { status: GENERATED, inputs: { [ACCESS_POINTS_LIST]: recorded } },
  })
  const calls = installFetch([
    route('GET', /^\/api\/sessions\/sess-roads$/, { body: document }),
    route('GET', /\/steps\/roads\/layers$/, { body: roadsPayload() }),
  ])
  const ui = await renderApp({ center: [40.72, -74.0] })
  await ui.run((a) => a.resume('sess-roads'))
  await ui.waitFor('the roads payload', () => ui.roads != null, 5000)
  await ui.waitFor('the roads draft', () => ui.state.drafts.roads !== undefined, 5000)
  expect(ui.cursor.cursorStepId).toBe('roads')
  return { ui, calls }
}

/* ===========================================================================
   5. THE RADIO EYE
   =========================================================================== */

describe('5. the eye is a radio', () => {
  it('declares it on the definition, and the strip reads it rather than knowing the step', () => {
    expect(ROADS_STEP.selection).toEqual({ mode: 'radio' })
    expect(STEP_DEFINITIONS.find((d) => d.id === 'landform').selection).toEqual({ mode: 'multiple' })
    expect(STEP_DEFINITIONS.find((d) => d.id === 'water').selection).toEqual({ mode: 'multiple' })

    // The arithmetic, on a tab standing for two branches.
    const tabA = { id: NET_A, featureIds: ['a-1', 'a-2'], selected: true }
    const tabB = { id: NET_B, featureIds: ['b-1', 'b-2'], selected: false }
    expect(selectionAfterEye(['a-1', 'a-2'], tabB, 'radio')).toEqual(['b-1', 'b-2'])
    expect(selectionAfterEye(['a-1', 'a-2'], tabA, 'radio')).toEqual([])
    expect(selectionAfterEye(['a-1', 'a-2'], tabB, 'multiple').sort()).toEqual(['a-1', 'a-2', 'b-1', 'b-2'])
  })

  it('turns network 1 off when network 2 is turned on, and never holds both', async () => {
    const { ui } = await generatedRoads()
    // Seeded on the FIRST candidate only -- a radio seed, not every proposal.
    expect(selectDraft(ui.state, 'roads').selectedFeatureIds.sort()).toEqual(
      ui.networks[0].feature_ids.sort()
    )
    expect(ui.find(`tab-${NET_A}`).getAttribute('data-eye')).toBe('on')
    expect(ui.find(`tab-${NET_B}`).getAttribute('data-eye')).toBe('off')
    expect(ui.find('tabs-roads').getAttribute('data-selection')).toBe('radio')
    expect(ui.find(`tab-eye-${NET_A}`).getAttribute('role')).toBe('radio')

    await ui.click(`tab-eye-${NET_B}`)
    expect(ui.find(`tab-${NET_B}`).getAttribute('data-eye')).toBe('on')
    expect(ui.find(`tab-${NET_A}`).getAttribute('data-eye')).toBe('off')
    expect(selectDraft(ui.state, 'roads').selectedFeatureIds.sort()).toEqual(
      ui.networks[1].feature_ids.sort()
    )
    // Off is NONE -- a legal commit, and the button says so.
    await ui.click(`tab-eye-${NET_B}`)
    expect(selectDraft(ui.state, 'roads').selectedFeatureIds).toEqual([])
    expect(ui.text('commit-roads')).toBe('Commit no road for this step')
    await ui.unmount()
  })
})

/* ===========================================================================
   6, 7, 8, 9. VISIBILITY, MARKERS, THE MARKER CLICK, THE BARE-MAP CLICK
   =========================================================================== */

describe('6. only the focused network is drawn', () => {
  it('declares the exception on one layer, and the renderer applies it', () => {
    const networks = ROADS_STEP.layers.find((l) => l.id === 'roads-networks')
    expect(networks.show).toBe('focused')
    expect(LAYER_SHOW).toEqual(['all', 'focused'])
    // Nothing else declares it -- not roads' committed layer, not any other step.
    for (const definition of STEP_DEFINITIONS) {
      for (const layer of definition.layers) {
        if (layer !== networks) expect(layer.show).toBe('all')
      }
    }
    // Pure: the focused group, whole; nothing when nothing is focused; and
    // the eye plays no part.
    const payload = roadsPayload()
    const layer = {
      band: 'editable',
      show: 'focused',
      groupOf: ROADS_STEP.groupOf,
      features: payload.road_corridors.features,
      selectedFeatureIds: [],
    }
    expect(visibleFeatures(layer, null)).toEqual([])
    expect(visibleFeatures(layer, NET_A).map((f) => f.id)).toEqual(payload.networks[0].feature_ids)
    expect(visibleFeatures(layer, payload.networks[1].feature_ids[1]).map((f) => f.id)).toEqual(
      payload.networks[1].feature_ids
    )
  })

  it('is written down where the pattern levels are declared', () => {
    const tokens = readFileSync(path.join(SRC, 'index.css'), 'utf8')
    const block = tokens.slice(tokens.indexOf('HOW PRESENT A ZONE'), tokens.indexOf('--pattern-committed:'))
    expect(block).toContain('ONE DOCUMENTED EXCEPTION')
    expect(block).toContain("show: 'focused'")
    expect(block).toContain('EXCEPTION, not an')
  })

  it('draws the focused network and nothing else, absent rather than dimmed', async () => {
    const { ui } = await generatedRoads()
    const pane = 'leaflet-roads--roads-networks-pane'
    // Seeded and focused on the first network.
    expect(ui.cursor.focusedFeatureId).toBe(NET_A)
    expect(ui.drawnBranches(pane)).toHaveLength(2)
    expect(ui.drawnBranches(pane).map((el) => el.getAttribute('stroke-opacity'))).toEqual(['1', '1'])
    // Focus the second: its two branches, and NOT the first's -- eye-off or not.
    await ui.click(`tab-focus-${NET_B}`)
    expect(ui.drawnBranches(pane)).toHaveLength(2)
    expect(ui.find(`tab-${NET_A}`).getAttribute('data-eye')).toBe('on')
    const paths = ui.all(`.${pane} path`)
    expect(paths.length).toBe(4) // two branches, each cased
    await ui.unmount()
  })
})

describe('7. the access-point markers persist', () => {
  it('stay through every focus and eye state', async () => {
    const { ui } = await generatedRoads()
    expect(ui.markers()).toHaveLength(2)
    await ui.click(`tab-focus-${NET_B}`)
    expect(ui.markers()).toHaveLength(2)
    await ui.click(`tab-eye-${NET_B}`) // radio: A off, B on
    expect(ui.markers()).toHaveLength(2)
    await ui.click(`tab-eye-${NET_B}`) // none
    expect(ui.markers()).toHaveLength(2)
    await ui.clickMap([40.72, -74.0])
    expect(ui.cursor.focusedFeatureId).toBeNull()
    expect(ui.markers()).toHaveLength(2)
    await ui.unmount()
  })
})

describe('8. a marker click focuses its network', () => {
  it('is the same act as clicking the tab, and the line', async () => {
    const { ui } = await generatedRoads()
    await ui.clickMap([40.72, -74.0])
    expect(ui.cursor.focusedFeatureId).toBeNull()

    await ui.clickMarker(1)
    expect(ui.cursor.focusedFeatureId).toBe(NET_B)
    expect(ui.find(`tab-${NET_B}`).getAttribute('data-focused')).toBe('true')
    expect(ui.text('detail-name-roads')).toBe('Access point 2')
    expect(ui.container.querySelectorAll('.access-point-marker--focused')).toHaveLength(1)

    await ui.clickMarker(0)
    expect(ui.cursor.focusedFeatureId).toBe(NET_A)
    expect(ui.find(`tab-${NET_A}`).getAttribute('data-focused')).toBe('true')

    // THE LINE: a branch's own id focuses its network's tab and scrolls the
    // panel to that branch.
    const spur = ui.networks[1].feature_ids[1]
    await ui.focus(spur)
    expect(ui.find(`tab-${NET_B}`).getAttribute('data-focused')).toBe('true')
    expect(ui.text('detail-name-roads')).toBe('Access point 2')
    expect(ui.find(`detail-group-${spur}`).getAttribute('data-scroll-target')).toBe('true')
    await ui.unmount()
  })
})

describe('9. a bare-map click', () => {
  it('leaves the markers and the tabs, and draws no network', async () => {
    const { ui } = await generatedRoads()
    expect(ui.drawnBranches('leaflet-roads--roads-networks-pane')).toHaveLength(2)
    await ui.clickMap([40.72, -74.0])
    expect(ui.cursor.focusedFeatureId).toBeNull()
    expect(ui.find('detail-roads')).toBeNull()
    expect(ui.drawnBranches('leaflet-roads--roads-networks-pane')).toHaveLength(0)
    expect(ui.markers()).toHaveLength(2)
    expect(ui.all('[data-tab-id]')).toHaveLength(2)
    expect(ui.all('.chrome-tab--focused')).toHaveLength(0)
    await ui.unmount()
  })
})

/* ===========================================================================
   10. THE COMMITTED NETWORK
   =========================================================================== */

describe('10. the committed network renders dimmed and persists', () => {
  it('draws every branch of the committed network at the committed level, with its access point', async () => {
    const payload = roadsPayload()
    const committed = payload.road_corridors.features.filter((f) => f.properties.network_id === NET_A)
    const document = serverDocument({
      roads: committedStep(1, committed, { inputs: { [ACCESS_POINTS_LIST]: [AP_A, AP_B] } }),
    })
    installFetch([route('GET', /^\/api\/sessions\/sess-roads$/, { body: document })])
    const ui = await renderApp({ center: [40.72, -74.0] })
    await ui.run((a) => a.resume('sess-roads'))
    await ui.waitFor('the document', () => selectStepStatus(ui.state, 'roads') === COMMITTED, 5000)
    expect(ui.cursor.cursorStepId).toBe('trees')

    const pane = 'leaflet-roads--roads-committed-pane'
    const branches = ui.drawnBranches(pane)
    expect(branches).toHaveLength(2)
    const committedLevel = getComputedStyle(globalThis.document.documentElement)
      .getPropertyValue('--pattern-committed')
      .trim()
    for (const el of branches) expect(el.getAttribute('stroke-opacity')).toBe(committedLevel)
    // Cased: the halo pass sits under each branch, at the same level.
    const casings = ui.all(`.${pane} path.road--casing`)
    expect(casings).toHaveLength(2)
    for (const el of casings) expect(el.getAttribute('stroke-opacity')).toBe(committedLevel)
    // Its access point, settled with it; the alternative's is not drawn.
    expect(ui.container.querySelectorAll('.access-point-marker--committed')).toHaveLength(1)
    // And it stays: the cursor is on another step and nothing here is focused.
    await ui.clickMap([40.72, -74.0])
    expect(ui.drawnBranches(pane)).toHaveLength(2)
    await ui.unmount()
  })
})

/* ===========================================================================
   11. INPUTS
   =========================================================================== */

describe('11. the commit body carries access_points, and a missing input refuses', () => {
  it('assembles access_points from the declaration, every tried point, an empty list included', () => {
    const state = {
      steps: { roads: { status: GENERATED, revision: 0, inputs: { [ACCESS_POINTS_LIST]: [AP_A, AP_B] }, proposals: roadsPayload() } },
      drafts: { roads: { selectedFeatureIds: [], drawnFeatures: [], inputs: {}, seeded: false } },
    }
    const context = { state, stepId: 'roads', draft: state.drafts.roads, definition: ROADS_STEP }
    expect(requiredInputsMissing(ROADS_STEP, context)).toEqual([])
    expect(commitInputsFor(ROADS_STEP, context)).toEqual({ [ACCESS_POINTS_LIST]: [AP_A, AP_B] })
    const body = buildCommitBody(state, 'roads', registryProposalFeatures, {
      inputs: commitInputsFor(ROADS_STEP, context),
    })
    expect(body.inputs).toEqual({ [ACCESS_POINTS_LIST]: [AP_A, AP_B] })

    // NO ACCESS POINT EVER PLACED IS AN EMPTY LIST, sent -- not a missing key.
    const bare = { ...state, steps: { roads: { status: NOT_STARTED, revision: 0, inputs: null, proposals: null } } }
    const bareContext = { ...context, state: bare }
    expect(commitInputsFor(ROADS_STEP, bareContext)).toEqual({ [ACCESS_POINTS_LIST]: [] })
    expect(buildCommitBody(bare, 'roads', registryProposalFeatures, { inputs: commitInputsFor(ROADS_STEP, bareContext) }).inputs).toEqual({ [ACCESS_POINTS_LIST]: [] })

    // THE OLD GAP, SHOWN: with no inputs handed in, a draft with none leaves
    // the key off -- which is exactly why the definition hands them in.
    expect(buildCommitBody(state, 'roads', registryProposalFeatures).inputs).toBeUndefined()
  })

  it('refuses a draft lacking a required input, before any request', async () => {
    // A step declaring a required DRAFT input, with a draft that lacks it.
    const step = documentStep({
      id: 'trees',
      title: 'Trees',
      inputs: [{ key: 'seed_point', label: 'Seed point', kind: 'point', required: true }],
      proposalCollection: 'tree_zones',
      buttons: { [REVIEWING]: [COMMIT_BUTTON] },
    })
    const context = { state: { steps: {}, drafts: {} }, stepId: 'trees', draft: { inputs: {} }, definition: step }
    expect(requiredInputsMissing(step, context)).toEqual(['seed_point'])
    expect(() => commitInputsFor(step, context)).toThrow(/seed_point/)
    expect(() => step.commit.run({ commit: () => 'committed' }, context)).toThrow(/seed_point/)

    // ...and with the value present, it goes out under its key.
    const filled = { ...context, draft: { inputs: { seed_point: [40.7, -74.0] } } }
    expect(commitInputsFor(step, filled)).toEqual({ seed_point: [40.7, -74.0] })

    // THE MACHINE DISARMS THE COMMIT and says why, so the button is refused
    // before the body is ever built.
    const document = serverDocument()
    document.steps.trees = { status: GENERATED }
    document.steps.roads = committedStep(1, [], { inputs: { [ACCESS_POINTS_LIST]: [] } })
    installFetch([
      route('GET', /^\/api\/sessions\/sess-roads$/, { body: document }),
      route('GET', /\/steps\/trees\/layers$/, { body: { tree_zones: { type: 'FeatureCollection', features: [] } } }),
    ])
    const ui = await renderApp({ center: [40.72, -74.0], definitions: [...STEP_DEFINITIONS, step] })
    await ui.run((a) => a.resume('sess-roads'))
    await ui.waitFor('the trees payload', () => ui.state.steps.trees?.proposals != null, 5000)
    expect(ui.cursor.cursorStepId).toBe('trees')
    const commit = ui.find('commit-trees')
    expect(commit.disabled).toBe(true)
    expect(commit.getAttribute('title')).toMatch(/seed_point/)
    await ui.unmount()
  })
})

/* ===========================================================================
   12. REOPEN
   =========================================================================== */

describe('12. reopen restores every candidate', () => {
  liveIt('brings back all three with the committed one selected and focused', async () => {
    const ui = await renderApp()
    await throughWaterCommit(ui)
    const a = await placeAndGenerate(ui, ACCESS_A)
    const b = await placeAndGenerate(ui, ACCESS_B)
    const c = await placeAndGenerate(ui, ACCESS_C)
    // Commit the SECOND, so the restored selection is not merely "the first".
    await ui.click(`tab-eye-${b.network_id}`)
    expect(ui.find(`tab-${b.network_id}`).getAttribute('data-eye')).toBe('on')
    await ui.click('commit-roads')
    await ui.waitFor('roads to commit', () => selectStepStatus(ui.state, 'roads') === COMMITTED)
    expect(ui.cursor.cursorStepId).toBe('trees')

    await ui.run((_, cursor) => cursor.open('roads'))
    await ui.click('edit-roads')
    await ui.click('reopen-confirm-yes-roads')
    await ui.waitFor('roads to reopen', () => selectStepStatus(ui.state, 'roads') === GENERATED)
    await ui.waitFor('the candidates to come back', () => ui.networks.length === 3)
    await ui.waitFor('the draft', () => ui.state.drafts.roads !== undefined)

    expect(ui.networks.map((n) => n.network_id)).toEqual([a.network_id, b.network_id, c.network_id])
    expect(ui.all('[data-tab-id]')).toHaveLength(3)
    expect(ui.markers()).toHaveLength(3)
    // THE PRIOR SELECTION AND FOCUS: the committed network, and only it.
    expect(selectDraft(ui.state, 'roads').selectedFeatureIds.sort()).toEqual([...b.feature_ids].sort())
    expect(ui.find(`tab-${b.network_id}`).getAttribute('data-eye')).toBe('on')
    expect(ui.find(`tab-${a.network_id}`).getAttribute('data-eye')).toBe('off')
    expect(ui.find(`tab-${c.network_id}`).getAttribute('data-eye')).toBe('off')
    await ui.waitFor('the seed focus', () => ui.cursor.focusedFeatureId === b.network_id, 5000)
    expect(ui.find(`tab-${b.network_id}`).getAttribute('data-focused')).toBe('true')
    expect(recordedAccessPoints(ui.state, 'roads')).toEqual([a.access_point, b.access_point, c.access_point])
    await ui.unmount()
  })

  it('names what reopening water costs in roads terms', async () => {
    const document = serverDocument({
      roads: committedStep(1, roadsPayload().road_corridors.features.slice(0, 2), {
        inputs: { [ACCESS_POINTS_LIST]: [AP_A, AP_B, [-73.98, 40.72]] },
      }),
    })
    installFetch([route('GET', /^\/api\/sessions\/sess-roads$/, { body: document })])
    const ui = await renderApp({ center: [40.72, -74.0] })
    await ui.run((a) => a.resume('sess-roads'))
    await ui.waitFor('the document', () => selectStepStatus(ui.state, 'roads') === COMMITTED, 5000)
    await ui.run((_, cursor) => cursor.open('water'))
    await ui.click('edit-water')
    expect(ui.find('reopen-confirm-water')).not.toBeNull()
    expect(ui.text('reopen-reset-note-roads')).toContain('3 placed access points and the networks routed from them')
    await ui.unmount()
  })
})

/* ===========================================================================
   13. SENTINELS
   =========================================================================== */

describe('13. a null grade is an em dash, never 0.0', () => {
  it('prints — for null and 0.0 for zero, on the tab and in the panel', () => {
    expect(measure(null)).toBe('—')
    expect(measure(0)).toBe('0.0')
    const payload = roadsPayload()
    const draft = { selectedFeatureIds: [], drawnFeatures: [], inputs: {} }
    const detail = ROADS_STEP.detail({ proposals: payload, draft }, NET_B)
    const spur = detail.groups.find((g) => g.label === 'Water spur 2')
    expect(spur).toBeDefined()
    const field = (label) => spur.fields.find((f) => f.label === label).value
    expect(field('avg grade %')).toBe('—')
    expect(field('steep feet')).toBe('—')
    expect(field('max grade %')).toBe('9.8')
    // And the trunk, whose values were measured, prints them.
    const trunk = detail.groups.find((g) => g.label === 'Trunk 1')
    expect(trunk.fields.find((f) => f.label === 'steep feet').value).toBe('0')
    expect(trunk.fields.find((f) => f.label === 'avg grade %').value).toBe('4.2')
    // A candidate that routed nothing keeps its tab and prints nothing measured.
    const none = { ...payload, networks: [{ network_id: 'cccccccccc', access_point: [-73.98, 40.72], feature_ids: [], ...narrative(false) }] }
    const tabs = ROADS_STEP.tabs({ proposals: none, draft })
    expect(tabs).toHaveLength(1)
    expect(tabs[0].eye).toBeUndefined()
    expect(tabs[0].removable).toBe(true)
    const networkDetail = ROADS_STEP.detail({ proposals: none, draft }, 'cccccccccc')
    expect(networkDetail.groups[0].fields.find((f) => f.label === 'max grade %').value).toBe('—')
    expect(networkDetail.groups[0].fields.find((f) => f.label === 'wet ground avoided').value).toBe('yes')
  })

  it('reports a constraint that never ran as not applied, never as satisfied', () => {
    const payload = roadsPayload()
    payload.networks[0].determination.floodplain_data_available = false
    payload.networks[0].determination.canopy_data_available = false
    const detail = ROADS_STEP.detail({ proposals: payload, draft: { selectedFeatureIds: [] } }, NET_A)
    expect(detail.groups[0].fields.find((f) => f.label === 'wet ground avoided').value).toBe('not applied')
    expect(detail.groups[0].fields.find((f) => f.label === 'canopy avoided').value).toBe('not applied')
  })
})

/* ===========================================================================
   14. THE SCHEMA
   =========================================================================== */

describe('14. what the definition declares, and what the shell does not know', () => {
  it('registers roads with the fields the first two steps never needed', () => {
    expect(STEP_DEFINITIONS.map((d) => d.id)).toEqual(['boundary', 'landform', 'water', 'roads'])
    expect(LAYER_KINDS).toContain('line')
    expect(LAYER_KINDS).toContain('point')
    expect(ROADS_STEP.accumulate).toEqual({
      inputKey: ACCESS_POINT_INPUT,
      inputsList: ACCESS_POINTS_LIST,
      candidates: 'networks',
      candidateKey: 'network_id',
      max: MAX_ROAD_NETWORKS,
    })
    expect(ROADS_STEP.inputs).toHaveLength(1)
    expect(ROADS_STEP.inputs[0].required).toBe(true)
    expect(ROADS_STEP.inputs[0].commitKey).toBe(ACCESS_POINTS_LIST)
    expect(typeof ROADS_STEP.groupOf).toBe('function')
    expect(typeof ROADS_STEP.removeTab).toBe('function')
    expect(typeof ROADS_STEP.resetNote).toBe('function')
    expect(typeof ROADS_STEP.focusSeed).toBe('function')
    expect(ROADS_STEP.proposalCollection).toBe('road_corridors')
    // The generate sends [lon, lat] from a [lat, lng] draft, and nothing when
    // nothing is placed.
    expect(accessPointParams({ inputs: {} })).toBeNull()
    expect(accessPointParams({ inputs: { [ACCESS_POINT_INPUT]: [40.7, -74.0] } })).toEqual({
      [ACCESS_POINT_INPUT]: [-74.0, 40.7],
    })
    // Identity: an ordinal, with the location on the map.
    expect(roadNetworkName(roadsPayload(), NET_B)).toBe('Access point 2')
    // The road mark is a line, in its own token.
    expect(zoneMark('road')).toEqual({ kind: 'line', fill: null, stroke: expect.stringMatching(/^#/) })
    // Tabs carry every branch, and focus by any of them.
    const tab = ROADS_STEP.tabs({ proposals: roadsPayload(), draft: { selectedFeatureIds: [] } })[0]
    expect(tab.featureIds).toHaveLength(2)
    expect(tabIsFocused(tab, tab.featureIds[1])).toBe(true)
    expect(tabIsFocused(tab, NET_B)).toBe(false)
  })

  it('leaves every generic file free of the step, its keys and its vocabulary', () => {
    const generic = [
      'wizard/useStepMachine.js',
      'wizard/WizardShell.jsx',
      'wizard/WizardCursor.jsx',
      'wizard/stepInputs.js',
      'wizard/shell/chromeState.js',
      'wizard/shell/StepRail.jsx',
      'wizard/shell/InstructionBar.jsx',
      'wizard/shell/DetailPanel.jsx',
      'wizard/shell/TabStrip.jsx',
      'wizard/shell/ActionBanner.jsx',
      'map/layerStack.js',
      'map/layers.jsx',
      'map/StepTools.jsx',
      'map/tools/DrawGesture.jsx',
      'map/tools/SelectGesture.jsx',
      'session/SessionStore.jsx',
    ]
    const steps = ['boundary', 'landform', 'water', 'roads', 'trees', 'structures', 'fencing']
    const keys = ['road_corridors', 'networks', 'network_id', 'access_points', 'branch_role', 'suggested_road_corridor']
    for (const file of generic) {
      const code = readFileSync(path.join(SRC, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      for (const stepId of steps) {
        expect(code, `${file} names the step '${stepId}'`).not.toMatch(new RegExp(`['"\`]${stepId}['"\`]`))
      }
      for (const key of keys) {
        expect(code, `${file} names '${key}'`).not.toMatch(new RegExp(`['"\`.]${key}\\b`))
      }
    }
    // A test-local definition can be built without the roads fields, which is
    // what "the schema grew" means for the three steps still to come.
    const plain = defineStep({ id: 'trees', status: () => NOT_STARTED, commit: { run: () => 'committed' } })
    expect(plain.selection).toEqual({ mode: 'multiple' })
    expect(plain.accumulate).toBeNull()
    expect(plain.groupOf).toBeNull()
  })
})

/* ===========================================================================
   15. THE GENERATING STATE, AND THE TWO KINDS OF FAILED GENERATE
   ===========================================================================
   Three things that only became reachable when a step could generate a SECOND
   time with its proposals still on screen -- which roads is the first to do.
   =========================================================================== */

/**
 * TWO GENERATES, THE SECOND HELD OPEN, THEN ANSWERED.
 *
 * THE FIRST ONE IS NOT SCENERY, and leaving it out is what made an earlier
 * version of this fixture unable to fail. The defect these tests are written
 * against lives in the store's JOB TABLE: a finished job for a step was left
 * in it, and the next generate's entry went in BEHIND that one, where
 * selectJobForStep -- which answers with the first entry carrying the step's
 * id -- could never see it. A test that resumes straight into a generated
 * step has no first job in the table at all, so the second is the only entry,
 * `find` gets it right by accident, and the bug hides. So generate ONCE for
 * real, let it finish, and only then hold the second open.
 *
 * THE HOLD IS THE POINT of that second one: the banner has to be looked at
 * WHILE the job runs, and a route that answers `done` on the first poll never
 * lets the render happen. `job-2` stays `running` until `release()`.
 */
function twoGenerates({ recorded = [AP_A, AP_B], answer }) {
  let released = false
  const document_ = serverDocument({
    roads: { status: GENERATED, inputs: { [ACCESS_POINTS_LIST]: recorded } },
  })
  const terminal = typeof answer === 'function' ? answer(document_) : answer
  const routes = [
    route('GET', /^\/api\/sessions\/sess-roads$/, { body: document_ }),
    route('GET', /\/steps\/roads\/layers$/, { body: roadsPayload() }),
    // job-1 on the first POST, job-2 on every one after it.
    route('POST', /\/steps\/roads\/generate$/, [
      { status: 202, body: { job_id: 'job-1', status: 'running' } },
      { status: 202, body: { job_id: 'job-2', status: 'running' } },
    ]),
    route('GET', /^\/api\/jobs\/job-1$/, {
      body: {
        job_id: 'job-1',
        status: 'done',
        result: { payload: roadsPayload(), document: document_ },
      },
    }),
    route('GET', /^\/api\/jobs\/job-2$/, [
      () =>
        released
          ? { body: { job_id: 'job-2', ...terminal } }
          : { body: { job_id: 'job-2', status: 'running' } },
    ]),
  ]
  return { routes, release: () => { released = true } }
}

/** Resume onto a generated roads step and run the FIRST generate to completion. */
async function afterOneGenerate(routes) {
  installFetch(routes)
  const ui = await renderApp({ center: [40.72, -74.0] })
  await ui.run((a) => a.resume('sess-roads'))
  await ui.waitFor('the roads payload', () => ui.roads != null, 5000)
  await ui.run((a) => a.generate('roads', accessPointParams([40.7185, -74.014])))
  await ui.waitFor('the first generate to settle', () => ui.find('access-roads') !== null, 5000)
  return ui
}

/** Each of these drives a real generate through a poll cycle. */
const SECTION_15_TIMEOUT_MS = 30000

describe('15. the generating state, and the two kinds of failed generate', () => {
  /**
   * [test 1] A JOB IS RUNNING, SO THE BANNER OFFERS NOTHING AND SAYS SO.
   *
   * THE BUG THIS PINS. The roads definition has always declared
   * `[GENERATING]: []`, and deriveMachineState has always checked
   * `isGenerating` before `hasProposals` -- and the reviewing pair rendered
   * through the whole generate anyway. The reading was wrong further down:
   * the store's job table kept the FINISHED job for a step and added the new
   * one behind it, and selectJobForStep answers with the first entry it
   * finds, which is the old one. So `isGenerating` was false, the machine
   * fell through to `reviewing`, and the banner offered that state's buttons.
   *
   * ASSERTED ON RENDERED CONTENT, not on the machine's state field: a state
   * that reads `generating` while the wrong buttons are on screen is the
   * failure this is written against.
   */
  it('renders a progress indicator during a second generate, never the reviewing pair', async () => {
    const { routes, release } = twoGenerates({
      // THE DOCUMENT THE GENERATE MOVED TO -- the same one, still generated.
      // A `not_started` roads entry here would land the step somewhere else
      // entirely and the buttons coming back would say nothing.
      answer: (document_) => ({
        status: 'done',
        result: { payload: roadsPayload(), document: document_ },
      }),
    })
    const ui = await afterOneGenerate(routes)

    // REVIEWING FIRST, so what changes is visible as a change. This is the
    // pair the bug left on screen.
    expect(ui.find('access-roads')).not.toBeNull()
    expect(ui.find('commit-roads')).not.toBeNull()

    // A SECOND GENERATE, held open.
    const running = ui.actions.generate('roads', accessPointParams([40.715, -74.01]))
    await ui.waitFor('the generate to be in flight', () => ui.find('access-roads') === null, 5000)

    // NEITHER REVIEWING BUTTON IS ON SCREEN...
    expect(ui.find('access-roads')).toBeNull()
    expect(ui.find('commit-roads')).toBeNull()
    // ...AND THE CARD IS STILL THERE, SAYING WHAT IS HAPPENING. "No buttons"
    // is not "nothing to say": the banner reports the machine state, and an
    // empty card in the corner reads as a rendering fault.
    const banner = ui.find('banner-roads')
    expect(banner).not.toBeNull()
    const working = ui.find('working-roads')
    expect(working).not.toBeNull()
    expect(working.textContent).toMatch(/Generating/i)
    expect(working.getAttribute('role')).toBe('status')
    // THE CARD KEEPS ITS SHAPE AND LOSES ITS CONTENTS -- boundary's
    // `committing` exactly. The actions row is still in the DOM and holds no
    // control, which is what "the buttons do not stay" means here: an empty
    // card in the corner would read as a rendering fault, so the region
    // reports instead of vanishing.
    expect(ui.find('actions-roads').children).toHaveLength(0)

    release()
    await ui.run(() => running)
    await ui.waitFor('the buttons back', () => ui.find('access-roads') !== null, 5000)
    expect(ui.find('commit-roads')).not.toBeNull()
    await ui.unmount()
  }, SECTION_15_TIMEOUT_MS)

  /**
   * [test 1, the split second] THE BUTTONS GO ON THE PRESS, NOT ON THE REPLY.
   *
   * THE SECOND HALF OF THE SAME BUG, and the half that survived the first
   * fix. Dropping the superseded job stopped the reviewing pair staying for
   * the WHOLE generate; it left them showing for the first frames of one,
   * because `generating` is read off the store's job table and the table did
   * not hear about a generate until the POST came back with an id. That round
   * trip is short and it is not zero -- reported as "still showing up for a
   * split second".
   *
   * SO THE POST IS HELD OPEN HERE, not the job. `release()` lets the submit
   * answer; every assertion before it happens while the request is still in
   * flight and no job id exists anywhere. A store that waits for the id
   * cannot pass this.
   */
  it('drops the reviewing pair on the press, before the submit is answered', async () => {
    let letSubmitAnswer = null
    const held = new Promise((resolve) => {
      letSubmitAnswer = resolve
    })
    const document_ = serverDocument({
      roads: { status: GENERATED, inputs: { [ACCESS_POINTS_LIST]: [AP_A, AP_B] } },
    })
    installFetch([
      route('GET', /^\/api\/sessions\/sess-roads$/, { body: document_ }),
      route('GET', /\/steps\/roads\/layers$/, { body: roadsPayload() }),
      route('POST', /\/steps\/roads\/generate$/, async () => {
        await held
        return { status: 202, body: { job_id: 'job-9', status: 'running' } }
      }),
      route('GET', /^\/api\/jobs\/job-9$/, {
        body: { job_id: 'job-9', status: 'done', result: { payload: roadsPayload(), document: document_ } },
      }),
    ])
    const ui = await renderApp({ center: [40.72, -74.0] })
    await ui.run((a) => a.resume('sess-roads'))
    await ui.waitFor('the roads payload', () => ui.roads != null, 5000)
    expect(ui.find('access-roads')).not.toBeNull()
    expect(ui.find('commit-roads')).not.toBeNull()

    const running = ui.actions.generate('roads', accessPointParams([40.715, -74.01]))
    // ONE FLUSH, NO POLLING. The submit has not answered and cannot while
    // this runs, so if the pair is still here after React has rendered the
    // dispatch, it is here for a user to see.
    await ui.run(() => Promise.resolve())
    expect(ui.find('access-roads'), 'the pair must go on the press').toBeNull()
    expect(ui.find('commit-roads')).toBeNull()
    expect(ui.find('working-roads').textContent).toMatch(/Generating/i)

    letSubmitAnswer()
    await ui.run(() => running)
    await ui.waitFor('the buttons back', () => ui.find('access-roads') !== null, 5000)
    await ui.unmount()
  }, SECTION_15_TIMEOUT_MS)

  /**
   * [test 2] A ROUTER FAILURE LEAVES NO TAB, NO MARKER AND NO SPENT SLOT.
   *
   * The backend did not record the access point -- it routed nothing, and a
   * retry from the same point routes nothing again -- so there is no network
   * to make a tab from and no recorded input to make a marker from. What the
   * CLIENT has to let go of is the PENDING value in its own draft, which is
   * the marker the user has been looking at since they placed it.
   */
  it('clears the tab and the pending access point when the router finds nothing, and frees the slot', async () => {
    const NO_ROUTE = {
      error: 'No road network could be routed from that access point.',
      no_candidate: { input: ACCESS_POINT_INPUT, value: [-74.01, 40.715] },
    }
    const { routes, release } = twoGenerates({ answer: { status: 'failed', error: NO_ROUTE } })
    const ui = await afterOneGenerate(routes)

    const tabsBefore = ui.all('[data-tab-id]').length
    const markersBefore = ui.markers().length
    const slotsBefore = ui.roads.summary.slots_remaining

    // PLACE IT: the pending marker appears, which is the thing that has to go.
    await ui.run((a) => a.setDraftInput('roads', ACCESS_POINT_INPUT, [40.715, -74.01]))
    expect(selectDraft(ui.state, 'roads').inputs[ACCESS_POINT_INPUT]).toBeDefined()
    expect(ui.markers().length).toBe(markersBefore + 1)

    const running = ui.actions.generate('roads', accessPointParams([40.715, -74.01]))
    release()
    await ui.run(() => running)
    await ui.waitFor('the failure to land', () => selectNoCandidate(ui.state, 'roads') !== null, 5000)

    // THE KIND IS READ OFF A KEY THE PAYLOAD CARRIES, and the other kind's
    // key is absent -- neither is inferred from the other missing.
    expect(selectNoCandidate(ui.state, 'roads')).toEqual({
      input: ACCESS_POINT_INPUT,
      value: [-74.01, 40.715],
      message: NO_ROUTE.error,
    })
    expect(selectFailedLayer(ui.state, 'roads')).toBeNull()

    // NO TAB, AND THE PENDING MARKER IS GONE WITH THE INPUT THAT DREW IT.
    expect(ui.all('[data-tab-id]')).toHaveLength(tabsBefore)
    expect(selectDraft(ui.state, 'roads').inputs[ACCESS_POINT_INPUT]).toBeUndefined()
    expect(ui.markers().length).toBe(markersBefore)

    // THE ERROR IS SHOWN, in the server's own sentence.
    const notice = ui.find('no-candidate-roads')
    expect(notice).not.toBeNull()
    expect(notice.textContent).toContain('No road network could be routed')
    // ONE FAILURE, ONE SENTENCE. Not the other kind's notice, and not the
    // raw step-error line either -- a failed job writes its error on the JOB
    // and not on the step, so there is nothing for that line to print.
    expect(ui.find('failed-layer-roads')).toBeNull()
    expect(ui.find('error-roads')).toBeNull()

    // THE SLOT IS FREE: nothing was recorded, so nothing was spent, and the
    // client reads that off the payload rather than tracking it separately.
    expect(ui.roads.summary.slots_remaining).toBe(slotsBefore)
    expect(recordedAccessPoints(ui.state, 'roads')).toHaveLength(tabsBefore)
    expect(ui.find('access-roads').disabled).toBe(false)
    await ui.unmount()
  }, SECTION_15_TIMEOUT_MS)

  /**
   * [test 3] AN UPSTREAM FAILURE KEEPS BOTH, AND OFFERS THE RETRY.
   *
   * THE CONTROL THAT MAKES THE NARROWING REAL. Nothing is wrong with the
   * access point when a data source does not answer: the server still holds
   * its slot, the same point is what a retry has to be made from, and
   * throwing it away would make the user place it again to ask the same
   * question. Unchanged behaviour, asserted so it stays that way.
   */
  it('keeps the pending access point and offers a retry when a data source fails', async () => {
    const FAILED_LAYER = {
      error: 'The tree canopy height could not be retrieved.',
      failed_layer: { type: 'canopy', label: 'tree canopy height' },
    }
    const { routes, release } = twoGenerates({ answer: { status: 'failed', error: FAILED_LAYER } })
    const ui = await afterOneGenerate(routes)

    const markersBefore = ui.markers().length
    await ui.run((a) => a.setDraftInput('roads', ACCESS_POINT_INPUT, [40.715, -74.01]))
    expect(ui.markers().length).toBe(markersBefore + 1)

    const running = ui.actions.generate('roads', accessPointParams([40.715, -74.01]))
    release()
    await ui.run(() => running)
    await ui.waitFor('the failure to land', () => selectFailedLayer(ui.state, 'roads') !== null, 5000)

    // THE OTHER KIND, AND IT CARRIES ITS OWN KEY TOO.
    expect(selectFailedLayer(ui.state, 'roads')).toEqual(FAILED_LAYER.failed_layer)
    expect(selectNoCandidate(ui.state, 'roads')).toBeNull()

    // BOTH KEPT: the input is still in the draft and its marker is still on
    // the map, so the retry has something to retry with.
    expect(selectDraft(ui.state, 'roads').inputs[ACCESS_POINT_INPUT]).toEqual([40.715, -74.01])
    expect(ui.markers().length).toBe(markersBefore + 1)

    // THE NOTICE NAMES THE SOURCE, and the no-candidate notice is not on
    // screen -- one failure, one sentence.
    expect(ui.find('failed-layer-roads')).not.toBeNull()
    expect(ui.find('failed-layer-roads').textContent).toContain('tree canopy height')
    expect(ui.find('no-candidate-roads')).toBeNull()

    // AND THE RETRY IS OFFERED: the step is back in a state that can generate
    // from the point still in hand.
    expect(ui.find('generate-roads') ?? ui.find('access-roads')).not.toBeNull()
    await ui.unmount()
  }, SECTION_15_TIMEOUT_MS)

  /**
   * [test 5] ONE OXIDE PER STATE, STILL -- AND NOTHING TOOK THE ROAD COLOUR.
   *
   * THE FAILURE THIS IS WRITTEN AGAINST. --road is now --ink. If any CONTROL
   * had been painted from the road's token -- a button for the roads step
   * borrowing the colour of the thing it makes -- it would have been umber
   * before and would now render in the text colour, which is the "generic UI
   * kit" look the style branch diagnosed. So both halves are asserted: no
   * control references the road token at all, and the accent is still spent
   * exactly once per state.
   */
  it('keeps one oxide per state and lets no control take the road colour', () => {
    // NO CONTROL PAINTS ITSELF FROM THE ROAD'S TOKEN. The road token belongs
    // to a MARK ON THE MAP; the chrome's colours are the chrome's.
    const CHROME = [
      'App.css',
      'index.css',
      'wizard/shell/ActionBanner.jsx',
      'wizard/shell/InstructionBar.jsx',
      'wizard/shell/TabStrip.jsx',
      'wizard/shell/DetailPanel.jsx',
      'wizard/shell/StepRail.jsx',
    ]
    for (const file of CHROME) {
      const code = readFileSync(path.join(SRC, file), 'utf8')
      for (const [, rule] of code.matchAll(/([^}]*var\(--road\)[^}]*)/g)) {
        // index.css DECLARES the token; nothing may CONSUME it as a control's
        // own paint. The declaration is the one line that assigns it.
        expect(rule.trim().startsWith('--road:'), `${file} paints a control from --road`).toBe(true)
      }
    }

    // AND THE ROAD IS THE INK, by reference rather than by a second literal.
    const tokens = readFileSync(path.join(SRC, 'index.css'), 'utf8')
    expect(tokens).toMatch(/--road:\s*var\(--ink\)\s*;/)
    expect(zoneMark('road').stroke).toBe(
      getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()
    )

    // ONE PRIMARY PER STATE, FOR EVERY STATE THE ROADS STEP DECLARES. The
    // table is the spec, the same way style.test.jsx's is: an unlisted state
    // fails, because adding one without deciding what it offers is how the
    // accent goes missing.
    const EXPECTED = {
      // Placing the access point IS the forward move from an empty step.
      idle: 1,
      // A point is down and not yet generated from: generate is the move,
      // cancel is the escape beside it.
      editing: 1,
      // A job is running. Nothing to press, and nothing to urge.
      generating: 0,
      // The payload is not here; a commit over it is a decision the user
      // cannot see being recorded.
      loading: 0,
      // Commit. "Add access point" beside it is not a forward move.
      reviewing: 1,
      // A request in flight offers nothing.
      committing: 0,
      // Reopen is a move backwards into finished work.
      committed: 0,
    }
    expect(Object.keys(EXPECTED).sort()).toEqual([...MACHINE_STATES].sort())
    for (const state of MACHINE_STATES) {
      const primary = (ROADS_STEP.buttons[state] ?? []).filter((b) => b.tone === 'primary')
      expect({ state, oxide: primary.length }).toEqual({ state, oxide: EXPECTED[state] })
    }
    // AND THE ACCENT IS ACTUALLY IN USE: a step whose every state came out
    // zero would satisfy the rule above and be the regression exactly.
    expect(Object.values(EXPECTED).some((n) => n === 1)).toBe(true)
    expect(ROADS_STEP.buttons[GENERATING]).toEqual([])
  })
})
