/**
 * StepPanel.jsx
 *
 * THE FRAME EVERY STEP IS RENDERED IN -- written once, because the machine is
 * one machine (see useStepMachine.js). The header, the state line, the two
 * buttons, the error surfaces, the collapsed form and the reopen confirmation
 * are all here; a step's own definition supplies only its `Panel`, and a Panel
 * that starts reproducing any of this is the schema failing.
 *
 * WHAT THE FRAME REFUSES TO DO:
 *
 *   It does not offer a generate on an unreachable step. An unreachable step
 *   SAYS WHY, naming the step in the way -- a disabled button teaches nothing,
 *   and an enabled one buys a 409 that says the same thing a round trip later.
 *
 *   It does not collapse a 422 into a banner. The count is a summary; the
 *   reasons stay attached to their feature ids, which is what lets the step's
 *   own panel (and, from F3, the map layer) address them one at a time.
 *
 *   It does not reopen without naming the cost, and the names come from the
 *   store's selectStepsResetByReopen -- the downstream steps that actually
 *   HOLD work, never the full downstream list.
 */

import {
  COMMITTING,
  EDITING,
  GENERATING,
  IDLE,
  REVIEWING,
  STEP_COMMITTED,
  useStepMachine,
} from './useStepMachine'

const STATE_LINES = {
  [IDLE]: 'Not started.',
  [GENERATING]: 'Generating…',
  [REVIEWING]: 'Review the proposals.',
  [EDITING]: 'Unsaved changes.',
  [COMMITTING]: 'Saving…',
  [STEP_COMMITTED]: 'Committed.',
}

/** A step id as a person reads it, from its definition when we have one. */
function titleFor(stepId, definitions) {
  return definitions?.get(stepId)?.title ?? stepId
}

