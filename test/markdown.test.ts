import { describe, expect, test } from 'bun:test'

import { linkTarget, markdownHtml } from '../src/item/markdown.ts'

describe('Markdown, safely', () => {
  test('raw HTML is words, never markup', () => {
    const html = markdownHtml('Hi <script>alert(1)</script> <img src=x onerror=alert(1)> <iframe src="https://evil.example"></iframe>')
    const box = document.createElement('div')
    box.innerHTML = html
    expect(box.querySelector('script, iframe, [onerror]')).toBeNull()
    expect(box.textContent).toContain('<script>')
  })

  test('a javascript: link has no address', () => {
    const box = document.createElement('div')
    box.innerHTML = markdownHtml('[click](javascript:alert(1))')
    expect(box.querySelector('a')?.getAttribute('href') ?? '').not.toContain('javascript')
  })

  test('an image is a link to it, never loaded', () => {
    const box = document.createElement('div')
    box.innerHTML = markdownHtml('![screenshot](https://example.org/a.png)')
    expect(box.querySelector('img')).toBeNull()
    expect(box.querySelector('a')?.getAttribute('href')).toBe('https://example.org/a.png')
    expect(box.textContent).toContain('screenshot')
  })

  test('GitHub-flavoured: tables, task lists, strikethrough', () => {
    const box = document.createElement('div')
    box.innerHTML = markdownHtml('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n\n~~gone~~')
    expect(box.querySelector('table')).not.toBeNull()
    expect(box.querySelector('input[type=checkbox]')).not.toBeNull()
    expect(box.querySelector('del')).not.toBeNull()
  })
})

describe('where a link goes', () => {
  const base = 'https://gitlab.example.org/group/project/-/issues/3'
  test('an https address as it is; a relative one against the item', () => {
    expect(linkTarget('https://example.org/x', base)).toBe('https://example.org/x')
    expect(linkTarget('/group/project/-/issues/4', base)).toBe('https://gitlab.example.org/group/project/-/issues/4')
  })
  test('nowhere for anything else', () => {
    expect(linkTarget('http://example.org', base)).toBeNull()
    expect(linkTarget('mailto:a@b.c', base)).toBeNull()
    expect(linkTarget('#top', base)).toBeNull()
    expect(linkTarget('https://user:pw@example.org', base)).toBeNull()
    expect(linkTarget(null, base)).toBeNull()
  })
})
