import { useState } from 'react'
import { AttributionControl, MapContainer, TileLayer, ZoomControl } from 'react-leaflet'
import MapRecenter from './MapRecenter.jsx'
import AddressSearch from './AddressSearch.jsx'
import { SessionProvider } from './session/SessionStore'
import { registryProposalFeatures } from './wizard/stepDefinitions'
import MapLayerStack from './map/MapLayerStack.jsx'
import ResumeFit from './map/ResumeFit.jsx'
import { DrawingProgressProvider } from './map/DrawingProgress.jsx'
import WizardShell from './wizard/WizardShell.jsx'
import { WizardCursorProvider } from './wizard/WizardCursor.jsx'
import { TutorialReady } from './tutorial/TutorialContext.jsx'
import { GATED_ADDRESS_PLACEHOLDER, OrientationCard, useTutorialGate } from './tutorial/TutorialGate.jsx'
import ReportSamples from './ReportSamples.jsx'
import ScaleOfPermanence from './ScaleOfPermanence.jsx'
// ?react is vite-plugin-svgr: the asset becomes a React component and lands
// inline in the DOM. It has to be inline — the file draws with
// stroke="currentColor", which resolves against .contour-bg's own colour only
// while the SVG is part of this document. Referenced as a background-image or
// an <img src> it is a separate document with no inherited colour, and the
// linework renders black or not at all.
import ContourBackground from './assets/contour-background.svg?react'
import 'leaflet/dist/leaflet.css'
import './App.css'

/**
 * THE STARTING VIEW, AND IT IS A DELIBERATE ONE.
 *
 * Farmland at a legible zoom: field edges, a woodlot and a road are all in
 * frame at once, which is what the tool will ask someone to find on their own
 * ground. It used to be the continental US at zoom 4 -- a blank slate, but
 * one on which the orientation card's first sentence ("You'll work through
 * seven steps") had nothing to point at. This is somebody's farmland only in
 * the sense that all farmland is; it is not a parcel the tool knows anything
 * about, and the address search replaces it the moment it is used.
 */
export const DEFAULT_VIEW = Object.freeze({
  name: 'Driftless farmland, Vernon County, Wisconsin',
  center: Object.freeze([43.5795, -90.7985]),
  zoom: 16,
})
const DEFAULT_CENTER = DEFAULT_VIEW.center
const DEFAULT_ZOOM = DEFAULT_VIEW.zoom

/**
 * The basemap. ONE, now, where there were two.
 *
 * The pair was "Imagery" and "Imagery + labels", and the labels toggle did not
 * earn the space it took: it is one bit of state, exposed as a permanent
 * two-button control in the corner of the map, answering a question most
 * people ask once. The reference tiles it switched on are gone with it.
 *
 * BASEMAP SWITCHING MAY WELL COME BACK, and when it does it should be about
 * something the ground actually changes with -- imagery VINTAGE, or
 * leaf-off/leaf-on, either of which changes what you can see to trace against
 * and is worth a control. That is a different feature with a different data
 * problem behind it (reliable national leaf-off coverage means seasonal NAIP
 * or state-level services, and picking one is its own investigation), and it
 * is not this.
 */
const BASEMAP = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Tiles &copy; Esri',
}

/**
 * The page, and the session it runs in.
 *
 * The providers are mounted HERE rather than in main.jsx so that everything on
 * this page -- the map stack and the chrome floating over it -- reads one
 * store, one arming register and one gesture-in-flight. Two of anything here
 * would be the invariant F3 retired, back in a new place.
 */
function App() {
  return (
    /* THE REGISTRY'S ANSWER TO "WHICH COLLECTION DOES A COMMIT COME FROM",
       handed to the store through the prop the store declared for it. It is
       REQUIRED -- the store has no default and this mount would throw without
       it -- because there is no safe guess: a payload the reader does not
       recognise resolves to no features, and no features is a legal commit
       rather than an error. See registryProposalFeatures(). */
    <SessionProvider proposalFeatures={registryProposalFeatures}>
      <WizardCursorProvider>
        <DrawingProgressProvider>
          <Designer />
        </DrawingProgressProvider>
      </WizardCursorProvider>
    </SessionProvider>
  )
}

