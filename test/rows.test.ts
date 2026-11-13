import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { rowsAdvice } from 'kehikot-module-protocol'

import { footerItems, headerItems } from '../src/rows.ts'
import { rowStates } from '../dev/rows-states.ts'
import { NOW, change } from '../dev/fixtures.ts'

describe('the header: how it is set up, and what to do', () => {
  test('Refresh, and Open on the tracker carried by the host', () => {
    const items = headerItems({ selected: ['gh#5'], shown: 'gh#5', row: change(), refreshing: false })
    expect(items.map((i) => i.id)).toEqual(['refresh', 'open'])
    const open = items.find((i) => i.id === 'open')
    expect(open).toMatchObject({ kind: 'run', label: 'Open on github.com', open: 'https://github.com/owner/repo/pull/5' })
  })

  test('a switch between several selected items', () => {
    const items = headerItems({ selected: ['gh#5', 'gh#6'], shown: 'gh#6', row: null, refreshing: false })
    expect(items[0]).toMatchObject({ kind: 'switch', value: 'gh#6' })
  })

  test('Refresh is busy while the host reads', () => {
    expect(headerItems({ selected: ['gh#5'], shown: 'gh#5', row: null, refreshing: true })[0]).toMatchObject({ state: 'busy' })
  })
})

describe('the footer: what is going on now', () => {
  test('the item, its checks, and when it changed', () => {
    const items = footerItems({ row: change(), ref: 'gh#5', refreshing: false, offline: null, now: NOW })
    expect(items.map((i) => (i.kind === 'text' ? i.text : ''))).toEqual(['gh#5 · Open', 'Checks failed', 'updated 3 min ago'])
  })

  test('offline says so in place of the time', () => {
    const items = footerItems({ row: change(), ref: 'gh#5', refreshing: false, offline: 'Offline: showing what was read at 12:03', now: NOW })
    expect(items.at(-1)).toMatchObject({ text: 'Offline: showing what was read at 12:03', level: 'warn' })
  })

  test('nothing selected, and reading', () => {
    expect(footerItems({ row: null, ref: null, refreshing: false, offline: null, now: NOW })).toMatchObject([{ text: 'Nothing selected' }])
    expect(footerItems({ row: null, ref: 'gh#5', refreshing: true, offline: null, now: NOW }).map((i) => (i.kind === 'text' ? i.text : ''))).toEqual(['gh#5', 'Reading…'])
  })
})

describe('kehikot.rows.json', () => {
  test('is what the rows say, so check:rows checks the real thing', () => {
    const file = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'kehikot.rows.json'), 'utf8'))
    expect(file).toEqual(JSON.parse(JSON.stringify(rowStates())))
  })

  test('every moment passes the rule of what goes in each row', () => {
    for (const state of rowStates()) expect(rowsAdvice(state.header, state.footer, { state: state.state })).toEqual([])
  })
})
