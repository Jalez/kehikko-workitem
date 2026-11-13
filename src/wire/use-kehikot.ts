import { useMemo } from 'react'

import { useHost, type Host as ProtocolHost } from 'kehikot-module-protocol/client/react'
import type { HostEvents } from 'kehikot-module-protocol/client'

import { ID } from '../../manifest.ts'

/**
 * What the screen needs from the host: the protocol's `useHost`, narrowed to what this page
 * reads, plus the tracker reading's clock. A plain object, so a screen can be drawn in a test
 * without a host.
 */
export interface Host
  extends Pick<
    ProtocolHost,
    'where' | 'project' | 'projectPath' | 'epic' | 'theme' | 'request' | 'header' | 'footer' | 'ready' | 'selection' | 'openAddress' | 'visible'
  > {
  /** When the host's tracker reading last changed (`context.tracker.at`); null before it says. */
  trackerAt: string | null
  /** Whether the host is reading a tracker for this project right now. */
  trackerBusy: boolean
}

export function useKehikot(events: HostEvents = {}): Host {
  const host = useHost(ID, events)
  const trackerAt = host.context?.tracker?.at ?? null
  const trackerBusy = host.context?.tracker?.refreshing ?? false
  return useMemo(() => ({ ...host, trackerAt, trackerBusy }), [host, trackerAt, trackerBusy])
}
