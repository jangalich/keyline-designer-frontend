/**
 * layerStack.js
 *
 * THE STACK, COMPOSED. A pure function of the store plus the wizard's cursor,
 * returning the map's layers in a FIXED z-order that no step can reorder:
 *
 *   0. Basemap            not here -- App.jsx's BasemapControl owns it, and it
 *                         is not any step's layer.
 *   1. Context            server geometry, read-only, subdued. The step's
 *                         eligibility mask lives here, drawn as the
 *                         INELIGIBLE-AREA DIM so the user sees where drawing
 *                         is allowed before they try it.
 *   2. Committed          every committed step's features. Settled styling,
 *                         never editable. A click offers navigation to that
 *                         step and nothing else.
 *   3. Active editable    the cursor step's own layers, and the only band any
 *                         tool can touch.
 *
 * NO STEP ID APPEARS IN THIS FILE, and that is the architectural claim it is
 * here to keep. Everything it needs comes off the layer declarations in
 * stepDefinitions.js -- which band a layer sits in, what its geometry is, and
 * where to read it from. The moment this file has to ask "is this landform"
 * the declaration has failed, and the fix belongs there.
 *
 * THE COMMITTED BAND IS NOT THE CURSOR STEP'S. It is gathered from EVERY step
 * whose status is committed, in `step_order`, so prior steps' work stays on
 * the map while a later step is being edited. That is the one place the stack
 * reads more than the active definition, and it still reads only declarations:
 * a step contributes to this band by declaring a layer with band 'committed'.
 */

import {
  COMMITTED,
  selectDocument,
  selectDraft,
  selectStepFeatures,
  selectStepProposals,
} from '../session/SessionStore'
import { boundaryToLatLngs } from '../session/apiClient'
import { LAYER_BANDS, wizardStepOrder } from '../wizard/stepDefinitions'

/**
 * The z-index each band starts at, and the whole of the ordering.
 *
 * Leaflet's own panes are tilePane 200, overlayPane 400, markerPane 600. All
 * three bands sit between the tiles and the overlay pane, which is what keeps
 * them under the boundary geometry DrawTool renders into overlayPane without
 * anything in DrawTool having to change -- the same trick, and the same
 * reasoning, as ProductionZoneLayers' 350/360/370.
 *
 * Ten per band is a ceiling on how many layers one band can hold before it
 * would reach the next. Ten is not a guess about the future: a band with
 * eleven layers is a step trying to say something the stack cannot draw, and
 * a collision that shows up as a wrong z-order is the right kind of loud.
 */
export const BAND_BASE_Z = Object.freeze({ context: 300, committed: 310, editable: 320 })

/** Bottom to top. Re-exported off the definitions module so there is one list. */
export { LAYER_BANDS }

/**
 * Compose the stack.
 *
 * Returns one entry per layer that RESOLVED TO SOMETHING, plus every editable
 * layer whether it holds anything or not. A context or committed layer whose
 * source is empty -- proposals not fetched, nothing committed yet -- is left
 * out rather than returned with null geometry, so a renderer never has to ask
 * whether a layer is really there. See resolveLayer for why editable is the
 * exception.
 */
export function composeLayerStack({ state, definitions, cursorStepId }) {
  const cursor = definitions.get(cursorStepId) ?? null

  const context = bandOf(state, cursor, 'context')
  const editable = bandOf(state, cursor, 'editable')

  // EVERY committed step, in the document's own order, so a later step's
  // panel still shows the earlier steps' ground beneath it.
  const committed = []
  for (const stepId of wizardStepOrder(state)) {
    const definition = definitions.get(stepId)
    if (!definition) continue
    if (definition.status(state) !== COMMITTED) continue
    committed.push(...bandOf(state, definition, 'committed'))
  }

  return [...context, ...renumber(committed, 'committed'), ...editable]
}

/** One definition's layers in one band, resolved and z-numbered. */
function bandOf(state, definition, band) {
  if (!definition) return []
  const declared = definition.layers.filter((layer) => layer.band === band)
  const resolved = []
  for (const layer of declared) {
    const entry = resolveLayer(state, definition, layer)
    if (entry) resolved.push(entry)
  }
  return renumber(resolved, band)
}

