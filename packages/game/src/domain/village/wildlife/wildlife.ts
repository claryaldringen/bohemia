// Divoká zvěř vsi – stropy z krajiny, výchozí stav, převod starších vsí a roční přepočet 1. 5.
// (wildlife.md – Kde zvěř žije a kolik jí je; Roční přepočet – 1. 5.). Bez náhody.

import { TOTAL_GAME_DAYS, dateOfDayIndex, dayIndexOf } from '../../calendar';
import type { Landscape } from '../../landscape';
import { foxCount } from './fox-eggs';
import { villageHerds } from '../livestock/livestock';
import {
  CROWS,
  PREDATION,
  WILDLIFE_CAPS,
  WILDLIFE_LAND,
  WILDLIFE_YEAR,
} from '../rules/rules-wildlife';
import type { VillageState, WildlifeCaps, WildlifeLand, WildlifeState } from '../types';
import { DISASTER_WILDLIFE } from '../rules/rules-disasters';
import { yearlyQuota } from './small-game';
import { weatherOf } from '../disasters/weather';
import { wildlifeLandAt } from './wildlife-land';

const EPSILON = 1e-9;

/** Stropy kusů podle krajiny a prasat vsi (ta zabírají 1 ha lesa na kus – diet.md). */
export function wildlifeCaps(land: WildlifeLand, villagePigs: number): WildlifeCaps {
  const wolves = WILDLIFE_CAPS.wolves;
  const wolfShare = Math.min(
    1,
    Math.max(0, (land.forestHa - wolves.noneBelowHa) / (wolves.fullFromHa - wolves.noneBelowHa)),
  );
  const wildForestHa = Math.max(0, land.forestHa - villagePigs);
  return {
    deer: (land.forestHa * WILDLIFE_CAPS.deerPer100Ha) / 100,
    boar: (wildForestHa * WILDLIFE_CAPS.boarPer100Ha) / 100,
    hares: (land.openHa * WILDLIFE_CAPS.haresPer100Ha) / 100,
    foxes: foxCount(land),
    wolves: wolfShare * wolves.full,
    bear: land.forestHa >= WILDLIFE_CAPS.bearForestHa,
    fishKg: land.waterHa * WILDLIFE_CAPS.fishKgPerHa,
  };
}

/** Hejna vran pro scénu: 1 + 1 na 10 ha osetých polí, nejvýš 5 (neukládá se). */
export function crowFlocks(sownHa: number): number {
  return Math.min(CROWS.max, CROWS.base + Math.floor(sownHa / CROWS.haPerFlock));
}

/** Pigs vsi pro strop (kusy stáda). */
function villagePigs(state: Pick<VillageState, 'livestock'>): number {
  return villageHerds(state).pig;
}

/** Zvěř na stropu – nová ves a převod starších vsí (svět roku 500 je divočina). */
export function freshWildlife(land: WildlifeLand, pigs: number): WildlifeState {
  const caps = wildlifeCaps(land, pigs);
  const deer = WILDLIFE_CAPS.deerShare;
  const deerParts = deer.stags + deer.hinds + deer.calves;
  return {
    land: { ...land },
    deer: {
      stags: (caps.deer * deer.stags) / deerParts,
      hinds: (caps.deer * deer.hinds) / deerParts,
      calves: (caps.deer * deer.calves) / deerParts,
    },
    boar: {
      adults: caps.boar * WILDLIFE_CAPS.boarAdultShare,
      piglets: caps.boar * (1 - WILDLIFE_CAPS.boarAdultShare),
    },
    hares: caps.hares,
    wolves: caps.wolves,
    bear: { present: caps.bear, backDay: null },
    fishKg: caps.fishKg,
  };
}

/** Krajina zvěře vsi: z krajiny sídla, bez ní (testy, kalibrace) výchozí. */
function landOf(state: VillageState, landscape: Landscape | null): WildlifeLand {
  return landscape ? wildlifeLandAt(landscape, state) : { ...WILDLIFE_LAND.defaultLand };
}

/**
 * Ves z doby před zvěří dostane zvěř na stropu (wildlife.md – Pro implementaci) – jednou
 * a idempotentně (ves se `wildlife` vrací týž objekt). Selže-li výpočet krajiny, ves dostane
 * zvěř bez krajiny (`failedLand`: žádná zvěř, lišky ani medvěd; vlků jako dřív `fullPack`) a text
 * chyby v `wildlifeFailed` (aplikace ho zapíše do logu) – chová se jako před zvěří.
 */
