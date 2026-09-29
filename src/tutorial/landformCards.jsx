/**
 * landformCards.jsx  —  THE LANDFORM STEP'S TWO CARDS.
 *
 * One registry entry (stepCards.js) holding two cards, paged with the deck's
 * own row. Both draw the shared farm (farmScene.jsx) with the three
 * suggested blocks on it, hatched as the map hatches them.
 *
 *   1. READ BEFORE YOU CHOOSE. Click a block, click open ground, click a
 *      tab. THE ORDER IS THE POINT: clearing sits between the two
 *      selections, so the panel is seen emptying and refilling rather than
 *      swapping contents while the reader infers that clearing was possible.
 *
 *   2. BUILD THE SET. Draw a block, untick one, commit. The running total
 *      goes UP, then DOWN -- that is what sells the last sentence of the
 *      copy, which is the rule visibleFeatures() (src/map/layers.jsx)
 *      enforces: what is on the map when you commit is what goes in.
 *
 * THE DRAWN BLOCK HAS STRAIGHT EDGES. Suggested blocks are organic because a
 * raster produced them; a drawn one is angular because a person clicked its
 * corners. The card shows the reader what their own drawing will look like,
 * so the two are never normalised to one another.
 *
 * THE COPY IS THE SPEC'S, VERBATIM; landform.test.jsx in this folder asserts
 * it string for string.
 *
 * THE MARKUP IS THE RESTING FRAME, as in every diagram: card one rests with
 * Block 3 read and its panel open, card two with the drawn block in, Block 2
 * out and the total at 3 blocks · 7.4 ac. Under reduced motion that is all
 * there is. Motion lives in App.css ("6. Landform"), one `--loop` per card,
 * every stop a percentage of it.
 *
 * THE WEST STAND IS LEFT OUT (`stand={false}`): Block 1 sits on that corner,
 * and a hatch over three canopies reads as a block drawn over trees, which
 * is not what the suggestions are.
 */

import { Cursor } from './animations.jsx'
import {
  Block,
  BlockHatch,
  FarmScene,
  SCENE_VIEWBOX,
  SUGGESTED_BLOCKS,
  SceneBlocks,
  SceneGround,
  SceneParcel,
  useHatchId,
} from './farmScene.jsx'

export const LANDFORM_READ_TITLE = 'Read before you choose'
export const LANDFORM_READ_BODY =
  'Click a block on the map, or its tab along the bottom, to see more information about its ground. ' +
  'Click open ground to clear it.'

export const LANDFORM_SET_TITLE = 'Build the set'
export const LANDFORM_SET_EMPHASIS = "What's on the map when you commit is what goes into your design."
export const LANDFORM_SET_BODY =
  'Draw your own to add a block to the set. Untick a block and it leaves the map; tick it and it ' +
  `comes back. ${LANDFORM_SET_EMPHASIS}`

/** What each suggested block reads as, by id. */
export const BLOCK_READINGS = Object.freeze({
  1: Object.freeze({ acres: '4.0', score: '42.4', slope: '11.9' }),
  2: Object.freeze({ acres: '2.7' }),
  3: Object.freeze({ acres: '1.9', score: '25.6', slope: '9.4' }),
})

/** The block card two draws: four clicked corners, closed on the first. */
export const DRAWN_CORNERS = Object.freeze(
  [
    [186, 158],
    [226, 152],
    [228, 180],
    [190, 186],
  ].map(([x, y]) => Object.freeze({ x, y }))
)
export const DRAWN_POINTS = DRAWN_CORNERS.map(({ x, y }) => `${x},${y}`).join(' ')
export const DRAWN_ACRES = '1.5'

/** Card two's running total, in the order it reads. */
export const SET_TOTALS = Object.freeze(['3 blocks · 8.6 ac', '4 blocks · 10.1 ac', '3 blocks · 7.4 ac'])

const blockPath = (id) => SUGGESTED_BLOCKS.find((block) => block.id === id).d

/** The land under both cards: ground, the farm, the settled boundary. */
function Land({ hatch }) {
  return (
    <>
      <defs>
        <BlockHatch id={hatch} />
      </defs>
      <SceneGround />
      <FarmScene stand={false} />
      <SceneParcel />
    </>
  )
}

/** A value, then its label: the real detail panel's order. */
function Row({ y, value, label }) {
  return (
    <text x="268" y={y} className="tutorial-anim__reading">
      <tspan className="tutorial-anim__value">{value}</tspan>
      <tspan className="tutorial-anim__label" x="306">
        {label}
      </tspan>
    </text>
  )
}

function PanelBody({ id }) {
  const { score, acres, slope } = BLOCK_READINGS[id]
  return (
    <g className={`tutorial-anim__panel-body tutorial-anim__panel-body--${id}`} data-block={id}>
      <text className="tutorial-anim__name" x="268" y="38">
        Block {id}
      </text>
      <line className="tutorial-anim__rule" x1="268" y1="46" x2="372" y2="46" />
      <Row y={64} value={acres} label="acres" />
      <Row y={82} value={score} label="score" />
      <Row y={100} value={slope} label="slope %" />
    </g>
  )
}

/** Card one's tabs: name, then the acreage. */
const READ_TABS = Object.freeze([
  { id: '1', x: 16 },
  { id: '2', x: 120 },
  { id: '3', x: 224 },
])
const READ_TAB_WIDTH = 96

