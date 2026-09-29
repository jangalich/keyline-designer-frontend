/**
 * roadsCard.jsx  —  THE ROADS STEP'S CARD.
 *
 * One card over the shared farm (farmScene.jsx): two access points placed on
 * the boundary, a network generated from each, and the one being looked at
 * is the one that commits.
 *
 * THE SELECTION MODEL IS WHY THIS CARD EXISTS. Roads is the one step whose
 * checkbox FOLLOWS FOCUS (ROADS_STEP's `selection: { follows: 'focus' }`):
 * what you are looking at is what commits, so the tick moves with the focus
 * and never on its own. The map draws ONLY the focused network's lines
 * (`roads-networks` resolves to `show: 'focused'`), while every access
 * point stays drawn whatever is focused (`roads-access-points`). This
 * diagram is the only place a user can see those three facts together, so
 * it does not reuse the landform tick, which assumes ticking is its own act.
 *
 * THE ANIMATION, one loop on one `--loop` (App.css, "8. Roads"):
 *
 *   1. Block 1 and the committed embankment area, settled. No networks, no
 *      markers. The banner offers "Add access point", alone and primary.
 *   2. The cursor presses it. The tool arms: the boundary line lights, and
 *      the banner becomes Cancel beside "Generate network", disabled.
 *   3. It clicks the boundary at 150, 57. A pending marker lands; generate
 *      enables.
 *   4. It presses "Generate network". The banner says it is generating,
 *      network 1 draws, and it lands focused and ticked: its marker solid
 *      and ringed, its tab new and ticked, the banner "Add access point"
 *      (secondary) beside "Commit this network".
 *   5. It presses "Add access point" again. ARMING BLURS (WizardCursor's
 *      arm()), and on this step the blur takes the tick with it: network 1's
 *      lines leave the map in that instant and its tab unticks. Both the
 *      markers that exist stay. It clicks 240, 60; a second marker lands.
 *   6. It presses "Generate network". Network 2 draws and lands focused and
 *      ticked, as network 1 did. Network 1 stays off the map.
 *   7. It clicks Network 1's tab. Network 1's lines return, network 2's
 *      leave, and the tick and the marker's ring move with the focus.
 *   8. It presses "Commit this network".
 *
 * TWO RULES THE TIMELINE KEEPS. A drawn track never unwinds: its dash offset
 * only ever falls, and showing or hiding a network is its group's opacity,
 * switched on a hard cut. And the tick has no keyframes of its own apart
 * from the focus: every tick change lands on the same stop as a focus change.
 *
 * THE BANNER SAYS WHAT THE REAL ONE DOES (ROADS_STEP.buttons, read through
 * chromeState's "an armed tool reads as editing"): one button when nothing
 * is generated, two once there is, and a different pair while the tool is
 * armed. The primary's label changes because the PAIR changes.
 *
 * SETTLED CONTEXT, TWO DEEP. Block 1 (landform) and the embankment area
 * (water) are the prior commitments, both on the scene's 'settled' tone, in
 * the order they were decided. The networks route around the one and stop
 * short of the other.
 *
 * THE MARKUP IS THE RESTING FRAME: both markers placed, network 1 drawn and
 * focused, network 2 off the map with its tab present and unticked. Under
 * reduced motion that is all there is.
 *
 * THE COPY IS THE SPEC'S, VERBATIM; roadsCard.test.jsx asserts it.
 */

import { Cursor } from './animations.jsx'
import {
  ACCESS_POINTS,
  BlockHatch,
  FarmScene,
  PARCEL_PATH,
  ROAD_NETWORKS,
  SCENE_VIEWBOX,
  SUGGESTED_BLOCKS,
  SceneAccessPoints,
  SceneBlocks,
  SceneFarmTracks,
  SceneGround,
  SceneParcel,
  SceneSurveyEmbankment,
  useHatchId,
} from './farmScene.jsx'

