/**
 * treesCard.jsx  —  THE TREES STEP'S CARD.
 *
 * One card over the shared farm (farmScene.jsx): two tree zones on the
 * ground the earlier commitments left, a windbreak drawn by hand, one zone
 * unticked, commit. No new gesture -- this is landform's draw-your-own and
 * the tab's checkbox, on the second crop.
 *
 * THE ANIMATION, one loop on one `--loop` (App.css, "9. Trees"):
 *
 *   1. Two tree zones on marginal ground, two ticked tabs, and the three
 *      settled commitments beneath: the production block, the water area,
 *      and the committed road network with its access point.
 *   2. The cursor presses "Draw a zone", clicks four corners along the north
 *      boundary, and closes on the first.
 *   3. The windbreak fills, and a third ticked tab arrives.
 *   4. The cursor unticks Zone 2: it leaves the map and its tab dims.
 *   5. The cursor presses "Commit tree zones".
 *
 * THE WINDBREAK HAS STRAIGHT EDGES against the generated zones' organic
 * ones, as the drawn block does on landform and for the same reason -- a
 * person clicked it -- and here it also shows that a tree zone can be put
 * somewhere on purpose, not only accepted from what was left over.
 *
 * THE SETTLED STACK IS THE FULLEST IT GETS BEFORE STRUCTURES: the block
 * (landform), the water area (water), the network and its marker (roads),
 * each on the scene's 'settled' tone, in the order they were decided. The
 * tree zones go around all of them.
 *
 * TWO RULES THE TIMELINE KEEPS. A drawn edge never unwinds: its dash offset
 * falls once and is pinned at 0 to the end of the loop. And oxide is the
 * click and the commit button only, from the shared rules -- the tree mark is
 * --tree, and it is ground, not an accent.
 *
 * THE BANNER AND THE TABS SAY WHAT THE REAL STEP DOES: TREES_STEP's
 * reviewing pair is "Draw a zone" beside "Commit tree zones", and a zone the
 * user draws is tabbed "Drawn 1" after the generated "Zone 1" and "Zone 2".
 *
 * THE MARKUP IS THE RESTING FRAME: the windbreak drawn and ticked, Zone 2
 * off the map with its tab dimmed and unticked. Under reduced motion that is
 * all there is.
 *
 * THE COPY IS THE SPEC'S, VERBATIM; treesCard.test.jsx asserts it. No
 * clause is set in weight: the body is one short sentence.
 */

import { Cursor } from './animations.jsx'
import {
  ACCESS_POINTS,
  BlockHatch,
  FarmScene,
  ROAD_NETWORKS,
  SCENE_VIEWBOX,
  SUGGESTED_BLOCKS,
  SceneAccessPoints,
  SceneBlocks,
  SceneFarmTracks,
  SceneGround,
  SceneParcel,
  SceneSurveyEmbankment,
  SceneTreeZones,
  TREE_ZONES,
  TreeHatch,
  TreeZone,
  useHatchId,
  useTreeHatchId,
} from './farmScene.jsx'

export const TREES_TITLE = 'Marginal areas for tree crops'
export const TREES_BODY = "Draw your own to add one, untick any you don't want, then commit."

/** The real step's labels, as its banner prints them. */
export const TREES_LABELS = Object.freeze({
  draw: 'Draw a zone',
  commit: 'Commit tree zones',
})

/** The settled context, in the order it was decided. */
export const TREES_BLOCKS = Object.freeze(SUGGESTED_BLOCKS.filter((block) => block.id === '1'))
export const TREES_NETWORKS = Object.freeze(ROAD_NETWORKS.filter((network) => network.id === '1'))
export const TREES_ACCESS_POINTS = Object.freeze(ACCESS_POINTS.filter((point) => point.id === '1'))

/** The windbreak: four clicked corners along the north boundary, closed on the first. */
export const WINDBREAK_CORNERS = Object.freeze(
  [
    [100, 74],
    [144, 65],
    [147, 78],
    [103, 87],
  ].map(([x, y]) => Object.freeze({ x, y }))
)
export const WINDBREAK_POINTS = WINDBREAK_CORNERS.map(({ x, y }) => `${x},${y}`).join(' ')

/** The tabs: the two generated zones, then the drawn one, as TREES_STEP.tabs names them. */
export const TREES_TABS = Object.freeze(
  [
    ['1', 'Zone 1'],
    ['2', 'Zone 2'],
    ['drawn-1', 'Drawn 1'],
  ].map(([id, name], index) => Object.freeze({ id, name, x: 16 + index * 80, width: 76 }))
)

