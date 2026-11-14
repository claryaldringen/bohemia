'use client';

import { useRef, useState, type RefObject } from 'react';
import type { TimeSkip } from '@bohemia/game';
import { forceDevDisaster, skipTime } from '@/app/game/actions';
import type { VillageView } from '@/lib/village-view';
import type { NoticeLine } from '../hud/NoticeLines';
import type { DevDisasterChoice } from '../hud/DevMenu';
import type { VillageData } from './village-data';

export interface DevControls {
  /** Přeskok času, na který se čeká (šipky v liště čekají); null – žádný. */
  skipping: TimeSkip | null;
  skipTimeBy: (skip: TimeSkip) => void;
  /** Čeká se na vynucenou pohromu. */
  forcingDisaster: boolean;
  forceDisasterChoice: (choice: DevDisasterChoice) => void;
}

/**
 * Vývojový režim (accounts.md – Dev mód a skok v čase; disasters.md – plán P10): šipky
 * přeskočení času vedle data a vynucení zlého roku nebo zítřejší pohromy. Server posune čas
 * hráče a vrátí ves v novém dni – hodiny v liště a ve scéně se posunou s ní.
 */
export function useDevControls({
  viewRef,
  runAction,
  pushNotice,
  setTimeOffsetDays,
}: {
  viewRef: RefObject<VillageView | null>;
  runAction: (action: () => Promise<VillageData>) => Promise<string | null>;
  pushNotice: (notice: Omit<NoticeLine, 'id'>) => void;
  setTimeOffsetDays: (days: number) => void;
}): DevControls {
  const [skipping, setSkipping] = useState<TimeSkip | null>(null);
  const [forcingDisaster, setForcingDisaster] = useState(false);

  /** Vývojový režim: vynutí letošní zlý rok, nebo zítřejší pohromu (disasters.md – plán P10). */
  const forceDisasterChoice = (choice: DevDisasterChoice): void => {
    const villageId = viewRef.current?.id;
    if (!villageId || forcingDisaster) return;
    setForcingDisaster(true);
    void runAction(() => forceDevDisaster({ villageId, ...choice })).then((failure) => {
      setForcingDisaster(false);
      if (failure !== null) pushNotice({ kind: 'error', tone: 'error', text: failure });
    });
  };

  /**
   * Vývojový režim: přeskočí čas o měsíc, nebo rok. Server posune čas hráče a vrátí ves
   * v novém dni – hodiny v liště a ve scéně se posunou s ní. Dokud se čeká, šipky čekají.
   */
  const skippingRef = useRef(false);
  const skipTimeBy = (skip: TimeSkip): void => {
    // ref: dvojklik dřív, než se tlačítka překreslí jako zamčená, nepřeskočí dvakrát
    if (skippingRef.current) return;
    skippingRef.current = true;
    setSkipping(skip);
    void runAction(async () => {
      const result = await skipTime({ skip, villageId: viewRef.current?.id ?? null });
      if ('error' in result) return result;
      setTimeOffsetDays(result.timeOffsetDays);
      return result.village;
    }).then((failure) => {
      skippingRef.current = false;
      setSkipping(null);
      if (failure !== null) pushNotice({ kind: 'error', tone: 'error', text: failure });
    });
  };

  return { skipping, skipTimeBy, forcingDisaster, forceDisasterChoice };
}
