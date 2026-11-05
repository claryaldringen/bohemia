import { obstaclesOf, type Landscape, type ObstacleLayer } from '../domain/landscape';
import {
  advanceVillage,
  advanceVillageSteps,
  isVillageAbandoned,
  isVillageAsleep,
  isVillageExtinct,
  isVillageTravelling,
  withForestDistances,
  withKinship,
  withLivestockLand,
  withWeatherSeed,
  withWildlife,
  withManor,
  withMergedFields,
  withMergedRoads,
  withRoadSwaths,
  withObstacleClearing,
  withPenGrace,
  withoutTrampledParts,
  withForestClearing,
  withHorsePenStock,
  withPenSpecies,
  withOxen,
  withPlots,
  withRoutes,
  withoutWalkStages,
  withPlannedLining,
  withWearCells,
  withWearSeed,
  withVisitsSeed,
  withRoadCondition,
  withRoadsV2,
  withRoadsRebuiltSteps,
  withRoadsRepairedSteps,
  withDynasty,
  withBridgedRoads,
  withCharredRuins,
  withDwellingShapes,
  withoutBuiltOverRuins,
  withoutBuiltOverGrainPits,
  withGrainPits,
  withoutForeignGoods,
  withoutSameMapVillages,
  withCattleKinds,
  withIronBarsTrade,
  withSeason,
  withSowingRotation,
  withThreshingGrace,
  withToolEquipment,
  nextYearEnd,
  villageYearRow,
  type VillageEvent,
  type VillageState,
  type VillageYearRow,
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
 * Vsi z doby před vrstvou překážek nejdřív doplní odstraněné překážky (`withObstacleClearing`)
 * a obydlím z doby před palivem vzdálenost k lesu (`withForestDistances`), polozemnicím z doby
 * před pozemky pozemek (`withPlots`), stavby z doby před variantami rozměrů variantu, nebo příznak
 * dnešního tvaru (`withDwellingShapes` – population.md), stará navazující pole se sloučí (`withMergedFields`) a vsím
 * z doby před dobytkem se doplní výchozí stádo a louka a les pro pastvu (`withLivestockLand`)
 * a pevné cesty z doby před slučováním úseků se spojí ve falešných rozcestích a stezky bez úseků je
 * znovu najdou po síti cest (`withMergedRoads`)
 * (díry a souběžné cesty uklidí `withRoadsV2` po trasách), hotové upravené cesty a stezky lesem dostanou
 * průsek (`withRoadSwaths`) a lidem z doby před příbuzenstvím se doplní
 * pohlaví a manželé (`withKinship`), dobytek v obchodu dostane tři druhy (`withCattleKinds` –
 * trade.md, Dobytek ve třech druzích) a ves přijde o zboží zvenku, které obchod už nezná
 * (`withoutForeignGoods`), ohrady uložené bez druhu ho dostanou (`withPenSpecies` – oxen.md,
 * Ohrady podle druhu), spřežení voly po kusech (`withOxen`), stáda roční odklad míst ohrad od
 * dneška (`withPenGrace`) a ves z doby před snopy rok odkladu mlácení bez humna od dneška
 * (`withThreshingGrace` – production-chains.md, Starší vsi) a zásoby obilí z doby před jamami
 * se uloží do obilných jam (`withGrainPits` – production-chains.md, Obilné jámy) – před dopočtem,
 * aby se s nimi už počítalo; pak se uloží.
 * Ves se dopočítává s vrstvou překážek a krajinou sídla (přestavby kácí stromy, polozemnice bez
 * pozemku se přestaví na volném políčku). Zbytky jam po zaniklých obydlích pod novou stavbou po
 * změně zmizí (`withoutBuiltOverRuins`), obilné jámy taky – zrno se přendá
 * (`withoutBuiltOverGrainPits`). Ves bez tras (nebo s trasami jiného rozložení) si je po dopočtu
 * spočítá (`withRoutes` – paths.md, Kdy se trasy počítají a co se ukládá). S `pause` dělá dopočet
 * mezi dny přestávky. Ves dostane kopii seedu počasí své mapy (`withWeatherSeed` – disasters.md,
 * Kraj) – úložiště bez počasí (null) ji nechá bez něj.
 * Před dopočtem si vyžádá události schránky vsi z dopočítávaných dnů (`villages.inbox` –
 * village-core.md, Schránka vsi) a dopočet je použije na začátku jejich dne. Zápis do schránky
 * zvedá verzi vsi, takže událost zapsaná během dopočtu se projeví konfliktem verze při uložení
 * a další pokus ji načte znovu s čerstvým stavem – použije se právě jednou.
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
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const record = await villages.find(villageId);
    if (record === null) return { ok: false, reason: NO_VILLAGE };
    // seed počasí mapy se nemění – stačí se zeptat jednou
    weatherSeed ??= await villages.weatherSeedOf(record.settlementId);
    // vsi rodu na téže mapě jsou zrušené (migration.md) – zbytky se zahodí
    const rotated = withSowingRotation(
      withSeason(withWeatherSeed(withoutSameMapVillages(record.state), weatherSeed)),
    );
    // převod na osevní postup selhal při tomto načtení – ves jde dál, chyba se zapíše do logu
    const failure = rotated.sowingRotationFailed;
    if (failure !== undefined && record.state.sowingRotationFailed === undefined) {
      console.error(`Ves ${villageId}: převod na osevní postup selhal: ${failure}`);
    }
    // ohrady uložené dřív dostanou druh (oxen.md – Ohrady podle druhu); ves z doby před snopy
    // rok odkladu mlácení od dneška (production-chains.md – Starší vsi); zásoba nástrojů do
    // vybavení domácností a hřivny místo nástrojů v obchodu (production-chains.md – Kovář)
    const migrated = withThreshingGrace(
      withPenGrace(
        withPenSpecies(
          withoutForeignGoods(
            withIronBarsTrade(
              withToolEquipment(
                withCattleKinds(
                  // ves z doby před rodem dostane rod vojvody (lord.md – Převod starších vsí)
                  withDynasty(
                    withKinship(
                      // hotové upravené cesty a stezky lesem dostanou průsek (roads.md – Průsek lesem)
                      withRoadSwaths(
                        withMergedRoads(
                          withWildlife(
                            withLivestockLand(
                              withMergedFields(
                                // varianty rozměrů domů (population.md) – po pozemcích, ať dům zná svůj
                                withDwellingShapes(
                                  withPlots(
                                    withForestDistances(
                                      withObstacleClearing(rotated, obstacles),
                                      landscape,
                                    ),
                                    landscape,
                                    obstacles,
                                  ),
                                  landscape,
                                  obstacles,
                                ),
                              ),
                              landscape,
                            ),
                            landscape,
                          ),
                          landscape,
                        ),
                        obstacles,
                        landscape,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        today,
      ),
      today,
    );
    // dvorec vojvody – starší ves ho dostane (nejstarší obydlí, trade.md); spřežení ohrad uložených
    // dřív se převedou na voly po kusech (oxen.md – Voli po kusech); ves z doby před vyšlapaností ji
    // dostane podél loňských úseků nad prahem (paths.md – Převod starých vsí, bod 3) a cesty stav kusů
    // z historie provozu (bod 2); pošlapaná úroda z doby, kdy ji vozy šlapaly, zmizí a vyšlapanost
    // políček 7,5 m se rozdělí do buněk 3,75 m a otisk stadií dílů zmizí (paths.md – Stálé trasy,
    // pravidla 1, 4 a 5)
    const base = withRoadCondition(
      withVisitsSeed(
        withWearCells(
          withWearSeed(
            withManor(
              withHorsePenStock(
                withOxen(
                  withBridgedRoads(
                    withoutTrampledParts(
                      withPlannedLining(withoutWalkStages(withCharredRuins(migrated))),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    if (base.wildlifeFailed !== undefined && record.state.wildlifeFailed === undefined) {
      console.error(`Ves ${villageId}: převod zvěře selhal: ${base.wildlifeFailed}`);
    }
    if (base.horsePenStockFailed !== undefined && record.state.horsePenStockFailed === undefined) {
      console.error(`Ves ${villageId}: převod ohrad koní selhal: ${base.horsePenStockFailed}`);
    }
    // ves z doby před obilnými jámami uloží zásoby do jam u humna nebo dvorce (production-chains.md
    // – Obilné jámy)
    const pitted = withGrainPits(base, landscape, obstacles);
    // rozestavěné díly v lese dostanou fáze klučení (forest.md – Klučení lesa pro pole, Starší vsi)
    const attached = withForestClearing(pitted, obstacles);
    if (
      attached.forestClearingFailed !== undefined &&
      record.state.forestClearingFailed === undefined
    ) {
      console.error(
        `Ves ${villageId}: převod klučení lesa selhal: ${attached.forestClearingFailed}`,
      );
    }
    // události schránky z dnů, které se budou dopočítávat (village-core.md – Schránka vsi); po
    // načtení vsi – zápis mezi načtením a uložením zvedne verzi a pokus se zopakuje
    const inbox =
      attached.lastDay < today
        ? await villages.inbox.pending(villageId, attached.lastDay, today)
        : [];
    const logged = await advancedWithYearLog(attached, today, obstacles, landscape, pause, inbox);
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
      changed.state === attached &&
      attached === base &&
      base === record.state &&
      next === changed.state;
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
