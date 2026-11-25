import { obstaclesOf, type Landscape, type ObstacleLayer } from '../domain/landscape';
import {
  advanceVillage,
  advanceVillageSteps,
  isVillageAbandoned,
  isVillageAsleep,
  isVillageExtinct,
  isVillageTravelling,
  migrateVillage,
  withoutBuiltOverGrainPits,
  withoutBuiltOverRuins,
  withRoadsRebuiltSteps,
  withRoadsRepairedSteps,
  withRoadsV2,
  withRoutes,
  nextYearEnd,
  villageYearRow,
  type MerchantStop,
  type VillageEvent,
  type VillageState,
  type VillageYearRow,
} from '../domain/village';
import { heldDay } from './village-holds';
import type { Pause, VillageRecord, VillageRepository, VillageResult } from './villages';

/** Kolikrát se akce zkusí znovu, když ves mezitím uložil jiný požadavek. */
const MAX_ATTEMPTS = 5;

export const NO_VILLAGE = 'Ves ještě není založená.';

/** Pole selhání převodů (village-core.md – Převody starších vsí) a co se do logu napíše. */
const MIGRATION_FAILURES: readonly (readonly [keyof VillageState, string])[] = [
  ['sowingRotationFailed', 'převod na osevní postup'],
  ['wildlifeFailed', 'převod zvěře'],
  ['horsePenStockFailed', 'převod ohrad koní'],
  ['forestClearingFailed', 'převod klučení lesa'],
];
/** Ves vymřela – žádná akce v ní nejde (population.md – Hlad a vymření). */
export const VILLAGE_EXTINCT = 'Ves vymřela – nikdo v ní nežije.';

/** Změna stavu vsi – nový stav, nebo důvod odmítnutí. */
export type VillageChange = { ok: true; state: VillageState } | { ok: false; reason: string };

/**
 * Ves dopočítaná do dneška (už dopočítanou ani „budoucí“ nevrací zpět). `obstacles` = vrstva
 * překážek krajiny sídla – přestavby podle ní kácí stromy (forest.md); `landscape` = krajina
 * sídla – přestavba polozemnice bez pozemku ji postaví na volném políčku; `inbox` = události
 * schránky vsi z dopočítávaných dnů (`advanceVillage`).
 */
export function advancedToToday(
  state: VillageState,
  today: number,
  obstacles: ObstacleLayer,
  landscape: Landscape | null = null,
  inbox: readonly VillageEvent[] = [],
): VillageState {
  if (state.lastDay >= today) return state;
  if (isVillageAsleep(state)) return asleepStay(state, obstacles, landscape);
  return advanceVillage(state, today, obstacles, landscape, inbox);
}

/**
 * Spící (vymřelá, opuštěná) ves se nesimuluje a jen den by se posunul – nestojí za uložení. Vrací
 * týž objekt, pokud jí převody při dopočtu (`advanceVillage`) nic nezmění; jinak ji převede
 * (bez posunu dne), ať se starší spící ves jednou převede a uloží.
 */
function asleepStay(
  state: VillageState,
  obstacles: ObstacleLayer,
  landscape: Landscape | null,
): VillageState {
  const converted = advanceVillage(state, state.lastDay, obstacles, landscape);
  return JSON.stringify(converted) === JSON.stringify(state) ? state : converted;
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
  inbox: readonly VillageEvent[],
): Promise<VillageState> {
  if (!pause || state.lastDay >= today || isVillageAsleep(state)) {
    return advancedToToday(state, today, obstacles, landscape, inbox);
  }
  const steps = advanceVillageSteps(state, today, obstacles, landscape, inbox);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
    // zastavení uvnitř dne (drahé kroky) nese `undefined`, konec dne jeho index
    const wait = pause(typeof step.value === 'number' ? step.value : undefined);
    if (wait) await wait;
  }
}

/**
 * Dopočet do dneška po kouscích končících na přelomu roku; z každého dokončeného roku řádek
 * deníku vsí (year-log.ts). Výsledek stavu je týž jako bez dělení (determinismus nezávisí na
 * kouscích), řádky jsou idempotentní (unikátní ves a rok). Každý kousek dostane celé `inbox` –
 * použije jen události svých dnů.
 */
