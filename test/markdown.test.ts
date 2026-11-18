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

  test('a picture GitHub wrote as HTML is a picture slot, built from its address and alt alone', () => {
    const box = document.createElement('div')
    /* As github.com writes a pasted screenshot (oven-sh/bun#48938), alone, inline, and wrapped. */
    box.innerHTML = markdownHtml(
      'Steps:\n\n<img width="575" height="478" alt="image" src="https://github.com/user-attachments/assets/82a87b90-18b3-493d-be0e-b84b3eb83d55" />\n\n'
        + 'inline <img alt="b" src="https://github.com/user-attachments/assets/0835add3-541e-4a51-8b80-68e4f2879336"> here\n\n'
        + '<p align="center"><img src="https://github.com/user-attachments/assets/5d2a058a-bd38-4cfa-93eb-2397b6e5f296" onerror="alert(1)" style="x"></p>',
    )
    const slots = [...box.querySelectorAll('span.md-image')]
    expect(slots.map((s) => s.getAttribute('data-src'))).toEqual([
      'https://github.com/user-attachments/assets/82a87b90-18b3-493d-be0e-b84b3eb83d55',
      'https://github.com/user-attachments/assets/0835add3-541e-4a51-8b80-68e4f2879336',
      'https://github.com/user-attachments/assets/5d2a058a-bd38-4cfa-93eb-2397b6e5f296',
    ])
    expect(slots[0]!.getAttribute('data-alt')).toBe('image')
    expect(box.querySelector('img, [onerror], [style], p[align]')).toBeNull()
    expect(box.textContent).not.toContain('<img')
    expect(box.textContent).not.toContain('<p')
  })

  test('an HTML picture with a script address keeps no address; other tags stay words', () => {
    const box = document.createElement('div')
    box.innerHTML = markdownHtml('<img src="javascript:alert(1)" alt="x"> <b>bold</b> <details><summary>s</summary></details>')
    expect(box.querySelector('span.md-image')?.getAttribute('data-src')).toBe('')
    expect(box.querySelector('b, details')).toBeNull()
    expect(box.textContent).toContain('<b>')
  })

  test('an <img> inside code is code', () => {
    const box = document.createElement('div')
    box.innerHTML = markdownHtml('`<img src="https://e.org/a.png">`\n\n```\n<img src="https://e.org/b.png">\n```')
    expect(box.querySelector('span.md-image')).toBeNull()
    expect(box.textContent).toContain('<img src="https://e.org/a.png">')
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
  test('a GitLab upload is the project\'s, not the server\'s (as gitlab.com writes it in a merge request)', () => {
    const mr = 'https://gitlab.com/gitlab-org/cli/-/merge_requests/4387'
    expect(linkTarget('/uploads/62084dc44b7353be535c4eac94183551/glab-verify-self-managed-sigstore.png', mr)).toBe(
      'https://gitlab.com/gitlab-org/cli/uploads/62084dc44b7353be535c4eac94183551/glab-verify-self-managed-sigstore.png',
    )
    expect(linkTarget('/-/project/34675721/uploads/591c4990c5c80a55d9132fefdf41c787/a.png', mr)).toBe(
      'https://gitlab.com/-/project/34675721/uploads/591c4990c5c80a55d9132fefdf41c787/a.png',
    )
    expect(linkTarget('/uploads/abc/a.png', 'https://gitlab.example.org/g/sub/p/-/work_items/8')).toBe('https://gitlab.example.org/g/sub/p/uploads/abc/a.png')
    /* GitHub has no such form: its attachments are absolute. */
    expect(linkTarget('https://github.com/user-attachments/assets/82a87b90-18b3-493d-be0e-b84b3eb83d55', 'https://github.com/o/r/issues/1')).toBe(
      'https://github.com/user-attachments/assets/82a87b90-18b3-493d-be0e-b84b3eb83d55',
    )
  })
  test('nowhere for anything else', () => {
    expect(linkTarget('http://example.org', base)).toBeNull()
    expect(linkTarget('mailto:a@b.c', base)).toBeNull()
    expect(linkTarget('#top', base)).toBeNull()
    expect(linkTarget('https://user:pw@example.org', base)).toBeNull()
    expect(linkTarget(null, base)).toBeNull()
  })
})
