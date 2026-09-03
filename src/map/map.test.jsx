/**
 * map.test.jsx
 *
 * The nine tests this branch is answerable for. Three carry the weight:
 *
 *   2. ARMING -- exactly the definition's declared tools mount, asserted on
 *      WHAT IS IN THE DOCUMENT rather than on a flag. A verb the step does not
 *      declare has no node, no gesture and no listener.
 *   3. STRUCTURAL EXCLUSION -- two tools armed at once is asserted to be
 *      UNREACHABLE through the wizard's own actions, by walking every action
 *      it exposes and counting the armed mounts after each. Not "a throw
 *      fires": the point is that there is no state to throw about.
 *   8. SPIKE REMOVED -- no endpoint, no component and no orphaned state left
 *      behind, and the whole page still runs end to end through the session
 *      endpoints instead: boundary, landform, a drawn zone, a commit, the PDF.
 *
 * A REAL LEAFLET MAP, in jsdom. The panes, their z-indexes and their paths are
 * all in the document, so "the layers render in the declared z-order" and "a
 * committed layer takes a click" are facts this file reads off the DOM rather
 * than claims it makes about the code. Clicks are fired on the map the way
 * Leaflet delivers them, so the tools under test are the ones that ship.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import L from 'leaflet'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MapContainer, useMap } from 'react-leaflet'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  COMMITTED,
  GENERATED,
  NOT_STARTED,
  PROVENANCE_USER_ADDED,
  STEP_MODES,
  SessionProvider,
  buildCommitBody,
  selectDraft,
  selectSessionId,
  useSession,
} from '../session/SessionStore'
import {
  BOUNDARY_RING_INPUT,
  BOUNDARY_STEP,
  BOUNDARY_STEP_ID,
  LANDFORM_STEP,
  LAYER_BANDS,
  LAYER_KINDS,
  LAYER_SOURCES,
  STEP_DEFINITIONS,
  WATER_STEP,
  definitionMap,
  registryProposalFeatures,
} from '../wizard/stepDefinitions'
import { resetStepCatalog } from '../wizard/stepCatalog.jsx'
import WizardShell from '../wizard/WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from '../wizard/WizardCursor.jsx'
import MapLayerStack from './MapLayerStack.jsx'
import StepTools, { TOOL_GESTURES } from './StepTools.jsx'
import { BAND_BASE_Z, composeLayerStack } from './layerStack.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * The retired arming door's name, ASSEMBLED so that this file is inside its own
 * tree-wide sweep for it rather than being the one hit that sweep can never
 * clear. Same trick the spike-endpoint sweep uses, for the same reason.
 */
const LEGACY_DOOR_NAME = 'arm' + 'LegacyGesture'

/** Source with its prose removed. */
function stripProse(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
}

/** A module's code with its prose removed -- the wizard suite's helper. */
function codeOf(...parts) {
  return stripProse(readFileSync(path.join(HERE, ...parts), 'utf8'))
}

/* ===========================================================================
   Fixtures -- the wire's own shapes
   =========================================================================== */

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

/** A ring in Leaflet's [lat, lng], big enough to click inside of. */
const RING = [
  [40.7, -74.02],
  [40.7, -73.98],
  [40.73, -73.98],
  [40.73, -74.02],
]

/** The same parcel as GeoJSON [lng, lat], closed -- what the document carries. */
const BOUNDARY_GEOJSON = [
  [-74.02, 40.7],
  [-73.98, 40.7],
  [-73.98, 40.73],
  [-74.02, 40.73],
  [-74.02, 40.7],
]

function polygon(coordinates) {
  return { type: 'Polygon', coordinates: [coordinates] }
}

function featureCollection(...ids) {
  return {
    type: 'FeatureCollection',
    features: ids.map((id, index) => ({
      type: 'Feature',
      id,
      properties: { name: id },
      geometry: polygon([
        [-74.01 + index * 0.001, 40.71],
        [-74.0 + index * 0.001, 40.71],
        [-74.0 + index * 0.001, 40.72],
        [-74.01 + index * 0.001, 40.71],
      ]),
    })),
  }
}

/** `steps` assembled ALPHABETICALLY, because that is what Flask delivers. */
function serverDocument({ sessionId = 'sess-1', steps = {}, revision = 0 } = {}) {
  const entries = {}
  for (const stepId of [...STEP_ORDER].sort()) {
    entries[stepId] = steps[stepId] ?? { status: NOT_STARTED }
  }
  return {
    schema_version: 1,
    session_id: sessionId,
    document_revision: revision,
    created_at: '2026-01-01T00:00:00+00:00',
    updated_at: '2026-01-01T00:00:00+00:00',
    boundary: BOUNDARY_GEOJSON,
    step_order: [...STEP_ORDER],
    steps: entries,
  }
}

function committedStep(revision, features) {
  return {
    status: COMMITTED,
    revision,
    features,
    provenance: Object.fromEntries(features.features.map((f) => [f.id, 'generated'])),
  }
}

/**
 * The landform payload's map half, as production_zone_payload builds it.
 * `eligible_union` is a strict subset of the parcel, so the ineligible dim it
 * produces is a real shape rather than an empty one.
 */
const LAYERS_PAYLOAD = {
  eligible_union: polygon([
    [-74.01, 40.71],
    [-73.99, 40.71],
    [-73.99, 40.72],
    [-74.01, 40.72],
    [-74.01, 40.71],
  ]),
  exclusion_layers: [
    { type: 'slope', label: 'slope above 20.0%', data_available: true, geometry_wgs84: null },
  ],
  suggested_zones: featureCollection('zone-1', 'zone-2'),
  zones: [
    { id: 0, feature_id: 'zone-1', rank: 1, area_acres: 2.5, score: 81.0, slope_min_pct: 2.0, slope_max_pct: 8.0, aspect_available: true, dominant_aspect: 'south' },
    { id: 1, feature_id: 'zone-2', rank: 2, area_acres: 1.2, score: 64.0, slope_min_pct: 3.0, slope_max_pct: 11.0, aspect_available: false, dominant_aspect: null },
  ],
  scales: {
    bands: { poor: [0, 40], fair: [40, 60], good: [60, 80], excellent: [80, 100] },
    band_bounds: 'lower_inclusive_upper_exclusive_last_band_inclusive',
  },
  summary: { total_acres: 13.2, eligible_acres: 7.5 },
}

/**
 * The water payload's map half, in the shape water_survey_areas ships: one
 * FeatureCollection under `survey_zones` carrying an envelope per survey type,
 * plus the tabular digest and the summary the notices read.
 *
 * Enough of the wire to render the step, and no more -- the figures themselves
 * are water.test.jsx's business, against the real backend.
 */
const WATER_PAYLOAD = {
  survey_zones: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'pond-1',
        properties: {
          layer: 'survey_zone_embankment',
          survey_type: 'embankment',
          rank: 1,
          zone_acres: 1.4,
          mean_suitability: 0.71,
          canopy_overlap_pct: 0.0,
          road_overlap_pct: 0.0,
          production_overlap_pct: 0.0,
        },
        geometry: polygon([
          [-74.015, 40.705],
          [-74.012, 40.705],
          [-74.012, 40.708],
          [-74.015, 40.705],
        ]),
      },
      {
        type: 'Feature',
        id: 'pond-2',
        properties: {
          layer: 'survey_zone_excavated',
          survey_type: 'excavated',
          rank: 1,
          zone_acres: 0.8,
          mean_suitability: 0.63,
          canopy_overlap_pct: 0.0,
          road_overlap_pct: 0.0,
          production_overlap_pct: 0.0,
        },
        geometry: polygon([
          [-73.995, 40.722],
          [-73.992, 40.722],
          [-73.992, 40.725],
          [-73.995, 40.722],
        ]),
      },
    ],
  },
  zones: [
    { feature_id: 'pond-1', rows: [] },
    { feature_id: 'pond-2', rows: [] },
  ],
  summary: { soil_checked: true, zone_count: 2, dropped_count: 0 },
}

/* ===========================================================================
   Harness
   =========================================================================== */

/**
 * THE CATALOGUE ROUTE, SERVED BY DEFAULT ON EVERY HARNESS.
 *
 * The wizard asks for GET /api/steps on mount now -- that is where the rail's
 * order comes from before a session exists (stepCatalog.jsx) -- so every test
 * that renders it makes this call whether or not the test is about it. Serving
 * it here rather than adding a line to thirty `installFetch` calls keeps the
 * per-test route lists about what each test is actually exercising.
 *
 * IT IS LAST IN THE LIST, so a test that declares its own /api/steps route --
 * an empty catalogue, a failure -- still wins: routes are matched in order.
 */
