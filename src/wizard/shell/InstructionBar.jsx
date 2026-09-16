/**
 * InstructionBar.jsx  —  REGION B, a card centred near the top.
 *
 * CENTRED AND CAPPED AT READING MEASURE, not spanning the frame. What it holds
 * is a sentence and a stack of notices, and a sentence is the one thing in
 * this shell that gets worse as it gets wider -- so a long notice WRAPS here
 * rather than stretching the card across the map. See App.css.
 *
 *
 * TWO THINGS, AND THE ORDER BETWEEN THEM IS THE WHOLE DESIGN.
 *
 *   THE DIRECTION   One sentence, from the cursor step's `instructions` keyed
 *                   by the state it is in. What to do with your hands, now.
 *                   The ONE exception is a state where there is nothing to do
 *                   with your hands because a request is out: past a couple of
 *                   seconds the declared line gives way to a few phrases that
 *                   turn over while it travels, and past a threshold to a line
 *                   that says the wait has run long. Neither claims anything
 *                   about what the request is doing -- see WaitingLine.jsx,
 *                   which holds the whole of that and the argument for why it
 *                   must stay that way.
 *
 *   THE NOTICES     Everything the user has to know that is not that. They sit
 *                   under the direction rather than replacing it, because a
 *                   caution that erases the instruction leaves someone holding
 *                   a warning and no way forward. Each one is a ROW, under a
 *                   rule, led by a one-word kind label in the data face -- see
 *                   NOTICE_KIND, and .chrome-bar__notices in App.css for why
 *                   they stack rather than wrap.
 *
 * AND ONE THING ABOUT ITSELF: A STATE MARK. The card's content is
 * state-dependent and nothing on the card said so. It carries an edge now, in
 * the rail's own idiom, keyed to what KIND of state it is reporting rather
 * than to which state -- see barTone.
 *
 * WHAT IS DELIBERATELY NOT HERE IS THE STEP'S NAME. The rail is where this
 * shell's titling voice lives and it already says where you are; a running
 * head repeated in the card under it is the same fact twice, in the region
 * with the least room for it.
 *
 * THE DIRECTION IS THE DEFINITION'S AND THE NOTICES ARE MOSTLY NOT.
 *
 * Six of the seven notice kinds below are read off the MACHINE and are the
 * same for every step -- an unreachable step naming what is in its way, a
 * failed generate naming the layer, a commit's per-feature rejections, a
 * COMMIT THAT DID NOT LAND naming the source that did not answer, a step
 * error, and what a draw gesture said about the last shape it closed. None of
 * those needed a step to declare anything, so none of them does. (The other
 * machine-side reason a user can be stuck -- why a commit is REFUSED before it
 * is sent -- is on the refused button itself in the banner, where the pointer
 * already is. A commit that was sent and did not land is a different thing and
 * belongs here: the button is not refusing anything, it has come back ready to
 * be pressed again, and by itself that says nothing at all.)
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
/* WHICH STATES ARE "A REQUEST IS OUT". Read for the bar's own state mark, not
   for anything it renders -- see BAR_TONE. */
import { COMMITTING, GENERATING, LOADING } from '../useStepMachine'
/* A notice's text is prose with measured values in it, and so is the reopen
   confirmation's per-step note. One renderer, in MeasuredText.jsx. */
import MeasuredText from './MeasuredText.jsx'
/* WHAT THE DIRECTION SAYS WHILE A REQUEST IS OUT, for the two states that can
   keep one out long enough for the question to arise. See WaitingLine.jsx --
   including why it claims nothing about what the request is doing. */
import WaitingLine, { useWaitingLine } from './WaitingLine.jsx'

/** A step id as a person reads it, from its definition when we have one. */
function titleFor(stepId, definitions) {
  return definitions?.get(stepId)?.title ?? stepId
}

