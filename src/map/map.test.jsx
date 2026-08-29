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
 *   8. SPIKE INTACT -- /api/production-zones end to end, with the wizard
 *      mounted, including the zone draw flow, against the real App.
 *
 * A REAL LEAFLET MAP, in jsdom. The panes, their z-indexes and their paths are
 * all in the document, so "the layers render in the declared z-order" and "a
 * committed layer takes a click" are facts this file reads off the DOM rather
 * than claims it makes about the code. Clicks are fired on the map the way
 * Leaflet delivers them, so the tools under test are the ones that ship.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import L from 'leaflet'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MapContainer, useMap } from 'react-leaflet'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  COMMITTED,
  NOT_STARTED,
  PROVENANCE_USER_ADDED,
  STEP_MODES,
  SessionProvider,
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
  definitionMap,
} from '../wizard/stepDefinitions'
import WizardShell from '../wizard/WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from '../wizard/WizardCursor.jsx'
import MapLayerStack from './MapLayerStack.jsx'
import StepTools, { TOOL_GESTURES } from './StepTools.jsx'
import { BAND_BASE_Z, composeLayerStack } from './layerStack.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** A module's code with its prose removed -- the wizard suite's helper. */
function codeOf(...parts) {
  return readFileSync(path.join(HERE, ...parts), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
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

/* ===========================================================================
   Harness
   =========================================================================== */

function installFetch(routes) {
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
    const { status = 200, body, blob } = responses[index]

    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      blob: async () => blob ?? new Blob(['%PDF-1.4']),
    }
  })

  return calls
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
      <SessionProvider autoResume={false}>
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

    // landform is committed, so the wizard's cursor has moved on to water --
    // which has no registry entry in this build. The stack still draws every
    // committed step's work, which is the band's whole reason for existing.
    expect(ui.cursor.cursorStepId).toBe('water')

    const composed = composeLayerStack({
      state: ui.state,
      definitions: definitionMap(STEP_DEFINITIONS),
      cursorStepId: ui.cursor.cursorStepId,
    })

    // The two committed rings/features, in band order and nothing else: the
    // cursor step declares no layers this build knows about.
    expect(composed.map((layer) => layer.band)).toEqual(['committed', 'committed'])
    expect(composed.map((layer) => layer.layerId)).toEqual([
      'boundary-committed',
      'landform-committed',
    ])

    // ...and it reached Leaflet as panes, in ascending z within the band.
    const panes = ui.panes()
    expect(panes.map((p) => p.key)).toEqual([
      'boundary--boundary-committed',
      'landform--landform-committed',
    ])
    expect(panes.map((p) => p.z)).toEqual([BAND_BASE_Z.committed, BAND_BASE_Z.committed + 1])
    expect(panes.every((p) => p.band === 'committed')).toBe(true)

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

    // ...including across the spike's door, which writes the same slot.
    await ui.run((_a, cursor) => cursor.arm('draw'))
    await ui.run((_a, cursor) => cursor.armLegacyGesture('zone-draw'))
    expect(ui.armedTools()).toEqual([])
    expect(ui.cursor.armed).toBeNull()
    expect(ui.cursor.legacyGesture).toBe('zone-draw')

    await ui.run((_a, cursor) => cursor.arm('select'))
    expect(ui.cursor.legacyGesture).toBeNull()
    expect(ui.armedTools()).toEqual(['select'])

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
    expect(ui.text('boundary-ring-count')).toBe('No points placed yet.')

    // ARM THROUGH THE PANEL, the way a user does.
    await ui.click('boundary-draw')
    expect(ui.armedTools()).toEqual(['draw'])

    // FOUR CLICKS ON THE MAP. DrawTool is mounted by the stack, wired to the
    // boundary step's declared draft input -- there is no App state in this
    // path at all.
    for (const [lat, lng] of RING) await ui.clickMap([lat, lng])

    const ring = selectDraft(ui.state, BOUNDARY_STEP_ID).inputs[BOUNDARY_RING_INPUT]
    expect(ring).toEqual(RING)
    expect(ui.find('boundary-ring-count').textContent).toContain('4 points')

    // Clicking the first vertex closes the ring, which disarms -- the gesture
    // ending IS the slot emptying.
    await ui.clickMap(RING[0])
    expect(ui.cursor.armed).toBeNull()
    expect(selectDraft(ui.state, BOUNDARY_STEP_ID).inputs[BOUNDARY_RING_INPUT]).toEqual(RING)

    // COMMIT. One POST /api/sessions, carrying the ring the map wrote.
    await ui.click(`commit-${BOUNDARY_STEP_ID}`)
    expect(calls.filter((c) => c.path === '/api/sessions')).toHaveLength(1)
    expect(calls[0].body.boundary).toEqual(BOUNDARY_GEOJSON)
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
   6. A COMMITTED LAYER OFFERS NAVIGATION, NOT AN EDIT MODE
   =========================================================================== */

