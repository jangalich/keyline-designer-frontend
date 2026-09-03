/**
 * interaction.test.jsx
 *
 * WHAT THE CHROME DOES WHEN IT IS USED. F5 built the five regions and F6's
 * first half dressed them; this is the half where they answer a click.
 *
 * Three of the twelve carry the weight:
 *
 *   1.  SELECTION SYNC BOTH DIRECTIONS, asserted on the map's own DOM and on
 *       the strip's, because "the tab and the shape are one state" is a claim
 *       about two renderers agreeing rather than about one variable.
 *   6.  EYE-OFF LEAVES THE FEATURE OUT OF THE COMMIT BODY -- asserted on the
 *       request that goes over the wire, not on a class name.
 *   7.  THE DECLINED TREATMENT IS GONE AS CONSTANTS, not merely unused: a
 *       dead constant is a treatment waiting to be switched back on.
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
  GENERATED,
  NOT_STARTED,
  SessionProvider,
  selectDraft,
  useSession,
} from '../session/SessionStore'
import {
  LANDFORM_STEP,
  STEP_DEFINITIONS,
  registryProposalFeatures,
} from './stepDefinitions'
import { resetStepCatalog } from './stepCatalog.jsx'
import WizardShell, { UNDO_WINDOW_MS } from './WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './WizardCursor.jsx'
import MapLayerStack from '../map/MapLayerStack.jsx'
import { DrawingProgressProvider } from '../map/DrawingProgress.jsx'
import { cautionMarkersFor } from '../map/CautionMarkers.jsx'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(HERE, '..')

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

/* ---------------------------------------------------------------------------
   Fixtures. Real coordinates, because the gestures under test are pixel-based.
   --------------------------------------------------------------------------- */

const RING = [
  [40.71, -74.02],
  [40.71, -73.98],
  [40.73, -73.98],
  [40.73, -74.02],
]

const box = (west, south, east, north) => ({
  type: 'Polygon',
  coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
})

/** Two well-separated zones inside the ring, so a click can only hit one. */
const ZONE_GEOMETRY = {
  'zone-1': box(-74.015, 40.712, -74.008, 40.718),
  'zone-2': box(-73.992, 40.722, -73.985, 40.728),
}

function serverDocument({ steps = {}, revision = 0 } = {}) {
  const entries = {}
  for (const stepId of [...STEP_ORDER].sort()) entries[stepId] = steps[stepId] ?? { status: NOT_STARTED }
  return {
    schema_version: 1,
    session_id: 'sess-1',
    document_revision: revision,
    created_at: '2026-01-01T00:00:00+00:00',
    updated_at: '2026-01-01T00:00:00+00:00',
    boundary: RING.map(([lat, lng]) => [lng, lat]),
    step_order: [...STEP_ORDER],
    steps: entries,
  }
}

const PAYLOAD = {
  eligible_union: null,
  exclusion_layers: [
    { type: 'hydric', label: 'wet (hydric) soil', data_available: true, geometry_wgs84: null },
  ],
  suggested_zones: {
    type: 'FeatureCollection',
    features: Object.entries(ZONE_GEOMETRY).map(([id, geometry]) => ({
      type: 'Feature',
      id,
      properties: {},
      geometry,
    })),
  },
  zones: [
    { id: 0, feature_id: 'zone-1', rank: 1, area_acres: 2.5, score: 81, slope_min_pct: 2.4, slope_max_pct: 8.1, aspect_available: true, dominant_aspect: 'south' },
    { id: 1, feature_id: 'zone-2', rank: 2, area_acres: 1.2, score: 64, slope_min_pct: 3, slope_max_pct: 11, aspect_available: false, dominant_aspect: null },
  ],
  scales: {
    bands: { poor: [0, 40], fair: [40, 60], good: [60, 80], excellent: [80, 100] },
    band_bounds: 'lower_inclusive_upper_exclusive_last_band_inclusive',
  },
  summary: { total_acres: 100, eligible_acres: 50 },
}

