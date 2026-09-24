/**
 * boundaryCard.jsx  —  THE BOUNDARY STEP'S CARD.
 *
 * The first entry in the per-step registry (stepCards.js): title, body, and
 * one looping animation over the shared farm (farmScene.jsx).
 *
 * THE SECOND SENTENCE IS WHY THIS CARD EXISTS. People draw the boundary
 * around what they think should be farmed and carve out the woods and the
 * wet ground -- which deletes the very ground the trees, water and roads
 * steps read, so those steps then correctly report nowhere to put a tree or
 * a pond and the tool reads as broken. A card that taught only the gesture
 * would leave that instinct alone. The copy is the spec's, verbatim, and
 * boundary.test.jsx asserts it string for string.
 *
 * THE ANIMATION, one loop on one `--loop`, every stop a percentage of it
 * (App.css, "5. Boundary"):
 *
 *   1. It opens on the zoom. The address is already in the field from the
 *      first frame -- context, not a demonstration, so nothing types.
 *   2. Two clicks on the zoom-in control; the land scales up at each, and
 *      the control flashes under the cursor.
 *   3. The cursor clicks the seven corners A to G, each click dropping a
 *      corner and drawing the edge to the next.
 *   4. A last click on A: the snap ring pulses, the ring closes, the parcel
 *      washes in and the acreage appears.
 *
 * THE LAND SCALES, THE CHROME DOES NOT. The address field and the zoom
 * control sit outside the scaled group, as they sit outside the map.
 *
 * THE MARKUP IS THE RESTING FRAME, as in every other diagram: zoomed in, the
 * ring closed and washed, the acreage shown. Under reduced motion that is
 * all there is. The snap ring is the one mark besides the cursor that rests
 * hidden, because it is a moment, not a thing on the map.
 */

import { Cursor } from './animations.jsx'
import { FarmScene, PARCEL, PARCEL_EDGES, PARCEL_PATH, SCENE_VIEWBOX, SceneGround } from './farmScene.jsx'

export const BOUNDARY_TITLE = 'Draw your whole property'
export const BOUNDARY_LEAD =
  'Search your address, zoom in, then click each corner of your property line. '
export const BOUNDARY_EMPHASIS = 'Include the woods, the wet ground and the road'
export const BOUNDARY_TAIL = ' — those are what the tool reads to place trees, water and access.'

/** The address already in the field. */
export const BOUNDARY_ADDRESS = '237 Montour Dr, Jones Mills, PA'

/** The one numeral in the card. */
export const BOUNDARY_ACREAGE = '21.6 ac traced'

/** The zoom-in control's centre: where the cursor waits for the first two clicks. */
const ZOOM_IN = { x: 370, y: 96 }

export function BoundaryAnimation() {
  const [first] = PARCEL
  return (
    <svg
      className="tutorial-anim tutorial-anim--boundary"
      viewBox={SCENE_VIEWBOX}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <SceneGround />

      {/* THE LAND, and the ring traced on it: everything the zoom scales. */}
      <g className="tutorial-anim__zoom tutorial-anim__zoom--boundary" data-testid="boundary-zoom">
        <FarmScene />

        <path className="tutorial-anim__wash" d={PARCEL_PATH} />
        {PARCEL_EDGES.map(({ from, to }) => (
          <line
            key={`${from.id}${to.id}`}
            className={`tutorial-anim__segment tutorial-anim__segment--boundary tutorial-anim__segment--${from.id.toLowerCase()}${to.id.toLowerCase()}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            pathLength="1"
          />
        ))}
        <circle className="tutorial-anim__snap" cx={first.x} cy={first.y} r="14" />
        {PARCEL.map(({ id, x, y }) => (
          <circle
            key={id}
            className={`tutorial-anim__corner tutorial-anim__corner--boundary tutorial-anim__corner--${id.toLowerCase()}`}
            cx={x}
            cy={y}
            r="4.5"
          />
        ))}

        <g className="tutorial-anim__chip tutorial-anim__chip--boundary">
          <rect x="146" y="140" width="108" height="28" rx="1" />
          <text className="tutorial-anim__value tutorial-anim__value--boundary" x="200" y="158.5" textAnchor="middle">
            {BOUNDARY_ACREAGE}
          </text>
        </g>
      </g>

      {/* THE CHROME: outside the scaled group, as it is outside the map. */}
      <g className="tutorial-anim__address">
        <rect x="70" y="14" width="232" height="26" rx="1" />
        <text className="tutorial-anim__address-text" x="80" y="31">
          {BOUNDARY_ADDRESS}
        </text>
      </g>

      <g className="tutorial-anim__zoom-control">
        <rect className="tutorial-anim__zoom-card" x="358" y="84" width="24" height="48" rx="1" />
        <rect className="tutorial-anim__zoom-in" x="359" y="85" width="22" height="22" />
        <line className="tutorial-anim__zoom-glyph" x1={ZOOM_IN.x - 5} y1={ZOOM_IN.y} x2={ZOOM_IN.x + 5} y2={ZOOM_IN.y} />
        <line className="tutorial-anim__zoom-glyph" x1={ZOOM_IN.x} y1={ZOOM_IN.y - 5} x2={ZOOM_IN.x} y2={ZOOM_IN.y + 5} />
        <line className="tutorial-anim__zoom-rule" x1="358" y1="108" x2="382" y2="108" />
        <line className="tutorial-anim__zoom-glyph" x1="365" y1="120" x2="375" y2="120" />
      </g>

      <Cursor modifier="boundary" />
    </svg>
  )
}

export const BOUNDARY_CARD = Object.freeze({
  stepId: 'boundary',
  title: BOUNDARY_TITLE,
  body: (
    <>
      {BOUNDARY_LEAD}
      <strong className="tutorial__em">{BOUNDARY_EMPHASIS}</strong>
      {BOUNDARY_TAIL}
    </>
  ),
  Animation: BoundaryAnimation,
})
