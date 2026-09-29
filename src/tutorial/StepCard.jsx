/**
 * StepCard.jsx  —  ONE STEP'S CARD: WHAT DO I DO HERE.
 *
 * The same overlay as the deck and the orientation card -- the same dim, the
 * same card, centred in the same place -- holding one entry from the
 * registry (stepCards.js): its title, its body, its animation.
 *
 * A STEP WITH MORE THAN ONE CARD PAGES, with the deck's own row -- Back, the
 * dots, Next and "Got it" on the last (TutorialOverlay's Pager) -- above
 * the foot, and the arrows page as they do in the deck. A step with one card
 * has no pager and is exactly what it was.
 *
 * ONE ROW AT THE FOOT: "Show these tips automatically" on the left, "Got it"
 * on the right -- or, on a paged card, the checkbox alone, "Got it" being
 * the pager's forward control on the last card. The checkbox reads and writes `kd.tutorial.auto`; unticking
 * it stops every later step's card opening by itself. Because the same
 * checkbox is on every card, and the help control always opens the current
 * step's card, turning it back on needs no settings screen.
 *
 * WAYS OUT: the ×, the backdrop, Esc and "Got it", all one close. Whether a
 * close marks the step seen is the launcher's question (TutorialHelp): only
 * a card that opened by itself does. This component is told `onDismiss` and
 * does not know which kind it is.
 *
 * FOCUS moves into the card on open and back to whatever had it on close;
 * Tab is held inside the card. The close stows the card into the help
 * control, as the deck's does.
 *
 * THE CARD AND ITS DIM START BELOW THE INSTRUCTION BAR. A step's card opens
 * on its generate press, into a wait of up to a minute whose only evidence
 * the app is still working is the waiting line in that bar. So the overlay's
 * top edge is the bar's bottom edge, measured, and re-measured as the bar or
 * the stage changes size: the card centres in what is left of the map, and
 * the bar is neither covered nor dimmed at any width. Where there is no bar
 * (a harness that renders the card alone) the overlay fills the stage as it
 * always did.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { cardsOf } from './stepCards.js'
import { CLOSE_LABEL, DONE_LABEL, Pager, pageKey, stow, trapTab, usePaging } from './TutorialOverlay.jsx'

/** The preference beside the forward control. */
export const AUTO_LABEL = 'Show these tips automatically'

/**
 * @param {object} props
 * @param {object} props.card           a registry entry, either shape.
 * @param {boolean} props.auto            the checkbox's state.
 * @param {(auto: boolean) => void} props.onAutoChange
 * @param {() => void} props.onDismiss    at once, on every way out.
 * @param {() => void} props.onClose      once the stow has run.
 * @param {Element} [props.container]
 * @param {{current: Element|null}} [props.returnTo]
 */
export default function StepCard({ container, ...props }) {
  return createPortal(<Dialogue {...props} />, container ?? document.body)
}

function Dialogue({ card: entry, auto, onAutoChange, onDismiss, onClose, returnTo }) {
  const cards = cardsOf(entry)
  const paged = cards.length > 1
  const [index, setIndex] = useState(0)
  const { next, back } = usePaging(cards.length, setIndex)
  const card = cards[index]
  const cardRef = useRef(null)
  const backdropRef = useRef(null)
  const closing = useRef(false)
  const titleId = useId()
  const [overlayRef, top] = useClearOfBar()

  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    onDismiss?.()
    stow(cardRef.current, backdropRef.current, returnTo?.current ?? null).then(onClose)
  }, [onClose, onDismiss, returnTo])

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
      if (paged && pageKey(event, next, back)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      } else if (event.key === 'Tab') {
        trapTab(event, cardRef.current)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [close, paged, next, back])

  const { Animation } = card

  return (
    <div ref={overlayRef} className="tutorial" data-testid="tutorial-step" style={top > 0 ? { top } : undefined}>
      <div ref={backdropRef} className="tutorial__backdrop" data-testid="tutorial-step-backdrop" onClick={close} />
      <div
        ref={cardRef}
        className="tutorial__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="tutorial-step-card"
        data-step={entry.stepId}
        data-card={paged ? card.id : undefined}
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
          <Body body={card.body} emphasis={card.emphasis} />
        </p>
        {Animation ? (
          <figure className="tutorial__figure" data-testid="tutorial-step-figure">
            <Animation key={card.id ?? entry.stepId} />
          </figure>
        ) : null}

        {paged ? (
          <Pager cards={cards} index={index} onIndex={setIndex} onDone={close} testid="tutorial-step" />
        ) : null}

        {/* THE FOOT: the preference on the left, the way forward on the right. */}
        <div className="tutorial__nav tutorial__nav--foot">
          <label className="tutorial__check">
            <input
              type="checkbox"
              data-testid="tutorial-step-auto"
              checked={auto}
              onChange={(event) => onAutoChange(event.target.checked)}
            />
            <span>{AUTO_LABEL}</span>
          </label>
          {paged ? null : (
            <button
              type="button"
              className="tutorial__button tutorial__button--primary"
              data-testid="tutorial-step-done"
              onClick={close}
            >
              {DONE_LABEL}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** The instruction bar, which holds the waiting line. */
const BAR_SELECTOR = '.chrome-bar'

/**
 * How far down the overlay must start to clear the instruction bar: the
 * bar's bottom edge, in the overlay's containing block. 0 where there is no
 * bar. Returns the ref for the overlay and the offset in px.
 */
function useClearOfBar() {
  const ref = useRef(null)
  const [top, setTop] = useState(0)

  useLayoutEffect(() => {
    const stage = ref.current?.parentElement
    const bar = stage?.querySelector(BAR_SELECTOR)
    if (!stage || !bar) return undefined
    const measure = () => {
      const offset = bar.getBoundingClientRect().bottom - stage.getBoundingClientRect().top
      setTop(Math.max(0, Math.ceil(offset)))
    }
    measure()
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(bar)
    observer?.observe(stage)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [])

  return [ref, top]
}

/** The body, with its emphasised clause, if it has one, set in weight. */
function Body({ body, emphasis }) {
  const at = emphasis ? body.indexOf(emphasis) : -1
  if (at < 0) return body
  return (
    <>
      {body.slice(0, at)}
      <strong className="tutorial__em">{emphasis}</strong>
      {body.slice(at + emphasis.length)}
    </>
  )
}
