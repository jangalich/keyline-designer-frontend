/**
 * DetailPanel.jsx  —  REGION F, the top right.
 *
 * WHAT ONE FEATURE IS, WHEN ONE FEATURE IS BEING LOOKED AT.
 *
 * ABSENT ENTIRELY WHEN NOTHING IS SELECTED -- not empty, not collapsed, not
 * there. F5 shipped the container with a "Details" toggle over a placeholder,
 * and an empty box in the top-right corner of a map reads as a search field:
 * it takes ground, invites a click, and answers with nothing. A panel that
 * appears when there is something to say and goes when there is not needs no
 * toggle at all, and this one has none. The gesture that closes it is a click
 * on bare map, which is where the thing it was describing lives.
 *
 * AND ABSENT ON A STEP THAT DECLARES NO PANEL -- `detail: null`, which FENCING
 * declares and nothing else does. Same rule one level up: a step with nothing
 * to say below the break has no panel at all rather than a container holding
 * the tab's own two lines again. See the guard in the component, and
 * stepDefinitions' schema note on `detail` for why null is not the default.
 *
 * TWO THINGS IT SHOWS, AND ONLY ONE AT A TIME:
 *
 *   A FOCUSED FEATURE   The fields the tab had no room for -- a tab is a name
 *                       and two figures, and the rest of what the pipeline
 *                       measured goes here -- and the feature's cautions.
 *
 *   A GESTURE IN FLIGHT While a shape is being drawn, the ring's live cautions
 *                       and its vertex count, recomputed on each corner
 *                       placed. The drawing beats the focus: what the user is
 *                       doing with their hands is more current than what they
 *                       were reading a moment ago.
 *
 * THE CONTENTS ARE THE STEP'S. `definition.detail(context, featureId)` returns
 * a name, a list of fields and the feature's cautions; this arranges them and
 * knows nothing about zones, slope or aspect. The one thing it does know is
 * that a caution is `{type, label, acres}`, which is the payload's own shape
 * and is the same shape a live caution arrives in from the gesture -- so the
 * two render through one component.
 *
 *
 * THE SHARED FORMAT, AND ONE RENDERER LEFT OVER FROM BEFORE IT
 *
 * `rows: [...]` IS THE SHARED FORMAT, AND IT IS NOW THE ONLY SHAPE ANY STEP
 * DECLARES: production, water, roads, trees and structures, each migrated on
 * its own branch, and fencing declares no panel at all. The arrangement --
 * header, the tab's own rows, a break, the step's rows, the cautions -- is
 * panelFormat.js's, and a step supplies values and labels and nothing else. See
 * panelFormat.js for every rule and for why each one is a rule.
 *
 * `fields`/`groups` IS THE FORMAT BEFORE IT WAS ONE, and the paragraphs below
 * are its notes, kept because they are the record of what the migration cost
 * and what it found. Each step arrived with its own arrangement of the same
 * facts, which is the drift that work existed to stop; a group is exactly one
 * run of rows between two breaks, so nothing lost a distinction when it moved.
 * Production declared the format and WATER WAS THE SECOND, which is the one
 * that mattered -- see below. STRUCTURES WAS THE LAST of the five panels with a
 * measurement set to arrange.
 *
 * FENCING WAS THE SIXTH AND IT DID NOT MIGRATE: it OPTED OUT, because a step
 * with one measurement already on its tab has nothing to put below the break.
 * The placeholder panel it used to declare -- the length, and a description
 * nobody had written -- is withdrawn rather than carried across.
 *
 * SO NO STEP CALLS Group() ANY MORE, AND THE RENDERER STAYS ANYWAY, because
 * one caller is left and it is not a step: wizard/layoutHarness.jsx's
 * `?detail=N` case, which deals N rows round four groups to measure the
 * panel's height cap and the strip's position against it (wizard/layout.test
 * .jsx counts `.chrome-detail__group`). THAT IS AN OPEN ITEM AND IT IS WRITTEN
 * DOWN HERE RATHER THAN SOLVED IN PASSING: retiring it means porting a browser
 * layout case onto the shared format, which is its own piece of work and not
 * fencing's to do on the way past.
 *
 *
 * GROUPS, AND WHY THE FLAT LIST COULD NOT CARRY THE SECOND STEP
 *
 * A detail may return `groups: [{label, fields}]` INSTEAD OF `fields`. Both
 * are supported and a step returns one or the other; a flat `fields` is
 * exactly one unlabelled group, which is what every detail was before this.
 *
 * THIS IS THE SCHEMA FAILING, RECORDED RATHER THAN ABSORBED, and it is the
 * second step definition that found it. Landform's detail is five readings
 * about one zone and reads fine in any order, so the panel was free to sort
 * them by TYPE -- every measured figure first, in one aligned column, then
 * every categorical reading as prose. That sort was a typographic rule with an
 * ordering side effect nobody had to notice.
 *
 * Water's was four groups that mean different things -- the acreage the tab
 * had no room for, the terrain, the agreement between two survey instruments,
 * and the cautions -- and the order is the argument. A sort by type interleaves
 * all four and the reader is left to work out which figure belongs to which
 * question. There was no field that could say "these three go together and
 * come first".
 *
 * WATER HAS MIGRATED, AND ITS FOUR GROUPS BECAME TWO UNLABELLED RUNS -- which
 * is the finding this note should be read with. What the groups were carrying
 * was ORDER and a RULE BETWEEN THE RUNS, and the format carries both: rows
 * render in declared order and PANEL_BREAK draws the rule. The LABELS turned
 * out to be the part that was not load-bearing, because the runs say what they
 * are ("water delivery", "median slope %" / "production overlap %", "also
 * excavated 2"). So the schema gap this note records was real and the fix was
 * not a labelled group; it was declared order plus a break, which is what
 * panelFormat gives every step. TREES THEN EARNED THE LABEL that water could
 * not: a break may carry a heading now (labelledBreak), and MARGINAL BENEFITS
 * was the first in the build -- a claim about three bare terms that the terms
 * do not make themselves. SITING RULES BROKEN is the second and last, on
 * structures, over the opposite kind of run and passing the same test. The
 * label is still an exception rather than the group label coming back -- two
 * headings in five panels; see panelFormat's rule 5 for the bar it has to
 * clear, which water's four groups and roads' two runs both failed.
 *
 * WHAT THE GROUP DOES NOT DO IS RE-SORT. Inside a group the fields render in
 * DECLARED order, and a measured field and a prose one may sit next to each
 * other -- which is what lets a categorical reading lead a group of figures.
 * The typographic rule the old sort was protecting is kept a different way and
 * is kept exactly: every group is one two-column grid, a measured field puts
 * its figure in the fixed-width first column, and a prose field spans both. So
 * the figures still share one column and one decimal point, and a long word
 * still cannot widen it.
 *
 *
 * A HEADER THAT STAYS, AND A BODY THAT SCROLLS
 *
 * The panel's footprint is CAPPED (see .chrome-detail) and its content runs
 * past the cap on a zone with enough cautions. What runs past it is the BODY:
 * the groups and the cautions, in `.chrome-detail__body`. The feature's NAME
 * is outside that box and does not move.
 *
 * That split is not tidiness. The panel exists to say what one zone is, and a
 * reader who has scrolled to the third caution while the zone's name has left
 * the top of the box is reading measurements about something they can no
 * longer identify -- on a map where two zones' panels differ only in their
 * figures. The name is the one line that has to survive every scroll position.
 *
 * THE WRAPPER IS ALSO WHY `.chrome-detail__group:first-child` FINALLY BITES.
 * That rule has been in the stylesheet since groups arrived and never matched:
 * the heading was the aside's first child, so no group ever was. The first
 * group is the BODY's first child, so its top margin now drops to zero -- and
 * that is right rather than incidental. A top margin inside a scrolling region
 * is dead space that scrolls away and never comes back, which reads as the
 * content having started somewhere above the box.
 *
 * A LABEL IS NEVER REWORDED. `caution.label` is the exclusion layer's own
 * words, straight off the payload ("wet (hydric) soil"), and the branching is
 * on the stable `type`. The backend splits those two fields precisely so a
 * consumer can branch on identity without a copy edit to the display prose
 * breaking it, and rewriting the label here would put this app's vocabulary in
 * front of the backend's measurement.
 */

