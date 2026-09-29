/**
 * ReportProgress.jsx  —  HOW FAR THROUGH THE REPORT THE JOB IS, AND WHAT IT
 * IS DOING NOW.
 *
 * THE BAR NEVER LIES. Its width is the job's own `progress.fraction`:
 * completed work over total work, counted by the backend as each unit
 * finishes (report_progress.py). Nothing here advances it. There is no timer,
 * no easing towards an estimate, no stripe or shimmer that implies motion --
 * when a public data service stalls for forty seconds, the bar holds for
 * forty seconds and the label keeps naming what it is waiting on. That
 * stillness is the honest report, and a person who sees "Flood maps" frozen
 * understands the situation better than they would from anything that moved.
 *
 * WHAT IT REPLACED. The report's wait used to be WaitingLine.jsx's cycling
 * phrases, which by design claimed nothing, because the job reported
 * nothing. The job now reports progress, so those phrases are gone from the
 * report -- two things competing to explain one wait is worse than either.
 * Commits and generates keep their phrases: neither reports progress, and
 * for an unmeasured wait the cycling line is still the honest treatment.
 *
 *
 * THE WORDS ARE THIS REPOSITORY'S. The job sends KEYS -- a stage and, while
 * public records are being read, the kind of data -- and never a module or a
 * layer name. What a key reads as is decided below, about the land's data
 * rather than about the software.
 *
 *
 * STATES
 *
 *   before the plan   the job exists and has not counted its work yet: 0%,
 *                     "Starting the report".
 *   working           the bar at the job's fraction, the stage's sentence,
 *                     and under it the kind of data being read with the
 *                     count of records read so far.
 *   failed            THE BAR STAYS WHERE THE RUN STOPPED, in the muted
 *                     tone, headed "Stopped at N%", and the overlay's
 *                     failure notice under it says what happened. It is not
 *                     cleared and it is not completed.
 *
 * MOTION. The fill's width eases over 240ms when a completion moves it -- a
 * step, not a sweep -- and under prefers-reduced-motion it simply changes.
 * Nothing animates while nothing completes.
 *
 * ANNOUNCEMENTS. The stage sentence is a polite live region: it changes
 * five or six times a run, each one a real change. The sub-label (21 fetches)
 * and the percentage are NOT announced as they tick -- a screen reader told
 * "Soil survey, 9 of 21" every two seconds is being interrupted, not
 * informed -- and are carried on the progressbar's aria-valuetext for anyone
 * who asks.
 */

/** Each stage, as a sentence about what is happening to the land's data. */
export const STAGE_COPY = Object.freeze({
  records: 'Reading the public records for this parcel',
  rebuild: 'Rebuilding what we know about your land',
  terrain: 'Measuring the terrain',
  maps: 'Drawing the maps',
  pages: 'Laying out the pages',
})

/** Before the job has counted its work: true, and says nothing more. */
export const STARTING_COPY = 'Starting the report'

/** Over a bar a failure froze. The notice beneath says why. */
export const stoppedCopy = (percent) => `Stopped at ${percent}%`

/**
 * WHAT KIND OF DATA IS BEING READ, while the records are. Named for what it
 * is, never for the service that holds it. Several fetches share a kind on
 * purpose: five soil survey queries are one thing to the person waiting, and
 * the stream network is one thing whichever of three fetches is outstanding.
 */
export const DETAIL_COPY = Object.freeze({
  climate: 'Climate records',
  storms: 'Storm rainfall records',
  streams: 'Springs and streams',
  wetlands: 'Wetlands',
  flood: 'Flood maps',
  land_cover: 'Land cover',
  soil: 'Soil survey',
  forest: 'Forest records',
  geology: 'Bedrock geology',
  aerial: 'Aerial photography',
  surroundings: 'The surrounding landscape',
  county: 'County records',
  buildings: 'Buildings and power lines',
})

/** The stage sentence for a progress snapshot. */
export function stageLine(progress) {
  if (!progress || !progress.total) return STARTING_COPY
  return STAGE_COPY[progress.stage] ?? null
}

/**
 * The line under it: while records are read, the kind of data and how many
 * of the records are in. Null in every other stage -- the stage sentence is
 * the whole of what there is to say there.
 */
export function detailLine(progress) {
  if (!progress || progress.stage !== 'records') return null
  const fetches = progress.fetches
  const count = fetches?.total ? `${fetches.completed} of ${fetches.total} records` : null
  const kind = DETAIL_COPY[progress.detail] ?? null
  return [kind, count].filter(Boolean).join(' · ') || null
}

/** The percentage shown, 0..100, never above 100 and never below 0. */
export function percentOf(progress) {
  const value = Number(progress?.percent)
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.floor(value)))
}

export default function ReportProgress({ progress, failed = false }) {
  const percent = percentOf(progress)
  // THE WIDTH IS THE FRACTION ITSELF, not the floored percent, so a unit
  // worth half a percent still moves the bar it is part of.
  const fraction = Math.max(0, Math.min(1, Number(progress?.fraction) || 0))
  const stage = failed ? null : stageLine(progress)
  const detail = failed ? null : detailLine(progress)
  const valueText = [`${percent}%`, stage, detail].filter(Boolean).join(', ')

  return (
    <div
      className="report-progress"
      data-testid="report-progress"
      data-state={failed ? 'failed' : 'working'}
      data-stage={progress?.stage ?? undefined}
    >
      {failed ? (
        /* NOT a live region: the failure notice beside it already is, and
           it is the one that says what happened. */
        <div className="report-progress__head">
          <p className="report-progress__label" data-testid="report-progress-label">
            {stoppedCopy(percent)}
          </p>
        </div>
      ) : null}
      {stage ? (
        <div className="report-progress__head">
          <p className="report-progress__label" role="status" data-testid="report-progress-label">
            {stage}
          </p>
          <span className="report-progress__percent" aria-hidden="true" data-testid="report-progress-percent">
            {percent}%
          </span>
        </div>
      ) : null}
      <div
        className="report-progress__track"
        role="progressbar"
        aria-label="Report progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={valueText}
        data-testid="report-progress-bar"
      >
        <div
          className="report-progress__fill"
          data-testid="report-progress-fill"
          style={{ transform: `scaleX(${fraction})` }}
        />
      </div>
      {/* THE SUB-LINE'S BOX IS ALWAYS THERE while working, so the foot does
          not change height as records give way to the terrain. */}
      {failed ? null : (
        <p className="report-progress__detail" aria-hidden="true" data-testid="report-progress-detail">
          {detail ?? ' '}
        </p>
      )}
    </div>
  )
}
