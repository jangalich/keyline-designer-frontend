/**
 * cards.jsx  —  THE FOUR CARDS, AS DATA.
 *
 * Title, body and one looping animation each. The overlay (TutorialOverlay)
 * reads this list and nothing else about a card, so adding, removing or
 * reordering one is an edit HERE and not to the overlay -- the dots, the
 * "Next"/"Got it" switch and the keyboard paging all count off `CARDS.length`.
 *
 * THE COPY IS THE SPEC'S, VERBATIM, and tutorial.test.jsx asserts the strings
 * character for character so a rewrite fails rather than drifts. Two of the
 * bodies deliberately echo the instruction bar (landform's EDITING line is
 * card 2's first two sentences); the cards echo the bar, they do not replace
 * it, and stepDefinitions.js gains nothing for them.
 *
 * NAMING: regions are described BY POSITION -- "the tabs along the bottom",
 * "the panel on the right" -- never by an internal name. The interface labels
 * none of these regions, and a tutorial that teaches vocabulary the user will
 * never see again is teaching the wrong thing.
 *
 * Card 4's last sentence is the point of the whole overlay. It is the rule
 * visibleFeatures() (src/map/layers.jsx) already enforces -- in the editable
 * band an unticked feature is not rendered -- and roads' `selection.follows`
 * keeps it true there too. It carries no caveat because it needs none.
 */

import { DrawAnimation, OverviewAnimation, ReadAnimation, TickAnimation } from './animations.jsx'

export const CARDS = Object.freeze([
  Object.freeze({
    id: 'overview',
    title: "What you're looking at",
    body:
      'Everything sits on top of the map. Five places, and they stay where they are: the steps ' +
      'down the left, what to do next across the top, the measurements on the right, the tabs ' +
      'along the bottom, and the buttons for this step at the bottom right.',
    Animation: OverviewAnimation,
  }),
  Object.freeze({
    id: 'draw',
    title: 'Draw your own',
    body:
      'Click to place each corner. Click the first corner to close. Available on the boundary, ' +
      'on production blocks, and on tree zones.',
    Animation: DrawAnimation,
  }),
  Object.freeze({
    id: 'read',
    title: 'Click to read',
    body:
      'Click a feature on the map, or its tab along the bottom, to see its measurements. This ' +
      'opens the panel on the right and changes nothing else.',
    Animation: ReadAnimation,
  }),
  Object.freeze({
    id: 'tick',
    title: 'Tick what you want',
    body:
      'A tab\'s checkbox controls whether that feature is drawn on the map. Untick it and it ' +
      "disappears; tick it and it comes back. What's on the map when you commit is what gets " +
      'committed.',
    Animation: TickAnimation,
  }),
])
