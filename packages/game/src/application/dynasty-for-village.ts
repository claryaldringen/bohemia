import { isGameOver, isVillageAsleep, pendingStewardDepartures } from '../domain/village';
import { advanceDynasty, DEPARTURE_ROUNDS } from './advance-dynasty';
import { settlementLandscape } from './enter-game';
import { loadVillage } from './load-village';
import {
  closeDynastyDay,
  type DynastyDeps,
  type DynastyInput,
  type DynastyStatus,
} from './restart-game';
import { settleStewardDeparturesSafely } from './settle-steward-departures';
import type { SeedSource, Settlement } from './settlements';
import type { VillageRecord, VillageStamp } from './villages';

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

export interface DynastyForVillageInput extends DynastyInput {
  /** Ves, na kterou se hráč dívá (nebo v ní jedná) – ta se dopočte do dneška vždy. */
  villageId: string;
}

/** Vsi hráče s tím, které z nich web právě dopočetl do dneška. */
interface Collected {
  settlements: Settlement[];
  villages: VillageRecord[];
  advanced: Set<string>;
}

/**
 * Stav rodu pro pohled a akci na ves `villageId` (plán workeru – 3. Web po workeru): zobrazená ves
 * a každá jiná nespící ves víc než `WORKER_LAG_DAYS` pozadu se dopočtou do dneška (a vybaví se
 * jejich odchozí schránky správce – nová ves syna se v přepínači objeví hned), ostatní vsi se
 * vrátí, jak jsou uložené. Konec hry ze vsí dopočtených do různých dnů se ověří plným dopočtem
 * (`advanceDynasty`) – smíšené dny nikdy neukážou falešný konec rodu. Vrací `DynastyStatus` jako
 * `advanceDynasty`; když jsou všechny vsi na dnešku, je výsledek týž. Volající drží zámek hráče.
 */
export async function dynastyForVillage(
  deps: DynastyDeps & { seeds: SeedSource },
  input: DynastyForVillageInput,
): Promise<DynastyStatus> {
  let collected = await collect(deps, input);
  for (let round = 0; round < DEPARTURE_ROUNDS; round++) {
    let settled = 0;
    for (const village of collected.villages) {
      if (!collected.advanced.has(village.id)) continue;
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
  const today = input.today;
  if (villages.every((v) => isVillageAsleep(v.state) || v.state.lastDay >= today)) {
    // všechny vsi na dnešku – konec rodu jako při plném dopočtu
    return closeDynastyDay(deps, { settlements, villages, today });
  }
  // smíšené dny: konec hry jen po plném dopočtu (v jiné vsi se mezitím mohl narodit chlapec)
  if (isGameOver(villages.map((v) => v.state))) return advanceDynasty(deps, input);
  return { settlements, villages, gameOver: false };
}

/**
 * Vsi aktivních sídel hráče v pořadí jako `dynastyStatus` (sídelní první, pak podle založení):
 * zobrazená a zaostalé dopočtené do dneška (`loadVillage` – uloží se), ostatní uložené (`find` –
 * přes paměť vsí serveru).
 */
async function collect(deps: DynastyDeps, input: DynastyForVillageInput): Promise<Collected> {
  const settlements = await deps.settlements.listActive(input.playerId);
  // otisky bez stavu (levný dotaz) – podle `lastDay` a `asleep` se pozná, co dopočítat
  const stamps = await deps.villages.stampsOf(settlements.map((s) => s.id));
  const villages: VillageRecord[] = [];
  const advanced = new Set<string>();
  for (const settlement of settlements) {
    const landscape = settlementLandscape(settlement, deps.landscapes);
    for (const stamp of stamps.filter((v) => v.settlementId === settlement.id)) {
      const advance = stamp.id === input.villageId || lagsBehindWorker(stamp, input.today);
      const village = advance
        ? await loadVillage(deps, { villageId: stamp.id, today: input.today, landscape })
        : await deps.villages.find(stamp.id);
      if (!village) continue;
      villages.push(village);
      if (advance) advanced.add(village.id);
    }
  }
  return { settlements, villages, advanced };
}
