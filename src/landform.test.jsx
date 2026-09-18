/**
 * landform.test.jsx
 *
 * THE LANDFORM STEP, END TO END AGAINST THE REAL BACKEND.
 *
 * This is the branch's reason to exist and this file is where that claim is
 * tested. There is no fetch stub in here and no hand-written payload: every
 * response comes from api.py's own Flask app, running the real
 * session_manager, step_orchestrator, commit_validation, wire_translation and
 * production_zone_payload over the real reference parcel's DEM
 * (5614 N Montour Rd, Gibsonia, PA -- the same six lon/lat pairs the
 * backend's own B2/B4/B5a/B5b suites use, so every figure below is comparable
 * with theirs).
 *
 * HOW TO RUN IT:
 *
 *     cd ../keyline-designer && python serve_test_backend.py 5099 &
 *     VITE_API_URL=http://127.0.0.1:5099 npx vitest run src/landform.test.jsx
 *
 * SKIPPED, NOT FAILED, WITH NO SERVER. A red suite on a machine that simply
 * has no backend teaches nothing; the skip names what is missing. The two
 * sections that need no server -- crossing agreement and the payload
 * reconciliation -- run either way, off a CAPTURED session (fixtures/
 * landform-session.json, written by the backend's make_landform_fixture.py
 * through the same harness).
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import L from 'leaflet'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MapContainer, useMap } from 'react-leaflet'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  COMMITTED,
  GENERATED,
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
  LANDFORM_SHAPE,
  LANDFORM_STEP,
  PRODUCTION_AREA_LAYER,
  aspectPhrase,
  registryProposalFeatures,
} from './wizard/stepDefinitions'
import { CONTINUATION, EM_DASH, labelledRun, panelBody } from './wizard/shell/panelFormat.js'
import WizardShell from './wizard/WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './wizard/WizardCursor.jsx'
import MapLayerStack from './map/MapLayerStack.jsx'
import { DrawingProgressProvider } from './map/DrawingProgress.jsx'
import { CAUTION_PANE_Z } from './map/CautionMarkers.jsx'
import polygonClipping from 'polygon-clipping'

import { CAUTION_MIN_ACRES, cautionsFor, clampToBoundary, exclusionGrounds } from './zoneGeometry.js'
import { multiPolygonAreaAcres, toMultiPolygon } from './geo.js'
import captured from './fixtures/landform-session.json'
import rings from './fixtures/rings.json'

/* ---------------------------------------------------------------------------
   The rings, in the order a map holds them
   --------------------------------------------------------------------------- */

const toLatLng = (ring) => ring.map(([lng, lat]) => [lat, lng])

/** The real drawn property. */
const BOUNDARY = toLatLng(rings.boundary)
/** Inside the parcel, squarely over the hydric gate's footprint. */
const HYDRIC_RING = toLatLng(rings.hydric)
/** Straddling the western property line -- about half of it off the parcel. */
const OFF_PARCEL_RING = toLatLng(rings.off)

/* ---------------------------------------------------------------------------
   Is the backend there?
   --------------------------------------------------------------------------- */

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
 * Run this test only against a live backend; otherwise say why it did not.
 *
 * The generous timeout is the point of the suite: a generate runs the real
 * production pipeline over a real DEM, and a commit rehydrates and re-scores
 * every feature in it. Vitest's 5 s default is a timeout for a stubbed fetch.
 */
const LIVE_TIMEOUT_MS = 180000

const liveIt = (name, fn) =>
  it(name, async (context) => (live ? fn(context) : context.skip()), LIVE_TIMEOUT_MS)

