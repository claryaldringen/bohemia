'use client';

import { useEffect, useState, type ReactElement } from 'react';
import type { Direction8 } from '@bohemia/game';
import type { SelectionSon } from '@/lib/selection-details';
import { LeaveCompass } from '../RelocationControls';
import { Tooltip } from '../Tooltip';

// Řada ikon synů vojvody v panelu dvorce (lord.md – Dělení vsi, Co hráč vidí): ikona muže rodu,
// jméno a věk v popisku; nástupce a syn bez jména zašedlí s důvodem. Klik na syna ukáže ve scéně
// obrys obydlí jeho dílu a růžici odchodu (stejnou jako u vybraných obydlí).

/** Popisek ikony syna: jméno a věk, případně důvod, proč nesmí vést odchod (červeně). */
function SonTooltip({ son }: { son: SelectionSon }): ReactElement {
  return (
    <span className="block">
      <span className="font-serif text-sm font-semibold text-[#f3dfb0]">
        {son.name ?? 'Syn vojvody'}
      </span>
      <span className="ml-1.5 tabular-nums">{son.age} let</span>
      {son.reason !== null && (
        <span data-testid="son-reason" className="mt-0.5 block font-semibold text-red-400">
          {son.reason}
        </span>
      )}
    </span>
  );
}

export function SonsRow({
  sons,
  onLeaveSon,
  onPreviewSon,
}: {
  sons: readonly SelectionSon[];
  onLeaveSon?: ((direction: Direction8, sonId: number) => void) | undefined;
  onPreviewSon?: ((dwellingIds: readonly number[] | null) => void) | undefined;
}): ReactElement {
  const [chosenId, setChosenId] = useState<number | null>(null);
  const chosen = sons.find((s) => s.id === chosenId && s.reason === null) ?? null;
  // obrys dílu patří jen vybranému synovi; po odvolání výběru (i zavření panelu) zmizí
  const previewKey = chosen ? JSON.stringify(chosen.dwellingIds) : null;
  useEffect(() => {
    if (!onPreviewSon) return;
    const ids = previewKey === null ? [] : (JSON.parse(previewKey) as number[]);
    onPreviewSon(ids.length === 0 ? null : ids);
    return () => onPreviewSon(null);
  }, [previewKey, onPreviewSon]);
  return (
    <div className="flex flex-col gap-1.5" data-testid="selection-sons">
      <div className="flex flex-wrap items-center gap-1.5">
        {sons.map((son) => {
          const blocked = son.reason !== null;
          const active = son.id === chosen?.id;
          return (
            <Tooltip key={son.id} content={<SonTooltip son={son} />} placement="above">
              <button
                type="button"
                data-testid={`son-${son.id}`}
                aria-label={`${son.name ?? 'Syn vojvody'}, ${son.age} let${blocked ? ` – ${son.reason}` : ''}`}
                aria-disabled={blocked || undefined}
                aria-pressed={blocked ? undefined : active}
                onClick={() => {
                  if (blocked) return;
                  setChosenId(active ? null : son.id);
                }}
                className={`hud-icon-button h-9 w-9 ${blocked ? 'cursor-not-allowed opacity-45 grayscale' : ''} ${active ? 'ring-2 ring-[#c9a14a]' : ''}`}
              >
                <img
                  src="/icons/resources/man.png"
                  alt=""
                  width={128}
                  height={128}
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              </button>
            </Tooltip>
          );
        })}
      </div>
      {chosen?.leave && (
        <LeaveCompass
          leave={chosen.leave}
          onLeave={onLeaveSon ? (target) => onLeaveSon(target, chosen.id) : undefined}
        />
      )}
    </div>
  );
}
