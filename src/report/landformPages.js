/**
 * landformPages.js
 *
 * THE USER'S OWN LANDFORM PAGES, FETCHED ONCE PER SESSION AND KEPT.
 *
 *   useLandformPages(sessionId) -> {status, pages, error}
 *
 * The report page asks for them on arrival; the server renders them from
 * the session's own data in about two seconds and serves them from memory
 * after. This hook is the client half of that arrangement.
 *
 * NOT IN THE STORE. The store mirrors the server's Design Document and
 * holds the one thing the document cannot -- a report request in flight.
 * These pages are a derived view the server computes from the session and
 * never changes (they depend on the boundary and the DEM, fixed at
 * creation); nothing about them is design state, and no commit, reopen or
 * cascade can make them stale. A module-level cache by session id is the
 * right size: the page remounts on every visit (it is a layer over the
 * wizard, App.jsx), and a person going back and forth between their design
 * and the report page should not see the slots empty and refill.
 *
 * ONE REQUEST PER SESSION, HOWEVER MANY MOUNTS. The pending promise is
 * cached alongside the answer, so two mounts in one tick share one fetch,
 * and a mount that unmounts mid-flight does not abort a request a later
 * mount would have wanted. The result lands in the cache whether or not
 * anything is still listening.
 *
 * A FAILURE IS NOT CACHED. The one failure the server can have (a session
 * it had let go whose elevation data could not be fetched again) is an
 * outage, and the next visit should try again.
 *
 * THE STATUSES: `idle` with no session; `loading`; `ready` with `pages`;
 * `failed` with `error`. There is no progress: the server reports none and
 * the wait is short enough that a bar would say nothing (landform_pages.py's
 * timings). ReportPage draws the slots with one quiet line.
 */

import { useEffect, useState } from 'react'

import { getLandformPages, landformPageUrl } from '../session/apiClient'

export const PAGES_IDLE = 'idle'
export const PAGES_LOADING = 'loading'
export const PAGES_READY = 'ready'
export const PAGES_FAILED = 'failed'

// sessionId -> {promise, pages}
const cache = new Map()

/** Forget every cached answer. Tests, and nothing else. */
export function resetLandformPages() {
  cache.clear()
}

/** The manifest's pages with their URLs made absolute. */
function pagesFrom(manifest) {
  const pages = Array.isArray(manifest?.pages) ? manifest.pages : []
  return pages.map((page) => ({
    number: page.number,
    label: page.label,
    alt: page.alt,
    url: landformPageUrl(page.url),
    thumbUrl: landformPageUrl(page.thumb_url),
    width: page.width,
    height: page.height,
    thumbWidth: page.thumb_width,
    thumbHeight: page.thumb_height,
  }))
}

function load(sessionId) {
  const held = cache.get(sessionId)
  if (held) return held.promise
  const promise = getLandformPages(sessionId).then(
    (manifest) => {
      const pages = pagesFrom(manifest)
      cache.set(sessionId, { promise, pages })
      return pages
    },
    (error) => {
      cache.delete(sessionId)
      throw error
    }
  )
  cache.set(sessionId, { promise, pages: null })
  return promise
}

export function useLandformPages(sessionId) {
  const [state, setState] = useState(() => initial(sessionId))

  useEffect(() => {
    if (!sessionId) {
      setState({ status: PAGES_IDLE, pages: null, error: null })
      return undefined
    }
    const held = cache.get(sessionId)
    if (held?.pages) {
      setState({ status: PAGES_READY, pages: held.pages, error: null })
      return undefined
    }
    let live = true
    setState({ status: PAGES_LOADING, pages: null, error: null })
    load(sessionId).then(
      (pages) => {
        if (live) setState({ status: PAGES_READY, pages, error: null })
      },
      (error) => {
        if (live) setState({ status: PAGES_FAILED, pages: null, error })
      }
    )
    return () => {
      live = false
    }
  }, [sessionId])

  return state
}

function initial(sessionId) {
  const held = sessionId ? cache.get(sessionId) : null
  if (held?.pages) return { status: PAGES_READY, pages: held.pages, error: null }
  return { status: sessionId ? PAGES_LOADING : PAGES_IDLE, pages: null, error: null }
}
