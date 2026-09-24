/**
 * TutorialContext.jsx  —  THE TWO THINGS THE HELP CONTROL IS TOLD FROM OUTSIDE.
 *
 *   THE REGISTRY   which steps have a card. Production reads STEP_CARDS; a
 *                  test hands in a fixture. Nothing else differs.
 *   READY          whether a step's card may open by itself yet. False only
 *                  while the gate is handing over (the orientation card
 *                  leaving, the chrome settling), so the boundary card
 *                  arrives after the chrome and not on top of its entrance.
 *
 * BOTH DEFAULT TO PRODUCTION: no provider means the shipped registry and
 * ready. The shell mounts with neither in every test that renders it bare.
 */

import { createContext, useContext } from 'react'

import { STEP_CARDS } from './stepCards.js'

const RegistryContext = createContext(STEP_CARDS)
const ReadyContext = createContext(true)

export function StepCardRegistry({ cards, children }) {
  return <RegistryContext.Provider value={cards}>{children}</RegistryContext.Provider>
}

export function TutorialReady({ ready, children }) {
  return <ReadyContext.Provider value={ready}>{children}</ReadyContext.Provider>
}

export const useStepCardRegistry = () => useContext(RegistryContext)
export const useTutorialReady = () => useContext(ReadyContext)
