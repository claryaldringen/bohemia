import { cattleForSale } from '../village/cattle-trade';
import { craftCoverage } from '../village/crafts';
import { oxenTrainingTarget } from '../village/draft';
import { yearlyCommonLabor } from '../village/dwellings';
import { yearlyFieldNeed } from '../village/field-food';
import { villageHayKg, winterHayAvailable } from '../village/hay';
import { horsesWanted } from '../village/horse-breeding';
import { horsesForSale } from '../village/horse-trade';
import { villageHorses } from '../village/horses';
import { surplusCows, winterHayNeedKg } from '../village/husbandry';
import { HORSE_GOODS } from '../village/neighbours';
import { isTrained, oxPens } from '../village/oxen';
import { oxenOf } from '../village/pens';
import { ageGroup } from '../village/people';
import { NO_PEOPLE, emigrantGroups } from '../village/people-trade';
import { SEED_KG_PER_HA } from '../village/rules-fields';
import { stewardOutlook, type StewardOutlook } from '../village/steward-outlook';
import type {
  CattleGood,
  CraftCoverage,
  Person,
  TradePeople,
  VillageState,
} from '../village/types';
import { stoneOnHand } from '../village/stone';
import { woodLogs } from '../village/wood';
import type { MacroSpare } from './macro';
import { VASSALAGE } from './rules-vassalage';

// Výhled „kolik můžu postrádat“ (vassalage.md – Dávky, Výhled; výpočet návrh Clauda): co ves dnes
// má nad pojistku – osivo a jídlo na VASSALAGE.reserveYears ročních potřeb, seno na zimu stád,
// chovné jádro stád, jezdecký kůň každého muže rodu, lidé, bez kterých ves neudrží pole, a práce
// mimo osev a žně. Počítá se ze dnešních zásob (nejvíc vypovídá 1. 11. po výmlatu) a jen při
// otevření formuláře nebo dialogu (plán – Fáze 4, výkon výhledu). Lidé jsou nejvýš po druzích
// zvlášť (rodiny, muži, ženy berou z týchž lidí – nesčítají se), zboží se sčítá.

const DAYS_PER_YEAR = 365;
/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/**
 * Obilí nad pojistku (kg): zásoby a zrno nevymlácených snopů bez VASSALAGE.reserveYears ročních
 * potřeb – jídlo z pole (`yearlyFieldNeed`) a osivo na osev, který ves zvládne (menší z osevu
 * podle půdy a podle práce – `stewardOutlook`). Ves v hladu nedá nic.
 */
function grainSpareKg(state: VillageState, day: number, outlook: StewardOutlook): number {
  if (state.hungry) return 0;
  const have = Math.max(0, state.storesKg) + Math.max(0, state.sheaves?.grainKg ?? 0);
  const seedKg = Math.min(outlook.landHa, outlook.laborHa) * SEED_KG_PER_HA;
  const reserve = VASSALAGE.reserveYears * (yearlyFieldNeed(state, day) + seedKg);
  return Math.max(0, Math.floor(have - reserve + EPSILON));
}

/**
 * Seno nad zimu stád (kg): zásoba bez sena, které ves na zimu potřebuje (`winterHayNeedKg` –
 * stáda, voli a koně), navýšeného o ztráty ve stohu (`winterHayAvailable`).
 */
function haySpareKg(state: VillageState, day: number, coverage: CraftCoverage): number {
  const keep = winterHayAvailable(1);
  const need = keep > 0 ? winterHayNeedKg(state, day, coverage.tools) / keep : Infinity;
  return Math.max(0, Math.floor(villageHayKg(state) - need + EPSILON));
}

/**
 * Dobytek nad chovné jádro (kusy): krávy nad chovné a na telata do výcviku (`surplusCows`), voli
 * nad počet, který ves chce na rádla a vozy (`oxenTrainingTarget`) – napřed mladí, pak vycvičení,
 * které ves smí prodat (`cattleForSale` – doma, mimo posledních let služby).
 */
export function cattleSpare(state: VillageState, day: number): Record<CattleGood, number> {
  let oxen = 0;
  let young = 0;
  for (const pen of oxPens(state)) {
    for (const ox of oxenOf(pen)) {
      oxen++;
      if (!isTrained(ox, day)) young++;
    }
  }
  const spareOxen = Math.max(0, oxen - oxenTrainingTarget(state));
  const youngOxen = Math.min(young, spareOxen);
  const trainedOxen = Math.min(cattleForSale(state, 'trainedOxen', day), spareOxen - youngOxen);
  return { cows: surplusCows(state, day), youngOxen, trainedOxen };
}

