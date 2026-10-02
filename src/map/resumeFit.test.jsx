/**
 * resumeFit.test.jsx
 *
 * THE FIT FIRES ONCE, ON THE RESUME LANDING, AND ON NOTHING ELSE.
 *
 * The store is the real one, driven through a stubbed fetch whose GET is held
 * open until the test releases it, so `loading` renders on its own exactly as
 * a network round trip makes it. Leaflet is not: the map is a recorder, since
 * the question here is whether fitBounds is called and with what, not what
 * Leaflet does with it. The browser half -- that the parcel lands inside the
 * chrome's free area, instantly -- was verified against the real page.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fakeMap = vi.hoisted(() => ({ current: null }))
vi.mock('react-leaflet', () => ({ useMap: () => fakeMap.current }))

import ResumeFit from './ResumeFit.jsx'
import { SESSION_QUERY_PARAM, SessionProvider, useSession } from '../session/SessionStore'

const STEP_ORDER = ['landform', 'water', 'roads', 'trees', 'structures', 'fencing']
// [lng, lat], as the wire carries it.
const RING = [
  [-79.9838, 40.6458],
  [-79.9837, 40.6429],
  [-79.9805, 40.6446],
  [-79.9838, 40.6458],
]

function documentFor(sessionId, boundary = RING) {
  return {
    schema_version: 1,
    session_id: sessionId,
    document_revision: 1,
    boundary,
    step_order: STEP_ORDER,
    steps: Object.fromEntries(STEP_ORDER.map((id) => [id, { status: 'not_started' }])),
  }
}

function makeMap() {
  const handlers = {}
  const stage = document.createElement('div')
  stage.className = 'map-stage'
  const container = document.createElement('div')
  stage.appendChild(container)
  document.body.appendChild(stage)
  return {
    on: (events, fn) => events.split(' ').forEach((e) => ((handlers[e] ||= []).push(fn))),
    off: (events, fn) =>
      events.split(' ').forEach((e) => (handlers[e] = (handlers[e] || []).filter((h) => h !== fn))),
    fire: (event) => (handlers[event] || []).forEach((h) => h()),
    getContainer: () => container,
    fitBounds: vi.fn(),
  }
}

/**
 * A fetch whose session GET waits for release(). Anything else answers from
 * `responses` by method + path.
 */
