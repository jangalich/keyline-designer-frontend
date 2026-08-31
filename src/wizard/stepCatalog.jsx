/**
 * stepCatalog.jsx
 *
 * THE PIPELINE'S STEP ORDER WHEN THERE IS NO DOCUMENT TO READ IT OFF.
 *
 * One call to GET /api/steps, held for the life of the page, so the rail can
 * show the whole pipeline before POST /api/sessions instead of showing the
 * boundary alone and calling that the honest length.
 *
 *
 * WHY THIS IS NOT IN THE SESSION STORE
 *
 * The store holds ONE THING: the Design Document the server sent, plus the
 * drafts sitting on top of it. Everything in it is about a session. This is
 * not -- it is a constant of the deployment, true before any session exists
 * and identical for every session that ever will. Putting it in the store
 * would mean a reducer case, a slot in initialState, and a piece of state
 * that hydrate() has to be taught to leave alone; and the first person to
 * read `state.stepOrder` beside `state.catalogOrder` would have to work out
 * which of the two answers their question.
 *
 * So it lives here, next to the one component that needs it, and the store is
 * untouched.
 *
 *
 * THE DOCUMENT ALWAYS WINS, AND THIS IS ONLY EVER THE FALLBACK
 *
 * A session's own `step_order` is what the wizard runs on the moment one
 * exists -- that array is the pipeline THIS document was built against, and a
 * cached constant fetched at page load is not. They agree today (both come
 * from design_document.STEP_ORDER; the backend asserts the identity), and the
 * ordering here is what keeps that agreement from being load-bearing: if a
 * deploy ever changed STEP_ORDER under a session that was already open, the
 * session would keep the order it was created with, which is the only answer
 * that could be right for it.
 *
 *
 * A FAILED FETCH IS AN EMPTY ORDER, NOT AN ERROR
 *
 * There is nothing for a user to do about it and nothing for them to read.
 * The rail falls back to what it did before this module existed -- the
 * boundary alone -- which is a shorter table of contents rather than a broken
 * screen, and the boundary step is fully usable while it is the only row. An
 * error banner over a map for "the table of contents is short" would be the
 * more visible failure and the less useful one.
 *
 *
 * ONE FETCH PER PAGE, SHARED
 *
 * The promise is module-level, so two providers (the app has one; a test may
 * mount several) make one request between them and every later mount resolves
 * off the same answer. `resetStepCatalog()` drops it, which is what a test
 * needs between cases and what nothing in the app ever calls.
 */

import { useEffect, useState } from 'react'

import { getSteps } from '../session/apiClient'

/** Nothing fetched, or a fetch that failed. Frozen, so it is never mutated. */
const NO_CATALOG = Object.freeze([])

/**
 * The in-flight or settled request, or null before the first mount. Held as
 * the PROMISE rather than the answer so two mounts in the same tick share one
 * request instead of racing two.
 */
let pending = null

/** The settled answer, or null. What a second mount reads without waiting. */
let settled = null

/**
 * Fetch the order once. Resolves to the array, or to NO_CATALOG if the call
 * failed -- this never rejects, because there is no caller that could act on
 * a rejection.
 */
export function loadStepCatalog() {
  if (settled) return Promise.resolve(settled)
  if (!pending) {
    pending = getSteps()
      .then((order) => {
        settled = Array.isArray(order) && order.length ? Object.freeze([...order]) : NO_CATALOG
        return settled
      })
      .catch(() => {
        // Not cached as settled: a network blip at page load should not
        // condemn the rail to a short list for the rest of the session, and
        // the next mount is a free retry.
        pending = null
        return NO_CATALOG
      })
  }
  return pending
}

/** Forget everything. For tests; nothing in the app calls it. */
export function resetStepCatalog() {
  pending = null
  settled = null
}

/**
 * The catalogued step order, or [] until the answer arrives.
 *
 * Returns an ARRAY rather than {order, loading}, because there is no caller
 * that renders a loading state for this: the rail draws whatever rows it has
 * and grows when the answer lands, which is a table of contents filling in
 * rather than a spinner over a map.
 */
export function useStepCatalog() {
  const [order, setOrder] = useState(() => settled ?? NO_CATALOG)

  useEffect(() => {
    let live = true
    loadStepCatalog().then((next) => {
      if (live) setOrder(next)
    })
    return () => {
      live = false
    }
  }, [])

  return order
}