/** A drawn zone as LANDFORM_SHAPE.close() builds one, with cautions on it. */
function drawnZone(id = 'drawn-1') {
  return {
    type: 'Feature',
    id,
    geometry: { type: 'MultiPolygon', coordinates: [box(-74.005, 40.72, -73.998, 40.726).coordinates] },
    properties: {
      layer: 'production_area_candidate',
      label: 'Drawn zone',
      confidence: 'low',
      confidence_notes: 'Drawn by hand on the map; no survey backs it.',
      acres: 3.4,
      cautions: [
        { type: 'hydric', label: 'wet (hydric) soil', acres: 0.09, at: [40.723, -74.001] },
      ],
    },
  }
}

/* ---------------------------------------------------------------------------
   Harness -- the shell over a real Leaflet map, which is what selection sync
   needs: half of it is a click on an SVG path.
   --------------------------------------------------------------------------- */

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
  globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
    const method = init.method ?? 'GET'
    const url = new URL(rawUrl)
    calls.push({ method, path: url.pathname, body: init.body ? JSON.parse(init.body) : null })
    const route = routes.find((r) => r.method === method && r.pattern.test(url.pathname))
    if (!route) throw new Error(`no route for ${method} ${url.pathname}`)
    return { ok: true, status: route.status ?? 200, json: async () => route.body }
  })
  return calls
}

