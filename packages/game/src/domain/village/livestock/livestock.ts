import { addSlaughterWares } from '../wares/wares';
import { dateOfDayIndex, dayIndexOf, isLeapYear } from '../../calendar';
import { dairyDams, yearlyMilk } from './dairy';
import { foxEggFactor } from '../wildlife/fox-eggs';
import { PREDATION } from '../rules/rules-wildlife';
import { DIET, PROTEIN, proteinNeedPerDay, villageFoodNeed } from '../core/diet';
import type { FoodCosts } from './economy';
import { HERDING, herderCapacity, herdingDemand, type HerdingState } from './herding';
import { isOvergrown } from '../fields/fields';
import { fallowPastureHa, hayPlanNaturalHa, PASTURE, pastureParts } from '../fields/pasture';
import {
  HAY,
  HAY_EATERS,
  HAY_WINTER_DAYS,
  hayLeftAvailable,
  hayWinterDaysLeft,
  herdWinterHayKg,
  isHayWinter,
  strawAsHayKg,
  strawComingKg,
  villageHayKg,
  waitingHerdHayKg,
  winterHayAvailable,
  winterHayKg,
} from './hay';
import { snowDaysAhead } from '../disasters/snow';
import {
  hasWeather,
  isLongWinterRevealed,
  pastureWeatherFactor,
  summerOf,
} from '../disasters/weather-effects';
import { legumeSupplyPerYear } from '../fields/legumes';
import { ageGroup } from '../people/people';
import { woolSheep } from './wool';
import { PLANNING_DAY } from '../rules';
import { FOOD_NEED_KG_PER_YEAR, HERD_BREEDING, HERD_RETIREMENT, HORSES, LEGUMES } from '../rules';
import type {
  ChronicleEvent,
  DwellingType,
  HerdSpecies,
  LivestockState,
  VillageState,
} from '../types';

// Dobytek (diet.md – Dobytek, schváleno 18. 10. 2026): skutečná stáda ovcí, koz, prasat a krav.
// Stáda rostou mláďaty na jaře až do nosnosti – pastva na úhoru a loukách (ovce, kozy, krávy), les
// do 600 m od vsi (prasata, žaludy a bukvice na podzim), seno na zimu (krávy, voli, ovce a kozy)
// a pasáci (výrostci). Každý den část stáda uhyne (nemoci, vlci, úrazy – roční ztráty po druzích,
// Martin 19. 10. 2026). Porážka celý rok (diet.md – Strava po vrstvách a porážka celý rok, Martin
// 18. 11. 2026; dřív Porážka v zimě): 1. 11. ves rozhodne, co nechá přes zimu – nosnost, místo pro
// jarní mláďata podle výrostků příštího léta, bez starých kusů – a kusy na maso rozloží na celou zimu
// po dnech, aby maso jedla čerstvé (přebytek udí); v létě porazí kus pro rod vojvody
// (summer-slaughter.ts); chovné stádo se zmenší na velikost, která mlékem a mláďaty dá bílkoviny
// na potřebu vsi s rezervou
// (Martin 19. 10. 2026: „ano“) – ovce napřed (Martin: „primárním zvířetem by měly být ovce“);
// chovné kusy (aspoň pár od druhu, krávy na mléko a voly) zůstanou. Slepice u obydlí snáší vejce
// (jí se čerstvá). Zásoba masa se uzí a suší a do léta se zkazí (diet.ts). Maso a mléko jsou kvůli
// bílkovinám (Martin): kolik masa ves potřebuje, určí bílkoviny, které chybí po obilí, mléku
// a vejcích. Porážka a uzení 1 člověkoden na 20 kg masa, dojení a péče – dairy.ts.

/**
 * diet.md – Dobytek (návrh Clauda, Martin schválil): výchozí stádo na domácnost 3 ovce, 1 koza,
 * 2 prasata, kráva na 2 domácnosti; mláďata na kus stáda ročně z porodů všech chovných samic
 * (HERD_BREEDING – diet.md, Porážka v zimě: ovce +64 %, kozy +78 %, prasata +144 %, krávy +40 %);
 * pastva 0,2 ha na ovci a kozu, 1 ha na krávu (a vola), 1 ha lesa na prase do 600 m od vsi; maso
 * z kusu prase 50, ovce 15, koza 12, kráva (vůl) 120 kg; slepice 5 kg vajec ročně; porážka
 * a uzení 1 člověkoden na 20 kg. Na maso navíc (když ho ves nemá dost) jde nejvýš polovina
 * letošních mláďat – druhá polovina stádo rozšíří (návrh Clauda při implementaci; bez ní by ves
 * snědla každé mládě a stádo by nikdy nevyrostlo). Mláďata (`growth`) jsou ta, která na jaře
 * přežila první týdny – po zmetání a úhynu novorozených.
 * diet.md – Roční ztráty stáda (Martin 19. 10. 2026: „Určitě doplň roční ztráty stáda“; čísla
 * návrh Clauda podle rešerše research/2026-10-19-herds-hay-meat.md): za rok uhyne podíl stáda –
 * ovce 12 %, kozy 10 %, prasata 12 %, skot 6 % (nemoci, vlci, úrazy), rovnoměrně po dnech.
 * diet.md – Chovné stádo podle potřeby (Martin 19. 10. 2026: „ano“) a Rovnovážné hospodaření
 * (Martin 19. 10. 2026): chovné stádo se při porážce zmenší na nejlevnější skladbu v práci, která
 * dá bílkoviny, které ves potřebuje (`sizeHerdsToNeed`, BALANCE); krávy nejméně na mléko a voly
 * (`breedingCows` v husbandry.ts). Odhad bílkovin z obilí (`proteinBudget`) počítá
 * s obilím na 70 % energie, z mléka s 85 % jeho bílkovin (zbytek odteče se syrovátkou při výrobě
 * sýra – návrh Clauda).
 * Bez údaje o krajině typická krajina (≈ 60 ha luk do 600 m – fields.md, Kolik půdy je; les
 * návrh Clauda).
 */
export const LIVESTOCK = {
  perHousehold: { sheep: 3, goat: 1, pig: 2 },
  householdsPerCow: 2,
  growth: {
    sheep: HERD_BREEDING.femaleShare.sheep * HERD_BREEDING.youngPerDam.sheep,
    goat: HERD_BREEDING.femaleShare.goat * HERD_BREEDING.youngPerDam.goat,
    pig: HERD_BREEDING.femaleShare.pig * HERD_BREEDING.youngPerDam.pig,
    cow: HERD_BREEDING.femaleShare.cow * HERD_BREEDING.youngPerDam.cow,
  },
  /**
   * Roční ztráty bez vlků (nemoci, úrazy; diet.md – Roční ztráty stáda). Vlčí díl
   * `PREDATION.wolfShare` se přidá podle smečky (`predationDay`) – při plné smečce dohromady
   * 12 / 10 / 12 / 6 %.
   */
  lossPerYear: { sheep: 0.09, goat: 0.07, pig: 0.1, cow: 0.05 },
  pastureHa: { sheep: 0.2, goat: 0.2, cow: 1 },
  oxPastureHa: 1,
  forestHaPerPig: 1,
  reachM: 600,
  meatKg: { sheep: 15, goat: 12, pig: 50, cow: 130 },
  oxMeatKg: 130,
  eggsKgPerHen: 5,
  breedingMin: 2,
  youngForMeat: 0.5,
  grainEnergyShare: 0.7,
  milkProteinKept: 0.85,
  slaughterKgPerManDay: 20,
  defaultLand: { meadowHa: 60, forestHa: 40 },
} as const;

/** Druhy stád v pořadí panelu. */
export const HERD_SPECIES: readonly HerdSpecies[] = ['sheep', 'goat', 'pig', 'cow'];
/** Mláďata přibudou 1. 4. (jaro). */
export const BIRTH_DAY = { month: 4, day: 1 } as const;
/** Porážka a uzení se dělají v listopadu (okno práce). */
const SLAUGHTER_MONTH = 11;
/** Slepice u obydlí (Martin – jako ve scéně): zemnice 2, polozemnice 3. */
const CHICKENS_PER_DWELLING: Readonly<Record<DwellingType, number>> = {
  zemnice: 2,
  polozemnice: 3,
  vypleteny: 3,
  srub: 3,
  dvorec: 4,
  'dvorec-srub': 4,
};
/**
 * Na maso navíc jdou mláďata v tomto pořadí – obráceně proti přednosti stád (`HERD_PRIORITY` –
 * prasata první, krávy naposled; oxen.md – Co nejvíc sena a co největší stáda; dřív ovce naposled).
 */
const MEAT_ORDER: readonly HerdSpecies[] = ['pig', 'goat', 'sheep', 'cow'];

