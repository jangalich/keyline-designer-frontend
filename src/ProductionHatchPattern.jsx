import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { readToken } from './geo.js'

/**
 * ProductionHatchPattern
 *
 * WHAT EVERY ZONE TREATMENT LOOKS LIKE -- the one table, plus the <pattern>
 * defs the pattern-kind rows need, injected once.
 *
 * A STEP IS TOLD BY ITS MARK, AND A TYPE WITHIN A STEP BY ITS VALUE.
 * Production hatches; water is a SCREENED TINT with an outline. Water's two
 * survey types are one tint in two blues rather than two marks, so a reader
 * learns one new mark per step rather than one per layer.
 *
 * TWO KINDS OF MARK, AND ONLY ONE OF THEM IS A PATTERN.
 *
 *   hatch  a <pattern> of ruled strokes, pointed at by url(#id). Mostly
 *          unfilled, so the imagery reads through the gaps, and it carries no
 *          outline in any state -- a hard edge reads as a surveyed line, a
 *          boundary or a fence, something someone measured and agreed, and
 *          that is wrong for a recommendation whose edge is its least certain
 *          part. The zone's extent is where the hatch stops.
 *   tint   a flat wash of the treatment's own colour, screened back so the
 *          imagery reads through it, WITH an outline in that same colour.
 *          There is no paint server: the fill is the colour.
 *
 * WHY WATER STOPPED BEING A PATTERN. A stipple says "sampling" where ruled
 * lines say "cultivation", which was the right distinction; what it could not
 * do was hold a survey area's SHAPE. A hulled compartment is read for whether
 * it is worth walking, and scattered dots leave the reader inferring where the
 * claim ends from where the dots thin out. A tint states the area and its
 * outline states the boundary, at a glance and at every zoom.
 *
 * SO A TINTED ZONE DOES CARRY AN OUTLINE, and the no-edge rule above now
 * scopes to the marks it was written for.
 *
 * AND THE OUTLINE IS NOT CASED, which IS a departure and is worth naming as
 * one. The halo-casing rule -- no single colour clears the range of tones in
 * one aerial frame, so a mark is cased rather than recoloured -- still holds
 * for the boundary ring and a drawn zone. Water's mark opts out: a white ring
 * around a blue line read as a sticker edge rather than as the mark, so the
 * whole mark is one colour and the exposure that comes with that is stated
 * rather than hidden. See index.css's --survey-* note for what it costs.
 *
 * THE FILE KEPT ITS NAME AND ITS DEFAULT EXPORT while growing past the one
 * pattern it was written for -- and is now staler still, since half the rows
 * in its table are not patterns at all. The reason is the same one as last
 * time: renaming it would be a rename in the same commit as a behaviour
 * change, and two suites assert this path survived the spike migration. The
 * name is stale by two steps and the docblock says so rather than a git move
 * hiding a functional change.
 *
 * WHY THIS IS IMPERATIVE. A Leaflet path takes a colour, not a paint server,
 * so a PATTERN has to exist in a <defs> in the same document and the fill is
 * then pointed at it by `url(#id)`. layers.jsx hands Leaflet exactly that
 * string as the path's fill, so a treatment resolves to its mark with no
 * stylesheet rule per treatment and no colour literal anywhere but :root. A
 * TINT needs none of this -- its fill IS a colour, which is what a Leaflet
 * path wanted all along -- so the defs below carry only the pattern rows and
 * zoneMark() is what both kinds resolve through.
 *
 * WHERE IT LIVES. In its own hidden <svg> attached to the map container, NOT
 * inside a Leaflet pane's own <svg>. Two reasons, both learned the hard way:
 * Leaflet creates and destroys a pane's <svg> as layers come and go, so a
 * pattern injected there disappears the moment the last zone is deselected;
 * and several panes now reference these -- two water panes, landform's
 * suggested and drawn panes, and every committed pane -- so they cannot belong
 * to any one of them. url(#id) resolves document-wide, so one host serves all.
 *
 * PATTERN UNITS. userSpaceOnUse, deliberately. Leaflet's path coordinates are
 * pixels at the current zoom, so a pattern measured in user units is a pattern
 * measured in SCREEN pixels -- the mark keeps the same density whatever the
 * zoom, instead of scaling with the ground and collapsing into a solid tint
 * when you zoom out. Same reasoning as vector-effect: non-scaling-stroke on
 * the contour background.
 *
 * What DOES still change with zoom is how much pattern a zone catches, because
 * the zone itself grows and shrinks on screen. That is the thing to look at
 * across zooms, and it is why the spacings below were chosen by looking.
 */

