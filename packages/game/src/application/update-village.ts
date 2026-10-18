import { obstaclesOf, type Landscape, type ObstacleLayer } from '../domain/landscape';
import {
  advanceVillage,
  isVillageExtinct,
  withForestDistances,
  withObstacleClearing,
  withPlots,
  withoutBuiltOverRuins,
  type VillageState,
} from '../domain/village';
import type { VillageRecord, VillageRepository, VillageResult } from './villages';

/** Kolikrát se akce zkusí znovu, když ves mezitím uložil jiný požadavek. */
const MAX_ATTEMPTS = 5;

export const NO_VILLAGE = 'Ves ještě není založená.';
/** Ves vymřela – žádná akce v ní nejde (population.md – Hlad a vymření). */
export const VILLAGE_EXTINCT = 'Ves vymřela – nikdo v ní nežije.';

/** Změna stavu vsi – nový stav, nebo důvod odmítnutí. */
export type VillageChange = { ok: true; state: VillageState } | { ok: false; reason: string };

/**
 * Ves dopočítaná do dneška (už dopočítanou ani „budoucí“ nevrací zpět). `obstacles` = vrstva
 * překážek krajiny sídla – přestavby podle ní kácí stromy (forest.md); `landscape` = krajina
 * sídla – přestavba polozemnice bez pozemku ji postaví na volném políčku.
 */
export function advancedToToday(
  state: VillageState,
  today: number,
  obstacles: ObstacleLayer,
  landscape: Landscape | null = null,
): VillageState {
  return state.lastDay >= today ? state : advanceVillage(state, today, obstacles, landscape);
}

/**
 * Načte ves, dopočítá ji do dneška, provede změnu a uloží s kontrolou verze. Při souběhu
 * (verze nesouhlasí) to zkusí znovu nad čerstvým stavem. Nezměněný stav se neukládá.
 * Vsi z doby před vrstvou překážek nejdřív doplní odstraněné překážky (`withObstacleClearing`)
 * a obydlím z doby před palivem vzdálenost k lesu (`withForestDistances`), polozemnicím z doby
 * před pozemky pozemek (`withPlots`) – před dopočtem, aby se s nimi už počítalo; pak se uloží.
 * Ves se dopočítává s vrstvou překážek a krajinou sídla (přestavby kácí stromy, polozemnice bez
 * pozemku se přestaví na volném políčku). Zbytky jam po zaniklých obydlích pod novou stavbou po
 * změně zmizí (`withoutBuiltOverRuins`).
 */
export async function updateVillage(
  villages: VillageRepository,
  settlementId: string,
  today: number,
  landscape: Landscape,
  change: (state: VillageState) => VillageChange,
): Promise<VillageResult> {
  const obstacles = obstaclesOf(landscape);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const record = await villages.find(settlementId);
    if (record === null) return { ok: false, reason: NO_VILLAGE };
    const migrated = withPlots(
      withForestDistances(withObstacleClearing(record.state, obstacles), landscape),
      landscape,
      obstacles,
    );
    const current = advancedToToday(migrated, today, obstacles, landscape);
    const changed = change(current);
    if (!changed.ok) return changed;
    // na místo zříceniny jde stavět – stavba zbytek jámy odstraní (ruins.ts)
    const next = withoutBuiltOverRuins(changed.state, landscape);
    if (next === record.state) return { ok: true, village: record };
    const saved: VillageRecord | null = await villages.save(settlementId, next, record.version);
    if (saved !== null) return { ok: true, village: saved };
  }
  throw new Error(`Ves sídla ${settlementId} se nepodařilo uložit – příliš mnoho souběžných změn.`);
}

/**
 * Jako `updateVillage`, ale jen pro žijící ves – akce hráče ve vymřelé vsi (dopočítané do dneška)
 * odmítne s `VILLAGE_EXTINCT`.
 */
export function updateLivingVillage(
  villages: VillageRepository,
  settlementId: string,
  today: number,
  landscape: Landscape,
  change: (state: VillageState) => VillageChange,
): Promise<VillageResult> {
  return updateVillage(villages, settlementId, today, landscape, (state) =>
    isVillageExtinct(state) ? { ok: false, reason: VILLAGE_EXTINCT } : change(state),
  );
}
