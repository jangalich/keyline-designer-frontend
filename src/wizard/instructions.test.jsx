/**
 * instructions.test.jsx
 *
 * THE INSTRUCTION LINE IS COPY, AND THIS IS WHERE THE COPY IS HELD.
 *
 * Every other suite asserts an instruction in passing, on its way to something
 * else: shell.test.jsx reads boundary's while it walks the draw, structures'
 * own suite reads the placement line while it arms the tool. That is the right
 * place for "the bar moved with the state" and the wrong place for "the seven
 * steps say what they were written to say" -- the second is a claim about the
 * SET, and a claim about a set has to be made against the set.
 *
 * FOUR CLAIMS ABOUT THE LINE, AND A FIFTH ABOUT THE NOUN UNDER IT:
 *
 *   EVERY DECLARED LINE RENDERS. Not "the definitions hold strings" -- that is
 *   the schema's own check and it already runs at definition time. This mounts
 *   the shipped bar against every state every shipped step declares and reads
 *   what came out, which is the only thing that catches a state whose key the
 *   chrome never looks up.
 *
 *   THE INSTRUCTION LINE CARRIES NO RESULT. A direction tells you what to do
 *   with your hands; what the generate FOUND is a notice, and the difference
 *   matters because a notice can be dismissed from the reading order by
 *   getting the tone wrong and a direction cannot. Asserted as an absence over
 *   every string, so a figure dropped into a direction fails here rather than
 *   being noticed on a screenshot.
 *
 *   AND THE NOTICES SURVIVED IT. Water's withheld-areas line is the case the
 *   absence above could have taken with it: it says that ground which passed
 *   every test exists and cannot be selected on this step, which is available
 *   NOWHERE ELSE in the interface. It is asserted by name.
 *
 *   LANDFORM SAYS ONE NOUN. The strip and the panel renamed a zone to a block
 *   before this copy pass; the instruction line joined them and the rest of the
 *   step followed. Held in 7 below, against the step's surfaces rather than
 *   against any one string, because "block" and "zone" in one step is precisely
 *   the kind of split no single file shows you.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import InstructionBar from './shell/InstructionBar.jsx'
import { LANDFORM_SHAPE, STEP_DEFINITIONS, WATER_STEP } from './stepDefinitions'
import { COMMITTING, EDITING, IDLE, REVIEWING } from './useStepMachine'

const byId = (id) => STEP_DEFINITIONS.find((step) => step.id === id)

/** A parcel to clamp a drawn shape against. A square over lower Manhattan. */
const PARCEL = [
  [40.72, -74.005],
  [40.72, -74.0],
  [40.725, -74.0],
  [40.725, -74.005],
]

/** Every instruction string the seven shipped steps declare, in one list. */
const EVERY_LINE = STEP_DEFINITIONS.flatMap((step) =>
  Object.entries(step.instructions).map(([state, line]) => ({ step: step.id, state, line }))
)

/**
 * THE BAR, MOUNTED ALONE, over a machine that is doing nothing but holding a
 * state.
 *
 * The shell is not in the way on purpose. What is being read here is the bar's
 * two slots against a definition and a state, and every other thing the shell
 * would bring -- a session, a cursor, a document -- is a way for this to fail
 * for a reason that is not about the copy.
 */
function renderBar({ definition, chromeState, context = {} }) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  const machine = {
    definition,
    stepId: definition.id,
    machineState: chromeState,
    reachable: true,
    blockedBy: null,
    failedLayer: null,
    noCandidate: null,
    rejectedFeatureIds: [],
    rejections: {},
    commitFailure: null,
    error: null,
    context,
  }

  React.act(() => {
    root.render(
      <InstructionBar machine={machine} chromeState={chromeState} definitions={new Map()} />
    )
  })

  return {
    container,
    direction: () =>
      container.querySelector(`[data-testid="instruction-${definition.id}"]`)?.textContent ?? null,
    notice: (key) =>
      container.querySelector(`[data-testid="notice-${key}-${definition.id}"]`)?.textContent ??
      null,
    noticeCount: () => container.querySelectorAll('.chrome-bar__notice').length,
    unmount() {
      React.act(() => root.unmount())
      container.remove()
    },
  }
}

const mounted = []
function bar(args) {
  const ui = renderBar(args)
  mounted.push(ui)
  return ui
}

afterEach(() => {
  while (mounted.length) mounted.pop().unmount()
})

/* ===========================================================================
   1. EVERY STEP RENDERS ITS DECLARED LINE IN EVERY STATE IT HAS
   =========================================================================== */

