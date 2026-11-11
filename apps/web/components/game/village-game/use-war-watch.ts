'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GridCell, WorldClock } from '@bohemia/game';
import {
  chooseSurrendered,
  commandLeader,
  getArmyPanel,
  getMyCampaigns,
  launchArmyCampaign,
  orderBreakout,
  planArmyCampaign,
  presence,
  setGroupOrder,
} from '@/app/game/actions';
import type { ArmyActions, SceneWatch } from '@/hooks/use-army';
import { useWarScene } from '@/hooks/use-war-scene';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { breakoutOf, sceneWarOf, type WatchedMap } from '@/lib/war-scene-view';
import { CONNECTION_FAILED } from './village-data';

export interface WarWatch {
  /** Rozkaz „Probít se“ – tlačítko jen u boje u vsi s opevněním s branou (rozhodl server). */
  breakout: ReturnType<typeof breakoutOf>;
  orderDefenderBreakout: () => Promise<string | null>;
  /** Sledovaná cizí mapa (null – scéna vlastní vsi). */
  watching: WatchedMap | null;
  /** Zpět na vlastní ves. */
  backHome: () => void;
  /** Volání serveru pro panel Vojsko a mapu tažení (`ArmyActionsContext`). */
  armyActions: ArmyActions;
}

/**
 * Válka ve scéně a vojsko (war.md – Ve scéně – napojení na hru, cizí mapa; web-ui.md – Panel
 * Vojsko): boje a vojska na mapě sídla kreslí scéna (co je vidět, rozhodl server – mlha války),
 * rozkaz „Probít se“ obráncům za hradbou a sledování cizí mapy z mapy tažení.
 */
export function useWarWatch({
  scene,
  settlementId,
  gameOver,
  world,
  homeCell,
  villageId,
}: {
  scene: LandscapeScene | null;
  settlementId: string;
  gameOver: boolean;
  world: WorldClock;
  homeCell: GridCell | null;
  /** Zobrazená ves (rozkaz „Probít se“). */
  villageId: string | null;
}): WarWatch {
  // Válka na mapě sídla ve scéně (war.md – Ve scéně – napojení na hru): napadená ves i vlastní
  // vojsko na mapě; co je vidět, rozhodl server (mlha války), scéna jen kreslí.
  const warScene = useWarScene(`/api/war-scene/${settlementId}`, scene !== null && !gameOver);
  useEffect(() => {
    scene?.setWar(sceneWarOf(warScene ?? null, world));
  }, [scene, warScene, world]);
  // Rozkaz „Probít se“ obráncům za hradbou (fortifications.md – Obrana bez násobku 3): tlačítko
  // jen u boje u vsi s opevněním s branou; jde-li, rozhodl server
  const breakout = breakoutOf(warScene);
  const orderDefenderBreakout = useCallback(async (): Promise<string | null> => {
    if (villageId === null) return CONNECTION_FAILED;
    try {
      const result = await orderBreakout({ villageId });
      return 'error' in result ? result.error : null;
    } catch {
      return CONNECTION_FAILED;
    }
  }, [villageId]);
  // Cizí mapa ve scéně (war.md – Ve scéně – cizí mapa): z mapy tažení se scéna přepne na mapu, na
  // které vojsko stojí – jen pohled; scéna a rozhraní vlastní vsi mezitím neběží
  const [watching, setWatching] = useState<WatchedMap | null>(null);
  const backHome = useCallback((): void => setWatching(null), []);
  const sceneWatch = useMemo<SceneWatch>(
    () => ({ home: homeCell, watching, watch: setWatching, back: backHome }),
    [homeCell, watching, backHome],
  );
  const armyActions = useMemo<ArmyActions>(
    () => ({
      load: (input) => getArmyPanel(input),
      plan: (plan) => planArmyCampaign({ plan }),
      launch: (plan) => launchArmyCampaign({ plan }),
      campaigns: () => getMyCampaigns(),
      campaign: {
        lead: (input) => commandLeader(input),
        order: (input) => setGroupOrder(input),
        surrendered: (input) => chooseSurrendered(input),
        presence: (campaignId) => presence({ campaignId }),
      },
      scene: sceneWatch,
    }),
    [sceneWatch],
  );
  return { breakout, orderDefenderBreakout, watching, backHome, armyActions };
}
