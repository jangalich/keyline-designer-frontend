/**
 * apiClient.js
 *
 * THE WIRE, AND NOTHING BUT. Every fetch against the session surface lives
 * here; no component and no reducer calls fetch directly. That is not
 * tidiness — it is what makes the status-code contract below enforceable in
 * ONE place. A 409 means two different things on this API, and a component
 * that fetched for itself would have to re-derive which one it got. It would
 * get it wrong eventually, and the failure mode is silently overwriting
 * somebody else's commit.
 *
 * The surface (interactive-design-architecture-proposal.md section 3.1,
 * implemented in the backend's session_api.py):
 *
 *   POST   /api/sessions                              -> 201 + document
 *   GET    /api/sessions/{id}                         -> 200 document
 *   POST   /api/sessions/{id}/steps/{step}/generate   -> 202 {job_id, status}
 *   POST   /api/sessions/{id}/steps/{step}/commit     -> 200 document
 *   POST   /api/sessions/{id}/steps/{step}/reopen     -> 200 document
 *   GET    /api/sessions/{id}/steps/{step}/layers     -> 200 step payload
 *   GET    /api/jobs/{id}                             -> 200 {status, result|error}
 *                                                        (result: {payload, document})
 *   GET    /api/steps                                 -> 200 {step_order}
 *
 * COORDINATE ORDER. Leaflet is [lat, lng]; GeoJSON and this API are
 * [lng, lat]. geo.js documents its four interop functions as the only places
 * the two orders meet, and this module is the only other one — so the swap
 * happens here, through those functions, and never at a call site. Nothing
 * above this module should ever see a [lng, lat] pair.
 */

import { ringToGeoJSON, ringFromGeoJSON } from '../geo'

// The backend API's address. Set VITE_API_URL at build/deploy time to
// point at the deployed backend — same convention as App.jsx and
// AddressSearch.jsx, deliberately the same constant rather than a second
// one that could be configured differently.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export { API_URL }

/* ---------------------------------------------------------------------------
   Errors
   ---------------------------------------------------------------------------
   FIVE TYPES, BECAUSE THERE ARE FIVE CLIENT PATHS. Collapsing them into one
   ApiError carrying a status would push the branch onto every caller, and the
   two 409s would then be told apart by a numeric comparison at each one.
   --------------------------------------------------------------------------- */

/** Anything the server answered that was not a success. Carries the parsed body. */
export class ApiError extends Error {
  constructor(message, { status, body, url }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body ?? null
    this.url = url
  }
}

/**
 * 409 WITH A DOCUMENT: a commit based on a stale step revision. Someone else
 * committed in between — another tab, another device, the same user twice.
 *
 * THE CARRIED DOCUMENT IS THE POINT. Section 2.6's reconciliation is: hydrate
 * what you were given, keep the draft where its base step survived, re-prompt.
 * None of that is possible from a status code, and re-fetching the session to
 * get it is a second round trip that can lose another race. The backend puts
 * the current document in the body precisely so this class can carry it.
 */
export class RevisionConflictError extends ApiError {
  constructor(body, { status, url }) {
    super(body?.error || 'This step changed since you loaded it.', { status, body, url })
    this.name = 'RevisionConflictError'
    this.stepId = body?.step_id ?? null
    this.expectedBaseRevision = body?.expected_base_revision ?? null
    this.receivedBaseRevision = body?.received_base_revision ?? null
    // Always present on this class — isConflict() below is defined as "the
    // body carried a document", so an instance without one cannot exist.
    this.document = body.document
  }
}

/**
 * 409 WITHOUT A DOCUMENT: upstream not committed, a schema version this build
 * cannot read, a reopen of a step that was never committed.
 *
 * NOT A CONFLICT TO RECONCILE, and that distinction is the whole reason this
 * is a separate class. There is no stale revision to rebase onto and no
 * document to hydrate; retrying sends the identical request into the identical
 * state. These are surfaced to the user and stop there.
 *
 * `upstreamStep` / `upstreamStatus` are set on the upstream-not-committed
 * shape and null otherwise; `status` on the not-generated shape. The client's
 * next action is "go back to step X", which is only actionable if the response
 * names X — see the backend's _upstream_payload().
 */
export class StepStateError extends ApiError {
  constructor(body, { status, url }) {
    super(body?.error || 'This step is not in a state that allows that.', {
      status,
      body,
      url,
    })
    this.name = 'StepStateError'
    this.stepId = body?.step_id ?? null
    this.upstreamStep = body?.upstream_step ?? null
    this.upstreamStatus = body?.upstream_status ?? null
    this.stepStatus = body?.status ?? null
  }
}

/**
 * 422: the commit was well-formed and was refused, PER FEATURE.
 *
 * `rejections` is [{feature_id, code, reason}] and must stay that way all the
 * way to the map. A banner saying "this could not be saved" makes the user
 * delete zones one at a time to find out which one is the problem — which is
 * exactly what the backend's _rejection_payload() docstring refuses to do, and
 * this class must not undo it one layer up.
 */