async function renderSurface() {
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
        <WizardCursorProvider definitions={STEP_DEFINITIONS}>
          <DrawingProgressProvider>
            <Probe />
            <MapContainer center={[40.72, -74.0]} zoom={14} style={{ height: 600, width: 600 }}>
              <MapProbe />
              <MapLayerStack />
            </MapContainer>
            <WizardShell />
          </DrawingProgressProvider>
        </WizardCursorProvider>
      </SessionProvider>
    )
  })

  return {
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
    find: (id) => container.querySelector(`[data-testid="${id}"]`),
    text: (id) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? null,
    /** The <path> Leaflet drew for one feature, in whichever pane owns it. */
    pathFor(featureId) {
      for (const path_ of container.querySelectorAll('.leaflet-pane path')) {
        if (path_.__featureId === featureId) return path_
      }
      return null
    },
    async click(id) {
      const el = container.querySelector(`[data-testid="${id}"]`)
      if (!el) throw new Error(`no element with data-testid="${id}"`)
      await React.act(async () => el.click())
    },
    /** A click on the map surface itself, which is what clears the focus. */
    async clickMap([lat, lng]) {
      await React.act(async () => map.fire('click', { latlng: L.latLng(lat, lng) }))
    },
    async run(fn) {
      let out
      await React.act(async () => {
        out = await fn(session.actions, cursor)
      })
      return out
    },
    async unmount() {
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
}

/**
 * Click the Leaflet layer a feature was rendered into.
 *
 * BY THE LAYER, NOT BY A PIXEL. jsdom lays nothing out, so a synthetic click at
 * a screen position hits nothing; firing on the layer Leaflet built for the
 * feature is the same event its own handler receives, with the propagation
 * behaviour that matters here intact.
 */
async function clickFeature(ui, featureId) {
  const target = layerFor(ui, featureId)
  if (!target) throw new Error(`no map layer for feature ${featureId}`)
  await React.act(async () => {
    target.fire('click', { latlng: L.latLng(40.72, -74.0), originalEvent: new MouseEvent('click') }, true)
  })
}

/** Every Leaflet layer on the map, flattened, indexed by the feature it drew. */
function layerFor(ui, featureId) {
  let found = null
  ui.map.eachLayer((layer) => {
    if (found) return
    if (layer.feature?.id === featureId) found = layer
    else if (layer.eachLayer) {
      layer.eachLayer((child) => {
        if (!found && child.feature?.id === featureId) found = child
      })
    }
  })
  return found
}

/** Boundary committed, landform generated and seeded. */
async function throughGenerate(ui) {
  await ui.run((a) => a.startSession(RING))
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
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const GENERATED_DOC = () => serverDocument({ steps: { landform: { status: GENERATED } } })

const COMMITTED_DOC = () =>
  serverDocument({
    revision: 2,
    steps: {
      landform: {
        status: COMMITTED,
        revision: 1,
        features: { type: 'FeatureCollection', features: [] },
        provenance: {},
      },
    },
  })

function standardRoutes() {
  return [
    { method: 'POST', pattern: /^\/api\/sessions$/, status: 201, body: serverDocument() },
    { method: 'GET', pattern: /\/steps\/landform\/layers$/, body: PAYLOAD },
    { method: 'POST', pattern: /\/steps\/landform\/commit$/, body: COMMITTED_DOC() },
  ]
}

/* ===========================================================================
   1. SELECTION SYNC
   =========================================================================== */

describe('1. selection sync', () => {
  it('links the map feature, its tab and the detail panel, both directions', async () => {
    installFetch(standardRoutes())
    const ui = await renderSurface()
    await throughGenerate(ui)

    // NOTHING SELECTED TO BEGIN WITH.
    expect(ui.cursor.focusedFeatureId).toBeNull()
    expect(ui.find('detail-landform')).toBeNull()
    expect(ui.find('tab-zone-1').dataset.focused).toBe('false')

    // MAP -> TAB. A click on the shape activates its tab and opens the panel.
    await clickFeature(ui, 'zone-1')
    expect(ui.cursor.focusedFeatureId).toBe('zone-1')
    expect(ui.find('tab-zone-1').dataset.focused).toBe('true')
    expect(ui.find('detail-landform')).not.toBeNull()
    expect(ui.text('detail-name-landform')).toBe('Zone 1')

    // TAB -> MAP. A click on another tab moves the focus, and the shape is
    // marked -- the SAME state, read by two renderers.
    await ui.click('tab-focus-zone-2')
    expect(ui.cursor.focusedFeatureId).toBe('zone-2')
    expect(ui.find('tab-zone-1').dataset.focused).toBe('false')
    expect(ui.find('tab-zone-2').dataset.focused).toBe('true')
    expect(ui.text('detail-name-landform')).toBe('Zone 2')

    // ONE AT A TIME. The slot holds one value, so selecting another replaces
    // it rather than adding to it.
    expect(
      [...ui.container.querySelectorAll('[data-focused="true"]')].map((el) => el.dataset.tabId)
    ).toEqual(['zone-2'])

    // A CLICK ON BARE MAP DESELECTS and closes the panel.
    await ui.clickMap([40.729, -74.019])
    expect(ui.cursor.focusedFeatureId).toBeNull()
    expect(ui.find('detail-landform')).toBeNull()
    expect(ui.find('tab-zone-2').dataset.focused).toBe('false')

    await ui.unmount()
  })

  it('marks the focused shape on the map, and only that one', async () => {
    installFetch(standardRoutes())
    const ui = await renderSurface()
    await throughGenerate(ui)

    await ui.click('tab-focus-zone-1')
    const focused = () =>
      [...ui.container.querySelectorAll('.leaflet-pane path.zone--focused')].length
    expect(focused()).toBe(1)

    await ui.click('tab-focus-zone-2')
    expect(focused()).toBe(1)

    await ui.clickMap([40.729, -74.019])
    expect(focused()).toBe(0)

    await ui.unmount()
  })

  it('drops the focus when the wizard moves on', async () => {
    // A focus is scoped to the step whose feature it names -- a bare id
    // carried into another step would point the panel at something that step
    // has never heard of.
    installFetch(standardRoutes())
    const ui = await renderSurface()
    await throughGenerate(ui)

    await ui.click('tab-focus-zone-1')
    expect(ui.cursor.focusedFeatureId).toBe('zone-1')

    await ui.click('commit-landform')
    expect(ui.cursor.cursorStepId).toBe('water')
    expect(ui.cursor.focusedFeatureId).toBeNull()

    await ui.unmount()
  })
})

/* ===========================================================================
   2. THE DETAIL PANEL IS ABSENT UNTIL THERE IS SOMETHING TO SAY
   =========================================================================== */

describe('2. the detail panel', () => {
  it('is not in the DOM at all when nothing is selected', async () => {
    installFetch(standardRoutes())
    const ui = await renderSurface()
    await throughGenerate(ui)

    // NOT HIDDEN, NOT COLLAPSED, NOT THERE. An empty container in the top
    // right of a map reads as a search field: it takes ground, invites a
    // click, and answers with nothing.
    expect(ui.find('detail-landform')).toBeNull()
    expect(ui.container.querySelector('.chrome-detail')).toBeNull()
    // ...and there is no toggle left over from the container F5 shipped.
    expect(ui.find('detail-toggle-landform')).toBeNull()

    await ui.click('tab-focus-zone-1')
    expect(ui.container.querySelector('.chrome-detail')).not.toBeNull()

    await ui.clickMap([40.729, -74.019])
    expect(ui.container.querySelector('.chrome-detail')).toBeNull()

    await ui.unmount()
  })

  it('shows the fields the tab had no room for', async () => {
    installFetch(standardRoutes())
    const ui = await renderSurface()
    await throughGenerate(ui)
    await ui.click('tab-focus-zone-1')

    const value = (label) => ui.text(`detail-value-${label}`)
    // The tab carries acres and score -- what you compare zones BY. These are
    // what you read once you have picked one out, and they are the columns the
    // deleted panel column's zone list carried.
    expect(value('slope %')).toBe('2.4–8.1')
    expect(value('aspect')).toBe('south-facing')
    expect(value('band')).toBe('excellent')

    // THE BAND COMES OFF THE PAYLOAD'S OWN `scales`. 81 is in [80, 100], and
    // no threshold is written down on this side to go stale.
    await ui.click('tab-focus-zone-2')
    expect(value('band')).toBe('good')
    // aspect_available false: the ground is too flat for a downhill direction,
    // so the pipeline's figure is a default rather than a measurement and
    // nothing is printed.
    expect(value('aspect')).toBe('—')

    await ui.unmount()
  })

  it('shows the selected zone’s cautions, with the layer’s own label verbatim', async () => {
    installFetch(standardRoutes())
    const ui = await renderSurface()
    await throughGenerate(ui)
    await ui.run((a) => a.addDrawnFeature('landform', drawnZone()))

    await ui.click('tab-focus-drawn-1')
    const caution = ui.find('caution-hydric')
    expect(caution).not.toBeNull()
    // ACREAGE, THEN THE LABEL VERBATIM. The label is the exclusion layer's own
    // words off the payload; the branching is on the stable `type`. Rewriting
    // it here would put this app's vocabulary in front of the backend's.
    expect(caution.textContent).toBe('0.1acres — wet (hydric) soil')
    expect(caution.querySelector('.measure').textContent).toBe('0.1')

    // A suggestion crosses nothing -- it is a strict subset of ground that
    // already cleared every gate -- so it has no caution list at all.
    await ui.click('tab-focus-zone-1')
    expect(ui.find('detail-cautions-landform')).toBeNull()

    await ui.unmount()
  })
})

/* ===========================================================================
   3-4. LIVE CAUTIONS DURING A DRAW
   =========================================================================== */

describe('3. a gesture in flight', () => {
  it('shows the in-progress shape’s cautions, recomputed per vertex', async () => {
    installFetch(standardRoutes())
    const ui = await renderSurface()
    await throughGenerate(ui)

    // Focused on something else first: the gesture has to WIN, because a ring
    // going down is the most current thing on screen.
    await ui.click('tab-focus-zone-1')
    expect(ui.text('detail-name-landform')).toBe('Zone 1')

    await ui.run((_a, cursor) => cursor.arm('draw'))
    const drawing = ui.container.querySelector('.leaflet-container')
    expect(drawing).not.toBeNull()

    // Place corners one at a time. The panel counts them as they land.
    const corners = [
      [40.716, -74.006],
      [40.716, -73.996],
      [40.726, -73.996],
    ]
    for (const [index, corner] of corners.entries()) {
      await ui.clickMap(corner)
      expect(ui.text('detail-name-landform')).toBe('Drawing a zone')
      expect(ui.find('detail-vertices-landform').querySelector('.measure').textContent).toBe(
        String(index + 1)
      )
    }

    // Under three there is no shape to clip, so the panel says how many more.
    await ui.unmount()
  })

  it('says how many points are still needed, which the panel column used to', async () => {
    installFetch(standardRoutes())
    const ui = await renderSurface()
    await throughGenerate(ui)
    await ui.run((_a, cursor) => cursor.arm('draw'))
    await ui.clickMap([40.716, -74.006])

    expect(ui.text('detail-vertices-landform')).toContain('3 close the shape')

    await ui.unmount()
  })
})

/* ===========================================================================
   5. CAUTION MARKERS, SCOPED
   =========================================================================== */

describe('4. caution markers', () => {
  it('renders them for the selected feature only', async () => {
    // TWO DRAWN ZONES, both crossing something. Every marker at once turns the
    // map into a field of exclamation marks with no way to tell which shape
    // any of them belongs to -- worse than none, because a marker that could
    // be about anything is read as being about nothing.
    const layers = [
      {
        source: 'draft',
        features: [
          { id: 'a', properties: { cautions: [{ type: 'hydric', acres: 0.2, at: [40.72, -74.0] }] } },
          { id: 'b', properties: { cautions: [{ type: 'slope', acres: 0.3, at: [40.73, -74.01] }] } },
        ],
      },
    ]

    expect(cautionMarkersFor(layers, [], null).map((m) => m.key)).toEqual(['a-hydric', 'b-slope'])
    expect(cautionMarkersFor(layers, [], 'a').map((m) => m.key)).toEqual(['a-hydric'])
    expect(cautionMarkersFor(layers, [], 'b').map((m) => m.key)).toEqual(['b-slope'])

    // THE IN-FLIGHT GESTURE'S MARKERS ARE NEVER SCOPED AWAY. They belong to a
    // shape that has no id yet and is the thing being drawn.
    const live = [{ type: 'roads', acres: 0.4, at: [40.71, -73.99] }]
    expect(cautionMarkersFor(layers, live, 'a').map((m) => m.key)).toEqual([
      'a-hydric',
      'live-roads',
    ])
  })

  it('keeps a marker at the intersection it describes, not at a centroid', () => {
    // Position is the whole signal: a twelve-acre zone with a sliver of wet
    // ground along one edge should point at the edge. cautionsFor() computes
    // `at` per crossing and this renderer passes it through untouched.
    const at = [40.7231, -74.0017]
    const markers = cautionMarkersFor(
      [{ source: 'draft', features: [{ id: 'a', properties: { cautions: [{ type: 'hydric', acres: 0.2, at }] } }] }],
      [],
      'a'
    )
    expect(markers[0].at).toBe(at)

    // A caution with nowhere to point is not drawn.
    expect(
      cautionMarkersFor(
        [{ source: 'draft', features: [{ id: 'a', properties: { cautions: [{ type: 'hydric', acres: 0.2 }] } }] }],
        [],
        'a'
      )
    ).toEqual([])
  })
})

/* ===========================================================================
   6. THE EYE
   =========================================================================== */

describe('5. the eye', () => {
  it('takes a feature off the map AND out of the commit body, and puts it back', async () => {
    const calls = installFetch(standardRoutes())
    const ui = await renderSurface()
    await throughGenerate(ui)

    const onMap = (id) => ui.pathFor(id) != null || layerFor(ui, id) != null

    // EYE-ON is where a fresh payload starts: the payload IS the
    // recommendation, so everything is in.
    expect(ui.find('tab-zone-2').dataset.eye).toBe('on')
    expect(onMap('zone-2')).toBe(true)

    // EYE-OFF hides it from the map ENTIRELY -- not a quieter treatment, not
    // drawn at all -- and the tab stays, which is what carries the "still
    // available" signal the map used to carry.
    await ui.click('tab-eye-zone-2')
    expect(ui.find('tab-zone-2').dataset.eye).toBe('off')
    expect(ui.find('tab-zone-2')).not.toBeNull()
    expect(onMap('zone-2')).toBe(false)
    expect(onMap('zone-1')).toBe(true)

    // AND OUT OF THE COMMIT BODY. Asserted on the request, not on a class.
    await ui.click('commit-landform')
    const commit = calls.find((c) => /\/steps\/landform\/commit$/.test(c.path))
    expect(commit.body.features.features.map((f) => f.id)).toEqual(['zone-1'])

    await ui.unmount()
  })

  it('works the same on a drawn zone, which used to commit by existing', async () => {
    const calls = installFetch(standardRoutes())
    const ui = await renderSurface()
    await throughGenerate(ui)
    await ui.run((a) => a.addDrawnFeature('landform', drawnZone()))

    // A drawn zone is in the commit the moment it exists: someone who has just
    // drawn a shape has said they want it, and the eye is there to take it
    // back out rather than to be found and switched on.
    expect(ui.find('tab-drawn-1').dataset.eye).toBe('on')

    await ui.click('tab-eye-drawn-1')
    expect(ui.find('tab-drawn-1').dataset.eye).toBe('off')
    expect(selectDraft(ui.state, 'landform').drawnFeatures.map((f) => f.id)).toEqual(['drawn-1'])

    await ui.click('commit-landform')
    const commit = calls.find((c) => /\/steps\/landform\/commit$/.test(c.path))
    expect(commit.body.features.features.map((f) => f.id)).toEqual(['zone-1', 'zone-2'])
    // THE SHAPE SURVIVES. Eye-off is not a delete: the tab stays and the draft
    // still holds the feature, so it can be put back.
    expect(commit.body.provenance['drawn-1']).toBeUndefined()

    await ui.unmount()
  })
})

/* ===========================================================================
   7. THE DECLINED TREATMENT IS RETIRED
   =========================================================================== */

describe('6. the dotted declined treatment', () => {
  it('is gone as constants and as a rule, not merely unused', () => {
    // A DEAD CONSTANT IS A TREATMENT WAITING TO BE SWITCHED BACK ON. The
    // reasoning it was written under -- a declined suggestion marks absence,
    // and absence needs its own vocabulary -- was right while the map was the
    // only place a suggestion appeared. The tab strip carries that signal now.
    const layers = readFileSync(path.join(SRC, 'map', 'layers.jsx'), 'utf8')
    for (const gone of ['DESELECTED_DASH', 'DESELECTED_STROKE_OPACITY', 'dashArray']) {
      expect(layers).not.toContain(gone)
    }

    const css = readFileSync(path.join(SRC, 'App.css'), 'utf8')
    expect(css).not.toContain('zone--deselected')

    // Nothing anywhere renders the class either.
    for (const file of sourceFiles(SRC)) {
      if (file.endsWith('interaction.test.jsx')) continue
      expect(readFileSync(file, 'utf8')).not.toContain('zone--deselected')
    }
  })

  it('leaves the treatments that were never in question', async () => {
    // The visual language this branch must not touch: the hatch, the casing,
    // the eligible highlight and the off-parcel scrim.
    //
    // THE HATCH MOVED HOUSE AND THIS ASSERTION MOVED WITH IT. It used to read
    // `css.toContain('url(#production-hatch)')`, because one blanket rule in
    // App.css pointed every proposal polygon at the hatch. That rule was what
    // made a second step inherit production's mark, so the fill is a
    // pathOption now and the pattern id is built from the layer's declared
    // treatment. The hatch is still exactly the hatch -- same spacing, same
    // weight, same token -- and it is still asserted, where it lives.
    const patterns = readFileSync(path.join(SRC, 'ProductionHatchPattern.jsx'), 'utf8')
    expect(patterns).toContain("treatment: 'production'")
    expect(patterns).toContain("kind: 'hatch'")
    expect(patterns).toContain("token: '--oxide'")
    const layers = readFileSync(path.join(SRC, 'map', 'layers.jsx'), 'utf8')
    // THE FILL RESOLVES THROUGH ONE TABLE, whichever kind of mark it is --
    // this used to name patternIdFor directly, back when every treatment was a
    // pattern and the fill was always a paint-server reference. Water is a
    // tint now and its fill is a colour, so both kinds go through zoneMark()
    // and the pattern id is built where the table is.
    expect(layers).toContain('zoneMark')

    const css = readFileSync(path.join(SRC, 'App.css'), 'utf8')
    expect(css).toContain('.stack-layer--kind-highlight')
    expect(layers).toContain('DRAWN_CASING_WEIGHT')
    expect(layers).toContain('ScrimLayer')
  })
})

/* ===========================================================================
   8-9. THE ×
   =========================================================================== */

describe('7. the × on a drawn tab', () => {
  it('appears on drawn tabs only, never on a suggestion', async () => {
    installFetch(standardRoutes())
    const ui = await renderSurface()
    await throughGenerate(ui)
    await ui.run((a) => a.addDrawnFeature('landform', drawnZone()))

    // THE ASYMMETRY IS HONEST AND MEANT TO BE VISIBLE. A suggestion cannot be
    // destroyed -- the server will regenerate it on the next generate -- so
    // its only removal is the eye. A drawn zone is the user's, and is the one
    // thing in this app they can destroy.
    expect(ui.find('tab-remove-drawn-1')).not.toBeNull()
    expect(ui.find('tab-remove-zone-1')).toBeNull()
    expect(ui.find('tab-remove-zone-2')).toBeNull()

    // Both kinds still carry an eye.
    expect(ui.find('tab-eye-drawn-1')).not.toBeNull()
    expect(ui.find('tab-eye-zone-1')).not.toBeNull()

    await ui.unmount()
  })

  it('deletes at once, with no dialogue, and the undo restores the geometry', async () => {
    installFetch(standardRoutes())
    const ui = await renderSurface()
    await throughGenerate(ui)
    const zone = drawnZone()
    await ui.run((a) => a.addDrawnFeature('landform', zone))
    await ui.click('tab-focus-drawn-1')

    // NO CONFIRMATION. A modal is heavy for a small object and trains people
    // to click through the one that will matter.
    await ui.click('tab-remove-drawn-1')
    expect(ui.container.querySelector('[role="dialog"]')).toBeNull()
    expect(selectDraft(ui.state, 'landform').drawnFeatures).toEqual([])
    expect(ui.find('tab-drawn-1')).toBeNull()
    // The focus went with the shape: a panel describing something that no
    // longer exists is worse than none.
    expect(ui.cursor.focusedFeatureId).toBeNull()
    expect(ui.find('detail-landform')).toBeNull()

    // THE WAY BACK IS IN THE INSTRUCTION BAR.
    expect(ui.text('undo-landform')).toContain('Zone deleted.')
    await ui.click('undo-action-landform')

    // RESTORED WHOLE. The Feature itself was held, so its ring, its acreage
    // and its cautions come back as they were -- nothing is recomputed.
    const [back] = selectDraft(ui.state, 'landform').drawnFeatures
    expect(back).toEqual(zone)
    expect(back.geometry).toEqual(zone.geometry)
    expect(back.properties.cautions).toEqual(zone.properties.cautions)
    expect(ui.find('tab-drawn-1')).not.toBeNull()
    expect(ui.find('undo-landform')).toBeNull()

    await ui.unmount()
  })

  it('withdraws the offer after its window, so it cannot be taken up later', async () => {
    vi.useFakeTimers()
    installFetch(standardRoutes())
    const ui = await renderSurface()
    await throughGenerate(ui)
    await ui.run((a) => a.addDrawnFeature('landform', drawnZone()))
    await ui.click('tab-remove-drawn-1')
    expect(ui.find('undo-landform')).not.toBeNull()

    await React.act(async () => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS + 1)
    })
    expect(ui.find('undo-landform')).toBeNull()
    expect(selectDraft(ui.state, 'landform').drawnFeatures).toEqual([])

    await ui.unmount()
  })
})