function stubFetch(responses) {
  let release
  const held = new Promise((resolve) => (release = resolve))
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
    const { pathname } = new URL(url)
    const key = `${init.method ?? 'GET'} ${pathname}`
    const answer = responses[key]
    if (!answer) throw new Error(`unstubbed ${key}`)
    if (key.startsWith('GET /api/sessions/')) await held
    return new Response(JSON.stringify(answer.body), {
      status: answer.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  return { release }
}

async function mount({ searched = false } = {}) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let latest = null
  function Probe() {
    latest = useSession()
    return null
  }
  const render = (props) =>
    React.act(async () => {
      root.render(
        <SessionProvider proposalFeatures={() => []}>
          <Probe />
          <ResumeFit {...props} />
        </SessionProvider>
      )
    })
  await render({ searched })
  return {
    get state() {
      return latest.state
    },
    rerender: render,
    run: (fn) => React.act(async () => fn(latest.actions)),
    settle: () => React.act(async () => {}),
    unmount: () => React.act(async () => root.unmount()),
  }
}

function openWithSession(id) {
  window.history.replaceState({}, '', `/?${SESSION_QUERY_PARAM}=${id}`)
}

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
  fakeMap.current = makeMap()
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('ResumeFit', () => {
  it('fits the committed boundary, instantly, when the resume lands', async () => {
    openWithSession('sess-1')
    const net = stubFetch({ 'GET /api/sessions/sess-1': { body: documentFor('sess-1') } })
    const ui = await mount()
    expect(ui.state.resume).toBe('loading')
    expect(fakeMap.current.fitBounds).not.toHaveBeenCalled()

    net.release()
    await ui.settle()

    expect(ui.state.resume).toBe('ready')
    expect(fakeMap.current.fitBounds).toHaveBeenCalledTimes(1)
    const [bounds, options] = fakeMap.current.fitBounds.mock.calls[0]
    expect(bounds.getSouth()).toBeCloseTo(40.6429)
    expect(bounds.getNorth()).toBeCloseTo(40.6458)
    expect(bounds.getWest()).toBeCloseTo(-79.9838)
    expect(bounds.getEast()).toBeCloseTo(-79.9805)
    expect(options.animate).toBe(false)
    expect(options.paddingTopLeft).toHaveLength(2)
    expect(options.paddingBottomRight).toHaveLength(2)
    await ui.unmount()
  })

  it('does not re-fire on a later hydrate, which also leaves resume at ready', async () => {
    openWithSession('sess-1')
    const net = stubFetch({
      'GET /api/sessions/sess-1': { body: documentFor('sess-1') },
      'POST /api/sessions/sess-1/steps/landform/reopen': { body: { ...documentFor('sess-1'), document_revision: 2 } },
    })
    const ui = await mount()
    net.release()
    await ui.settle()
    expect(fakeMap.current.fitBounds).toHaveBeenCalledTimes(1)

    // A reopen hydrates a fresh document; so do commit, generate and discard.
    await ui.run((a) => a.reopen('landform'))
    expect(ui.state.document.document_revision).toBe(2)
    expect(ui.state.resume).toBe('ready')
    // And a second resume of the same session goes loading -> ready again.
    await ui.run((a) => a.resume('sess-1'))
    expect(fakeMap.current.fitBounds).toHaveBeenCalledTimes(1)
    await ui.unmount()
  })

  it('does not fit a fresh session when its boundary is committed', async () => {
    stubFetch({ 'POST /api/sessions': { status: 201, body: documentFor('sess-new') } })
    const ui = await mount()
    expect(ui.state.resume).toBe('idle')
    await ui.run((a) => a.startSession([[40.6458, -79.9838], [40.6429, -79.9837], [40.6446, -79.9805]]))
    expect(ui.state.resume).toBe('ready')
    expect(fakeMap.current.fitBounds).not.toHaveBeenCalled()
    await ui.unmount()
  })

  it('leaves the default view alone when the resumed session is gone (404)', async () => {
    openWithSession('sess-gone')
    const net = stubFetch({ 'GET /api/sessions/sess-gone': { status: 404, body: { error: 'not found' } } })
    const ui = await mount()
    net.release()
    await ui.settle()
    expect(ui.state.resume).toBe('absent')
    expect(fakeMap.current.fitBounds).not.toHaveBeenCalled()
    await ui.unmount()
  })

  it('does not fit a boundary too short to bound anything', async () => {
    openWithSession('sess-1')
    const net = stubFetch({
      'GET /api/sessions/sess-1': { body: documentFor('sess-1', RING.slice(0, 2)) },
    })
    const ui = await mount()
    net.release()
    await ui.settle()
    expect(ui.state.resume).toBe('ready')
    expect(fakeMap.current.fitBounds).not.toHaveBeenCalled()
    await ui.unmount()
  })

  it.each(['dragstart', 'zoomstart'])('is forfeited by a %s while the resume is in flight', async (event) => {
    openWithSession('sess-1')
    const net = stubFetch({ 'GET /api/sessions/sess-1': { body: documentFor('sess-1') } })
    const ui = await mount()
    fakeMap.current.fire(event)
    net.release()
    await ui.settle()
    expect(ui.state.resume).toBe('ready')
    expect(fakeMap.current.fitBounds).not.toHaveBeenCalled()
    await ui.unmount()
  })

  it('is forfeited by an address search while the resume is in flight', async () => {
    openWithSession('sess-1')
    const net = stubFetch({ 'GET /api/sessions/sess-1': { body: documentFor('sess-1') } })
    const ui = await mount()
    await ui.rerender({ searched: true })
    net.release()
    await ui.settle()
    expect(fakeMap.current.fitBounds).not.toHaveBeenCalled()
    await ui.unmount()
  })
})
