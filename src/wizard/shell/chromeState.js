/**
 * chromeState.js
 *
 * WHICH OF THE MACHINE'S STATES THE CHROME IS READING.
 *
 * The instruction bar and the action banner are keyed by MACHINE STATE, which
 * is what lets six steps share one shell: the shell looks a state up in the
 * cursor step's declaration and renders what it finds, and never asks which
 * step it is looking at.
 *
 * ONE RULE STANDS BETWEEN THE MACHINE'S STATES AND THE CHROME'S, AND IT IS
 * HERE RATHER THAN IN THE MACHINE.
 *
 *   An armed tool reads as `editing`. A step with nothing armed never does.
 *
 * WHY THE MACHINE CANNOT ANSWER THIS, AND MUST NOT BE MADE TO. The machine's
 * `reviewing`/`editing` split is "is there a draft in hand to commit or
 * discard" -- selectDraftIsTouched, and nothing else. That is exactly the
 * question the machine needs, because it is the question a commit and a
 * discard are about, and F4 wrote it that way on purpose.
 *
 * It is not the question the CHROME is about. The chrome is telling someone
 * what to do with their hands, and the two states it has to tell apart are
 * "you are authoring right now" and "look at what you have". Those are the
 * arming, not the draft:
 *
 *   A boundary with three points down is `editing` to the machine whether the
 *   draw is armed or not -- the draft holds work either way. But mid-trace the
 *   bar has to say "Click to place each corner." and offer an undo, and once
 *   the ring is closed it has to say "Check the shape before sending." and
 *   offer the commit. The machine cannot separate those and should not learn
 *   to.
 *
 *   A landform selection toggled off a suggestion makes the draft touched, so
 *   the machine says `editing` -- but the user is still reviewing proposals
 *   and the bar must still say so. Conversely a ring going down over an
 *   untouched landform draft is `reviewing` to the machine and is plainly not.
 *
 * So the shell reads the arming, in one place, in four lines. The VOCABULARY
 * is unchanged -- every key a definition may declare is a machine state, and
 * MACHINE_STATES is still the closed list the schema checks against.
 *
 * THE THREE STATES THE ARMING CANNOT OVERRIDE are the ones that are not about
 * hands at all: a job is running, a request is in flight, or the document says
 * the step is done. A tool armed across any of those is a leftover, and the
 * bar must report the fact rather than the leftover.
 */

import {
  COMMITTING,
  EDITING,
  GENERATING,
  REVIEWING,
  STEP_COMMITTED,
} from '../useStepMachine'

/** The states in which what the map is doing beats what the hands are doing. */
const NOT_ABOUT_HANDS = [GENERATING, COMMITTING, STEP_COMMITTED]

export function chromeStateFor({ machineState, armed }) {
  if (NOT_ABOUT_HANDS.includes(machineState)) return machineState
  if (armed) return EDITING
  // Nothing armed: the machine's `editing` is a draft holding work and nothing
  // being placed into it, which is what reviewing means here.
  return machineState === EDITING ? REVIEWING : machineState
}