const M2_PER_HA = 10_000;
/** Pozemek a ohrada zabírají celé políčko 15 × 15 m. */
const CELL_M2 = 225;
const DAYS_PER_YEAR = 365;
/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

export function herdRecord(value: (s: HerdSpecies) => number): Record<HerdSpecies, number> {
  return { sheep: value('sheep'), goat: value('goat'), pig: value('pig'), cow: value('cow') };
}

/** Za den ze stáda zůstane tento podíl (roční ztráty rovnoměrně po dnech). */
const DAILY_HERD_KEEP: Readonly<Record<HerdSpecies, number>> = herdRecord(
  (s) => (1 - LIVESTOCK.lossPerYear[s]) ** (1 / DAYS_PER_YEAR),
);

/**
 * Den ztrát stáda (mutuje stav – diet.md, Roční ztráty stáda): z každého stáda (i z letošních
 * mláďat) uhyne denní díl roční ztráty. Stádo je číslo s podílem kusu – ztráta je podíl, bez losu.
 */
export function herdLosses(state: VillageState): void {
  const livestock = state.livestock;
  if (!livestock) return;
  for (const species of HERD_SPECIES) {
    livestock.herds[species] *= DAILY_HERD_KEEP[species];
    livestock.young[species] *= DAILY_HERD_KEEP[species];
    if (livestock.culling) livestock.culling[species] *= DAILY_HERD_KEEP[species];
  }
}

/**
 * Dojné samice vsi (`dairyDams` – diet.md, Mléko a sýr): samice, které letos rodily – dospělé kusy
 * stáda bez letošních mláďat × podíl chovných samic.
 */
export function villageDams(state: Pick<VillageState, 'livestock'>): Record<HerdSpecies, number> {
  const livestock = state.livestock;
  return livestock ? dairyDams(livestock.herds, livestock.young) : herdRecord(() => 0);
}

/** Počet domácností – i zakladatelů, kteří bydlí na staveništi první zemnice. */
export function householdCount(state: Pick<VillageState, 'people'>): number {
  return new Set(state.people.map((p) => p.dwellingId)).size;
}

/** Výchozí stádo vsi s `households` domácnostmi (dnešní stáda ozdoby ve scéně). */
export function startingHerds(households: number): Record<HerdSpecies, number> {
  return {
    sheep: households * LIVESTOCK.perHousehold.sheep,
    goat: households * LIVESTOCK.perHousehold.goat,
    pig: households * LIVESTOCK.perHousehold.pig,
    cow: Math.ceil(households / LIVESTOCK.householdsPerCow),
  };
}

/** Dobytek nové vsi nebo vsi uložené před dobytkem – výchozí stádo z domácností. */
export function startingLivestock(
  state: Pick<VillageState, 'people'>,
  land?: { meadowHa: number; forestHa: number },
): LivestockState {
  return {
    herds: startingHerds(householdCount(state)),
    young: herdRecord(() => 0),
    ...(land ? { land: { ...land } } : {}),
  };
}

/**
 * Stádo osadníků nové vsi (diet.md – Dobytek, Oděv): výchozí stádo, ovcí ale aspoň tolik, kolik
 * jich dá vlnu na oděv pro všechny osadníky (`woolSheep`, nahoru na celé kusy) – osadníci se
 * oblékají sami.
 */
export function foundingLivestock(
  state: Pick<VillageState, 'people'>,
  day: number,
): LivestockState {
  const livestock = startingLivestock(state);
  livestock.herds.sheep = Math.max(
    livestock.herds.sheep,
    Math.ceil(woolSheep(state, day) - EPSILON),
  );
  return livestock;
}

/** Dobytek vsi (mutuje stav – vsi uložené před dobytkem dostanou výchozí stádo). */
export function ensureLivestock(state: VillageState): LivestockState {
  state.livestock ??= startingLivestock(state);
  return state.livestock;
}

/**
 * Doplní dobytek a krajinu pro pastvu (louka a les do 600 m) vsím uloženým před dobytkem nebo bez
 * údaje o krajině. Nic nechybí – vrátí týž stav.
 */
export function withLivestock(
  state: VillageState,
  land: { meadowHa: number; forestHa: number },
): VillageState {
  if (state.livestock?.land) return state;
  const next = structuredClone(state);
  const livestock = ensureLivestock(next);
  livestock.land = { ...land };
  return next;
}

/** Louka a les do 600 m (výchozí bez údaje o krajině). */
export function livestockLand(state: Pick<VillageState, 'livestock'>): {
  meadowHa: number;
  forestHa: number;
} {
  return state.livestock?.land ?? LIVESTOCK.defaultLand;
}

/** Stáda vsi (bez dobytka nuly). */
export function villageHerds(state: Pick<VillageState, 'livestock'>): Record<HerdSpecies, number> {
  return state.livestock?.herds ?? herdRecord(() => 0);
}

/** Slepice vsi: u obydlí každé domácnosti (zakladatelé na staveništi jako u zemnice). */
export function villageChickens(state: Pick<VillageState, 'people' | 'dwellings'>): number {
  let chickens = 0;
  for (const household of new Set(state.people.map((p) => p.dwellingId))) {
    const type = state.dwellings.find((d) => d.id === household)?.type ?? 'zemnice';
    chickens += CHICKENS_PER_DWELLING[type];
  }
  return chickens;
}

/**
 * Přirozená louka do 600 m, na které se pase (ha – diet.md, Pastva): louka z krajiny bez toho,
 * co zabírají díly polí (i příloh – ten je pastvinou po dílech, `pastureParts`), les vsi, sady,
 * hřbitovy, pozemky, ohrady a přirozené louky letošní seče (ty jen otavou – `pastureHa`).
 */
export function naturalPastureHa(state: VillageState): number {
  return Math.max(0, naturalMeadowHa(state) - hayPlanNaturalHa(state));
}

/** Přirozená louka do 600 m bez polí a staveb (ha) – i s loukami letošní seče. */
function naturalMeadowHa(state: VillageState): number {
  let used = 0;
  for (const part of state.parts) if (part.surface !== 'forest') used += part.areaM2;
  for (const wood of state.woods ?? []) if (wood.surface !== 'forest') used += wood.areaM2;
  for (const orchard of state.orchards ?? []) {
    for (const square of orchard.squares) used += square.areaM2;
  }
  for (const cemetery of state.cemeteries ?? []) {
    used += cemetery.squares.length * cemetery.squareSizeM * cemetery.squareSizeM;
  }
  used += state.dwellings.filter((d) => d.plot).length * CELL_M2;
  // ohrada zabírá všechny své čtverce (oxen.md – Ohrady podle druhu)
  used +=
    (state.pens ?? []).reduce((sum, p) => sum + 1 + (p.extraSquares?.length ?? 0), 0) * CELL_M2;
  return Math.max(0, livestockLand(state).meadowHa - used / M2_PER_HA);
}

/**
 * Pastva (ha plné louky) pro ovce, kozy, krávy a voly v den `day` (diet.md – Pastva, Martin
 * 19. 10. 2026 – stáda se pasou na loukách určených ke spásání): přirozená louka do 600 m mimo
 * letošní seč a příloh ve fázi louky mimo seč celé, mladý příloh a otava luk letošní seče jen
 * podílem (PASTURE). Osetý díl, křoviny a mladý les pastvou nejsou.
 */
export function pastureHa(state: VillageState, day: number): number {
  const meadow = naturalMeadowHa(state);
  const hay = Math.min(meadow, hayPlanNaturalHa(state));
  const ha =
    meadow - hay + hay * PASTURE.aftermathShare + fallowPastureHa(pastureParts(state, day));
  // nosnost pastvy × pastva roku, které je vidět (disasters.md – Léto, Pastva)
  // od 1. 9. je letošní léto minulé – pastva dalšího roku se zatím nezná (násobek 1)
  if (!hasWeather(state) || dateOfDayIndex(day).month >= PLANNING_DAY.month) return ha;
  return ha * pastureWeatherFactor(summerOf(state, day, true));
}

/**
 * Les pro prasata (ha): les do 600 m bez dílů polí, které ves v lese založila, a s lesem vsi na
 * bývalé louce (les vsi na vymýceném lese už mezi díly není – je zase lesem; fields.md – Les vsi).
 */
export function pigForestHa(state: VillageState): number {
  const cleared = state.parts
    .filter((p) => p.surface === 'forest' && p.state !== 'founding')
    .reduce((sum, p) => sum + p.areaM2, 0);
  const grown = (state.woods ?? [])
    .filter((w) => w.surface !== 'forest')
    .reduce((sum, w) => sum + w.areaM2, 0);
  return Math.max(0, livestockLand(state).forestHa - cleared / M2_PER_HA) + grown / M2_PER_HA;
}

