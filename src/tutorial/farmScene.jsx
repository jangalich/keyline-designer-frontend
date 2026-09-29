/**
 * farmScene.jsx  —  THE ONE FARM EVERY STEP CARD DRAWS ON.
 *
 * The step cards meet a reader in sequence -- boundary, then water, roads,
 * trees, structures -- and they must all show THE SAME LAND. A parcel that
 * changes shape between cards turns each one into a fresh picture to decode
 * instead of the same ground seen again with something new on it. So the
 * geometry lives here, once, and a card never redraws it: it restyles it.
 *
 * GEOMETRY AND LAYERS, NO MOTION. This module exports the coordinates and
 * one component per layer. It holds no timeline and no keyframe: the card
 * that uses the scene owns its own, in App.css, on its own `--loop`.
 *
 * EVERY LAYER STANDS ALONE. Each is its own component, renders its own
 * <g>, and carries both a shared class (`farm-scene__layer`) and its own
 * (`farm-scene__layer--road`, …), so a card can draw any subset, in any
 * order, with its own treatment on each. The water card wants the stream
 * prominent and the rest subdued; the trees card the woodlot. That is a
 * `tone` on the layer, never a second copy of the path.
 *
 * THE FRAME is a 0 0 400 300 viewBox. The coordinates below are the spec's,
 * exactly, and farmScene.test.jsx holds the parcel to its table so a later
 * card cannot quietly move a corner.
 *
 * BLOCKS ARE A LAYER TOO (SceneBlocks), drawn over the land: every step from
 * water on shows them as settled context, so they live here with the rest
 * of the ground rather than in the landform cards.
 *
 * NO COLOUR LIVES HERE. Every fill and stroke is a class in App.css's
 * tutorial section, read from index.css's tokens.
 */

import { useId } from 'react'

/** The frame every step card's scene is drawn in. */
export const SCENE_VIEWBOX = '0 0 400 300'
export const SCENE_WIDTH = 400
export const SCENE_HEIGHT = 300

/**
 * The parcel ring, A to G, in the order a person tracing it clicks. It
 * takes in the road frontage, both banks of the stream and the woodlot --
 * the whole property, which is the boundary card's entire point.
 */
export const PARCEL = Object.freeze(
  [
    ['A', 96, 66],
    ['B', 196, 48],
    ['C', 286, 72],
    ['D', 330, 148],
    ['E', 300, 232],
    ['F', 170, 250],
    ['G', 92, 186],
  ].map(([id, x, y]) => Object.freeze({ id, x, y }))
)

/** The parcel as a closed path, for a fill or an outline. */
export const PARCEL_PATH = `M ${PARCEL.map(({ x, y }) => `${x} ${y}`).join(' L ')} Z`

/** The parcel's edges, each corner to the next, closing G to A. */
export const PARCEL_EDGES = Object.freeze(
  PARCEL.map((from, index) => Object.freeze({ from, to: PARCEL[(index + 1) % PARCEL.length] }))
)

/** The road, running past the north edge and off both sides of the frame. */
export const ROAD_PATH = 'M -20 40 C 90 16, 230 20, 420 52'

/** The stream, entering near D and leaving past F. */
export const STREAM_PATH = 'M 316 92 C 282 128, 268 140, 246 168 S 196 214, 150 246'

/** The woodlot's mass, straddling the stream. */
export const WOODLOT_PATH =
  'M 300 96 C 330 130, 322 176, 296 208 C 268 236, 236 226, 232 196 C 228 166, 262 120, 300 96 Z'

/**
 * Canopies: seven in the woodlot, either side of the stream, and a small
 * stand of three in the parcel's west corner.
 */
export const CANOPIES = Object.freeze(
  [
    [292, 118, 7],
    [308, 140, 6],
    [284, 150, 8],
    [300, 172, 7],
    [272, 182, 6.5],
    [286, 200, 6],
    [252, 196, 5.5],
    [118, 104, 6],
    [106, 122, 5],
    [128, 124, 5.5],
  ].map(([cx, cy, r]) => Object.freeze({ cx, cy, r }))
)

/**
 * The three canopies of the west stand: the last three of CANOPIES, split out
 * so a card whose own marks cover that corner -- landform's Block 1 sits on
 * it -- can leave the stand out without the woodlot being redrawn.
 */
export const WEST_STAND = Object.freeze(CANOPIES.slice(7))
const WOODLOT_CANOPIES = CANOPIES.slice(0, 7)

/** A small building by the road. */
export const BUILDING = Object.freeze({ x: 158, y: 76, width: 18, height: 12 })