import { Fragment, useEffect, useRef } from 'react'

import { useDrawingProgress } from '../../map/DrawingProgress.jsx'
import { useWizardCursor } from '../WizardCursor.jsx'
import { CONTINUATION, MEASURED, TERM, breakLabel, headerFor, isBreak, panelBody } from './panelFormat.js'

/**
 * THE CAUTIONS WORTH A LINE. A caution at exactly zero acres is the checker
 * saying it looked and found none, which is an answer and not a warning -- the
 * panel's shared rule, applied where the panel can apply it (panelFormat.js,
 * dropsAtZero). NULL IS DIFFERENT and still renders: not known is not none.
 *
 * A sub-floor crossing never gets this far -- cautionsFor() drops it, and drops
 * the map marker with it -- so this is the backstop for a zero that came off
 * the payload rather than out of a gesture.
 */
function cautionsWorthALine(cautions) {
  return (cautions ?? []).filter((caution) => Number(caution.acres) !== 0)
}

/**
 * One caution: the acreage, then the layer's own label, verbatim.
 *
 * A sub-floor intersection never reaches here -- cautionsFor() drops it, and
 * with it the map marker, so the panel and the map report the same crossings.
 */
function CautionLine({ caution }) {
  return (
    <li className="chrome-detail__caution" data-testid={`caution-${caution.type}`}>
      <span className="measure">{Number(caution.acres).toFixed(1)}</span>
      <span className="chrome-detail__caution-label">acres — {caution.label}</span>
    </li>
  )
}

