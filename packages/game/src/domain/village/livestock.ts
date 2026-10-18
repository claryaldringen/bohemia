import { dateOfDayIndex } from '../calendar';
import { DIET } from './diet';
import { isOvergrown } from './fields';
import { HAY } from './hay';
import { ageGroup } from './people';
import { FOOD_NEED_KG_PER_YEAR } from './rules';
import type {
  ChronicleEvent,
  DwellingType,
  HerdSpecies,
  LivestockState,
  VillageState,
} from './types';

// Dobytek (diet.md – Dobytek, schváleno 18. 10. 2026): skutečná stáda ovcí, koz, prasat a krav.
// Stáda rostou mláďaty na jaře až do nosnosti – pastva na úhoru a loukách (ovce, kozy, krávy),
// les do 600 m od vsi (prasata, žaludy a bukvice), seno na zimu (krávy a voli). V listopadu jde
// na maso, co přeroste nosnost, a mladé kusy, které ves potřebuje na maso; chovné kusy (aspoň
// pár od druhu) zůstanou. Slepice u obydlí snáší vejce (počítají se jako maso). Zásoba masa se
// uzí a suší – ztrácí 20 % ročně (diet.ts). Pasou děti – žádná práce; porážka a uzení 1
// člověkoden na 20 kg masa.

/**
 * diet.md – Dobytek (návrh Clauda, Martin schválil): výchozí stádo na domácnost 3 ovce, 1 koza,
 * 2 prasata, kráva na 2 domácnosti; růst ročně ovce a kozy +40 %, prasata +100 %, krávy +20 %;
 * pastva 0,2 ha na ovci a kozu, 1 ha na krávu (a vola), 1 ha lesa na prase do 600 m od vsi; maso
 * z kusu prase 50, ovce 15, koza 12, kráva (vůl) 120 kg; slepice 5 kg vajec ročně; porážka
 * a uzení 1 člověkoden na 20 kg. Na maso navíc (když ho ves nemá dost) jde nejvýš polovina
 * letošních mláďat – druhá polovina stádo rozšíří (návrh Clauda při implementaci; bez ní by ves
 * snědla každé mládě a stádo by nikdy nevyrostlo). Ves chová, kolik potřebuje: když by mláďata
 * ovcí, koz a prasat (s vejci) dala aspoň 1,5× roční potřeby masa, jdou letošní mláďata těch
 * druhů na maso celá a stádo už neroste (rozhodnutí kontroléru – jinak by stádo rostlo až do
 * nosnosti luk, stovky ovcí na pár lidí). Krávy rostou dál do nosnosti (telata pro voly).
 * Bez údaje o krajině typická krajina (≈ 60 ha luk do 600 m – fields.md, Kolik půdy je; les
 * návrh Clauda).
 */
export const LIVESTOCK = {
  perHousehold: { sheep: 3, goat: 1, pig: 2 },
  householdsPerCow: 2,
  growth: { sheep: 0.4, goat: 0.4, pig: 1, cow: 0.2 },
  pastureHa: { sheep: 0.2, goat: 0.2, cow: 1 },
  oxPastureHa: 1,
  forestHaPerPig: 1,
  reachM: 600,
  meatKg: { sheep: 15, goat: 12, pig: 50, cow: 120 },
  oxMeatKg: 120,
  eggsKgPerHen: 5,
  breedingMin: 2,
  youngForMeat: 0.5,
  herdSufficient: 1.5,
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
};
/** Na maso navíc jdou mláďata v tomto pořadí – nejvíc masa za kus první. */
const MEAT_ORDER: readonly HerdSpecies[] = ['pig', 'sheep', 'goat', 'cow'];
/** Druhy chované na maso – jejich stádo přestane růst, když masa dávají dost. */
const MEAT_HERDS: readonly HerdSpecies[] = ['sheep', 'goat', 'pig'];

const M2_PER_HA = 10_000;
/** Pozemek a ohrada zabírají celé políčko 15 × 15 m. */
const CELL_M2 = 225;
const DAYS_PER_YEAR = 365;
/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

function herdRecord(value: (s: HerdSpecies) => number): Record<HerdSpecies, number> {
  return { sheep: value('sheep'), goat: value('goat'), pig: value('pig'), cow: value('cow') };
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
 * Pastva (ha) pro ovce, kozy, krávy a voly: louka do 600 m bez toho, co zabírají pole mimo
 * příloh, příloh zarostlý křovím a mladým lesem, les vsi, sady, hřbitovy, pozemky a ohrady, plus
 * příloh na vymýceném lese (pase se na celém přílohu ve fázi louky – mladém i pastvině, po seči
 * i na louce na seno; fields.md – Zarůstání).
 */
export function pastureHa(state: VillageState): number {
  let used = 0;
  let clearedFallow = 0;
  for (const part of state.parts) {
    if (part.state === 'fallow' && !isOvergrown(part)) {
      if (part.surface === 'forest') clearedFallow += part.areaM2;
    } else if (part.surface !== 'forest') {
      used += part.areaM2;
    }
  }
  for (const wood of state.woods ?? []) if (wood.surface !== 'forest') used += wood.areaM2;
  for (const orchard of state.orchards ?? []) {
    for (const square of orchard.squares) used += square.areaM2;
  }
  for (const cemetery of state.cemeteries ?? []) {
    used += cemetery.squares.length * cemetery.squareSizeM * cemetery.squareSizeM;
  }
  used += state.dwellings.filter((d) => d.plot).length * CELL_M2;
  used += (state.pens ?? []).length * CELL_M2;
  const meadow = Math.max(0, livestockLand(state).meadowHa - used / M2_PER_HA);
  return meadow + clearedFallow / M2_PER_HA;
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

/** Roční potřeba masa vsi (kg) – 20 % potřeby energie v mase (diet.md). */
export function meatNeedPerYear(state: Pick<VillageState, 'people'>, day: number): number {
  const energy = state.people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, day)], 0);
  return (energy * DIET.shares.meat) / DIET.meatEnergy;
}

