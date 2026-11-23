import { waresDay } from '../wares/wares';
import { recordFelledSacredOn } from '../people/desecration';
import { TOTAL_GAME_DAYS, dateOfDayIndex } from '../../calendar';
import type { Landscape, ObstacleLayer } from '../../landscape';
import { abandonmentCheck, abandonmentDay } from '../buildings/abandonment';
import { retireCarts } from '../crafts/carts';
import { updateOrePits } from '../crafts/smith-supply';
import { finishPurchases, startPurchases } from '../crafts/craft-buying';
import { cartIronDay } from '../crafts/cart-iron';
import { cloneState } from './clone';
import { updateKilnRemnants } from '../crafts/charcoal';
import { updateCampRemnants } from '../crafts/burner-camp';
import { craftCoverage, wearCraftStocks } from '../crafts/crafts';
import { updateHappiness } from '../people/happiness';
import { occupyEmptyDwellings } from '../people/households';
import { priestDay } from '../people/church-life';
import { lodgeArrivalsDay } from '../people/lodge';
import { lodgeLifeDay } from '../people/lodge-life';
import { husbandryDay } from '../livestock/husbandry';
import { arrangeMarriages } from '../people/marriage';
import { bufferFill } from '../fields/field-food';
import { overgrowthDay } from '../fields/overgrowth';
import { roadsDay, roadsMonthSteps } from '../paths/roads';
import { refreshWalkDistancesSteps } from '../paths/village';
import { flushWear } from '../paths/wear';
import { roadFieldsDay } from '../roads/road-fields';
import { villageSacredOaks } from '../people/sacred';
import { moveGrainFromCoveredPits } from '../fields/grain-pit-site';
import { spoilSheaves } from '../fields/threshing';
import { settleSowingSeed } from '../fields/seed';
import { seedBuyingDay } from '../fields/seed-buying';
import { sacredOakEvents } from '../people/sacred-life';
import { orchardSeasonDay } from '../buildings/orchard';
import { fruitEatenUntilRotKg } from '../buildings/fruit-target';
import {
  inLuckyYears,
  nextStarvationDays,
  populationDay,
  type HungerDay,
} from '../people/population';
import { advanceGroupStarvation } from '../people/hunger-groups';
import { keepManor } from '../people/manor';
import { finishExpeditions } from '../trade/trade';
import { swathRoadsInWork, trailsDay } from '../trade/trail';
import { roadSwathDay } from '../roads/road-swath';
import { wagonRoadsDay } from '../roads/wagon-road';
import { decideFortRebuilds } from '../fortification/decay';
import { gateRoadCrossings } from '../fortification/state/fortifications';
import { isVillageDormant, isVillageTravelling } from '../people/departure';
import { applyInboxDay, inboxByDay, withJourneyInbox, type VillageEvent } from './inbox';
import { woundDeathsDay } from '../../war/raid-apply';
import { returnHome } from '../../vassalage/guests';
import { refugeFoodDay } from '../fortification/state/refugees';
import { stewardDay } from '../steward/steward';
import { stewardArrival, stewardSonDay } from '../steward/steward-son';
import { npcMasonryDay } from '../steward/npc-masonry';
import { ensureMainWives, extraWivesDay } from '../people/dynasty-wives';
import { updateRuins } from '../buildings/ruins';
import {
  CHRONICLE_MAX_EVENTS,
  HARVEST_DAY,
  LATE_HARVEST_DAY,
  PLANNING_DAY,
  THRESH_END_DAY,
  WINTER_HARVEST_DAY,
} from '../rules';
import type { VillageState } from '../types';
import { rotLogs } from '../forest/wood';
import { localDisastersDay } from '../disasters/local-disasters';
import { migrateVillage } from './migrations';
import { decideRebuilds, finishConstructions } from './simulate-build';
import { stockLastsDays } from './food-lasts';
import { eat, endThreshing, harvest, harvestLateSpring, harvestWinter } from './simulate-food';
import {
  fieldStoresOutlook,
  harvestLaborPerDay,
  isOn,
  lordHelpDay,
  seasonDay,
  startSeason,
} from './simulate-plan';
import { work } from './simulate-work';
import { patrolHuntDay, settlePatrol } from '../wildlife/field-patrol';
import { npcHuntDay } from '../wildlife/npc-hunt';
import { dogsYear } from '../wildlife/manor-dogs';
import { conversionDay } from '../people/conversion';
import { wildlifeYearDay } from '../wildlife/wildlife';
import { weatherDay } from '../disasters/weather';
import { partProtectionDay } from '../disasters/part-protection';
import { famineMemoryDay } from '../disasters/weather-effects';
import { damageWindowStart, wildlifeDamageDay } from '../wildlife/wildlife-damage';
import { trainLordDay, updateLordTraining } from '../people/lord';
import { dynastyDay } from '../people/succession';
import { markSunnyOrchards, premiumSacredHappiness } from './premium-effects';
import { noticeStatesDay } from './lasting-notices';
import { nameUnnamed } from '../people/people-names';