const STEPS_ROUTE = { method: 'GET', pattern: /^\/api\/steps$/, responses: { body: { step_order: [...STEP_ORDER] } } }

function installFetch(routes) {
  routes = [...routes, STEPS_ROUTE]
  const calls = []
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
    const { status = 200, body, blob, gate } = responses[index]

    // A RESPONSE A TEST CAN HOLD OPEN. Everything else here resolves within
    // the act() that triggered it, which makes "what does the chrome look
    // like while the request is in flight" unaskable -- and that question is
    // the whole of what the loading state is for.
    if (gate) await gate

    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      blob: async () => blob ?? new Blob(['%PDF-1.4']),
    }
  })

  return calls
}

/** The recorded calls matching one method and path pattern. */
function pathsOf(calls, method, pattern) {
  return calls.filter((call) => call.method === method && pattern.test(call.path))
}

function route(method, pattern, responses) {
  return { method, pattern, responses }
}

/**
 * The map surface under test: a real Leaflet map with the stack in it, the
 * wizard column beside it, and a probe for the store, the cursor and the map.
 */
async function renderSurface({ definitions = STEP_DEFINITIONS, children = null } = {}) {
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
        <WizardCursorProvider definitions={definitions}>
          <Probe />
          <MapContainer center={[40.715, -74]} zoom={14} style={{ height: 600, width: 600 }}>
            <MapProbe />
            <MapLayerStack />
            {children}
          </MapContainer>
          <WizardShell />
        </WizardCursorProvider>
      </SessionProvider>
    )
  })

  return surfaceApi({ container, root, get: () => ({ session, cursor, map }) })
}

/** Leaflet names a pane's div `leaflet-<name>-pane`, alongside our own classes. */
function paneKey(pane) {
  for (const className of pane.classList) {
    const match = /^leaflet-(.+)-pane$/.exec(className)
    if (match && match[1] !== 'map' && className !== 'leaflet-pane') return match[1]
  }
  return null
}

function surfaceApi({ container, root, get }) {
  return {
    container,
    get state() {
      return get().session.state
    },
    get actions() {
      return get().session.actions
    },
    get cursor() {
      return get().cursor
    },
    find: (testId) => container.querySelector(`[data-testid="${testId}"]`),
    all: (selector) => [...container.querySelectorAll(selector)],
    /** The stack's panes, bottom to top, as {key, z, band}. */
    panes() {
      return [...container.querySelectorAll('.leaflet-pane.stack-layer')]
        .map((pane) => ({
          key: paneKey(pane),
          z: Number(pane.style.zIndex),
          band: /stack-layer--(\w+)/.exec(pane.className)?.[1] ?? null,
          pane,
        }))
        .sort((a, b) => a.z - b.z)
    },
    pane(key) {
      return this.panes().find((entry) => entry.key === key)
    },
    text: (testId) =>
      container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null,
    /** The tools that MOUNTED, from the mount record the tools themselves render. */
    mountedTools() {
      return [...container.querySelectorAll('.map-tools__mount')].map((node) => node.dataset.tool)
    },
    armedTools() {
      return [...container.querySelectorAll('.map-tools__mount[data-armed="true"]')].map(
        (node) => node.dataset.tool
      )
    },
    async click(testId) {
      const element = container.querySelector(`[data-testid="${testId}"]`)
      if (!element) throw new Error(`no element with data-testid="${testId}"`)
      await React.act(async () => element.click())
    },
    /** A click on the map, the way Leaflet delivers one to its listeners. */
    async clickMap([lat, lng]) {
      await React.act(async () => {
        get().map.fire('click', { latlng: L.latLng(lat, lng) })
      })
    },
    /** A click on a rendered path, the way Leaflet delivers one to a layer. */
    async clickPath(pathElement) {
      await React.act(async () => {
        pathElement.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    },
    async run(fn) {
      let result
      await React.act(async () => {
        result = await fn(get().session.actions, get().cursor)
      })
      return result
    },
    async unmount() {
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
}

/** Get to a committed boundary plus landform proposals, as the wire delivers them. */
async function withLandform(ui, { steps } = {}) {
  await ui.run((a) => a.startSession(RING))
  if (steps) await ui.run((a) => a.resume('sess-1'))
  await ui.run((a) => a.loadLayers('landform'))
  return ui
}

beforeEach(() => {
  // The catalogued step order is cached for the life of the module (one
  // fetch per page); a test's answer must not leak into the next one's.
  resetStepCatalog()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  vi.restoreAllMocks()
})

/* ===========================================================================
   1. THE STACK COMPOSES IN A FIXED Z-ORDER, FROM THE DECLARATIONS
   =========================================================================== */

describe('1. stack composition', () => {
  it('orders the bands basemap -> context -> committed -> editable, off the declarations', async () => {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /^\/api\/sessions\/[^/]+$/, {
        body: serverDocument({
          revision: 2,
          steps: { landform: committedStep(1, featureCollection('zone-1')) },
        }),
      }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
    ])

    const ui = await renderSurface()
    await withLandform(ui, { steps: true })

    // landform is committed, so the wizard's cursor has moved on to water.
    expect(ui.cursor.cursorStepId).toBe('water')

    const composed = composeLayerStack({
      state: ui.state,
      definitions: definitionMap(STEP_DEFINITIONS),
      cursorStepId: ui.cursor.cursorStepId,
    })

    /**
     * THE BAND ORDER, WITH A SECOND DEFINITION IN THE REGISTRY.
     *
     * This assertion used to read `['committed', 'committed']` and said so on
     * the grounds that "the cursor step declares no layers this build knows
     * about" -- true while water was unregistered. It is registered now, and
     * what the change proves is the thing the assertion was always for: the
     * stack placed a step it had never seen, in the right band, off its
     * declarations alone. Nothing in layerStack.js was touched to make water
     * appear here.
     *
     * ONE CONTEXT (water's off-parcel scrim), the TWO COMMITTED layers from
     * the two steps that have committed, then water's TWO EDITABLE zone
     * layers -- which resolve even while empty, because that is what editable
     * means.
     */
    expect(composed.map((layer) => layer.band)).toEqual([
      'context',
      'committed',
      'committed',
      'editable',
      'editable',
    ])
    expect(composed.map((layer) => layer.layerId)).toEqual([
      'water-offparcel',
      'boundary-committed',
      'landform-committed',
      'water-embankment',
      'water-excavated',
    ])

    // ...and it reached Leaflet as panes, in ascending z within each band.
    const panes = ui.panes()
    expect(panes.map((p) => p.key)).toEqual([
      'water--water-offparcel',
      'boundary--boundary-committed',
      'landform--landform-committed',
      'water--water-embankment',
      'water--water-excavated',
    ])
    expect(panes.map((p) => p.z)).toEqual([
      BAND_BASE_Z.context,
      BAND_BASE_Z.committed,
      BAND_BASE_Z.committed + 1,
      BAND_BASE_Z.editable,
      BAND_BASE_Z.editable + 1,
    ])
    // STRICTLY ASCENDING, which is the claim: no step can reorder the bands.
    expect(panes.map((p) => p.z)).toEqual([...panes.map((p) => p.z)].sort((a, b) => a - b))

    await ui.unmount()
  })

  it('puts the context band under the committed band, and both under editable', async () => {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
    ])

    const ui = await renderSurface()
    await withLandform(ui)

    // The cursor is landform now -- boundary committed, landform is next --
    // so all three bands are live at once.
    expect(ui.cursor.cursorStepId).toBe('landform')

    const panes = ui.panes()
    const bands = panes.map((p) => p.band)
    expect(bands).toEqual([...bands].sort(byBand))
    expect(new Set(bands)).toEqual(new Set(['context', 'committed', 'editable']))

    // The two context marks are the bottom of the stack, in declaration
    // order -- the off-parcel scrim, then the eligible highlight over it --
    // and the committed boundary sits above both. That is the ordering claim,
    // in the document.
    const [lowest, second, third, next] = panes
    expect(lowest.key).toBe('landform--landform-offparcel')
    expect(second.key).toBe('landform--landform-eligible')
    // The reference layer is in the band too. It draws nothing, but it is a
    // declared layer and the stack places it like any other rather than
    // learning that one kind is special enough to skip.
    expect(third.key).toBe('landform--landform-exclusions')
    expect(next.key).toBe('boundary--boundary-committed')
    expect(lowest.z).toBeLessThan(second.z)
    expect(third.z).toBeLessThan(next.z)

    // The editable band is not drawn by the stack at all -- it belongs to the
    // tools -- so its z is above both and is asserted on the composition.
    expect(BAND_BASE_Z.context).toBeLessThan(BAND_BASE_Z.committed)
    expect(BAND_BASE_Z.committed).toBeLessThan(BAND_BASE_Z.editable)

    await ui.unmount()
  })

  it('names no step, anywhere in the stack or the tools', () => {
    // THE ARCHITECTURAL ASSERTION. The stack reads declarations; the moment it
    // needs to know which step it is rendering, the declaration has failed.
    for (const file of ['layerStack.js', 'MapLayerStack.jsx', 'StepTools.jsx', 'layers.jsx']) {
      const code = codeOf(file)
      for (const stepId of [...STEP_ORDER, BOUNDARY_STEP_ID]) {
        expect(code).not.toMatch(new RegExp(`['"\`]${stepId}['"\`]`))
      }
    }
    // ...and neither does the layer vocabulary itself: every value the stack
    // branches on is one of three closed lists.
    for (const definition of STEP_DEFINITIONS) {
      for (const layer of definition.layers) {
        expect(LAYER_BANDS).toContain(layer.band)
        expect(LAYER_KINDS).toContain(layer.kind)
        expect(LAYER_SOURCES).toContain(layer.source)
      }
    }
  })
})

