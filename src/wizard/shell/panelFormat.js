/**
 * panelFormat.js  —  THE DETAIL PANEL'S FORMAT. ALL SIX STEPS, ONE COPY.
 *
 * WHAT THIS IS FOR. The panel is being made consistent across the six steps,
 * and the failure mode that work exists to fix is each step arriving with its
 * own arrangement of the same facts. So the arrangement is declared ONCE, here,
 * and a step declares a LIST OF ROWS against it. Every rule below is the
 * panel's; a step supplies values and labels and nothing else.
 *
 * EVERY STEP WITH MEASUREMENTS TO SHOW NOW DECLARES AGAINST IT -- production,
 * water, roads, trees and structures, in that order, each on its own branch.
 * Fencing is the one panel still on `groups`, and it has no measurement set to
 * migrate: a length and a placeholder, pending its own settling. THE FORMAT
 * HELD ACROSS ALL FIVE and grew exactly two things while it did -- the
 * denominator (water), and the labelled break with the TERM row under it
 * (trees). Structures, the last of them, needed neither: the fifth kind of
 * panel this format has been asked to arrange came out of the constructors
 * that were already here.
 *
 * WHERE THE TWO HALVES LIVE. This file owns the FORMAT -- what a row is, what a
 * break is, which face each row takes, and how a panel's body is composed out
 * of a step's declaration. DetailPanel.jsx owns the DOM, and it is the only
 * renderer: one panel, six steps. Neither half is a step's to reimplement.
 *
 * NO REACT IN HERE, deliberately. stepDefinitions.js imports the row
 * constructors and it is not a React module; a component in this file would put
 * one there by import.
 *
 *
 * THE FORMAT
 *
 *     Block 1
 *      4.0                        acres
 *     42.9                        /100 score
 *     ────────────────────────────────
 *     south facing                aspect
 *     upper field                 position
 *      3.2                        median slope %
 *      —                          soil
 *      —                          drainage class
 *
 * IN ORDER:
 *
 *   1. THE HEADER IS THE FEATURE'S ID, title case, and it is the only
 *      capitalised line in the panel. It is the TAB'S OWN NAME, read off
 *      `tabs()` rather than restated by `detail()` -- see headerFor(). Two
 *      spellings of one identity is how "Block 1" on the strip becomes "Zone 1"
 *      in the panel three branches later.
 *
 *   2. THEN THE SCAN TAB'S OWN ROWS, REPEATED VERBATIM. Above the break is
 *      identity and comparison -- what you picked this feature out BY -- and
 *      below it is explanation. The panel takes those rows from the step's own
 *      `tabs()` too (tabRowsOf()), so "verbatim" is a fact about the code and
 *      not a promise a step has to keep.
 *
 *   3. A BREAK.
 *
 *   4. CATEGORICALS FIRST, THEN MEASURED VALUES. This one is a CONVENTION a
 *      step declares to, not a sort the panel performs, and the difference is
 *      deliberate: the panel renders rows in DECLARED order. Sorting by type
 *      was tried (see DetailPanel.jsx's GROUPS note) and it interleaved the
 *      four groups water's panel then had, which meant four different things.
 *      Water declares against this format now and its four groups came out as
 *      TWO UNLABELLED RUNS -- one break, and the convention applied to each
 *      run, `water delivery` leading a run of figures. Production itself
 *      departs from the convention at the bottom -- soil and drainage class
 *      are categorical and sit under a measured row -- because they are the
 *      PENDING rows and pending rows belong last. See LANDFORM_STEP.detail and
 *      WATER_STEP.detail.
 *
 *   5. A SECOND BREAK WHERE A STEP HAS ONE. `PANEL_BREAK` anywhere in a step's
 *      rows. Production has none; water has one, between what a survey area IS
 *      and what it TOUCHES.
 *
 *      AND A BREAK MAY CARRY A LABEL, WHICH TREES IS THE FIRST TO EARN.
 *      `labelledBreak('marginal benefits')` is the same rule with a heading
 *      over the run under it; `PANEL_BREAK` is the unlabelled singleton and is
 *      still what most declared breaks are. STRUCTURES IS THE SECOND AND LAST
 *      TO EARN A LABEL, for a run that is the opposite kind of statement --
 *      the siting rules a placed site BREAKS -- and by the same test: each row
 *      is a plain fact about the spot, and nothing in the words says it is a
 *      rule this site fails. Two headings in six panels is the rate the bar
 *      was set to produce.
 *
 *      THE LABEL IS THE EXCEPTION AND THE BARE RULE IS THE DEFAULT, and that
 *      ordering is the whole finding water left behind. Water went into this
 *      format with four LABELLED groups and came out with two unlabelled runs,
 *      because each run said what it was: "water delivery" leads a run of
 *      figures, "production overlap %" opens the run about what a zone touches.
 *      Roads did the same. A heading over a run that already names itself is a
 *      word that says what the reader can already see, and the format's whole
 *      argument is that a rule between two runs is cheaper than a heading over
 *      each.
 *
 *      SO A LABEL HAS TO BE A CLAIM THE ROWS DO NOT MAKE. Trees' benefits run
 *      is three bare terms off the wire, and nothing in them says what kind of
 *      statement they are or why they are under a tree zone's measurements.
 *      MARGINAL BENEFITS is what says it, and it is not recoverable from the
 *      rows. That is the bar, and a step that cannot state what its heading
 *      adds should declare PANEL_BREAK.
 *
 *      IT IS A HEADING, NOT A GROUP. The panel is still ONE grid with rules
 *      across it (see panelBody) -- a labelled break draws the same hairline
 *      and puts a line of prose under it. Nothing is nested, nothing sizes its
 *      own columns, and the decimal point still runs from the first figure to
 *      the last. The `groups: [{label, fields}]` shape DetailPanel still
 *      renders for fencing -- the one step left on it, whose panel is a
 *      placeholder pending its own settling -- is the thing this is not.
 *
 *      LOWER CASE HERE, UPPER CASE ON SCREEN, like every other word below the
 *      header: the step declares 'marginal benefits' and the stylesheet sets
 *      it. See the EVERYTHING BELOW THE HEADER note.
 *
 *   6. CAUTIONS OR BENEFITS LAST, APPEARING ONLY WHEN PRESENT. The panel's,
 *      not the step's: DetailPanel renders `detail.cautions` under its own rule
 *      and draws nothing when the list is empty.
 *
 *
 * THE TWO COLUMNS
 *
 * VALUES RIGHT-ALIGNED IN THE LEFT COLUMN, LABELS IN THE RIGHT. One grid for
 * the WHOLE body, tab rows and step rows together, which is the only way `4.0`
 * above the break and `3.2` below it share a decimal point. A break is a rule
 * drawn across that grid, not the start of a second one.
 *
 * MEASURED VALUES ARE IBM PLEX MONO WITH `tabular-nums`. The design system's
 * signature, and the thing that actually holds the decimal point still down a
 * column -- a proportional face gives `1` and `4` different widths and no
 * amount of right-alignment recovers from that.
 *
 * CATEGORICALS ARE PROSE, IN THE VALUE POSITION. "south facing" sits where
 * "4.0" sits: same row, same left edge. What it does NOT do is join the number
 * track. The trees branch measured the alternative -- "north-facing" in the
 * figure column widened it and shoved every label in the panel sideways -- so a
 * categorical row spans the figure track AND the slack beside it, and the
 * figure track is sized by the figures alone. CSS does that for us: a grid item
 * spanning a flexible track contributes nothing to the intrinsic size of the
 * fixed tracks it also spans (CSS Grid §12.5), which is exactly the rule the
 * old label-first treatment was working around by leaving the column entirely.
 *
 * DENOMINATORS RIDE THE LABEL, AND THEY ONLY APPEAR IN THE PANEL. `42.9` is
 * the value and `/100 score` is the label. `42.9/100` in the value position is
 * four characters of non-numeric text in the number track, and `4.0` above it
 * no longer lines up with anything.
 *
 * THE SCAN TAB SAYS "score" AND THE PANEL SAYS "/100 score", off ONE
 * declaration. A tab row declares `denominator: 100` beside its label; the
 * strip renders the label and the panel, repeating that same row below its
 * header, renders the denominator with it. See denominated().
 *
 * THE SPLIT IS WHAT EACH SURFACE IS FOR. The strip is read ACROSS candidates,
 * where every score is on one scale and the denominator is the same four
 * characters on every tab -- noise in a cell 6ch wide that is trying to hold a
 * column of figures. The panel is read about ONE feature, where "what is this
 * out of" is a real question and nothing else on screen answers it. Denominator
 * is explanation, and explanation lives below the break.
 *
 * ONE SOURCE, TWO RENDERINGS, and that is why it is here and not in a step. The
 * panel already takes the tab's rows verbatim (tabRowsOf), so the denominator
 * is something the PANEL ADDS rather than something the step declares twice --
 * a step that wrote "/100 score" into the panel and "score" into the tab would
 * have two strings to keep in step and nothing to notice when they part.
 *
 * EVERYTHING BELOW THE HEADER IS LOWER CASE, and the panel does it in CSS
 * rather than by rewriting anyone's words. That matters: `caution.label` is the
 * exclusion layer's own prose off the payload and a step's row values are the
 * backend's own words; text-transform changes how they are set and leaves the
 * text alone, which a `.toLowerCase()` here would not.
 *
 *
 * TWO DATA RULES, BOTH ALREADY ESTABLISHED AND BOTH RESTATED HERE BECAUSE THIS
 * IS NOW WHERE THE FORMAT IS WRITTEN DOWN:
 *
 *   NULL RENDERS AS AN EM-DASH, NEVER A ZERO. stepDefinitions' measure() does
 *   it for figures and a step does it for categoricals (`?? EM_DASH`). Null
 *   means "not known" and a 0.0 in its place is a measurement that was never
 *   taken -- the one falsehood in a data panel a reader cannot detect.
 *
 *   A CAUTION OR OVERLAP ROW DROPS AT ZERO. Zero means checked and genuinely
 *   none, so the row carries nothing and costs a line. Null is different and
 *   still renders. dropsAtZero() is the rule as a function.
 */