/**
 * The banner, right-aligned as the real one is: primary on the right. Each
 * button is as narrow as its label allows, because Zone 2's crescent runs
 * under the banner's left end and it is the zone the reader watches leave.
 */
export const BANNER = Object.freeze({
  y: 222,
  height: 28,
  draw: Object.freeze({ x: 188, width: 82 }),
  commit: Object.freeze({ x: 276, width: 112 }),
})

/** Where the untick lands: the centre of Zone 2's checkbox. */
export const UNTICK_CLICK = Object.freeze({ x: TREES_TABS[1].x + 12.5, y: 275.5 })

function Button({ slot, label, tone }) {
  const primary = tone === 'primary'
  const group = primary ? 'tutorial-anim__commit-button' : 'tutorial-anim__draw-button'
  const text = primary ? 'tutorial-anim__commit-label' : 'tutorial-anim__button-label'
  return (
    <g className={`${group} ${group}--trees`}>
      <rect x={slot.x} y={BANNER.y} width={slot.width} height={BANNER.height} rx="1" />
      <text className={text} x={slot.x + slot.width / 2} y={BANNER.y + 18} textAnchor="middle">
        {label}
      </text>
    </g>
  )
}

export function TreesAnimation() {
  const hatch = useHatchId()
  const treeHatch = useTreeHatchId()
  const zones = TREE_ZONES.map((zone) => ({ ...zone, className: `tutorial-anim__zone--trees-${zone.id}` }))
  const edges = WINDBREAK_CORNERS.map((from, i) => ({
    from,
    to: WINDBREAK_CORNERS[(i + 1) % WINDBREAK_CORNERS.length],
    n: i + 1,
  }))
  return (
    <svg
      className="tutorial-anim tutorial-anim--trees"
      viewBox={SCENE_VIEWBOX}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <BlockHatch id={hatch} />
        <TreeHatch id={treeHatch} />
      </defs>
      <SceneGround />
      <FarmScene stand={false} />
      <SceneParcel />

      {/* THE SETTLED STACK, in the order it was decided: land, water, roads. */}
      <SceneBlocks hatch={hatch} blocks={TREES_BLOCKS} tone="settled" />
      <SceneSurveyEmbankment tone="settled" />
      <SceneFarmTracks networks={TREES_NETWORKS} tone="settled" />
      <SceneAccessPoints state="generated" points={TREES_ACCESS_POINTS} tone="settled" />

      {/* The generated zones, on what was left. */}
      <SceneTreeZones hatch={treeHatch} zones={zones} />

      {/* The windbreak: straight edges, because a person clicked them. */}
      <TreeZone hatch={treeHatch} id="drawn-1" points={WINDBREAK_POINTS} className="tutorial-anim__windbreak" />
      {edges.map(({ from, to, n }) => (
        <line
          key={n}
          className={`tutorial-anim__segment tutorial-anim__segment--trees tutorial-anim__segment--trees-${n}`}
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          pathLength="1"
        />
      ))}
      {WINDBREAK_CORNERS.map(({ x, y }, i) => (
        <circle
          key={i}
          className={`tutorial-anim__corner tutorial-anim__corner--trees tutorial-anim__corner--trees-${i + 1}`}
          cx={x}
          cy={y}
          r="4"
        />
      ))}

      {/* The one click that is not a button or a corner: Zone 2's checkbox. */}
      <circle className="tutorial-anim__pulse tutorial-anim__pulse--trees" cx={UNTICK_CLICK.x} cy={UNTICK_CLICK.y} r="12" />

      <Button slot={BANNER.draw} label={TREES_LABELS.draw} tone="secondary" />
      <Button slot={BANNER.commit} label={TREES_LABELS.commit} tone="primary" />

      <g className="tutorial-anim__tabs">
        {TREES_TABS.map(({ id, name, x, width }) => (
          <g key={id} className={`tutorial-anim__tab tutorial-anim__tab--trees-${id}`} data-zone={id}>
            <rect className="tutorial-anim__tab-card" x={x} y="262" width={width} height="28" rx="1" />
            <rect className="tutorial-anim__check" x={x + 7} y="270" width="11" height="11" rx="1" />
            <path
              className={`tutorial-anim__tick tutorial-anim__tick--trees-${id}`}
              d={`M ${x + 9.5} 275.5 L ${x + 12} 278.5 L ${x + 15.5} 272.5`}
            />
            <text className="tutorial-anim__name" x={x + 24} y="280">
              {name}
            </text>
          </g>
        ))}
      </g>

      <Cursor modifier="trees" />
    </svg>
  )
}

export const TREES_CARD = Object.freeze({
  stepId: 'trees',
  title: TREES_TITLE,
  body: TREES_BODY,
  Animation: TreesAnimation,
})
