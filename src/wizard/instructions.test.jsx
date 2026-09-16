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
 * FOUR CLAIMS, AND THE LAST TWO ARE THE ONES WORTH HAVING:
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
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import InstructionBar from './shell/InstructionBar.jsx'
import { STEP_DEFINITIONS, WATER_STEP } from './stepDefinitions'
import { COMMITTING, EDITING, IDLE, REVIEWING } from './useStepMachine'

const byId = (id) => STEP_DEFINITIONS.find((step) => step.id === id)

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
   dropped-below-the-floor count, trees' acreage left to score, structures'
   road-distance tier and its rough shading proxy. The assertions below are the
   ones that keep it that way.
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
    // THE NOTES THEMSELVES, by the phrase each one turns on. Every one of
    // these still renders -- as a notice, which is what the case below
    // asserts. None of them may reappear in a direction.
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
   4. THE NOTICE STACK STILL RENDERS WHAT SURVIVED
   ===========================================================================
   The instruction line was replaced; the notice mechanism was not touched. The
   case that proves it is water's, and it is the case worth proving: a WITHHELD
   area passed every test the pipeline applies and is being held back only by
   the backend's presentation rule. Nothing else in the interface says those
   areas exist. Losing that line while replacing the sentence above it would be
   a silent deletion of the only place a user can learn it.
   =========================================================================== */

describe('4. the notices the copy pass left alone', () => {
  /** A water payload whose summary carries a presentation that withheld some. */
  const WITHHELD = {
    survey_zones: { features: [] },
    summary: {
      zone_count: 6,
      presentation: {
        presented_count: 4,
        withheld_count: 2,
        rule_applied: '2 embankment + 1 excavated + 1 embankment backfill',
      },
    },
  }

  it('renders water’s withheld-areas notice under the new instruction line', () => {
    const ui = bar({
      definition: WATER_STEP,
      chromeState: REVIEWING,
      context: { proposals: WITHHELD, draft: { drawnFeatures: [], selectedFeatureIds: [] } },
    })

    // THE DIRECTION IS THE NEW ONE...
    expect(ui.direction()).toBe(WATER_STEP.instructions[REVIEWING])

    // ...AND THE NOTICE IS STILL UNDER IT, with the payload's own counts and
    // the payload's own rule, and the clause that carries the information:
    // these passed, and you cannot pick them here.
    const withheld = ui.notice('withheld')
    expect(withheld).not.toBeNull()
    expect(withheld).toContain('passed every test')
    expect(withheld).toContain('cannot be selected here')
    expect(withheld).toContain('2 embankment + 1 excavated + 1 embankment backfill')
    // The counts came from the payload and are in the data face.
    expect(withheld).toContain('4')
    expect(withheld).toContain('6')
    expect(withheld).toContain('2')
  })

  it('leaves the stack empty when the payload has nothing to add', () => {
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
