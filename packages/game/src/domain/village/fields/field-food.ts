import { daysUntilHarvest } from '../core/food';
import { expectedYearlyFoodNeed } from './food-outlook';
import {
  daysUntilLegumeHarvest,
  legumeEnergy,
  legumeStorageLossPerYear,
  villageLegumesKg,
} from './legumes';
import { horseGrainToday, villageHorses } from '../livestock/horses';
import { ageGroup } from '../people/people';
import { storageLossPerYear } from '../core/productivity';
import { FIELD_FOOD, FIELD_STORES, FOOD_NEED_KG_PER_YEAR, LEGUMES } from '../rules';
import { sheavesOutlook } from './threshing';
import { bufferEnergyYearsOf } from '../disasters/weather-effects';
import type { DietDay, VillageState } from '../types';

/** Dní v roce – úroda a potřeba se počítají na rok (365 dní jako roční potřeba jídla). */
const DAYS_PER_YEAR = 365;

// Potřeba z pole podle stravy (fields.md – Výhled zásob k sklizni; Martin 19. 10. 2026). Ves
// nejí jen obilí – maso, mléko a sýr, vejce a ovoce pokryjí velkou část energie (diet.md) a obilí
// s luštěninami jen dorovná zbytek. Kolik toho zbytku za uplynulý hospodářský rok (1. 9. – 31. 8.)
// potřebovala, tolik (podílem dnešní potřeby) bere z pole – nejméně podíl FIELD_FOOD.minShare
// (pojistka – co maso a mléko na stropech nepokryjí). Měří se potřeba, ne snědené obilí. Z ní
// výhled zásob k příští sklizni (`storesOutlook`) – pojistka pro sňatky, správce, nákupy a platby.
// Hlad, příděl a nasycení dál počítá strava ze skutečné energie (diet.ts).

/** Roční potřeba energie vsi (kg obilí) – kolik by snědla, kdyby jedla jen obilí. */
export function yearlyFoodNeed(state: Pick<VillageState, 'people'>, day: number): number {
  return state.people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, day)], 0);
}

/**
 * Podíl potřeby energie, který dnes nepokrylo jídlo mimo pole (maso, mléko a sýr, vejce, ovoce,
 * med z klátů) – ten musí dát obilí a luštěniny (0–1).
 */
export function fieldShareOf(diet: DietDay): number {
  const { meat, dairy, eggs, fruit, honey } = diet.shares;
  return Math.max(0, 1 - (meat + dairy + eggs + fruit + (honey ?? 0)));
}

/**
 * Podíl potřeby energie, který ves čeká z pole: dlouhodobý podíl (klouzavý průměr ročních
 * podílů – `FieldFoodYear.longShare`; u vsi bez něj podíl uplynulého hospodářského roku), nejméně
 * FIELD_FOOD.minShare. Bez celého změřeného roku (starší ves, první rok po založení) 1 – jako by
 * jedla jen obilí (dřívější osev).
 */
export function fieldFoodShare(state: Pick<VillageState, 'fieldFood'>): number {
  const share = state.fieldFood?.longShare ?? state.fieldFood?.share;
  return share === undefined ? 1 : Math.min(1, Math.max(FIELD_FOOD.minShare, share));
}

/** Roční potřeba jídla z pole (kg obilí): podíl z pole × roční potřeba energie. */
export function yearlyFieldNeed(
  state: Pick<VillageState, 'people' | 'fieldFood'>,
  day: number,
): number {
  return fieldFoodShare(state) * yearlyFoodNeed(state, day);
}

/**
 * Stav vsi, ze kterého se počítají zásoby z pole – zásoby a snopy, které ves smí vymlátit (s rukama
 * pro výmlat a plánem – žeň jaře má v srpnu přednost, `sheavesOutlook`).
 */
export type FieldStoresState = Pick<
  VillageState,
  | 'storesKg'
  | 'legumesKg'
  | 'sheaves'
  | 'threshingFloors'
  | 'threshingGraceUntil'
  | 'threshHands'
  | 'season'
>;

/**
 * Zásoby z pole (kg obilí): obilí a luštěniny jejich energií – i nevymlácené snopy, které ves
 * v den `day` smí vymlátit (production-chains.md – Humno; bez dne jen vymlácené zásoby).
 */
export function fieldStoresKg(state: FieldStoresState, day?: number): number {
  const sheaves = day === undefined ? { grainKg: 0, legumesKg: 0 } : sheavesOutlook(state, day);
  return (
    state.storesKg + sheaves.grainKg + legumeEnergy(villageLegumesKg(state) + sheaves.legumesKg)
  );
}

/** Rychlost ztrát skladováním (za rok, spojitě) při ztrátě `lossPerYear` za rok. */
function lossRate(lossPerYear: number): number {
  return -Math.log(1 - Math.min(0.99, Math.max(0, lossPerYear)));
}

/**
 * Kolik ze zásoby `stock` zbude po `years` letech, když se z ní rovnoměrně jí `perYear` za rok
 * a ztrácí `lossPerYear` za rok (spojitě – jako den po dni v simulaci); nejméně 0.
 */