/**
 * The feature labels, each set beside the thing it names. ROAD sits left of
 * where the address field lands in a card that shows one, so the two never
 * overlap at the labels' size.
 */
export const LABELS = Object.freeze(
  [
    ['road', 'ROAD', 22, 34],
    ['woods', 'WOODS', 318, 216],
    ['stream', 'STREAM', 186, 268],
  ].map(([id, text, x, y]) => Object.freeze({ id, text, x, y }))
)

/**
 * A layer's group. `tone` is how a card asks for emphasis without restyling
 * the geometry: 'subdued' or 'prominent', or nothing for the plain scene.
 */
function Layer({ id, tone, className, children }) {
  const classes = ['farm-scene__layer', `farm-scene__layer--${id}`]
  if (tone) classes.push(`farm-scene__layer--${tone}`)
  if (className) classes.push(className)
  return (
    <g className={classes.join(' ')} data-layer={id}>
      {children}
    </g>
  )
}

/** The frame's ground: the whole viewBox, under everything. */
export function SceneGround(props) {
  return (
    <Layer id="ground" {...props}>
      <rect className="farm-scene__ground" x="0" y="0" width={SCENE_WIDTH} height={SCENE_HEIGHT} />
    </Layer>
  )
}

/** The road: a band, with its centre line dashed down it. */
export function SceneRoad(props) {
  return (
    <Layer id="road" {...props}>
      <path className="farm-scene__road-band" d={ROAD_PATH} />
      <path className="farm-scene__road-line" d={ROAD_PATH} />
    </Layer>
  )
}

/** Open ground: the parcel's own area, a faint field tint. */
export function SceneOpenGround(props) {
  return (
    <Layer id="open" {...props}>
      <path className="farm-scene__open" d={PARCEL_PATH} />
    </Layer>
  )
}

/** The stream. */
export function SceneStream(props) {
  return (
    <Layer id="stream" {...props}>
      <path className="farm-scene__stream" d={STREAM_PATH} />
    </Layer>
  )
}

function Canopy({ cx, cy, r }) {
  return <circle className="farm-scene__canopy" cx={cx} cy={cy} r={r} />
}

/**
 * The woodlot: its mass and its canopies, the west stand in a group of its
 * own. `stand={false}` leaves the stand out; nothing else moves.
 */
export function SceneWoodlot({ stand = true, ...props }) {
  return (
    <Layer id="woodlot" {...props}>
      <path className="farm-scene__woodmass" d={WOODLOT_PATH} />
      {WOODLOT_CANOPIES.map((canopy) => (
        <Canopy key={`${canopy.cx},${canopy.cy}`} {...canopy} />
      ))}
      {stand ? (
        <g className="farm-scene__stand">
          {WEST_STAND.map((canopy) => (
            <Canopy key={`${canopy.cx},${canopy.cy}`} {...canopy} />
          ))}
        </g>
      ) : null}
    </Layer>
  )
}

/** The building by the road. */
export function SceneBuilding(props) {
  return (
    <Layer id="building" {...props}>
      <rect className="farm-scene__building" {...BUILDING} rx="1" />
    </Layer>
  )
}

/** ROAD, WOODS, STREAM. */
export function SceneLabels(props) {
  return (
    <Layer id="labels" {...props}>
      {LABELS.map(({ id, text, x, y }) => (
        <text key={id} className="farm-scene__label" data-label={id} x={x} y={y}>
          {text}
        </text>
      ))}
    </Layer>
  )
}

/**
 * The land's layers, bottom to top. Ground is not among them: it is the
 * frame's backdrop, and a card that zooms scales the land over it rather
 * than scaling the frame's own edges into view.
 */
export const LAND_LAYERS = Object.freeze([
  Object.freeze({ id: 'road', Layer: SceneRoad }),
  Object.freeze({ id: 'open', Layer: SceneOpenGround }),
  Object.freeze({ id: 'stream', Layer: SceneStream }),
  Object.freeze({ id: 'woodlot', Layer: SceneWoodlot }),
  Object.freeze({ id: 'building', Layer: SceneBuilding }),
  Object.freeze({ id: 'labels', Layer: SceneLabels }),
])

/**
 * The whole land, every layer in order. `tones` maps a layer id to its
 * tone -- `{ stream: 'prominent', woodlot: 'subdued' }` -- and a layer it
 * does not name is drawn plain. `stand={false}` leaves the west stand out.
 */