export class CommitRejectedError extends ApiError {
  constructor(body, { status, url }) {
    super(body?.error || 'Some features could not be committed.', { status, body, url })
    this.name = 'CommitRejectedError'
    this.rejections = Array.isArray(body?.rejections) ? body.rejections : []
  }
}

/**
 * 404: the session (or job) this URL names does not exist.
 *
 * ON RESUME THIS IS NOT A FAILURE. A stale bookmark or a session the server
 * has since discarded is an ordinary thing to happen to a URL, and the right
 * response is to forget the id and start fresh — not an error banner the user
 * has to dismiss before they can do anything. See the store's resume path.
 */
export class NotFoundError extends ApiError {
  constructor(body, { status, url }) {
    super(body?.error || 'Not found.', { status, body, url })
    this.name = 'NotFoundError'
  }
}

/** The request never reached the server, or the response was not JSON. */
export class NetworkError extends Error {
  constructor(message, { url, cause } = {}) {
    super(message)
    this.name = 'NetworkError'
    this.url = url
    this.cause = cause
  }
}

/**
 * A 409 carries a document if and only if it is a revision conflict.
 *
 * BY SHAPE, NEVER BY GUESSING. The backend's error table maps four distinct
 * exception families onto 409, and only RevisionConflictError's payload
 * builder attaches `document`. So the presence of that key IS the
 * discriminator — there is no second signal to sniff for and no ordering
 * assumption about which handler ran.
 */
function isRevisionConflict(body) {
  return Boolean(body) && typeof body === 'object' && body.document != null
}

/* ---------------------------------------------------------------------------
   The one request path
   --------------------------------------------------------------------------- */

async function request(path, { method = 'GET', body, signal } = {}) {
  const url = `${API_URL}${path}`

  let response
  try {
    response = await fetch(url, {
      method,
      signal,
      ...(body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    })
  } catch (error) {
    // An aborted fetch is the caller's own doing — a component unmounting, a
    // second generate superseding the first — and must not be reported as the
    // backend being unreachable. It is re-thrown unchanged so callers can
    // test for it with the standard `error.name === 'AbortError'`.
    if (error?.name === 'AbortError') throw error
    throw new NetworkError('Could not reach the server.', { url, cause: error })
  }

  // `.catch(() => null)` rather than a bare await: an error response with an
  // empty or non-JSON body (a proxy's 502 page) must still produce a typed
  // error, not a parse exception that hides the status entirely. Same
  // treatment App.jsx already gives its own responses.
  const payload = await response.json().catch(() => null)

  if (response.ok) {
    if (payload === null) {
      throw new NetworkError('The server sent a response that was not JSON.', { url })
    }
    return payload
  }

  const context = { status: response.status, url }
  if (response.status === 404) throw new NotFoundError(payload, context)
  if (response.status === 422) throw new CommitRejectedError(payload, context)
  if (response.status === 409) {
    throw isRevisionConflict(payload)
      ? new RevisionConflictError(payload, context)
      : new StepStateError(payload, context)
  }
  throw new ApiError(payload?.error || `Request failed (${response.status}).`, context)
}

/* ---------------------------------------------------------------------------
   The eight calls
   ---------------------------------------------------------------------------
   SEVEN OF THEM NEED A SESSION AND ONE DOES NOT. getSteps() is the only call
   here that can be made before anything exists, and it is here rather than in
   the one component that wants it for the reason at the top of this file: the
   rule is that no component fetches for itself, and a route that happens to
   be simple is not an exception to it. Its answer is also the same array
   under the same key that every document carries, so the caller that falls
   back to it is reading one shape from two sources -- never two shapes.
   --------------------------------------------------------------------------- */

/**
 * Create a session on a drawn boundary. `points` is [lat, lng] — Leaflet's
 * order, which is what every drawing tool in this app produces — and
 * ringToGeoJSON does the one swap.
 *
 * Returns the Design Document; the backend has already fetched Layer 1 and
 * run the terrain warm-up by the time this resolves, so there is nothing to
 * poll for and no follow-up GET to make.
 */
export function createSession(points, { signal } = {}) {
  return request('/api/sessions', {
    method: 'POST',
    body: { boundary: ringToGeoJSON(points) },
    signal,
  })
}

/** The Design Document. THE RESUME CALL — this alone says where the wizard is. */
export function getSession(sessionId, { signal } = {}) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}`, { signal })
}

/**
 * Start a generate. Resolves to {job_id, status}; the payload arrives by
 * polling (see jobs.js). `params` is the step's declared user inputs — the
 * access point is one of the ROADS step's inputs, not a global field.
 */
export function generateStep(sessionId, stepId, params, { signal } = {}) {
  return request(
    `/api/sessions/${encodeURIComponent(sessionId)}/steps/${encodeURIComponent(stepId)}/generate`,
    {
      method: 'POST',
      // Omitted entirely when there is nothing to send: a step declaring no
      // user_inputs rejects any params at all, and `{}` is params.
      body: params == null ? {} : { params },
      signal,
    }
  )
}

/**
 * Commit a feature set. Resolves to the NEW Design Document — which the store
 * applies WHOLESALE, cascade and all.
 *
 * `baseRevision` is required and is never defaulted here. Defaulting it would
 * turn every commit from a caller that forgot it into an apparent first
 * commit, which is precisely the lost update the field exists to detect.
 */
export function commitStep(
  sessionId,
  stepId,
  { features, provenance, baseRevision, inputs },
  { signal } = {}
) {
  const body = { features, provenance, base_revision: baseRevision }
  if (inputs !== undefined) body.inputs = inputs
  return request(
    `/api/sessions/${encodeURIComponent(sessionId)}/steps/${encodeURIComponent(stepId)}/commit`,
    { method: 'POST', body, signal }
  )
}

/**
 * Reopen a committed step. No body — the step is in the URL and there is
 * nothing for a caller to say. Resolves to the new document, whose downstream
 * steps are already reset; the editable proposals come back through
 * getStepLayers(), the same call a plain resume makes.
 */
export function reopenStep(sessionId, stepId, { signal } = {}) {
  return request(
    `/api/sessions/${encodeURIComponent(sessionId)}/steps/${encodeURIComponent(stepId)}/reopen`,
    { method: 'POST', body: {}, signal }
  )
}

/**
 * A generated step's payload — the same object the generate job returned.
 *
 * THIS IS WHY A RELOAD DOES NOT REGENERATE. A step with no current proposals
 * answers 409 naming its actual status (a StepStateError here), never a 200
 * with an empty collection: "you have not generated this yet" and "this parcel
 * has no eligible ground" are different answers and the UI acts differently
 * on them.
 */
export function getStepLayers(sessionId, stepId, { signal } = {}) {
  return request(
    `/api/sessions/${encodeURIComponent(sessionId)}/steps/${encodeURIComponent(stepId)}/layers`,
    { signal }
  )
}

/**
 * One job poll. {job_id, status, result | error}.
 *
 * A DONE GENERATE'S `result` IS {payload, document} -- two sibling keys, the
 * step's wire payload and the Design Document the generate moved to
 * `generated`, byte-identical to what GET /api/sessions/{id} would return
 * (step_orchestrator.run_generate_job). The second key is why nothing on this
 * client fetches the session after a generate: the status transition arrives
 * with the proposals that caused it.
 *
 * A FINISHED-WITH-FAILURE JOB IS A SUCCESSFUL POLL and comes back here as a
 * resolved promise with status 'failed', not a thrown error. The question this
 * call asks is "did the job finish"; "it failed, here is the failed_layer" is
 * a complete answer to it. 404 — an id this process never held, or evicted
 * after finishing — is the genuinely different answer and is the only one
 * that throws.
 */
export function getJob(jobId, { signal } = {}) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}`, { signal })
}