/* ===========================================================================
   2. ARMING -- EXACTLY THE DECLARED TOOLS MOUNT
   =========================================================================== */

describe('2. tool arming', () => {
  it('mounts the definition’s tools and no others, asserted on what is in the document', async () => {
    installFetch([route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() })])

    const ui = await renderSurface()

    // BOUNDARY declares draw and delete. There is nothing to select -- the
    // server proposes no boundary -- so `select` must not exist on this map.
    expect(BOUNDARY_STEP.tools).toEqual(['draw', 'delete'])
    await ui.run((a) => a.setDraftInput(BOUNDARY_STEP_ID, BOUNDARY_RING_INPUT, RING))

    expect(new Set(ui.mountedTools())).toEqual(new Set(['draw', 'delete']))
    expect(ui.find('tool-select')).toBeNull()
    // No flag was consulted: the node is absent because the component is.
    expect(ui.container.querySelector('[data-tool="select"]')).toBeNull()

    await ui.unmount()
  })

  it('mounts a third verb the moment a step declares it, and only then', async () => {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
    ])

    const ui = await renderSurface()
    await withLandform(ui)

    // LANDFORM declares all three, and all three have a layer to act on.
    expect(LANDFORM_STEP.tools).toEqual(['select', 'draw', 'delete'])
    expect(new Set(ui.mountedTools())).toEqual(new Set(['select', 'draw', 'delete']))

    await ui.unmount()
  })

  it('mounts from tools[] and from nothing else, with every verb available to mount', async () => {
    // THE SELECTION UNDER TEST IS StepTools' OWN. Stand-ins for all three
    // verbs, so a verb that fails to mount fails because the step did not
    // declare it -- not because this build has no gesture behind it.
    const stubs = Object.fromEntries(
      STEP_MODES.map((tool) => [
        tool,
        function Stub() {
          return <span data-testid={`stub-${tool}`} />
        },
      ])
    )
    expect(Object.keys(TOOL_GESTURES).sort()).toEqual([...STEP_MODES].sort())

    installFetch([route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() })])
    const ui = await renderSurface({
      children: <StepToolsProbe gestures={stubs} />,
    })
    await ui.run((a) => a.setDraftInput(BOUNDARY_STEP_ID, BOUNDARY_RING_INPUT, RING))

    expect(ui.find('stub-draw')).not.toBeNull()
    expect(ui.find('stub-delete')).not.toBeNull()
    expect(ui.find('stub-select')).toBeNull()

    await ui.unmount()
  })
})

/** StepTools mounted a second time, over the cursor step's editable layers. */
function StepToolsProbe({ gestures }) {
  const { state } = useSession()
  const { cursorStepId, definition, definitions } = useWizardCursor()
  const layers = composeLayerStack({ state, definitions, cursorStepId }).filter(
    (layer) => layer.band === 'editable'
  )
  return <StepTools definition={definition} layers={layers} gestures={gestures} />
}

/* ===========================================================================
   3. STRUCTURAL EXCLUSION -- TWO ARMED TOOLS IS UNREACHABLE
   =========================================================================== */

describe('3. structural exclusion', () => {
  it('cannot reach a two-tools-armed state through any of the wizard’s own actions', async () => {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
    ])

    const ui = await renderSurface()
    await withLandform(ui)

    // WALK EVERY ACTION THE WIZARD EXPOSES, in every order, and count the
    // armed mounts after each. This is not "a throw fires" -- nothing throws
    // below. It is that the register holds ONE name, so arming a second tool
    // displaces the first rather than joining it.
    const declared = ui.cursor.tools
    expect(declared).toEqual(['select', 'draw', 'delete'])

    const armings = [...declared, ...declared, ...[...declared].reverse()]
    for (const tool of armings) {
      await ui.run((_a, cursor) => cursor.arm(tool))
      expect(ui.armedTools()).toEqual([tool])
      expect(ui.cursor.armed).toBe(tool)
    }

    // ...AND THERE IS NO SECOND DOOR TO GO ROUND IT WITH. The legacy arming
    // door took ANY name and wrote this same slot; it existed for the spike's two
    // gestures and the access point was the last of them. The access-point
    // pre-step is gone (it is an input of roads, not a global field), so the
    // door has no callers and is not on the context at all. Arming is exactly
    // "one of the cursor step's declared tools" with no exception left.
    expect(ui.cursor[LEGACY_DOOR_NAME]).toBeUndefined()
    expect(ui.cursor.legacyGesture).toBeUndefined()

    // A COMMIT ALSO EMPTIES THE SLOT, through the same one value.
    await ui.run((_a, cursor) => cursor.arm('draw'))
    await ui.run((_a, cursor) => cursor.advance())
    expect(ui.armedTools()).toEqual([])
    expect(ui.cursor.armed).toBeNull()

    // MOVING THE CURSOR DISARMS, with no effect having to fire: the slot holds
    // {step, tool}, and a tool reads as armed only while the cursor still
    // names its step.
    await ui.run((_a, cursor) => cursor.open(BOUNDARY_STEP_ID))
    expect(ui.cursor.cursorStepId).toBe(BOUNDARY_STEP_ID)
    expect(ui.cursor.armed).toBeNull()
    expect(ui.armedTools()).toEqual([])

    await ui.unmount()
  })

  it('refuses a tool the cursor step does not declare, so no unmounted gesture can be live', async () => {
    installFetch([route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() })])
    const ui = await renderSurface()
    await ui.run((a) => a.setDraftInput(BOUNDARY_STEP_ID, BOUNDARY_RING_INPUT, RING))

    // The refusal is the second half of the structure: the slot can hold one
    // name, and `arm` will only put a DECLARED one in it. Without this, a
    // caller could arm a verb whose component was never mounted -- which reads
    // as a tool that does nothing.
    expect(() => ui.cursor.arm('select')).toThrow(/does not declare/)
    expect(ui.cursor.armed).toBeNull()
    expect(ui.armedTools()).toEqual([])

    await ui.unmount()
  })
})

/* ===========================================================================
   4. BOUNDARY STEP 0 -- DrawTool WRITES INTO THE DRAFT
   =========================================================================== */

