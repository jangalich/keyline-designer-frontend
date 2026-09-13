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
 * WITH ONE PAIR THAT IS TOLD APART *WITHIN* A FAMILY RATHER THAN FROM IT.
 * Production and trees are the two CROPS -- the two things grown on this
 * parcel, and the two layers that legitimately share ground (production is one
 * of trees' four crossing grounds). So trees does not get a mark unlike
 * production's; it gets production's hatch MIRRORED: the opposite diagonal,
 * at the same spacing and weight, in its own colour. One family at a glance,
 * two members of it on inspection.
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
  //
  // AND CASED, at the halo-casing rule's own ratio. `casing` is a --halo stroke
  // under each rule, twice the rule's own weight -- the ratio every cased mark
  // in the build uses (road 2/4, drawn zone 1.5/3, the site pin's halo pass),
  // so the hatch joins that family rather than inventing a width. It exists
  // because from water onward this mark sits on bare imagery instead of on the
  // eligible highlight; see hatchTile() for the argument and for why a casing
  // is not an outline.
  //
  // TREES IS NOT CASED IN THIS BRANCH and that is a deliberate gap, not an
  // oversight -- see its own row.
  { treatment: 'production', kind: 'hatch', token: '--oxide', spacing: 8, weight: 1, casing: 2, rise: 'up' },
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
  //
  // AND A SCREEN UNDER THE DOTS. The dots alone were the quietest mark on
  // this map over imagery -- 0.0165 added ink over canopy at active, against
  // the embankment wash's 0.1089 -- because a dot field inks an eighth of
  // what it covers by design and the other seven eighths were bare frame. The
  // screen is the other seven eighths, at a little over a quarter of the
  // colour's strength.
  //
  // 0.28, AND THE NUMBER IS THE CEILING RATHER THAN A PREFERENCE. It shipped
  // at 0.2 and the zone was still reported as hard to find over imagery, so
  // the screen was swept again against layout.test.jsx's own instruments, at
  // active, over both grounds an aerial frame carries:
  //
  //                   canopy   soil    overlap texture (canopy)
  //     no screen     0.0165   0.0390  0.0061
  //     0.20          0.0319   0.0722  0.0050
  //     0.28          0.0365   0.0853  0.0045
  //     0.32          0.0409   0.0930  0.0035   <- below the 0.004 floor
  //
  // WHAT STOPS IT GOING FURTHER IS THE OVERLAP, NOT TASTE. The right-hand
  // column is the dot field's surviving local contrast where the two survey
  // types coincide -- `cross_type_overlaps`, the reading this pair of marks
  // exists to support. The screen is the excavated type's own colour, so
  // every point of it moves the ground toward the dots and takes contrast off
  // them; past 0.3 the field stops being a texture on a wash and the overlap
  // collapses toward one darker fill, which is the failure the dot field
  // replaced a second wash to avoid.
  //
  // 0.28 RATHER THAN 0.30, WHICH READ MARGINALLY BETTER. The measurements are
  // not monotone through the last few hundredths -- 0.30 returns 0.0046 where
  // 0.28 returns 0.0045, which is the renderer's rounding of one blend and
  // not a property of the mark -- and the cliff is at 0.32. The value is the
  // last one with a clear step of headroom to it rather than the best single
  // reading beside it.
  //
  // AND IT IS STILL THE LIGHTER SCREEN OF THE TWO. Measured against an opaque
  // fill of the same colour, the whole focused mark -- screen and dots
  // together -- lands at 0.36 of opaque, against the embankment wash's 0.40.
  // It was 0.29 before this and the gap has narrowed, which is the cost of
  // the change worth naming: the type that IS a wash is still the heavier
  // one, and the margin that says so is now a twentieth rather than a tenth.
  // The pair is told apart by KIND first and by weight second, and the second
  // has no room left in it.
  //
  // WHAT THIS DOES NOT DO IS CLOSE THE GAP WITH EMBANKMENT. At the ceiling
  // the excavated zone adds 0.0365 over canopy against that wash's 0.1089 --
  // still a third of it, because --survey-excavated sits close to closed
  // canopy in luminance and a screen in the mark's own colour cannot outrun
  // that. If this zone has to read as loudly as its sibling, the lever is the
  // colour or the state levels, and both are index.css's to move.
  {
    treatment: 'survey-excavated',
    kind: 'stipple',
    token: '--survey-excavated',
    tile: 64,
    grid: 8,
    radius: 1.6,
    screen: 0.28,
  },
  // ROADS: a cased LINE. The first mark here that is not ground. Its whole
  // description is its colour -- the weights are layers.jsx's LINE_WEIGHT and
  // CASING_WEIGHT, the same pair every other line on this map takes -- and
  // its presence in each state is the pattern level, like a hatch's. A line
  // has no fill, so a paint server would be a def with nothing to reference
  // it; there is none.
  { treatment: 'road', kind: 'line', token: '--road' },
  /* THE TREE MARK: PRODUCTION'S HATCH, MIRRORED. The opposite diagonal, at
     production's own spacing and weight, in --tree.

     THE OTHER CROP, NOT ANOTHER KIND OF THING. Production and trees are the
     two things GROWN on this parcel, and they are the two layers that
     legitimately overlap -- production is one of trees' four crossing
     grounds. A ruled field mirrored about the vertical is the oldest way a
     map says "the same kind of ground, the other crop": the two read as one
     family at a glance and as two members of it on inspection, which is
     exactly the relationship. The ANGLE is what carries that reading, so the
     angle is what must not move; if the pair ever needs separating further,
     the lever is a small offset in PITCH.

     IT REPLACED A DOT FIELD, and the dot field was the wrong argument. It was
     a coarse planting lattice, chosen to be tellable from water's fine
     excavated dots -- a real problem, solved by making trees unlike WATER.
     What it could not say is that a tree zone is the same kind of ground as a
     production zone. Two dot fields at different frequencies are a pair; a
     dot field and a hatch are not, and the pair that matters more is the one
     the map keeps drawing on top of itself.

     SO THE STIPPLE IS GONE, NOT KEPT UNDERNEATH. A hatch over a dot field
     would be two textures at two frequencies in one zone, which is the
     interference this row exists to avoid rather than a richer mark. There is
     ONE tree mark and it is these strokes.

     NO OUTLINE, AS A CONSEQUENCE AND NOT AN OVERSIGHT: marksItsOwnEdge() gives
     a drawn edge to marks whose extent cannot be inferred (a wash has no gaps;
     a fine dot field's edge is where the density falls off). A hatch's extent
     is where the ruling stops, which is legible on its own -- and an outline
     on a candidate would read as a surveyed line, which is what the no-edge
     rule has always been about. Trees gains that rule by becoming a hatch;
     production has always had it.

     AND IT IS NOT CASED, WHILE PRODUCTION'S IS -- a DELIBERATE GAP in this
     branch, recorded rather than left to be noticed. Trees has production's
     problem exactly: from structures onward a committed tree zone sits on bare
     imagery with no eligible highlight under it, and --tree is a mid-tone green
     over canopy that is also green. The reason it is bare here is scope, not a
     judgement that it does not need one: casing changes what a mark inks, this
     branch is production's, and the pair is held apart by ANGLE rather than by
     weight -- so casing one of the two and not the other is the LESS symmetric
     state, not the more. Measured figures for the cased mark are in
     layout.test.jsx; the same numbers are what a trees branch should take the
     decision on. See hatchTile(). */
  { treatment: 'tree', kind: 'hatch', token: '--tree', spacing: 8, weight: 1, rise: 'down' },
  /* THE STRUCTURE MARK: A PIN, in --ochre.

     A BUILDING SITE IS A SPOT, NOT GROUND. Every other mark here says what a
     piece of ground is for; a structure site is a point the design puts a
     building at, and the printed layout map (render_layout_map.py) has
     always drawn it that way -- a fixed-size map pin at the site's
     representative point, never a filled footprint. This map now draws the
     same thing: the pin's SILHOUETTE (PIN_GLYPH_PATH below), at fixed screen
     size, in the palette's live-point colour. The interior barn glyph the
     printed pin carries is not reproduced: it is a legend icon baked into a
     raster, and on a screen pin two dozen pixels tall it would be noise.

     OCHRE, AND NOT A COLOUR OF ITS OWN. The printed map's pin is a bright
     red (#D64545) that has no place in this palette -- the same class as the
     Material-style error red the guide retired. --ochre is the guide's own
     colour for exactly this concept, "secondary emphasis, access point
     marker": a point glyph marking a live spot on the property. The rule
     that lets two steps share it is written beside the token in index.css.

     A PIN HAS NO FILL LEVEL AND NO PAINT SERVER. Its whole description is
     its colour; how present it is in each state is the pattern level, like
     a hatch's, applied to the glyph as a whole. It draws no zone edge, so
     marksItsOwnEdge() is false of it, and TILE_BUILDERS has no tile for it,
     so injectZonePatterns() passes it through as it does a tint. */
  { treatment: 'structure', kind: 'pin', token: '--ochre' },
  /* THE FENCE MARK: A CASED LINE, in --fence -- the road's kind of mark, in a
     second colour, because a fence is the other LINE on this map and the two
     are told apart by value rather than by kind. The candidates, the
     measurements over canopy and bare soil, and the choice are written
     beside the token in index.css; nothing here picks a colour. Same
     LINE_WEIGHT / CASING_WEIGHT pair every line on this map takes, drawn by
     layers.jsx's LineLayer, which reads the DISPLAY-ONLY line the server
     ships (fence_display_geometry.py's angular-simplified, coincidence-
     trimmed rendering) rather than the raw ring -- see drawnAs(). No fill,
     no paint server, no outline: the line IS the mark. */
  { treatment: 'fence', kind: 'line', token: '--fence' },
]