/**
 * Dopočítá ves do dne `toDay` včetně – den po dni od `lastDay + 1`. Vstup nemění.
 * Výsledek nezávisí na tom, po jakých kouscích se dopočítává (náhoda dne je ze seedu a dne;
 * kronika se zkrátí na posledních CHRONICLE_MAX_EVENTS událostí – simulace ji nečte).
 * `obstacles` = vrstva překážek krajiny sídla: přestavby podle ní vyhradí stromy ke kácení
 * (forest.md). Povinná – `null` (kácení bez polohy) jen v testech; volající ji musí dávat vždy
 * stejně, jinak výsledek na kouscích závisí. `landscape` = krajina sídla jen pro přestavbu
 * polozemnice bez pozemku – postaví ji na nejbližším volném políčku (`relocationPlot`); bez ní
 * (testy, měření) se obydlí přestaví na místě. Také ji volající dává vždy stejně.
 * `inbox` = události schránky vsi (inbox.ts): události dne `d` se použijí na začátku dne `d`, před
 * jeho simulací; události mimo dopočítávané dny (`day ≤ state.lastDay`, `day > toDay`, dny, kdy se
 * ves nesimuluje) se přeskočí – výsledek tak nezávisí na kouscích dopočtu, stačí předat aspoň
 * události z rozsahu `(state.lastDay, toDay]`. Bez schránky (testy, měření) prázdná.
 * Vymřelá ves (`extinctDay`) se už nesimuluje – jen se posune `lastDay`; lidé, pole, stavby,
 * zásoby i klády stojí, jak byly v den vymření.
 * RangeError, když `toDay` leží za koncem světa nebo před už odsimulovaným dnem.
 */
