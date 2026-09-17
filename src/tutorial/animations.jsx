/**
 * animations.jsx  —  ONE LOOPING DIAGRAM PER CARD.
 *
 * Inline SVG, animated with CSS @keyframes in App.css's tutorial section. No
 * animation library and no new dependency: the whole of the motion is class
 * names on SVG elements and keyframes keyed to those classes.
 *
 * ONE DURATION PER CARD. Every animated element in a card runs on the same
 * `--loop` (set on the <svg>, read by `.tutorial-anim *`) and states its own
 * timing as PERCENTAGES of it. There are no per-element durations and no
 * delays: a delay makes an element's cycle `delay + duration`, which is a
 * different period from its neighbours', and after a few loops the click no
 * longer lands on the point it drops. Percentages of one period cannot drift.
 *
 * THE MARKUP IS THE RESTING FRAME. Nothing here carries a colour, an opacity
 * or a transform: every element is drawn where it ends up, and the stylesheet
 * animates it AWAY from that and back. So with `animation: none` -- which is
 * what App.css applies under prefers-reduced-motion -- each card is a
 * finished diagram: the ring closed with its acreage, the block marked with
 * its panel open, both blocks ticked with the commit button. The cursor glyph
 * is the one thing hidden there, because a pointer that never moves is a
 * smudge, not a cue.
 *
 * ABSTRACT LINEWORK, NOT SCREENSHOTS. Faint contours for ground, flat shapes
 * for features, a drawn cursor glyph. A screenshot goes stale on the next
 * chrome change; a diagram of "steps down the left, tabs along the bottom"
 * survives it, and reads in the bulletin voice the rest of the page is set in.
 *
 * MEASURED VALUES ARE THE DATA FACE, tabular; nothing else in a card is. The
 * readouts are value left, label right -- `4.0 acres`, `42.4 /100 score` --
 * which is the order the real detail panel prints them in.
 *
 * No colour literal and no fragment reference lives in this file: fills and
 * strokes are class-driven so the tokens stay in one place, and there is no
 * <clipPath> or <marker>, because a url() fragment reference would be the one
 * hash in a tree that a style check greps for.
 */

/** Every card draws on the same frame. */
const VIEW = '0 0 320 180'

/** The pointer glyph, tip at the origin, so a translate puts the tip on the target. */
const CURSOR_PATH = 'M0 0 L0 14.5 L3.6 11.2 L6.1 16.6 L8.7 15.5 L6.2 10.2 L11.2 10.2 Z'

/**
 * Faint ground. Three contour passes inside the frame, hand-placed so no card
 * needs a clip. Shared, so the four cards read as one piece of land.
 */
function Ground() {
  return (
    <g className="tutorial-anim__ground" aria-hidden="true">
      <rect className="tutorial-anim__field" x="0" y="0" width="320" height="180" />
      <path
        className="tutorial-anim__contour"
        d="M0 42 C40 30 70 58 110 46 S180 20 230 38 S290 60 320 44"
      />
      <path
        className="tutorial-anim__contour"
        d="M0 88 C50 70 90 108 140 92 S210 62 260 84 S300 106 320 92"
      />
      <path
        className="tutorial-anim__contour"
        d="M0 136 C40 118 80 150 130 134 S200 108 250 128 S296 152 320 138"
      />
      <path
        className="tutorial-anim__contour"
        d="M0 166 C60 150 120 176 180 160 S260 146 320 164"
      />
    </g>
  )
}

/**
 * The cursor. `modifier` selects the card's own travel keyframes; the inner
 * path carries the press (a brief scale about the tip) on a second keyframe
 * set, so travel and press are two animations on two elements sharing one
 * period rather than one keyframe list trying to say both.
 */
function Cursor({ modifier }) {
  return (
    <g className={`tutorial-anim__cursor tutorial-anim__cursor--${modifier}`} aria-hidden="true">
      <path className={`tutorial-anim__pointer tutorial-anim__pointer--${modifier}`} d={CURSOR_PATH} />
    </g>
  )
}

/** A measured readout: value in the data face, label beside it in prose. */
function Reading({ x, y, value, label }) {
  return (
    <text x={x} y={y} className="tutorial-anim__reading">
      <tspan className="tutorial-anim__value">{value}</tspan>
      <tspan className="tutorial-anim__label" dx="4">
        {label}
      </tspan>
    </text>
  )
}

