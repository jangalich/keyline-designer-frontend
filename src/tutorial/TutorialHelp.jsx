/**
 * TutorialHelp.jsx  —  THE HELP CONTROL, AND WHEN A STEP'S CARD OPENS BY ITSELF.
 *
 * A small circled ? in the bottom-left corner of the map -- the gutter the
 * tab strip leaves under the rail -- with the same casing the action buttons
 * take, because it is on aerial photography with no card of its own. It is
 * its own thing, not a row of the rail: a control that reads as part of the
 * step list reads as a step, and this is not one.
 *
 * THE HELP CONTROL OPENS THE CURRENT STEP'S CARD, by hand, whatever the seen
 * list and the auto preference say. A step with no card in the registry
 * (stepCards.js) opens the deck instead. Opening a card by hand does NOT mark
 * the step seen: checking the help on a step must not disarm a card the
 * person has not yet been given.
 *
 * A STEP'S CARD OPENS BY ITSELF ON ITS GENERATE PRESS, under the rules in
 * firing.js -- a card, not seen, auto on, `not_started`, no other job
 * running, nothing else open. The press is read off the store: a generate
 * puts its step's job in the table as running before its first await
 * (SessionStore's JOB_STARTED), so the step's job going from not running to
 * running IS the press, whichever button made it. The card opens into the
 * wait, and marks its step seen as it opens, so a regenerate never fires
 * it again.
 *
 * THE CARD AND THE JOB ARE INDEPENDENT. Dismissing does not wait for the
 * job, and the job landing does not close the card: its results arrive
 * behind it. The one exception is a FAILED job, which closes the card at
 * once, so the error is not waiting behind a tutorial the person is about
 * to dismiss.
 *
 * A STEP WITH NO GENERATE -- boundary, drawn and committed -- fires on
 * arrival instead, which for a first-time person is the gate's hand-over.
 * Arrival is evaluated ONCE per arrival: a step reached while something was
 * open or a job was running stays quiet until it is next arrived at. Two
 * things are not arrivals:
 *
 *   BEFORE READY. While the gate is handing over (TutorialGate) the chrome
 *   is still settling, and the boundary card waits for it.
 *
 *   WHILE A RESUME IS PENDING. Before the document arrives the cursor reads
 *   the boundary as `not_started` whatever the document will say; a person
 *   who committed it last week would be taught it again for one frame.
 *
 * Closing a card that opened by itself adds its step to the seen list (a
 * card that opened on a press has already added it).
 *
 * THE DECK NO LONGER OPENS BY ITSELF, EVER. It is reference material: the
 * help control on a step with no card, and the "How the map works" link at
 * the foot of every step's card.
 *
 * PREFERENCES ARE BROWSER STATE, NOT DOCUMENT STATE. They live in
 * localStorage (prefs.js) and nowhere near the session store: they say
 * nothing about the design, must not survive into a document, and must not
 * go on the wire. SessionStore.jsx is untouched.
 *
 * EVERY CARD LIVES IN THE MAP. It is portalled into the nearest `.map-stage`
 * rather than onto <body>, so the dim covers the map and nothing else, and
 * closing it stows the card into this control (see TutorialOverlay's stow).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  initialSessionId,
  selectJobForStep,
  selectResumeState,
  selectSessionId,
  selectStepError,
  useSession,
} from '../session/SessionStore'
import { JOB_FAILED, JOB_RUNNING } from '../session/jobs'
import { useWizardCursor } from '../wizard/WizardCursor.jsx'
import { ON_ARRIVAL, ON_GENERATE, anyJobRunning, shouldAutoFire } from './firing.js'
import { markSeen, setAuto, useTutorialPrefs } from './prefs.js'
import { cardFor } from './stepCards.js'
import StepCard from './StepCard.jsx'
import { useStepCardRegistry, useTutorialReady } from './TutorialContext.jsx'
import TutorialOverlay from './TutorialOverlay.jsx'

/**
 * The key the deck has always written on close. It is kept only so that
 * close still says what it always said: nothing reads it as a reason not to
 * open any more, and prefs.js migrates it once for a person who dismissed the
 * old deck before the gate existed.
 */
export const TUTORIAL_DISMISSED_KEY = 'keyline.tutorial.dismissed'

/** What the control says to a screen reader. */
export const HELP_LABEL = 'How the map works'

/** The element the overlay is placed in: the map's stage. */
const STAGE_SELECTOR = '.map-stage'

/** Any dialogue open anywhere on the page: a confirmation, another card. */
const DIALOG_SELECTOR = '[role="dialog"]'

function persistTutorialDismissed() {
  try {
    window.localStorage.setItem(TUTORIAL_DISMISSED_KEY, '1')
  } catch {
    /* private mode: nothing reads it now anyway */
  }
}

/**
 * Is the store about to resume a session it has not loaded yet? True from
 * mount (a session id in the URL or storage, nothing loaded) until the
 * resume lands or fails.
 */