/**
 * THE PIN SILHOUETTE, as an SVG path in a 24x24 viewBox: the classic
 * teardrop the printed map's asset draws (assets/icons/farm_location_pin.svg
 * in the backend repo, whose <path d> this is, verbatim).
 *
 * A DELIBERATE DIVERGENCE FROM THE ONE-IMPLEMENTATION RULE, ON THE RECORD.
 * The smoothed zone outline is computed ONCE, server-side, and shipped, so
 * the map and the PDF cannot drift; this shape is drawn here a second time.
 * The risk is different in kind: the outline is a computed geometry that
 * changes with every parcel, while this is a fixed silhouette that changes
 * with nothing. The interior icon is baked into the backend's rasterized
 * PNG, so the pin could not be shipped as an asset without carrying an icon
 * this map does not draw -- hence a path, and hence the copy. If the
 * backend's asset ever changes shape, this string is the one place to
 * follow it.
 *
 * The tip is at (12, 22) in viewBox units; sitePinIcon() anchors there, so
 * the pin points at the site rather than covering it.
 */
export const PIN_GLYPH_VIEWBOX = '0 0 24 24'
export const PIN_GLYPH_PATH =
  'M12 2C8.13401 2 5 5.13401 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13401 15.866 2 12 2Z'
export const PIN_GLYPH_TIP = Object.freeze([12, 22])


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
  if (spec.kind === 'pin') {
    // A GLYPH, and its colour: the renderer draws PIN_GLYPH_PATH in it at
    // fixed screen size (layers.jsx's PinLayer). No zone edge, no fill level.
    return { kind: 'pin', fill: readToken(spec.token), stroke: null }
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

/**
 * A 45-DEGREE HATCH TILE, IN EITHER DIRECTION, CASED OR BARE.
 *
 * `rise` is which way the ruling runs across the tile, in the reader's terms
 * rather than SVG's y-down ones: 'up' is the "/" diagonal (production's) and
 * 'down' is the "\\" one (trees'). The two are exact mirrors of each other
 * about the tile's horizontal centre line -- one geometry reflected, not two
 * hand-written paths that happen to be at complementary angles.
 *
 * THE TWO CORNER STUBS ARE WHY THIS IS NOT ONE `line` ELEMENT. A <pattern>
 * clips at the tile edge, so the main diagonal alone would break at every
 * repeat; the stubs complete the two corners the diagonal misses, and the
 * strokes then join across tile edges into continuous rules.
 *
 *
 * A CASING IS NOT AN OUTLINE, AND THE DIFFERENCE IS THE WHOLE NO-STROKE RULE
 *
 * READ THIS BEFORE CONCLUDING THAT THE HATCH NOW HAS AN EDGE. It does not.
 *
 *   AN OUTLINE runs along the ZONE'S BOUNDARY. It is a second mark, at the one
 *   place a recommendation is least certain, and it says someone surveyed and
 *   agreed that line. That is what the no-stroke rule forbids for a hatch, and
 *   it is still forbidden: zoneMark() returns `stroke: null` for every pattern
 *   row, marksItsOwnEdge() is false for `hatch`, and nothing here draws at the
 *   polygon's edge in any state.
 *
 *   A CASING runs under the MARK'S OWN LINES, inside the tile, wherever the
 *   hatch happens to fall. It is a contrast backing -- the same ink, made
 *   legible -- and it stops where the hatch stops, because it IS the hatch. The
 *   zone's extent is still where the ruling ends, unnanounced.
 *
 * A reader who sees two strokes per rule and thinks "the zone is outlined now"
 * has confused the two. A drawn zone's deliberate edge (layers.jsx,
 * DRAWN_CASING_WEIGHT) is the outlined case, and it is outlined on purpose and
 * separately.
 *
 *
 * WHY THE HATCH IS CASED AT ALL, AND WHY OPACITY WAS THE WRONG ANSWER
 *
 * During LANDFORM the hatch sits on the eligible highlight (--eligible at
 * 0.32), and that tint is most of what the mark reads against. From water
 * onward the highlight is gone and the same hatch sits DIRECTLY ON IMAGERY,
 * where a mid-tone oxide diagonal over closed canopy has almost nothing to work
 * with. The committed block is not fainter downstream; it is on a different
 * ground.
 *
 * That was first treated as an opacity problem and the whole --pattern-* scale
 * was raised. It is a contrast problem, and index.css records what the raise
 * cost. THE FIX IS THE ROAD'S FIX: the road's bare umber line measured 0.0008
 * over canopy against a 0.004 floor -- a fifth of the visibility floor -- and
 * is carried entirely by its --halo casing. Same problem, same technique,
 * applied to a pattern rather than to a path.
 *
 * BOTH STROKES ARE IN THE TILE, SO THE LEVEL SCALES THEM TOGETHER. The path's
 * own fill-opacity is the state, and a paint server's contents ride it -- the
 * stipple's screen is in its tile for exactly this reason. A committed block is
 * a faint cased mark and a focused one is a strong cased mark; three opacities
 * of ONE mark, which is the property the whole level language rests on. A
 * casing drawn as a second layer would be a second opacity to keep in step.
 *
 * WHAT IT IS WORTH, measured as the ink the mark ADDS over its own ground at
 * the 90px square (layout.test.jsx, `addedInkOver`), cased against the same
 * tile with the casing pass lifted off:
 *
 *                        cased     bare      casing    of a solid --oxide fill
 *   over canopy
 *     committed 0.4      0.0870    0.0089    9.7x      49%
 *     active    0.55     0.1195    0.0124    9.7x      67%
 *     focused   1        0.2178    0.0225    9.7x      122%
 *   over bare soil
 *     committed 0.4      0.0455    0.0170    2.7x      13%
 *     active    0.55     0.0625    0.0234    2.7x      18%
 *     focused   1        0.1138    0.0425    2.7x      33%
 *
 * THE CASING IS A CANOPY FIX, and the two columns say so. Over dark canopy it
 * is worth nearly ten times the bare mark; over bright soil, where --halo is
 * close to the ground's own tone, under three. That asymmetry is the point --
 * the bare hatch was already legible on soil (0.0170) and was at the road's own
 * failure point on canopy (0.0089, against a 0.004 floor).
 *
 * THE 122% IS NOT AN ERROR. At full strength over canopy the cased mark moves
 * MORE pixels than solid --oxide does, because most of its ink is halo and a
 * near-white stroke on dark canopy out-contrasts oxide on dark canopy. It is a
 * contrast reading, not a coverage one; how much ground the mark actually
 * takes is the separate measure below.
 *
 * IT COSTS TEXTURE AND THAT COST IS ACCEPTED. Casing doubles the strokes, and
 * at this pitch the halo takes ground the imagery used to read through: the
 * share of the swatch still reading as bare ground falls from 88% to 37% over
 * canopy, and to 63/58/37% over soil by level. The mark is no longer "mostly
 * unfilled" on canopy. It is also not a fill -- over a third still reads
 * through at every level, a solid fill leaves under 1%, and the tile's texture
 * spread is HIGHER cased than bare (the halo and the rule alternate against
 * each other). The casing is NOT narrowed to buy the openness back: visibility
 * on imagery is what it exists for, and layout.test.jsx measures what the tile
 * is actually inking rather than leaving it to judgement.
 *
 * AND IT STILL WORKS UNDER THE ELIGIBLE HIGHLIGHT, which is the one ground
 * this was NOT built for -- a casing meant to lift a mark off imagery could
 * have been redundant on a tint, or heavy enough to paint out the highlight
 * whose whole job is to say which ground cleared the gates. Neither: on
 * --eligible over canopy the mark still adds 0.0668/0.0919/0.1673, and the
 * combination (0.2511/0.2732/0.3398) stays well above what the mark carries on
 * bare ground, so the highlight is still there underneath it.
 */
function hatchTile(spec, colour) {
  const size = spec.spacing
  // Written for 'up' and reflected in y for 'down' -- the mirror is the whole
  // of the difference between the two marks, so it is one expression.
  const y = (value) => (spec.rise === 'down' ? size - value : value)
  const d =
    `M0,${y(size)} L${size},${y(0)} ` +
    `M-1,${y(1)} L1,${y(-1)} ` +
    `M${size - 1},${y(size + 1)} L${size + 1},${y(size - 1)}`

  const rule = (pass, stroke, width) => {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    path.setAttribute('stroke', stroke)
    path.setAttribute('stroke-width', String(width))
    path.setAttribute('stroke-linecap', 'square')
    path.setAttribute('fill', 'none')
    // WHICH PASS THIS IS, named on the node. The map never reads it; the
    // layout harness does, to lift the casing back off and measure what it is
    // worth -- the same question the road, the pin and the fence each answer
    // through `data-uncased`. A pass identified by position ("the first
    // child") would silently become the wrong pass the day a row has no
    // casing.
    path.dataset.pass = pass
    return path
  }

  // THE CASING PASS, UNDER THE RULES, WHEN THE ROW ASKS FOR ONE. Same geometry,
  // wider stroke, --halo. See the `casing` note on production's row for why the
  // mark needs it and A CASING IS NOT AN OUTLINE below for what it is not.
  const marks = spec.casing ? [rule('casing', readToken('--halo'), spec.casing)] : []
  marks.push(rule('rule', colour, spec.weight))
  return marks
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
  const nodes = []
  if (spec.screen) {
    // THE SCREEN, FIRST IN THE TILE SO THE DOTS SIT ON IT. A full-tile rect
    // in the mark's own colour at spec.screen, which makes this the one row
    // in the table that is a screen AND a texture.
    //
    // WHY IT IS INSIDE THE TILE RATHER THAN A SECOND PATH UNDER THE ZONE.
    // A second path would be a second layer with its own opacity, its own
    // state scale and its own edge to keep in step -- three things to keep
    // in agreement for one mark. In the tile it is part of the paint server,
    // so the path's own fill-opacity scales screen and dots TOGETHER and the
    // three states stay three opacities of ONE mark, which is the property
    // the whole level language rests on. It also tiles for free: the rect is
    // exactly the tile, so the screen is seamless where the tiles meet.
    const screen = document.createElementNS(SVG_NS, 'rect')
    screen.setAttribute('width', String(spec.tile))
    screen.setAttribute('height', String(spec.tile))
    screen.setAttribute('fill', colour)
    screen.setAttribute('fill-opacity', String(spec.screen))
    nodes.push(screen)
  }
  for (let row = 0; row < spec.grid; row += 1) {
    for (let col = 0; col < spec.grid; col += 1) {
      const dot = document.createElementNS(SVG_NS, 'circle')
      dot.setAttribute('cx', ((col + 0.5) * cell).toFixed(2))
      dot.setAttribute('cy', ((row + 0.5) * cell).toFixed(2))
      dot.setAttribute('r', String(spec.radius))
      dot.setAttribute('fill', colour)
      nodes.push(dot)
    }
  }
  return nodes
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
