/**
 * tabs.js  —  WHAT A TAB IS, READ RATHER THAN RENDERED.
 *
 * A TAB IS THE UNIT OF THE COMMIT DECISION. stepDefinitions declares the shape
 * (`{id, name, rows, featureIds?, checkbox?, removable?}`); TabStrip.jsx draws
 * it. THESE FOUR FUNCTIONS ARE THE READINGS OF IT, and they live in a module of
 * their own because the strip is no longer the only reader: WizardCursor
 * applies `selection.follows` to every focus move, wherever the move came from,
 * and a provider importing a component to do it would be a cycle (TabStrip
 * imports the cursor) as well as a lie about where the rule lives.
 *
 * NO REACT IN HERE, deliberately, for the same reason panelFormat.js has none:
 * a component in this file would put one into every module that imports it.
 */

/** The feature ids a tab's checkbox toggles: what it declares, or its own id. */
export function featureIdsOf(tab) {
  return Array.isArray(tab.featureIds) && tab.featureIds.length ? tab.featureIds : [tab.id]
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

/**
 * THE SELECTION AFTER ONE BOX IS TICKED, in the step's declared mode.
 *
 * IT WAS selectionAfterEye(), AND THE BODY BELOW IS UNCHANGED. The eye became
 * a checkbox in shape and in label, and this is the EFFECT -- which the
 * change did not touch, in either direction, for any mode. The rename is the
 * label finishing its job: a helper named after a control nothing renders any
 * more is the next reader's wrong turn.
 *
 *   multiple  every box is its own: the tab's features join the set or leave
 *             it, and nothing else moves.
 *   radio     one or none: ticking a tab is the whole selection -- every
 *             other tab's features leave -- and un-ticking it leaves the set
 *             empty. Commit-one-or-none, read off the definition rather than
 *             off which step this is; the backend says the same thing as
 *             `max_features: 1` counted by network.
 */
export function selectionAfterCheck(current, tab, mode) {
  const ids = featureIdsOf(tab)
  const isOn = tab.selected !== false
  if (isOn) return current.filter((id) => !ids.includes(id))
  if (mode === 'radio') return [...ids]
  return [...new Set([...current, ...ids])]
}

/**
 * THE WHOLE SELECTION OF A STEP THAT DECLARES `selection: { follows: 'focus' }`,
 * GIVEN WHAT IS FOCUSED. One function, and it is the entirety of that field's
 * meaning.
 *
 * RADIO BY CONSTRUCTION, NOT BY ARITHMETIC. It returns the focused tab's
 * features and nothing else, so every other tab's features are out by not being
 * in the answer -- there is no "un-tick the others" step to forget. defineStep
 * refuses `follows: 'focus'` beside `mode: 'multiple'` for exactly this reason:
 * one focus slot holds one feature, and a set built from one feature is a
 * radio whatever the mode field says.
 *
 * NOTHING FOCUSED IS AN EMPTY SELECTION, and that is the legal empty commit
 * (`min_features: 0`) rather than an edge case to guard. It is also what makes
 * the map and the strip agree in the one direction that used to fail silently:
 * `show: 'focused'` draws nothing when nothing is focused, so a selection that
 * survived a blur would be a commit with no geometry on screen.
 *
 * A TAB WITH NO CHECKBOX SELECTS NOTHING. Roads keeps a tab for an access
 * point that routed nothing, so the slot can still be discarded; there is no
 * network on it to commit. Reading it is therefore reading nothing committable,
 * and `featureIdsOf` -- which falls back to the tab's own id -- must not be let
 * near it, or the commit would carry a network id that is not a feature.
 */
export function selectionFollowingFocus(tabs, focusedFeatureId) {
  if (focusedFeatureId == null) return []
  const tab = tabs.find((entry) => tabIsFocused(entry, focusedFeatureId))
  return tab?.checkbox ? featureIdsOf(tab) : []
}