export const ROADS_TITLE = 'Access starts on the boundary'
export const ROADS_EMPHASIS = 'along your boundary line'
export const ROADS_BODY =
  `Add an access point and click ${ROADS_EMPHASIS} to place it, then generate a network from it. ` +
  'You can place up to three and compare them, but only one is committed.'

/** The real step's labels, as its banner and tabs print them. */
export const ROADS_LABELS = Object.freeze({
  add: 'Add access point',
  cancel: 'Cancel',
  generate: 'Generate network',
  working: 'Generating…',
  commit: 'Commit this network',
})

/** The settled block on this card: Block 1, as on the water card. */
export const ROADS_BLOCKS = Object.freeze(SUGGESTED_BLOCKS.filter((block) => block.id === '1'))

/** The tabs: one per network, named as roadNetworkName() names them. */
export const ROADS_TABS = Object.freeze(
  ROAD_NETWORKS.map(({ id }, index) =>
    Object.freeze({ id, name: `Road Network ${id}`, x: 16 + index * 128, width: 122 })
  )
)

/** The banner's two slots, right-aligned as the real one is: primary on the right. */
export const BANNER = Object.freeze({
  y: 222,
  height: 28,
  primary: Object.freeze({ x: 262, width: 126 }),
  add: Object.freeze({ x: 148, width: 108 }),
  cancel: Object.freeze({ x: 196, width: 60 }),
})

/** Where the cursor clicks Network 1's tab: on its body, clear of the box. */
export const TAB_CLICK = Object.freeze({ x: ROADS_TABS[0].x + 70, y: 276 })

/** The focused marker's ring: the map's ink edge, outside the --halo ring. */
const MARK_RADIUS = 8.5

const tag = (items, prefix) => items.map((item) => ({ ...item, className: `${prefix}-${item.id}` }))

function Button({ slot, label, tone, modifier, children }) {
  const center = slot.x + slot.width / 2
  const primary = tone === 'primary'
  const group = primary ? 'tutorial-anim__commit-button' : 'tutorial-anim__draw-button'
  const text = primary ? 'tutorial-anim__commit-label' : 'tutorial-anim__button-label'
  return (
    <g className={`${group} ${group}--roads-${modifier}`}>
      <rect x={slot.x} y={BANNER.y} width={slot.width} height={BANNER.height} rx="1" />
      <text className={text} x={center} y={BANNER.y + 18} textAnchor="middle">
        {label}
      </text>
      {children}
    </g>
  )
}

