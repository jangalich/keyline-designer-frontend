import { useCallback, useState } from 'react'
import { MapContainer, TileLayer, ZoomControl } from 'react-leaflet'
import MapRecenter from './MapRecenter.jsx'
import AddressSearch from './AddressSearch.jsx'
import ScrollZoomGate from './ScrollZoomGate.jsx'
import BasemapControl, { BASEMAPS } from './BasemapControl.jsx'
import { SessionProvider } from './session/SessionStore'
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
 * The page, and the session it runs in.
 *
 * The providers are mounted HERE rather than in main.jsx so that everything on
 * this page -- the map stack and the chrome floating over it -- reads one
 * store, one arming register and one gesture-in-flight. Two of anything here
 * would be the invariant F3 retired, back in a new place.
 */
function App() {
  return (
    <SessionProvider>
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

  // Scroll-wheel zoom starts off; see ScrollZoomGate for why and for how the
  // activating click stays transparent.
  const [isMapLive, setIsMapLive] = useState(false)
  const [basemapId, setBasemapId] = useState(BASEMAPS[0].id)
  const basemap = BASEMAPS.find((option) => option.id === basemapId) ?? BASEMAPS[0]

  // Stable identity so ScrollZoomGate's document listener is not torn down
  // and re-attached on every render.
  const handleMapLiveChange = useCallback((live) => setIsMapLive(live), [])

  // Three independent click listeners are still attached to this map — the
  // scroll gate, whichever gesture the cursor step armed, and Leaflet's own —
  // and none of them stops propagation, so they all still see every click.
  // What keeps that safe is not an assertion: at most one of them is ARMED,
  // because being armed means holding the register's single slot. The fourth
  // listener was AccessPointTool's, and it is gone with the pre-step.

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
                scrollWheelZoom={false}
                zoomControl={false}
              >
                {/* Top-right, pushed clear of the instruction bar by CSS. */}
                <ZoomControl position="topright" />
                <ScrollZoomGate active={isMapLive} onChange={handleMapLiveChange} />
                <TileLayer
                  key={basemap.id}
                  url={basemap.url}
                  attribution={basemap.attribution}
                  maxZoom={19}
                />
                {basemap.referenceUrl && (
                  <TileLayer
                    key={`${basemap.id}-reference`}
                    url={basemap.referenceUrl}
                    maxZoom={19}
                  />
                )}
                <MapRecenter center={mapCenter} zoom={18} />
                {/* THE LAYER STACK. It composes basemap → context → committed
                    → active editable from the store and the step definitions,
                    and mounts the active step's declared tools. */}
                <MapLayerStack />
              </MapContainer>

              {!isMapLive && (
                <p className="map-hint" aria-hidden="true">
                  Click the map to zoom with the scroll wheel
                </p>
              )}

              <BasemapControl value={basemapId} onChange={setBasemapId} />

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
