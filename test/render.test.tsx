import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { TrackerComment, TrackerRow } from 'kehikot-module-protocol'

import { Screen } from '../src/app.tsx'
import type { Api } from '../src/wire/api.ts'
import type { Host } from '../src/wire/use-kehikot.ts'
import { change, pipelineChecks } from '../dev/fixtures.ts'

afterEach(cleanup)

/** What the host answers a `tracker.image` with; a test sets it. */
let imageAnswer: (params: Record<string, unknown>) => unknown = () => ({ outcome: 'declined', why: 'host' })

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
      if (method === 'tracker.image') return imageAnswer(params)
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

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString('base64')
const withBody = (body: string, over: Partial<TrackerRow> = {}) => change({ ...over, detail: { ...change().detail!, body } })

describe('approvals', () => {
  test('are shown as "1 of 2" when the tracker has a rule, and not at all when it has none', async () => {
    const some = change({ detail: { ...change().detail!, approvals: { given: 1, required: 2 } } })
    const { unmount } = render(<Screen host={host([some]).value} api={quietApi} />)
    await waitFor(() => screen.getByTestId('facts'))
    expect(screen.getByTestId('facts').textContent).toContain('Approvals1 of 2')
    unmount()
    render(<Screen host={host([change()]).value} api={quietApi} />)
    await waitFor(() => screen.getByTestId('facts'))
    expect(screen.getByTestId('facts').textContent).not.toContain('Approvals')
  })
})

describe('the discussion', () => {
  const report = (n: number) => `## Quality Gate passed\n\n**Measures**\n\nCoverage ${90 + n}.5% (${80 + n}.0% after merge)\n\nProject ID: 1234`
  const comments: TrackerComment[] = [
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `s${n}`, kind: 'comment' as const, login: 'project_42_bot_9f8e7d', name: 'Quality bot', at: `2026-11-1${n % 3}T0${n}:00:00.000Z`, body: report(n), bodyClipped: false })),
    {
      id: 'l1',
      kind: 'line',
      login: 'a.reviewer',
      at: '2026-11-12T16:00:00.000Z',
      body: '**Important:** Remove on a token whose save landed deletes it on screen only.\n\n- one\n- two',
      bodyClipped: false,
      path: 'apps/web/src/features/tokens/use-token-removal.ts',
      url: 'https://gitlab.example.org/o/r/-/merge_requests/5#note_1',
    },
  ]
  const thread = () => change({ detail: { ...change().detail!, comments, commentCount: comments.length } })

  test('folds a bot\'s six reports into the newest, as one line with its gist, and shows a person\'s review comment as a card', async () => {
    const h = host([thread()])
    render(<Screen host={h.value} api={quietApi} />)
    await waitFor(() => screen.getByTestId('discussion'))
    expect(screen.getAllByTestId('folded')).toHaveLength(1)
    expect(screen.getAllByTestId('folded-comment')).toHaveLength(1)
    expect(screen.getByTestId('folded-gist').textContent).toBe('Quality Gate passed')
    expect(screen.getByTestId('folded-comment').hasAttribute('data-bot')).toBe(true)
    expect(screen.queryByTestId('folded-body')).toBeNull()

    /* "5 earlier like this" opens the five before it. */
    fireEvent.click(screen.getByTestId('earlier-like-this'))
    expect(screen.getAllByTestId('folded-comment')).toHaveLength(6)
    expect(screen.getByTestId('earlier-like-this').textContent).toBe('Hide the 5 earlier like this')

    /* The person's comment: a card with its file as a chip and its leading word picked out. */
    const card = screen.getByTestId('comment')
    expect(card.querySelector('[data-testid="comment-author"]')!.textContent).toBe('a.reviewer')
    expect(card.querySelector('[data-testid="comment-lead"]')!.textContent).toBe('Important')
    expect(card.textContent).toContain('Remove on a token whose save landed')
    expect(card.textContent).not.toContain('Important:')
  })

  test('the file chip shows the path short, the whole of it on hover, and opens the comment through the host', async () => {
    const h = host([thread()])
    render(<Screen host={h.value} api={quietApi} />)
    const chip = await screen.findByTestId('file-chip')
    expect(chip.textContent).toBe('apps/…/use-token-removal.ts')
    expect(chip.getAttribute('title')).toBe('apps/web/src/features/tokens/use-token-removal.ts')
    fireEvent.click(chip)
    expect(h.opened).toEqual(['https://gitlab.example.org/o/r/-/merge_requests/5#note_1'])
  })

  test('a folded comment opens to its whole text with a press', async () => {
    render(<Screen host={host([thread()]).value} api={quietApi} />)
    const line = await screen.findByTestId('folded-comment')
    fireEvent.click(line.querySelector('button[aria-expanded]')!)
    expect(screen.getByTestId('folded-body').textContent).toContain('Coverage 96.5%')
  })
})

/** A browser's observer that says what the test decides: every element is in view, or none. */
let inView = true
class FakeObserver {
  constructor(private on: (entries: Array<{ isIntersecting: boolean }>) => void) {}
  observe() {
    queueMicrotask(() => this.on([{ isIntersecting: inView }]))
  }
  disconnect() {}
  unobserve() {}
}

