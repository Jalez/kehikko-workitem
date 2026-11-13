import { memo, useMemo, useState, type MouseEvent } from 'react'

import type { TrackerCheck, TrackerComment, TrackerRow } from 'kehikot-module-protocol'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { linkTarget, markdownHtml } from '@/item/markdown.ts'
import { PIPELINE_WORDS, ago, kindWord, linkedRefs, stateWord } from '@/item/reading.ts'

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
}: {
  row: TrackerRow
  /** Summary rows of the items this one links to, as far as the reading has them. */
  linked: ReadonlyMap<string, TrackerRow>
  now: number
  open: Open
  /** The detail is being read and is not here yet. */
  detailPending: boolean
}) {
  const d = row.detail
  return (
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
  if (row.reviewers?.length) rows.push(['Reviewers', row.reviewers.map((r) => `${r.name ?? r.login} (${r.state})`).join(', ')])
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

function Checks({ row, open }: { row: TrackerRow; open: Open }) {
  const checks = row.detail?.checks ?? []
  /* The failed ones first: what a person opens checks to find. */
  const ordered = useMemo(() => [...checks].sort((a, b) => Number(b.state === 'failed') - Number(a.state === 'failed')), [checks])
  return (
    <section aria-label="Checks" className="flex flex-col gap-1 text-xs" data-testid="checks">
      <h2 className="flex items-center gap-2 font-medium">
        {row.pipeline ? <span className={`inline-block size-2 rounded-full ${DOT[row.pipeline]}`} /> : null}
        {row.pipeline ? PIPELINE_WORDS[row.pipeline] : 'Checks'}
        {row.pipelineUrl ? (
          <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => open(row.pipelineUrl!)}>
            details
          </button>
        ) : null}
      </h2>
      {ordered.length ? (
        <ul className="flex flex-col gap-0.5">
          {ordered.map((check, i) => (
            <li key={`${check.name}-${i}`} className="flex items-center gap-2">
              <span className={`inline-block size-1.5 shrink-0 rounded-full ${DOT[check.state]}`} aria-hidden />
              {check.url ? (
                <button type="button" className="truncate text-left underline-offset-2 hover:underline" onClick={() => open(check.url!)}>
                  {check.stage ? `${check.stage} › ` : ''}
                  {check.name}
                </button>
              ) : (
                <span className="truncate">
                  {check.stage ? `${check.stage} › ` : ''}
                  {check.name}
                </span>
              )}
              <span className="text-muted-foreground ml-auto shrink-0">{check.state}</span>
            </li>
          ))}
          {row.detail?.checksClipped ? <li className="text-muted-foreground">and more on {row.host}</li> : null}
        </ul>
      ) : null}
    </section>
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
  const drawn = comments.slice(-showing)
  const hiddenHere = comments.length - drawn.length
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
      <ol className="flex flex-col gap-3">
        {drawn.map((c) => (
          <Comment key={c.id} comment={c} base={row.url} now={now} open={open} />
        ))}
      </ol>
    </section>
  )
}

const VERDICT = { approved: 'approved', changes: 'asked for changes', commented: 'reviewed' } as const

const Comment = memo(function Comment({ comment, base, now, open }: { comment: TrackerComment; base: string; now: number; open: Open }) {
  const who = comment.name ?? comment.login ?? 'Somebody'
  return (
    <li className="border-l-2 pl-2" data-testid="comment">
      <p className="text-muted-foreground text-xs">
        <span className="text-foreground font-medium">{who}</span>
        {comment.kind === 'review' ? ` ${VERDICT[comment.verdict ?? 'commented']}` : comment.kind === 'line' ? ' on ' : ''}
        {comment.kind === 'line' && comment.path ? <span className="font-mono">{comment.path}</span> : null}
        {' · '}
        {comment.url ? (
          <button type="button" className="underline-offset-2 hover:underline" onClick={() => open(comment.url!)} title={comment.at}>
            {ago(comment.at, now)}
          </button>
        ) : (
          <time dateTime={comment.at}>{ago(comment.at, now)}</time>
        )}
        {comment.editedAt ? ' · edited' : ''}
      </p>
      <Markdown text={comment.body} base={base} open={open} />
      {comment.bodyClipped ? <p className="text-muted-foreground text-xs">…the rest is on the tracker.</p> : null}
    </li>
  )
})

/** Markdown, rendered once per text; a press on a link goes to the host. */
export const Markdown = memo(function Markdown({ text, base, open }: { text: string; base: string; open: Open }) {
  const html = useMemo(() => markdownHtml(text), [text])
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest('a')
    if (!link) return
    event.preventDefault()
    const target = linkTarget(link.getAttribute('href'), base)
    if (target) open(target)
  }
  return <div className="markdown text-sm break-words" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
})
