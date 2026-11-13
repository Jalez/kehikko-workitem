import { change, NOW } from './fixtures.ts'
import { footerItems, headerItems } from '../src/rows.ts'

/**
 * The moments of this module's rows, for `kehikot.rows.json` (written by `bun run rows`) and the
 * check that holds the two in step. Every moment the person can see: nothing selected, one being
 * read, one shown, several selected, refreshing, offline.
 */
export function rowStates() {
  const row = change()
  return [
    { name: 'nothing selected', header: headerItems({ selected: [], shown: null, row: null, refreshing: false }), footer: footerItems({ row: null, ref: null, refreshing: false, offline: null, now: NOW }), state: true },
    { name: 'reading one', header: headerItems({ selected: ['gh#5'], shown: 'gh#5', row: null, refreshing: true }), footer: footerItems({ row: null, ref: 'gh#5', refreshing: true, offline: null, now: NOW }), state: true },
    { name: 'one shown', header: headerItems({ selected: ['gh#5'], shown: 'gh#5', row, refreshing: false }), footer: footerItems({ row, ref: 'gh#5', refreshing: false, offline: null, now: NOW }), state: true },
    { name: 'several selected', header: headerItems({ selected: ['gh#5', 'gh#6'], shown: 'gh#5', row, refreshing: false }), footer: footerItems({ row, ref: 'gh#5', refreshing: false, offline: null, now: NOW }), state: true },
    { name: 'refreshing', header: headerItems({ selected: ['gh#5'], shown: 'gh#5', row, refreshing: true }), footer: footerItems({ row, ref: 'gh#5', refreshing: true, offline: null, now: NOW }), state: true },
    { name: 'offline', header: headerItems({ selected: ['gh#5'], shown: 'gh#5', row, refreshing: false }), footer: footerItems({ row, ref: 'gh#5', refreshing: false, offline: 'Offline: showing what was read at 12:03', now: NOW }), state: true },
  ]
}