/* ===========================================================================
   1. OVERVIEW — the five regions land around an empty map frame
   =========================================================================== */

/**
 * Each region is a group carrying its own place on the frame plus a leader
 * line and a label that appear with it and then settle out. The regions rest
 * present; the leaders rest hidden.
 */
const OVERVIEW_REGIONS = [
  {
    key: 'rail',
    label: 'the steps',
    shape: <rect x="14" y="36" width="58" height="96" rx="2" />,
    detail: (
      <>
        <line x1="22" y1="50" x2="60" y2="50" />
        <line x1="22" y1="64" x2="56" y2="64" />
        <line x1="22" y1="78" x2="58" y2="78" />
        <line x1="22" y1="92" x2="52" y2="92" />
        <line x1="22" y1="106" x2="57" y2="106" />
        <line x1="22" y1="120" x2="50" y2="120" />
      </>
    ),
    leader: 'M72 60 L108 60',
    text: { x: 112, y: 63, anchor: 'start' },
  },
  {
    key: 'bar',
    label: 'what to do next',
    shape: <rect x="104" y="14" width="112" height="18" rx="2" />,
    detail: <line x1="114" y1="23" x2="200" y2="23" />,
    leader: 'M160 32 L160 52',
    text: { x: 160, y: 62, anchor: 'middle' },
  },
  {
    key: 'panel',
    label: 'the measurements',
    shape: <rect x="240" y="36" width="66" height="64" rx="2" />,
    detail: (
      <>
        <line x1="248" y1="50" x2="290" y2="50" />
        <line x1="248" y1="64" x2="284" y2="64" />
        <line x1="248" y1="78" x2="292" y2="78" />
      </>
    ),
    leader: 'M240 80 L206 80',
    text: { x: 202, y: 83, anchor: 'end' },
  },
  {
    key: 'tabs',
    label: 'the tabs',
    shape: (
      <>
        <rect x="80" y="144" width="40" height="22" rx="2" />
        <rect x="124" y="144" width="40" height="22" rx="2" />
        <rect x="168" y="144" width="40" height="22" rx="2" />
      </>
    ),
    detail: (
      <>
        <line x1="88" y1="155" x2="112" y2="155" />
        <line x1="132" y1="155" x2="156" y2="155" />
        <line x1="176" y1="155" x2="200" y2="155" />
      </>
    ),
    leader: 'M144 144 L144 124',
    text: { x: 144, y: 120, anchor: 'middle' },
  },
  {
    key: 'actions',
    label: 'the buttons',
    shape: (
      <>
        <rect x="222" y="144" width="38" height="22" rx="2" />
        <rect className="tutorial-anim__solid" x="266" y="144" width="40" height="22" rx="2" />
      </>
    ),
    detail: null,
    leader: 'M264 144 L264 124',
    text: { x: 264, y: 120, anchor: 'middle' },
  },
]

export function OverviewAnimation() {
  return (
    <svg className="tutorial-anim tutorial-anim--overview" viewBox={VIEW} role="img" aria-hidden="true" focusable="false">
      <Ground />
      {OVERVIEW_REGIONS.map((region, index) => (
        <g key={region.key}>
          <g className={`tutorial-anim__region tutorial-anim__region--${index + 1}`}>
            {region.shape}
            <g className="tutorial-anim__region-detail">{region.detail}</g>
          </g>
          <g className={`tutorial-anim__leader tutorial-anim__leader--${index + 1}`}>
            <path className="tutorial-anim__leader-line" d={region.leader} />
            <text
              className="tutorial-anim__note"
              x={region.text.x}
              y={region.text.y}
              textAnchor={region.text.anchor}
            >
              {region.label}
            </text>
          </g>
        </g>
      ))}
    </svg>
  )
}

/* ===========================================================================
   2. DRAW — five corners, then the first one again
   =========================================================================== */

const DRAW_CORNERS = [
  [70, 50],
  [200, 38],
  [250, 110],
  [160, 150],
  [60, 120],
]

