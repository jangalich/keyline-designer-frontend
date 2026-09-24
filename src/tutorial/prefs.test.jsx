/**
 * prefs.test.jsx
 *
 * THE TUTORIAL'S BROWSER PREFERENCES: every unusable read degrades to
 * "nothing seen, auto on", and the old deck's dismissal migrates once.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AUTO_KEY,
  DEFAULT_PREFS,
  ORIENTATION_ID,
  SEEN_KEY,
  markSeen,
  migrateLegacyDismissal,
  readPrefs,
  resetTutorialPrefsForTests,
  setAuto,
} from './prefs.js'

const LEGACY = 'keyline.tutorial.dismissed'

beforeEach(() => {
  window.localStorage.clear()
  resetTutorialPrefsForTests()
})

afterEach(() => vi.restoreAllMocks())

const NOTHING_SEEN_AUTO_ON = { seen: [], auto: true }

describe('reads degrade to nothing seen, auto on', () => {
  it('absent keys', () => {
    expect(readPrefs()).toEqual(NOTHING_SEEN_AUTO_ON)
    expect(DEFAULT_PREFS).toEqual(NOTHING_SEEN_AUTO_ON)
  })

  it('malformed values', () => {
    for (const [seen, auto] of [
      ['{not json', 'nope'],
      ['"boundary"', '"true"'],
      ['{"0":"boundary"}', '1'],
      ['null', 'null'],
    ]) {
      window.localStorage.setItem(SEEN_KEY, seen)
      window.localStorage.setItem(AUTO_KEY, auto)
      expect(readPrefs(), `${seen} / ${auto}`).toEqual(NOTHING_SEEN_AUTO_ON)
    }
    // Non-string ids inside a real array are dropped, not fatal.
    window.localStorage.setItem(SEEN_KEY, '["boundary", 3, null]')
    window.localStorage.setItem(AUTO_KEY, 'false')
    expect(readPrefs()).toEqual({ seen: ['boundary'], auto: false })
  })

  it('a localStorage that throws on access, and writes that then stay in memory', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(readPrefs()).toEqual(NOTHING_SEEN_AUTO_ON)
    expect(() => markSeen('boundary')).not.toThrow()
    expect(() => setAuto(false)).not.toThrow()
    // Nothing could be stored; this page still honours the decision.
    expect(readPrefs()).toEqual({ seen: ['boundary'], auto: false })
  })

  it('a localStorage whose calls throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readPrefs()).toEqual(NOTHING_SEEN_AUTO_ON)
    expect(() => markSeen(ORIENTATION_ID)).not.toThrow()
    expect(readPrefs().seen).toEqual([ORIENTATION_ID])
  })
})

describe('writes', () => {
  it('markSeen appends once; setAuto writes a boolean', () => {
    markSeen('boundary')
    markSeen('boundary')
    markSeen(ORIENTATION_ID)
    setAuto(false)
    expect(JSON.parse(window.localStorage.getItem(SEEN_KEY))).toEqual(['boundary', ORIENTATION_ID])
    expect(window.localStorage.getItem(AUTO_KEY)).toBe('false')
    expect(readPrefs()).toEqual({ seen: ['boundary', ORIENTATION_ID], auto: false })
  })
})

describe('the kd.tutorial.dismissed migration', () => {
  it('reads an old dismissal as orientation seen and auto off, then removes the key', () => {
    window.localStorage.setItem(LEGACY, '1')
    expect(readPrefs()).toEqual({ seen: [ORIENTATION_ID], auto: false })
    expect(window.localStorage.getItem(LEGACY)).toBeNull()
    expect(JSON.parse(window.localStorage.getItem(SEEN_KEY))).toEqual([ORIENTATION_ID])
    expect(window.localStorage.getItem(AUTO_KEY)).toBe('false')
  })

  it('takes the brief\'s spelling of the key too', () => {
    window.localStorage.setItem('kd.tutorial.dismissed', 'true')
    expect(readPrefs()).toEqual({ seen: [ORIENTATION_ID], auto: false })
    expect(window.localStorage.getItem('kd.tutorial.dismissed')).toBeNull()
  })

  it('runs once: a later write of the old key is not migrated again', () => {
    window.localStorage.setItem(LEGACY, '1')
    readPrefs()
    setAuto(true)
    window.localStorage.setItem(LEGACY, '1')
    migrateLegacyDismissal()
    expect(readPrefs()).toEqual({ seen: [ORIENTATION_ID], auto: true })
    // Still there: this page's migration has run.
    expect(window.localStorage.getItem(LEGACY)).toBe('1')
  })

  it('on a later page, never overrides prefs already written -- it only removes the key', () => {
    markSeen(ORIENTATION_ID)
    window.localStorage.setItem(LEGACY, '1')
    resetTutorialPrefsForTests() // a reload
    expect(readPrefs()).toEqual({ seen: [ORIENTATION_ID], auto: true })
    expect(window.localStorage.getItem(LEGACY)).toBeNull()
  })

  it('does nothing when there is no old key', () => {
    migrateLegacyDismissal()
    expect(window.localStorage.getItem(SEEN_KEY)).toBeNull()
    expect(readPrefs()).toEqual(NOTHING_SEEN_AUTO_ON)
  })

  it('survives a throwing localStorage', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => migrateLegacyDismissal()).not.toThrow()
    expect(readPrefs()).toEqual(NOTHING_SEEN_AUTO_ON)
  })
})