export function advanceVillage(
  state: VillageState,
  toDay: number,
  obstacles: ObstacleLayer | null,
  landscape: Landscape | null = null,
  inbox: readonly VillageEvent[] = [],
): VillageState {
  const steps = advanceVillageSteps(state, toDay, obstacles, landscape, inbox);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * `advanceVillage` po dnech: po každém odsimulovaném dni se zastaví (vrátí jeho index), aby
 * volající mohl mezi dny pustit ke slovu jinou práci (server – dlouhý dopočet neblokuje ostatní
 * požadavky). Výsledek (hodnota po posledním kroku) je stejný jako u `advanceVillage` – je to
 * tatáž smyčka, stav se klonuje jen jednou. Uvnitř dne se zastaví i u drahých kroků (cesty, trasy,
 * chůze) – bez hodnoty. RangeError jako `advanceVillage` (při prvním kroku).
 */
export function* advanceVillageSteps(
  state: VillageState,
  toDay: number,
  obstacles: ObstacleLayer | null,
  landscape: Landscape | null = null,
  inbox: readonly VillageEvent[] = [],
): Generator<number | void, VillageState, void> {
  if (!Number.isInteger(toDay) || toDay >= TOTAL_GAME_DAYS) {
    throw new RangeError(`Den ${toDay} neleží ve světě (0 až ${TOTAL_GAME_DAYS - 1}).`);
  }
  if (toDay < state.lastDay) {
    throw new RangeError(`Ves je dopočítaná do dne ${state.lastDay}, nelze zpět na ${toDay}.`);
  }
  // ves na cestě se správcem se v den příjezdu založí sama a křest rodu ji zastihne i na cestě
  const start = arrive(state, toDay, landscape, obstacles, inbox);
  // převody starších vsí (village-core.md – Převody starších vsí) – jednou, idempotentně, v pořadí
  // seznamu; převody jen pro načtení vsi (`loadOnly`) dopočet přeskočí
  const next = cloneState(migrateVillage(start, { obstacles, landscape }));
  const eventsByDay = inboxByDay(inbox);
  // vymřelá, opuštěná a ves na cestě se nesimulují – jen se posune den (migration.md)
  for (let day = next.lastDay + 1; day <= toDay && !isVillageDormant(next); day++) {
    // návraty domů a odchody hostů v pevný den (plán 2026-11-03 – rozhodnutí 11) – před
    // událostmi dne, ať host, který dnes odchází, a nový host, který dnes přijde, nesplynou
    next.chronicle.push(...returnHome(next, day));
    // události schránky dne – na začátku dne, před jeho simulací (village-core.md – Schránka vsi)
    const events = eventsByDay.get(day);
    if (events) next.chronicle.push(...applyInboxDay(next, day, events));
    // úmrtí na rány z nájezdu (war.md – Ztráty) – nástupnictví po nich ještě týž den (`dynastyDay`)
    next.chronicle.push(...woundDeathsDay(next, day));
    yield* simulateDaySteps(next, day, obstacles, landscape);
    // jméno každému, kdo dnes přišel bez jména (population.md – Jména) – na konci dne, ať výsledek
    // nezávisí na kouscích dopočtu (narození a další manželky ho dostanou hned)
    nameUnnamed(next);
    // pokřtěný rod: posvátné stromy, které dnes odstranilo zakládání polí, sadů a hřbitovů hráče
    // (christianity.md – Co křest rodu umožní)
    if (obstacles) recordFelledSacredOn(next, obstacles, day);
    yield day;
  }
  next.lastDay = toDay;
  trimChronicle(next);
  // vyšlapanost drží dopočet v paměti – do stavu ji zapíše až teď (paths.md – Výkon)
  if (next.roads?.wear) flushWear(next.roads.wear);
  return next;
}

/**
 * Ves na cestě: křest rodu ji zastihne i na cestě (christianity.md – Křest rodu; `withJourneyInbox`)
 * – do dne před jejím založením, ať ho osadníci přinesou do nové vsi. Ves se správcem se v den
 * příjezdu založí sama (steward.md – Kde správce běží) a dál se simuluje jako nová ves. Jiná ves
 * beze změny.
 */
function arrive(
  state: VillageState,
  toDay: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
  inbox: readonly VillageEvent[],
): VillageState {
  if (!isVillageTravelling(state)) return state;
  const byDay = inboxByDay(inbox);
  const arrived = stewardArrival(state, toDay, landscape, obstacles);
  if (!arrived) return withJourneyInbox(state, toDay, byDay);
  const baptized = withJourneyInbox(state, arrived.lastDay, byDay);
  return baptized === state
    ? arrived
    : (stewardArrival(baptized, toDay, landscape, obstacles) ?? baptized);
}

/** Kronika drží jen posledních CHRONICLE_MAX_EVENTS událostí (mutuje stav). */
function trimChronicle(state: VillageState): void {
  const excess = state.chronicle.length - CHRONICLE_MAX_EVENTS;
  if (excess > 0) state.chronicle.splice(0, excess);
}

/**
 * Jeden den vsi v pevném pořadí kroků (mutuje stav). Drahé kroky (měsíční kontrola cest, přepočet
 * tras a chůze) se zastavují (`yield` bez hodnoty), aby volající mohl dát přestávku – pořadí kroků
 * ani výsledek tím nezávisí.
 */
function* simulateDaySteps(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  landscape: Landscape | null,
): Generator<void, void, void> {
  const date = dateOfDayIndex(day);
  morningDay(state, day, landscape, obstacles);
  // nové stavby dne – jámy pod nimi se vyprázdní (production-chains.md – Obilné jámy): stavby vsi
  // vznikají jen s novým id z `nextId`, viz kontrola níž
  const idsBefore = state.nextId;
  yield* routesDaySteps(state, day, date, landscape, obstacles);
  // pokrytí výrobky řemeslníků ze včerejších zásob – meze produktivity celého dne (crafts.md)
  const coverage = craftCoverage(state, day);
  storesAndHerdsDay(state, day, coverage, landscape, obstacles);
  yield;
  const waiting = seasonPlanDay(state, day, date, coverage, landscape, obstacles);
  yield;
  const { toil, lordField, disasterEvents } = workDayStep(
    state,
    day,
    coverage,
    landscape,
    obstacles,
    waiting,
  );
  yield;
  afterWorkDay(state, day, landscape, obstacles);
  yield;
  remnantsDay(state, day, landscape, idsBefore);
  const eaten = marriagesAndMealDay(state, day, coverage);
  yield;
  const huntEvents = lordEveningDay(state, day, lordField);
  const dayResult = { toil, eaten, huntEvents, disasterEvents };
  // vymřelá ves se dál nesimuluje (ani sklizeň dne)
  if (!peopleDay(state, day, landscape, obstacles, dayResult)) return;
  harvestAndUpkeepDay(state, day, date, landscape, obstacles);
}

/** Ráno dne: výcvik rodiny vojvody, roční přepočet zvěře, počasí kraje, ochrana dílů, teplé sady a psi. */
function morningDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): void {
  // vojvodova rodina (lord.md): cvičí, nebo pracuje – rozhodnout jednou na začátku dne, ať ho
  // stejně vidí pasení, výběr dílů, nákupy i `work()` (i v den přechodu)
  updateLordTraining(state, day);
  // zvěř: 1. 5. roční přepočet podle krajiny a stropů (wildlife.md – Roční přepočet)
  wildlifeYearDay(state, day, landscape);
  // počasí kraje: v den, kdy se ukáže zlá zima nebo neobvyklé léto, zápis do kroniky
  // (disasters.md – Léto, Zima, „Kdy je vidět“)
  state.chronicle.push(...weatherDay(state, day));
  // 1. 4.: ochrana dílů před počasím ze zeleně a vlhkosti (disasters.md – Ochrana dílu)
  partProtectionDay(state, day, landscape, obstacles);
  // sady na teplém jižním svahu prémiové krajiny (premium-landscapes.md – Teplé jižní svahy) –
  // i sad založený správcem včera
  if (landscape) markSunnyOrchards(state, landscape);
  // psi dvorce 1. 5.: úbytek a štěňata (wildlife.md – Psi)
  dogsYear(state, day);
}

