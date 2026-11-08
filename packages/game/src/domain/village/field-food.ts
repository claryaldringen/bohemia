import { daysUntilHarvest } from './food';
import { expectedYearlyFoodNeed } from './food-outlook';
import {
  daysUntilLegumeHarvest,
  legumeEnergy,
  legumeStorageLossPerYear,
  villageLegumesKg,
} from './legumes';
import { horseGrainToday, villageHorses } from './horses';
import { dogGrainToday } from './hunt-party';
import { ageGroup } from './people';
import { storageLossPerYear } from './productivity';
import { FIELD_FOOD, FIELD_STORES, FOOD_NEED_KG_PER_YEAR, LEGUMES } from './rules';
import { sheavesOutlook } from './threshing';
import { bufferEnergyYearsOf, sowingYieldFactor } from './weather-effects';
import type { DietDay, VillageState } from './types';

/** Dní v roce – úroda a potřeba se počítají na rok (365 dní jako roční potřeba jídla). */
const DAYS_PER_YEAR = 365;

// Osev podle stravy (fields.md – Kolik ves oseje; Martin 19. 10. 2026: „Zatím udělejme osev podle
// stravy“). Ves nejí jen obilí – maso, mléko a sýr, vejce a ovoce pokryjí velkou část energie
// (diet.md) a obilí s luštěninami jen dorovná zbytek. Kolik toho zbytku za uplynulý hospodářský
// rok (1. 9. – 31. 8.) potřebovala, tolik (podílem dnešní potřeby) oseje na příští rok – nejméně
// podíl FIELD_FOOD.minShare (pojistka – co maso a mléko na stropech nepokryjí). Měří se potřeba, ne
// snědené obilí: když ves hladoví, sní obilí méně, ale pole jí pořád má dát celý zbytek – jinak by
// hlad snížil osev a s ním přinesl další hlad.
// Osev podle zásob (Martin 19. 10. 2026): ves seje jen tolik, aby po příští sklizni měla na rok
// spotřeby a pojistku – co má v zásobách navíc, oseje méně a práce se uvolní na stavby.
// Hlad, příděl a nasycení dál počítá strava ze skutečné energie (diet.ts); tady je jen plán.

/** Roční potřeba energie vsi (kg obilí) – kolik by snědla, kdyby jedla jen obilí. */
export function yearlyFoodNeed(state: Pick<VillageState, 'people'>, day: number): number {
  return state.people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, day)], 0);
}

/**
 * Podíl potřeby energie, který dnes nepokrylo jídlo mimo pole (maso, mléko a sýr, vejce, ovoce) –
 * ten musí dát obilí a luštěniny (0–1).
 */
export function fieldShareOf(diet: DietDay): number {
  const { meat, dairy, eggs, fruit } = diet.shares;
  return Math.max(0, 1 - (meat + dairy + eggs + fruit));
}

/**
 * Podíl potřeby energie, který ves plánuje z pole: dlouhodobý podíl (klouzavý průměr ročních
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

/** Cíle plánu osevu (fields.md – Kolik ves oseje, Osev podle zásob). */
export interface SowingTargets {
  /** Kolik energie (kg obilí, luštěniny svou energií) má dát úroda plánu – cíl osevu (`neededSelection`). */
  targetKg: number;
  /**
   * Kolik energie má dát úroda kvůli jídlu (kg obilí) – cíl bez luštěnin navíc na bílkoviny; když
   * ho díly od 70 % nepokryjí, ves seje i přílohy pod 70 % (fields.md – Nouzový osev).
   */
  harvestKg: number;
  /** Kolik luštěnin (kg čisté úrody) – jejich potřeba bez toho, co ze zásoby luštěnin zbude. */
  legumeKg: number;
  /** Pod kolik energie luštěniny plán nestáhnou – nejvýš potřeba z pole na rok. */
  energyFloorKg: number;
  /** Roční potřeba z pole v roce po příští sklizni – podle růstu vsi (kg obilí). */
  needKg: number;
  /** Zásoby z pole, které zbudou k příští sklizni (kg obilí). */
  leftKg: number;
  /**
   * Kolik zásob z pole do příští sklizně chybí (kg obilí): potřeba z pole do sklizně i se ztrátami
   * bez zásob, které ves smí sníst (bez osiva, které na setí čeká), a bez luštěnin nad strop;
   * 0 = vystačí (správce – Obilí v nouzi).
   */
  shortKg: number;
  /** Pojistka – zásoba z pole, která má zbýt před další sklizní (kg obilí). */
  bufferKg: number;
  /** Zásoby z pole, které má ves mít po příští sklizni – rok spotřeby a cílová zásoba (kg obilí). */
  afterHarvestKg: number;
}

