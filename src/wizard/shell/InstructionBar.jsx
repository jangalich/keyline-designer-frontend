/**
 * InstructionBar.jsx  —  REGION B, the top edge, full width.
 *
 * TWO THINGS, AND THE ORDER BETWEEN THEM IS THE WHOLE DESIGN.
 *
 *   THE DIRECTION   One sentence, from the cursor step's `instructions` keyed
 *                   by the state it is in. What to do with your hands, now.
 *
 *   THE NOTICES     Everything the user has to know that is not that. They sit
 *                   under the direction rather than replacing it, because a
 *                   caution that erases the instruction leaves someone holding
 *                   a warning and no way forward.
 *
 * THE DIRECTION IS THE DEFINITION'S AND THE NOTICES ARE MOSTLY NOT.
 *
 * Five of the six notice kinds below are read off the MACHINE and are the
 * same for every step -- an unreachable step naming what is in its way, a
 * failed generate naming the layer, a commit's per-feature rejections, a step
 * error, and what a draw gesture said about the last shape it closed. None of
 * those needed a step to declare anything, so none of them does. (The sixth
 * machine-side reason a user can be stuck -- why a commit is refused -- is on
 * the refused button itself in the banner, where the pointer already is.)
 *
 * The last is `definition.notices(context)`: what only THIS step can know
 * is worth saying. Landform's 80% ceiling advisory is the whole of the current
 * use, and it is here rather than under a totals chip because the chip is gone
 * and the advisory was the only part of it that asked for a decision.
 *
 * THE 422s ARE NOT COLLAPSED INTO A COUNT. The count is a summary; the reason
 * stays attached to its feature id, which is what lets the map colour the
 * offending features and print the server's own words on each. Collapsing here
 * would make the user delete zones one at a time to find the bad one -- which
 * is exactly what the backend's _rejection_payload() refuses to make them do.
 */

import { useDrawingProgress } from '../../map/DrawingProgress.jsx'

/** A step id as a person reads it, from its definition when we have one. */
function titleFor(stepId, definitions) {
  return definitions?.get(stepId)?.title ?? stepId
}

export default function InstructionBar({ machine, chromeState, definitions }) {
  const { definition, stepId } = machine
  const { notice: gestureNotice } = useDrawingProgress()

  const direction = definition.instructions[chromeState] ?? definition.blurb

  const notices = []

  // UNREACHABLE, NAMED. Not a disabled button: the answer to "why can I not do
  // this" is a sentence naming the step that has to happen first.
  if (!machine.reachable) {
    notices.push({
      key: 'blocked',
      tone: 'blocked',
      testId: `blocked-${stepId}`,
      text: machine.blockedBy
        ? `Commit ${titleFor(machine.blockedBy, definitions)} before starting this step.`
        : 'An earlier step has to be committed before this one can start.',
    })
  }

  // A FAILED GENERATE, BY LAYER. `failed_layer` is {type, label} -- branch on
  // the type, show the label.
  if (machine.failedLayer) {
    notices.push({
      key: 'failed-layer',
      tone: 'error',
      testId: `failed-layer-${stepId}`,
      text: `Could not generate: the ${machine.failedLayer.label} data for this parcel is incomplete.`,
    })
  }

  for (const featureId of machine.rejectedFeatureIds) {
    notices.push({
      key: `rejection-${featureId}`,
      tone: 'error',
      testId: `rejection-${featureId}`,
      featureId,
      text: machine.rejections[featureId].reason,
    })
  }

  if (machine.error && machine.error.kind !== 'rejected') {
    notices.push({
      key: 'error',
      tone: 'error',
      testId: `error-${stepId}`,
      text: machine.error.message,
    })
  }

  // WHAT THE STEP SAID ABOUT THE LAST SHAPE CLOSED -- what a clamp trimmed, or
  // why a shape was refused outright. It comes from the gesture rather than
  // from the draft, deliberately: a message about a gesture is not a decision,
  // and the draft is where decisions go.
  if (gestureNotice) {
    notices.push({
      key: 'gesture',
      tone: 'caution',
      testId: `${stepId}-notice`,
      text: gestureNotice,
    })
  }

  for (const notice of definition.notices(machine.context)) {
    notices.push({ ...notice, testId: `notice-${notice.key}-${stepId}` })
  }

  return (
    <div
      className="chrome-bar"
      data-testid={`step-${stepId}`}
      data-step-state={machine.machineState}
      data-chrome-state={chromeState}
    >
      <p className="chrome-bar__direction" data-testid={`instruction-${stepId}`} role="status">
        {direction}
      </p>

      {notices.length ? (
        <ul className="chrome-bar__notices" data-testid={`notices-${stepId}`}>
          {notices.map((notice) => (
            <li
              key={notice.key}
              className={`chrome-bar__notice chrome-bar__notice--${notice.tone}`}
              data-testid={notice.testId}
            >
              {notice.featureId ? (
                <span className="chrome-bar__notice-id" data-testid={`rejection-id-${notice.featureId}`}>
                  {notice.featureId}
                </span>
              ) : null}
              <span
                data-testid={notice.featureId ? `rejection-reason-${notice.featureId}` : undefined}
              >
                {notice.text}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