/** Cesty a vzdálenosti chůze: měsíční kontrola cest, cesty přes pole, brány v opevnění a přepočet tras (se zastávkami). */
function* routesDaySteps(
  state: VillageState,
  day: number,
  date: ReturnType<typeof dateOfDayIndex>,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): Generator<void, void, void> {
  // vzdálenosti chůze dílů po pěšinách – jen když se změnilo rozložení vsi (paths.md); bez
  // krajiny (kalibrace, testy) zůstávají přímé vzdálenosti
  // vyšlapanost a vznik cest (paths.md – Vyšlapanost a vznik cesty): 1. dne v měsíci interval se
  // stálými trasami a z vyšlapaných čar tras nové cesty; přepočet tras ji sečte sám (před novými
  // trasami)
  if (landscape && date.day === 1) yield* roadsMonthSteps(state, day, landscape, obstacles);
  yield;
  // pevné cesty ubírají polím plochu (roads.md a fields.md – Cesta přes pole) – jen když se od
  // včerejška změnily cesty nebo čtverce polí
  if (landscape) roadFieldsDay(state, day, landscape);
  // cesta přes stojící opevnění dostane bránu (fortifications.md – Brány) – před přepočtem tras
  if (landscape) gateRoadCrossings(state, landscape);
  if (landscape) yield* refreshWalkDistancesSteps(state, day, landscape, obstacles);
  yield;
}

