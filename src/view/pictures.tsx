import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Image as ImageIcon } from 'lucide-react'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { keyOf, type Pictures } from '@/item/pictures.ts'
import { linkTarget } from '@/item/markdown.ts'

/** What a picture in an item's text needs: which item it is in, and where its bytes come from. */
export type PictureScope = { itemRef: string; pictures: Pictures }

const PictureContext = createContext<PictureScope | null>(null)
export const PictureProvider = ({ value, children }: { value: PictureScope | null; children: ReactNode }) => (
  <PictureContext.Provider value={value}>{children}</PictureContext.Provider>
)
export const usePictureScope = () => useContext(PictureContext)

type Slot = {
  el: HTMLElement
  url: string
  alt: string
  /** The picture is inside a link, whose press goes where the link goes. */
  inLink: boolean
  /** The words right after it on its line already say what it would (a badge before its own label). */
  said: boolean
}

const BLOCK = /^(?:P|LI|TD|TH|DIV|H[1-6]|BLOCKQUOTE|PRE|UL|OL|TABLE|TR)$/

/** The text after a picture on its own line: up to a line break, the end of its block or 200 letters, other pictures left out. */
export function textAfter(el: HTMLElement): string {
  let node: Node = el.closest('a') ?? el
  let out = ''
  while (out.length < 200) {
    let next = node.nextSibling
    while (!next) {
      const up = node.parentNode
      if (!up || (up instanceof HTMLElement && (BLOCK.test(up.tagName) || up.classList.contains('markdown')))) return out
      node = up
      next = node.nextSibling
    }
    node = next
    if (node.nodeName === 'BR') return out
    if (node instanceof HTMLElement && node.querySelector('br')) return out
    const words = node instanceof HTMLElement && node.classList.contains('md-image') ? '' : (node.textContent ?? '')
    const end = words.indexOf('\n')
    if (end >= 0) return out + words.slice(0, end)
    out += words
  }
  return out
}

/**
 * Whether the words after a picture already say what it would: they repeat its alt text, or it has
 * none (a decoration) and there are words beside it to read instead.
 */
export function saidAfter(el: HTMLElement, alt: string): boolean {
  const label = alt.trim().toLowerCase()
  const after = textAfter(el).toLowerCase()
  return label ? after.includes(label) : /\p{L}|\d/u.test(after)
}

/**
 * The pictures of one rendered Markdown text: each `span.md-image` the sanitizer left becomes a thumbnail
 * (drawn into the span), as far as its address is an `https:` one. Anything else stays the link it was.
 */
export function useSlots(root: React.RefObject<HTMLElement | null>, html: string, base: string, scope: PictureScope | null) {
  const [slots, setSlots] = useState<Slot[]>([])
  useLayoutEffect(() => {
    if (!scope || !root.current) return setSlots([])
    const found: Slot[] = []
    /* Every slot is read before any is emptied, so what follows one is read as it was written. */
    for (const el of root.current.querySelectorAll<HTMLElement>('span.md-image')) {
      const url = linkTarget(el.getAttribute('data-src'), base)
      if (!url) continue
      const alt = el.getAttribute('data-alt') ?? ''
      found.push({ el, url, alt, inLink: el.hasAttribute('data-in-link'), said: saidAfter(el, alt) })
    }
    for (const s of found) s.el.textContent = ''
    setSlots(found)
  }, [html, base, scope, root])
  return slots
}

export function PictureSlots({ slots, scope }: { slots: Slot[]; scope: PictureScope }) {
  return (
    <>
      {slots.map((s, i) => createPortal(<Thumb key={`${s.url}-${i}`} slot={s} scope={scope} />, s.el, `${s.url}-${i}`))}
    </>
  )
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/** Whether an element is near the screen. Without the browser's observer, always: nothing to wait for. */
function useNear(): [React.RefObject<HTMLSpanElement | null>, boolean] {
  const ref = useRef<HTMLSpanElement | null>(null)
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !ref.current) return
    const watch = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), { rootMargin: '200px' })
    watch.observe(ref.current)
    return () => watch.disconnect()
  }, [])
  return [ref, near]
}

/**
 * One picture: a thumbnail once the host has sent it. One the host would not fetch is its alt text,
 * said once — a link to it, or plain words inside the link it is part of — and nothing at all when
 * the words beside it already say it, as a badge before its own label does.
 */
function Thumb({ slot, scope }: { slot: Slot; scope: PictureScope }) {
  const { url, alt, inLink, said } = slot
  const { itemRef, pictures } = scope
  const key = keyOf(itemRef, url)
  const picture = useSyncExternalStore(
    (on) => pictures.subscribe(key, on),
    () => pictures.get(key),
  )
  const [holder, near] = useNear()
  const [zoom, setZoom] = useState(false)
  useEffect(() => {
    if (near && picture.at === 'idle') pictures.load(itemRef, url)
  }, [near, picture.at, pictures, itemRef, url])
  const label = alt || 'image'
  const shown = useMemo(() => picture, [picture])

  if (shown.at === 'ready' && inLink) {
    /* A press goes where the link around it goes; no full-size view of a badge. */
    return (
      <span ref={holder} className="inline-block align-middle">
        <img src={shown.src} alt={alt} loading="lazy" className="inline-block max-h-48 max-w-full" onError={() => pictures.broke(key)} />
      </span>
    )
  }
  if (shown.at === 'ready') {
    return (
      <span ref={holder} className="inline-block align-top">
        <button
          type="button"
          className="focus-visible:ring-ring inline-block rounded border"
          aria-label={`Open image: ${label}`}
          onClick={() => {
            pictures.touch(key)
            setZoom(true)
          }}
        >
          <img src={shown.src} alt={alt} loading="lazy" className="block max-h-48 max-w-full rounded" onError={() => pictures.broke(key)} />
        </button>
        <Dialog open={zoom} onOpenChange={setZoom}>
          <DialogContent className="max-w-[95%] p-2" aria-describedby={undefined}>
            <DialogTitle className="sr-only">{label}</DialogTitle>
            <DialogDescription className="sr-only">Press Escape to close.</DialogDescription>
            <img src={shown.src} alt={alt} className="mx-auto block max-h-[80vh] max-w-full object-contain" data-testid="lightbox-image" />
          </DialogContent>
        </Dialog>
      </span>
    )
  }
  const not = `A picture on ${hostOf(url)}, not shown here`
  if (shown.at === 'link') {
    if (said) return <span ref={holder} data-testid="picture-said" />
    if (inLink) {
      return (
        <span ref={holder} title={not} data-testid="picture-words">
          {label}
        </span>
      )
    }
    return (
      <span ref={holder}>
        <a href={url} title={not} data-testid="picture-link">
          {label}
        </a>
      </span>
    )
  }
  /* While asked for: a badge-sized picture holds its words' place, a screenshot a box's. */
  if (said || inLink) {
    return (
      <span ref={holder} className="text-muted-foreground" data-testid="picture-waiting">
        {said ? null : label}
      </span>
    )
  }
  return (
    <span ref={holder} className="text-muted-foreground inline-flex h-12 min-w-24 items-center gap-1 rounded border border-dashed px-2 text-xs" data-testid="picture-waiting">
      <ImageIcon className="size-3.5" aria-hidden /> {label}
    </span>
  )
}