describe('4. the boundary step', () => {
  it('places vertices into the step’s draft, and committing creates the session', async () => {
    const calls = installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
    ])

    const ui = await renderSurface()
    expect(ui.cursor.cursorStepId).toBe(BOUNDARY_STEP_ID)
    // Nothing drawn, so the strip has no tab to show.
    expect(ui.find(`tabs-${BOUNDARY_STEP_ID}`)).toBeNull()

    // ARM THROUGH THE ACTION BANNER, the way a user does.
    await ui.click(`draw-${BOUNDARY_STEP_ID}`)
    expect(ui.armedTools()).toEqual(['draw'])

    // FOUR CLICKS ON THE MAP. DrawTool is mounted by the stack, wired to the
    // boundary step's declared draft input -- there is no App state in this
    // path at all.
    for (const [lat, lng] of RING) await ui.clickMap([lat, lng])

    const ring = selectDraft(ui.state, BOUNDARY_STEP_ID).inputs[BOUNDARY_RING_INPUT]
    expect(ring).toEqual(RING)
    expect(ui.text(`tab-${BOUNDARY_RING_INPUT}`)).toContain('4points')

    // Clicking the first vertex closes the ring, which disarms -- the gesture
    // ending IS the slot emptying.
    await ui.clickMap(RING[0])
    expect(ui.cursor.armed).toBeNull()
    expect(selectDraft(ui.state, BOUNDARY_STEP_ID).inputs[BOUNDARY_RING_INPUT]).toEqual(RING)

    // COMMIT. One POST /api/sessions, carrying the ring the map wrote.
    await ui.click(`commit-${BOUNDARY_STEP_ID}`)
    expect(calls.filter((c) => c.path === '/api/sessions')).toHaveLength(1)
    // The POST specifically -- the wizard's own GET /api/steps is also in
    // `calls`, and it is the first of them.
    expect(pathsOf(calls, 'POST', /^\/api\/sessions$/)[0].body.boundary).toEqual(BOUNDARY_GEOJSON)
    expect(selectSessionId(ui.state)).toBe('sess-1')

    // And the ring is now the DOCUMENT's, not the draft's: the boundary moved
    // to the committed band, and nothing on this step is editable any more.
    expect(ui.cursor.cursorStepId).toBe('landform')
    expect(ui.panes().some((p) => p.key === 'boundary--boundary-committed')).toBe(true)

    await ui.unmount()
  })
})

/* ===========================================================================
   5. THE INELIGIBLE-AREA DIM
   =========================================================================== */

describe('5. the context band: scrim, highlight, and data nothing draws', () => {
  it('draws the off-parcel scrim and the eligible highlight, and draws the reference layer not at all', async () => {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
    ])

    const ui = await renderSurface()
    await withLandform(ui)

    // THE SCRIM: everything AROUND the parcel. A ring far enough out to cover
    // the visible map, with the parcel as its hole -- two subpaths, not one.
    const scrim = ui.panes().find((p) => p.key === 'landform--landform-offparcel')
    expect(scrim).toBeDefined()
    expect(scrim.band).toBe('context')
    const scrimPaths = [...scrim.pane.querySelectorAll('path')]
    expect(scrimPaths).toHaveLength(1)
    expect((scrimPaths[0].getAttribute('d').match(/M/g) ?? []).length).toBe(2)

    // THE HIGHLIGHT: the eligible union itself, tinted. One ring -- it names
    // ground that qualifies rather than the complement of it.
    const highlight = ui.panes().find((p) => p.key === 'landform--landform-eligible')
    expect(highlight).toBeDefined()
    expect(highlight.band).toBe('context')
    const highlightPaths = [...highlight.pane.querySelectorAll('path')]
    expect(highlightPaths).toHaveLength(1)
    expect((highlightPaths[0].getAttribute('d').match(/M/g) ?? []).length).toBe(1)

    // Both are CONTEXT: read-only, and neither ever takes a click.
    for (const path of [...scrimPaths, ...highlightPaths]) {
      expect(path.classList.contains('leaflet-interactive')).toBe(false)
    }

    // THE REFERENCE LAYER RESOLVED AND DREW NOTHING. It is declared, it is in
    // the composed stack, its pane exists -- and there is not a path in it.
    // That is what `kind: 'reference'` means: data the tools consume.
    const reference = ui.panes().find((p) => p.key === 'landform--landform-exclusions')
    expect(reference).toBeDefined()
    expect(reference.pane.querySelectorAll('path')).toHaveLength(0)

    // And all three came off the declaration rather than off a key name a
    // renderer recognised.
    const declared = LANDFORM_STEP.layers.filter((layer) => layer.band === 'context')
    expect(declared.map((layer) => [layer.kind, layer.key])).toEqual([
      ['scrim', null],
      ['highlight', 'eligible_union'],
      ['reference', 'exclusion_layers'],
    ])

    await ui.unmount()
  })
})

/* ===========================================================================
   6. A COMMITTED LAYER IS NOT A CONTROL
   ===========================================================================

   THIS SECTION USED TO ASSERT THE OPPOSITE, and the affordance it asserted
   was sound: a click on committed geometry called the cursor's `open()`,
   moving the wizard to the step that owns it, where that step's own reopen
   was waiting. It never armed a tool.

   It is withdrawn because it does not survive a document with more than one
   committed step. During water, committed production zones cover much of the
   parcel: a click landing on one is far more likely to mean "put this panel
   away" than "take me back to landform". By fencing there are five committed
   layers blanketing the ground, every one a cursor-moving target, and the map
   becomes a surface where most clicks navigate.

   The rail is the route that keeps working -- it lists every step, carries
   the reopen with its confirmation, and is the same size whatever the
   document holds. Section 7 below asserts it still does.
   =========================================================================== */

describe('6. the committed band', () => {
  it('takes no click, and moves nothing, in landform and in water', async () => {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /^\/api\/sessions\/[^/]+$/, {
        body: serverDocument({
          revision: 3,
          steps: {
            landform: committedStep(1, featureCollection('zone-1')),
            water: { status: GENERATED, revision: 2 },
          },
        }),
      }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
      route('GET', /\/steps\/water\/layers$/, { body: WATER_PAYLOAD }),
    ])

    const ui = await renderSurface()
    await ui.run((a) => a.startSession(RING))
    await ui.run((a) => a.resume('sess-1'))

    // IN WATER, with landform's zones on the map as context beneath it.
    expect(ui.cursor.cursorStepId).toBe('water')
    const committed = ui.pane('landform--landform-committed').pane
    const path = committed.querySelector('path')

    // The geometry is DRAWN and takes no clicks. `interactive` is not a style
    // prop -- it is whether Leaflet registers the path as a target at all --
    // so this is the whole assertion and not a proxy for one.
    expect(path).not.toBeNull()
    expect(path.classList.contains('leaflet-interactive')).toBe(false)

    // And a click on it does nothing: it is not in the map's target registry,
    // so the event reaches the map, which clears the focus and no more.
    await ui.run((_a, cursor) => cursor.focusFeature('pond-1'))
    await ui.clickPath(path)
    expect(ui.cursor.cursorStepId).toBe('water')
    expect(ui.cursor.focusedFeatureId).toBeNull()
    expect(ui.cursor.armed).toBeNull()
    expect(ui.state.drafts.landform).toBeUndefined()

    // IN LANDFORM: the cursor on the committed step itself, its own features
    // still drawn, and still not a control.
    await ui.run((_a, cursor) => cursor.open('landform'))
    const own = ui.pane('landform--landform-committed').pane.querySelector('path')
    expect(own).not.toBeNull()
    expect(own.classList.contains('leaflet-interactive')).toBe(false)

    await ui.clickPath(own)
    expect(ui.cursor.cursorStepId).toBe('landform')
    expect(ui.cursor.armed).toBeNull()
    expect(ui.armedTools()).toEqual([])

    await ui.unmount()
  })

  it('leaves the rail as the route to a committed step, reopen and all', async () => {
    const calls = installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /^\/api\/sessions\/[^/]+$/, {
        body: serverDocument({
          revision: 3,
          steps: {
            landform: committedStep(1, featureCollection('zone-1')),
            water: { status: GENERATED, revision: 2 },
          },
        }),
      }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
      route('GET', /\/steps\/water\/layers$/, { body: WATER_PAYLOAD }),
      route('POST', /\/steps\/landform\/reopen$/, {
        body: serverDocument({
          revision: 4,
          steps: { landform: { status: GENERATED, revision: 3 } },
        }),
      }),
    ])

    const ui = await renderSurface()
    await ui.run((a) => a.startSession(RING))
    await ui.run((a) => a.resume('sess-1'))
    expect(ui.cursor.cursorStepId).toBe('water')

    // THE RAIL ROW, clicked the way a user clicks it.
    await ui.click('rail-landform')
    expect(ui.cursor.cursorStepId).toBe('landform')
    expect(ui.cursor.armed).toBeNull()

    // THE REOPEN IS UNCHANGED, confirmation and all: the button only REQUESTS
    // it, and nothing reaches the server until the cost has been named.
    await ui.click('edit-landform')
    expect(ui.find('reopen-confirm-landform')).not.toBeNull()
    expect(pathsOf(calls, 'POST', /\/reopen$/)).toHaveLength(0)

    await ui.click('reopen-confirm-yes-landform')
    expect(pathsOf(calls, 'POST', /\/reopen$/)).toHaveLength(1)
    expect(ui.state.steps.landform.status).toBe(GENERATED)

    await ui.unmount()
  })
})

