import { describe, expect, test } from 'bun:test'
import type { TrackerCheck } from 'kehikot-module-protocol'

import { countsWords, groupStages, overallLine, stageOf, trouble } from '../src/item/stages.ts'

const c = (name: string, state: TrackerCheck['state'], stage?: string): TrackerCheck => ({ name, state, ...(stage ? { stage } : {}) })

describe('stages', () => {
  test('a job is in the stage the tracker gave', () => {
    expect(stageOf(c('validate:merge-door', 'failed', 'gate'))).toBe('gate')
  })

  test('without one, the name before " › ", " / " or ":" is the stage; the rest is one group', () => {
    expect(stageOf(c('build:workspaces', 'success'))).toBe('build')
    expect(stageOf(c('test › unit', 'success'))).toBe('test')
    expect(stageOf(c('CI / lint (node 20)', 'success'))).toBe('CI')
    expect(stageOf(c('codecov', 'success'))).toBe('Checks')
  })

  test('the pipeline order is kept when every stage is known, else first-seen', () => {
    const known = groupStages([c('test:a', 'success'), c('build:a', 'success'), c('validate:a', 'success')])
    expect(known.map((s) => s.name)).toEqual(['validate', 'build', 'test'])
    const mixed = groupStages([c('test:a', 'success'), c('zeta:a', 'success'), c('build:a', 'success')])
    expect(mixed.map((s) => s.name)).toEqual(['test', 'zeta', 'build'])
  })

  test('a stage takes its worst state: failed > running > waiting > manual > skipped > passed', () => {
    const state = (...s: TrackerCheck['state'][]) => groupStages(s.map((x, i) => c(`x:${i}`, x)))[0]!.state
    expect(state('success', 'skipped')).toBe('skipped')
    expect(state('skipped', 'manual')).toBe('manual')
    expect(state('manual', 'pending')).toBe('pending')
    expect(state('pending', 'running', 'success')).toBe('running')
    expect(state('running', 'failed', 'success')).toBe('failed')
  })

  test('counts, and the jobs listed failed first', () => {
    const [s] = groupStages([c('v:a', 'success'), c('v:b', 'failed'), c('v:c', 'success'), c('v:d', 'failed'), c('v:e', 'manual')])
    expect(countsWords(s!.counts)).toBe('2 failed · 1 manual · 2 passed')
    expect(trouble(s!.counts)).toBe('2 failed · 1 manual')
    expect(s!.jobs.map((j) => j.name)).toEqual(['v:b', 'v:d', 'v:e', 'v:a', 'v:c'])
    expect(trouble(groupStages([c('v:a', 'success')])[0]!.counts)).toBe('')
  })

  test('a manual job does not make a stage look failed', () => {
    const [s] = groupStages([c('test:unit', 'success'), c('test:e2e', 'manual')])
    expect(s!.state).toBe('manual')
  })

  test('the overall line has its spacing and its counts', () => {
    const checks = [c('a:1', 'failed'), c('a:2', 'failed'), ...Array.from({ length: 32 }, (_, i) => c(`b:${i}`, 'success'))]
    expect(overallLine('failed', checks)).toBe('Pipeline failed · 2 of 34 failed')
    expect(overallLine('success', checks.slice(2))).toBe('Pipeline passed · 32 checks')
    expect(overallLine('running', [c('a:1', 'running'), c('a:2', 'success')])).toBe('Pipeline running · 1 of 2 running')
    expect(overallLine(undefined, [c('a:1', 'failed')])).toBe('Pipeline failed · 1 of 1 failed')
  })
})