export function FarmScene({ tones = {}, stand = true }) {
  return (
    <g className="farm-scene">
      {LAND_LAYERS.map(({ id, Layer: LandLayer }) => (
        <LandLayer key={id} tone={tones[id]} {...(id === 'woodlot' ? { stand } : {})} />
      ))}
    </g>
  )
}

/**
 * THE PARCEL, SETTLED: the committed boundary as every step after boundary
 * shows it -- an ink ring and nothing more. The boundary card draws its own
 * ring, corner by corner; this is what that ring becomes once it is agreed.
 * Not among LAND_LAYERS: the land is there before anyone traces it.
 */
export function SceneParcel(props) {
  return (
    <Layer id="parcel" {...props}>
      <path className="farm-scene__parcel" d={PARCEL_PATH} />
    </Layer>
  )
}

/* ===========================================================================
   BLOCKS -- production blocks, as the map draws them
   =========================================================================== */

/**
 * The three suggested blocks, as the landform step generates them: organic,
 * because a raster produced them. They sit on open ground west and north of
 * the stream, clear of the woodlot. Geometry only -- a block's acreage and
 * score are what a card says about it, and live with the card.
 */
export const SUGGESTED_BLOCKS = Object.freeze(
  [
    ['1', 'M 112 104 C 114 86, 140 78, 162 84 C 182 90, 187 118, 178 134 C 170 150, 136 153, 122 142 C 112 134, 110 120, 112 104 Z'],
    ['2', 'M 190 102 C 194 86, 221 83, 237 93 C 251 101, 249 129, 239 141 C 227 155, 199 149, 191 135 C 185 125, 187 112, 190 102 Z'],
    ['3', 'M 122 172 C 124 158, 152 150, 170 158 C 184 164, 185 190, 177 200 C 167 212, 136 211, 126 199 C 120 191, 120 180, 122 172 Z'],
  ].map(([id, d]) => Object.freeze({ id, d }))
)

/** The hatch's pitch, in scene units, and its angle. */
export const HATCH_PITCH = 7
export const HATCH_ANGLE = 45

/**
 * A pattern id for one diagram. Every card is its own <svg>, and a url(#id)
 * resolves document-wide, so two diagrams on one page must not share one;
 * useId's colons are not safe inside url(), so they go.
 */
export function useHatchId() {
  return `farm-hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
}

/**
 * THE HATCH: diagonal rules at 45 degrees, HATCH_PITCH apart. Its stroke is
 * the rule's class, read from a token in App.css -- the pattern markup names
 * no colour. Goes in the diagram's <defs>, once, before any block uses it.
 */
export function BlockHatch({ id }) {
  return (
    <pattern
      id={id}
      className="farm-scene__hatch"
      width={HATCH_PITCH}
      height={HATCH_PITCH}
      patternUnits="userSpaceOnUse"
      patternTransform={`rotate(${HATCH_ANGLE})`}
    >
      <line className="farm-scene__hatch-line" x1="0" y1="0" x2="0" y2={HATCH_PITCH} />
    </pattern>
  )
}

/**
 * ONE BLOCK: two stacked shapes, a green ground wash beneath and the hatch
 * above, as blocks read on the real map. Takes a path (`d`, the organic
 * blocks a raster produced) or corners (`points`, the angular ones a person
 * clicked) and draws whichever it is given without smoothing either.
 *
 * The hatch is handed to the fill through a custom property rather than a
 * fill attribute, so the stylesheet stays the one place a fill is set.
 */
export function Block({ hatch, id, d, points, className }) {
  const Shape = points ? 'polygon' : 'path'
  const geometry = points ? { points } : { d }
  const classes = ['farm-scene__block']
  if (className) classes.push(className)
  return (
    <g className={classes.join(' ')} data-block={id} style={{ '--farm-hatch': `url(#${hatch})` }}>
      <Shape className="farm-scene__block-base" {...geometry} />
      <Shape className="farm-scene__block-hatch" {...geometry} />
    </g>
  )
}

/**
 * THE BLOCK LAYER. The suggested set by default, each block tagged with its
 * id (`data-block`) so a card can move one. `tone` as on every layer:
 * nothing for the step's own treatment, 'settled' for blocks shown as
 * upstream context -- present and hatched but quiet, and not interactive --
 * which is how every later step's card draws them.
 */
export function SceneBlocks({ hatch, blocks = SUGGESTED_BLOCKS, ...props }) {
  return (
    <Layer id="blocks" {...props}>
      {blocks.map((block) => (
        <Block key={block.id} hatch={hatch} {...block} />
      ))}
    </Layer>
  )
}
