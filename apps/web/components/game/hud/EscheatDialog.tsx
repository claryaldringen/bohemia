'use client';

import { useEffect, useState, type ReactElement } from 'react';
import type { EscheatPart, EscheatView } from '@bohemia/game';
import { HouseIcon } from './TermsForm';
import { Tooltip } from './Tooltip';

// Dialog Odúmrť (vassalage.md – Vymření rodu – odúmrť): pán vymřelého rodu rozdělí jeho vsi a vazaly
// po celých vsích – u každé vsi a vazala volba, komu připadne (pán, nebo jeho vazal jako věnování).
// Vsi jedné mapy jdou spolu (volba jedné přepne celou mapu). Pečeť = navrhnout (s jediným pánem
// platí hned), u cizího návrhu souhlas. Slova jen v popiscích.

/** Kdo dostane co: id vsi / vazala → rod příjemce. */
export type Assignment = Record<string, string>;

/** Výchozí přiřazení: poslední návrh, jinak vše prvnímu pánovi (technickému držiteli). */
export function initialAssignment(view: EscheatView): Assignment {
  const out: Assignment = {};
  const first = view.ownHouseId;
  for (const v of view.villages) out[v.id] = first;
  for (const v of view.vassals) out[v.houseId] = first;
  for (const part of view.plan ?? []) {
    for (const id of [...part.villageIds, ...part.vassalIds]) out[id] = part.toHouseId;
  }
  return out;
}

/** Přiřazení → díly (jeden na příjemce, v pořadí příjemců). */
export function partsOf(view: EscheatView, assignment: Assignment): EscheatPart[] {
  const parts: EscheatPart[] = [];
  for (const r of view.recipients) {
    const villageIds = view.villages.filter((v) => assignment[v.id] === r.houseId).map((v) => v.id);
    const vassalIds = view.vassals
      .filter((v) => assignment[v.houseId] === r.houseId)
      .map((v) => v.houseId);
    if (villageIds.length + vassalIds.length > 0)
      parts.push({ toHouseId: r.houseId, villageIds, vassalIds });
  }
  return parts;
}

/** Změna příjemce vsi – celá mapa jde s ní. */
export function assignVillage(
  view: EscheatView,
  assignment: Assignment,
  villageId: string,
  toHouseId: string,
): Assignment {
  const map = view.villages.find((v) => v.id === villageId)?.mapId;
  const next = { ...assignment };
  for (const v of view.villages) if (v.id === villageId || v.mapId === map) next[v.id] = toHouseId;
  return next;
}

type Answer = Promise<{ ok: true; decided: boolean } | { error: string }>;

