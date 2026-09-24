/**
 * stepCards.js  —  THE PER-STEP CARDS, AS DATA.
 *
 * One entry per step that has a card:
 *
 *   { stepId: 'boundary', title: …, body: …, Animation: … }
 *
 * Keyed by the step's id and nothing else: stepDefinitions.js gains no
 * tutorial field, and a step's card is found here or nowhere. Adding a card
 * is an entry in this list and nothing more -- the overlay, the firing rules
 * (firing.js) and the help control (TutorialHelp) all read it without naming
 * a step. A step with no entry never auto-fires, and its help control opens
 * the deck instead.
 *
 * SHIPS EMPTY. The cards land one branch at a time, starting with boundary.
 */

export const STEP_CARDS = Object.freeze([])

/** The card registered for a step, or null. */
export function cardFor(registry, stepId) {
  if (!Array.isArray(registry) || stepId == null) return null
  return registry.find((card) => card.stepId === stepId) ?? null
}
