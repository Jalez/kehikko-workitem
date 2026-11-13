import { LIMITS, footerItemsSchema, headerItemsSchema, type FooterItem, type HeaderItem, type TrackerRow } from 'kehikot-module-protocol'

import { PIPELINE_WORDS, ago, kindWord, stateWord } from '@/item/reading.ts'

/**
 * The two rows the host draws for this module (docs/footer.md, "What goes in the header, and what
 * in the footer"). Pure, and stated for CI in `kehikot.rows.json`.
 *
 * Header — how the module is set up and what to do: which of the selected items is shown (when
 * more than one is), Refresh, and Open on <host>.
 * Footer — what is going on now: the item and its state, its checks, and how fresh the reading is
 * ("updated 3 min ago", "Refreshing…", "Offline: showing what was read at 12:03").
 */

const cut = (text: string, most: number) => (text.length > most ? `${text.slice(0, most - 1)}…` : text)

export interface HeaderState {
  /** The selected refs, when there are several to choose between. */
  selected: readonly string[]
  shown: string | null
  row: TrackerRow | null
  refreshing: boolean
}

export function headerItems({ selected, shown, row, refreshing }: HeaderState): HeaderItem[] {
  const items: unknown[] = []
  if (selected.length > 1 && shown) {
    items.push({
      kind: 'switch',
      id: 'item',
      label: 'Item',
      value: shown,
      options: selected.slice(0, LIMITS.HEADER_OPTIONS).map((ref) => ({ id: ref, label: cut(ref, LIMITS.HEADER_LABEL) })),
    })
  }
  if (shown) {
    items.push({
      kind: 'run',
      id: 'refresh',
      label: 'Refresh',
      icon: 'refresh',
      pinned: true,
      agents: true,
      state: refreshing ? 'busy' : 'idle',
      disabled: refreshing ? 'It is being read now.' : null,
    })
  }
  if (row && /^https:\/\//.test(row.url)) {
    items.push({ kind: 'run', id: 'open', label: cut(`Open on ${row.host}`, LIMITS.HEADER_LABEL), icon: 'external', open: row.url })
  }
  return headerItemsSchema.parse(items)
}

export interface FooterState {
  row: TrackerRow | null
  ref: string | null
  refreshing: boolean
  /** "Offline: showing what was read at 12:03", or null. */
  offline: string | null
  now: number
}

export function footerItems({ row, ref, refreshing, offline, now }: FooterState): FooterItem[] {
  if (!ref) return footerItemsSchema.parse([{ kind: 'text', id: 'item', text: 'Nothing selected' }])
  const items: unknown[] = []
  if (!row) {
    items.push({ kind: 'text', id: 'item', text: cut(ref, LIMITS.FOOTER_TEXT) })
    items.push({ kind: 'text', id: 'fresh', text: 'Reading…', align: 'end' })
    return footerItemsSchema.parse(items)
  }
  items.push({
    kind: 'text',
    id: 'item',
    text: cut(`${row.ref} · ${stateWord(row)}`, LIMITS.FOOTER_TEXT),
    tooltip: cut(`${kindWord(row)} ${row.ref} in ${row.repo}: ${row.title}`, LIMITS.FOOTER_TOOLTIP),
  })
  if (row.pipeline) {
    items.push({
      kind: 'text',
      id: 'pipeline',
      text: PIPELINE_WORDS[row.pipeline],
      level: row.pipeline === 'failed' ? 'critical' : 'normal',
      optional: true,
    })
  }
  if (offline) {
    items.push({ kind: 'text', id: 'fresh', text: cut(offline, LIMITS.FOOTER_TEXT), level: 'warn', align: 'end' })
  } else if (refreshing) {
    items.push({ kind: 'text', id: 'fresh', text: 'Refreshing…', align: 'end', optional: true })
  } else {
    const when = ago(row.updatedAt, now)
    if (when) items.push({ kind: 'text', id: 'fresh', text: `updated ${when}`, align: 'end', optional: true, tooltip: `Last changed on ${row.host}; read ${ago(row.detail?.readAt ?? row.readAt, now)}.` })
  }
  return footerItemsSchema.parse(items)
}