/**
 * The pattern id for a declared treatment. ONE PLACE, because layers.jsx
 * builds the same string to point a fill at it and a second spelling would be
 * a fill pointing at nothing -- which SVG renders as no fill at all, silently.
 */
export function patternIdFor(treatment) {
  return `zone-pattern-${treatment}`
}

/**
 * Kept for the drawn-zone rule in App.css, which is the one fill still set
 * from a stylesheet. Production's own pattern, by its id.
 */
export const HATCH_PATTERN_ID = patternIdFor('production')

/**
 * EVERY TREATMENT THIS BUILD DRAWS, and the mark each one gets.
 *
 * A TABLE RATHER THAN A COMPONENT PER MARK. The steps declare treatments;
 * this says what a treatment looks like. A step added later adds a row, and
 * the row is the only place its mark is described.
 *
 * `token` is read off :root at resolve time rather than written here, so this
 * file stays free of colour literals like every other map component.
 */
const TREATMENT_MARKS = [
  // PRODUCTION: diagonal hatch. Judged rendered across the zoom range -- at
  // 6px it closed into a flat tint at the zoom someone draws at; at 10px a
  // small zone caught two or three strokes and read as stray lines. 8px with a
  // 1px stroke is an eighth of the area inked: enough to register as worked
  // ground, open enough that the eligible tint and the imagery read through.
  { treatment: 'production', kind: 'hatch', token: '--oxide', spacing: 8, weight: 1 },
  // WATER: a screened tint with an outline, in the two survey values -- one
  // mark, two blues, so the step is carried by the mark and the type by the
  // value.
  //
  // WHAT THIS REPLACED, AND WHY THE MEASUREMENT NOTE WENT WITH IT. Water
  // stippled: dots at 11px with a 1.3px radius, a spacing arrived at by
  // rendering and MEASURING against the hatch's ink share after a first
  // attempt put five times as much ink on the page. That tuning is gone
  // because the thing it tuned is gone -- but the constraint it existed for
  // is not, and it moved to --tint-* in index.css: neither step may shout
  // over the other, and layout.test.jsx still screenshots both, prints the
  // numbers and holds the ratio.
  //
  // A TINT HAS NO SPACING AND NO RADIUS. Its whole description is its colour;
  // how heavy the wash is, and how present its outline, are STATE (the
  // --tint-* and --pattern-* levels), not properties of the mark.
  { treatment: 'survey-embankment', kind: 'tint', token: '--survey-embankment' },
  { treatment: 'survey-excavated', kind: 'tint', token: '--survey-excavated' },
  // ROADS: a cased LINE. The first mark here that is not ground. Its whole
  // description is its colour -- the weights are layers.jsx's LINE_WEIGHT and
  // CASING_WEIGHT, the same pair every other line on this map takes -- and
  // its presence in each state is the pattern level, like a hatch's. A line
  // has no fill, so a paint server would be a def with nothing to reference
  // it; there is none.
  { treatment: 'road', kind: 'line', token: '--road' },
]

/**
 * WHAT ONE TREATMENT PAINTS WITH, resolved: the fill Leaflet writes into the
 * path, and the outline colour -- or null for a treatment nothing declares.
 *
 * ONE RESOLVER FOR BOTH KINDS, because the caller's question is the same for
 * both ("what does this treatment paint with") and only the answer's shape
 * differs. A hatch resolves to a paint-server reference and NO outline; a tint
 * resolves to its own colour, twice -- once as the wash and once as the line
 * around it. layers.jsx branches on `kind` to decide whether to stroke, and on
 * nothing else.
 *
 * READ AT CALL TIME, NOT AT MODULE LOAD. Leaflet cannot resolve a var() in a
 * pathOption, so a colour has to be read off the document -- and reading it
 * when the style is built is what keeps a token change one edit rather than
 * one edit plus a reload.
 */
