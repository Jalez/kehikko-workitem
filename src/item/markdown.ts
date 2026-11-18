import { micromark } from 'micromark'
import { gfm, gfmHtml } from 'micromark-extension-gfm'
import type { CompileContext, HtmlExtension, Token } from 'micromark-util-types'

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', '#39': "'" }
const unentity = (s: string) => s.replace(/&(amp|quot|apos|lt|gt|#39);/g, (_, e: string) => ENTITIES[e]!)

/** One attribute of a tag, as written (`src="…"`, `src='…'`, `src=…`). */
function attribute(tag: string, name: string): string {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag)
  return m ? unentity(m[1] ?? m[2] ?? m[3] ?? '') : ''
}

/** Tags that only wrap or space a picture where GitHub writes one; dropped, their content kept. */
const WRAPPER = /^<\/?(?:p|div|picture|source|center)\b[^>]*>$/i

/**
 * Raw HTML in an item's text, still never markup — except a picture. GitHub writes every pasted
 * screenshot as `<img width="…" alt="…" src="https://github.com/user-attachments/assets/…">`, so
 * escaping it showed the tag as words and no picture at all. Each `<img>` here becomes an `<img>`
 * built from its `src` and `alt` alone (no other attribute survives), which the step below turns
 * into a picture slot like a Markdown image; `<br>` is a line break, and the few wrappers GitHub
 * puts round a picture are dropped. Everything else is escaped text, as before.
 */
const pictureHtml: HtmlExtension = {
  exit: {
    htmlFlowData: rawHtml,
    htmlTextData: rawHtml,
  },
}

function rawHtml(this: CompileContext, token: Token) {
  const text = this.sliceSerialize(token)
  let out = ''
  let at = 0
  for (const m of text.matchAll(/<[^<>]*>/g)) {
    const tag = m[0]
    let made: string | null = null
    if (/^<img\b/i.test(tag)) {
      const src = attribute(tag, 'src')
      const safe = /^[a-z][a-z0-9+.-]*:/i.test(src) && !/^https?:/i.test(src) ? '' : src
      made = `<img src="${this.encode(safe)}" alt="${this.encode(attribute(tag, 'alt'))}" />`
    } else if (/^<br\s*\/?>$/i.test(tag)) made = '<br />'
    else if (WRAPPER.test(tag)) made = ''
    if (made === null) continue
    out += this.encode(text.slice(at, m.index)) + made
    at = m.index + tag.length
  }
  this.raw(out + this.encode(text.slice(at)))
}

/**
 * A description or a comment, as Markdown a person can read, and nothing a tracker could slip in.
 *
 * - No raw HTML: micromark escapes every tag in the text (`allowDangerousHtml` stays off), so a
 *   `<script>`, an `<iframe>` or an `onerror=` arrives as words on the screen. The one exception is
 *   a picture's `<img>`, rebuilt from its address and alt text alone (`pictureHtml`).
 * - No dangerous links: micromark keeps only safe protocols (`allowDangerousProtocol` stays off),
 *   so a `javascript:` link has no address.
 * - No image loaded by this page: a picture in an item is often behind the tracker's sign-in, and
 *   loading it from here would tell a stranger's server who is reading. Each becomes a `span.md-image`
 *   holding a link with its alt text (what stays when nothing better can be shown), and carrying the
 *   address and alt text as data. The page asks the HOST for the bytes (`src/item/pictures.ts`),
 *   which fetches only from the item's own tracker.
 * - No link is followed by this page: `linkTarget` decides where a press goes (the host's
 *   address rules), and a relative one is read against the item's own page.
 */
export function markdownHtml(text: string): string {
  const html = micromark(text, { extensions: [gfm()], htmlExtensions: [gfmHtml(), pictureHtml] })
  const shell = document.createElement('template')
  shell.innerHTML = html
  for (const img of [...shell.content.querySelectorAll('img')]) {
    const src = img.getAttribute('src') ?? ''
    const alt = img.getAttribute('alt') ?? ''
    const slot = document.createElement('span')
    slot.className = 'md-image'
    slot.setAttribute('data-src', src)
    slot.setAttribute('data-alt', alt)
    const link = document.createElement('a')
    link.setAttribute('href', src)
    link.textContent = `🖼 ${alt || 'image'}`
    slot.append(link)
    img.replaceWith(slot)
  }
  return shell.innerHTML
}

/**
 * Where a press on a link in an item goes: an absolute `https:` address, a relative one read
 * against the item's page, or nowhere (null) for anything else — a `mailto:`, an `http:` page, a
 * fragment of this page.
 *
 * GitLab writes an upload (a pasted screenshot, an attached file) as `/uploads/<secret>/<file>` and
 * means it relative to the PROJECT, not the server: on an item at `…/group/project/-/issues/5` it is
 * `…/group/project/uploads/…`. Read against the server root it is GitLab's sign-in page.
 */
export function linkTarget(href: string | null, base: string): string | null {
  if (!href || href.startsWith('#')) return null
  try {
    const project = base.indexOf('/-/')
    const url = href.startsWith('/uploads/') && project > 0 ? new URL(base.slice(0, project) + href) : new URL(href, base)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}
