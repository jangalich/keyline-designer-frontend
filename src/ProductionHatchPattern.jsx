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
 * The pattern id for a declared treatment, and for the ONE VARIANT a treatment
 * can have. ONE PLACE, because layers.jsx builds the same string to point a
 * fill at it and a second spelling would be a fill pointing at nothing --
 * which SVG renders as no fill at all, silently.
 *
 * `focused` ASKS FOR THE HALOED TILE AND IS ANSWERED ONLY IF THE ROW HAS ONE.
 * A mark that says focus with opacity has a single def and one id in every
 * state, so asking for its focused variant hands back the id it always had
 * rather than a second def nothing injected. See the `halo` field.
 */
export function patternIdFor(treatment, focused = false) {
  return `zone-pattern-${treatment}${focused && haloOf(treatment) ? FOCUS_SUFFIX : ''}`
}

/** What the haloed variant's id is spelled with. */
const FOCUS_SUFFIX = '--focused'

/** A treatment's halo description, or nothing if its focus is an opacity. */
function haloOf(treatment) {
  return TREATMENT_MARKS.find((entry) => entry.treatment === treatment)?.halo ?? null
}

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
  //
  // AND A HALO ON EACH RULE AT FOCUS, WHICH IS THE ONLY STATE THAT CHANGES THE
  // MARK RATHER THAN ITS LEVEL. Read haloTile()'s note before moving any of the
  // three numbers; the short version is that focus USED to be said by opacity
  // alone (--pattern-focused against --pattern-active) and that step had been
  // compressed to 1.33x by the scale raise, with no room left above it. The
  // halo says it with a second kind of ink instead: the same oxide, spread and
  // blurred around each individual rule, so the block glows at its own ruling
  // rather than getting darker as a whole. The CORE comes back down to the
  // active level with it -- a focused block inks exactly what an active one
  // does and the glow is the whole of the difference, which is what takes
  // --pattern-focused off its pin at 1. See index.css and fillLevelFor().
  {
    treatment: 'production',
    kind: 'hatch',
    token: '--oxide',
    spacing: 8,
    weight: 1,
    screen: 0.12,
    screenToken: '--rule',
    rise: 'up',
    halo: { spread: 1, width: 1.8, alpha: 0.55 },
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
  // 20 PER SIDE AT r=1.0: 3.20px apart, 2.0px across, 31% covered. A dot is
  // still two device pixels across and is drawn as a disc, and the lattice
  // tiles with no seam and no clamp: stippleTile() takes cell = tile/grid, so
  // grid cells span the tile EXACTLY whether or not the division is whole, and
  // every centre here -- 1.60, 4.80, 8.00 ... 62.40 -- lands on one decimal
  // place, inside the two the tile is written at. (The previous lattice leaned
  // on 64 dividing by 16 exactly; that was never the thing keeping the seam
  // shut, and this one would not have it.)
  //
  // AND THE DOT CAME DOWN AGAIN, for the reason the paragraph below gives the
  // first time it happened: at 3.20px of pitch, r=1.2 would be 0.75 CLOSURE --
  // past the 0.60 the texture peaks at, over the 0.7 bound, and heading for
  // the wash this mark exists not to be. The window r=1.0 sits in is narrow
  // and both its walls are measured: r >= 1.0 or the dot is under the 2px a
  // renderer needs to draw a disc, r < 1.12 or closure crosses the bound. The
  // bottom of that window is the end nearest the measured peak.
  //
  // 16 PER SIDE AT r=1.2 WAS 4.00px apart, 2.4px across, 28% covered, at 0.60
  // closure -- the geometry this one is a finer-grained step along, at nearly
  // the same ink. WHAT THE STEP MOVED, over canopy, all four from the sweep:
  //
  //                        block ink   texture   overlap texture   ground
  //     grid 16 r 1.2       0.0475     0.0331        0.0106          75%
  //     grid 20 r 1.0       0.0464     0.0322        0.0130          45%
  //
  // SO IT BOUGHT THE OVERLAP AND SPENT THE GROUND. Overlap texture is up 23%
  // and it is the reading that decides whether two coincident survey zones
  // still read as two marks, which is the thing this treatment exists for;
  // block ink and texture are flat within a few percent. Ground-showing is the
  // real cost, and it is a fall from three quarters to under half -- see the
  // sweep's own note, where the bound moved with it and says why.
  //
  // IT WAS 8 PER SIDE AT r=1.6 AND 12.6% COVERED, chosen to sit within a point
  // of the hatch's own eighth so the two marks were neighbours and neither
  // shouted. THAT IS WHAT THE DENSITY BOUGHT AND WHAT IT SPENT: the excavated
  // zone was still the quietest thing on this map over canopy, and density is
  // the one lever that adds ink WITHOUT touching per-dot contrast -- so unlike
  // every screen lever it makes the overlap BETTER rather than worse. The cost
  // is that excavated is no longer a quiet neighbour of the hatch; it is a
  // heavier mark than production, deliberately.
  //
  // AND THE DOT CAME DOWN AS THE GRID WENT UP, which is not the same change
  // twice. Coverage is pi*r^2*grid^2/tile^2, so 16-at-r-1.2 and 12-at-r-1.6
  // ink the SAME 28% at the SAME 0.60 closure -- the difference between them
  // is purely GRAIN. Finer grain wins on every instrument at once, because a
  // smaller dot at the same coverage puts more dot EDGE into the same area and
  // local contrast is what a texture is made of: 0.0475 of block ink against
  // grid 12's 0.0464, texture 0.0331 against 0.0313, and overlap texture
  // 0.0106 against 0.0098. That is the rare move on this mark that costs
  // nothing anywhere.
  //
  // 0.60 CLOSURE IS THE CEILING AND IT IS MEASURED. Closure is dot diameter
  // over spacing, and a lattice that closes is a WASH arrived at by another
  // route -- which would collapse the whole two-treatment design, since what
  // makes the overlap read as two marks is that one is a texture and the other
  // is a wash. layout.test.jsx sweeps the GRID at a fixed r=1.6, which is the
  // clean way to see where the turnover is:
  //
  //                  closure  cover   texture   ground still showing
  //     grid 8        0.40     13%    0.0203    82%
  //     grid 10       0.50     20%    0.0324    71%
  //     grid 12       0.60     28%    0.0375    59%   <- the peak
  //     grid 16       0.80     50%    0.0317    25%
  //     the wash         -    100%    0.0000     0%
  //
  // TEXTURE PEAKS AT 0.60 AND HAS TURNED OVER BY 0.80, and the ground showing
  // falls off a cliff across the same step. The bound in the test is 0.7,
  // between the two measured points rather than at a round number, and the
  // shipped lattice sits at 0.625 -- reached by a smaller dot on a tighter
  // grid rather than by grid 12's fatter dot on a looser one.
  //
  // THAT 0.025 OVER THE PEAK IS THE PRICE OF THE FINER GRAIN and is named
  // rather than rounded away: the grid could not go to 20 and hold 0.60
  // exactly, because 0.60 at a 3.20px pitch is a 1.92px dot and the drawability
  // floor is 2px -- the two bounds cross between grid 16 and grid 20, and this
  // is the first density where the window has a bottom rather than a choice.
  // The sweep is where to look if it ever needs re-measuring at this pitch;
  // 0.625 is a fifth of the way from the peak to the bound, not a gamble.
  //
  // AND A BIGGER DOT AT THE OLD 8px PITCH WAS THE OTHER WAY TO REACH THE SAME
  // COVERAGE AND IS RULED OUT. It reads better on ink, texture,
  // ground-showing and the overlap -- and loses on MOIRE by a factor of five
  // (r 2.4 beats against a 5px ground at 0.0085 against a 0.004 bound, where
  // the shipped lattice reads 0.0016). A denser lattice moves its pitch away
  // from the ground frequencies it beats with; a fatter dot leaves the pitch
  // where it is and gives the beat more to work with. THE TWO AXES ARE NOT
  // INTERCHANGEABLE AT EQUAL INK, and moire is the instrument that says so.
  //
  // WHICH IS ALSO HOW THIS DENSITY PAID FOR A REGRESSION IT DID NOT CAUSE.
  // Raising --pattern-active to 0.75 took the old lattice's worst beat from
  // 0.0038 to 0.0046, over the bound, because a beat scales with the opacity
  // of the mark making it. The three generations read 0.0037 (grid 8), 0.0024
  // (grid 12) and 0.0016 (shipped) in the asserted band, and the shipped one
  // is under the bound even in the sub-Nyquist band that raise pushed over.
  // The density change did not set out to fix the moire and fixing it is not
  // why it was chosen; it is recorded because the next person to move the grid
  // needs to know the margin they are spending.
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
  // AND A SCREEN UNDER THE DOTS, IN --halo, AT 0.16 -- WHICH IS PAST THE POINT
  // WHERE THIS MARK IS STILL A SCREEN. Read the whole of this before moving it.
  //
  // WHY THERE IS A SCREEN. A dot field inks a quarter of what it covers and
  // the rest is bare frame, so the screen is the rest: it is the GROUND the
  // mark was designed against, put back, and it is why this mark can be found
  // over closed canopy at all.
  //
  // THE SCREEN COLOUR HAS BEEN THREE THINGS AND THE HISTORY IS THE ARGUMENT.
  // It was --survey-excavated at 0.28 -- the mark's own colour, which makes
  // the whole cell one blue and is exactly the reading a dot field on a wash
  // exists to avoid. It was then --rule at 0.03, the neutral production's
  // hatch sits on. IT IS --halo NOW, the white end of the same neutral ladder
  // -- --rule is the hairline colour, --stock the page background and --halo
  // the casing white, in that order of lightness. index.css holds the values;
  // this file holds none.
  //
  // AND THAT RETIRES "ONE SCREEN COLOUR ACROSS THE BUILD", which an earlier
  // revision of this row claimed. Production sits on --rule and this mark sits
  // on --halo. The rule that survived is the one that was always doing the
  // work: A SCREEN IS NEVER IN ITS OWN MARK'S COLOUR. See screenNode().
  //
  //
  // 0.16, AND IT IS ON THE FAR SIDE OF A TROUGH. This is the part that is not
  // obvious from the number, and reaching for a value between 0.04 and 0.12
  // because it "looks safer" would land in the worst part of the range.
  //
  // OVER CANOPY THE DOT READS LIGHTER THAN ITS GROUND. So a white screen lifts
  // the ground TOWARD the dot, the two converge, and the mark loses contrast --
  // until the screen carries the ground PAST the dot, after which the dot is
  // the dark thing on a light ground and contrast climbs again. There are two
  // such crossings, at different alphas, because the EMBANKMENT WASH has
  // already lifted the ground where the two types coincide: the overlap
  // crosses over near 0.08 and bare canopy not until about 0.20.
  //
  // MEASURED, over canopy at active, against a 0.004 floor:
  //
  //                 overlap texture   texture on BARE canopy   block ink
  //     0.03           0.0106               0.0331              0.0475
  //     0.05           0.0066               0.0288              0.0562
  //     0.08           0.0011  <floor       0.0232              0.0686
  //     0.12           0.0067               0.0144              0.0876
  //     0.16           0.0136               0.0066              0.1044
  //     0.20           0.0214               0.0020  <floor      0.1217
  //
  // 0.16 IS CHOSEN FOR THE OVERLAP, which is the reading this pair of marks
  // exists to support: 0.0136 against the 0.0106 it had at 0.03, keeping 0.82
  // of what the lattice carries unscreened. That is the best the overlap has
  // ever measured, and every alpha that keeps the mark under the screen line
  // is on the near side, in the trough.
  //
  // WHAT IT COSTS IS THE MARK ON BARE CANOPY -- 0.0066 against 0.0331, a fifth
  // of the texture, still over the visibility floor and not by much. The field
  // is nearly flat there; what carries the zone instead is sheer presence,
  // 0.1044 of added ink against 0.0475. IT READS AS A PALE PANEL WITH A FAINT
  // GRID RATHER THAN AS A SCREEN DOOR ON IMAGERY, and that is the trade.
  //
  //
  // AND IT IS NO LONGER A SCREEN, WHICH IS A DECISION AND NOT A DRIFT.
  //
  // Measured against an opaque fill of the same colour at the focused level,
  // the mark reads 0.54 -- the aerial frame is a little under half of what you
  // see. The bound every survey mark used to keep was "the frame is MORE than
  // half"; the embankment wash still keeps it, at 0.40. This one was let past
  // deliberately, because the overlap and the half line could not both be had.
  // layout.test.jsx now carries one ceiling per mark and says so at length.
  //
  // THE WEAKER CLAIM THAT REPLACED IT is that the frame must still be at least
  // 40% of what is seen. 0.20 would read about 0.62 and fail that, so the band
  // asserted off the def is 0.12 to 0.16: far enough past the trough, not far
  // enough to become paint.
  //
  // WHAT IS NOT NEGOTIABLE is that this stays a TEXTURE. A mark that stopped
  // having dots in it would be a wash, and the two survey types would have
  // collapsed into one kind -- which is the whole thing the pair is built to
  // avoid. The overlap's texture floor and the mid-value test hold that, and
  // neither moved.
  //
  // TWO THINGS THE HEAVIER SCREEN QUIETLY IMPROVED, both recorded so the next
  // person knows what they are spending if they take it back down:
  //
  //   MOIRE fell to 0.0013 from 0.0016, because a beat scales with the dots'
  //   own contrast and the screen has taken that away.
  //
  //   THE OVERLAP'S RETENTION rose to 0.82 from 0.64 -- see the table.
  //
  // AND ONE IT MADE WORSE. STACKED SCREENS: three committed layers now take
  // 22.8% of an opaque cover over canopy and 30.6% over soil, against 14.9%
  // and 16.3% before. The bound is half, so there is room, but the margin is
  // no longer generous and by fencing there may be five layers. See the
  // stacking test.
  //
  //
  // AND THE PAIR IS NOW THE SAME WEIGHT ON ONE GROUND AND INVERTED ON THE
  // OTHER, which is the last thing to know before either survey mark moves.
  // Over canopy at active the wash reads 0.1149 and this mark 0.1076 -- within
  // a twentieth of each other, where at 0.03 it was less than half. Over bare
  // soil this mark reads 0.1014 against the wash's 0.0576, nearly twice it.
  //
  // SO WEIGHT NO LONGER TELLS THE TWO TYPES APART ANYWHERE, and KIND is the
  // whole of what does: one is a wash and one is a texture. That is what the
  // texture floors are protecting and why they are the assertions that may not
  // be traded away. If this mark ever stops reading as dots, the two survey
  // types become one mark in two values, which is the failure the dot field
  // was introduced to fix.
  {
    treatment: 'survey-excavated',
    kind: 'stipple',
    token: '--survey-excavated',
    tile: 64,
    grid: 20,
    radius: 1.0,
    screen: 0.16,
    screenToken: '--halo',
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

     AND IT CARRIES NO SCREEN, WHILE PRODUCTION'S DOES -- a DELIBERATE GAP,
     recorded rather than left to be noticed. Trees was expected to have
     production's problem and to have it worse: it declares NO eligible
     highlight at all, so its hatch sits on bare imagery from its own step
     onward rather than only downstream, and --tree is a mid-tone green over
     canopy that is also green.

     THE TREES BRANCH MEASURED IT AND THE ANSWER IS NO -- SWEPT, NOT APPLIED.
     layout.test.jsx now carries the sweep ("measures what a screen would do
     for the tree hatch"), --rule at four alphas over both grounds at all three
     levels, and it prints on every run. The readings, over canopy:

                       bare ruling   with --rule 0.12    the screen alone
         committed        0.0187      0.0564 (3.02x)          0.0431
         active           0.0254      0.0768 (3.02x)          0.0588
         focused          0.0340      0.1027 (3.02x)          0.0784

     WHAT SETTLES IT IS THE FIRST COLUMN, NOT THE SECOND. The screen lifts the
     tree block about as much as it lifts production's (3.0x against 4.1x) and
     costs about the same -- the ruling's own contrast falls to 0.71x its bare
     reading on the screen, where production's falls to 0.72x, and the numbers
     are that close because it is the same screen under the same ruling.

     THE DIFFERENCE IS THAT TREES HAS NO DEFICIT TO FIX. Production's screen
     exists because its committed hatch measured 0.0122 over closed canopy --
     three times a 0.004 floor, and reported in use as "barely visible". The
     tree hatch measures 0.0187 on the same ground at the same level: HALF AGAIN
     production's, and 4.7x the floor. The hue collision the paragraph above
     feared does not bite, because the two greens differ in VALUE -- --tree
     holds 3.06:1 over --halo and trees.test.jsx asserts it -- and value is what
     both the ink measure and the eye use at this size.

     SO THE COST WOULD BE PAID FOR NOTHING. At 0.12 the screen alone reads
     0.0431 over canopy, 64% of the quietest DECLARED wash in the build
     (water's committed embankment, 0.0679), and the ruling's texture spread
     falls from 0.0327 to 0.0232. And it would STACK: three committed screens
     already take 22.8% of an opaque cover over canopy and 30.6% over soil, and
     a tree zone is committed ground by the two steps after it -- this would be
     the fourth, on a parcel that may carry five layers by fencing.

     THE GAP IS THEREFORE A DECISION NOW AND NOT A SCOPE NOTE, and trees.test
     .jsx still asserts the asymmetry off this row so closing it stays
     deliberate. WHAT WOULD REOPEN IT: the bare ruling falling toward the floor
     on a ground this sweep does not carry, or --tree moving darker. Re-run the
     sweep; do not re-derive it. See hatchScreen() and screenNode(). */
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
  // THE FENCE: A BARE HAIRLINE, AND ITS FOCUS IS A HALO IN ITS OWN COLOUR.
  //
  // THINNER THAN THE ROAD AND UNCASED, which are one decision and the
  // opposite of the road's. A road is a cased line because a road has to be
  // findable on any ground; a fence is the quietest geometry on this map and
  // is drawn as one hairline in --rule, with nothing under it.
  //
  // WHAT THAT COSTS IS WRITTEN DOWN AND IT IS NOT SMALL. index.css's --fence
  // note carries the measurements: putting the road's casing back is worth
  // 7.3x the bare line over canopy and 12.3x over soil, and without it the
  // mark sits BELOW the 0.004 visibility floor every other mark on this map
  // meets -- 0.0008 committed and 0.0011 active over bare soil, 0.0039
  // committed over canopy. Only the FOCUSED fence clears it, on the glow.
  // layout.test.jsx reports every one of those readings on each run and names
  // the fence as the one exception to the floor rather than dropping the
  // measurement. See that note before putting a casing back or taking one off
  // anything else.
  //
  // AND FOCUS IS A HALO, WHICH IS PRODUCTION'S OWN FIX APPLIED TO A LINE.
  // Focus used to be said here by opacity alone, and index.css states the
  // cost: 1.41x active on mid-grey, under the 1.5x every pattern mark meets,
  // because a pale line cannot swing against grey the way a dark core does.
  // The halo says it with a second kind of ink instead -- a blurred stroke
  // around the line -- and the core comes back down to the active level with
  // it (focusIsAHalo, and layers.jsx's markLevelFor). Measured at 5.88x on
  // mid-grey, 5.96x over canopy and 5.83x over soil.
  //
  // THE GLOW IS THE MARK'S OWN COLOUR, which is production's rule exactly:
  // the block glows at its own ruling, and a fence glows in --rule. It is
  // also what an uncased line leaves available -- a white glow under a bare
  // pale line is the casing coming back in soft focus, which is the pass
  // this row just took off. --halo and --ink measure HIGHER by the ink
  // difference (a white or dark glow contrasts more with the ground than a
  // pale one does) and both are kept in the sweep; see index.css.
  {
    treatment: 'fence',
    kind: 'line',
    token: '--fence',
    weight: 1,
    casing: 0,
    halo: { token: '--fence', width: 5, alpha: 0.6 },
  },
]

/**
 * Kept for the drawn-zone rule in App.css, which is the one fill still set
 * from a stylesheet. Production's own pattern, by its id -- the UNHALOED one,
 * which is what a stylesheet can name: the variant is a state, and states are
 * resolved in layers.jsx where the state is known.
 */
export const HATCH_PATTERN_ID = patternIdFor('production')

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
export function zoneMark(treatment, { focused = false } = {}) {
  const spec = TREATMENT_MARKS.find((entry) => entry.treatment === treatment)
  if (!spec) return null
  if (spec.kind === 'tint') {
    const colour = readToken(spec.token)
    return { kind: 'tint', fill: colour, stroke: colour }
  }
  if (spec.kind === 'line') {
    // A stroke and nothing to fill: the line IS the mark.
    //
    // ITS WEIGHTS COME OFF THE ROW where the row declares them, and a row that
    // does not falls back to the road's pair in layers.jsx. The road IS the
    // default -- it is the line this map drew first and every number under
    // LINE_WEIGHT was argued for it -- so a second line that wants its own
    // weight says so here rather than making the first one say it twice.
    //
    // A `casing` OF 0 IS "NO CASING", NOT "THE DEFAULT". Null is the absent
    // declaration and falls back; zero is a declaration, and a casing zero
    // pixels wide is a casing that is not drawn. LineLayer lays no pass for
    // it at all rather than a zero-weight path nothing can see but every
    // count of the drawn lines can.
    //
    // AND THE HALO IS RESOLVED LIKE A HATCH'S, through the same `focus` field
    // focusIsAHalo() reads, so nothing downstream has to know that one of the
    // two marks that can glow is a paint server and the other is a stroke.
    return {
      kind: 'line',
      fill: null,
      stroke: readToken(spec.token),
      weight: spec.weight ?? null,
      casing: spec.casing ?? null,
      focus: spec.halo ? 'halo' : 'level',
      halo: spec.halo ? { ...spec.halo, colour: readToken(spec.halo.token) } : null,
    }
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
  // A PAINT SERVER, AND WHICH OF ITS TWO THE STATE ASKS FOR. `focused` is the
  // only thing on this surface that changes a mark rather than its level, and
  // it changes exactly one row -- see the `halo` field and focusIsAHalo().
  return {
    kind: 'pattern',
    fill: `url(#${patternIdFor(treatment, focused)})`,
    stroke: null,
    focus: spec.halo ? 'halo' : 'level',
  }
}

/**
 * DOES THIS MARK SAY FOCUS WITH A HALO RATHER THAN WITH MORE INK?
 *
 * A PREDICATE ON THE MARK, like marksItsOwnEdge(), and for the same reason:
 * layers.jsx asks the mark what it is rather than carrying a list of which
 * treatments are special. Two things follow from a true answer, and they are
 * one decision -- the fill points at the haloed tile, and the fill's LEVEL
 * comes down to the active one, because a halo that arrived on top of a raised
 * opacity would be saying focus twice and spending the scale anyway.
 */
export function focusIsAHalo(mark) {
  return mark?.focus === 'halo'
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
 * `screenToken` IS WHAT THE TWO USERS DIFFER ON, AND THE RULE IS NOT WHICH
 * TOKEN -- IT IS THAT A SCREEN IS NEVER IN ITS OWN MARK'S COLOUR.
 *
 * A screen is not a mark. It is the GROUND a mark was designed against, put
 * back, and a ground in the mark's own colour stops being a ground: a screen
 * in --oxide under an oxide hatch makes a block a rust wash, which is a
 * different statement about the land and a much louder one. A screen in
 * --survey-excavated under a blue dot field made the same mistake more
 * quietly -- the whole cell became one blue, which is exactly the reading a
 * dot field on a wash exists to avoid -- and the excavated row is the record
 * of it. THAT is the rule this field exists to enforce, and it is what
 * layout.test.jsx asserts off the def.
 *
 * ONE SCREEN COLOUR ACROSS THE BUILD WAS A TIDIER CLAIM THAN THE MARKS COULD
 * SUPPORT, and it was made here for one revision. Production sits on --rule
 * and the excavated lattice on --halo, two rungs of one neutral ladder
 * (--rule, --stock, --halo), because the two marks are trying to buy different
 * things: production's ruling wants its ground separated and nothing more,
 * and the dot field wants absolute presence over closed canopy, where a whiter
 * screen lifts faster per unit alpha. Both alphas are ceilinged by what the
 * screen costs the survey pair's OVERLAP; neither is a preference.
 *
 * SO STACKED SCREENS ARE NOT TWO OF ONE WASH, which is worth knowing because
 * by fencing there may be five committed layers on a parcel. They are measured
 * as they actually stack rather than assumed -- see the stacking test, which
 * puts the shipped screens on top of each other and reports what is left of
 * the frame.
 *
 * Omit the token and the screen takes the mark's own colour, which is the
 * thing this build measured and rejected. It stays parameterised rather than
 * collapsing to a constant because the choice is a per-mark one and the next
 * mark should have to state it.
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

/**
 * THE RULING'S PATH, AND HOW FAR PAST THE TILE'S CORNERS IT RUNS.
 *
 * `reach` is the length of the two corner stubs. A <pattern> clips at the tile
 * edge, so the stubs exist to complete the two corners the main diagonal
 * misses and the strokes then join across tile edges into continuous rules. A
 * 1px stub is enough for a 1px rule and NOT enough for a blurred one: a halo
 * spilling past a corner is clipped with it, and what the eye sees is a rule
 * that beads -- lit along each tile and dark at every 8px join. The haloed tile
 * asks for a longer stub so each tile draws the glow its neighbour's clipped
 * line would have contributed; see haloTile().
 */
function rulingPath(spec, reach) {
  const size = spec.spacing
  // Written for 'up' and reflected in y for 'down' -- the mirror is the whole
  // of the difference between the two marks, so it is one expression.
  const y = (value) => (spec.rise === 'down' ? size - value : value)
  return (
    `M0,${y(size)} L${size},${y(0)} ` +
    `M${-reach},${y(reach)} L${reach},${y(-reach)} ` +
    `M${size - reach},${y(size + reach)} L${size + reach},${y(size - reach)}`
  )
}

function hatchTile(spec, colour, options = {}) {
  const halo = options.focused ? spec.halo : null
  const line = document.createElementNS(SVG_NS, 'path')
  line.setAttribute('d', rulingPath(spec, halo ? HALO_STUB_REACH : 1))
  line.setAttribute('stroke', colour)
  line.setAttribute('stroke-width', String(spec.weight))
  line.setAttribute('stroke-linecap', 'square')
  line.setAttribute('fill', 'none')
  // THE SCREEN FIRST, SO THE RULING SITS ON IT. See screenNode(). The halo
  // goes between the two: it is a light around the ruling, not a wash under
  // the block, so it belongs over the ground and under the ink it lights.
  const screen = screenNode(spec, colour)
  return [screen, ...haloTile(spec, colour, halo, options.id), line].filter(Boolean)
}

/** How far past a corner a haloed rule runs. Three sigma of the widest halo
 *  this file carries, rounded up: past it the glow has nothing left to clip. */
const HALO_STUB_REACH = 3

/**
 * THE HALO: THE SAME RULE, WIDER, SOFTER, AND UNDER THE ONE THE READER SEES.
 *
 * WHAT IT IS FOR. Focus used to be said by opacity alone, and index.css has
 * the arithmetic: --pattern-focused is pinned at 1, so raising the rest of the
 * scale to 0.55/0.75/1 left focused/active at 1.33x, down from 1.82x, with
 * nothing above it to spend. A halo says focus with a SECOND KIND OF INK
 * instead of more of the first, so the step does not come out of the scale at
 * all -- and the core can come back down to the active level, which is what
 * takes --pattern-focused off its pin. fillLevelFor() in layers.jsx is where
 * that drop happens; this is only the mark.
 *
 * THE THREE NUMBERS, AND THE TWO THAT BOUND THEM.
 *
 *   spread  the blur's sigma, in tile units. The glow's softness.
 *   width   the stroke the blur is applied to, against the rule's own 1px.
 *   alpha   how strong that stroke is before it is blurred.
 *
 * The rules are 5.66px apart perpendicular (8 / sqrt 2), and everything the
 * halo can get wrong is a consequence of that one number. Two measures bound
 * it, both swept in layout.test.jsx:
 *
 *   GLOW INK, alpha * width / 5.66 -- the halo averaged over the whole block.
 *   Blur conserves ink, so this is exact rather than measured, and past about
 *   0.12 the halo has become a WASH in its own right: production's neutral
 *   screen sits at 0.12, and a rust wash at the same weight over a block is a
 *   different statement about the land than ruled ground is.
 *
 *   CLOSURE, how much of the halo's peak is still lit midway between two
 *   rules. 0 is open ground and 1 is a closed wash; past about 0.2 the gaps
 *   have filled in and the hatch has stopped being a hatch.
 *
 *                       glow ink   closure
 *   0.5 / 1.2 / 0.35      0.074      0.00     barely a halo
 *   1.0 / 1.8 / 0.55      0.175      0.08     SHIPPED
 *   1.6 / 2.8 / 0.70      0.346      0.58     closes to a rust wash
 *
 * THE SHIPPED ROW IS OVER THE 0.12 WASH BOUND AND WELL UNDER THE CLOSURE ONE,
 * and that is the trade, made by looking: at 0.074 the halo is present in a
 * measurement and absent to a reader at whole-parcel size, which is the same
 * failure the opacity step had. What keeps 0.175 from reading as a wash is
 * that it is not laid flat -- it is concentrated on the ruling, with the
 * ground between rules still at a twelfth of the peak, so the block reads as
 * lit ruling rather than as tinted ground. The closure number is the one that
 * says so, and it is the one to watch when moving any of the three.
 *
 * AND IT IS NOT THE CASING THAT WAS REVERTED. See hatchTile()'s note above:
 * that was a 2px WHITE stroke beside a 1px oxide one at the same pitch, which
 * is alternating bands of white and rust -- a candy cane. This is oxide on
 * oxide with no hard edge of its own, so there is no second colour to
 * alternate with, and it is on ONE zone at a time rather than on every block
 * the map carries.
 *
 * THE FILTER LIVES INSIDE THE PATTERN, and its id is the pattern's own. A
 * <filter> is never rendered where it sits, only referenced, so putting it in
 * the tile costs nothing and buys the one thing the layout harness needs: it
 * clones a <pattern> into a swatch's own <defs> to measure it, and a filter
 * left behind in the map's host would leave that clone pointing at nothing --
 * an unblurred 1.8px stroke wearing the halo's name, measured and reported.
 */
function haloTile(spec, colour, halo, id) {
  if (!halo) return []
  const filter = document.createElementNS(SVG_NS, 'filter')
  filter.setAttribute('id', `${id}-glow`)
  // The glow reaches well past the stroke it is applied to, and a filter
  // region is a fraction of the filtered object's box -- so it is opened up
  // rather than left at the -10% default, which would clip the halo square.
  filter.setAttribute('x', '-100%')
  filter.setAttribute('y', '-100%')
  filter.setAttribute('width', '300%')
  filter.setAttribute('height', '300%')
  const blur = document.createElementNS(SVG_NS, 'feGaussianBlur')
  blur.setAttribute('stdDeviation', String(halo.spread))
  filter.appendChild(blur)

  const glow = document.createElementNS(SVG_NS, 'path')
  glow.setAttribute('d', rulingPath(spec, HALO_STUB_REACH))
  glow.setAttribute('stroke', colour)
  glow.setAttribute('stroke-width', String(halo.width))
  glow.setAttribute('stroke-opacity', String(halo.alpha))
  glow.setAttribute('stroke-linecap', 'square')
  glow.setAttribute('fill', 'none')
  glow.setAttribute('filter', `url(#${id}-glow)`)
  // Named on the node for the same reason the screen is: the harness lifts it
  // back off to measure what the halo is worth, and finds it by name rather
  // than by position.
  glow.dataset.pass = 'halo'
  return [filter, glow]
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
// `options` is hatchTile's -- the variant and the id it is being built under.
// A stipple has no variant: its focus is an opacity like every other mark's,
// so it takes the argument and ignores it rather than having a second shape.
// eslint-disable-next-line no-unused-vars
function stippleTile(spec, colour, options = {}) {
  const cell = spec.tile / spec.grid
  const nodes = []
  // THE SCREEN, FIRST IN THE TILE SO THE DOTS SIT ON IT -- in --halo, the white
  // end of the same neutral ladder production's hatch sits on. screenNode()
  // owns the mechanism and says why it is in the tile; the row itself says why
  // a neutral replaced a screen in the mark's own colour, and what the white
  // end buys over the quiet one.
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
export function buildZonePattern(spec, id, { focused = false } = {}) {
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
  for (const mark of buildTile(spec, readToken(spec.token), { id, focused })) pattern.appendChild(mark)
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
    // A SECOND DEF ONLY FOR A ROW THAT SAYS FOCUS WITH A HALO, and it is a
    // whole tile rather than a modifier on the first: a paint server is
    // pointed at, not adjusted, so the focused zone's fill names the haloed
    // tile and every other state keeps the one above. A row without a halo
    // injects nothing here and its focused zones point at the tile they
    // always did.
    if (!spec.halo) continue
    const haloed = buildZonePattern(spec, patternIdFor(spec.treatment, true), { focused: true })
    if (haloed) defs.appendChild(haloed)
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
