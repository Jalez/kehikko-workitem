import { answered, ask } from 'kehikot-module-protocol/client'

import type { Shown } from '../../shown.ts'

/**
 * This module's own `/api`, as the page calls it: only to say what it is showing, for the agent
 * door. `ask` carries the ticket on a write and turns every failure into one sentence.
 */
export interface Api {
  shown(projectPath: string, shown: Shown | null): Promise<void>
}

export const api: Api = {
  async shown(projectPath, shown) {
    answered(await ask('./api/shown', { body: { projectPath, shown } }))
  },
}
