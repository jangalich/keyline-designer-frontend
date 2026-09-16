/**
 * MapLayerStack.jsx
 *
 * THE STACK, ON THE MAP. Rendered inside the MapContainer, above the basemap
 * and below nothing.
 *
 *   1. Basemap             App.jsx's tile layer. Not a step's layer and not
 *                          this component's.
 *   2. Context             read-only server geometry, subdued. Never takes a
 *                          click -- there is nothing to say about it.
 *   3. Committed           every committed step's features. READ-ONLY. It
 *                          takes a click on ONE layer -- the cursor step's
 *                          own -- and none anywhere else. See below.
 *   4. Active editable     the cursor step's own layers, drawn and acted on by
 *                          the tools its definition declares.
 *
 * IT DOES NOT KNOW WHICH STEP IT IS RENDERING. The order above is fixed; the
 * contents come off the layer declarations, and layerStack.js composes them.
 *
 *
 * A COMMITTED LAYER IS NOT A CONTROL, AND THAT IS A DELIBERATE REMOVAL
 *
 * It used to be. A click on committed geometry called the cursor's `open()`,
 * which moved the wizard to the step that owns it, where that step's own
 * reopen affordance was waiting. Nothing about it was unsound -- it never
 * armed a tool, and it offered navigation rather than an edit -- and it is
 * withdrawn anyway, for two reasons that only show up once more than one step
 * has committed.
 *
 * IT IS THE WRONG READING OF THE GESTURE. During water, committed production
 * zones cover much of the parcel. A click that lands on one is far more
 * likely to mean "put this panel away" than "take me back to landform", and
 * answering the second is a step change the user did not ask for.
 *
 * AND IT DOES NOT SCALE. By fencing there are five committed layers blanketing
 * the parcel, every one of them a cursor-moving click target, and the map
 * becomes a surface where most clicks navigate. The step rail already lists
 * every step, already handles the reopen with the confirmation that names
 * what it costs, and is the same size whatever the document holds. One route
 * to that destination is enough, and the rail is the one that keeps working.
 *
 * WHAT DID NOT CHANGE: the reopen itself, its confirmation, and the rail. This
 * removed a route, not a destination.
 *
 *
 * AND THE STEP YOU ARE STANDING ON IS NOT THAT CASE
 *
 * Every sentence above is about a layer belonging to a step the cursor has
 * LEFT. With the cursor ON a committed step, the same geometry is the only
 * thing that step has: there is nowhere for a click to navigate to, because
 * you are already there, and "put this panel away" is answered by the bare
 * map exactly as it is on a live step.
 *
 * SO IT IS THE SAME LAYER IN TWO STATES AND THE CURSOR DECIDES WHICH. The
 * stack says which -- `layer.review`, composed in layerStack.js where the
 * cursor and the owning step are both in hand -- and this file reads that one
 * field. It does NOT re-derive the rule, and it does not learn a second one:
 * `interactive={layer.review}` is the whole of it, and every settled layer
 * that is not the cursor's own carries false, which is every context layer
 * and every committed layer but one.
 *
 * WHAT A REVIEW CLICK DOES is what a click on a live step's feature does --
 * `focusFeature`, the same handler SelectGesture hands the editable band. It
 * marks the feature, activates its tab and opens the detail panel. It arms
 * nothing, moves no cursor and changes no commit; a committed step's decision
 * is fixed until it is reopened, and there is no control here that could
 * suggest otherwise.
 */

import { useMapEvent } from 'react-leaflet'

import { useSession } from '../session/SessionStore'
import { useWizardCursor } from '../wizard/WizardCursor.jsx'
import ProductionHatchPattern from '../ProductionHatchPattern.jsx'
import CautionMarkers from './CautionMarkers.jsx'
import StepTools from './StepTools.jsx'
import { composeLayerStack } from './layerStack.js'
import { StackLayer } from './layers.jsx'

export default function MapLayerStack() {
  const { state } = useSession()
  const { cursorStepId, definition, definitions, focusedFeatureId, focusFeature, blurFeature } =
    useWizardCursor()

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
      {/* THE SETTLED BANDS, WITH ONE FIELD READ AND NO BRANCH ON THE BAND.
          `layer.review` is the stack's answer to "is the cursor standing on
          the step that owns this", and it is false for every context layer
          and for every committed layer but the cursor step's own -- so this
          loop still treats context and committed as one kind of thing. The
          rule is layerStack.js's; see the note above for what it is not. */}
      {settled.map((layer) => (
        <StackLayer
          key={layer.paneName}
          layer={layer}
          interactive={layer.review}
          focusedFeatureId={focusedFeatureId}
          onFeatureClick={(_layer, feature) => focusFeature(feature.id)}
        />
      ))}
      {/* A CLICK ON BARE MAP MEANS "NOTHING, THANKS". It is the only way to
          put the detail panel away, and it has to be the map's own click
          rather than a close button on the panel: the panel is describing
          something on the map, so the map is where the gesture that stops
          describing it belongs. Every feature click stops propagating (see
          FeatureLayer), so this fires only when the click reached nothing. */}
      <BackgroundClick onClick={blurFeature} />
      <StepTools definition={definition} layers={editable} references={references} />
      {/* THE ONE PANE THE BAND SCHEME CANNOT PLACE. Caution markers have to
          sit above Leaflet's markerPane at 600 so a boundary vertex or a
          later step's pin cannot hide a warning, and every band z is below
          400 by design (see BAND_BASE_Z). So this is a top-level pane at 610,
          fed from the same composed stack -- not a step's layer, and not a
          number any step can choose. */}
      <CautionMarkers layers={stack} focusedFeatureId={focusedFeatureId} />
    </>
  )
}

/**
 * The map's own click, and nothing else.
 *
 * Not a component with any opinion about focus -- it is a listener, and what
 * it calls is the caller's. Separate from MapLayerStack only because
 * useMapEvent has to run inside the MapContainer and MapLayerStack already
 * does; keeping it as its own leaf makes the subscription's lifetime obvious.
 */
function BackgroundClick({ onClick }) {
  useMapEvent('click', onClick)
  return null
}