async function advancedWithYearLog(
  state: VillageState,
  today: number,
  obstacles: ObstacleLayer,
  landscape: Landscape,
  pause: Pause | undefined,
  inbox: readonly VillageEvent[],
): Promise<{ state: VillageState; rows: VillageYearRow[] }> {
  const rows: VillageYearRow[] = [];
  let current = state;
  while (current.lastDay < today && !isVillageAsleep(current)) {
    const yearEnd = nextYearEnd(current.lastDay);
    const to = Math.min(today, yearEnd);
    const next = await advancedToTodayWithPauses(current, to, obstacles, landscape, pause, inbox);
    if (next.lastDay === yearEnd) rows.push(villageYearRow(next));
    if (next.lastDay <= current.lastDay) return { state: next, rows };
    current = next;
  }
  return { state: current, rows };
}

/**
 * Jednorázová přestavba a oprava sítě cest (`withRoadsRebuiltSteps`, `withRoadsRepairedSteps` –
 * paths.md, Jednorázová přestavba sítě a Jednorázová oprava sítě) s přestávkami (`pause`) mezi
 * kroky – sekundy výpočtu neblokují server. Stejný výsledek jako bez přestávek.
 */
async function withPauses(
  steps: Generator<void, VillageState, void>,
  pause: Pause | undefined,
): Promise<VillageState> {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
    const wait = pause?.();
    if (wait) await wait;
  }
}

