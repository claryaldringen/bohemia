import { dateOfDayIndex } from '../calendar';
import type { CalendarDate } from '../calendar';
import { SLAUGHTER_DAY, spoilMeat } from './diet';
import {
  AFTERMATH_DAY,
  closeMowingSeason,
  feedHay,
  HAY,
  HAY_WINTER_DAYS,
  horsesHayCoverage,
  isAfterMowingSeason,
  isHayWinter,
  isMowingSeason,
  MOWING_DAY,
  mowingCapacityKg,
  mowingCut,
  planAftermath,
  planMowing,
  PLAN_HAY_KEEP,
  type MowingNeed,
  raiseAftermath,
  rotHay,
  startMowingSeason,
  spoilOldHay,
  villageHay,
  villageHayKg,
  winterHayKg,
} from './hay';
import { cowsComing } from './cattle-trade';
import { foodCosts, type FoodCosts } from './economy';
import { herdingCoverage } from './herding';
import { horsesDay } from './horse-breeding';
import { horsesWinterEnd } from './horse-feed';
import { horseHayDailyKg, horsesInPlaces, villageHorses } from './horses';
import { HAY_CUTS, HORSES } from './rules';
import type { Landscape, ObstacleLayer } from '../landscape';
import {
  BIRTH_DAY,
  LIVESTOCK,
  balancedPlan,
  ensureLivestock,
  herdBirths,
  herdLosses,
  herdRecord,
  householdCount,
  slaughter,
  hayShortSlaughter,
  villageHerds,
  wantedWinterHerds,
  winterSlaughterDay,
  winterWaitHayKg,
} from './livestock';
import {
  closeCartYear,
  oxenCows,
  oxenTrainingTarget,
  oxYearCost,
  wantedPloughPairs,
} from './draft';
import {
  ableTeams,
  lastingOxen,
  looseOxenDay,
  oxenComing,
  penDay,
  trainTeamsWhenReady,
  villageOxen,
} from './oxen';
import { herdRoom, homesteadRoom, penCapacity, pensLimitHerds } from './pens';
import { walkDistancesTo } from './paths/village';
import { villageRoadWalk } from './paths/walking';
import type { ChronicleEvent, HerdSpecies, VillageState } from './types';
import { recordWool, woolSheep } from './wool';

// Den hospodářství vsi (diet.md, oxen.md) – stáda, seno a ohrady v pevném pořadí, před plánem
// osevu a prací dne: roční ztráty stád a seno ve stohu (každý den), ohrady volů (výcvik, stáří
// volů, 1. 3. pokrytí sena), 1. 4. mláďata a konec zimy, výcvik
// volů, kdykoli jde (začíná sám), 25. 5. zkažené loňské seno a plán 1. seče (s krajinou
// i přirozené louky), 1. 8. plán otavy, 1. 9. zkažené maso, 1. 11. porážka a začátek zimy, v zimě porážka při nedostatku sena a seno. Mléko a vejce se jí čerstvé v kroku jídla (diet.ts),
// dojení, péče a pasení jsou práce dne.

/** Konec zimy pro voly a stádo (1. 3.) – pokrytí sena rozhodne o jarní orbě a úhynu. */
const WINTER_END = { month: 3, day: 1 } as const;

function isOn(date: CalendarDate, target: { month: number; day: number }): boolean {
  return date.month === target.month && date.day === target.day;
}

/**
 * Krávy, které ves drží vždy (diet.md – Skladba stáda; Martin 19. 10. 2026: krávy „potřebujeme
 * kvůli tažným volům“): kráva na 2 domácnosti (mléko – jako výchozí stádo) a k nim s ohradou volů
 * krávy na telata pro všechny voly, které ves chce na rádla i vozy, i s obměnou (`oxenCows` –
 * diet.md, Krávy na obměnu volů; cíl krav podle volů – Martin 20. 10. 2026: „Dejme možnost 1.“,
 * dřív víc z obojího); aspoň chovný pár. Ves si je nechá při porážce (`farmInput` – `minCows`);
 * pastva, seno, pasáci a místa v ohradách stádo omezují dál. Krávy stojí na noc jen v ohradě skotu
 * – bez ní jen chovný pár (oxen.md – Ohrady podle druhu).
 */
export function breedingCows(state: VillageState): number {
  return Math.max(
    LIVESTOCK.breedingMin,
    householdCount(state) / LIVESTOCK.householdsPerCow + oxenCows(state),
  );
}

