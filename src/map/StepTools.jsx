/**
 * StepTools.jsx
 *
 * THE ARMING, MADE OF COMPONENTS. A step's `tools[]` is the whole input: the
 * tools it declares mount, the tools it does not declare do not exist on this
 * map, and there is no flag anywhere saying which is which.
 *
 * THREE VERBS, AND THERE IS NO FOURTH. select | draw | delete, from
 * SessionStore's STEP_MODES. No `adjust`: generated candidates are select-only
 * -- design_document.py's PROVENANCE_VALUES has no value for a user-modified
 * generated feature -- and a drawn shape is deleted and redrawn.
 *
 * WHY THIS IS NOT ONE GENERALISED TOOL. DrawTool is coupled to the boundary in
 * four ways ZoneDrawTool.jsx already sets out at length: a module-level colour
 * memo that cannot serve two callers, an `isFinished` path that makes every
 * vertex draggable, a render into Leaflet's default overlayPane, and a
 * map-level click listener. What the two genuinely share is the GESTURE, and
 * that is already extracted -- geo.js's vertexAtPixel(), which both call and
 * which behaves identically for both. So this file mounts parallel components
 * rather than parameterising one, and the declaration picks between them.
 *
 * WHERE THE THIRD TOOL WOULD ATTACH. A free point marker -- the structures
 * step's "put a building here", which is a click that places one coordinate
 * rather than a ring -- is NOT in this branch. It attaches in exactly two
 * places and nowhere else: a `kind: 'point'` in stepDefinitions' LAYER_KINDS
 * with a renderer beside RingLayer in layers.jsx, and a row in RENDERED_BY
 * below saying that `draw` over a point layer is served by a PointDrawTool.
 * Nothing else in this file, in layerStack.js, or in the machine would change
 * -- which is the test of whether the declaration is carrying its weight.
 */

import { STEP_MODES } from '../session/SessionStore'
import { useWizardCursor } from '../wizard/WizardCursor.jsx'
import DeleteGesture from './tools/DeleteGesture.jsx'
import DrawGesture from './tools/DrawGesture.jsx'
import SelectGesture from './tools/SelectGesture.jsx'

/**
 * The gesture behind each verb. Keyed by the SAME vocabulary the definitions
 * declare, so a definition naming a tool with no entry here is a build that
 * cannot serve its own declaration -- asserted in the tests rather than
 * discovered on a map.
 */
export const TOOL_GESTURES = Object.freeze({
  select: SelectGesture,
  draw: DrawGesture,
  delete: DeleteGesture,
})

/**
 * Which layers each verb can act on, BY THE LAYER'S OWN VOCABULARY.
 *
 * Not by step, and not by layer id. `select` acts on candidates the server
 * proposed; `draw` and `delete` act on whatever the user is authoring, which
 * is a ring in a draft input or the draft's own drawn features.
 */
const CLAIMS = {
  select: (layer) => layer.source === 'proposals',
  draw: (layer) => layer.kind === 'ring' || layer.source === 'draft',
  delete: (layer) => layer.kind === 'ring' || layer.source === 'draft',
}

/**
 * WHO DRAWS THE SETTLED GEOMETRY of an editable layer -- the first of the
 * step's declared tools, in this order, that claims it.
 *
 * EXACTLY ONE RENDERER PER LAYER, or the same features paint twice and the
 * translucent fills double exactly where they overlap. The stack itself never
 * draws the editable band: an editable layer belongs to whichever tool is
 * editing it, and a layer no declared tool renders is a step whose `tools[]`
 * and `layers[]` disagree -- reported below rather than silently blank.
 *
 * The order is a precedence, not a preference. A ring goes to `draw` because
 * DrawTool draws the ring AND places its vertices in one component; falling
 * through to `delete` covers a step that declares a ring it can only clear.
 * A drawn-feature layer goes to `delete` because the settled shapes are what
 * delete acts on, while `draw` only ever renders the vertices going down.
 */
const RENDERED_BY = {
  ring: ['draw', 'delete'],
  polygon: ['delete', 'draw'],
  proposalPolygon: ['select'],
}

