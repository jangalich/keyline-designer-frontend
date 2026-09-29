/**
 * cardsHarness.jsx  —  ONE STEP'S CARD, IN A REAL BROWSER, WITH NOTHING ELSE.
 *
 * jsdom applies no stylesheet and resolves no var(), so the claims that are
 * about what the engine draws -- the hatch's stroke resolving to the oxide
 * token, nothing running under reduced motion, the tab strip fitting at
 * 380px -- are measured here, on the shipped StepCard and the shipped
 * stylesheets in main.jsx's order.
 *
 *   ?step=landform   which registry entry to open            (default landform)
 *   ?at=0.36         freeze every diagram at that fraction of its own
 *                    --loop, for a screenshot of one frame   (default: running)
 *
 * The freeze is this page's own rule, not the app's: a negative delay and a
 * paused play state, written here so App.css never carries either.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'

import '../index.css'
import '../App.css'

import StepCard from './StepCard.jsx'
import { STEP_CARDS, cardFor } from './stepCards.js'

const params = new URLSearchParams(window.location.search)
const card = cardFor(STEP_CARDS, params.get('step') ?? 'landform')
const at = params.get('at')

if (at != null) {
  const style = document.createElement('style')
  style.textContent = `.tutorial-anim * { animation-play-state: paused !important; animation-delay: calc(var(--loop) * -${Number(at)}) !important; }`
  document.head.appendChild(style)
}

function Harness() {
  const stage = React.useRef(null)
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => setReady(true), [])
  return (
    <div ref={stage} className="map-stage" data-testid="stage">
      {ready ? (
        <StepCard
          container={stage.current}
          card={card}
          auto
          onAutoChange={() => {}}
          onDismiss={() => {}}
          onClose={() => {}}
        />
      ) : null}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<Harness />)
document.documentElement.dataset.harnessReady = 'true'