/* ===========================================================================
   10-11. THE MAP CONTROLS
   =========================================================================== */

/**
 * The Leaflet map instance behind a rendered container.
 *
 * THE MAP CONTROLS ARE APP'S, so they are asserted against the page's own map
 * rather than the harness's -- a harness that passed the same props would be
 * testing itself. Leaflet keeps no public registry of its instances, so this
 * records them as they are built.
 */
const MAPS = new Map()
const originalMapInit = L.Map.prototype.initialize
L.Map.prototype.initialize = function patched(element, options) {
  const result = originalMapInit.call(this, element, options)
  MAPS.set(this._container, this)
  return result
}

async function renderApp() {
  installFetch(standardRoutes())
  const App = (await import('../App.jsx')).default
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(async () => root.render(<App />))
  const surface = container.querySelector('.leaflet-container')
  return {
    container,
    map: MAPS.get(surface),
    async unmount() {
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
}

describe('8. the map controls', () => {
  it('has no scroll-wheel zoom, keeps touch zoom, and keeps +/-', async () => {
    const ui = await renderApp()

    const app = readFileSync(path.join(SRC, 'App.jsx'), 'utf8')
    expect(app).toContain('scrollWheelZoom={false}')
    // TOUCH ZOOM STAYS. Pinch on a touch screen is a deliberate two-finger
    // gesture on the map itself, not a side effect of moving down the page.
    expect(app).toMatch(/\n\s*touchZoom\n/)

    // THE GATE IS DELETED, not defaulted off: it traded a scroll that ran away
    // with the page for a second thing to learn and a state to be in the wrong
    // one of.
    expect(app).not.toContain('ScrollZoomGate')
    for (const file of sourceFiles(SRC)) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/from '[^']*ScrollZoomGate/)
    }

    // On the live map: the wheel handler is off, the touch handler is on, and
    // the +/- control is the one zoom affordance.
    expect(ui.map.scrollWheelZoom.enabled()).toBe(false)
    expect(ui.map.touchZoom.enabled()).toBe(true)
    expect(ui.map.dragging.enabled()).toBe(true)
    expect(ui.container.querySelector('.leaflet-control-zoom-in')).not.toBeNull()
    expect(ui.container.querySelector('.leaflet-control-zoom-out')).not.toBeNull()

    await ui.unmount()
  })

  it('renders no labels toggle, and still renders the attribution', async () => {
    const ui = await renderApp()

    // The toggle did not earn its space: one bit of state, exposed as a
    // permanent two-button control, answering a question most people ask once.
    expect(ui.container.querySelector('.basemap')).toBeNull()
    expect(ui.container.textContent).not.toContain('Imagery + labels')
    for (const file of sourceFiles(SRC)) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/from '[^']*BasemapControl/)
    }

    // ATTRIBUTION IS A LICENSING REQUIREMENT OF THE TILE SERVICE and is not
    // ours to remove. It is quiet, not gone.
    const credit = ui.container.querySelector('.leaflet-control-attribution')
    expect(credit).not.toBeNull()
    expect(credit.textContent).toContain('Esri')

    await ui.unmount()
  })
})