/**
 * Cíle osevu podle zásob (fields.md – Kolik ves oseje, Osev podle zásob; Martin 19. 10. 2026:
 * „Ať se osev řídí také zásobami“ a „Ano, plynulejší osev určitě.“). Ves seje rok co rok zhruba
 * stejně – úrodu, která při dlouhodobé spotřebě z pole (`fieldFoodShare`) a ztrátách skladováním
 * udrží k další sklizni cílovou zásobu (pojistka `bufferKg` + FIELD_STORES.cushionYears roční
 * potřeby z pole). Odchylku zásob k příští sklizni od cílové vyrovnává pozvolna – přebytek
 * i schodek nad pojistkou po FIELD_STORES.balanceYears letech (jen třetinu za rok); co chybí do
 * pojistky, doplní hned. Luštěniny podle své zásoby: jejich potřeba (`legumeNeedKg` – bílkoviny)
 * bez toho, co z jejich zásoby k jejich sklizni zbude – jí se rovným dílem do sklizně až do stropu,
 * takže zásoba nad strop přetrvá a sní se příště; pojistku drží obilí, které dorovná cokoli.
 * Luštěniny se zasejí i tehdy, když obilí ves nepotřebuje. `potteryCoverage` – nádoby od hrnčíře
 * zmenšují ztráty (crafts.md). Potřeba podle růstu vsi (fields.md – Osev podle růstu vsi): do
 * příští sklizně a rok po ní podle výhledu lidí (`expectedYearlyFoodNeed` – děti dorostou, narodí
 * se další), ne podle dnešního počtu. Obilí jezdeckých koní (horses.md – Krmení: 1,5 kg denně) se
 * přičte do příští sklizně i rok po ní celé – koně jedí jen obilí z pole. Osivo, které na setí
 * ještě čeká (`seedAheadKg` – energie, fields.md – Úroda, Osivo ze zásob), zásoby k sklizni
 * neuživí – díly plánu se pak počítají čistou úrodou (hrubá − osivo), jako by osivo dalšího osevu
 * odložila sklizeň.
 */
export function sowingTargets(
  state: Pick<
    VillageState,
    'people' | 'fieldFood' | 'pens' | 'wildlife' | 'weatherSeed' | 'disasters'
  > &
    FieldStoresState,
  day: number,
  legumeNeedKg: number,
  potteryCoverage: number,
  seedAheadKg = 0,
): SowingTargets {
  // potřeba podle růstu vsi (Osev podle růstu vsi): do příští sklizně se jí ze zásob, úroda plánu
  // se jí rok po ní – děti mezitím dorostou a narodí se další
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
  // a obilí psů dvorce (wildlife.md – Psi)
  const horseGrain =
    (horses.length > 0 ? horseGrainToday(horses, day) : 0) * DAYS_PER_YEAR +
    dogGrainToday(state) * DAYS_PER_YEAR;
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
  // osivo, které na setí ještě čeká, zásoby k sklizni neuživí (fields.md – Úroda, Osivo ze zásob)
  const eatenStock = Math.max(
    0,
    state.storesKg +
      sheaves.grainKg +
      legumeEnergy(Math.max(0, legumesKg - legumesLeftKg)) -
      seedAheadKg,
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
  const keep = storesTargetKg(needAfter, buffer);
  // úroda rok co rok: po sklizni tolik, aby po roce spotřeby a ztrát zbyla cílová zásoba
  const afterHarvest = storesNeeded(keep, needAfter, 1, loss);
  const steady = afterHarvest - keep;
  // odchylka od cílové zásoby po třetinách; pod pojistkou se chybějící doplní hned
  const correction =
    left >= buffer
      ? (keep - left) / FIELD_STORES.balanceYears
      : buffer - left + (keep - buffer) / FIELD_STORES.balanceYears;
  // ves s počasím kraje seje s průměrem let – hrubá úroda ≈ 0,95 (disasters.md – Co z toho plyne)
  const harvest = (steady + correction) / sowingYieldFactor(state);
  const legumeKg = Math.max(0, legumeNeedKg - legumesLeftKg);
  const targetKg = Math.max(0, harvest, legumeEnergy(legumeKg));
  return {
    targetKg,
    harvestKg: Math.max(0, harvest),
    legumeKg,
    energyFloorKg: Math.min(targetKg, needAfter),
    needKg: needAfter,
    leftKg: left,
    shortKg: short,
    bufferKg: buffer,
    afterHarvestKg: afterHarvest,
  };
}

/**
 * Naplnění pojistky (0–1): zásoby z pole, které zbudou k příští sklizni (`leftKg`), proti pojistce
 * (`bufferKg` – 0,5 roční potřeby, v paměti hladu 0,75). Pod 1 ves pojistku nemá – sňatky čekají
 * (kinship.md – Sňatky čekají na zásoby) a ves chce páry k rádlům i na nouzový osev (oxen.md –
 * Kolik volů ves chce, Pod pojistkou). Ves bez lidí (pojistka 0) ji má.
 */
export function bufferFill(targets: Pick<SowingTargets, 'leftKg' | 'bufferKg'>): number {
  if (targets.bufferKg <= 0) return 1;
  return Math.min(1, Math.max(0, targets.leftKg / targets.bufferKg));
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
 * (`sowingTargets` v ustáleném stavu; kalibrace, kalkulačka).
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
 * 1. 9. před plánem osevu (mutuje stav): z celého uplynulého hospodářského roku spočítá podíl
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