/** Zásoby a stáda: hnijící klády, kazící se snopy, ruce pro výmlat, dosloužilé vozy, sady, zarůstání a hospodářství. */
function storesAndHerdsDay(
  state: VillageState,
  day: number,
  coverage: ReturnType<typeof craftCoverage>,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): void {
  rotLogs(state);
  // snopy, které dnes nikdo nemlátí, se kazí (production-chains.md – Humno); ruce pro výmlat dne
  // – podle nich výhled výmlatu do konce okna (`sheavesOutlook`)
  spoilSheaves(state, day);
  state.threshHands = harvestLaborPerDay(state, day, coverage);
  // vozy, které dosloužily – tesař vyrobí nové (wagons.md – Vůz)
  state.chronicle.push(...retireCarts(state, day));
  // sady: shnilá jablka, konec péče a stárnutí (1. 3.), začátek a konec sklizně a péče, obnova
  // starých čtverců v oknech výsadby (stavba ze společné práce – dostane práci už dnes); sklizeň
  // jen tolik jablek, kolik ves od dneška do zkažení sní (cíl ovoce – orchard.md, Práce)
  for (const event of orchardSeasonDay(state, day, coverage.pottery, (s) =>
    fruitEatenUntilRotKg(s, day),
  )) {
    // zásoba jablek po sklizni (kronika – Martin 17. 11. 2026)
    if (event.kind === 'apple-harvest') {
      const outlook = stockLastsDays(state, day, 'apples', coverage.pottery);
      event.stock = {
        kg: Math.round(outlook.kg),
        days: outlook.days,
        people: state.people.length,
      };
    }
    state.chronicle.push(event);
  }
  // zarůstání přílohu (1. 11., před porážkou – stáda jsou ještě letní): díly, které se nespásly
  // ani neposekly, zarůstají, les z pole vypadne (fields.md – Zarůstání)
  state.chronicle.push(...overgrowthDay(state, day, obstacles ?? landscape));
  // stáda, seno a ohrady: mláďata, seč, porážka, vejce, zimní krmení, spřežení (diet.md, oxen.md)
  state.chronicle.push(...husbandryDay(state, day, coverage.tools, landscape, obstacles));
  // zboží vsi: med a vosk z klátů (hides-honey.md)
  waresDay(state, day, landscape);
}

/** Plán dne: posvátné duby, paměť hladu, obrácení, nový hospodářský rok a díly na řadě. Vrací díly, které čekají. */
function seasonPlanDay(
  state: VillageState,
  day: number,
  date: ReturnType<typeof dateOfDayIndex>,
  coverage: ReturnType<typeof craftCoverage>,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): ReturnType<typeof seasonDay> {
  // ušetřené posvátné duby stářím usychají a souše padají – den plyne z dubu (happiness.md)
  state.chronicle.push(...sacredOakEvents(villageSacredOaks(state), obstacles, day));
  // 1. 9. nový hospodářský rok a postup dílů, každý den díly na řadě a konce oken setí (fields.md –
  // Osevní postup po dílech); podíl dne rodiny ve žních (lord.md – Kdy jde rodina na pole)
  // paměť hladu: po krutém roce drží ves 10 let vyšší pojistku – před novým hospodářským rokem
  // (disasters.md – Dopady, Zásoby a pojistka)
  famineMemoryDay(state, day);
  // 1. 1.: dospělí pohané se v pokřtěném rodě obracejí (christianity.md – Obrácení)
  state.chronicle.push(...conversionDay(state, day));
  if (isOn(date, PLANNING_DAY)) startSeason(state, day, coverage, landscape);
  const waiting = seasonDay(state, day, coverage);
  return waiting;
}

/** Práce dne: pomoc rodiny, škody zvěře, místní pohromy, nákupy, osivo a `work()`; osivo za nestihnuté setí zpět. */
function workDayStep(
  state: VillageState,
  day: number,
  coverage: ReturnType<typeof craftCoverage>,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
  waiting: ReturnType<typeof seasonDay>,
): {
  toil: boolean;
  lordField: ReturnType<typeof work>['lordField'];
  disasterEvents: ReturnType<typeof localDisastersDay>;
} {
  lordHelpDay(state, day, coverage, landscape);
  // zvěř: 1. 6. ohrožené díly polí podle vzdálenosti od lesa (wildlife.md – Škody)
  damageWindowStart(state, day, landscape);
  // místní pohromy (disasters.md – Místní pohromy – jedna ves): smršť, kroupy, povodeň, požár –
  // po plánu dne, před nákupy a prací; při požáru dnes dospělí hasí (`villagersToday`, `work()`)
  const disasterEvents = localDisastersDay(state, day, landscape, obstacles);
  state.chronicle.push(...disasterEvents);
  // nákup výrobků řemeslníků u sousedů – jednou za rok po sklizni, ves se rozhodne sama
  // (crafts.md – Nákup u sousedů); skupina vyrazí hned
  startPurchases(state, day, coverage, landscape);
  // osivo pro ves bez zásob – 1. 9. a 1. 3. ho ves koupí u sousedů, 1. 6. je nezaseté obyčejné
  // zrno (fields.md – Osivo pro ves bez zásob); po plánu dne, před prací
  state.chronicle.push(...seedBuyingDay(state, day));
  const { toil, lordField } = work(
    state,
    day,
    obstacles,
    coverage,
    landscape,
    new Set(waiting.map((j) => j.crop)),
  );
  // osivo za nestihnutou část dne zpět do jídla (fields.md – Osivo bez cíle osevu)
  settleSowingSeed(state, day);
  return { toil, lordField, disasterEvents };
}

