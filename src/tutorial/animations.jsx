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
 * its panel open and its tab pressed, both blocks ticked with the commit
 * button. The cursor glyph is the one thing hidden there, because a pointer
 * that never moves is a smudge, not a cue.
 *
 * ABSTRACT LINEWORK, NOT SCREENSHOTS. Faint contours for ground, flat shapes
 * for features, a drawn cursor glyph. A screenshot goes stale on the next
 * chrome change; a diagram of "steps down the left, tabs along the bottom"
 * survives it, and reads in the bulletin voice the rest of the page is set in.
 *
 * THE ZONES ARE THE MAP'S ZONES. A production block is the map's own mark
 * for one -- a ruled hatch rising to the right in --oxide over a faint
 * --rule screen, spacing 8, weight 1 -- and a tree zone is the same hatch
 * falling, in --tree (ProductionHatchPattern.jsx's table, copied by eye
 * rather than imported, because that module injects patterns into the map's
 * own document and this is a picture of one). Their outlines are organic:
 * a suggested block follows ground, and a diagram of squares would teach a
 * reader to expect squares. The one ring that IS a polygon is the one the
 * cursor draws corner by corner, because that is what drawing does.
 *
 * MEASURED VALUES ARE THE DATA FACE, tabular; nothing else in a card is. The
 * readouts are value left, label right -- `4.0 acres`, `42.4 /100 score` --
 * which is the order the real detail panel prints them in.
 *
 * NO COLOUR LITERAL LIVES IN THIS FILE: fills and strokes are class-driven so
 * the tokens stay in one place. The one fill set inline is a reference to a
 * <pattern> in the same tree -- a paint server, not a colour -- which is the
 * only way a hatch can be pointed at, and it is set here rather than in the
 * stylesheet so the stylesheet stays free of fragment references.
 */

/** Every card draws on the same frame. */
const VIEW = '0 0 320 180'

/** The pointer glyph, tip at the origin, so a translate puts the tip on the target. */
const CURSOR_PATH = 'M0 0 L0 14.5 L3.6 11.2 L6.1 16.6 L8.7 15.5 L6.2 10.2 L11.2 10.2 Z'

/** The hatch tile, in user units: the map's spacing, at the diagram's scale. */
const HATCH = 8

/**
 * A hatch, the way the map rules one. `rise: 'up'` runs bottom-left to
 * top-right (production); `'down'` the other way (tree). The tile's two
 * corner stubs keep the ruling continuous across tile edges.
 */
function Hatch({ id, kind }) {
  const rising = kind === 'production'
  const d = rising
    ? `M0 ${HATCH} L${HATCH} 0 M-1 1 L1 -1 M${HATCH - 1} ${HATCH + 1} L${HATCH + 1} ${HATCH - 1}`
    : `M0 0 L${HATCH} ${HATCH} M-1 ${HATCH - 1} L1 ${HATCH + 1} M${HATCH - 1} -1 L${HATCH + 1} 1`
  return (
    <defs>
      <pattern id={id} width={HATCH} height={HATCH} patternUnits="userSpaceOnUse">
        <rect className={`tutorial-anim__screen tutorial-anim__screen--${kind}`} width={HATCH} height={HATCH} />
        <path className={`tutorial-anim__hatch tutorial-anim__hatch--${kind}`} d={d} />
      </pattern>
    </defs>
  )
}

/** A zone: an organic outline filled with its kind's hatch. */
function Zone({ d, kind, hatchId, modifier }) {
  return (
    <path
      className={`tutorial-anim__block tutorial-anim__block--${kind}${modifier ? ` tutorial-anim__block--${modifier}` : ''}`}
      d={d}
      fill={`url(#${hatchId})`}
    />
  )
}

/**
 * Faint ground. Four contour passes inside the frame, hand-placed so no card
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

/**
 * A tab, as the strip draws one: name over its figure on the left, the
 * checkbox on the right. `modifier` names the one tab a card animates.
 */
