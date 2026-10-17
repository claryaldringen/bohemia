'use client';

import { useState, type ReactElement, type ReactNode } from 'react';
import { dateOfDayIndex } from '@bohemia/game';
import { formatGameDate } from '@/lib/game-date';
import {
  formatInteger,
  formatLaborPerDay,
  formatPercent,
  formatStoresMonths,
} from '@/lib/village-format';
import { villageNotices } from '@/lib/village-notices';
import { DWELLING_NAMES, type VillageView } from '@/lib/village-view';

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="border-t border-stone-300/70 pt-2 dark:border-stone-700/70">
      <h3 className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
        {title}
      </h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }): ReactElement {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-stone-300 dark:bg-stone-700"
    >
      <div
        className="h-full rounded-full bg-emerald-700 transition-[width] duration-500 dark:bg-emerald-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function Badge({ tone, children }: { tone: 'ok' | 'warn'; children: ReactNode }): ReactElement {
  const colors =
    tone === 'ok'
      ? 'bg-emerald-700/15 text-emerald-800 dark:text-emerald-300'
      : 'bg-red-700/15 text-red-800 dark:text-red-300';
  return <span className={`rounded px-1 text-[11px] ${colors}`}>{children}</span>;
}

/**
 * Panel vsi vlevo nahoře: trvající upozornění, lidé, domácnosti, zásoby, práce, stavby
 * a kronika. Jde sbalit.
 */
export function VillagePanel({ view }: { view: VillageView }): ReactElement {
  const [open, setOpen] = useState(true);
  const { people } = view;
  const total = people.children + people.adults + people.elders;
  const notices = villageNotices(view);

  return (
    <aside
      data-testid="village-panel"
      aria-label={`Ves ${view.name}`}
      className="fixed top-12 left-2 z-10 flex max-h-[calc(100vh-9rem)] w-80 max-w-[calc(100vw-1rem)] flex-col rounded bg-stone-100/90 text-sm text-stone-800 shadow-lg backdrop-blur dark:bg-stone-950/85 dark:text-stone-200"
    >
      <header className="flex items-baseline gap-2 px-3 py-2">
        <h2 className="font-serif text-lg text-stone-900 dark:text-stone-50">{view.name}</h2>
        <span className="text-xs text-stone-500 dark:text-stone-400">
          {formatGameDate(dateOfDayIndex(view.dayIndex))}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="village-panel-body"
          onClick={() => setOpen(!open)}
          className="ml-auto rounded px-1.5 text-xs text-stone-600 hover:bg-stone-200 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-emerald-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
        >
          {open ? 'Sbalit' : 'Rozbalit'}
        </button>
      </header>

      {open && (
        <div id="village-panel-body" className="space-y-2 overflow-y-auto px-3 pb-3">
          {notices.length > 0 && (
            <Section title="Upozornění">
              <ul data-testid="village-notices" className="space-y-1">
                {notices.map((n) => (
                  <li key={n.kind} className="flex items-baseline gap-2 leading-snug">
                    <span
                      aria-hidden
                      className={`inline-block h-2 w-2 shrink-0 rounded-full ${n.tone === 'good' ? 'bg-emerald-600' : 'bg-amber-600'}`}
                    />
                    <span>
                      <span className="font-semibold">{n.title}</span>{' '}
                      <span className="text-xs text-stone-600 dark:text-stone-400">{n.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section title="Lidé">
            <p>
              <span data-testid="village-people" className="font-semibold">
                {total}
              </span>{' '}
              <span className="text-stone-600 dark:text-stone-400">
                – děti {people.children} · dospělí {people.adults} · starší {people.elders}
              </span>
            </p>
          </Section>

          <Section title="Domácnosti">
            <ul className="space-y-1">
              {view.households.map((h) => (
                <li key={h.dwellingId} className="flex flex-wrap items-center gap-x-2">
                  <span>{DWELLING_NAMES[h.type].nominative}</span>
                  <span className="tabular-nums">
                    {h.occupants}/{h.capacity}
                  </span>
                  {h.overcrowded ? (
                    <Badge tone="warn">přeplněná</Badge>
                  ) : (
                    h.full && <Badge tone="ok">plná</Badge>
                  )}
                  <span className="ml-auto text-xs text-stone-500 dark:text-stone-400">
                    stav {formatPercent(h.condition)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Zásoby a práce">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <dt className="text-stone-600 dark:text-stone-400">Obilí</dt>
              <dd>
                {formatInteger(view.storesKg)} kg{' '}
                <span className="text-stone-500 dark:text-stone-400">
                  ({formatStoresMonths(view.storesMonths)})
                </span>
              </dd>
              <dt className="text-stone-600 dark:text-stone-400">Nasycení</dt>
              <dd className={view.satiation < 1 ? 'text-red-700 dark:text-red-400' : undefined}>
                {formatPercent(view.satiation)}
              </dd>
              <dt className="text-stone-600 dark:text-stone-400">Volná práce</dt>
              <dd>{formatLaborPerDay(view.commonLaborPerDay)}</dd>
            </dl>
          </Section>

          {view.constructions.length > 0 && (
            <Section title="Rozestavěno">
              <ul className="space-y-1.5">
                {view.constructions.map((c) => (
                  <li key={c.id}>
                    <div className="flex justify-between gap-2">
                      <span>{c.label}</span>
                      <span className="text-xs text-stone-500 tabular-nums dark:text-stone-400">
                        {formatPercent(c.progress)}
                      </span>
                    </div>
                    <ProgressBar value={c.progress} label={c.label} />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {view.chronicle.length > 0 && (
            <Section title="Kronika">
              <ol className="space-y-1">
                {view.chronicle.map((event, i) => (
                  <li key={`${event.day}-${i}`} className="leading-snug">
                    <span className="text-xs text-stone-500 dark:text-stone-400">
                      {event.dateLabel}
                    </span>{' '}
                    {event.text}
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </div>
      )}
    </aside>
  );
}