describe('pictures', () => {
  const realObserver = globalThis.IntersectionObserver
  beforeEach(() => {
    inView = true
    globalThis.IntersectionObserver = FakeObserver as never
  })
  afterEach(() => {
    globalThis.IntersectionObserver = realObserver
  })

  test('one scrolled out of view is not asked for until it is near', async () => {
    inView = false
    imageAnswer = () => ({ outcome: 'image', mime: 'image/png', base64: PNG_B64 })
    const h = host([withBody(`![far down](${'https://github.com/owner/repo/assets/1/far.png'})`)])
    render(<Screen host={h.value} api={quietApi} />)
    await screen.findByTestId('picture-waiting')
    expect(h.asked.some((a) => a.method === 'tracker.image')).toBe(false)
  })

  const url = 'https://github.com/owner/repo/assets/1/shot.png'
  const md = (u = url) => `Look:\n\n![the screenshot](${u})`

  test('are fetched through the host, never loaded by the page, and keep their alt text', async () => {
    imageAnswer = () => ({ outcome: 'image', mime: 'image/png', base64: PNG_B64 })
    const h = host([withBody(md())])
    const { container } = render(<Screen host={h.value} api={quietApi} />)
    const img = await waitFor(() => {
      const found = container.querySelector('img')
      if (!found) throw new Error('not yet')
      return found
    })
    expect(img.getAttribute('alt')).toBe('the screenshot')
    expect(img.getAttribute('src')).toStartWith('blob:')
    expect(h.asked.filter((a) => a.method === 'tracker.image')).toEqual([{ method: 'tracker.image', params: { ref: 'gh#5', url } }])
    expect([...container.querySelectorAll('img')].some((i) => i.getAttribute('src') === url)).toBe(false)
  })

  test('a relative address is read against the item\'s page before the host is asked', async () => {
    imageAnswer = () => ({ outcome: 'declined', why: 'host' })
    const h = host([withBody(md('/uploads/abc/shot.png'))])
    render(<Screen host={h.value} api={quietApi} />)
    await waitFor(() => expect(h.asked.some((a) => a.method === 'tracker.image')).toBe(true))
    const asked = h.asked.find((a) => a.method === 'tracker.image')!.params.url as string
    expect(asked).toBe(new URL('/uploads/abc/shot.png', change().url).href)
  })

  test('what the host will not fetch is its alt text once, a link naming its host on hover, opened through the host', async () => {
    imageAnswer = () => ({ outcome: 'declined', why: 'host' })
    const h = host([withBody(md('https://tracker.example.net/pixel.png'))])
    render(<Screen host={h.value} api={quietApi} />)
    const link = await screen.findByTestId('picture-link')
    expect(link.textContent).toBe('the screenshot')
    expect(link.parentElement!.textContent).toBe('the screenshot')
    expect(link.getAttribute('title')).toContain('tracker.example.net')
    fireEvent.click(link)
    expect(h.opened).toEqual(['https://tracker.example.net/pixel.png'])
  })

  test('a badge that cannot be shown says its label once: inside a link it is the link\'s words, before its own label it is nothing', async () => {
    imageAnswer = () => ({ outcome: 'declined', why: 'host' })
    const badge = (name: string) => `[![${name}](https://sonar.example/badge/${name.replace(' ', '-')}.svg '${name}')](https://sonar.example/issues?type=${name.replace(' ', '')})`
    const body = [
      '![Passed](https://sonar.example/badge/passed.svg \'Passed\') **Quality Gate passed**',
      '',
      `${badge('New Issues')} [0 New Issues](https://sonar.example/issues?new)  `,
      /* A decoration with no alt text, before words on its line (hard break above). */
      "![](https://sonar.example/badge/ok.svg '') [0 Accepted issues](https://sonar.example/issues?accepted)",
      '',
      `Read the report: ${badge('Report')}`,
    ].join('\n')
    const h = host([withBody(body)])
    const { container } = render(<Screen host={h.value} api={quietApi} />)
    await waitFor(() => expect(container.querySelectorAll('[data-testid="picture-said"]')).toHaveLength(3))
    const description = container.querySelector('section[aria-label="Description"]')!
    const lines = [...description.querySelectorAll('p')].map((p) => p.textContent!.replace(/\s+/g, ' ').trim())
    expect(lines).toEqual(['Quality Gate passed', '0 New Issues 0 Accepted issues', 'Read the report: Report'])
    /* No link inside a link, so a browser never splits one in two. */
    expect(description.querySelector('a a')).toBeNull()
    expect(description.textContent).not.toContain('🖼')
    expect(description.textContent).not.toContain('sonar.example')
    /* The words of a badge in a link open where that link goes. */
    fireEvent.click(await screen.findByTestId('picture-words'))
    expect(h.opened).toEqual(['https://sonar.example/issues?type=Report'])
  })

  test('one too big, of the wrong type or unreadable stays a link, and an http address is never asked for', async () => {
    for (const why of ['size', 'type', 'unreadable']) {
      imageAnswer = () => ({ outcome: 'declined', why })
      const h = host([withBody(md())])
      const { unmount } = render(<Screen host={h.value} api={quietApi} />)
      await screen.findByTestId('picture-link')
      unmount()
    }
    imageAnswer = () => ({ outcome: 'image', mime: 'image/png', base64: PNG_B64 })
    const h = host([withBody(md('http://example.org/a.png'))])
    render(<Screen host={h.value} api={quietApi} />)
    await waitFor(() => screen.getByTestId('title'))
    expect(h.asked.some((a) => a.method === 'tracker.image')).toBe(false)
  })

  test('a thumbnail opens a full-size view that Escape closes', async () => {
    imageAnswer = () => ({ outcome: 'image', mime: 'image/png', base64: PNG_B64 })
    render(<Screen host={host([withBody(md())]).value} api={quietApi} />)
    const open = await screen.findByRole('button', { name: 'Open image: the screenshot' })
    fireEvent.click(open)
    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelector('[data-testid="lightbox-image"]')?.getAttribute('alt')).toBe('the screenshot')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
