import { useState } from 'react'
import { AttributionControl, MapContainer, TileLayer, ZoomControl } from 'react-leaflet'
import MapRecenter from './MapRecenter.jsx'
import AddressSearch from './AddressSearch.jsx'
import { SessionProvider } from './session/SessionStore'
import { registryProposalFeatures } from './wizard/stepDefinitions'
import MapLayerStack from './map/MapLayerStack.jsx'
import { DrawingProgressProvider } from './map/DrawingProgress.jsx'
import WizardShell from './wizard/WizardShell.jsx'
import { WizardCursorProvider } from './wizard/WizardCursor.jsx'
// ?react is vite-plugin-svgr: the asset becomes a React component and lands
// inline in the DOM. It has to be inline — the file draws with
// stroke="currentColor", which resolves against .contour-bg's own colour only
// while the SVG is part of this document. Referenced as a background-image or
// an <img src> it is a separate document with no inherited colour, and the
// linework renders black or not at all.
import ContourBackground from './assets/contour-background.svg?react'
import 'leaflet/dist/leaflet.css'
import './App.css'

// Starting map view — a neutral, zoomed-out view of the continental US
// rather than any one specific property. Anyone opening the tool for the
// first time should see a blank slate, not someone else's land — they'll
// search their own address or zoom in manually from here.
const DEFAULT_CENTER = [39.8283, -98.5795]
const DEFAULT_ZOOM = 4

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
       handed to the store through the prop the store declared for it. Without
       it every step's commit reads landform's payload key -- see
       registryProposalFeatures() for what that costs the second step. */
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
            <h1>Conceptual farm planning, in the order the land decides.</h1>
            <p className="hero__subhead">
              Trace your property. Keyline Designer reads LiDAR elevation, soil survey,
              and hydrography, then works the Scale of Permanence in order — climate
              through soil.
            </p>
            <AddressSearch onLocationSelected={setMapCenter} />
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
                {/* THE LAYER STACK. It composes basemap → context → committed
                    → active editable from the store and the step definitions,
                    and mounts the active step's declared tools. */}
                <MapLayerStack />
              </MapContainer>

              {/* THE WIZARD, OVER THE MAP RATHER THAN BESIDE IT. Five floating
                  regions: the step rail, the instruction bar, the reserved
                  detail panel, the tab strip and the action banner. It takes
                  no height from the map. */}
              <WizardShell />
            </div>
          </section>

          <section className="section shell shell--prose">
            <h2>What you get</h2>
            <p className="section__lede">
              A PDF you can print, mark up, and take out onto the land with you.
            </p>
            <p>
              The report is a written analysis of the property alongside a full-page
              layout map with the recommended elements drawn on it — production areas,
              water storage candidates, road corridors, tree lines, and the keypoints
              the design is built around.
            </p>
            <p className="sample-slot">[ sample report page — image to come ]</p>
          </section>

          <section className="section shell shell--prose">
            <h2>The Scale of Permanence</h2>
            <p className="section__lede">
              P. A. Yeomans&apos; ordering of the eight factors that shape a property,
              from the ones you cannot change to the ones you can. The analysis works
              them in order, because a decision made out of order has to be unmade.
            </p>
            <ol className="scale-list">
              <li>
                <h3>Climate</h3>
                <p>Rainfall, frost, growing season. Fixed — everything else answers to it.</p>
              </li>
              <li>
                <h3>Land shape</h3>
                <p>Ridges, valleys, and the keypoints where a valley&apos;s grade breaks.</p>
              </li>
              <li>
                <h3>Water supply</h3>
                <p>Where water already collects, and where it could be held.</p>
              </li>
              <li>
                <h3>Farm roads</h3>
                <p>Access that follows the ridges and keylines rather than cutting across them.</p>
              </li>
              <li>
                <h3>Trees</h3>
                <p>Shelter, shade, and the lines that hold soil on a slope.</p>
              </li>
              <li>
                <h3>Permanent buildings</h3>
                <p>Sited once water and access are settled, not before.</p>
              </li>
              <li>
                <h3>Subdivision fencing</h3>
                <p>Paddock divisions that follow the pattern the land already has.</p>
              </li>
              <li>
                <h3>Soil</h3>
                <p>
                  Last, and deliberately so. Soil is the most improvable factor on the
                  list — poor soil today is a starting condition, not a constraint, and
                  letting it drive the design would lock in a layout you will outgrow.
                </p>
              </li>
            </ol>
          </section>

          <section className="section shell shell--prose">
            <h2>Where the data comes from</h2>
            <p className="section__lede">
              Public, citable sources. Every recommendation traces back to a measurement
              rather than an assumption.
            </p>
            <ul className="source-list">
              <li>
                <strong>USGS 3DEP</strong>
                <span>LiDAR-derived elevation — slope, flow accumulation, keypoints.</span>
              </li>
              <li>
                <strong>SSURGO soil survey</strong>
                <span>USDA soil mapping — drainage class, erodibility, hydric soils.</span>
              </li>
              <li>
                <strong>NHD hydrography</strong>
                <span>Mapped streams, water bodies, and floodplain extents.</span>
              </li>
              <li>
                <strong>Climate reanalysis</strong>
                <span>Rainfall, temperature, and growing season for the location.</span>
              </li>
              <li>
                <strong>Canopy height</strong>
                <span>Existing tree cover, so standing woodland is not designed over.</span>
              </li>
              <li>
                <strong>Satellite imagery</strong>
                <span>Current ground conditions under the drawn boundary.</span>
              </li>
            </ul>
          </section>

          <section className="section shell shell--prose">
            <h2>What this isn&apos;t</h2>
            <p>
              It is built for small properties — roughly a few acres up to thirty. Larger
              ground has different problems and wants a different tool.
            </p>
            <p>
              United States only, because every data source above is a US federal
              dataset.
            </p>
            <p>
              And it is a starting point for real decisions, not a replacement for
              walking the land with someone who knows it. The analysis sees terrain and
              soil classes; it does not see the wet corner that never dries out, or the
              neighbour&apos;s tile drain, or where the deer come through.
            </p>
          </section>
        </main>

        <footer className="footer shell shell--wide">
          <p>Keyline Designer — conceptual planning from public data.</p>
        </footer>
      </div>
    </>
  )
}

export default App