/**
 * THE SHARED FORMAT, RENDERED. One grid for the whole body -- every row the
 * step declared and every row its tab did -- so one decimal point runs down
 * the panel from the first figure to the last, across the break.
 *
 * A BREAK IS A RULE ACROSS THE GRID, not the start of a second one. Two grids
 * size their columns independently and `42.9` above the rule would stop lining
 * up with `3.2` below it, which is the whole thing the column is for.
 *
 * THE FOUR FACES ARE SET DIFFERENTLY AND THEY HAVE TO BE. A measured value
 * takes the number track: mono, tabular figures, right-aligned. A categorical
 * takes the same left edge and the slack beside it, in the prose face, OUT of
 * the track -- see panelFormat.js for what forcing a word into it costs. A TERM
 * takes every track, because it has no label to leave a hole where. A
 * CONTINUATION takes exactly the categorical's tracks and no label, because the
 * row it continues has one -- production's soil list, labelled once at the top.
 *
 * A LABELLED BREAK IS THE RULE AND THEN A HEADING, IN THAT ORDER AND AS TWO
 * NODES. An <hr> cannot contain text and a heading cannot draw the panel's
 * hairline, so the one declaration renders as both -- which also keeps the rule
 * identical to every unlabelled break rather than a second thing that looks
 * like one. Both span the whole grid, so the body is still ONE grid and the
 * heading does not sit in a column.
 *
 * THE HEADING IS AN <h4> UNDER THE PANEL'S <h3>. It is a real heading -- it
 * says what the rows below it ARE, which is a claim they do not make -- and the
 * document outline should carry it. That is the difference from
 * `.chrome-detail__group`, which is deliberately not a heading element: a group
 * label divides one list, and there is one heading in that panel and it is the
 * feature's name. This one is the case that note was leaving room for.
 */
function PanelRows({ body, stepId }) {
  return (
    <div className="chrome-detail__rows" data-testid={`detail-rows-${stepId}`}>
      {body.map((row, index) => {
        if (isBreak(row)) {
          const label = breakLabel(row)
          return (
            <Fragment key={`break-${index}`}>
              <hr className="chrome-detail__break" data-testid={`detail-break-${stepId}`} />
              {label ? (
                <h4 className="chrome-detail__heading" data-testid={`detail-heading-${stepId}`}>
                  {label}
                </h4>
              ) : null}
            </Fragment>
          )
        }
        // A CONTINUATION IS A CATEGORICAL'S VALUE WITH THE LABEL TAKEN AWAY,
        // and it is rendered through that value's OWN class rather than one
        // beside it. The two are the same run on screen -- "62% Gilpin silt
        // loam" with `soil` against it, then "23% Ernest silt loam" with
        // nothing -- so they have to take the same tracks and the same face,
        // and two rules that agree by hand is one edit away from a list whose
        // first entry wraps where the rest do not. There is no second rule:
        // the same `.chrome-detail__phrase` sets both.
        //
        // NOT A TERM, which spans track 3 as well. See panelFormat's
        // CONTINUATION note -- the run's label is IN track 3 on its first row.
        if (row.kind === CONTINUATION) {
          return (
            <p key={`continuation-${index}`} className="chrome-detail__row" data-row={row.kind}>
              <span
                className="chrome-detail__phrase"
                data-testid={`detail-continuation-${row.value}`}
              >
                {row.value}
              </span>
            </p>
          )
        }
        if (row.kind === TERM) {
          return (
            <p
              key={`${row.value}-${index}`}
              className="chrome-detail__row"
              data-row={row.kind}
            >
              <span className="chrome-detail__term" data-testid={`detail-term-${row.value}`}>
                {row.value}
              </span>
            </p>
          )
        }
        return (
          <p key={`${row.label}-${index}`} className="chrome-detail__row" data-row={row.kind}>
            <span
              className={
                row.kind === MEASURED
                  ? 'measure chrome-detail__figure'
                  : 'chrome-detail__phrase'
              }
              data-testid={`detail-value-${row.label}`}
            >
              {row.value}
            </span>
            <span className="chrome-detail__row-label">{row.label}</span>
          </p>
        )
      })}
    </div>
  )
}