/** The em dash every "not known" prints as, in either face. */
export const EM_DASH = '—'

/** A figure: mono, tabular, right-aligned, in the number track. */
export const MEASURED = 'measured'

/** A word or phrase: prose, in the value position, out of the number track. */
export const CATEGORICAL = 'categorical'

/**
 * A TERM: one word or phrase, ACROSS THE WHOLE ROW, with no label beside it.
 *
 * THE THIRD FACE, AND THE FIRST THAT IS NOT A VALUE-AND-LABEL PAIR. Both other
 * kinds answer a question the label asks -- "median slope %" asks it and "3.2"
 * answers it. A term asks nothing and answers nothing: it is a NAME on a list,
 * and the thing that says what the list is is the heading over it (rule 5).
 *
 * SO IT TAKES NEITHER COLUMN. A term in the value position would leave the
 * label track empty on three rows running, which reads as three measurements
 * whose labels failed to load; a term in the LABEL position would leave the
 * number track empty and right-align nothing against the figures above it.
 * Both are a pair with a hole in it, and a term is not a pair. It spans every
 * track and starts at the same left edge every other value does.
 *
 * TREES WAS THE FIRST AND STRUCTURES IS THE SECOND, which is the evidence that
 * this face was a kind and not a one-off. Trees' terms are the benefits the
 * backend's own gate rule awarded (tree_zone_candidates.marginal_benefits); what
 * this side knows is that each is a word, that the list came in a declared
 * order, and that an empty list means the zone earned none. NOT ONE OF THOSE
 * WORDS IS WRITTEN DOWN IN THIS APP, here included -- see the step.
 *
 * STRUCTURES' ARE THE OPPOSITE STATEMENT IN THE SAME SHAPE: the siting rules a
 * placed site BREAKS, one term each, under a heading that says so. The two runs
 * are set identically and that is deliberate rather than an oversight -- a
 * placed site that breaks a gate is scored and committable, not refused, so a
 * warning treatment on those rows would contradict the step's own posture. What
 * a term IS stays the same in both: a name on a list, whose list is named above
 * it.
 */
