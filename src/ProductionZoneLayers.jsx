import { GeoJSON, Pane, Polygon } from 'react-leaflet'
import ProductionHatchPattern from './ProductionHatchPattern.jsx'
import { offParcelScrimRings, readToken } from './geo.js'

// Same lazy-cached token read DrawTool.jsx uses, and a SEPARATE copy of it on
// purpose rather than an export from there: DrawTool's cache is scoped to
// boundary geometry (--field, --halo), this one to the production-zone layers.
// Widening that one to serve both would make an unrelated component the owner
// of these colours.
//
// The reason it cannot happen at module load is DrawTool's and unchanged:
// main.jsx imports App.jsx — and through it this file — before it imports
// index.css, so a module-evaluation read returns empty strings. First render
// is after every module has evaluated, and the tokens are static from then on.
let layerColors = null

function getLayerColors() {
  if (!layerColors) {
    layerColors = {
      eligible: readToken('--eligible'),
      scrim: readToken('--scrim'),
      zoneStroke: readToken('--oxide'),
    }
  }
  return layerColors
}

// PANE Z-ORDER. Leaflet's own defaults are tilePane 200, overlayPane 400,
// markerPane 600. The three panes below sit BETWEEN the tiles and the
// overlay pane, which is what puts them under the boundary without anything
// in DrawTool having to change: DrawTool's Polygon and Polyline land in the
// default overlayPane at 400 and its vertex markers at 600, so the specified
// bottom-to-top order — basemap, scrim, eligible highlight, suggested zones,
// boundary, vertex markers — falls out of these three numbers alone.
//
// Raising these above 400 instead would have put the highlight over the
// boundary line and required reaching into DrawTool to lift it back.
// A declined suggestion still has to be findable and clickable, so it keeps a
// mark — but a faint one. Dotted rather than dashed: a dot carries no
// direction, which is right for an edge that is no longer asserting anything.
const DESELECTED_DASH = '1,4'
const DESELECTED_STROKE_OPACITY = 0.55

const SCRIM_PANE_Z = 350
const ELIGIBLE_PANE_Z = 360
const ZONE_PANE_Z = 370

// The scrim is the only hard gate in this interface and should be the only
// thing that reads as forbidden. Opaque enough that off-parcel ground is
// plainly out of play, short of hiding what is there — someone still needs to
// see the road their driveway meets.
const SCRIM_OPACITY = 0.55

// The highlight has to hold up over both dark canopy and bright bare soil.
// Presence comes from opacity rather than from a colour picked to beat the
// imagery — see the --eligible token's own note for why that differs from
// the halo-casing rule DrawTool established for LINES.
const ELIGIBLE_OPACITY = 0.32

// Suggested zones are drawn as DIAGONAL HATCH, with no outline and no fill of
// their own. All three parts of that matter:
//
//   NO STROKE. A hard edge reads as a surveyed line — a parcel boundary, a
//   fence, something someone measured and agreed. These are recommendations
//   about what ground is worth working, and their edge is the least certain
//   thing about them. The zone's extent is where the hatch stops.
//
//   NO FILL OF ITS OWN. Suggested ground IS eligible ground; a second fill
//   would imply a category that does not exist, and two translucent fills
//   stacked would double the opacity exactly where the zones sit, making the
//   suggestion read as MORE tinted rather than as differently marked. The
//   eligible tint shows through from the pane below and stays one weight
//   everywhere.
//
//   HATCH. Still the linear treatment against the highlight's tonal one, so
//   the two never compete — but as texture across an area rather than as a
//   line around one, which is what lets it have an extent without having a
//   border. The paint comes from a <pattern> the CSS points the fill at; see
//   ProductionHatchPattern.

/**
 * ProductionZoneLayers
 *
 * The three map layers of the production-zone step, read-only. Renders
 * nothing at all until a payload has arrived.
 *
 * WHAT IS NOT DRAWN HERE. The payload's five per-gate exclusion layers ship
 * and are held by App.jsx, and nothing renders them — the eligible union is
 * the only exclusion-derived thing drawn at rest. That is deliberate for this
 * branch, not an omission: they exist so the next branch can caption what a
 * drawing crossed, and drawing all five at once would say five things where
 * the highlight already says the one that matters.
 */
