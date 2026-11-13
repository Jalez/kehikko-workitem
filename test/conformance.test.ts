import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

/**
 * The protocol's conformance checks this module's pin carries, run over this module: the rows
 * (what goes in the header and what in the footer), the parts contract (`partless`), and the MCP
 * door's annotations.
 */
const root = join(import.meta.dirname, '..')
const bin = (name: string) => join(root, 'node_modules', 'kehikot-module-protocol', 'bin', name)

describe('conformance', () => {
  for (const check of ['check-rows.ts', 'check-parts.ts', 'check-door.ts']) {
    test(check, () => {
      const ran = spawnSync('bun', [bin(check), root], { cwd: root, encoding: 'utf8' })
      expect(`${ran.stdout}${ran.stderr}`).not.toContain('fail')
      expect(ran.status).toBe(0)
    })
  }
})