export function storesLeft(
  stock: number,
  perYear: number,
  years: number,
  lossPerYear: number,
): number {
  const rate = lossRate(lossPerYear);
  if (rate < 1e-12) return Math.max(0, stock - perYear * years);
  const left = (stock + perYear / rate) * Math.exp(-rate * years) - perYear / rate;
  return Math.max(0, left);
}

/** Kolik zásoby je třeba, aby po `years` letech spotřeby `perYear` a ztrát zbylo `left`. */
export function storesNeeded(
  left: number,
  perYear: number,
  years: number,
  lossPerYear: number,
): number {
  const rate = lossRate(lossPerYear);
  if (rate < 1e-12) return left + perYear * years;
  return (left + perYear / rate) * Math.exp(rate * years) - perYear / rate;
}

/** Výhled zásob z pole k příští sklizni (fields.md – Výhled zásob k sklizni). */
export interface StoresOutlook {
  /** Roční potřeba z pole v roce po příští sklizni – podle růstu vsi (kg obilí). */
  needKg: number;
  /** Zásoby z pole, které zbudou k příští sklizni (kg obilí). */
  leftKg: number;
  /**
   * Kolik zásob z pole do příští sklizně chybí (kg obilí): potřeba z pole do sklizně i se ztrátami
   * bez zásob, které ves smí sníst (bez osiva, které ještě zaseje), a bez luštěnin nad strop;
   * 0 = vystačí (správce – Obilí v nouzi).
   */
  shortKg: number;
  /** Pojistka – zásoba z pole, která má zbýt před další sklizní (kg obilí). */
  bufferKg: number;
}

/**
 * Výhled zásob z pole k příští sklizni (fields.md – Výhled zásob k sklizni): zásoby obilí,
 * nevymlácené snopy, které ves smí vymlátit, a luštěniny ubývají do sklizně potřebou z pole
 * (`fieldFoodShare`) a ztrátami skladováním. Luštěniny (zboží – ves je na poli nepěstuje,
 * fields.md – Luštěniny, zrušeno) se jí rovným dílem až do stropu, takže zásoba nad strop přetrvá.
 * `potteryCoverage` – nádoby od hrnčíře zmenšují ztráty (crafts.md). Potřeba podle růstu vsi
 * (fields.md – Osev podle růstu vsi): do příští sklizně a rok po ní podle výhledu lidí
 * (`expectedYearlyFoodNeed` – děti dorostou, narodí se další). Obilí jezdeckých koní (horses.md –
 * Krmení: 1,5 kg denně) a psů dvorce se přičte celé. Osivo, které ves ještě zaseje (`seedKg` –
 * `seedOutsideFoodKg`), zásoby k sklizni neuživí. Pojistka (`bufferKg`) – po krutém roce
 * v paměti hladu větší (disasters.md – Dopady, Zásoby a pojistka).
 */
export function storesOutlook(
  state: Pick<
    VillageState,
    'people' | 'fieldFood' | 'pens' | 'wildlife' | 'weatherSeed' | 'disasters'
  > &
    FieldStoresState,
  day: number,
  potteryCoverage: number,
  seedKg = 0,
): StoresOutlook {
  // potřeba podle růstu vsi: do příští sklizně se jí ze zásob, rok po ní podle výhledu lidí
  const harvestDay = day + daysUntilHarvest(day) - 1;
  const yearly = expectedYearlyFoodNeed(state, day, day, harvestDay);
  const yearlyAfter = expectedYearlyFoodNeed(
    state,
    day,
    harvestDay + 1,
    harvestDay + DAYS_PER_YEAR,
  );
  const share = fieldFoodShare(state);
  // obilí koní za rok podle dnešních jezdeckých koní; ves bez koní nic
  const horses = villageHorses(state);
  const horseGrain = (horses.length > 0 ? horseGrainToday(horses, day) : 0) * DAYS_PER_YEAR;
  const need = share * yearly + horseGrain;
  const needAfter = share * yearlyAfter + horseGrain;
  const loss = storageLossPerYear(potteryCoverage);
  const legumeLoss = legumeStorageLossPerYear(potteryCoverage);
  // luštěnin se do jejich sklizně sní nejvýš strop – co nad něj zbude, sní se příští rok
  const legumeCapKg = (LEGUMES.energyCap * yearly) / LEGUMES.energy;
  const legumeYears = daysUntilLegumeHarvest(day) / DAYS_PER_YEAR;
  // nevymlácené snopy, které ves smí vymlátit, jsou zásobou (production-chains.md – Humno)
  const sheaves = sheavesOutlook(state, day);
  const legumesKg = villageLegumesKg(state) + sheaves.legumesKg;
  const legumesLeftKg = storesLeft(legumesKg, legumeCapKg, legumeYears, legumeLoss);
  // zásoby z pole k příští sklizni: obilí a luštěniny, které se do ní snědí, ubývají potřebou
  // z pole a ztrátami; luštěniny nad strop zůstanou celé
  const years = daysUntilHarvest(day) / DAYS_PER_YEAR;
  // osivo, které ves ještě zaseje, zásoby k sklizni neuživí (fields.md – Výhled zásob k sklizni)
  const eatenStock = Math.max(
    0,
    state.storesKg +
      sheaves.grainKg +
      legumeEnergy(Math.max(0, legumesKg - legumesLeftKg)) -
      seedKg,
  );
  const left = storesLeft(eatenStock, need, years, loss) + legumeEnergy(legumesLeftKg);
  // co do sklizně chybí: potřeba do ní i se ztrátami bez všeho, co ves smí sníst
  const short = Math.max(
    0,
    storesNeeded(0, need, years, loss) - eatenStock - legumeEnergy(legumesLeftKg),
  );
  // paměť hladu: po krutém roce 10 let pojistka 0,75 (disasters.md – Dopady, Zásoby a pojistka)
  const buffer = bufferKg(
    yearlyAfter,
    bufferEnergyYearsOf(state, day, FIELD_STORES.bufferEnergyYears),
  );
  return { needKg: needAfter, leftKg: left, shortKg: short, bufferKg: buffer };
}

