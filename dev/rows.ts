#!/usr/bin/env bun
/** Writes `kehikot.rows.json` from `src/rows-states.ts`: `bun run rows`. CI checks the file (`check:rows`). */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { rowStates } from './rows-states.ts'

writeFileSync(join(import.meta.dirname, '..', 'kehikot.rows.json'), `${JSON.stringify(rowStates(), null, 2)}\n`)