export function LandformReadAnimation() {
  const hatch = useHatchId()
  return (
    <svg
      className="tutorial-anim tutorial-anim--landform tutorial-anim--landform-read"
      viewBox={SCENE_VIEWBOX}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <Land hatch={hatch} />
      <SceneBlocks hatch={hatch} />

      {/* The block being read: the heavy ink edge. */}
      {['1', '3'].map((id) => (
        <path key={id} className={`tutorial-anim__mark tutorial-anim__mark--landform-${id}`} d={blockPath(id)} />
      ))}

      {/* The three clicks: Block 1, open ground, Block 3's tab. */}
      <circle className="tutorial-anim__pulse tutorial-anim__pulse--read-1" cx="146" cy="116" r="18" />
      <circle className="tutorial-anim__pulse tutorial-anim__pulse--read-2" cx="150" cy="228" r="18" />
      <circle className="tutorial-anim__pulse tutorial-anim__pulse--read-3" cx="268" cy="277" r="18" />

      <g className="tutorial-anim__panel tutorial-anim__panel--landform">
        <rect x="256" y="20" width="128" height="96" rx="1" />
        <PanelBody id="1" />
        <PanelBody id="3" />
      </g>

      <g className="tutorial-anim__tabs">
        {READ_TABS.map(({ id, x }) => (
          <g key={id} className="tutorial-anim__tab" data-block={id}>
            <rect className="tutorial-anim__tab-card" x={x} y="262" width={READ_TAB_WIDTH} height="28" rx="1" />
            <text x={x + 9} y="280">
              <tspan className="tutorial-anim__name">Block {id}</tspan>
              <tspan className="tutorial-anim__value" dx="7">
                {BLOCK_READINGS[id].acres}
              </tspan>
              <tspan className="tutorial-anim__label" dx="3">
                ac
              </tspan>
            </text>
          </g>
        ))}
        {['1', '3'].map((id) => (
          <rect
            key={id}
            className={`tutorial-anim__tab-mark tutorial-anim__tab-mark--landform-${id}`}
            x={READ_TABS.find((tab) => tab.id === id).x}
            y="262"
            width={READ_TAB_WIDTH}
            height="28"
            rx="1"
          />
        ))}
      </g>

      <Cursor modifier="landform-read" />
    </svg>
  )
}

/** Card two's tabs: checkbox, then the name. Block 4 is the drawn one. */
const SET_TABS = Object.freeze([
  { id: '1', x: 16 },
  { id: '2', x: 96 },
  { id: '3', x: 176 },
  { id: '4', x: 256 },
])
const SET_TAB_WIDTH = 76

export function LandformSetAnimation() {
  const hatch = useHatchId()
  const edges = DRAWN_CORNERS.map((from, i) => ({ from, to: DRAWN_CORNERS[(i + 1) % DRAWN_CORNERS.length], n: i + 1 }))
  return (
    <svg
      className="tutorial-anim tutorial-anim--landform tutorial-anim--landform-set"
      viewBox={SCENE_VIEWBOX}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <Land hatch={hatch} />
      <SceneBlocks hatch={hatch} />

      {/* The drawn block: straight edges, because a person clicked them. */}
      <Block hatch={hatch} id="4" points={DRAWN_POINTS} className="tutorial-anim__drawn" />
      {edges.map(({ from, to, n }) => (
        <line
          key={n}
          className={`tutorial-anim__segment tutorial-anim__segment--landform tutorial-anim__segment--set-${n}`}
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          pathLength="1"
        />
      ))}
      {DRAWN_CORNERS.map(({ x, y }, i) => (
        <circle
          key={i}
          className={`tutorial-anim__corner tutorial-anim__corner--landform tutorial-anim__corner--set-${i + 1}`}
          cx={x}
          cy={y}
          r="4"
        />
      ))}

      <g className="tutorial-anim__totals">
        {SET_TOTALS.map((total, i) => (
          <text
            key={total}
            className={`tutorial-anim__value tutorial-anim__total tutorial-anim__total--${i + 1}`}
            x="16"
            y="240"
          >
            {total}
          </text>
        ))}
      </g>

      <g className="tutorial-anim__draw-button">
        <rect x="196" y="222" width="92" height="28" rx="1" />
        <text className="tutorial-anim__button-label" x="242" y="240" textAnchor="middle">
          Draw a block
        </text>
      </g>
      <g className="tutorial-anim__commit-button">
        <rect x="296" y="222" width="92" height="28" rx="1" />
        <text className="tutorial-anim__commit-label" x="342" y="240" textAnchor="middle">
          Commit blocks
        </text>
      </g>

      <g className="tutorial-anim__tabs">
        {SET_TABS.map(({ id, x }) => (
          <g key={id} className={`tutorial-anim__tab tutorial-anim__tab--set-${id}`} data-block={id}>
            <rect className="tutorial-anim__tab-card" x={x} y="262" width={SET_TAB_WIDTH} height="28" rx="1" />
            <rect className="tutorial-anim__check" x={x + 7} y="270" width="11" height="11" rx="1" />
            <path
              className={`tutorial-anim__tick tutorial-anim__tick--set-${id}`}
              d={`M ${x + 9.5} 275.5 L ${x + 12} 278.5 L ${x + 15.5} 272.5`}
            />
            <text className="tutorial-anim__name" x={x + 24} y="280">
              Block {id}
            </text>
          </g>
        ))}
      </g>

      <Cursor modifier="landform-set" />
    </svg>
  )
}

export const LANDFORM_CARD = Object.freeze({
  stepId: 'landform',
  cards: Object.freeze([
    Object.freeze({
      id: 'read',
      title: LANDFORM_READ_TITLE,
      body: LANDFORM_READ_BODY,
      Animation: LandformReadAnimation,
    }),
    Object.freeze({
      id: 'set',
      title: LANDFORM_SET_TITLE,
      body: LANDFORM_SET_BODY,
      emphasis: LANDFORM_SET_EMPHASIS,
      Animation: LandformSetAnimation,
    }),
  ]),
})