export function zoneMark(treatment) {
  const spec = TREATMENT_MARKS.find((entry) => entry.treatment === treatment)
  if (!spec) return null
  if (spec.kind === 'tint') {
    const colour = readToken(spec.token)
    return { kind: 'tint', fill: colour, stroke: colour }
  }
  if (spec.kind === 'line') {
    // A stroke and nothing to fill: the line IS the mark.
    return { kind: 'line', fill: null, stroke: readToken(spec.token) }
  }
  return { kind: 'pattern', fill: `url(#${patternIdFor(treatment)})`, stroke: null }
}


const SVG_NS = 'http://www.w3.org/2000/svg'

/** A 45-degree hatch tile. */
function hatchTile(spec, colour) {
  const line = document.createElementNS(SVG_NS, 'path')
  // One diagonal across the tile plus the two corner stubs that complete it,
  // so the strokes join across tile edges into continuous lines rather than
  // breaking at every repeat.
  line.setAttribute(
    'd',
    `M0,${spec.spacing} l${spec.spacing},-${spec.spacing} ` +
      `M-1,1 l2,-2 M${spec.spacing - 1},${spec.spacing + 1} l2,-2`
  )
  line.setAttribute('stroke', colour)
  line.setAttribute('stroke-width', String(spec.weight))
  line.setAttribute('stroke-linecap', 'square')
  line.setAttribute('fill', 'none')
  return [line]
}

/**
 * Inject every PATTERN-kind mark into `container`, and return the teardown.
 *
 * TINT ROWS PASS THROUGH UNTOUCHED, and that is not an omission: a tint has no
 * paint server to inject. Its fill is a colour, which is what a Leaflet path
 * takes directly, so there is nothing for a <defs> to hold. A def emitted for
 * it would be an empty <pattern> that nothing points at.
 *
 * SEPARATE FROM THE COMPONENT BECAUSE IT NEEDS NO MAP. What a mark looks like
 * is a fact about ink on a page; the only thing the map contributes is an
 * element to hang the defs on. Splitting it is what lets the layout harness
 * render the nine treatment/level swatches in a browser and measure whether
 * they are actually tellable apart -- see layout.test.jsx -- without standing
 * up Leaflet and a tile server to ask.
 */
export function injectZonePatterns(container) {
  const host = document.createElementNS(SVG_NS, 'svg')
  // Present in the document so the paint servers resolve, and occupying no
  // space and catching no clicks so it is otherwise not there at all.
  host.setAttribute('width', '0')
  host.setAttribute('height', '0')
  host.setAttribute('aria-hidden', 'true')
  host.dataset.zonePatterns = 'true'
  host.style.position = 'absolute'
  host.style.pointerEvents = 'none'

  const defs = document.createElementNS(SVG_NS, 'defs')
  host.appendChild(defs)

  for (const spec of TREATMENT_MARKS) {
    if (spec.kind !== 'hatch') continue
    const pattern = document.createElementNS(SVG_NS, 'pattern')
    pattern.setAttribute('id', patternIdFor(spec.treatment))
    pattern.setAttribute('patternUnits', 'userSpaceOnUse')
    pattern.setAttribute('width', String(spec.spacing))
    pattern.setAttribute('height', String(spec.spacing))
    // The colours on this surface are the only ones not set from a
    // stylesheet, so they are read from their tokens rather than written
    // as literals.
    for (const mark of hatchTile(spec, readToken(spec.token))) pattern.appendChild(mark)
    defs.appendChild(pattern)
  }

  container.appendChild(host)
  return () => host.remove()
}

function ProductionHatchPattern({ payload }) {
  const map = useMap()

  useEffect(() => {
    const container = map.getContainer()
    if (!container) return
    return injectZonePatterns(container)
  }, [map, payload])

  return null
}

export default ProductionHatchPattern
