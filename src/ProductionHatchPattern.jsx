import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { readToken } from './geo.js'

/**
 * ProductionHatchPattern
 *
 * WHAT EVERY ZONE TREATMENT LOOKS LIKE -- the one table, plus the <pattern>
 * defs the pattern-kind rows need, injected once.
 *
 * A STEP IS TOLD BY ITS MARK, AND A TYPE WITHIN A STEP BY ITS MARK TOO,
 * for the one step whose two types overlap on purpose.
 * Production hatches; water's embankment type is a SCREENED TINT with an
 * outline and its excavated type is a STATIC DOT FIELD with an outline.
 *
 * THREE KINDS OF MARK, AND TWO OF THEM ARE PATTERNS.
 *
 *   hatch    a <pattern> of ruled strokes, pointed at by url(#id). Mostly
 *            unfilled, so the imagery reads through the gaps, and it carries
 *            no outline in any state -- a hard edge reads as a surveyed line,
 *            a boundary or a fence, something someone measured and agreed,
 *            and that is wrong for a recommendation whose edge is its least
 *            certain part. The zone's extent is where the hatch stops.
 *   tint     a flat wash of the treatment's own colour, screened back so the
 *            imagery reads through it, WITH an outline in that same colour.
 *            There is no paint server: the fill is the colour.
 *   stipple  a <pattern> of many ~1px dots on a regular lattice, in the
 *            treatment's own colour, WITH an outline in that colour. A paint
 *            server like the hatch, an outline like the tint.
 *
 * WHY THE EXCAVATED TYPE IS A DOT FIELD AND THE EMBANKMENT TYPE IS NOT.
 *
 * Both types were tints, and TWO TRANSLUCENT FILLS OF THE SAME KIND STACK.
 * Where the two coincide the two washes multiply into a third, darker fill,
 * and an overlap reads as its own zone rather than as two zones sharing
 * ground. That overlap is the payload's `cross_type_overlaps` -- the two
 * survey instruments independently identifying the same ground, which the
 * module treats as worth evaluating for either pond type -- so a render that
 * turns it into a third category destroys the one reading it exists to
 * support. This file's own note about suggested zones made the argument
 * first: two translucent fills stacked double the opacity and read as MORE
 * TINTED rather than as DIFFERENTLY MARKED.
 *
 * A TINT HAS ONE AXIS AND IT WAS ALREADY SPENT. All a wash can vary is its
 * strength, and the two blues are at the mathematical ceiling for a tonal
 * pair (2.702:1 -- see index.css, and the lighter blue is squeezed between
 * the darker one and --halo). Excavated was the hard one to see and there
 * was no room left to make it easier as a wash.
 *
 * SO THE MARK KINDS DIFFER RATHER THAN THE VALUES. A dot field sitting on a
 * wash is legible as two marks: the wash still shifts the ground's tone and
 * the dots still sit on top of it as discrete ink. Neither disappears, and
 * nothing about the pair implies that the overlap is a third thing.
 *
 * NO NEW COLOUR TOKEN. One token per type, two strengths each -- the dots and
 * the outline are both --survey-excavated on the mark scale, exactly as the
 * wash and the outline are both --survey-embankment on their two scales.
 *
 * WHY THE PREVIOUS STIPPLE FAILED, AND WHAT IS DIFFERENT. It failed for two
 * implementation reasons rather than for the idea: each dot carried its own
 * --halo CASING, and the dots were far too large. The casing rule is right
 * for a LINE, which has to survive imagery on its own; it is wrong for a fill
 * texture, where the dot field carries itself and a ring around every dot is
 * a second mark at the same frequency as the first. So there is NO PER-DOT
 * CASING here, and the dots are 1.1px across rather than 2.6px.
 *
 * SO A TINTED OR STIPPLED ZONE DOES CARRY AN OUTLINE, and the no-edge rule
 * above now scopes to the mark it was written for.
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
 * path wanted all along -- so the defs below carry the two paint-server rows
 * and zoneMark() is what all three kinds resolve through.
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
  // WATER, EMBANKMENT: a screened tint with an outline.
  //
  // A TINT HAS NO SPACING AND NO RADIUS. Its whole description is its colour;
  // how heavy the wash is, and how present its outline, are STATE (the
  // --tint-* and --pattern-* levels), not properties of the mark.
  { treatment: 'survey-embankment', kind: 'tint', token: '--survey-embankment' },
  // WATER, EXCAVATED: a static dot field with an outline, in the one colour.
  //
  // A DIFFERENT KIND OF MARK RATHER THAN A SECOND WASH -- see the docblock's
  // note on cross_type_overlaps for why the two types stopped being one mark
  // in two values. The numbers below were arrived at by RENDERING AND
  // MEASURING, over the two grounds an aerial frame actually carries, at the
  // 90px square one survey zone occupies with the whole parcel in frame:
  //
  //                                  whole mark        dot field alone
  //     over closed canopy           committed 0.0129  0.0080
  //                                  active    0.0177  0.0110
  //     over dry bare soil           committed 0.0298  0.0177
  //                                  active    0.0408  0.0244
  //
  // against a visibility floor of 0.004. The right-hand column is the
  // load-bearing one: the DOT FIELD ALONE, outline excluded, clears the floor
  // over canopy by 2x at the quietest level -- so the density carries the mark
  // and THE OUTLINE NEVER NEEDED A HALO CASING. (Compare the road, whose bare
  // line measured 0.0008 over the same ground, a fifth of the floor, and which
  // is carried entirely by its casing.) layout.test.jsx measures every figure
  // above and holds them; these are its own printed numbers.
  //
  // A GRID AND A RADIUS, BECAUSE A TEXTURE HAS BOTH, and they are the two
  // levers a dot field has -- density and opacity, since a per-dot casing is
  // the thing that must not come back. `grid` is dots per tile side (a
  // REGULAR lattice, one dot per cell at its centre -- see stippleTile) and
  // `radius` is the dot.
  //
  // THE DOTS WERE TOO SMALL TO BE DOTS. 24 per 64px side put them 2.67px
  // apart at 1.1px across -- around one device pixel, which is not a dot but
  // an anti-aliased smudge: the renderer had no room to draw a disc, so the
  // field read as a flat grey tint rather than as a texture, which is
  // precisely the reading the dot field exists to avoid (a wash is what
  // embankment is, and the two types must not be one mark at two strengths).
  // The COVERAGE was right and the SCALE was wrong, and coverage is what a
  // measurement of added ink sees -- which is why every number this field
  // was tuned against looked healthy while it did not read as dots.
  //
  // 8 PER SIDE AT r=1.6: 8.00px apart, 3.2px across. A dot is now several
  // pixels wide and is drawn as a disc, and the spacing carries the same
  // ratio of ink to ground it had -- 12.6% covered, still within a point of
  // the hatch's eighth, so the two are neighbours on one map and neither
  // shouts. 64 divides by 8 exactly, so the lattice still tiles with no seam
  // and no clamp (see stippleTile).
  //
  // NO `jitter` FIELD, and its absence is what lets the lattice tile. It
  // displaced each dot within its cell, which cost the tile its clean repeat.
  //
  // AND NO CASING FIELD, ANYWHERE. The previous stipple ringed every dot on
  // --halo and that is what killed it: a casing is for a LINE that has to
  // survive imagery alone, and a ring at the dot's own frequency is a second
  // texture rather than a support for the first. A 3.2px dot does not need
  // one; it is legible because it is a dot.
  {
    treatment: 'survey-excavated',
    kind: 'stipple',
    token: '--survey-excavated',
    tile: 64,
    grid: 8,
    radius: 1.6,
  },
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
  if (spec.kind === 'stipple') {
    // A PAINT SERVER LIKE THE HATCH, AN OUTLINE LIKE THE TINT, and one colour
    // for both. The dots are inside the def (which reads the token when it is
    // injected); the outline reads it here, which is the same read the tint
    // rows make.
    return {
      kind: 'stipple',
      fill: `url(#${patternIdFor(treatment)})`,
      stroke: readToken(spec.token),
    }
  }
  return { kind: 'pattern', fill: `url(#${patternIdFor(treatment)})`, stroke: null }
}

/**
 * Does this mark draw its own boundary?
 *
 * THE SPLIT IS "CAN THE EXTENT BE INFERRED FROM THE MARK", not "which step".
 * A hatch is ruled lines with wide gaps and its extent is where the ruling
 * stops -- an outline there would claim a precision the recommendation does
 * not have. A wash has no gaps at all, and a fine dot field's edge is where
 * the dot density falls off, which is exactly the guess the previous stipple
 * left the reader making. Both of those get a drawn edge.
 */
