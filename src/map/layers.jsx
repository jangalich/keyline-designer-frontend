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
 * THE PRODUCTION-ZONE VISUAL LANGUAGE LIVES HERE NOW, and this file's previous
 * version said it would: "It does not reimplement the production-zone spike's
 * visual language -- the hatch, the caution markers, the per-gate overlays, the
 * 350/360/370/380/390/610 panes. Those are F4's to migrate."
 *
 * MIGRATED, NOT REDESIGNED. Every mark below is the spike's, with its rule and
 * its reasoning carried over verbatim: the off-parcel scrim, the feathered
 * eligible highlight, hatch with no outline for a suggestion, a dotted edge
 * with no fill for a declined one, a cased outline plus hatch for a shape the
 * user drew. What moved is the FILE, and it had to move: the spike drew scrim,
 * highlight and zones from one component into three panes it numbered itself,
 * and those three marks belong to three different BANDS of the composed stack
 * (context, context, editable). A component that spans bands cannot be placed
 * by a stack that composes them. See THE PANE NUMBERS below.
 *
 * THE PANE NUMBERS CHANGED AND THE ORDER DID NOT. The spike numbered its panes
 * 350 scrim / 360 eligible / 370 suggested / 380 drawn / 390 in-progress, all
 * between Leaflet's tilePane (200) and overlayPane (400), because it had to
 * slot under a boundary DrawTool rendered into overlayPane. The stack numbers
 * by band instead -- context 300, committed 310, editable 320, ten apart, in
 * declaration order within each -- and the same five marks come out in the same
 * relative order: scrim 300, highlight 301, suggested 320, drawn 321,
 * in-progress 322.
 *
 * ONE PANE KEPT ITS OWN NUMBER: the caution markers, at 610. That one is not
 * about this stack at all -- it is about Leaflet's markerPane at 600, which no
 * band z can clear. MapLayerStack renders it at the top level for that reason.
 */

import L from 'leaflet'
import { GeoJSON, Pane, Polygon, Polyline, Tooltip } from 'react-leaflet'

import { offParcelScrimRings, readToken } from '../geo.js'

/**
 * Its own lazily-filled token cache, for the reason DrawTool's has one:
 * main.jsx imports App.jsx -- and through it this file -- before index.css, so
 * a module-evaluation read returns empty strings. First render is after every
 * module has evaluated.
 *
 * A SECOND COPY RATHER THAN AN IMPORT OF DrawTool's, deliberately and for the
 * reason the spike's own layer file gave: each cache is scoped to the geometry
 * its own file draws, and widening one to serve another makes an unrelated
 * component the owner of these colours.
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
      eligible: readToken('--eligible'),
    }
  }
  return stackColors
}

/**
 * The colour a DECLARED TREATMENT resolves to.
 *
 * THE NAME COMES OFF THE DECLARATION AND THE VALUE COMES OFF :root, which is
 * how a second step got two marks of its own without a colour reaching this
 * file. A layer declaring `treatment: 'survey-embankment'` is asking for the
 * `--survey-embankment` token; this reads it, caches it for the reason
 * getStackColors() has a cache, and knows nothing else about it.
 *
 * A TREATMENT THAT NAMES NO TOKEN RESOLVES TO AN EMPTY STRING and Leaflet
 * draws the path in its own default. That is deliberately not an exception:
 * defineLayer() already refuses a treatment that is not a token-shaped name,
 * and a missing token is a stylesheet problem visible on the map rather than
 * a crash in the layer stack.
 */
const treatmentColors = new Map()

function treatmentColor(treatment) {
  if (!treatmentColors.has(treatment)) {
    treatmentColors.set(treatment, readToken(`--${treatment}`))
  }
  return treatmentColors.get(treatment)
}

// The halo-casing rule DrawTool established, and the reason is its: no single
// colour clears 3:1 against the range of tones in one aerial frame, so map
// geometry is cased rather than recoloured.
const LINE_WEIGHT = 2
const CASING_WEIGHT = 4