/**
 * Pastva, kterou stáda (a `oxen` volů a `horses` koní – horses.md, Krmení: 1 ha na koně) spásají
 * (ha).
 */
export function grazingDemandHa(
  herds: Record<HerdSpecies, number>,
  oxen: number,
  horses = 0,
): number {
  const { pastureHa: per } = LIVESTOCK;
  return (
    herds.sheep * per.sheep +
    herds.goat * per.goat +
    herds.cow * per.cow +
    oxen * LIVESTOCK.oxPastureHa +
    horses * HORSES.pastureHa
  );
}

/**
 * Roční bilance bílkovin vsi (kg): potřeba a co dá obilí, mléko stád, vejce a luštěniny
 * (`legumes` – o kolik víc bílkovin dají luštěniny než obilí se stejnou energií, které nahradí).
 */
export interface ProteinBudget {
  need: number;
  grain: number;
  milk: number;
  eggs: number;
  legumes: number;
}

/** Vesnice pro bilanci bílkovin. */
type ProteinVillage = Pick<
  VillageState,
  'people' | 'dwellings' | 'livestock' | 'legumesKg' | 'wildlife'
>;

/** O kolik víc bílkovin (kg) dá kg luštěnin než obilí se stejnou energií. */
const LEGUME_PROTEIN_GAIN = LEGUMES.protein - PROTEIN.perKg.grain * LEGUMES.energy;

/** Roční potřeba energie vsi (kg obilí). */
function yearlyEnergyNeed(state: Pick<VillageState, 'people'>, day: number): number {
  return state.people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, day)], 0);
}

/**
 * Nejvýš tolik luštěnin (kg) sní ves za rok – celou potřebu energie, víc nikdo nesní. Strop podílu
 * 25 % je zrušený i v odhadech, jako v jídle (diet.md – Strava po vrstvách a porážka celý rok;
 * Martin 18. 11. 2026: „Strop bych úplně zrušil, je to zbytečný výpočet navíc“).
 */
function legumeMostPerYear(state: Pick<VillageState, 'people'>, day: number): number {
  return yearlyEnergyNeed(state, day) / LEGUMES.energy;
}

/**
 * Roční bilance bílkovin vsi se stády `herds` (bez údaje dnešní stáda). Luštěniny podle zásoby
 * (rovným dílem do příští sklizně, přepočteno na rok, nejvýš celá potřeba energie – bez stropu)
 * – vsi bez luštěnin 0.
 */
export function proteinBudget(
  state: ProteinVillage,
  day: number,
  herds?: Record<HerdSpecies, number>,
): ProteinBudget {
  // dojné samice – plánované stádo přes zimu (bez mláďat), nebo dnešní stádo bez letošních mláďat
  const dams = herds ? dairyDams(herds) : villageDams(state);
  let need = 0;
  let grain = 0;
  for (const p of state.people) {
    need += proteinNeedPerDay(p, day) * DAYS_PER_YEAR;
    grain +=
      FOOD_NEED_KG_PER_YEAR[ageGroup(p, day)] * LIVESTOCK.grainEnergyShare * PROTEIN.perKg.grain;
  }
  const legumeKg = Math.min(
    legumeSupplyPerYear(state, day, DAYS_PER_YEAR),
    legumeMostPerYear(state, day),
  );
  return {
    need,
    grain,
    milk: yearlyMilk(dams).proteinKg * LIVESTOCK.milkProteinKept,
    eggs:
      villageChickens(state) *
      LIVESTOCK.eggsKgPerHen *
      foxEggFactor(state.wildlife) *
      PROTEIN.perKg.eggs,
    legumes: legumeKg * LEGUME_PROTEIN_GAIN,
  };
}

/**
 * Roční potřeba masa vsi (kg) – bílkoviny, které chybí po obilí, mléku stád, vejcích
 * a luštěninách (diet.md – Bílkoviny, Luštěniny), v mase.
 */
export function meatNeedPerYear(
  state: ProteinVillage,
  day: number,
  herds?: Record<HerdSpecies, number>,
): number {
  const b = proteinBudget(state, day, herds);
  return Math.max(0, b.need - b.grain - b.milk - b.eggs - b.legumes) / PROTEIN.perKg.meat;
}

/** Přidá maso z porážky do uzení a práci na porážce a uzení (mutuje stav). */
export function butcher(state: VillageState, kg: number): void {
  if (kg <= 0) return;
  state.meatKg = (state.meatKg ?? 0) + kg;
  addSlaughterWork(state, kg);
}

/**
 * Zapíše kusy poražené dnes (`LivestockState.slaughtered` – hlášení pro scénu) a přidá z nich
 * kůže a kožešiny (`addSlaughterWares`, hides-honey.md – Zboží; mutuje stav). Nový den začíná
 * znovu.
 */
export function noteSlaughtered(
  state: VillageState,
  day: number,
  species: HerdSpecies,
  heads: number,
): void {
  if (heads <= EPSILON) return;
  addSlaughterWares(state, species, heads);
  const livestock = ensureLivestock(state);
  if (livestock.slaughtered?.day !== day) livestock.slaughtered = { day, heads: {} };
  const today = livestock.slaughtered.heads;
  today[species] = (today[species] ?? 0) + heads;
}

/** Práce porážky `kg` masa (1 člověkoden na LIVESTOCK.slaughterKgPerManDay kg – mutuje stav). */
export function addSlaughterWork(state: VillageState, kg: number): void {
  const livestock = ensureLivestock(state);
  const work = (livestock.slaughterWork ??= { required: 0, done: 0 });
  work.required += kg / LIVESTOCK.slaughterKgPerManDay;
}

/**
 * Zbývající práce porážky a uzení (člověkodny) – celý rok, dokud nějaká čeká (diet.md – Strava po
 * vrstvách a porážka celý rok: práce porážky „i v létě“): zimní porážka po dnech, letní porážka
 * pro rod vojvody, nouzová porážka i maso z lovu a dosloužilých zvířat. Dřív jen v zimě a v nouzi.
 */
export function slaughterRemaining(state: VillageState): number {
  const work = state.livestock?.slaughterWork;
  if (!work) return 0;
  return Math.max(0, work.required - work.done);
}

/** Vloží práci do porážky a uzení (mutuje stav). */
export function workSlaughter(state: VillageState, amount: number): void {
  const work = state.livestock?.slaughterWork;
  if (!work || amount <= 0) return;
  work.done = Math.min(work.required, work.done + amount);
}

/** Vejce dne (kg) – jí se čerstvá. */
export function dailyEggsKg(
  state: Pick<VillageState, 'people' | 'dwellings' | 'wildlife'>,
): number {
  return (
    (villageChickens(state) * LIVESTOCK.eggsKgPerHen * foxEggFactor(state.wildlife)) / DAYS_PER_YEAR
  );
}

/** Jaro (1. 4.): mláďata – každé stádo přibude o svůj roční růst (mutuje stav). */
export function herdBirths(state: VillageState): void {
  const livestock = ensureLivestock(state);
  for (const species of HERD_SPECIES) {
    const young = livestock.herds[species] * LIVESTOCK.growth[species];
    livestock.young[species] = young;
    livestock.herds[species] += young;
  }
}

/**
 * Pastva jen pro kozy (ha – diet.md, Skladba stáda; Martin 19. 10. 2026: kozy „spasou i to, co ovce
 * ne“): zarůstající příloh – křoviny a mladý les (fields.md – Zarůstání), kam ovce ani krávy
 * nejdou. Kozy ji spásají napřed, zbytek potřeby z pastvy ostatních.
 */
export function goatBrowseHa(state: Pick<VillageState, 'parts'>): number {
  return (
    state.parts.filter((p) => isOvergrown(p)).reduce((sum, p) => sum + p.areaM2, 0) / M2_PER_HA
  );
}

