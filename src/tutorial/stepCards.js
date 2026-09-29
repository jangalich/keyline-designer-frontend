/**
 * stepCards.js  —  THE PER-STEP CARDS, AS DATA.
 *
 * One entry per step that has a card, in one of two shapes:
 *
 *   { stepId: 'boundary', title: …, body: …, Animation: … }
 *   { stepId: 'landform', cards: [{ id, title, body, emphasis?, Animation }, …] }
 *
 * The first is one card; the second is a step that needs more than one, and
 * its card pages between them with the deck's own dots and Back/Next. The
 * one-card shape stays as it was rather than becoming a list of one: it is
 * what boundary shipped as. cardsOf() reads either as a list, and nothing
 * past it needs to know which shape an entry is.
 *
 * `emphasis`, where a card has it, is a clause of `body` -- present in it
 * verbatim -- that the card sets in weight. The body stays the whole string
 * so the copy is asserted as the reader reads it.
 *
 * Keyed by the step's id and nothing else: stepDefinitions.js gains no
 * tutorial field, and a step's card is found here or nowhere. Adding a card
 * is an entry in this list and nothing more -- the overlay, the firing rules
 * (firing.js) and the help control (TutorialHelp) all read it without naming
 * a step. A step with no entry never auto-fires, and its help control opens
 * the deck instead.
 *
 * The cards land one branch at a time: boundary, then landform.
 */

import { BOUNDARY_CARD } from './boundaryCard.jsx'
import { LANDFORM_CARD } from './landformCards.jsx'

export const STEP_CARDS = Object.freeze([BOUNDARY_CARD, LANDFORM_CARD])

/** The card registered for a step, or null. */
export function cardFor(registry, stepId) {
  if (!Array.isArray(registry) || stepId == null) return null
  return registry.find((card) => card.stepId === stepId) ?? null
}

/** An entry's cards, in order: its `cards`, or the entry itself as the one. */
export function cardsOf(entry) {
  if (!entry) return []
  return Array.isArray(entry.cards) ? entry.cards : [entry]
}
