/**
 * layers.jsx
 *
 * HOW EACH KIND OF LAYER IS DRAWN. One renderer per value of `kind`, chosen by
 * the declaration and by nothing else -- no renderer here is reachable from
 * only one step, and none of them knows a step id.
 *
 * EVERY LAYER GETS ITS OWN PANE, named for the layer and z-indexed by the
 * stack. That is not decoration: Leaflet decides paint order by pane z-index,
 * so a band that is a number in layerStack.js has to become a pane here or the
 * ordering is a comment rather than a fact. It also means the composed order
 * is inspectable -- the panes are in the DOM, with their z-indexes on them.
 *
 * WHAT THIS FILE DOES NOT DO. It does not reimplement the production-zone
 * spike's visual language -- the hatch, the caution markers, the per-gate
 * overlays, the 350/360/370/380/390/610 panes. Those are F4's to migrate, and
 * a second copy of them written here against the same tokens would be the
 * thing F4 has to delete before it can start.
 */

import polygonClipping from 'polygon-clipping'
import { GeoJSON, Pane, Polygon, Polyline } from 'react-leaflet'

import { multiPolygonToLatLngs, readToken, ringToGeoJSON, toMultiPolygon } from '../geo.js'

/**
 * Its own lazily-filled token cache, for the reason DrawTool's and
 * ProductionZoneLayers' each have one: main.jsx imports App.jsx -- and through
 * it this file -- before index.css, so a module-evaluation read returns empty
 * strings. First render is after every module has evaluated.
 *
 * A THIRD COPY RATHER THAN AN IMPORT OF EITHER, deliberately and for the
 * reason ProductionZoneLayers already gives: each cache is scoped to the
 * geometry its own file draws, and widening one to serve another makes an
 * unrelated component the owner of these colours.
 */
let stackColors = null

function getStackColors() {
  if (!stackColors) {
    stackColors = {
      field: readToken('--field'),
      halo: readToken('--halo'),
      scrim: readToken('--scrim'),
      ink: readToken('--ink-muted'),
      accent: readToken('--oxide'),
    }
  }
  return stackColors
}

// The halo-casing rule DrawTool established, and the reason is its: no single
// colour clears 3:1 against the range of tones in one aerial frame, so map
// geometry is cased rather than recoloured.
const LINE_WEIGHT = 2
const CASING_WEIGHT = 4

/**
 * The ineligible dim.
 *
 * LIGHTER THAN THE OFF-PARCEL SCRIM (0.55), and the difference is the point.
 * Off-parcel ground is not the user's to take, full stop; ineligible ground
 * inside the parcel is theirs and is merely unsuitable, which is a weaker
 * statement and should read as one. Same token, so the two are plainly the
 * same KIND of mark.
 */
const DIM_OPACITY = 0.34

/** Committed geometry is settled: no dash, no fill weight, nothing to invite a click. */
const COMMITTED_FILL_OPACITY = 0.12
const CONTEXT_FILL_OPACITY = 0.18
const SELECTED_FILL_OPACITY = 0.3

/**
 * A layer, drawn. The renderer is picked by `kind`; the band decides the
 * styling weight, so the same geometry reads differently as context, as
 * settled work, and as the thing being edited.
 */
export function StackLayer({ layer, interactive = false, onFeatureClick, onLayerClick }) {
  const Renderer = RENDERERS[layer.kind]
  // Not reachable: defineLayer() refuses an unknown kind at definition time.
  // Kept because the alternative to a null here is a blank map.
  if (!Renderer) return null

  return (
    // The pane IS the composed order, in the DOM: its z-index is the stack's
    // number and its class names the band, so "the layers render in the
    // declared z-order" is a fact about the document rather than a comment.
    <Pane
      name={layer.paneName}
      className={`stack-layer stack-layer--${layer.band}`}
      style={{ zIndex: layer.zIndex }}
    >
      <Renderer
        layer={layer}
        interactive={interactive}
        onFeatureClick={onFeatureClick}
        onLayerClick={onLayerClick}
      />
    </Pane>
  )
}

/**
 * A ring of [lat, lng] points, read-only.
 *
 * THE EDITABLE RING HAS NO RENDERER HERE. When a step arms `draw` over a ring,
 * DrawTool renders it -- the geometry and the gesture are one component in
 * that file (a module-level colour memo, a render into the default
 * overlayPane, a map-level click listener), and ZoneDrawTool.jsx already
 * documents at length why prising them apart is a rewrite rather than a
 * refactor. So the stack draws a ring only where nothing is editing it: the
 * committed band, and an editable ring on a step that declares no draw.
 */
