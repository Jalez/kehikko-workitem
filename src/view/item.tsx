import { memo, useMemo, useRef, useState, type MouseEvent } from 'react'

import type { TrackerCheck, TrackerComment, TrackerRow } from 'kehikot-module-protocol'

import { PictureProvider, PictureSlots, usePictureScope, useSlots, type PictureScope } from '@/view/pictures.tsx'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Ban, Bot, Check, ChevronRight, CircleSlash, Clock, FileCode, Hand, Loader, X } from 'lucide-react'
import { countsWords, groupStages, jobName, overallLine, STATE_WORDS, trouble, type Stage } from '@/item/stages.ts'
import { arrange, compact, leadOf, markOf, shortPath, summaryOf, type Entry } from '@/item/discussion.ts'
import { linkTarget, markdownHtml } from '@/item/markdown.ts'
import { ago, kindWord, linkedRefs, stateWord } from '@/item/reading.ts'

/** How many comments are drawn at first, and how many more each press shows. Light on a long thread. */
export const COMMENT_PAGE = 20

export type Open = (url: string) => void

/**
 * One item, in full. Everything drawn is text the tracker sent, as text: a description and a
 * comment as Markdown without raw HTML (`markdownHtml`), every link opened through `open`, which
 * hands it to the host.
 */
export function ItemView({
  row,
  linked,
  now,
  open,
  detailPending,
  pictures,
}: {
  row: TrackerRow
  /** Summary rows of the items this one links to, as far as the reading has them. */
  linked: ReadonlyMap<string, TrackerRow>
  now: number
  open: Open
  /** The detail is being read and is not here yet. */
  detailPending: boolean
  /** Where the pictures in the text come from; none draws them as links. */
  pictures?: PictureScope['pictures']
}) {
  const d = row.detail
  const scope = useMemo(() => (pictures ? { itemRef: row.ref, pictures } : null), [pictures, row.ref])
  return (
    <PictureProvider value={scope}>
    <article className="flex flex-col gap-4" data-testid="item">
      <header className="flex flex-col gap-1">
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
          <StateBadge row={row} />
          <span>
            {kindWord(row)} <span className="font-mono">{row.ref}</span> in {row.repo}
          </span>
        </div>
        <h1 className="text-base leading-snug font-semibold" data-testid="title">
          {row.title}
        </h1>
        <p className="text-muted-foreground text-xs">
          {row.author ? <>Opened by {row.author}</> : <>Opened</>}
          {row.createdAt ? <> {ago(row.createdAt, now)}</> : null}
          {row.updatedAt ? <> · updated {ago(row.updatedAt, now)}</> : null}
        </p>
      </header>

      <Facts row={row} />

      {row.kind === 'change' ? <Branches row={row} /> : null}
      {row.kind === 'change' && (row.pipeline || d?.checks?.length) ? <Checks row={row} open={open} /> : null}

      <section aria-label="Description">
        {d ? (
          d.body.trim() ? (
            <>
              <Markdown text={d.body} base={row.url} open={open} />
              {d.bodyClipped ? <MoreOn row={row} open={open} words="The description goes on" /> : null}
            </>
          ) : (
            <p className="text-muted-foreground italic">No description.</p>
          )
        ) : (
          <p className="text-muted-foreground text-xs">{detailPending ? 'Reading the description and discussion…' : 'The description could not be read.'}</p>
        )}
      </section>

      <Linked row={row} linked={linked} />

      {d?.comments ? <Discussion row={row} comments={d.comments} total={d.commentCount} now={now} open={open} /> : null}
    </article>
    </PictureProvider>
  )
}

function StateBadge({ row }: { row: TrackerRow }) {
  const word = stateWord(row)
  const tone =
    row.state === 'open' && !row.draft
      ? 'border-emerald-600/40 text-emerald-700 dark:text-emerald-400'
      : row.state === 'merged'
        ? 'border-violet-600/40 text-violet-700 dark:text-violet-400'
        : ''
  return (
    <Badge variant="outline" className={tone} data-testid="state">
      {word}
    </Badge>
  )
}