function resumePending(state) {
  const resume = selectResumeState(state)
  if (resume === 'loading') return true
  if (resume !== 'idle' || selectSessionId(state) != null || state.error != null) return false
  return initialSessionId() != null
}

const CLOSED = null

export default function TutorialHelp() {
  const { state } = useSession()
  const { cursorStepId, statuses, definitions } = useWizardCursor()
  const registry = useStepCardRegistry()
  const ready = useTutorialReady()
  const prefs = useTutorialPrefs()
  // CLOSED | {kind: 'deck'} | {kind: 'step', stepId, auto}
  const [open, setOpen] = useState(CLOSED)
  const button = useRef(null)
  const evaluated = useRef(null)

  const status = statuses?.get(cursorStepId)
  const generates = definitions?.get(cursorStepId)?.generate != null
  const job = cursorStepId == null ? null : selectJobForStep(state, cursorStepId)
  const generating = job?.status === JOB_RUNNING
  const failed = job?.status === JOB_FAILED || (cursorStepId != null && selectStepError(state, cursorStepId) != null)
  const arrival = ready && !resumePending(state) ? cursorStepId : null

  const somethingOpen = () => open !== CLOSED || document.querySelector(DIALOG_SELECTOR) != null

  // ONE EVALUATION PER ARRIVAL. The ref is what makes it an arrival rather
  // than a condition that fires whenever it next comes true mid-step. Only a
  // step with no generate can fire here; firing.js says so, not this.
  useEffect(() => {
    if (arrival == null || evaluated.current === arrival) return
    evaluated.current = arrival
    const fire = shouldAutoFire({
      registry,
      stepId: arrival,
      prefs,
      status,
      jobRunning: anyJobRunning(state),
      somethingOpen: somethingOpen(),
      trigger: ON_ARRIVAL,
      generates,
    })
    if (fire) setOpen({ kind: 'step', stepId: arrival, auto: true })
  }, [arrival, registry, prefs, status, state, generates, open])

  // THE PRESS: this step's job going from not running to running. Seeded with
  // what is true at mount and on every move of the cursor, so neither reads
  // as a press. `status` is still the step's status from before the press:
  // a generate changes the job table, not the document, until it lands.
  const wasGenerating = useRef({ stepId: cursorStepId, generating })
  useEffect(() => {
    const before = wasGenerating.current
    wasGenerating.current = { stepId: cursorStepId, generating }
    if (before.stepId !== cursorStepId || before.generating || !generating) return
    const fire = shouldAutoFire({
      registry,
      stepId: cursorStepId,
      prefs,
      status,
      jobRunning: anyJobRunning(state, cursorStepId),
      somethingOpen: somethingOpen(),
      trigger: ON_GENERATE,
      generates,
    })
    if (!fire) return
    markSeen(cursorStepId)
    setOpen({ kind: 'step', stepId: cursorStepId, auto: true })
  }, [cursorStepId, generating])

  // A FAILED GENERATE CLOSES THE STEP'S CARD, on the failure's arrival and
  // not on a failure already standing when the card was opened by hand.
  const wasFailed = useRef(failed)
  useEffect(() => {
    const before = wasFailed.current
    wasFailed.current = failed
    if (failed && !before && open?.kind === 'step' && open.stepId === cursorStepId) setOpen(CLOSED)
  }, [failed, open, cursorStepId])

  function openHelp() {
    const card = cardFor(registry, cursorStepId)
    setOpen(card ? { kind: 'step', stepId: cursorStepId, auto: false } : { kind: 'deck' })
  }

  const close = useCallback(() => setOpen(CLOSED), [])

  // THE DISMISSAL. Written when the person decides, not when the card has
  // finished stowing, so a reload during the motion keeps it. Only a card
  // that opened by itself marks its step seen.
  const dismissStep = useCallback(() => {
    if (open?.kind === 'step' && open.auto) markSeen(open.stepId)
  }, [open])

  // The stage is looked up when a card is about to render, by which time the
  // control is in the document; <body> only if there is no stage, which is
  // the case in a test that renders the shell bare.
  const container = open ? (button.current?.closest(STAGE_SELECTOR) ?? document.body) : null
  const stepCard = open?.kind === 'step' ? cardFor(registry, open.stepId) : null

  return (
    <>
      <button
        ref={button}
        type="button"
        className="chrome-help"
        aria-label={HELP_LABEL}
        aria-haspopup="dialog"
        aria-expanded={open ? 'true' : 'false'}
        data-testid="tutorial-help"
        onClick={openHelp}
      >
        <span aria-hidden="true">?</span>
      </button>
      <TutorialOverlay
        open={open?.kind === 'deck'}
        onClose={close}
        onDismiss={persistTutorialDismissed}
        initialCard={0}
        container={container}
        returnTo={button}
      />
      {stepCard ? (
        <StepCard
          key={stepCard.stepId}
          card={stepCard}
          auto={prefs.auto}
          onAutoChange={setAuto}
          onDismiss={dismissStep}
          onClose={close}
          container={container}
          returnTo={button}
        />
      ) : null}
    </>
  )
}
