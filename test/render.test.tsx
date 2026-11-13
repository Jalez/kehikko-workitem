import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { TrackerRow } from 'kehikot-module-protocol'

import { Screen } from '../src/app.tsx'
import type { Api } from '../src/wire/api.ts'
import type { Host } from '../src/wire/use-kehikot.ts'
import { change, pipelineChecks } from '../dev/fixtures.ts'

afterEach(cleanup)

type Asked = { method: string; params: Record<string, unknown> }

/** A host whose tracker reading holds `rows`, and which records what it was asked. */
function host(rows: TrackerRow[], over: Partial<Host> = {}, refresh: unknown = { outcome: 'read', at: null, why: '' }) {
  const asked: Asked[] = []
  const opened: string[] = []
  const footers: unknown[] = []
  const value: Host = {
    where: 'hosted',
    project: 'Thesis',
    projectPath: '/work/thesis',
    epic: 'auth',
    theme: 'light',
    selection: ['gh#5'],
    visible: true,
    trackerAt: '2026-11-13T11:58:00.000Z',
    trackerBusy: false,
    request: async (method: string, params: Record<string, unknown> = {}) => {
      asked.push({ method, params })
      if (method === 'tracker.refresh') return refresh
      if (method === 'selection.set') return { ok: true }
      const refs = (params.refs as string[] | undefined) ?? null
      const found = refs ? rows.filter((row) => refs.includes(row.ref)) : rows
      return {
        at: '2026-11-13T11:58:00.000Z',
        refreshing: false,
        sources: [],
        rows: found,
        missing: refs ? refs.filter((ref) => !found.some((row) => row.ref === ref)).map((ref) => ({ ref, reason: 'not-found' })) : [],
      }
    },
    header: () => {},
    footer: (items: unknown) => void footers.push(items),
    ready: () => {},
    openAddress: async (url: string) => {
      opened.push(url)
      return null
    },
    ...over,
  } as Host
  return { value, asked, opened, footers }
}

const quietApi: Api = { shown: () => Promise.resolve() }

describe('one item', () => {
  test('is drawn from the reading at once, with its description, people, checks, links and discussion', async () => {
    const h = host([change(), change({ ref: 'gh#3', number: 3, kind: 'issue', title: 'The issue it closes', detail: undefined })])
    render(<Screen host={h.value} api={quietApi} />)
    await waitFor(() => expect(screen.getByTestId('title').textContent).toBe('Read one item without a browser'))
    expect(screen.getByTestId('state').textContent).toBe('Open')
    expect(screen.getByTestId('facts').textContent).toContain('v1')
    expect(screen.getByTestId('branches').textContent).toContain('read-item')
    expect(screen.getByTestId('checks').textContent).toContain('Pipeline failed')
    expect(screen.getAllByTestId('comment')).toHaveLength(2)
    await waitFor(() => expect(screen.getByTestId('linked').textContent).toContain('The issue it closes'))
    /* The detail asked for the one ref, and a background refresh of it, once. */
    expect(h.asked.find((a) => a.method === 'tracker.get' && a.params.detail === 'detail')?.params.refs).toEqual(['gh#5'])
    expect(h.asked.filter((a) => a.method === 'tracker.refresh')).toHaveLength(1)
  })

  test('raw HTML in a description is words, and a link goes to the host', async () => {
    const h = host([change({ detail: { ...change().detail!, body: '<script>alert(1)</script>\n\nSee [docs](https://example.org/docs).' } })])
    const { container } = render(<Screen host={h.value} api={quietApi} />)
    await waitFor(() => screen.getByText('docs'))
    expect(container.querySelector('script')).toBeNull()
    fireEvent.click(screen.getByText('docs'))
    expect(h.opened).toEqual(['https://example.org/docs'])
  })

  test('a long thread shows the newest first page, and more on a press', async () => {
    const comments = Array.from({ length: 45 }, (_, i) => ({
      id: String(i),
      kind: 'comment' as const,
      login: 'ada',
      at: new Date(Date.parse('2026-11-01T00:00:00Z') + i * 60_000).toISOString(),
      body: `comment ${i}`,
      bodyClipped: false,
    }))
    const h = host([change({ detail: { ...change().detail!, comments, commentCount: 60 } })])
    render(<Screen host={h.value} api={quietApi} />)
    await waitFor(() => expect(screen.getAllByTestId('comment')).toHaveLength(20))
    expect(screen.getAllByTestId('comment').at(-1)!.textContent).toContain('comment 44')
    fireEvent.click(screen.getByText(/Show 20 earlier/))
    expect(screen.getAllByTestId('comment')).toHaveLength(40)
    fireEvent.click(screen.getByText(/Show 5 earlier/))
    expect(screen.getAllByTestId('comment')).toHaveLength(45)
    fireEvent.click(screen.getByText(/15 earlier comments are on github.com/))
    expect(h.opened).toEqual(['https://github.com/owner/repo/pull/5'])
  })

  test('offline: what was read stays, and says when it was read', async () => {
    const h = host([change()], {}, { outcome: 'failed', at: null, why: 'github.com could not be reached from this machine.' })
    render(<Screen host={h.value} api={quietApi} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/^Offline: showing what was read at /))
    expect(screen.getByTestId('title')).toBeDefined()
  })

  test('an item the tracker does not have says so', async () => {
    const h = host([], { selection: ['gh#404'] })
    render(<Screen host={h.value} api={quietApi} />)
    await waitFor(() => expect(screen.getByTestId('missing').textContent).toContain('no item under that reference'))
  })

  test('tells its server what is shown, for the agent door', async () => {
    const said: unknown[] = []
    const h = host([change()])
    render(<Screen host={h.value} api={{ shown: async (_p, shown) => void said.push(shown) }} />)
    await waitFor(() => expect(said.some((s) => (s as { ref?: string } | null)?.ref === 'gh#5')).toBe(true))
  })
})

