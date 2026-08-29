/**
 * jobs.js
 *
 * A GENERATE, FROM SUBMIT TO A TERMINAL ANSWER — and the only module in the
 * app that knows the answer arrives by polling.
 *
 * WHY THAT CONFINEMENT IS THE POINT. Section 3.1 records SSE as a possible
 * later upgrade to this exact exchange. If a component knew about `job_id`,
 * about a backoff, or about the interval at all, that upgrade would be a
 * rewrite of everything that generates. So the store calls runGeneration(),
 * gets progress through `onUpdate` and a terminal state at the end, and would
 * not have to change if the transport underneath became a stream tomorrow.
 *
 * THE BACKOFF EXISTS BECAUSE A GENERATE IS A DEM-WIDE COMPUTE PASS: 30-60s on
 * real parcel data. A fixed 500ms interval would spend a hundred-odd requests
 * discovering that a job is still running. Starting near a second and easing
 * out to five keeps the first poll cheap for a cached or trivial parcel while
 * costing about fifteen requests across a full minute of real work.
 */

import { getJob, generateStep, NotFoundError } from './apiClient'

// The three states job_runner.py has, verbatim. There is no 'queued' — a job
// exists only once it is running.
export const JOB_RUNNING = 'running'
export const JOB_DONE = 'done'
export const JOB_FAILED = 'failed'

/**
 * A fourth state, and the only one this client invents.
 *
 * The job runner is in-memory and capped, so an id it never held and one it
 * finished-and-evicted are both a 404. That is NOT a failed generate: the work
 * may well have succeeded and written its proposals, and the recovery is
 * GET .../layers, which serves the same payload the job would have. Reporting
 * it as `failed` would make the user regenerate a step that is already
 * generated; reporting it as `done` would claim a result we do not hold. It is
 * its own answer, and the store branches on it to fall back to layers.
 */
export const JOB_EVICTED = 'evicted'

export const INITIAL_POLL_DELAY_MS = 1000
export const MAX_POLL_DELAY_MS = 5000
export const POLL_BACKOFF_FACTOR = 1.5

/** Resolves after `ms`, or rejects the moment `signal` aborts. */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    // WITHOUT THIS, AN ABORT WAITS OUT THE SLEEP. The fetch inside a poll
    // aborts instantly, but most of a poll cycle is spent here — so a
    // component unmounting or a second generate superseding this one would
    // still fire one more request up to five seconds later, against a store
    // that has moved on.
    function onAbort() {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function abortError() {
  // The same shape fetch() produces, so every caller can test for an abort
  // one way (`error.name === 'AbortError'`) whether it came from the request
  // or from the wait between requests.
  const error = new Error('Aborted.')
  error.name = 'AbortError'
  return error
}

/**
 * Poll a job to a terminal state.
 *
 * Resolves to the terminal snapshot: `{job_id, status, result}` for done,
 * `{job_id, status, error}` for failed — job_runner.snapshot() verbatim, with
 * the absent half omitted rather than sent as null — or
 * `{job_id, status: 'evicted'}` for a 404.
 *
 * `onUpdate` is called with every snapshot including the terminal one, so a
 * caller that only wants to mirror state into a store never has to look at the
 * resolved value.
 *
 * IT DOES NOT THROW ON A FAILED JOB. An HTTP 200 whose body says `failed` is a
 * successful poll — the question was "did the job finish", and it did. The
 * failure is data, carrying the step's own `failed_layer {type, label}`, and
 * turning it into a thrown error here would put it on the same path as the
 * network being down, which is the one distinction the panel needs to keep.
 */
export async function pollJob(jobId, { onUpdate, signal } = {}) {
  let delay = INITIAL_POLL_DELAY_MS

  for (;;) {
    let snapshot
    try {
      snapshot = await getJob(jobId, { signal })
    } catch (error) {
      if (error instanceof NotFoundError) {
        const evicted = { job_id: jobId, status: JOB_EVICTED }
        onUpdate?.(evicted)
        return evicted
      }
      // A NetworkError or an abort belongs to the caller. Retrying a
      // transport failure here would hide a backend that is down behind a
      // spinner that never stops.
      throw error
    }

    onUpdate?.(snapshot)
    if (snapshot.status !== JOB_RUNNING) return snapshot

    await sleep(delay, signal)
    delay = Math.min(Math.round(delay * POLL_BACKOFF_FACTOR), MAX_POLL_DELAY_MS)
  }
}

/**
 * Submit a generate and drive it to a terminal answer.
 *
 * THE SUBMIT'S OWN FAILURES ARE NOT JOB FAILURES and are thrown, not
 * surfaced through `onUpdate`: an unknown session (404), an unregistered step
 * (404), params that do not match the step's declared user inputs (400). The
 * backend raises all of those BEFORE a job exists, which is exactly what makes
 * them synchronous — there is nothing to poll for, and making the user poll to
 * discover their own typo would be worse on every axis.
 *
 * ABORTING STOPS THIS CLIENT LISTENING; IT DOES NOT STOP THE SERVER. The job
 * runs to completion in the backend's thread pool either way. That is the
 * right behaviour for the two cases that abort — the component unmounted, or a
 * second generate superseded this one — because the work is idempotent and
 * network-free, and its result is reachable afterwards through
 * GET .../layers regardless of who was listening when it landed.
 */
export async function runGeneration(
  sessionId,
  stepId,
  params,
  { onSubmit, onUpdate, signal } = {}
) {
  const accepted = await generateStep(sessionId, stepId, params, { signal })
  onSubmit?.(accepted)
  return pollJob(accepted.job_id, { onUpdate, signal })
}