/**
 * Naplnění pojistky (0–1): zásoby z pole, které zbudou k příští sklizni (`leftKg`), proti pojistce
 * (`bufferKg` – 0,5 roční potřeby, v paměti hladu 0,75). Pod 1 ves pojistku nemá – sňatky čekají
 * (kinship.md – Sňatky čekají na zásoby) a ves chce páry k rádlům i na nouzový osev (oxen.md –
 * Kolik volů ves chce, Pod pojistkou). Ves bez lidí (pojistka 0) ji má.
 */
export function bufferFill(outlook: Pick<StoresOutlook, 'leftKg' | 'bufferKg'>): number {
  if (outlook.bufferKg <= 0) return 1;
  return Math.min(1, Math.max(0, outlook.leftKg / outlook.bufferKg));
}

/**
 * Cílová zásoba z pole před sklizní (kg obilí): pojistka `bufferKgValue` a FIELD_STORES.cushionYears
 * roční potřeby z pole `needKg` nad ní (fields.md – Osev podle zásob).
 */
export function storesTargetKg(needKg: number, bufferKgValue: number): number {
  return bufferKgValue + FIELD_STORES.cushionYears * needKg;
}

/**
 * Pojistka zásob z pole (kg obilí) – FIELD_STORES.bufferEnergyYears roční potřeby celé energie
 * `yearlyFoodNeedKg`: výpadek masa nebo mléka (porážka dá méně, stáda uhynou) je výpadek z celé
 * stravy, ne z toho, co ves bere z pole – ves, která víc jí ze stád, má pojistku větší vůči
 * potřebě z pole.
 */
export function bufferKg(
  yearlyFoodNeedKg: number,
  energyYears: number = FIELD_STORES.bufferEnergyYears,
): number {
  return energyYears * yearlyFoodNeedKg;
}

/**
 * Kolik úrody z pole (kg obilí) ves sklízí rok co rok, když má cílovou zásobu – roční potřeba
 * z pole `needKg`, pojistka `bufferKgValue` (cílová zásoba `storesTargetKg`) a ztráty skladováním
 * (kalibrace, kalkulačka, kapacita polí).
 */
export function steadyHarvestKg(
  needKg: number,
  bufferKgValue: number,
  potteryCoverage: number,
): number {
  const keep = storesTargetKg(needKg, bufferKgValue);
  return storesNeeded(keep, needKg, 1, storageLossPerYear(potteryCoverage)) - keep;
}

/**
 * Jídlo dne do součtů hospodářského roku (mutuje stav): potřeba `needPerDay` (kg obilí) a z ní
 * část, kterou nepokrylo jídlo mimo pole. Součty běží až od prvního 1. 9. (`closeFieldFoodYear`).
 */
export function recordFieldFood(state: VillageState, needPerDay: number, diet: DietDay): void {
  const year = state.fieldFood;
  if (!year || needPerDay <= 0) return;
  year.needKg += needPerDay;
  year.fieldKg += needPerDay * fieldShareOf(diet);
}

/**
 * 1. 9. na začátku hospodářského roku (mutuje stav): z celého uplynulého hospodářského roku spočítá podíl
 * jídla z pole, posune o třetinu rozdílu dlouhodobý podíl (`longShare`) a začne nový rok. Ves bez
 * součtů je začne – podíl dostane až za rok (součty tak vždy pokrývají celý rok i se zimou bez
 * mléka a podzimem s ovocem).
 */
export function closeFieldFoodYear(state: VillageState): void {
  const year = state.fieldFood;
  const measured = year && year.needKg > 0 ? year.fieldKg / year.needKg : undefined;
  const share = measured ?? year?.share;
  // dlouhodobý podíl: každý rok o třetinu rozdílu k ročnímu; starší ves začne loňským ročním
  const before = year?.longShare ?? year?.share;
  const longShare =
    measured === undefined
      ? before
      : before === undefined
        ? measured
        : before + (measured - before) / FIELD_STORES.balanceYears;
  state.fieldFood = {
    needKg: 0,
    fieldKg: 0,
    ...(share !== undefined ? { share } : {}),
    ...(longShare !== undefined ? { longShare } : {}),
  };
}