/** Nosnost přes zimu – co ves k porážce ví o krmení, volech, ohradách a pasácích. */
export interface WinterInput {
  /** Voli (spřežení a výcvik) – na pastvě a v seně mají přednost (orají). */
  oxen: number;
  /** Zásoba sena k začátku zimy (kg); bez omezení Infinity. */
  hayKg: number;
  /**
   * Sláma na zimu (kg – zásoba a snopy obilí před výmlatem, `strawComingKg`) – krávy, ovce a kozy
   * ji ve sněhu žerou před senem (diet.md – Zima bez sena). Bez údaje 0.
   */
  strawKg?: number;
  /** Krávy, které ves drží vždy (`breedingCows` – mléko a telata pro voly); bez údaje pár. */
  minCows?: number;
  /** Podíl stáda, který pasáci přes rok uhlídali (diet.md – Pasáci); bez údaje vše. */
  herding?: number;
  /** Ovce na vlnu pro oděv všech (`woolSheep` – diet.md, Oděv); bez údaje jen chovný pár. */
  minSheep?: number;
  /**
   * Krávy k obnově volů (`oxenRenewalCows` – diet.md, Zima bez sena): v zimním krmení hned po
   * volech a koních, před ovcemi na vlnu (`minSheep`); bez údaje žádné.
   */
  oxenCows?: number;
  /** Cena jídla v práci (`foodCosts` – Rovnovážné hospodaření); bez údaje typická. */
  costs?: FoodCosts;
  /**
   * Místa na noc po druzích – ohrady svého druhu a pár kusů u domů (`herdRoom` v pens.ts – oxen.md,
   * Ohrady podle druhu; diet.md, Bez ohrady u domu); bez údaje neomezeně. Místa jsou pro dospělé
   * i jarní mláďata – přes zimu jich zůstane nejvýš `room ÷ (1 + růst)` (`roomForWinter`).
   */
  room?: Record<HerdSpecies, number>;
  /** Pastva koní (ha – horses.md, Krmení); pasou se se stády, napřed. Bez údaje 0. */
  horsePastureHa?: number;
  /** Seno koní na zimu (kg) – mají ho po volech, před stádem. Bez údaje 0. */
  horseHayKg?: number;
  /**
   * Seno pro stádo (bez volů a koní), které ves stihne posekat prací po polních pracích, po
   * ztrátách ve stohu (kg – oxen.md, Stáda podle práce na seč): víc stáda, než na kolik se seno
   * stihne posekat, si ves nenechá. Bez údaje bez meze.
   */
  mowKg?: number;
  /**
   * Krávy, které výprava teprve přivede (trade.md – Dobytek ve třech druzích): místo, pastvu i seno
   * mají první z krav, jako by už byly ve stádu. Bez údaje 0.
   */
  cowsComing?: number;
}

/**
 * Kolik kusů druhu smí přes zimu zůstat, aby se do míst na noc (`room`) vešli i s jarními
 * mláďaty (oxen.md – Kapacita ohrady); bez údaje neomezeně.
 */
export function roomForWinter(
  room: Record<HerdSpecies, number> | undefined,
  species: HerdSpecies,
): number {
  if (!room) return Infinity;
  return Math.max(0, room[species]) / (1 + LIVESTOCK.growth[species]);
}

/**
 * Volby chovu z údajů porážky (`WinterInput`). Seč (1. 6.) i porážka (1. 11.) počítají týž plán –
 * luštěniny jen ze zásoby (ves je na poli nepěstuje – fields.md, Luštěniny, zrušeno).
 */
function balanceOptions(input: WinterInput): BalanceOptions {
  return input.costs ? { costs: input.costs } : {};
}

/**
 * Přednost stád (oxen.md – Co nejvíc sena a co největší stáda; Martin 24. 10. 2026: „Krávy a hlavně
 * voli jsou životně důležití, pak jsou ovce, kozy a prasata jsou důležitá nejméně.“): v tomto
 * pořadí jde seno na zimu, pastva i pasáci; voli (orají) mají přednost před všemi. Dřív ovce na
 * vlnu a krávy na mléko a voly napřed, pak ovce, kozy a zbytek krav.
 */
const HERD_PRIORITY: readonly HerdSpecies[] = ['cow', 'sheep', 'goat', 'pig'];

/**
 * Komu pasáci stačili (diet.md – Pasáci): uhlídaný podíl `watched` celé potřeby pasáků (kusy ÷
 * kolik jich pasák uhlídá) jde po druzích v pořadí přednosti (`HERD_PRIORITY`) – podíl
 * uhlídaných kusů každého druhu. Druh bez kusů dostane `watched`.
 */
function watchedShares(
  herds: Readonly<Record<HerdSpecies, number>>,
  watched: number,
): Record<HerdSpecies, number> {
  if (watched >= 1 - EPSILON) return herdRecord(() => 1);
  const need = (s: HerdSpecies): number => herds[s] / HERDING.perHerder[s];
  let covered = watched * HERD_SPECIES.reduce((sum, s) => sum + need(s), 0);
  const shares = herdRecord(() => watched);
  for (const species of HERD_PRIORITY) {
    if (need(species) <= EPSILON) continue;
    shares[species] = Math.min(1, Math.max(0, covered / need(species)));
    covered -= shares[species] * need(species);
  }
  return shares;
}

/**
 * Co stáda unesou přes zimu – kusy po druzích (aspoň chovný pár, který ves má). Pastva, seno
 * a seno, které ves stihne posekat (`mowKg` – oxen.md, Stáda podle práce na seč), se dělí podle
 * přednosti – voli první, krávy na cestě, krávy k obnově volů (`oxenCows`), ovce na vlnu
 * (`minSheep` – diet.md, Zima bez sena), pak krávy, ovce a kozy (`HERD_PRIORITY` – kozy spásají
 * napřed křoviny); prasata podle lesa (pasou se v něm celý rok – žaludy, bukvice, kořínky); a jen
 * tolik, kolik pasáci uhlídali (`herding` – co nikdo neuhlídal, jde na maso) – pasáci hlídají
 * v pořadí přednosti (`watchedShares`). Nejvýš tolik, kolik se i s jarními mláďaty vejde do ohrad
 * svého druhu a u domů (`room` – oxen.md, Ohrady podle druhu; co se nevejde, jde na maso) – místa
 * se uplatní dřív než pastva a seno: kusy, které se nevejdou, si je neberou.
 */
export function winterTargets(
  state: VillageState,
  day: number,
  input: WinterInput,
): Record<HerdSpecies, number> {
  const herds = villageHerds(state);
  const watched = watchedShares(herds, Math.min(1, Math.max(0, input.herding ?? 1)));
  const breeding = (s: HerdSpecies): number => Math.min(herds[s], LIVESTOCK.breedingMin);
  // krávy na cestě mají místo, pastvu i seno první z krav (koupené – trade.md)
  const coming = Math.max(0, input.cowsComing ?? 0);
  const comingHay = coming * herdWinterHayKg('cow');
  let pasture = Math.max(
    0,
    pastureHa(state, day) -
      input.oxen * LIVESTOCK.oxPastureHa -
      (input.horsePastureHa ?? 0) -
      coming * LIVESTOCK.pastureHa.cow,
  );
  let browse = goatBrowseHa(state);
  // krávy, ovce a kozy: seno po volech a koních a sláma (jen jejich – diet.md, Zima bez sena)
  let hay =
    Math.max(
      0,
      winterHayAvailable(input.hayKg) -
        input.oxen * HAY.dailyKg.ox * HAY_WINTER_DAYS -
        (input.horseHayKg ?? 0) -
        comingHay,
    ) + strawAsHayKg(winterHayAvailable(input.strawKg ?? 0));
  let mow = input.mowKg === undefined ? Infinity : Math.max(0, input.mowKg - comingHay);
  const room = (s: HerdSpecies): number =>
    Math.max(0, roomForWinter(input.room, s) - (s === 'cow' ? coming : 0));
  const targets = herdRecord(() => 0);
  const take = (species: Exclude<HerdSpecies, 'pig'>, upTo = Infinity): void => {
    const per = LIVESTOCK.pastureHa[species];
    const winterHay = herdWinterHayKg(species);
    const own = species === 'goat' ? browse : 0;
    const heads = Math.max(
      0,
      Math.min(
        Math.min(herds[species] * watched[species], upTo) - targets[species],
        room(species) - targets[species],
        (pasture + own) / per,
        hay / winterHay,
        mow / winterHay,
      ),
    );
    const grazing = heads * per;
    const fromBrowse = Math.min(own, grazing);
    browse -= fromBrowse;
    pasture = Math.max(0, pasture - (grazing - fromBrowse));
    hay = Math.max(0, hay - heads * winterHay);
    mow = Math.max(0, mow - heads * winterHay);
    targets[species] += heads;
  };
  // krávy k obnově volů, ovce na vlnu, pak zbytek v pořadí přednosti (diet.md – Zima bez sena;
  // Martin 10. 11. 2026: „Ano, ovce na vlnu před kravami, ale je potřeba nechat dostatek krav
  // k obnově volů“)
  take('cow', input.oxenCows ?? 0);
  take('sheep', input.minSheep ?? 0);
  for (const species of HERD_PRIORITY) if (species !== 'pig') take(species);
  targets.pig = Math.min(
    herds.pig * watched.pig,
    room('pig'),
    pigForestHa(state) / LIVESTOCK.forestHaPerPig,
  );
  // ohrady svého druhu a pár kusů u domů (oxen.md – Ohrady podle druhu) – chovný pár zůstane vždy
  return herdRecord((s) =>
    Math.max(breeding(s), Math.min(targets[s], roomForWinter(input.room, s))),
  );
}

