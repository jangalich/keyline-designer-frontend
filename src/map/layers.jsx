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

import { Fragment } from 'react'
import L from 'leaflet'
import { GeoJSON, Marker, Pane, Polygon, Polyline, Tooltip } from 'react-leaflet'

import { offParcelScrimRings, readToken } from '../geo.js'
import { marksItsOwnEdge, zoneMark } from '../ProductionHatchPattern.jsx'

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
 * A TREATMENT'S COLOUR IS READ HERE AGAIN, THROUGH zoneMark(), and the history
 * of that is worth the line.
 *
 * `treatmentColor()` once read `--<treatment>` off the document so a treated
 * layer could be stroked in its own colour, and was deleted when every zone
 * lost its outline -- with a note saying a second reader of those tokens, left
 * lying here unused, was "a colour waiting to be applied to an outline by
 * whoever finds it". The outline came back for the tinted treatments, so the
 * reader is needed again; what has NOT come back is a second reader. There is
 * one table of what a treatment paints with (ProductionHatchPattern's
 * TREATMENT_MARKS) and one resolver over it, and this file calls that rather
 * than reading tokens by a name it assembles itself.
 */

/**
 * HOW PRESENT A ZONE'S MARK IS, in the levels index.css declares.
 *
 * TWO SCALES, ONE PER KIND OF INK, and the split is index.css's -- see the
 * --tint-* block for the arithmetic. `--pattern-*` is ink at full strength: a
 * hatch's strokes, and a tinted zone's OUTLINE. `--tint-*` is the screened
 * wash behind that outline, which needs lower alphas for the same reason a
 * hatch does not: a wash covers all of the ground it is over, so at the
 * pattern scale's top level it would stop being screened and start being
 * paint.
 *
 * READ AS TOKENS RATHER THAN WRITTEN HERE, for the reason every colour on this
 * surface is: Leaflet cannot resolve a var() in a pathOption, so the value has
 * to be read off the document, and reading it is not the same as owning it.
 * The four steps still to come inherit these rather than each inventing a set.
 */
const LEVELS = new Map()

function level(scale, name) {
  const key = `--${scale}-${name}`
  if (!LEVELS.has(key)) LEVELS.set(key, Number(readToken(key)))
  return LEVELS.get(key)
}

function patternLevel(name) {
  return level('pattern', name)
}

