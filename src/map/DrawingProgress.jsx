/**
 * DrawingProgress.jsx
 *
 * THE GESTURE IN FLIGHT, and nothing else.
 *
 * A half-placed ring is not a decision. It has no meaning to a commit, nothing
 * to recover if the panel unmounts, and no business in the store's draft --
 * DrawGesture has said so since F3 and still does. But it is not private to
 * the gesture either: the PANEL reads out what the polygon crosses as each
 * vertex goes down, and the MAP puts a marker at each crossing, and neither of
 * those is inside the tool.
 *
 * So the in-flight points and their cautions live here: one small provider,
 * written by whichever draw gesture is armed, read by the panel and by the
 * caution pane. It is cleared the moment the gesture closes -- what survives is
 * the finished Feature the store took, with its cautions already on it.
 *
 * THIS IS THE SPIKE'S `zonePoints` AND `liveCautions`, and the only two of its
 * eleven useState hooks that did not simply disappear into the session layer.
 * They did not disappear because they are not session state and never were:
 * every other one was a fact about the document, the payload or a request, and
 * these two are a fact about a mouse. Scoping them to the map is the honest
 * home for them; App.jsx was not.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const DrawingProgressContext = createContext(null)

const NOTHING_IN_FLIGHT = Object.freeze({
  points: Object.freeze([]),
  cautions: Object.freeze([]),
  // What the step said about the LAST shape closed -- what the clamp trimmed,
  // or why a shape was refused outright. It outlives the gesture that produced
  // it (the panel has to be able to read it after the ring closed) and is
  // cleared by the next gesture starting, which is the moment it stops being
  // about anything on screen.
  //
  // IT IS NOT A DRAFT INPUT, and it was one for exactly one test run. A
  // draft's `inputs` are the step's DECLARED user inputs and
  // buildCommitBody() sends all of them: a notice parked there rode along on
  // the commit, was stored on the step entry, and made the next reopen 400
  // with "step 'landform' accepts user inputs (); got unknown
  // ['__drawNotice']". A message about a gesture is not a decision, and the
  // draft is where decisions go.
  notice: null,
})

export function DrawingProgressProvider({ children }) {
  const [progress, setProgress] = useState(NOTHING_IN_FLIGHT)

  const report = useCallback((points, cautions) => {
    setProgress((previous) =>
      points.length
        ? { points, cautions: cautions ?? [], notice: previous.notice }
        : { ...NOTHING_IN_FLIGHT, notice: previous.notice }
    )
  }, [])

  /** The gesture ended. Points go; whatever the step said about them stays. */
  const settle = useCallback((notice) => {
    setProgress({ ...NOTHING_IN_FLIGHT, notice: notice ?? null })
  }, [])

  const clear = useCallback(() => setProgress(NOTHING_IN_FLIGHT), [])

  const value = useMemo(
    () => ({
      points: progress.points,
      cautions: progress.cautions,
      notice: progress.notice,
      report,
      settle,
      clear,
    }),
    [progress, report, settle, clear]
  )

  return (
    <DrawingProgressContext.Provider value={value}>{children}</DrawingProgressContext.Provider>
  )
}

/**
 * Read the gesture in flight. Returns the empty pair outside a provider rather
 * than throwing: a caution pane on a map with no draw tool on it is a
 * legitimate arrangement, and the answer there is "nothing is being drawn".
 */
export function useDrawingProgress() {
  return useContext(DrawingProgressContext) ?? NOTHING_IN_FLIGHT_WITH_NOOPS
}

const NOTHING_IN_FLIGHT_WITH_NOOPS = Object.freeze({
  ...NOTHING_IN_FLIGHT,
  report: () => {},
  settle: () => {},
  clear: () => {},
})
