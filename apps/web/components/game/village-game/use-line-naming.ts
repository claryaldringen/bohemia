'use client';

import { useRef, useState, type RefObject } from 'react';
import { nameLineMan } from '@/app/game/actions';
import { rememberLordName } from '@/lib/lord-name-memory';
import { newcomerUndecided, type NewcomerStatusView } from '@/lib/newcomer-view';
import { lineNameNotice } from '@/lib/village-notices';
import type { VillageView } from '@/lib/village-view';
import { CONNECTION_FAILED, type VillageData } from './village-data';

type Unnamed = NonNullable<VillageView['dynasty']>['unnamed'][number];

export interface LineNaming {
  /** Bez vsi (po připravení scény) hráč nejdřív pojmenuje vojvodu – ves se zatím nezakládá. */
  foundingName: boolean;
  /** Jméno vojvody pro založení vsi – čte se až při odeslání první zemnice. */
  founderNameRef: RefObject<string | null>;
  /** Odříznutý nováček bez rozhodnutí volí cestu dřív než jméno vojvody. */
  newcomerChoice: boolean;
  /** Připnutý řádek „muž rodu bez jména“ (null – žádný). */
  lineNotice: ReturnType<typeof lineNameNotice>;
  /** Muž rodu, kterého panel jména právě pojmenovává. */
  namingTarget: Unnamed | undefined;
  /** Otevře panel jména muže rodu (klik na připnutý řádek). */
  openLineName: (personId: number) => void;
  confirmFounderName: (name: string) => Promise<string | null>;
  confirmLineName: (personId: number, lord: boolean, name: string) => Promise<string | null>;
  closeLineName: () => void;
}

/**
 * Jména rodu (lord.md – Kde se jméno zadává; web-ui.md – Jména rodu). Bez vsi hráč nejdřív
 * pojmenuje vojvodu – jméno odejde na server se založením vsi (zavře-li stránku dřív, panel se
 * ukáže znovu). Ve vsi čeká muž rodu bez jména: vojvoda (převod, výprava) panel otevře sám, syn
 * jen upozorněním.
 */
export function useLineNaming({
  village,
  view,
  sceneReady,
  gameOver,
  newcomer,
  viewRef,
  runAction,
}: {
  village: VillageData;
  view: VillageView | null;
  sceneReady: boolean;
  gameOver: boolean;
  newcomer: NewcomerStatusView | null;
  viewRef: RefObject<VillageView | null>;
  runAction: (action: () => Promise<VillageData>) => Promise<string | null>;
}): LineNaming {
  const [founderName, setFounderName] = useState<string | null>(null);
  const founderNameRef = useRef<string | null>(null);
  const [namingId, setNamingId] = useState<number | null>(null);
  const [dismissedLord, setDismissedLord] = useState<string | null>(null);
  const foundingName = village === null && founderName === null && sceneReady;
  // Odříznutý nováček bez rozhodnutí volí cestu (newcomers.md – Rozhraní) dřív než jméno vojvody
  const newcomerChoice = !gameOver && newcomerUndecided(newcomer);
  const lineNotice = gameOver ? null : lineNameNotice(view);
  const unnamed = view?.dynasty?.unnamed ?? [];
  const unnamedLord = unnamed[0]?.lord ? unnamed[0] : undefined;
  const lordKey = view && unnamedLord ? `${view.id}:${unnamedLord.id}` : null;
  const namingTarget = gameOver
    ? undefined
    : (unnamed.find((u) => u.id === namingId) ??
      (lordKey !== null && dismissedLord !== lordKey ? unnamedLord : undefined));

  /** Jméno vojvody před založením vsi – odejde se založením (první zemnice). */
  const confirmFounderName = (name: string): Promise<string | null> => {
    founderNameRef.current = name;
    setFounderName(name);
    rememberLordName(name);
    return Promise.resolve(null);
  };

  /** Hráč pojmenuje muže rodu ve vsi (server ověří a jméno uloží natrvalo). */
  const confirmLineName = (
    personId: number,
    lord: boolean,
    name: string,
  ): Promise<string | null> => {
    const villageId = viewRef.current?.id;
    if (!villageId) return Promise.resolve(CONNECTION_FAILED);
    return runAction(() => nameLineMan({ villageId, personId, name })).then((failure) => {
      if (failure === null) {
        setNamingId(null);
        if (lord) rememberLordName(name);
      }
      return failure;
    });
  };

  /** Zavře panel jména – vojvoda bez jména se sám znovu nenabídne, čeká upozornění. */
  const closeLineName = (): void => {
    setNamingId(null);
    if (lordKey !== null) setDismissedLord(lordKey);
  };

  return {
    foundingName,
    founderNameRef,
    newcomerChoice,
    lineNotice,
    namingTarget,
    openLineName: setNamingId,
    confirmFounderName,
    confirmLineName,
    closeLineName,
  };
}