export function withWildlife(state: VillageState, landscape: Landscape | null): VillageState {
  if (state.wildlife) return state;
  try {
    return { ...state, wildlife: freshWildlife(landOf(state, landscape), villagePigs(state)) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const wildlife = freshWildlife({ ...WILDLIFE_LAND.failedLand }, villagePigs(state));
    wildlife.wolves = PREDATION.fullPack;
    return { ...state, wildlife, wildlifeFailed: message };
  }
}

/** Je `day` den ročního přepočtu (1. 5.)? */
export function isWildlifeYearDay(day: number): boolean {
  const date = dateOfDayIndex(day);
  return date.month === WILDLIFE_YEAR.month && date.day === WILDLIFE_YEAR.day;
}

/** Den, kdy se po úlovku v den `killDay` vrátí medvěd (za `bearReturnYears` let). */
export function bearBackDay(killDay: number): number {
  const date = dateOfDayIndex(killDay);
  const year = date.year + WILDLIFE_YEAR.bearReturnYears;
  // konec světa: poslední platný den; 29. 2. do nepřestupného roku → 28. 2.
  if (year >= 1500) return TOTAL_GAME_DAYS - 1;
  const day = date.month === 2 && date.day === 29 && year % 4 !== 0 ? 28 : date.day;
  return dayIndexOf({ ...date, year, day });
}

/** Jelení zvěř: dospění, úbytek, přírůstek, nad stropem napřed kolouši a laně poměrně. */
function deerYear(w: WildlifeState, cap: number, badWinter: boolean): void {
  let stags = w.deer.stags + w.deer.calves / 2;
  let hinds = w.deer.hinds + w.deer.calves / 2;
  const keep =
    (1 - (WILDLIFE_YEAR.deerLoss + WILDLIFE_YEAR.deerLossPerWolf * w.wolves)) *
    (badWinter ? 1 - DISASTER_WILDLIFE.badWinterDeerLoss : 1);
  stags *= Math.max(0, keep);
  hinds *= Math.max(0, keep);
  let calves = hinds * WILDLIFE_YEAR.calvesPerHind;
  let over = stags + hinds + calves - cap;
  if (over > EPSILON) {
    const young = hinds + calves;
    const take = Math.min(over, young);
    if (young > 0) {
      hinds *= 1 - take / young;
      calves *= 1 - take / young;
    }
    over -= take;
    if (over > EPSILON) stags = Math.max(0, stags - over);
  }
  w.deer = { stags, hinds, calves };
}

/** Divoká prasata: dospění, úbytek, přírůstek, nad stropem poměrně. */
function boarYear(w: WildlifeState, cap: number, badWinter: boolean, drought: boolean): void {
  const adults =
    (w.boar.adults + w.boar.piglets) *
    (1 - WILDLIFE_YEAR.boarLoss) *
    (badWinter ? 1 - DISASTER_WILDLIFE.badWinterBoarLoss : 1);
  let piglets =
    adults * WILDLIFE_YEAR.pigletsPerAdult * (drought ? DISASTER_WILDLIFE.droughtPigletShare : 1);
  let kept = adults;
  const total = adults + piglets;
  if (total > cap + EPSILON) {
    const scale = cap / total;
    kept *= scale;
    piglets *= scale;
  }
  w.boar = { adults: kept, piglets };
}

/**
 * Roční přepočet zvěře 1. 5. (mutuje stav): krajina znovu (jen s krajinou), pak jelení zvěř,
 * prasata, zajíci, vlci, medvěd a ryby podle stropů. Jinak den nic nedělá.
 */
export function wildlifeYearDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
): void {
  const w = state.wildlife;
  if (!w || !isWildlifeYearDay(day)) return;
  // ves s `wildlifeFailed` má krajinu zvěře pevnou (`failedLand`) – nepřepočítává se
  if (landscape && state.wildlifeFailed === undefined) w.land = wildlifeLandAt(landscape, state);
  const caps = wildlifeCaps(w.land, villagePigs(state));
  // počasí kraje (disasters.md – Zvěř): zlá zima letos, kruté sucho (málo žaludů) loni
  const year = dateOfDayIndex(day).year;
  const badWinter = weatherOf(state, year).winter !== 'normal';
  const drought = weatherOf(state, year - 1).summer === 'drought';
  deerYear(w, caps.deer, badWinter);
  boarYear(w, caps.boar, badWinter, drought);
  w.hares = Math.min(caps.hares, w.hares * WILDLIFE_YEAR.haresGrowth);
  w.wolves =
    w.wolves >= caps.wolves
      ? caps.wolves
      : w.wolves + (caps.wolves - w.wolves) * WILDLIFE_YEAR.wolfRefill;
  if (!caps.bear) {
    w.bear = { present: false, backDay: null };
  } else if (!w.bear.present) {
    if (w.bear.backDay === null) {
      w.bear = { present: true, backDay: null };
    } else if (day >= w.bear.backDay) {
      w.bear = { present: true, backDay: null };
      state.chronicle.push({ day, kind: 'bear-returned' });
    }
  }
  // vybité ryby se obnoví z minimálního osazení (1 % stropu)
  const fish = Math.min(caps.fishKg, Math.max(w.fishKg, caps.fishKg * WILDLIFE_YEAR.fishRestock));
  w.fishKg = caps.fishKg > 0 ? Math.min(caps.fishKg, fish + fish * (1 - fish / caps.fishKg)) : 0;
  // maso z velkého lovu minulého roku – podle něj ves ví, jestli chce víc (drobná zvěř se
  // neočekává, chytá se podle poptávky)
  const wildKg = w.hunt?.year.meatKg ?? 0;
  if (w.smallGame || wildKg > 0) {
    // roční kvóta ryb a zajíců podle letošního přírůstku (small-game.ts)
    w.smallGame = {
      today: null,
      year: { fishKg: 0, hares: 0, meatKg: 0, days: 0 },
      quota: yearlyQuota(w, w.fishKg, w.hares),
      lastWildMeatKg: wildKg,
    };
  }
  // úlovek lovu se počítá od 1. 5. znovu (smečku přepočítá `dogsYear` hned po tomto kroku)
  if (w.hunt) w.hunt.year = { boar: 0, deer: 0, wolves: 0, bear: 0, meatKg: 0, days: 0 };
}