/**
 * WHAT EACH NOTICE IS, IN ONE WORD, IN THE DATA FACE.
 *
 * THE CARD HAD ONE FACE AT ONE WEIGHT AND SAID EVERYTHING WITH IT. The rail
 * three regions over uses three -- Bitter for the row you are on, muted prose
 * for the status, mono for the index -- and that is most of why the rail reads
 * as belonging to this tool and the bar read as a div with sentences in it. A
 * marginal label beside a paragraph is the printed form this interface is
 * modelled on; an extension bulletin sets those labels in the plainest face it
 * has, which here is the data face.
 *
 * AND IT IS NOT DECORATION. Before this, a caution and a failure were told
 * apart by COLOUR ALONE -- --alert against --ink-muted -- which is the one
 * distinction a reader with a colour deficiency does not get, in the region
 * whose whole job is to say what has gone wrong. The word carries it now and
 * the colour agrees with the word.
 *
 * THE SET IS CLOSED AND IT IS THE TONES THAT EXIST. Four: two the machine
 * raises (a step that cannot start, a request that failed) and two a step
 * declares about its own payload. A tone with no entry renders no label rather
 * than an invented one -- the same posture the reset list takes towards a step
 * that cannot say what it loses.
 */
const NOTICE_KIND = Object.freeze({
  blocked: 'blocked',
  error: 'failed',
  caution: 'check',
  advisory: 'note',
})

/**
 * THE BAR'S STATE MARK, WHICH IS THE OTHER THING THE RAIL DOES AND THIS DID
 * NOT.
 *
 * The rail marks the row you are on with an oxide edge, and that is the only
 * card edge in this build that carries meaning. This card is the one whose
 * CONTENT changes with the state -- it is the entire reason it exists -- and
 * nothing on it said so. It gets the same device: an edge, keyed to what the
 * card is currently doing.
 *
 * THREE READINGS, AND NOT ONE OF THEM IS OXIDE. That is deliberate and it is
 * the one-accent rule, not timidity. Oxide means THE FORWARD MOVE, and the
 * forward move is a button in the corner; an oxide edge up here would be a
 * second thing claiming to be the thing to do, in the state where the banner
 * is already claiming it. So the mark says what KIND of state this is and
 * leaves what to DO about it to the control that does it:
 *
 *   'alert'      --alert.     A notice is up that stops or undoes work: a step
 *                             that cannot start, a generate or a commit that
 *                             failed. The one reading the eye should be able
 *                             to catch from across the frame.
 *   'working'    --ink-muted. A request is out. There is nothing to do with
 *                             your hands, and the mark goes as quiet as the
 *                             rail's unreachable rows do, for the same reason.
 *   'direction'  --ink.       The ordinary case: this card is telling you what
 *                             to do. Structural, neutral, and the mark the
 *                             other two are read against.
 *
 * ALERT OUTRANKS WORKING, and the order matters on exactly one path: a commit
 * that failed leaves `committing` the moment it answers, so the two cannot
 * actually coincide today -- but a future state that kept a request out while
 * a rejection was on screen would have something wrong AND something in
 * flight, and the thing that is wrong is the one worth marking.
 */
const IN_FLIGHT = [LOADING, GENERATING, COMMITTING]

function barTone(notices, chromeState) {
  if (notices.some((notice) => notice.tone === 'error' || notice.tone === 'blocked')) return 'alert'
  if (IN_FLIGHT.includes(chromeState)) return 'working'
  return 'direction'
}

/**
 * A COMMIT THAT DID NOT LAND BECAUSE AN UPSTREAM SOURCE DID NOT ANSWER.
 *
 * THIS IS ProductionZonePanel'S COPY, kept because it was already right. It
 * did three things in two sentences and all three still have to be done:
 *
 *   NAMES THE SOURCE      from `failed_layer.label` -- the backend's own
 *                         display prose, verbatim. Which source failed is the
 *                         only part of this a user can act on, because it is
 *                         what tells them whether waiting will help.
 *   PLACES THE FAULT      "public datasets that go down from time to time".
 *                         Upstream, and not the user. Without this the retry
 *                         reads as "you did it wrong, do it again".
 *   SAYS THE WORK SURVIVED  the boundary is exactly as drawn. This is the
 *                         sentence that turns a dead end into a retry, and it
 *                         is TRUE by the backend's own contract:
 *                         session_manager.create_session() persists nothing
 *                         unless every step of it succeeded.
 *
 * NO LABEL IS A REAL CASE AND HAS ITS OWN SENTENCE. An unclassified failure
 * carries prose and no `failed_layer` on purpose (step_registry.py says so),
 * so "The data sources did not respond" is the honest thing to say rather
 * than a gap to fill with the exception.
 *
 * WHAT IS NEVER IN HERE: the error's own `message`. It can be the api client's
 * `Request failed (500).` fallback -- a status code -- or a backend string
 * from a path that quotes one. A person looking at their own field cannot act
 * on either, and the backend sends a stable layer identity precisely so this
 * does not have to quote a traceback at them.
 */
