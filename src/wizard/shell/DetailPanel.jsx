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
 * Water's is four groups that mean different things -- the acreage the tab had
 * no room for, the terrain, the agreement between two survey instruments, and
 * the cautions -- and the order is the argument. A sort by type interleaves
 * all four and the reader is left to work out which figure belongs to which
 * question. There was no field that could say "these three go together and
 * come first".
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
 * A LABEL IS NEVER REWORDED. `caution.label` is the exclusion layer's own
 * words, straight off the payload ("wet (hydric) soil"), and the branching is
 * on the stable `type`. The backend splits those two fields precisely so a
 * consumer can branch on identity without a copy edit to the display prose
 * breaking it, and rewriting the label here would put this app's vocabulary in
 * front of the backend's measurement.
 */

import { useDrawingProgress } from '../../map/DrawingProgress.jsx'
import { useWizardCursor } from '../WizardCursor.jsx'

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
 * A detail's field groups, whichever shape it declared them in.
 *
 * A flat `fields` IS one unlabelled group. Normalising here rather than at
 * every call site is what keeps the two shapes from becoming two renderers.
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
function Group({ group, stepId }) {
  return (
    <>
      {group.label ? (
        <p className="chrome-detail__group" data-testid={`detail-group-${group.label}`}>
          {group.label}
        </p>
      ) : null}
      {/* THE TESTID IS THE GROUP'S WHERE THERE IS A GROUP. A step with one
          unlabelled group -- which is what a flat `fields` normalises to --
          keeps the step-level id it always had, so nothing that addressed the
          old single container has to change. */}
      <div
        className="chrome-detail__fields"
        data-testid={group.label ? `detail-fields-${group.label}` : `detail-fields-${stepId}`}
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
          {liveCautions.length ? (
            <ul className="chrome-detail__cautions" data-testid={`detail-cautions-${stepId}`}>
              {liveCautions.map((caution) => (
                <CautionLine key={caution.type} caution={caution} />
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <>
          <h3 className="chrome-detail__name" data-testid={`detail-name-${stepId}`}>
            {detail.name}
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
          {groupsOf(detail).map((group, index) => (
            <Group key={group.label ?? `group-${index}`} group={group} stepId={stepId} />
          ))}
          {detail.cautions.length ? (
            <ul className="chrome-detail__cautions" data-testid={`detail-cautions-${stepId}`}>
              {detail.cautions.map((caution) => (
                <CautionLine key={caution.type} caution={caution} />
              ))}
            </ul>
          ) : null}
        </>
      )}
    </aside>
  )
}