/** Po práci: opotřebení, škody zvěře, stezky a cesty, výpravy a nákupy, kování vozů, dokončené stavby, přestavby a den správce. */
function afterWorkDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): void {
  // nástroje a nádoby v užívání se opotřebí (crafts.md – Účinek)
  wearCraftStocks(state, day);
  // škody zvěře na polích po práci dne – nesklizené díly (wildlife.md – Škody)
  settlePatrol(state, day);
  wildlifeDamageDay(state, day);
  // zemské stezky – dostavěné úseky od vsi ven hned vylepšené, vrácené výpravy (trade.md)
  trailsDay(state);
  // vozové cesty – hotové úseky od vsi ven jsou hned pevnou cestou (roads.md – Vozová cesta)
  wagonRoadsDay(state, day, landscape, obstacles);
  // průsek lesem – úseky, na které vylepšení cesty došlo (roads.md – Průsek lesem)
  roadSwathDay(state, day, obstacles, landscape, swathRoadsInWork(state));
  state.chronicle.push(...finishExpeditions(state, day));
  state.chronicle.push(...finishPurchases(state, day));
  // kování vozů (wagons.md – Kování vozů): vůz s hotovou dřevěnou prací ze zásoby nástrojů, ves bez
  // kováře pošle tesaře nebo jeho syna do nejbližší vsi s kovářem; kdo se vrátil, vůz dokončí
  state.chronicle.push(...cartIronDay(state, day, landscape));
  finishConstructions(state, day, landscape ?? undefined);
  // dvorec vojvody – po zániku dvorce nejstarší obydlí, starší ves dvorec dostane (trade.md)
  keepManor(state);
  decideRebuilds(state, day, obstacles, landscape);
  // přestavba dožilých úseků opevnění a obnova valu – hned za přestavbami obydlí (fortifications.md –
  // Životnost a oprava); stavba dostane práci až další den
  decideFortRebuilds(state, day, landscape, obstacles);
  // mistři a kněží, kterým vypršela cesta (stone-masonry.md – Příchod) – před osídlením prázdných obydlí
  lodgeArrivalsDay(state, day);
  // kněz do dostavěného kostela hned, po smrti nový za 60 dní (churches.md – Co kostel dává)
  priestDay(state, day);
  occupyEmptyDwellings(state, day);
  // den správce (steward.md – Rozhodovací pořadí v den správce): jen zapnutý správce s krajinou
  // a vrstvou překážek, každý `STEWARD.everyDays`. den – nové stavby dostanou id z `nextId` před
  // kontrolou obilných jam níž a zbytky jam pod nimi zmizí v `updateRuins`
  // kroky 1 a 2 – jména synů, 31. 8. odchod syna do schránky (steward-son.ts)
  stewardSonDay(state, day, landscape, obstacles);
  stewardDay(state, day, landscape, obstacles);
  // ves NPC rodu (`nobles`) – huť, lom a kostel v den správce (churches.md – Stavba, NPC rod);
  // ves hráče přeskočí bez losu
  npcMasonryDay(state, day, landscape, obstacles);
}

/**
 * Zbytky jam, rudišť, milířů a zemnic uhlířů; obilné jámy pod dnešními novými stavbami
 * (`idsBefore`).
 */
function remnantsDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  idsBefore: number,
): void {
  // zbytky jam po zaniklých obydlích zarůstají, pod novou stavbou zmizí (ruins.ts)
  updateRuins(state, day, landscape);
  updateOrePits(state, day);
  updateKilnRemnants(state, day);
  // opuštěné zemnice uhlířů u milířů chátrají a zmizí (workshops.md – Uhlíř – zemnice u milíře)
  updateCampRemnants(state, day);
  // obilné jámy pod stavbou, kterou ves dnes začala, zmizí – vesničané zrno přendají
  // (production-chains.md – Obilné jámy). Podmínka: každá stavba, kterou ves založí sama, dostane
  // id z `nextId` a všechny kroky, které je zakládají, běží před touto kontrolou – obnova sadu
  // (`orchardSeasonDay`), rádla při výcviku (`husbandryDay`), práce dne (`work()` – milíře
  // `startKiln`, místo nové jámy), dokončení staveb (`finishConstructions`) a přestavby
  // (`decideRebuilds` – i na novém pozemku). Stavby hráče a zemní práce vozové cesty kontroluje akce
  // (`withoutBuiltOverGrainPits` v updateVillage). Co bere id až po kontrole (porody, sňatky,
  // nevěsty z okolí, další manželky), nic nestaví. Nový krok, který staví bez nového id nebo po
  // kontrole, musí kontrolu spustit sám.
  if (state.nextId !== idsBefore) moveGrainFromCoveredPits(state, day, landscape);
}

