/**
 * prefs.js  —  WHAT THE TUTORIAL REMEMBERS ABOUT A PERSON, AND NOTHING ELSE.
 *
 * Two keys, browser-level, never on the wire:
 *
 *   kd.tutorial.seen   an array of ids: 'orientation', plus the id of every
 *                      step whose card was auto-opened and dismissed.
 *   kd.tutorial.auto   whether a step's card opens by itself on arrival.
 *                      Default true.
 *
 * A PREFERENCE ABOUT A PERSON, NOT A FACT ABOUT A PROPERTY. It does not enter
 * the Design Document, it is not in the session store, and it holds across
 * every session on every parcel. SessionStore.jsx does not know it exists.
 *
 * EVERY READ DEGRADES TO "NOTHING SEEN, AUTO ON". An absent key, a value that
 * does not parse, a value of the wrong shape, and a localStorage that throws
 * on access (a Safari private window) all read as the defaults. A write that
 * throws is kept in memory for the life of the page, so a person who unticks
 * the checkbox in a private window is not re-taught on the next step -- only
 * on the next visit, which is the honest answer when nothing can be stored.
 *
 * ONE MIGRATION. The deck used to write `keyline.tutorial.dismissed` when it
 * was closed. A person holding that key has already been taught and chose to
 * stop: it reads as 'orientation' seen and auto off, and the key is removed.
 * It runs once per page, and only when the new keys have never been written
 * -- the deck still writes the old key on close, and a person who has already
 * been through the gate must not have that turned into "tips off".
 *
 * A SUBSCRIBABLE STORE rather than a provider, so the help control inside the
 * shell and the gate outside it read the same answer without either having
 * to be mounted inside the other. React reads it through
 * useSyncExternalStore; the snapshot is re-read from storage on each render
 * and cached on the raw strings, so a test that clears localStorage sees the
 * defaults again without a reload.
 */

import { useSyncExternalStore } from 'react'

export const SEEN_KEY = 'kd.tutorial.seen'
export const AUTO_KEY = 'kd.tutorial.auto'

/**
 * The key the old deck wrote, and the name the brief gave it. The first is
 * what is actually in people's browsers; the second is migrated too so that
 * either spelling is taken as "already taught".
 */
export const LEGACY_DISMISSED_KEYS = Object.freeze(['keyline.tutorial.dismissed', 'kd.tutorial.dismissed'])

/** The orientation card's id in the seen list. */
export const ORIENTATION_ID = 'orientation'

export const DEFAULT_PREFS = Object.freeze({ seen: Object.freeze([]), auto: true })

function storage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** Parse the two raw strings into prefs; anything unusable is the default. */
export function parsePrefs(rawSeen, rawAuto) {
  let seen = DEFAULT_PREFS.seen
  if (rawSeen != null) {
    try {
      const value = JSON.parse(rawSeen)
      if (Array.isArray(value)) seen = Object.freeze(value.filter((id) => typeof id === 'string'))
    } catch {
      /* malformed: nothing seen */
    }
  }
  let auto = DEFAULT_PREFS.auto
  if (rawAuto != null) {
    try {
      const value = JSON.parse(rawAuto)
      if (typeof value === 'boolean') auto = value
    } catch {
      /* malformed: auto on */
    }
  }
  return Object.freeze({ seen, auto })
}

/* ---------------------------------------------------------------------------
   The store
   --------------------------------------------------------------------------- */

const listeners = new Set()
let memory = DEFAULT_PREFS
let migrated = false
// True once a write has failed: from then on this page reads its own memory,
// since storage is holding an answer the person has since changed.
let pinned = false
let cache = { rawSeen: undefined, rawAuto: undefined, prefs: DEFAULT_PREFS }

/**
 * THE MIGRATION. Once per page. Returns nothing; its effect is on storage.
 * Exported so a test can run it against a prepared storage and see it act
 * exactly once.
 */
export function migrateLegacyDismissal() {
  if (migrated) return
  migrated = true
  try {
    const store = storage()
    if (!store) return
    const legacy = LEGACY_DISMISSED_KEYS.filter((key) => store.getItem(key) != null)
    if (!legacy.length) return
    const dismissed = legacy.some((key) => isTruthy(store.getItem(key)))
    const untouched = store.getItem(SEEN_KEY) == null && store.getItem(AUTO_KEY) == null
    if (dismissed && untouched) {
      store.setItem(SEEN_KEY, JSON.stringify([ORIENTATION_ID]))
      store.setItem(AUTO_KEY, JSON.stringify(false))
    }
    for (const key of legacy) store.removeItem(key)
  } catch {
    /* storage unavailable: nothing to migrate from */
  }
}

/** The old deck wrote '1'; "true" is the brief's word for the same thing. */
function isTruthy(raw) {
  return raw === '1' || raw === 'true'
}

/** The current prefs. Never throws. */
export function readPrefs() {
  migrateLegacyDismissal()
  if (pinned) return memory
  let rawSeen
  let rawAuto
  try {
    const store = storage()
    if (!store) return memory
    rawSeen = store.getItem(SEEN_KEY)
    rawAuto = store.getItem(AUTO_KEY)
  } catch {
    return memory
  }
  if (rawSeen === cache.rawSeen && rawAuto === cache.rawAuto) return cache.prefs
  cache = { rawSeen, rawAuto, prefs: parsePrefs(rawSeen, rawAuto) }
  return cache.prefs
}

function write(next) {
  memory = Object.freeze({ seen: Object.freeze([...next.seen]), auto: next.auto })
  try {
    const store = storage()
    if (store) {
      store.setItem(SEEN_KEY, JSON.stringify(memory.seen))
      store.setItem(AUTO_KEY, JSON.stringify(memory.auto))
    }
  } catch {
    /* unavailable: memory holds it for this page */
    pinned = true
  }
  // A write that storage refused must still be what the page reads.
  cache = { rawSeen: undefined, rawAuto: undefined, prefs: memory }
  for (const listener of listeners) listener()
}

/** Add an id to the seen list. Idempotent. */
export function markSeen(id) {
  const current = readPrefs()
  if (current.seen.includes(id)) return
  write({ seen: [...current.seen, id], auto: current.auto })
}

/** Set whether step cards open by themselves. */
export function setAuto(auto) {
  const current = readPrefs()
  if (current.auto === auto) return
  write({ seen: current.seen, auto })
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The prefs, as React state. */
export function useTutorialPrefs() {
  return useSyncExternalStore(subscribe, readPrefs, readPrefs)
}

/** For tests: forget the in-page memory and let the migration run again. */
export function resetTutorialPrefsForTests() {
  memory = DEFAULT_PREFS
  migrated = false
  pinned = false
  cache = { rawSeen: undefined, rawAuto: undefined, prefs: DEFAULT_PREFS }
}
