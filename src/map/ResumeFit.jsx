/**
 * ResumeFit.jsx
 *
 * A RETURNING USER OPENS ON THEIR OWN LAND.
 *
 * A resumed session hydrates every committed step, and before this the map
 * still opened at DEFAULT_VIEW with the design drawn somewhere off screen --
 * which reads as data loss at exactly the moment the product most needs to
 * look reliable. This fits the map to the committed boundary when the resume
 * lands. Once, instantly, and never again.
 *
 * BOUNDS, NOT A CENTRE AND A GUESSED ZOOM. fitBounds handles a long thin
 * parcel and a square one, five acres and a hundred, with no zoom heuristic.
 *
 * NOT ANIMATED. This is the initial view, not a navigation. A fly-in from the
 * default farmland would be slow and would look like the app was lost and
 * then found its way.
 *
 * KEYED TO THE RESUME LANDING -- `loading` THEN `ready` -- AND NOT TO `ready`.
 * The store hydrates on every commit, generate, reopen and discard, and every
 * one of those leaves `resume` at `ready` with the boundary in the document.
 * A fit keyed to the end state would re-fire on each of them and drag the map
 * back to the parcel every time someone commits a step. The one hydrate that
 * is a resume is the one that arrives while `resume` is `loading`, and the
 * transition is what says so. A fresh boundary commit lands `idle` -> `ready`
 * (or `absent` -> `ready` after a stale link) and is correctly not a resume:
 * the user is already looking at the ring they just drew. DO NOT "SIMPLIFY"
 * THIS TO `resume === 'ready'`.
 *
 * THE USER'S GESTURE BEATS A VIEW THEY DID NOT ASK FOR. The GET takes as long
 * as it takes, and someone may search an address, drag or zoom while it is in
 * flight. If they have, the fit is forfeited: they have already chosen where
 * to look. `dragstart` and `zoomstart` are the gestures (Leaflet fires no
 * `dragstart` for a programmatic move, and nothing else moves the map while a
 * resume is loading); a search arrives as `searched`. Not `movestart` -- a
 * window resize pans the map through invalidateSize and would forfeit the fit
 * for something nobody did.
 *
 * KNOWN GAP, LOGGED RATHER THAN BUILT HERE: a forfeited fit cannot be had
 * back. Someone who nudges the map while the GET is in flight and then
 * wonders where their design is has nothing to press -- nothing in this app
 * offers "show my parcel" (there is no other fitBounds anywhere in it). Rare,
 * and the alternative is overriding a deliberate gesture; a control that
 * fits to the committed boundary on demand would close it, with
 * chromePadding below as its padding.
 *
 * NOTHING TO FIT, NOTHING DONE. A 404'd resume goes `loading` -> `absent`, a
 * failed one back to `idle`; both settle the question without moving the map,
 * so the page opens exactly as a new session does. A document whose boundary
 * is fewer than three points (which the server's validate_boundary refuses
 * to create) would fit to a degenerate box, so it is skipped rather than
 * trusted.
 */

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'

import { boundaryToLatLngs } from '../session/apiClient'
import { selectDocument, selectResumeState, useSessionSelector } from '../session/SessionStore'

/** Breathing room between the parcel and whatever chrome edges it, in px. */
export const FIT_MARGIN = 24

/**
 * The chrome's footprint over the map, so the parcel lands in the part of the
 * map nothing floats over rather than under the rail or the instruction bar.
 * A uniform padding would put it there, which is a smaller version of the bug
 * this fixes.
 *
 * MEASURED OFF THE CHROME'S OWN GRID, NOT OFF THE TOKENS. .chrome__free is the
 * grid item WizardShell lays out as the open middle of the map, so its box IS
 * the uncovered area, in whatever layout and state the chrome is in. The
 * tokens .map-stage declares for Leaflet's corners describe the chrome only
 * roughly, and a fit is where roughly shows. Measured with the backend's full
 * design fixture:
 *
 *   390 wide: the rail goes horizontal under the bar, so the chrome covers
 *   the top 220px against a --bar-height of 56, and a finished design's
 *   delivery card covers the bottom 233px against a --bottom-height of 176.
 *   Fitted to the tokens, the parcel's top third sits under the rail.
 *
 *   1440 wide: the same delivery card covers the bottom 232px against 88.
 *
 * THE TOKENS ARE THE FALLBACK, for a frame with no chrome in it: on a first
 * arrival the orientation card holds the chrome back, and the fit still has
 * to dodge where it will appear. A custom property reads back as its authored
 * string ("12rem"), so they are resolved to pixels through a probe element.
 */
export function chromePadding(container) {
  const map = container.getBoundingClientRect()
  const stage = container.closest('.map-stage') ?? container
  const free = stage.querySelector('.chrome__free')?.getBoundingClientRect()
  if (free && free.width > 0 && free.height > 0) {
    return {
      paddingTopLeft: [free.left - map.left + FIT_MARGIN, free.top - map.top + FIT_MARGIN],
      paddingBottomRight: [map.right - free.right + FIT_MARGIN, map.bottom - free.bottom + FIT_MARGIN],
    }
  }
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'
  stage.appendChild(probe)
  const px = (token) => {
    probe.style.width = `var(${token}, 0px)`
    return probe.getBoundingClientRect().width || 0
  }
  const left = px('--rail-width')
  const top = px('--bar-height')
  const bottom = px('--bottom-height')
  stage.removeChild(probe)
  return {
    paddingTopLeft: [left + FIT_MARGIN, top + FIT_MARGIN],
    paddingBottomRight: [FIT_MARGIN, bottom + FIT_MARGIN],
  }
}

function ResumeFit({ searched = false }) {
  const map = useMap()
  const resume = useSessionSelector(selectResumeState)
  const document = useSessionSelector(selectDocument)

  const previous = useRef(resume)
  const settled = useRef(false)
  const moved = useRef(false)

  useEffect(() => {
    const onGesture = () => {
      moved.current = true
    }
    map.on('dragstart zoomstart', onGesture)
    return () => {
      map.off('dragstart zoomstart', onGesture)
    }
  }, [map])

  useEffect(() => {
    if (searched) moved.current = true
  }, [searched])

  useEffect(() => {
    const was = previous.current
    previous.current = resume
    if (settled.current || was !== 'loading' || resume === 'loading') return
    // The resume has landed, one way or the other. Whatever happens next,
    // this component never moves the map again.
    settled.current = true
    if (resume !== 'ready' || moved.current) return
    const ring = boundaryToLatLngs(document)
    if (ring.length < 3) return
    const bounds = L.latLngBounds(ring)
    if (!bounds.isValid()) return
    map.fitBounds(bounds, { animate: false, ...chromePadding(map.getContainer()) })
  }, [resume, document, map])

  return null
}

export default ResumeFit