function Facts({ row }: { row: TrackerRow }) {
  const milestone = row.detail?.milestone
  const rows: Array<[string, React.ReactNode]> = []
  if (row.assignees.length) rows.push(['Assignees', row.assignees.join(', ')])
  if (row.labels.length) {
    rows.push([
      'Labels',
      <span className="flex flex-wrap gap-1">
        {row.labels.map((label) => (
          <Badge key={label} variant="secondary">
            {label}
          </Badge>
        ))}
      </span>,
    ])
  }
  if (milestone) rows.push(['Milestone', `${milestone.title}${milestone.dueOn ? ` · due ${milestone.dueOn}` : ''}`])
  if (row.kind === 'change') rows.push(['Reviewers', <Reviewers row={row} />])
  const approvals = row.detail?.approvals
  if (row.kind === 'change' && approvals) rows.push(['Approvals', `${approvals.given} of ${approvals.required}`])
  if (!rows.length) return null
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs" data-testid="facts">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Each reviewer with where they stand. Always drawn for a change: "None" says it was read and nobody is asked. */
function Reviewers({ row }: { row: TrackerRow }) {
  if (!row.reviewers) return <span className="text-muted-foreground">Not read yet</span>
  if (!row.reviewers.length) return <span className="text-muted-foreground">None</span>
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-0.5" data-testid="reviewers">
      {row.reviewers.map((r) => (
        <li key={r.login} className="inline-flex items-center gap-1">
          <span>{r.name ?? r.login}</span>
          <span className="text-muted-foreground">{REVIEWER_WORDS[r.state]}</span>
        </li>
      ))}
    </ul>
  )
}

const REVIEWER_WORDS: Record<NonNullable<TrackerRow['reviewers']>[number]['state'], string> = {
  approved: '✓ approved',
  changes: '✕ requested changes',
  commented: 'commented',
  requested: 'pending',
}

function Branches({ row }: { row: TrackerRow }) {
  const fork = row.detail?.fork
  const from = row.headBranch ?? (fork ? `${fork.repo}:${fork.branch}` : null)
  if (!from && !row.baseBranch) return null
  return (
    <p className="text-xs" data-testid="branches">
      <span className="text-muted-foreground">Merges </span>
      <span className="font-mono">{from ?? 'a branch'}</span>
      <span className="text-muted-foreground"> into </span>
      <span className="font-mono">{row.baseBranch ?? 'its target'}</span>
    </p>
  )
}

const DOT: Record<TrackerCheck['state'], string> = {
  success: 'bg-emerald-500',
  failed: 'bg-red-500',
  running: 'bg-amber-500 animate-pulse',
  pending: 'bg-amber-300',
  canceled: 'bg-zinc-400',
  skipped: 'bg-zinc-300',
  manual: 'bg-sky-400',
}

/** A stage badge's colours by its worst state. The icon and the words carry the state as well. */
const TONE: Record<TrackerCheck['state'], string> = {
  success: 'border-emerald-600/40 text-emerald-700 dark:text-emerald-400',
  failed: 'border-red-600/50 bg-red-500/10 text-red-700 dark:text-red-400',
  running: 'border-amber-600/50 text-amber-700 dark:text-amber-400',
  pending: 'border-amber-500/40 text-amber-700 dark:text-amber-400',
  canceled: 'border-zinc-500/40 text-zinc-600 dark:text-zinc-400',
  skipped: 'border-zinc-400/40 text-zinc-500',
  manual: 'border-sky-600/40 text-sky-700 dark:text-sky-400',
}

const ICON: Record<TrackerCheck['state'], typeof Check> = {
  success: Check,
  failed: X,
  running: Loader,
  pending: Clock,
  canceled: Ban,
  skipped: CircleSlash,
  manual: Hand,
}

function StateIcon({ state, className = 'size-3' }: { state: TrackerCheck['state']; className?: string }) {
  const Icon = ICON[state]
  return <Icon className={`${className} shrink-0`} aria-hidden />
}