// A drawn zone carries the SAME hatch as a suggested one -- it is the same kind
// of thing, ground to work -- but unlike a suggestion it keeps an outline.
//
// That is not a contradiction of the no-outline rule, it is the reason for it.
// The rule says a hard edge reads as a line someone measured and agreed, which
// is wrong for a recommendation whose edge is its least certain part. A drawn
// zone's edge is exactly that: placed vertex by vertex, deliberately, and
// exact. The hatch says what the ground is for; the edge treatment says whether
// its boundary is a suggestion or a decision.
const DRAWN_LINE_WEIGHT = 1.5
const DRAWN_CASING_WEIGHT = 3

// The scrim is the only hard gate in this interface and should be the only
// thing that reads as forbidden. Opaque enough that off-parcel ground is
// plainly out of play, short of hiding what is there -- someone still needs to
// see the road their driveway meets.
const SCRIM_OPACITY = 0.55

// The highlight has to hold up over both dark canopy and bright bare soil.
// Presence comes from opacity rather than from a colour picked to beat the
// imagery -- see the --eligible token's own note for why that differs from the
// halo-casing rule DrawTool established for LINES.
const ELIGIBLE_OPACITY = 0.32

/** Committed geometry is settled: no dash, no fill weight, nothing to invite a click. */
const COMMITTED_FILL_OPACITY = 0.12

/**
 * A treated layer's fill, under its own cased edge.
 *
 * LIGHTER THAN THE COMMITTED FILL, on purpose. Two treated layers can and do
 * overlap -- the water step's two survey instruments report the same ground
 * from two surfaces, and cross_type_overlaps is the finding that they agree --
 * so a fill heavy enough to read on its own doubles exactly where the
 * agreement is and invents a third category out of two. The EDGE is the mark;
 * the fill is only enough to tie an edge to the ground inside it.
 */
const TREATMENT_FILL_OPACITY = 0.1

/**
 * A layer, drawn. The renderer is picked by `kind`; within `polygon`, the
 * treatment is picked by the layer's BAND and SOURCE -- settled work, a server
 * proposal being decided about, or a shape the user drew -- which are the
 * declaration's own words and not a step's name.
 */
