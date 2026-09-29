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
 * SETTLED CONTEXT STACKS. From roads on a card shows more than one upstream
 * commitment -- the block, then the water area -- each on the 'settled' tone,
 * in the order they were decided. Roads adds the first POINT layer (access
 * points) and the first LINE layer (farm tracks); the later steps' cards are
 * expected to draw on these rather than add their own. Trees adds the tree
 * zones, on the second crop's hatch: production's, mirrored, at the same
 * pitch and weight (see CROP_HATCHES), over three settled commitments.
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

/**
 * THE TWO CROPS' HATCH: production and trees, as the map rules them
 * (ProductionHatchPattern.jsx, the `production` and `tree` rows). ONE PITCH
 * AND ONE WEIGHT FOR BOTH -- spacing 8, weight 1 -- and they differ in two
 * things only: colour, which is each rule's class in App.css, and RISE,
 * which is the pattern's angle. Production rises ("/", `rise: 'up'`);
 * trees falls ("\", `rise: 'down'`), production's ruling mirrored.
 *
 * THE PAIRING IS THE POINT. Production and trees are the two things grown on
 * this parcel, and a reader should see one family at a glance and two members
 * of it on inspection. If the two ever differ in pitch or weight as well as
 * in colour and rise, they stop reading as a pair -- so there is one pitch
 * here, not one per crop, and the weight is one rule in App.css that both
 * lines share. It was 7 and 1.5 for production alone, which was not the
 * map's mark; treesCard.test.jsx holds both crops to the map's rows.
 *
 * SPACING HERE IS THE PATTERN'S WIDTH, the distance between rules across the
 * ruling. The map's tile puts its rule on the tile's diagonal, so on the map
 * the same 8 is the tile's side; the scene keeps the rotated single rule it
 * always drew and takes the map's number for it.
 */
export const HATCH_PITCH = 8
export const HATCH_ANGLE = 45

/** Each crop's rise, as the map names it, and the angle it is drawn at. */
export const CROP_HATCHES = Object.freeze({
  production: Object.freeze({ treatment: 'production', rise: 'up', angle: HATCH_ANGLE, line: 'farm-scene__hatch-line' }),
  tree: Object.freeze({ treatment: 'tree', rise: 'down', angle: -HATCH_ANGLE, line: 'farm-scene__tree-line' }),
})

/**
 * A pattern id for one diagram. Every card is its own <svg>, and a url(#id)
 * resolves document-wide, so two diagrams on one page must not share one;
 * useId's colons are not safe inside url(), so they go.
 */
export function useHatchId(prefix = 'farm-hatch') {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
}

/** A tree-hatch id for one diagram; see useHatchId. */
export function useTreeHatchId() {
  return useHatchId('farm-tree-hatch')
}

/**
 * ONE CROP'S HATCH: a single rule per tile, HATCH_PITCH wide, turned to the
 * crop's rise. Its stroke is the rule's class, read from a token in App.css
 * -- the pattern markup names no colour. Goes in the diagram's <defs>, once,
 * before any zone uses it.
 */
function CropHatch({ id, crop }) {
  const { angle, line } = CROP_HATCHES[crop]
  return (
    <pattern
      id={id}
      className={crop === 'production' ? 'farm-scene__hatch' : `farm-scene__hatch farm-scene__hatch--${crop}`}
      width={HATCH_PITCH}
      height={HATCH_PITCH}
      patternUnits="userSpaceOnUse"
      patternTransform={`rotate(${angle})`}
    >
      <line className={line} x1="0" y1="0" x2="0" y2={HATCH_PITCH} />
    </pattern>
  )
}

/** THE PRODUCTION HATCH: the rising rule, in --oxide. */
export function BlockHatch({ id }) {
  return <CropHatch id={id} crop="production" />
}