/**
 * Den příštího léta (1. 7.), podle kterého ves odhaduje výrostky pro stádo přes zimu – od jarních
 * mláďat (1. 4.) dál příští rok, před nimi letos.
 */
export function nextSummerDay(day: number): number {
  const { year, month } = dateOfDayIndex(day);
  return sameDateNextYear(dayIndexOf({ year, month: 7, day: 1 }), year, month >= BIRTH_DAY.month);
}

/**
 * Den `thisYear` (datum v roce `year`), nebo s `next` totéž datum (od března dál) o rok později –
 * bez dayIndexOf za koncem světa (podzim 1499).
 */
function sameDateNextYear(thisYear: number, year: number, next: boolean): number {
  return next ? thisYear + DAYS_PER_YEAR + (isLeapYear(year + 1) ? 1 : 0) : thisYear;
}

/**
 * Chovné minimum stáda (kusy po druzích): chovný pár, krávy na mléko a voly (`minCows`), ovce na
 * vlnu pro oděv všech (`minSheep` – diet.md, Oděv).
 */
export function breedingFloor(input: {
  minCows?: number;
  minSheep?: number;
}): Record<HerdSpecies, number> {
  const min = LIVESTOCK.breedingMin;
  return {
    sheep: Math.max(min, input.minSheep ?? 0),
    goat: min,
    pig: min,
    cow: Math.max(min, input.minCows ?? 0),
  };
}

/**
 * Místo pro mláďata (diet.md – Porážka v zimě; Martin 19. 10. 2026: „Když bude ve vsi málo
 * vhodných dětí na pasení, tak to omezí i velikost stád.“; podrobnosti návrh Clauda): ves si na
 * zimu nechá nejvýš tolik kusů, aby k nim jarní mláďata (`growth`) uhlídali pasáci příštího léta
 * – odhad z věku dnešních dětí, bez výrostků dospělý (`herderCapacity` k `nextSummerDay` – diet.md,
 * Pasáci, Dospělý pasák), voli na pastvě napřed.
 * Chovné minimum (`breedingFloor`) zůstává vždy; nad ním výrostci hlídají v pořadí přednosti
 * (`HERD_PRIORITY` – oxen.md, Co nejvíc sena a co největší stáda).
 */
export function youngRoomTargets(
  state: HerdingState,
  day: number,
  targets: Readonly<Record<HerdSpecies, number>>,
  input: { oxen: number; minCows?: number; minSheep?: number },
): Record<HerdSpecies, number> {
  const summer = nextSummerDay(day);
  const capacity = herderCapacity(state, summer);
  const floor = breedingFloor(input);
  const kept = herdRecord((s) => Math.min(targets[s], floor[s]));
  const grown = (h: Record<HerdSpecies, number>): Record<HerdSpecies, number> =>
    herdRecord((s) => h[s] * (1 + LIVESTOCK.growth[s]));
  let room = capacity - herdingDemand(grown(kept), input.oxen, summer);
  for (const species of HERD_PRIORITY) {
    const rest = Math.max(0, targets[species] - kept[species]);
    const demand = herdingDemand(grown(herdRecord((s) => (s === species ? rest : 0))), 0, summer);
    const share = demand > EPSILON ? Math.min(1, Math.max(0, room / demand)) : 1;
    kept[species] += share * rest;
    room -= share * demand;
  }
  return kept;
}

/**
 * Staré kusy (diet.md – Porážka v zimě; Martin 19. 10. 2026: „Tak většinou se v zimě porážejí
 * staré kusy…“): kolik dospělých kusů (stádo bez letošních mláďat) ročně doslouží
 * (HERD_RETIREMENT) – jdou 1. 11. na maso vždy, letošní mláďata je nahradí.
 */
export function retiringHeads(
  herds: Readonly<Record<HerdSpecies, number>>,
  young: Readonly<Record<HerdSpecies, number>>,
): Record<HerdSpecies, number> {
  return herdRecord((s) => HERD_RETIREMENT[s] * Math.max(0, herds[s] - young[s]));
}

/**
 * Stádo, které si ves nejvýš nechá přes zimu (diet.md – Porážka v zimě): nosnost pastvy, sena,
 * lesa a pasáků (`winterTargets`), místo pro jarní mláďata (`youngRoomTargets`) a bez starých
 * kusů (`retiringHeads`); chovné minimum zůstává vždy (když na něj nestačí mladé kusy, i staré).
 */
export function winterKeepTargets(
  state: VillageState,
  day: number,
  input: WinterInput,
): Record<HerdSpecies, number> {
  const livestock = ensureLivestock(state);
  // kusy, které ves letos v létě porazila pro rod vojvody (`summerSlaughtered`), se počítají do
  // stáda, jako by žily – staré kusy, pasáci (podíl uhlídaných) i místa ze stáda před letní
  // porážkou, ať ji odhad 1. 11. nezmenšuje (diet.md – Strava po vrstvách a porážka celý rok)
  const taken = livestock.summerSlaughtered;
  const herds = taken ? herdRecord((s) => livestock.herds[s] + (taken[s] ?? 0)) : livestock.herds;
  const view: VillageState = taken ? { ...state, livestock: { ...livestock, herds } } : state;
  const room = youngRoomTargets(view, day, winterTargets(view, day, input), input);
  const old = retiringHeads(herds, livestock.young);
  const floor = breedingFloor(input);
  return herdRecord((s) =>
    Math.min(
      livestock.herds[s],
      room[s],
      Math.max(Math.min(herds[s], floor[s]), herds[s] - old[s]),
    ),
  );
}

/**
 * Kdo z kusů na maso počká na porážku přes zimu (diet.md – Porážka v zimě, Uzení jen na přebytek):
 * napřed ti, kdo žerou nejméně sena na kg masa – prasata (les), krávy, ovce, kozy.
 */
const WAIT_ORDER: readonly HerdSpecies[] = ['pig', 'cow', 'sheep', 'goat'];
/**
 * V zimě se porážejí napřed kusy, které žerou nejvíc sena na kg masa – kozy, ovce, krávy, prasata
 * (v lese) nakonec.
 */
const WINTER_SLAUGHTER_ORDER: readonly HerdSpecies[] = ['goat', 'sheep', 'cow', 'pig'];

/**
 * Kolik masa (kg) ves za den nejvýš sní čerstvého – celou potřebu energie (diet.md – Strava po
 * vrstvách a porážka celý rok, bez stropů; dřív strop masa 40 %).
 */
export function freshMeatPerDayKg(state: Pick<VillageState, 'people'>, day: number): number {
  return villageFoodNeed(state, day) / DIET.meatEnergy;
}

/**
 * Seno (kg), které sežerou kusy čekající na porážku (`wait`), když se rozloží na celou zimu –
 * denně stejně masa (maso čekajících ÷ dny zimního krmení, `winterSlaughterTodayKg`) v pořadí
 * WINTER_SLAUGHTER_ORDER; každý kus žere do dne své porážky.
 */
function waitingHayKg(wait: Readonly<Record<HerdSpecies, number>>): number {
  const meatKg = HERD_SPECIES.reduce((sum, s) => sum + wait[s] * LIVESTOCK.meatKg[s], 0);
  if (meatKg <= EPSILON) return 0;
  const perDayKg = meatKg / HAY_WINTER_DAYS;
  let start = 0;
  let hay = 0;
  for (const species of WINTER_SLAUGHTER_ORDER) {
    const days = (wait[species] * LIVESTOCK.meatKg[species]) / perDayKg;
    if (species !== 'pig') hay += waitingHerdHayKg(species, wait[species], start + days / 2);
    start += days;
  }
  return hay;
}

/**
 * Kusy na maso, které počkají na porážku přes zimu (diet.md – Porážka v zimě; Martin 19. 10. 2026:
 * „A nemusí se porážet jen 1. 11. ale po celou zimu, aby vesničané jedli maso ideálně čerstvé.
 * Uzení je spíš jen nouzový způsob, jak naložit s přebytky.“ a „když porazíš zvíře hned na začátku
 * zimy, nemusíš ho krmit senem“; podrobnosti návrh Clauda): jen tolik masa, kolik ves přes zimu
 * sní čerstvého – celá potřeba (`freshMeatPerDayKg`) po dny zimního krmení, bez stropu (diet.md –
 * Strava po vrstvách a porážka celý rok) –, napřed kusy, které žerou nejméně sena na kg masa
 * (WAIT_ORDER); prasata jen do nosnosti lesa vedle stáda přes zimu; přežvýkavci jen tolik, kolik po
 * stádu přes zimu a volech uživí seno (`hayKg` – zásoba k 1. 11.; bez omezení Infinity), když se
 * čekající kusy porážejí rozložené na celou zimu (`waitingHayKg`) – co seno neuživí, ubere od
 * posledních na řadě (krávy, ovce, kozy); a jen do míst na
 * noc, která po stádu přes zimu zbudou (`room` – oxen.md, Ohrady podle druhu: na noc jsou všechna
 * zvířata v ohradě; bez údaje neomezeně). Ostatní kusy na maso se porazí hned a maso se udí.
 */