/**
 * The map, and what is left of the page around it.
 *
 * WHAT THIS COMPONENT HOLDS IS NOW ONLY WHAT THE MAP ITSELF NEEDS -- where the
 * view is, whether the scroll wheel is live, and which basemap is under it.
 * Everything else it used to hold is gone, in three deletions:
 *
 *   THE PANEL COLUMN. The wizard's controls sat in a column beside the map and
 *   the map paid a third of the viewport for it. The wizard's chrome floats
 *   over the map now (see WizardShell), so the column has nothing left in it.
 *
 *   THIS FILE'S OWN BOUNDARY CONTROLS. "Undo Last Point" and "Finish Boundary"
 *   (in title case, which the design guide does not use either)
 *   were rendered here AND by the wizard, wired to the same arming register --
 *   two boundary UIs on one screen. F3 moved ring ownership to the wizard and
 *   left these behind; F4 deleted the spike's zone state but not these. The
 *   wizard's are the ones that stay, and they are the state's declared buttons
 *   rather than a branch on three booleans.
 *
 *   THE ACCESS-POINT PRE-STEP, and the PDF flow that was built on it. See
 *   below.
 *
 * WHERE THE PDF WENT, SAID PLAINLY. /api/generate-report-pdf requires an
 * access point, and the access point is not a global concern -- it is an input
 * of the ROADS step, which is not built. Keeping a pre-step in the boundary
 * flow to feed one endpoint meant every user picked a road entry before they
 * had drawn anything downstream of it. So the pre-step is gone and NOTHING IN
 * THIS APP CALLS THAT ENDPOINT ANY MORE. The route is untouched on the server
 * and still works against a boundary and an access point on the wire; what has
 * no caller is the button. The report path gets its own revamp after the
 * interactive work, off the Design Document rather than off a raw ring, and
 * roads will declare the access point as the input it always was. A temporary
 * affordance here to keep the old flow alive would be the pre-step again under
 * a different name.
 */