/* ===========================================================================
   7. DELETE REMOVES A DRAWN FEATURE
   =========================================================================== */

describe('7. the delete tool', () => {
  it('removes a drawn feature from the draft, and only while it is armed', async () => {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
    ])

    const ui = await renderSurface()
    await withLandform(ui)

    const drawn = {
      type: 'Feature',
      id: 'drawn-1',
      properties: { provenance: PROVENANCE_USER_ADDED },
      geometry: polygon([
        [-74.005, 40.715],
        [-73.995, 40.715],
        [-73.995, 40.718],
        [-74.005, 40.715],
      ]),
    }
    await ui.run((a) => a.addDrawnFeature('landform', drawn))
    expect(selectDraft(ui.state, 'landform').drawnFeatures.map((f) => f.id)).toEqual(['drawn-1'])

    // WITH NOTHING ARMED the shape is on the map and DOES take clicks -- but
    // the click focuses it rather than deleting it. Focus is navigation, like
    // the click committed geometry takes, and nothing arms it.
    const drawnPane = () => ui.pane('landform--landform-drawn').pane
    expect(drawnPane().querySelectorAll('path').length).toBeGreaterThan(0)
    expect(drawnPane().querySelectorAll('path.leaflet-interactive').length).toBeGreaterThan(0)

    // WITH ANOTHER TOOL ARMED it takes none, which is the collision the arming
    // register exists to prevent: a drawn shape that swallowed clicks under a
    // live draw would eat the vertex being placed on top of it.
    await ui.run((_a, cursor) => cursor.arm('draw'))
    expect(drawnPane().querySelectorAll('path.leaflet-interactive')).toHaveLength(0)

    await ui.run((_a, cursor) => cursor.arm('delete'))
    const clickable = [...drawnPane().querySelectorAll('path.leaflet-interactive')]
    expect(clickable.length).toBeGreaterThan(0)

    await ui.clickPath(clickable[0])
    expect(selectDraft(ui.state, 'landform').drawnFeatures).toEqual([])

    await ui.unmount()
  })
})

/* ===========================================================================
   8. THE SPIKE IS GONE, AND THE PAGE STILL RUNS
   =========================================================================== */

describe('8. the production-zone spike', () => {
  it('leaves no endpoint, no component and no orphaned state behind', () => {
    const read = (name) => readFileSync(path.join(HERE, '..', name), 'utf8')
    const app = read('App.jsx')

    // THE ENDPOINT. Nothing anywhere under src/ calls it any more -- not the
    // page, not a helper, not a test fixture pretending to be one.
    //
    // Assembled rather than written out, so THIS file is inside the sweep. A
    // literal here would match itself and the assertion would be about a
    // string constant rather than about the tree.
    const SPIKE_ENDPOINT = '/api/' + 'production' + '-zones'
    const sources = sourceFiles(path.join(HERE, '..'))
    for (const file of sources) {
      expect(readFileSync(file, 'utf8')).not.toContain(SPIKE_ENDPOINT)
    }

    // THE COMPONENTS. Deleted, and not merely unimported: a file left on disk
    // is a second implementation of the visual language waiting to be picked
    // up by whoever migrates the next step.
    //
    // Names assembled, so this file is inside its own sweep. The IMPORT is
    // what is asserted absent rather than the name -- LandformPanel's header
    // says which panel it is a migration of, and a file explaining where it
    // came from is not a file reaching for something that is gone.
    for (const stem of ['ProductionZonePanel', 'ProductionZone' + 'Layers', 'ProductionDrawn' + 'Zones']) {
      expect(existsSync(path.join(HERE, '..', `${stem}.jsx`))).toBe(false)
      const importsIt = new RegExp(`(from|import)\\s*\\(?['"][^'"]*${stem}\\.jsx['"]`)
      for (const file of sources) {
        expect(readFileSync(file, 'utf8')).not.toMatch(importsIt)
      }
    }

    // WHAT SURVIVED, AND HAD TO. The gesture, the pure geometry and the hatch
    // are the parts the spike was built to preserve; they are the landform
    // step's now and are imported from where they always were.
    for (const kept of [
      'ZoneDrawTool.jsx',
      'ProductionHatchPattern.jsx',
      'zoneGeometry.js',
      'geo.js',
    ]) {
      expect(existsSync(path.join(HERE, '..', kept))).toBe(true)
    }

    // THE ELEVEN useState HOOKS. App.jsx's own comment said they were what a
    // spike looks like before the session layer exists and that they would be
    // discarded wholesale; each name is checked rather than the count, so a
    // survivor is named rather than counted.
    for (const orphan of [
      'productionZones',
      'isLoadingZones',
      'zonesError',
      'deselectedIds',
      'drawnZones',
      'zonePoints',
      'liveCautions',
      'clampNotice',
      'inProductionZones',
      'clearProductionZones',
      'CLAMP_NOTICE_MIN_ACRES',
    ]) {
      expect(app).not.toContain(orphan)
    }

    // AND THE LEGACY ARMING DOOR IS CLOSED. The zone draw became a declared
    // tool of the landform step; the access point was the last gesture still
    // going through the door, and the access-point PRE-STEP is gone -- it is
    // an input of roads, not a global field. A deliberately-loose entrance
    // with no caller is an invitation rather than a compromise, so the door
    // went with its last user.
    expect(app).not.toContain("'zone-draw'")
    expect(app).not.toContain("'access-point'")
    const cursor = codeOf('..', 'wizard', 'WizardCursor.jsx')
    expect(cursor).not.toContain(LEGACY_DOOR_NAME)
    // Prose-stripped: the cursor's header explains at length WHY the door was
    // closed, and a file that says what it no longer has is not a file
    // reaching for it. Same rule the no-step-id sweep follows.
    for (const file of sourceFiles(path.join(HERE, '..'))) {
      expect(stripProse(readFileSync(file, 'utf8'))).not.toContain(`${LEGACY_DOOR_NAME}(`)
    }
  })

  it('runs the whole page end to end -- boundary, landform, a drawn zone, commit', async () => {
    const generated = serverDocument({ steps: { landform: { status: GENERATED } } })
    const committedDocument = serverDocument({
      revision: 2,
      steps: { landform: committedStep(1, featureCollection('zone-1')) },
    })

    const calls = installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('POST', /\/steps\/landform\/generate$/, {
        status: 202,
        body: { job_id: 'job-1', status: 'running' },
      }),
      route('GET', /^\/api\/jobs\/job-1$/, {
        body: { job_id: 'job-1', status: 'done', result: { payload: LAYERS_PAYLOAD, document: generated } },
      }),
      route('POST', /\/steps\/landform\/commit$/, { body: committedDocument }),
      // NO ROUTE FOR /api/generate-report-pdf, and nothing asks for one. The
      // access-point pre-step that fed it is gone, so no affordance on this
      // page reaches that endpoint; installFetch throws on an unrouted
      // request, so a survivor would fail here rather than pass quietly.
    ])

    const App = (await import('../App.jsx')).default
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await React.act(async () => root.render(<App />))

    const byTestId = (id) => container.querySelector(`[data-testid="${id}"]`)
    const clickTestId = async (id) => {
      const target = byTestId(id)
      if (!target) throw new Error(`no element with data-testid="${id}"`)
      await React.act(async () => target.click())
    }
    const settle = async () => {
      for (let i = 0; i < 40; i++) {
        await React.act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
        })
      }
    }

    const map = containerMap(container)
    // ZOOM IN FIRST, which is what AddressSearch does for a real user. The app
    // opens on the whole continental US at zoom 4, where this parcel is half a
    // pixel wide and every vertex lands inside the draw tool's 15 px hit
    // radius -- so the second click would read as "you clicked the first
    // vertex" and be swallowed. The gesture is pixel-based on purpose (see
    // vertexAtPixel); this is the test standing where the user stands.
    await React.act(async () => map.setView([40.715, -74.0], 14))

    // THE BOUNDARY, through the wizard's own affordance -- the action banner's
    // button for the state the step is in, and now the only one on the page.
    await clickTestId(`draw-${BOUNDARY_STEP_ID}`)
    for (const [lat, lng] of RING) {
      await React.act(async () => map.fire('click', { latlng: L.latLng(lat, lng) }))
    }
    // FINISH, THEN COMMIT, and the banner offers exactly one of the two at a
    // time: while the draw is armed the state is `editing` and the pair is
    // undo/finish, and there is no commit to press. Finishing disarms, which
    // is what moves the step to `reviewing`.
    expect(byTestId(`commit-${BOUNDARY_STEP_ID}`)).toBeNull()
    await clickTestId(`finish-${BOUNDARY_STEP_ID}`)
    await clickTestId(`commit-${BOUNDARY_STEP_ID}`)
    // AUTO-ADVANCE: the commit is the forward move, so the chrome is
    // landform's now and the boundary's is not on screen at all.
    expect(byTestId(`step-${BOUNDARY_STEP_ID}`)).toBeNull()
    expect(byTestId('step-landform').dataset.stepState).toBe('idle')

    // LANDFORM, through the session endpoints. The route list above has no
    // entry for the spike's, so a call to it would throw "no route" rather
    // than be quietly served -- which is a stronger assertion than counting
    // it, and keeps the name out of this file so the sweep above can include
    // it.
    await clickTestId('generate-landform')
    await settle()
    expect(pathsOf(calls, 'POST', /\/steps\/landform\/generate$/)).toHaveLength(1)
    // One tab per proposal, in the strip along the bottom.
    expect(byTestId('tabs-landform').dataset.tabCount).toBe('2')

    // A DRAWN ZONE, through the landform step's declared draw tool.
    await clickTestId('draw-landform')
    const zoneRing = [
      [40.71, -74.01],
      [40.71, -73.99],
      [40.72, -73.99],
    ]
    for (const [lat, lng] of zoneRing) {
      await React.act(async () => map.fire('click', { latlng: L.latLng(lat, lng) }))
    }
    await React.act(async () => map.fire('click', { latlng: L.latLng(...zoneRing[0]) }))
    // The drawn zone got its own tab, alongside the three proposals.
    expect(byTestId('tabs-landform').dataset.tabCount).toBe('3')
    expect(container.textContent).toMatch(/Drawn 1/)

    // COMMIT, to the session endpoint, and on again.
    await clickTestId('commit-landform')
    await settle()
    expect(pathsOf(calls, 'POST', /\/steps\/landform\/commit$/)).toHaveLength(1)
    expect(byTestId('step-water')).not.toBeNull()

    // AND THE PDF PATH IS NOT ON THIS PAGE. It required an access point, the
    // access point is an input of the roads step rather than a global field,
    // and the pre-step that collected it is deleted. The route is untouched on
    // the server; what has no caller is the button.
    expect(container.textContent).not.toMatch(/Access Point/i)
    expect(container.textContent).not.toMatch(/Scale of Permanence Report/i)
    expect(calls.filter((c) => c.path === '/api/generate-report-pdf')).toHaveLength(0)

    await React.act(async () => root.unmount())
    container.remove()
  })

  it('does not loop clearing its own results once the boundary is committed', async () => {
    // A REGRESSION F3 INTRODUCED AND THEN CLOSED, AND STILL WORTH HOLDING.
    // The ring read out of the document is rebuilt on every call -- [lng, lat]
    // on the wire, [lat, lng] here -- so an identity comparison against it
    // answers "changed" every render. App.jsx drops a stale REPORT when the
    // ring moves (it used to drop the spike's zone payload too); with a
    // committed boundary that would have fired forever.
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
    ])

    const ui = await renderSurface()
    await ui.run((a) => a.startSession(RING))
    expect(selectSessionId(ui.state)).toBe('sess-1')

    const before = composeLayerStack({
      state: ui.state,
      definitions: definitionMap(STEP_DEFINITIONS),
      cursorStepId: ui.cursor.cursorStepId,
    }).find((layer) => layer.layerId === 'boundary-committed')

    // Re-render without dispatching anything: the ring the stack resolves has
    // to be equal, and a consumer holding it by content sees no change.
    await ui.run((_a, cursor) => cursor.open(BOUNDARY_STEP_ID))
    const after = composeLayerStack({
      state: ui.state,
      definitions: definitionMap(STEP_DEFINITIONS),
      cursorStepId: ui.cursor.cursorStepId,
    }).find((layer) => layer.layerId === 'boundary-committed')

    expect(after.ring).toEqual(before.ring)
    // ...and the signature App holds it by is stable even though the array is
    // not, which is the whole of the fix.
    const signature = (ring) => ring.map((point) => point.join()).join(';')
    expect(signature(after.ring)).toBe(signature(before.ring))
    expect(after.ring).not.toBe(before.ring)

    await ui.unmount()
  })
})

