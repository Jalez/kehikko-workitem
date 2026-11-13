import { micromark } from 'micromark'
import { gfm, gfmHtml } from 'micromark-extension-gfm'

/**
 * A description or a comment, as Markdown a person can read, and nothing a tracker could slip in.
 *
 * - No raw HTML: micromark escapes every tag in the text (`allowDangerousHtml` stays off), so a
 *   `<script>`, an `<iframe>` or an `onerror=` arrives as words on the screen.
 * - No dangerous links: micromark keeps only safe protocols (`allowDangerousProtocol` stays off),
 *   so a `javascript:` link has no address.
 * - No images loaded: a picture in an item is often behind the tracker's sign-in, and loading it
 *   from here would tell a stranger's server who is reading. Each becomes a link with its alt
 *   text, which the person can open.
 * - No link is followed by this page: `linkTarget` decides where a press goes (the host's
 *   address rules), and a relative one is read against the item's own page.
 */
export function markdownHtml(text: string): string {
  const html = micromark(text, { extensions: [gfm()], htmlExtensions: [gfmHtml()] })
  const shell = document.createElement('template')
  shell.innerHTML = html
  for (const img of [...shell.content.querySelectorAll('img')]) {
    const link = document.createElement('a')
    link.setAttribute('href', img.getAttribute('src') ?? '')
    link.textContent = `🖼 ${img.getAttribute('alt') || 'image'}`
    img.replaceWith(link)
  }
  return shell.innerHTML
}

/**
 * Where a press on a link in an item goes: an absolute `https:` address, a relative one read
 * against the item's page, or nowhere (null) for anything else — a `mailto:`, an `http:` page, a
 * fragment of this page.
 */
export function linkTarget(href: string | null, base: string): string | null {
  if (!href || href.startsWith('#')) return null
  try {
    const url = new URL(href, base)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}