describe('6. the committed band', () => {
  it('navigates to the owning step on a click, and arms nothing', async () => {
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
    expect(ui.cursor.cursorStepId).toBe('water')

    const pane = ui.panes().find((p) => p.key === 'landform--landform-committed')
    const path = pane.pane.querySelector('path')
    // Committed geometry takes a click -- that is what makes it navigable.
    expect(path.classList.contains('leaflet-interactive')).toBe(true)

    await ui.clickPath(path)

    // THE CURSOR MOVED, AND NOTHING WAS ARMED. The panel is now landform's,
    // with the Edit affordance its own definition declares; the map did not
    // hand the user a tool they did not ask for.
    expect(ui.cursor.cursorStepId).toBe('landform')
    expect(ui.cursor.armed).toBeNull()
    expect(ui.armedTools()).toEqual([])
    expect(ui.find('edit-landform')).not.toBeNull()

    // And no draft was created by looking at it.
    expect(ui.state.drafts.landform).toBeUndefined()

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

    // UNARMED, the shape is on the map and takes no clicks -- otherwise it
    // would swallow the vertex an armed draw tool was placing on top of it.
    const drawnPane = () => ui.pane('landform--landform-drawn').pane
    expect(drawnPane().querySelectorAll('path').length).toBeGreaterThan(0)
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
   8. THE SPIKE, INTACT, WITH THE WIZARD MOUNTED
   =========================================================================== */

describe('8. the production-zone spike', () => {
  it('runs end to end with the wizard mounted, including the zone draw flow', async () => {
    const ZONE_PAYLOAD = {
      ...LAYERS_PAYLOAD,
      zones: [{ id: 1, feature_id: 'zone-1', area_acres: 2.1, scores: {} }],
      summary: { total_acres: 13.2, eligible_acres: 6.0 },
      scales: {},
    }

    const calls = installFetch([
      route('POST', /^\/api\/production-zones$/, { body: ZONE_PAYLOAD }),
      route('POST', /^\/api\/generate-report-pdf$/, { body: {} }),
    ])

    // jsdom has neither; the spike's download path uses both.
    URL.createObjectURL = vi.fn(() => 'blob:pdf')
    URL.revokeObjectURL = vi.fn()

    const App = (await import('../App.jsx')).default
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await React.act(async () => root.render(<App />))

    const button = (label) =>
      [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label)
    const press = async (label) => {
      const target = button(label)
      if (!target) throw new Error(`no button "${label}"`)
      await React.act(async () => target.click())
    }

    // THE WIZARD IS MOUNTED. The spike runs with it on screen, not instead
    // of it -- which is what test 11 of the wizard suite asserts from the
    // source side and this asserts from the running page.
    expect(container.querySelector('[data-testid="wizard"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="step-boundary"]')).not.toBeNull()

    // DRAW THE BOUNDARY through the spike's own button, which arms the same
    // slot the wizard's panel does.
    await press('Start Drawing Boundary')
    const map = containerMap(container)

    // ZOOM IN FIRST, which is what AddressSearch does for a real user. The
    // app opens on the whole continental US at zoom 4, where this parcel is
    // half a pixel wide and every vertex lands inside DrawTool's 15 px hit
    // radius -- so the second click would read as "you clicked the first
    // vertex" and be swallowed. The gesture is pixel-based on purpose (see
    // vertexAtPixel); this is the test standing where the user stands.
    await React.act(async () => map.setView([40.715, -74.0], 14))
    for (const [lat, lng] of RING) {
      await React.act(async () => map.fire('click', { latlng: L.latLng(lat, lng) }))
    }
    await press('Finish Boundary')
    expect(container.textContent).toContain('Boundary set')

    // THE SPIKE'S OWN ENDPOINT, unchanged.
    await press('Generate Production Zones')
    expect(calls.filter((c) => c.path === '/api/production-zones')).toHaveLength(1)
    expect(calls[0].body.boundary).toEqual([
      [-74.02, 40.7],
      [-73.98, 40.7],
      [-73.98, 40.73],
      [-74.02, 40.73],
    ])
    expect(container.textContent).toContain('Draw a Zone')

    // THE ZONE DRAW FLOW. Three vertices and a close, through ZoneDrawTool,
    // with the wizard's boundary step sitting right there in the column.
    await press('Draw a Zone')
    const zoneRing = [
      [40.71, -74.01],
      [40.71, -73.99],
      [40.72, -73.99],
    ]
    for (const [lat, lng] of zoneRing) {
      await React.act(async () => map.fire('click', { latlng: L.latLng(lat, lng) }))
    }
    await React.act(async () => map.fire('click', { latlng: L.latLng(...zoneRing[0]) }))
    expect(container.textContent).toMatch(/zone 1 you drew/i)

    // AND THROUGH TO THE PDF. Access point, then the report.
    await press('Back')
    await press('Select Access Point')
    await React.act(async () => map.fire('click', { latlng: L.latLng(40.7, -74.0) }))
    await press('Confirm Access Point')
    await press('Generate Scale of Permanence Report')

    expect(calls.filter((c) => c.path === '/api/generate-report-pdf')).toHaveLength(1)
    expect(container.textContent).toContain('scale_of_permanence_report.pdf')

    await React.act(async () => root.unmount())
    container.remove()
  })

  it('keeps the spike’s zones after the boundary is committed through the wizard', async () => {
    // THE TWO PATHS CROSSING, which is the case the ring-identity bug above
    // actually broke: commit the boundary in the WIZARD, then run the SPIKE's
    // zone generate against the ring the document now owns. If the ring
    // arrived with a new identity per render, the stale-result effect would
    // drop the payload as fast as it landed.
    const ZONE_PAYLOAD = {
      ...LAYERS_PAYLOAD,
      zones: [{ id: 1, feature_id: 'zone-1', area_acres: 2.1, scores: {} }],
      summary: { total_acres: 13.2, eligible_acres: 6.0 },
      scales: {},
    }
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('POST', /^\/api\/production-zones$/, { body: ZONE_PAYLOAD }),
      route('GET', /\/steps\/landform\/layers$/, { body: LAYERS_PAYLOAD }),
    ])

    const App = (await import('../App.jsx')).default
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await React.act(async () => root.render(<App />))

    const press = async (label) => {
      const target = [...container.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === label
      )
      if (!target) throw new Error(`no button "${label}"`)
      await React.act(async () => target.click())
    }
    const byTestId = (id) => container.querySelector(`[data-testid="${id}"]`)

    const map = containerMap(container)
    await React.act(async () => map.setView([40.715, -74.0], 14))

    // Draw through the WIZARD's own affordance this time, then commit it.
    await React.act(async () => byTestId('boundary-draw').click())
    for (const [lat, lng] of RING) {
      await React.act(async () => map.fire('click', { latlng: L.latLng(lat, lng) }))
    }
    await React.act(async () => byTestId(`commit-${BOUNDARY_STEP_ID}`).click())
    // Committed, and collapsed to the note its definition declares -- the
    // boundary is the one step with no reopen.
    expect(byTestId(`step-${BOUNDARY_STEP_ID}`).dataset.stepState).toBe('committed')
    expect(byTestId(`no-reopen-${BOUNDARY_STEP_ID}`)).not.toBeNull()

    // Now the spike, over a ring it no longer owns.
    await press('Generate Production Zones')
    expect(container.textContent).toContain('Draw a Zone')

    // Several more renders, with no further ring change: the payload stays.
    await React.act(async () => map.setView([40.716, -74.0], 14))
    await React.act(async () => {})
    expect(container.textContent).toContain('Draw a Zone')

    await React.act(async () => root.unmount())
    container.remove()
  })

  it('does not loop clearing its own results once the boundary is committed', async () => {
    // A REGRESSION THIS BRANCH INTRODUCED AND THEN CLOSED. The ring read out
    // of the document is rebuilt on every call -- [lng, lat] on the wire,
    // [lat, lng] here -- so an identity comparison against it answers "changed"
    // every render. The spike drops a stale zone payload when the ring moves;
    // with a committed boundary that would have fired forever.
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

    // The three are DERIVED from one register, and the register is one slot.
    expect(app).toContain("const isDrawingZone = legacyGesture === 'zone-draw'")
    expect(app).toContain("const isSelectingAccessPoint = legacyGesture === 'access-point'")

    const cursorCode = codeOf('..', 'wizard', 'WizardCursor.jsx')
    // ONE useState for the arming, holding ONE {stepId, tool}. Two slots would
    // be the invariant back, so the count is the assertion.
    expect(cursorCode.match(/useState\(NOTHING_ARMED\)/g)).toHaveLength(1)
    expect(cursorCode).not.toMatch(/setArmed\w*\(\s*\[/)

    // The ring survives in exactly one place: no `points` useState remains.
    expect(app).not.toMatch(/const \[points, setPoints\]/)
    expect(app).toContain('selectBoundaryRing(state, BOUNDARY_STEP_ID, BOUNDARY_RING_INPUT)')
  })
})

const BAND_RANK = Object.fromEntries(LAYER_BANDS.map((band, index) => [band, index]))
const byBand = (a, b) => BAND_RANK[a] - BAND_RANK[b]
