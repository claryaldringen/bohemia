import {
  isGameOverOf,
  isVillageAsleep,
  lineFacts,
  pendingStewardDepartures,
  type LineFacts,
} from '../domain/village';
import { advanceDynasty, DEPARTURE_ROUNDS } from './advance-dynasty';
import { settlementLandscape } from './enter-game';
import type { PersonRef } from './houses';
import { loadVillage } from './load-village';
import { ensurePlayerLord } from './player-lord';
import { closeDynastyDay, type DynastyDeps, type DynastyInput } from './restart-game';
import { settleStewardDeparturesSafely } from './settle-steward-departures';
import type { Settlement } from './settlements';
import {
  isFullVillage,
  type DynastyVillage,
  type VillageRecord,
  type VillageStamp,
} from './villages';

// Web po workeru (docs/superpowers/plans/2026-10-31-worker.md – 3. Web po workeru): ostatní vsi
// hráče drží worker průběžně dopočtené, web při pohledu a akci dopočte jen zobrazenou ves.

/**
 * Nejvýš o tolik herních dní smí ostatní vsi hráče zaostávat za dneškem, než je web dopočte sám
 * (Martin 31. 10. 2026: „3 herní dny ≈ 4 min“ – plán workeru, Rozhodnutí Martina 2). Není to
 * herní pravidlo (výsledek vsi na kouscích dopočtu nezávisí), jen mez práce serveru – proto ne
 * v `rules*.ts`. Když worker neběží, jsou ostatní vsi do pár minut za mezí a web je dopočte –
 * stejně jako před workerem.
 */
export const WORKER_LAG_DAYS = 3;

/**
 * Ostatní ves (ne zobrazená) je víc než `WORKER_LAG_DAYS` pozadu – web ji dopočte sám (worker
 * neběží, nebo dohání výpadek). Spící ves (vymřelá, opuštěná) se nedopočítává nikdy.
 */
export function lagsBehindWorker(
  stamp: Pick<VillageStamp, 'lastDay' | 'asleep'>,
  today: number,
): boolean {
  return !stamp.asleep && stamp.lastDay < today - WORKER_LAG_DAYS;
}

/**
 * Web dopočte ves do dneška, když je zobrazená, nebo zaostává za workerem (`lagsBehindWorker`).
 * Jedna ves, jedna mapa (Martin 1. 11. 2026) – sousedy na téže mapě dopočítávat netřeba.
 */
export function mustAdvanceNow(
  stamp: Pick<VillageStamp, 'id' | 'lastDay' | 'asleep'>,
  shown: Pick<VillageStamp, 'id'> | undefined,
  today: number,
): boolean {
  return stamp.id === shown?.id || lagsBehindWorker(stamp, today);
}

export interface DynastyForVillageInput extends DynastyInput {
  /** Ves, na kterou se hráč dívá (nebo v ní jedná) – ta se dopočte do dneška vždy. */
  villageId: string;
}

/**
 * Stav rodu pro pohled a akci (`dynastyForVillage`): jako `DynastyStatus`, jen ostatní vsi hráče
 * (jiné mapy, ne pozadu) jsou jen souhrnem (`VillageDigestRecord`). Po konci hry jsou všechny
 * vsi celé (kronika konce rodu potřebuje stavy).
 */
export type DynastyView = (
  | { settlements: Settlement[]; villages: DynastyVillage[]; gameOver: false }
  | { settlements: Settlement[]; villages: VillageRecord[]; gameOver: true }
) & {
  /**
   * Hráčův muž (seniorate.md – Hráčův muž a vlastní ves): ve které vsi a jaká osoba. Chybí bez
   * živého rodu, bez `houses` v závislostech, nebo dokud rod nemá vojvodu k převodu.
   */
  playerLord?: PersonRef;
};

/** Vsi hráče s tím, které z nich web právě dopočetl do dneška. */
interface Collected {
  settlements: Settlement[];
  villages: DynastyVillage[];
  advanced: Set<string>;
}

/**
 * Stav rodu pro pohled a akci na ves `villageId` (plán workeru – 3. Web po workeru): zobrazená ves
 * a každá jiná nespící ves téže mapy nebo víc než `WORKER_LAG_DAYS` pozadu se dopočtou do dneška (a vybaví se
 * jejich odchozí schránky správce – nová ves syna se v přepínači objeví hned), vsi téže mapy se
 * vrátí celé, vsi jiných map jen souhrnem (`digestsOf` – bez přenosu a parsování stavu; ves bez
 * souhrnu se načte celá). Konec hry ze souhrnů pozná `isGameOverOf`; když nastal (nebo vymřel
 * rod), načtou se vsi celé a rozhodne se jako dřív: všechny vsi na dnešku – `closeDynastyDay`,
 * smíšené dny – plný dopočet (`advanceDynasty`), smíšené dny nikdy neukážou falešný konec rodu.
 * Volající drží zámek hráče.
 */