describe('1. the declared line reaches the bar', () => {
  for (const step of STEP_DEFINITIONS) {
    it(`renders ${step.id}'s line in each of its ${
      Object.keys(step.instructions).length
    } declared states`, () => {
      for (const [state, line] of Object.entries(step.instructions)) {
        const ui = bar({ definition: step, chromeState: state })
        expect(ui.direction(), `${step.id} / ${state}`).toBe(line)
      }
    })
  }

  /**
   * AND NO STEP IS SAYING ONE THING IN TWO STATES BY ACCIDENT.
   *
   * A duplicated line is not a schema error and never will be -- fencing's
   * unreachable `editing` line is deliberately its own sentence -- but a step
   * whose idle and reviewing lines are the same string is a copy edit that
   * landed in one key and not the other, which is exactly the failure this
   * whole file exists to catch.
   */
  it('gives each of the four states a user acts in its own sentence', () => {
    const ACTED_IN = [IDLE, EDITING, REVIEWING, COMMITTING]
    for (const step of STEP_DEFINITIONS) {
      const lines = ACTED_IN.map((state) => step.instructions[state]).filter(Boolean)
      expect(new Set(lines).size, `${step.id} repeats a line`).toBe(lines.length)
    }
  })
})

/* ===========================================================================
   2. ROADS, WHICH HAS THE EXTRA STATE
   ===========================================================================
   Roads is the only step with a declared `user_input`, and the state that
   collects it is a real stop on the way through: the access-point tool is
   armed, generate is not reachable yet, and the bar has to say so. Four
   states, four sentences, and the point is that they are FOUR -- a step that
   said the same thing while placing a point and while choosing between routed
   networks would be a step whose extra state is invisible.
   =========================================================================== */

describe('2. roads says four different things', () => {
  it('renders a distinct line in idle, input-collection, choosing and committing', () => {
    const roads = byId('roads')

    // The input-collection state is roads' `editing` -- the arming is what
    // puts the chrome there, and the arming is what the access point needs.
    // See chromeState.js. It is the definition's own key, not a new one.
    expect(roads.inputs.length).toBe(1)

    const lines = [IDLE, EDITING, REVIEWING, COMMITTING].map((state) => {
      const ui = bar({ definition: roads, chromeState: state })
      return ui.direction()
    })

    expect(lines.every((line) => typeof line === 'string' && line.length > 0)).toBe(true)
    expect(new Set(lines).size).toBe(4)

    // AND EACH ONE IS ABOUT ITS OWN STATE, named by the thing that state is
    // for: the network in idle, the access point in input-collection, the
    // choice in reviewing, the save in committing.
    const [idle, input, choosing, committing] = lines
    expect(idle).toContain('road network')
    expect(input).toContain('access point')
    expect(choosing).toContain('Choose the road network')
    expect(committing).toContain('Saving')
  })
})

/* ===========================================================================
   3. NO RESULT-SPECIFIC TEXT IN ANY INSTRUCTION STRING
   ===========================================================================
   The split this asserts: a DIRECTION is what to do with your hands and is the
   same sentence on every parcel; a RESULT is what this run of this pipeline
   found on THIS parcel, and belongs in a notice where it can carry the
   payload's own figures in the data face.

   THREE STEPS CARRIED RESULT-SPECIFIC NOTES and every one of them was already
   a notice rather than instruction text -- water's withheld areas and its
   dropped-below-the-floor count (both since removed, with every other water
   notice), trees' acreage left to score, structures' road-distance tier and
   its rough shading proxy. The assertions below keep all of them out of the
   direction line.
   =========================================================================== */

describe('3. the instruction line carries no result', () => {
  it('holds no measured figure: every declared line is a plain string', () => {
    for (const { step, state, line } of EVERY_LINE) {
      // A measured value reaches the bar as a LIST OF PARTS with a {measure}
      // in it -- that is the only way a figure can be set in the data face,
      // and it is a notice's shape. A direction is a string, always.
      expect(typeof line, `${step} / ${state}`).toBe('string')
      expect(line, `${step} / ${state} carries a figure`).not.toMatch(/\d/)
      expect(line, `${step} / ${state} carries a percentage`).not.toContain('%')
    }
  })

  it('holds none of the three steps’ result-specific notes', () => {
    // THE NOTES THEMSELVES, by the phrase each one turns on. Water's no
    // longer render at all (section 4); the rest still render as notices.
    // None of them may reappear in a direction.
    const RESULT_PHRASES = [
      // water: survived the tests and withheld by the presentation rule
      'passed every test',
      'cannot be selected here',
      // water: dropped under the minimum area floor
      'is not showing them',
      'minimum area floor',
      // trees: what was left to score after the three steps before it
      'were left to score',
      'After production, water and roads',
      // structures: which road the distances were measured to
      'committed route',
      // structures: shading from the terrain horizon alone
      'terrain horizon',
      'rough reading',
    ]

    for (const { step, state, line } of EVERY_LINE) {
      for (const phrase of RESULT_PHRASES) {
        expect(line, `${step} / ${state} carries "${phrase}"`).not.toContain(phrase)
      }
    }
  })
})