/* ===========================================================================
   12. THE SHELL STILL NAMES NO STEP
   =========================================================================== */

describe('9. the shell still names no step', () => {
  it('holds no step id, after all of the above', () => {
    // F5's sweep, re-run over the components this branch changed most. The
    // focus, the eye and the × are all generic: a slot holding {stepId,
    // featureId} it was handed, a store action keyed by feature id, and a
    // `removable` flag the definition declares.
    const generic = [
      'WizardShell.jsx',
      'WizardCursor.jsx',
      path.join('shell', 'TabStrip.jsx'),
      path.join('shell', 'DetailPanel.jsx'),
      path.join('shell', 'InstructionBar.jsx'),
    ]
    for (const file of generic) {
      const code = readFileSync(path.join(HERE, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      for (const stepId of [...STEP_ORDER, 'boundary']) {
        expect(code).not.toMatch(new RegExp(`['"\`]${stepId}['"\`]`))
      }
    }

    // ...and the two step-specific things this branch added are DECLARED.
    expect(typeof LANDFORM_STEP.detail).toBe('function')
    const tabs = LANDFORM_STEP.tabs({
      proposals: PAYLOAD,
      draft: { selectedFeatureIds: ['zone-1'], drawnFeatures: [drawnZone()] },
    })
    expect(tabs.filter((t) => t.removable).map((t) => t.id)).toEqual(['drawn-1'])
    expect(tabs.every((t) => t.eye)).toBe(true)
  })
})

/** Every .js/.jsx file under src/. */
function sourceFiles(root) {
  const { readdirSync, statSync } = require('node:fs')
  const found = []
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry)
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full))
    else if (/\.jsx?$/.test(entry)) found.push(full)
  }
  return found
}
