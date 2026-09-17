/**
 * review.test.jsx
 *
 * A COMMITTED STEP IS REVIEWABLE WITHOUT BEING REOPENED.
 *
 * WHAT WAS WRONG. Navigating back to a committed step offered exactly one
 * action -- "Edit this step" -- and the only way to look at a committed zone's
 * figures again was to press it, which reopens the step and cascades every
 * step below it back to not_started. There was no way to simply look.
 *
 * WHAT REVIEW IS. With the cursor ON a committed step, its committed features
 * are interactive: they take a click on the map, they are listed in the tab
 * strip, and a click focuses one and opens the detail panel -- the same three
 * things a live step's features do, through the same handler and the same
 * components. What they do NOT have is a control: no checkbox and no ×, because
 * the commit set is fixed until a reopen and a control that cannot change
 * anything is either inert-but-pressable or a lie.
 *
 * WHAT IT IS NOT. It is not committed geometry becoming interactive everywhere.
 * The rule that made the committed band inert -- a click on a committed
 * production zone during WATER almost certainly means "put this panel away" --
 * is about a layer the cursor has LEFT, and it stands. The distinction is WHERE
 * THE CURSOR IS, and map.test.jsx section 6 asserts both readings of one layer
 * in one place because that distinction is the thing worth testing: making
 * committed layers interactive everywhere would pass half of it.
 *
 * WHAT IS IN HERE. The chrome half -- the strip, the panel, the banner -- over
 * a real Leaflet map, so a bare-map click is the map's own click and a feature
 * click is the path Leaflet delivers.
 */

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
  SessionProvider,
  useSession,
} from '../session/SessionStore'
import {
  FENCE_TYPE_PROPERTY,
  STEP_DEFINITIONS,
  registryProposalFeatures,
} from './stepDefinitions'
import { resetStepCatalog } from './stepCatalog.jsx'
import MapLayerStack from '../map/MapLayerStack.jsx'
import WizardShell from './WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './WizardCursor.jsx'

/* ===========================================================================
   Fixtures
   =========================================================================== */

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']

const RING = [
  [40.7, -74.02],
  [40.7, -73.98],
  [40.73, -73.98],
  [40.73, -74.02],
]

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

function zoneFeature(id, index, properties = {}) {
  return {
    type: 'Feature',
    id,
    properties: { name: id, ...properties },
    geometry: polygon([
      [-74.01 + index * 0.002, 40.71],
      [-74.005 + index * 0.002, 40.71],
      [-74.005 + index * 0.002, 40.715],
      [-74.01 + index * 0.002, 40.71],
    ]),
  }
}

function featureCollection(...features) {
  return { type: 'FeatureCollection', features }
}

const ZONE_1 = zoneFeature('zone-1', 0)
const ZONE_2 = zoneFeature('zone-2', 1)
/** A zone the user drew and committed. */
const DRAWN_1 = zoneFeature('drawn-1', 2, { acres: 1.1, confidence: 'low', cautions: [] })
/** A zone the user drew and un-ticked before committing. Never committed. */
const DRAWN_2 = zoneFeature('drawn-2', 3, { acres: 0.4, confidence: 'low', cautions: [] })

/** Landform's payload: TWO candidates, only one of which will be taken. */
const LANDFORM_PAYLOAD = {
  eligible_union: null,
  exclusion_layers: [
    { type: 'slope', label: 'slope above 20.0%', data_available: true, geometry_wgs84: null },
  ],
  suggested_zones: featureCollection(ZONE_1, ZONE_2),
  zones: [
    {
      id: 0,
      feature_id: 'zone-1',
      rank: 1,
      area_acres: 2.5,
      score: 81.0,
      slope_median_pct: 6.0,
      elevation_position: 'upper field',
      aspect_available: true,
      dominant_aspect: 'south',
    },
    {
      id: 1,
      feature_id: 'zone-2',
      rank: 2,
      area_acres: 1.2,
      score: 64.0,
      slope_median_pct: 9.0,
      elevation_position: 'mid field',
      aspect_available: false,
      dominant_aspect: null,
    },
  ],
  scales: { range: [0, 100] },
  summary: { total_acres: 400, eligible_acres: 200 },
}