/** Na jak dlouho dopředu (dní) ves při porážce myslí na telata do výcviku – do dalších mláďat. */
const CALVES_AHEAD_DAYS = 365;

/**
 * Telata, která ves potřebuje do výcviku volů (oxen.md – Voli po kusech): kolik volů chce v místech
 * ohrad (`oxenTrainingTarget`) bez těch, se kterými počítá i za rok (`lastingOxen` – telata ve
 * výcviku a voli mimo posledních 2 let služby; náhrada, která přijde na řadu do dalších mláďat, se
 * počítá už teď). Ves si na ně přes zimu nechá tolik krav navíc nad chovné stádo (`farmInput` –
 * `minCows`), aby na jaře z přírůstku byla a výcvik začal včas (diet.md – Krávy na obměnu volů).
 */
export function oxenCalvesWanted(state: VillageState, day: number): number {
  return Math.max(0, oxenTrainingTarget(state) - lastingOxen(state, day + CALVES_AHEAD_DAYS));
}

/**
 * Voli, kteří budou přes zimu žrát seno – ves počítá s voly, které cvičí a krmí
 * (`oxenTrainingTarget` – výcvik začne sám a telata seno potřebují – oxen.md), aspoň s těmi, které
 * má, i s těmi, které výprava teprve přivede (`oxenComing` – trade.md, Dobytek ve třech druzích).
 */
function hayOxen(state: VillageState): number {
  // i voli bez ohrady (migration.md – Vůz při odchodu)
  return (
    Math.max(villageOxen(state) + oxenComing(state), oxenTrainingTarget(state)) +
    (state.looseOxen?.length ?? 0)
  );
}

/** Stádo i s kravami, které výprava teprve přivede (`cowsComing`). */
function withCowsComing(
  state: VillageState,
  herds: Readonly<Record<HerdSpecies, number>>,
): Record<HerdSpecies, number> {
  const coming = cowsComing(state);
  return herdRecord((s) => herds[s] + (s === 'cow' ? coming : 0));
}

/**
 * Krávy a voli pro seč (i na cestě a bez ohrady) – přibude-li jich během otavy, plán otavy se zvedne
 * (`raiseAftermath`).
 */
function hayCattle(state: VillageState): number {
  return villageHerds(state).cow + cowsComing(state) + hayOxen(state);
}

/**
 * Seno pro stádo, které ves stihne posekat (kg v zimní dávce – oxen.md, Stáda podle práce na seč;
 * návrh Clauda, Martin 25. 10. 2026: seče vložit tak, „aby to neohrozilo ostatní polní práce“): loňská
 * volná práce v oknech seče (`mowingCapacityKg`) po ztrátách ve stohu, bez sena volů a koní (mají ho
 * první). Bez zápisu undefined – stáda bez stropu.
 */
function mowableHerdHayKg(state: VillageState, day: number): number | undefined {
  const capacity = mowingCapacityKg(state);
  if (capacity === undefined) return undefined;
  const oxenKg = hayOxen(state) * HAY.dailyKg.ox * HAY_WINTER_DAYS;
  const horsesKg = horseHayDailyKg(villageHorses(state), day) * HAY_WINTER_DAYS;
  return Math.max(0, capacity * PLAN_HAY_KEEP - oxenKg - horsesKg);
}

/**
 * Seno, které ves na zimu potřebuje (kg – oxen.md, Seno): zimní stádo, které si chce nechat
 * (nosnost pastvy, lesa, pasáků a místo pro mláďata – `wantedWinterHerds`; s rezervou strop seče –
 * `mowingNeed`, oxen.md, Seno, dvě seče),
 * a voli ohrad, po zimní dávce celou zimu, koně (horses.md – Krmení; jezdečtí s obilím, hříbata
 * podle stáří v den seče), a kusy na maso, dokud nepřijdou na řadu zimní porážky (`winterWaitHayKg`
 * – diet.md, Porážka v zimě).
 */
export function winterHayNeedKg(state: VillageState, day: number, toolCoverage = 0): number {
  const input = farmInput(state, day, toolCoverage);
  const herds = withCowsComing(state, wantedWinterHerds(state, day, input));
  return (
    winterHayKg(herds, hayOxen(state), horseHayDailyKg(villageHorses(state), day)) +
    winterWaitHayKg(state, day, herds, input.oxen, input.room)
  );
}

