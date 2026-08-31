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
              row, prose and label-first, and the figures keep the column. */}
          <div className="chrome-detail__fields" data-testid={`detail-fields-${stepId}`}>
            {detail.fields
              .filter((field) => field.measured)
              .map((field) => (
                <p key={field.label} className="chrome-detail__field">
                  <span className="measure" data-testid={`detail-value-${field.label}`}>
                    {field.value}
                  </span>
                  <span className="chrome-detail__label">{field.label}</span>
                </p>
              ))}
          </div>
          {detail.fields.some((field) => !field.measured) ? (
            <div className="chrome-detail__readings">
              {detail.fields
                .filter((field) => !field.measured)
                .map((field) => (
                  <p key={field.label} className="chrome-detail__reading">
                    <span className="chrome-detail__label">{field.label}</span>
                    <span
                      className="chrome-detail__value"
                      data-testid={`detail-value-${field.label}`}
                    >
                      {field.value}
                    </span>
                  </p>
                ))}
            </div>
          ) : null}
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
