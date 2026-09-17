/**
 * TutorialOverlay.jsx  —  A MODAL OVER THE WIZARD CHROME, CENTRED ON THE MAP.
 *
 * One card at a time out of the four in cards.jsx; dots that page, Back/Next
 * that page, and one way out -- the × in the corner, the backdrop, or Esc.
 * The last card's forward control reads "Got it" and is the same way out.
 * There is no separate "Skip": one exit is enough, and a second one would be
 * a second thing to decide before reading.
 *
 * IT IS NOT A STEP AND HAS NO MACHINE STATE. It reads nothing from the cursor
 * and arms nothing; the wizard underneath is exactly what it was before it
 * opened and after it closes. The only state it holds is which card is
 * showing, and that is thrown away on close.
 *
 * THE CARD IS THE ONLY THING THAT TAKES POINTER EVENTS while it is open. It
 * renders through a portal onto <body>, above the map's own stacking (the
 * chrome is z-index 400 inside the page; this is 1000 beside the page), and
 * the backdrop is a fixed full-viewport surface under the card -- so every
 * click that is not on the card lands on the backdrop and closes it, and
 * none reaches the map or the chrome. Keyboard focus is held inside the card
 * the same way: Tab cycles its controls rather than walking out into the
 * rail behind it.
 *
 * FOCUS MOVES IN ON OPEN AND BACK OUT ON CLOSE. The card's own element takes
 * focus when it opens (so a screen reader announces the dialogue by its
 * title before anything in it), and whatever was focused before -- the help
 * control, usually -- gets it back when it closes. Restoring is done from
 * the layout effect's cleanup, which runs while the opener is still in the
 * document whatever unmounts this.
 *
 * WHAT IS NOT HERE. No reading or writing of localStorage: whether the
 * overlay opens by itself is the launcher's question (TutorialHelp), and this
 * component does not know whether it was opened by a hand or by a first
 * paint. A modal that knew would be two components in one.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { CARDS } from './cards.jsx'

/** The one way out, and the forward control's two labels. */
export const CLOSE_LABEL = 'Close'
export const NEXT_LABEL = 'Next'
export const BACK_LABEL = 'Back'
export const DONE_LABEL = 'Got it'

/**
 * @param {object} props
 * @param {boolean} props.open        whether the overlay is up.
 * @param {() => void} props.onClose  called for every way out; the launcher
 *                                    decides what dismissal means.
 * @param {number} [props.initialCard] which card to open on, by index.
 */
export default function TutorialOverlay({ open, onClose, initialCard = 0 }) {
  if (!open) return null
  return createPortal(<Dialogue onClose={onClose} initialCard={initialCard} />, document.body)
}

/**
 * The dialogue itself, mounted only while open so its state (the card in
 * hand, the element to give focus back to) starts fresh every time.
 */
function Dialogue({ onClose, initialCard }) {
  const [index, setIndex] = useState(() => clamp(initialCard))
  const cardRef = useRef(null)
  const titleId = useId()
  const card = CARDS[index]
  const last = index === CARDS.length - 1
  const first = index === 0

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, CARDS.length - 1)), [])
  const back = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), [])

  // FOCUS IN, THEN BACK OUT. Captured before the card takes it, restored from
  // the cleanup -- which is the one place that runs on every way this can
  // leave the tree, including the launcher dropping it.
  useLayoutEffect(() => {
    const opener = document.activeElement
    cardRef.current?.focus()
    return () => {
      if (opener && typeof opener.focus === 'function' && opener.isConnected) opener.focus()
    }
  }, [])

  // THE KEYS, ON THE DOCUMENT rather than the card: focus is inside the card
  // by construction, but a listener on the document is what makes Esc work
  // even if something has moved it. Arrows page; Tab is held inside.
  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented) return
      switch (event.key) {
        case 'Escape':
          event.preventDefault()
          onClose()
          return
        case 'ArrowRight':
          event.preventDefault()
          next()
          return
        case 'ArrowLeft':
          event.preventDefault()
          back()
          return
        case 'Tab':
          trapTab(event, cardRef.current)
          return
        default:
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, next, back])

  const { Animation } = card

  return (
    <div className="tutorial" data-testid="tutorial">
      {/* THE DIM. A surface of its own under the card, so a click anywhere
          that is not the card is a click on this, and this closes. */}
      <div className="tutorial__backdrop" data-testid="tutorial-backdrop" onClick={onClose} />
      <div
        ref={cardRef}
        className="tutorial__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="tutorial-card"
        data-card={card.id}
      >
        <button
          type="button"
          className="tutorial__close"
          aria-label={CLOSE_LABEL}
          data-testid="tutorial-close"
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>

        <h2 className="tutorial__title" id={titleId} data-testid="tutorial-title">
          {card.title}
        </h2>
        <p className="tutorial__body" data-testid="tutorial-body">
          {card.body}
        </p>
        <figure className="tutorial__figure" data-testid="tutorial-figure">
          <Animation />
        </figure>

        <div className="tutorial__nav">
          <button
            type="button"
            className="tutorial__button"
            data-testid="tutorial-back"
            disabled={first}
            onClick={back}
          >
            {BACK_LABEL}
          </button>

          {/* THE DOTS ARE BUTTONS. Each one names its card for a screen reader
              and jumps to it; the current one is marked with aria-current and
              the stylesheet reads that rather than a second class. */}
          <ol className="tutorial__dots" aria-label="Cards" data-testid="tutorial-dots">
            {CARDS.map((entry, i) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="tutorial__dot"
                  aria-label={`Card ${i + 1} of ${CARDS.length}: ${entry.title}`}
                  aria-current={i === index ? 'true' : undefined}
                  data-testid={`tutorial-dot-${i + 1}`}
                  onClick={() => setIndex(i)}
                />
              </li>
            ))}
          </ol>

          {/* THE ONE OXIDE IN THE CARD: the forward move, and on the last
              card the way out. */}
          <button
            type="button"
            className="tutorial__button tutorial__button--primary"
            data-testid="tutorial-next"
            onClick={last ? onClose : next}
          >
            {last ? DONE_LABEL : NEXT_LABEL}
          </button>
        </div>
      </div>
    </div>
  )
}

function clamp(index) {
  if (!Number.isInteger(index)) return 0
  return Math.min(Math.max(index, 0), CARDS.length - 1)
}

/** Everything inside the card a Tab can land on, in document order. */
function focusableIn(card) {
  if (!card) return []
  return [...card.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
}

/**
 * Hold Tab inside the card. Off the last control it wraps to the first, off
 * the first (shift+Tab) to the last, and from the card's own element -- where
 * focus starts -- forward goes to the first control and back to the last.
 */
function trapTab(event, card) {
  const controls = focusableIn(card)
  if (!controls.length) return
  const active = document.activeElement
  const at = controls.indexOf(active)
  const insideCard = card.contains(active)
  if (event.shiftKey) {
    if (!insideCard || at === 0 || active === card) {
      event.preventDefault()
      controls[controls.length - 1].focus()
    }
    return
  }
  if (!insideCard || at === controls.length - 1 || active === card) {
    event.preventDefault()
    controls[0].focus()
  }
}
