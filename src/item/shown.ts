import type { TrackerRow } from 'kehikot-module-protocol'

import type { Shown } from '../../shown.ts'
import { linkedRefs } from './reading.ts'

/** What the page tells its server it is showing, for `shown_item`: the row, without the long text. */
export function shownOf(row: TrackerRow, offline: string | null): Shown {
  const d = row.detail
  const failed = d?.checks?.filter((c) => c.state === 'failed').map((c) => c.name)
  return {
    ref: row.ref,
    tracker: row.tracker,
    host: row.host,
    repo: row.repo,
    number: row.number,
    kind: row.kind,
    state: row.state,
    ...(row.draft !== undefined ? { draft: row.draft } : {}),
    title: row.title,
    url: row.url,
    ...(row.author !== undefined ? { author: row.author } : {}),
    assignees: row.assignees,
    labels: row.labels,
    ...(d?.milestone ? { milestone: d.milestone.title } : {}),
    ...(row.baseBranch ? { baseBranch: row.baseBranch } : {}),
    ...(row.headBranch ? { headBranch: row.headBranch } : d?.fork ? { headBranch: `${d.fork.repo}:${d.fork.branch}` } : {}),
    ...(row.pipeline ? { pipeline: row.pipeline } : {}),
    ...(failed?.length ? { failedChecks: failed } : {}),
    ...(d?.commentCount !== undefined ? { commentCount: d.commentCount } : {}),
    linked: linkedRefs(row),
    ...(row.updatedAt !== undefined ? { updatedAt: row.updatedAt } : {}),
    readAt: d?.readAt && d.readAt > row.readAt ? d.readAt : row.readAt,
    ...(offline ? { offline } : {}),
  }
}