export default function StepPanel({ definition, definitions, isActive, onActivate }) {
  const machine = useStepMachine(definition)
  const {
    machineState,
    reachable,
    blockedBy,
    error,
    rejections,
    rejectedFeatureIds,
    failedLayer,
    canGenerate,
    canCommit,
    canReopen,
    commitLabel,
    commitBlockedReason,
    confirmingReopen,
    stepsResetByReopen,
    generate,
    commit,
    requestReopen,
    cancelReopen,
    confirmReopen,
  } = machine

  const collapsed = machineState === STEP_COMMITTED && !isActive
  const Panel = definition.Panel

  return (
    <section
      className={`step-panel step-panel--${machineState}${collapsed ? ' step-panel--collapsed' : ''}`}
      data-testid={`step-${definition.id}`}
      data-step-state={machineState}
      data-collapsed={collapsed ? 'true' : 'false'}
      aria-labelledby={`step-${definition.id}-title`}
    >
      <header className="step-panel__header">
        <h3 id={`step-${definition.id}-title`} className="step-panel__title">
          {definition.title}
        </h3>
        <p className="step-panel__state" data-testid={`state-${definition.id}`}>
          {STATE_LINES[machineState]}
        </p>
      </header>

      {/* A COMMITTED STEP COLLAPSES. What survives the collapse is the one
          affordance that reopens it -- and only when the definition declares a
          reopen. A step whose definition names none says why instead of
          showing a button it would have to explain away. */}
      {collapsed ? (
        <div className="step-panel__collapsed">
          {canReopen ? (
            <button
              type="button"
              className="step-panel__edit"
              data-testid={`edit-${definition.id}`}
              onClick={requestReopen}
            >
              {definition.reopen.label}
            </button>
          ) : (
            <p className="step-panel__line" data-testid={`no-reopen-${definition.id}`}>
              {definition.committedNote ?? 'This step cannot be reopened.'}
            </p>
          )}
          {isActive ? null : (
            <button
              type="button"
              className="step-panel__expand"
              data-testid={`expand-${definition.id}`}
              onClick={() => onActivate?.(definition.id)}
            >
              Show
            </button>
          )}
        </div>
      ) : null}

      {/* AN UNREACHABLE STEP EXPLAINS ITSELF. No generate button, disabled or
          otherwise: the answer to "why can I not do this" is a sentence
          naming the step that has to happen first. */}
      {!reachable ? (
        <p className="step-panel__blocked" data-testid={`blocked-${definition.id}`}>
          {blockedBy
            ? `Commit ${titleFor(blockedBy, definitions)} before starting this step.`
            : 'An earlier step has to be committed before this one can start.'}
        </p>
      ) : null}

      {!collapsed && reachable ? (
        <>
          {machineState === IDLE ? (
            <p className="step-panel__line">{definition.blurb}</p>
          ) : null}

          {Panel ? <Panel machine={machine} /> : null}

          {/* A FAILED GENERATE, BY LAYER. `failed_layer` is {type, label} --
              branch on the type, show the label. Same shape the spike's panel
              already reads, deliberately, so that code does not fork. */}
          {failedLayer ? (
            <p className="step-panel__failure" data-testid={`failed-layer-${definition.id}`}>
              Could not generate: the {failedLayer.label} data for this parcel is
              incomplete.
            </p>
          ) : null}

          {/* 422. The count is the summary; the reasons stay per feature. */}
          {rejectedFeatureIds.length ? (
            <div className="step-panel__rejections" data-testid={`rejections-${definition.id}`}>
              <p className="step-panel__line">
                {rejectedFeatureIds.length} feature
                {rejectedFeatureIds.length === 1 ? '' : 's'} could not be committed.
              </p>
              <ul>
                {rejectedFeatureIds.map((featureId) => (
                  <li key={featureId} data-testid={`rejection-row-${featureId}`}>
                    <span data-testid={`rejection-id-${featureId}`}>{featureId}</span>
                    {': '}
                    <span data-testid={`rejection-reason-${featureId}`}>
                      {rejections[featureId].reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {error && error.kind !== 'rejected' ? (
            <p className="step-panel__error" data-testid={`error-${definition.id}`}>
              {error.message}
            </p>
          ) : null}

          <div className="step-panel__actions">
            {definition.generate ? (
              <button
                type="button"
                data-testid={`generate-${definition.id}`}
                disabled={!canGenerate}
                onClick={generate}
              >
                {definition.generate.label}
              </button>
            ) : null}

              {/* A COMMITTED STEP THAT IS OPEN STILL OFFERS ITS REOPEN. It
                used to appear only in the collapsed form, which was fine while
                the only way to open a committed step was to expand it by hand.
                A click on its geometry in the map's committed band opens it
                too -- and an opened step with no affordance would be a
                navigation that arrived nowhere. Same button, same testid: only
                one of the two branches renders at a time. */}
            {machineState === STEP_COMMITTED ? (
              canReopen ? (
                <button
                  type="button"
                  className="step-panel__edit"
                  data-testid={`edit-${definition.id}`}
                  onClick={requestReopen}
                >
                  {definition.reopen.label}
                </button>
              ) : (
                <p className="step-panel__line" data-testid={`no-reopen-${definition.id}`}>
                  {definition.committedNote ?? 'This step cannot be reopened.'}
                </p>
              )
            ) : (
              <button
                type="button"
                data-testid={`commit-${definition.id}`}
                disabled={!canCommit}
                onClick={commit}
                title={commitBlockedReason ?? undefined}
              >
                {commitLabel}
              </button>
            )}
          </div>
        </>
      ) : null}

      {/* THE CONFIRMATION NAMES EXACTLY WHAT IT COSTS. Not the full downstream
          list -- only the steps holding work, because naming steps the user
          has never reached reads as a threat to work that does not exist and
          trains them to click through the warning that will one day be real. */}
      {confirmingReopen ? (
        <div
          className="step-panel__confirm"
          role="dialog"
          aria-modal="true"
          data-testid={`reopen-confirm-${definition.id}`}
        >
          <p data-testid={`reopen-confirm-title-${definition.id}`}>
            {definition.reopen?.confirmTitle ?? `Reopen ${definition.title}?`}
          </p>
          {stepsResetByReopen.length ? (
            <p data-testid={`reopen-resets-${definition.id}`}>
              This will discard the work in{' '}
              {stepsResetByReopen.map((id) => titleFor(id, definitions)).join(', ')}.
            </p>
          ) : (
            <p data-testid={`reopen-resets-${definition.id}`}>
              No later step holds work yet, so nothing else will be discarded.
            </p>
          )}
          <ul data-testid={`reopen-reset-list-${definition.id}`}>
            {stepsResetByReopen.map((id) => (
              <li key={id} data-testid={`reopen-reset-${id}`}>
                {titleFor(id, definitions)}
              </li>
            ))}
          </ul>
          <button
            type="button"
            data-testid={`reopen-confirm-yes-${definition.id}`}
            onClick={confirmReopen}
          >
            Reopen this step
          </button>
          <button
            type="button"
            data-testid={`reopen-confirm-no-${definition.id}`}
            onClick={cancelReopen}
          >
            Keep it as it is
          </button>
        </div>
      ) : null}
    </section>
  )
}
