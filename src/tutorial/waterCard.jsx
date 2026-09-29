/**
 * waterCard.jsx  —  THE WATER STEP'S CARD.
 *
 * One card over the shared farm (farmScene.jsx): the two survey areas, one
 * a tint and one a dot field, overlapping on open ground below Block 1.
 *
 * THE OVERLAP IS WHY THIS CARD EXISTS. The two survey types come back from
 * one call and sit on the same ground where both instruments agree; the map
 * draws them as two KINDS of mark so that shared ground still reads as two
 * areas. The copy's second sentence -- they overlap, and are committed
 * together or alone -- is set in weight, and the untick is what shows it:
 * the dot field leaves and the tint stays.
 *
 * THE ANIMATION, one loop on one `--loop` (App.css, "7. Water"):
 *
 *   1. Block 1, settled. Both areas on the map; both tabs ticked.
 *   2. The cursor clicks the embankment area on ground the dot field does
 *      not cover -- a click in the overlap would not say which area it hit --
 *      and the area and its tab take the ink edge; the panel opens.
 *   3. It unticks Excavated 1: the dot field leaves, the tab dims.
 *   4. It presses the commit button.
 *
 * NO RUNNING TOTAL. The areas overlap, so the sum of their acreages counts
 * the shared ground twice and states a figure that is not true.
 *
 * THE PANEL SAYS WHAT THE REAL ONE DOES: its first two rows are the tab's,
 * `survey acres` and `/100 score` (WATER_STEP in stepDefinitions.js), the
 * score a whole number on the display scale.
 *
 * ONLY BLOCK 1, SETTLED. Landform is committed upstream, so its block is
 * context -- the block layer's 'settled' tone -- and Blocks 2 and 3 are left
 * out so the survey areas have the ground to themselves. The west stand
 * goes too, as on the landform cards: Block 1 sits on that corner.
 *
 * THE MARKUP IS THE RESTING FRAME: the embankment area read, its panel open,
 * the excavated area off the map and its tab dimmed. Under reduced motion
 * that is all there is.
 *
 * THE COPY IS THE SPEC'S, VERBATIM; waterCard.test.jsx asserts it.
 */

import { Cursor } from './animations.jsx'
import {
  BlockHatch,
  FarmScene,
  SCENE_VIEWBOX,
  SUGGESTED_BLOCKS,
  SURVEY_AREAS,
  SceneBlocks,
  SceneGround,
  SceneParcel,
  SceneSurveyEmbankment,
  SceneSurveyExcavated,
  SurveyStipple,
  useHatchId,
  useStippleId,
} from './farmScene.jsx'

export const WATER_TITLE = 'Two kinds of water survey areas'
export const WATER_EMPHASIS = 'These can overlap and can be committed together or alone.'
export const WATER_BODY =
  'A solid tint marks ground suited to an embankment pond; a dot field marks ground suited to an ' +
  `excavated one. ${WATER_EMPHASIS}`

/** The embankment area's panel, as the real one's first two rows read. */
export const WATER_READINGS = Object.freeze([
  Object.freeze({ value: '2.1', label: 'survey acres' }),
  Object.freeze({ value: '57', label: '/100 score' }),
])

/** The real step's commit label, with areas ticked. */
export const WATER_COMMIT_LABEL = 'Commit Survey Areas'

/** The one block on this card: Block 1, top left. */
export const WATER_BLOCKS = Object.freeze(SUGGESTED_BLOCKS.filter((block) => block.id === '1'))

/** Where the cursor clicks the embankment area: inside it, clear of the dot field. */
export const EMBANKMENT_CLICK = Object.freeze({ x: 150, y: 190 })

/** The tabs: checkbox, then the name. */
export const WATER_TABS = Object.freeze([
  Object.freeze({ id: 'embankment', name: 'Embankment 1', x: 16, width: 110 }),
  Object.freeze({ id: 'excavated', name: 'Excavated 1', x: 130, width: 100 }),
])