function RingLayer({ layer, interactive, onLayerClick }) {
  const { field, halo } = getStackColors()
  const closed = layer.ring.length >= 3
  const Shape = closed ? Polygon : Polyline
  const handlers = interactive && onLayerClick ? { click: () => onLayerClick(layer) } : undefined

  return (
    <>
      {/* `interactive` is a TOP-LEVEL prop, not a pathOption, and the
          difference is not cosmetic: react-leaflet applies pathOptions with
          setStyle(), and Leaflet's SVG renderer adds the leaflet-interactive
          class once, in _initPath, from the options the path was CONSTRUCTED
          with. An `interactive: false` inside pathOptions is read by nothing
          and the path still takes every click. */}
      <Shape
        positions={layer.ring}
        interactive={false}
        pathOptions={{ color: halo, weight: CASING_WEIGHT, fill: false }}
      />
      <Shape
        positions={layer.ring}
        interactive={Boolean(handlers)}
        pathOptions={{
          color: field,
          weight: LINE_WEIGHT,
          fill: closed,
          fillOpacity: closed ? COMMITTED_FILL_OPACITY : 0,
        }}
        eventHandlers={handlers}
      />
    </>
  )
}

/**
 * The INELIGIBLE-AREA DIM.
 *
 * The declaration's geometry names the ELIGIBLE ground; what is drawn is the
 * parcel MINUS it. Drawing the eligible side instead would be the same
 * information and the wrong message -- a highlight invites, and this layer's
 * job is to say where a draw will be refused BEFORE the user spends a gesture
 * finding out.
 *
 * Clipped to the parcel rather than to the viewport, so it never makes a claim
 * about the neighbour's land: off-parcel ground is out of play for a reason
 * this layer is not making, and the spike's own scrim already says that.
 *
 * Renders nothing when there is no parcel to clip to -- a dim with no hole in
 * it is a map with the lights off.
 */
function MaskLayer({ layer }) {
  const parcel = layer.parcel ?? []
  if (parcel.length < 3) return null

  const eligible = toMultiPolygon(layer.geometry)
  if (!eligible.length) return null

  const ineligible = polygonClipping.difference([[ringToGeoJSON(parcel)]], eligible)
  if (!ineligible.length) return null

  const { scrim } = getStackColors()
  return (
    <Polygon
      positions={multiPolygonToLatLngs(ineligible)}
      interactive={false}
      pathOptions={{ stroke: false, fillColor: scrim, fillOpacity: DIM_OPACITY }}
    />
  )
}

/**
 * A FeatureCollection's features.
 *
 * INTERACTIVE ONLY WHEN A TOOL SAID SO. `interactive` is not a style prop here
 * -- it is whether these paths take clicks at all. A Leaflet path click also
 * reaches the map, so an interactive layer under an armed draw tool would
 * toggle itself AND place a vertex on one click. The arming register means
 * only one of the two can be live, and this prop is where that lands.
 */
function FeatureLayer({ layer, interactive, onFeatureClick, onLayerClick }) {
  const { field, accent, ink } = getStackColors()
  const selected = new Set(layer.selectedFeatureIds ?? [])
  const isEditable = layer.band === 'editable'

  return (
    <>
      {layer.features.map((feature) => {
        const isSelected = selected.has(feature.id)
        const color = isEditable ? (isSelected ? accent : field) : ink
        return (
          <GeoJSON
            // react-leaflet 4.2.1's GeoJSON ignores a changed `data` prop --
            // it diffs only `style` -- so anything that changes the geometry
            // or the styling has to arrive as a new instance via the key.
            key={`${feature.id}:${isSelected}:${interactive}`}
            data={feature}
            // Top-level, for the reason RingLayer gives: pathOptions is
            // applied with setStyle() and cannot make a path stop taking
            // clicks. The key above is what re-creates it when this flips.
            interactive={interactive}
            pathOptions={{
              color,
              weight: isSelected ? LINE_WEIGHT : 1,
              fillColor: color,
              fillOpacity: isSelected
                ? SELECTED_FILL_OPACITY
                : isEditable
                  ? CONTEXT_FILL_OPACITY
                  : COMMITTED_FILL_OPACITY,
            }}
            eventHandlers={
              interactive
                ? {
                    click: () =>
                      isEditable
                        ? onFeatureClick?.(layer, feature)
                        : onLayerClick?.(layer, feature),
                  }
                : undefined
            }
          />
        )
      })}
    </>
  )
}

const RENDERERS = { ring: RingLayer, mask: MaskLayer, polygon: FeatureLayer }

export { RingLayer, MaskLayer, FeatureLayer }
