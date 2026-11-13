# Work Item — notes for agents

- Everything shown comes from the host's tracker reading (`tracker.get`,
  `tracker.refresh`). This module runs no tracker CLI and holds no credential.
  A fact the reading lacks goes in the protocol's tracker shape and the host's
  readers, never in a CLI call here.
- Read-only: nothing here writes to a tracker.
- Text from a tracker is text. Markdown goes through `src/item/markdown.ts`
  (no raw HTML, no dangerous links; a picture is never loaded by the page: the host fetches it, `tracker.image`, see `src/item/pictures.ts`); every link opens through
  the host (`openAddress`), never `window.open` or an `<a target>`.
- The rows: header is how it is set up and what to do, footer is what is going
  on now (`src/rows.ts`). Change a row, then `bun run rows` to rewrite
  `kehikot.rows.json`; a test holds the two in step.
- Nothing is written to disk. `shown.ts` holds what each project's page shows,
  in memory, for `shown_item`.
- The module names no other module in its code, UI text or notes.
- Releasing: bump `package.json`'s version and add `notes/<version>.md`
  starting with `Kind:`; a merge to `main` releases it.