function fenceFeature(id, type, index) {
  return {
    type: 'Feature',
    id,
    properties: { [FENCE_TYPE_PROPERTY]: type },
    geometry: {
      type: 'LineString',
      coordinates: [
        [-74.01 + index * 0.001, 40.71],
        [-74.0 + index * 0.001, 40.72],
      ],
    },
  }
}

const FENCE_A = fenceFeature('fence-a', 'boundary', 0)
const FENCE_B = fenceFeature('fence-b', 'boundary', 1)
const FENCE_C = fenceFeature('fence-c', 'water_zone_exclusion', 2)

/** Fencing's payload: two candidate types, only one of which will be taken. */
const FENCING_PAYLOAD = {
  fence_lines: featureCollection(FENCE_A, FENCE_B, FENCE_C),
  candidate_fence_types: ['boundary', 'water_zone_exclusion'],
  fence_types: [
    {
      fence_type: 'boundary',
      label: 'Boundary fence',
      candidate: true,
      generated: true,
      feature_ids: ['fence-a', 'fence-b'],
      feature_count: 2,
      total_length_ft: 1840,
    },
    {
      fence_type: 'water_zone_exclusion',
      label: 'Water zone exclusion fence',
      candidate: true,
      generated: true,
      feature_ids: ['fence-c'],
      feature_count: 1,
      total_length_ft: 610,
    },
  ],
  summary: { total_length_ft: 2450 },
}

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

/** A committed entry, with the provenance the commit wrote. */
function committedStep(revision, features, drawnIds = []) {
  return {
    status: COMMITTED,
    revision,
    features,
    provenance: Object.fromEntries(
      features.features.map((f) => [f.id, drawnIds.includes(f.id) ? PROVENANCE_USER_ADDED : 'generated'])
    ),
  }
}

/* ===========================================================================
   Harness
   =========================================================================== */

const STEPS_ROUTE = {
  method: 'GET',
  pattern: /^\/api\/steps$/,
  responses: { body: { step_order: [...STEP_ORDER] } },
}

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
    const { status = 200, body } = responses[index]
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  })

  return calls
}

function route(method, pattern, responses) {
  return { method, pattern, responses }
}

/** Leaflet names a pane's div `leaflet-<name>-pane`. */
function paneKey(pane) {
  for (const className of pane.classList) {
    const match = /^leaflet-(.+)-pane$/.exec(className)
    if (match && match[1] !== 'map' && className !== 'leaflet-pane') return match[1]
  }
  return null
}

