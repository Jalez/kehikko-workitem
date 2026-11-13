import { describe, expect, test } from 'bun:test'

import { MAX_ASKING, Pictures, keyOf, type PictureIo } from '../src/item/pictures.ts'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString('base64')

function io() {
  const made: string[] = []
  const revoked: string[] = []
  const pending: Array<() => void> = []
  let inFlight = 0
  let peak = 0
  const value: PictureIo & { gate: boolean } = {
    gate: false,
    ask: (_ref, url) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      return new Promise((resolve) => {
        const done = () => {
          inFlight--
          resolve({ outcome: 'image', mime: 'image/png', base64: PNG })
        }
        if (value.gate) pending.push(done)
        else done()
      })
    },
    makeUrl: (_b, _m) => {
      const u = `blob:${made.length}`
      made.push(u)
      return u
    },
    revoke: (u) => void revoked.push(u),
  }
  return { value, made, revoked, pending, peak: () => peak }
}
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('pictures held by the page', () => {
  test('at most a dozen hold a decoded address; the least recent gives its up and is idle again', async () => {
    const h = io()
    const p = new Pictures(h.value, 3)
    for (let i = 0; i < 4; i++) {
      p.load('gh#1', `https://x/${i}.png`)
      await settle()
    }
    expect(p.live).toBe(3)
    expect(h.revoked).toEqual(['blob:0'])
    expect(p.get(keyOf('gh#1', 'https://x/0.png')).at).toBe('idle')
    expect(p.get(keyOf('gh#1', 'https://x/3.png')).at).toBe('ready')
  })

  test('only a few are asked for at the same time', async () => {
    const h = io()
    h.value.gate = true
    const p = new Pictures(h.value)
    for (let i = 0; i < 8; i++) p.load('gh#1', `https://x/${i}.png`)
    expect(h.peak()).toBe(MAX_ASKING)
    while (h.pending.length) {
      h.pending.shift()!()
      await settle()
    }
    expect(p.live).toBe(8)
  })

  test('an answer that is not the protocol\'s, or not base64, is a link; a failure too', async () => {
    const bad: PictureIo = { ask: async () => ({ nonsense: true }), makeUrl: () => 'blob:x', revoke: () => {} }
    const p = new Pictures(bad)
    p.load('gh#1', 'https://x/a.png')
    await settle()
    expect(p.get(keyOf('gh#1', 'https://x/a.png'))).toEqual({ at: 'link', why: 'unreadable' })
    const down = new Pictures({ ask: () => Promise.reject(new Error('x')), makeUrl: () => '', revoke: () => {} })
    down.load('gh#1', 'https://x/b.png')
    await settle()
    expect(down.get(keyOf('gh#1', 'https://x/b.png')).at).toBe('link')
  })

  test('one that cannot be drawn becomes a link and gives its address up', async () => {
    const h = io()
    const p = new Pictures(h.value)
    p.load('gh#1', 'https://x/a.png')
    await settle()
    p.broke(keyOf('gh#1', 'https://x/a.png'))
    expect(h.revoked).toEqual(['blob:0'])
    expect(p.get(keyOf('gh#1', 'https://x/a.png'))).toEqual({ at: 'link', why: 'broken' })
  })
})