export function marksItsOwnEdge(mark) {
  return mark?.kind === 'tint' || mark?.kind === 'stipple'
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
 * A HALFTONE FIELD: many ~1px dots on a REGULAR LATTICE, one per cell,
 * every one at its cell's centre.
 *
 * A LATTICE RATHER THAN A JITTERED GRID, and what that buys is the SEAM. The
 * jittered field displaced each dot by up to 0.9 of a cell, which pushed the
 * outermost dots past the tile edge -- and an SVG <pattern> CLIPS its content
 * there, so those had to be clamped back to [r, tile - r]. Clamping is not
 * neutral: it piles the outer ring's dots up against the edge at a spacing
 * the interior does not have, and since every tile carries the identical
 * clamped ring, the repeat draws a faint lattice of its own along the tile
 * boundaries -- the seam the jitter existed to avoid, reintroduced by the
 * fix for the jitter. A centred lattice has no such problem to solve: the
 * first centre is half a cell in and the last half a cell from the far edge,
 * both more than r clear of it, so nothing is clipped, nothing is
 * clamped, and the tile abuts its neighbour at exactly the cell spacing the
 * interior uses. It tiles perfectly because it is periodic to begin with. At
 * grid 8 on a 64px tile the cell is 8.00px and the first centre sits 4.00px
 * in, 2.4px clear of the edge at r=1.6.
 *
 * THE DENSITY IS HELD AND THE SCALE IS NOT. 8x8 at r=1.6 inks 12.6% of the
 * ground the mark covers, where the jittered 24x24 at r=0.55 inked 13.4% --
 * the same weight, near enough, laid down in 64 dots of 3.2px instead of 576
 * of 1.1px. The old dots were about one device pixel across and the renderer
 * drew them as smudges rather than discs, so the field read as a flat tint;
 * coverage could not see that, which is why the numbers stayed healthy while
 * the mark stopped being a dot field. The measurements in layout.test.jsx are
 * re-taken rather than inherited: arrangement and scale both moved, and a
 * regular field at one coverage does not read like an irregular one.
 *
 * WHY NOT feTurbulence. Unchanged and still the reason: it does not TILE (the
 * noise is generated in the filter region's own coordinates, so a filtered
 * zone's texture shifts as the zone is panned and re-laid-out), and it is a
 * per-pixel filter evaluated over every zone's whole area on every repaint,
 * across a map that pans and zooms. A <pattern> is one def the renderer
 * rasterises once and repeats.
 *
 * DETERMINISTIC WITHOUT A SEED NOW. The jittered field needed a fixed-seed
 * LCG so a pattern re-injected on a remount was the same field of dots and
 * the zone did not shimmer as panes came and went. A lattice is the same
 * field by construction, so the generator and its seed are gone rather than
 * left unused.
 *
 * NO PER-DOT CASING, which is the whole reason the previous stipple is gone.
 * See the docblock.
 */
function stippleTile(spec, colour) {
  const cell = spec.tile / spec.grid
  const dots = []
  for (let row = 0; row < spec.grid; row += 1) {
    for (let col = 0; col < spec.grid; col += 1) {
      const dot = document.createElementNS(SVG_NS, 'circle')
      dot.setAttribute('cx', ((col + 0.5) * cell).toFixed(2))
      dot.setAttribute('cy', ((row + 0.5) * cell).toFixed(2))
      dot.setAttribute('r', String(spec.radius))
      dot.setAttribute('fill', colour)
      dots.push(dot)
    }
  }
  return dots
}

/**
 * The paint-server rows and what one tile of each is made of. A row whose
 * kind is not in here has no def -- a tint's fill is a colour and a line has
 * no fill at all, so a <pattern> emitted for either would be an empty def
 * nothing points at.
 */
const TILE_BUILDERS = { hatch: hatchTile, stipple: stippleTile }

/** The tile's side, in the pattern's own user units. */
function tileSizeOf(spec) {
  return spec.kind === 'stipple' ? spec.tile : spec.spacing
}

/**
 * Inject every PATTERN-kind mark into `container`, and return the teardown.
 *
 * TINT AND LINE ROWS PASS THROUGH UNTOUCHED, and that is not an omission:
 * neither has a paint server to inject. A tint's fill is a colour, which is
 * what a Leaflet path takes directly, and a line has no fill at all -- so
 * there is nothing for a <defs> to hold, and a def emitted for either would
 * be an empty <pattern> that nothing points at. TILE_BUILDERS is the list of
 * kinds that DO have one, so a kind added later gets a def by having a tile
 * rather than by being named here.
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
    const buildTile = TILE_BUILDERS[spec.kind]
    if (!buildTile) continue
    const size = tileSizeOf(spec)
    const pattern = document.createElementNS(SVG_NS, 'pattern')
    pattern.setAttribute('id', patternIdFor(spec.treatment))
    pattern.setAttribute('patternUnits', 'userSpaceOnUse')
    pattern.setAttribute('width', String(size))
    pattern.setAttribute('height', String(size))
    // The colours on this surface are the only ones not set from a
    // stylesheet, so they are read from their tokens rather than written
    // as literals.
    for (const mark of buildTile(spec, readToken(spec.token))) pattern.appendChild(mark)
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
