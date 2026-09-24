/**
 * StepCard.jsx  —  ONE STEP'S CARD: WHAT DO I DO HERE.
 *
 * The same overlay as the deck and the orientation card -- the same dim, the
 * same card, centred in the same place -- holding one entry from the
 * registry (stepCards.js): its title, its body, its animation. No paging:
 * one step, one card.
 *
 * THE FOOTER CARRIES THE TWO THINGS EVERY STEP CARD SHARES.
 *
 *   "Show these tips automatically", a checkbox reading and writing
 *   `kd.tutorial.auto`. Unticking it stops every later step's card opening
 *   by itself. Because the same checkbox is on every card, and the help
 *   control always opens the current step's card, turning it back on needs
 *   no settings screen.
 *
 *   "How the map works", which leaves this card for the deck. One control,
 *   two depths: what do I do here, and how does this tool work generally.
 *
 * WAYS OUT: the ×, the backdrop, Esc and "Got it", all one close. Whether a
 * close marks the step seen is the launcher's question (TutorialHelp): only
 * a card that opened by itself does. This component is told `onDismiss` and
 * does not know which kind it is.
 *
 * FOCUS moves into the card on open and back to whatever had it on close;
 * Tab is held inside the card. The close stows the card into the help
 * control, as the deck's does.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { CLOSE_LABEL, DONE_LABEL, stow, trapTab } from './TutorialOverlay.jsx'

/** The footer's two controls. */
export const AUTO_LABEL = 'Show these tips automatically'
export const DECK_LINK_LABEL = 'How the map works'

/**
 * @param {object} props
 * @param {{stepId: string, title: string, body: string, Animation?: Function}} props.card
 * @param {boolean} props.auto            the checkbox's state.
 * @param {(auto: boolean) => void} props.onAutoChange
 * @param {() => void} props.onDismiss    at once, on every way out but the deck link.
 * @param {() => void} props.onClose      once the stow has run.
 * @param {() => void} props.onOpenDeck   the footer link.
 * @param {Element} [props.container]
 * @param {{current: Element|null}} [props.returnTo]
 */
export default function StepCard({ container, ...props }) {
  return createPortal(<Dialogue {...props} />, container ?? document.body)
}

function Dialogue({ card, auto, onAutoChange, onDismiss, onClose, onOpenDeck, returnTo }) {
  const cardRef = useRef(null)
  const backdropRef = useRef(null)
  const closing = useRef(false)
  const titleId = useId()

  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    onDismiss?.()
    stow(cardRef.current, backdropRef.current, returnTo?.current ?? null).then(onClose)
  }, [onClose, onDismiss, returnTo])

  const toDeck = useCallback(() => {
    if (closing.current) return
    closing.current = true
    onOpenDeck()
  }, [onOpenDeck])

  useLayoutEffect(() => {
    const opener = document.activeElement
    cardRef.current?.focus({ preventScroll: true })
    return () => {
      if (opener && typeof opener.focus === 'function' && opener.isConnected) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented || closing.current) return
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      } else if (event.key === 'Tab') {
        trapTab(event, cardRef.current)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [close])

  const { Animation } = card

  return (
    <div className="tutorial" data-testid="tutorial-step">
      <div ref={backdropRef} className="tutorial__backdrop" data-testid="tutorial-step-backdrop" onClick={close} />
      <div
        ref={cardRef}
        className="tutorial__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="tutorial-step-card"
        data-step={card.stepId}
      >
        <button
          type="button"
          className="tutorial__close"
          aria-label={CLOSE_LABEL}
          data-testid="tutorial-step-close"
          onClick={close}
        >
          <span aria-hidden="true">×</span>
        </button>

        <h2 className="tutorial__title" id={titleId} data-testid="tutorial-step-title">
          {card.title}
        </h2>
        <p className="tutorial__body" data-testid="tutorial-step-body">
          {card.body}
        </p>
        {Animation ? (
          <figure className="tutorial__figure" data-testid="tutorial-step-figure">
            <Animation />
          </figure>
        ) : null}

        <div className="tutorial__nav tutorial__nav--step">
          <button
            type="button"
            className="tutorial__button tutorial__button--primary"
            data-testid="tutorial-step-done"
            onClick={close}
          >
            {DONE_LABEL}
          </button>
        </div>

        {/* THE FOOT: the preference, and the way to the deck. */}
        <div className="tutorial__footer">
          <label className="tutorial__check">
            <input
              type="checkbox"
              data-testid="tutorial-step-auto"
              checked={auto}
              onChange={(event) => onAutoChange(event.target.checked)}
            />
            <span>{AUTO_LABEL}</span>
          </label>
          <button
            type="button"
            className="tutorial__link"
            data-testid="tutorial-step-deck"
            onClick={toDeck}
          >
            {DECK_LINK_LABEL}
          </button>
        </div>
      </div>
    </div>
  )
}