function tintLevel(name) {
  return level('tint', name)
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

/** Committed geometry is settled: no dash, no fill weight, and no click to make. */
const COMMITTED_FILL_OPACITY = 0.12


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
  const takesClicks = Boolean(interactive && onLayerClick)

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
      {/* THE WHOLE RING IS THE HIT AREA, INTERIOR INCLUDED, and it has exactly
          one caller: DeleteGesture's RingDelete, which mounts this over an
          editable ring while `delete` is ARMED. A clear-the-boundary gesture
          that demanded a 2px line would be a gesture nobody can make.

          THE PREVIOUS BRANCH SPLIT THE FILL OFF SO THAT IT TOOK NO CLICKS,
          because the committed boundary ring was interactive whenever a
          session existed -- which put a cursor-moving click target over the
          entire parcel, and every click on bare ground threw the wizard back
          to `Start a different boundary`. That split has nothing left to do:
          the committed band takes no clicks at all now (see MapLayerStack), so
          the guarantee lives at the band rather than inside this renderer, and
          the only ring that is ever interactive is one a tool armed. */}
      <Shape
        positions={layer.ring}
        interactive={takesClicks}
        pathOptions={{
          color: field,
          weight: LINE_WEIGHT,
          fill: closed,
          fillOpacity: closed ? COMMITTED_FILL_OPACITY : 0,
        }}
        eventHandlers={
          takesClicks
            ? {
                // THE CLICK STOPS HERE, which FeatureLayer's already did and
                // this one did not. A Leaflet path click also reaches the
                // map, and the map's own click is what clears the focus -- so
                // without this an armed ring delete would clear the ring AND
                // blur, from a listener documented to fire "only when the
                // click reached nothing".
                click: (event) => {
                  L.DomEvent.stopPropagation(event)
                  onLayerClick(layer)
                },
              }
            : undefined
        }
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
 *   band 'committed'    settled. A thin line and a light fill, and nothing
 *                       to click: the stack mounts this band read-only.
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
 *                       says it now -- the feature keeps its tab, with its
 *                       box unchecked -- so the map does not have to, and a
 *                       shape nobody is committing is simply not drawn. See
 *                       the filter in FeatureLayer.
 *
 *   source 'draft'      a shape the user drew. Hatch, plus a cased outline,
 *                       because its edge is a decision rather than a
 *                       suggestion.
 *
 * ONE GeoJSON PER FEATURE rather than one for the whole collection: each stays
 * a separately addressable layer, which is what makes them selectable and what
 * lets a 422 colour exactly the offending one.
 */
/**
 * WHICH CANDIDATE A FEATURE BELONGS TO, and which candidate is focused.
 *
 * The definition's `groupOf` (a network id off a branch) when the layer
 * carries one; the feature's own id otherwise, which is what every feature
 * was before grouping existed. The focus slot holds whatever was clicked --
 * a tab's id (a group) or a feature's id (a branch) -- so the focused GROUP
 * is resolved from either: a feature in this layer with that id says which
 * group it is in, and an id matching no feature is taken as a group id.
 */
function groupResolver(layer) {
  const groupOf = layer.groupOf ?? null
  const of = (feature) => (groupOf ? groupOf(feature) ?? feature.id : feature.id)
  const focused = (focusedFeatureId, features) => {
    if (focusedFeatureId == null) return null
    const hit = features.find((feature) => feature.id === focusedFeatureId)
    return hit ? of(hit) : focusedFeatureId
  }
  return { of, focused }
}

/**
 * WHICH FEATURES A LAYER DRAWS, given the checkboxes and the focus.
 *
 * THE CHECKBOX RULE. Unchecked is not drawn at all, and this filter is the
 * whole of what replaced the dotted declined treatment. Checked means "in the
 * commit". A feature that is not in the commit has nothing to say on a map of
 * what this parcel is going to be, and drawing it in a special way was only
 * ever a way of keeping it findable -- which is the tab strip's job now. ONLY
 * IN THE EDITABLE BAND: the committed band is what the document says
 * happened.
 *
 * THE VISIBILITY EXCEPTION. A layer declaring `show: 'focused'` draws ONLY
 * the focused candidate -- the group the focus resolves to -- and nothing
 * when nothing is focused, WHATEVER THE BOXES SAY. It is an exception to the
 * pattern language rather than an extension of it: everywhere else the
 * checkbox decides what is drawn and focus decides how present it is. Here
 * focus alone decides, because three routed networks over one parcel is
 * unreadable line density.
 *
 * THE STEP THAT GETS IT DOES NOT CONTRADICT ITSELF BY GETTING IT. Roads binds
 * its checkboxes to its focus (`selection.follows`), so through the strip the
 * focused candidate IS the checked one and this rule draws what the checkbox
 * rule would have drawn. The rule is still the exception, and it is RESOLVED
 * from that one step-level declaration rather than written on a layer -- see
 * stepDefinitions.js, LAYER SCHEMA items 7 and 12, and index.css beside the
 * levels it departs from.
 */
function visibleFeatures(layer, focusedFeatureId) {
  const { of, focused } = groupResolver(layer)
  if (layer.show === 'focused') {
    const group = focused(focusedFeatureId, layer.features)
    return group == null ? [] : layer.features.filter((feature) => of(feature) === group)
  }
  if (layer.band !== 'editable') return layer.features
  const selected = new Set(layer.selectedFeatureIds ?? [])
  return layer.features.filter((feature) => selected.has(feature.id))
}

/** Is this feature the focused one -- itself, or a member of the focused group. */
function isFocusedFeature(layer, feature, focusedFeatureId) {
  const { of, focused } = groupResolver(layer)
  const group = focused(focusedFeatureId, layer.features)
  return group != null && of(feature) === group
}

function FeatureLayer({ layer, interactive, onFeatureClick, focusedFeatureId = null }) {
  const { field, accent, ink, halo } = getStackColors()
  const rejections = layer.rejections ?? {}
  const isDrawn = layer.source === 'draft'
  const isCommitted = layer.band === 'committed'
  // DECLARED, NOT DERIVED, and that is the whole of the field's reason: band
  // and source are three treatments for three MEANINGS, and a step whose two
  // layers share a band, a source and a meaning had nothing left to say them
  // apart with. See `treatment` in stepDefinitions.js's LAYER SCHEMA.
  const treatment = layer.treatment ?? null

  // The checkbox rule, and the visibility exception. See visibleFeatures.
  const features = visibleFeatures(layer, focusedFeatureId)

  return (
    <>
      {/* THE CASING PASS, FIRST so it paints underneath -- within one SVG pane,
          later elements draw on top.

          ONLY A DRAWN SHAPE IS CASED. A tinted zone HAS an outline and could
          be, and deliberately is not: its line is the wash's own colour and a
          white ring around it read as a sticker edge rather than as the mark.
          The cost is stated rather than hidden -- see the --survey-* note in
          index.css. The halo-casing rule is unchanged for everything that
          still uses it (the boundary ring, a drawn zone): no single colour
          clears the range of tones in one aerial frame, so those marks are
          cased rather than recoloured. Water's mark now answers that with its
          own two values instead, and takes the exposure that comes with it.

          A HATCH TAKES NO CASING EITHER, for the older reason: it has no edge
          to lay one under. */}
      {isDrawn
        ? features.map((feature) => (
            <GeoJSON
              key={`casing-${feature.id}`}
              data={feature}
              interactive={false}
              style={{ color: halo, weight: DRAWN_CASING_WEIGHT, fill: false }}
            />
          ))
        : null}
      {features.map((feature) => {
        // EVERY FEATURE STILL HERE IS IN THE COMMIT -- the filter above took
        // the others out. The store's selection covers drawn shapes as well as
        // proposals now, so this is one question with one answer rather than
        // "a proposal unless it was taken out, and a drawn shape always".
        const isFocused = isFocusedFeature(layer, feature, focusedFeatureId)
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
              isCommitted,
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
                    //
                    // ONE THING A FEATURE CLICK CAN MEAN, where there used to
                    // be two. The `else` arm called the stack's `onLayerClick`
                    // and was how a committed feature offered navigation; the
                    // committed band takes no clicks now (see MapLayerStack),
                    // so the only interactive feature layer is one a tool is
                    // rendering, and `interactive` here is that tool's answer.
                    click: (event) => {
                      L.DomEvent.stopPropagation(event)
                      onFeatureClick?.(layer, feature)
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

/**
 * WHICH OF THE THREE LEVELS A ZONE IS AT, and the order is the order of facts.
 *
 *   focused    the detail panel is describing it. Beats everything, including
 *              a committed layer -- clicking committed geometry is how you
 *              read it, and the answer must not be quieter than its neighbours.
 *   committed  the document says this happened. Settled, and the quietest,
 *              because from the roads step onward several committed layers
 *              share the map and each is context for the step in hand.
 *   active     an uncommitted zone that is in the commit. The base state.
 *
 * A ZONE THAT IS NOT IN THE COMMIT HAS NO LEVEL, because it is not drawn at
 * all -- FeatureLayer filters it out before this is reached. That is the
 * checkbox's own treatment and it predates this scheme: a feature nobody is
 * committing has nothing to say on a map of what this parcel is going to be,
 * and its tab is where it stays findable.
 */
function stateName({ isFocused, isCommitted }) {
  if (isFocused) return 'focused'
  if (isCommitted) return 'committed'
  return 'active'
}

function patternLevelFor(state) {
  return patternLevel(stateName(state))
}

/**
 * HOW HEAVY A MARK'S FILL IS IN THIS STATE -- the tint scale for a wash, the
 * pattern scale for everything else.
 *
 * THE BRANCH IS ON THE MARK'S KIND, not on the treatment's name. A step added
 * later declares a kind in one table and inherits whichever scale that kind
 * uses, instead of this function growing a list of step names.
 *
 * A STIPPLE IS ON THE PATTERN SCALE, WITH THE HATCH, and that is the same
 * argument index.css makes for splitting the two scales in the first place: a
 * wash covers all of the ground it is over, so at the pattern scale's top
 * level it stops being a screen and becomes paint. A dot field does not -- it
 * inks an eighth of what it covers, the imagery reads through the gaps like the
 * hatch's, and the whole point of the mark is that it is DISCRETE INK sitting
 * on the ground rather than a veil over it. So a stippled zone's dots and its
 * outline are on ONE scale, which is also what makes the three levels hold
 * for it in the same proportions they hold for a hatch.
 */
function fillLevelFor(mark, state) {
  return mark?.kind === 'tint' ? tintLevel(stateName(state)) : patternLevel(stateName(state))
}

function styleFor({ isFocused, isCommitted, isDrawn, treatment, rejection, colors }) {
  if (rejection) {
    // THE ONE MARK ON THIS SURFACE THAT STILL CARRIES A STROKE, and it is not
    // a zone STATE -- it is the reason the commit did not happen. The pattern
    // language describes what ground is for and how settled the decision about
    // it is; a 422 is neither, it is the server refusing this exact shape, and
    // it has to be findable among zones that all look correct. Solid,
    // alert-coloured, unmissable, with the server's own reason on it.
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

  const state = { isFocused, isCommitted }
  const mark = treatment ? zoneMark(treatment) : null
  const fillOpacity = fillLevelFor(mark, state)

  if (isDrawn) {
    // A DRAWN ZONE'S OUTLINE IS THE ACCENT'S, WHATEVER ITS MARK, and it is not
    // an inconsistency -- it is the distinction. A drawn zone's edge was
    // placed vertex by vertex, deliberately and exactly, so a hard line is
    // TRUE of it, and the accent is what says the line is the USER'S. The mark
    // says what the ground is for; the edge says whether its boundary is a
    // suggestion or a decision, and a tinted zone's own outline says the
    // opposite of that.
    return {
      stroke: true,
      color: colors.accent,
      weight: DRAWN_LINE_WEIGHT,
      fill: true,
      fillColor: mark ? mark.fill : undefined,
      fillOpacity,
      className: focusClass('zone--drawn', isFocused),
    }
  }

  if (marksItsOwnEdge(mark)) {
    // A MARK THAT DRAWS ITS OWN BOUNDARY, IN ITS OWN COLOUR, AND NOTHING
    // UNDER THE LINE. One colour paints the whole mark: the fill states the
    // area, the line states where it ends. Neither of the two kinds that
    // reach here leaves an extent inferable -- a wash has no gaps at all, and
    // a fine dot field's edge is where the density falls off -- so the edge is
    // drawn rather than implied, and drawing it in a second colour, or ringing
    // it in --halo, would put a second value on a boundary the fill names.
    //
    // ONE BRANCH FOR BOTH KINDS, and the two differences between them are
    // both already resolved: `mark.fill` is a colour for a tint and a paint
    // server for a stipple, and fillLevelFor() picks the scale each fill is
    // legible on. A third mark that draws its own edge inherits this by
    // saying so in marksItsOwnEdge(), not by adding an arm here.
    //
    // TWO SCALES, ONE STATE. The line is ink at full strength and takes the
    // pattern levels; a wash is a screen and takes the tint levels, while a
    // dot field is ink too and stays on the pattern levels (see
    // fillLevelFor). So a committed zone keeps a legible boundary while an
    // embankment zone's wash falls back to context, which is what a committed
    // layer is.
    return {
      stroke: true,
      color: mark.stroke,
      weight: LINE_WEIGHT,
      opacity: patternLevelFor(state),
      fill: true,
      fillColor: mark.fill,
      fillOpacity,
      className: focusClass(`zone--${treatment}`, isFocused),
    }
  }

  if (mark) {
    // THE PATTERN, AT ITS LEVEL, AND NOTHING ELSE. No stroke in any state: a
    // hatch is mostly unfilled, so the imagery reads through it and a hard
    // edge would read as a surveyed line -- which is wrong for a
    // recommendation whose edge is its least certain part. The zone's extent
    // is where its pattern stops, and focused / active / committed are three
    // opacities of that one mark.
    return {
      stroke: false,
      fill: true,
      fillColor: mark.fill,
      fillOpacity,
      className: focusClass(`zone--${treatment}`, isFocused),
    }
  }

  // A POLYGON LAYER THAT DECLARED NO TREATMENT. Nothing in this build reaches
  // here -- every zone layer names its mark -- and it is kept strokeless
  // anyway, because the rule is about zones rather than about the layers that
  // happen to exist today. A flat muted fill says "settled, and this step
  // never said what its mark is".
  return {
    stroke: false,
    fill: true,
    fillColor: colors.ink,
    fillOpacity: COMMITTED_FILL_OPACITY,
    className: focusClass('zone--untreated', isFocused),
  }
}

/**
 * A FeatureCollection of LineStrings, each CASED.
 *
 * A ROAD IS A LINE, AND A LINE IS A STROKE, so the no-stroke rule for ZONES
 * does not apply to it -- that rule is about a hard edge saying something
 * false about a recommendation's extent, and a road's extent IS its line.
 * What does apply is the halo-casing rule DrawTool established for every
 * other line on this map: no single colour clears 3:1 against the range of
 * tones in one aerial frame, so the line is cased on --halo rather than
 * recoloured to beat the imagery. The casing pass paints first, so it sits
 * under the line; the line's colour is the treatment's own (--road, through
 * the mark table), and its presence is the pattern level for its state --
 * committed quietest, focused fullest -- applied to BOTH passes, so a
 * committed network dims as one mark rather than leaving a white ghost of
 * itself at full strength.
 *
 * VISIBILITY IS visibleFeatures'. A layer declaring `show: 'focused'` draws
 * only the focused candidate's branches; the committed layer draws every
 * branch of the one committed network, dimmed, and stays -- it is a settled
 * context layer for every later step.
 *
 * ONE Polyline PER FEATURE, keyed on what can change, for the reason
 * FeatureLayer keys its GeoJSONs: react-leaflet diffs style but not data.
 */
function LineLayer({ layer, interactive, onFeatureClick, focusedFeatureId = null }) {
  const { halo, ink } = getStackColors()
  const rejections = layer.rejections ?? {}
  const isCommitted = layer.band === 'committed'
  const mark = layer.treatment ? zoneMark(layer.treatment) : null
  const color = mark?.stroke ?? ink
  const features = visibleFeatures(layer, focusedFeatureId)

  return (
    <>
      {features.map((feature) => {
        const isFocused = isFocusedFeature(layer, feature, focusedFeatureId)
        const rejection = rejections[feature.id] ?? null
        const level = rejection ? 1 : patternLevelFor({ isFocused, isCommitted })
        const positions = lineLatLngs(feature.geometry)
        const key = `${feature.id}:${isFocused}:${interactive}:${rejection ? 'bad' : 'ok'}`
        const className = focusClass(
          rejection ? 'road--rejected' : `road--${layer.treatment ?? 'untreated'}`,
          isFocused
        )
        return (
          <Fragment key={key}>
            {/* THE CASING, FIRST AND UNDER. */}
            {/* OPTIONS AS PROPS, NOT `pathOptions`: react-leaflet applies
                pathOptions through Leaflet's setStyle, which never touches
                the class -- a className given that way is silently dropped.
                The key above remounts on every change that matters. */}
            <Polyline
              positions={positions}
              interactive={false}
              color={halo}
              weight={CASING_WEIGHT}
              opacity={level}
              className={`${className} road--casing`}
            />
            <Polyline
              positions={positions}
              interactive={interactive}
              color={rejection ? readToken('--alert') : color}
              weight={LINE_WEIGHT}
              opacity={level}
              className={className}
              eventHandlers={
                interactive
                  ? {
                      // THE CLICK STOPS HERE, for FeatureLayer's reason: the
                      // map's own click clears the focus, and a click on a
                      // branch is a focus.
                      click: (event) => {
                        L.DomEvent.stopPropagation(event)
                        onFeatureClick?.(layer, feature)
                      },
                    }
                  : undefined
              }
            >
              {rejection ? (
                <Tooltip permanent direction="center" className="zone-rejection-tip">
                  {rejection.reason}
                </Tooltip>
              ) : null}
            </Polyline>
          </Fragment>
        )
      })}
    </>
  )
}

/** A GeoJSON LineString's coordinates as Leaflet [lat, lng] positions. */
function lineLatLngs(geometry) {
  const coordinates = geometry?.type === 'LineString' ? geometry.coordinates : []
  return coordinates.map(([lng, lat]) => [lat, lng])
}

const accessPointIcon = (extra) =>
  new L.DivIcon({ className: `access-point-marker${extra ? ` ${extra}` : ''}`, iconSize: [18, 18] })

/**
 * MARKERS, one per point the layer's reader produced. PERSISTENT CLICK
 * TARGETS: a point layer is drawn whatever is focused and whatever the boxes
 * say, because the points are what distinguish the alternatives -- and a
 * click on one focuses the id it carries, which is the candidate it belongs
 * to. So the marker is a second tab strip living on the map, and the
 * selection sync has to work from it exactly as it does from a tab.
 *
 * INTERACTIVE WHEN THE STACK SAYS SO. Under an armed placement tool the
 * markers stand down like every other feature (see SelectGesture), so a
 * click meant to place a point beside one is not swallowed.
 */
function PointLayer({ layer, interactive, onFeatureClick, focusedFeatureId = null }) {
  const { of, focused } = groupResolver({ ...layer, features: [] })
  const focusedGroup = focused(focusedFeatureId, [])
  const isCommitted = layer.band === 'committed'
  return (
    <>
      {(layer.points ?? []).map((point) => {
        const isFocused = focusedGroup != null && of({ id: point.id }) === focusedGroup
        const modifier = [
          point.id === 'pending' ? 'access-point-marker--pending' : '',
          isFocused ? 'access-point-marker--focused' : '',
          isCommitted ? 'access-point-marker--committed' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <Marker
            // NOT keyed on focus: a remount moves the marker to the end of
            // its pane, and the markers' DOM order is the candidates' order.
            // react-leaflet swaps the icon in place.
            key={`${point.id}:${interactive}`}
            position={point.position}
            icon={accessPointIcon(modifier)}
            interactive={interactive}
            title={point.label}
            eventHandlers={
              interactive
                ? {
                    click: (event) => {
                      L.DomEvent.stopPropagation(event)
                      onFeatureClick?.(layer, { id: point.id, point })
                    },
                  }
                : undefined
            }
          />
        )
      })}
    </>
  )
}

const RENDERERS = {
  ring: RingLayer,
  scrim: ScrimLayer,
  highlight: HighlightLayer,
  polygon: FeatureLayer,
  reference: ReferenceLayer,
  line: LineLayer,
  point: PointLayer,
}

export {
  LINE_WEIGHT,
  CASING_WEIGHT,
  RingLayer,
  ScrimLayer,
  HighlightLayer,
  FeatureLayer,
  ReferenceLayer,
  LineLayer,
  PointLayer,
  styleFor,
  visibleFeatures,
}
