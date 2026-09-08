/**
 * fencing.test.jsx
 *
 * THE FENCING STEP: the sixth and LAST definition. Three candidate fence
 * types -- water zone, tree zone, boundary -- one tab each, select-only, any
 * number committable. A TAB IS A FENCE TYPE, not a loop: its length is the
 * sum across every loop of the type and committing it commits all of them.
 * The candidate set varies, one to three; a type with nothing to fence gets
 * NO tab, and the payload's `generated` flag says why. The map draws each
 * fence's DISPLAY-ONLY line -- the server's angular-simplified, coincidence-
 * trimmed rendering -- while every length, the commit body and the document
 * use the real geometry. Committing fencing leaves no next step.
 *
 * HOW TO RUN THE END-TO-END SECTIONS:
 *
 *     cd ../keyline-designer && python serve_test_backend.py 5099 &
 *     VITE_API_URL=http://127.0.0.1:5099 npx vitest run src/fencing.test.jsx
 *
 * THE SAME SERVER EVERY OTHER LIVE SUITE DRIVES. SKIPPED, NOT FAILED, WITH
 * NO SERVER -- structures.test.jsx's posture. Every section that needs no
 * server runs either way, over a payload in the backend's own shape
 * (step_orchestrator.build_fencing_payload).
 *
 * Sections (the branch's numbered tests in brackets):
 *   1  [1]  END TO END: five steps committed -> generate -> up to three
 *           tabs -> commit a subset -> the document carries the whole of
 *           each committed type -> the rail is complete with nothing
 *           forward -> reopen -> commit none.
 *   2  [3]  BOUNDARY FENCING ALONE, live: water, trees and structures all
 *           committed empty -> exactly one tab, and two absences named.
 *   3  [2]  A type with nothing to fence renders NO tab, distinguishable
 *           from one that generated nothing -- off the flag, not a key.
 *   4  [3]  Boundary fencing renders with everything else absent (offline).
 *   5  [4]  Tabs are TWO lines.
 *   6  [5]  Fence lines draw the display geometry; lengths come from the
 *           real geometry; the commit sends the real geometry.
 *   7  [6]  Committing a type commits every loop of it.
 *   8  [8]  Completing fencing leaves the rail complete with no forward
 *           action (offline, over a fully committed document).
 *   9  [9]  Real-pointer hit-testing is in wizard/pointer.test.jsx, which
 *           derives its cases from the registry and grew a fencing section.
 *  10       THE SCHEMA: what the definition declares, the mark, the token,
 *           and the sweep. [7] The colour measurements are in
 *           wizard/layout.test.jsx, which renders both candidates.
 */

import { readFileSync, readdirSync } from 'node:fs'
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
  PROVENANCE_GENERATED,
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
  FENCE_DESCRIPTION_PLACEHOLDER,
  FENCE_LINE_LAYER,
  FENCING_STEP,
  GENERATE_BUTTON,
  LAYER_KINDS,
  REOPEN_BUTTON,
  STEP_DEFINITIONS,
  candidateFenceTypes,
  fenceTypeAbsence,
  fenceTypeBlock,
  fenceTypeBlocks,
  fenceTypeOf,
  measure,
  registryProposalFeatures,
  roadNetworks,
} from './wizard/stepDefinitions'
import { MACHINE_STATES, STEP_COMMITTED } from './wizard/useStepMachine.js'
import { resetStepCatalog } from './wizard/stepCatalog.jsx'
import { selectionAfterCheck } from './wizard/shell/TabStrip.jsx'
import WizardShell from './wizard/WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './wizard/WizardCursor.jsx'
import MapLayerStack from './map/MapLayerStack.jsx'
import { resolveLayer } from './map/layerStack.js'
import { StackLayer } from './map/layers.jsx'
import { DrawingProgressProvider } from './map/DrawingProgress.jsx'
import { zoneMark } from './ProductionHatchPattern.jsx'
import { readToken } from './geo.js'
import rings from './fixtures/rings.json'

const SRC = path.dirname(fileURLToPath(import.meta.url))

const toLatLng = (ring) => ring.map(([lng, lat]) => [lat, lng])
/** The reference parcel. */
const BOUNDARY = toLatLng(rings.boundary)

/** roads.test.jsx's surveyed access point A: on the parcel's west edge, and it routes. */
const ACCESS_A = [40.6434533, -79.9836992]

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']
const DISPLAY_LINE = 'display_only_fence_line'

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
   The surface -- structures.test.jsx's harness, with a fencing reading
   --------------------------------------------------------------------------- */

const mounted = []

