/**
 * firing.js  —  WHEN A STEP'S CARD OPENS BY ITSELF.
 *
 * ON THE GENERATE PRESS, for a step that has a generate. A generate is a
 * compute pass over the whole elevation grid -- thirty to sixty seconds with
 * no progress to report -- and the card goes INTO that wait, so the person
 * reads about the step while the step computes. Firing on arrival put the
 * card in front of a button nobody had pressed yet, and left the wait itself
 * empty.
 *
 * ON ARRIVAL, for a step with NO generate: boundary, which is drawn and
 * committed. Its arrival is the gate's hand-over, straight after the
 * orientation card's start button.
 *
 * Either way the card opens only when ALL of these hold:
 *
 *   - the step has a card in the registry;
 *   - its id is not in the seen list;
 *   - auto is on;
 *   - its status is `not_started` -- never `generated` or `committed`, so a
 *     step reopened after work was done on it never fires;
 *   - no OTHER job is running (on a press, the step's own job has just
 *     started, and that is the wait the card is for);
 *   - nothing else is open: no other card, no dialogue.
 *
 * Otherwise nothing fires, and nothing says so. A pure function, so the rules
 * are tested as rules (firing.test.jsx) and the launcher only has to decide
 * WHEN to ask.
 */

import { NOT_STARTED } from '../session/SessionStore'
import { JOB_RUNNING } from '../session/jobs'
import { cardFor } from './stepCards.js'

/** What asked: arriving at the step, or pressing its generate. */
export const ON_ARRIVAL = 'arrival'
export const ON_GENERATE = 'generate'

export function shouldAutoFire({
  registry,
  stepId,
  prefs,
  status,
  jobRunning,
  somethingOpen,
  trigger = ON_ARRIVAL,
  generates = false,
}) {
  // A step with a generate fires on the press and only on the press; a step
  // without one has no press and fires on arrival.
  if (trigger === ON_GENERATE ? !generates : generates) return false
  if (cardFor(registry, stepId) == null) return false
  if (!prefs || prefs.auto !== true) return false
  if (prefs.seen.includes(stepId)) return false
  if (status !== NOT_STARTED) return false
  if (jobRunning) return false
  if (somethingOpen) return false
  return true
}

/** Is any job in the store's table still running -- other than `exceptStepId`'s? */
export function anyJobRunning(state, exceptStepId = null) {
  return Object.values(state?.jobs ?? {}).some(
    (job) => job?.status === JOB_RUNNING && (exceptStepId == null || job.stepId !== exceptStepId)
  )
}