export async function dynastyForVillage(
  deps: DynastyDeps & { worldSeed: number },
  input: DynastyForVillageInput,
): Promise<DynastyView> {
  const view = await dynastyViewOf(deps, input);
  // převod rozehrané hry (hráčův muž) proběhne tady: každý pohled i akce hráče prochází tudy pod
  // jeho zámkem a vsi jsou právě dopočtené a převedené na rod; po převodu je to jeden dotaz na rod
  if (!deps.houses || view.gameOver) return view;
  const playerLord = await ensurePlayerLord(
    { houses: deps.houses, settlements: deps.settlements, villages: deps.villages },
    { playerId: input.playerId, today: input.today },
  );
  return playerLord ? { ...view, playerLord } : view;
}

async function dynastyViewOf(
  deps: DynastyDeps & { worldSeed: number },
  input: DynastyForVillageInput,
): Promise<DynastyView> {
  let collected = await collect(deps, input);
  for (let round = 0; round < DEPARTURE_ROUNDS; round++) {
    let settled = 0;
    for (const village of collected.villages) {
      if (!collected.advanced.has(village.id) || !isFullVillage(village)) continue;
      if (pendingStewardDepartures(village.state).length === 0) continue;
      const founded = await settleStewardDeparturesSafely(deps, {
        playerId: input.playerId,
        villageId: village.id,
      });
      settled += founded.length;
    }
    if (settled === 0) break;
    collected = await collect(deps, input);
  }
  const { settlements, villages } = collected;
  const facts = villages.map(factsOf);
  // rod žije a některá ves žije (`isGameOverOf` zahrnuje vymření rodu) – konec hry nenastal
  // a `closeDynastyDay` by nic neměnil (ruší vsi jen po vymření rodu)
  if (!isGameOverOf(facts)) {
    return { settlements, villages, gameOver: false };
  }
  const full = await fullVillages(deps, villages);
  const today = input.today;
  if (full.every((v) => isVillageAsleep(v.state) || v.state.lastDay >= today)) {
    // všechny vsi na dnešku – konec rodu jako při plném dopočtu
    return asView(await closeDynastyDay(deps, { settlements, villages: full, today }));
  }
  // smíšené dny: konec hry jen po plném dopočtu (v jiné vsi se mezitím mohl narodit chlapec)
  return asView(await advanceDynasty(deps, input));
}

/** Fakta konce rodu z celé vsi i ze souhrnu. */
function factsOf(village: DynastyVillage): LineFacts {
  return isFullVillage(village) ? lineFacts(village.state) : village.digest;
}

/** Vsi se souhrnem načtené celé (konec hry); ves mezitím smazaná vypadne. */
async function fullVillages(
  deps: DynastyDeps,
  villages: readonly DynastyVillage[],
): Promise<VillageRecord[]> {
  const full: VillageRecord[] = [];
  for (const village of villages) {
    const record = isFullVillage(village) ? village : await deps.villages.find(village.id);
    if (record) full.push(record);
  }
  return full;
}

/** Stav rodu z plného dopočtu jako pohled – všechny vsi celé. */
function asView(status: {
  settlements: Settlement[];
  villages: VillageRecord[];
  gameOver: boolean;
}): DynastyView {
  return status.gameOver
    ? { settlements: status.settlements, villages: status.villages, gameOver: true }
    : { settlements: status.settlements, villages: status.villages, gameOver: false };
}

/**
 * Vsi aktivních sídel hráče v pořadí jako `dynastyStatus` (sídelní první, pak podle založení):
 * zobrazená a zaostalé dopočtené do dneška (`loadVillage` – uloží se), ostatní jen souhrnem (bez
 * souhrnu celé – `find`). Bez zobrazené vsi mezi vsemi hráče se vrátí všechny celé (dřívější
 * chování).
 */
async function collect(deps: DynastyDeps, input: DynastyForVillageInput): Promise<Collected> {
  const settlements = await deps.settlements.listActive(input.playerId);
  // otisky bez stavu (levný dotaz) – podle `lastDay` a `asleep` se pozná, co dopočítat
  const stamps = await deps.villages.stampsOf(settlements.map((s) => s.id));
  const shown = stamps.find((v) => v.id === input.villageId);
  const brief = (stamp: VillageStamp): boolean =>
    shown !== undefined && !mustAdvanceNow(stamp, shown, input.today);
  const briefIds = stamps.filter(brief).map((s) => s.id);
  const digests = new Map(
    (briefIds.length > 0 ? await deps.villages.digestsOf(briefIds) : []).map((d) => [d.id, d]),
  );
  const villages: DynastyVillage[] = [];
  const advanced = new Set<string>();
  for (const settlement of settlements) {
    const landscape = settlementLandscape(settlement, deps.landscapes);
    for (const stamp of stamps.filter((v) => v.settlementId === settlement.id)) {
      const advance = mustAdvanceNow(stamp, shown, input.today);
      const village = advance
        ? await loadVillage(deps, { villageId: stamp.id, today: input.today, landscape })
        : (digests.get(stamp.id) ?? (await deps.villages.find(stamp.id)));
      if (!village) continue;
      villages.push(village);
      if (advance) advanced.add(village.id);
    }
  }
  return { settlements, villages, advanced };
}
