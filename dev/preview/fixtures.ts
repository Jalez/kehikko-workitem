import type { TrackerComment, TrackerRow } from 'kehikot-module-protocol'

/**
 * A merge request on a self-hosted GitLab with a code-quality bot reporting on every push and a
 * person reviewing two files: the discussion as a person saw it, for the preview page.
 */
const SCAN = 'https://scan.example'
const badge = (name: string, file: string) => `${SCAN}/static/communityBranchPlugin/common/${file}-16px.png`
const issues = `${SCAN}/project/issues?id=app&pullRequest=5&resolved=false`

function report(coverage: string, duplication: string): string {
  return [
    `![Passed](${SCAN}/static/communityBranchPlugin/checks/QualityGateBadge/passed-16px.png 'Passed') **Quality Gate passed**`,
    '',
    '**Issues**  ',
    `[![New Issues](${badge('New Issues', 'new_issues')} 'New Issues')](${issues}&inNewCodePeriod=true) [0 New Issues](${issues}&inNewCodePeriod=true)  `,
    `[![Fixed Issues](${badge('Fixed Issues', 'fixed_issues')} 'Fixed Issues')](${issues}&fixedInPullRequest=5) [0 Fixed Issues](${issues}&fixedInPullRequest=5)  `,
    `[![Accepted Issues](${badge('Accepted Issues', 'accepted_issues')} 'Accepted Issues')](${issues}&issueStatuses=ACCEPTED) [0 Accepted Issues](${issues}&issueStatuses=ACCEPTED)`,
    '',
    '**Measures**  ',
    `[![Security Hotspots](${badge('Security Hotspots', 'security_hotspots')} 'Security Hotspots')](${SCAN}/security_hotspots?id=app&pullRequest=5) [0 Security Hotspots](${SCAN}/security_hotspots?id=app&pullRequest=5)  `,
    `[![Coverage](${badge('Coverage', 'coverage')} 'Coverage')](${SCAN}/component_measures?id=app&metric=new_coverage) [${coverage}% Coverage (88.00% Estimated after merge)](${SCAN}/component_measures?id=app&metric=new_coverage)  `,
    `[![Duplications](${badge('Duplications', 'duplications')} 'Duplications')](${SCAN}/component_measures?id=app&metric=new_duplicated_lines_density) [0.00% Duplicated Code (${duplication}% Estimated after merge)](${SCAN}/component_measures?id=app&metric=new_duplicated_lines_density)`,
    '',
    '**Project ID:** app',
    '',
    `[View in the scanner](${SCAN}/dashboard?id=app&pullRequest=5)`,
  ].join('\n')
}

const bot = { login: 'project_17_bot_3c1f2a', name: 'Code scanner' }
const day = (d: number, h: number) => `2026-11-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00.000Z`

const comments: TrackerComment[] = [
  ...['97.10', '97.20', '97.40', '97.40', '97.50', '97.50'].map((cov, i) => ({
    id: `n${i + 1}`,
    kind: 'comment' as const,
    ...bot,
    at: day(17, 8 + i),
    body: report(cov, ['0.30', '0.30', '0.40', '0.40', '0.40', '0.40'][i]!),
    bodyClipped: false,
  })),
  {
    id: 'n7',
    kind: 'line',
    login: 'a.reviewer',
    at: day(19, 16),
    body: [
      '**Important:** Remove on a token whose save landed but whose read-back failed deletes it on screen only, and the next refresh brings it back.',
      '',
      'Two ways it shows:',
      '',
      '- the list drops the row at once, before `removeToken` has answered;',
      '- a failed answer leaves no trace, so the person thinks it is gone.',
      '',
      'Keep the row until the answer is in, and say when it failed.',
    ].join('\n'),
    bodyClipped: false,
    path: 'apps/console/src/features/tokens/hooks/use-token-removal.ts',
    url: 'https://gitlab.example.org/team/app/-/merge_requests/5#note_7',
  },
  {
    id: 'n8',
    kind: 'line',
    login: 'a.reviewer',
    at: day(19, 17),
    body: 'Important: `RemoveTokenDialog` re-implements the shared `ConfirmationDialog`. Use that one, so focus and Escape behave the same as everywhere else.',
    bodyClipped: false,
    path: 'apps/console/src/features/tokens/components/remove-token-dialog.tsx',
    url: 'https://gitlab.example.org/team/app/-/merge_requests/5#note_8',
  },
  {
    id: 'n9',
    kind: 'comment',
    login: 'm.owner',
    name: 'Mia Owner',
    at: day(20, 9),
    body: 'Thanks, both fair. I will fix the removal first and switch the dialog in the same push.',
    bodyClipped: false,
  },
]

export const PREVIEW_NOW = Date.parse(day(20, 12))

export const previewRow: TrackerRow = {
  ref: 'gl#5',
  tracker: 'gitlab',
  host: 'gitlab.example.org',
  repo: 'team/app',
  number: 5,
  kind: 'change',
  state: 'open',
  title: 'Remove a token from the console',
  url: 'https://gitlab.example.org/team/app/-/merge_requests/5',
  labels: ['console'],
  assignees: ['Mia Owner'],
  author: 'm.owner',
  createdAt: day(16, 10),
  updatedAt: day(20, 9),
  links: [],
  pipeline: 'success',
  baseBranch: 'main',
  headBranch: 'token-removal',
  readAt: day(20, 11),
  reviewers: [{ login: 'a.reviewer', state: 'commented' }],
  detail: {
    body: 'Adds Remove to each token in the console, with a confirmation.',
    bodyClipped: false,
    files: [],
    filesClipped: false,
    readAt: day(20, 11),
    comments,
    commentCount: comments.length,
  },
}
