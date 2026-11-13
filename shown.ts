import { LIMITS, PIPELINE_STATES, TRACKER_KINDS, TRACKER_STATES, TRACKERS } from 'kehikot-module-protocol'
import { z } from 'zod'

/**
 * What the page is showing, per project, for the agent door (`shown_item`). Held in this
 * process's memory and nowhere else: it is a fact about a page that is open now, so it dies with
 * the process, and nothing is written to the project or the machine. The page sends it whole on
 * every change and `null` when it shows nothing.
 *
 * Bounded twice: each entry by its schema, and the map by `MOST_PROJECTS`, oldest dropped.
 */

const text = (most: number) => z.string().max(most)
const instant = z.string().datetime({ offset: true })
const ref = z.string().min(1).max(LIMITS.REF)

export const shownSchema = z.object({
  ref,
  tracker: z.enum(TRACKERS),
  host: text(LIMITS.TRACKER_HOST),
  repo: text(LIMITS.TRACKER_REPO),
  number: z.number().int().positive(),
  kind: z.enum(TRACKER_KINDS),
  state: z.enum(TRACKER_STATES),
  draft: z.boolean().optional(),
  title: text(LIMITS.TITLE),
  url: text(LIMITS.URL),
  author: text(LIMITS.TRACKER_PERSON).nullable().optional(),
  assignees: z.array(text(LIMITS.TRACKER_PERSON)).max(LIMITS.TRACKER_PEOPLE).default([]),
  labels: z.array(text(LIMITS.TRACKER_LABEL)).max(LIMITS.TRACKER_LABELS).default([]),
  milestone: text(LIMITS.TITLE).optional(),
  baseBranch: text(LIMITS.BRANCH).optional(),
  headBranch: text(LIMITS.BRANCH).optional(),
  pipeline: z.enum(PIPELINE_STATES).optional(),
  failedChecks: z.array(text(LIMITS.TRACKER_LABEL)).max(LIMITS.TRACKER_CHECKS).optional(),
  commentCount: z.number().int().min(0).optional(),
  linked: z.array(z.object({ ref, how: text(32) })).max(LIMITS.TRACKER_LINKS * 2).default([]),
  updatedAt: instant.nullable().optional(),
  readAt: instant,
  /** "Offline: showing what was read at 12:03", when the page says so. */
  offline: text(LIMITS.REASON).optional(),
})
export type Shown = z.infer<typeof shownSchema>

/** A post larger than any entry the schema allows is refused before it is parsed. */
export const MAX_SHOWN_BYTES = 64 * 1024

/** How many projects' pages are remembered at once. A person has a few open. */
export const MOST_PROJECTS = 32

const held = new Map<string, Shown>()

export function writeShown(projectPath: string, shown: Shown | null): void {
  held.delete(projectPath)
  if (shown === null) return
  held.set(projectPath, shown)
  while (held.size > MOST_PROJECTS) held.delete(held.keys().next().value as string)
}

export function readShown(projectPath: string): Shown | null {
  return held.get(projectPath) ?? null
}
