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
 * THREE THINGS A TAB DOES, AND THEY ARE THREE DIFFERENT VERBS ON PURPOSE.
 *
 *   THE BODY FOCUSES.  Clicking the tab is the same act as clicking the shape
 *                      on the map: it marks the feature, activates the tab and
 *                      opens the detail panel. It commits nothing and changes
 *                      nothing about what a commit would send.
 *
 *   THE EYE INCLUDES.  Whether the feature is in the commit. Eye-off hides it
 *                      from the map entirely and leaves it out of the commit
 *                      body; the tab stays, which is the whole reason the map
 *                      no longer needs a declined treatment of its own.
 *
 *   THE × DESTROYS.    Only on a tab whose definition declares `removable`,
 *                      which is only ever a shape the user drew. A suggestion
 *                      has no × because it cannot be destroyed -- the server
 *                      will regenerate it -- and the asymmetry is meant to be
 *                      visible at a glance rather than explained.
 *
 * The × deletes immediately and offers an UNDO in the instruction bar for a
 * few seconds. No confirmation dialogue: a modal is heavy for a small object,
 * and undo keeps the flow moving where a modal stops it to ask about something
 * the user can simply take back.
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

import { useWizardCursor } from '../WizardCursor.jsx'

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

export default function TabStrip({ machine, onRemove }) {
  const [expanded, setExpanded] = useState(false)
  const { focusedFeatureId, focusFeature } = useWizardCursor()
  const { definition, stepId, actions } = machine

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
        {shown.map((tab) => {
          const focused = tab.id === focusedFeatureId
          const off = tab.eye && tab.selected === false
          return (
            <li
              key={tab.id}
              className={
                'chrome-tab' +
                (off ? ' chrome-tab--off' : '') +
                (focused ? ' chrome-tab--focused' : '') +
                (tab.drawn ? ' chrome-tab--drawn' : '')
              }
              data-testid={`tab-${tab.id}`}
              data-tab-id={tab.id}
              data-eye={tab.eye ? (tab.selected === false ? 'off' : 'on') : undefined}
              data-focused={focused ? 'true' : 'false'}
            >
              {/* THE BODY IS THE FOCUS TARGET, and it is a button so that a
                  keyboard reaches it -- the map's own click on the same
                  feature has no keyboard equivalent, so the strip is the
                  accessible half of selection sync. */}
              <button
                type="button"
                className="chrome-tab__body"
                aria-pressed={focused}
                data-testid={`tab-focus-${tab.id}`}
                onClick={() => focusFeature(focused ? null : tab.id)}
              >
                <span className="chrome-tab__name">{tab.name}</span>
                {/* Value and label spans are emitted FLAT rather than wrapped
                    per row, so they are direct children of the tab's
                    two-column grid -- that is what makes every value in a tab
                    share one fixed-width column and read as a column of
                    figures rather than as independent rows. */}
                {tab.rows.map((row) => (
                  <Row key={row.label} row={row} />
                ))}
              </button>

              {tab.eye ? (
                <button
                  type="button"
                  className="chrome-tab__eye"
                  aria-pressed={tab.selected !== false}
                  aria-label={
                    tab.selected === false
                      ? `Include ${tab.name} in this step`
                      : `Leave ${tab.name} out of this step`
                  }
                  data-testid={`tab-eye-${tab.id}`}
                  onClick={() => actions.toggleSelection(stepId, tab.id)}
                >
                  <Eye open={tab.selected !== false} />
                </button>
              ) : null}

              {/* HALF OUTSIDE THE CORNER, which is the familiar close gesture
                  and is also what keeps it from reading as a third figure in
                  the tab's own grid. */}
              {tab.removable ? (
                <button
                  type="button"
                  className="chrome-tab__remove"
                  aria-label={`Delete ${tab.name}`}
                  data-testid={`tab-remove-${tab.id}`}
                  onClick={() => onRemove?.(tab.id)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              ) : null}
            </li>
          )
        })}

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

/**
 * The eye, drawn rather than typed.
 *
 * An SVG because the two states have to be the SAME MARK with one stroke
 * added -- an open eye and the same eye struck through. A glyph pair (👁 and a
 * crossed-out something) would be two different drawings at two different
 * weights, and the toggle would read as two unrelated icons rather than as one
 * control in two positions. currentColor throughout, so it inherits the tab's
 * own state colour and defines nothing.
 */
function Eye({ open }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.25" />
      {open ? null : (
        <path d="M2.5 13.5 13.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
      )}
    </svg>
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