function dataSourceNotice(failedLayer) {
  const source = failedLayer?.label
    ? `The ${failedLayer.label} source did not respond.`
    : 'The data sources did not respond.'
  return (
    `${source} These are public datasets that go down from time to time. ` +
    'Nothing is wrong with your boundary and it has been kept exactly as you ' +
    'drew it. Try again in a moment.'
  )
}

export default function InstructionBar({ machine, chromeState, definitions, undo = null }) {
  const { definition, stepId } = machine
  const { notice: gestureNotice } = useDrawingProgress()

  const direction = definition.instructions[chromeState] ?? definition.blurb

  /**
   * A WAIT THAT HAS LASTED LONG ENOUGH TO SAY MORE THAN ITS ONE LINE, or null.
   *
   * IT REPLACES THE DIRECTION AND DOES NOT JOIN IT. There is one sentence in
   * this card and this is the slot it lives in: a second line under the
   * declared one would be a notice, and a notice is something the user has to
   * know rather than something to look at while a request travels. The
   * declared instruction is what stands until the wait earns the swap, and the
   * moment the request answers the state changes and the declaration is back.
   *
   * THE NOTICES BELOW ARE UNTOUCHED BY IT. A commit that comes back having
   * failed leaves `committing`, which ends the wait, and renders its own
   * notice under whatever the new state's direction is -- see the
   * `commitFailure` branch. Nothing here can suppress that, and nothing here
   * outlives the state that produced it.
   */
  const waiting = useWaitingLine(chromeState)

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

  /**
   * A GENERATE THAT RAN AND PRODUCED NOTHING, which is not the notice above.
   *
   * `failed_layer` is "a source did not answer" -- retryable, and the input
   * the user placed is untouched and still worth keeping. `no_candidate` is
   * "this input is the answer": the routing pass ran over real data and found
   * nothing to build, the server did not record the input, and its slot is
   * free again. The two are told apart by the key the payload CARRIES, never
   * by the absence of the other, so a failure kind neither of them describes
   * renders as neither rather than as whichever branch was the default.
   *
   * IN THE SERVER'S OWN WORDS. What produced nothing is the step's own fact
   * and the step declares the sentence for it; composing one here would be
   * this file knowing which step it is rendering, which is the one thing it
   * may not do. The fallback names no step either.
   */
  if (machine.noCandidate) {
    notices.push({
      key: 'no-candidate',
      tone: 'error',
      testId: `no-candidate-${stepId}`,
      text:
        machine.noCandidate.message ??
        'That input produced nothing to keep. Try a different one.',
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

  /**
   * A COMMIT THAT CAME BACK WITHOUT LANDING.
   *
   * KEYED ON THE LAYER'S STABLE `type`, NOT ON ITS LABEL. Two different
   * sources failing are two different notices, and `type` is the identifier
   * the backend guarantees across a copy edit to `label` -- the same split
   * the cautions in DetailPanel branch on. The label is DISPLAYED and never
   * reworded; the type is never displayed.
   */
  if (machine.commitFailure) {
    const failed = machine.commitFailure.failedLayer
    notices.push({
      key: failed?.type ? `commit-failed-${failed.type}` : 'commit-failed',
      tone: 'error',
      testId: `commit-failed-${stepId}`,
      text: dataSourceNotice(failed),
    })
  }

  // EVERY OTHER STEP ERROR, in the server's own words. `network` is excluded
  // because the notice above is already reporting it, in copy that names the
  // source and places the fault -- and because this line renders `message`
  // raw, which for a transport failure is the api client's status-code
  // fallback. Two notices for one failure, one of them quoting a 500 at
  // somebody, was the state of things before that exclusion.
  if (machine.error && machine.error.kind !== 'rejected' && machine.error.kind !== 'network') {
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

  /**
   * THE UNDO FOR A DESTROYED SHAPE, and the reason there is no confirmation
   * dialogue on the ×.
   *
   * A modal is heavy for a small object: it stops the flow to ask about
   * something the user can simply take back, and the answer is almost always
   * yes, which trains people to click through the one that will matter. So the
   * × acts, and the way back sits here for a few seconds.
   *
   * IT IS LAST, so it is the notice nearest the reader after the action that
   * produced it, and it carries an ACTION rather than being one -- the bar
   * still says what happened first.
   */
  if (undo) {
    notices.push({
      key: 'undo',
      tone: 'advisory',
      testId: `undo-${stepId}`,
      text: undo.text,
      action: { label: 'Undo', run: undo.run, testId: `undo-action-${stepId}` },
    })
  }

  return (
    <div
      className="chrome-bar"
      data-testid={`step-${stepId}`}
      data-step-state={machine.machineState}
      data-chrome-state={chromeState}
      /* THE STATE MARK'S READING, AS AN ATTRIBUTE RATHER THAN A CLASS. It is
         a fact ABOUT the card's current state, which is what every other
         data- attribute on this node already is, and the stylesheet keys the
         edge off it. See barTone. */
      data-bar-tone={barTone(notices, chromeState)}
    >
      <p
        className="chrome-bar__direction"
        data-testid={`instruction-${stepId}`}
        data-waiting={waiting ? waiting.kind : undefined}
        role="status"
      >
        {waiting ? <WaitingLine waiting={waiting} stepId={stepId} /> : direction}
      </p>

      {notices.length ? (
        <ul className="chrome-bar__notices" data-testid={`notices-${stepId}`}>
          {notices.map((notice) => (
            <li
              key={notice.key}
              className={`chrome-bar__notice chrome-bar__notice--${notice.tone}`}
              data-notice-tone={notice.tone}
            >
              {/* WHAT KIND OF THING THIS IS, in one word, in the data face.
                  aria-hidden because the tone is already carried for a screen
                  reader by the sentence itself -- "Commit water before
                  starting this step." does not become clearer prefixed with
                  the word "blocked", and a label read aloud before every
                  notice is three extra words per notice on a stack of three.
                  It is a TYPOGRAPHIC signal, and the one it replaces is
                  colour, which a screen reader never had either. */}
              {NOTICE_KIND[notice.tone] ? (
                <span className="chrome-bar__notice-kind" aria-hidden="true">
                  {NOTICE_KIND[notice.tone]}
                </span>
              ) : null}
              {/* THE NOTICE ITSELF, IN ONE FLOW, AND IT CARRIES THE TEST ID.

                  THE ID NAMES WHAT THE NOTICE SAYS, and that is what it has
                  always named -- every reader of it in the suite takes the
                  element's textContent and compares it against the sentence a
                  definition declared, or reaches inside for the `.measure`
                  span holding a figure. The row around this is now a row: a
                  kind label in the data face, then the sentence. Leaving the
                  id on the <li> would have quietly redefined thirteen
                  assertions from "the notice says X" to "the notice says X
                  with the word 'check' in front of it", which is a change to
                  what those tests mean rather than to what they check. The row
                  is still addressable -- by .chrome-bar__notice, which is what
                  the layout suite already uses, and by data-notice-tone.

                  The row is a flex line -- the
                  kind label above, then this -- and the id, the sentence and
                  the undo have to stay ONE run of text inside it: as flex
                  items of the row they would each be blockified, which puts
                  the feature id on its own line and the undo on a third.
                  Wrapping them restores normal inline flow, which is also what
                  lets a long reason wrap under itself rather than under the
                  label. */}
              <span className="chrome-bar__notice-body" data-testid={notice.testId}>
                {notice.featureId ? (
                  <span className="chrome-bar__notice-id" data-testid={`rejection-id-${notice.featureId}`}>
                    {notice.featureId}
                  </span>
                ) : null}
                <span
                  data-testid={notice.featureId ? `rejection-reason-${notice.featureId}` : undefined}
                >
                  <MeasuredText text={notice.text} />
                </span>
                {notice.action ? (
                  <button
                    type="button"
                    className="chrome-bar__undo"
                    data-testid={notice.action.testId}
                    onClick={notice.action.run}
                  >
                    {notice.action.label}
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