/** Sňatky, jídlo uprchlíků a jídlo dne (`eat`). */
function marriagesAndMealDay(
  state: VillageState,
  day: number,
  coverage: ReturnType<typeof craftCoverage>,
): ReturnType<typeof eat> {
  // sňatky mezi domy – svobodní ve dvou domech se vezmou (population.md – Sňatky mezi domy); muž
  // bez hlavní manželky, který nějakou manželku má (osadníci výpravy), se před nimi nežení
  // (lord.md – Nová hlavní manželka); pak další manželky mužů rodu z okolí (lord.md – Manželky)
  // svatby čekají, dokud výhled zásob k příští sklizni nemá pojistku (kinship.md – Sňatky čekají
  // na zásoby; Martin 27. 10. 2026) – naplnění se spočítá jednou za den, jen když je svatba na řadě;
  // v hájení ne (hladem v něm nikdo nezemře, ves má růst – population.md, Hájení)
  let fill: number | undefined;
  const lucky = inLuckyYears(state.foundedDay, day);
  const storesFill = (): number =>
    (fill ??= lucky ? 1 : bufferFill(fieldStoresOutlook(state, day, coverage)));
  state.chronicle.push(...ensureMainWives(state, day));
  state.chronicle.push(...arrangeMarriages(state, day, storesFill));
  state.chronicle.push(...extraWivesDay(state, day, storesFill));
  // uprchlíci jedí napřed své – v lese z ukrytého, v hradišti ze zásob pobytu (war.md – Varování,
  // poslové a útěk do hradiště); bez útěku a hostů uprchlíků nic
  if (state.refuge?.hidden !== undefined || state.refugeStays !== undefined) {
    refugeFoodDay(state, day);
  }
  return eat(state, day, coverage);
}

/** Večer rodiny vojvody: hlášení porážky, lov správce, lov z hlídky a výcvik. Vrací události lovu správce. */
function lordEveningDay(
  state: VillageState,
  day: number,
  lordField: ReturnType<typeof work>['lordField'],
): ReturnType<typeof npcHuntDay> {
  // letní a nouzová porážka běží až v `eat()`, po `work()` – doplnit hlášení kusů do dnešního rozvrhu práce
  // (jen hlášení pro scénu, simulaci to nemění)
  const slaughteredToday = state.livestock?.slaughtered;
  if (state.labor?.day === day && slaughteredToday?.day === day) {
    state.labor.slaughterHeads = { ...slaughteredToday.heads };
  }
  // lov správce bez scény (hunting.md – Pravidla 8): v den lovu po práci (honci a lovci chyběli
  // v práci dne – `allocateDay`) souboj se zvěří na louce a výsledek hned ve vsi – úlovek, výcvik,
  // rány a smrt lovců; před výcvikem dne (padlý ani raněný už necvičí)
  const huntEvents = npcHuntDay(state, day);
  state.chronicle.push(...huntEvents);
  // úlovek prasat z jezdecké hlídky polí (červen–říjen; wildlife.md – Obrana polí)
  patrolHuntDay(state, day);
  // vojvodova rodina (lord.md): výcvik dne – kdo necvičil (na poli ve žních), zapomíná –
  // a koně pod jezdci (horses.md – Výcvik koně a jezdec) – po péči (`work()`) a obilí (`eat()`)
  state.chronicle.push(...trainLordDay(state, day, lordField));
  return huntEvents;
}

