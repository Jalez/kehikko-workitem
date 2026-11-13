import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

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

type Slot = { el: HTMLElement; url: string; alt: string }

/**
 * The pictures of one rendered Markdown text: each `span.md-image` the sanitizer left becomes a thumbnail
 * (drawn into the span), as far as its address is an `https:` one. Anything else stays the link it was.
 */
export function useSlots(root: React.RefObject<HTMLElement | null>, html: string, base: string, scope: PictureScope | null) {
  const [slots, setSlots] = useState<Slot[]>([])
  useLayoutEffect(() => {
    if (!scope || !root.current) return setSlots([])
    const found: Slot[] = []
    for (const el of root.current.querySelectorAll<HTMLElement>('span.md-image')) {
      const url = linkTarget(el.getAttribute('data-src'), base)
      if (!url) continue
      el.textContent = ''
      found.push({ el, url, alt: el.getAttribute('data-alt') ?? '' })
    }
    setSlots(found)
  }, [html, base, scope, root])
  return slots
}

export function PictureSlots({ slots, scope }: { slots: Slot[]; scope: PictureScope }) {
  return (
    <>
      {slots.map((s, i) => createPortal(<Thumb key={`${s.url}-${i}`} url={s.url} alt={s.alt} scope={scope} />, s.el, `${s.url}-${i}`))}
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

function Thumb({ url, alt, scope }: { url: string; alt: string; scope: PictureScope }) {
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
  if (shown.at === 'link') {
    return (
      <span ref={holder}>
        <a href={url} data-testid="picture-link">
          🖼 {label}
        </a>
        <span className="text-muted-foreground"> · {hostOf(url)}</span>
      </span>
    )
  }
  return (
    <span ref={holder} className="text-muted-foreground inline-flex h-12 min-w-24 items-center gap-1 rounded border border-dashed px-2 text-xs" data-testid="picture-waiting">
      🖼 {label}
    </span>
  )
}