function Tab({ x, y, width, name, value, modifier }) {
  const suffix = modifier ? ` tutorial-anim__tab--${modifier}` : ''
  const bodySuffix = modifier ? ` tutorial-anim__tab-body--${modifier}` : ''
  const tickSuffix = modifier ? ` tutorial-anim__tick--${modifier}` : ''
  const cx = x + width - 16
  const cy = y + 9
  return (
    <g className={`tutorial-anim__tab${suffix}`}>
      <rect className="tutorial-anim__tab-card" x={x} y={y} width={width} height="26" rx="2" />
      <g className={`tutorial-anim__tab-body${bodySuffix}`}>
        <text className="tutorial-anim__name" x={x + 6} y={y + 10}>
          {name}
        </text>
        <Reading x={x + 6} y={y + 21} value={value} label="acres" />
      </g>
      <rect className="tutorial-anim__check" x={cx} y={cy} width="10" height="10" rx="1" />
      <polyline
        className={`tutorial-anim__tick${tickSuffix}`}
        points={`${cx + 2.2},${cy + 5.2} ${cx + 4.6},${cy + 7.6} ${cx + 8.4},${cy + 2.4}`}
      />
    </g>
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
    key: 'actions',
    label: 'action buttons',
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

/** The corners, in the order they are clicked. App.css's cursor path visits these. */
const DRAW_CORNERS = [
  [60, 44],
  [150, 34],
  [178, 96],
  [120, 138],
  [44, 110],
]

/** A committed production block, already on the ground: the trees step's context. */
const DRAW_CONTEXT_BLOCK =
  'M214,98 C226,82 252,74 274,82 C292,88 292,106 298,120 C304,134 290,148 270,150 C250,152 228,150 218,136 C208,122 204,110 214,98 Z'

export function DrawAnimation() {
  const ring = DRAW_CORNERS.map(([x, y]) => `${x},${y}`).join(' ')
  return (
    <svg className="tutorial-anim tutorial-anim--draw" viewBox={VIEW} role="img" aria-hidden="true" focusable="false">
      <Hatch id="tutorial-hatch-production-draw" kind="production" />
      <Hatch id="tutorial-hatch-tree-draw" kind="tree" />
      <Ground />
      <Zone d={DRAW_CONTEXT_BLOCK} kind="production" hatchId="tutorial-hatch-production-draw" />
      <polygon
        className="tutorial-anim__ring tutorial-anim__ring--draw"
        points={ring}
        fill="url(#tutorial-hatch-tree-draw)"
      />
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
        <rect x="70" y="76" width="70" height="20" rx="2" />
        <Reading x="78" y="90" value="4.0" label="acres" />
      </g>
      <Cursor modifier="draw" />
    </svg>
  )
}

/* ===========================================================================
   3. READ — click a block, click bare ground, click its tab
   =========================================================================== */

const READ_BLOCKS = [
  'M32,64 C38,44 62,32 84,42 C100,50 98,70 104,84 C110,100 96,114 78,116 C58,118 40,110 34,94 C30,84 28,74 32,64 Z',
  'M118,80 C126,60 152,52 174,58 C192,62 196,78 204,92 C212,108 200,124 184,128 C166,132 148,134 134,122 C118,110 110,96 118,80 Z',
  'M228,104 C238,92 258,88 274,94 C290,100 300,112 292,124 C286,134 270,140 254,140 C240,140 226,132 224,120 C222,112 224,108 228,104 Z',
]

const READ_TABS = [
  { x: 14, name: 'Block 1', value: '2.5' },
  { x: 82, name: 'Block 2', value: '4.0' },
  { x: 150, name: 'Block 3', value: '1.2' },
]

export function ReadAnimation() {
  return (
    <svg className="tutorial-anim tutorial-anim--read" viewBox={VIEW} role="img" aria-hidden="true" focusable="false">
      <Hatch id="tutorial-hatch-production-read" kind="production" />
      <Ground />
      {READ_BLOCKS.map((d) => (
        <Zone key={d} d={d} kind="production" hatchId="tutorial-hatch-production-read" />
      ))}
      {/* THE MARK: the heavier edge the map gives the block you are reading. */}
      <path className="tutorial-anim__mark tutorial-anim__mark--read" d={READ_BLOCKS[1]} />
      {READ_TABS.map((tab) => (
        <Tab key={tab.name} x={tab.x} y={144} width={64} name={tab.name} value={tab.value} />
      ))}
      {/* THE TAB'S MARK: the same heavier edge, on the tab of the block in hand. */}
      <rect
        className="tutorial-anim__tab-mark tutorial-anim__tab-mark--read"
        x={READ_TABS[1].x}
        y="144"
        width="64"
        height="26"
        rx="2"
      />
      <g className="tutorial-anim__panel tutorial-anim__panel--read">
        <rect x="216" y="12" width="94" height="80" rx="2" />
        <text className="tutorial-anim__title" x="224" y="30">
          Block 2
        </text>
        <line className="tutorial-anim__rule" x1="224" y1="37" x2="302" y2="37" />
        <Reading x="224" y="52" value="4.0" label="acres" />
        <Reading x="224" y="66" value="42.4" label="/100 score" />
        <Reading x="224" y="80" value="2–8" label="% slope" />
      </g>
      <Cursor modifier="read" />
    </svg>
  )
}

/* ===========================================================================
   4. TICK — untick a tab, the block leaves; tick it, it returns; commit
   =========================================================================== */

const TICK_BLOCKS = [
  'M48,56 C60,36 92,30 116,40 C132,48 130,66 136,82 C142,100 128,116 108,120 C86,124 60,120 50,104 C42,90 40,70 48,56 Z',
  'M154,66 C170,48 202,44 224,52 C244,60 240,80 246,96 C252,112 236,126 216,128 C196,130 172,130 160,116 C148,102 142,80 154,66 Z',
]

export function TickAnimation() {
  return (
    <svg className="tutorial-anim tutorial-anim--tick" viewBox={VIEW} role="img" aria-hidden="true" focusable="false">
      <Hatch id="tutorial-hatch-production-tick" kind="production" />
      <Ground />
      <Zone d={TICK_BLOCKS[0]} kind="production" hatchId="tutorial-hatch-production-tick" />
      <Zone d={TICK_BLOCKS[1]} kind="production" hatchId="tutorial-hatch-production-tick" modifier="tick" />
      <Tab x={14} y={142} width={92} name="Block 1" value="4.0" />
      <Tab x={112} y={142} width={92} name="Block 2" value="2.6" modifier="tick" />
      <g className="tutorial-anim__commit tutorial-anim__commit--tick">
        <rect x="232" y="142" width="74" height="26" rx="2" />
        <text className="tutorial-anim__commit-label" x="269" y="159" textAnchor="middle">
          Commit
        </text>
      </g>
      <Cursor modifier="tick" />
    </svg>
  )
}
