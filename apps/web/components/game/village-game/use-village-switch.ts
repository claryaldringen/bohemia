'use client';

import { useEffect, useState, type RefObject } from 'react';
import { selectVillage } from '@/app/game/actions';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import type { VillageTarget } from '@/lib/scene/village-picking';
import { rememberVillage } from '@/lib/village-choice';
import type { VillageListItem } from '@/lib/village-list';
import type { VillageView } from '@/lib/village-view';
import type { NoticeLine } from '../hud/NoticeLines';
import type { VillageData } from './village-data';

/**
 * Přepínání vsí hráče (migration.md; web-ui.md – přepínač vsí v liště): ves na téže mapě se
 * načte na místě a pohled skočí na ni, ves na jiné mapě se načte novým načtením stránky. Klik na
 * upozornění varování (`openAlarm` – ref pro upozornění) vybere dvorec té vsi – jiná ves rodu se
 * napřed přepne a dvorec se vybere, až se načte.
 */
export function useVillageSwitch({
  scene,
  view,
  viewRef,
  settlementId,
  runAction,
  pushNotice,
  cancelPlacement,
  setSelected,
  openAlarm,
}: {
  scene: LandscapeScene | null;
  view: VillageView | null;
  viewRef: RefObject<VillageView | null>;
  settlementId: string;
  runAction: (action: () => Promise<VillageData>) => Promise<string | null>;
  pushNotice: (notice: Omit<NoticeLine, 'id'>) => void;
  cancelPlacement: () => void;
  setSelected: (target: VillageTarget | null) => void;
  openAlarm: RefObject<(villageId: string) => void>;
}): (village: VillageListItem) => void {
  /**
   * Přepne na jinou ves hráče (přepínač v liště) a zapamatuje ji (cookie). Ves na téže mapě se
   * načte na místě a pohled skočí na ni; ves na jiné mapě má jinou krajinu – stránka se načte
   * znovu (server ověří, že ves patří hráči).
   */
  const switchVillage = (village: VillageListItem): void => {
    const shown = viewRef.current;
    if (!shown || village.id === shown.id) return;
    cancelPlacement();
    setSelected(null);
    if (village.settlementId !== settlementId) {
      rememberVillage(village.id);
      window.location.reload();
      return;
    }
    void runAction(() => selectVillage({ villageId: village.id })).then((failure) => {
      if (failure !== null) {
        pushNotice({ kind: 'error', tone: 'error', text: failure });
        return;
      }
      rememberVillage(village.id);
      lookAtVillage();
    });
  };

  /** Pohled na první obydlí (staveniště) právě ukázané vsi – po přepnutí vsi. */
  const lookAtVillage = (): void => {
    const first = viewRef.current?.scene.dwellings[0]?.position;
    if (first) scene?.moveCameraTo(first.x, first.z);
  };

  // Klik na upozornění varování (`alarmNoticeVillage`): vybere dvorec té vsi – jiná ves rodu se
  // napřed přepne a dvorec se vybere, až se načte
  const [alarmPending, setAlarmPending] = useState<string | null>(null);
  useEffect(() => {
    openAlarm.current = (villageId: string): void => {
      const shown = viewRef.current;
      if (!shown) return;
      if (shown.id !== villageId) {
        const target = shown.villages.find((v) => v.id === villageId);
        if (!target) return;
        switchVillage(target);
      }
      setAlarmPending(villageId);
    };
  });
  useEffect(() => {
    if (alarmPending === null || view?.id !== alarmPending) return;
    const manor = view.manor?.dwellingId;
    setAlarmPending(null);
    if (manor === undefined) return;
    cancelPlacement();
    setSelected({ kind: 'dwelling', id: manor });
  }, [alarmPending, view, cancelPlacement, setSelected]);

  return switchVillage;
}
