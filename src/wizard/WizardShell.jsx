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
 *
 * THE CURSOR IS NOT HELD HERE ANY MORE. It moved to WizardCursorProvider,
 * because the MAP needs the same answer: the panel column and the map's
 * editable band have to be showing one step, and two pieces of state that
 * happen to agree are not one answer. See WizardCursor.jsx -- and see the note
 * on `activeStep` in SessionStore's initialState for why the cursor is not
 * kept in the store at all.
 */

import StepPanel from './StepPanel.jsx'
import { useWizardCursor } from './WizardCursor.jsx'

export default function WizardShell() {
  const { order, definitions, cursorStepId, open } = useWizardCursor()

  return (
    <div className="wizard" data-testid="wizard">
      <ol className="wizard__steps" data-testid="wizard-order">
        {order.map((stepId) => {
          const definition = definitions.get(stepId)
          return (
            <li key={stepId} className="wizard__step" data-step-id={stepId}>
              {definition ? (
                <StepPanel
                  definition={definition}
                  definitions={definitions}
                  isActive={cursorStepId === stepId}
                  onActivate={open}
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
