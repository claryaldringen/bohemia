import { dateOfDayIndex } from '../calendar';
import { yearlyMilk } from './dairy';
import { DIET, PROTEIN, proteinNeedPerDay } from './diet';
import type { FoodCosts } from './economy';
import { HERDING } from './herding';
import { isOvergrown } from './fields';
import { fallowPastureHa, hayPlanNaturalHa, PASTURE, pastureParts } from './pasture';
import { HAY, HAY_EATERS, HAY_WINTER_DAYS, winterHayAvailable } from './hay';
import { legumeSupplyPerYear } from './legumes';
import { ageGroup } from './people';
import { woolSheep } from './wool';
import { FOOD_NEED_KG_PER_YEAR, LEGUMES } from './rules';
import type {
  ChronicleEvent,
  DwellingType,
  HerdSpecies,
  LivestockState,
  VillageState,
} from './types';

// Dobytek (diet.md – Dobytek, schváleno 18. 10. 2026): skutečná stáda ovcí, koz, prasat a krav.
// Stáda rostou mláďaty na jaře až do nosnosti – pastva na úhoru a loukách (ovce, kozy, krávy), les
// do 600 m od vsi (prasata, žaludy a bukvice na podzim), seno na zimu (krávy, voli, ovce a kozy)
// a pasáci (děti, starší, pak dospělí). Každý den část stáda uhyne (nemoci, vlci, úrazy – roční
// ztráty po druzích, Martin 19. 10. 2026). V listopadu jde na maso, co přeroste nosnost, a chovné
// stádo se zmenší na velikost, která mlékem a mláďaty dá bílkoviny na potřebu vsi s rezervou
// (Martin 19. 10. 2026: „ano“) – ovce napřed (Martin: „primárním zvířetem by měly být ovce“);
// chovné kusy (aspoň pár od druhu, krávy na mléko a voly) zůstanou. Slepice u obydlí snáší vejce
// (jí se čerstvá). Zásoba masa se uzí a suší a do léta se zkazí (diet.ts). Maso a mléko jsou kvůli
// bílkovinám (Martin): kolik masa ves potřebuje, určí bílkoviny, které chybí po obilí, mléku
// a vejcích. Porážka a uzení 1 člověkoden na 20 kg masa, dojení a péče – dairy.ts.

/**
 * diet.md – Dobytek (návrh Clauda, Martin schválil): výchozí stádo na domácnost 3 ovce, 1 koza,
 * 2 prasata, kráva na 2 domácnosti; růst ročně ovce a kozy +40 %, prasata +100 %, krávy +20 %;
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
  growth: { sheep: 0.4, goat: 0.4, pig: 1, cow: 0.2 },
  lossPerYear: { sheep: 0.12, goat: 0.1, pig: 0.12, cow: 0.06 },
  pastureHa: { sheep: 0.2, goat: 0.2, cow: 1 },
  oxPastureHa: 1,
  forestHaPerPig: 1,
  reachM: 600,
  meatKg: { sheep: 15, goat: 12, pig: 50, cow: 120 },
  oxMeatKg: 120,
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
export const SLAUGHTER_MONTH = 11;
/** Slepice u obydlí (Martin – jako ve scéně): zemnice 2, polozemnice 3. */
export const CHICKENS_PER_DWELLING: Readonly<Record<DwellingType, number>> = {
  zemnice: 2,
  polozemnice: 3,
  dvorec: 4,
};
/**
 * Na maso navíc jdou mláďata v tomto pořadí – obráceně proti chovu podle potřeby (prasata jen na
 * maso první, ovce naposled – stádo ovcí tak roste nejrychleji; diet.md – Skladba stáda).
 */
const MEAT_ORDER: readonly HerdSpecies[] = ['pig', 'cow', 'goat', 'sheep'];

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
  }
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
  used += (state.pens ?? []).length * CELL_M2;
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
  return meadow - hay + hay * PASTURE.aftermathShare + fallowPastureHa(pastureParts(state, day));
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

