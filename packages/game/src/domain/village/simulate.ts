import { TOTAL_GAME_DAYS, dateOfDayIndex } from '../calendar';
import type { Landscape, ObstacleLayer } from '../landscape';
import { abandonmentCheck, abandonmentDay } from './abandonment';
import { retireCarts, withFourWheelReach } from './carts';
import { updateOrePits } from './smith-supply';
import { finishPurchases, startPurchases } from './craft-buying';
import { withCraftSkill } from './craft-skill';
import { cartIronDay } from './cart-iron';
import { cloneState } from './clone';
import { updateKilnRemnants } from './charcoal';
import { craftCoverage, wearCraftStocks } from './crafts';
import { updateHappiness } from './happiness';
import { occupyEmptyDwellings } from './households';
import { withKinship } from './kinship';
import { withPenSpecies } from './pens';
import { husbandryDay } from './husbandry';
import { arrangeMarriages } from './marriage';
import { withOxen } from './oxen';
import { overgrowthDay } from './overgrowth';
import { roadsDay, roadsMonth } from './paths/roads';
import { refreshWalkDistances } from './paths/village';
import { flushWear } from './paths/wear';
import { roadFieldsDay } from './road-fields';
import { villageSacredOaks } from './sacred';
import { moveGrainFromCoveredPits } from './grain-pit-site';
import { withThreshingGrace, spoilSheaves } from './threshing';
import { withSeason } from './year-plan';
import { sacredOakEvents } from './sacred-life';
import { orchardSeasonDay } from './orchard';
import { inLuckyYears, nextStarvationDays, populationDay } from './population';
import { withCattleKinds } from './cattle-trade';
import { keepManor } from './manor';
import { finishExpeditions, withIronBarsTrade, withoutForeignGoods } from './trade';
import { withToolEquipment } from './iron';
import { swathRoadsInWork, trailsDay } from './trail';
import { roadSwathDay } from './road-swath';
import { wagonRoadsDay } from './wagon-road';
import { isVillageDormant } from './departure';
import { withDynasty } from './dynasty';
import { ensureMainWives, extraWivesDay } from './dynasty-wives';
import { updateRuins } from './ruins';
import {
  CHRONICLE_MAX_EVENTS,
  HARVEST_DAY,
  PLANNING_DAY,
  THRESH_END_DAY,
  WINTER_HARVEST_DAY,
} from './rules';
import type { VillageState } from './types';
import { rotLogs } from './wood';
import { decideRebuilds, finishConstructions } from './simulate-build';
import { eat, endThreshing, harvest, harvestWinter } from './simulate-food';
import { isOn, lordHelpDay, seasonDay, startSeason } from './simulate-plan';
import { work } from './simulate-work';
import { lordFieldMode, trainLordDay, updateLordTraining } from './lord';
import { dynastyDay } from './succession';

/**
 * Dopočítá ves do dne `toDay` včetně – den po dni od `lastDay + 1`. Vstup nemění.
 * Výsledek nezávisí na tom, po jakých kouscích se dopočítává (náhoda dne je ze seedu a dne;
 * kronika se zkrátí na posledních CHRONICLE_MAX_EVENTS událostí – simulace ji nečte).
 * `obstacles` = vrstva překážek krajiny sídla: přestavby podle ní vyhradí stromy ke kácení
 * (forest.md). Povinná – `null` (kácení bez polohy) jen v testech; volající ji musí dávat vždy
 * stejně, jinak výsledek na kouscích závisí. `landscape` = krajina sídla jen pro přestavbu
 * polozemnice bez pozemku – postaví ji na nejbližším volném políčku (`relocationPlot`); bez ní
 * (testy, měření) se obydlí přestaví na místě. Také ji volající dává vždy stejně.
 * Vymřelá ves (`extinctDay`) se už nesimuluje – jen se posune `lastDay`; lidé, pole, stavby,
 * zásoby i klády stojí, jak byly v den vymření.
 * RangeError, když `toDay` leží za koncem světa nebo před už odsimulovaným dnem.
 */
