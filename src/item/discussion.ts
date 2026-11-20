import type { TrackerComment } from 'kehikot-module-protocol'

/**
 * How the discussion is laid out for a person who wants to find what people said: pure, so every
 * rule here is a test. No author is ever named in code — a bot is what the tracker's data says is
 * one, and a repeat is what repeats.
 */

/** A comment, and the field a tracker reading may carry for an account that is not a person. */
type Authored = TrackerComment & { bot?: boolean }

/**
 * Whether the tracker says a comment was written by an account that is not a person. Only from the
 * tracker's own data, never from a list of names:
 *
 * - `bot: true` on the comment, when the reading carries it;
 * - a GitHub app account, whose login GitHub spells with `[bot]` at the end;
 * - a GitLab project or group access token's user, which GitLab names `project_<id>_bot…` or
 *   `group_<id>_bot…`.
 *
 * Anything else is a person, so nothing a person wrote is ever folded away as a bot's.
 */
export function isBot(comment: Authored): boolean {
  if (comment.bot === true) return true
  const login = comment.login ?? ''
  return /\[bot\]$/i.test(login) || /^(?:project|group)_\d+_bot(?:_|$)/i.test(login)
}

/**
 * What a comment looks like with everything that changes from one run of a bot to the next taken
 * out: numbers, addresses, commit hashes, spacing. Two comments with the same shape say the same
 * thing about different numbers.
 */
export function shapeOf(body: string): string {
  return body
    .replace(/https?:\/\/[^\s)'"]+/g, '@')
    .replace(/\b[0-9a-f]{7,64}\b/gi, '#')
    .replace(/\d+(?:[.,]\d+)*/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Whether a body has enough to it that the same shape twice is a template, not two people saying "Thanks". */
const substantial = (body: string) => body.split('\n').filter((line) => line.trim()).length >= 3 || body.trim().length >= 120

/** One thing the discussion draws: a comment, and the earlier ones that look just like it. */
export type Entry = {
  comment: TrackerComment
  /** Written by an account the tracker says is not a person. */
  bot: boolean
  /** Earlier comments by the same author with the same shape, oldest first, folded under this one. */
  earlier: TrackerComment[]
}

/** Whether an entry is drawn as one line: a bot's comment, or one that repeats. */
export const compact = (entry: Entry) => entry.bot || entry.earlier.length > 0

/**
 * The comments, oldest first, as entries: every comment by the same author, of the same kind, on the
 * same file and with the same shape is folded under the newest of them, which stands where that
 * newest one was. A bot's comments fold however short; a person's only when the comment is long
 * enough to be a template, so two short replies are never taken for one.
 */
export function arrange(comments: readonly TrackerComment[]): Entry[] {
  const keyOf = (c: TrackerComment) => {
    if (!isBot(c) && !substantial(c.body)) return null
    return [c.login ?? c.name ?? '', c.kind, c.path ?? '', shapeOf(c.body)].join('\n')
  }
  const groups = new Map<string, TrackerComment[]>()
  for (const c of comments) {
    const key = keyOf(c)
    if (key === null) continue
    const group = groups.get(key) ?? []
    group.push(c)
    groups.set(key, group)
  }
  const out: Entry[] = []
  for (const c of comments) {
    const key = keyOf(c)
    const group = key === null ? [c] : groups.get(key)!
    if (group[group.length - 1] !== c) continue
    out.push({ comment: c, bot: isBot(c), earlier: group.slice(0, -1) })
  }
  return out
}

/**
 * A comment in one line: its first line with words in it, without the pictures, the link addresses
 * and the Markdown marks. What a folded comment says until it is opened.
 */
export function summaryOf(body: string, most = 140): string {
  for (const raw of body.replace(/<!--[\s\S]*?(?:-->|$)/g, '').split('\n')) {
    /* A GitHub alert's marker (`> [!CAUTION]`) says what kind of note follows, not what it says. */
    if (/^\s*>?\s*\[![A-Z]+\]\s*$/.test(raw)) continue
    const line = raw
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/<img\b[^>]*>/gi, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/^(?:\s*(?:#{1,6}|>|[-*+]|\d+\.)(?=\s))+\s*/, '')
      .replace(/[*_`~]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (/\p{L}/u.test(line)) return line.length > most ? `${line.slice(0, most - 1).trimEnd()}…` : line
  }
  return ''
}

/**
 * A word a reviewer opens a comment with to say how much it matters — `Important:`, `Nit:`,
 * `**Blocking:**`, `suggestion (non-blocking):` — picked out of the text, and the text without it.
 * At most three words, on the first line, followed by more words; anything else is no label.
 */
export function leadOf(body: string): { label: string; rest: string } | null {
  const m = /^\s*(\*\*|__)?([A-Za-z][A-Za-z-]*(?: [A-Za-z][A-Za-z-]*){0,2}(?: ?\([A-Za-z ,-]{1,24}\))?)(\*\*|__)?:(\*\*|__)?[ \t]+(?=\S)/.exec(body)
  if (!m) return null
  const [whole, open, label, closeBefore, closeAfter] = m
  /* Bold opened is bold closed, before or after the colon; not bold is no stray marks either. */
  const balanced = open ? closeBefore === open || closeAfter === open : !closeBefore && !closeAfter
  if (!balanced || label!.length > 32) return null
  return { label: label!, rest: body.slice(whole.length) }
}

/** A file's path, short enough for a chip: its first folder, `…` and its name. The whole is the chip's hover. */
export function shortPath(path: string): string {
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 3) return parts.join('/')
  return `${parts[0]}/…/${parts[parts.length - 1]}`
}

/** One letter for an author's mark, and a hue to tell people apart by (the name is always written beside it). */
export function markOf(who: string): { letter: string; hue: number } {
  const letter = (/\p{L}|\d/u.exec(who)?.[0] ?? '?').toUpperCase()
  let hash = 0
  for (const ch of who) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  return { letter, hue: hash % 360 }
}
