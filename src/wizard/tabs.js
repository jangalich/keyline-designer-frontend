/**
 * tabs.js  —  WHAT A TAB IS, READ RATHER THAN RENDERED.
 *
 * A TAB IS THE UNIT OF THE COMMIT DECISION. stepDefinitions declares the shape
 * (`{id, name, rows, featureIds?, checkbox?, removable?}`); TabStrip.jsx draws
 * it. THESE FIVE FUNCTIONS ARE THE READINGS OF IT, and they live in a module of
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


/**
 * THE TABS OF A COMMITTED STEP: ITS COMMIT, AND NOT THE CONTROLS THAT MADE IT.
 *
 * A step's `tabs()` is written for a step being DECIDED, and it is read here
 * against a context whose draft IS the commit (useStepMachine's
 * committedDraft). So the list that comes in is everything the step was
 * choosing between, with the chosen ones marked. Two things have to happen to
 * it, and they are the two halves of "the design IS the committed set".
 *
 * ONLY WHAT COMMITTED SURVIVES. A candidate the user declined is not part of
 * the design and has no place on the strip describing it; neither does a zone
 * they drew and then took back out before committing. Both are still knowable
 * -- the candidate set is kept (SessionStore's reviewProposals) and a draft can
 * outlive a hydrate -- and neither is the answer. What they are is the state
 * BEFORE the decision, and getting that back is what the reopen is for, which
 * is why the reopen regenerates and names its cascade.
 *
 * NARROWED BY FEATURE ID, WHICH IS THE ONE THING EVERY STEP'S TABS AGREE ON. A
 * tab may stand for several features (roads' network, fencing's type), so it
 * survives on the ones that committed and reports only those -- a fence type
 * half of which committed is that half, named by the ids the document holds.
 *
 * AND A TAB THAT NAMES NO FEATURE AT ALL IS UNTOUCHED. The boundary's tab is
 * the parcel's own readout, keyed by an INPUT rather than by a feature;
 * narrowing it against a feature set would delete the one tab that is always
 * correct. What tells the two apart is namesFeatures() below and not a step
 * id -- and note that "names no feature" is narrower than "has no checkbox".
 * Roads keeps a checkbox-less tab for an access point that ROUTED NOTHING, and
 * that one declares `featureIds: []`: it is a slot rather than a readout, there
 * is no committed geometry on it, and it goes.
 *
 * NO CHECKBOX AND NO ×, REMOVED RATHER THAN DISABLED. The commit set is fixed
 * until a reopen, so a box here is either pressable and inert -- the failure
 * the interaction branch spent a whole branch closing -- or a control that
 * appears to change a decision that is made. And nothing can be destroyed
 * without a reopen, so the × has nothing to do. A tab in review is an identity
 * and a click target, and the absence is the honest way to say so: TabStrip
 * renders neither control when neither flag is set, so there is nothing in the
 * DOM to press.
 */
export function reviewTabs(tabs, committedIds) {
  const kept = []
  for (const tab of tabs) {
    if (!namesFeatures(tab)) {
      kept.push({ ...tab, removable: false })
      continue
    }
    const featureIds = featureIdsOf(tab).filter((id) => committedIds.has(id))
    if (!featureIds.length) continue
    kept.push({ ...tab, featureIds, checkbox: false, removable: false })
  }
  return kept
}

/**
 * DOES THIS TAB STAND FOR FEATURES -- declared, or by featureIdsOf()'s
 * fallback to its own id.
 *
 * A DECLARED `featureIds` SAYS YES EVEN WHEN IT IS EMPTY, which is the case
 * worth spelling out: an empty list is a tab that stands for features and has
 * none, not a tab that stands for something else. A CHECKBOX also says yes,
 * because a box commits the fallback id and a step would not offer one over an
 * id that is not a feature -- the same reading selectionFollowingFocus() makes
 * from the other side.
 */
function namesFeatures(tab) {
  return Array.isArray(tab.featureIds) || tab.checkbox === true
}