/**
 * Kolik sena ves na zimu seče (oxen.md – Seno, dvě seče; návrh Clauda schválený Martinem
 * 25. 10. 2026): nutné je seno na dnešní stádo i s letošními mláďaty (nejvýš zimní stádo, které si
 * ves chce nechat – zbytek půjde 1. 11. na maso), voly ohrad a koně, a na kusy čekající na zimní
 * porážku; strop je zimní stádo v cílové velikosti (`winterHayNeedKg` – pastva, les, pasáci, místa
 * v ohradách a seno, které ves stihne posekat, v pořadí přednosti) a rezerva `HAY_CUTS.reserve` –
 * víc stáda nesnědí, shnilo by. Krávy a voli, které výprava teprve přivede, se počítají.
 */
export function mowingNeed(state: VillageState, day: number, toolCoverage = 0): MowingNeed {
  const input = farmInput(state, day, toolCoverage);
  const wanted = withCowsComing(state, wantedWinterHerds(state, day, input));
  const today = withCowsComing(state, villageHerds(state));
  const oxen = hayOxen(state);
  const horsesKg = horseHayDailyKg(villageHorses(state), day);
  const waiting = winterWaitHayKg(state, day, wanted, input.oxen, input.room);
  return {
    necessaryKg:
      winterHayKg(
        herdRecord((s) => Math.min(today[s], wanted[s])),
        oxen,
        horsesKg,
      ) + waiting,
    capKg: (winterHayKg(wanted, oxen, horsesKg) + waiting) * (1 + HAY_CUTS.reserve),
  };
}

/** Seno koní za den zimy (kg) – jezdečtí koně bez obilí 7 kg (`state.horsesFed`). */
function horsesHayToday(state: VillageState, day: number): number {
  return horseHayDailyKg(villageHorses(state), day, state.horsesFed !== false);
}

/**
 * Cena jídla v práci za dnešních podmínek vsi (diet.md – Rovnovážné hospodaření) – s orbou, když
 * ves má pár volů s rádlem.
 */
export function villageFoodCosts(
  state: VillageState,
  day: number,
  toolCoverage: number,
): FoodCosts {
  return foodCosts(state, day, toolCoverage, ableTeams(state, day) > 0);
}

/** Co ves o chovu ví (voli, krávy na mléko a voly, pasáci – výrostci, cena jídla v práci). */
function farmInput(
  state: VillageState,
  day: number,
  toolCoverage: number,
): {
  oxen: number;
  cowsComing?: number;
  mowKg?: number;
  minCows: number;
  minSheep: number;
  herding: number;
  costs: FoodCosts;
  room?: Record<HerdSpecies, number>;
  horsePastureHa?: number;
  horseHayKg?: number;
} {
  const horses = villageHorses(state);
  const mowKg = mowableHerdHayKg(state, day);
  const coming = cowsComing(state);
  return {
    // i voli a krávy, které výprava teprve přivede (trade.md – Dobytek ve třech druzích)
    oxen: villageOxen(state) + oxenComing(state),
    ...(coming > 0 ? { cowsComing: coming } : {}),
    // stádo jen na seno, které ves stihne posekat (oxen.md – Stáda podle práce na seč)
    ...(mowKg !== undefined ? { mowKg } : {}),
    // koně se pasou se stády a seno mají před nimi (horses.md – Krmení)
    ...(horses.length > 0
      ? {
          horsePastureHa: horsesInPlaces(horses, day) * HORSES.pastureHa,
          horseHayKg: horseHayDailyKg(horses, day) * HAY_WINTER_DAYS,
        }
      : {}),
    // chovné krávy a krávy navíc na telata, která ves do výcviku volů potřebuje
    minCows: breedingCows(state) + oxenCalvesWanted(state, day),
    minSheep: woolSheep(state, day),
    herding: herdingCoverage(state),
    costs: villageFoodCosts(state, day, toolCoverage),
    // místa na noc – ohrady svého druhu a pár kusů u domů (oxen.md – Ohrady podle druhu); po
    // ročním odkladu (nová ves, převod)
    ...(pensLimitHerds(state, day) ? { room: herdRoom(state) } : {}),
  };
}

