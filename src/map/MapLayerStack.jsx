/**
 * MapLayerStack.jsx
 *
 * THE STACK, ON THE MAP. Rendered inside the MapContainer, above the basemap
 * and below nothing.
 *
 *   1. Basemap             App.jsx's BasemapControl. Not a step's layer and
 *                          not this component's.
 *   2. Context             read-only server geometry, subdued. Never takes a
 *                          click -- there is nothing to say about it.
 *   3. Committed           every committed step's features. A click OFFERS
 *                          NAVIGATION to the step that owns them, and does
 *                          nothing else. See below.
 *   4. Active editable     the cursor step's own layers, drawn and acted on by
 *                          the tools its definition declares.
 *
 * IT DOES NOT KNOW WHICH STEP IT IS RENDERING. The order above is fixed; the
 * contents come off the layer declarations, and layerStack.js composes them.
 *
 * A COMMITTED LAYER'S CLICK DOES NOT ENTER AN EDIT MODE, and cannot. It calls
 * the cursor's `open()` -- which moves the panel column to that step, where
 * whatever affordance the step's own definition declares is waiting (an "Edit
 * this step" that names what a reopen costs, or, for the boundary, a note
 * saying it cannot be reopened at all). It never touches the arming slot, so
 * there is no path from clicking settled geometry to a live tool. Committing
 * and then clicking your own work should offer to take you back to it; it
 * should not silently hand you a pencil.
 */

import { useSession } from '../session/SessionStore'
import { useWizardCursor } from '../wizard/WizardCursor.jsx'
import ProductionHatchPattern from '../ProductionHatchPattern.jsx'
import CautionMarkers from './CautionMarkers.jsx'
import StepTools from './StepTools.jsx'
import { composeLayerStack } from './layerStack.js'
import { StackLayer } from './layers.jsx'

export default function MapLayerStack() {
  const { state } = useSession()
  const { cursorStepId, definition, definitions, open } = useWizardCursor()

  const stack = composeLayerStack({ state, definitions, cursorStepId })

  // Split rather than filtered twice: the editable band is not drawn here at
  // all -- it belongs to the tools -- and the split is where that is said.
  const settled = stack.filter((layer) => layer.band !== 'editable')
  const editable = stack.filter((layer) => layer.band === 'editable')

  // THE REFERENCE LAYERS, KEYED BY THEIR OWN DECLARED ID, handed to the tools.
  // A reference layer is data a tool consumes and nothing paints (see
  // LAYER_KINDS), so this is the whole of what it is for: the step declared
  // it, the stack resolved it off the payload, and the step's own rules read
  // it back by the id they declared it under.
  const references = Object.fromEntries(
    stack.filter((layer) => layer.kind === 'reference').map((layer) => [layer.layerId, layer.data])
  )

  return (
    <>
      {/* The hatch pattern's <defs>, once, on the map container rather than in
          any pane -- Leaflet creates and destroys a pane's own <svg> as layers
          come and go, and two panes reference this one pattern. See
          ProductionHatchPattern for both reasons at length. */}
      <ProductionHatchPattern />
      {settled.map((layer) => (
        <StackLayer
          key={layer.paneName}
          layer={layer}
          interactive={layer.band === 'committed'}
          onLayerClick={() => open(layer.stepId)}
        />
      ))}
      <StepTools definition={definition} layers={editable} references={references} />
      {/* THE ONE PANE THE BAND SCHEME CANNOT PLACE. Caution markers have to
          sit above Leaflet's markerPane at 600 so a boundary vertex or a
          later step's pin cannot hide a warning, and every band z is below
          400 by design (see BAND_BASE_Z). So this is a top-level pane at 610,
          fed from the same composed stack -- not a step's layer, and not a
          number any step can choose. */}
      <CautionMarkers layers={stack} />
    </>
  )
}
