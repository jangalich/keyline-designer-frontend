/**
 * WizardShell.jsx
 *
 * ONE PANEL PER STEP, IN THE ORDER THE DOCUMENT GIVES.
 *
 * THE ORDER COMES OFF `step_order` (wizardStepOrder -> the store's
 * stepOrderFrom), never off `Object.keys(document.steps)`. Flask serialises
 * that object alphabetically -- fencing, landform, roads, structures, trees,
 * water -- so reading the keys would produce six real step ids in a stable
 * order that is not the pipeline's, and every reopen warning built on it would
 * name the wrong steps. Nothing would throw.
 *
 * BEFORE A SESSION EXISTS THE WIZARD IS ONE STEP LONG, and that is the honest
 * length rather than a gap to paper over. The client does not know the
 * pipeline until a document tells it; a hardcoded list here so the shell could
 * show a fuller table of contents would be the second copy of STEP_ORDER that
 * both sides of this codebase refuse to keep.
 *
 * A STEP IN THE ORDER WITH NO DEFINITION IS NAMED, NOT HIDDEN. water through
 * fencing are in every document's `step_order` and have no registry entry in
 * this branch. Dropping them would make the wizard silently shorter than the
 * pipeline; claiming them would mean inventing panels for payloads nobody has
 * seen. So they appear, in order, saying what they are.
 */

import { useCallback, useMemo, useState } from 'react'

import { COMMITTED, selectStepStatus, useSession } from '../session/SessionStore'
import StepPanel from './StepPanel.jsx'
import { STEP_DEFINITIONS, definitionMap, wizardStepOrder } from './stepDefinitions'

export default function WizardShell({ definitions = STEP_DEFINITIONS }) {
  const { state } = useSession()
  const registry = useMemo(() => definitionMap(definitions), [definitions])
  const order = wizardStepOrder(state)

  /**
   * WHICH PANEL IS OPEN.
   *
   * Held here rather than in the store, and the reason is boundary. The
   * store's `activeStep` is validated against the DOCUMENT's step order --
   * hydrate() nulls it for an id that is not in `step_order` -- and boundary
   * is deliberately not in it. Putting the wizard's cursor there would mean
   * the store dropping it the moment the session it just created arrived.
   *
   * `null` means "no explicit choice", and the fallback is derived rather than
   * remembered: the first step that is not committed. So creating a session
   * moves the wizard on to landform without anything having to say so, and a
   * resume opens exactly where the document says the user left off.
   */
  const [openStep, setOpenStep] = useState(null)

  const firstUncommitted =
    order.find((stepId) => {
      const definition = registry.get(stepId)
      const status = definition ? definition.status(state) : selectStepStatus(state, stepId)
      return status !== COMMITTED
    }) ?? order[order.length - 1]

  const activeStep = openStep && order.includes(openStep) ? openStep : firstUncommitted
  const activate = useCallback((stepId) => setOpenStep(stepId), [])

  return (
    <div className="wizard" data-testid="wizard">
      <ol className="wizard__steps" data-testid="wizard-order">
        {order.map((stepId) => {
          const definition = registry.get(stepId)
          return (
            <li key={stepId} className="wizard__step" data-step-id={stepId}>
              {definition ? (
                <StepPanel
                  definition={definition}
                  definitions={registry}
                  isActive={activeStep === stepId}
                  onActivate={activate}
                />
              ) : (
                <section
                  className="step-panel step-panel--unregistered"
                  data-testid={`step-${stepId}`}
                  data-step-state="unregistered"
                >
                  <h3 className="step-panel__title">{stepId}</h3>
                  <p className="step-panel__line" data-testid={`unregistered-${stepId}`}>
                    This step is in the pipeline but is not built yet.
                  </p>
                </section>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