/* ===========================================================================
   4. WATER'S BAR CARRIES ITS INSTRUCTION AND NO STEP NOTICE
   ===========================================================================
   This section used to prove the notice stack survived the copy pass by
   rendering water's withheld-areas notice. Water's step-level notices were
   since removed at the user's request, so the case is now the opposite: a
   payload that USED to produce that notice renders the direction alone.
   =========================================================================== */

describe('4. water renders no step notices', () => {
  /** A water payload whose summary carries a presentation that withheld some. */
  const WITHHELD = {
    survey_zones: { features: [] },
    summary: {
      zone_count: 8,
      dropped_count: 3,
      soil_checked: false,
      presentation: {
        presented_count: 6,
        withheld_count: 2,
        rule_applied: '2 embankment + 2 excavated + 2 embankment clear-ground',
      },
    },
  }

  it('shows the instruction line and nothing under it, even for a payload that withheld areas', () => {
    const ui = bar({
      definition: WATER_STEP,
      chromeState: REVIEWING,
      context: { proposals: WITHHELD, draft: { drawnFeatures: [], selectedFeatureIds: [] } },
    })
    expect(ui.direction()).toBe(WATER_STEP.instructions[REVIEWING])
    expect(ui.notice('withheld')).toBeNull()
    expect(ui.noticeCount()).toBe(0)
  })

  it('leaves the stack empty with no payload at all', () => {
    const ui = bar({
      definition: WATER_STEP,
      chromeState: REVIEWING,
      context: { proposals: null, draft: { drawnFeatures: [], selectedFeatureIds: [] } },
    })
    expect(ui.noticeCount()).toBe(0)
    expect(ui.direction()).toBe(WATER_STEP.instructions[REVIEWING])
  })
})

/* ===========================================================================
   6. complement, NOT compliment
   ===========================================================================
   Trees' reviewing line asks the user to choose zones that COMPLEMENT the
   design -- complete it, go well with it. `compliment` is praise, and it is
   one keystroke away in a line that has been through several rounds of
   editing. Held here because a spellchecker will not catch it: both are words.
   =========================================================================== */

describe('6. the word in trees is complement', () => {
  it('spells complement in trees’ reviewing line, and compliments nothing anywhere', () => {
    expect(byId('trees').instructions[REVIEWING]).toContain('complement your design')

    for (const { step, state, line } of EVERY_LINE) {
      expect(line.toLowerCase(), `${step} / ${state}`).not.toContain('compliment')
    }
  })
})

/* ===========================================================================
   7. LANDFORM SAYS BLOCK, EVERYWHERE A USER READS IT
   ===========================================================================
   The strip and the panel have said "Block N" since the rename landed; the
   instruction line joined them, and the rest of the step followed -- the blurb,
   the generate, the commit, the draw tool, the committed line, the reset note,
   and what a drawn shape calls itself.

   ONE NOUN, AND THIS IS WHERE IT IS HELD. A step that says "block" on the strip
   and "zone" on the button is a step whose two halves were edited on different
   days, and there is no single file a reader would notice it in -- the strings
   are spread across a tool button, a commit label, a shape's close(), and six
   instruction keys. So the claim is made against the SURFACES rather than
   against any one of them.

   THE WIRE IS NOT IN SCOPE AND MUST NOT BE. `suggested_zones`, the payload's
   `zones` table, the `production_area_candidate` layer and every feature id in
   it are the backend's own names, the commit joins on them, and the rename was
   always a display-prose rename. Nothing below reads an identifier.

   AND IT IS LANDFORM'S ALONE. Water surveys zones, trees plant zones, and both
   say so on purpose -- see the tree line asserted in 6 above. The assertion is
   scoped to the one step whose noun changed.
   =========================================================================== */

