import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { readToken } from './geo.js'

/**
 * ProductionHatchPattern
 *
 * THE MAP'S PATTERN DEFS -- one <pattern> per zone TREATMENT, injected once.
 *
 * THE MARK IS THE PATTERN, AND THE PATTERN IS THE STEP. A zone carries no
 * outline in any state: a hard edge reads as a surveyed line -- a boundary, a
 * fence, something someone measured and agreed -- and that is wrong for a
 * recommendation whose edge is its least certain part. The zone's extent is
 * where the pattern stops, and every state is a variation of the pattern's
 * OPACITY (see index.css's --pattern-* levels). The one survivor is the drawn
 * zone, whose edge was placed vertex by vertex and for which a hard line is
 * TRUE.
 *
 * SO A STEP IS TOLD BY ITS PATTERN, AND A TYPE WITHIN A STEP BY ITS VALUE.
 * Production hatches; water stipples. Water's two survey types are one stipple
 * in two blues rather than two patterns, so a reader learns one new mark per
 * step rather than one per layer.
 *
 * THE FILE KEPT ITS NAME AND ITS DEFAULT EXPORT while growing past the one
 * pattern it was written for. Renaming it would be a rename in the same commit
 * as a behaviour change, and two suites assert this path survived the spike
 * migration -- so the name is stale by one step and the docblock says so
 * rather than a git move hiding a functional change.
 *
 * WHY THIS IS IMPERATIVE. A Leaflet path takes a colour, not a paint server,
 * so the pattern has to exist in a <defs> in the same document and the fill is
 * then pointed at it by `url(#id)`. layers.jsx hands Leaflet exactly that
 * string as the path's fill, so a treatment resolves to its pattern with no
 * stylesheet rule per treatment and no colour literal anywhere but :root.
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
 * A TABLE RATHER THAN A COMPONENT PER PATTERN. The steps declare treatments;
 * this says what a treatment looks like. A step added later adds a row, and
 * the row is the only place its mark is described.
 *
 * `token` is read off :root at mount rather than written here, so this file
 * stays free of colour literals like every other map component.
 */
const PATTERNS = [
  // PRODUCTION: diagonal hatch. Judged rendered across the zoom range -- at
  // 6px it closed into a flat tint at the zoom someone draws at; at 10px a
  // small zone caught two or three strokes and read as stray lines. 8px with a
  // 1px stroke is an eighth of the area inked: enough to register as worked
  // ground, open enough that the eligible tint and the imagery read through.
  { treatment: 'production', kind: 'hatch', token: '--oxide', spacing: 8, weight: 1 },
  // WATER: stipple, in the two survey values. Dots rather than lines because
  // the step has to be legible as a different KIND of statement at a glance,
  // and because a survey area is ground to walk rather than ground to work --
  // scattered marks read as sampling where ruled lines read as cultivation.
  //
  // THE SPACING IS SET AGAINST THE HATCH'S INK SHARE, MEASURED. The first
  // attempt was 7px with a 1.5px dot, described in this comment as "close to
  // the hatch"; rendered and measured it put FIVE TIMES as much ink on the
  // page, because a dot and its casing cover far more of a tile than a
  // one-pixel line crossing it. Water would have shouted over production from
  // the roads step onward, which is exactly what these two numbers exist to
  // prevent. 11px with a 1.3px dot brings them within a factor of two
  // (measured: 0.0145 of the page inked for the hatch against 0.0261 for the
  // stipple, and part of that remainder is the white casing the measure counts
  // as ink). layout.test.jsx screenshots both, prints them, and holds the
  // ratio, so the two cannot drift apart again unnoticed.
  { treatment: 'survey-embankment', kind: 'stipple', token: '--survey-embankment', spacing: 11, radius: 1.3 },
  { treatment: 'survey-excavated', kind: 'stipple', token: '--survey-excavated', spacing: 11, radius: 1.3 },
]

/**
 * HOW WIDE THE HALO UNDER A STIPPLE DOT IS.
 *
 * THE CASING MOVED FROM THE ZONE'S EDGE TO THE PATTERN'S OWN MARKS, which is
 * what the halo-casing rule becomes once no zone has an edge. The rule itself
 * is unchanged and so is the reason for it: no single colour clears the range
 * of tones in one aerial frame -- water, canopy and bare soil together -- so a
 * mark is cased rather than recoloured. A dot with a --halo ring under it
 * carries its own contrast onto whatever is beneath it, exactly as the
 * boundary's line does.
 *
 * IT IS ALSO WHY THE TWO BLUES ONLY HAVE TO CLEAR EACH OTHER AND THE HALO.
 * See index.css's derivation: the casing is doing the work against the
 * imagery, so the values are free to be a tonal pair.
 */
const STIPPLE_HALO_PX = 1

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
 * A stipple tile: one dot, cased.
 *
 * TWO DOTS AT ONE CENTRE, the halo first so it paints underneath -- the same
 * casing-then-line order the boundary and the drawn zones use, and the same
 * order elements paint in within one SVG. Offset to the tile's centre so the
 * dot never straddles a tile edge and gets clipped into two half-dots.
 */
function stippleTile(spec, colour, halo) {
  const centre = spec.spacing / 2
  const dot = (r, fill) => {
    const circle = document.createElementNS(SVG_NS, 'circle')
    circle.setAttribute('cx', String(centre))
    circle.setAttribute('cy', String(centre))
    circle.setAttribute('r', String(r))
    circle.setAttribute('fill', fill)
    return circle
  }
  return [dot(spec.radius + STIPPLE_HALO_PX, halo), dot(spec.radius, colour)]
}

/**
 * Inject every pattern into `container`, and return the teardown.
 *
 * SEPARATE FROM THE COMPONENT BECAUSE IT NEEDS NO MAP. What a pattern looks
 * like is a fact about ink on a page; the only thing the map contributes is
 * an element to hang the defs on. Splitting it is what lets the layout
 * harness render the nine treatment/level swatches in a browser and measure
 * whether they are actually tellable apart -- see layout.test.jsx -- without
 * standing up Leaflet and a tile server to ask.
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

  const halo = readToken('--halo')
  for (const spec of PATTERNS) {
    const pattern = document.createElementNS(SVG_NS, 'pattern')
    pattern.setAttribute('id', patternIdFor(spec.treatment))
    pattern.setAttribute('patternUnits', 'userSpaceOnUse')
    pattern.setAttribute('width', String(spec.spacing))
    pattern.setAttribute('height', String(spec.spacing))
    // The colours on this surface are the only ones not set from a
    // stylesheet, so they are read from their tokens rather than written
    // as literals.
    const colour = readToken(spec.token)
    const marks =
      spec.kind === 'hatch' ? hatchTile(spec, colour) : stippleTile(spec, colour, halo)
    for (const mark of marks) pattern.appendChild(mark)
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