/**
 * Načte ves, dopočítá ji do dneška, provede změnu a uloží s kontrolou verze. Při souběhu
 * (verze nesouhlasí) to zkusí znovu nad čerstvým stavem. Nezměněný stav se neukládá.
 * Starší ves před dopočtem projde převody (`migrateVillage` – seznam `VILLAGE_MIGRATIONS`,
 * village-core.md – Převody starších vsí) i s převody jen pro načtení (den načtení; seed počasí
 * mapy – úložiště bez počasí (null) ji nechá bez něj; zastávky stezek mapy, jen když je ještě
 * nemá), aby se s nimi už počítalo; pak se uloží.
 * Ves se dopočítává s vrstvou překážek a krajinou sídla (přestavby kácí stromy, polozemnice bez
 * pozemku se přestaví na volném políčku). Zbytky jam po zaniklých obydlích pod novou stavbou po
 * změně zmizí (`withoutBuiltOverRuins`), obilné jámy taky – zrno se přendá
 * (`withoutBuiltOverGrainPits`). Ves bez tras (nebo s trasami jiného rozložení) si je po dopočtu
 * spočítá (`withRoutes` – paths.md, Kdy se trasy počítají a co se ukládá) a po nich jednou uklidí
 * a přestaví síť cest (převody po dopočtu – mimo seznam). S `pause` dělá dopočet mezi dny
 * přestávky.
 * Před dopočtem si vyžádá události schránky vsi z dopočítávaných dnů (`villages.inbox` –
 * village-core.md, Schránka vsi) a dopočet je použije na začátku jejich dne. Zápis do schránky
 * zvedá verzi vsi, takže událost zapsaná během dopočtu se projeví konfliktem verze při uložení
 * a další pokus ji načte znovu s čerstvým stavem – použije se právě jednou. Ves, u které stojí
 * tažení, se dopočítá nejvýš do meze bariéry (`villages.holds` – village-holds.ts; ves dál už
 * spočítaná počká) a akce `change` dostane ves k tomu dni. Před dopočtem přes den obnovy okolí
 * zapíše do schránky snímek sousedních vsí (`villages.nearby` – nearby.ts) a pokus zopakuje.
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
  let weatherSeed: number | null | undefined;
  let merchantStops: readonly MerchantStop[] | null | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const record = await villages.find(villageId);
    if (record === null) return { ok: false, reason: NO_VILLAGE };
    // bariéra ves × tažení (village-holds.ts): s tažením u vsi nejvýš do jeho meze – při každém
    // pokusu znovu, mez mezitím mohla povyrůst
    const limits = await villages.holds?.limitOf([villageId]);
    const day = heldDay(today, record.state.lastDay, limits?.get(villageId));
    // seed počasí mapy se nemění – stačí se zeptat jednou
    weatherSeed ??= await villages.weatherSeedOf(record.settlementId);
    // zastávky stezek mapy (markets.md – Rozhodnutí plánu 4, bod 5) se nemění a ves si je uloží –
    // ptá se jen ves, která je nemá, a jednou (i neznámé sídlo při dalším pokusu)
    if (
      villages.merchantStopsOf &&
      merchantStops === undefined &&
      record.state.merchantStops === undefined
    ) {
      merchantStops = await villages.merchantStopsOf(record.settlementId);
    }
    // převody starších vsí (village-core.md – Převody starších vsí) – před dopočtem, ať se s nimi
    // už počítá; dopočet je projde znovu bez převodů jen pro načtení (už nic nezmění)
    const migrated = migrateVillage(record.state, {
      obstacles,
      landscape,
      load: { today: day, weatherSeed, merchantStops, landscape, obstacles },
    });
    // převod selhal při tomto načtení – ves jde dál, chyba se zapíše do logu
    for (const [key, what] of MIGRATION_FAILURES) {
      if (migrated[key] !== undefined && record.state[key] === undefined) {
        console.error(`Ves ${villageId}: ${what} selhal: ${String(migrated[key])}`);
      }
    }
    // události schránky z dnů, které se budou dopočítávat (village-core.md – Schránka vsi); po
    // načtení vsi – zápis mezi načtením a uložením zvedne verzi a pokus se zopakuje
    const inbox =
      migrated.lastDay < day ? await villages.inbox.pending(villageId, migrated.lastDay, day) : [];
    // okolí vsi v pevné dny (nearby.ts – markets.md, Rozhodnutí plánu 3, bod 1): chybí-li ve
    // schránce snímek dne obnovy, přes který se bude počítat, zapíše se před dopočtem – zápis zvedl
    // verzi vsi, pokus se zopakuje nad čerstvou schránkou (den snímku nezávisí na kouscích dopočtu)
    if (
      villages.nearby &&
      migrated.lastDay < day &&
      (await villages.nearby.post(record, migrated.lastDay, day, inbox))
    ) {
      continue;
    }
    const logged = await advancedWithYearLog(migrated, day, obstacles, landscape, pause, inbox);
    const advanced = logged.state;
    // ves uložená před trasami (nebo s trasami jiného rozložení) si je spočítá – i když se jen
    // zobrazuje, ať je scéna má (paths.md – Kdy se trasy počítají a co se ukládá)
    // starší ves přejde na nový systém cest: jednou uklidí síť a smaže stará pole (paths.md –
    // Převod starých vsí) – až po trasách, kotvy jsou z nich
    // a jednou přestaví síť cest z vyšlapanosti dnešních tras – vylepšení se přenesou (paths.md –
    // Jednorázová přestavba sítě, Martin 24. 10. 2026; znovu podle pravidel 26. 10. – verze
    // `ROAD_REBUILD.version`, Jednorázová přestavba podle nových pravidel) – a jednou ji opraví:
    // vozové cesty napojené, cesty do branek (paths.md – Jednorázová oprava sítě, Martin 25. 10. 2026)
    const rebuilt = await withPauses(
      withRoadsRebuiltSteps(
        withRoadsV2(withRoutes(advanced, landscape, obstacles), landscape, obstacles),
        landscape,
        obstacles,
      ),
      pause,
    );
    const current = await withPauses(withRoadsRepairedSteps(rebuilt, landscape, obstacles), pause);
    const changed = change(current);
    if (!changed.ok) return changed;
    // na místo zříceniny jde stavět – stavba zbytek jámy odstraní (ruins.ts); stavba na obilné
    // jámě taky – vesničané zrno přendají (production-chains.md – Obilné jámy)
    const next = withoutBuiltOverGrainPits(
      withoutBuiltOverRuins(changed.state, landscape),
      landscape,
    );
    const untouched =
      changed.state === migrated && migrated === record.state && next === changed.state;
    if (next === record.state || untouched) return { ok: true, village: record };
    const saved: VillageRecord | null = await villages.save(
      villageId,
      next,
      record.version,
      logged.rows,
    );
    if (saved !== null) return { ok: true, village: saved };
  }
  throw new Error(`Ves ${villageId} se nepodařilo uložit – příliš mnoho souběžných změn.`);
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