/** The map, the chrome, and a probe for both. */
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
          <Probe />
          <MapContainer center={[40.715, -74]} zoom={14} style={{ height: 600, width: 600 }}>
            <MapProbe />
            <MapLayerStack />
          </MapContainer>
          <WizardShell />
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
    find: (testId) => container.querySelector(`[data-testid="${testId}"]`),
    text: (testId) => container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null,
    all: (selector) => [...container.querySelectorAll(selector)],
    /** The tab ids the strip is showing, in order. */
    tabIds() {
      return [...container.querySelectorAll('.chrome-tabs [data-tab-id]')].map(
        (li) => li.dataset.tabId
      )
    },
    panes() {
      return [...container.querySelectorAll('.leaflet-pane.stack-layer')].map((pane) => ({
        key: paneKey(pane),
        pane,
      }))
    },
    pane(key) {
      return this.panes().find((entry) => entry.key === key) ?? null
    },
    async click(testId) {
      const element = container.querySelector(`[data-testid="${testId}"]`)
      if (!element) throw new Error(`no element with data-testid="${testId}"`)
      await React.act(async () => element.click())
    },
    async clickPath(pathElement) {
      await React.act(async () => {
        pathElement.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    },
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
 * A LANDFORM STEP COMMITTED THE WAY A USER COMMITS ONE, so that everything
 * review has to ignore actually exists: a declined candidate (zone-2, in the
 * payload and out of the commit) and a drawn zone un-ticked before the commit
 * (drawn-2, in the draft and out of the commit).
 */
async function commitLandform(ui) {
  await ui.run((a) => a.startSession(RING))
  await ui.run((a) => a.resume('sess-1'))
  await ui.run((a) => a.loadLayers('landform'))
  await ui.run((a) => a.addDrawnFeature('landform', DRAWN_1))
  await ui.run((a) => a.addDrawnFeature('landform', DRAWN_2))
  await ui.run((a) => a.setSelection('landform', ['zone-1', 'drawn-1']))
  await ui.run((a) => a.commit('landform'))
  return ui
}

function landformRoutes({ water = { status: NOT_STARTED } } = {}) {
  return [
    route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
    route('GET', /^\/api\/sessions\/[^/]+$/, {
      body: serverDocument({ steps: { landform: { status: GENERATED, revision: 0 } } }),
    }),
    route('GET', /\/steps\/landform\/layers$/, { body: LANDFORM_PAYLOAD }),
    route('POST', /\/steps\/landform\/commit$/, {
      body: serverDocument({
        revision: 1,
        steps: {
          landform: committedStep(1, featureCollection(ZONE_1, DRAWN_1), ['drawn-1']),
          water,
        },
      }),
    }),
  ]
}

beforeEach(() => {
  resetStepCatalog()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  vi.restoreAllMocks()
})

/* ===========================================================================
   1. THE CURSOR ON A COMMITTED STEP
   =========================================================================== */

describe('1. review', () => {
  it('draws its committed features as click targets, lists them, and opens the panel', async () => {
    installFetch(landformRoutes())
    const ui = await renderSurface()
    await commitLandform(ui)

    // The commit advanced past landform; the rail is how you come back.
    expect(ui.state.steps.landform.status).toBe(COMMITTED)
    await ui.run((_a, cursor) => cursor.open('landform'))

    // THE STRIP RENDERS, with a tab per committed feature.
    expect(ui.find('tabs-landform')).not.toBeNull()
    expect(ui.tabIds()).toEqual(['zone-1', 'drawn-1'])
    expect(ui.find('tabs-landform').dataset.review).toBe('true')

    // THE MAP DRAWS THEM AS CLICK TARGETS. `leaflet-interactive` is whether
    // Leaflet registers the path as a target at all, so this is the assertion
    // rather than a proxy for one.
    const paths = [...ui.pane('landform--landform-committed').pane.querySelectorAll('path')]
    expect(paths).toHaveLength(2)
    for (const path of paths) expect(path.classList.contains('leaflet-interactive')).toBe(true)

    // A CLICK ON THE MAP FOCUSES AND OPENS THE PANEL -- with the step's own
    // figures in it, read off the candidate set the commit was made from.
    await ui.clickPath(paths[0])
    expect(ui.cursor.focusedFeatureId).toBe('zone-1')
    expect(ui.text('detail-name-landform')).toBe('Block 1')
    expect(ui.text('detail-value-median slope %')).toBe('6.0')
    expect(ui.find('tab-zone-1').dataset.focused).toBe('true')

    // AND A CLICK ON A TAB IS THE SAME ACT. The drawn block reads as one, in
    // the SAME rows a suggestion reads in -- which is the same answer an
    // active step gives for it, and the whole of what the drawn panel is now.
    // It carried a `source` row saying "drawn by hand" for one branch; the
    // row is gone, the tab's own name is what says which kind of block this
    // is, and the panel is the suggested panel plus this block's cautions.
    await ui.click('tab-focus-drawn-1')
    expect(ui.cursor.focusedFeatureId).toBe('drawn-1')
    expect(ui.text('detail-name-landform')).toBe('Drawn 1')
    expect(ui.find('detail-value-source')).toBeNull()
    expect(ui.find('detail-value-confidence')).toBeNull()
    expect(ui.find('detail-value-median slope %')).not.toBeNull()

    // NOTHING WAS ARMED AND NO DRAFT WAS MINTED. Looking is not editing.
    expect(ui.cursor.armed).toBeNull()
    expect(ui.state.drafts.landform).toBeUndefined()

    await ui.unmount()
  })

  it('shows only what committed -- not the declined candidate, not the un-ticked drawn zone', async () => {
    installFetch(landformRoutes())
    const ui = await renderSurface()
    await commitLandform(ui)

    // THE LEFTOVER THIS HAS TO IGNORE, PUT BACK. A commit discards its draft,
    // but a hydrate whose step comes back committed KEEPS one -- the 409 path,
    // where another tab won the race -- so a committed step with drawn shapes
    // in its draft is a state this build can reach. Written directly rather
    // than raced for; what is under test is that review does not read it.
    await ui.run((a) => a.addDrawnFeature('landform', DRAWN_2))
    expect(ui.state.drafts.landform.drawnFeatures.map((f) => f.id)).toEqual(['drawn-2'])

    // And the declined candidate is still in hand: the payload the commit was
    // made from is kept, so "zone-2 is absent" is an assertion about a
    // filter rather than about an empty store.
    expect(ui.state.steps.landform.review.zones.map((z) => z.feature_id)).toEqual([
      'zone-1',
      'zone-2',
    ])

    await ui.run((_a, cursor) => cursor.open('landform'))

    // IN THE STRIP: neither.
    expect(ui.tabIds()).toEqual(['zone-1', 'drawn-1'])
    expect(ui.find('tab-zone-2')).toBeNull()
    expect(ui.find('tab-drawn-2')).toBeNull()

    // ON THE MAP: neither. The committed band carries exactly the two
    // committed features, and the editable band -- which is where a candidate
    // or a drawn shape would be drawn -- is not composed at all for a step
    // whose decision is made.
    const committed = [...ui.pane('landform--landform-committed').pane.querySelectorAll('path')]
    expect(committed).toHaveLength(2)
    expect(ui.pane('landform--landform-suggested')).toBeNull()
    expect(ui.pane('landform--landform-drawn')).toBeNull()

    // And no tool mounted over the band that is not there.
    expect(ui.all('.map-tools__mount')).toHaveLength(0)

    // A TAB THAT NAMES NO FEATURE IS NOT NARROWED AWAY. The boundary is
    // committed from the moment a session exists and its tab is the parcel's
    // own readout, keyed by an INPUT; a filter applied to every tab alike
    // would delete the one tab that is always correct.
    await ui.run((_a, cursor) => cursor.open('boundary'))
    expect(ui.tabIds()).toEqual(['ring'])
    expect(ui.text('tab-ring')).toContain('acres')
    expect(ui.find('tab-check-ring')).toBeNull()
    expect(ui.find('tab-remove-ring')).toBeNull()

    await ui.unmount()
  })

  it('renders no checkbox and no × -- absent from the document, not disabled in it', async () => {
    installFetch(landformRoutes())
    const ui = await renderSurface()
    await commitLandform(ui)
    await ui.run((_a, cursor) => cursor.open('landform'))

    // The tabs are there, so this is not passing by rendering nothing.
    expect(ui.tabIds()).toEqual(['zone-1', 'drawn-1'])

    // NOT `disabled`, NOT `aria-disabled`: gone. A control that cannot change
    // a committed decision must not be reachable by a pointer at all.
    for (const id of ['zone-1', 'drawn-1']) {
      expect(ui.find(`tab-check-${id}`), 'no checkbox in review').toBeNull()
      expect(ui.find(`tab-remove-${id}`), 'no × in review').toBeNull()
    }
    expect(ui.all('.chrome-tabs input')).toHaveLength(0)
    expect(ui.all('.chrome-tab__remove')).toHaveLength(0)

    // The drawn zone carried BOTH while the step was live, so the absence is
    // the review state's doing rather than a tab that never had them.
    const live = STEP_DEFINITIONS.find((step) => step.id === 'landform').tabs({
      proposals: ui.state.steps.landform.review,
      draft: { selectedFeatureIds: ['drawn-1'], drawnFeatures: [DRAWN_1], inputs: {} },
    })
    expect(live.find((tab) => tab.id === 'drawn-1')).toMatchObject({
      checkbox: true,
      removable: true,
    })

    await ui.unmount()
  })

  it('lets go on a bare-map click, exactly as a live step does', async () => {
    installFetch(landformRoutes())
    const ui = await renderSurface()
    await commitLandform(ui)
    await ui.run((_a, cursor) => cursor.open('landform'))

    await ui.click('tab-focus-zone-1')
    expect(ui.find('detail-landform')).not.toBeNull()

    // The map's own click, the way Leaflet delivers one. A feature click stops
    // propagating, so this is the gesture that reached nothing.
    await ui.clickMap([40.729, -73.981])
    expect(ui.cursor.focusedFeatureId).toBeNull()
    expect(ui.find('detail-landform')).toBeNull()
    expect(ui.find('tab-zone-1').dataset.focused).toBe('false')

    // AND THE CURSOR DID NOT MOVE. Letting go of a feature is a statement
    // about the panel and says nothing about which step is open.
    expect(ui.cursor.cursorStepId).toBe('landform')

    await ui.unmount()
  })

  it('keeps "Edit this step" as the only route back, confirmation and cascade intact', async () => {
    installFetch(
      landformRoutes({
        water: committedStep(1, featureCollection(zoneFeature('pond-1', 4))),
      })
    )
    const ui = await renderSurface()
    await commitLandform(ui)
    await ui.run((_a, cursor) => cursor.open('landform'))

    // ONE BUTTON, AND IT IS THE REOPEN. Review adds no control to the banner:
    // everything it offers is a reading, and a reading needs no button.
    const actions = ui.find('actions-landform')
    expect([...actions.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Edit this step',
    ])

    await ui.click('edit-landform')
    expect(ui.find('reopen-confirm-landform')).not.toBeNull()
    expect(ui.text('reopen-confirm-title-landform')).toBe('Reopen landform?')

    // AND IT STILL NAMES WHAT IT COSTS, in the downstream step's own words.
    expect(ui.text('reopen-resets-landform')).toContain('every step below it starts again')
    expect(ui.find('reopen-reset-water')).not.toBeNull()
    expect(ui.text('reopen-reset-note-water')).toContain('committed')

    // The confirmation covers the banner while it is up.
    expect(ui.find('actions-landform')).toBeNull()

    await ui.unmount()
  })
})

/* ===========================================================================
   2. THE STEP WITH NO PANEL
   =========================================================================== */

describe('2. fencing in review', () => {
  it('takes the tab active state and opens nothing, as it does while it is live', async () => {
    const upstream = {
      landform: committedStep(1, featureCollection(ZONE_1)),
      water: committedStep(1, featureCollection(zoneFeature('pond-1', 4))),
      roads: committedStep(1, featureCollection()),
      trees: committedStep(1, featureCollection()),
      structures: committedStep(1, featureCollection()),
    }
    installFetch([
      route('POST', /^\/api\/sessions$/, { status: 201, body: serverDocument() }),
      route('GET', /^\/api\/sessions\/[^/]+$/, {
        body: serverDocument({
          revision: 5,
          steps: { ...upstream, fencing: { status: GENERATED, revision: 0 } },
        }),
      }),
      route('GET', /\/steps\/fencing\/layers$/, { body: FENCING_PAYLOAD }),
      route('POST', /\/steps\/fencing\/commit$/, {
        body: serverDocument({
          revision: 6,
          steps: {
            ...upstream,
            fencing: committedStep(1, featureCollection(FENCE_A, FENCE_B)),
          },
        }),
      }),
    ])

    const ui = await renderSurface()
    await ui.run((a) => a.startSession(RING))
    await ui.run((a) => a.resume('sess-1'))
    await ui.run((a) => a.loadLayers('fencing'))
    // The boundary type commits; the water-zone type is declined.
    await ui.run((a) => a.setSelection('fencing', ['fence-a', 'fence-b']))
    await ui.run((a) => a.commit('fencing'))
    await ui.run((_a, cursor) => cursor.open('fencing'))

    // ONE TAB, FOR THE TYPE THAT COMMITTED. The declined type is gone.
    expect(ui.tabIds()).toEqual(['boundary'])
    expect(ui.find('tab-check-boundary')).toBeNull()
    expect(ui.find('tab-remove-boundary')).toBeNull()

    // A CLICK TAKES THE TAB'S ACTIVE STATE AND NOTHING ELSE. `detail: null`,
    // so there is no panel here in ANY state -- which is the divergence the
    // fencing step declares for itself, not something review took away.
    await ui.click('tab-focus-boundary')
    expect(ui.find('tab-boundary').dataset.focused).toBe('true')
    expect(ui.cursor.focusedFeatureId).toBe('boundary')
    expect(ui.find('detail-fencing')).toBeNull()

    // And the same on the map: the committed fence lines take a click, and a
    // click marks the tab whose type carries them.
    await ui.click('tab-focus-boundary')
    expect(ui.find('tab-boundary').dataset.focused).toBe('false')
    const lines = [...ui.pane('fencing--fencing-committed').pane.querySelectorAll('path')]
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0].classList.contains('leaflet-interactive')).toBe(true)
    await ui.clickPath(lines[0])
    expect(ui.find('tab-boundary').dataset.focused).toBe('true')
    expect(ui.find('detail-fencing')).toBeNull()

    await ui.unmount()
  })
})
