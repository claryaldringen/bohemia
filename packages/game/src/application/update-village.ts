import { obstaclesOf, type Landscape, type ObstacleLayer } from '../domain/landscape';
import {
  advanceVillage,
  advanceVillageSteps,
  isVillageAbandoned,
  isVillageExtinct,
  isVillageTravelling,
  neighbourSnapshot,
  withNeighbours,
  withoutNeighbours,
  type NeighbourSnapshot,
  withForestDistances,
  withKinship,
  withLivestockLand,
  withManor,
  withMergedFields,
  withJoinedRoads,
  withMergedRoads,
  withRoadSwaths,
  withObstacleClearing,
  withPlots,
  withoutBuiltOverRuins,
  withoutForeignGoods,
  type VillageState,
} from '../domain/village';
import type { Pause, VillageRecord, VillageRepository, VillageResult } from './villages';

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
 * Jako `advancedToToday`, ale s přestávkami (`pause`) mezi dny – dlouhý dopočet (hráč dlouho
 * nehrál, přeskok času) neblokuje server. Stejný výsledek jako bez přestávek.
 */
async function advancedToTodayWithPauses(
  state: VillageState,
  today: number,
  obstacles: ObstacleLayer,
  landscape: Landscape,
  pause: Pause | undefined,
): Promise<VillageState> {
  if (!pause || state.lastDay >= today) {
    return advancedToToday(state, today, obstacles, landscape);
  }
  const steps = advanceVillageSteps(state, today, obstacles, landscape);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
    const wait = pause();
    if (wait) await wait;
  }
}

/**
 * Načte ves, dopočítá ji do dneška, provede změnu a uloží s kontrolou verze. Při souběhu
 * (verze nesouhlasí) to zkusí znovu nad čerstvým stavem. Nezměněný stav se neukládá.
 * Vsi z doby před vrstvou překážek nejdřív doplní odstraněné překážky (`withObstacleClearing`)
 * a obydlím z doby před palivem vzdálenost k lesu (`withForestDistances`), polozemnicím z doby
 * před pozemky pozemek (`withPlots`), stará navazující pole se sloučí (`withMergedFields`) a vsím
 * z doby před dobytkem se doplní výchozí stádo a louka a les pro pastvu (`withLivestockLand`)
 * a pevné cesty z doby před slučováním úseků se spojí ve falešných rozcestích (`withMergedRoads`)
 * a zacelí se díry mezi nimi (`withJoinedRoads`), hotové upravené cesty a stezky lesem dostanou
 * průsek (`withRoadSwaths`) a lidem z doby před příbuzenstvím se doplní
 * pohlaví a manželé (`withKinship`) a ves přijde o zboží zvenku, které obchod už nezná
 * (`withoutForeignGoods`) – před dopočtem, aby se s nimi už počítalo; pak se uloží.
 * Ves se dopočítává s vrstvou překážek a krajinou sídla (přestavby kácí stromy, polozemnice bez
 * pozemku se přestaví na volném políčku). Zbytky jam po zaniklých obydlích pod novou stavbou po
 * změně zmizí (`withoutBuiltOverRuins`). S `pause` dělá dopočet mezi dny přestávky.
 */
export async function updateVillage(
  villages: VillageRepository,
  villageId: string,
  today: number,
  landscape: Landscape,
  change: (state: VillageState) => VillageChange,
  pause?: Pause,
): Promise<VillageResult> {
  const obstacles = obstaclesOf(landscape);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const record = await villages.find(villageId);
    if (record === null) return { ok: false, reason: NO_VILLAGE };
    const migrated = withoutForeignGoods(
      withKinship(
        // hotové upravené cesty a stezky lesem dostanou průsek (roads.md – Průsek lesem)
        withRoadSwaths(
          withJoinedRoads(
            withMergedRoads(
              withLivestockLand(
                withMergedFields(
                  withPlots(
                    withForestDistances(withObstacleClearing(record.state, obstacles), landscape),
                    landscape,
                    obstacles,
                  ),
                ),
                landscape,
              ),
            ),
            landscape,
            obstacles,
          ),
          obstacles,
          landscape,
        ),
      ),
    );
    // dvorec vojvody – starší ves ho dostane (nejstarší obydlí, trade.md)
    const base = withManor(migrated);
    // jiné vsi na téže mapě – kontroly umístění a kácení o nich vědí (migration.md); přehled se
    // neukládá
    const attached = withNeighbours(base, await neighboursOf(villages, record, today));
    const current = await advancedToTodayWithPauses(attached, today, obstacles, landscape, pause);
    const changed = change(current);
    if (!changed.ok) return changed;
    // na místo zříceniny jde stavět – stavba zbytek jámy odstraní (ruins.ts)
    const stripped = withoutNeighbours(changed.state);
    const next = withoutBuiltOverRuins(stripped, landscape);
    const untouched = changed.state === attached && base === record.state && next === stripped;
    if (next === record.state || untouched) return { ok: true, village: record };
    const saved: VillageRecord | null = await villages.save(villageId, next, record.version);
    if (saved !== null) return { ok: true, village: saved };
  }
  throw new Error(`Ves ${villageId} se nepodařilo uložit – příliš mnoho souběžných změn.`);
}

/**
 * Přehled ostatních vsí na mapě (sídle) vsi `record` v den `today`, nebo null, když je na mapě
 * sama. Ostatní vsi se načtou jen tehdy, když na mapě nějaké jsou (levný otisk napřed).
 */
async function neighboursOf(
  villages: VillageRepository,
  record: VillageRecord,
  today: number,
): Promise<NeighbourSnapshot | null> {
  const stamps = await villages.stampsOf([record.settlementId]);
  if (!stamps.some((s) => s.id !== record.id && s.settlementId === record.settlementId)) {
    return null;
  }
  const others = (await villages.listBySettlement(record.settlementId)).filter(
    (v) => v.id !== record.id,
  );
  return neighbourSnapshot(
    others.map((v) => v.state),
    today,
  );
}

/** Ves je opuštěná – odešli z ní všichni (migration.md). */
export const VILLAGE_ABANDONED = 'Ves je opuštěná – nikdo v ní nežije.';
/** Lidé jsou na cestě na novou mapu – ves ještě nestojí (migration.md – fáze 4). */
export const VILLAGE_TRAVELLING = 'Lidé jsou ještě na cestě – ves zatím nestojí.';

/**
 * Jako `updateVillage`, ale jen pro žijící ves – akce hráče ve vymřelé vsi (dopočítané do dneška)
 * odmítne s `VILLAGE_EXTINCT`.
 */
export function updateLivingVillage(
  villages: VillageRepository,
  villageId: string,
  today: number,
  landscape: Landscape,
  change: (state: VillageState) => VillageChange,
): Promise<VillageResult> {
  return updateVillage(villages, villageId, today, landscape, (state) => {
    if (isVillageExtinct(state)) return { ok: false, reason: VILLAGE_EXTINCT };
    if (isVillageAbandoned(state)) return { ok: false, reason: VILLAGE_ABANDONED };
    if (isVillageTravelling(state)) return { ok: false, reason: VILLAGE_TRAVELLING };
    return change(state);
  });
}