export function WaterAnimation() {
  const hatch = useHatchId()
  const stipple = useStippleId()
  const [embankmentTab, excavatedTab] = WATER_TABS
  return (
    <svg
      className="tutorial-anim tutorial-anim--water"
      viewBox={SCENE_VIEWBOX}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <BlockHatch id={hatch} />
        <SurveyStipple id={stipple} />
      </defs>
      <SceneGround />
      <FarmScene stand={false} />
      <SceneParcel />
      <SceneBlocks hatch={hatch} blocks={WATER_BLOCKS} tone="settled" />

      {/* The dot field under the tint: the tint's wash reads through the
          dots where they share ground, and the dots through the wash. */}
      <SceneSurveyExcavated stipple={stipple} className="tutorial-anim__survey--water-excavated" />
      <SceneSurveyEmbankment />

      {/* The area being read: the heavy ink edge. */}
      <path className="tutorial-anim__mark tutorial-anim__mark--water" d={SURVEY_AREAS.embankment.d} />

      {/* The two clicks: the embankment area, then Excavated 1's checkbox. */}
      <circle
        className="tutorial-anim__pulse tutorial-anim__pulse--water-1"
        cx={EMBANKMENT_CLICK.x}
        cy={EMBANKMENT_CLICK.y}
        r="18"
      />
      <circle
        className="tutorial-anim__pulse tutorial-anim__pulse--water-2"
        cx={excavatedTab.x + 12.5}
        cy="275.5"
        r="14"
      />

      <g className="tutorial-anim__panel tutorial-anim__panel--water">
        <rect x="252" y="20" width="132" height="78" rx="1" />
        <text className="tutorial-anim__name" x="264" y="38">
          {embankmentTab.name}
        </text>
        <line className="tutorial-anim__rule" x1="264" y1="46" x2="372" y2="46" />
        {WATER_READINGS.map(({ value, label }, i) => (
          <text
            key={label}
            x="264"
            y={64 + i * 18}
            className={`tutorial-anim__reading tutorial-anim__reading--water-${i + 1}`}
          >
            <tspan className="tutorial-anim__value">{value}</tspan>
            <tspan className="tutorial-anim__label" x="292">
              {label}
            </tspan>
          </text>
        ))}
      </g>

      <g className="tutorial-anim__commit-button tutorial-anim__commit-button--water">
        <rect x="262" y="222" width="126" height="28" rx="1" />
        <text className="tutorial-anim__commit-label" x="325" y="240" textAnchor="middle">
          {WATER_COMMIT_LABEL}
        </text>
      </g>

      <g className="tutorial-anim__tabs">
        {WATER_TABS.map(({ id, name, x, width }) => (
          <g key={id} className={`tutorial-anim__tab tutorial-anim__tab--water-${id}`} data-area={id}>
            <rect className="tutorial-anim__tab-card" x={x} y="262" width={width} height="28" rx="1" />
            <rect className="tutorial-anim__check" x={x + 7} y="270" width="11" height="11" rx="1" />
            <path
              className={`tutorial-anim__tick tutorial-anim__tick--water-${id}`}
              d={`M ${x + 9.5} 275.5 L ${x + 12} 278.5 L ${x + 15.5} 272.5`}
            />
            <text className="tutorial-anim__name" x={x + 24} y="280">
              {name}
            </text>
          </g>
        ))}
        <rect
          className="tutorial-anim__tab-mark tutorial-anim__tab-mark--water"
          x={embankmentTab.x}
          y="262"
          width={embankmentTab.width}
          height="28"
          rx="1"
        />
      </g>

      <Cursor modifier="water" />
    </svg>
  )
}

export const WATER_CARD = Object.freeze({
  stepId: 'water',
  title: WATER_TITLE,
  body: WATER_BODY,
  emphasis: WATER_EMPHASIS,
  Animation: WaterAnimation,
})
