import type { TrackerRow } from 'kehikot-module-protocol'

export const NOW = Date.parse('2026-11-13T12:00:00.000Z')
export const READ_AT = '2026-11-13T11:57:00.000Z'

/** A change as the host's reading carries it, with its detail. */
export function change(over: Partial<TrackerRow> = {}): TrackerRow {
  return {
    ref: 'gh#5',
    tracker: 'github',
    host: 'github.com',
    repo: 'owner/repo',
    number: 5,
    kind: 'change',
    state: 'open',
    title: 'Read one item without a browser',
    url: 'https://github.com/owner/repo/pull/5',
    labels: ['ux'],
    assignees: ['Ada'],
    author: 'bob',
    createdAt: '2026-11-10T12:00:00.000Z',
    updatedAt: '2026-11-13T11:57:00.000Z',
    links: [{ ref: 'gh#3', relation: 'closes' }],
    contributes: ['gh#2'],
    pipeline: 'failed',
    baseBranch: 'main',
    headBranch: 'read-item',
    readAt: READ_AT,
    detail: {
      body: 'Shows **one** item.\n\n<script>alert(1)</script>',
      bodyClipped: false,
      files: [],
      filesClipped: false,
      readAt: READ_AT,
      milestone: { title: 'v1', dueOn: '2026-12-01' },
      comments: [
        { id: '1', kind: 'comment', login: 'ada', at: '2026-11-11T10:00:00.000Z', body: 'Looks right.', bodyClipped: false },
        { id: 'r2', kind: 'review', login: 'cy', at: '2026-11-12T10:00:00.000Z', body: 'One nit.', bodyClipped: false, verdict: 'approved' },
      ],
      commentCount: 2,
      checks: [
        { name: 'test', state: 'failed', url: 'https://github.com/owner/repo/runs/1' },
        { name: 'lint', state: 'success' },
      ],
    },
    ...over,
  }
}