/* ---------------------------------------------------------------------------
   The surface: the real map stack, the real wizard, the real store
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
            {/* ZOOM 19. The gesture under test snaps a click to an existing
                vertex within VERTEX_HIT_RADIUS_PX, so a ring has to be bigger
                than that on screen or its own corners swallow each other --
                the hydric rectangle is about 10 m across, which is 4 px at
                zoom 16 and 33 px here. The same constraint a person drawing it
                would feel. */}
            <MapContainer center={BOUNDARY[0]} zoom={19} style={{ height: 600, width: 600 }}>
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
    find: (id) => container.querySelector(`[data-testid="${id}"]`),
    text: (id) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? null,
    panes() {
      return [...container.querySelectorAll('.leaflet-pane')]
        .map((pane) => ({ pane, z: Number(pane.style.zIndex) || 0, cls: pane.className }))
    },
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
    /** Move the cursor, the way a click on the step rail does. */
    async open(stepId) {
      await React.act(async () => cursor.open(stepId))
    },
    /** Toggle a proposal, the way a click on its zone on the map does. */
    async toggle(featureId) {
      await React.act(async () => session.actions.toggleSelection('landform', featureId))
    },
    /** A click on the map, the way Leaflet delivers one to its listeners. */
    async clickMap([lat, lng]) {
      await React.act(async () => map.fire('click', { latlng: L.latLng(lat, lng) }))
    },
    /**
     * Wait for something the server has to answer for.
     *
     * A click that starts a generate returns before the job has been polled to
     * done; act() flushes React, not a fetch chain. So the test asks for the
     * CONDITION it is waiting on rather than sleeping -- and fails naming it
     * rather than failing on whatever was undefined next.
     */
    async waitFor(what, predicate, timeoutMs = 120000) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        await React.act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 25))
        })
        if (predicate()) return
      }
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for: ${what}\n` +
          `  landform status=${selectStepStatus(this.state, 'landform')} ` +
          `proposals=${this.state.steps.landform?.proposals ? 'yes' : 'no'} ` +
          `draft=${this.state.drafts.landform ? 'yes' : 'no'} ` +
          `error=${JSON.stringify(this.state.steps.landform?.error)}`
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
 * Boundary drawn and committed, landform generated. The whole opening of the
 * flow, through the wizard's own affordances rather than around them.
 */
async function throughGenerate(ui) {
  await ui.run((a) => a.setDraftInput('boundary', 'ring', BOUNDARY))
  // The banner's commit for the state the boundary is in. Nothing is armed --
  // the ring went into the draft directly -- so the step reads as reviewing
  // and the pair is redraw/commit.
  await ui.click('commit-boundary')
  await ui.waitFor('the session to exist', () => Boolean(ui.state.sessionId))
  await ui.click('generate-landform')
  await ui.waitFor(
    'landform to finish generating',
    () => selectStepStatus(ui.state, 'landform') === GENERATED
  )
  await ui.waitFor(
    'the draft to be seeded from the payload',
    () => ui.state.drafts.landform !== undefined
  )
  return ui
}

/** Draw a ring on the map through the real gesture: arm, click each vertex, close. */
async function drawZone(ui, ring) {
  await ui.click('draw-landform')
  for (const point of ring) await ui.clickMap(point)
  // Closing means clicking the first vertex again, which is what ZoneDrawTool
  // watches for -- the same gesture a person makes.
  await ui.clickMap(ring[0])
}

/* ===========================================================================
   1. END TO END
   =========================================================================== */

describe('1. end to end against the real backend', () => {
  liveIt(
    'draws a boundary, commits it, generates landform, deselects one, draws a zone, commits, and the document reflects all of it',
    async () => {
      const ui = await renderApp()
      await throughGenerate(ui)

      const payload = ui.state.steps.landform.proposals
      const proposalIds = payload.suggested_zones.features.map((f) => f.id)
      expect(proposalIds.length).toBeGreaterThan(1)

      // THE DISPLAY-ONLY SMOOTHED OUTLINE CAME OVER THE WIRE. A production
      // zone is a bounded opening of a 5 m cell union, so its edge is a pixel
      // staircase; the server ships a smoothed rendering of it beside the
      // geometry, computed by the same function the PDF's layout map uses, and
      // map/layers.jsx draws that instead. It is a RENDERING of `geometry`,
      // never a replacement: the two are different shapes here, and the
      // clamp, the cautions, the acreage and the commit body below all read
      // the second one.
      for (const feature of payload.suggested_zones.features) {
        const outline = feature.properties.display_only_smoothed_outline
        expect(outline, `${feature.id} carries a smoothed outline`).toBeTruthy()
        expect(['Polygon', 'MultiPolygon']).toContain(outline.type)
        expect(JSON.stringify(outline)).not.toBe(JSON.stringify(feature.geometry))
      }
      // AND THE EXCLUSION LAYERS DO NOT. They are gate footprints, not zones,
      // and nothing renders them as an outline.
      for (const layer of payload.exclusion_layers) {
        expect(layer).not.toHaveProperty('display_only_smoothed_outline')
      }

      // A SUBSET: take one out. The rest stay in, because the payload is the
      // recommendation and the gesture is to remove.
      const dropped = proposalIds[proposalIds.length - 1]
      await ui.toggle(dropped)
      const kept = proposalIds.filter((id) => id !== dropped)
      expect(new Set(selectDraft(ui.state, 'landform').selectedFeatureIds)).toEqual(new Set(kept))

      // A DRAWN ZONE, through the real gesture on the real map.
      await drawZone(ui, HYDRIC_RING)
      const drawn = selectDraft(ui.state, 'landform').drawnFeatures
      expect(drawn).toHaveLength(1)
      expect(drawn[0].properties.layer).toBe(PRODUCTION_AREA_LAYER)

      // COMMIT.
      await ui.click('commit-landform')
      await ui.waitFor(
        'the commit to land',
        () => selectStepStatus(ui.state, 'landform') === COMMITTED
      )

      // THE DOCUMENT REFLECTS IT: the kept proposals as `generated`, the drawn
      // zone as `user_added`, and the one taken out is not there.
      const committed = selectStepFeatures(ui.state, 'landform').features
      const provenance = selectStepProvenance(ui.state, 'landform')
      const committedIds = committed.map((f) => f.id)

      for (const id of kept) {
        expect(committedIds).toContain(id)
        expect(provenance[id]).toBe(PROVENANCE_GENERATED)
      }
      expect(committedIds).not.toContain(dropped)

      const userAdded = committed.filter((f) => provenance[f.id] === PROVENANCE_USER_ADDED)
      expect(userAdded).toHaveLength(1)
      // The server recorded what it crosses -- see section 4.
      expect(Array.isArray(userAdded[0].properties.exclusion_crossings)).toBe(true)

      // And the draft is gone, because the decision is in the document now.
      expect(ui.state.drafts.landform).toBeUndefined()

      console.log(
        `E2E: committed ${committedIds.length} features ` +
          `(${kept.length} generated, ${userAdded.length} user_added), ` +
          `document_revision ${ui.state.document.document_revision}`
      )
      await ui.unmount()
    }
  )
})

/* ===========================================================================
   2. SELECTION SEMANTICS
   =========================================================================== */

describe('2. selection semantics', () => {
  liveIt('a fresh payload has everything selected, from an empty draft', async () => {
    const ui = await renderApp()
    // There is no draft at all before the payload arrives -- which is the
    // state that would be ambiguous if it survived one.
    expect(ui.state.drafts.landform).toBeUndefined()

    await throughGenerate(ui)

    const proposalIds = ui.state.steps.landform.proposals.suggested_zones.features.map(
      (f) => f.id
    )
    const draft = selectDraft(ui.state, 'landform')
    expect(new Set(draft.selectedFeatureIds)).toEqual(new Set(proposalIds))
    expect(draft.drawnFeatures).toEqual([])

    // AND IT IS NOT "UNSAVED CHANGES". The seed is the server's own
    // recommendation, not the user's work, so the panel opens on `reviewing`.
    expect(ui.find('step-landform').dataset.stepState).toBe('reviewing')

    // Deselecting everything is then unambiguous: an empty selected set means
    // the user took everything out, because a draft always exists once a
    // payload has landed.
    for (const id of proposalIds) await ui.toggle(id)
    expect(selectDraft(ui.state, 'landform').selectedFeatureIds).toEqual([])
    expect(ui.find('step-landform').dataset.stepState).toBe('editing')

    await ui.unmount()
  })
})

/* ===========================================================================
   3. CLAMPING
   =========================================================================== */

describe('3. a drawn zone is clamped to the boundary before commit', () => {
  liveIt('trims the off-parcel half and says so, and the server accepts it', async () => {
    const ui = await renderApp()
    await throughGenerate(ui)

    await drawZone(ui, OFF_PARCEL_RING)
    const drawn = selectDraft(ui.state, 'landform').drawnFeatures
    expect(drawn).toHaveLength(1)

    // WHAT WAS DRAWN vs WHAT WAS KEPT. The ring straddles the western property
    // line; the clamp keeps the inside and drops the rest.
    const asDrawn = clampToBoundary(OFF_PARCEL_RING, BOUNDARY)
    expect(asDrawn.removedAcres).toBeGreaterThan(0)
    expect(drawn[0].properties.acres).toBeCloseTo(asDrawn.acres, 6)
    expect(ui.text('landform-notice')).toContain('trimmed off')

    // AND THE SERVER TAKES IT. The same ring uncla mped is rejected as
    // 'outside_boundary' (section 6); clamped, it commits.
    await ui.click('commit-landform')
    await ui.waitFor(
      'the commit to land',
      () => selectStepStatus(ui.state, 'landform') === COMMITTED
    )

    console.log(
      `CLAMP: drew ${(asDrawn.acres + asDrawn.removedAcres).toFixed(2)} ac, ` +
        `kept ${asDrawn.acres.toFixed(2)} ac, trimmed ${asDrawn.removedAcres.toFixed(2)} ac`
    )
    await ui.unmount()
  })
})

/* ===========================================================================
   4. EXCLUSION CROSSING
   =========================================================================== */

describe('4. a drawn zone over the hydric mask', () => {
  liveIt('commits successfully, with the crossing recorded', async () => {
    const ui = await renderApp()
    await throughGenerate(ui)

    await drawZone(ui, HYDRIC_RING)
    const drawn = selectDraft(ui.state, 'landform').drawnFeatures[0]
    // The client saw the crossing while it was being drawn.
    expect(drawn.properties.cautions.map((c) => c.type)).toContain('hydric')

    await ui.click('commit-landform')
    await ui.waitFor(
      'the commit to land',
      () => selectStepStatus(ui.state, 'landform') === COMMITTED
    )
    // NOT REFUSED. The exclusion gates are advisory: the server records what a
    // committed zone crosses and commits it anyway.
    expect(selectStepStatus(ui.state, 'landform')).toBe(COMMITTED)

    const provenance = selectStepProvenance(ui.state, 'landform')
    const committed = selectStepFeatures(ui.state, 'landform').features
    const userAdded = committed.find((f) => provenance[f.id] === PROVENANCE_USER_ADDED)
    const crossings = userAdded.properties.exclusion_crossings
    expect(crossings.map((c) => c.type)).toContain('hydric')

    console.log(
      'CROSSING RECORDED: ' + crossings.map((c) => `${c.type} ${c.acres} ac`).join(', ')
    )
    await ui.unmount()
  })
})

/* ===========================================================================
   4b. A DRAWN BLOCK IS MEASURED
   =========================================================================== */

describe('4b. a drawn block is scored by the server', () => {
  liveIt('fills the whole panel in, on the same instrument as the suggestions', async () => {
    const ui = await renderApp()
    await throughGenerate(ui)

    const suggestions = ui.state.steps.landform.proposals.zones
    await drawZone(ui, HYDRIC_RING)

    // THE READING ARRIVES AFTER THE BLOCK DOES. Drawing is a decision and
    // never waits on a request; the measurement follows it.
    await ui.waitFor(
      "the server's reading of the drawn block",
      () => selectDraft(ui.state, 'landform').drawnFeatures[0]?.properties?.score != null
    )
    const drawn = selectDraft(ui.state, 'landform').drawnFeatures[0]
    const properties = drawn.properties

    // EVERY FACTOR, on the same 0-100 scale the suggestions are read on.
    expect(Object.keys(properties.factors).sort()).toEqual([
      'aspect_factor',
      'shape_factor',
      'slope_factor',
      'soil_factor',
    ])
    expect(properties.score).toBeGreaterThanOrEqual(ui.state.steps.landform.proposals.scales.range[0])
    expect(properties.score).toBeLessThanOrEqual(ui.state.steps.landform.proposals.scales.range[1])
    expect(properties.block_origin).toBe('user_drawn')

    // THE FIVE READINGS THE PANEL SHOWS. This ring sits on the hydric mask,
    // so the soil under it is named and its drainage class with it.
    expect(properties.slope_median_pct).toBeGreaterThan(0)
    expect(properties.dominant_aspect).toBeTruthy()
    expect(properties.elevation_position).toBeTruthy()
    expect(properties.soil_components.length).toBeGreaterThan(0)
    expect(properties.drainage_class).toBeTruthy()

    // NO RANK. It is a position among candidates this block was not one of,
    // and production's panel shows none -- so the server sends none rather
    // than inventing one.
    expect(properties.rank).toBeUndefined()

    // AND THE BLOCK IS STILL THE USER'S. The reading did not overwrite what
    // the draw decided: the id, the acreage the clamp measured, the low
    // confidence and the hand-drawn note are all untouched.
    expect(drawn.id).toMatch(/^drawn-/)
    expect(properties.confidence).toBe('low')
    expect(properties.confidence_notes).toContain('Drawn by hand')
    expect(properties.acres).toBeCloseTo(clampToBoundary(HYDRIC_RING, BOUNDARY).acres, 6)

    // THE PANEL RENDERS IT, through the step's own declaration.
    const context = { proposals: ui.state.steps.landform.proposals, draft: selectDraft(ui.state, 'landform') }
    const rows = LANDFORM_STEP.detail(context, drawn.id).rows
    const labels = rows.filter((row) => row.label).map((row) => row.label)
    expect(labels).toEqual(['aspect', 'position', 'median slope %', 'soil', 'drainage'])
    for (const row of rows) expect(row.value).not.toBe(EM_DASH)

    console.log(
      `DRAWN SCORED: ${properties.score}/100 on ${properties.acres.toFixed(2)} ac ` +
        `(${JSON.stringify(properties.factors)}), ${properties.drainage_class.toLowerCase()} soil, ` +
        `beside suggestions scoring ${suggestions.map((zone) => zone.score).join(', ')}`
    )
    await ui.unmount()
  })
})

/* ===========================================================================
   5. CROSSING AGREEMENT -- two implementations, one answer
   =========================================================================== */

describe('5. crossing agreement', () => {
  /**
   * THE CLIENT'S cautionsFor() AND THE SERVER'S exclusion_crossings() ARE TWO
   * IMPLEMENTATIONS OF ONE QUESTION, and both are justified: the client cannot
   * make a round trip per vertex, and the server cannot record a figure it did
   * not measure itself. What they must not do is disagree about whether a
   * crossing EXISTS -- a zone that warns while drawing and records nothing on
   * commit is a contradiction the user sees directly.
   *
   * RUN OFF THE CAPTURED SESSION so this section needs no server: the payload,
   * the drawn features and the recorded crossings below are all real backend
   * output. What runs here is the REAL zoneGeometry.js against them --
   * polygon-clipping in JS against shapely in Python, which is the comparison
   * the backend's own section 7 cannot make (it ports cautionsFor() into
   * shapely, isolating the projection difference but not the clipping library).
   */
  /**
   * THE FLOOR IS ABSOLUTE, AND THE DISPLAY IS A SHARE. The two are different
   * quantities and this is where the difference is asked about directly.
   *
   * The captured `graze` zone is the case: it touches the hydric gate over
   * 0.0102 acres, which is BELOW CAUTION_MIN_ACRES and dropped -- and that
   * same crossing is about a ninth of the block, a percentage that would have
   * comfortably cleared any floor stated as a share. A percentage floor would
   * show it, and what it would show is a 5 m cell staircase disagreeing with a
   * hand-drawn ring along their shared edge: the clip itself, not a
   * measurement of anything. The block being small is exactly what makes the
   * share big, and is no reason to trust the sliver.
   */
  it('drops a sub-floor crossing however large a share of the block it is', () => {
    const ring = captured.graze.feature.geometry.coordinates[0].map(([lng, lat]) => [lat, lng])
    const { multi } = clampToBoundary(ring, BOUNDARY)
    const blockAcres = multiPolygonAreaAcres(multi)

    const hydricLayer = captured.payload.exclusion_layers.filter((layer) => layer.type === 'hydric')
    const grounds = exclusionGrounds(hydricLayer)

    // What the clip actually finds, with the floor taken out of the way.
    const raw = polygonClipping.intersection(multi, toMultiPolygon(grounds[0].geometry_wgs84))
    const rawAcres = multiPolygonAreaAcres(raw)
    const rawPct = (rawAcres / blockAcres) * 100

    expect(rawAcres).toBeGreaterThan(0)
    expect(rawAcres).toBeLessThan(CAUTION_MIN_ACRES)
    // A share no percentage floor worth having would drop.
    expect(rawPct).toBeGreaterThan(5)

    // AND IT DOES NOT RENDER. Not as a percentage, not as an acreage, not at
    // all -- and the server dropped it too, which is the agreement the floor
    // being one constant on both sides buys.
    expect(cautionsFor(multi, grounds)).toEqual([])
    expect(captured.graze.recorded_crossings.map((c) => c.type)).not.toContain('hydric')

    // eslint-disable-next-line no-console
    console.log(
      `FLOOR  the graze block is ${blockAcres.toFixed(3)} ac and touches hydric over ` +
        `${rawAcres.toFixed(4)} ac -- ${rawPct.toFixed(1)}% of it, and still under the ` +
        `${CAUTION_MIN_ACRES} acre floor, so neither the panel nor the document carries it`
    )
  })

  for (const key of ['hydric', 'graze']) {
    it(`agrees with the server for the ${key} zone, including the floor`, () => {
      const captured_ = captured[key]
      const ring = captured_.feature.geometry.coordinates[0].map(([lng, lat]) => [lat, lng])
      const { multi } = clampToBoundary(ring, BOUNDARY)
      const client = cautionsFor(multi, exclusionGrounds(captured.payload.exclusion_layers))
      const server = captured_.recorded_crossings

      // THE SAME GATES, NAMED THE SAME WAY. This is the assertion that matters:
      // an acreage that differs by a projection is a difference of measurement;
      // a gate one side reports and the other does not is a difference of fact.
      expect(client.map((c) => c.type)).toEqual(server.map((c) => c.type))
      expect(client.map((c) => c.label)).toEqual(server.map((c) => c.label))

      // The figures agree to within the projection difference: the client
      // measures in lon/lat with a cosine-latitude scale, the server in the
      // DEM's own UTM metres, and the server rounds to two places.
      for (let i = 0; i < server.length; i++) {
        expect(Math.abs(client[i].acres - server[i].acres)).toBeLessThanOrEqual(
          0.02 + 0.02 * client[i].acres
        )
      }

      // THE FLOOR IS THE SAME CONSTANT ON BOTH SIDES, and it has to be: a
      // crossing the client dropped and the server recorded would put a
      // caution in the document the user was never shown.
      expect(CAUTION_MIN_ACRES).toBe(0.05)
      for (const caution of client) expect(caution.acres).toBeGreaterThanOrEqual(CAUTION_MIN_ACRES)

      // THE PANEL'S PERCENTAGE AND THE DOCUMENT'S ACREAGE DESCRIBE ONE
      // CROSSING, and this is the assertion that says so. The panel prints a
      // share of the drawn block; the commit records an acreage; multiplying
      // the share by the block's own acreage has to give the acreage back, or
      // the two surfaces are describing different ground.
      //
      // THE CONVERSION HAPPENS IN ONE PLACE -- cautionsFor(), beside the clip
      // it divides -- so what is checked here is that ONE division, against
      // the server's own figure for the same crossing.
      const blockAcres = multiPolygonAreaAcres(multi)
      for (let i = 0; i < server.length; i++) {
        const fromShare = (client[i].pct / 100) * blockAcres
        expect(fromShare).toBeCloseTo(client[i].acres, 6)
        expect(Math.abs(fromShare - server[i].acres)).toBeLessThanOrEqual(
          0.02 + 0.02 * client[i].acres
        )
      }

      // eslint-disable-next-line no-console
      console.log(
        `SHARE[${key}]  block ${blockAcres.toFixed(3)} ac; ` +
          client
            .map(
              (c) =>
                `${c.type} ${c.acres.toFixed(4)} ac = ${c.pct.toFixed(1)}% of the block ` +
                `(document records ${server.find((r) => r.type === c.type).acres} ac)`
            )
            .join('; ')
      )

      // AND WHAT BOTH DROPPED. Every available gate this zone touches at all,
      // with the sub-floor ones named, so the silence is visible rather than
      // assumed.
      const perGate = captured.payload.exclusion_layers
        .filter((layer) => layer.data_available && layer.geometry_wgs84)
        .map((layer) => {
          const hit = cautionsFor(multi, exclusionGrounds([layer]))
          return `${layer.type}=${hit.length ? hit[0].acres.toFixed(4) : 'below-floor'}`
        })
      console.log(
        `AGREEMENT[${key}]  server ${JSON.stringify(server.map((c) => [c.type, c.acres]))}` +
          `  client ${JSON.stringify(client.map((c) => [c.type, Number(c.acres.toFixed(4))]))}` +
          `  per-gate ${perGate.join(' ')}`
      )
    })
  }
})

/* ===========================================================================
   6. A 422 RENDERS PER FEATURE
   =========================================================================== */

describe('6. a 422 rejection', () => {
  liveIt('names the offending feature, in the instruction bar and on the map', async () => {
    const ui = await renderApp()
    await throughGenerate(ui)

    // A DRAWN ZONE THE SERVER WILL REFUSE. The map's own gesture clamps, so
    // this goes into the draft directly -- an off-parcel shape is exactly what
    // the clamp exists to prevent, and the 422 path has to be reachable
    // anyway: another client, an older build, or a boundary that moved.
    const offending = {
      type: 'Feature',
      id: 'drawn-off-parcel',
      geometry: {
        type: 'Polygon',
        coordinates: [[...rings.off, rings.off[0]]],
      },
      properties: {
        layer: PRODUCTION_AREA_LAYER,
        label: 'Drawn zone',
        confidence: 'low',
        confidence_notes: 'Drawn by hand on the map; no survey backs it.',
        acres: 0.7,
        cautions: [],
      },
    }
    await ui.run((a) => a.addDrawnFeature('landform', offending))
    await ui.click('commit-landform')
    await ui.waitFor(
      'the 422 to come back',
      () => ui.state.steps.landform.error?.kind === 'rejected'
    )

    // NOT COMMITTED, and nothing was written.
    expect(selectStepStatus(ui.state, 'landform')).toBe(GENERATED)

    // PER FEATURE, IN THE INSTRUCTION BAR: the offending id carries the
    // server's own reason. Never collapsed into a count.
    expect(ui.text('rejection-drawn-off-parcel')).toContain('outside the parcel boundary')
    // The proposals in the same commit are NOT named.
    const proposalIds = ui.state.steps.landform.proposals.suggested_zones.features.map((f) => f.id)
    for (const id of proposalIds) expect(ui.find(`rejection-${id}`)).toBeNull()

    // AND ON THE MAP: the offending feature is identifiable, drawn in the
    // rejected treatment rather than the drawn one, with the reason on it.
    const drawnPane = ui.container.querySelector('.leaflet-landform--landform-drawn-pane')
    const rejected = [...drawnPane.querySelectorAll('path.zone--rejected')]
    expect(rejected.length).toBeGreaterThan(0)
    // THE REJECTED SHAPE IS NOT DRAWN AS A BLOCK. It said `zone--drawn` here
    // when a drawn block still had an outline of its own; a block takes the
    // production mark now, drawn or suggested, so what separates a refused
    // shape from an accepted one is this class and only this class.
    expect(drawnPane.querySelectorAll('path.zone--production')).toHaveLength(0)
    expect(ui.container.querySelector('.leaflet-tooltip')?.textContent ?? '').toContain(
      'outside the parcel boundary'
    )

    console.log(
      'REJECTION: ' +
        JSON.stringify(ui.state.steps.landform.error.rejections.map((r) => [r.feature_id, r.code]))
    )
    await ui.unmount()
  })
})

/* ===========================================================================
   7. AN EMPTY COMMIT
   =========================================================================== */

describe('7. an empty commit', () => {
  liveIt('is an explicit action, and it succeeds', async () => {
    const ui = await renderApp()
    await throughGenerate(ui)

    const proposalIds = ui.state.steps.landform.proposals.suggested_zones.features.map((f) => f.id)
    for (const id of proposalIds) await ui.toggle(id)
    expect(selectDraft(ui.state, 'landform').selectedFeatureIds).toEqual([])

    // THE BUTTON SAYS WHAT IT WOULD DO. Nothing is submitted silently: with
    // nothing selected the commit is offered under its own name, and a user
    // who has taken everything out has to press that rather than the ordinary
    // one.
    // "no blocks", not "no zones": the strip and the panel call a production
    // zone a Block and the button follows them. This assertion still read
    // 'no zones' after that rename -- it only runs against a live backend, so
    // it went unseen -- and it is corrected here rather than left red.
    expect(ui.find('commit-landform').textContent).toContain('no blocks')
    expect(ui.find('commit-landform').disabled).toBe(false)

    await ui.click('commit-landform')
    await ui.waitFor(
      'the commit to land',
      () => selectStepStatus(ui.state, 'landform') === COMMITTED
    )
    // Zero features, as a DECISION: "no production ground here", which the
    // steps downstream receive as an answer rather than as an absence.
    expect(selectStepFeatures(ui.state, 'landform').features).toEqual([])

    await ui.unmount()
  })
})

/* ===========================================================================
   8. REOPEN
   =========================================================================== */

describe('8. reopen', () => {
  liveIt('restores the proposals with the prior selection and the drawn zones', async () => {
    const ui = await renderApp()
    await throughGenerate(ui)

    const proposalIds = ui.state.steps.landform.proposals.suggested_zones.features.map((f) => f.id)
    const dropped = proposalIds[0]
    await ui.toggle(dropped)
    await drawZone(ui, HYDRIC_RING)
    const drawnAcres = selectDraft(ui.state, 'landform').drawnFeatures[0].properties.acres
    await ui.click('commit-landform')
    await ui.waitFor(
      'the commit to land',
      () => selectStepStatus(ui.state, 'landform') === COMMITTED
    )

    // THE COMMIT MOVED THE WIZARD ON, with nothing clicked to make it -- there
    // is no "Next step" button in this shell. Reopening means navigating back,
    // which is what the step rail is for.
    expect(ui.cursor.cursorStepId).not.toBe('landform')
    await ui.open('landform')

    // THE CONFIRMATION NAMES ONLY DOWNSTREAM STEPS HOLDING WORK. Nothing after
    // landform has been reached, so it says so rather than listing five steps
    // the user has never seen.
    await ui.click('edit-landform')
    expect(ui.text('reopen-resets-landform')).toContain('No later step holds work')
    await ui.click('reopen-confirm-yes-landform')
    await ui.waitFor(
      'the reopen and the layers refetch to land',
      () =>
        selectStepStatus(ui.state, 'landform') === GENERATED &&
        ui.state.steps.landform.proposals != null &&
        ui.state.drafts.landform !== undefined
    )

    // THE SELECTION CAME BACK, off the document, against a regenerated
    // candidate set. Proposal ids are stable across regenerates -- the backend
    // asserts it across a cache eviction -- which is the whole reason this can
    // be a lookup rather than a stored copy.
    const draft = selectDraft(ui.state, 'landform')
    // AND THE DRAWN ZONE, whole. It was never a proposal, so a regenerate has
    // nothing to say about it: it comes back from the document directly.
    expect(draft.drawnFeatures).toHaveLength(1)
    const restoredDrawnId = draft.drawnFeatures[0].id

    // THE SELECTION COVERS BOTH KINDS. `selectedFeatureIds` is what a commit
    // body is assembled from and it names every feature in the draft, not just
    // the proposals -- that is what lets the tab strip's box take a drawn zone
    // out of the commit without destroying it. So a reopen restores the
    // proposals the user kept AND puts the drawn zone back checked; a drawn
    // shape missing from the set would come back invisible and uncommittable.
    expect(new Set(draft.selectedFeatureIds)).toEqual(
      new Set([...proposalIds.filter((id) => id !== dropped), restoredDrawnId])
    )
    expect(draft.drawnFeatures[0].properties.exclusion_crossings.map((c) => c.type)).toContain(
      'hydric'
    )

    console.log(
      `REOPEN: ${draft.selectedFeatureIds.length} selection(s) restored, ` +
        `1 drawn zone (${drawnAcres.toFixed(2)} ac drawn) back from the document`
    )
    await ui.unmount()
  })
})

/* ===========================================================================
   9. RESUME MID-STEP
   =========================================================================== */

describe('9. resume', () => {
  liveIt('reloads into a generated-but-uncommitted landform and lands in the right state', async () => {
    const first = await renderApp()
    await throughGenerate(first)
    const sessionId = first.state.sessionId
    await first.unmount()

    // A SECOND CLIENT, sharing only the session id -- a reload, a different
    // tab, a bookmark. The document alone says where the wizard is.
    const ui = await renderApp()
    await ui.run((a) => a.resume(sessionId))
    await ui.waitFor(
      'the resumed document',
      () => selectStepStatus(ui.state, 'landform') === GENERATED
    )

    // The cursor is on landform: boundary committed, landform is next.
    expect(ui.cursor.cursorStepId).toBe('landform')

    // AND THE PROPOSALS COME BACK WITHOUT REGENERATING AND WITHOUT BEING
    // ASKED FOR -- GET .../layers, the same endpoint a reopen uses. The step
    // opens on the recommendation again, because nothing was committed to
    // restore instead.
    //
    // THIS TEST USED TO MAKE THE CALL ITSELF, and that line was the bug
    // hiding. `await ui.run((a) => a.loadLayers('landform'))` stood here, so
    // the suite proved the ENDPOINT worked and never asked whether anything
    // in the app reached it -- nothing did. A resumed step arrived
    // `generated` with no proposals, which deriveMachineState reads as
    // REVIEWING: a bar telling you to review, a strip with nothing in it, and
    // a commit button offering to record an empty decision. The machine
    // fetches now (useStepMachine), so the call is gone from here and its
    // absence is the assertion.
    await ui.waitFor(
      'the proposals to arrive on their own',
      () => ui.state.steps.landform?.proposals != null
    )
    await ui.waitFor('the draft to be seeded', () => ui.state.drafts.landform !== undefined)
    const proposalIds = ui.state.steps.landform.proposals.suggested_zones.features.map((f) => f.id)
    expect(new Set(selectDraft(ui.state, 'landform').selectedFeatureIds)).toEqual(
      new Set(proposalIds)
    )
    expect(ui.find('step-landform').dataset.stepState).toBe('reviewing')

    await ui.unmount()
  })
})

/* ===========================================================================
   10. THE PDF PATH
   =========================================================================== */

describe('10. the PDF path', () => {
  /**
   * NOTHING IN THE FRONTEND CALLS THIS ANY MORE, AND THAT IS THIS BRANCH'S
   * DOING. `/api/generate-report-pdf` requires an access point; the access
   * point was collected by a pre-step in the boundary flow, and that pre-step
   * is deleted -- it is not a global concern, it is an input of the ROADS
   * step, which will declare it as one. So the button is gone and no code path
   * on the page reaches this route. Accepted and intentional: the report path
   * gets its own revamp after the interactive work, off the Design Document
   * rather than off a raw ring. See map.test.jsx section 8, which asserts the
   * page makes no such request.
   *
   * WHAT THIS SECTION STILL TESTS, AND WHY IT IS WORTH TESTING. The ENDPOINT
   * is untouched -- no backend file changed on this branch -- and the
   * committed boundary is still a valid input to it: the same [lon, lat] ring
   * in the same order. That is the fact the revamp will build on, so it is
   * asserted directly against the running server rather than through a UI that
   * no longer offers it. `/api/generate-report-pdf` reads neither the session
   * nor the Design Document; it takes a boundary and an access point on the
   * wire and runs generate_full_report() over them.
   *
   * WHAT IT CANNOT ASSERT HERE, AND WHY. The full report fetches USGS 3DEP
   * elevation, SSURGO soils, hydrology, climate and imagery live. This
   * sandbox's egress proxy refuses those hosts (403 on CONNECT), so the run
   * fails inside the elevation fetch with a ProxyError. That is the
   * environment, not the endpoint: the failure names an upstream data source
   * and arrives well past request validation, and the same request against a
   * host with network reaches the report. Asserted BELOW rather than skipped,
   * so this says out loud what it did and did not prove.
   */
  liveIt('is unreachable from the page, and still takes the committed boundary', async () => {
    const ui = await renderApp()
    await throughGenerate(ui)
    const boundaryOnTheWire = ui.state.document.boundary

    // NO AFFORDANCE REACHES IT. The access-point pre-step is gone, and with it
    // every button that led to a report.
    expect(ui.container.textContent).not.toMatch(/Access Point/i)
    expect(ui.container.textContent).not.toMatch(/Report/i)
    await ui.unmount()

    // The committed boundary is a ring of [lon, lat] pairs -- exactly what
    // this endpoint's own validation requires.
    expect(Array.isArray(boundaryOnTheWire)).toBe(true)
    expect(boundaryOnTheWire.length).toBeGreaterThanOrEqual(3)
    for (const point of boundaryOnTheWire) {
      expect(point).toHaveLength(2)
      expect(Math.abs(point[0])).toBeLessThanOrEqual(180)
      expect(Math.abs(point[1])).toBeLessThanOrEqual(90)
    }

    // ITS VALIDATION IS INTACT: a request with no boundary is still a 400.
    const rejected = await fetch(`${API_URL}/api/generate-report-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(rejected.status).toBe(400)

    // AND THE COMMITTED BOUNDARY GETS PAST IT. Either the report comes back,
    // or it fails inside a data fetch this sandbox cannot make -- never with
    // a 400, which is what a broken input would produce.
    const response = await fetch(`${API_URL}/api/generate-report-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boundary: boundaryOnTheWire,
        access_point: boundaryOnTheWire[0],
      }),
    })
    expect(response.status).not.toBe(400)
    expect(response.status).not.toBe(404)

    if (response.status === 200) {
      expect(response.headers.get('content-type')).toContain('pdf')
      const blob = await response.blob()
      expect(blob.size).toBeGreaterThan(1000)
      console.log(`PDF: 200, ${blob.size} bytes off the committed boundary`)
    } else {
      const body = await response.json()
      // The failure must be an upstream DATA failure, not a request one.
      expect(body.error).toMatch(/nationalmap|sdmdataaccess|overpass|Connection|Proxy|Max retries/i)
      console.log(
        `PDF: reached the pipeline off the committed boundary and failed in a ` +
          `live data fetch this sandbox cannot make -- ${String(body.error).slice(0, 120)}`
      )
    }
  })
})

/* ===========================================================================
   11. THE PAYLOAD, RECONCILED
   =========================================================================== */

describe('11. the step payload carries everything the step reads', () => {
  /**
   * (c) FROM THE RECONCILIATION: is there anything the shipped frontend reads
   * that GET .../layers does not carry? Asserted here rather than reasoned
   * about, against a payload the real backend produced.
   */
  it('carries all six keys the panel and the map read, and two more besides', () => {
    const READ_BY_THE_FRONTEND = [
      'eligible_union',
      'exclusion_layers',
      'scales',
      'suggested_zones',
      'summary',
      'zones',
    ]
    const keys = Object.keys(captured.payload)
    for (const key of READ_BY_THE_FRONTEND) expect(keys).toContain(key)

    // The two the frontend does not read. On the wire deliberately -- `wire`
    // is the parameters the gates were computed with, carried "so a wire
    // consumer can branch on it without parsing the report block";
    // `zones_without_drawn_shape` is a count the assembler says is "reported
    // by the endpoint's caller, not silently absorbed". Asserted so that if
    // either ever starts being read, this list is where it is recorded.
    expect(keys.sort()).toEqual([...READ_BY_THE_FRONTEND, 'wire', 'zones_without_drawn_shape'].sort())

    // THE TWO REPRESENTATIONS JOIN. `zones` is tabular for the panel's list,
    // `suggested_zones.features` is GeoJSON for the map, and `feature_id` is
    // the carried join -- not a template literal the panel rebuilds.
    const featureIds = new Set(captured.payload.suggested_zones.features.map((f) => f.id))
    for (const zone of captured.payload.zones) expect(featureIds.has(zone.feature_id)).toBe(true)

    console.log(`PAYLOAD KEYS: ${keys.sort().join(', ')}`)
  })

  it('puts the caution pane above Leaflet’s markerPane', () => {
    // The one number the band scheme cannot express, and the reason it is
    // chosen in CautionMarkers rather than declared by a step.
    expect(CAUTION_PANE_Z).toBeGreaterThan(600)
    expect(CAUTION_PANE_Z).toBeLessThan(650)
  })

  it('gives a drawn shape the properties the commit contract requires', () => {
    // feature_schema.py refuses a feature missing `layer`, `confidence` or a
    // non-empty `confidence_notes`; the landform commit contract refuses a
    // `layer` that is not production_area_candidate.
    const prepared = LANDFORM_SHAPE.close({
      points: HYDRIC_RING,
      parcel: BOUNDARY,
      references: { 'landform-exclusions': captured.payload.exclusion_layers },
    })
    expect(prepared.feature.properties.layer).toBe(PRODUCTION_AREA_LAYER)
    expect(prepared.feature.properties.confidence).toBe('low')
    expect(prepared.feature.properties.confidence_notes.trim()).not.toBe('')
    expect(prepared.feature.geometry.type).toBe('MultiPolygon')
  })
})


/* ===========================================================================
   12. THE PANEL, AGAINST THE SHARED FORMAT
   ===========================================================================
   ASKED OF THE CAPTURE, NOT OF A HAND-WRITTEN ROW. Everything below reads the
   payload the real backend produced for the reference parcel -- so "soil
   renders an em dash" is a statement about what the pipeline actually ships
   today, not about a null someone typed into a fixture to make the assertion
   pass.

   THE PANEL'S ARRANGEMENT IS MEASURED IN A BROWSER, not here: layout.test.jsx's
   "the shared panel format, in a real engine" reads computed styles and
   rendered boxes, which jsdom has neither of. What is asked here is the half
   that IS data -- which rows, in which order, carrying which values, and where
   the words in them came from.
   =========================================================================== */

describe('12. the panel, against the shared format', () => {
  const HERE = path.dirname(fileURLToPath(import.meta.url))

  /** The step's context, from the captured payload and an empty draft. */
  const context = (drawnFeatures = []) => ({
    proposals: captured.payload,
    draft: { selectedFeatureIds: captured.payload.zones.map((z) => z.feature_id), drawnFeatures },
  })

  /**
   * One block's panel body, composed exactly as DetailPanel composes it.
   *
   * MEMOISED ON THE NO-DRAWN-FEATURES PATH, so two calls for one block hand
   * back the SAME row objects. The rows are frozen values and a fresh
   * composition produces equal-but-distinct ones, which makes `indexOf(row)`
   * -- how the assertions below ask "what comes after this row" -- silently
   * answer -1.
   */
  const bodyCache = new Map()
  function bodyFor(featureId, drawnFeatures = []) {
    if (!drawnFeatures.length && bodyCache.has(featureId)) return bodyCache.get(featureId)
    const ctx = context(drawnFeatures)
    const tab = LANDFORM_STEP.tabs(ctx).find((entry) => entry.id === featureId)
    const detail = LANDFORM_STEP.detail(ctx, featureId)
    const composed = { tab, detail, body: panelBody(tab, detail.rows) }
    if (!drawnFeatures.length) bodyCache.set(featureId, composed)
    return composed
  }

  const TOP = captured.payload.zones[0]

  /**
   * [1] THE ROWS, IN ORDER, WITH THE BREAK WHERE THE FORMAT PUTS IT.
   */
  it('renders the tab’s rows, a break, then the step’s', () => {
    const { body } = bodyFor(TOP.feature_id)
    // THE CONTINUATIONS ARE DROPPED FOR THIS COMPARISON, not because they are
    // not rows but because how many there are is a property of the BLOCK's
    // soil -- one to three, or the single em-dash row -- and this assertion is
    // about the panel's arrangement. The run itself is asked of directly in
    // [5] below.
    expect(
      body.filter((row) => row.kind !== CONTINUATION).map((row) => (row.panelBreak ? '——' : row.label))
    ).toEqual(['acres', '/100 score', '——', 'aspect', 'position', 'median slope %', 'soil', 'drainage'])

    // THE TAB'S ROWS ARE THE TAB'S. Not restated by the step -- `detail.rows`
    // is everything below the break and nothing else, and the panel put the
    // other two there.
    const { detail, tab } = bodyFor(TOP.feature_id)
    expect(detail.rows.filter((row) => row.kind !== CONTINUATION)).toHaveLength(5)

    // THE FIGURES CROSS VERBATIM. Never touched, never reformatted.
    expect(body.slice(0, 2).map((row) => row.value)).toEqual(tab.rows.map((row) => row.value))

    // THE LABELS CROSS VERBATIM EXCEPT FOR THE DENOMINATOR, which is the one
    // thing the panel adds and the strip does not show -- the row declares
    // `denominator: 100`, the tab prints "score", the panel prints "/100
    // score". See panelFormat.denominated().
    expect(tab.rows.map((row) => row.label)).toEqual(['acres', 'score'])
    expect(body.slice(0, 2).map((row) => row.label)).toEqual(['acres', '/100 score'])
    expect(tab.rows[1].denominator).toBe(100)
    // ...AND THE 100 IS THE PAYLOAD'S OWN SCALE CEILING, not a literal.
    expect(tab.rows[1].denominator).toBe(Math.round(captured.payload.scales.range[1]))
    // A row with nothing to be out of declares no denominator and gains none.
    expect(tab.rows[0].denominator).toBeUndefined()

    // THE FIGURES ARE THE PAYLOAD'S, at the pipeline's own one decimal.
    expect(body[0].value).toBe(TOP.area_acres.toFixed(1))
    expect(body[1].value).toBe(TOP.score.toFixed(1))
    expect(body.find((row) => row.label === 'median slope %').value).toBe(
      TOP.slope_median_pct.toFixed(1)
    )

    // eslint-disable-next-line no-console
    console.log(
      `PANEL[${tab.name}]  ` +
        body
          .map((row) => (row.panelBreak ? '│' : `${row.value} ${row.label}`))
          .join('  ')
    )
  })

  /**
   * [3] `aspect_available` FALSE RENDERS AN EM DASH, NOT A VALUE.
   *
   * The reference parcel has relief, so every captured block reports an aspect
   * -- which is why the false case is asked of aspectPhrase() directly, on the
   * captured row with the flag turned off. An aspect_factor of 100.0 cannot be
   * told from "not measured" without the flag, and printing the token anyway
   * would state a fact about the land nobody established.
   */
  it('renders an em dash for an aspect the pipeline did not measure', () => {
    expect(TOP.aspect_available).toBe(true)
    expect(aspectPhrase(TOP)).toBe(`${TOP.dominant_aspect} facing`)

    // A PHRASE, NOT A COMPOUND -- a space, never the hyphen this used to print.
    expect(aspectPhrase(TOP)).not.toContain('-facing')
    expect(aspectPhrase(TOP)).toMatch(/^[a-z]+ facing$/)

    // FLAG FALSE: an em dash, whatever the token beside it says.
    expect(aspectPhrase({ ...TOP, aspect_available: false })).toBe(EM_DASH)
    // AND A MISSING TOKEN IS THE SAME ANSWER on ground with no downhill.
    expect(aspectPhrase({ ...TOP, dominant_aspect: null })).toBe(EM_DASH)

    // ...through the panel, which is where it has to be true.
    const flat = { ...captured.payload, zones: [{ ...TOP, aspect_available: false }] }
    const ctx = { proposals: flat, draft: { selectedFeatureIds: [], drawnFeatures: [] } }
    const rows = LANDFORM_STEP.detail(ctx, TOP.feature_id).rows
    expect(rows.find((row) => row.label === 'aspect').value).toBe(EM_DASH)
  })

  /**
   * [4] `elevation_position` NULL RENDERS AN EM DASH, NEVER A DEFAULT WORD.
   */
  it('renders the backend’s position word, and an em dash when it sent none', () => {
    const { body } = bodyFor(TOP.feature_id)
    const position = body.find((row) => row.label === 'position')
    expect(position.value).toBe(TOP.elevation_position)
    // THE BACKEND'S OWN WORD, checked against its own published bands rather
    // than against a string typed here. The payload ships them under
    // scales.elevation_position precisely so a consumer can do this.
    const bands = captured.payload.scales.elevation_position.bands
    expect(Object.keys(bands)).toContain(position.value)
    const [low, high] = bands[position.value]
    expect(TOP.elevation_percentile_of_parcel).toBeGreaterThanOrEqual(low)
    expect(TOP.elevation_percentile_of_parcel).toBeLessThanOrEqual(high)

    // NULL -- a parcel with no relief at all, where "upper" and "lower"
    // describe nothing. An em dash, never the band a percentile would have
    // fallen in, because there is no percentile.
    const flat = {
      ...captured.payload,
      zones: [{ ...TOP, elevation_position: null, elevation_percentile_of_parcel: null }],
    }
    const ctx = { proposals: flat, draft: { selectedFeatureIds: [], drawnFeatures: [] } }
    const rows = LANDFORM_STEP.detail(ctx, TOP.feature_id).rows
    expect(rows.find((row) => row.label === 'position').value).toBe(EM_DASH)
  })

  /**
   * [5] THE SOIL RUN AND THE DRAINAGE ROW, OFF THE WIRE.
   *
   * ASKED OF THE CAPTURE. Every figure below came out of the real pipeline over
   * the real reference parcel, through production_area_ceiling's own
   * attribution -- so "three map units render three rows" is a statement about
   * a payload the backend produced and not about a list typed here.
   *
   * THE PAYLOAD HAS ALL THREE SHAPES ON ONE PARCEL, which is why they can be
   * asked of it rather than of a synthesised zone: one block spans three map
   * units (the cap), one spans a single one, and one sits on ground with no
   * soil survey under it at all.
   */
  /** The published soil rows of one block's panel: the labelled row and its continuations. */
  function soilRun(featureId) {
    const { body } = bodyFor(featureId)
    const start = body.findIndex((row) => row.label === 'soil')
    if (start < 0) return []
    const run = [body[start]]
    for (let i = start + 1; i < body.length && body[i].kind === CONTINUATION; i += 1) run.push(body[i])
    return run
  }

  const drainageOf = (featureId) =>
    bodyFor(featureId).body.find((row) => row.label === 'drainage')

  /** Which block is which shape, read off the payload rather than assumed. */
  const withSoil = (n) =>
    captured.payload.zones.filter((z) => (z.soil_components ?? []).length === n)
  const withoutSoil = captured.payload.zones.filter((z) => z.soil_components == null)

  it('renders one soil row plus drainage for a block on a single map unit', () => {
    const [single] = withSoil(1)
    expect(single, 'the capture must contain a one-map-unit block').toBeDefined()

    const run = soilRun(single.feature_id)
    expect(run).toHaveLength(1)
    expect(run[0].kind).toBe('categorical')
    expect(run[0].label).toBe('soil')
    expect(run[0].value).toBe(single.soil_components[0].label)

    const drainage = drainageOf(single.feature_id)
    expect(drainage.kind).toBe('categorical')
    expect(drainage.value).toBe(single.drainage_class)

    // ONE ROW, THEN THE DRAINAGE ROW -- nothing between them.
    const { body } = bodyFor(single.feature_id)
    expect(body[body.indexOf(run[0]) + 1]).toBe(drainage)

    // eslint-disable-next-line no-console
    console.log(
      `SOIL[Block ${single.rank}]  ${run.map((r) => `"${r.value}" ${r.label ?? '(continued)'}`).join('  ')}` +
        `  "${drainage.value}" ${drainage.label}`
    )
  })

  it('renders three rows for a block on three map units — first labelled, rest not', () => {
    const [three] = withSoil(3)
    expect(three, 'the capture must contain a three-map-unit block').toBeDefined()

    const run = soilRun(three.feature_id)
    expect(run).toHaveLength(3)

    // THE FIRST CARRIES THE LABEL; THE REST CARRY NONE. That is the whole
    // shape -- a labelled row and its continuations, not three labelled rows
    // and not three unlabelled terms.
    expect(run[0].kind).toBe('categorical')
    expect(run[0].label).toBe('soil')
    for (const row of run.slice(1)) {
      expect(row.kind).toBe(CONTINUATION)
      expect(row.label, 'a continuation carries no label').toBeUndefined()
    }

    // IN RANK ORDER, which is the payload's own order and is not re-sorted here.
    expect(run.map((row) => row.value)).toEqual(three.soil_components.map((e) => e.label))
    const shares = three.soil_components.map((e) => e.cell_share_pct)
    expect(shares).toEqual([...shares].sort((a, b) => b - a))

    // ...AND ONE DRAINAGE ROW UNDER THEM, not one per soil.
    const { body } = bodyFor(three.feature_id)
    expect(body.filter((row) => row.label === 'drainage')).toHaveLength(1)
    expect(drainageOf(three.feature_id).value).toBe(three.drainage_class)

    // eslint-disable-next-line no-console
    console.log(
      `SOIL[Block ${three.rank}]  ` +
        run.map((r) => `"${r.value}" ${r.label ?? '(continued)'}`).join('  ') +
        `  "${drainageOf(three.feature_id).value}" drainage`
    )
  })

  /**
   * [5b] THE COMPOSED LABEL IS RENDERED VERBATIM, NOT REBUILT FROM THE PARTS.
   *
   * The backend composes "42% Fixture terrace loam" in the module that holds
   * both halves, precisely so ONE STRING lands in one value cell and no
   * consumer decides how a share is spelled -- it rounds the share half-up to
   * whole percent on purpose, because the arithmetic is exact and the
   * 1:24,000 boundary it measures against is not.
   *
   * ASSERTED TWO WAYS, AND THE SECOND IS THE ONE THAT BITES. The rendered
   * value is the wire's `label` character for character; AND the step's source
   * never reads `cell_share_pct` or `component_name` at all, so it could not
   * be recomposing it. A behavioural check alone would pass on a panel that
   * rebuilt the string and happened to agree today.
   */
  it('renders the backend’s composed label verbatim and never rebuilds it', () => {
    for (const zone of captured.payload.zones) {
      for (const [index, entry] of (zone.soil_components ?? []).entries()) {
        expect(soilRun(zone.feature_id)[index].value).toBe(entry.label)
      }
    }

    // AND THE DISTINCTION IS OBSERVABLE ON THIS PAYLOAD, which is what makes
    // the assertion above worth making: the backend spells the share at whole
    // percent and `cell_share_pct` carries a decimal, so a panel rebuilding
    // the string from the parts would print "42.1% Fixture terrace loam"
    // where the wire says "42% Fixture terrace loam". A capture where every
    // share happened to be a round number would prove nothing here.
    const entries = captured.payload.zones.flatMap((z) => z.soil_components ?? [])
    const naive = entries.filter(
      (entry) => entry.label !== `${entry.cell_share_pct}% ${entry.component_name}`
    )
    expect(naive.length, 'the capture must contain a share the parts spell differently').toBeGreaterThan(0)

    const source = readFileSync(path.join(HERE, 'wizard', 'stepDefinitions.js'), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code, 'the panel must not read the share').not.toContain('cell_share_pct')
    expect(code, 'the panel must not read the component name').not.toContain('component_name')
    expect(code, 'the panel must not read the map unit name').not.toContain('map_unit_name')
    expect(code, 'the panel renders the composed label').toContain('entry.label')
  })

  /**
   * [5c] NOTHING IMPLIES THE LIST IS EXHAUSTIVE.
   *
   * The backend's 10% floor and three-entry cap make the list a NAMING of the
   * soils under a block rather than a partition of it -- it drops the
   * remainder rather than summing it into an "other" entry, and asserts the
   * shares fall short of 100 as part of its own contract. A remainder row, a
   * total, or an "and N more" on this side would be the panel claiming a
   * completeness the data does not have.
   */
  it('adds no remainder row, no total, and nothing that sums the list', () => {
    const [three] = withSoil(3)
    const run = soilRun(three.feature_id)
    const { body } = bodyFor(three.feature_id)

    // THE PAYLOAD'S OWN SHORTFALL IS REAL, so the absence below is a choice
    // and not a case that never arises.
    const published = three.soil_components.reduce((sum, e) => sum + e.cell_share_pct, 0)
    expect(published).toBeLessThan(100)

    // EXACTLY AS MANY ROWS AS THE WIRE CARRIED ENTRIES. No row after them but
    // the drainage row.
    expect(run).toHaveLength(three.soil_components.length)
    expect(body[body.indexOf(run[run.length - 1]) + 1].label).toBe('drainage')
    expect(body[body.indexOf(run[run.length - 1]) + 1]).toBe(drainageOf(three.feature_id))

    // AND NOTHING ANYWHERE IN THE PANEL SAYS "other", "total", or "more".
    const printed = body.map((row) => `${row.value ?? ''} ${row.label ?? ''}`).join(' | ')
    for (const word of ['other', 'total', 'more', 'remainder', '100%']) {
      expect(printed.toLowerCase(), `the panel must not say "${word}"`).not.toContain(word)
    }

    // eslint-disable-next-line no-console
    console.log(
      `SOIL SHARES[Block ${three.rank}]  ${three.soil_components
        .map((e) => `${e.cell_share_pct}%`)
        .join(' + ')} = ${published.toFixed(1)}% of the block, and the panel says nothing about the rest`
    )
  })

  /**
   * [5d] A BLOCK WITH NO SOIL SURVEY UNDER IT RENDERS THE EM-DASH ROWS.
   *
   * The path that shipped before the values landed, still working -- and it is
   * a real case, not a leftover: the reference parcel has a block on ground the
   * survey's map units do not reach.
   */
  it('renders one em-dash soil row and an em-dash drainage row where there is no coverage', () => {
    const [bare] = withoutSoil
    expect(bare, 'the capture must contain a block with no soil coverage').toBeDefined()

    // BOTH NULL TOGETHER, which the backend guarantees -- never one without
    // the other, because they are two readings of one attribution.
    expect(bare.soil_components).toBeNull()
    expect(bare.drainage_class).toBeNull()

    const run = soilRun(bare.feature_id)
    expect(run).toHaveLength(1)
    expect(run[0].kind).toBe('categorical')
    expect(run[0].label).toBe('soil')
    expect(run[0].value).toBe(EM_DASH)
    expect(drainageOf(bare.feature_id).value).toBe(EM_DASH)

    // THE ROW COUNT IS THE ONLY DIFFERENCE. Every other row of this block's
    // panel is the same row, in the same place, as a block that has soil.
    const labelled = (id) =>
      bodyFor(id)
        .body.filter((row) => row.kind !== CONTINUATION)
        .map((row) => (row.panelBreak ? '——' : row.label))
    expect(labelled(bare.feature_id)).toEqual(labelled(withSoil(3)[0].feature_id))

    // eslint-disable-next-line no-console
    console.log(
      `SOIL[Block ${bare.rank}]  "${run[0].value}" soil  "${drainageOf(bare.feature_id).value}" drainage ` +
        `-- no map unit reaches this block`
    )
  })

  /**
   * [5e] ONE DECLARATION, NOT A BRANCH.
   *
   * The two shapes -- a run of one to three, or the single em-dash row -- come
   * out of ONE call to labelledRun(), so the step has no `if` in it and the
   * panel has no second path. Asked of the composer directly, because the
   * claim is about the declaration and not about either outcome.
   */
  it('produces both shapes from one declaration', () => {
    expect(labelledRun([], 'soil').map((r) => [r.kind, r.label, r.value])).toEqual([
      ['categorical', 'soil', EM_DASH],
    ])
    expect(labelledRun(null, 'soil')).toEqual(labelledRun([], 'soil'))
    expect(labelledRun(['a'], 'soil').map((r) => r.kind)).toEqual(['categorical'])
    expect(labelledRun(['a', 'b', 'c'], 'soil').map((r) => r.kind)).toEqual([
      'categorical',
      CONTINUATION,
      CONTINUATION,
    ])
    // A NULL INSIDE THE LIST IS AN EM DASH IN ITS PLACE, never a row removed:
    // dropping it would silently renumber a RANKED list.
    expect(labelledRun(['a', null, 'c'], 'soil').map((r) => r.value)).toEqual(['a', EM_DASH, 'c'])

    // AND THE STEP DECLARES IT ONCE, with no conditional around it.
    const source = readFileSync(path.join(HERE, 'wizard', 'stepDefinitions.js'), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect((code.match(/labelledRun\(/g) ?? [])).toHaveLength(1)
    expect(code).toContain("...labelledRun(")
  })

  /**
   * [5f] NO DRAINAGE VOCABULARY ON THIS SIDE.
   *
   * SSURGO's drainage classes are a fixed seven-class set and the backend
   * republishes whatever the survey says, unmapped. A table of them over here
   * -- a lookup, a prettifier, a default -- would go stale silently against a
   * survey that says something else, and a stale table still renders a word.
   * So this greps, the same way the elevation bands are checked below.
   */
  it('writes none of SSURGO’s seven drainage classes client-side', () => {
    const SSURGO_DRAINAGE_CLASSES = [
      'Excessively drained',
      'Somewhat excessively drained',
      'Well drained',
      'Moderately well drained',
      'Somewhat poorly drained',
      'Poorly drained',
      'Very poorly drained',
    ]
    const files = ['wizard/stepDefinitions.js', 'wizard/shell/panelFormat.js', 'wizard/shell/DetailPanel.jsx']
    for (const file of files) {
      const source = readFileSync(path.join(HERE, file), 'utf8')
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      for (const klass of SSURGO_DRAINAGE_CLASSES) {
        expect(code, `"${klass}" must not be written in ${file}`).not.toContain(klass)
        expect(code, `"${klass}" must not be written in ${file}`).not.toContain(klass.toLowerCase())
      }
    }

    // THE VALUE IS THE WIRE'S, character for character -- not title-cased,
    // not reworded. The panel sets it lower case in CSS, which changes how the
    // survey's words are SET and leaves the words alone.
    for (const zone of captured.payload.zones) {
      if (zone.drainage_class == null) continue
      expect(drainageOf(zone.feature_id).value).toBe(zone.drainage_class)
      expect(SSURGO_DRAINAGE_CLASSES).toContain(zone.drainage_class)
    }

    // eslint-disable-next-line no-console
    console.log(
      `DRAINAGE  off the wire, unmapped: ${[
        ...new Set(captured.payload.zones.map((z) => z.drainage_class).filter(Boolean)),
      ].join(', ')} -- none of the seven class names appears in ${files.length} source files`
    )
  })

  /**
   * [6] NO THRESHOLD AND NO BAND IS WRITTEN CLIENT-SIDE.
   *
   * The bands live on the backend so the tool and the report agree, and the one
   * failure mode that matters is a copy of them over here going stale silently
   * the first time they are retuned -- which no test of behaviour can catch,
   * because a stale copy still renders a word. So this reads the source.
   */
  it('writes no elevation band on this side, and reads the backend’s word', () => {
    const source = readFileSync(path.join(HERE, 'wizard', 'stepDefinitions.js'), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

    // THE BAND WORDS APPEAR NOWHERE IN THE CODE. Not in a table, not in a
    // ternary, not as a default.
    for (const word of Object.keys(captured.payload.scales.elevation_position.bands)) {
      expect(code, `"${word}" must not be written client-side`).not.toContain(word)
    }
    // NOR THE CUTS THEY ARE DRAWN AT.
    for (const [low, high] of Object.values(captured.payload.scales.elevation_position.bands)) {
      for (const edge of [low, high]) {
        if (edge === 0 || edge === 100) continue
        expect(code, `the cut ${edge} must not be written client-side`).not.toContain(String(edge))
      }
    }
    // AND THE PERCENTILE IS NOT READ AT ALL: the word is the wire's, and a
    // panel deriving it from the number would be the second source of truth.
    //
    // READ OFF WHATEVER THE READING IS CALLED. It was `zone.elevation_position`
    // when trees' panel was the only other reader and read a payload row by
    // that name; both panels take a `reading` now -- one builder each, serving
    // a suggestion's row and a drawn feature's properties alike -- so what is
    // asserted is the FIELD being read and the percentile not being.
    const reads = code.match(/\b\w+\.elevation_position\b/g) ?? []
    expect(reads.length, 'every panel with a position row reads the word').toBeGreaterThanOrEqual(3)
    // AND EVERY ONE OF THEM IS A PLAIN FIELD READ off whatever object holds
    // the reading -- landform's and trees' `reading`, structures' `p` -- with
    // nothing derived from the number beside it.
    expect(code).not.toContain('elevation_percentile_of_parcel')
  })

  /**
   * [7] "BLOCK" ON THE TAB AND THE PANEL HEADER, AND NO "Zone" LEFT IN
   * PRODUCTION'S DISPLAY PROSE.
   *
   * THE INTERNAL IDS ARE UNTOUCHED and that is asserted alongside, because the
   * rename would be a real bug if it had reached them: the commit contract, the
   * layer filters and the payload join all spell a block "production-area-N".
   */
  it('calls a block a Block on the tab and in the header, and keeps the ids', () => {
    const ctx = context()
    const tabs = LANDFORM_STEP.tabs(ctx)
    expect(tabs.map((t) => t.name)).toEqual(
      captured.payload.zones.map((zone) => `Block ${zone.rank}`)
    )
    // THE HEADER IS THE TAB'S NAME, through the panel's own rule.
    for (const tab of tabs) {
      expect(bodyFor(tab.id).tab.name).toBe(tab.name)
      expect(LANDFORM_STEP.detail(ctx, tab.id).name).toBe(tab.name)
    }

    // THE IDS ARE THE PAYLOAD'S, UNRENAMED.
    for (const tab of tabs) expect(tab.id).toMatch(/^production-area-\d+$/)

    // NO "Zone" ANYWHERE THE STEP SPEAKS. Every string this definition renders
    // -- tab names, the panel header and its labels, the buttons, the
    // instructions, the notices -- collected and swept. Lower-case "zone" in a
    // sentence ("Draw a zone") is NOT in scope: the rename is of the identity
    // the strip and the panel print, and the wider copy edit is its own change.
    const prose = [
      ...tabs.map((t) => t.name),
      ...tabs.flatMap((t) => t.rows.map((r) => r.label)),
      ...tabs.flatMap((t) => LANDFORM_STEP.detail(ctx, t.id).rows.map((r) => `${r.value} ${r.label}`)),
      ...tabs.map((t) => LANDFORM_STEP.detail(ctx, t.id).name),
      ...Object.values(LANDFORM_STEP.instructions),
      ...Object.values(LANDFORM_STEP.buttons).flat().map((button) => button.label),
      ...LANDFORM_STEP.notices(ctx).map((notice) =>
        Array.isArray(notice.text) ? notice.text.map((p) => (typeof p === 'string' ? p : '')).join('') : notice.text
      ),
    ]
    for (const line of prose) {
      expect(String(line), `"${line}" still says Zone`).not.toMatch(/Zone/)
    }

    // eslint-disable-next-line no-console
    console.log(`BLOCK PROSE  ${tabs.map((t) => `${t.name} (${t.id})`).join(', ')}`)
  })

  /**
   * A DRAWN BLOCK TAKES THE SAME FORMAT -- AND NOW THE SAME ROWS.
   *
   * It used to take fewer, because nothing had measured it: acres, an em-dash
   * score, confidence and source. The server measures the ring now, against
   * the run the suggestions were scored on, so the middle block is the same
   * five rows a suggestion carries and the score is a figure. The header is
   * its tab's -- "Drawn 1", which says WHICH one -- rather than the detail's
   * own fallback.
   */
  const measuredDrawn = (overrides = {}) => ({
    type: 'Feature',
    id: 'drawn-1',
    geometry: { type: 'MultiPolygon', coordinates: [] },
    properties: {
      acres: 0.5,
      confidence: 'low',
      cautions: [],
      // The server's own reading, in the shape a zones row has -- these are
      // the field names measureDrawnBlock() merges (see DRAWN_BLOCK_READING_
      // FIELDS), carrying the values the backend's scorer publishes.
      block_origin: 'user_drawn',
      score: 62.4,
      factors: { slope_factor: 84.1, shape_factor: 67.5, aspect_factor: 41.2, soil_factor: 100.0 },
      slope_median_pct: 3.2,
      dominant_aspect: 'south',
      aspect_available: true,
      soil_components: [{ label: '62% Gilpin silt loam' }],
      drainage_class: 'well drained',
      soil_available: true,
      elevation_position: 'upper field',
      ...overrides,
    },
  })

  it('gives a drawn block exactly the suggested panel', () => {
    const drawn = measuredDrawn()
    const { tab, body } = bodyFor('drawn-1', [drawn])
    expect(tab.name).toBe('Drawn 1')

    // [1] THE FULL MIDDLE SECTION -- the same five readings a suggestion
    // shows, in the same order, off the same builder, AND NOTHING ELSE.
    // A `confidence` row and a `source` row sat under them for one branch; the
    // argument for them is withdrawn and the rows are gone.
    expect(body.map((row) => (row.panelBreak ? '——' : row.label))).toEqual([
      'acres',
      '/100 score',
      '——',
      'aspect',
      'position',
      'median slope %',
      'soil',
      'drainage',
    ])
    const labelled = Object.fromEntries(
      body.filter((row) => row.label).map((row) => [row.label, row.value])
    )
    expect(labelled.aspect).toBe('south facing')
    expect(labelled.position).toBe('upper field')
    expect(labelled['median slope %']).toBe((3.2).toFixed(1))
    expect(labelled.soil).toBe('62% Gilpin silt loam')
    expect(labelled.drainage).toBe('well drained')

    // [2] ITS SCORE RENDERS, in the tab's own row, on the same /100 scale the
    // suggestions are read on.
    expect(body[0].value).toBe((0.5).toFixed(1))
    expect(body[1].value).toBe((62.4).toFixed(1))
    expect(body[1].label).toBe('/100 score')
    expect(tab.rows[1].value).toBe((62.4).toFixed(1))

    // [3] NEITHER `confidence` NOR `source` RENDERS, anywhere in the panel.
    // The FIELDS are still on the feature -- the commit contract requires a
    // confidence and a non-empty confidence_notes on every feature, and the
    // drawn block still authors both -- so this is about what the panel
    // prints, which is the suggested panel and nothing more.
    expect(body.map((row) => row.label)).not.toContain('confidence')
    expect(body.map((row) => row.label)).not.toContain('source')
    expect(body.map((row) => row.value)).not.toContain('drawn by hand')
    expect(drawn.properties.confidence).toBe('low')

    // eslint-disable-next-line no-console
    console.log(
      `PANEL[${tab.name}]  ` +
        body.map((row) => (row.panelBreak ? '│' : `${row.value} ${row.label}`)).join('  ')
    )
  })

  /**
   * [2b] THE EM-DASH PATH IS STILL THERE, and it is now the answer to a
   * DIFFERENT question: not "this was never scored" but "this reading has not
   * arrived" -- the moment between the ring closing and the server answering,
   * and the state a block keeps if the measurement failed. Every row prints
   * its em dash and the panel keeps its shape.
   */
  it('renders an em dash for a drawn block whose reading has not arrived', () => {
    const unmeasured = {
      type: 'Feature',
      id: 'drawn-1',
      geometry: { type: 'MultiPolygon', coordinates: [] },
      properties: { acres: 0.5, confidence: 'low', cautions: [] },
    }
    const { body } = bodyFor('drawn-1', [unmeasured])
    expect(body.map((row) => (row.panelBreak ? '——' : row.label))).toEqual([
      'acres',
      '/100 score',
      '——',
      'aspect',
      'position',
      'median slope %',
      'soil',
      'drainage',
    ])
    expect(body[1].value).toBe(EM_DASH)
    for (const label of ['aspect', 'position', 'median slope %', 'soil', 'drainage']) {
      expect(body.find((row) => row.label === label).value).toBe(EM_DASH)
    }
    // ...and a genuinely absent FACTOR on a measured block still prints one:
    // the aspect flag false is the pipeline saying the ground faces nowhere.
    const flat = bodyFor('drawn-1', [measuredDrawn({ aspect_available: false })])
    expect(flat.body.find((row) => row.label === 'aspect').value).toBe(EM_DASH)
    expect(flat.body.find((row) => row.label === '/100 score').value).toBe((62.4).toFixed(1))
  })
})