export const TERM = 'term'

/**
 * A RULE ACROSS THE BODY. Sits in a step's `rows` where it wants one, and the
 * panel puts one between the tab's rows and the step's own without being asked.
 *
 * Frozen and compared by identity, so a break cannot be half-built by a step
 * that meant to declare a row.
 */
export const PANEL_BREAK = Object.freeze({ panelBreak: true })

export function isBreak(row) {
  return row === PANEL_BREAK || row?.panelBreak === true
}

/**
 * THE SAME RULE, WITH A HEADING UNDER IT -- `labelledBreak('marginal benefits')`.
 *
 * ONE KIND OF THING, NOT TWO. A labelled break IS a break: isBreak() is true of
 * it, panelBody collapses it exactly as it collapses a bare one, and the panel
 * draws the same hairline. The label is one more field on the object, which is
 * why nothing that already handles breaks had to learn about it -- a heading
 * that arrived as its own row type would have been a second thing for every
 * reader of a body to branch on, and the first one to forget would render a
 * heading with no rule or a rule with no heading.
 *
 * WHEN A STEP MAY DECLARE ONE is rule 5, and the bar is high on purpose: the
 * heading has to make a claim the rows under it do not make. Water and roads
 * both went looking for one and neither could state what it would add.
 *
 * FROZEN LIKE THE SINGLETON, for the same reason, and NOT interned: two steps
 * declaring the same heading are two headings, and identity is not how a break
 * is recognised (isBreak reads the flag).
 */
