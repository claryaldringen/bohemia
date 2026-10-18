import type { Landscape } from '../domain/landscape';
import { isGameOver, isVillageExtinct } from '../domain/village';
import { enterGame, settlementLandscape } from './enter-game';
import { loadVillage } from './load-village';
import type { LandscapeSource, SeedSource, Settlement, SettlementRepository } from './settlements';
import type { VillageRecord, VillageRepository } from './villages';

// Konec hry a nový začátek (population.md – Hlad a vymření; Martin, 18. 10. 2026: „když hráči
// vymřou všechny vesnice, tak pro něj hra končí – musí začínat znovu“).

export interface DynastyDeps {
  settlements: SettlementRepository;
  villages: VillageRepository;
  /** Krajina uloženého sídla – bez ní se pokaždé vygeneruje znovu. */
  landscapes?: LandscapeSource;
}

export interface DynastyInput {
  playerId: string;
  /** Dnešní herní den (index dne). */
  today: number;
}

/** Vsi hráče dopočítané do dneška a jestli pro něj hra skončila. */
export interface DynastyStatus {
  /** Aktivní sídla hráče. */
  settlements: Settlement[];
  /** Vsi aktivních sídel (sídla bez vsi chybí), dopočítané do dneška. */
  villages: VillageRecord[];
  /** Hráč má vsi a žádná nežije. */
  gameOver: boolean;
}

/**
 * Stav rodu hráče: všechny vsi jeho aktivních sídel dopočítané do dneška (dopočet se uloží –
 * ves mohla mezitím vymřít). Obecně pro víc vsí; dnes má hráč jedno sídlo s jednou vsí.
 */
export async function dynastyStatus(
  deps: DynastyDeps,
  input: DynastyInput,
): Promise<DynastyStatus> {
  const settlements = await deps.settlements.listActive(input.playerId);
  const villages: VillageRecord[] = [];
  for (const settlement of settlements) {
    const village = await loadVillage(deps, {
      settlementId: settlement.id,
      today: input.today,
      landscape: settlementLandscape(settlement, deps.landscapes),
    });
    if (village) villages.push(village);
  }
  return { settlements, villages, gameOver: isGameOver(villages.map((v) => v.state)) };
}

/** Rod ještě žije – hráč má živou ves, hra nekončí. */
export const DYNASTY_ALIVE = 'Rod ještě žije – hra pokračuje.';

export interface RestartGameInput extends DynastyInput {
  /**
   * Začít znovu i se živou vsí (nabídka hry – Martin, 18. 10. 2026): ves i rod zaniknou.
   * Bez něj jen po konci hry (obrazovka porážky).
   */
  abandon?: boolean;
}

export type RestartGameResult =
  { ok: true; settlement: Settlement; landscape: Landscape } | { ok: false; reason: string };

/**
 * Začít znovu: aktivní sídla hráče i se vsí jdou do archivu a vznikne nové sídelní sídlo
 * s novým seedem krajiny – pak hráč zakládá ves jako nový (první zemnice). Bez `abandon` jen po
 * konci hry (vymřely všechny vsi), živá ves restart odmítne; s `abandon` (hráč to potvrdil
 * v nabídce) se archivují i živé vsi. Když hráč ještě žádnou ves nemá (ani vymřelou – třeba
 * druhý souběžný nebo opakovaný restart už proběhl), vrátí jeho sídlo beze změny.
 */
export async function restartGame(
  deps: DynastyDeps & { seeds: SeedSource },
  input: RestartGameInput,
): Promise<RestartGameResult> {
  const status = await dynastyStatus(deps, input);
  if (!input.abandon && status.villages.some((v) => !isVillageExtinct(v.state))) {
    return { ok: false, reason: DYNASTY_ALIVE };
  }
  // bez abandon sem dojde jen hráč, jehož vsi všechny vymřely (konec hry)
  if (status.villages.length > 0) {
    for (const settlement of status.settlements) await deps.settlements.archive(settlement.id);
  }
  const { settlement, landscape } = await enterGame(deps, input.playerId);
  return { ok: true, settlement, landscape };
}