/** Pastva, kterou stáda (a `oxen` volů) spásají (ha). */
export function grazingDemandHa(herds: Record<HerdSpecies, number>, oxen: number): number {
  const { pastureHa: per } = LIVESTOCK;
  return (
    herds.sheep * per.sheep +
    herds.goat * per.goat +
    herds.cow * per.cow +
    oxen * LIVESTOCK.oxPastureHa
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
type ProteinVillage = Pick<VillageState, 'people' | 'dwellings' | 'livestock' | 'legumesKg'>;

/** O kolik víc bílkovin (kg) dá kg luštěnin než obilí se stejnou energií. */
const LEGUME_PROTEIN_GAIN = LEGUMES.protein - PROTEIN.perKg.grain * LEGUMES.energy;

/** Roční potřeba energie vsi (kg obilí). */
function yearlyEnergyNeed(state: Pick<VillageState, 'people'>, day: number): number {
  return state.people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, day)], 0);
}

/** Nejvýš tolik luštěnin (kg) sní ves za rok – strop podílu energie (diet.md – Luštěniny). */
function legumeCapPerYear(state: Pick<VillageState, 'people'>, day: number): number {
  return (LEGUMES.energyCap * yearlyEnergyNeed(state, day)) / LEGUMES.energy;
}

/**
 * Roční bilance bílkovin vsi se stády `herds` (bez údaje dnešní stáda). Luštěniny podle zásoby
 * (rovným dílem do příští sklizně, přepočteno na rok, nejvýš strop) – vsi bez luštěnin 0.
 */
export function proteinBudget(
  state: ProteinVillage,
  day: number,
  herds: Record<HerdSpecies, number> = villageHerds(state),
): ProteinBudget {
  let need = 0;
  let grain = 0;
  for (const p of state.people) {
    need += proteinNeedPerDay(p, day) * DAYS_PER_YEAR;
    grain +=
      FOOD_NEED_KG_PER_YEAR[ageGroup(p, day)] * LIVESTOCK.grainEnergyShare * PROTEIN.perKg.grain;
  }
  const legumeKg = Math.min(
    legumeSupplyPerYear(state, day, DAYS_PER_YEAR),
    legumeCapPerYear(state, day),
  );
  return {
    need,
    grain,
    milk: yearlyMilk(herds).proteinKg * LIVESTOCK.milkProteinKept,
    eggs: villageChickens(state) * LIVESTOCK.eggsKgPerHen * PROTEIN.perKg.eggs,
    legumes: legumeKg * LEGUME_PROTEIN_GAIN,
  };
}

/**
 * Kolik luštěnin ves chce sníst za rok (kg – diet.md, Luštěniny): bílkoviny, které chybí po obilí,
 * mléku stád a vejcích, v luštěninách místo obilí, nejvýš strop podílu energie. Podle toho ves
 * oseje díly luštěninami (plán osevu k 1. 9.).
 */
