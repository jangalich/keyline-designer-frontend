/**
 * stepInputs.js
 *
 * WHAT A DECLARED INPUT COMMITS WITH, and whether a commit may go out at all.
 *
 * ITS OWN MODULE FOR ONE REASON: BOTH SIDES READ IT. stepDefinitions.js
 * assembles a commit body's `inputs` from the declarations, and
 * useStepMachine.js refuses a commit whose required inputs have no value --
 * and those two files already import each other's constants in one
 * direction (the definitions key their chrome by the machine's states). A
 * second direction would be a cycle whose failure depends on which file
 * happens to load first. So the helpers live here, import nothing, and are
 * re-exported by stepDefinitions.js for every caller that reads them there.
 */

/**
 * THE VALUE A DECLARED INPUT COMMITS WITH, or undefined when it has none.
 *
 * `commitValue(context)` when the input declares one -- roads commits the
 * access points the SERVER recorded, not the one pending in the draft -- and
 * the draft's own value otherwise, which is what the boundary's ring and every
 * generate parameter already were. Undefined means MISSING, and for a required
 * input that is a refusal (see requiredInputsMissing and buildCommitBody),
 * never an empty commit.
 */
export function commitValueOf(input, context) {
  if (typeof input.commitValue === 'function') return input.commitValue(context)
  return context.draft?.inputs?.[input.key]
}

/** The required inputs a commit would go out without, by key. */
export function requiredInputsMissing(definition, context) {
  return (definition.inputs ?? [])
    .filter((input) => input.required && commitValueOf(input, context) === undefined)
    .map((input) => input.key)
}

/**
 * The `inputs` object a commit sends, assembled from the declarations.
 *
 * ALWAYS AN OBJECT WHEN THE STEP DECLARES INPUTS -- even an empty list for a
 * list-valued input is sent, because "no access point was ever placed" is a
 * value and a missing key is not. The gap this closes: buildCommitBody sent
 * `inputs` only when the draft's were non-empty, so a lost input left the key
 * OFF the body and the server read an absent decision. Roads is the first
 * step to commit inputs and the server now 400s a body without them; this
 * side refuses first, by construction, through requiredInputsMissing.
 */
export function commitInputsFor(definition, context) {
  if (!definition.inputs?.length) return undefined
  const missing = requiredInputsMissing(definition, context)
  if (missing.length) {
    throw new Error(
      `Step '${definition.id}' cannot commit: its required input(s) ` +
        `${missing.join(', ')} have no value. An absent input is not a decision.`
    )
  }
  const inputs = {}
  for (const input of definition.inputs) {
    const value = commitValueOf(input, context)
    if (value !== undefined) inputs[input.commitKey ?? input.key] = value
  }
  return inputs
}
