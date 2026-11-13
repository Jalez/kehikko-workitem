import { describe, expect, test } from 'bun:test'

import { WELL_KNOWN } from 'kehikot-module-protocol'

import { MANIFEST, TICKET, answer } from '../doors.ts'
import { ID } from '../manifest.ts'
import { MOST_PROJECTS, readShown, writeShown } from '../shown.ts'
import { shownOf } from '../src/item/shown.ts'
import { change } from '../dev/fixtures.ts'

const none = new URLSearchParams()

function rpc(method: string, params: Record<string, unknown> = {}) {
  const reply = answer('POST', '/mcp', none, { jsonrpc: '2.0', id: 1, method, params }, null)
  return reply?.body as { result?: { tools?: { name: string }[]; content?: { text: string }[]; isError?: boolean } }
}

describe('the doors', () => {
  test('the health check says which module this is', () => {
    const reply = answer('GET', '/healthz', none, null, null)
    expect(reply?.status).toBe(200)
    expect((reply?.body as { id: string }).id).toBe(ID)
  })

  test('the manifest is this module’s', () => {
    expect(WELL_KNOWN.startsWith('/')).toBe(true)
    expect(MANIFEST.id).toBe(ID)
  })

  test('a path that is not ours is left to Vite, and an unknown /api path is refused', () => {
    expect(answer('GET', '/src/main.tsx', none, null, null)).toBeNull()
    expect(answer('GET', '/api/nothing', none, null, null)?.status).toBe(404)
  })

  test('what the page shows is taken only with its ticket, and only in the shape of an item', () => {
    const body = { projectPath: '/work/a', shown: shownOf(change(), null) }
    expect(answer('POST', '/api/shown', none, body, null)?.status).toBe(403)
    expect(answer('POST', '/api/shown', none, body, 'not-the-ticket')?.status).toBe(403)
    expect(answer('POST', '/api/shown', none, { projectPath: '/work/a', shown: { ref: 'gh#5' } }, TICKET)?.status).toBe(400)
    expect(answer('POST', '/api/shown', none, { projectPath: 'relative', shown: null }, TICKET)?.status).toBe(400)
    expect(answer('POST', '/api/shown', none, body, TICKET)?.status).toBe(200)
    expect(readShown('/work/a')?.ref).toBe('gh#5')
    expect(answer('POST', '/api/shown', none, { projectPath: '/work/a', shown: null }, TICKET)?.status).toBe(200)
    expect(readShown('/work/a')).toBeNull()
  })

  test('shown_item says what the person is looking at, and says so when it is nothing', () => {
    expect(rpc('tools/list').result?.tools?.map((one) => one.name)).toEqual(['shown_item'])
    expect(rpc('tools/call', { name: 'shown_item', arguments: { project: '/work/b' } }).result?.content?.[0]?.text).toContain('showing nothing')
    writeShown('/work/b', shownOf(change(), 'Offline: showing what was read at 12:03'))
    const said = JSON.parse(rpc('tools/call', { name: 'shown_item', arguments: { project: '/work/b' } }).result!.content![0]!.text)
    expect(said).toMatchObject({ ref: 'gh#5', state: 'open', pipeline: 'failed', failedChecks: ['test'], commentCount: 2, milestone: 'v1', offline: expect.any(String) })
    expect(said.linked).toEqual([
      { ref: 'gh#3', how: 'Closes' },
      { ref: 'gh#2', how: 'Part of' },
    ])
    expect(rpc('tools/call', { name: 'shown_item', arguments: {} }).result?.isError).toBe(true)
  })

  test('every tool only reads, says so, and spells the project `project`', () => {
    const tools = rpc('tools/list').result?.tools as { annotations?: { readOnlyHint?: boolean }; inputSchema: { properties: object } }[]
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true)
      expect(Object.keys(tool.inputSchema.properties)).toEqual(['project'])
    }
  })

  test('memory is bounded: the oldest project is let go', () => {
    for (let i = 0; i <= MOST_PROJECTS; i += 1) writeShown(`/work/many-${i}`, shownOf(change(), null))
    expect(readShown('/work/many-0')).toBeNull()
    expect(readShown(`/work/many-${MOST_PROJECTS}`)).not.toBeNull()
  })
})
