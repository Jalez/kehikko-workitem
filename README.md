# Work Item

One issue, merge request or pull request, shown in full: the one selected on
the canvas. A Kehikot module (`kehikot.workitem`).

Loading GitHub or GitLab in a page module to read one item is slow and heavy.
Kehikot already reads trackers with the person's own `gh` / `glab` sign-ins
(self-hosted GitLab included) and keeps what it read. Work Item draws one item
from that reading, natively:

- title, state, kind, ref and repository;
- author, assignees, labels, milestone and reviewers;
- the description as Markdown, with no raw HTML and no loaded images;
- the discussion, newest first page, with more on a press and the rest on the
  tracker when the thread is longer than Kehikot carries;
- the pipeline or checks, failed ones first, each with its link;
- the source and target branch (a fork's too);
- the items it closes, is closed by, or is part of.

## From the person's side

- **Instant from cache, then fresh.** `tracker.get` answers from the host's kept
  reading at once; `tracker.refresh` runs in the background once per item, and
  the page re-asks when the reading moves. The host keeps the item's detail
  until the item, its pipeline or its checks move.
- **No blank flashes.** The host's cover stays up until there is something
  true to draw; an item stays on screen through an answer that lacks it.
- **Light.** A built page served by one Bun process (`serve.ts`); Markdown
  rendered once per text; 20 comments drawn at a time; the "3 min ago" words
  move only while the page is on screen.
- **Offline.** What was read stays, with "Offline: showing what was read at
  12:03" in the page and the footer.
- **Empty state.** Nothing selected: the space's recently updated items, one
  press from being shown and selected.

## Rows

- Header (how it is set up, what to do): Item (a switch, when several are
  selected), Refresh, Open on <host>.
- Footer (what is going on now): the item and its state, its checks, and
  "updated 3 min ago" / "Refreshing…" / the offline line.

`kehikot.rows.json` states them for `check:rows`; `bun run rows` writes it.

## For agents

The MCP door at `/mcp` has one read-only tool, `shown_item { project }`: what
the page in that project is showing. It is held in memory, from the page, and
asks nothing of the tracker.

## Running

```sh
./run.sh            # the build when dist/ is this commit's, Vite otherwise
bun test            # tests
bun run typecheck
bun run build       # the page, for serve.ts
```

Needs module protocol 2.98.0 (a ref's detail with comments, checks, milestone
and fork) and a host that reads them.
