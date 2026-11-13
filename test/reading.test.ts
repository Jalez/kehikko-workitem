import { describe, expect, test } from 'bun:test'

import { ago, itemFrom, linkedRefs, offlineLine, readingOf, recentItems, stateWord } from '../src/item/reading.ts'
import { NOW, change } from '../dev/fixtures.ts'

const reading = (rows: unknown[], missing: unknown[] = [], sources: unknown[] = []) => readingOf({ at: '2026-11-13T11:58:00.000Z', rows, missing, sources })!

describe('the item on screen', () => {
  test('is shown from the first answer that has its row', () => {
    expect(itemFrom('gh#5', reading([change()]), null)).toMatchObject({ at: 'shown', row: { title: 'Read one item without a browser' } })
  })

  test('stays shown through an answer that lacks it: no blank flash', () => {
    const was = itemFrom('gh#5', reading([change()]), null)
    expect(itemFrom('gh#5', reading([], [{ ref: 'gh#5', reason: 'pending' }]), was)).toBe(was)
    expect(itemFrom('gh#5', null, was)).toBe(was)
  })

  test('keeps a detail already shown when a summary of the same version arrives', () => {
    const was = itemFrom('gh#5', reading([change()]), null)
    const next = itemFrom('gh#5', reading([change({ detail: undefined })]), was)
    expect(next.at === 'shown' && next.row.detail?.comments?.length).toBe(2)
    const moved = itemFrom('gh#5', reading([change({ detail: undefined, updatedAt: '2026-11-13T11:59:00.000Z' })]), was)
    expect(moved.at === 'shown' && moved.row.detail).toBeUndefined()
  })

  test('is asking while pending, and says why when the host has nothing', () => {
    expect(itemFrom('gh#9', reading([], [{ ref: 'gh#9', reason: 'pending' }]), null)).toEqual({ at: 'asking', ref: 'gh#9' })
    expect(itemFrom('gh#9', reading([], [{ ref: 'gh#9', reason: 'not-found' }]), null)).toMatchObject({ at: 'missing' })
    expect(itemFrom('gh#9', reading([], [{ ref: 'gh#9', reason: 'no-tracker' }]), null)).toMatchObject({ why: expect.stringContaining('Settings › Trackers') })
  })

  test('a different ref starts over', () => {
    const was = itemFrom('gh#5', reading([change()]), null)
    expect(itemFrom('gh#6', reading([]), was)).toEqual({ at: 'asking', ref: 'gh#6' })
  })
})

describe('what it links to', () => {
  test('closes, part of, and nothing twice', () => {
    expect(linkedRefs(change({ contributes: ['gh#2', 'gh#3'] }))).toEqual([
      { ref: 'gh#3', how: 'Closes' },
      { ref: 'gh#2', how: 'Part of' },
    ])
  })
})

describe('the words', () => {
  test('how long ago', () => {
    expect(ago('2026-11-13T11:59:50.000Z', NOW)).toBe('just now')
    expect(ago('2026-11-13T11:57:00.000Z', NOW)).toBe('3 min ago')
    expect(ago('2026-11-13T09:00:00.000Z', NOW)).toBe('3 h ago')
    expect(ago('2026-11-10T12:00:00.000Z', NOW)).toBe('3 d ago')
    expect(ago(null, NOW)).toBe('')
  })

  test('state', () => {
    expect(stateWord(change())).toBe('Open')
    expect(stateWord(change({ draft: true }))).toBe('Draft')
    expect(stateWord(change({ state: 'merged' }))).toBe('Merged')
    expect(stateWord(change({ kind: 'issue', state: 'closed', stateReason: 'NOT_PLANNED' }))).toBe('Closed (not planned)')
  })
})

describe('offline', () => {
  const clock = () => '12:03'
  test('says what was read when the refresh failed', () => {
    expect(offlineLine(change(), [], 'github.com could not be reached', clock)).toBe('Offline: showing what was read at 12:03')
  })
  test("says it when the item's source last failed", () => {
    const source = { tracker: 'github', host: 'github.com', repo: 'owner/repo', default: true, listed: true, at: null, error: 'down', refreshing: false } as const
    expect(offlineLine(change(), [source], null, clock)).toBe('Offline: showing what was read at 12:03')
  })
  test('says nothing while all is well', () => {
    expect(offlineLine(change(), [], null, clock)).toBeNull()
  })
})

describe('the empty state', () => {
  test('the most recently updated first', () => {
    const rows = [change({ ref: 'gh#1', number: 1, updatedAt: '2026-11-01T00:00:00.000Z' }), change({ ref: 'gh#2', number: 2, updatedAt: '2026-11-12T00:00:00.000Z' })]
    expect(recentItems(reading(rows)).map((r) => r.ref)).toEqual(['gh#2', 'gh#1'])
    expect(recentItems(null)).toEqual([])
  })
})
