import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { LIMITS, TRACKER_REFRESH_WITHIN_MS, trackerRefreshResult, type PressValue, type TrackerRow, type TrackerSource } from 'kehikot-module-protocol'
import { HostRefused } from 'kehikot-module-protocol/client'
import { Cover, coverFor, useServerStanding } from 'kehikot-module-protocol/client/react'

import { clockOf, itemFrom, linkedRefs, offlineLine, readingOf, recentItems, type ItemState } from '@/item/reading.ts'
import { shownOf } from '@/item/shown.ts'
import { footerItems, headerItems } from '@/rows.ts'
import { Empty } from '@/view/empty.tsx'
import { ItemView } from '@/view/item.tsx'
import { api as realApi, type Api } from '@/wire/api'
import { useKehikot, type Host } from '@/wire/use-kehikot'

type Press = { item: string; value?: PressValue }

/* Drawn only when no host frames the page (the host draws the menus otherwise), so loaded only then. */
const HeaderMenus = lazy(() => import('@/components/header-menus').then((m) => ({ default: m.HeaderMenus })))

/** How often the "3 min ago" words move, while the page is on screen. */
const TICK_MS = 30_000

export function App() {
  const pressed = useRef<(press: Press) => string | void>(() => {})
  const host = useKehikot({ onPress: (press) => pressed.current(press) })
  return <Screen host={host} pressRef={pressed} />
}

/**
 * The whole page, from a plain `Host`, so a test draws it with a fake one. All the state is here;
 * what the host draws (the header and the footer) is declared from it whole on every change.
 */