/**
 * A detail's field groups, whichever shape it declared them in.
 *
 * A flat `fields` IS one unlabelled group. Normalising here rather than at
 * every call site is what keeps the two shapes from becoming two renderers.
 *
 * NO STEP REACHES THIS. Every step with a panel declares `rows` and fencing
 * declares none; the one caller left is the layout harness. See the header.
 */
function groupsOf(detail) {
  if (Array.isArray(detail.groups)) return detail.groups.filter((group) => group.fields?.length)
  return detail.fields?.length ? [{ label: null, fields: detail.fields }] : []
}

/**
 * ONE GRID PER GROUP, which is what holds the figures in one column while the
 * fields keep their declared order. A measured field takes the two-column
 * treatment; a prose one spans both and is label-first.
 */
function Group({ group, stepId, scrollTarget = false }) {
  const anchor = useRef(null)

  // SCROLLED TO, WHEN THE DETAIL SAYS SO. A detail may name one group as
  // `scrollTo` -- the branch that was clicked on the map, inside the panel
  // for its whole network -- and the body scrolls that group into view so
  // the click lands on the figures for the thing that was clicked. Guarded:
  // a test environment has no layout and no scrollIntoView.
  useEffect(() => {
    if (scrollTarget && typeof anchor.current?.scrollIntoView === 'function') {
      anchor.current.scrollIntoView({ block: 'nearest' })
    }
  }, [scrollTarget])

  return (
    <>
      {group.label ? (
        <p
          ref={anchor}
          className="chrome-detail__group"
          data-testid={`detail-group-${group.id ?? group.label}`}
          data-scroll-target={scrollTarget ? 'true' : undefined}
        >
          {group.label}
        </p>
      ) : null}
      {/* THE TESTID IS THE GROUP'S WHERE THERE IS A GROUP. A step with one
          unlabelled group -- which is what a flat `fields` normalises to --
          keeps the step-level id it always had, so nothing that addressed the
          old single container has to change. */}
      <div
        className="chrome-detail__fields"
        data-testid={
          group.label ? `detail-fields-${group.id ?? group.label}` : `detail-fields-${stepId}`
        }
      >
        {group.fields.map((field) =>
          field.measured ? (
            <p key={field.label} className="chrome-detail__field">
              <span className="measure" data-testid={`detail-value-${field.label}`}>
                {field.value}
              </span>
              <span className="chrome-detail__label">{field.label}</span>
            </p>
          ) : (
            <p key={field.label} className="chrome-detail__reading">
              <span className="chrome-detail__label">{field.label}</span>
              <span className="chrome-detail__value" data-testid={`detail-value-${field.label}`}>
                {field.value}
              </span>
            </p>
          )
        )}
      </div>
    </>
  )
}

