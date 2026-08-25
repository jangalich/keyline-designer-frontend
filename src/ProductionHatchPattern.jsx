import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { readToken } from './geo.js'

// Referenced from App.css as fill: url(#production-hatch). Exported so the id
// exists in exactly one place rather than as a string repeated in a stylesheet
// and a component that must agree.
export const HATCH_PATTERN_ID = 'production-hatch'

// Spacing and stroke weight, in SCREEN pixels — see PATTERN UNITS below for
// why they stay screen pixels rather than becoming ground distances.
//
// Judged rendered across the zoom range rather than calculated, the same way
// the contour background's opacity was. At 6 px the hatch closed up into a
// flat tint at the zoom someone draws at; at 10 px a small zone caught only
// two or three strokes and read as a couple of stray lines rather than as a
// filled area. 8 px with a 1 px stroke is an eighth of the area inked: enough
// to register as worked ground, open enough that the eligible tint and the
// imagery both still read through it.
const HATCH_SPACING_PX = 8
const HATCH_STROKE_PX = 1

/**
 * ProductionHatchPattern
 *
 * Injects one <pattern> into the suggested-zones pane's own <svg>, so the
 * zones can be filled with diagonal hatch instead of a flat colour.
 *
 * WHY THIS IS IMPERATIVE. A Leaflet path takes a colour, not a paint server —
 * there is no pathOptions value that means "fill with this pattern". The
 * pattern has to exist in a <defs> inside the same document, and the fill is
 * then pointed at it by CSS (App.css), which wins over the fill ATTRIBUTE
 * Leaflet sets because a stylesheet rule beats a presentation attribute.
 *
 * WHY IT WAITS. Leaflet creates a pane's <svg> lazily, when the first vector
 * layer is added to it. There is nothing to inject into until the zone layers
 * have mounted, so this runs on every payload change rather than once.
 *
 * PATTERN UNITS. userSpaceOnUse, deliberately. Leaflet's path coordinates are
 * pixels at the current zoom, so a pattern measured in user units is a pattern
 * measured in SCREEN pixels — the hatch keeps the same density whatever the
 * zoom, instead of scaling with the ground and collapsing into a solid tint
 * when you zoom out. Same reasoning as vector-effect: non-scaling-stroke on
 * the contour background.
 *
 * What DOES still change with zoom is how much hatch a zone catches, because
 * the zone itself grows and shrinks on screen. That is the thing to look at
 * across zooms, and it is why the spacing above was chosen by looking.
 */
function ProductionHatchPattern({ payload }) {
  const map = useMap()

  useEffect(() => {
    const pane = map.getPane('production-zones')
    if (!pane) return

    const svg = pane.querySelector('svg')
    if (!svg) return

    const svgNS = 'http://www.w3.org/2000/svg'
    let defs = svg.querySelector('defs')
    if (!defs) {
      defs = document.createElementNS(svgNS, 'defs')
      svg.insertBefore(defs, svg.firstChild)
    }

    // Leaflet tears its own <svg> down and rebuilds it as layers come and go,
    // so the pattern is replaced rather than added to — otherwise a redraw
    // leaves a stale one behind under the same id and the first match wins.
    const existing = defs.querySelector(`#${HATCH_PATTERN_ID}`)
    if (existing) existing.remove()

    const pattern = document.createElementNS(svgNS, 'pattern')
    pattern.setAttribute('id', HATCH_PATTERN_ID)
    pattern.setAttribute('patternUnits', 'userSpaceOnUse')
    pattern.setAttribute('width', String(HATCH_SPACING_PX))
    pattern.setAttribute('height', String(HATCH_SPACING_PX))
    // 45 degrees. Drawn as one diagonal across the tile plus the two corner
    // stubs that complete it, so the strokes join across tile edges into
    // continuous lines rather than breaking at every repeat.
    const line = document.createElementNS(svgNS, 'path')
    line.setAttribute(
      'd',
      `M0,${HATCH_SPACING_PX} l${HATCH_SPACING_PX},-${HATCH_SPACING_PX} ` +
        `M-1,1 l2,-2 M${HATCH_SPACING_PX - 1},${HATCH_SPACING_PX + 1} l2,-2`
    )
    // The one colour on this surface that is not set from a stylesheet, so it
    // is read from the token rather than written as a literal.
    line.setAttribute('stroke', readToken('--oxide'))
    line.setAttribute('stroke-width', String(HATCH_STROKE_PX))
    line.setAttribute('stroke-linecap', 'square')
    line.setAttribute('fill', 'none')
    pattern.appendChild(line)
    defs.appendChild(pattern)

    return () => pattern.remove()
  }, [map, payload])

  return null
}

export default ProductionHatchPattern
