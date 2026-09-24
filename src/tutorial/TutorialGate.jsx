/**
 * TutorialGate.jsx  —  THE ENTRY: AN ORIENTATION CARD IN FRONT OF THE WIZARD.
 *
 * On a first arrival the map is mounted and painted and NOTHING ELSE IS: no
 * rail, no instruction bar, no tabs, no panel, no action buttons. The address
 * field is disabled and says which control opens it. The orientation card is
 * centred over the map, and its one control is the start button -- no ×, no
 * backdrop dismissal, no Esc. It is the entry, not an interruption.
 *
 * ITS ANIMATION IS THE DECK'S OVERVIEW, reused: the five regions appearing
 * around an empty map frame. With the real chrome withheld behind it, that
 * reads as a preview of what arrives on the button -- which is why the chrome
 * is not mounted early. Mounting it behind the card would make the diagram a
 * caption on a half-populated interface.
 *
 * ON THE BUTTON, IN SEQUENCE AND NOT OVERLAPPING:
 *
 *   1. the orientation card leaves;            phase GATE, card animating out
 *   2. the wizard chrome mounts and settles;   phase MOUNTING
 *   3. the address field goes live;            phase LIVE
 *   4. the boundary step's card arrives.       TutorialHelp, once READY
 *
 * Step 4 is the ordinary firing rule (firing.js) on the ordinary arrival at
 * the boundary, held back by READY until step 3 -- it is not a special case
 * here, so an empty registry opens nothing and that is not an error. Under
 * prefers-reduced-motion (and wherever animate() is absent) there is no
 * staging: the four happen in one cut.
 *
 * A RETURNING PERSON NEVER SEES THIS. The gate opens only when 'orientation'
 * is absent from the seen list; otherwise the phase starts LIVE.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

import { OverviewAnimation } from './animations.jsx'
import { ORIENTATION_ID, markSeen, readPrefs } from './prefs.js'
import { motionAllowed, trapTab } from './TutorialOverlay.jsx'

/**
 * THE START BUTTON'S LABEL, DEFINED ONCE. The disabled address field names it
 * in its placeholder, so the two cannot drift apart. Named, never located:
 * the field is at the top of the page and the card is centred on the map,
 * and on a narrow screen "below" stops being true.
 */
export const TUTORIAL_START_LABEL = 'Get started'
export const GATED_ADDRESS_PLACEHOLDER = `Click ${TUTORIAL_START_LABEL} to search an address`

/** The card's copy, verbatim. */
export const ORIENTATION_TITLE = 'How this works'
export const ORIENTATION_BODY = Object.freeze([
  "You'll work through seven steps, one at a time.",
  "The steps sit down the left, and what to do next runs across the top. The tabs along the bottom list what each step turns up, their measurements open on the right, and the actions for the step you're on are at the bottom right.",
])

export const GATE = 'gate'
export const MOUNTING = 'mounting'
export const LIVE = 'live'

/** How long each stage of the hand-over takes, in ms. */
export const LEAVE_MS = 200
export const SETTLE_MS = 240

/** Where the chrome mounts: the shell's root, inside the map's stage. */
const CHROME_SELECTOR = '.map-stage > .chrome'

/** The gate's phase, and what each part of the page reads off it. */
export function useTutorialGate() {
  const [phase, setPhase] = useState(() => (readPrefs().seen.includes(ORIENTATION_ID) ? LIVE : GATE))

  // The decision is recorded the moment it is made, before any motion, so a
  // reload during the hand-over does not put the gate back up.
  const start = useCallback(() => {
    markSeen(ORIENTATION_ID)
    setPhase(MOUNTING)
  }, [])

  // STEP 2: the chrome has mounted; let it settle, then go live. Layout
  // effect so the chrome's first painted frame is already the start of its
  // entrance rather than a flash of it at full strength.
  useLayoutEffect(() => {
    if (phase !== MOUNTING) return undefined
    const chrome = document.querySelector(CHROME_SELECTOR)
    if (!motionAllowed(chrome)) {
      setPhase(LIVE)
      return undefined
    }
    let cancelled = false
    const motion = chrome.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: SETTLE_MS,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    })
    motion.finished
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setPhase(LIVE)
      })
    return () => {
      cancelled = true
    }
  }, [phase])

  return {
    phase,
    /** The orientation card is up. */
    gated: phase === GATE,
    /** The wizard chrome is in the tree. */
    chromeMounted: phase !== GATE,
    /** The address field takes input, and a step's card may open. */
    live: phase === LIVE,
    start,
  }
}

/**
 * The card. Rendered as a child of the map stage -- where every tutorial card
 * is portalled -- so the boundary card that follows it lands in the same
 * place, over the same dim.
 */
export function OrientationCard({ onStart }) {
  const cardRef = useRef(null)
  const backdropRef = useRef(null)
  const startRef = useRef(null)
  const leaving = useRef(false)
  const titleId = useId()

  const begin = useCallback(() => {
    if (leaving.current) return
    leaving.current = true
    leave(cardRef.current, backdropRef.current).then(onStart)
  }, [onStart])

  // FOCUS GOES TO THE START BUTTON, the card's one control, rather than to
  // the card itself as the deck's does: a focused card draws the page's oxide
  // ring around the whole card, and the start button is the only oxide this
  // card may carry. Entering the dialogue still announces it by its title.
  useLayoutEffect(() => {
    const opener = document.activeElement
    startRef.current?.focus({ preventScroll: true })
    return () => {
      if (opener && typeof opener.focus === 'function' && opener.isConnected) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [])

  // Tab is held inside the card. Esc does nothing: there is no way out of
  // the entry but through it.
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Tab') trapTab(event, cardRef.current)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="tutorial" data-testid="tutorial-orientation">
      {/* The dim, which takes the map's pointer events and does nothing with
          them: a click beside the card is not a way past it. */}
      <div ref={backdropRef} className="tutorial__backdrop" data-testid="tutorial-orientation-backdrop" />
      <div
        ref={cardRef}
        className="tutorial__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="tutorial-orientation-card"
      >
        <h2 className="tutorial__title" id={titleId} data-testid="tutorial-orientation-title">
          {ORIENTATION_TITLE}
        </h2>
        {ORIENTATION_BODY.map((paragraph) => (
          <p key={paragraph} className="tutorial__body" data-testid="tutorial-orientation-body">
            {paragraph}
          </p>
        ))}
        <figure className="tutorial__figure" data-testid="tutorial-orientation-figure">
          <OverviewAnimation />
        </figure>
        <div className="tutorial__nav tutorial__nav--step">
          <button
            ref={startRef}
            type="button"
            className="tutorial__button tutorial__button--primary"
            data-testid="tutorial-start"
            onClick={begin}
          >
            {TUTORIAL_START_LABEL}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Step 1: the card and its dim fade out. Immediate where nothing moves. */
function leave(card, backdrop) {
  if (!motionAllowed(card)) return Promise.resolve()
  const easing = 'cubic-bezier(0.4, 0, 0.2, 1)'
  const motion = card.animate(
    [
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(0.98)' },
    ],
    { duration: LEAVE_MS, easing, fill: 'forwards' }
  )
  if (backdrop && typeof backdrop.animate === 'function') {
    backdrop.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: LEAVE_MS, easing, fill: 'forwards' })
  }
  return motion.finished.catch(() => undefined)
}