async function renderApp({ center = BOUNDARY[0], zoom = 17 } = {}) {
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
    get fencing() {
      return session.state.steps.fencing?.proposals ?? null
    },
    find: (id) => container.querySelector(`[data-testid="${id}"]`),
    text: (id) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? null,
    all: (selector) => [...container.querySelectorAll(selector)],
    /** Every fence polyline the map holds, by pane class, with its positions. */
    fencePaths(paneClass) {
      const out = []
      map.eachLayer((layer) => {
        if (!(layer instanceof L.Polyline) || layer instanceof L.Polygon) return
        const className = layer.options.className ?? ''
        if (!className.includes('road--fence') || className.includes('road--casing')) return
        const pane = layer.options.pane ?? ''
        if (paneClass && pane !== paneClass) return
        out.push({ pane, positions: layer.getLatLngs() })
      })
      return out
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
    async focus(id) {
      await React.act(async () => cursor.focusFeature(id))
    },
    async clickMap(latlng) {
      await React.act(async () => map.fire('click', { latlng: L.latLng(...latlng) }))
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
          `  fencing=${selectStepStatus(this.state, 'fencing')} ` +
          `error=${JSON.stringify(this.state.steps.fencing?.error)}`
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
   The live flow up to the fencing step
   --------------------------------------------------------------------------- */

async function generateAndWait(ui, stepId) {
  await ui.click(`generate-${stepId}`)
  await ui.waitFor(`${stepId} to generate`, () => selectStepStatus(ui.state, stepId) === GENERATED)
  await ui.waitFor(`the ${stepId} draft`, () => ui.state.drafts[stepId] !== undefined)
}

async function commitAndWait(ui, stepId) {
  await ui.click(`commit-${stepId}`)
  await ui.waitFor(`${stepId} to commit`, () => selectStepStatus(ui.state, stepId) === COMMITTED)
}

/**
 * Boundary; landform committed whole; water committed with the zones given;
 * one road network from access point A; trees committed whole or empty;
 * structures committed whole or empty. The cursor lands on fencing.
 */
async function throughStructuresCommit(ui, { water = 1, trees = true, structures = true } = {}) {
  await ui.run((a) => a.setDraftInput('boundary', 'ring', BOUNDARY))
  await ui.click('commit-boundary')
  await ui.waitFor('the session to exist', () => Boolean(ui.state.sessionId))

  await generateAndWait(ui, 'landform')
  await commitAndWait(ui, 'landform')

  await generateAndWait(ui, 'water')
  const zones = registryProposalFeatures(ui.state.steps.water.proposals, 'water')
  expect(zones.length).toBeGreaterThan(0)
  await ui.run((a) => a.setSelection('water', zones.slice(0, water).map((f) => f.id)))
  await commitAndWait(ui, 'water')

  expect(ui.cursor.cursorStepId).toBe('roads')
  await ui.click('access-roads')
  await ui.clickMap(ACCESS_A)
  expect(selectDraft(ui.state, 'roads').inputs[ACCESS_POINT_INPUT]).toBeDefined()
  await ui.click('generate-roads')
  await ui.waitFor(
    'a network from A',
    () => roadNetworks(ui.state.steps.roads?.proposals).length === 1 && ui.state.drafts.roads !== undefined
  )
  await commitAndWait(ui, 'roads')

  expect(ui.cursor.cursorStepId).toBe('trees')
  await generateAndWait(ui, 'trees')
  if (!trees) await ui.run((a) => a.setSelection('trees', []))
  await commitAndWait(ui, 'trees')

  expect(ui.cursor.cursorStepId).toBe('structures')
  await generateAndWait(ui, 'structures')
  if (!structures) await ui.run((a) => a.setSelection('structures', []))
  await commitAndWait(ui, 'structures')

  expect(ui.cursor.cursorStepId).toBe('fencing')
  return ui
}

/** Metres along a GeoJSON LineString / MultiLineString, by haversine. */
function metres(geometry) {
  if (!geometry) return 0
  const parts = geometry.type === 'MultiLineString' ? geometry.coordinates : [geometry.coordinates]
  const R = 6371000
  let total = 0
  for (const part of parts) {
    for (let i = 1; i < part.length; i++) {
      const [lng1, lat1] = part[i - 1]
      const [lng2, lat2] = part[i]
      const φ1 = (lat1 * Math.PI) / 180
      const φ2 = (lat2 * Math.PI) / 180
      const dφ = φ2 - φ1
      const dλ = ((lng2 - lng1) * Math.PI) / 180
      const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
      total += 2 * R * Math.asin(Math.sqrt(a))
    }
  }
  return total
}
const feet = (geometry) => metres(geometry) / 0.3048

/** A polyline's positions flattened to [[lat, lng], ...], one part or several. */
function flatten(positions) {
  if (!positions.length) return []
  return Array.isArray(positions[0]) ? positions.flatMap((part) => part.map((p) => [p.lat, p.lng])) : positions.map((p) => [p.lat, p.lng])
}
const coordsOf = (geometry) =>
  (geometry.type === 'MultiLineString' ? geometry.coordinates.flat() : geometry.coordinates).map(([lng, lat]) => [lat, lng])

/* ===========================================================================
   1. END TO END
   =========================================================================== */

describe('1. end to end against the real backend', () => {
  liveIt(
    'generates over the five commits, offers one tab per candidate type, commits a subset whole, completes the rail with nothing forward, reopens, and commits none',
    async () => {
      const ui = await renderApp()
      await throughStructuresCommit(ui)

      // THE STEP OPENS EMPTY: nothing generated, nothing armed, one button,
      // and no tool at all -- fencing is select-only.
      expect(ui.fencing).toBeNull()
      expect(ui.cursor.armed).toBeNull()
      expect(ui.all('[data-tab-id]')).toHaveLength(0)
      expect(ui.text('generate-fencing')).toBe('Generate fencing')
      expect(ui.find('commit-fencing')).toBeNull()
      expect(ui.cursor.tools).toEqual(['select'])

      await generateAndWait(ui, 'fencing')

      // THE PAYLOAD IS THE BACKEND'S OWN SHAPE, exactly (test_fencing_step.py
      // asserts the same four keys), and every type is listed with its flag.
      expect(Object.keys(ui.fencing).sort()).toEqual(['candidate_fence_types', 'fence_lines', 'fence_types', 'summary'])
      expect(ui.fencing).not.toHaveProperty('crossing_grounds')
      expect(fenceTypeBlocks(ui.fencing).map((b) => b.fence_type)).toEqual(['boundary', 'water_zone_exclusion', 'tree_zone_exclusion'])
      for (const block of fenceTypeBlocks(ui.fencing)) {
        expect(typeof block.generated).toBe('boolean')
        expect(typeof block.candidate).toBe('boolean')
      }

      // [1] UP TO THREE TABS, one per CANDIDATE type -- the fixture yields all
      // three -- every one checked, none removable, each carrying the
      // whole type's feature ids.
      const candidates = candidateFenceTypes(ui.fencing)
      expect(candidates.length).toBeGreaterThanOrEqual(1)
      expect(candidates.length).toBeLessThanOrEqual(3)
      expect(candidates.map((b) => b.fence_type)).toEqual(ui.fencing.candidate_fence_types)
      expect(ui.all('[data-tab-id]').map((li) => li.dataset.tabId)).toEqual(candidates.map((b) => b.fence_type))
      const features = registryProposalFeatures(ui.fencing, 'fencing')
      const byType = (type) => features.filter((f) => fenceTypeOf(f) === type)
      for (const block of candidates) {
        const tab = ui.find(`tab-${block.fence_type}`)
        expect(tab.dataset.checked).toBe('true')
        expect(ui.find(`tab-remove-${block.fence_type}`)).toBeNull()
        expect(tab.classList.contains('chrome-tab--drawn')).toBe(false)
        expect(block.feature_ids.sort()).toEqual(byType(block.fence_type).map((f) => f.id).sort())
        expect(block.feature_ids.length).toBe(block.feature_count)
        // [4] TWO LINES: the type and its length, and nothing else.
        expect(tab.querySelector('.chrome-tab__name').textContent).toBe(block.label)
        expect(tab.querySelectorAll('.chrome-tab__value')).toHaveLength(1)
        expect(tab.querySelectorAll('.chrome-tab__label')).toHaveLength(1)
        expect(tab.querySelector('.chrome-tab__value').textContent).toBe(measure(block.total_length_ft, 0))
        expect(tab.querySelector('.chrome-tab__label').textContent).toBe('feet')
      }
      expect(selectDraft(ui.state, 'fencing').selectedFeatureIds.sort()).toEqual(features.map((f) => f.id).sort())

      // [5] THE MAP DRAWS THE DISPLAY LINE. Every fence feature carries it;
      // each drawn polyline's positions are the display line's coordinates,
      // not the ring's; a feature whose line is null draws nothing.
      for (const feature of features) {
        expect(feature.properties).toHaveProperty(DISPLAY_LINE)
      }
      const drawable = features.filter((f) => f.properties[DISPLAY_LINE] != null)
      expect(drawable.length).toBeGreaterThan(0)
      const candidatePane = 'fencing--fencing-candidates'
      const drawn = ui.fencePaths(candidatePane)
      expect(drawn).toHaveLength(drawable.length)
      const drawnKeys = new Set(drawn.map((d) => JSON.stringify(flatten(d.positions))))
      let trimmedSomewhere = false
      for (const feature of drawable) {
        const display = feature.properties[DISPLAY_LINE]
        expect(drawnKeys.has(JSON.stringify(coordsOf(display)))).toBe(true)
        if (JSON.stringify(coordsOf(display)) !== JSON.stringify(coordsOf(feature.geometry))) trimmedSomewhere = true
      }
      expect(trimmedSomewhere, 'the display line differs from the ring somewhere').toBe(true)
      // AND EVERY DRAWN LINE HAS ITS CASING UNDER IT.
      expect(ui.all(`.leaflet-${candidatePane}-pane path.road--casing`)).toHaveLength(drawable.length)
      expect(ui.all(`.leaflet-${candidatePane}-pane path.road--fence:not(.road--casing)`)).toHaveLength(drawable.length)

      // [5] LENGTHS COME FROM THE REAL GEOMETRY. The tab's number is the
      // backend's sum over the real rings, which a haversine over the raw
      // geometry reproduces; the display line is SHORTER where the trim
      // bit, so a tab reading the display field would show a smaller number.
      let disagreements = 0
      for (const block of candidates) {
        const realFt = byType(block.fence_type).reduce((sum, f) => sum + feet(f.geometry), 0)
        const displayFt = byType(block.fence_type).reduce((sum, f) => sum + feet(f.properties[DISPLAY_LINE]), 0)
        expect(Math.abs(realFt - block.total_length_ft) / block.total_length_ft).toBeLessThan(0.01)
        if (displayFt < 0.99 * realFt) disagreements += 1
      }
      expect(disagreements, 'a trimmed type reports a longer length than it draws').toBeGreaterThan(0)

      // THE PANEL: length, and the placeholder.
      await ui.click('tab-focus-boundary')
      expect(ui.text('detail-name-fencing')).toBe(candidates.find((b) => b.fence_type === 'boundary').label)
      expect(ui.text('detail-value-feet')).toBe(measure(candidates.find((b) => b.fence_type === 'boundary').total_length_ft, 0))
      expect(ui.text('detail-value-description')).toBe(FENCE_DESCRIPTION_PLACEHOLDER)
      expect(ui.find('detail-cautions-fencing')).toBeNull()
      await ui.click('tab-focus-boundary')

      // [6] UN-TICK ONE TYPE: every loop of it leaves the selection, the
      // commit body, and the map -- and only those.
      const dropped = candidates.find((b) => b.fence_type !== 'boundary') ?? candidates[0]
      const kept = candidates.filter((b) => b !== dropped)
      await ui.click(`tab-check-${dropped.fence_type}`)
      expect(ui.find(`tab-${dropped.fence_type}`).dataset.checked).toBe('false')
      const selected = selectDraft(ui.state, 'fencing').selectedFeatureIds
      for (const id of dropped.feature_ids) expect(selected).not.toContain(id)
      for (const block of kept) for (const id of block.feature_ids) expect(selected).toContain(id)
      const body = buildCommitBody(ui.state, 'fencing', registryProposalFeatures)
      expect(body.features.features.map((f) => f.id).sort()).toEqual(kept.flatMap((b) => b.feature_ids).sort())
      // THE COMMIT SENDS THE REAL GEOMETRY, the display line riding along as
      // a property and nothing more.
      for (const sent of body.features.features) {
        const source = features.find((f) => f.id === sent.id)
        expect(sent.geometry).toEqual(source.geometry)
      }
      expect(ui.fencePaths(candidatePane)).toHaveLength(
        kept.flatMap((b) => byType(b.fence_type)).filter((f) => f.properties[DISPLAY_LINE] != null).length
      )

      // COMMIT THE SUBSET. The document carries the WHOLE of each committed
      // type and nothing of the dropped one.
      expect(ui.text('commit-fencing')).toBe('Commit fencing')
      await commitAndWait(ui, 'fencing')
      const committed = selectStepFeatures(ui.state, 'fencing').features
      const provenance = selectStepProvenance(ui.state, 'fencing')
      expect(committed.map((f) => f.id).sort()).toEqual(kept.flatMap((b) => b.feature_ids).sort())
      for (const block of kept) {
        expect(committed.filter((f) => fenceTypeOf(f) === block.fence_type)).toHaveLength(block.feature_count)
      }
      expect(committed.filter((f) => fenceTypeOf(f) === dropped.fence_type)).toHaveLength(0)
      for (const f of committed) expect(provenance[f.id]).toBe(PROVENANCE_GENERATED)

      // [8] THE END OF THE FLOW. Nothing is uncommitted, so the cursor stays
      // on fencing -- the last step, committed. The rail reads 'done' on
      // every row; the banner offers the way back in and NOTHING forward:
      // no generate, no commit, no primary button, no invented terminal.
      expect(ui.cursor.cursorStepId).toBe('fencing')
      expect(ui.cursor.order).toEqual(['boundary', ...STEP_ORDER])
      for (const stepId of ui.cursor.order) {
        expect(ui.find(`rail-${stepId}`).querySelector('.chrome-rail__status').textContent, stepId).toBe('done')
      }
      expect(ui.all('[data-tab-id]')).toHaveLength(0)
      expect(ui.find('generate-fencing')).toBeNull()
      expect(ui.find('commit-fencing')).toBeNull()
      const actions = ui.find('actions-fencing')
      expect([...actions.querySelectorAll('button')].map((b) => b.dataset.testid)).toEqual(['edit-fencing'])
      expect(actions.querySelector('[data-tone="primary"]')).toBeNull()
      expect(ui.text('edit-fencing')).toBe('Edit this step')
      expect(ui.find('direction-fencing')?.textContent ?? ui.container.querySelector('.chrome-bar__direction').textContent).toContain('last step')
      // THE COMMITTED BAND DRAWS THE COMMITTED TYPES, at the fence mark.
      const committedDrawable = committed.filter((f) => f.properties[DISPLAY_LINE] != null)
      expect(ui.fencePaths('fencing--fencing-committed')).toHaveLength(committedDrawable.length)
      expect(ui.fencePaths(candidatePane)).toHaveLength(0)

      // REOPEN: the tabs come home seeded from the document -- the committed
      // types checked, the dropped one not -- and committing none is legal.
      await ui.click('edit-fencing')
      await ui.click('reopen-confirm-yes-fencing')
      await ui.waitFor('fencing to reopen', () => selectStepStatus(ui.state, 'fencing') === GENERATED)
      await ui.waitFor('the fencing draft', () => ui.state.drafts.fencing !== undefined)
      expect(ui.all('[data-tab-id]').map((li) => li.dataset.tabId)).toEqual(candidates.map((b) => b.fence_type))
      for (const block of kept) expect(ui.find(`tab-${block.fence_type}`).dataset.checked).toBe('true')
      expect(ui.find(`tab-${dropped.fence_type}`).dataset.checked).toBe('false')
      for (const block of kept) await ui.click(`tab-check-${block.fence_type}`)
      expect(selectDraft(ui.state, 'fencing').selectedFeatureIds).toEqual([])
      expect(ui.text('commit-fencing')).toBe('Commit no fencing')
      await commitAndWait(ui, 'fencing')
      expect(selectStepFeatures(ui.state, 'fencing').features).toEqual([])
      expect(ui.cursor.cursorStepId).toBe('fencing')
      expect([...ui.find('actions-fencing').querySelectorAll('button')].map((b) => b.dataset.testid)).toEqual(['edit-fencing'])

      console.log(
        `FENCING LIVE: ${candidates.length} candidate type(s) ${JSON.stringify(candidates.map((b) => [b.fence_type, b.total_length_ft, b.loop_count]))}; ` +
          `${drawable.length} of ${features.length} fence line(s) drawable; committed ${kept.map((b) => b.fence_type).join('+')}, dropped ${dropped.fence_type}; ` +
          `rail complete, banner ['edit-fencing'] only.`
      )
      await ui.unmount()
    }
  )
})

/* ===========================================================================
   2. BOUNDARY FENCING ALONE, LIVE
   =========================================================================== */

describe('2. boundary fencing alone, against the real backend', () => {
  liveIt('renders exactly one tab when water, trees and structures are committed empty, and names the two absences', async () => {
    const ui = await renderApp()
    await throughStructuresCommit(ui, { water: 0, trees: false, structures: false })
    await generateAndWait(ui, 'fencing')

    const blocks = Object.fromEntries(fenceTypeBlocks(ui.fencing).map((b) => [b.fence_type, b]))
    expect(ui.fencing.candidate_fence_types).toEqual(['boundary'])
    expect(blocks.boundary.candidate).toBe(true)
    expect(blocks.boundary.generated).toBe(true)
    // NOT GENERATED -- there was nothing to fence -- and the reason says so.
    expect(blocks.water_zone_exclusion.generated).toBe(false)
    expect(blocks.tree_zone_exclusion.generated).toBe(false)
    expect(fenceTypeAbsence(blocks.water_zone_exclusion)).toBe('nothing_to_fence')
    expect(fenceTypeAbsence(blocks.tree_zone_exclusion)).toBe('nothing_to_fence')

    // ONE TAB, and it is the boundary; the bar names the two types that have
    // none, in the backend's own words.
    expect(ui.all('[data-tab-id]').map((li) => li.dataset.tabId)).toEqual(['boundary'])
    expect(ui.find('tab-boundary').dataset.checked).toBe('true')
    for (const type of ['water_zone_exclusion', 'tree_zone_exclusion']) {
      const notice = ui.find(`notice-nothing_to_fence-${type}-fencing`)
      expect(notice, `${type} absence is named`).not.toBeNull()
      expect(notice.textContent).toContain('nothing to fence')
      expect(notice.textContent).toContain(blocks[type].reason)
      expect(ui.find(`notice-generated_nothing-${type}-fencing`)).toBeNull()
    }
    const boundaryFeatures = registryProposalFeatures(ui.fencing, 'fencing')
    expect(boundaryFeatures.every((f) => fenceTypeOf(f) === 'boundary')).toBe(true)
    expect(boundaryFeatures).toHaveLength(blocks.boundary.feature_count)

    // AND IT COMMITS WHOLE.
    await commitAndWait(ui, 'fencing')
    expect(selectStepFeatures(ui.state, 'fencing').features.map((f) => f.id).sort()).toEqual(blocks.boundary.feature_ids.sort())
    expect(ui.cursor.cursorStepId).toBe('fencing')
    console.log(
      `FENCING LIVE (boundary only): 1 tab, boundary ${blocks.boundary.total_length_ft} ft over ${blocks.boundary.loop_count} loop(s); ` +
        `water and trees listed with generated=false and their reasons.`
    )
    await ui.unmount()
  })
})

/* ===========================================================================
   The offline payload -- the backend's shape
   =========================================================================== */

/** A closed ring of lng/lat squares inside the reference parcel, offset by `dx` degrees. */
function ring(dx = 0, size = 0.0006) {
  const [lng0, lat0] = [-79.9832 + dx, 40.6440]
  return [[lng0, lat0], [lng0 + size, lat0], [lng0 + size, lat0 + size], [lng0, lat0 + size], [lng0, lat0]]
}

function fenceFeature(id, type, index, count, geometry, display) {
  // MEASURED OFF THE RING, as the backend measures the real one -- one decimal.
  const lengthFt = Math.round(feet(geometry) * 10) / 10
  return {
    type: 'Feature',
    id,
    properties: {
      layer: FENCE_LINE_LAYER,
      label: `${type} ${index}`,
      confidence: 'medium',
      confidence_notes: 'fixture',
      fence_type: type,
      fence_index: index,
      fence_count: count,
      loop_count: geometry.type === 'MultiLineString' ? geometry.coordinates.length : 1,
      length_ft: lengthFt,
      [DISPLAY_LINE]: display,
    },
    geometry,
  }
}

function block(type, label, over) {
  return {
    fence_type: type,
    label,
    generated: true,
    candidate: true,
    loop_count: 1,
    feature_count: 1,
    total_length_ft: 0,
    feature_ids: [],
    features: [],
    reason: null,
    ...over,
  }
}

/** step_orchestrator.build_fencing_payload()'s shape, three candidate types. */
function fencingPayload({ water = 'candidate', trees = 'candidate' } = {}) {
  const boundaryRing = { type: 'LineString', coordinates: ring(0, 0.002) }
  // The boundary's display line is its ring simplified -- same vertices here.
  const boundary = fenceFeature('perimeter-fencing-boundary-1', 'boundary', 1, 1, boundaryRing, boundaryRing)
  const waterRing = { type: 'LineString', coordinates: ring(0.0002) }
  // The water ring's display line is the ring with one side trimmed away --
  // an open arc, three of its four sides.
  const waterDisplay = { type: 'LineString', coordinates: waterRing.coordinates.slice(0, 4) }
  const waterFeature = fenceFeature('perimeter-fencing-water-zone', 'water_zone_exclusion', 1, 1, waterRing, waterDisplay)
  const tree1Ring = { type: 'LineString', coordinates: ring(0.001) }
  const tree2Ring = {
    type: 'MultiLineString',
    coordinates: [ring(0.0016, 0.0003), ring(0.0016, 0.0002).map(([lng, lat]) => [lng, lat + 0.0004])],
  }
  // Tree 1 shares its whole length with the boundary and draws NOTHING; tree 2
  // is a severed zone, two loops, drawn as two parts.
  const tree1 = fenceFeature('perimeter-fencing-tree-zone-1', 'tree_zone_exclusion', 1, 2, tree1Ring, null)
  const tree2 = fenceFeature('perimeter-fencing-tree-zone-2', 'tree_zone_exclusion', 2, 2, tree2Ring, tree2Ring)

  const features = [boundary]
  const total = (...fs) => Math.round(fs.reduce((sum, f) => sum + f.properties.length_ft, 0) * 10) / 10
  const types = [block('boundary', 'Boundary fencing', { total_length_ft: total(boundary), feature_ids: [boundary.id] })]
  if (water === 'candidate') {
    features.push(waterFeature)
    types.push(block('water_zone_exclusion', 'Water zone fencing', { total_length_ft: total(waterFeature), feature_ids: [waterFeature.id] }))
  } else if (water === 'nothing_to_fence') {
    types.push(
      block('water_zone_exclusion', 'Water zone fencing', {
        generated: false,
        candidate: false,
        loop_count: 0,
        feature_count: 0,
        // A PRESENT KEY THAT MUST NOT BE READ AS "a zero-length fence".
        total_length_ft: 0.0,
        reason: 'The water step was committed with no zone, so there is no water ground to fence.',
      })
    )
  } else if (water === 'generated_nothing') {
    const generatedNothing = block('water_zone_exclusion', 'Water zone fencing', {
      generated: true,
      candidate: false,
      loop_count: 0,
      feature_count: 0,
      reason: 'The water zone pass ran and produced no fence loop.',
    })
    // A MISSING KEY THAT MUST NOT BE READ AS "nothing to fence".
    delete generatedNothing.total_length_ft
    types.push(generatedNothing)
  }
  if (trees === 'candidate') {
    features.push(tree1, tree2)
    types.push(
      block('tree_zone_exclusion', 'Tree zone fencing', {
        loop_count: 3,
        feature_count: 2,
        total_length_ft: total(tree1, tree2),
        feature_ids: [tree1.id, tree2.id],
      })
    )
  } else {
    types.push(
      block('tree_zone_exclusion', 'Tree zone fencing', {
        generated: false,
        candidate: false,
        loop_count: 0,
        feature_count: 0,
        total_length_ft: null,
        reason: 'The trees step was committed with no zone, so there is no tree ground to fence.',
      })
    )
  }
  return {
    fence_lines: { type: 'FeatureCollection', features },
    fence_types: types,
    candidate_fence_types: types.filter((t) => t.candidate).map((t) => t.fence_type),
    summary: { narrative_only: {}, segment_count: 1, developed_site_count: 1, buffers_ft: {} },
  }
}

function contextOver(proposals, { selectedFeatureIds = null } = {}) {
  const ids = selectedFeatureIds ?? registryProposalFeatures(proposals, 'fencing').map((f) => f.id)
  return { proposals, draft: { selectedFeatureIds: ids, drawnFeatures: [], inputs: {}, seeded: true } }
}

/* ===========================================================================
   3. A TYPE WITH NOTHING TO FENCE RENDERS NO TAB, DISTINGUISHABLY
   =========================================================================== */

describe('3. a type with nothing to fence renders no tab, distinguishable from one that generated nothing', () => {
  it('reads the generated flag, not a key: nothing-to-fence with a total present, generated-nothing with the total absent', () => {
    const absent = fencingPayload({ water: 'nothing_to_fence' })
    const empty = fencingPayload({ water: 'generated_nothing' })
    const absentWater = fenceTypeBlocks(absent).find((b) => b.fence_type === 'water_zone_exclusion')
    const emptyWater = fenceTypeBlocks(empty).find((b) => b.fence_type === 'water_zone_exclusion')
    // THE TRAPS: a present zero total on the un-generated type, and no total
    // at all on the generated-nothing type. A key-based reading gets both
    // backwards.
    expect(absentWater.total_length_ft).toBe(0.0)
    expect(emptyWater).not.toHaveProperty('total_length_ft')
    expect(fenceTypeAbsence(absentWater)).toBe('nothing_to_fence')
    expect(fenceTypeAbsence(emptyWater)).toBe('generated_nothing')

    // NO TAB, EITHER WAY: the tabs are the candidates, and both are two.
    for (const payload of [absent, empty]) {
      const tabs = FENCING_STEP.tabs(contextOver(payload))
      expect(tabs.map((t) => t.id)).toEqual(['boundary', 'tree_zone_exclusion'])
      expect(tabs.find((t) => t.id === 'water_zone_exclusion')).toBeUndefined()
    }

    // DISTINGUISHABLE: the two absences are two different notices, each in
    // the backend's own words, and a candidate raises none.
    const absentNotices = FENCING_STEP.notices(contextOver(absent))
    const emptyNotices = FENCING_STEP.notices(contextOver(empty))
    expect(absentNotices.map((n) => n.key)).toEqual(['nothing_to_fence-water_zone_exclusion'])
    expect(emptyNotices.map((n) => n.key)).toEqual(['generated_nothing-water_zone_exclusion'])
    expect(absentNotices[0].text).toContain('nothing to fence')
    expect(absentNotices[0].text).toContain(absentWater.reason)
    expect(emptyNotices[0].text).toContain('produced no fence loop')
    expect(emptyNotices[0].text).toContain(emptyWater.reason)
    expect(absentNotices[0].text).not.toBe(emptyNotices[0].text)
    expect(FENCING_STEP.notices(contextOver(fencingPayload()))).toEqual([])
    // AND A CANDIDATE IS NEVER AN ABSENCE, whatever its length.
    expect(fenceTypeAbsence(fenceTypeBlocks(absent).find((b) => b.fence_type === 'boundary'))).toBeNull()
  })

  it('renders the strip that way: two tabs, and the absence on the bar', async () => {
    const ui = await renderStrip(fencingPayload({ water: 'nothing_to_fence' }))
    expect(ui.all('[data-tab-id]').map((li) => li.dataset.tabId)).toEqual(['boundary', 'tree_zone_exclusion'])
    expect(ui.find('tab-water_zone_exclusion')).toBeNull()
    expect(ui.find('notice-nothing_to_fence-water_zone_exclusion-fencing')).not.toBeNull()
    await ui.unmount()
  })
})

/* ===========================================================================
   4. BOUNDARY FENCING WITH EVERYTHING ELSE ABSENT
   =========================================================================== */

describe('4. boundary fencing renders with everything else absent', () => {
  it('offers the one tab, checked, and names both absences', async () => {
    const payload = fencingPayload({ water: 'nothing_to_fence', trees: 'nothing_to_fence' })
    expect(payload.candidate_fence_types).toEqual(['boundary'])
    const tabs = FENCING_STEP.tabs(contextOver(payload))
    expect(tabs).toHaveLength(1)
    expect(tabs[0]).toMatchObject({ id: 'boundary', name: 'Boundary fencing', checkbox: true, selected: true })
    expect(FENCING_STEP.notices(contextOver(payload)).map((n) => n.key)).toEqual([
      'nothing_to_fence-water_zone_exclusion',
      'nothing_to_fence-tree_zone_exclusion',
    ])
    const ui = await renderStrip(payload)
    expect(ui.all('[data-tab-id]').map((li) => li.dataset.tabId)).toEqual(['boundary'])
    expect(ui.find('tab-boundary').dataset.checked).toBe('true')
    await ui.unmount()
  })
})

/* ===========================================================================
   5. TABS ARE TWO LINES
   =========================================================================== */

describe('5. tabs are two lines', () => {
  it('declares one row per tab -- the length -- under the name, and never a third', () => {
    for (const tab of FENCING_STEP.tabs(contextOver(fencingPayload()))) {
      expect(tab.rows).toHaveLength(1)
      expect(tab.rows[0].label).toBe('feet')
      expect(tab.rows[0].value).toMatch(/^\d+$/)
    }
    const payload = fencingPayload()
    const boundary = FENCING_STEP.tabs(contextOver(payload)).find((t) => t.id === 'boundary')
    const block = candidateFenceTypes(payload).find((b) => b.fence_type === 'boundary')
    expect(boundary.rows[0].value).toBe(measure(block.total_length_ft, 0))
    expect(boundary.rows[0].value).toMatch(/^\d{4}$/)
  })

  it('renders as a name and one value/label pair', async () => {
    const ui = await renderStrip(fencingPayload())
    for (const tab of ui.all('[data-tab-id]')) {
      expect(tab.querySelectorAll('.chrome-tab__name')).toHaveLength(1)
      expect(tab.querySelectorAll('.chrome-tab__value')).toHaveLength(1)
      expect(tab.querySelectorAll('.chrome-tab__label')).toHaveLength(1)
    }
    const trees = candidateFenceTypes(ui.fencing).find((b) => b.fence_type === 'tree_zone_exclusion')
    expect(ui.find('tab-tree_zone_exclusion').querySelector('.chrome-tab__value').textContent).toBe(measure(trees.total_length_ft, 0))
    await ui.unmount()
  })
})

/* ===========================================================================
   6. THE MAP DRAWS THE DISPLAY LINE; THE NUMBERS READ THE REAL GEOMETRY
   =========================================================================== */

describe('6. fence lines draw the display geometry, and lengths come from the real geometry', () => {
  it('draws each display line as the fence mark with its casing, nothing for a null line, and two parts for a severed zone', async () => {
    const payload = fencingPayload()
    const features = registryProposalFeatures(payload, 'fencing')
    const ui = await renderLayer(payload, features.map((f) => f.id))

    const paths = ui.fencePaths()
    // FOUR FEATURES, THREE DRAWN: tree 1's line is null and draws nothing.
    expect(paths).toHaveLength(3)
    const byPositions = new Map(paths.map((p) => [JSON.stringify(flatten(p.positions)), p]))
    for (const feature of features) {
      const display = feature.properties[DISPLAY_LINE]
      if (display == null) continue
      expect(byPositions.has(JSON.stringify(coordsOf(display))), feature.id).toBe(true)
    }
    // THE WATER LINE IS THE OPEN ARC, not the closed ring.
    const water = features.find((f) => f.id === 'perimeter-fencing-water-zone')
    expect(byPositions.has(JSON.stringify(coordsOf(water.geometry)))).toBe(false)
    expect(byPositions.get(JSON.stringify(coordsOf(water.properties[DISPLAY_LINE]))).positions).toHaveLength(4)
    // THE SEVERED ZONE IS ONE POLYLINE IN TWO PARTS.
    const tree2 = features.find((f) => f.id === 'perimeter-fencing-tree-zone-2')
    const severed = byPositions.get(JSON.stringify(coordsOf(tree2.properties[DISPLAY_LINE])))
    expect(Array.isArray(severed.positions[0])).toBe(true)
    expect(severed.positions).toHaveLength(2)
    // CASED, IN THE FENCE MARK, ON THE HALO.
    expect(ui.all('path.road--casing')).toHaveLength(3)
    expect(ui.all('path.road--fence:not(.road--casing)')).toHaveLength(3)
    for (const path of ui.all('path.road--fence:not(.road--casing)')) {
      expect(path.getAttribute('stroke')).toBe(readToken('--fence'))
    }
    for (const path of ui.all('path.road--casing')) {
      expect(path.getAttribute('stroke')).toBe(readToken('--halo'))
    }
    await ui.unmount()
  })

  it('reads every length off the payload, which measured the real ring; the display line disagrees and is never read', () => {
    const payload = fencingPayload()
    const features = registryProposalFeatures(payload, 'fencing')
    const tabs = FENCING_STEP.tabs(contextOver(payload))
    for (const block of candidateFenceTypes(payload)) {
      const tab = tabs.find((t) => t.id === block.fence_type)
      expect(tab.rows[0].value).toBe(measure(block.total_length_ft, 0))
      expect(FENCING_STEP.detail(contextOver(payload), block.fence_type).groups[0].fields[0].value).toBe(
        measure(block.total_length_ft, 0)
      )
    }
    // THE WATER RING IS FOUR SIDES AND DRAWS THREE: a tab reading the display
    // line would show three quarters of the length the tab shows.
    const water = features.find((f) => f.id === 'perimeter-fencing-water-zone')
    const ringFt = feet(water.geometry)
    const displayFt = feet(water.properties[DISPLAY_LINE])
    expect(displayFt / ringFt).toBeCloseTo(0.75, 1)
    const waterBlock = candidateFenceTypes(payload).find((b) => b.fence_type === 'water_zone_exclusion')
    expect(Math.abs(ringFt - waterBlock.total_length_ft) / waterBlock.total_length_ft).toBeLessThan(0.01)
    expect(tabs.find((t) => t.id === 'water_zone_exclusion').rows[0].value).toBe(measure(waterBlock.total_length_ft, 0))
    expect(measure(displayFt, 0)).not.toBe(measure(waterBlock.total_length_ft, 0))
    // AND THE DEFINITION NEVER NAMES THE DISPLAY FIELD: the tab, the panel and
    // the commit are built without it.
    const source = readFileSync(path.join(SRC, 'wizard', 'stepDefinitions.js'), 'utf8')
    const fencingSection = source.slice(source.indexOf('   THE FENCING STEP\n'), source.indexOf('The registry, and the order steps run in'))
    const code = fencingSection
      // The slice opens inside the section's own header comment.
      .replace(/^[\s\S]*?\*\//, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(code.length).toBeGreaterThan(1000)
    expect(code).not.toContain(DISPLAY_LINE)
    expect(code).not.toMatch(/cautionsFor|clampToBoundary|crossing_grounds|exclusion_crossings/)
  })

  it('sends the real geometry in the commit body, with the display line as a property', () => {
    const payload = fencingPayload()
    const features = registryProposalFeatures(payload, 'fencing')
    const state = {
      steps: { fencing: { proposals: payload, status: GENERATED, revision: 1 } },
      drafts: { fencing: contextOver(payload).draft },
      stepOrder: STEP_ORDER,
    }
    const body = buildCommitBody(state, 'fencing', registryProposalFeatures)
    expect(body.features.features).toHaveLength(features.length)
    for (const sent of body.features.features) {
      const source = features.find((f) => f.id === sent.id)
      expect(sent.geometry).toEqual(source.geometry)
      expect(sent.properties[DISPLAY_LINE]).toEqual(source.properties[DISPLAY_LINE])
    }
    expect(body.inputs).toBeUndefined()
  })
})

/* ===========================================================================
   7. COMMITTING A TYPE COMMITS EVERY LOOP OF IT
   =========================================================================== */

describe('7. committing a type commits every loop of it', () => {
  it('carries the whole type on the tab, and the checkbox moves all of it, both ways', () => {
    const payload = fencingPayload()
    const all = registryProposalFeatures(payload, 'fencing').map((f) => f.id)
    const tabsAt = (ids) => FENCING_STEP.tabs(contextOver(payload, { selectedFeatureIds: ids }))
    const trees = tabsAt(all).find((t) => t.id === 'tree_zone_exclusion')
    expect(trees.featureIds).toEqual(['perimeter-fencing-tree-zone-1', 'perimeter-fencing-tree-zone-2'])
    expect(trees.selected).toBe(true)

    // OFF: both loops leave; the tab says so; nothing else moves.
    const off = selectionAfterCheck(all, trees, 'multiple')
    expect(off.sort()).toEqual(['perimeter-fencing-boundary-1', 'perimeter-fencing-water-zone'])
    expect(tabsAt(off).find((t) => t.id === 'tree_zone_exclusion').selected).toBe(false)
    expect(tabsAt(off).find((t) => t.id === 'boundary').selected).toBe(true)
    // A PARTIAL TYPE IS NOT CHECKED: one loop of two in the set reads as
    // out, because the commit would be refused server-side (the contract's
    // group_check), and the strip must not say otherwise.
    expect(tabsAt([...off, 'perimeter-fencing-tree-zone-1']).find((t) => t.id === 'tree_zone_exclusion').selected).toBe(false)
    // ON: both come back.
    const back = selectionAfterCheck(off, tabsAt(off).find((t) => t.id === 'tree_zone_exclusion'), 'multiple')
    expect([...back].sort()).toEqual([...all].sort())

    // AND THE COMMIT BODY CARRIES THE WHOLE TYPE OR NONE OF IT.
    const stateWith = (ids) => ({
      steps: { fencing: { proposals: payload, status: GENERATED, revision: 1 } },
      drafts: { fencing: contextOver(payload, { selectedFeatureIds: ids }).draft },
      stepOrder: STEP_ORDER,
    })
    const ofType = (body, type) => body.features.features.filter((f) => fenceTypeOf(f) === type).map((f) => f.id)
    expect(ofType(buildCommitBody(stateWith(all), 'fencing', registryProposalFeatures), 'tree_zone_exclusion')).toHaveLength(2)
    expect(ofType(buildCommitBody(stateWith(off), 'fencing', registryProposalFeatures), 'tree_zone_exclusion')).toHaveLength(0)
  })

  it('focuses a type from a loop: clicking a fence on the map focuses its type, and the panel reads the type', () => {
    const payload = fencingPayload()
    expect(FENCING_STEP.groupOf).toBe(fenceTypeOf)
    expect(fenceTypeBlock(payload, 'perimeter-fencing-tree-zone-2').fence_type).toBe('tree_zone_exclusion')
    expect(fenceTypeBlock(payload, 'tree_zone_exclusion').fence_type).toBe('tree_zone_exclusion')
    expect(fenceTypeBlock(payload, 'nothing')).toBeNull()
    const detail = FENCING_STEP.detail(contextOver(payload), 'perimeter-fencing-tree-zone-2')
    expect(detail.name).toBe('Tree zone fencing')
    expect(detail.groups[0].fields.map((f) => f.label)).toEqual(['feet', 'description'])
    expect(detail.groups[0].fields[1].value).toBe(FENCE_DESCRIPTION_PLACEHOLDER)
    expect(detail.cautions).toEqual([])
    expect(FENCING_STEP.detail(contextOver(payload), 'nothing')).toBeNull()
  })
})

/* ===========================================================================
   8. THE END OF THE FLOW
   =========================================================================== */

describe('8. completing fencing leaves the rail complete with no forward action', () => {
  it('lands the cursor on fencing, committed, with every row done and only the way back in on offer', async () => {
    // A FULLY COMMITTED DOCUMENT, through the store's own resume path.
    const document_ = committedDocument()
    globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
      const url = new URL(rawUrl)
      if (url.pathname === '/api/steps') return { ok: true, status: 200, json: async () => ({ step_order: [...STEP_ORDER] }) }
      if (url.pathname.startsWith('/api/sessions/')) return { ok: true, status: 200, json: async () => document_ }
      throw new Error(`no route for ${init.method ?? 'GET'} ${url.pathname}`)
    })
    const ui = await renderApp()
    await ui.run((a) => a.resume('sess-done'))
    await ui.waitFor('the resume', () => Boolean(ui.state.sessionId), 5000)

    // THE MACHINE WITH NO NEXT STEP: `firstUncommitted` finds nothing, and
    // its fallback is the LAST step in the order. No guard was added to
    // advance(); this is the same fallback every commit's advance() lands
    // on when the order runs out.
    expect(ui.cursor.cursorStepId).toBe('fencing')
    expect(ui.cursor.order).toEqual(['boundary', ...STEP_ORDER])
    for (const stepId of ui.cursor.order) {
      expect(ui.cursor.statuses.get(stepId), stepId).toBe(COMMITTED)
      expect(ui.find(`rail-${stepId}`).querySelector('.chrome-rail__status').textContent, stepId).toBe('done')
      expect(ui.cursor.reachable.has(stepId)).toBe(true)
    }
    expect(ui.find('rail-fencing').getAttribute('aria-current')).toBe('step')
    // THE BANNER: reopen and nothing else. No primary tone, no forward move.
    const actions = ui.find('actions-fencing')
    expect([...actions.querySelectorAll('button')].map((b) => b.dataset.testid)).toEqual(['edit-fencing'])
    expect(actions.querySelector('[data-tone="primary"]')).toBeNull()
    expect(ui.find('generate-fencing')).toBeNull()
    expect(ui.find('commit-fencing')).toBeNull()
    expect(ui.container.querySelector('.chrome-bar__direction').textContent).toContain('last step')
    // AND advance() FROM HERE STAYS HERE.
    await ui.run((_a, cursor) => cursor.advance())
    expect(ui.cursor.cursorStepId).toBe('fencing')
    // OPENING AN EARLIER STEP STILL WORKS: the rail is a table of contents.
    await ui.click('rail-landform')
    expect(ui.cursor.cursorStepId).toBe('landform')
    await ui.unmount()
  })

  it('declares no forward button for the committed state, and every state for the chrome', () => {
    expect(FENCING_STEP.buttons[STEP_COMMITTED]).toEqual([REOPEN_BUTTON])
    expect(FENCING_STEP.buttons[STEP_COMMITTED].some((b) => b.tone === 'primary')).toBe(false)
    expect(FENCING_STEP.instructions[STEP_COMMITTED]).toContain('last step')
    expect(Object.keys(FENCING_STEP.instructions).sort()).toEqual([...MACHINE_STATES].sort())
    expect(Object.keys(FENCING_STEP.buttons).sort()).toEqual([...MACHINE_STATES].sort())
  })
})

/* ===========================================================================
   10. THE SCHEMA: what the definition declares, the mark, the token, the sweep
   =========================================================================== */

describe('10. what the definition declares, and the sweep', () => {
  it('is registered sixth and last, select-only, multi-select, grouped by fence type', () => {
    expect(STEP_DEFINITIONS.map((d) => d.id)).toEqual(['boundary', 'landform', 'water', 'roads', 'trees', 'structures', 'fencing'])
    expect(FENCING_STEP.selection).toEqual({ mode: 'multiple', follows: null })
    expect(FENCING_STEP.tools).toEqual(['select'])
    expect(FENCING_STEP.inputs).toEqual([])
    expect(FENCING_STEP.shape).toBeNull()
    expect(FENCING_STEP.placement).toBeNull()
    expect(FENCING_STEP.accumulate).toBeNull()
    expect(FENCING_STEP.groupOf).toBe(fenceTypeOf)
    expect(FENCING_STEP.proposalCollection).toBe('fence_lines')
    expect(FENCING_STEP.generate.label).toBe('Generate fencing')
    expect(FENCING_STEP.generate.params({ inputs: {} })).toBeNull()
    expect(FENCING_STEP.reopen).toEqual({ label: 'Edit this step', confirmTitle: 'Reopen fencing?' })
    expect(FENCING_STEP.commit.label({ committableCount: 0 })).toBe('Commit no fencing')
    expect(FENCING_STEP.commit.label({ committableCount: 3 })).toBe('Commit fencing')
    expect(FENCING_STEP.commit.canCommit({ committableCount: 0 })).toBe(true)
    expect(FENCING_STEP.buttons.idle).toEqual([GENERATE_BUTTON])
    expect(FENCING_STEP.buttons.reviewing).toEqual([COMMIT_BUTTON])
    expect(FENCING_STEP.buttons.editing).toEqual([])
    expect(registryProposalFeatures(fencingPayload(), 'fencing').map((f) => f.id)).toEqual([
      'perimeter-fencing-boundary-1',
      'perimeter-fencing-water-zone',
      'perimeter-fencing-tree-zone-1',
      'perimeter-fencing-tree-zone-2',
    ])
  })

  it('declares the three layers: the scrim, and two LINE layers at the fence mark', () => {
    expect(FENCING_STEP.layers.map((l) => [l.id, l.band, l.kind, l.source])).toEqual([
      ['fencing-offparcel', 'context', 'scrim', 'document'],
      ['fencing-candidates', 'editable', 'line', 'proposals'],
      ['fencing-committed', 'committed', 'line', 'document'],
    ])
    for (const layer of FENCING_STEP.layers.filter((l) => l.kind === 'line')) {
      expect(layer.treatment).toBe('fence')
      expect(layer.show).toBe('all')
      expect(layer.footprint).toBeNull()
    }
    expect(FENCING_STEP.layers.find((l) => l.id === 'fencing-candidates').key).toBe('fence_lines')
    expect(LAYER_KINDS).not.toContain('fence')
  })

  it('is a cased line in --fence, which is --rule and not --road, and the choice is written beside the token with both measurements', () => {
    const mark = zoneMark('fence')
    expect(mark.kind).toBe('line')
    expect(mark.fill).toBeNull()
    expect(mark.stroke).toBe(readToken('--fence'))
    expect(readToken('--fence')).toBe(readToken('--rule'))
    expect(readToken('--fence')).not.toBe(readToken('--road'))
    expect(readToken('--fence')).not.toBe(readToken('--ochre'))
    const css = readFileSync(path.join(SRC, 'index.css'), 'utf8')
    expect(css).toMatch(/^\s*--fence:\s*var\(--rule\);/m)
    const note = css.slice(css.indexOf("THE FENCE MARK'S COLOUR"), css.indexOf('--fence: var(--rule)'))
    expect(note.length).toBeGreaterThan(500)
    for (const candidate of ['--rule', '--ink-muted']) expect(note).toContain(candidate)
    for (const ground of ['canopy', 'soil']) expect(note).toContain(ground)
    expect(note).toContain('#D4A017')
    // NO COLOUR LITERAL BELOW :root: the token is a var() reference, and
    // every colour in App.css is one too.
    const appCss = readFileSync(path.join(SRC, 'App.css'), 'utf8')
    expect(appCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('names no step in the shell, the stack or the tools, and spells the display line once in the renderer', () => {
    const files = [
      'wizard/WizardShell.jsx',
      'wizard/WizardCursor.jsx',
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
      'session/SessionStore.jsx',
      'session/apiClient.js',
    ]
    for (const file of files) {
      const code = readFileSync(path.join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(code, `${file} names no step`).not.toMatch(/['"`](landform|water|roads|trees|structures|fencing)['"`]/)
      expect(code, `${file} names no step id`).not.toMatch(/stepId === ['"]/)
    }
    // THE WIRE NAME, ONCE, IN THE RENDERER -- beside the smoothed outline's.
    const mentions = []
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.(jsx?)$/.test(entry.name) && !entry.name.endsWith('.test.jsx')) {
          // CODE, NOT PROSE: the definition's own header describes the field
          // in a comment; what may not exist is a second READER of it.
          const code = readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
          if (code.includes(DISPLAY_LINE)) mentions.push(path.relative(SRC, full))
        }
      }
    }
    walk(SRC)
    expect(mentions).toEqual(['map/layers.jsx'])
    const layers = readFileSync(path.join(SRC, 'map', 'layers.jsx'), 'utf8')
    expect(layers.match(new RegExp(`'${DISPLAY_LINE}'`, 'g'))).toHaveLength(1)
  })

  it('says what a reset costs, in its own terms', () => {
    const feature = (id, type) => ({ type: 'Feature', id, properties: { fence_type: type }, geometry: null })
    const stateWith = (features) => ({
      steps: { fencing: { status: COMMITTED, features: { type: 'FeatureCollection', features } } },
      drafts: {},
      stepOrder: STEP_ORDER,
    })
    expect(FENCING_STEP.resetNote(stateWith([]))).toBe('the decision to fence nothing on this parcel')
    const two = FENCING_STEP.resetNote(stateWith([feature('a', 'boundary'), feature('b', 'tree_zone_exclusion'), feature('c', 'tree_zone_exclusion')]))
    expect(two[1]).toBe(' committed fence types')
    expect(two[0]).toMatchObject({ measure: '2' })
  })
})

/* ===========================================================================
   Harnesses for the offline sections
   =========================================================================== */

/**
 * THE WHOLE SHELL over one fencing payload, no server: a document with the
 * five steps committed and fencing GENERATED, through the store's own resume,
 * and the layers fetch the machine then makes answered with the payload --
 * the same two doors a reload goes through.
 */
async function renderStrip(payload) {
  const document_ = committedDocument()
  document_.session_id = 'sess-strip'
  document_.steps.fencing = { status: 'generated', revision: 1 }
  globalThis.fetch = vi.fn(async (rawUrl, init = {}) => {
    const url = new URL(rawUrl)
    if (url.pathname === '/api/steps') return { ok: true, status: 200, json: async () => ({ step_order: [...STEP_ORDER] }) }
    if (url.pathname.endsWith('/steps/fencing/layers')) return { ok: true, status: 200, json: async () => payload }
    if (url.pathname.startsWith('/api/sessions/')) return { ok: true, status: 200, json: async () => document_ }
    throw new Error(`no route for ${init.method ?? 'GET'} ${url.pathname}`)
  })
  const ui = await renderApp()
  await ui.run((a) => a.resume('sess-strip'))
  await ui.waitFor('the resume', () => Boolean(ui.state.sessionId), 5000)
  expect(ui.cursor.cursorStepId).toBe('fencing')
  await ui.waitFor('the fencing payload', () => ui.fencing != null && ui.state.drafts.fencing !== undefined, 5000)
  return ui
}

/** One editable fence layer over a payload, on a bare map. */
async function renderLayer(payload, selectedFeatureIds) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let map = null
  function MapProbe() {
    map = useMap()
    return null
  }
  const state = {
    steps: { fencing: { proposals: payload, status: GENERATED } },
    drafts: { fencing: { selectedFeatureIds, drawnFeatures: [], inputs: {}, seeded: true } },
    document: { boundary: rings.boundary },
    stepOrder: STEP_ORDER,
  }
  const layer = resolveLayer(state, FENCING_STEP, FENCING_STEP.layers.find((l) => l.id === 'fencing-candidates'))
  expect(layer).not.toBeNull()
  await React.act(async () => {
    root.render(
      <MapContainer center={BOUNDARY[0]} zoom={17} style={{ height: 600, width: 600 }}>
        <MapProbe />
        <StackLayer layer={{ ...layer, zIndex: 320 }} interactive={false} />
      </MapContainer>
    )
  })
  return {
    container,
    all: (selector) => [...container.querySelectorAll(selector)],
    fencePaths() {
      const out = []
      map.eachLayer((l) => {
        if (!(l instanceof L.Polyline) || l instanceof L.Polygon) return
        const className = l.options.className ?? ''
        if (!className.includes('road--fence') || className.includes('road--casing')) return
        out.push({ positions: l.getLatLngs() })
      })
      return out
    },
    async unmount() {
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
}

/** A document with every step committed, in the wire's alphabetical order. */
function committedDocument() {
  const feature = (id, extra = {}) => ({
    type: 'Feature',
    id,
    properties: { name: id, ...extra },
    geometry: { type: 'Polygon', coordinates: [[[-79.9832, 40.644], [-79.983, 40.644], [-79.983, 40.6442], [-79.9832, 40.644]]] },
  })
  const committed = (features, inputs = null) => {
    const entry = {
      status: 'committed',
      revision: 1,
      features: { type: 'FeatureCollection', features },
      provenance: Object.fromEntries(features.map((f) => [f.id, 'generated'])),
    }
    if (inputs) entry.inputs = inputs
    return entry
  }
  const steps = {
    fencing: committed([
      {
        type: 'Feature',
        id: 'perimeter-fencing-boundary-1',
        properties: { layer: FENCE_LINE_LAYER, fence_type: 'boundary', fence_index: 1, fence_count: 1, [DISPLAY_LINE]: { type: 'LineString', coordinates: ring(0, 0.002) } },
        geometry: { type: 'LineString', coordinates: ring(0, 0.002) },
      },
    ]),
    landform: committed([feature('production-area-1')]),
    roads: committed([], { access_points: [] }),
    structures: committed([]),
    trees: committed([]),
    water: committed([]),
  }
  return {
    schema_version: 1,
    session_id: 'sess-done',
    document_revision: 6,
    created_at: '2026-01-01T00:00:00+00:00',
    updated_at: '2026-01-01T00:00:00+00:00',
    boundary: rings.boundary,
    step_order: [...STEP_ORDER],
    steps,
  }
}
