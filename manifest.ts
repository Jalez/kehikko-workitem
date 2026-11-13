import { MANIFEST_KIND, PROTOCOL, manifestSchema, type Manifest } from 'kehikot-module-protocol'

import pkg from './package.json'

export const ID = 'kehikot.workitem'
/** The module's version: package.json's, the one place it is written. A release is tagged with it. */
export const VERSION: string = pkg.version

/**
 * Where this module would like to answer. Said once, here, and read by
 * `vite.config.ts` and `register.ts`. Modules sit ten apart; 8160 is the next
 * free one after the official list's 8150.
 */
export const PREFERRED_PORT = 8160

/**
 * One issue, merge request or pull request, shown in full: the one the canvas
 * points at.
 *
 * ## What it asks the host for, and why
 *
 * - `trackers:read`: everything on screen comes from the host's shared tracker
 *   reading (`tracker.get`), which the host reads with the person's own CLI
 *   sign-ins and keeps with its freshness. The item's detail (description,
 *   comments, checks, milestone, fork; protocol 2.98.0) is asked for one ref at
 *   a time; the items it links to and the space's recent items as summary rows.
 *   This module holds no credential and runs no tracker CLI.
 * - `trackers:refresh`: once per item opened, in the background, so what was
 *   shown at once from the reading is brought up to date without a press. The
 *   header's Refresh asks again.
 * - `selection:set`: only on the person's press on one of the space's recent
 *   items in the empty state, so every module that follows the selection
 *   follows that pick too.
 * - `address:open`: a link in a description or a comment, and a check's or a
 *   comment's link, is opened the way the host opens addresses, never by this
 *   page.
 *
 * Read-only in v1: nothing here writes to a tracker.
 *
 * `storage: true` is for the origin, not for data: the page posts what it is
 * showing to its own server (for the agent door), and a real origin keeps that
 * write same-origin, with no permissive CORS header. Nothing is kept on disk.
 */
export const MANIFEST: Manifest = manifestSchema.parse({
  kind: MANIFEST_KIND,
  protocol: PROTOCOL,
  id: ID,
  name: 'Work item',
  icon: 'lucide:git-pull-request',
  version: VERSION,
  dataVersion: 1,
  summary: 'One issue, merge request or pull request in full: description, discussion, checks, branches and links.',
  tags: ['review', 'planning'],
  guidance:
    'The issue or change selected on this kehikko is shown in full by Work item: its description, its discussion, '
    + 'its checks and what it links to. Call `shown_item` with the project path to read what the person is looking at '
    + 'before you talk about it, rather than assuming which item they mean.',
  entry: '/app',
  modes: [{ id: 'item', label: 'Work item', scope: 'part', scopeSays: 'the issue or change picked out, one at a time' }],
  mcp: {
    url: '/mcp',
    transport: 'http',
    about: 'What Work item is showing the person: one issue, merge request or pull request. Read-only.',
  },
  extensions: { emits: [], consumes: [] },
  reacts: ['selection', 'tracker'],
  partless: 'Shows the one issue or change a person selected, which is always in hand.',
  declares: {
    protocol: `>=${PROTOCOL} <${PROTOCOL + 1}`,
    uses: ['trackers:read', 'trackers:refresh', 'selection:set', 'address:open'],
    storage: true,
    prompt: false,
  },
  health: '/healthz',
})
