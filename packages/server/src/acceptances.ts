import {
  giveEscheatPart,
  loadVillage,
  ransomHooks,
  settlementLandscape,
  type AcceptanceDeps,
  type ShipmentDeps,
  type VillageRecord,
} from '@bohemia/game';
import type { GameDeps } from './deps';

// Závislosti účinků přijatého jednání (audit A2 – M7) na jednom místě pro oba vstupní body: web je
// použije při přijetí, worker pro schránky, po kterých web spadl. Dřív je worker skládal ručně
// a chybějící člen účinek tiše přeskočil.

/** Zásilky mezi vsemi (pomoc, výkupné, Odvody) – repozitáře, zámek hráče procesu a skutečný čas. */
export function shipmentDepsOf(deps: GameDeps): ShipmentDeps {
  return {
    shipments: deps.shipments,
    villages: deps.villages,
    settlements: deps.settlements,
    locks: deps.locks,
    now: deps.now,
  };
}

/** Dopočet vsi do dneška (uloží ji) – odesílající ves zásilky; null, když ves nebo sídlo chybí. */
export function prepareVillageOf(
  deps: GameDeps,
): (villageId: string, today: number) => Promise<VillageRecord | null> {
  return async (villageId, today) => {
    const village = await deps.villages.find(villageId);
    const settlement = village ? await deps.settlements.find(village.settlementId) : null;
    if (!village || !settlement) return null;
    return loadVillage(
      { villages: deps.villages, pause: deps.pause },
      { villageId, today, landscape: settlementLandscape(settlement, deps.landscapes) },
    );
  };
}

/**
 * Závislosti přijetí jednání a jeho schránky účinků (`acceptNegotiation`,
 * `deliverPendingAcceptances`): všechny členy, které účinky potřebují (`ACCEPTANCE_EFFECT_DEPS`),
 * jsou povinné – pomoc, dialogy obchodu a poplatku, dar odúmrti, postoupení a výkupné.
 */
export function acceptanceDeps(deps: GameDeps): AcceptanceDeps {
  const shipments = shipmentDepsOf(deps);
  const prepareVillage = prepareVillageOf(deps);
  return {
    houses: deps.houses,
    negotiations: deps.negotiations,
    villages: deps.villages,
    worldDirectory: deps.worldDirectory,
    worldSeed: deps.worldSeed,
    dialogs: deps.dialogs,
    cede: deps.cede,
    aid: { shipments, prepareVillage, loans: deps.loans },
    escheatGift: (input) =>
      giveEscheatPart(
        {
          houses: deps.houses,
          vassalages: deps.vassalages,
          loans: deps.loans,
          dialogs: deps.dialogs,
          locks: deps.locks,
          settlements: deps.settlements,
          villages: deps.villages,
        },
        input,
      ),
    ransom: ransomHooks({
      prisoners: deps.prisoners,
      villages: deps.villages,
      settlements: deps.settlements,
      locks: deps.locks,
      now: deps.now,
      houses: deps.houses,
      shipments,
      prepareVillage,
    }),
  };
}
