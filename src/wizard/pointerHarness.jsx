/**
 * pointerHarness.jsx  —  the shipped shell, over the real map, against the
 * real backend, in a browser that HIT-TESTS.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT layoutHarness.jsx. That page renders the
 * chrome so its BOXES can be measured; it has no session, no map and a step
 * definition of its own, which is exactly right for a question about widths
 * and exactly wrong for a question about whether a control can be pressed.
 *
 * THE BUG THIS PAGE WAS BUILT FOR. "A water zone whose eye is closed cannot be
 * opened again", reported with a decisive symptom: the closed eye showed NO
 * HOVER STATE. Every eye test in this repo reaches the handler -- through the
 * reducer, through the strip's own arithmetic, through a dispatched click, or
 * through a jsdom render that asserts on state -- and NONE of them resolves a
 * screen position to an element. A handler bound to something nothing can
 * click passes all four. jsdom cannot ask the question at all: it computes no
 * layout, so every getBoundingClientRect is zero and document.elementFromPoint
 * has nothing to answer with.
 *
 * So this page puts the SHIPPED components (WizardShell, MapLayerStack, the
 * real SessionProvider, the real step definitions) and the SHIPPED stylesheets
 * in front of a real Chromium, pointed at the real backend, and
 * pointer.test.jsx clicks them with a real mouse at real coordinates.
 *
 * WHAT IS DRIVEN AND WHAT IS CLICKED, because the split is the point. Getting
 * to a step is SETUP -- a boundary ring, a generate, a commit -- and setup goes
 * through the store's own actions and the shell's own buttons, whichever is
 * shorter. The GESTURE UNDER TEST is never driven: the eye and the × are
 * pressed by moving the mouse to a coordinate and clicking, so that the
 * browser's own hit-testing decides what receives the press, exactly as it
 * does for the user.
 *
 * THE PROBE IS THE READ SIDE ONLY. `window.__probe` hands the test the store's
 * state, its actions and the cursor. Nothing on it reaches into the strip: the
 * strip is read through the DOM, which is the whole point of the page.
 *
 * THE BACKEND COMES FROM VITE_API_URL, the same constant apiClient reads --
 * see pointer.test.jsx, which sets it before it starts the dev server. With no
 * backend the page still mounts (the boundary step is reachable with no
 * session) and the test skips its live sections.
 */

import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { MapContainer, useMap } from 'react-leaflet'

import 'leaflet/dist/leaflet.css'
import '../index.css'
import '../App.css'

import {
  COMMITTED,
  GENERATED,
  NOT_STARTED,
  SessionProvider,
  buildCommitBody,
  selectDraft,
  selectStepFeatures,
  selectStepProposals,
  selectStepStatus,
  useSession,
} from '../session/SessionStore'
import { STEP_DEFINITIONS, registryProposalFeatures } from './stepDefinitions'
import MapLayerStack from '../map/MapLayerStack.jsx'
import { DrawingProgressProvider } from '../map/DrawingProgress.jsx'
import WizardShell from './WizardShell.jsx'
import { WizardCursorProvider, useWizardCursor } from './WizardCursor.jsx'
import rings from '../fixtures/rings.json'

/** The reference parcel, in Leaflet's [lat, lng] order. */
const BOUNDARY = rings.boundary.map(([lng, lat]) => [lat, lng])

/**
 * THE READ SIDE, ON THE WINDOW.
 *
 * Everything here is a getter over the live store rather than a snapshot: the
 * test polls `window.__probe.state` from page.waitForFunction between real
 * clicks, and a snapshot taken at mount would answer every one of those with
 * the empty session.
 */
function Probe() {
  const session = useSession()
  const cursor = useWizardCursor()

  useEffect(() => {
    // The map is written by MapProbe below, whose effect runs after this one
    // on every commit; carried across anyway so the order is not load-bearing.
    const map = window.__probe?.map ?? null
    window.__probe = {
      map,
      BOUNDARY,
      GENERATED,
      COMMITTED,
      NOT_STARTED,
      STEP_DEFINITIONS,
      buildCommitBody,
      registryProposalFeatures,
      selectDraft,
      selectStepFeatures,
      selectStepProposals,
      selectStepStatus,
      get state() {
        return session.state
      },
      get actions() {
        return session.actions
      },
      get cursor() {
        return cursor
      },
    }
  })

  return null
}

/**
 * THE MAP, ON THE PROBE, FOR ONE REASON: a coordinate is not a screen point.
 *
 * The roads step's access point is placed by clicking the MAP at a latitude
 * and longitude, and the test presses it with a real mouse -- so something has
 * to turn [lat, lng] into the pixel the mouse travels to, and Leaflet's own
 * projection is the only thing that can. Reading it here rather than
 * re-deriving it means the test clicks where the map thinks the point is.
 */
function MapProbe() {
  const map = useMap()
  useEffect(() => {
    if (window.__probe) window.__probe.map = map
  })
  return null
}

function Harness() {
  return (
    <SessionProvider autoResume={false} proposalFeatures={registryProposalFeatures}>
      <WizardCursorProvider>
        <DrawingProgressProvider>
          <Probe />
          {/* THE SHIPPED STAGE ELEMENT, which is what carries the chrome's own
              measurements and the height the overlay is laid out against. The
              tile layer is left out on purpose: a tile fetch contributes
              nothing to where a control is or whether it can be pressed, and
              it is the one thing on this page that would need the open
              internet. */}
          <div className="map-stage" data-testid="stage">
            <MapContainer
              center={BOUNDARY[0]}
              zoom={17}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom={false}
              zoomControl={false}
              attributionControl={false}
            >
              <MapProbe />
              <MapLayerStack />
            </MapContainer>
            <WizardShell />
          </div>
        </DrawingProgressProvider>
      </WizardCursorProvider>
    </SessionProvider>
  )
}

createRoot(document.getElementById('root')).render(<Harness />)

// The signal pointer.test.jsx waits on before it clicks anything: React has
// committed, the step catalogue request has settled, and the fonts are in --
// a tab is sized to its content IN A FACE, and a coordinate measured mid-swap
// is a coordinate in a layout that is about to move.
Promise.all([document.fonts.ready, new Promise((r) => requestAnimationFrame(() => r()))]).then(
  () => {
    document.documentElement.dataset.harnessReady = 'true'
  }
)
