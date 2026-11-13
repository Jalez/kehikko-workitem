import type { TrackerCheck } from 'kehikot-module-protocol'

/** A check's state in the words a person reads it in. */
export const STATE_WORDS: Record<TrackerCheck['state'], string> = {
  success: 'passed',
  failed: 'failed',
  running: 'running',
  pending: 'waiting',
  canceled: 'canceled',
  skipped: 'skipped',
  manual: 'manual',
}

/**
 * How bad a state looks, worst first: failed, canceled, running, waiting, manual, skipped, passed.
 * A manual job is waiting for a person, not failing, so it ranks well below a failure.
 */
const RANK: Record<TrackerCheck['state'], number> = {
  failed: 6,
  canceled: 5,
  running: 4,
  pending: 3,
  manual: 2,
  skipped: 1,
  success: 0,
}

/** The order the states are counted and listed in. */
export const STATES_WORST_FIRST = (Object.keys(RANK) as TrackerCheck['state'][]).sort((a, b) => RANK[b] - RANK[a])

export const worse = (a: TrackerCheck['state'], b: TrackerCheck['state']) => (RANK[a] >= RANK[b] ? a : b)

/** The usual pipeline's stage order; used when every stage of a pipeline is one of these. */
export const KNOWN_STAGES = ['validate', 'build', 'test', 'smoke', 'publish'] as const

/** What a check with nothing to group it by is grouped under. */
export const UNGROUPED = 'Checks'

/**
 * The stage a check belongs to: the one the tracker gave (a GitLab job's `stage`), else the part of
 * its name before " › ", " / " (a GitHub workflow's name) or ":" , else one group for the rest.
 */
export function stageOf(check: Pick<TrackerCheck, 'name' | 'stage'>): string {
  const given = check.stage?.trim()
  if (given) return given
  const name = check.name.trim()
  for (const sep of [' › ', ' / ', ':']) {
    const at = name.indexOf(sep)
    if (at > 0) return name.slice(0, at).trim()
  }
  return UNGROUPED
}

/** A job's own name within its stage: the stage's prefix is dropped when the name repeats it. */
export function jobName(check: Pick<TrackerCheck, 'name' | 'stage'>, stage: string): string {
  const name = check.name.trim()
  for (const sep of [' › ', ' / ']) {
    if (name.startsWith(stage + sep)) return name.slice(stage.length + sep.length) || name
  }
  return name
}

export type Stage = {
  name: string
  /** The worst state among its jobs. */
  state: TrackerCheck['state']
  /** How many jobs are in each state, only the states present. */
  counts: Partial<Record<TrackerCheck['state'], number>>
  /** Its jobs, the worst first; the tracker's order within a state. */
  jobs: TrackerCheck[]
}

/** The checks grouped by stage, in the pipeline's order when every stage is known, else first-seen. */
export function groupStages(checks: readonly TrackerCheck[]): Stage[] {
  const byName = new Map<string, TrackerCheck[]>()
  for (const check of checks) {
    const name = stageOf(check)
    const list = byName.get(name)
    if (list) list.push(check)
    else byName.set(name, [check])
  }
  let names = [...byName.keys()]
  const known = (n: string) => (KNOWN_STAGES as readonly string[]).indexOf(n.toLowerCase())
  if (names.length > 1 && names.every((n) => known(n) >= 0)) names = [...names].sort((a, b) => known(a) - known(b))
  return names.map((name) => {
    const list = byName.get(name)!
    const counts: Stage['counts'] = {}
    let state: TrackerCheck['state'] = 'success'
    for (const c of list) {
      counts[c.state] = (counts[c.state] ?? 0) + 1
      state = worse(state, c.state)
    }
    const jobs = [...list].sort((a, b) => RANK[b.state] - RANK[a.state])
    return { name, state, counts, jobs }
  })
}

/** "2 failed · 12 passed": every state present, the worst first. */
export function countsWords(counts: Stage['counts']): string {
  return STATES_WORST_FIRST.filter((s) => counts[s]).map((s) => `${counts[s]} ${STATE_WORDS[s]}`).join(' · ')
}

/** "2 failed", "1 running": the part of a stage's counts that is not passing, or '' when all passed. */
export function trouble(counts: Stage['counts']): string {
  return STATES_WORST_FIRST.filter((s) => s !== 'success' && counts[s]).map((s) => `${counts[s]} ${STATE_WORDS[s]}`).join(' · ')
}

/**
 * The line over the badges: "Pipeline failed · 2 of 34 failed". `pipeline` is the tracker's own word
 * for the whole pipeline; without it the worst state of the checks says it.
 */
export function overallLine(pipeline: TrackerCheck['state'] | undefined, checks: readonly TrackerCheck[]): string {
  const state = pipeline ?? checks.reduce<TrackerCheck['state']>((s, c) => worse(s, c.state), 'success')
  const head: Record<TrackerCheck['state'], string> = {
    success: 'Pipeline passed',
    failed: 'Pipeline failed',
    running: 'Pipeline running',
    pending: 'Pipeline waiting',
    canceled: 'Pipeline canceled',
    skipped: 'Pipeline skipped',
    manual: 'Pipeline waiting for a person',
  }
  const total = checks.length
  if (!total) return head[state]
  const n = checks.filter((c) => c.state === state).length
  if (state === 'success') return `${head[state]} · ${total} ${total === 1 ? 'check' : 'checks'}`
  if (!n) return `${head[state]} · ${total} ${total === 1 ? 'check' : 'checks'}`
  return `${head[state]} · ${n} of ${total} ${STATE_WORDS[state]}`
}
