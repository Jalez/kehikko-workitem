import { describe, expect, test } from 'bun:test'

import type { TrackerComment } from 'kehikot-module-protocol'

import { arrange, compact, isBot, leadOf, markOf, shapeOf, shortPath, summaryOf } from '../src/item/discussion.ts'

const c = (id: string, over: Partial<TrackerComment> & { bot?: boolean } = {}): TrackerComment => ({
  id,
  kind: 'comment',
  login: 'ada',
  at: `2026-11-10T10:00:${id.padStart(2, '0').slice(-2)}.000Z`,
  body: 'Looks right.',
  bodyClipped: false,
  ...over,
})

describe('a bot, from the tracker\'s own data', () => {
  test('is what the reading marks as one', () => {
    expect(isBot(c('1', { login: 'helper', bot: true }))).toBe(true)
  })
  test('is a GitHub app account, spelled with [bot]', () => {
    expect(isBot(c('1', { login: 'some-app[bot]' }))).toBe(true)
  })
  test('is a GitLab project or group access token\'s user', () => {
    expect(isBot(c('1', { login: 'project_42_bot_9f8e7d6c' }))).toBe(true)
    expect(isBot(c('1', { login: 'group_7_bot' }))).toBe(true)
  })
  test('is never guessed from a name: anyone else is a person', () => {
    for (const login of ['robot', 'bot', 'botanist', 'project_bot', 'my_project_42_bot', 'scanner']) expect(isBot(c('1', { login }))).toBe(false)
    expect(isBot(c('1', { login: undefined, name: 'Some Bot' }))).toBe(false)
  })
})

describe('repeated comments', () => {
  const report = (cov: string, after: string) => `## Quality Gate passed\n\n**Measures**\n\nCoverage ${cov}% (${after}% Estimated after merge)\n\n[View](https://scan.example/dashboard?id=1&pr=${cov})`

  test('differ only in their numbers and addresses when they have the same shape', () => {
    expect(shapeOf(report('97.50', '88.00'))).toBe(shapeOf(report('91.20', '87.10')))
    expect(shapeOf('Coverage dropped')).not.toBe(shapeOf('Coverage rose'))
  })

  test('by one bot fold under the newest, which stands where it was; people in between stay where they were', () => {
    const bot = { login: 'scanner[bot]' }
    const list = [
      c('1', { ...bot, body: report('97.50', '88.00') }),
      c('2', { login: 'ada', body: 'First look.' }),
      c('3', { ...bot, body: report('97.10', '88.20') }),
      c('4', { ...bot, body: report('96.00', '88.40') }),
      c('5', { login: 'cy', body: 'Second look.' }),
    ]
    const entries = arrange(list)
    expect(entries.map((e) => [e.comment.id, e.earlier.map((x) => x.id)])).toEqual([
      ['2', []],
      ['4', ['1', '3']],
      ['5', []],
    ])
    expect(entries.map(compact)).toEqual([false, true, false])
  })

  test('of a different shape, by another author, kind or file stay apart', () => {
    const bot = { login: 'scanner[bot]' }
    const entries = arrange([
      c('1', { ...bot, body: 'Build failed.' }),
      c('2', { ...bot, body: 'Build passed after retry, all good.' }),
      c('3', { login: 'other[bot]', body: 'Build failed.' }),
      c('4', { ...bot, kind: 'line', path: 'a.ts', body: 'Build failed.' }),
      c('5', { ...bot, kind: 'line', path: 'b.ts', body: 'Build failed.' }),
    ])
    expect(entries.every((e) => e.earlier.length === 0)).toBe(true)
    /* A bot's comment is drawn folded even alone. */
    expect(entries.every(compact)).toBe(true)
  })

  test('by a person fold only when long enough to be a template, so two short replies are never one', () => {
    expect(arrange([c('1', { body: 'Thanks!' }), c('2', { body: 'Thanks!' })]).map((e) => e.earlier.length)).toEqual([0, 0])
    const long = arrange([c('1', { body: report('97.50', '88.00') }), c('2', { body: report('97.10', '88.20') })])
    expect(long).toHaveLength(1)
    expect(long[0]!.earlier.map((x) => x.id)).toEqual(['1'])
    expect(compact(long[0]!)).toBe(true)
  })

  test('a person\'s single comment is a card', () => {
    expect(arrange([c('1')]).map(compact)).toEqual([false])
  })
})

describe('a folded comment\'s gist', () => {
  test('is its first line with words, without pictures, link addresses or marks', () => {
    expect(summaryOf('![Passed](https://x.example/p.svg \'Passed\') **Quality Gate passed**\n\nmore')).toBe('Quality Gate passed')
    expect(summaryOf('\n\n## [Report](https://x.example) for `main`')).toBe('Report for main')
    expect(summaryOf('<img src="https://x.example/a.png">\n- First point')).toBe('First point')
    expect(summaryOf('![](https://x.example/a.png)')).toBe('')
    expect(summaryOf('<!-- generated:v1 -->\n<!-- a\nmarker -->\n> [!CAUTION]\n> ## Review failed')).toBe('Review failed')
  })
  test('is cut short with an ellipsis', () => {
    expect(summaryOf('word '.repeat(60), 20)).toHaveLength(20)
    expect(summaryOf('word '.repeat(60), 20).endsWith('…')).toBe(true)
  })
})

describe('a leading word', () => {
  test('is picked out, bold or not, and the rest kept', () => {
    expect(leadOf('Important: Remove deletes it on screen only.')).toEqual({ label: 'Important', rest: 'Remove deletes it on screen only.' })
    expect(leadOf('**Important:** Remove it.')).toEqual({ label: 'Important', rest: 'Remove it.' })
    expect(leadOf('**Nit**: spacing')).toEqual({ label: 'Nit', rest: 'spacing' })
    expect(leadOf('suggestion (non-blocking): rename it')?.label).toBe('suggestion (non-blocking)')
  })
  test('is no label when it is a sentence, unbalanced or alone on its line', () => {
    expect(leadOf('I think this is wrong: it deletes')).toBeNull()
    expect(leadOf('**Important: the whole sentence is bold**')).toBeNull()
    expect(leadOf('Important:\nnext line')).toBeNull()
    expect(leadOf('See https://example.org')).toBeNull()
  })
})

describe('the file chip\'s words', () => {
  test('are the first folder, … and the name; a short path stays whole', () => {
    expect(shortPath('apps/web/src/features/tokens/use-token-removal.ts')).toBe('apps/…/use-token-removal.ts')
    expect(shortPath('src/a.ts')).toBe('src/a.ts')
    expect(shortPath('a/b/c.ts')).toBe('a/b/c.ts')
  })
})

describe('an author\'s mark', () => {
  test('is their first letter and the same hue every time', () => {
    expect(markOf('a.reviewer')).toEqual(markOf('a.reviewer'))
    expect(markOf('a.reviewer').letter).toBe('A')
    expect(markOf('__').letter).toBe('?')
  })
})