export function DrawAnimation() {
  const ring = DRAW_CORNERS.map(([x, y]) => `${x},${y}`).join(' ')
  return (
    <svg className="tutorial-anim tutorial-anim--draw" viewBox={VIEW} role="img" aria-hidden="true" focusable="false">
      <Ground />
      <polygon className="tutorial-anim__ring tutorial-anim__ring--draw" points={ring} />
      {DRAW_CORNERS.map(([x, y], index) => {
        const [nx, ny] = DRAW_CORNERS[(index + 1) % DRAW_CORNERS.length]
        return (
          <line
            key={`segment-${index}`}
            className={`tutorial-anim__segment tutorial-anim__segment--${index + 1}`}
            x1={x}
            y1={y}
            x2={nx}
            y2={ny}
            pathLength="1"
          />
        )
      })}
      {DRAW_CORNERS.map(([x, y], index) => (
        <circle
          key={`corner-${index}`}
          className={`tutorial-anim__corner tutorial-anim__corner--${index + 1}`}
          cx={x}
          cy={y}
          r="3.2"
        />
      ))}
      <g className="tutorial-anim__chip tutorial-anim__chip--draw">
        <rect x="118" y="82" width="70" height="20" rx="2" />
        <Reading x="126" y="96" value="4.0" label="acres" />
      </g>
      <Cursor modifier="draw" />
    </svg>
  )
}

/* ===========================================================================
   3. READ — click one of three blocks; the panel opens
   =========================================================================== */

const READ_BLOCKS = [
  '24,60 84,48 96,104 40,116',
  '112,80 178,66 192,120 130,134',
  '200,40 214,34 226,66 206,76',
]

export function ReadAnimation() {
  return (
    <svg className="tutorial-anim tutorial-anim--read" viewBox={VIEW} role="img" aria-hidden="true" focusable="false">
      <Ground />
      {READ_BLOCKS.map((points, index) => (
        <polygon key={points} className="tutorial-anim__block" points={points} />
      ))}
      <polygon className="tutorial-anim__mark tutorial-anim__mark--read" points={READ_BLOCKS[1]} />
      <g className="tutorial-anim__panel tutorial-anim__panel--read">
        <rect x="216" y="14" width="94" height="86" rx="2" />
        <text className="tutorial-anim__title" x="224" y="32">
          Block 2
        </text>
        <line className="tutorial-anim__rule" x1="224" y1="40" x2="302" y2="40" />
        <Reading x="224" y="56" value="4.0" label="acres" />
        <Reading x="224" y="72" value="42.4" label="/100 score" />
        <Reading x="224" y="88" value="2–8" label="% slope" />
      </g>
      <Cursor modifier="read" />
    </svg>
  )
}

/* ===========================================================================
   4. TICK — untick a tab, the block leaves; tick it, it returns; commit
   =========================================================================== */

const TICK_BLOCKS = ['40,44 118,32 130,96 56,112', '150,60 232,46 246,110 168,124']

function Tab({ x, name, value, modifier }) {
  return (
    <g className={`tutorial-anim__tab${modifier ? ` tutorial-anim__tab--${modifier}` : ''}`}>
      <rect className="tutorial-anim__tab-card" x={x} y="140" width="92" height="28" rx="2" />
      <rect className="tutorial-anim__check" x={x + 8} y="149" width="10" height="10" rx="1" />
      <polyline
        className={`tutorial-anim__tick${modifier ? ` tutorial-anim__tick--${modifier}` : ''}`}
        points={`${x + 10.2},${154.2} ${x + 12.6},${156.6} ${x + 16.4},${151.4}`}
      />
      <g className={`tutorial-anim__tab-body${modifier ? ` tutorial-anim__tab-body--${modifier}` : ''}`}>
        <text className="tutorial-anim__name" x={x + 24} y="151">
          {name}
        </text>
        <Reading x={x + 24} y="163" value={value} label="acres" />
      </g>
    </g>
  )
}

export function TickAnimation() {
  return (
    <svg className="tutorial-anim tutorial-anim--tick" viewBox={VIEW} role="img" aria-hidden="true" focusable="false">
      <Ground />
      <polygon className="tutorial-anim__block" points={TICK_BLOCKS[0]} />
      <polygon className="tutorial-anim__block tutorial-anim__block--tick" points={TICK_BLOCKS[1]} />
      <Tab x={14} name="Block 1" value="4.0" />
      <Tab x={112} name="Block 2" value="2.6" modifier="tick" />
      <g className="tutorial-anim__commit tutorial-anim__commit--tick">
        <rect x="232" y="140" width="74" height="28" rx="2" />
        <text className="tutorial-anim__commit-label" x="269" y="158" textAnchor="middle">
          Commit
        </text>
      </g>
      <Cursor modifier="tick" />
    </svg>
  )
}
