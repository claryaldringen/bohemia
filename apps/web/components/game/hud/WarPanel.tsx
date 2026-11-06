'use client';

import { useEffect, type ReactElement } from 'react';
import { dateOfDayIndex } from '@bohemia/game';
import { formatGameDate } from '@/lib/game-date';
import type { HouseView } from '@/lib/house-view';
import { Tooltip } from './Tooltip';

// Panel války (war.md – Co hráč vidí): textový přehled válek rodu – s kým, od kdy, jak začala
// a v jakém je stavu. Panel je textový záměrně (výjimka z pravidla „bez popisků“ stejně jako
// panel Vojsko); mírové jednání a svolání vazalů přibudou s dalšími úlohami války.

const ICON = '/icons/house';

/** Panel války; `view` je pohled na rod (války z panelu rodu). */
export function WarPanel({
  view,
  onClose,
}: {
  view: HouseView | null;
  onClose: () => void;
}): ReactElement {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const wars = view?.wars ?? [];
  return (
    <div
      role="dialog"
      aria-label="Válka"
      data-testid="war-panel"
      data-hud-block
      className="hud-panel fixed top-12 right-2 z-40 w-[22rem] max-w-[calc(100vw-1rem)] p-3"
    >
      <div className="flex items-center gap-1.5 pb-2">
        <Tooltip content="Válka">
          <img src={`${ICON}/spears.svg`} alt="" width={24} height={24} draggable={false} />
        </Tooltip>
        <Tooltip content="Zavřít">
          <button
            type="button"
            aria-label="Zavřít"
            data-testid="war-close"
            className="hud-icon-button ml-auto flex h-6 w-6 items-center justify-center"
            onClick={onClose}
          >
            <img src={`${ICON}/cross.svg`} alt="" width={12} height={12} draggable={false} />
          </button>
        </Tooltip>
      </div>
      {!view ? (
        <div className="py-2 text-center text-sm opacity-70" aria-busy>
          …
        </div>
      ) : wars.length === 0 ? (
        <p data-testid="war-none" className="text-sm opacity-70">
          Nevedeš žádnou válku.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {wars.map((war) => (
            <li
              key={war.warId}
              data-testid="war-row"
              data-house-id={war.other.houseId}
              className="flex flex-col rounded-sm border border-[#5c4526] bg-[#15100b] px-2 py-1 text-sm"
            >
              <span className="font-semibold">{war.other.lordName ?? 'Rod bez jména'}</span>
              <span className="text-xs opacity-80">
                Od {formatGameDate(dateOfDayIndex(war.startedDay))} –{' '}
                {war.how === 'declared' ? 'opověď' : 'přepadení bez opovědi'} – válčí se
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
