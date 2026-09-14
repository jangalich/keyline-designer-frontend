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
  // ON A SCREEN, AND THE SCREEN IS A GROUND RATHER THAN A MARK. --rule at 0.12,
  // which the path's own fill-opacity then scales by the level like everything
  // else in the tile. It exists because from the water step onward this hatch
  // sits on BARE IMAGERY: during landform it sits on the eligible highlight and
  // reads against that tint, and downstream the highlight is gone. See
  // the note below hatchTile() for the measurements, the two candidates, and the one
  // thing the screen costs.
  {
    treatment: 'production',
    kind: 'hatch',
    token: '--oxide',
    spacing: 8,
    weight: 1,
    screen: 0.12,
    screenToken: '--rule',
    rise: 'up',
  },
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
  // AND A SCREEN UNDER THE DOTS, IN --rule, THE ONE SCREEN COLOUR ON THIS MAP.
  // The dots alone are the quietest mark here over imagery -- 0.0068 added ink
  // over closed canopy at the committed level against a 0.004 floor -- because
  // a dot field inks an eighth of what it covers by design and the other seven
  // eighths are bare frame. The screen is the other seven eighths.
  //
  // IT WAS A SCREEN IN THE MARK'S OWN COLOUR AT 0.28 AND THAT IS WHAT CHANGED.
  // The zone was still reported as hard to find, and a blue screen under a blue
  // dot field is a wash the mark is inside rather than a ground it sits on --
  // the whole cell becomes one blue, which is what the dot field replaced a
  // second wash to avoid. --rule is what production's hatch sits on, chosen
  // there against --stock at four alphas over both grounds, and the argument is
  // not about the hatch: a screen is the GROUND a mark was designed against, put
  // back, and a ground has no business being in the mark's own colour. Reusing
  // it keeps ONE screen treatment across the build -- see screenNode().
  //
  // 0.03, AND THE NUMBER IS THE OVERLAP'S RATHER THAN THE BLOCK'S. That is the
  // finding this row exists to record, so read the table before moving it.
  //
  // THE TWO CONSTRAINTS PULL OPPOSITE WAYS. On bare imagery a heavier screen
  // makes the block findable. On the EMBANKMENT WASH -- `cross_type_overlaps`,
  // the one place this pair of marks exists to be read -- the same screen
  // destroys it. Over canopy, at active, measured by layout.test.jsx's own two
  // instruments:
  //
  //                        overlap texture   block ink    block ink
  //                        (canopy)          (committed)  (active)
  //     no screen           0.0061            0.0068       0.0093
  //     --rule 0.02         0.0051            0.0105       0.0163
  //     --rule 0.03         0.0045            0.0139       0.0188
  //     --rule 0.04         0.0037  <- floor  0.0172       0.0232
  //     --rule 0.06         0.0029            0.0208       0.0282
  //     --rule 0.12         0.0004            0.0359       0.0478
  //     (was) own blue 0.28 0.0045            0.0230       0.0305
  //
  // THE FLOOR IS 0.004 AND IT BITES BETWEEN 0.03 AND 0.04, so 0.03 is a
  // CEILING and not a preference -- the last alpha at which the overlap still
  // reads as two marks. It spends exactly the overlap budget this build already
  // spent: the blue it replaces measured the same 0.0045.
  //
  // WHY THE OVERLAP IS WHERE A LIGHT SCREEN FAILS, which is worth understanding
  // before anyone tries a heavier one again. OVER CANOPY THE DOT IS LIGHTER
  // THAN ITS GROUND: --survey-excavated at the pattern level over dark green
  // reads UP, not down, by about 22 of 255. So a light screen lifts the ground TOWARD the
  // dot rather than away from it. On bare canopy that is a cost worth paying,
  // because the screen itself is most of what makes the block findable. On the
  // embankment wash the ground is ALREADY lifted -- to 71 of 255 before any
  // screen -- and the dot lands at 79; --rule at 0.12 carries the ground to 80
  // and the dot to 84, the two cross over, and the field stops being a texture
  // (0.0004 against a 0.004 floor). This is production's mid-value trap, in the
  // one place it is fatal rather than expensive.
  //
  // WHAT 0.03 COSTS, STATED PLAINLY, because it is a REGRESSION against the
  // blue it replaces and not a win: 0.0139 of block ink over canopy at
  // committed where the blue read 0.0230, at identical overlap texture. --rule
  // is DOMINATED on this trade -- at equal overlap cost the blue buys about 1.6x
  // the presence -- for the tonal reason above: a screen near the dots' own
  // value barely closes the dot-to-ground gap on the wash, and a light one
  // closes it fast. The block is still twice as findable as it is with no
  // screen at all (0.0068), which is the comparison that matters for "can this
  // zone be found", and the colour is the build's one screen rather than this
  // mark's private one, which is the comparison that matters for the map.
  //
  // AND THE LEVER THAT WOULD ACTUALLY FIX IT IS NOT THE SCREEN. --survey-
  // excavated sits close to closed canopy in luminance, and no screen under a
  // mark can outrun the mark's own value. If this zone has to read as loudly as
  // its sibling, the levers are the COLOUR and the STATE LEVELS, and both are
  // index.css's to move.
  {
    treatment: 'survey-excavated',
    kind: 'stipple',
    token: '--survey-excavated',
    tile: 64,
    grid: 8,
    radius: 1.6,
    screen: 0.03,
    screenToken: '--rule',
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

     AND IT CARRIES NO SCREEN, WHILE PRODUCTION'S DOES -- a DELIBERATE GAP in
     this branch, recorded rather than left to be noticed. Trees has
     production's problem and has it worse: it declares NO eligible highlight
     at all, so its hatch sits on bare imagery from its own step onward rather
     than only downstream, and --tree is a mid-tone green over canopy that is
     also green. The reason it is bare here is scope -- a screen changes what a
     mark covers and this branch is production's. layout.test.jsx has the
     measurements a trees branch would take the decision on. See hatchScreen(). */
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
 * A 45-DEGREE HATCH TILE, IN EITHER DIRECTION.
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
 * ONE STROKE PER RULE, AND THE CASING THAT ISN'T HERE
 *
 * A --halo casing under each rule was tried and removed, and it is written down
 * because the reasoning that produced it is sound and will produce it again.
 *
 * THE PROBLEM IS REAL. From the water step onward a committed production block
 * sits DIRECTLY ON AERIAL IMAGERY; during landform it sits on the eligible
 * highlight, and that tint is most of what the mark reads against. Bare over
 * closed canopy the committed hatch measures 0.0089 added ink against a 0.004
 * floor -- the road line's own failure point, which the road solves with a
 * --halo casing.
 *
 * THE CASING SOLVED IT AND LOOKED WRONG. Measured, it was worth 9.7x over
 * canopy. What it produced was a CANDY CANE: a 2px white stroke beside a 1px
 * oxide one at a 5.66px perpendicular pitch is alternating bands of white and
 * rust with about a third of the ground left showing, which reads as a striped
 * ribbon rather than as ruled ground. The ink measure could not see it -- more
 * ink and more texture spread are exactly what it reported -- and that is the
 * measure's limit, not a case for keeping the mark.
 *
 * IT ALSO SAYS THE WRONG THING ABOUT THE FAMILY. A casing is for a LINE, which
 * has to survive imagery on its own; a hatch is a FIELD, and the same argument
 * is already written down two ways in this file -- the previous stipple died of
 * a per-dot casing ("a ring around every dot is a second mark at the same
 * frequency as the first"), and water's mark opts out of the halo rule for a
 * related reason. The hatch is the third case of it.
 *
 * SO THE CONTRAST IS PUT BACK WHERE IT WAS LOST: under the mark, not on it.
 * `screen` on this row's spec lays a screened neutral fill beneath the ruling,
 * restoring the ground the hatch was designed against. See SCREEN_TOKEN and
 * hatchScreen() below, and index.css's --pattern-* note for the measurements.
 */
/**
 * THE SCREEN UNDER A PAINT SERVER'S MARK: a full-tile rect, at `spec.screen`.
 *
 * WHY IT IS INSIDE THE TILE RATHER THAN A SECOND PATH UNDER THE ZONE. A second
 * path would be a second layer with its own opacity, its own state scale and
 * its own edge to keep in step -- three things to hold in agreement for one
 * mark. In the tile it is part of the paint server, so the path's own
 * fill-opacity scales the screen and the marks on it TOGETHER and the three
 * states stay three opacities of ONE mark, which is the property the whole
 * level language rests on. It also tiles for free: the rect is exactly the
 * tile, so the screen is seamless where the tiles meet.
 *
 * `screenToken` IS THE SAME TOKEN FOR BOTH USERS NOW, and that is the whole
 * argument for having a token at all. Both screens are --rule: a screen is not
 * a mark, it is the GROUND a mark was designed against, put back -- and a
 * ground has no business being in the mark's own colour. A screen in --oxide
 * under an oxide hatch would make a block a rust wash, which is a different
 * statement about the land and a much louder one; a screen in
 * --survey-excavated under a blue dot field made the same mistake more
 * quietly, and the excavated row below is the record of it.
 *
 * ONE SCREEN TREATMENT ACROSS THE BUILD is what that buys. Two screened
 * layers stacked are two of the SAME wash rather than two different claims
 * about one piece of ground, which is the only version of stacking that is
 * legible -- and by fencing there may be five committed layers. The field
 * stays parameterised rather than collapsing to a constant because the choice
 * is a per-mark one and the next mark should have to state it; omit the token
 * and the screen takes the mark's own colour, which is the thing this build
 * measured and rejected.
 */
function screenNode(spec, colour) {
  if (!spec.screen) return null
  const screen = document.createElementNS(SVG_NS, 'rect')
  const size = tileSizeOf(spec)
  screen.setAttribute('width', String(size))
  screen.setAttribute('height', String(size))
  screen.setAttribute('fill', spec.screenToken ? readToken(spec.screenToken) : colour)
  screen.setAttribute('fill-opacity', String(spec.screen))
  // Named on the node so the layout harness can lift the screen back off and
  // measure what it is worth -- the same question `data-uncased` asks of every
  // cased mark. Identified by name rather than by position, so a row without a
  // screen yields nothing to remove instead of losing its marks.
  screen.dataset.pass = 'screen'
  return screen
}

function hatchTile(spec, colour) {
  const size = spec.spacing
  const line = document.createElementNS(SVG_NS, 'path')
  // Written for 'up' and reflected in y for 'down' -- the mirror is the whole
  // of the difference between the two marks, so it is one expression.
  const y = (value) => (spec.rise === 'down' ? size - value : value)
  line.setAttribute(
    'd',
    `M0,${y(size)} L${size},${y(0)} ` +
      `M-1,${y(1)} L1,${y(-1)} ` +
      `M${size - 1},${y(size + 1)} L${size + 1},${y(size - 1)}`
  )
  line.setAttribute('stroke', colour)
  line.setAttribute('stroke-width', String(spec.weight))
  line.setAttribute('stroke-linecap', 'square')
  line.setAttribute('fill', 'none')
  // THE SCREEN FIRST, SO THE RULING SITS ON IT. See screenNode().
  const screen = screenNode(spec, colour)
  return screen ? [screen, line] : [line]
}

/**
 * WHY PRODUCTION'S HATCH SITS ON A SCREEN, WHICH TWO NEUTRAL IT IS, AND WHAT
 * THE SCREEN COSTS.
 *
 * Not a function -- a place to put the argument, next to the tile it is about,
 * so the row above can be six lines and this can be as long as it needs to be.
 *
 *
 * THE PROBLEM IS THE GROUND, NOT THE MARK
 *
 * A committed production block is barely visible from the water step onward.
 * The hatch has not changed: during LANDFORM it sits on the eligible highlight
 * (--eligible at ELIGIBLE_OPACITY) and that tint is most of what it reads
 * against, and from water onward the highlight is gone and the same ruling sits
 * directly on aerial imagery. Over closed canopy the bare committed hatch adds
 * 0.0088 ink against a 0.004 visibility floor -- twice the floor, and the road
 * line's own failure point.
 *
 * TWO WRONG LEVERS WERE PULLED FIRST, both recorded rather than quietly
 * dropped, because the reasoning behind each is sound and will come back:
 *
 *   RAISING THE --pattern-* SCALE (0.4/0.55/1 -> 0.55/0.75/1). Treats a
 *   contrast problem as an opacity problem, and charges the top of the scale
 *   for it: focus is pinned at 1, so everything under it coming up compressed
 *   focused/active from 1.82x to 1.33x and took the fence's state step to
 *   1.13x. See index.css.
 *
 *   CASING EACH RULE IN --halo, the road's own fix. Measured well -- 9.7x over
 *   canopy -- and read as a CANDY CANE: a 2px white stroke beside a 1px oxide
 *   one at a 5.66px perpendicular pitch is alternating bands of white and rust,
 *   a striped ribbon rather than ruled ground. See hatchTile().
 *
 * SO THE GROUND IS PUT BACK INSTEAD. A screened neutral under the ruling,
 * inside the tile, scaled by the level with everything else in it.
 *
 *
 * NOT --eligible, AND THAT IS THE FIRST DECISION
 *
 * The obvious answer is to reuse the highlight's own token, since the
 * highlight is the ground the mark was designed against. It is wrong: on the
 * water step --eligible under a committed block would say "this ground is
 * eligible", which is a claim about a gate that is no longer being run and was
 * never run for this step. The screen has to be a GROUND, not a reading -- so
 * it is one of the system's neutrals.
 *
 *
 * --rule AT 0.12, MEASURED AGAINST --stock, AT FOUR ALPHAS, OVER BOTH GROUNDS
 *
 * layout.test.jsx sweeps both; this is the committed row of it, which is the
 * hardest case (the lowest level on the hardest ground):
 *
 *                        screen alone      hatch on it    block total
 *   over canopy   bare       --            0.0088         0.0088
 *     --rule 0.06          0.0157          0.0069         0.0225
 *     --rule 0.12          0.0327          0.0067         0.0374
 *     --rule 0.2           0.0523          0.0075         0.0546
 *     --rule 0.3           0.0784          0.0085         0.0775
 *     --stock 0.12         0.0353          0.0070         0.0397
 *   over bare soil  bare      --           0.0170         0.0170
 *     --rule 0.12          0.0052          0.0176         0.0216
 *     --stock 0.12         0.0118          0.0185         0.0273
 *
 * THE BLOCK CLEARS THE FLOOR WITH ROOM: 0.0374 over canopy at the committed
 * level, against 0.004 -- nine times it, where the bare mark was twice it.
 *
 * --rule RATHER THAN --stock, on three counts. It is QUIETER as a layer at
 * every alpha on both grounds (0.0327 against 0.0353 over canopy, and 0.0052
 * against 0.0118 over soil -- half). It costs the ruling marginally less (see
 * below). And it is the right token to be borrowing: --stock is the PAGE, and a
 * screen of the page colour laid over aerial imagery is a claim about the
 * document rather than about the land, while --rule is already the system's
 * "quiet neutral that separates things without being a thing".
 *
 * 0.12 RATHER THAN 0.06 OR 0.2. 0.06 costs the ruling exactly as much and lifts
 * the block half as far (0.0225). 0.2 collapses the ruling (below) and puts the
 * screen at 0.0523 -- 83% of water's committed embankment wash, which is a
 * DECLARED layer, so at that weight the screen has stopped being a ground.
 * 0.12 is 52% of it, and the knee of the curve.
 *
 *
 * WHAT THE SCREEN COSTS, AND IT IS NOT NOTHING
 *
 * THE BLOCK GETS MORE VISIBLE AND THE RULING GETS LESS. Over canopy the same
 * ruling reads for 0.0067 on the screen against 0.0088 on bare imagery -- 0.76x
 * -- and the swatch's texture spread falls from 0.0154 to 0.0083, about half.
 *
 * THAT IS THE MID-VALUE TRAP, arriving from the other direction. --oxide is a
 * mid-dark rust and canopy is dark; a light screen lifts the ground TOWARDS
 * oxide's own value before it goes past it, so the rules lose contrast against
 * their own ground before they gain it. The bottom of that curve is around
 * --stock 0.2, where the spread reads 0.0020 and the ruling has very nearly
 * disappeared into its screen. index.css records the same trap for the rejected
 * --ink-muted fence colour; this is the same failure with the ground moving
 * instead of the line.
 *
 * IT IS ACCEPTED, AND THE REASON IS WHAT THE COMPLAINT WAS. "A committed block
 * is barely visible" is about the BLOCK -- whether there is something there at
 * all, on a map where the block is context for a decision being taken about
 * other ground. Which way its rules run is a second question, and it is
 * answered at the zoom someone actually inspects a block at, not at the
 * whole-parcel zoom this is measured at. A visible block whose ruling is
 * quieter beats an invisible block whose ruling would be crisp.
 *
 * THE LEVER IF THAT JUDGEMENT IS EVER REVERSED is the screen's colour, not its
 * alpha: a DARKER neutral would move the ground away from oxide instead of
 * towards it and gain contrast in both directions at once. There is no dark
 * neutral in the palette that is not --ink, and a screen of --ink under a
 * committed block reads as a shadow. That is why it is not the answer here, and
 * it is where to start if it has to be revisited.
 */

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
  // THE SCREEN, FIRST IN THE TILE SO THE DOTS SIT ON IT -- in --rule, the same
  // neutral production's hatch sits on. screenNode() owns the mechanism and
  // says why it is in the tile; the row itself says why the neutral replaced a
  // screen in the mark's own colour.
  const screen = screenNode(spec, colour)
  if (screen) nodes.push(screen)
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
/**
 * ONE <pattern> ELEMENT FROM ONE SPEC, under the id you give it.
 *
 * SPLIT OUT OF injectZonePatterns SO A CANDIDATE CAN BE BUILT, and that is the
 * only reason it is separate: the map injects the shipped table and the layout
 * harness injects tiles that are NOT in the table -- a denser lattice, a bigger
 * dot, a different screen -- to measure what moving each lever would cost. A
 * harness that hand-rolled those tiles would be measuring its own idea of a
 * stipple rather than this file's, and the day stippleTile() changed, the sweep
 * would quietly stop describing the mark it is meant to be sweeping.
 *
 * THE SPEC IS THE TABLE'S OWN SHAPE -- see TREATMENT_MARKS -- and `token` is
 * read here rather than written by the caller, so a candidate cannot introduce
 * a colour literal either.
 */
export function buildZonePattern(spec, id) {
  const buildTile = TILE_BUILDERS[spec.kind]
  if (!buildTile) return null
  const size = tileSizeOf(spec)
  const pattern = document.createElementNS(SVG_NS, 'pattern')
  pattern.setAttribute('id', id)
  pattern.setAttribute('patternUnits', 'userSpaceOnUse')
  pattern.setAttribute('width', String(size))
  pattern.setAttribute('height', String(size))
  // The colours on this surface are the only ones not set from a stylesheet,
  // so they are read from their tokens rather than written as literals.
  for (const mark of buildTile(spec, readToken(spec.token))) pattern.appendChild(mark)
  return pattern
}

/**
 * ONE TREATMENT'S SPEC, COPIED.
 *
 * FOR CANDIDATES ONLY, and copied rather than handed out so a sweep cannot
 * mutate the shipped table out from under the map. A candidate is this spread
 * with one field changed, which is what makes "the same mark with a denser
 * lattice" true rather than approximate.
 */
export function zoneTreatmentSpec(treatment) {
  const spec = TREATMENT_MARKS.find((entry) => entry.treatment === treatment)
  return spec ? { ...spec } : null
}

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
    const pattern = buildZonePattern(spec, patternIdFor(spec.treatment))
    if (pattern) defs.appendChild(pattern)
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
