import { trackerReadingResult, type TrackerReading, type TrackerRow, type TrackerSource } from 'kehikot-module-protocol'

/**
 * What the host's tracker reading says about the one item on screen, as the page draws it. Pure,
 * so every state the person can see is a test.
 *
 * The reading answers at once from what the host kept, and a ref it has not read yet comes back
 * `pending` while the host reads it. So an item is `shown` from the first answer that has its row,
 * and stays shown, from the row last seen, through every later answer that lacks it (no blank
 * flash): only a newer row replaces it.
 */
export type ItemState =
  /** Nothing has answered yet for this ref. */
  | { at: 'asking'; ref: string }
  /** The row, as last read. `detail` may still be on its way. */
  | { at: 'shown'; ref: string; row: TrackerRow }
  /** The host answered, and has no such item to show, with the sentence why. */
  | { at: 'missing'; ref: string; why: string }

const WHY = {
  'not-found': 'The tracker has no item under that reference.',
  'no-tracker': 'This project reads no tracker that reference could belong to. Add the repository in Settings › Trackers.',
  failed: 'The last read of its tracker failed, and there is nothing kept to show from before.',
} as const

/** A reading out of a host's answer, or null when it is not one. */
export function readingOf(answer: unknown): TrackerReading | null {
  const parsed = trackerReadingResult.safeParse(answer)
  return parsed.success ? parsed.data : null
}

/** What one answer says about `ref`, given what was on screen before. */
export function itemFrom(ref: string, reading: TrackerReading | null, was: ItemState | null): ItemState {
  const before = was && was.ref === ref ? was : null
  const row = reading?.rows.find((one) => one.ref === ref)
  if (row) {
    /* A summary answer never takes away a detail already shown, unless the row moved since. */
    const kept = before?.at === 'shown' && !row.detail && before.row.detail && before.row.updatedAt === row.updatedAt ? before.row.detail : undefined
    return { at: 'shown', ref, row: kept ? { ...row, detail: kept } : row }
  }
  if (before?.at === 'shown') return before
  const missing = reading?.missing.find((one) => one.ref === ref)
  if (missing && missing.reason !== 'pending') return { at: 'missing', ref, why: WHY[missing.reason] }
  return { at: 'asking', ref }
}

/** The refs the item names: what it closes or is closed by, and what it is part of or has parts. */
export function linkedRefs(row: TrackerRow): Array<{ ref: string; how: string }> {
  const out: Array<{ ref: string; how: string }> = []
  const seen = new Set<string>([row.ref])
  const add = (ref: string, how: string) => {
    if (seen.has(ref)) return
    seen.add(ref)
    out.push({ ref, how })
  }
  for (const link of row.links) add(link.ref, link.relation === 'closes' ? 'Closes' : 'Closed by')
  for (const ref of row.contributes ?? []) add(ref, 'Part of')
  for (const ref of row.contributedBy ?? []) add(ref, 'Has part')
  if (row.stack?.below) add(row.stack.below, 'Stacked on')
  for (const ref of row.stack?.above ?? []) add(ref, 'Stacked under')
  return out
}

/** The space's most recently updated items, for the empty state. */
export function recentItems(reading: TrackerReading | null, most = 8): TrackerRow[] {
  if (!reading) return []
  return [...reading.rows]
    .sort((a, b) => (b.updatedAt ?? b.readAt).localeCompare(a.updatedAt ?? a.readAt))
    .slice(0, most)
}

/** The source a row was read from. */
export function sourceOf(row: TrackerRow, sources: readonly TrackerSource[]): TrackerSource | undefined {
  return sources.find((s) => s.tracker === row.tracker && s.host === row.host && s.repo === row.repo)
}

/**
 * Whether what is shown is older than it should be, and the sentence to say it in: the last
 * refresh failed, or the item's source says why its last read failed. Null while all is well.
 */
export function offlineLine(row: TrackerRow, sources: readonly TrackerSource[], refreshFailed: string | null, clock: (iso: string) => string): string | null {
  const why = refreshFailed ?? sourceOf(row, sources)?.error ?? null
  if (!why) return null
  const read = row.detail?.readAt && row.detail.readAt > row.readAt ? row.detail.readAt : row.readAt
  return `Offline: showing what was read at ${clock(read)}`
}

/** How long ago, in the words a person glances at: `just now`, `3 min ago`, `2 h ago`, `5 d ago`. */
export function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return ''
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (!Number.isFinite(s)) return ''
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 60) return `${d} d ago`
  return new Date(iso).toLocaleDateString()
}

/** A time of day, `12:03`, in the person's locale. */
export const clockOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** The item's state in a word, the way its tracker would say it. */
export function stateWord(row: TrackerRow): string {
  if (row.state === 'merged') return 'Merged'
  if (row.state === 'closed') {
    if (row.kind === 'issue' && (row.stateReason === 'NOT_PLANNED' || row.stateReason === 'DUPLICATE')) return 'Closed (not planned)'
    return 'Closed'
  }
  return row.draft ? 'Draft' : 'Open'
}

/** What the item is, in the tracker's own word. */
export function kindWord(row: TrackerRow): string {
  if (row.kind === 'issue') return row.workItem ? row.workItem.replace('_', ' ') : 'Issue'
  return row.tracker === 'gitlab' ? 'Merge request' : 'Pull request'
}

/** A pipeline state in a person's words. */
export const PIPELINE_WORDS = {
  success: 'Checks passed',
  failed: 'Checks failed',
  running: 'Checks running',
  pending: 'Checks waiting',
  canceled: 'Checks canceled',
  skipped: 'Checks skipped',
  manual: 'Checks waiting for a person',
} as const

/** The tracker's host as a person names it: `github.com`, `gitlab.example.org`. */
export const hostName = (row: TrackerRow) => row.host