/**
 * THE PIPELINE'S STEP ORDER, WITH NO SESSION IN IT.
 *
 * Resolves to the array itself -- the same `step_order` a document carries,
 * from the backend's own STEP_ORDER (session_api's get_steps_endpoint). It is
 * unwrapped here rather than at the call site so a caller holds a step order
 * and not an envelope, and the document's field and this call's answer are
 * the same TYPE as well as the same content.
 *
 * WHAT IT IS FOR. The step rail enumerates the pipeline, and before a session
 * exists there is no document to enumerate it from. The alternative to this
 * call is six step ids hardcoded in this repository, which would be a second
 * source of truth for the one constant the commit cascade, the reopen warning
 * and the step registry all key off -- and it would be a second source only
 * the pre-session case reads, so a drift between it and the backend would
 * show on the first screen and nowhere else.
 *
 * IDS, NOT TITLES. Titles are this repository's: `title` is a field of a step
 * definition, which is where a step says what its header reads. The route
 * serves ids only, deliberately, so there is exactly one copy of the word
 * "Landform" in this system.
 *
 * NO SESSION ID, NO BODY, AND NO ERROR IT CAN REACH BUT A NETWORK ONE. Every
 * other call here can 404 on a session; this one cannot fail in a way the
 * caller can act on, which is why its caller treats an unavailable answer as
 * "not yet" rather than as an error to render.
 */
export function getSteps({ signal } = {}) {
  return request('/api/steps', { signal }).then((body) => body.step_order)
}

/**
 * A document's boundary as Leaflet [lat, lng] points.
 *
 * Here rather than in the store because it is a coordinate-order conversion,
 * and this module plus geo.js are the only two places those meet. The store
 * mirrors what the server sent; what it hands a map layer is already in the
 * order that layer reads.
 */
export function boundaryToLatLngs(document) {
  const boundary = document?.boundary
  if (!Array.isArray(boundary) || boundary.length === 0) return []
  return ringFromGeoJSON(boundary)
}
