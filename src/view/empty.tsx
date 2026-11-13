import type { TrackerRow } from 'kehikot-module-protocol'

import { ago, kindWord, stateWord } from '@/item/reading.ts'

/**
 * Nothing is selected: rather than a blank page, the space's most recently updated items, each
 * one press from being shown here (and selected for every module that follows the selection).
 */
export function Empty({ recent, now, pick, where }: { recent: readonly TrackerRow[]; now: number; pick: (ref: string) => void; where: string }) {
  return (
    <section className="flex flex-col gap-3" data-testid="empty">
      <p className="text-muted-foreground">Select an issue or a change on the canvas to read it here.</p>
      {recent.length ? (
        <>
          <h2 className="text-xs font-medium">Recently updated in {where}</h2>
          <ul className="flex flex-col">
            {recent.map((row) => (
              <li key={`${row.tracker}|${row.host}|${row.repo}|${row.kind}|${row.number}`}>
                <button
                  type="button"
                  className="hover:bg-accent flex w-full items-baseline gap-2 rounded px-1 py-1 text-left"
                  onClick={() => pick(row.ref)}
                  title={`${kindWord(row)} ${row.ref}: ${row.title}`}
                >
                  <span className="text-muted-foreground w-16 shrink-0 font-mono text-xs">{row.ref}</span>
                  <span className="min-w-0 flex-1 truncate">{row.title}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {stateWord(row)}
                    {row.updatedAt ? ` · ${ago(row.updatedAt, now)}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
