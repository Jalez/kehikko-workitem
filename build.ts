#!/usr/bin/env bun
import { buildModule } from 'kehikot-module-protocol/build'

/**
 * The page, compiled ahead of time for `serve.ts`, and stamped with the commit: `bun run build`.
 * A served build is a small static page and one Bun process, which is what keeps this module light
 * where a Vite dev server would not be. The stamp (`dist/.kehikot-built`) is written only after a
 * build from a checkout with no changes to tracked files; `run.sh` keeps Vite for an edited one.
 */
const built = await buildModule({ dir: import.meta.dirname, page: { title: 'Work item' } })
if (!built.stamped) process.exitCode = 2