export function winterWait(
  state: VillageState,
  day: number,
  keep: Readonly<Record<HerdSpecies, number>>,
  killed: Readonly<Record<HerdSpecies, number>>,
  hayKg: number,
  oxen: number,
  room?: Readonly<Record<HerdSpecies, number>>,
  strawKg = 0,
): Record<HerdSpecies, number> {
  let freshKg = freshMeatPerDayKg(state, day) * HAY_WINTER_DAYS;
  const wait = herdRecord(() => 0);
  const forestRoom = pigForestHa(state) / LIVESTOCK.forestHaPerPig - keep.pig;
  for (const species of WAIT_ORDER) {
    let heads = Math.min(Math.max(0, killed[species]), freshKg / LIVESTOCK.meatKg[species]);
    if (species === 'pig') heads = Math.min(heads, Math.max(0, forestRoom));
    if (room) heads = Math.min(heads, Math.max(0, room[species] - keep[species]));
    wait[species] = Math.max(0, heads);
    freshKg -= wait[species] * LIVESTOCK.meatKg[species];
  }
  // stádo přes zimu žere ve sněhu napřed slámu (`strawKg`), čekající kusy seno po něm
  const hayLeft =
    winterHayAvailable(hayKg) -
    winterHayKg(keep, oxen, 0, strawAsHayKg(winterHayAvailable(strawKg)));
  // seno nestačí – ubrat čekající přežvýkavce od posledních na řadě
  for (const species of ['cow', 'sheep', 'goat'] as const) {
    if (waitingHayKg(wait) <= hayLeft + EPSILON) break;
    const all = wait[species];
    wait[species] = 0;
    if (waitingHayKg(wait) > hayLeft) continue;
    let lo = 0;
    let hi = all;
    for (let i = 0; i < 40 && hi - lo > 1e-6; i++) {
      const mid = (lo + hi) / 2;
      wait[species] = mid;
      if (waitingHayKg(wait) <= hayLeft) lo = mid;
      else hi = mid;
    }
    wait[species] = lo;
  }
  return wait;
}

/**
 * Seno (kg), které na zimu potřebují kusy čekající na porážku (diet.md – Porážka v zimě) – plán
 * seče (1. 6.) s nimi počítá: odhad kusů na maso z dnešního stáda a stáda přes zimu `keep`.
 */
export function winterWaitHayKg(
  state: VillageState,
  day: number,
  keep: Readonly<Record<HerdSpecies, number>>,
  oxen: number,
  room?: Readonly<Record<HerdSpecies, number>>,
): number {
  const herds = villageHerds(state);
  const killed = herdRecord((s) => Math.max(0, herds[s] - keep[s]));
  const wait = winterWait(state, day, keep, killed, Infinity, oxen, room);
  return waitingHayKg(wait);
}

/** Porážka po celou zimu – od 1. 11. do konce zimního krmení (31. 3.). */
export function isSlaughterSeason(day: number): boolean {
  return isHayWinter(day);
}

/** Dní do konce zimní porážky včetně dneška (31. 3. → 1); mimo zimu 0. */
export function slaughterSeasonDaysLeft(day: number): number {
  if (!isSlaughterSeason(day)) return 0;
  const { year, month } = dateOfDayIndex(day);
  return sameDateNextYear(dayIndexOf({ year, ...BIRTH_DAY }), year, month >= SLAUGHTER_MONTH) - day;
}

/** Maso (kg) kusů, které čekají na zimní porážku. */
export function cullingMeatKg(state: Pick<VillageState, 'livestock'>): number {
  const livestock = state.livestock;
  const culling = livestock?.culling;
  if (!livestock || !culling) return 0;
  return HERD_SPECIES.reduce(
    (sum, s) => sum + Math.min(culling[s], livestock.herds[s]) * LIVESTOCK.meatKg[s],
    0,
  );
}

/**
 * Kolik masa (kg) dnes dá zimní porážka (diet.md – Strava po vrstvách a porážka celý rok, V zimě;
 * návrh Clauda podle Martina 18. 11. 2026: „kníže … chce mít maso na stole nejlépe každý den“):
 * kusy čekající na porážku se rozloží na zbývající dny zimy – zbývající maso čekajících kusů
 * (`cullingMeatKg`) děleno zbývajícími dny včetně dneška (`slaughterSeasonDaysLeft`). Poslední den
 * zimy (31. 3.) a mimo zimu 0 – zbytek se porazí a udí (`winterSlaughterDay`).
 */
export function winterSlaughterTodayKg(
  state: Pick<VillageState, 'livestock'>,
  day: number,
): number {
  const days = slaughterSeasonDaysLeft(day);
  if (days <= 1) return 0;
  return cullingMeatKg(state) / days;
}

/**
 * Den zimní porážky (mutuje stav – diet.md, Porážka v zimě; Strava po vrstvách a porážka celý rok):
 * z kusů čekajících na porážku (`LivestockState.culling`) ves porazí dnešní díl
 * (`winterSlaughterTodayKg` – maso čekajících ÷ zbývající dny zimy), v pořadí
 * WINTER_SLAUGHTER_ORDER, i zlomky kusů (stáda jsou v modelu zlomková – návrh Clauda) – maso do
 * `freshMeatKg` (jí se dnes napřed), práce porážky jako u porážky. Poslední den zimy (31. 3.) –
 * nebo mimo zimu – se zbytek porazí a maso se udí.
 */
export function winterSlaughterDay(state: VillageState, day: number): void {
  const livestock = state.livestock;
  const culling = livestock?.culling;
  if (!livestock || !culling) return;
  for (const s of HERD_SPECIES) culling[s] = Math.max(0, Math.min(culling[s], livestock.herds[s]));
  const todayKg = winterSlaughterTodayKg(state, day);
  if (todayKg > EPSILON) {
    let left = todayKg;
    let kg = 0;
    for (const species of WINTER_SLAUGHTER_ORDER) {
      if (left <= EPSILON) break;
      const heads = Math.min(culling[species], left / LIVESTOCK.meatKg[species]);
      if (heads <= 0) continue;
      culling[species] -= heads;
      livestock.herds[species] -= heads;
      noteSlaughtered(state, day, species, heads);
      kg += heads * LIVESTOCK.meatKg[species];
      left -= heads * LIVESTOCK.meatKg[species];
    }
    if (kg > 0) {
      state.freshMeatKg = (state.freshMeatKg ?? 0) + kg;
      addSlaughterWork(state, kg);
    }
  }
  const rest = HERD_SPECIES.reduce((sum, s) => sum + culling[s], 0);
  if (rest <= EPSILON) {
    delete livestock.culling;
    return;
  }
  if (slaughterSeasonDaysLeft(day) > 1) return;
  // konec zimy – zbytek na uzení
  let kg = 0;
  for (const s of HERD_SPECIES) {
    livestock.herds[s] -= culling[s];
    noteSlaughtered(state, day, s, culling[s]);
    kg += culling[s] * LIVESTOCK.meatKg[s];
  }
  delete livestock.culling;
  butcher(state, kg);
}

/**
 * Maso (kg za rok), které dá kus přezimujícího stáda mláďaty, když stádo zůstane stejné: mláďata
 * na jaře (`growth`) po ročních ztrátách celého stáda (od porážky k porážce) nad počet chovných
 * kusů.
 */
export function yearlyMeatPerHead(species: HerdSpecies): number {
  // kalibrace beze změny: počítá se s plnou smečkou vlků (základ + vlčí díl)
  const loss = LIVESTOCK.lossPerYear[species] + PREDATION.wolfShare[species];
  const surplus = (1 + LIVESTOCK.growth[species]) * (1 - loss) - 1;
  return Math.max(0, surplus) * LIVESTOCK.meatKg[species];
}

/**
 * Bílkoviny ze stád, které ves potřebuje (kg za rok – diet.md, Bílkoviny): potřeba bez obilí,
 * luštěnin a vajec.
 */
export function herdProteinNeed(state: ProteinVillage, day: number): number {
  const b = proteinBudget(
    state,
    day,
    herdRecord(() => 0),
  );
  return Math.max(0, b.need - b.grain - b.eggs - b.legumes);
}

/**
 * diet.md – Rovnovážné hospodaření (Martin 19. 10. 2026: „aby byla sytá, měla ± ideální kombinaci
 * stravy, ale aby jí zároveň zbylo co nejvíce volného času na rozvoj“; čísla návrh Clauda):
 * bílkoviny se plánují s rezervou 10 % (růst vsi do příští porážky – dřív 25 %), nejméně na 88 %
 * potřeby (kvalita stravy 0,9 – pod ní nasycení ubírá štěstí) a dál jen ze zdrojů, jejichž
 * kilogram bílkovin nestojí víc práce než kilogram bílkovin z obilí.
 */