describe('nothing selected', () => {
  test("the space's recent items, one press from being shown and selected", async () => {
    const rows = [change({ ref: 'gh#7', number: 7, title: 'Newest', updatedAt: '2026-11-13T11:00:00.000Z' }), change({ ref: 'gh#6', number: 6, title: 'Older', updatedAt: '2026-11-01T00:00:00.000Z' })]
    const h = host(rows, { selection: [] })
    render(<Screen host={h.value} api={quietApi} />)
    await waitFor(() => expect(screen.getByTestId('empty').textContent).toContain('Recently updated in this space'))
    expect(h.asked.find((a) => a.method === 'tracker.get')?.params).toEqual({ epic: 'auth', parts: true })
    const buttons = screen.getAllByRole('button')
    expect(buttons[0]!.textContent).toContain('Newest')
    await act(async () => fireEvent.click(buttons[0]!))
    expect(h.asked.find((a) => a.method === 'selection.set')?.params).toEqual({ refs: ['gh#7'] })
    await waitFor(() => expect(screen.getByTestId('title').textContent).toBe('Newest'))
  })
})

describe('not ready', () => {
  test('each not-ready state is the shared cover', () => {
    for (const [where, state] of [['listening', 'waiting'], ['unhosted', 'unhosted'], ['hosted', 'no-project']] as const) {
      const { container } = render(<Screen host={host([], { where, projectPath: null }).value} api={quietApi} />)
      expect(container.querySelector('[data-cover]')?.getAttribute('data-cover')).toBe(state)
      cleanup()
    }
  })
})

describe('the pipeline', () => {
  const withChecks = () => change({ pipeline: 'failed', pipelineUrl: 'https://gitlab.example.org/o/r/-/pipelines/9', detail: { ...change().detail!, checks: pipelineChecks() } })

  test('is one badge per stage, in pipeline order, with the overall line spaced', async () => {
    render(<Screen host={host([withChecks()]).value} api={quietApi} />)
    await waitFor(() => screen.getByTestId('checks'))
    const line = screen.getByTestId('pipeline-line').textContent!
    expect(line).toBe('Pipeline failed · 2 of 6 failed')
    expect(screen.getByTestId('checks').textContent).not.toContain('faileddetails')
    const badges = screen.getAllByTestId('stage')
    expect(badges.map((b) => b.getAttribute('aria-label'))).toEqual([
      'validate: 2 failed · 1 passed',
      'build: 1 passed',
      'test: 1 manual · 1 passed',
    ])
    expect(badges.map((b) => b.getAttribute('data-state-worst'))).toEqual(['failed', 'success', 'manual'])
    expect(badges[0]!.textContent).toContain('2 failed')
    expect(screen.queryByTestId('stage-jobs')).toBeNull()
  })

  test('a badge is a button that opens its jobs in place, failed first, and a job opens through the host', async () => {
    const h = host([withChecks()])
    render(<Screen host={h.value} api={quietApi} />)
    await waitFor(() => screen.getByTestId('checks'))
    const badge = screen.getAllByTestId('stage')[0]!
    expect(badge.tagName).toBe('BUTTON')
    expect(badge.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(badge)
    expect(badge.getAttribute('aria-expanded')).toBe('true')
    const jobs = screen.getAllByTestId('job').map((j) => j.textContent)
    expect(jobs[0]).toContain('merge-door')
    expect(jobs[0]).toContain('failed')
    expect(jobs[2]).toContain('passed')
    fireEvent.click(screen.getByText('validate:merge-door'))
    expect(h.opened).toEqual(['https://gitlab.example.org/o/r/-/jobs/1'])
    fireEvent.click(badge)
    expect(badge.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('stage-jobs')).toBeNull()
  })

  test('the tooltip lists the stage jobs with their states', async () => {
    render(<Screen host={host([withChecks()]).value} api={quietApi} />)
    await waitFor(() => screen.getByTestId('checks'))
    act(() => screen.getAllByTestId('stage')[2]!.focus())
    const tip = (await screen.findAllByTestId('stage-tip'))[0]!
    expect(tip.textContent).toContain('test:e2e')
    expect(tip.textContent).toContain('manual')
  })

  test('a change always has a Reviewers row, with their states or None', async () => {
    const some = change({ reviewers: [{ login: 'ada', state: 'approved' }, { login: 'cy', state: 'changes' }, { login: 'di', state: 'requested' }] })
    const { unmount } = render(<Screen host={host([some]).value} api={quietApi} />)
    await waitFor(() => screen.getByTestId('reviewers'))
    const text = screen.getByTestId('reviewers').textContent!
    expect(text).toContain('ada✓ approved')
    expect(text).toContain('cy✕ requested changes')
    expect(text).toContain('dipending')
    unmount()
    render(<Screen host={host([change({ reviewers: [] })]).value} api={quietApi} />)
    await waitFor(() => screen.getByTestId('facts'))
    expect(screen.getByTestId('facts').textContent).toContain('ReviewersNone')
  })
})
