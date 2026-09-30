/**
 * fencingCard.jsx  —  THE FENCING STEP'S CARD, AND THE LAST STEP CARD.
 *
 * One card over the shared farm (farmScene.jsx): everything committed so
 * far, then the three fence lines drawn around it one type at a time, then
 * commit. No gesture -- fencing is `tools: ['select']`, and there is nothing
 * to draw or delete on it.
 *
 * THE ANIMATION, one loop on one `--loop` (App.css, "10. Fencing"):
 *
 *   1. Every prior commitment settled on the parcel. No fences, no tabs.
 *   2. The perimeter fence draws in; its tab appears, ticked.
 *   3. The water fence draws in; its tab appears, ticked.
 *   4. The tree fence draws in; its tab appears, ticked.
 *   5. The cursor enters and presses "Commit fencing".
 *
 * Nothing is unticked: all three commit, which is what the copy recommends.
 *
 * THE CURSOR STAYS OFF THE FRAME UNTIL THE COMMIT. There is nothing to click
 * before it, and a pointer drifting through three reveals would suggest an
 * interaction this step does not have.
 *
 * THE DRAW-ON IS A MASK PER FENCE (SceneFences' `reveal`), never the line's
 * own dash offset and never a ground-coloured stroke laid over it. See
 * SceneFences for why each of those is wrong.
 *
 * THE SETTLED STACK IS THE WHOLE DESIGN: the block (landform), the water
 * area (water), the network and its marker (roads), and one tree zone --
 * Zone 1, the one the tree fence goes around -- each on the scene's
 * 'settled' tone, in the order they were decided. One tree zone is enough
 * to show a tree fence, and a second with no fence of its own would read
 * as a zone the step forgot. This is the busiest scene in the set, and should be:
 * fencing is where the design is seen whole.
 *
 * WHERE A ZONE MEETS THE PERIMETER THERE IS ONE FENCE, NOT TWO: the
 * perimeter carries the shared stretch and the zone fence draws only its
 * inner arc, as the map's display line does (see FENCES in farmScene.jsx).
 *
 * THE TABS AND THE BUTTON SAY WHAT THE REAL STEP DOES. The tab names are
 * the backend's (fencing.py, FENCE_TYPE_LABELS) -- "Perimeter fencing", not
 * "Boundary fencing": the fence is not the boundary -- and the reviewing
 * state's one button is FENCING_STEP's commit, whose label is "Commit
 * fencing" while anything is committable.
 *
 * THE MARKUP IS THE RESTING FRAME: all three fences drawn, all three tabs
 * present and ticked. Under reduced motion that is all there is.
 *
 * THE COPY IS THE SPEC'S, VERBATIM; fencingCard.test.jsx asserts it. Its
 * last sentence is set in weight, and it is the only recommendation in the
 * card set: every other card says what a control does and leaves the choice
 * to the reader. It stays here and does not spread.
 */

import { Cursor } from './animations.jsx'
import {
  ACCESS_POINTS,
  BlockHatch,
  FENCES,
  FarmScene,
  ROAD_NETWORKS,
  SCENE_VIEWBOX,
  SUGGESTED_BLOCKS,
  SceneAccessPoints,
  SceneBlocks,
  SceneFarmTracks,
  SceneFences,
  SceneGround,
  SceneParcel,
  SceneSurveyEmbankment,
  SceneTreeZones,
  TREE_ZONES,
  TreeHatch,
  useFenceRevealId,
  useHatchId,
  useTreeHatchId,
} from './farmScene.jsx'

export const FENCING_TITLE = 'Fencing to protect committed features'
export const FENCING_EMPHASIS = 'Recommended to commit all three types'
export const FENCING_BODY =
  'Fence lines around the workable perimeter, water areas, and tree zones. ' + `${FENCING_EMPHASIS}.`

/** The real step's commit label while something is committable. */
export const FENCING_LABELS = Object.freeze({
  commit: 'Commit fencing',
})

