'use client';

import { useMemo } from 'react';
import { commandAlarm, returnFromRefuge } from '@/app/game/actions';
import { useAlarm } from '@/hooks/use-alarm';
import type { VillageTarget } from '@/lib/scene/village-picking';
import type { VillageView } from '@/lib/village-view';
import type { AlarmActions } from '../hud/AlarmButtons';
import type { NoticeLine } from '../hud/NoticeLines';
import { CONNECTION_FAILED } from './village-data';

/**
 * Varování a útěk v panelu dvorce (war.md – Varování, poslové a útěk do hradiště; plán
 * 2026-11-09 – Úloha 13): pohled se načítá, jen když je panel dvorce otevřený (vybrané obydlí
 * dvorce). Chyba příkazu se ukáže řádkem nahoře i u kurzoru, pak se pohled zeptá hned znovu.
 */
export function useAlarmActions({
  view,
  selected,
  pushNotice,
}: {
  view: VillageView | null;
  selected: VillageTarget | null;
  pushNotice: (notice: Omit<NoticeLine, 'id'>) => void;
}): AlarmActions {
  const manorDwellingId = view?.manor?.dwellingId ?? null;
  const alarmVillageId =
    selected?.kind === 'dwelling' && selected.id === manorDwellingId ? (view?.id ?? null) : null;
  const alarm = useAlarm(alarmVillageId);
  const refreshAlarm = alarm.refresh;
  return useMemo<AlarmActions>(() => {
    // odpověď akce: chyba se ukáže řádkem nahoře i u kurzoru; pak se pohled zeptá hned znovu
    const answer = async (
      order: () => Promise<{ ok: true } | { error: string }>,
    ): Promise<string | null> => {
      let failure: string | null;
      try {
        const result = await order();
        failure = 'error' in result ? result.error : null;
      } catch {
        failure = CONNECTION_FAILED;
      }
      if (failure !== null) pushNotice({ kind: 'error', tone: 'error', text: failure });
      refreshAlarm();
      return failure;
    };
    return {
      view: alarm.view,
      onCommand: (command) =>
        alarmVillageId === null
          ? Promise.resolve(null)
          : answer(() => commandAlarm({ villageId: alarmVillageId, command })),
      onReturn: () =>
        alarmVillageId === null
          ? Promise.resolve(null)
          : answer(() => returnFromRefuge({ villageId: alarmVillageId })),
    };
  }, [alarm.view, alarmVillageId, refreshAlarm, pushNotice]);
}