export function RoadsAnimation() {
  const hatch = useHatchId()
  const networks = ROAD_NETWORKS.map((network) => ({
    ...network,
    className: `tutorial-anim__network--roads-${network.id}`,
    branches: network.branches.map((branch) => ({
      ...branch,
      className: `tutorial-anim__track--roads-${network.id}-${branch.id}`,
    })),
  }))
  const [first, second] = ACCESS_POINTS
  const { primary } = BANNER
  return (
    <svg
      className="tutorial-anim tutorial-anim--roads"
      viewBox={SCENE_VIEWBOX}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <BlockHatch id={hatch} />
      </defs>
      <SceneGround />
      <FarmScene stand={false} />
      <SceneParcel />

      {/* THE SETTLED STACK, in the order it was decided: land, then water. */}
      <SceneBlocks hatch={hatch} blocks={ROADS_BLOCKS} tone="settled" />
      <SceneSurveyEmbankment tone="settled" />

      {/* The boundary, lit while the placement tool is armed. */}
      <path className="tutorial-anim__armed" d={PARCEL_PATH} />

      <SceneFarmTracks networks={networks} />

      {/* The focused network's marker: the ink ring the map gives it. */}
      {ACCESS_POINTS.map(({ id, x, y }) => (
        <circle
          key={id}
          className={`tutorial-anim__mark tutorial-anim__mark--roads-${id}`}
          cx={x}
          cy={y}
          r={MARK_RADIUS}
        />
      ))}

      {/* Two map layers, as on the map: the point pending a generate, and
          one marker per candidate network. */}
      <SceneAccessPoints state="pending" points={tag(ACCESS_POINTS, 'tutorial-anim__access--pending')} />
      <SceneAccessPoints state="generated" points={tag(ACCESS_POINTS, 'tutorial-anim__access--generated')} />

      {/* The three clicks that are not buttons: each access point, then
          Network 1's tab. */}
      <circle className="tutorial-anim__pulse tutorial-anim__pulse--roads-1" cx={first.x} cy={first.y} r="16" />
      <circle className="tutorial-anim__pulse tutorial-anim__pulse--roads-2" cx={second.x} cy={second.y} r="16" />
      <circle className="tutorial-anim__pulse tutorial-anim__pulse--roads-3" cx={TAB_CLICK.x} cy={TAB_CLICK.y} r="14" />

      {/* THE BANNER, in each of the states the loop passes through. */}
      <g className="tutorial-anim__banner tutorial-anim__banner--roads-idle" data-banner="idle">
        <Button slot={primary} label={ROADS_LABELS.add} tone="primary" modifier="first-add" />
      </g>
      <g className="tutorial-anim__banner tutorial-anim__banner--roads-armed" data-banner="armed">
        <Button slot={BANNER.cancel} label={ROADS_LABELS.cancel} tone="secondary" modifier="cancel" />
        <Button slot={primary} label={ROADS_LABELS.generate} tone="primary" modifier="generate">
          {/* Disabled until a point is placed, as the real button is. */}
          <g className="tutorial-anim__disabled tutorial-anim__disabled--roads">
            <rect x={primary.x} y={BANNER.y} width={primary.width} height={BANNER.height} rx="1" />
            <text x={primary.x + primary.width / 2} y={BANNER.y + 18} textAnchor="middle">
              {ROADS_LABELS.generate}
            </text>
          </g>
        </Button>
      </g>
      <g className="tutorial-anim__banner tutorial-anim__banner--roads-working" data-banner="generating">
        <text className="tutorial-anim__note" x={primary.x + primary.width} y={BANNER.y + 18} textAnchor="end">
          {ROADS_LABELS.working}
        </text>
      </g>
      <g className="tutorial-anim__banner tutorial-anim__banner--roads-reviewing" data-banner="reviewing">
        <Button slot={BANNER.add} label={ROADS_LABELS.add} tone="secondary" modifier="add" />
        <Button slot={primary} label={ROADS_LABELS.commit} tone="primary" modifier="commit" />
      </g>

      <g className="tutorial-anim__tabs">
        {ROADS_TABS.map(({ id, name, x, width }) => (
          <g key={id} className={`tutorial-anim__tab tutorial-anim__tab--roads-${id}`} data-network={id}>
            <rect className="tutorial-anim__tab-card" x={x} y="262" width={width} height="28" rx="1" />
            <rect className="tutorial-anim__check" x={x + 7} y="270" width="11" height="11" rx="1" />
            <path
              className={`tutorial-anim__tick tutorial-anim__tick--roads-${id}`}
              d={`M ${x + 9.5} 275.5 L ${x + 12} 278.5 L ${x + 15.5} 272.5`}
            />
            <text className="tutorial-anim__name" x={x + 24} y="280">
              {name}
            </text>
          </g>
        ))}
        {ROADS_TABS.map(({ id, x, width }) => (
          <rect
            key={id}
            className={`tutorial-anim__tab-mark tutorial-anim__tab-mark--roads-${id}`}
            data-network={id}
            x={x}
            y="262"
            width={width}
            height="28"
            rx="1"
          />
        ))}
      </g>

      <Cursor modifier="roads" />
    </svg>
  )
}

export const ROADS_CARD = Object.freeze({
  stepId: 'roads',
  title: ROADS_TITLE,
  body: ROADS_BODY,
  emphasis: ROADS_EMPHASIS,
  Animation: RoadsAnimation,
  // Fires when "Add access point" arms the draw, before the point is placed
  // -- the card is about where it goes. See firing.js.
  firesOn: 'arm',
})
