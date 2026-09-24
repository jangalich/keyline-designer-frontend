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
 * A STEP'S CARD OPENS BY ITSELF on arrival at the step, under the rules in
 * firing.js -- a card, not seen, auto on, `not_started`, no job running,
 * nothing else open. Arrival is evaluated ONCE per arrival: a step reached
 * while something was open or a job was running stays quiet until it is
 * next arrived at. Two things are not arrivals:
 *
 *   BEFORE READY. While the gate is handing over (TutorialGate) the chrome
 *   is still settling, and the boundary card waits for it.
 *
 *   WHILE A RESUME IS PENDING. Before the document arrives the cursor reads
 *   the boundary as `not_started` whatever the document will say; a person
 *   who committed it last week would be taught it again for one frame.
 *
 * Closing a card that opened by itself adds its step to the seen list. That
 * is the only dismissal.
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

import { initialSessionId, selectResumeState, selectSessionId, useSession } from '../session/SessionStore'
import { useWizardCursor } from '../wizard/WizardCursor.jsx'
import { anyJobRunning, shouldAutoFire } from './firing.js'
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
  const { cursorStepId, statuses } = useWizardCursor()
  const registry = useStepCardRegistry()
  const ready = useTutorialReady()
  const prefs = useTutorialPrefs()
  // CLOSED | {kind: 'deck'} | {kind: 'step', stepId, auto}
  const [open, setOpen] = useState(CLOSED)
  const button = useRef(null)
  const evaluated = useRef(null)

  const status = statuses?.get(cursorStepId)
  const jobRunning = anyJobRunning(state)
  const arrival = ready && !resumePending(state) ? cursorStepId : null

  // ONE EVALUATION PER ARRIVAL. The ref is what makes it an arrival rather
  // than a condition that fires whenever it next comes true mid-step.
  useEffect(() => {
    if (arrival == null || evaluated.current === arrival) return
    evaluated.current = arrival
    const somethingOpen = open !== CLOSED || document.querySelector(DIALOG_SELECTOR) != null
    if (shouldAutoFire({ registry, stepId: arrival, prefs, status, jobRunning, somethingOpen })) {
      setOpen({ kind: 'step', stepId: arrival, auto: true })
    }
  }, [arrival, registry, prefs, status, jobRunning, open])

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