export function advanceVillage(
  state: VillageState,
  toDay: number,
  obstacles: ObstacleLayer | null,
  landscape: Landscape | null = null,
): VillageState {
  const steps = advanceVillageSteps(state, toDay, obstacles, landscape);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * `advanceVillage` po dnech: po každém odsimulovaném dni se zastaví (vrátí jeho index), aby
 * volající mohl mezi dny pustit ke slovu jinou práci (server – dlouhý dopočet neblokuje ostatní
 * požadavky). Výsledek (hodnota po posledním kroku) je stejný jako u `advanceVillage` – je to
 * tatáž smyčka, stav se klonuje jen jednou. RangeError jako `advanceVillage` (při prvním kroku).
 */
export function* advanceVillageSteps(
  state: VillageState,
  toDay: number,
  obstacles: ObstacleLayer | null,
  landscape: Landscape | null = null,
): Generator<number, VillageState, void> {
  if (!Number.isInteger(toDay) || toDay >= TOTAL_GAME_DAYS) {
    throw new RangeError(`Den ${toDay} neleží ve světě (0 až ${TOTAL_GAME_DAYS - 1}).`);
  }
  if (toDay < state.lastDay) {
    throw new RangeError(`Ves je dopočítaná do dne ${state.lastDay}, nelze zpět na ${toDay}.`);
  }
  // ves z doby před příbuzenstvím dostane pohlaví a manžele (kinship.md), ves z doby před rodem
  // rod vojvody (lord.md – Převod starších vsí), dobytek v obchodu tři
  // druhy (trade.md – Dobytek ve třech druzích), hřivny místo nástrojů v obchodu i ve vsi
  // (production-chains.md – Kovář), ves ze zboží zvenku o něj přijde (trade.md – Jen společné
  // suroviny), řemeslníci z doby před učením řemesla praxi (crafts.md – Učení řemesla) a ves z doby
  // před snopy rok odkladu mlácení (production-chains.md – Starší vsi) – jednou, idempotentně
  const next = cloneState(
    withThreshingGrace(
      withCraftSkill(
        withOxen(
          withPenSpecies(
            withoutForeignGoods(
              withIronBarsTrade(
                withToolEquipment(withCattleKinds(withDynasty(withKinship(withSeason(state))))),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  // dosahy čtyřkoláku z doby „jen po pevných cestách“ se spočítají znovu (wagons.md)
  withFourWheelReach(next);
  // vymřelá, opuštěná a ves na cestě se nesimulují – jen se posune den (migration.md)
  for (let day = next.lastDay + 1; day <= toDay && !isVillageDormant(next); day++) {
    simulateDay(next, day, obstacles, landscape);
    yield day;
  }
  next.lastDay = toDay;
  trimChronicle(next);
  // vyšlapanost drží dopočet v paměti – do stavu ji zapíše až teď (paths.md – Výkon)
  if (next.roads?.wear) flushWear(next.roads.wear);
  return next;
}

/** Kronika drží jen posledních CHRONICLE_MAX_EVENTS událostí (mutuje stav). */
function trimChronicle(state: VillageState): void {
  const excess = state.chronicle.length - CHRONICLE_MAX_EVENTS;
  if (excess > 0) state.chronicle.splice(0, excess);
}

/** Jeden den vsi v pevném pořadí kroků (mutuje stav). */
function simulateDay(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  landscape: Landscape | null,
): void {
  const date = dateOfDayIndex(day);
  // vojvodova rodina (lord.md): cvičí, nebo pracuje – rozhodnout jednou na začátku dne, ať ho
  // stejně vidí pasení, plán osevu, nákupy i `work()` (i v den přechodu)
  updateLordTraining(state, day);
  // nové stavby dne – jámy pod nimi se vyprázdní (production-chains.md – Obilné jámy): stavby vsi
  // vznikají jen s novým id z `nextId`, viz kontrola níž
  const idsBefore = state.nextId;
  // vzdálenosti chůze dílů po pěšinách – jen když se změnilo rozložení vsi (paths.md); bez
  // krajiny (kalibrace, testy) zůstávají přímé vzdálenosti
  // vyšlapanost a vznik cest (paths.md – Vyšlapanost a vznik cesty): 1. dne v měsíci interval se
  // stálými trasami a z vyšlapaných čar tras nové cesty; přepočet tras ji sečte sám (před novými
  // trasami)
  if (landscape && date.day === 1) roadsMonth(state, day, landscape, obstacles);
  // pevné cesty ubírají polím plochu (roads.md a fields.md – Cesta přes pole) – jen když se od
  // včerejška změnily cesty nebo čtverce polí
  if (landscape) roadFieldsDay(state, day, landscape);
  if (landscape) refreshWalkDistances(state, day, landscape, obstacles);
  // pokrytí výrobky řemeslníků ze včerejších zásob – meze produktivity celého dne (crafts.md)
  const coverage = craftCoverage(state, day);
  rotLogs(state);
  // snopy, které dnes nikdo nemlátí, se kazí (production-chains.md – Humno)
  spoilSheaves(state, day);
  // vozy, které dosloužily – tesař vyrobí nové (wagons.md – Vůz)
  state.chronicle.push(...retireCarts(state, day));
  // sady: shnilá jablka, konec péče a stárnutí (1. 3.), začátek a konec sklizně a péče, obnova
  // starých čtverců v oknech výsadby (stavba ze společné práce – dostane práci už dnes)
  state.chronicle.push(...orchardSeasonDay(state, day, coverage.pottery));
  // zarůstání přílohu (1. 11., před porážkou – stáda jsou ještě letní): díly, které se nespásly
  // ani neposekly, zarůstají, les z pole vypadne (fields.md – Zarůstání)
  state.chronicle.push(...overgrowthDay(state, day, obstacles ?? landscape));
  // stáda, seno a ohrady: mláďata, seč, porážka, vejce, zimní krmení, spřežení (diet.md, oxen.md)
  state.chronicle.push(...husbandryDay(state, day, coverage.tools, landscape, obstacles));
  // ušetřené posvátné duby stářím usychají a souše padají – den plyne z dubu (happiness.md)
  state.chronicle.push(...sacredOakEvents(villageSacredOaks(state), obstacles, day));
  // 1. 9. nový hospodářský rok a postup dílů, každý den nutné díly a konce oken setí (fields.md –
  // Osevní postup po dílech); podíl dne rodiny na nutné práci (lord.md – Kdy jde rodina na pole)
  if (isOn(date, PLANNING_DAY)) startSeason(state, day, coverage, landscape);
  seasonDay(state, day, coverage);
  lordHelpDay(state, day, coverage, landscape);
  // nákup výrobků řemeslníků u sousedů – jednou za rok po sklizni, ves se rozhodne sama
  // (crafts.md – Nákup u sousedů); skupina vyrazí hned
  startPurchases(state, day, coverage, landscape);
  const { toil, lordField } = work(state, day, obstacles, coverage, landscape);
  // nástroje a nádoby v užívání se opotřebí (crafts.md – Účinek)
  wearCraftStocks(state, day);
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
  finishConstructions(state, day);
  // dvorec vojvody – po zániku dvorce nejstarší obydlí, starší ves dvorec dostane (trade.md)
  keepManor(state);
  decideRebuilds(state, day, obstacles, landscape);
  occupyEmptyDwellings(state, day);
  // zbytky jam po zaniklých obydlích zarůstají, pod novou stavbou zmizí (ruins.ts)
  updateRuins(state, day, landscape);
  updateOrePits(state, day);
  updateKilnRemnants(state, day);
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
  // sňatky mezi domy – svobodní ve dvou domech se vezmou (population.md – Sňatky mezi domy); muž
  // bez hlavní manželky, který nějakou manželku má (osadníci výpravy), se před nimi nežení
  // (lord.md – Nová hlavní manželka); pak další manželky mužů rodu z okolí (lord.md – Manželky)
  state.chronicle.push(...ensureMainWives(state, day));
  state.chronicle.push(...arrangeMarriages(state, day));
  state.chronicle.push(...extraWivesDay(state, day));
  const { satiation, energy, fruit, meat } = eat(state, day, coverage);
  // vojvodova rodina (lord.md): při hladu jde od zítřka na pole, po 30 dnech plného přídělu zpět;
  // výcvik dne – kdo necvičil, zapomíná
  state.chronicle.push(...lordFieldMode(state, day));
  // a koně pod jezdci (horses.md – Výcvik koně a jezdec) – po péči (`work()`) a obilí (`eat()`)
  state.chronicle.push(...trainLordDay(state, day, lordField));
  // nahromaděný hlad se počítá z dnešní energie (hladem se umírá z energie, ne z pestrosti –
  // diet.md) – úmrtí dne podle něj (population.md); v hájení zůstává pod prahem, aby po něm lidé
  // umírali postupně
  state.starvationDays = nextStarvationDays(
    state.starvationDays ?? 0,
    energy,
    inLuckyYears(state.foundedDay, day),
  );
  const events = populationDay(state, day, satiation, energy);
  state.chronicle.push(...events);
  // nová hlavní manželka a nástupnictví (lord.md – Rod vojvody); ves bez rodu nic
  state.chronicle.push(...dynastyDay(state, day));
  // štěstí na konci dne – hlad, úmrtí, přeplněnost, dřina, zásoby, ovoce, maso a posvátná místa
  // (happiness.md, diet.md)
  updateHappiness(state, day, { satiation, events, toil, fruit, obstacles, meatShare: meat });
  if (state.people.length === 0) {
    // zemřel poslední člověk – ves vymřela, dál se nesimuluje (ani sklizeň dne)
    state.extinctDay = day;
    state.chronicle.push({ day, kind: 'village-extinct' });
    return;
  }
  // Sklizeň a ztráta nevymláceného až po jídle (Ruling 13) – 31. 8. se jí ještě z loňských
  // zásob, jak počítá daysUntilHarvest (31. 8. → 1 den); ozim stejně 31. 7.
  if (isOn(date, WINTER_HARVEST_DAY)) harvestWinter(state, day);
  if (isOn(date, HARVEST_DAY)) harvest(state, day);
  if (isOn(date, THRESH_END_DAY)) endThreshing(state);
  // pevné cesty (roads.md): práce dne do ročního součtu, 1. 11. roční kontrola cest a stromů
  const visits = roadsDay(state, day, landscape, obstacles);
  // opuštěné stavby (abandonment.md): 1. 11. podle provozu roční sítě začnou nebo přestanou
  // chátrat, každý den spadnou ty, jejichž stav došel na nulu
  if (visits) abandonmentCheck(state, day, visits);
  state.chronicle.push(...abandonmentDay(state, day, landscape));
}