function rendererFor(layer, tools) {
  const order =
    layer.source === 'proposals' ? RENDERED_BY.proposalPolygon : RENDERED_BY[layer.kind] ?? []
  return order.find((tool) => tools.includes(tool)) ?? null
}

/**
 * Mount the cursor step's tools over its editable layers.
 *
 * `gestures` is injectable so a test can assert WHAT MOUNTED rather than what
 * a flag said, with a stand-in for all three verbs at once -- the selection
 * being tested is this component's, and the leaves it picks are the real
 * registry's by default.
 */
export default function StepTools({
  definition,
  layers,
  references = EMPTY_REFERENCES,
  gestures = TOOL_GESTURES,
}) {
  const { armed } = useWizardCursor()
  if (!definition) return null

  const tools = definition.tools
  const mounts = []

  for (const tool of tools) {
    const Gesture = gestures[tool]
    const claims = CLAIMS[tool]
    if (!Gesture || !claims) {
      // A declared verb this build has no gesture for. Loud in DEV, because
      // the panel will offer it and the map will not answer.
      if (import.meta.env.DEV) {
        console.warn(
          `Step '${definition.id}' declares the '${tool}' tool, which is not one ` +
            `of ${STEP_MODES.join(', ')} or has no gesture behind it.`
        )
      }
      continue
    }

    const targets = layers.filter(claims)
    if (!targets.length && import.meta.env.DEV) {
      console.warn(
        `Step '${definition.id}' declares the '${tool}' tool but no layer it can ` +
          `act on. That is the layer declaration failing, not the tool's problem.`
      )
    }

    for (const layer of targets) {
      mounts.push({
        id: `${tool}:${layer.paneName}`,
        tool,
        layer,
        Gesture,
        armed: armed === tool,
        // Whether THIS mount owns the layer's settled geometry, or is only
        // adding a gesture over someone else's.
        renders: rendererFor(layer, tools) === tool,
      })
    }
  }

  for (const layer of layers) {
    if (rendererFor(layer, tools) === null && import.meta.env.DEV) {
      console.warn(
        `Step '${definition.id}' declares layer '${layer.layerId}' but none of its ` +
          `tools (${tools.join(', ') || 'none'}) renders a ${layer.kind}. It will not ` +
          `appear on the map.`
      )
    }
  }

  return (
    <>
      {/* THE MOUNT RECORD. One node per tool actually mounted, so "exactly the
          declared tools mount" is a fact about the document rather than about
          a boolean somewhere. It also carries which one is live, which is the
          only place assistive tech can read the map's current mode from. */}
      <div className="map-tools" data-testid="mounted-tools">
        {mounts.map((mount) => (
          <span
            key={`mark:${mount.id}`}
            hidden
            className="map-tools__mount"
            data-testid={`tool-${mount.tool}`}
            data-tool={mount.tool}
            data-layer={mount.layer.layerId}
            data-armed={mount.armed ? 'true' : 'false'}
          />
        ))}
        <p className="visually-hidden" role="status" data-testid="armed-tool">
          {armed ? ARMED_LINES[armed] : 'No map tool is active.'}
        </p>
      </div>
      {mounts.map(({ id, Gesture, tool, layer, armed: isArmed, renders }) => (
        <Gesture
          key={id}
          tool={tool}
          layer={layer}
          armed={isArmed}
          renders={renders}
          stepId={layer.stepId}
          // The definition, so a gesture can read the step's own `shape`
          // rules rather than carrying a copy of them (see DrawGesture), and
          // the resolved reference layers those rules read. Both are the
          // DECLARATION reaching the tool, which is the only channel by which
          // a step tells a generic gesture anything.
          definition={definition}
          references={references}
        />
      ))}
    </>
  )
}

const EMPTY_REFERENCES = Object.freeze({})

const ARMED_LINES = {
  select: 'Selecting: click a proposal to include or exclude it.',
  draw: 'Drawing: click the map to place points, and the first point to close.',
  delete: 'Deleting: click a shape you drew to remove it.',
}