export function labelledBreak(label) {
  return Object.freeze({ panelBreak: true, label })
}

/** A break's heading, or null -- which is what `PANEL_BREAK` always answers. */
export function breakLabel(row) {
  return isBreak(row) ? row.label ?? null : null
}

/** A measured row -- `measuredRow(measure(zone.slope_median_pct), 'median slope %')`. */
export function measuredRow(value, label) {
  return Object.freeze({ kind: MEASURED, value, label })
}

/** A categorical row -- `categoricalRow('south facing', 'aspect')`. */
export function categoricalRow(value, label) {
  return Object.freeze({ kind: CATEGORICAL, value, label })
}

/**
 * A term row -- `termRow(zone.marginal_benefits[0])`. One word, whole width.
 *
 * NO SECOND ARGUMENT, and the missing one is the point: a term that took a
 * label would be a categorical, and the two would be one kind in two dressings
 * within a branch. See TERM.
 */
export function termRow(term) {
  return Object.freeze({ kind: TERM, value: term })
}

/**
 * A row, or nothing at all, on a count that may be zero.
 *
 * ZERO MEANS CHECKED AND GENUINELY NONE and the row says nothing worth a line;
 * NULL MEANS NOT KNOWN and still renders, as an em dash. The two are different
 * answers and the whole reason this is a function rather than a truthiness
 * test at each call site: `value || null` drops both.
 */
export function dropsAtZero(value, row) {
  // NULL IS TESTED FOR BEFORE THE NUMBER IS, and that is not defensive
  // tidiness -- it is the whole rule. `Number(null)` IS 0 in JavaScript, so
  // the bare numeric test dropped the never-checked row along with the
  // measured-zero one and this function quietly did the `value || null` it
  // exists to refuse. It shipped that way because production declares no row
  // that drops at zero; water is the first caller, its three overlaps are the
  // one payload shape that can state all three answers, and the case surfaced
  // the moment a null reached here. `undefined` goes with it: a row the
  // payload never carried is not a measured absence either.
  if (value == null) return row
  return Number(value) === 0 ? null : row
}

/**
 * A LABEL WITH ITS DENOMINATOR ON IT -- "score" becomes "/100 score".
 *
 * THE PANEL'S FORM OF A TAB ROW'S LABEL, and the only place the `/N` is
 * written. A row with no `denominator` passes through untouched, which is every
 * row that is not a figure out of something: an acreage is not out of anything.
 *
 * `/N` RATHER THAN "of N" or "out of N", because the panel's label column is
 * the data face and a solidus is the notation a data face is for. It also
 * sorts: "/100 score" and "acres" stack as two labels rather than as a label
 * and a phrase.
 */
export function denominated(label, denominator) {
  return denominator == null ? label : `/${denominator} ${label}`
}

/**
 * A LABEL WITH ITS QUALIFIER ON IT -- "acres" becomes "survey acres".
 *
 * THE SECOND THING THE PANEL ADDS, and it is denominated()'s argument applied
 * to a different kind of word. A row with no `qualifier` passes through
 * untouched, which is most of them.
 *
 * WHY A STEP WOULD WANT ONE. Water's tab carries an acreage and so does its
 * panel -- but the PANEL carries a second acreage four rows down
 * ("contributing acres"), and two rows reading "acres" and "contributing
 * acres" are two a reader has to tell apart by position. The strip has no such
 * problem: it shows one acreage per tab, is read ACROSS candidates, and every
 * character in a cell 6ch wide is competing with the figures. So the word that
 * disambiguates belongs in the panel and nowhere else.
 *
 * ONE DECLARATION, TWO RENDERINGS, which is the whole reason this is here and
 * not a second label on the step. A tab row declaring `label: 'acres',
 * qualifier: 'survey'` renders "acres" on the strip and "survey acres" in the
 * panel; a step that wrote both strings would have two to keep in step and
 * nothing to notice when they part. Exactly the split denominated() makes, and
 * for the same reason -- see that function.
 *
 * IT IS A PREFIX, NOT A REWORDING. The label's own words survive intact and in
 * order, so "verbatim" stays true of the row in the sense that matters: the
 * strip's label is a suffix of the panel's, and a reader moving between them
 * is reading the same noun.
 */