describe('7. landform’s noun is block', () => {
  const landform = byId('landform')

  /**
   * A stub rich enough for a label, and no richer. Every button's label is a
   * function of the chrome context -- the commit reads `machine.commitLabel`,
   * the reopen reads `machine.definition.reopen.label` -- so the labels cannot
   * be read off the definition without one.
   */
  const labelContext = {
    machine: {
      definition: landform,
      commitLabel: landform.commit.label({ committableCount: 2 }),
      canCommit: true,
      canReopen: true,
    },
  }

  /** Every string this step puts in front of a user, by where it comes from. */
  function userFacingStrings() {
    const out = []
    for (const [state, line] of Object.entries(landform.instructions)) {
      out.push([`instructions.${state}`, line])
    }
    out.push(['blurb', landform.blurb])
    out.push(['generate.label', landform.generate.label])
    out.push(['commit.label (empty)', landform.commit.label({ committableCount: 0 })])
    out.push(['commit.label (some)', landform.commit.label({ committableCount: 3 })])
    out.push(['reopen.label', landform.reopen.label])
    out.push(['reopen.confirmTitle', landform.reopen.confirmTitle])

    for (const [state, buttons] of Object.entries(landform.buttons)) {
      for (const button of buttons) {
        out.push([`buttons.${state}.${button.key}`, button.label(labelContext)])
      }
    }

    // THE TABS AND THE PANEL, over one suggestion and one drawn shape -- the
    // two kinds of feature this step can hold, which name themselves
    // differently and could drift apart.
    const context = {
      proposals: { zones: [{ feature_id: 'production-area-1', rank: 1, area_acres: 4, score: 81 }] },
      draft: {
        selectedFeatureIds: [],
        drawnFeatures: [{ id: 'drawn-1', properties: { acres: 2.1, confidence: 'low' } }],
      },
    }
    for (const tab of landform.tabs(context)) out.push([`tabs.${tab.id}`, tab.name])
    out.push(['detail (suggested)', landform.detail(context, 'production-area-1').name])
    out.push(['detail (drawn)', landform.detail(context, 'drawn-1').name])

    return out
  }

  it('says block in every string the step puts in front of a user', () => {
    const strings = userFacingStrings()
    // The list is real: a refactor that stopped reaching a surface would make
    // this test pass by asserting nothing.
    expect(strings.length).toBeGreaterThanOrEqual(15)

    for (const [where, text] of strings) {
      expect(typeof text, `landform ${where}`).toBe('string')
      expect(text.toLowerCase(), `landform ${where} still says zone`).not.toContain('zone')
    }

    // AND THE NOUN IS ACTUALLY THERE, in the places whose whole job is to name
    // the thing -- otherwise "contains no 'zone'" is satisfied by silence.
    const at = (where) => strings.find(([w]) => w === where)?.[1]
    expect(at('generate.label')).toBe('Generate production blocks')
    expect(at('commit.label (some)')).toBe('Commit blocks')
    expect(at('commit.label (empty)')).toBe('Commit no blocks for this step')
    expect(at('buttons.reviewing.draw')).toBe('Draw a block')
    expect(at('tabs.production-area-1')).toBe('Block 1')
    expect(at('detail (drawn)')).toBe('Drawn block')
  })

  it('says block in what a drawn shape calls itself and in what refuses one', () => {
    // A ring nowhere near the parcel: the clamp keeps nothing and the gesture
    // is refused with a sentence rather than discarded.
    const refused = LANDFORM_SHAPE.close({
      points: [
        [10, 10],
        [10, 10.01],
        [10.01, 10.01],
      ],
      parcel: PARCEL,
      references: {},
    })
    expect(refused.feature).toBeNull()
    expect(refused.notice).toBe(
      'That block fell entirely outside the property boundary and was not added.'
    )

    // A ring inside it: the feature the commit contract receives names itself
    // in the step's own noun.
    const kept = LANDFORM_SHAPE.close({
      points: [
        [40.721, -74.004],
        [40.721, -74.001],
        [40.724, -74.001],
      ],
      parcel: PARCEL,
      references: {},
    })
    expect(kept.feature).not.toBeNull()
    expect(kept.feature.properties.label).toBe('Drawn block')
  })

  it('leaves the wire alone: the payload’s own names are untouched', () => {
    // The rename was display prose. The collection the commit reads, and the
    // layer the backend refuses a feature without, still spell it zone/area.
    expect(landform.proposalCollection).toBe('suggested_zones')
    expect(landform.layers.map((layer) => layer.key)).toContain('suggested_zones')
  })
})