/** Místa na noc jednoho druhu stáda – pro panel ohrady (`herdPlaces`). */
export interface HerdPlaces {
  /** Místa hotových ohrad svého druhu (`penCapacity`). */
  pens: number;
  /** Kusy, které udrží domy bez ohrady (`homesteadRoom`). */
  home: number;
  /**
   * Kolik míst v ohradách svého druhu by stádo potřebovalo: stádo, které by si ves chtěla nechat
   * přes zimu, kdyby ji ohrady neomezovaly (`wantedWinterHerds` bez míst – pastva, seno, les,
   * pasáci a potřeba jídla platí dál), s jarními mláďaty – nejméně dnešní stádo; bez kusů u domů
   * a bez chovného páru s mláďaty (zůstane vždy).
   */
  needed: number;
}

/**
 * Místa na noc po druzích stáda (oxen.md – Ohrady podle druhu, Co hráč vidí): co mají ohrady, co
 * udrží domy a kolik míst v ohradách by stádo potřebovalo (`HerdPlaces`). Ves bez dobytka nic
 * nepotřebuje. Stav nemění.
 */
export function herdPlaces(
  state: VillageState,
  day: number,
  toolCoverage = 0,
): Record<HerdSpecies, HerdPlaces> {
  const pens = penCapacity(state);
  const home = homesteadRoom(state);
  const herds = state.livestock?.herds;
  const species = ['sheep', 'goat', 'pig', 'cow'] as const;
  if (!herds) {
    return Object.fromEntries(
      species.map((s) => [s, { pens: pens[s], home: home[s], needed: 0 }]),
    ) as Record<HerdSpecies, HerdPlaces>;
  }
  // stádo podle potřeby, jako by místa ohrad nebyla
  const input = { ...farmInput(state, day, toolCoverage) };
  delete input.room;
  const wanted = wantedWinterHerds(state, day, input);
  return Object.fromEntries(
    species.map((s) => {
      const growth = 1 + LIVESTOCK.growth[s];
      const peak = Math.max(Math.round(herds[s]), wanted[s] * growth);
      // chovný pár i s mláďaty zůstane vždy, ohradu nepotřebuje (diet.md – Místa na noc)
      const free = Math.max(home[s], LIVESTOCK.breedingMin * growth);
      const needed = Math.max(0, Math.ceil(peak - free - 1e-9));
      return [s, { pens: pens[s], home: home[s], needed }];
    }),
  ) as Record<HerdSpecies, HerdPlaces>;
}

/**
 * Kolik luštěnin ves chce sníst za rok (kg – diet.md, Rovnovážné hospodaření): luštěniny v plánu
 * chovu a osevu, kde soupeří cenou v práci s prasaty a přežvýkavci o bílkoviny (osev 1. 9.).
 */
export function plannedLegumeKg(state: VillageState, day: number, toolCoverage: number): number {
  return balancedPlan(state, day, farmInput(state, day, toolCoverage)).legumeKg;
}

/**
 * Den hospodářství (mutuje stav); vrací události kroniky. S krajinou seče i přirozené louky,
 * od nejbližší po pěšinách (vrstva překážek zpřesní síť pěšin jako u dílů pole).
 */