export function qualified(label, qualifier) {
  return qualifier == null ? label : `${qualifier} ${label}`
}

/**
 * THE SCAN TAB'S ROWS, AS PANEL ROWS. A tab row is `{value, label}` and is
 * MEASURED unless it says otherwise -- a tab is a name and figures. `measured:
 * false` on a tab row carries a categorical across unchanged.
 *
 * READ OFF THE TAB rather than restated by the step's `detail()`, which is what
 * makes "repeated verbatim" true by construction. A step that declared the same
 * two rows twice would have two copies to keep in step and no test that notices
 * when it stops.
 *
 * "VERBATIM" IS ABOUT THE FIGURES AND WHICH ROWS, NOT ABOUT THE LABEL'S EXACT
 * CHARACTERS. The panel adds two things and both are PREFIXES the strip has no
 * room for: the denominator (denominated()) and the qualifier (qualified()).
 * The label's own words survive intact and in order under both, so the strip's
 * label is always a suffix of the panel's. The value is never touched.
 */
export function tabRowsOf(tab) {
  return (tab?.rows ?? []).map((row) => {
    // BOTH ADDITIONS, QUALIFIER FIRST, so "acres" + survey + /100 would read
    // "/100 survey acres" -- the denominator outermost, because it qualifies
    // the whole reading rather than the noun.
    const label = denominated(qualified(row.label, row.qualifier), row.denominator)
    return row.measured === false
      ? categoricalRow(row.value, label)
      : measuredRow(row.value, label)
  })
}

/**
 * THE PANEL'S HEADER: the tab's own name, or the detail's if this feature has
 * no tab (a gesture in flight, a step whose tabs are not per-feature).
 */
export function headerFor(tab, detail) {
  return tab?.name ?? detail?.name ?? null
}

/**
 * THE WHOLE BODY, IN ORDER, FROM A TAB AND A STEP'S DECLARED ROWS.
 *
 * ONE FLAT LIST WITH BREAKS IN IT, not a list of sections, because the body is
 * ONE GRID: sections would be several, and several grids do not share a column.
 * Empty runs are collapsed -- a step declaring a leading or trailing break, or
 * two in a row, gets one rule where a rule belongs and never a rule against the
 * header or hanging over the cautions.
 *
 * Nulls are dropped, so `dropsAtZero(...)` can sit in a row list inline.
 */
export function panelBody(tab, rows) {
  const above = tabRowsOf(tab)
  const below = (rows ?? []).filter((row) => row != null)
  const joined = above.length && below.length ? [...above, PANEL_BREAK, ...below] : [...above, ...below]

  const body = []
  for (const row of joined) {
    if (!isBreak(row)) {
      body.push(row)
      continue
    }
    // A break needs something above it and something after it, and the "after"
    // is settled by the trailing trim below.
    //
    // THE STEP'S OWN BREAK OBJECT IS WHAT IS PUSHED, not the singleton. It used
    // to push PANEL_BREAK whatever came in, which was invisible while no break
    // carried anything -- and would have silently dropped every heading the
    // moment one did.
    const last = body.length ? body[body.length - 1] : null
    if (!body.length) continue
    if (!isBreak(last)) {
      body.push(row)
      continue
    }
    // TWO BREAKS RUNNING COLLAPSE TO ONE, AND THE LABELLED ONE WINS. The rule
    // is the same rule either way, so what is at stake is only the heading --
    // and a step whose labelled break lands against the format's own implicit
    // one (a heading declared as the FIRST thing under the tab's rows) means
    // the heading, not a second hairline.
    if (breakLabel(row) && !breakLabel(last)) body[body.length - 1] = row
  }
  while (body.length && isBreak(body[body.length - 1])) body.pop()
  return body
}