/**
 * Every .js/.jsx file under src/, so "nothing calls that endpoint any more" is
 * a claim about the tree rather than about the files someone remembered.
 */
function sourceFiles(root) {
  const found = []
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry)
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full))
    else if (/\.jsx?$/.test(entry)) found.push(full)
  }
  return found
}

/** The Leaflet map instance behind a rendered container. */
function containerMap(container) {
  const node = container.querySelector('.leaflet-container')
  // Leaflet stashes the map on the element it initialised.
  return node._leaflet_map ?? MAPS.get(node)
}

/**
 * Leaflet does not expose a map from its container element, so the one under
 * test is captured as it is created. A test-only registry, and the narrowest
 * hook that does not require App.jsx to grow a prop for the tests' benefit.
 */
const MAPS = new Map()
const originalMapInit = L.Map.prototype.initialize
L.Map.prototype.initialize = function patched(element, options) {
  const result = originalMapInit.call(this, element, options)
  MAPS.set(this._container, this)
  return result
}

/* ===========================================================================
   9. THE DEV MUTUAL-EXCLUSION ASSERTIONS
   =========================================================================== */

describe('9. the mutual-exclusion assertions', () => {
  it('are gone from App.jsx, along with the state they guarded', () => {
    const app = readFileSync(path.join(HERE, '..', 'App.jsx'), 'utf8')

    // BOTH THROWS RETIRED. Not narrowed and not moved: the three independent
    // booleans they asserted over are three readings of one slot now, so
    // "two tools armed" is not a state App can hold.
    expect(app).not.toContain('must be mutually exclusive')
    expect(app).not.toContain('are both armed')
    expect(app).not.toMatch(/useState\(false\)\s*\/\/?.*isDrawing/)
    for (const gone of [
      'setIsDrawing(',
      'setIsFinished(',
      'setIsDrawingZone(',
      'setIsSelectingAccessPoint(',
    ]) {
      expect(app).not.toContain(gone)
    }

    // ALL THREE ARE GONE FROM THIS FILE ENTIRELY NOW, rather than two of them
    // derived and one still read. The boundary's draw and the zone draw are
    // their steps' declared tools, armed through the wizard's one door; the
    // access-point pick was the third, and the pre-step that armed it is
    // deleted. App does not read the arming register at all -- it does not
    // call useWizardCursor, because there is nothing on this page outside the
    // wizard that needs to know what is armed.
    expect(app).not.toContain('isDrawing')
    expect(app).not.toContain('isSelectingAccessPoint')
    expect(app).not.toContain("'zone-draw'")
    expect(app).not.toContain('useWizardCursor')

    const cursorCode = codeOf('..', 'wizard', 'WizardCursor.jsx')
    // ONE useState for the arming, holding ONE {stepId, tool}. Two slots would
    // be the invariant back, so the count is the assertion.
    expect(cursorCode.match(/useState\(NOTHING_ARMED\)/g)).toHaveLength(1)
    expect(cursorCode).not.toMatch(/setArmed\w*\(\s*\[/)

    // AND THE RING IS NOT READ HERE EITHER. It was App's `points` useState,
    // then App's read of the boundary step's draft; it is now only the
    // wizard's and the map stack's, because the two things that made App read
    // it -- its own boundary buttons and the PDF path -- are both deleted.
    expect(app).not.toMatch(/const \[points, setPoints\]/)
    expect(app).not.toContain('selectBoundaryRing')
  })
})

/* ===========================================================================
   10. A CLICK ON BARE MAP MOVES NOTHING BUT THE FOCUS
   ===========================================================================

   THE BUG THIS SECTION IS THE RECORD OF. Clicking empty ground threw the
   wizard back to an earlier step -- usually the boundary, where the banner
   reads "Start a different boundary", sometimes landform. It reproduced on
   EVERY click inside the parcel, in landform and in water alike.

   AND THE CURSOR WAS NEVER THE THING AT FAULT. It is explicit state and
   always was (WizardCursor's `openStepId`); nothing re-derived it and nothing
   reset it. What happened is that the ground the user clicked was not bare:
   the committed boundary's ring layer drew ONE path carrying both the line
   and the parcel FILL, and the committed band makes its layers interactive so
   that clicking settled geometry offers navigation. So the whole interior of
   the parcel -- every square foot of ground every later step works on -- was
   a click target belonging to the boundary, and the stack did exactly what it
   is documented to do with a click on a committed layer: it called open().

   The fill is its own non-interactive path now (see RingLayer), so a click on
   the ground reaches the map, which is where BackgroundClick has always been
   waiting to do the one thing it does. These tests assert the CURSOR, not
   that the panel closed: the panel closing was never the part that broke.
   =========================================================================== */

describe('10. the bare-map click', () => {
  /**
   * Boundary committed, landform committed, water generated with proposals --
   * so the map carries a committed ring, a committed zone and an editable
   * band at once, which is the frame the bug was reported in.
   */
  async function surfaceAtWater() {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /^\/api\/sessions\/[^/]+$/, {
        body: serverDocument({
          revision: 3,
          steps: {
            landform: committedStep(1, featureCollection('zone-1')),
            water: { status: GENERATED, revision: 2 },
          },
        }),
      }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
      route('GET', /\/steps\/water\/layers$/, { body: WATER_PAYLOAD }),
    ])

    const ui = await renderSurface()
    await ui.run((a) => a.startSession(RING))
    await ui.run((a) => a.resume('sess-1'))
    return ui
  }

  /**
   * WHAT A CLICK ON BARE GROUND INSIDE THE PARCEL ACTUALLY LANDS ON: the
   * committed boundary ring's painted path, which carries the parcel fill and
   * therefore spans every square foot of it.
   *
   * The casing pass beside it is `fill: none`; this is the other one. A DOM
   * click dispatched on it is the honest simulation of that gesture, and what
   * it proves is where Leaflet routes the event -- the path is not in the
   * map's target registry, so the map's own click handler is what runs.
   */
  function parcelInterior(ui) {
    const pane = ui.pane('boundary--boundary-committed').pane
    const painted = [...pane.querySelectorAll('path')].find(
      (path) => path.getAttribute('fill') !== 'none'
    )
    if (!painted) throw new Error('the committed ring drew no filled path')
    return painted
  }

  it('leaves the cursor exactly where it was, in water', async () => {
    const ui = await surfaceAtWater()
    expect(ui.cursor.cursorStepId).toBe('water')

    // Something is being read, so there is a focus to clear.
    await ui.run((_a, cursor) => cursor.focusFeature('pond-1'))
    expect(ui.cursor.focusedFeatureId).toBe('pond-1')

    await ui.clickPath(parcelInterior(ui))

    // THE ASSERTION IS THE CURSOR. The panel going away is the visible half
    // and was never the half that failed.
    expect(ui.cursor.cursorStepId).toBe('water')
    expect(ui.cursor.focusedFeatureId).toBeNull()
    expect(ui.cursor.armed).toBeNull()

    await ui.unmount()
  })

  it('leaves the cursor exactly where it was, in landform', async () => {
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
    ])

    const ui = await renderSurface()
    await withLandform(ui)
    expect(ui.cursor.cursorStepId).toBe('landform')

    await ui.run((_a, cursor) => cursor.focusFeature('zone-1'))
    expect(ui.cursor.focusedFeatureId).toBe('zone-1')

    const statusBefore = ui.state.steps.landform.status
    const draftBefore = selectDraft(ui.state, 'landform')

    await ui.clickPath(parcelInterior(ui))

    expect(ui.cursor.cursorStepId).toBe('landform')
    expect(ui.cursor.focusedFeatureId).toBeNull()

    // AND THE STEP IS UNTOUCHED. Not reopened, not reset, not re-seeded --
    // the click said "nothing, thanks" and that is all it said.
    expect(ui.state.steps.landform.status).toBe(statusBefore)
    expect(selectDraft(ui.state, 'landform')).toBe(draftBefore)

    await ui.unmount()
  })

  it('leaves the cursor alone over ground a committed zone sits under', async () => {
    const ui = await surfaceAtWater()
    expect(ui.cursor.cursorStepId).toBe('water')

    // THE FALL-THROUGH PATH. The committed landform zone is on the map, in a
    // pane of its own, at the same ground -- and the thing the pointer is
    // over is the parcel fill, which takes no clicks. So the event reaches
    // the map rather than the zone, and a click that reached nothing must
    // move nothing.
    const committed = ui.pane('landform--landform-committed').pane
    expect(committed.querySelectorAll('path').length).toBeGreaterThan(0)

    await ui.clickMap([40.715, -74.0])
    expect(ui.cursor.cursorStepId).toBe('water')

    await ui.clickPath(parcelInterior(ui))
    expect(ui.cursor.cursorStepId).toBe('water')

    await ui.unmount()
  })

  it('leaves no interactive path anywhere in the settled bands', async () => {
    const ui = await surfaceAtWater()

    // THE STRUCTURAL FORM OF THIS SECTION'S CLAIM. The bug was one committed
    // layer being a click target over the whole parcel; the guarantee is not
    // "that one is fixed" but "the settled bands are read-only", and that is
    // a fact about every pane rather than about the ring.
    const settled = ui.panes().filter((entry) => entry.band !== 'editable')
    expect(settled.length).toBeGreaterThan(1)
    for (const entry of settled) {
      const interactive = [...entry.pane.querySelectorAll('path.leaflet-interactive')]
      expect({ pane: entry.key, interactive: interactive.length }).toEqual({
        pane: entry.key,
        interactive: 0,
      })
    }

    // And the paint is untouched: the ring still draws its casing and its
    // filled line, and the committed zone still draws its hatch.
    expect(ui.pane('boundary--boundary-committed').pane.querySelectorAll('path')).toHaveLength(2)
    expect(ui.pane('landform--landform-committed').pane.querySelectorAll('path')).toHaveLength(1)

    await ui.unmount()
  })

  it('navigates to an earlier committed step and back with every status unchanged', async () => {
    const ui = await surfaceAtWater()
    const before = Object.fromEntries(
      Object.entries(ui.state.steps).map(([id, step]) => [id, step.status])
    )
    expect(ui.cursor.cursorStepId).toBe('water')

    await ui.run((_a, cursor) => cursor.open('landform'))
    expect(ui.cursor.cursorStepId).toBe('landform')

    // A bare-map click while parked on the committed step: still no move.
    await ui.clickPath(parcelInterior(ui))
    expect(ui.cursor.cursorStepId).toBe('landform')

    await ui.run((_a, cursor) => cursor.open('water'))
    expect(ui.cursor.cursorStepId).toBe('water')

    // NOTHING WAS REOPENED AND NOTHING CASCADED. Navigation is a statement
    // about which panel is on screen and about nothing else.
    const after = Object.fromEntries(
      Object.entries(ui.state.steps).map(([id, step]) => [id, step.status])
    )
    expect(after).toEqual(before)
    expect(after.landform).toBe(COMMITTED)
    expect(after.water).toBe(GENERATED)

    await ui.unmount()
  })

  it('renders a committed step’s own features with the cursor sitting on it', async () => {
    const ui = await surfaceAtWater()
    await ui.run((_a, cursor) => cursor.open('landform'))
    expect(ui.cursor.cursorStepId).toBe('landform')

    // THE COMMITTED BAND IS NOT THE CURSOR STEP'S -- it is gathered from every
    // committed step -- so the step the cursor is ON keeps drawing its own
    // settled work rather than dropping it for being "the active one".
    const pane = ui.pane('landform--landform-committed')
    expect(pane).toBeDefined()
    expect(pane.band).toBe('committed')
    expect(pane.pane.querySelectorAll('path')).toHaveLength(1)

    // And the chrome is the committed step's: the reopen affordance, not a
    // commit button over an empty map.
    expect(ui.find('edit-landform')).not.toBeNull()
    expect(ui.find('commit-landform')).toBeNull()

    await ui.unmount()
  })
})