/** THE TREE HATCH: production's rule, mirrored, in --tree. */
export function TreeHatch({ id }) {
  return <CropHatch id={id} crop="tree" />
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

/* ===========================================================================
   SURVEY AREAS -- the water step's two marks, as the map draws them
   =========================================================================== */

/**
 * TWO KINDS OF MARK, NOT ONE MARK IN TWO VALUES. The map's own decision
 * (ProductionHatchPattern.jsx, zoneMark()): embankment is a `tint`, excavated
 * a `stipple`. The two types sit on the same ground on purpose --
 * `cross_type_overlaps` is the payload's record of it -- and two washes at
 * different values stack into a third, darker one that reads as its own zone,
 * where a dot field over a wash still reads as two. Each mark carries an
 * outline in its own colour, and that is all: no casing, no second value.
 *
 * `mark` on each layer is the map's kind for it, so a card and a test can
 * hold the scene to the map rather than to itself.
 *
 * The two areas overlap deliberately and sit clear of the stream and the
 * woodlot. Do not move them onto the stream: the overlap is the thing a card
 * showing them has to keep legible.
 */
export const SURVEY_AREAS = Object.freeze({
  embankment: Object.freeze({
    treatment: 'survey-embankment',
    mark: 'tint',
    d: 'M 138 172 C 152 160, 178 162, 188 174 C 198 185, 191 201, 172 205 C 152 209, 136 200, 133 187 C 131 179, 132 175, 138 172 Z',
  }),
  excavated: Object.freeze({
    treatment: 'survey-excavated',
    mark: 'stipple',
    d: 'M 172 156 C 188 146, 212 150, 220 164 C 228 178, 219 192, 200 195 C 181 198, 167 188, 164 175 C 162 166, 166 159, 172 156 Z',
  }),
})

/**
 * The dot field's lattice, in scene units: one dot per cell at its centre, a
 * REGULAR grid as stippleTile() lays the map's. The pitch and radius are the
 * scene's own -- a card is a small figure, not a map at zoom -- chosen so a
 * dot is about the map's two pixels across at the card's desktop width and
 * still a dot, not a smudge, at 380px.
 */
export const STIPPLE_PITCH = 3.2
export const STIPPLE_RADIUS = 0.8

/** A dot-field pattern id for one diagram; see useHatchId. */
export function useStippleId() {
  return `farm-stipple-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
}

/**
 * THE DOT FIELD: one dot per tile, centred, so the lattice is regular. Its
 * fill is the dot's class, read from --survey-excavated in App.css -- the
 * pattern markup names no colour -- and there is no ring round a dot: the
 * per-dot casing is what killed the map's previous stipple. Goes in the
 * diagram's <defs>, once, before the excavated layer uses it.
 */
export function SurveyStipple({ id }) {
  const centre = STIPPLE_PITCH / 2
  return (
    <pattern
      id={id}
      className="farm-scene__stipple"
      width={STIPPLE_PITCH}
      height={STIPPLE_PITCH}
      patternUnits="userSpaceOnUse"
    >
      <circle className="farm-scene__stipple-dot" cx={centre} cy={centre} r={STIPPLE_RADIUS} />
    </pattern>
  )
}

/** Embankment: a flat tint in --survey-embankment, outlined in the same. */
export function SceneSurveyEmbankment(props) {
  const { d, mark } = SURVEY_AREAS.embankment
  return (
    <Layer id="survey-embankment" {...props}>
      <path className="farm-scene__survey farm-scene__survey--embankment" data-mark={mark} d={d} />
    </Layer>
  )
}

/**
 * Excavated: the dot field in --survey-excavated, outlined in the same. The
 * pattern is handed to the fill through a custom property, as the hatch is,
 * so the stylesheet stays the one place a fill is set.
 */
export function SceneSurveyExcavated({ stipple, ...props }) {
  const { d, mark } = SURVEY_AREAS.excavated
  return (
    <Layer id="survey-excavated" {...props}>
      <path
        className="farm-scene__survey farm-scene__survey--excavated"
        data-mark={mark}
        d={d}
        style={{ '--farm-stipple': `url(#${stipple})` }}
      />
    </Layer>
  )
}

/* ===========================================================================
   ROADS -- access points and farm tracks, as the map draws them
   =========================================================================== */

/**
 * THE ACCESS POINTS: where a farm road meets the boundary. Both sit ON the
 * parcel's north edge, the run that faces the road -- the first on A to B,
 * the second on B to C -- because the placement tool snaps a click to the
 * boundary line and nowhere else (AccessPointTool).
 */
export const ACCESS_POINTS = Object.freeze(
  [
    ['1', 150, 57],
    ['2', 240, 60],
  ].map(([id, x, y]) => Object.freeze({ id, x, y }))
)

/**
 * THE MARKER'S TWO STATES, as the map has them (App.css, .access-point-marker):
 *
 *   'pending'    placed and not yet generated from: the roads step's draft
 *                point (`roads-pending-access-point`), hollow and dashed.
 *   'generated'  one per candidate network (`roads-access-points`): solid
 *                --ochre, ringed in --halo. Drawn whatever is focused.
 *
 * Two map layers, so two scene layers: a card draws a point pending in one
 * and generated in the other, never one marker restyled.
 */
export const ACCESS_POINT_STATES = Object.freeze(['pending', 'generated'])

/** The marker's radius, in scene units, before its ring. */
export const ACCESS_POINT_RADIUS = 5

/**
 * THE CANDIDATE NETWORKS, one per access point: a trunk from the point into
 * the property and one spur off it. The map draws a network as one line per
 * branch (the backend's wire shape, grouped by `network_id`), so the scene
 * keeps them as branches too.
 *
 * `treatment` is the map's for these lines -- the `road` row of the mark
 * table (ProductionHatchPattern.jsx), read from --road -- so a card and a
 * test can hold the scene to the map rather than to itself.
 *
 * THEY ANSWER TO WHAT IS ALREADY COMMITTED. Network 1 skirts Block 1 rather
 * than crossing it, and both stop short of the committed embankment area:
 * roads come after land and water, and a track drawn through either would
 * contradict the order the whole tool is built on. Do not route them
 * through those shapes.
 */
export const ROAD_NETWORKS = Object.freeze(
  [
    [
      '1',
      '1',
      'M 150 57 C 164 74, 186 82, 196 102 C 204 120, 202 138, 196 152',
      'M 198 130 C 210 140, 218 154, 220 170',
    ],
    [
      '2',
      '2',
      'M 240 60 C 238 88, 232 112, 222 134 C 214 152, 210 166, 208 178',
      'M 224 128 C 234 138, 240 148, 240 158',
    ],
  ].map(([id, accessPoint, main, branch]) =>
    Object.freeze({
      id,
      accessPoint,
      treatment: 'road',
      branches: Object.freeze([
        Object.freeze({ id: 'main', d: main }),
        Object.freeze({ id: 'branch', d: branch }),
      ]),
    })
  )
)

/**
 * THE ACCESS-POINT LAYER, in one state. `points` defaults to both; each may
 * carry a `className` of its own so a card can move one marker without a
 * compound selector. Each marker is tagged with its id (`data-point`) and
 * its state (`data-state`).
 */
export function SceneAccessPoints({ state = 'generated', points = ACCESS_POINTS, ...props }) {
  if (!ACCESS_POINT_STATES.includes(state)) {
    throw new Error(`An access point is ${ACCESS_POINT_STATES.join(' or ')}, not '${state}'.`)
  }
  const id = state === 'pending' ? 'access-points-pending' : 'access-points'
  return (
    <Layer id={id} {...props}>
      {points.map(({ id: pointId, x, y, className }) => (
        <circle
          key={pointId}
          className={[
            'farm-scene__access-point',
            `farm-scene__access-point--${state}`,
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          data-point={pointId}
          data-state={state}
          cx={x}
          cy={y}
          r={ACCESS_POINT_RADIUS}
        />
      ))}
    </Layer>
  )
}

/**
 * THE FARM-TRACK LAYER: every branch of every network given, each network in
 * its own group (`data-network`), each branch a plain stroke -- no casing.
 * `pathLength="1"` normalises every branch, so a card can draw one along its
 * length whatever that length is. A network, or a branch, may carry a
 * `className` of its own, for the reason the access points may.
 */
export function SceneFarmTracks({ networks = ROAD_NETWORKS, ...props }) {
  return (
    <Layer id="tracks" {...props}>
      {networks.map(({ id, treatment, branches, className }) => (
        <g
          key={id}
          className={['farm-scene__network', className].filter(Boolean).join(' ')}
          data-network={id}
          data-treatment={treatment}
        >
          {branches.map((branch) => (
            <path
              key={branch.id}
              className={['farm-scene__track', `farm-scene__track--${branch.id}`, branch.className]
                .filter(Boolean)
                .join(' ')}
              data-branch={branch.id}
              d={branch.d}
              pathLength="1"
            />
          ))}
        </g>
      ))}
    </Layer>
  )
}

/* ===========================================================================
   TREE ZONES -- the trees step's mark, as the map draws it
   =========================================================================== */

/**
 * THE TWO GENERATED TREE ZONES, on the ground the commitments above left.
 *
 * ZONE 1 IS ON BARE GROUND, NOT ON THE WOODLOT: the open strip between the
 * road and the canopy. A tree zone over existing woods reads as the tool
 * describing trees the user already has; beside them it reads as ground
 * proposed for planting, which is what it is. Do not move it onto the canopy.
 *
 * ZONE 2 IS A CRESCENT along the southern margin, wrapping below the
 * committed water area. Neither is a tidy blob: these are the leftover
 * grounds, and their sprawl -- going around the block, the water and the
 * track -- is the KSOP order made visible.
 *
 * `treatment` is the map's for these zones -- the `tree` row of the mark
 * table, a hatch with no outline -- so a card and a test can hold the scene
 * to the map rather than to itself.
 */
export const TREE_ZONES = Object.freeze(
  [
    ['1', 'M 216 74 C 242 66, 272 76, 290 92 C 302 102, 294 114, 276 116 C 256 118, 240 110, 224 104 C 210 98, 206 86, 216 74 Z'],
    ['2', 'M 104 184 C 112 208, 132 228, 158 238 C 184 248, 214 242, 236 228 C 226 236, 200 236, 176 228 C 152 220, 134 206, 124 186 C 118 176, 110 176, 104 184 Z'],
  ].map(([id, d]) => Object.freeze({ id, treatment: 'tree', mark: 'hatch', d }))
)

/**
 * ONE TREE ZONE: ONE shape, the tree hatch and nothing under or around it.
 * Not a block's two stacked shapes -- the map's tree row carries no screen
 * and no outline, and a zone's extent is where the ruling stops. Takes a
 * path (`d`, a generated zone) or corners (`points`, one a person clicked),
 * as Block does, and smooths neither.
 */
export function TreeZone({ hatch, id, d, points, className }) {
  const Shape = points ? 'polygon' : 'path'
  const geometry = points ? { points } : { d }
  return (
    <Shape
      className={['farm-scene__tree-zone', className].filter(Boolean).join(' ')}
      data-zone={id}
      data-treatment="tree"
      data-mark="hatch"
      {...geometry}
      style={{ '--farm-tree-hatch': `url(#${hatch})` }}
    />
  )
}

/**
 * THE TREE-ZONE LAYER: the generated zones by default, each tagged with its
 * id (`data-zone`) and able to carry a `className` of its own, so a card can
 * take one off the map without a compound selector.
 */
export function SceneTreeZones({ hatch, zones = TREE_ZONES, ...props }) {
  return (
    <Layer id="tree-zones" {...props}>
      {zones.map((zone) => (
        <TreeZone key={zone.id} hatch={hatch} {...zone} />
      ))}
    </Layer>
  )
}
