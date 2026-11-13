import { trackerImageResult, type TrackerImageRefusal } from 'kehikot-module-protocol'

/**
 * The pictures of an item, as this page holds them. A picture is never loaded by the page itself:
 * the host fetches it with the person's own sign-in (`tracker.image`) and answers bytes, which become
 * a `blob:` address here. What the host would not fetch stays a link, with the host it names.
 *
 * Light on memory: at most `MAX_LIVE` pictures hold a decoded `blob:` at once, the least recently
 * shown giving theirs up (and fetching again, from the host's cache, when scrolled back to), and at
 * most `MAX_ASKING` are being asked for at the same time.
 */
export const MAX_LIVE = 12
export const MAX_ASKING = 3

export type Picture =
  | { at: 'idle' }
  | { at: 'loading' }
  | { at: 'ready'; src: string; mime: string }
  | { at: 'link'; why: TrackerImageRefusal | 'broken' }

export interface PictureIo {
  /** Asks the host (`tracker.image`) and answers its raw answer. */
  ask(ref: string, url: string): Promise<unknown>
  makeUrl(bytes: Uint8Array<ArrayBuffer>, mime: string): string
  revoke(url: string): void
}

const IDLE: Picture = { at: 'idle' }

export class Pictures {
  #state = new Map<string, Picture>()
  #listeners = new Map<string, Set<() => void>>()
  /** Keys holding a `blob:`, least recently shown first. */
  #live: string[] = []
  #waiting: Array<() => void> = []
  #asking = 0
  #io: PictureIo
  #max: number

  constructor(io: PictureIo, max = MAX_LIVE) {
    this.#io = io
    this.#max = max
  }

  get(key: string): Picture {
    return this.#state.get(key) ?? IDLE
  }

  subscribe(key: string, listener: () => void): () => void {
    const set = this.#listeners.get(key) ?? new Set()
    set.add(listener)
    this.#listeners.set(key, set)
    return () => set.delete(listener)
  }

  /** How many pictures hold a decoded address right now. */
  get live(): number {
    return this.#live.length
  }

  #set(key: string, picture: Picture) {
    this.#state.set(key, picture)
    for (const l of this.#listeners.get(key) ?? []) l()
  }

  /** Marks a picture as the one most recently shown, so it is the last to give its address up. */
  touch(key: string) {
    const at = this.#live.indexOf(key)
    if (at >= 0) {
      this.#live.splice(at, 1)
      this.#live.push(key)
    }
  }

  /** Fetches the picture when it is not held and not on its way. `key` is the item and the address. */
  load(ref: string, url: string): void {
    const key = keyOf(ref, url)
    const now = this.get(key)
    if (now.at === 'ready') return this.touch(key)
    if (now.at !== 'idle') return
    this.#set(key, { at: 'loading' })
    const run = () => {
      this.#asking++
      void this.#io
        .ask(ref, url)
        .then((raw) => this.#landed(key, raw))
        .catch(() => this.#set(key, { at: 'link', why: 'unreadable' }))
        .finally(() => {
          this.#asking--
          this.#waiting.shift()?.()
        })
    }
    if (this.#asking < MAX_ASKING) run()
    else this.#waiting.push(run)
  }

  #landed(key: string, raw: unknown) {
    const answer = trackerImageResult.safeParse(raw)
    if (!answer.success) return this.#set(key, { at: 'link', why: 'unreadable' })
    if (answer.data.outcome === 'declined') return this.#set(key, { at: 'link', why: answer.data.why })
    let bytes: Uint8Array<ArrayBuffer>
    try {
      bytes = Uint8Array.from(atob(answer.data.base64), (c) => c.charCodeAt(0))
    } catch {
      return this.#set(key, { at: 'link', why: 'unreadable' })
    }
    const src = this.#io.makeUrl(bytes, answer.data.mime)
    this.#live.push(key)
    this.#set(key, { at: 'ready', src, mime: answer.data.mime })
    while (this.#live.length > this.#max) {
      const old = this.#live.shift()!
      const was = this.#state.get(old)
      if (was?.at === 'ready') this.#io.revoke(was.src)
      /* Idle, not gone: it is fetched again when it is next in view. */
      this.#set(old, IDLE)
    }
  }

  /** The picture could not be drawn (the page may not allow its address): a link instead. */
  broke(key: string) {
    const was = this.#state.get(key)
    if (was?.at === 'ready') this.#io.revoke(was.src)
    this.#live = this.#live.filter((k) => k !== key)
    this.#set(key, { at: 'link', why: 'broken' })
  }

  /** Gives every address up, for when the item changes. */
  clear() {
    for (const p of this.#state.values()) if (p.at === 'ready') this.#io.revoke(p.src)
    this.#state.clear()
    this.#live = []
    this.#waiting = []
    for (const set of this.#listeners.values()) for (const l of set) l()
  }
}

export const keyOf = (ref: string, url: string) => `${ref}\n${url}`

export const browserIo = (request: (method: 'tracker.image', params: { ref: string; url: string }) => Promise<unknown>): PictureIo => ({
  ask: (ref, url) => request('tracker.image', { ref, url }),
  makeUrl: (bytes, mime) => URL.createObjectURL(new Blob([bytes], { type: mime })),
  revoke: (url) => URL.revokeObjectURL(url),
})
