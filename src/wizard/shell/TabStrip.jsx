/**
 * TabStrip.jsx  —  REGION D, the bottom row, left of the action card.
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

/** The cap on a narrow stage, where four tabs do not fit. Mirrors App.css. */
export const TAB_COLUMNS_NARROW = 2

/** How many real tabs a collapsed strip shows: one row, less the "+N more". */
export const COLLAPSED_TAB_CAP = TAB_COLUMNS - 1

/**
 * The tabs a COLLAPSED strip shows -- the first few, and ALWAYS THE FOCUSED
 * ONE.
 *
 * THE BUG THIS FIXES, because it is not obvious from the fix. The collapsed
 * strip took the first `cap` tabs in declaration order and nothing else. Click
 * a zone on the MAP whose tab fell past the cap and the detail panel opened
 * describing it while no tab on screen was marked active -- so the strip
 * looked like it had lost the selection, and there was no visible tab to click
 * to let go of it again.
 *
 * IT IS NOT SPECIFIC TO ANY STEP AND IT WAS ALWAYS THERE. It needs only more
 * tabs than a row holds plus a focus past the cap, which the landform step can
 * reach with four zones and which the water step reaches on the reference
 * parcel every time: six survey zones, ordered embankment-first, so the three
 * a collapsed row holds are all embankment and clicking ANY excavated zone on
 * the map focuses a tab that is not on screen.
 *
 * IT SWAPS RATHER THAN EXPANDING, and that is the point. The strip's whole
 * premise is that its footprint is a constant -- the map is the document, and
 * chrome that grows a row when you click something eats the document to
 * describe it. So the focused tab takes the LAST shown slot instead of being
 * added to them: the count is unchanged, "+N more" still counts what is not
 * shown, and the row is the same height it was before the click.
 *
 * DECLARATION ORDER IS OTHERWISE UNTOUCHED. The focused tab lands at the end
 * of the row, next to "+N more", rather than being sorted to the front --
 * moving every other tab sideways to mark one of them would be a bigger
 * disturbance than the mark itself.
 */
export function collapsedTabs(tabs, focusedFeatureId, cap = COLLAPSED_TAB_CAP) {
  const shown = tabs.slice(0, cap)
  if (focusedFeatureId == null) return shown
  if (shown.some((tab) => tab.id === focusedFeatureId)) return shown

  const focused = tabs.find((tab) => tab.id === focusedFeatureId)
  // A focus on something this strip is not carrying at all -- a drawn shape
  // just destroyed, a step whose tabs changed under it. Nothing to swap in.
  if (!focused) return shown

  return [...shown.slice(0, Math.max(0, cap - 1)), focused]
}

/**
 * How many columns to lay out for `cells` rendered cells, per cap.
 *
 * THE STRIP IS SIZED TO ITS CONTENT NOW, so the column count has to be too.
 * While the strip spanned the viewport a fixed `repeat(4, 1fr)` was free: the
 * width was the window's either way and empty tracks were invisible. Sized to
 * its content, four tracks holding one tab is a strip four tabs wide with
 * three empty cells sitting on the map -- "sized to its content" as a claim
 * rather than as a fact.
 *
 * IT IS HANDED TO CSS RATHER THAN DECIDED THERE because only this component
 * knows how many cells it is about to render: the count is the tabs it is
 * showing PLUS whichever of "+N more" and "Show fewer" is in play, and that
 * is a rendering decision, not a media query.
 */
export function tabColumns(cells, cap = TAB_COLUMNS) {
  return Math.max(1, Math.min(cells, cap))
}

/**
 * Is this tab the focused one -- by its own id, or by any feature it carries.
 *
 * A TAB MAY STAND FOR SEVERAL FEATURES (`featureIds`), because a tab is a
 * unit of the commit decision and the roads step's unit is a network of
 * branches. The focus slot holds whatever was clicked -- the tab's id, or a
 * branch's -- and the tab is marked either way, which is what makes clicking
 * a branch on the map and clicking its tab the same act.
 */
export function tabIsFocused(tab, focusedFeatureId) {
  if (focusedFeatureId == null) return false
  if (tab.id === focusedFeatureId) return true
  return Array.isArray(tab.featureIds) && tab.featureIds.includes(focusedFeatureId)
}

/** The feature ids a tab's eye toggles: what it declares, or its own id. */
function featureIdsOf(tab) {
  return Array.isArray(tab.featureIds) && tab.featureIds.length ? tab.featureIds : [tab.id]
}

/**
 * THE SELECTION AFTER ONE EYE IS PRESSED, in the step's declared mode.
 *
 *   multiple  a checkbox: the tab's features join the set or leave it, and
 *             nothing else moves. What every eye was before roads.
 *   radio     one or none: turning a tab ON is the whole selection -- every
 *             other tab's features leave -- and turning it OFF leaves the set
 *             empty. Commit-one-or-none, read off the definition rather than
 *             off which step this is; the backend says the same thing as
 *             `max_features: 1` counted by network.
 */
export function selectionAfterEye(current, tab, mode) {
  const ids = featureIdsOf(tab)
  const isOn = tab.selected !== false
  if (isOn) return current.filter((id) => !ids.includes(id))
  if (mode === 'radio') return [...ids]
  return [...new Set([...current, ...ids])]
}

export default function TabStrip({ machine, onRemove }) {
  const [expanded, setExpanded] = useState(false)
  const { focusedFeatureId, focusFeature } = useWizardCursor()
  const { definition, stepId, actions } = machine
  const mode = definition.selection?.mode ?? 'multiple'

  const tabs = definition.tabs(machine.context)
  if (!tabs.length) return null

  // The focused tab, resolved once: a tab's id or one of its features.
  const focusedTabId = tabs.find((tab) => tabIsFocused(tab, focusedFeatureId))?.id ?? null

  const overflowing = tabs.length > TAB_COLUMNS
  const shown = expanded || !overflowing ? tabs : collapsedTabs(tabs, focusedTabId)
  const hidden = tabs.length - shown.length

  // Every cell the list is about to hold: the tabs, plus the one affordance
  // that may follow them. Two caps, because App.css narrows to two columns on
  // a small stage and an INLINE custom property cannot be overridden from a
  // stylesheet -- so the narrow count travels with the wide one rather than
  // being clamped over there. See the media query.
  const cells = shown.length + (hidden > 0 || (expanded && overflowing) ? 1 : 0)

  return (
    <div
      className={`chrome-tabs${expanded ? ' chrome-tabs--expanded' : ''}`}
      data-testid={`tabs-${stepId}`}
      data-tab-count={tabs.length}
      data-tab-columns={tabColumns(cells)}
      data-expanded={expanded ? 'true' : 'false'}
      data-selection={mode}
      style={{
        '--tab-columns': tabColumns(cells),
        '--tab-columns-narrow': tabColumns(cells, TAB_COLUMNS_NARROW),
      }}
    >
      <ul className="chrome-tabs__list">
        {shown.map((tab) => {
          const focused = tab.id === focusedTabId
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
                  data-selection={mode}
                  role={mode === 'radio' ? 'radio' : undefined}
                  aria-checked={mode === 'radio' ? tab.selected !== false : undefined}
                  onClick={() =>
                    actions.setSelection(
                      stepId,
                      selectionAfterEye(machine.draft.selectedFeatureIds, tab, mode)
                    )
                  }
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
                  aria-label={`${definition.removeTab ? 'Discard' : 'Delete'} ${tab.name}`}
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