export default function DetailPanel({ machine }) {
  const { focusedFeatureId } = useWizardCursor()
  const { points, cautions: liveCautions } = useDrawingProgress()
  const { definition, stepId } = machine

  // A STEP MAY DECLARE NO PANEL, AND FENCING IS THE ONE THAT DOES.
  //
  // `detail: null` on the step, and this file renders NOTHING for it -- no
  // container, no header, in every state, gesture included. Not an empty
  // panel: an empty box in the top-right corner of a map is the thing this
  // component's header opens by refusing, and a panel that exists to repeat
  // the two lines already on the tab is that box with figures in it.
  //
  // IT IS TESTED FOR BEFORE THE GESTURE BRANCH, not after, because the
  // declaration is about the STEP and not about what is on screen. Fencing
  // arms no drawing tool, so the two orderings cannot differ today -- which
  // is exactly why the order has to be the one that stays right if it ever
  // does.
  //
  // NULL AND ABSENT ARE DIFFERENT DECLARATIONS. defineStep defaults `detail`
  // to `() => null` and the boundary step takes that default: it has no
  // features to focus, but it is where a ring is drawn, and the gesture
  // branch below is its panel. See stepDefinitions' schema note on `detail`.
  if (definition.detail == null) return null

  // THE GESTURE WINS. A ring going down is the most current thing on screen,
  // and the panel following the focus while the user draws would be describing
  // something they have stopped looking at.
  const drawing = points.length > 0

  const detail = drawing || focusedFeatureId == null
    ? null
    : definition.detail(machine.context, focusedFeatureId)

  // NOTHING TO SAY, SO NOTHING IS THERE. `detail` returning null for an id the
  // step does not recognise is a real answer and lands here too.
  if (!drawing && !detail) return null

  // THE FEATURE'S OWN TAB, WHICH IS WHERE ITS IDENTITY AND ITS TOP ROWS COME
  // FROM under the shared format. Read here rather than restated by the step,
  // so the strip and the panel cannot come to disagree about either -- see
  // panelFormat.js rules 1 and 2. A step whose tabs are not per-feature simply
  // finds nothing, and the panel falls back to the detail's own name.
  const tab = detail?.rows
    ? machine.tabs.find((entry) => entry.id === focusedFeatureId) ?? null
    : null
  const body = detail?.rows ? panelBody(tab, detail.rows) : null

  // Computed once, for the branch that is about to render.
  const cautions = cautionsWorthALine(drawing ? liveCautions : detail.cautions)

  return (
    <aside
      className="chrome-detail"
      data-testid={`detail-${stepId}`}
      aria-live="polite"
    >
      {drawing ? (
        <>
          <p className="chrome-detail__name" data-testid={`detail-name-${stepId}`}>
            Drawing a zone
          </p>
          <div className="chrome-detail__body">
            {/* The in-flight vertex count, so the panel says something is
                happening while the map is where the work is. It was the panel
                column's `landform-vertex-count` and it went with it. */}
            <p className="chrome-detail__field" data-testid={`detail-vertices-${stepId}`}>
              <span className="measure">{points.length}</span>
              <span className="chrome-detail__label">
                point{points.length === 1 ? '' : 's'} placed
                {points.length < 3 ? ' — 3 close the shape' : ''}
              </span>
            </p>
            {cautions.length ? (
              <ul className="chrome-detail__cautions" data-testid={`detail-cautions-${stepId}`}>
                {cautions.map((caution) => (
                  <CautionLine key={caution.type} caution={caution} />
                ))}
              </ul>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <h3 className="chrome-detail__name" data-testid={`detail-name-${stepId}`}>
            {headerFor(tab, detail)}
          </h3>
          {/* NOT A <dl>. The value comes before its label in the DOM because
              it comes before it in the grid -- right-aligned figure, then
              left-aligned label, the acreage chip's treatment -- and a
              definition list requires the opposite order. The panel column's
              summary block was spans for the same reason. */}
          {/* MEASURED AND CATEGORICAL FIELDS ARE SET DIFFERENTLY, and they
              have to be. The aligned column exists to hold a decimal point
              still down a list of figures; a WORD in it is right-aligned
              against nothing, and a long one ("north-facing") widens the track
              and shoves every label in the panel sideways -- seen on the real
              payload before this split. So a categorical reading takes its own
              row, prose and label-first, and the figures keep the column.

              WHAT CHANGED IS THE SORT, NOT THE SETTING. Both are still set
              differently and the figures still share one column; they are no
              longer reordered to do it. See GROUPS above. */}
          <div className="chrome-detail__body">
            {body ? (
              <PanelRows body={body} stepId={stepId} />
            ) : (
              groupsOf(detail).map((group, index) => (
                <Group
                  key={group.id ?? group.label ?? `group-${index}`}
                  group={group}
                  stepId={stepId}
                  scrollTarget={detail.scrollTo != null && group.id === detail.scrollTo}
                />
              ))
            )}
            {cautions.length ? (
              <ul className="chrome-detail__cautions" data-testid={`detail-cautions-${stepId}`}>
                {cautions.map((caution) => (
                  <CautionLine key={caution.type} caution={caution} />
                ))}
              </ul>
            ) : null}
          </div>
        </>
      )}
    </aside>
  )
}