function Checks({ row, open }: { row: TrackerRow; open: Open }) {
  const checks = row.detail?.checks ?? []
  const stages = useMemo(() => groupStages(checks), [checks])
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const toggle = (name: string) =>
    setExpanded((was) => {
      const next = new Set(was)
      if (!next.delete(name)) next.add(name)
      return next
    })
  const line = overallLine(row.pipeline, checks)
  return (
    <section aria-label="Checks" className="flex flex-col gap-2 text-xs" data-testid="checks">
      <h2 className="flex items-center gap-2 font-medium">
        {row.pipeline ? <span className={`inline-block size-2 rounded-full ${DOT[row.pipeline]}`} aria-hidden /> : null}
        <span data-testid="pipeline-line">{line}</span>
        {row.pipelineUrl ? (
          <>
            {' '}
            <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => open(row.pipelineUrl!)}>
              Open pipeline
            </button>
          </>
        ) : null}
      </h2>
      {stages.length ? (
        <ul className="flex flex-wrap gap-1.5" data-testid="stages">
          {stages.map((stage) => {
            const isOpen = expanded.has(stage.name)
            const bad = trouble(stage.counts)
            const words = countsWords(stage.counts)
            return (
              <li key={stage.name} className="flex flex-col">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      data-testid="stage"
                      data-state-worst={stage.state}
                      aria-expanded={isOpen}
                      aria-controls={`stage-${stage.name}`}
                      aria-label={`${stage.name}: ${words}`}
                      onClick={() => toggle(stage.name)}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium ${TONE[stage.state]}`}
                    >
                      <span>{stage.name}</span>
                      <StateIcon state={stage.state} />
                      {bad ? <span className="font-normal">{words}</span> : null}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-80 text-left" data-testid="stage-tip">
                    <StageJobs stage={stage} />
                  </TooltipContent>
                </Tooltip>
              </li>
            )
          })}
        </ul>
      ) : null}
      {stages.map((stage) =>
        expanded.has(stage.name) ? (
          <div key={stage.name} id={`stage-${stage.name}`} className="flex flex-col gap-1" data-testid="stage-jobs">
            <p className="text-muted-foreground font-medium">{stage.name}</p>
            <StageJobs stage={stage} open={open} />
          </div>
        ) : null,
      )}
      {row.detail?.checksClipped ? <p className="text-muted-foreground">and more on {row.host}</p> : null}
    </section>
  )
}

/** A stage's jobs with their states, the worst first. Opens a job's link through the host when `open` is given. */
function StageJobs({ stage, open }: { stage: Stage; open?: Open }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {stage.jobs.map((job, i) => {
        const name = jobName(job, stage.name)
        return (
          <li key={`${job.name}-${i}`} className="flex items-center gap-2" data-testid="job">
            <StateIcon state={job.state} className="size-3" />
            {open && job.url ? (
              <button type="button" className="truncate text-left underline-offset-2 hover:underline" onClick={() => open(job.url!)}>
                {name}
              </button>
            ) : (
              <span className="truncate">{name}</span>
            )}
            <span className="ml-auto shrink-0 opacity-70">{STATE_WORDS[job.state]}</span>
          </li>
        )
      })}
    </ul>
  )
}

function Linked({ row, linked }: { row: TrackerRow; linked: ReadonlyMap<string, TrackerRow> }) {
  const refs = linkedRefs(row)
  if (!refs.length) return null
  return (
    <section aria-label="Linked items" className="flex flex-col gap-1 text-xs" data-testid="linked">
      <h2 className="font-medium">Linked</h2>
      <ul className="flex flex-col gap-0.5">
        {refs.map(({ ref, how }) => {
          const other = linked.get(ref)
          return (
            <li key={ref} className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">{how}</span>
              <span className="font-mono">{ref}</span>
              {other ? (
                <span className="truncate">
                  {other.title} <span className="text-muted-foreground">· {stateWord(other)}</span>
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function MoreOn({ row, open, words }: { row: TrackerRow; open: Open; words: string }) {
  return (
    <button type="button" className="text-muted-foreground mt-1 text-xs underline-offset-2 hover:underline" onClick={() => open(row.url)}>
      {words} on {row.host}
    </button>
  )
}

function Discussion({ row, comments, total, now, open }: { row: TrackerRow; comments: readonly TrackerComment[]; total?: number; now: number; open: Open }) {
  const [showing, setShowing] = useState(COMMENT_PAGE)
  const entries = useMemo(() => arrange(comments), [comments])
  const drawn = entries.slice(-showing)
  const hiddenHere = entries.length - drawn.length
  const elsewhere = Math.max(0, (total ?? comments.length) - comments.length)
  return (
    <section aria-label="Discussion" className="flex flex-col gap-2" data-testid="discussion">
      <h2 className="text-xs font-medium">
        Discussion <span className="text-muted-foreground">({total ?? comments.length})</span>
      </h2>
      {hiddenHere > 0 ? (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setShowing((n) => n + COMMENT_PAGE)}>
          Show {Math.min(COMMENT_PAGE, hiddenHere)} earlier
        </Button>
      ) : elsewhere > 0 ? (
        <MoreOn row={row} open={open} words={`${elsewhere} earlier ${elsewhere === 1 ? 'comment is' : 'comments are'}`} />
      ) : null}
      {comments.length === 0 ? <p className="text-muted-foreground text-xs italic">No comments yet.</p> : null}
      <ol className="flex flex-col gap-2">
        {drawn.map((entry) =>
          compact(entry) ? (
            <Folded key={entry.comment.id} entry={entry} base={row.url} now={now} open={open} />
          ) : (
            <Comment key={entry.comment.id} comment={entry.comment} base={row.url} now={now} open={open} />
          ),
        )}
      </ol>
    </section>
  )
}

const VERDICT = { approved: 'approved', changes: 'asked for changes', commented: 'reviewed' } as const
const VERDICT_TONE = {
  approved: 'border-emerald-600/40 text-emerald-700 dark:text-emerald-400',
  changes: 'border-red-600/50 text-red-700 dark:text-red-400',
  commented: '',
} as const

const whoOf = (c: TrackerComment) => c.name ?? c.login ?? 'Somebody'

/** An author's mark: their initial on a colour of their own, or a robot for an account that is not a person. */
function Mark({ who, bot, small }: { who: string; bot?: boolean; small?: boolean }) {
  const size = small ? 'size-4 text-[0.6rem]' : 'size-5 text-[0.65rem]'
  if (bot) {
    return (
      <span className={`bg-muted text-muted-foreground inline-flex shrink-0 items-center justify-center rounded-full ${size}`} aria-hidden>
        <Bot className="size-3" />
      </span>
    )
  }
  const { letter, hue } = markOf(who)
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${size}`}
      style={{ background: `oklch(0.55 0.1 ${hue})` }}
      aria-hidden
    >
      {letter}
    </span>
  )
}

/** When it was written, as a press to it on its tracker where there is an address. */
function When({ comment, now, open }: { comment: TrackerComment; now: number; open: Open }) {
  const words = `${ago(comment.at, now)}${comment.editedAt ? ' · edited' : ''}`
  return comment.url ? (
    <button type="button" className="text-muted-foreground shrink-0 underline-offset-2 hover:underline" onClick={() => open(comment.url!)} title={comment.at}>
      {words}
    </button>
  ) : (
    <time className="text-muted-foreground shrink-0" dateTime={comment.at}>
      {words}
    </time>
  )
}

/** The file a comment on a line is on: shortened, the whole path on hover, a press to the comment where the tracker gave its address. */
export function FileChip({ path, url, open }: { path: string; url?: string; open: Open }) {
  const chip = 'bg-muted text-foreground inline-flex max-w-full min-w-0 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[0.7rem]'
  const inner = (
    <>
      <FileCode className="size-3 shrink-0 opacity-70" aria-hidden />
      <span className="truncate">{shortPath(path)}</span>
    </>
  )
  return url ? (
    <button type="button" className={`${chip} hover:bg-accent`} title={path} aria-label={`On ${path}`} onClick={() => open(url)} data-testid="file-chip">
      {inner}
    </button>
  ) : (
    <span className={chip} title={path} aria-label={`On ${path}`} data-testid="file-chip">
      {inner}
    </span>
  )
}

/** A person's comment, as a card: who, on what, when, and what they said under it. */
const Comment = memo(function Comment({ comment, base, now, open }: { comment: TrackerComment; base: string; now: number; open: Open }) {
  const who = whoOf(comment)
  const lead = leadOf(comment.body)
  return (
    <li className="bg-card overflow-hidden rounded-lg border" data-testid="comment">
      <div className="bg-muted/40 flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-2.5 py-1.5 text-xs">
        <Mark who={who} />
        <span className="font-medium" data-testid="comment-author">
          {who}
        </span>
        {comment.kind === 'review' ? (
          <Badge variant="outline" className={VERDICT_TONE[comment.verdict ?? 'commented']}>
            {VERDICT[comment.verdict ?? 'commented']}
          </Badge>
        ) : null}
        {comment.kind === 'line' && comment.path ? <FileChip path={comment.path} url={comment.url} open={open} /> : null}
        <span className="ml-auto" />
        <When comment={comment} now={now} open={open} />
      </div>
      <div className="px-2.5 py-2">
        {lead ? (
          <Badge variant="outline" className="mb-1.5 font-semibold" data-testid="comment-lead">
            {lead.label}
          </Badge>
        ) : null}
        <Markdown text={lead ? lead.rest : comment.body} base={base} open={open} />
        {comment.bodyClipped ? <p className="text-muted-foreground mt-1 text-xs">…the rest is on the tracker.</p> : null}
      </div>
    </li>
  )
})

/**
 * A bot's comment, or one that repeats: one quiet line saying who and the gist, opened with a press.
 * The ones before it that look just like it are under it, "4 earlier like this".
 */
function Folded({ entry, base, now, open }: { entry: Entry; base: string; now: number; open: Open }) {
  const [earlier, setEarlier] = useState(false)
  const n = entry.earlier.length
  return (
    <li className="flex flex-col gap-1" data-testid="folded">
      <FoldedLine comment={entry.comment} bot={entry.bot} base={base} now={now} open={open} />
      {n > 0 ? (
        <button
          type="button"
          className="text-muted-foreground self-start pl-7 text-xs underline-offset-2 hover:underline"
          aria-expanded={earlier}
          onClick={() => setEarlier((e) => !e)}
          data-testid="earlier-like-this"
        >
          {earlier ? `Hide the ${n} earlier like this` : `${n} earlier like this`}
        </button>
      ) : null}
      {earlier ? (
        <ol className="flex flex-col gap-1 pl-5" data-testid="earlier">
          {[...entry.earlier].reverse().map((c) => (
            <li key={c.id}>
              <FoldedLine comment={c} bot={entry.bot} base={base} now={now} open={open} />
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  )
}

/** One folded comment: a line with its gist, and its whole text under it once pressed. */
function FoldedLine({ comment, bot, base, now, open }: { comment: TrackerComment; bot: boolean; base: string; now: number; open: Open }) {
  const [opened, setOpened] = useState(false)
  const who = whoOf(comment)
  const gist = summaryOf(comment.body) || 'No words'
  return (
    <div className="text-muted-foreground rounded-md border border-dashed text-xs" data-testid="folded-comment" data-bot={bot ? '' : undefined}>
      <div className="flex min-w-0 items-center gap-2 px-2 py-1">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={opened} onClick={() => setOpened((o) => !o)}>
          <ChevronRight className={`size-3 shrink-0 transition-transform ${opened ? 'rotate-90' : ''}`} aria-hidden />
          <Mark who={who} bot={bot} small />
          <span className="text-foreground/80 shrink-0 font-medium">{who}</span>
          {bot ? <span className="shrink-0 rounded border px-1 text-[0.6rem] tracking-wide uppercase">bot</span> : null}
          {comment.kind === 'line' && comment.path ? (
            <span className="shrink-0 font-mono" title={comment.path}>
              {shortPath(comment.path)}
            </span>
          ) : null}
          <span className="min-w-0 truncate" data-testid="folded-gist">
            {gist}
          </span>
        </button>
        <When comment={comment} now={now} open={open} />
      </div>
      {opened ? (
        <div className="text-foreground border-t border-dashed px-2.5 py-2" data-testid="folded-body">
          <Markdown text={comment.body} base={base} open={open} />
          {comment.bodyClipped ? <p className="text-muted-foreground mt-1 text-xs">…the rest is on the tracker.</p> : null}
        </div>
      ) : null}
    </div>
  )
}

/** Markdown, rendered once per text; a press on a link goes to the host. */
export const Markdown = memo(function Markdown({ text, base, open }: { text: string; base: string; open: Open }) {
  const html = useMemo(() => markdownHtml(text), [text])
  const scope = usePictureScope()
  const root = useRef<HTMLDivElement>(null)
  const slots = useSlots(root, html, base, scope)
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    /* Not a press inside the full-size view, which is not text. */
    const link = (event.target as HTMLElement).closest('a')
    if (!link) return
    event.preventDefault()
    const target = linkTarget(link.getAttribute('href'), base)
    if (target) open(target)
  }
  return (
    <div className="text-sm break-words" onClick={onClick}>
      <div ref={root} className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
      {scope ? <PictureSlots slots={slots} scope={scope} /> : null}
    </div>
  )
})