/** Lidé na konci dne: hlad, úmrtí, nástupnictví a štěstí. Vrací, jestli ves žije (vymřelá se dál nesimuluje). */
function peopleDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
  dayResult: {
    toil: boolean;
    eaten: ReturnType<typeof eat>;
    huntEvents: ReturnType<typeof npcHuntDay>;
    disasterEvents: ReturnType<typeof localDisastersDay>;
  },
): boolean {
  const { toil, eaten, huntEvents, disasterEvents } = dayResult;
  const { satiation, energy, diet, groups } = eaten;
  // nahromaděný hlad se počítá z dnešní energie (hladem se umírá z energie, ne z pestrosti –
  // diet.md) – úmrtí dne podle něj (population.md); v hájení zůstává pod prahem, aby po něm lidé
  // umírali postupně
  // skupiny přednosti v hladu (population.md – Přednost v hladu) mají hlad každá zvlášť; jí-li se
  // dosyta a všechny mají stejný hlad, vede se jediný hlad vsi jako dřív
  const lucky = inLuckyYears(state.foundedDay, day);
  let hunger: HungerDay | undefined;
  if (groups) {
    const starvation = advanceGroupStarvation(state, groups.energy, groups.counts, lucky);
    hunger = { groupOf: groups.groupOf, energy: groups.energy, starvation };
  } else {
    state.starvationDays = nextStarvationDays(state.starvationDays ?? 0, energy, lucky);
  }
  const events = populationDay(state, day, satiation, energy, hunger);
  state.chronicle.push(...events);
  // kdo zahynul na lovu správce nebo při pohromě, ves oplakává jako každé úmrtí (štěstí), i když
  // zápis dělá lov či pohroma
  const happinessEvents = [
    ...events,
    ...huntEvents.filter((e) => e.kind === 'death'),
    ...disasterEvents.filter((e) => e.kind === 'death'),
  ];
  // nová hlavní manželka a nástupnictví (lord.md – Rod vojvody); ves bez rodu nic
  state.chronicle.push(...dynastyDay(state, day));
  // štěstí na konci dne – hlad, úmrtí, přeplněnost, dřina, zásoby, maso, ovoce a med po lidech
  // a posvátná místa (happiness.md, diet.md – Spokojenost ze stravy)
  updateHappiness(state, day, {
    satiation,
    events: happinessEvents,
    toil,
    diet,
    obstacles,
    premiumSacred: premiumSacredHappiness(landscape),
  });
  if (state.people.length === 0) {
    // zemřel poslední člověk – ves vymřela, dál se nesimuluje (ani sklizeň dne)
    state.extinctDay = day;
    state.chronicle.push({ day, kind: 'village-extinct' });
    return false;
  }
  // mistři huti – odchod při hladu a neštěstí, noví mistři (stone-masonry.md); ves bez huti nic
  lodgeLifeDay(state, groups ? (groups.energy[1] ?? energy) : energy, day);
  return true;
}

/** Sklizně po jídle, konec výmlatu, roční kontrola cest, opuštěné stavby a trvalé stavy z upozornění. */
function harvestAndUpkeepDay(
  state: VillageState,
  day: number,
  date: ReturnType<typeof dateOfDayIndex>,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): void {
  // Sklizeň a ztráta nevymláceného až po jídle (Ruling 13) – 31. 8. se jí ještě z loňských
  // zásob, jak počítá daysUntilHarvest (31. 8. → 1 den); ozim stejně 31. 7. (co červenec
  // nedosklidil, 31. 8. s jaří – fields.md, Žně i v srpnu); jař, kterou srpen nedosklidil, v září,
  // až je dožatá, nejpozději 30. 9. (fields.md – Žeň jaře i v září); s jaří končí sezóna škod zvěře
  const pottery = (): number => craftCoverage(state, day).pottery;
  if (isOn(date, WINTER_HARVEST_DAY)) harvestWinter(state, day, landscape, pottery());
  if (isOn(date, HARVEST_DAY)) harvest(state, day, pottery());
  if (date.month === LATE_HARVEST_DAY.month) {
    harvestLateSpring(state, day, isOn(date, LATE_HARVEST_DAY), pottery());
  }
  if (isOn(date, THRESH_END_DAY)) endThreshing(state);
  // pevné cesty (roads.md): práce dne do ročního součtu, 1. 11. roční kontrola cest a stromů
  const visits = roadsDay(state, day, landscape, obstacles);
  // opuštěné stavby (abandonment.md): 1. 11. podle provozu roční sítě začnou nebo přestanou
  // chátrat, každý den spadnou ty, jejichž stav došel na nulu
  if (visits) abandonmentCheck(state, day, visits);
  state.chronicle.push(...abandonmentDay(state, day, landscape));
  // trvalé stavy z upozornění – začátek a konec do kroniky (absence.md)
  state.chronicle.push(...noticeStatesDay(state, day));
}
