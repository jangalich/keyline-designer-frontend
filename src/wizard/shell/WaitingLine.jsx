/**
 * WaitingLine.jsx  —  WHAT THE DIRECTION SAYS WHILE A REQUEST IS OUT.
 *
 * A commit that creates the session waits on twelve public datasets and takes
 * eight to ten seconds; a generate is a compute pass over the whole elevation
 * grid and takes thirty to sixty. For that long, one unchanging line and a
 * pulsing dot say only "something may be happening", and the thing a person
 * starts to wonder is whether the app has stopped. This cycles a few phrases
 * through the direction slot instead.
 *
 *
 * WHAT THIS IS NOT, AND CANNOT BECOME WITHOUT A DIFFERENT BACKEND.
 *
 * IT IS NOT A FEED. It is not a per-layer readout and it is not a percentage.
 * The phrases CLAIM NOTHING about what is running: they turn on a timer,
 * nothing verifies them, and nothing can -- neither the commit nor the job
 * poll reports which layer it is on, and `pollJob` has exactly three answers
 * (running, done, failed) with no progress in any of them.
 *
 * That is the whole design rather than a shortcoming of it. The honest report
 * for a wait too short to instrument and too long to sit through blankly is
 * one that says the work is under way and asserts nothing further. A phrase
 * that named a layer, or a bar that filled, would be inventing the one thing
 * this client does not have.
 *
 * SO DO NOT LATER INFER A SEQUENCE FROM ELAPSED TIME. "Nine seconds in, so it
 * must be on the soil fetch" is a fabricated status report that will be right
 * often enough to be believed and wrong exactly when a source is slow -- which
 * is the case a user is looking at this for.
 *
 * THE PHRASES ARE ORDER-NEUTRAL FOR THAT REASON. None of them is a step, none
 * is a position in a list, and none reads as the one before or after another.
 * They loop, so whichever one is on screen when the answer comes back is an
 * accident of timing rather than a claim about where the work got to.
 *
 *
 * A WAIT EARNS ITS PHRASES BY LASTING. Nothing is swapped until the first
 * interval is up, so the declared instruction -- "Creating the session…",
 * "Saving these zones…" -- stands alone through every wait shorter than that.
 * This is what keeps the treatment off the short waits without anyone having
 * to declare which ones those are: a step commit that answers in 300ms never
 * reaches the first tick, and a phrase that flashes for a third of a second is
 * noise. It also means no step, and nothing in this shell, has to hold an
 * opinion about which of them is the slow one.
 *
 * THE COPY IS THE MACHINE'S, NOT THE STEP'S -- the same argument the banner's
 * WORKING lines make, and for the same reason. What is happening in these two
 * states is the same fact for all seven steps, so a per-step declaration would
 * be seven rewrites of four phrases and the shell would be naming steps to
 * pick between them. The two sets differ from each other because the two waits
 * genuinely differ: a commit is out on public data sources, and a generate is
 * work over data this session already has.
 *
 * PAST A THRESHOLD THE CYCLING STOPS AND THE COPY SAYS SO. Most commits land
 * in eight to ten seconds; measured runs have reached sixteen, and one reached
 * thirty-five with a single slow upstream. Past LONG_WAIT_MS the line becomes
 * "Still working." and names the likely reason.
 *
 * IT IS NOT AN ERROR AND MUST NOT BECOME ONE. The request is still out and
 * will still succeed or fail on its own; nothing here cancels it, retries it,
 * or reports it as broken. What the threshold does is stop phrases that turn
 * over every two seconds from implying a steady progress that has plainly
 * stopped, and answer the question the wait has by then produced.
 */

import { useEffect, useState } from 'react'

import { COMMITTING, GENERATING } from '../useStepMachine'

/** How long one phrase holds, and how long a wait must last to get one. */
export const PHRASE_INTERVAL_MS = 2000

/**
 * THE PHRASES. Sentence case, active voice, plain, and about the land rather
 * than about the software -- the copy rules the rest of this shell is written
 * to.
 *
 * FOUR EACH, so a loop is a loop rather than a two-line blink, and short
 * enough that the card does not need the full reading measure to hold one.
 *
 * READ THIS LIST FOR WHAT IT MUST NOT SAY. No layer, no step, no position in a
 * sequence, no number and no unit of time. A phrase that acquired any of those
 * would be a status report, and this has no status to report.
 */
export const WAIT_PHRASES = Object.freeze({
  [COMMITTING]: Object.freeze([
    'Gathering data for your land',
    'Reading the terrain',
    'Checking soil and rainfall records',
    'Looking up what is already mapped here',
  ]),
  [GENERATING]: Object.freeze([
    'Working over your land',
    'Reading the slopes and contours',
    'Measuring how the ground falls',
    'Weighing what fits here',
  ]),
})

/**
 * WHEN A WAIT STOPS BEING A NORMAL ONE, per state, and the two numbers are
 * different because the two waits are.
 *
 * A COMMIT: eight to ten seconds typically, sixteen on a measured slow run.
 * 25s is comfortably past both, so a busy-but-ordinary commit never trips it
 * and the one that sat at thirty-five seconds does.
 *
 * A GENERATE: thirty to sixty seconds by jobs.js's own note, which is why it
 * cannot share the commit's number -- 25s there would fire in the middle of
 * every ordinary generate and the line would mean nothing. 75s is past the top
 * of the documented band.
 */
