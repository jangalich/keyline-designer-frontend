/**
 * report.js
 *
 * THE REPORT, FROM SUBMIT TO A TERMINAL ANSWER — jobs.js's shape, for the one
 * action in the app that is not a step.
 *
 * WHY IT IS A SEPARATE MODULE AND NOT A BRANCH IN jobs.js. runGeneration()
 * takes a step id and a params object and resolves to a payload the step
 * machine seeds a draft from; every line of that is about a step. A report has
 * no step id, no params, no payload and no draft — it produces one file and a
 * link to it. Threading a "this one is not a step" flag through the generate
 * path would put the distinction in the middle of the function instead of at
 * its edge.
 *
 * WHAT IS SHARED IS THE PART THAT SHOULD BE: pollJob(). The transport is the
 * same job resource with the same three states and the same backoff, and
 * section 3.1's note that an SSE upgrade "should change only the client" is as
 * true here as it is there. One poller, so the upgrade is one change.
 *
 * THE PACE IS THE REPORT'S OWN, BECAUSE THE REPORT REPORTS PROGRESS. Every
 * snapshot carries `progress` -- completed work over total work, and what is
 * being worked on (report_progress.py in the backend) -- and a bar drawn from
 * it is only as current as the last poll. So the report polls every second
 * while the completed count advances and eases to three once it stops
 * (jobs.js's progressPace). The generate keeps its backoff: it reports no
 * progress, and there is nothing to keep current.
 *
 * THE FAILURES ARE NOT TOLD APART HERE. A failed job resolves with its error
 * payload exactly as a failed generate does; which KIND of failure it is — an
 * expired session the user can act on, a named source (`failed_layer`) that
 * did not answer, or an outage with nothing to ask for — is read off the keys
 * the payload carries, and that reading belongs where the copy is. See
 * reportFailure() in the store and report/ReportPage.jsx.
 */

import { generateReport as apiGenerateReport } from './apiClient'
import { pollJob, progressPace } from './jobs'

/**
 * Submit a report and drive it to a terminal answer.
 *
 * THE SUBMIT'S OWN FAILURES ARE THROWN, NOT POLLED FOR — jobs.js's rule, and
 * it matters more here. A session with any step uncommitted is refused with a
 * 409 and NO job id, because the report reads the current committed state and
 * a partial design is not one. That is not a failed report: it is a request
 * that could never have been attempted, and it arrives as a StepStateError
 * rather than as a terminal snapshot.
 *
 * ABORTING STOPS THIS CLIENT LISTENING; IT DOES NOT STOP THE SERVER — and
 * unlike a generate, the work is NOT reachable afterwards by asking for it
 * again: there is no GET .../report that serves a finished one, and the job's
 * download URL is the only handle on the file. So an abort here does lose the
 * link, and the answer is to ask for another report. That is acceptable for
 * the same reason the whole store is in-memory (a lost report is a
 * regenerate), and it is the reason nothing in this app aborts a report except
 * a second press of the same button.
 */
export async function runReport(sessionId, { propertyLabel, onSubmit, onUpdate, signal } = {}) {
  const accepted = await apiGenerateReport(sessionId, { propertyLabel }, { signal })
  onSubmit?.(accepted)
  return pollJob(accepted.job_id, { onUpdate, signal, pace: progressPace() })
}
