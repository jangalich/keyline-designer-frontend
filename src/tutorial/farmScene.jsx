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
 * NO COLOUR LIVES HERE. Every fill and stroke is a class in App.css's
 * tutorial section, read from index.css's tokens.
 */

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

/** The woodlot: its mass and its canopies. */
export function SceneWoodlot(props) {
  return (
    <Layer id="woodlot" {...props}>
      <path className="farm-scene__woodmass" d={WOODLOT_PATH} />
      {CANOPIES.map(({ cx, cy, r }) => (
        <circle key={`${cx},${cy}`} className="farm-scene__canopy" cx={cx} cy={cy} r={r} />
      ))}
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
 * does not name is drawn plain.
 */
export function FarmScene({ tones = {} }) {
  return (
    <g className="farm-scene">
      {LAND_LAYERS.map(({ id, Layer: LandLayer }) => (
        <LandLayer key={id} tone={tones[id]} />
      ))}
    </g>
  )
}
