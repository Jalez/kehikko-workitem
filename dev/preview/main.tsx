import './preview.css'

import { createRoot } from 'react-dom/client'

import type { TrackerRow } from 'kehikot-module-protocol'

import { Screen } from '@/app.tsx'
import type { Host } from '@/wire/use-kehikot.ts'

import { previewRow } from './fixtures.ts'

/**
 * The page as a host frames it, with a host that only answers from fixtures: `bunx vite --config
 * dev/preview/vite.config.ts`. Every picture is declined, as a host declines one on another server
 * than the tracker. `?row=<file>.json` draws a row saved in this folder instead.
 */
async function main() {
  const file = new URLSearchParams(location.search).get('row')
  const row: TrackerRow = file && /^[\w.-]+\.json$/.test(file) ? await (await fetch(`./${file}`)).json() : previewRow
  if (new URLSearchParams(location.search).has('dark')) document.documentElement.classList.add('dark')
  /* `?w=280`: as narrow as a container on a canvas can be. */
  const width = Number(new URLSearchParams(location.search).get('w'))
  if (width > 0) document.body.style.width = `${width}px`
  const host = {
    where: 'hosted',
    project: 'Preview',
    projectPath: '/preview',
    epic: null,
    theme: 'light',
    selection: [row.ref],
    visible: true,
    trackerAt: row.readAt,
    trackerBusy: false,
    request: async (method: string) => {
      if (method === 'tracker.refresh') return { outcome: 'read', at: row.readAt, why: '' }
      if (method === 'tracker.image') return { outcome: 'declined', why: 'host' }
      if (method === 'selection.set') return { ok: true }
      return { at: row.readAt, refreshing: false, sources: [], rows: [row], missing: [] }
    },
    header: () => {},
    footer: () => {},
    ready: () => {},
    openAddress: async (url: string) => {
      console.log('open', url)
      return null
    },
  } as unknown as Host
  createRoot(document.getElementById('root')!).render(<Screen host={host} api={{ shown: () => Promise.resolve() }} />)
  /* `?open`: the folded comments opened, and the ones like them, for a picture of all of it. */
  if (new URLSearchParams(location.search).has('open')) {
    setTimeout(() => {
      for (const b of document.querySelectorAll<HTMLElement>('[data-testid="earlier-like-this"]')) b.click()
      setTimeout(() => {
        for (const b of document.querySelectorAll<HTMLElement>('[data-testid="folded-comment"] button[aria-expanded="false"]')) b.click()
      }, 100)
    }, 500)
  }
}

void main()