export function legumeNeedPerYear(
  state: ProteinVillage,
  day: number,
  herds?: Record<HerdSpecies, number>,
): number {
  const b = proteinBudget(state, day, herds);
  const missing = Math.max(0, b.need - b.grain - b.milk - b.eggs);
  return Math.min(missing / LEGUME_PROTEIN_GAIN, legumeCapPerYear(state, day));
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

/** Přidá maso z porážky a práci na porážce a uzení (mutuje stav). */
export function butcher(state: VillageState, kg: number): void {
  if (kg <= 0) return;
  state.meatKg = (state.meatKg ?? 0) + kg;
  const livestock = ensureLivestock(state);
  const work = (livestock.slaughterWork ??= { required: 0, done: 0 });
  work.required += kg / LIVESTOCK.slaughterKgPerManDay;
}

/**
 * Zbývající práce porážky a uzení (člověkodny) – v listopadu, nouzová porážka (diet.md – Nouzová
 * porážka) i v jiném měsíci.
 */
export function slaughterRemaining(state: VillageState, day: number): number {
  const work = state.livestock?.slaughterWork;
  if (!work || (dateOfDayIndex(day).month !== SLAUGHTER_MONTH && !work.emergency)) return 0;
  return Math.max(0, work.required - work.done);
}

/** Vloží práci do porážky a uzení (mutuje stav). */
export function workSlaughter(state: VillageState, amount: number): void {
  const work = state.livestock?.slaughterWork;
  if (!work || amount <= 0) return;
  work.done = Math.min(work.required, work.done + amount);
}

/** Vejce dne (kg) – jí se čerstvá. */
export function dailyEggsKg(state: Pick<VillageState, 'people' | 'dwellings'>): number {
  return (villageChickens(state) * LIVESTOCK.eggsKgPerHen) / DAYS_PER_YEAR;
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
  /** Krávy, které ves drží vždy (`breedingCows` – mléko a telata pro voly); bez údaje pár. */
  minCows?: number;
  /** Podíl stáda, který pasáci přes rok uhlídali (diet.md – Pasáci); bez údaje vše. */
  herding?: number;
  /** Ovce na vlnu pro oděv všech (`woolSheep` – diet.md, Oděv); bez údaje jen chovný pár. */
  minSheep?: number;
  /** Cena jídla v práci (`foodCosts` – Rovnovážné hospodaření); bez údaje typická. */
  costs?: FoodCosts;
  /** Pasáků z výrostků 7–13 let (`childHerderCapacity` – diet.md, Pasáci); bez údaje dost. */
  freeHerders?: number;
}

/**
 * Volby chovu z údajů porážky (`WinterInput`). Seč (1. 6.), osev (1. 9.) i porážka (1. 11.) počítají
 * týž plán i s luštěninami (`planLegumes`) – zásoba luštěnin stádo nezmenší: sní se tak jako tak,
 * ale stádo dává bílkoviny i příští rok (diet.md – Rovnovážné hospodaření).
 */
function balanceOptions(input: WinterInput): BalanceOptions {
  return {
    minCows: input.minCows ?? 0,
    minSheep: input.minSheep ?? 0,
    ...(input.costs ? { costs: input.costs } : {}),
    ...(input.freeHerders !== undefined ? { freeHerders: input.freeHerders } : {}),
    planLegumes: true,
  };
}

/**
 * Pořadí, v jakém si stáda berou pastvu a seno (diet.md – Skladba stáda, Oděv; Martin
 * 19. 10. 2026): ovce na vlnu pro oděv všech („Ovce jsou hlavně kvůli vlně, aby se lidé mohli
 * vůbec oblékat.“), krávy, které ves drží vždy (mléko a voly), pak další ovce („primárním zvířetem
 * by měly být ovce“), kozy a zbytek krav.
 */
const GRAZING_ORDER: readonly ('wool' | 'floor' | 'sheep' | 'goat' | 'cow')[] = [
  'wool',
  'floor',
  'sheep',
  'goat',
  'cow',
];

/**
 * Komu pasáci stačili (diet.md – Pasáci, Oděv): uhlídaný podíl `watched` celé potřeby pasáků
 * (kusy ÷ kolik jich pasák uhlídá) jde napřed na ovce na vlnu (`woolSheep` kusů – podíl `wool`),
 * zbytek rovným podílem na ostatní kusy (`rest`). Bez ovcí na vlnu oba podíly = `watched`.
 */
function watchedShares(
  herds: Record<HerdSpecies, number>,
  woolSheep: number,
  watched: number,
): { wool: number; rest: number } {
  if (watched >= 1 - EPSILON || woolSheep <= EPSILON) return { wool: watched, rest: watched };
  const need = HERD_SPECIES.reduce((sum, s) => sum + herds[s] / HERDING.perHerder[s], 0);
  const wool = woolSheep / HERDING.perHerder.sheep;
  const restNeed = need - wool;
  const covered = watched * need;
  return {
    wool: Math.min(1, covered / wool),
    rest: restNeed > EPSILON ? Math.max(0, Math.min(1, (covered - wool) / restNeed)) : watched,
  };
}

/**
 * Co stáda unesou přes zimu – kusy po druzích (aspoň chovný pár, který ves má). Pastva a seno se
 * dělí podle přednosti (`GRAZING_ORDER` – voli první, pak ovce na vlnu, krávy na mléko a voly,
 * další ovce, kozy – ty spásají napřed křoviny –, zbytek krav); prasata podle lesa (pasou se v něm
 * celý rok – žaludy, bukvice, kořínky); a jen tolik, kolik pasáci uhlídali (`herding` – co nikdo
 * neuhlídal, jde na maso) – pasáci hlídají napřed ovce na vlnu (`watchedShares`).
 */
export function winterTargets(
  state: VillageState,
  day: number,
  input: WinterInput,
): Record<HerdSpecies, number> {
  const herds = villageHerds(state);
  const woolHeads = Math.min(herds.sheep, Math.max(0, input.minSheep ?? 0));
  const watched = watchedShares(herds, woolHeads, Math.min(1, Math.max(0, input.herding ?? 1)));
  // ovce na vlnu, které pasáci uhlídali
  const woolSheep = woolHeads * watched.wool;
  const breeding = (s: HerdSpecies): number => Math.min(herds[s], LIVESTOCK.breedingMin);
  let pasture = Math.max(0, pastureHa(state, day) - input.oxen * LIVESTOCK.oxPastureHa);
  let browse = goatBrowseHa(state);
  let hay = Math.max(
    0,
    winterHayAvailable(input.hayKg) - input.oxen * HAY.dailyKg.ox * HAY_WINTER_DAYS,
  );
  const targets = herdRecord(() => 0);
  const take = (species: 'sheep' | 'goat' | 'cow', wanted: number): void => {
    const per = LIVESTOCK.pastureHa[species];
    const winterHay = HAY.dailyKg[species] * HAY_WINTER_DAYS;
    const own = species === 'goat' ? browse : 0;
    const heads = Math.max(
      0,
      Math.min(
        wanted - targets[species],
        (species === 'sheep' ? woolSheep : 0) +
          (herds[species] - (species === 'sheep' ? woolHeads : 0)) * watched.rest -
          targets[species],
        (pasture + own) / per,
        hay / winterHay,
      ),
    );
    const grazing = heads * per;
    const fromBrowse = Math.min(own, grazing);
    browse -= fromBrowse;
    pasture = Math.max(0, pasture - (grazing - fromBrowse));
    hay = Math.max(0, hay - heads * winterHay);
    targets[species] += heads;
  };
  for (const step of GRAZING_ORDER) {
    if (step === 'wool') take('sheep', woolSheep);
    else if (step === 'floor') take('cow', input.minCows ?? 0);
    else take(step, Infinity);
  }
  targets.pig = Math.min(herds.pig * watched.rest, pigForestHa(state) / LIVESTOCK.forestHaPerPig);
  return herdRecord((s) => Math.max(breeding(s), targets[s]));
}

/**
 * Maso (kg za rok), které dá kus přezimujícího stáda mláďaty, když stádo zůstane stejné: mláďata
 * na jaře (`growth`) po ročních ztrátách celého stáda (od porážky k porážce) nad počet chovných
 * kusů.
 */
export function yearlyMeatPerHead(species: HerdSpecies): number {
  const surplus = (1 + LIVESTOCK.growth[species]) * (1 - LIVESTOCK.lossPerYear[species]) - 1;
  return Math.max(0, surplus) * LIVESTOCK.meatKg[species];
}

/**
 * Bílkoviny (kg za rok), které dá kus přezimujícího stáda: mléko (85 % bílkovin – syrovátka
 * odteče) a maso z mláďat (`yearlyMeatPerHead`).
 */
export function proteinPerHead(species: HerdSpecies): number {
  const milk = yearlyMilk(herdRecord((s) => (s === species ? 1 : 0))).proteinKg;
  return milk * LIVESTOCK.milkProteinKept + yearlyMeatPerHead(species) * PROTEIN.perKg.meat;
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
 * kilogram bílkovin nestojí víc práce než kilogram bílkovin z obilí; luštěniny se plánují po
 * 25 kg.
 */
export const BALANCE = {
  proteinReserve: 0.1,
  minProteinCoverage: 0.88,
  legumeStepKg: 25,
} as const;

/** Co dá a co stojí chovný kus za rok (diet.md – Rovnovážné hospodaření). */
export interface HeadEconomy {
  /**
   * Práce vsi za rok (člověkodny) – seno a porážka; dojení, péče a pasení jdou bokem (ženy
   * a výrostci – population.md, Práce).
   */
  labor: number;
  /** Pasáků (plných) na kus v době pastvy – i s mláďaty (kolik kusů výrostci uhlídají). */
  herders: number;
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
 * a porážka s uzením (dojení, sýr a péče jsou bokem – ženy); pasáci na kus v době pastvy
 * i s mláďaty (přežvýkavci duben–říjen, prasata celý rok).
 */
export function headEconomy(species: HerdSpecies, costs: FoodCosts): HeadEconomy {
  const g = LIVESTOCK.growth[species];
  const meat = yearlyMeatPerHead(species);
  const milk = yearlyMilk(herdRecord((s) => (s === species ? 1 : 0)));
  const slaughterWork = meat / LIVESTOCK.slaughterKgPerManDay;
  const base = {
    meatEnergy: meat * DIET.meatEnergy,
    dairyEnergy: milk.energy,
    meatProtein: meat * PROTEIN.perKg.meat,
    dairyProtein: milk.proteinKg * LIVESTOCK.milkProteinKept,
  };
  const herders = (1 + g) / HERDING.perHerder[species];
  if (species === 'pig') return { ...base, labor: slaughterWork, herders };
  const hay = HAY.dailyKg[species] * HAY_WINTER_DAYS * costs.hayPerKg;
  return { ...base, labor: hay + slaughterWork, herders };
}

/** Chovné stádo podle potřeby – cíle po druzích a jestli stádo potřebu (s rezervou) pokryje. */
export interface SizedHerds {
  keep: Record<HerdSpecies, number>;
  /** Stádo v nosnosti dá bílkovin aspoň potřebu s rezervou – zmenšilo se na ni. */
  sufficient: boolean;
  /** Luštěniny, které ves chce sníst za rok (kg) – jen při plánu osevu (`legumes`), jinak 0. */
  legumeKg: number;
  /** Pokrytí bílkovin plánu (0–1+). */
  coverage: number;
}

/**
 * Pořadí chovu (diet.md – Skladba stáda, Martin 19. 10. 2026): ovce dávají vlnu, mléko i maso,
 * kozy mléko a spasou křoviny, krávy jsou hlavně na voly a mléko (nejnáročnější), prasata jen na
 * maso; luštěniny (pole) s nimi soupeří cenou v práci (Rovnovážné hospodaření).
 */
export const BREEDING_ORDER: readonly HerdSpecies[] = ['sheep', 'goat', 'cow', 'pig'];
/** Přežvýkavci v pořadí chovu. */
const RUMINANT_ORDER: readonly HerdSpecies[] = ['sheep', 'goat', 'cow'];
/** Pojistka proti nekonečné smyčce plánu (kusy a dávky luštěnin). */
const MAX_PLAN_STEPS = 100_000;

/** Rozhodnutí chovu – co ves k plánu ví (diet.md – Rovnovážné hospodaření). */
export interface BalanceOptions {
  /** Krávy, které ves drží vždy (`breedingCows` – mléko a telata pro voly). */
  minCows?: number;
  /** Ovce na vlnu pro oděv všech (`woolSheep` – diet.md, Oděv) – spodní hranice ovcí. */
  minSheep?: number;
  /** Cena jídla v práci (`foodCosts`); bez údaje typická ves bez řemesel. */
  costs?: FoodCosts;
  /** Pasáků z výrostků 7–13 let (`childHerderCapacity`); bez údaje dost. */
  freeHerders?: number;
  /** Plánuje i luštěniny (osev 1. 9.); jinak luštěniny podle zásoby. */
  planLegumes?: boolean;
}

/**
 * Typická cena jídla v práci (bez údajů vsi) – `foodCosts` vsi bez dílů v osevu a bez plánu seče
 * s nejhoršími mezemi (hlídá test; tady číslem – economy.ts přes hay.ts a pěšiny zpět importuje
 * livestock.ts).
 */
export const TYPICAL_FOOD_COSTS: FoodCosts = {
  grainPerKg: 0.62,
  legumePerKg: 0.83,
  hayPerKg: 0.0127,
};

/**
 * Rovnovážné hospodaření (diet.md – Rovnovážné hospodaření; Martin 19. 10. 2026): ves si nechá
 * chovný pár od každého druhu a krávy na mléko a voly (`minCows`) a ze stáda v nosnosti (`keep` –
 * pastva, les, seno, pasáci) přidává po kusech (luštěniny po 25 kg), nejvýš kolik výrostci
 * uhlídají (`freeHerders` – pasáci nic nestojí, ale počet dětí stádo omezuje; diet.md – Pasáci).
 * Cena zdroje = práce vsi na kus (`headEconomy` – seno a porážka) mínus práce na obilí, které jeho
 * maso a mléko nahradí (energie × cena obilí), na kilogram bílkovin navíc proti obilí.
 * 1. Co práci šetří (záporná cena – maso a mléko nahradí dražší obilí), přidá vždy, i nad potřebu
 *    – v pořadí chovu (BREEDING_ORDER, ovce napřed – Martin), do nosnosti a stropů podílů energie.
 * 2. Do potřeby bílkovin s rezervou nejlevnější zdroj – přežvýkavci v pořadí chovu, prasata
 *    a luštěniny soupeří cenou; nad 88 % potřeby jen zdroj, jehož bílkoviny nejsou dražší než
 *    bílkoviny z obilí.
 * Zbytek jde při porážce na maso; nad nosnost se nic nepřidává. Deterministické, bez stavu navíc.
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
  const eggsKg = villageChickens(state) * LIVESTOCK.eggsKgPerHen;
  // bílkoviny, kdyby ves jedla jen obilí, a co k nim dají vejce a luštěniny ze zásoby (navíc proti
  // obilí se stejnou energií)
  const grainProtein = PROTEIN.perKg.grain;
  const stockLegumes = options.planLegumes
    ? 0
    : Math.min(legumeSupplyPerYear(state, day, DAYS_PER_YEAR), legumeCapPerYear(state, day));
  let protein =
    energyNeed * grainProtein +
    eggsKg * (PROTEIN.perKg.eggs - DIET.energy.eggs * grainProtein) +
    stockLegumes * LEGUME_PROTEIN_GAIN;
  const caps = {
    meat: DIET.caps.meat * energyNeed,
    dairy: DIET.caps.dairy * energyNeed,
    legume: DIET.caps.legumes * energyNeed,
  };
  const used = { meat: 0, dairy: 0, legume: stockLegumes * LEGUMES.energy, herders: 0 };
  const freeHerders = options.freeHerders ?? Infinity;
  const worth = costs.grainPerKg / grainProtein;
  const heads: Record<HerdSpecies, HeadEconomy> = {
    sheep: headEconomy('sheep', costs),
    goat: headEconomy('goat', costs),
    pig: headEconomy('pig', costs),
    cow: headEconomy('cow', costs),
  };
  const targets = herdRecord(() => 0);
  let legumeKg = 0;

  /** Co přinese `unit` kusů druhu (nebo kg luštěnin) – po stropech energie. */
  interface Offer {
    species: HerdSpecies | 'legume';
    unit: number;
    netLabor: number;
    netProtein: number;
    meat: number;
    dairy: number;
    legume: number;
    herders: number;
  }
  const offer = (species: HerdSpecies, wanted: number, capped = true): Offer => {
    const head = heads[species];
    // kolik kusů výrostci ještě uhlídají (chovný pár a stádo na vlnu se drží vždy – `capped`)
    const room = Math.max(0, freeHerders - used.herders);
    const unit =
      capped && head.herders > 0 ? Math.min(wanted, room / head.herders) : Math.max(0, wanted);
    const meat = Math.min(head.meatEnergy * unit, Math.max(0, caps.meat - used.meat));
    const dairy = Math.min(head.dairyEnergy * unit, Math.max(0, caps.dairy - used.dairy));
    const meatShare = head.meatEnergy > 0 ? meat / (head.meatEnergy * unit) : 0;
    const dairyShare = head.dairyEnergy > 0 ? dairy / (head.dairyEnergy * unit) : 0;
    const proteinGain =
      head.meatProtein * unit * meatShare +
      head.dairyProtein * unit * dairyShare -
      (meat + dairy) * grainProtein;
    const herders = head.herders * unit;
    const netLabor = head.labor * unit - (meat + dairy) * costs.grainPerKg;
    return { species, unit, netLabor, netProtein: proteinGain, meat, dairy, legume: 0, herders };
  };
  const legumeOffer = (unit: number): Offer => {
    const kg = Math.min(unit, Math.max(0, caps.legume - used.legume) / LEGUMES.energy);
    return {
      species: 'legume',
      unit: kg,
      netLabor: kg * (costs.legumePerKg - costs.grainPerKg * LEGUMES.energy),
      netProtein: kg * LEGUME_PROTEIN_GAIN,
      meat: 0,
      dairy: 0,
      legume: kg * LEGUMES.energy,
      herders: 0,
    };
  };
  const apply = (o: Offer): void => {
    if (o.species === 'legume') legumeKg += o.unit;
    else targets[o.species] += o.unit;
    protein += o.netProtein;
    used.meat += o.meat;
    used.dairy += o.dairy;
    used.legume += o.legume;
    used.herders += o.herders;
  };
  // chovný pár od každého druhu, krávy na mléko a voly, ovce na vlnu pro oděv (diet.md – Oděv)
  for (const species of HERD_SPECIES) {
    const floor =
      species === 'cow'
        ? Math.max(LIVESTOCK.breedingMin, options.minCows ?? 0)
        : species === 'sheep'
          ? Math.max(LIVESTOCK.breedingMin, options.minSheep ?? 0)
          : LIVESTOCK.breedingMin;
    const unit = Math.min(keep[species], floor);
    if (unit > EPSILON) apply(offer(species, unit, false));
  }
  const left = (s: HerdSpecies): number => keep[s] - targets[s];
  const price = (o: Offer): number =>
    o.netLabor < 0 ? o.netLabor : o.netLabor / Math.max(o.netProtein, EPSILON);
  /** Další kus druhu (nejvýš jeden, poslední podílem). */
  const head = (species: HerdSpecies): Offer | null =>
    left(species) > EPSILON ? offer(species, Math.min(1, left(species))) : null;
  // 1. co práci šetří (maso a mléko nahradí dražší obilí) – i nad potřebu, v pořadí chovu (ovce
  // napřed – Martin), do nosnosti a stropů podílů energie
  for (let guard = 0; guard < MAX_PLAN_STEPS; guard++) {
    const saving = BREEDING_ORDER.map(head).find(
      (o): o is Offer => o !== null && o.unit > EPSILON && o.netLabor < -EPSILON,
    );
    const legume = options.planLegumes ? legumeOffer(BALANCE.legumeStepKg) : null;
    const best =
      saving ?? (legume && legume.unit > EPSILON && legume.netLabor < -EPSILON ? legume : null);
    if (!best) break;
    apply(best);
  }
  // 2. do potřeby bílkovin s rezervou nejlevnější zdroj – přežvýkavci v pořadí chovu, prasata
  // a luštěniny soupeří cenou; nad 88 % potřeby jen zdroj levnější než bílkoviny z obilí
  for (let guard = 0; guard < MAX_PLAN_STEPS && protein < required - EPSILON; guard++) {
    const offers: Offer[] = [];
    const ruminant = RUMINANT_ORDER.find((s) => (head(s)?.netProtein ?? 0) > EPSILON);
    if (ruminant) offers.push(head(ruminant)!);
    const pig = head('pig');
    if (pig && pig.netProtein > EPSILON) offers.push(pig);
    if (options.planLegumes) {
      const legume = legumeOffer(BALANCE.legumeStepKg);
      if (legume.unit > EPSILON && legume.netProtein > EPSILON) offers.push(legume);
    }
    if (offers.length === 0) break;
    const best = offers.reduce((a, b) => (price(b) < price(a) ? b : a));
    if (protein / required >= BALANCE.minProteinCoverage && price(best) > worth) break;
    // jen do potřeby – poslední kus podílem
    const share = Math.min(1, (required - protein) / Math.max(best.netProtein, EPSILON));
    if (share < 1 - EPSILON) {
      apply(
        best.species === 'legume'
          ? legumeOffer(best.unit * share)
          : offer(best.species, best.unit * share),
      );
      break;
    }
    apply(best);
  }
  return {
    keep: herdRecord((s) => Math.min(keep[s], targets[s])),
    sufficient: protein >= required - EPSILON,
    legumeKg,
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
 * Plán chovu a luštěnin bez ohledu na seno (podle něj se seče – 1. 6.; luštěniny podle něj ves
 * oseje – 1. 9.) – diet.md, Rovnovážné hospodaření.
 */
export function balancedPlan(
  state: VillageState,
  day: number,
  input: Omit<WinterInput, 'hayKg'>,
): SizedHerds {
  const full = { ...input, hayKg: Infinity };
  return sizeHerdsToNeed(state, day, winterTargets(state, day, full), balanceOptions(full));
}

/**
 * Zimní úhyn (1. 3., mutuje stav – diet.md, Zimní úhyn): krávy, ovce a kozy přežijí zimu
 * i o polovičním přídělu sena (zhubnou); když dostaly méně (`coverage` pod HAY.deathBelowCoverage),
 * stádo se zmenší na tolik kusů, kolik by polovinu přídělu mělo – chovný pár přežije (odchová se
 * z větví a slámy). Vrátí událost kroniky, nebo null.
 */
export function starveHerds(
  state: VillageState,
  day: number,
  coverage: number,
): ChronicleEvent | null {
  const livestock = state.livestock;
  if (!livestock || coverage >= HAY.deathBelowCoverage - EPSILON) return null;
  const survive = Math.max(0, coverage) / HAY.deathBelowCoverage;
  const animals: Partial<Record<HerdSpecies, number>> = {};
  for (const species of HAY_EATERS) {
    const herd = livestock.herds[species];
    const left = Math.max(Math.min(herd, LIVESTOCK.breedingMin), herd * survive);
    if (herd - left > EPSILON) animals[species] = Math.round((herd - left) * 100) / 100;
    livestock.young[species] *= herd > EPSILON ? left / herd : 0;
    livestock.herds[species] = left;
  }
  return Object.keys(animals).length > 0 ? { day, kind: 'herd-starved', animals } : null;
}

/**
 * Porážka (1. 11., před jídlem dne – mutuje stav): na maso jde, co přeroste nosnost (pastva, les,
 * seno na zimu, pasáci – `winterTargets`), a chovné stádo nad potřebu bílkovin s rezervou
 * (`sizeHerdsToNeed` – i dospělé kusy; v roce zmenšení tak vznikne jednorázový přebytek masa, do
 * léta se zkazí). Když stádo potřebu nepokryje a maso v zásobě s porážkou roční potřebu masa
 * (bílkoviny po obilí, mléku, vejcích a luštěninách) taky ne, jdou na maso i letošní mláďata navíc
 * (prasata první, ovce naposled, nejvýš polovina mláďat – druhá stádo rozšíří). Chovný pár,
 * krávy na mléko a voly (`minCows`) a ovce na vlnu (`minSheep`) zůstanou. Vrátí událost kroniky,
 * nebo null.
 */
export function slaughter(
  state: VillageState,
  day: number,
  input: WinterInput,
): ChronicleEvent | null {
  const livestock = ensureLivestock(state);
  const herds = livestock.herds;
  const sized = sizeHerdsToNeed(
    state,
    day,
    winterTargets(state, day, input),
    balanceOptions(input),
  );
  const keep = sized.keep;
  let meat = HERD_SPECIES.reduce((sum, s) => sum + (herds[s] - keep[s]) * LIVESTOCK.meatKg[s], 0);
  // maso, které ves potřebuje – bílkoviny po obilí, mléku stád (přes zimu), vejcích a luštěninách
  let shortfall = sized.sufficient
    ? 0
    : meatNeedPerYear(state, day, keep) - (state.meatKg ?? 0) - meat;
  for (const species of MEAT_ORDER) {
    if (shortfall <= EPSILON) break;
    const youngLeft = Math.max(
      0,
      livestock.young[species] * LIVESTOCK.youngForMeat - (herds[species] - keep[species]),
    );
    // chovný pár, krávy na mléko a voly a ovce na vlnu (diet.md – Oděv) na maso nejdou
    const floor =
      species === 'cow'
        ? Math.max(LIVESTOCK.breedingMin, input.minCows ?? 0)
        : species === 'sheep'
          ? Math.max(LIVESTOCK.breedingMin, input.minSheep ?? 0)
          : LIVESTOCK.breedingMin;
    const spare = Math.max(0, keep[species] - Math.min(herds[species], floor));
    const extra = Math.min(youngLeft, spare, shortfall / LIVESTOCK.meatKg[species]);
    if (extra <= EPSILON) continue;
    keep[species] -= extra;
    meat += extra * LIVESTOCK.meatKg[species];
    shortfall -= extra * LIVESTOCK.meatKg[species];
  }
  const animals: Partial<Record<HerdSpecies, number>> = {};
  for (const species of HERD_SPECIES) {
    const killed = herds[species] - keep[species];
    if (killed > EPSILON) animals[species] = Math.round(killed * 100) / 100;
    herds[species] = keep[species];
    livestock.young[species] = 0;
  }
  // loňská práce na porážce propadá – nová porážka začíná znovu
  livestock.slaughterWork = null;
  if (meat <= EPSILON) return null;
  butcher(state, meat);
  return { day, kind: 'slaughter', kg: Math.round(meat), animals };
}
