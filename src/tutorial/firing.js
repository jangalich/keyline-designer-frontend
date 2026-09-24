/**
 * firing.js  —  WHEN A STEP'S CARD OPENS BY ITSELF.
 *
 * On arrival at a step, its card opens when ALL of these hold:
 *
 *   - the step has a card in the registry;
 *   - its id is not in the seen list;
 *   - auto is on;
 *   - its status is `not_started` -- never `generated` or `committed`, so a
 *     step reopened after work was done on it never fires;
 *   - no job is running, anywhere;
 *   - nothing else is open: no other card, no dialogue.
 *
 * Otherwise nothing fires, and nothing says so. A pure function, so the rules
 * are tested as rules (tutorial-firing.test.jsx) and the launcher only has to
 * decide WHEN to ask.
 */

import { NOT_STARTED } from '../session/SessionStore'
import { JOB_RUNNING } from '../session/jobs'
import { cardFor } from './stepCards.js'

export function shouldAutoFire({ registry, stepId, prefs, status, jobRunning, somethingOpen }) {
  if (cardFor(registry, stepId) == null) return false
  if (!prefs || prefs.auto !== true) return false
  if (prefs.seen.includes(stepId)) return false
  if (status !== NOT_STARTED) return false
  if (jobRunning) return false
  if (somethingOpen) return false
  return true
}

/** Is any job in the store's table still running? */
export function anyJobRunning(state) {
  return Object.values(state?.jobs ?? {}).some((job) => job?.status === JOB_RUNNING)
}