export const BALANCE = {
  proteinReserve: 0.1,
  minProteinCoverage: 0.88,
} as const;

/** Co dá a co stojí chovný kus za rok (diet.md – Rovnovážné hospodaření). */
export interface HeadEconomy {
  /**
   * Práce vsi za rok (člověkodny) – seno a porážka; dojení, péče a pasení jdou bokem (ženy
   * a výrostci – population.md, Práce).
   */
  labor: number;
  /** Energie masa a mléka (kg obilí za rok). */
  meatEnergy: number;
  dairyEnergy: number;
  /** Bílkoviny masa a mléka (kg za rok – mléko 85 %). */
  meatProtein: number;
  dairyProtein: number;
}

/**
 * Chovný kus za rok (diet.md – Rovnovážné hospodaření): maso z mláďat po ročních ztrátách
 * (`yearlyMeatPerHead`) a mléko dojných kusů; práce vsi na seno (zimní dávka × cena sena)
 * a porážka s uzením (dojení, sýr a péče jsou bokem – ženy, pasení výrostci).
 */
export function headEconomy(species: HerdSpecies, costs: FoodCosts): HeadEconomy {
  const meat = yearlyMeatPerHead(species);
  const milk = yearlyMilk(dairyDams(herdRecord((s) => (s === species ? 1 : 0))));
  const slaughterWork = meat / LIVESTOCK.slaughterKgPerManDay;
  const base = {
    meatEnergy: meat * DIET.meatEnergy,
    dairyEnergy: milk.energy,
    meatProtein: meat * PROTEIN.perKg.meat,
    dairyProtein: milk.proteinKg * LIVESTOCK.milkProteinKept,
  };
  if (species === 'pig') return { ...base, labor: slaughterWork };
  const hay = herdWinterHayKg(species) * costs.hayPerKg;
  return { ...base, labor: hay + slaughterWork };
}

/** Chovné stádo podle potřeby – cíle po druzích a jestli stádo potřebu (s rezervou) pokryje. */
export interface SizedHerds {
  keep: Record<HerdSpecies, number>;
  /** Stádo v nosnosti (s luštěninami ze zásoby) dá bílkovin aspoň potřebu s rezervou. */
  sufficient: boolean;
  /** Pokrytí bílkovin plánu (0–1+). */
  coverage: number;
}

/** Rozhodnutí chovu – co ves k plánu ví (diet.md – Rovnovážné hospodaření). */
export interface BalanceOptions {
  /** Cena jídla v práci (`foodCosts`); bez údaje typická ves bez řemesel. */
  costs?: FoodCosts;
}

/**
 * Typická cena jídla v práci (bez údajů vsi) – `foodCosts` vsi bez dílů v osevu a bez plánu seče
 * s nejhoršími mezemi (hlídá test; tady číslem – economy.ts přes hay.ts a pěšiny zpět importuje
 * livestock.ts).
 */
export const TYPICAL_FOOD_COSTS: FoodCosts = {
  // 0,508 do 9. 11. 2026 – setí zlevnilo (rozsévač za spřežením, fields.md – Práce); 0,491 do
  // 10. 11. 2026 – zprůměrovaná žeň (fields.md – Práce)
  grainPerKg: 0.472,
  // 0,0127 do 10. 11. 2026 – seč srpem 46 čd/ha místo kosou 15 (oxen.md – Zima bez sena)
  hayPerKg: 0.039,
};

/**
 * Rovnovážné hospodaření (diet.md – Rovnovážné hospodaření; Martin 19. 10. 2026) – od 24. 10. 2026
 * jen plán luštěnin, od 9. 11. 2026 jen pokrytí bílkovin: celé stádo v nosnosti (`keep` – pastva,
 * les, seno, pasáci, místa v ohradách –
 * `winterTargets`) dá bílkoviny v pořadí přednosti (`HERD_PRIORITY`) a cena jídla v práci ho
 * nezmenšuje (oxen.md – Co nejvíc sena a co největší stáda; návrh Clauda, schválený Martinem).
 * Luštěniny jen ze zásoby (do stropu podílu energie) – ves je na poli nepěstuje (fields.md –
 * Luštěniny, zrušeno; Martin 9. 11. 2026). Deterministické, bez stavu navíc.
 */
export function sizeHerdsToNeed(
  state: ProteinVillage,
  day: number,
  keep: Record<HerdSpecies, number>,
  options: BalanceOptions = {},
): SizedHerds {
  const costs = options.costs ?? TYPICAL_FOOD_COSTS;
  const energyNeed = yearlyEnergyNeed(state, day);
  const budget = proteinBudget(
    state,
    day,
    herdRecord(() => 0),
  );
  const required = budget.need * (1 + BALANCE.proteinReserve);
  const eggsKg = villageChickens(state) * LIVESTOCK.eggsKgPerHen * foxEggFactor(state.wildlife);
  // bílkoviny, kdyby ves jedla jen obilí, a co k nim dají vejce a luštěniny ze zásoby (navíc proti
  // obilí se stejnou energií)
  const grainProtein = PROTEIN.perKg.grain;
  const stockLegumes = Math.min(
    legumeSupplyPerYear(state, day, DAYS_PER_YEAR),
    legumeMostPerYear(state, day),
  );
  let protein =
    energyNeed * grainProtein +
    eggsKg * (PROTEIN.perKg.eggs - DIET.energy.eggs * grainProtein) +
    stockLegumes * LEGUME_PROTEIN_GAIN;
  // celé stádo v nosnosti v pořadí přednosti (oxen.md – Co nejvíc sena a co největší stáda) –
  // maso a mléko dohromady nejvýš celá potřeba energie, víc nikdo nesní (diet.md – Strava po
  // vrstvách a porážka celý rok, bez stropů; společný strop návrh Clauda – dřív maso 40 % a mléko
  // 30 %)
  let room = energyNeed;
  for (const species of HERD_PRIORITY) {
    const unit = keep[species];
    if (unit <= EPSILON) continue;
    const head = headEconomy(species, costs);
    const meat = Math.min(head.meatEnergy * unit, Math.max(0, room));
    const dairy = Math.min(head.dairyEnergy * unit, Math.max(0, room - meat));
    const meatShare = head.meatEnergy > 0 ? meat / (head.meatEnergy * unit) : 0;
    const dairyShare = head.dairyEnergy > 0 ? dairy / (head.dairyEnergy * unit) : 0;
    protein +=
      head.meatProtein * unit * meatShare +
      head.dairyProtein * unit * dairyShare -
      (meat + dairy) * grainProtein;
    room -= meat + dairy;
  }
  return {
    keep: herdRecord((s) => keep[s]),
    sufficient: protein >= required - EPSILON,
    coverage: protein / required,
  };
}

/**
 * Zimní stádo, které si ves chce nechat (bez ohledu na seno – podle něj se seče): nosnost pastvy,
 * lesa a pasáků zmenšená podle potřeby (`sizeHerdsToNeed`).
 */
export function wantedWinterHerds(
  state: VillageState,
  day: number,
  input: Omit<WinterInput, 'hayKg'>,
): Record<HerdSpecies, number> {
  return balancedPlan(state, day, input).keep;
}

/**
 * Plán chovu bez ohledu na seno (podle něj se seče – 1. 6.) – diet.md, Rovnovážné hospodaření.
 */
export function balancedPlan(
  state: VillageState,
  day: number,
  input: Omit<WinterInput, 'hayKg'>,
): SizedHerds {
  const full = { ...input, hayKg: Infinity };
  return sizeHerdsToNeed(state, day, winterKeepTargets(state, day, full), balanceOptions(full));
}

/**
 * Porážka, když seno nevystačí (mutuje stav – oxen.md, Co nejvíc sena a co největší stáda; diet.md,
 * Zimní krmení; Martin 24. 10. 2026: „Když se v zimě zjistí, že pro krávy není krmení, tak se dají
 * prodat nebo porazit.“ – prodává jen hráč): každý den zimy ves spočítá, komu zásoba sena vystačí
 * do konce března – voli a koně první (`oxen`, `horsesKg` – dávka koní za den), pak v pořadí
 * přednosti krávy k obnově volů a ovce na vlnu (`first`), pak krávy, ovce a kozy (`HERD_PRIORITY`;
 * bez kusů, které už čekají na zimní porážku – `culling`) na zbývající dny se sněhem se slámou
 * napřed (diet.md – Zima bez sena: chovné jádro). Chybí-li seno aspoň na celý kus, ves hned
 * porazí celé kusy, na které seno nezbude (kozy, ovce, krávy), a s nimi i všechny čekající kusy –
 * zvířata nehladoví; maso jde do uzení. Chovný pár zůstane (přežije o větvích a slámě – dřív
 * zimní úhyn 1. 3.). Vrátí událost kroniky, nebo null.
 */