export function StackLayer({
  layer,
  interactive = false,
  onFeatureClick,
  onLayerClick,
  focusedFeatureId = null,
}) {
  const Renderer = RENDERERS[layer.kind]
  // Not reachable: defineLayer() refuses an unknown kind at definition time.
  // Kept because the alternative to a null here is a blank map.
  if (!Renderer) return null

  return (
    // The pane IS the composed order, in the DOM: its z-index is the stack's
    // number and its classes name the band, the kind and the source, so "the
    // layers render in the declared z-order" is a fact about the document
    // rather than a comment.
    //
    // THE CLASSES ARE ALSO THE STYLING HOOK. App.css paints the hatch and
    // feathers the highlight through paint servers and filters, neither of
    // which a Leaflet pathOption can express -- and it now selects on these
    // vocabulary classes rather than on the spike's hardcoded pane names, so
    // the rules follow the declaration instead of following a step.
    <Pane
      name={layer.paneName}
      className={
        `stack-layer stack-layer--${layer.band} ` +
        `stack-layer--kind-${layer.kind} stack-layer--source-${layer.source}`
      }
      style={{ zIndex: layer.zIndex }}
    >
      <Renderer
        layer={layer}
        interactive={interactive}
        onFeatureClick={onFeatureClick}
        onLayerClick={onLayerClick}
        focusedFeatureId={focusedFeatureId}
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
 * THE OFF-PARCEL SCRIM: everything around the parcel, dimmed.
 *
 * The one hard gate in this interface, and the only mark that should read as
 * forbidden. Off-parcel ground is not the user's to take, full stop -- unlike
 * ineligible ground inside the parcel, which is theirs and merely unsuitable.
 *
 * A plain Polygon rather than GeoJSON: this is derived from the committed
 * boundary, so it is already in Leaflet's [lat, lng] order and its hole is just
 * a second ring. offParcelScrimRings() builds it, and returns null for fewer
 * than three points -- there is no enclosed parcel to exclude from the dim yet,
 * and dimming the entire map would be wrong.
 */
function ScrimLayer({ layer }) {
  const rings = offParcelScrimRings(layer.parcel ?? [])
  if (!rings) return null

  const { scrim } = getStackColors()
  return (
    <Polygon
      positions={rings}
      interactive={false}
      pathOptions={{ stroke: false, fillColor: scrim, fillOpacity: SCRIM_OPACITY }}
    />
  )
}

/**
 * THE ELIGIBLE HIGHLIGHT: the ground that cleared every gate, tinted.
 *
 * Fill only, no stroke -- see the --eligible token. Leaflet's GeoJSON reader
 * honours MultiPolygon interior rings, so the union's holes render as holes
 * with nothing done to them here. An unhighlighted island inside a highlighted
 * region is excluded ground -- a canopy pocket or a wet spot -- and filling it
 * would claim ground the gates rejected.
 *
 * KEYED ON THE GEOMETRY. react-leaflet 4.2.1's GeoJSON only diffs `style` on
 * update and ignores a changed `data` prop entirely, so a new payload has to
 * arrive as a new component instance.
 *
 * A HIGHLIGHT RATHER THAN A DIM OF ITS COMPLEMENT, which is a real choice and
 * was made twice. The placeholder stack drew the INELIGIBLE side, reasoning
 * that a highlight invites and the user needs to know where a draw will be
 * refused. The shipped production-zone step draws the ELIGIBLE side, and it
 * wins here for two reasons that only apply once both are on one map: the
 * off-parcel scrim above is already a dim, and a second dim inside the parcel
 * would make "not yours" and "not suitable" the same mark; and drawing IS
 * allowed over ineligible ground -- clampToBoundary() clamps to the parcel and
 * to nothing else, precisely so a user can cross an exclusion knowingly and be
 * cautioned rather than stopped. Dimming ground you are allowed to draw on
 * states a prohibition that is not there.
 */
function HighlightLayer({ layer }) {
  const { eligible } = getStackColors()
  return (
    <GeoJSON
      key={`highlight-${layer.paneName}`}
      data={layer.geometry}
      interactive={false}
      style={{ stroke: false, fillColor: eligible, fillOpacity: ELIGIBLE_OPACITY }}
    />
  )
}

/**
 * NOTHING. A `reference` layer is data the tools consume and no one paints --
 * see LAYER_KINDS' note in stepDefinitions.js. It has a renderer only so that
 * "every kind has one" stays true and StepTools' no-renderer warning does not
 * fire on a layer that is correctly blank.
 */
function ReferenceLayer() {
  return null
}

/**
 * A FeatureCollection's features, in one of three treatments.
 *
 * INTERACTIVE ONLY WHEN A TOOL SAID SO. `interactive` is not a style prop here
 * -- it is whether these paths take clicks at all. A Leaflet path click also
 * reaches the map, so an interactive layer under an armed draw tool would
 * toggle itself AND place a vertex on one click. The arming register means
 * only one of the two can be live, and this prop is where that lands.
 *
 * THE TREATMENT COMES OFF THE DECLARATION, not off a step id:
 *
 *   band 'committed'    settled. A thin line and a light fill; nothing to
 *                       invite a click except the navigation the stack offers.
 *
 *   source 'proposals'  a candidate being decided about. Hatch with no outline
 *                       and no fill of its own -- suggested ground IS eligible
 *                       ground, so a second fill would imply a category that
 *                       does not exist, and two translucent fills stacked
 *                       would double the opacity exactly where the zones sit.
 *
 *                       THERE IS NO DECLINED TREATMENT ANY MORE. A deselected
 *                       suggestion used to be drawn as a dotted edge with no
 *                       fill, on the argument that absence needs its own
 *                       vocabulary rather than a quieter version of presence.
 *                       That argument was right while the map was the only
 *                       place a suggestion appeared: something had to say the
 *                       zone was still available to take back. The tab strip
 *                       says it now -- the feature keeps its tab, with the eye
 *                       closed -- so the map does not have to, and a shape
 *                       nobody is committing is simply not drawn. See the
 *                       filter in FeatureLayer.
 *
 *   source 'draft'      a shape the user drew. Hatch, plus a cased outline,
 *                       because its edge is a decision rather than a
 *                       suggestion.
 *
 * ONE GeoJSON PER FEATURE rather than one for the whole collection: each stays
 * a separately addressable layer, which is what makes them selectable and what
 * lets a 422 colour exactly the offending one.
 */
function FeatureLayer({
  layer,
  interactive,
  onFeatureClick,
  onLayerClick,
  focusedFeatureId = null,
}) {
  const { field, accent, ink, halo } = getStackColors()
  const selected = new Set(layer.selectedFeatureIds ?? [])
  const rejections = layer.rejections ?? {}
  const isEditable = layer.band === 'editable'
  const isProposal = layer.source === 'proposals'
  const isDrawn = layer.source === 'draft'
  // DECLARED, NOT DERIVED, and that is the whole of the field's reason: band
  // and source are three treatments for three MEANINGS, and a step whose two
  // layers share a band, a source and a meaning had nothing left to say them
  // apart with. See `treatment` in stepDefinitions.js's LAYER SCHEMA.
  const treatment = layer.treatment ?? null

  /**
   * EYE-OFF IS NOT DRAWN AT ALL, and this filter is the whole of what replaced
   * the dotted declined treatment.
   *
   * The eye means "in the commit". A feature that is not in the commit has
   * nothing to say on a map of what this parcel is going to be, and drawing it
   * in a special way was only ever a way of keeping it findable -- which is
   * the tab strip's job now, and a better one, because a tab is legible at any
   * zoom and a dotted hairline over canopy is not.
   *
   * ONLY IN THE EDITABLE BAND. The committed band is what the document says
   * happened; the draft's selection has no bearing on it.
   */
  const features = isEditable
    ? layer.features.filter((feature) => selected.has(feature.id))
    : layer.features

  return (
    <>
      {/* THE CASING PASS, FIRST so it paints underneath -- within one SVG pane,
          later elements draw on top.

          TWO KINDS OF LAYER ARE CASED, and both because they have an OUTLINE
          to case: a shape the user drew, and a layer that declared a
          `treatment`. A plain suggestion is hatched with no outline at all,
          so there is nothing to lay a casing under.

          THE CASING IS WHY A TREATMENT ONLY HAS TO DIFFER FROM ITS SIBLING.
          --halo under the line is what carries it over water, canopy and bare
          soil in one frame; the token on top is what says which of the two
          instruments drew it. Neither colour is trying to beat the imagery,
          because no single colour can. */}
      {isDrawn || treatment
        ? features.map((feature) => (
            <GeoJSON
              key={`casing-${feature.id}`}
              data={feature}
              interactive={false}
              style={{
                color: halo,
                weight: treatment ? CASING_WEIGHT : DRAWN_CASING_WEIGHT,
                fill: false,
              }}
            />
          ))
        : null}
      {features.map((feature) => {
        // EVERY FEATURE STILL HERE IS IN THE COMMIT -- the filter above took
        // the others out. The store's selection covers drawn shapes as well as
        // proposals now, so this is one question with one answer rather than
        // "a proposal unless it was taken out, and a drawn shape always".
        const isFocused = feature.id === focusedFeatureId
        const rejection = rejections[feature.id] ?? null
        return (
          <GeoJSON
            // react-leaflet 4.2.1's GeoJSON ignores a changed `data` prop --
            // it diffs only `style` -- so anything that changes the geometry
            // or the styling has to arrive as a new instance via the key.
            key={`${feature.id}:${isFocused}:${interactive}:${rejection ? 'bad' : 'ok'}`}
            data={feature}
            // Top-level, for the reason RingLayer gives: pathOptions is
            // applied with setStyle() and cannot make a path stop taking
            // clicks. The key above is what re-creates it when this flips.
            interactive={interactive}
            style={styleFor({
              feature,
              isFocused,
              isEditable,
              isProposal,
              isDrawn,
              treatment,
              rejection,
              colors: { field, accent, ink, halo },
            })}
            eventHandlers={
              interactive
                ? {
                    // THE CLICK STOPS HERE. A Leaflet path click also reaches
                    // the map, and the map's own click is what clears the
                    // focus -- so without this, focusing a feature would clear
                    // the focus in the same gesture. Leaflet's own helper
                    // rather than the DOM's: the handler is given Leaflet's
                    // wrapped event.
                    click: (event) => {
                      L.DomEvent.stopPropagation(event)
                      if (isEditable) onFeatureClick?.(layer, feature)
                      else onLayerClick?.(layer, feature)
                    },
                  }
                : undefined
            }
          >
            {/* THE SERVER'S OWN REASON, ON THE OFFENDING FEATURE. A 422 is
                rendered per feature and this is the map half of it: the
                rejected shape is outlined in the alert colour above and says
                why when you point at it. Never a banner -- see
                session_api._rejection_payload(). */}
            {/* PERMANENT, not on hover. A rejection is not extra detail for
                someone who goes looking -- it is the reason the commit did not
                happen, and it has to be readable off the map beside the shape
                it is about. */}
            {rejection ? (
              <Tooltip permanent direction="center" className="zone-rejection-tip">
                {rejection.reason}
              </Tooltip>
            ) : null}
          </GeoJSON>
        )
      })}
    </>
  )
}

/**
 * The style for one feature, by treatment.
 *
 * `className` is what App.css hangs the hatch on: a stylesheet rule beats the
 * fill ATTRIBUTE Leaflet writes, which is the only way to point a Leaflet path
 * at a paint server. `fill` stays TRUE wherever the hatch applies, because
 * `fill: false` writes fill="none" -- a value rather than an absence, and there
 * would be nothing left for the stylesheet to replace.
 */
/**
 * THE FOCUS MARK, AS A CLASS RATHER THAN A pathOption.
 *
 * The feature the user is looking at is drawn marked, so that clicking a tab
 * and clicking a shape are visibly the same act. It is a CLASS because the
 * mark is a stroke treatment App.css owns beside the hatch and the casing --
 * putting a colour and a weight here would make the focus a second visual
 * vocabulary maintained in a second file.
 *
 * IT DOES NOT REPLACE A TREATMENT, it adds to one. A focused drawn zone is
 * still a drawn zone; a focused suggestion is still hatched. Focus says "this
 * is the one you are reading", which is orthogonal to what the shape IS.
 */
function focusClass(base, isFocused) {
  return isFocused ? `${base} zone--focused` : base
}

function styleFor({ isFocused, isEditable, isProposal, isDrawn, treatment, rejection, colors }) {
  if (rejection) {
    // Rejected geometry is neither settled nor a candidate: it is the reason
    // the commit did not happen. Solid, alert-coloured, and unmissable.
    return {
      stroke: true,
      color: readToken('--alert'),
      weight: LINE_WEIGHT,
      fill: true,
      fillColor: readToken('--alert'),
      fillOpacity: 0.25,
      className: 'zone--rejected',
    }
  }

  if (isDrawn) {
    return {
      stroke: true,
      color: colors.accent,
      weight: DRAWN_LINE_WEIGHT,
      fill: true,
      className: focusClass('zone--drawn', isFocused),
    }
  }

  // A DECLARED TREATMENT BEATS THE DERIVED ONES, and it sits above the
  // proposal arm rather than beside it: a treated layer is still a proposal
  // being decided about, it just says which KIND of proposal in its own line
  // rather than borrowing the one every proposal shares.
  //
  // A LINE RATHER THAN A HATCH. The hatch says "ground to work" and belongs to
  // the step that works ground. A survey zone is ground to WALK -- nothing is
  // built on it yet and its edge is the envelope you would pace out -- so it
  // is drawn as an edge with a light fill under it, cased in --halo by the
  // pass above.
  if (treatment) {
    return {
      stroke: true,
      color: treatmentColor(treatment),
      weight: LINE_WEIGHT,
      fill: true,
      fillColor: treatmentColor(treatment),
      fillOpacity: TREATMENT_FILL_OPACITY,
      className: focusClass(`zone--${treatment}`, isFocused),
    }
  }

  if (isProposal && isEditable) {
    // Hatch, no outline, no fill of its own. A deselected suggestion does not
    // reach here -- FeatureLayer does not render it at all -- so there is one
    // proposal treatment rather than two.
    return {
      stroke: false,
      fill: true,
      className: focusClass('zone--selected', isFocused),
    }
  }

  // Settled: the committed band, and any polygon layer a step declares that is
  // neither a proposal nor a drawn shape.
  return {
    color: colors.ink,
    weight: 1,
    fillColor: colors.ink,
    fillOpacity: COMMITTED_FILL_OPACITY,
  }
}

const RENDERERS = {
  ring: RingLayer,
  scrim: ScrimLayer,
  highlight: HighlightLayer,
  polygon: FeatureLayer,
  reference: ReferenceLayer,
}

export { RingLayer, ScrimLayer, HighlightLayer, FeatureLayer, ReferenceLayer }
