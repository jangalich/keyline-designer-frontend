/**
 * router.jsx
 *
 * THE APP'S TWO ROUTES, AND NOTHING THAT A LIBRARY WOULD ADD.
 *
 *   /          the wizard page: hero, map, the prose sections
 *   /report    the report page (report/ReportPage.jsx)
 *
 * The design guide held "one page, continuous scroll, no routes" from the
 * first branch to this one, and the report page is the first thing to
 * depart from it -- for the reason the guide now records (docs/frontend-
 * design-guide.md, "Pages and routes"): a transaction wants its own URL.
 * Linkable, it survives a refresh, the back button behaves, and a payment
 * provider has somewhere to return to. A modal hosting a transaction is
 * fighting its container.
 *
 * WHY NOT react-router. Two routes, no nesting, no loaders, no params in
 * the path -- the session id travels in the query string, as it already
 * does for resume. A router library would be a dependency and a vocabulary
 * for a `switch` on pathname. This is about fifty lines: a subscription to
 * the location, a navigate() over pushState, and the one hook components
 * read. If a third route arrives with real needs (nested layouts, path
 * params), replace this file rather than growing it.
 *
 * ONE SUBSCRIPTION, NOT A CONTEXT. useSyncExternalStore reads the
 * location straight off window and re-renders on `popstate` (the back and
 * forward buttons) and on this module's own navigate() -- pushState fires
 * no event of its own, so navigate() dispatches one. Every component
 * calling useLocation() sees the same answer at the same time, with no
 * provider to mount.
 *
 * THE SESSION QUERY IS PRESERVED ACROSS NAVIGATION by the callers, not by
 * this module: navigate() goes exactly where it is told. The report page's
 * link back and the delivery card's link forward both carry the current
 * search string, so the session id is never dropped on the way.
 *
 * NOT A FEATURE OF THE WIZARD PAGE. The wizard page stays mounted under
 * the report page (App.jsx); this module only says which is in front.
 */

import { useSyncExternalStore } from 'react'

export const WIZARD_PATH = '/'
export const REPORT_PATH = '/report'

const NAVIGATE_EVENT = 'kd:navigate'

/** The current location, as the part of it the app routes on. */
function readLocation() {
  if (typeof window === 'undefined') return { pathname: WIZARD_PATH, search: '' }
  return { pathname: window.location.pathname, search: window.location.search }
}

let cached = readLocation()
function snapshot() {
  const next = readLocation()
  if (next.pathname !== cached.pathname || next.search !== cached.search) cached = next
  return cached
}

function subscribe(onChange) {
  window.addEventListener('popstate', onChange)
  window.addEventListener(NAVIGATE_EVENT, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(NAVIGATE_EVENT, onChange)
  }
}

const SERVER_LOCATION = Object.freeze({ pathname: WIZARD_PATH, search: '' })

/** {pathname, search}, live. */
export function useLocation() {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER_LOCATION)
}

/**
 * Go to `to` (a path with an optional query). `replace` swaps the current
 * entry instead of pushing one; `state` is kept on the history entry, which
 * is how the report page knows whether the wizard is one step back.
 */
export function navigate(to, { replace = false, state = null } = {}) {
  if (typeof window === 'undefined') return
  const url = new URL(to, window.location.href)
  if (replace) window.history.replaceState(state, '', url)
  else window.history.pushState(state, '', url)
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
}

/** The path for a route with the current session query carried along. */
export function withCurrentSearch(pathname) {
  const search = typeof window === 'undefined' ? '' : window.location.search
  return `${pathname}${search}`
}

/** Is the report page the one in front? */
export function isReportPath(pathname) {
  return pathname === REPORT_PATH || pathname === `${REPORT_PATH}/`
}