export function hayShortSlaughter(
  state: VillageState,
  day: number,
  oxen: number,
  horsesKg = 0,
  first: Partial<Record<'cow' | 'sheep', number>> = {},
): ChronicleEvent | null {
  const livestock = state.livestock;
  // v dlouhé zimě do konce dubna (disasters.md – Zima) – co seno nevydrží, řeší porážka
  const longWinter = isLongWinterRevealed(state, day);
  const days = hayWinterDaysLeft(day, longWinter);
  if (!livestock || days <= 0) return null;
  const waiting = herdRecord((s) => Math.min(livestock.herds[s], livestock.culling?.[s] ?? 0));
  // krávy, ovce a kozy jen na zbývající dny se sněhem (běžná zima, odhalená dlouhá déle) – seno po
  // volech a koních a sláma, i ze snopů před výmlatem (diet.md – Zima bez sena)
  const snowDays = snowDaysAhead(day, days, longWinter ? 'long' : 'normal');
  let hay =
    Math.max(
      0,
      hayLeftAvailable(villageHayKg(state), days) - (oxen * HAY.dailyKg.ox + horsesKg) * days,
    ) + strawAsHayKg(hayLeftAvailable(strawComingKg(state), snowDays));
  const kept = herdRecord((s) => livestock.herds[s] - waiting[s]);
  const fed = herdRecord(() => 0);
  const feed = (species: Exclude<HerdSpecies, 'pig'>, upTo = Infinity): void => {
    const winter = HAY.dailyKg[species] * snowDays;
    const want = Math.max(0, Math.min(kept[species], upTo) - fed[species]);
    const heads = winter <= EPSILON ? want : Math.min(want, hay / winter);
    fed[species] += heads;
    hay = Math.max(0, hay - heads * winter);
  };
  // krávy k obnově volů, ovce na vlnu, pak zbytek v pořadí přednosti (diet.md – Zima bez sena)
  feed('cow', first.cow ?? 0);
  feed('sheep', first.sheep ?? 0);
  for (const species of HAY_EATERS) feed(species);
  const cut = herdRecord(() => 0);
  for (const species of HAY_EATERS) {
    // celé kusy nad seno – chovný pár zůstane
    const keep = Math.max(fed[species], Math.min(kept[species], LIVESTOCK.breedingMin));
    cut[species] = Math.floor(kept[species] - keep + EPSILON);
  }
  if (HAY_EATERS.every((s) => cut[s] <= 0)) return null;
  const animals: Partial<Record<HerdSpecies, number>> = {};
  let kg = 0;
  for (const species of HAY_EATERS) {
    const killed = cut[species] + waiting[species];
    if (killed <= EPSILON) continue;
    const herd = livestock.herds[species];
    livestock.herds[species] = Math.max(0, herd - killed);
    if (livestock.culling) livestock.culling[species] -= waiting[species];
    animals[species] = Math.round(killed * 100) / 100;
    noteSlaughtered(state, day, species, killed);
    kg += killed * LIVESTOCK.meatKg[species];
  }
  butcher(state, kg);
  return { day, kind: 'hay-slaughter', kg: Math.round(kg), animals };
}

/**
 * Porážka (1. 11., před jídlem dne – mutuje stav; diet.md – Porážka v zimě, Chovné stádo podle
 * potřeby): ves rozhodne, co nechá přes zimu – nejvýš nosnost pastvy, sena, lesa a pasáků, místo
 * pro jarní mláďata podle výrostků příštího léta a bez starých kusů (`winterKeepTargets`) – a co
 * půjde na maso. Co je nad tím (staré kusy, kusy nad nosnost), jde na maso vždy; stádo v nosnosti
 * zůstane celé (co největší stáda – oxen.md, Co nejvíc sena a co největší stáda; dřív ho
 * rovnovážné hospodaření zmenšovalo podle ceny jídla v práci). Když stádo potřebu bílkovin
 * nepokryje (`sizeHerdsToNeed` – s luštěninami ze zásoby) a maso v zásobě s porážkou roční potřebu
 * masa (bílkoviny po obilí, mléku, vejcích a luštěninách) taky ne, jdou na maso i letošní mláďata
 * navíc (prasata první, krávy naposled – `MEAT_ORDER`, nejvýš polovina mláďat – druhá stádo
 * rozšíří). Chovný pár, krávy na mléko a voly (`minCows`) a ovce na vlnu
 * (`minSheep`) zůstanou. Kusy na maso ves neporáží najednou: kolik přes zimu sní čerstvého, počká
 * a porazí se po dnech (`winterWait`, `winterSlaughterDay` – `LivestockState.culling`), zbytek se
 * porazí hned a maso se udí. Vrátí událost kroniky (kg masa celkem, `fresh` – z toho přes zimu),
 * nebo null.
 */
export function slaughter(
  state: VillageState,
  day: number,
  input: WinterInput,
): ChronicleEvent | null {
  const livestock = ensureLivestock(state);
  const herds = livestock.herds;
  // loňské čekající kusy (porážka končí 31. 3.) – rozhoduje se znovu
  delete livestock.culling;
  // co největší stádo – cena jídla v práci ho nezmenšuje (oxen.md – Co nejvíc sena a co největší
  // stáda); plán řekne, jestli stádo dá bílkovin dost
  const sized = sizeHerdsToNeed(
    state,
    day,
    winterKeepTargets(state, day, input),
    balanceOptions(input),
  );
  const keep = sized.keep;
  // čítač letos v létě poražených kusů (všechny letní kusy pro rod vojvody – staré i nad odhad
  // zimy) platí do 1. 11.: odhad zimy výš je ještě počítal do stáda, jako by žily
  delete livestock.summerSlaughtered;
  let meat = HERD_SPECIES.reduce((sum, s) => sum + (herds[s] - keep[s]) * LIVESTOCK.meatKg[s], 0);
  // maso, které ves potřebuje – bílkoviny po obilí, mléku stád (přes zimu), vejcích a luštěninách
  let shortfall = sized.sufficient
    ? 0
    : meatNeedPerYear(state, day, keep) - (state.meatKg ?? 0) - meat;
  const floor = breedingFloor(input);
  for (const species of MEAT_ORDER) {
    if (shortfall <= EPSILON) break;
    const youngLeft = Math.max(
      0,
      livestock.young[species] * LIVESTOCK.youngForMeat - (herds[species] - keep[species]),
    );
    // chovný pár, krávy na mléko a voly a ovce na vlnu (diet.md – Oděv) na maso nejdou
    const spare = Math.max(0, keep[species] - Math.min(herds[species], floor[species]));
    const extra = Math.min(youngLeft, spare, shortfall / LIVESTOCK.meatKg[species]);
    if (extra <= EPSILON) continue;
    keep[species] -= extra;
    meat += extra * LIVESTOCK.meatKg[species];
    shortfall -= extra * LIVESTOCK.meatKg[species];
  }
  // kusy na maso: kolik ves přes zimu sní čerstvého, počká na porážku – zbytek hned do uzení
  const killed = herdRecord((s) => Math.max(0, herds[s] - keep[s]));
  const wait = winterWait(
    state,
    day,
    keep,
    killed,
    input.hayKg,
    input.oxen,
    input.room,
    input.strawKg,
  );
  const animals: Partial<Record<HerdSpecies, number>> = {};
  let smoked = 0;
  let fresh = 0;
  for (const species of HERD_SPECIES) {
    if (killed[species] > EPSILON) animals[species] = Math.round(killed[species] * 100) / 100;
    noteSlaughtered(state, day, species, killed[species] - wait[species]);
    smoked += (killed[species] - wait[species]) * LIVESTOCK.meatKg[species];
    fresh += wait[species] * LIVESTOCK.meatKg[species];
    herds[species] = keep[species] + wait[species];
    livestock.young[species] = 0;
  }
  if (fresh > EPSILON) livestock.culling = wait;
  // nová porážka – čekající práce (letní porážka do 31. 10., maso z lovu) se dodělá s ní
  const work = livestock.slaughterWork;
  const pending = work ? Math.max(0, work.required - work.done) : 0;
  livestock.slaughterWork = pending > EPSILON ? { required: pending, done: 0 } : null;
  if (meat <= EPSILON) return null;
  butcher(state, smoked);
  return {
    day,
    kind: 'slaughter',
    kg: Math.round(meat),
    animals,
    ...(fresh >= 1 ? { fresh: Math.round(fresh) } : {}),
  };
}