/** The settled context, in the order it was decided. */
export const FENCING_BLOCKS = Object.freeze(SUGGESTED_BLOCKS.filter((block) => block.id === '1'))
export const FENCING_NETWORKS = Object.freeze(ROAD_NETWORKS.filter((network) => network.id === '1'))
export const FENCING_ACCESS_POINTS = Object.freeze(ACCESS_POINTS.filter((point) => point.id === '1'))
/** One tree zone, the one the tree fence goes around. */
export const FENCING_TREE_ZONES = Object.freeze(TREE_ZONES.filter((zone) => zone.id === '1'))

/**
 * The tabs, one per fence type, named as the backend labels them. Three
 * across the frame's full width: the names are long, and a tab must hold
 * its checkbox and its name at the card's narrowest.
 */
export const FENCING_TABS = Object.freeze(
  [
    ['boundary', 'Perimeter fencing'],
    ['water', 'Water area fencing'],
    ['tree', 'Tree zone fencing'],
  ].map(([id, name], index) => Object.freeze({ id, name, x: 6 + index * 130, width: 128 }))
)

/** The banner: the reviewing state's one button, right-aligned. */
export const BANNER = Object.freeze({
  y: 222,
  height: 28,
  commit: Object.freeze({ x: 292, width: 96 }),
})

export function FencingAnimation() {
  const hatch = useHatchId()
  const treeHatch = useTreeHatchId()
  const reveal = useFenceRevealId()
  const fences = FENCES.map((fence) => ({
    ...fence,
    className: `tutorial-anim__fence--${fence.id}`,
    revealClassName: `tutorial-anim__fence-reveal--${fence.id}`,
  }))
  const { commit } = BANNER
  return (
    <svg
      className="tutorial-anim tutorial-anim--fencing"
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

      {/* THE SETTLED STACK, in the order it was decided: land, water, roads, trees. */}
      <SceneBlocks hatch={hatch} blocks={FENCING_BLOCKS} tone="settled" />
      <SceneSurveyEmbankment tone="settled" />
      <SceneFarmTracks networks={FENCING_NETWORKS} tone="settled" />
      <SceneAccessPoints state="generated" points={FENCING_ACCESS_POINTS} tone="settled" />
      <SceneTreeZones hatch={treeHatch} zones={FENCING_TREE_ZONES} tone="settled" />

      {/* THE FENCES, over everything they go around. */}
      <SceneFences fences={fences} reveal={reveal} className="tutorial-anim__fences" />

      <g className="tutorial-anim__commit-button tutorial-anim__commit-button--fencing">
        <rect x={commit.x} y={BANNER.y} width={commit.width} height={BANNER.height} rx="1" />
        <text className="tutorial-anim__commit-label" x={commit.x + commit.width / 2} y={BANNER.y + 18} textAnchor="middle">
          {FENCING_LABELS.commit}
        </text>
      </g>

      <g className="tutorial-anim__tabs">
        {FENCING_TABS.map(({ id, name, x, width }) => (
          <g key={id} className={`tutorial-anim__tab tutorial-anim__tab--fencing-${id}`} data-fence={id}>
            <rect className="tutorial-anim__tab-card" x={x} y="262" width={width} height="28" rx="1" />
            <rect className="tutorial-anim__check" x={x + 7} y="270" width="11" height="11" rx="1" />
            <path className="tutorial-anim__tick" d={`M ${x + 9.5} 275.5 L ${x + 12} 278.5 L ${x + 15.5} 272.5`} />
            <text className="tutorial-anim__name" x={x + 24} y="280">
              {name}
            </text>
          </g>
        ))}
      </g>

      <Cursor modifier="fencing" />
    </svg>
  )
}

export const FENCING_CARD = Object.freeze({
  stepId: 'fencing',
  title: FENCING_TITLE,
  body: FENCING_BODY,
  emphasis: FENCING_EMPHASIS,
  Animation: FencingAnimation,
})