export function husbandryDay(
  state: VillageState,
  day: number,
  toolCoverage: number,
  landscape: Landscape | null = null,
  obstacles: ObstacleLayer | null = null,
): ChronicleEvent[] {
  const date = dateOfDayIndex(day);
  const livestock = ensureLivestock(state);
  // nemoci, vlci, úrazy – denní díl ročních ztrát; seno ve stohu ztrácí počasím
  herdLosses(state);
  rotHay(state);
  const winterEnd = isOn(date, WINTER_END);
  // pokrytí sena stáda – s voly, kteří zimu přečkali (dřív, než penDay rozhodne o jejich úhynu)
  // a koně (horses.md – Krmení) – seno mají po volech a před stádem
  const horsesKg = horsesHayToday(state, day);
  const horsesCoverage =
    winterEnd && horsesKg > 0 ? horsesHayCoverage(state, villageOxen(state), horsesKg) : 1;
  const events = penDay(state, day, winterEnd, toolCoverage);
  if (horsesCoverage < 1) events.push(...horsesWinterEnd(state, day, horsesCoverage));
  // chov koní – hříbata 1. 5., koně na maso 1. 11. před porážkou stád (horses.md – Chov)
  events.push(...horsesDay(state, day));
  // voli osadníků bez ohrady přejdou do první ohrady volů (migration.md – Vůz při odchodu)
  events.push(...looseOxenDay(state, day));
  if (isOn(date, BIRTH_DAY)) {
    herdBirths(state);
    if (state.hay) delete state.hay.winter;
  }
  // co ulehčí práci a ves to má, vesničané používají sami – voli se cvičí bez hráče, první
  // vhodný den, kdy jich ves chce víc (oxen.md – Spřežení, Voli po kusech); po mláďatech, ať jsou
  // telata
  trainTeamsWhenReady(
    state,
    day,
    obstacles,
    {
      oxen: oxenTrainingTarget(state),
      ploughPairs: wantedPloughPairs(state),
      breedingCows: breedingCows(state),
    },
    landscape ? () => villageRoadWalk(state, landscape) : undefined,
  );
  if (isOn(date, MOWING_DAY)) {
    // stoh přes rok – zbytek loňského sena se zkazil (oxen.md – Seno)
    spoilOldHay(state);
    const walk = landscape
      ? (targets: readonly { x: number; z: number }[]): number[] | null =>
          walkDistancesTo(state, day, landscape, obstacles, targets)
      : null;
    const mowing = planMowing(
      state,
      day,
      mowingNeed(state, day, toolCoverage),
      toolCoverage,
      landscape,
      walk,
    );
    if (mowing || state.hay) state.hay = { ...villageHay(state), mowing };
    // volná práce na seč letošní sezóny od nuly (oxen.md – Stáda podle práce na seč)
    startMowingSeason(state);
  }
  // otava jen na loukách posečených v 1. seči, kolik stádům ze stropu chybí; bez ní 1. seč zůstane
  // (oxen.md – Seno, dvě seče)
  if (isOn(date, AFTERMATH_DAY) && state.hay) {
    const aftermath = planAftermath(state, mowingNeed(state, day, toolCoverage), toolCoverage);
    if (aftermath) state.hay.mowing = { ...aftermath, cattle: hayCattle(state) };
  } else if (state.hay?.mowing && mowingCut(state.hay.mowing) === 2 && isMowingSeason(day, 2)) {
    // přibyl dobytek (koupený, i na cestě) – otava na něj seče, dokud běží její okno
    const mowing = state.hay.mowing;
    const cattle = hayCattle(state);
    if (cattle > (mowing.cattle ?? Infinity) + 1e-9) {
      raiseAftermath(state, mowingNeed(state, day, toolCoverage));
      mowing.cattle = cattle;
    }
  }
  // po otavě se sezóna seče uzavře – strop stád na příští rok (oxen.md – Stáda podle práce na seč)
  if (state.hay?.mowFree && isAfterMowingSeason(day)) closeMowingSeason(state);
  // uzené maso z loňské porážky vydrží přes žně – 1. 9. se zbytek zkazí (diet.md)
  const spoiled = spoilMeat(state, day);
  if (spoiled) events.push(spoiled);
  if (isOn(date, SLAUGHTER_DAY)) {
    const event = slaughter(state, day, {
      ...farmInput(state, day, toolCoverage),
      hayKg: villageHayKg(state),
    });
    if (event) events.push(event);
    // vlna na oděv do další porážky – podle ovcí, které ves nechala přes zimu (diet.md – Oděv);
    // ovce na zimní porážku se do jara nedožijí
    const wool = recordWool(
      state,
      livestock,
      day,
      livestock.herds.sheep - (livestock.culling?.sheep ?? 0),
    );
    if (wool) events.push(wool);
    // nový rok pasení – od porážky do porážky
    delete livestock.herding;
    // rok vozů – podle loňského provozu ves ví, kolik vozů se vyplatí (wagons.md – Kolik vozů
    // ves chce); vůl stojí seno v práci za dnešních cen
    closeCartYear(state, day, oxYearCost(villageFoodCosts(state, day, toolCoverage).hayPerKg));
    if (state.hay)
      state.hay.winter = { oxenNeedKg: 0, oxenEatenKg: 0, herdNeedKg: 0, herdEatenKg: 0 };
  }
  // zimní porážka po dnech – čerstvé maso dne; zbytek 31. 3. do uzení (diet.md – Porážka v zimě)
  winterSlaughterDay(state, day);
  if (isHayWinter(day)) {
    // seno do konce března nevystačí – ves hned porazí kusy, na které nezbude, ať zvířata
    // nehladoví (oxen.md – Co nejvíc sena a co největší stáda; dřív zimní úhyn 1. 3.)
    const short = hayShortSlaughter(state, day, villageOxen(state), horsesHayToday(state, day));
    if (short) events.push(short);
    feedHay(state, villageOxen(state), livestock.herds, horsesHayToday(state, day));
  }
  return events;
}
