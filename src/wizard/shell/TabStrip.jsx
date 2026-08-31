/**
 * TabStrip.jsx  —  REGION D, the bottom, above the banner.
 *
 * ONE TAB PER FEATURE THE CURSOR STEP IS CARRYING, from the step's own
 * `tabs(context)`. The strip places them, counts them and caps them; it never
 * reads a Feature.
 *
 * THE TREATMENT IS THE ACREAGE CHIP'S, and it is the chip's for a measured
 * reason rather than a family resemblance. Each row is a right-aligned
 * monospace value and a left-aligned label, and the value column has a `6ch`
 * floor with a `max-content` ceiling, so the decimal point holds still as the
 * number changes and an absurd value pushes the label right instead of
 * printing over it. App.css's `.chrome-tab` carries that rule and the
 * measurements behind it; the chip that used to sit over the map's top-left is
 * gone, and the boundary's tab is exactly it.
 *
 * DISPLAY ONLY IN THIS BRANCH. No tab takes a click, carries an eye, or offers
 * an ×; nothing here selects, hides, or deletes. Landform's selection is still
 * changed exactly where it always was -- by clicking a zone on the map -- and
 * a tab showing `selected` is reporting that, not offering it.
 *
 *
 * THE CAP, AND WHY IT SCROLLS RATHER THAN WRAPS
 *
 * Collapsed, the strip is ONE ROW: as many tabs as a row holds, and if there
 * are more, the last cell is a "+N more" that expands it. Expanded, it is at
 * most THREE ROWS, and past three rows' worth of tabs it SCROLLS.
 *
 * Wrapping past the cap was the alternative and it is the wrong one here. The
 * whole premise of this shell is that the map is the document and the chrome
 * floats over it; a strip that grows a row per handful of zones eats the
 * document to describe it, and a parcel with forty candidates would cover the
 * map completely. Scrolling holds the strip's footprint at exactly three rows
 * whatever the count, so the map's height is a constant rather than a function
 * of how many proposals came back. What is lost is seeing all forty at once,
 * and that was never on offer -- three rows was already the cap.
 */

import { useState } from 'react'

/**
 * The grid, in tabs. Fixed rather than measured: there is no layout to measure
 * in a test environment, and a cap that changes with the viewport would make
 * "does +N more appear" a question about the window rather than about the
 * data. The CSS lays the same grid out, so the two agree by construction.
 */
export const TAB_COLUMNS = 4
export const TAB_ROWS_MAX = 3

/** How many real tabs a collapsed strip shows: one row, less the "+N more". */
export const COLLAPSED_TAB_CAP = TAB_COLUMNS - 1

export default function TabStrip({ machine }) {
  const [expanded, setExpanded] = useState(false)
  const { definition, stepId } = machine

  const tabs = definition.tabs(machine.context)
  if (!tabs.length) return null

  const overflowing = tabs.length > TAB_COLUMNS
  const shown = expanded || !overflowing ? tabs : tabs.slice(0, COLLAPSED_TAB_CAP)
  const hidden = tabs.length - shown.length

  return (
    <div
      className={`chrome-tabs${expanded ? ' chrome-tabs--expanded' : ''}`}
      data-testid={`tabs-${stepId}`}
      data-tab-count={tabs.length}
      data-expanded={expanded ? 'true' : 'false'}
    >
      <ul className="chrome-tabs__list">
        {shown.map((tab) => (
          <li
            key={tab.id}
            className={
              'chrome-tab' +
              (tab.selected === false ? ' chrome-tab--off' : '') +
              (tab.drawn ? ' chrome-tab--drawn' : '')
            }
            data-testid={`tab-${tab.id}`}
            data-tab-id={tab.id}
          >
            <span className="chrome-tab__name">{tab.name}</span>
            {/* Value and label spans are emitted FLAT rather than wrapped per
                row, so they are direct children of the tab's two-column grid
                -- that is what makes every value in a tab share one
                fixed-width column and read as a column of figures rather than
                as independent rows. */}
            {tab.rows.map((row) => (
              <Row key={row.label} row={row} />
            ))}
          </li>
        ))}

        {hidden > 0 ? (
          <li className="chrome-tab chrome-tab--more">
            <button
              type="button"
              className="chrome-tab__more"
              data-testid={`tabs-more-${stepId}`}
              onClick={() => setExpanded(true)}
            >
              +{hidden} more
            </button>
          </li>
        ) : null}

        {expanded && overflowing ? (
          <li className="chrome-tab chrome-tab--more">
            <button
              type="button"
              className="chrome-tab__more"
              data-testid={`tabs-fewer-${stepId}`}
              onClick={() => setExpanded(false)}
            >
              Show fewer
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  )
}

function Row({ row }) {
  return (
    <>
      <span className="chrome-tab__value">{row.value}</span>
      <span className="chrome-tab__label">{row.label}</span>
    </>
  )
}