export const LONG_WAIT_MS = Object.freeze({
  [COMMITTING]: 25000,
  [GENERATING]: 75000,
})

/**
 * WHAT IT SAYS ONCE THE WAIT IS LONG. It states the one fact this client
 * actually holds -- the request has not come back -- and offers the likeliest
 * reason for the state it is in, without naming a source it cannot know is the
 * slow one. No retry, no cancel, no apology, and nothing that reads as a fault.
 */
export const LONG_WAIT_LINE = Object.freeze({
  [COMMITTING]: 'Still working. Some data sources are slow today.',
  [GENERATING]: 'Still working. This parcel is taking longer than most.',
})

export const PHRASE = 'phrase'
export const LONG = 'long'

/**
 * REDUCED MOTION HOLDS THE LINE STILL; IT DOES NOT REMOVE IT.
 *
 * The same posture the pulse takes in App.css, for the same reason: what is on
 * screen here is information, and the setting is about movement. So the phrase
 * appears at the usual moment and then STAYS -- one line, no turnover -- and
 * the long-wait copy still arrives at its threshold, because that is a change
 * of fact rather than an animation.
 *
 * READ ONCE PER WAIT rather than subscribed to. A person changing their motion
 * preference mid-commit is not a case worth a listener; the next wait reads it
 * again. Guarded because jsdom has no matchMedia, and an undefined check here
 * is cheaper than a polyfill every test would have to install.
 */
function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * The waiting line for a chrome state, or null when there is none to show.
 *
 * NULL IS THE ANSWER IN TWO DIFFERENT CASES and the caller treats them alike:
 * a state that is not a wait at all, and a wait that has not yet lasted long
 * enough to have earned a phrase. In both the declared instruction stands.
 *
 * THE TIMERS ARE THE STATE'S, and they are torn down when it ends. The effect
 * is keyed on the chrome state, so a commit that resolves -- into `committed`,
 * or back into `reviewing` with a failure notice under it -- clears the
 * interval and the threshold timeout on the way out and resets the count. A
 * failure is exactly the case that must not leave phrases running underneath
 * its own notice.
 */
export function useWaitingLine(chromeState) {
  const phrases = WAIT_PHRASES[chromeState] ?? null
  // Intervals elapsed since this wait began. 0 is "not long enough yet".
  const [ticks, setTicks] = useState(0)
  const [long, setLong] = useState(false)

  useEffect(() => {
    setTicks(0)
    setLong(false)
    if (!WAIT_PHRASES[chromeState]) return undefined

    const still = prefersReducedMotion()
    // Still: ONE timeout, so the phrase arrives and then does not move.
    // Otherwise an interval, and the first tick is the grace period -- the
    // wait proving itself long enough to say anything at all.
    const cycle = still
      ? setTimeout(() => setTicks(1), PHRASE_INTERVAL_MS)
      : setInterval(() => setTicks((n) => n + 1), PHRASE_INTERVAL_MS)
    const threshold = setTimeout(() => setLong(true), LONG_WAIT_MS[chromeState])

    return () => {
      if (still) clearTimeout(cycle)
      else clearInterval(cycle)
      clearTimeout(threshold)
    }
  }, [chromeState])

  if (!phrases) return null
  if (long) return { kind: LONG, text: LONG_WAIT_LINE[chromeState], phrases, index: -1 }
  if (ticks === 0) return null
  const index = (ticks - 1) % phrases.length
  return { kind: PHRASE, text: phrases[index], phrases, index }
}

/**
 * THE LINE ITSELF, in the direction slot.
 *
 * THE CARD DOES NOT RESIZE WHILE IT CYCLES. The instruction card is
 * `width: fit-content` and centred, so a slot holding one phrase at a time
 * would grow and shrink on both sides every two seconds -- motion nobody asked
 * for, over a map, in the region whose job is to be read. Every phrase is in
 * the document, stacked into one grid cell, with the ones that are not current
 * held at `visibility: hidden`: the box is as wide as the longest phrase in
 * the set for the whole wait, and only its contents change. The same fix the
 * tab strip and the detail panel take, for the same reason.
 *
 * THE STACK IS aria-hidden AND THAT IS DELIBERATE. This paragraph is a live
 * region, and a live region that rewrites itself every two seconds interrupts
 * a screen reader four times before the commit is half done -- with phrases
 * that carry no information by construction. The fact IS announced, once,
 * where it belongs: the banner's own `role="status"` line says "Committing…"
 * or "Generating…" as the state is entered.
 *
 * THE LONG-WAIT LINE IS NOT HIDDEN. It says something that was not true a
 * moment ago and that a person waiting needs, so it is announced exactly once,
 * when it arrives.
 */
export default function WaitingLine({ waiting, stepId }) {
  if (waiting.kind === LONG) {
    return (
      /* NO CLASS OF ITS OWN: it is one sentence in the direction slot, set
         exactly as the declared instruction it replaced. A rule here would be
         a second voice for the same line. */
      <span data-testid={`waiting-long-${stepId}`}>{waiting.text}</span>
    )
  }

  return (
    <span className="chrome-bar__waiting" aria-hidden="true">
      {waiting.phrases.map((phrase, index) => (
        <span
          key={phrase}
          className="chrome-bar__waiting-phrase"
          data-current={index === waiting.index ? 'true' : undefined}
          data-testid={index === waiting.index ? `waiting-phrase-${stepId}` : undefined}
        >
          {phrase}
        </span>
      ))}
    </span>
  )
}