/* ===========================================================================
   11. A STEP ARRIVED AT WITHOUT ITS PROPOSALS
   ===========================================================================

   THE SECOND SEVERE BUG, AND IT IS THE SAME SHAPE AS THE FIRST ONE THIS APP
   HAD. A generate carries its own payload back with the job result, so within
   one session the proposals were always already there. Arrive at a
   `generated` step any other way -- a reload, or a navigation back to it --
   and they are not: `resume` hydrates a document that says `generated` and
   fetches no payload.

   deriveMachineState read `hasProposals || status === GENERATED`, so the step
   landed in REVIEWING: no tabs, no zones on the map, and a primary button
   reading "Commit no water zones". One click recorded a decision the user
   never made, and `min_features: 0` made it a legal request that returned
   200. That is the second bug the legal empty commit has swallowed; the first
   was buildCommitBody reading `suggested_zones` for every step.

   AND THE EMPTY COMMIT WOULD HAVE BEEN EMPTY EVEN WITH A FULL DRAFT.
   buildCommitBody resolves the draft's selected ids against the step's
   proposals; with those absent the candidate list is empty and every selected
   id is dropped on the way to the wire. So the guard is not cosmetic -- see
   LOADING, and the assertion below that says so directly.
   =========================================================================== */

describe('11. a generated step with no proposals', () => {
  const RELOADED = () =>
    serverDocument({
      revision: 3,
      steps: {
        landform: committedStep(1, featureCollection('zone-1')),
        water: { status: GENERATED, revision: 2 },
      },
    })

  /** A promise a test resolves when it wants the layers response delivered. */
  function gate() {
    let open = null
    const promise = new Promise((resolve) => {
      open = resolve
    })
    return { promise, open }
  }

  it('loads its proposals on a reload, and draws them', async () => {
    const calls = installFetch([
      route('GET', /^\/api\/sessions\/[^/]+$/, { body: RELOADED() }),
      route('GET', /\/steps\/water\/layers$/, { body: WATER_PAYLOAD }),
    ])

    const ui = await renderSurface()
    // A RELOAD, not a session created in this test: the store hydrates a
    // document that says `generated` and fetches no payload with it.
    await ui.run((a) => a.resume('sess-1'))

    expect(ui.cursor.cursorStepId).toBe('water')
    expect(pathsOf(calls, 'GET', /\/steps\/water\/layers$/)).toHaveLength(1)
    expect(ui.state.steps.water.proposals).toEqual(WATER_PAYLOAD)

    // THE TABS ARE THERE. Two survey areas, one tab each.
    expect(ui.find('tab-pond-1')).not.toBeNull()
    expect(ui.find('tab-pond-2')).not.toBeNull()

    // AND THE ZONES ARE ON THE MAP, one per editable layer, split by the
    // declared filter rather than by anything this test knows.
    expect(ui.pane('water--water-embankment').pane.querySelectorAll('path')).toHaveLength(1)
    expect(ui.pane('water--water-excavated').pane.querySelectorAll('path')).toHaveLength(1)

    // The commit is armed now, and says what it would carry.
    expect(ui.find('commit-water')).not.toBeNull()
    expect(ui.text('commit-water')).toContain('Commit water zones')

    await ui.unmount()
  })

  it('renders no armed commit until the proposals arrive', async () => {
    const held = gate()
    installFetch([
      route('GET', /^\/api\/sessions\/[^/]+$/, { body: RELOADED() }),
      route('GET', /\/steps\/water\/layers$/, { body: WATER_PAYLOAD, gate: held.promise }),
    ])

    const ui = await renderSurface()
    await ui.run((a) => a.resume('sess-1'))

    // IN FLIGHT. The document says `generated`; this client has nothing to
    // review.
    expect(ui.state.steps.water.proposals).toBeNull()
    expect(ui.find('step-water').dataset.stepState).toBe('loading')
    expect(ui.find('step-water').dataset.chromeState).toBe('loading')
    expect(ui.text('instruction-water')).toBe('Fetching what this step proposed…')
    // The banner is on screen and holds nothing, which is a state that has
    // said so rather than a banner that failed to render.
    expect(ui.find('actions-water').children).toHaveLength(0)

    // NO COMMIT BUTTON AT ALL -- not a disabled one, and above all not the
    // one that would have read "Commit no water zones".
    expect(ui.find('commit-water')).toBeNull()
    // And nothing else to press either: a generate here would race the fetch
    // for the same answer.
    expect(ui.find('generate-water')).toBeNull()
    // Nothing to review, and the strip says so by having nothing in it.
    expect(ui.find('tab-pond-1')).toBeNull()

    // THE COMMIT THAT WAS WITHHELD WOULD HAVE BEEN EMPTY, and this is the
    // reason rather than the symptom: with no proposals in the store there
    // are no candidates for the draft's selection to resolve against.
    expect(buildCommitBody(ui.state, 'water', WATER_STEP.proposalFeatures).features.features)
      .toHaveLength(0)

    // Let it land.
    await React.act(async () => {
      held.open()
      await held.promise
    })

    expect(ui.state.steps.water.proposals).toEqual(WATER_PAYLOAD)
    expect(ui.find('commit-water')).not.toBeNull()

    await ui.unmount()
  })

  it('does not re-fire a failing layers fetch', async () => {
    const calls = installFetch([
      route('GET', /^\/api\/sessions\/[^/]+$/, { body: RELOADED() }),
      route('GET', /\/steps\/water\/layers$/, { status: 500, body: { error: 'boom' } }),
    ])

    const ui = await renderSurface()
    await ui.run((a) => a.resume('sess-1'))

    const layerCalls = () => pathsOf(calls, 'GET', /\/steps\/water\/layers$/).length
    expect(layerCalls()).toBe(1)
    expect(ui.state.steps.water.proposals).toBeNull()

    // A FAILED FETCH LEAVES `proposals` NULL, which is the very state that
    // triggered it -- so the guard has to be an attempt key rather than a
    // read of the store. Drive a run of unrelated store writes past it and
    // count again: each one re-renders the hook and re-runs the effect.
    for (let i = 0; i < 5; i++) {
      await ui.run((a) => a.clearStepError('water'))
      await ui.run((_a, cursor) => cursor.focusFeature(`pond-${i}`))
      await ui.run((_a, cursor) => cursor.blurFeature())
    }
    expect(layerCalls()).toBe(1)

    // AND STILL NO ARMED COMMIT. A failure is not a licence to offer the
    // empty one: the user is no closer to knowing what they would be sending.
    expect(ui.find('commit-water')).toBeNull()

    await ui.unmount()
  })

  it('spends a fresh attempt when the cursor comes back to the step', async () => {
    const calls = installFetch([
      route('GET', /^\/api\/sessions\/[^/]+$/, { body: RELOADED() }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
      // First attempt fails; the second is the navigation's.
      route('GET', /\/steps\/water\/layers$/, [
        { status: 500, body: { error: 'boom' } },
        { body: WATER_PAYLOAD },
      ]),
    ])

    const ui = await renderSurface()
    await ui.run((a) => a.resume('sess-1'))
    expect(pathsOf(calls, 'GET', /\/steps\/water\/layers$/)).toHaveLength(1)
    expect(ui.state.steps.water.proposals).toBeNull()
    expect(ui.find('commit-water')).toBeNull()

    // MOVING THE CURSOR AWAY AND BACK IS THE RETRY, and it is a gesture a
    // user can actually make -- the chrome is keyed by the step, so coming
    // back remounts the machine and its attempt key with it.
    await ui.run((_a, cursor) => cursor.open('landform'))
    await ui.run((_a, cursor) => cursor.open('water'))

    expect(pathsOf(calls, 'GET', /\/steps\/water\/layers$/)).toHaveLength(2)
    expect(ui.state.steps.water.proposals).toEqual(WATER_PAYLOAD)
    expect(ui.find('tab-pond-1')).not.toBeNull()
    expect(ui.find('commit-water')).not.toBeNull()

    await ui.unmount()
  })
})

const BAND_RANK = Object.fromEntries(LAYER_BANDS.map((band, index) => [band, index]))
const byBand = (a, b) => BAND_RANK[a] - BAND_RANK[b]