export function Screen({ host, api = realApi, pressRef }: { host: Host; api?: Api; pressRef?: { current: (press: Press) => string | void } }) {
  const { request, header, footer, ready, selection, openAddress, projectPath, epic, where, trackerAt, trackerBusy, visible } = host
  const server = useServerStanding()
  const cover = coverFor({ where, projectPath, server }, { project: true })

  /* Which item: one of the selected refs (the header's switch picks among several), else the one
     picked here from the recent list when the host would not take it as the selection. */
  const [chosen, setChosen] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const ref = selection.length ? (chosen && selection.includes(chosen) ? chosen : selection[0]!) : picked

  const [item, setItem] = useState<ItemState | null>(null)
  const [sources, setSources] = useState<readonly TrackerSource[]>([])
  const [linked, setLinked] = useState<ReadonlyMap<string, TrackerRow>>(new Map())
  const [recent, setRecent] = useState<readonly TrackerRow[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState<string | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const shown = item && item.ref === ref ? item : null
  const row = shown?.at === 'shown' ? shown.row : null

  /* The item, from the reading: at once from what the host kept, again whenever the reading moves. */
  const asked = useRef(0)
  useEffect(() => {
    if (cover || !ref) return
    const mine = ++asked.current
    void request('tracker.get', { refs: [ref], detail: 'detail' })
      .then((answer) => {
        if (asked.current !== mine) return
        const reading = readingOf(answer)
        if (reading) setSources(reading.sources)
        setItem((was) => itemFrom(ref, reading, was))
        setRefused(null)
      })
      .catch((error: unknown) => {
        if (asked.current !== mine) return
        setRefused(error instanceof HostRefused ? `Kehikot would not say: ${error.refusal.error}` : 'The answer from Kehikot could not be read.')
        setItem((was) => (was && was.ref === ref && was.at === 'shown' ? was : { at: 'missing', ref, why: 'Kehikot would not share its tracker reading with this module.' }))
      })
  }, [cover, ref, trackerAt, request])

  /* The items it links to, as summary rows, for their titles and states. */
  const linkKey = row ? linkedRefs(row).map((one) => one.ref).join(' ') : ''
  useEffect(() => {
    if (cover || !linkKey) return
    void request('tracker.get', { refs: linkKey.split(' ').slice(0, LIMITS.TRACKER_ASK) })
      .then((answer) => {
        const reading = readingOf(answer)
        if (reading) setLinked(new Map(reading.rows.map((one) => [one.ref, one])))
      })
      .catch(() => {})
  }, [cover, linkKey, trackerAt, request])

  /* Brought up to date in the background, once per item opened; Refresh asks again. */
  const refresh = useCallback(
    (which: string) => {
      setRefreshing(true)
      void request('tracker.refresh', { refs: [which] }, { within: TRACKER_REFRESH_WITHIN_MS })
        .then((answer) => {
          const result = trackerRefreshResult.safeParse(answer)
          setRefreshFailed(result.success && result.data.outcome === 'failed' ? result.data.why || 'The tracker could not be read.' : null)
        })
        .catch(() => {})
        .finally(() => setRefreshing(false))
    },
    [request],
  )
  const refreshedFor = useRef<string | null>(null)
  useEffect(() => {
    if (cover || !ref || refreshedFor.current === ref) return
    refreshedFor.current = ref
    setRefreshFailed(null)
    refresh(ref)
  }, [cover, ref, refresh])

  /* Nothing selected: the space's recent items, so the page is never empty of something to do. */
  useEffect(() => {
    if (cover || ref) return
    void request('tracker.get', epic ? { epic, parts: true } : { project: true })
      .then((answer) => setRecent(recentItems(readingOf(answer))))
      .catch(() => setRecent([]))
  }, [cover, ref, epic, trackerAt, request])

  /* The words that say how long ago move only while somebody can see them. */
  useEffect(() => {
    if (!visible) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [visible])

  const offline = row ? offlineLine(row, sources, refreshFailed, clockOf) : null

  /* The host's cover stays up until there is something true to draw: the item or why not, or the
     recent list. Never a blank page and never a flash of one. */
  const drawn = !cover && (ref ? shown !== null : recent !== null)
  useEffect(() => {
    if (drawn || (where === 'hosted' && cover)) ready()
  }, [drawn, cover, where, ready])

  const pick = (which: string) => {
    setPicked(which)
    void request('selection.set', { refs: [which] }).catch(() => {})
  }
  const open = useCallback((url: string) => void openAddress(url).catch(() => {}), [openAddress])

  const busy = refreshing || trackerBusy
  const headerNow = useMemo(() => headerItems({ selected: selection, shown: ref, row, refreshing: busy }), [selection, ref, row, busy])
  const footerNow = useMemo(() => footerItems({ row, ref, refreshing: busy, offline, now }), [row, ref, busy, offline, now])
  useEffect(() => header(headerNow), [header, headerNow])
  useEffect(() => footer(footerNow), [footer, footerNow])

  const press = ({ item: id, value }: Press): string | void => {
    if (id === 'refresh') {
      if (!ref) return 'Nothing is shown to refresh.'
      refresh(ref)
      return
    }
    if (id === 'item' && typeof value === 'string') {
      setChosen(value)
      return
    }
    /* `open` is carried out by the host from the person's click; nothing to do here. */
    if (id === 'open') return
    return `Work Item has nothing called "${id}" to press.`
  }
  if (pressRef) pressRef.current = press

  /* What is shown, for the agent door. */
  useEffect(() => {
    if (!projectPath || cover) return
    void api.shown(projectPath, row ? shownOf(row, offline) : null).catch(() => {})
  }, [api, projectPath, cover, row, offline])

  return (
    <div data-kehikot-page className="flex h-screen flex-col text-sm">
      {where === 'unhosted' ? (
        <header className="flex min-h-9 shrink-0 items-center gap-2 border-b px-2 py-1">
          <span className="text-xs font-medium">Work Item</span>
          <Suspense fallback={null}>
            <HeaderMenus items={headerNow} onPress={press} />
          </Suspense>
        </header>
      ) : null}
      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        {cover ? (
          <Cover state={cover} name="Work Item" onRetry={() => setNow(Date.now())} />
        ) : !ref ? (
          <Empty recent={recent ?? []} now={now} pick={pick} where={epic ? 'this space' : 'this project'} />
        ) : (
          <>
            {offline ? (
              <p className="rounded border border-amber-500/40 px-2 py-1 text-xs text-amber-700 dark:text-amber-400" role="status">
                {offline}
              </p>
            ) : null}
            {refused ? <p className="text-muted-foreground text-xs">{refused}</p> : null}
            {shown?.at === 'shown' ? (
              <ItemView row={shown.row} linked={linked} now={now} open={open} detailPending={!shown.row.detail && busy} />
            ) : shown?.at === 'missing' ? (
              <p data-testid="missing">
                <span className="font-mono">{shown.ref}</span>: {shown.why}
              </p>
            ) : (
              <p className="text-muted-foreground" data-testid="reading">
                Reading <span className="font-mono">{ref}</span>…
              </p>
            )}
          </>
        )}
      </main>
    </div>
  )
}
