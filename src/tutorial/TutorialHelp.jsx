/**
 * TutorialHelp.jsx  —  THE HELP CONTROL, AND THE ONE TIME THE OVERLAY OPENS ITSELF.
 *
 * A small circled ? at the foot of the step rail, below the last step. The
 * rail is the only persistent, navigational region and it is present in
 * every machine state, which is why the control goes there and not in the
 * detail panel, the tab strip or the action banner -- all of which hold
 * content that changes. It is labelled for a screen reader ("How the map
 * works") and opens the overlay at card 1.
 *
 * AUTO-OPEN, EXACTLY ONCE, AND ONLY FOR A FIRST-TIME USER.
 *
 *   AFTER THE TILES PAINT, NOT ON MOUNT. Opening over a grey rectangle
 *   teaches nothing, and it is the moment a user's hand is already moving
 *   toward the dismiss. The map is Leaflet's and lives inside App.jsx's
 *   MapContainer, which this branch does not touch -- so the paint is read
 *   off the DOM rather than off a map event: Leaflet marks each tile element
 *   `leaflet-tile-loaded` when its image arrives (GridLayer._tileReady), and
 *   a MutationObserver waits for the first one. That is a contract with
 *   Leaflet's documented CSS classes, not with its internals, and it holds
 *   from outside the map without a hook in src/map/.
 *
 *   FIRST SESSION ONLY. A user who already holds a session id -- in the URL
 *   or in localStorage, which is what a resume reads -- is not on their
 *   first session, and a user resuming one in progress never sees this open
 *   by itself. The check is made once, at mount, off the same readers the
 *   store uses to resume, and again against the live store at the moment of
 *   opening: if a session has started by the time the tiles paint, the user
 *   is already working and this stays down.
 *
 *   DISMISSED ONCE IS DISMISSED FOR GOOD. Every way out writes
 *   `kd.tutorial.dismissed` to localStorage, and with that key present it
 *   never auto-opens again -- on any session, on any parcel. The help
 *   control is the only way back in.
 *
 * DISMISSAL IS A BROWSER PREFERENCE, NOT A DOCUMENT FACT. It lives beside
 * the session id in localStorage and nowhere near the session store: it says
 * nothing about the design, it must not survive into a document, and it
 * must not go on the wire. SessionStore.jsx is untouched.
 */

import { useEffect, useRef, useState } from 'react'

import { initialSessionId, useSession } from '../session/SessionStore'
import TutorialOverlay from './TutorialOverlay.jsx'

/** The localStorage key, beside `keyline.sessionId`. */
export const TUTORIAL_DISMISSED_KEY = 'kd.tutorial.dismissed'

/** What the control says to a screen reader. */
export const HELP_LABEL = 'How the map works'

/** Leaflet's own mark on a tile whose image has arrived. */
const TILE_LOADED_SELECTOR = '.leaflet-tile-loaded'

// Guarded like the store's own reads: localStorage throws in a Safari private
// window and is absent outside a DOM, and neither is a reason not to render.
function safeStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function readTutorialDismissed() {
  try {
    return safeStorage()?.getItem(TUTORIAL_DISMISSED_KEY) != null
  } catch {
    return false
  }
}

export function persistTutorialDismissed() {
  try {
    safeStorage()?.setItem(TUTORIAL_DISMISSED_KEY, '1')
  } catch {
    /* private mode: it will open again next time, which is the honest answer */
  }
}

/** Has at least one map tile painted? Read off Leaflet's DOM, see above. */
export function tilesPainted(root = typeof document !== 'undefined' ? document : null) {
  return root != null && root.querySelector(TILE_LOADED_SELECTOR) != null
}

/**
 * True once the first tile has painted. Observes only while `enabled` -- a
 * user who has already dismissed the overlay pays nothing for this -- and
 * stops observing on the first paint, so it is one observer for one event.
 */
export function useTilesPainted(enabled) {
  const [painted, setPainted] = useState(() => enabled && tilesPainted())

  useEffect(() => {
    if (!enabled || painted) return undefined
    if (tilesPainted()) {
      setPainted(true)
      return undefined
    }
    if (typeof MutationObserver === 'undefined') return undefined
    const observer = new MutationObserver(() => {
      if (!tilesPainted()) return
      observer.disconnect()
      setPainted(true)
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [enabled, painted])

  return painted
}

export default function TutorialHelp() {
  const { state } = useSession()
  const [open, setOpen] = useState(false)
  const button = useRef(null)

  // FIRST-TIME USER? Decided once, at mount: no dismissal on record, and no
  // session id anywhere a resume would find one. Neither changes while the
  // page is up in a way that should make a non-first user into a first one.
  const [candidate] = useState(() => !readTutorialDismissed() && initialSessionId() == null)
  const autoOpened = useRef(false)
  const painted = useTilesPainted(candidate && !autoOpened.current)

  useEffect(() => {
    if (!candidate || autoOpened.current || !painted) return
    // The live check: a session that started before the tiles painted is a
    // user already at work, and this does not open over them.
    if (state.sessionId != null || readTutorialDismissed()) return
    autoOpened.current = true
    setOpen(true)
  }, [candidate, painted, state.sessionId])

  function close() {
    persistTutorialDismissed()
    setOpen(false)
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className="chrome-rail__help"
        aria-label={HELP_LABEL}
        aria-haspopup="dialog"
        aria-expanded={open ? 'true' : 'false'}
        data-testid="tutorial-help"
        onClick={() => setOpen(true)}
      >
        <span className="chrome-rail__help-glyph" aria-hidden="true">
          ?
        </span>
      </button>
      <TutorialOverlay open={open} onClose={close} initialCard={0} />
    </>
  )
}