/** Přidá maso z porážky a práci na porážce a uzení (mutuje stav). */
export function butcher(state: VillageState, kg: number): void {
  if (kg <= 0) return;
  state.meatKg = (state.meatKg ?? 0) + kg;
  const livestock = ensureLivestock(state);
  const work = (livestock.slaughterWork ??= { required: 0, done: 0 });
  work.required += kg / LIVESTOCK.slaughterKgPerManDay;
}

/** Zbývající práce porážky a uzení (člověkodny) – jen v listopadu. */
export function slaughterRemaining(state: VillageState, day: number): number {
  const work = state.livestock?.slaughterWork;
  if (!work || dateOfDayIndex(day).month !== SLAUGHTER_MONTH) return 0;
  return Math.max(0, work.required - work.done);
}

/** Vloží práci do porážky a uzení (mutuje stav). */
export function workSlaughter(state: VillageState, amount: number): void {
  const work = state.livestock?.slaughterWork;
  if (!work || amount <= 0) return;
  work.done = Math.min(work.required, work.done + amount);
}

/** Jeden den snášky – vejce do zásoby masa (mutuje stav). */
export function layEggs(state: VillageState): void {
  const eggs = (villageChickens(state) * LIVESTOCK.eggsKgPerHen) / DAYS_PER_YEAR;
  if (eggs > 0) state.meatKg = (state.meatKg ?? 0) + eggs;
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

/** Co stáda unesou přes zimu – kusy po druzích (aspoň chovný pár, který ves má). */
export function winterTargets(
  state: VillageState,
  oxen: number,
  hayKg: number,
): Record<HerdSpecies, number> {
  const herds = villageHerds(state);
  const breeding = (s: HerdSpecies): number => Math.min(herds[s], LIVESTOCK.breedingMin);
  // pastva: voli mají přednost (orají), ovce, kozy a krávy se podělí o zbytek poměrně
  const grazers = grazingDemandHa(herds, 0);
  const free = Math.max(0, pastureHa(state) - oxen * LIVESTOCK.oxPastureHa);
  const scale = grazers > EPSILON ? Math.min(1, free / grazers) : 1;
  // krávy přes zimu jen tolik, kolik uživí seno po volech
  const cowHay = Math.max(0, hayKg - oxen * HAY.perHeadKg) / HAY.perHeadKg;
  const targets = herdRecord((s) => herds[s] * scale);
  targets.pig = Math.min(herds.pig, pigForestHa(state) / LIVESTOCK.forestHaPerPig);
  targets.cow = Math.min(targets.cow, cowHay);
  return herdRecord((s) => Math.max(breeding(s), targets[s]));
}

/**
 * Porážka (1. 11., před jídlem dne – mutuje stav): na maso jde, co přeroste nosnost (pastva, les,
 * seno na zimu – `winterTargets`); stádo, které dává masa dost, neroste (mláďata ovcí, koz
 * a prasat celá na maso); a když maso v zásobě s vejci roční potřebu nepokryje, i letošní
 * mláďata navíc (prasata první, nejvýš polovina mláďat) – chovný pár zůstane. Vrátí událost kroniky, nebo null.
 */
export function slaughter(
  state: VillageState,
  day: number,
  oxen: number,
  hayKg: number,
): ChronicleEvent | null {
  const livestock = ensureLivestock(state);
  const herds = livestock.herds;
  const keep = winterTargets(state, oxen, hayKg);
  const eggs = villageChickens(state) * LIVESTOCK.eggsKgPerHen;
  const need = meatNeedPerYear(state, day);
  // stádo dost velké: mláďata ovcí, koz a prasat (s vejci) by dala aspoň 1,5× potřeby masa –
  // letošní mláďata těch druhů jdou na maso celá
  const potential =
    eggs +
    MEAT_HERDS.reduce((sum, s) => sum + keep[s] * LIVESTOCK.growth[s] * LIVESTOCK.meatKg[s], 0);
  if (potential >= LIVESTOCK.herdSufficient * need) {
    for (const s of MEAT_HERDS) {
      const breeding = Math.min(herds[s], LIVESTOCK.breedingMin);
      keep[s] = Math.max(breeding, Math.min(keep[s], herds[s] - livestock.young[s]));
    }
  }
  let meat = HERD_SPECIES.reduce((sum, s) => sum + (herds[s] - keep[s]) * LIVESTOCK.meatKg[s], 0);
  let shortfall = need - eggs - (state.meatKg ?? 0) - meat;
  for (const species of MEAT_ORDER) {
    if (shortfall <= EPSILON) break;
    const youngLeft = Math.max(
      0,
      livestock.young[species] * LIVESTOCK.youngForMeat - (herds[species] - keep[species]),
    );
    const spare = Math.max(0, keep[species] - Math.min(herds[species], LIVESTOCK.breedingMin));
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