function EscheatRow({
  view,
  onPropose,
  onConsent,
}: {
  view: EscheatView;
  onPropose: (input: { escheatId: string; parts: EscheatPart[] }) => Answer;
  onConsent: (input: { escheatId: string; version: number }) => Answer;
}): ReactElement {
  const [assignment, setAssignment] = useState<Assignment>(() => initialAssignment(view));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const single = view.villages.length <= 1;
  const consented = view.consents.includes(view.ownHouseId);
  const othersPlan = view.plan !== null && !consented;
  const answer = async (run: () => Answer): Promise<void> => {
    setError(null);
    const result = await run();
    if ('error' in result) setError(result.error);
    else setDone(true);
  };
  const choose = (
    label: string,
    value: string,
    onChange: (to: string) => void,
    testId: string,
  ): ReactElement => (
    <select
      aria-label={label}
      data-testid={testId}
      value={value}
      disabled={done}
      onChange={(e) => onChange(e.target.value)}
      className="hud-input max-w-[9rem] text-xs"
    >
      {view.recipients.map((r) => (
        <option key={r.houseId} value={r.houseId}>
          {r.gift ? `${r.name} ⟶` : r.name}
        </option>
      ))}
    </select>
  );
  return (
    <div data-testid="escheat-row" className="border-t border-white/10 py-2 text-sm">
      <div className="flex items-center gap-1 pb-1">
        <Tooltip content={`Odúmrť rodu ${view.deadName}`}>
          <span tabIndex={0} aria-label={`Odúmrť rodu ${view.deadName}`} className="inline-flex">
            <HouseIcon name="hourglass" size={20} />
          </span>
        </Tooltip>
        <span className="truncate">{view.deadName}</span>
        <span className="ml-auto flex items-center gap-1">
          {view.lords.map((l) => (
            <Tooltip key={l.houseId} content={l.name}>
              <span
                tabIndex={0}
                aria-label={l.name}
                data-testid="escheat-consent"
                data-consent={view.consents.includes(l.houseId) ? 'yes' : 'no'}
                className={view.consents.includes(l.houseId) ? 'opacity-100' : 'opacity-30'}
              >
                <HouseIcon name="seal" size={16} />
              </span>
            </Tooltip>
          ))}
        </span>
      </div>
      {view.villages.map((v) => (
        <div key={v.id} className="flex items-center gap-1 py-0.5">
          <HouseIcon name="village-key" size={16} />
          <span className="truncate">{v.name}</span>
          <span className="ml-auto">
            {choose(
              v.name,
              assignment[v.id] ?? view.ownHouseId,
              (to) =>
                setAssignment((a) =>
                  single
                    ? Object.fromEntries(Object.keys(a).map((k) => [k, to]))
                    : assignVillage(view, a, v.id, to),
                ),
              'escheat-village',
            )}
          </span>
        </div>
      ))}
      {view.vassals.map((v) => (
        <div key={v.houseId} className="flex items-center gap-1 py-0.5">
          <HouseIcon name="oath" size={16} />
          <span className="truncate">{v.name}</span>
          <span className="ml-auto">
            {choose(
              v.name,
              assignment[v.houseId] ?? view.ownHouseId,
              (to) =>
                setAssignment((a) =>
                  single
                    ? Object.fromEntries(Object.keys(a).map((k) => [k, to]))
                    : { ...a, [v.houseId]: to },
                ),
              'escheat-vassal',
            )}
          </span>
        </div>
      ))}
      {error && (
        <span data-testid="escheat-error" className="block pt-1 text-xs text-red-400">
          {error}
        </span>
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        {othersPlan && (
          <Tooltip content="Souhlasím s návrhem">
            <button
              type="button"
              aria-label="Souhlasím s návrhem"
              data-testid="escheat-consent-button"
              disabled={done}
              onClick={() =>
                void answer(() => onConsent({ escheatId: view.id, version: view.version }))
              }
              className="hud-icon-button flex h-8 w-8 items-center justify-center"
            >
              <HouseIcon name="oath" size={20} />
            </button>
          </Tooltip>
        )}
        <Tooltip content={view.lords.length > 1 ? 'Navrhnout dělení' : 'Rozhodnout'}>
          <button
            type="button"
            aria-label={view.lords.length > 1 ? 'Navrhnout dělení' : 'Rozhodnout'}
            data-testid="escheat-propose"
            disabled={done}
            onClick={() =>
              void answer(() => onPropose({ escheatId: view.id, parts: partsOf(view, assignment) }))
            }
            className="hud-icon-button flex h-8 w-8 items-center justify-center"
          >
            <HouseIcon name="seal" size={20} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

/** Panel Odúmrť: jeden řádek na nerozhodnutou odúmrť, o které hráč jako pán rozhoduje. */
export function EscheatDialog({
  escheats,
  error,
  onPropose,
  onConsent,
  onClose,
}: {
  /** Nerozhodnuté odúmrti; null = ještě se načítají. */
  escheats: readonly EscheatView[] | null;
  error?: string | null;
  onPropose: (input: { escheatId: string; parts: EscheatPart[] }) => Answer;
  onConsent: (input: { escheatId: string; version: number }) => Answer;
  onClose: () => void;
}): ReactElement {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-label="Odúmrť"
      data-testid="escheat-dialog"
      data-hud-block
      className="hud-panel fixed top-12 left-2 z-40 w-[22rem] max-w-[calc(100vw-1rem)] p-3"
    >
      <div className="flex items-center justify-between pb-1">
        <Tooltip content="Odúmrť">
          <span tabIndex={0} aria-label="Odúmrť" className="inline-flex">
            <HouseIcon name="hourglass" size={26} />
          </span>
        </Tooltip>
        <Tooltip content="Zavřít">
          <button
            type="button"
            aria-label="Zavřít"
            data-testid="escheat-close"
            onClick={onClose}
            className="hud-icon-button flex h-7 w-7 items-center justify-center"
          >
            <HouseIcon name="cross" size={16} />
          </button>
        </Tooltip>
      </div>
      {error && (
        <span data-testid="escheat-load-error" className="block pb-1 text-xs text-red-400">
          {error}
        </span>
      )}
      {escheats === null ? (
        <div className="py-4 text-center text-sm opacity-70" aria-busy>
          …
        </div>
      ) : (
        escheats.map((view) => (
          <EscheatRow
            key={`${view.id}:${view.version}`}
            view={view}
            onPropose={onPropose}
            onConsent={onConsent}
          />
        ))
      )}
    </div>
  );
}