/**
 * Koně nad chovné jádro (kusy): koně bez jezdce, které ves smí prodat (`horsesForSale` – hřebec
 * zůstane), nejvýš nad koně, které ves chce (`horsesWanted` – jezdecký kůň každého muže rodu,
 * chovné klisny a hříbata pro budoucí jezdce).
 */
function horsesSpare(state: VillageState, day: number): number {
  const wanted = horsesWanted(state, day);
  const keep = wanted.riding + wanted.mares + wanted.foals;
  const free = HORSE_GOODS.reduce((sum, good) => sum + horsesForSale(state, good, day), 0);
  return Math.max(0, Math.min(free, villageHorses(state).length - keep));
}

/** Dospělí (16 let až stáří) mezi lidmi. */
function adultsOf(people: readonly Person[], day: number): number {
  return people.reduce((n, p) => n + (ageGroup(p, day) === 'adult' ? 1 : 0), 0);
}

/**
 * Lidé, bez kterých ves pole udrží: když práce v oknech setí stačí na víc pole, než ves má
 * (`stewardOutlook` – osev podle práce nad osevem podle půdy), smí dát takový díl dospělých, o kolik
 * práce přebývá. Kdo odejde, vybere výměna lidí (`emigrantGroups` – z nejvíc přeplněného domu, muži
 * rodu a jejich ženy ne); rodiny, dokud jejich dospělí nepřesáhnou díl. Ves bez pole nedá nikoho.
 */
function peopleSpare(state: VillageState, day: number, outlook: StewardOutlook): TradePeople {
  const { landHa, laborHa } = outlook;
  const share = landHa > 0 && laborHa > landHa ? 1 - landHa / laborHa : 0;
  const budget = Math.floor(adultsOf(state.people, day) * share + EPSILON);
  if (budget <= 0) return { ...NO_PEOPLE };
  let families = 0;
  let adults = 0;
  for (const family of emigrantGroups(state, day, { ...NO_PEOPLE, families: budget }).families) {
    adults += adultsOf(family.people, day);
    if (adults > budget) break;
    families++;
  }
  const men = emigrantGroups(state, day, { ...NO_PEOPLE, men: budget }).men.length;
  const women = emigrantGroups(state, day, { ...NO_PEOPLE, women: budget }).women.length;
  return { families, men, women };
}

/**
 * Robota (člověkodni za rok): společná práce vsi – co zbude po potřebných úlohách, tedy i po osevu
 * a žních (`yearlyCommonLabor`, roční průměr na den) – za rok, bez práce, kterou ještě chtějí
 * rozestavěné stavby.
 */
function laborDaysSpare(state: VillageState): number {
  const building = state.constructions.reduce((sum, c) => sum + Math.max(0, c.cost - c.done), 0);
  return Math.max(0, Math.floor(yearlyCommonLabor(state) * DAYS_PER_YEAR - building + EPSILON));
}

/**
 * Kámen: celé m³ na hromadách kamení (návrh Clauda). Rozestavěné hradby si kámen vzaly z hromad
 * hned při zahájení (`fortStonePlan`) a lámání na zakázku běží v jejich ceně, takže nad potřebu
 * rozestavěných staveb je prostě všechno, co leží na hromadách.
 */
function stoneSpare(state: VillageState): number {
  return Math.max(0, Math.floor(stoneOnHand(state) + EPSILON));
}

/**
 * Kolik ves v den `day` může ročně postrádat, aniž by ji to položilo (vassalage.md – Výhled):
 * obilí, seno, dobytek, koně, klády a kámen (celá hromada – pojistka na ně není) nad pojistku, lidé
 * a robota. Bez dopravy – tu přidá `houseSpare`. Vstupní stav nemění.
 */
export function villageSpare(state: VillageState, day: number): MacroSpare {
  const coverage = craftCoverage(state, day);
  const outlook = stewardOutlook(state, day, coverage);
  return {
    grainKg: grainSpareKg(state, day, outlook),
    hayKg: haySpareKg(state, day, coverage),
    cattle: cattleSpare(state, day),
    horses: horsesSpare(state, day),
    logs: Math.max(0, Math.floor(woodLogs(state) + EPSILON)),
    stoneM3: stoneSpare(state),
    people: peopleSpare(state, day, outlook),
    laborDays: laborDaysSpare(state),
  };
}
