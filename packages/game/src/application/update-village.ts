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
  withMergedRoads,
  withRoadSwaths,
  withObstacleClearing,
  withPenGrace,
  withoutTrampledParts,
  withPenSpecies,
  withOxen,
  withPlots,
  withRoutes,
  withWearSeed,
  withVisitsSeed,
  withRoadCondition,
  withRoadsV2,
  withRoadsRebuiltSteps,
  withRoadsRepairedSteps,
  withDynasty,
  withBridgedRoads,
  withDwellingShapes,
  withoutBuiltOverRuins,
  withoutBuiltOverGrainPits,
  withGrainPits,
  withoutForeignGoods,
  withCattleKinds,
  withIronBarsTrade,
  withSeason,
  withSowingRotation,
  withThreshingGrace,
  withToolEquipment,
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
 * mezi dny přestávky.
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
    // převod na osevní postup selhal při tomto načtení – ves jde dál, chyba se zapíše do logu
    const rotated = withSowingRotation(withSeason(record.state));
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
    // z historie provozu (bod 2); pošlapaná úroda z doby, kdy ji vozy šlapaly, zmizí (paths.md –
    // Stálé trasy)
    const base = withRoadCondition(
      withVisitsSeed(
        withWearSeed(withManor(withOxen(withBridgedRoads(withoutTrampledParts(migrated))))),
      ),
    );
    // jiné vsi na téže mapě – kontroly umístění a kácení o nich vědí (migration.md); přehled se
    // neukládá
    const neighbours = withNeighbours(base, await neighboursOf(villages, record, today));
    // ves z doby před obilnými jámami uloží zásoby do jam u humna nebo dvorce – jámy ne na půdě
    // jiných vsí (production-chains.md – Obilné jámy)
    const attached = withGrainPits(neighbours, landscape, obstacles);
    const advanced = await advancedToTodayWithPauses(attached, today, obstacles, landscape, pause);
    // ves uložená před trasami (nebo s trasami jiného rozložení) si je spočítá – i když se jen
    // zobrazuje, ať je scéna má (paths.md – Kdy se trasy počítají a co se ukládá)
    // starší ves přejde na nový systém cest: jednou uklidí síť a smaže stará pole (paths.md –
    // Převod starých vsí) – až po trasách, kotvy jsou z nich
    // a jednou přestaví síť cest z vyšlapanosti dnešních tras – vylepšení se přenesou (paths.md –
    // Jednorázová přestavba sítě, Martin 24. 10. 2026) – a jednou ji opraví: vozové cesty napojené,
    // cesty do branek (paths.md – Jednorázová oprava sítě, Martin 25. 10. 2026)
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
    const stripped = withoutNeighbours(changed.state);
    const next = withoutBuiltOverGrainPits(withoutBuiltOverRuins(stripped, landscape), landscape);
    const untouched =
      changed.state === attached &&
      attached === neighbours &&
      base === record.state &&
      next === stripped;
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
    others.map((v) => v.name),
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