function ProductionZoneLayers({
  payload,
  boundaryPoints,
  deselectedIds,
  onToggleZone,
  selectionEnabled,
}) {
  if (!payload) return null

  const { eligible: eligibleColor, scrim, zoneStroke } = getLayerColors()
  const scrimRings = offParcelScrimRings(boundaryPoints)
  const zoneFeatures = payload.data?.suggested_zones?.features ?? []
  const eligibleUnion = payload.data?.eligible_union ?? null

  return (
    <>
      {/* Off-parcel scrim. A plain Polygon rather than GeoJSON: this is
          derived from the drawn boundary, so it is already in Leaflet's
          [lat, lng] order and its hole is just a second ring. */}
      <Pane name="production-scrim" style={{ zIndex: SCRIM_PANE_Z }}>
        {scrimRings && (
          <Polygon
            positions={scrimRings}
            pathOptions={{
              stroke: false,
              fillColor: scrim,
              fillOpacity: SCRIM_OPACITY,
              interactive: false,
            }}
          />
        )}
      </Pane>

      {/* Eligible highlight. Fill only, no stroke — see the --eligible token.
          Leaflet's GeoJSON reader honours MultiPolygon interior rings, so the
          union's holes render as holes with nothing done to them here. An
          unhighlighted island inside a highlighted region is excluded ground
          — a canopy pocket or a wet spot — and filling it would claim ground
          the gates rejected.

          KEYED ON THE PAYLOAD'S id. react-leaflet 4.2.1's GeoJSON only diffs
          `style` on update and ignores a changed `data` prop entirely, so a
          new payload has to arrive as a new component instance. Nothing in
          this branch replaces a payload in place, but the next one does. */}
      <Pane name="production-eligible" style={{ zIndex: ELIGIBLE_PANE_Z }}>
        {eligibleUnion && (
          <GeoJSON
            key={`eligible-${payload.id}`}
            data={eligibleUnion}
            style={{
              stroke: false,
              fillColor: eligibleColor,
              fillOpacity: ELIGIBLE_OPACITY,
              interactive: false,
            }}
          />
        )}
      </Pane>

      {/* Suggested zones. One GeoJSON per feature rather than one for the
          whole collection: each zone stays a separately addressable layer,
          which is what the next branch needs to make them selectable.

          fill stays TRUE so Leaflet emits a fill attribute for App.css to
          override with the pattern — fill: false would write fill="none",
          which is a value rather than an absence and would leave nothing for
          the stylesheet to replace. fillColor is never seen for the same
          reason the rule exists: the stylesheet wins over the attribute. */}
      <Pane name="production-zones" style={{ zIndex: ZONE_PANE_Z }}>
        {zoneFeatures.map((feature) => {
          const deselected = deselectedIds.has(feature.id)
          return (
            <GeoJSON
              // The key carries the selection state as well as the payload, so
              // a toggle remounts the layer. react-leaflet 4.2.1's GeoJSON
              // only diffs `style` and ignores everything else on update, and
              // the two states differ in more than style.
              key={`zone-${payload.id}-${feature.id}-${deselected ? 'off' : 'on'}`}
              data={feature}
              style={
                deselected
                  ? {
                      // A DELIBERATE EXCEPTION to this branch's no-outline
                      // rule. That rule exists because a hard edge reads as a
                      // surveyed line, and a suggestion's edge is the least
                      // certain thing about it. A DECLINED suggestion is not
                      // making that claim at all — it marks absence, and
                      // absence needs its own vocabulary rather than a
                      // quieter version of presence. Dotted, faint, no fill.
                      stroke: true,
                      color: zoneStroke,
                      weight: 1,
                      opacity: DESELECTED_STROKE_OPACITY,
                      dashArray: DESELECTED_DASH,
                      fill: false,
                      className: 'zone--deselected',
                      interactive: selectionEnabled,
                    }
                  : {
                      stroke: false,
                      fill: true,
                      className: 'zone--selected',
                      interactive: selectionEnabled,
                    }
              }
              eventHandlers={
                selectionEnabled ? { click: () => onToggleZone(feature.id) } : {}
              }
            />
          )
        })}
        <ProductionHatchPattern payload={payload} />
      </Pane>
    </>
  )
}

export default ProductionZoneLayers