/** Z within a band, in declaration order. See BAND_BASE_Z for the ceiling. */
function renumber(entries, band) {
  return entries.map((entry, index) => ({ ...entry, zIndex: BAND_BASE_Z[band] + index }))
}

/**
 * One declaration, resolved against the store, or null when it holds nothing.
 *
 * THE SWITCH IS OVER THE VOCABULARY, NOT OVER STEPS. Every arm is reachable by
 * more than one step -- or would be, the moment a second step declares the
 * same kind -- which is the test of whether this stayed generic.
 */
export function resolveLayer(state, definition, layer) {
  const stepId = definition.id
  // AN EDITABLE LAYER ALWAYS RESOLVES, EMPTY OR NOT, and that is not a
  // special case -- it is what "editable" means. Context and committed layers
  // exist because they HOLD something; an editable layer exists because the
  // step is being authored, and dropping it while empty would unmount the
  // very tool that puts the first shape in it. A boundary with no points is
  // exactly the state the draw tool exists for.
  const keepEmpty = layer.band === 'editable'
  const base = {
    // The Leaflet pane name, so a layer's pane is findable by the step and
    // layer that declared it. Two dashes rather than a colon because the name
    // becomes a CSS class (`leaflet-<name>-pane`).
    paneName: `${stepId}--${layer.id}`,
    layerId: layer.id,
    // The declaration's own `key` -- which draft input, which payload key --
    // carried through under a name that cannot be mistaken for React's or
    // Leaflet's. A tool writing to `layer.key` and getting a pane name back
    // writes the ring into an input nobody reads, silently.
    sourceKey: layer.key,
    stepId,
    band: layer.band,
    kind: layer.kind,
    source: layer.source,
  }

  if (layer.kind === 'ring') {
    const ring = ringFrom(state, stepId, layer)
    return ring.length || keepEmpty ? { ...base, ring } : null
  }

  if (layer.kind === 'mask') {
    // The geometry names the ELIGIBLE ground; the renderer dims its
    // complement. The inversion is the mask's whole definition and it happens
    // where the geometry is drawn, not here -- this stays a resolver.
    // No `keepEmpty` here: a mask with no geometry is not an empty editable
    // surface, it is a statement about eligibility that has not arrived.
    const geometry = fromProposals(state, stepId, layer)
    return geometry ? { ...base, geometry, parcel: boundaryToLatLngs(selectDocument(state)) } : null
  }

  // 'polygon': a FeatureCollection, or the drawn features of a draft.
  const features = featuresFrom(state, stepId, layer)
  if (!features.length && !keepEmpty) return null

  return {
    ...base,
    features,
    // Only meaningful for a selectable layer; carried for every polygon layer
    // so the renderer has one shape to read rather than two.
    selectedFeatureIds: selectDraft(state, stepId).selectedFeatureIds,
  }
}

/** A ring, from a draft input or from the session's own document. */
function ringFrom(state, stepId, layer) {
  if (layer.source === 'document') return boundaryToLatLngs(selectDocument(state))
  if (layer.source === 'draft') {
    const value = layer.key ? selectDraft(state, stepId).inputs?.[layer.key] : null
    return Array.isArray(value) ? value : []
  }
  return []
}

/** Polygon features, from proposals, from a draft's drawn shapes, or committed. */
function featuresFrom(state, stepId, layer) {
  if (layer.source === 'draft') return selectDraft(state, stepId).drawnFeatures
  if (layer.source === 'document') return collectionFeatures(selectStepFeatures(state, stepId))
  return collectionFeatures(fromProposals(state, stepId, layer))
}

/** The value a proposals-sourced layer declares, or null. */
function fromProposals(state, stepId, layer) {
  if (!layer.key) return null
  return selectStepProposals(state, stepId)?.[layer.key] ?? null
}

/** A FeatureCollection's features, or [] for anything else. */
function collectionFeatures(collection) {
  return Array.isArray(collection?.features) ? collection.features : []
}