function Designer() {
  const [mapCenter, setMapCenter] = useState(null)

  // THE TUTORIAL'S GATE. On a first arrival the orientation card stands in
  // front of the wizard: the chrome is not mounted, the address field is
  // disabled, and nothing else here changes. See TutorialGate.
  const gate = useTutorialGate()

  // Two click listeners are attached to this map now — whichever gesture the
  // cursor step armed, and the stack's own background click that clears the
  // focus — and a feature's click stops propagating so the two cannot fire on
  // one gesture. What keeps the tools from colliding is not an assertion: at
  // most one is ARMED, because being armed means holding the arming register's
  // single slot. The scroll gate's listener and AccessPointTool's are both
  // gone, with the features that needed them.

  return (
    <>
      {/* Decorative: real 3DEP contours of a dissected-plateau window, but
          they carry no information the page depends on. */}
      <ContourBackground className="contour-bg" aria-hidden="true" focusable="false" />

      <div className="page">
        <nav className="nav shell shell--wide">
          <span className="nav__mark">Keyline Designer</span>
          <a className="nav__link" href="#design">
            Design your land
          </a>
        </nav>

        <main>
          <section className="hero shell shell--wide">
            <p className="eyebrow">Keyline design for small farms</p>
            <h1>Lay out your farm, starting with what&apos;s hardest to change.</h1>
            <p className="hero__subhead">
              Trace your property, and Keyline Designer reads it from a deep stack of
              public datasets, led by a LiDAR-derived DEM that maps its ridges, valleys,
              keypoints, and how water moves between them. Then you make the decisions
              one at a time, and each choice sets up the next.
            </p>
            <AddressSearch
              onLocationSelected={setMapCenter}
              disabled={!gate.live}
              disabledPlaceholder={GATED_ADDRESS_PLACEHOLDER}
            />
          </section>

          {/* THE MAP IS THE DOCUMENT. It is full-bleed and it fills the
              viewport; every control the wizard offers floats on top of it and
              nothing sits beside or below it. The stage is what gives Leaflet
              a resolved height to render into and what the five chrome regions
              are positioned against -- see .map-stage in App.css. */}
          <section id="design" className="tool shell shell--wide">
            <h2 className="visually-hidden">Design your land</h2>
            <div className="map-stage">
              <MapContainer
                center={DEFAULT_CENTER}
                zoom={DEFAULT_ZOOM}
                style={{ height: '100%', width: '100%' }}
                /**
                 * NO SCROLL-WHEEL ZOOM, PERMANENTLY, and the gate that used to
                 * arm it is deleted rather than defaulted off.
                 *
                 * The map is full-bleed and fills the viewport, so a page
                 * scroll that reaches it has nowhere else to go: every wheel
                 * event over the document body was landing on the map, and a
                 * user scrolling past the tool section found their parcel
                 * three zoom levels away. The gate (click once to make the map
                 * live) traded that for a second thing to learn and a state to
                 * be in the wrong one of. Zoom is the +/- control.
                 *
                 * TOUCH ZOOM STAYS. Pinch on a touch screen is a deliberate
                 * two-finger gesture on the map itself, not a side effect of
                 * moving down the page, so it has none of the problem and is
                 * left on. Drag-to-pan is untouched.
                 *
                 * KNOWN AND ACCEPTED: Leaflet routes a trackpad pinch through
                 * the same wheel handler, so laptop pinch-to-zoom goes with
                 * scroll-wheel zoom. The +/- control is the answer there.
                 */
                scrollWheelZoom={false}
                touchZoom
                zoomControl={false}
                /**
                 * HALF STEPS ON +/-, AND BOTH FIELDS OR NEITHER.
                 *
                 * With the scroll wheel gone, +/- is the ONLY zoom, and a full
                 * level per press is a coarse instrument to have left someone
                 * with: one press doubles or halves the scale, which is a long
                 * way to travel to frame a parcel.
                 *
                 * `zoomDelta` alone does nothing. It says how far a +/- press
                 * moves; `zoomSnap` says what the map is allowed to REST at,
                 * and its default of 1 rounds a half step straight back to a
                 * whole level -- so a fractional delta without a matching snap
                 * is a no-op that looks like a setting.
                 *
                 * KNOWN AND ACCEPTED: raster tiles exist at integer zooms
                 * only, so an intermediate level scales the bitmap and reads
                 * slightly soft. That is the trade -- a softer frame you chose
                 * over a sharp one you did not -- and it resolves the moment
                 * the next whole level is reached.
                 */
                zoomDelta={0.5}
                zoomSnap={0.5}
                /**
                 * OFF, so the credit can be placed rather than defaulted. See
                 * AttributionControl below.
                 */
                attributionControl={false}
              >
                {/* Top-right, pushed clear of the instruction bar by CSS. The
                    only zoom affordance on the map. */}
                <ZoomControl position="topright" />
                {/* THE CREDIT, IN THE TOP-LEFT GAP.
                
                    Leaflet defaults it to the bottom right, which is where the
                    action banner now is. The top-left corner is empty by
                    construction: the instruction bar is centred in its row and
                    the step rail begins in the row below it, so the space
                    above the rail belongs to nothing.

                    IT IS A LICENSING REQUIREMENT, NOT A FEATURE. Esri's terms
                    require it and it is not ours to remove -- but it must not
                    read as a control either, so it is muted ink at the
                    smallest size in the system, with no hover state that
                    invites a press. App.css gives it the floating-card
                    treatment every other region has (opaque surface, hairline,
                    inset) rather than leaving it bare on the imagery, which is
                    what the rest of this shell decided a region looks like. */}
                <AttributionControl position="topleft" prefix={false} />
                <TileLayer url={BASEMAP.url} attribution={BASEMAP.attribution} maxZoom={19} />
                <MapRecenter center={mapCenter} zoom={18} />
                {/* A RESUMED SESSION OPENS ON ITS PARCEL: one instant fit to
                    the committed boundary when the resume lands, forfeited if
                    the user has searched or moved the map first. Never again
                    after that -- see ResumeFit. */}
                <ResumeFit searched={mapCenter != null} />
                {/* THE LAYER STACK. It composes basemap → context → committed
                    → active editable from the store and the step definitions,
                    and mounts the active step's declared tools. */}
                <MapLayerStack />
              </MapContainer>

              {/* THE WIZARD, OVER THE MAP RATHER THAN BESIDE IT. Five floating
                  regions: the step rail, the instruction bar, the reserved
                  detail panel, the tab strip and the action banner. It takes
                  no height from the map.

                  NOT WHILE THE GATE IS UP: the orientation card previews
                  these five regions, and mounting them behind it would make
                  the preview a caption. READY holds a step's card back until
                  the chrome has settled. */}
              {gate.chromeMounted ? (
                <TutorialReady ready={gate.live}>
                  <WizardShell />
                </TutorialReady>
              ) : null}
              {gate.gated ? <OrientationCard onStart={gate.start} /> : null}
            </div>
          </section>

          <section className="section shell shell--prose">
            <h2>The report</h2>
            <p className="section__lede">
              A PDF you can print, mark up, and take out onto the land with you.
            </p>
            <p>
              Once your layout is complete, you can generate the report. It pulls data
              from the public sources listed further down this page and sets it out
              section by section: climate, landform, water, access, trees, and soils.
              Every figure is specific to your property or its region, laid out in maps,
              charts, and tables, ready to hand to a contractor or consultant. The report
              closes with your layout drawn over an aerial photograph, and the figures
              behind each decision you made.
            </p>
            {/* THREE PAGES FROM A REAL REPORT, and the maximised view a press
                on one opens. The pages, their captions and the note under
                them are ReportSamples' own; see its docblock. */}
            <ReportSamples />
          </section>

          <section className="section shell shell--prose">
            <h2>The Scale of Permanence</h2>
            <p className="section__lede">
              Australian farmer P. A. Yeomans ranked the eight things that shape a farm
              by how hard they are to change, from climate, which you can&apos;t, to soil,
              which you can build. You work through them in that order, so each decision
              rests on the ones that are harder to change.
            </p>
            {/* THE EIGHT FACTORS AS A LADDER, each opening to its paragraph.
                The rungs and their copy are ScaleOfPermanence's own; see its
                docblock. */}
            <ScaleOfPermanence />
          </section>

          <section className="section shell shell--prose">
            <h2>Where the data comes from</h2>
            <p className="section__lede">
              Public, citable sources. Every recommendation traces back to a measurement
              rather than an assumption.
            </p>
            <ul className="source-list">
              <li>
                <strong>Terrain</strong>
                <span>
                  Slope, the way water runs and gathers, and the keypoints, from USGS 3DEP
                  elevation; existing tree cover from 3DEP lidar canopy height, so standing
                  woodland is not designed over.
                </span>
              </li>
              <li>
                <strong>Soil</strong>
                <span>
                  How each soil drains, how easily it erodes, and where it stays wet, from the
                  USDA NRCS SSURGO soil survey.
                </span>
              </li>
              <li>
                <strong>Water</strong>
                <span>
                  The streams and ponds on and around the land and how much ground drains to
                  them, from USGS NHD and NHDPlus; mapped wetlands from the USFWS National
                  Wetlands Inventory; and where floods reach, from FEMA flood maps.
                </span>
              </li>
              <li>
                <strong>Climate</strong>
                <span>
                  Rainfall, temperature, and growing season from Daymet, corrected against NOAA
                  climate normals from nearby stations; the heavy storms that size swales and
                  spillways from NOAA Atlas 14; wind and evaporation from NASA POWER; and the
                  local record of hail, damaging wind, and tornadoes from NOAA storm reports.
                </span>
              </li>
              <li>
                <strong>Land cover and trees</strong>
                <span>
                  What covers the ground now — field, pasture, woods, pavement — from USGS
                  NLCD, and which kinds of forest grow there from USFS forest type mapping.
                </span>
              </li>
              <li>
                <strong>Geology</strong>
                <span>
                  The bedrock beneath the soil, from the USGS State Geologic Map Compilation.
                </span>
              </li>
              <li>
                <strong>Imagery and roads</strong>
                <span>
                  Aerial photographs of the land as it looks today from USDA NAIP, and the
                  roads that reach it from Census TIGER/Line.
                </span>
              </li>
            </ul>
            <p className="source-note">
              Every report lists the version and retrieval date of each source it used.
            </p>
          </section>

          <section className="section shell shell--prose">
            <h2>What it isn&apos;t</h2>
            <p>
              It&apos;s built for small properties, from a few acres up to about 100.
              Larger ground has different problems and wants a different tool.
            </p>
            <p>
              It works in the lower 48 states only, because that&apos;s where the public
              data it reads is complete.
            </p>
            <p>
              It isn&apos;t a survey or an engineering design. The boundary is the one you
              draw, and a water survey area marks ground worth investigating, not a place
              to dig. Anything you build still calls for the usual site work, permits, and
              professionals.
            </p>
            <p>
              And it&apos;s a starting point for real decisions, not a replacement for
              walking the land with someone who knows it. Public data shows the terrain,
              soils, and water; it doesn&apos;t show the seep that only runs in March, the
              neighbor&apos;s tile drain, or where the deer come through.
            </p>
          </section>
        </main>

        <footer className="footer shell shell--wide">
          <p>Keyline Designer — a layout planning tool for small farms</p>
        </footer>
      </div>
    </>
  )
}

export default App
