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
  PRODUCTION_AREA_LAYER,
  registryProposalFeatures,
} from './wizard/stepDefinitions'
import WizardShell from './wizard/WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './wizard/WizardCursor.jsx'
import MapLayerStack from './map/MapLayerStack.jsx'
import { DrawingProgressProvider } from './map/DrawingProgress.jsx'
import { CAUTION_PANE_Z } from './map/CautionMarkers.jsx'
import { CAUTION_MIN_ACRES, cautionsFor, clampToBoundary } from './zoneGeometry.js'
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
  for (const key of ['hydric', 'graze']) {
    it(`agrees with the server for the ${key} zone, including the floor`, () => {
      const captured_ = captured[key]
      const ring = captured_.feature.geometry.coordinates[0].map(([lng, lat]) => [lat, lng])
      const { multi } = clampToBoundary(ring, BOUNDARY)
      const client = cautionsFor(multi, captured.payload.exclusion_layers)
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

      // AND WHAT BOTH DROPPED. Every available gate this zone touches at all,
      // with the sub-floor ones named, so the silence is visible rather than
      // assumed.
      const perGate = captured.payload.exclusion_layers
        .filter((layer) => layer.data_available && layer.geometry_wgs84)
        .map((layer) => {
          const hit = cautionsFor(multi, [layer])
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
    expect(drawnPane.querySelectorAll('path.zone--drawn')).toHaveLength(0)
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
    expect(ui.find('commit-landform').textContent).toContain('no zones')
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
    // the proposals -- that is what lets the tab strip's eye take a drawn zone
    // out of the commit without destroying it. So a reopen restores the
    // proposals the user kept AND puts the drawn zone back eye-on; a drawn
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
