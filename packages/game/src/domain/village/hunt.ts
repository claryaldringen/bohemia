// Velký lov rodu (wildlife.md – Lov rodu): kdo a kdy loví (`planHuntDay` ráno), úlovek dne
// a maso do zásoby (`huntDay` před výcvikem). Bez náhody – úlovek jde akumulátorem; riziko lovu
// a lov navíc na pokyn hráče jsou až W5.
import { dateOfDayIndex } from '../calendar';
import { assignRiders, riderPower } from './horse-riders';
import { isUnshod } from './horse-shoeing-term';
import { huntingDogs, huntPool } from './hunt-party';
import { villageHerds, butcher } from './livestock';
import { trainingFamily } from './lord';
import { ageYears } from './people';
import { HUNT, PREDATION } from './rules-wildlife';
import type {
  ChronicleEvent,
  Horse,
  HuntDay,
  HuntKills,
  HuntState,
  Person,
  VillageState,
  WildlifeState,
} from './types';
import { bearBackDay, wildlifeCaps } from './wildlife';
import { villageHorses } from './horses';

const EPSILON = 1e-9;

function emptyHunt(): HuntState {
  return {
    hope: { boar: 0, deer: 0, wolf: 0, bear: 0 },
    today: null,
    year: { boar: 0, deer: 0, wolves: 0, bear: 0, meatKg: 0, days: 0 },
  };
}

/**
 * Pořadí dne lovu v sezóně (0 = 1. 11., 7 = 8. 11., …), nebo null mimo sezónu 1. 11. – konec února.
 * Leden a únor se počítají od 1. 11. předchozího roku (61 dní do 1. 1.).
 */
export function huntSeasonIndex(day: number): number | null {
  const { month, day: d } = dateOfDayIndex(day);
  const { fromMonth, toMonth } = HUNT.season;
  let offset: number;
  if (month === fromMonth) offset = d - 1;
  else if (month === fromMonth + 1) offset = 30 + d - 1;
  else if (month === 1) offset = 61 + d - 1;
  else if (month === toMonth) offset = 92 + d - 1;
  else return null;
  return offset % HUNT.everyDays === 0 ? offset / HUNT.everyDays : null;
}

/** Je `day` den kalendářního lovu (každý 7. den od 1. 11. do konce února)? */
export function isHuntCalendarDay(day: number): boolean {
  return huntSeasonIndex(day) !== null;
}

/** Šelmy za posledních 30 dní strhly aspoň `HUNT.wolfKills` kusů dobytka a vlci jsou. */
function wolvesTroubling(w: WildlifeState, day: number): boolean {
  if (w.wolves < 1 - EPSILON) return false;
  const since = day - PREDATION.killDaysKept;
  return (w.predation?.killDays ?? []).filter((d) => d > since).length >= HUNT.wolfKills;
}

/**
 * Lov dne (mutuje `hunt.today`; volá se ráno, po `updateLordTraining` a před `work()` – pěší lovci
 * jsou pak mimo práci vsi): kalendářní den (W5 doplní lov navíc), rodina cvičí. Jezdci jsou cvičící
 * muži s koněm (`assignRiders`; nepodkutý kůň nejezdí), chlapci 10–13 let s koněm jedou jako
 * doprovod; pěší jsou muži dvorce bez koně a odešlí synové rodu od 14 let. Na medvěda jdou všichni
 * pěšky. Cíl: medvěd (listopad, každý druhý lov), vlci (aspoň 2 dny škod za 30 dní), jinak
 * prasata a jeleni.
 */
export function planHuntDay(state: VillageState, day: number): void {
  const w = state.wildlife;
  if (!w) return;
  const extra = w.hunt?.extraDay === day;
  const index = huntSeasonIndex(day);
  const family = index !== null || extra ? trainingFamily(state, day) : null;
  if (!family || (index === null && !extra)) {
    if (w.hunt?.today) w.hunt.today = null;
    return;
  }
  const hunt = (w.hunt ??= emptyHunt());
  hunt.today = null;
  const pool = huntPool(state, day, family);
  const mounted = isUnshod(state, day) ? new Set<number>() : assignRiders(state, day, family);
  const horseOf = new Map<number, Horse>();
  for (const h of villageHorses(state)) if (h.riderId !== undefined) horseOf.set(h.riderId, h);
  const bear =
    index !== null &&
    w.bear.present &&
    dateOfDayIndex(day).month === HUNT.bearMonth &&
    index % HUNT.bearEveryNth === HUNT.bearEveryNth - 1;
  const target: HuntDay['target'] = bear ? 'bear' : wolvesTroubling(w, day) ? 'wolves' : 'game';
  const riders: HuntDay['riders'] = [];
  const foot: number[] = [];
  const mount = (p: Person): boolean => {
    const horse = horseOf.get(p.id);
    if (target === 'bear' || !horse || !mounted.has(p.id)) return false;
    riders.push({ personId: p.id, horseId: horse.id });
    return true;
  };
  for (const p of pool.manor) if (!mount(p)) foot.push(p.id);
  for (const p of pool.boys) mount(p);
  for (const p of pool.away) foot.push(p.id);
  if (riders.length === 0 && foot.length === 0) return;
  hunt.today = { day, target, riders, foot, extra };
}

/** Síla jezdce (wildlife.md – Kolik): `riderPower ÷ 100 × (0,5 + 0,5 × luk ÷ 100)`, doprovod polovina. */
function riderStrength(p: Person, horse: Horse, day: number): number {
  const bow = (p.arms?.bow ?? 0) / 100;
  const full =
    (riderPower({ arms: p.arms }, horse) / 100) * (HUNT.bowBase + HUNT.bowPerSkill * bow);
  return ageYears(p.bornDay, day) >= HUNT.riderFromAge ? full : full * HUNT.escortShare;
}

/** Síla pěšího: `(luk + boj) ÷ 200`, bez psa polovina. */
function footStrength(p: Person, withDog: boolean): number {
  const base = ((p.arms?.bow ?? 0) + (p.arms?.combat ?? 0)) / 200;
  return withDog ? base : base * HUNT.noDogShare;
}

/** Podíl stavu na stropu (nejvýš 1); strop 0 s nenulovým stavem = 1. */
function stockShare(stock: number, cap: number): number {
  if (stock <= EPSILON) return 0;
  return cap > EPSILON ? Math.min(1, stock / cap) : 1;
}

/** Ulovit z `hope` celé kusy, nejvýš `limit`; vrací kolik, zbytek naděje nejvýš 1. */
function takeWhole(hope: number, limit: number): { kills: number; hope: number } {
  const kills = Math.max(0, Math.min(Math.floor(hope + EPSILON), limit));
  return { kills, hope: Math.min(1, hope - kills) };
}

/**
 * Úlovek dne (mutuje stav; před `trainLordDay`): naděje druhu roste o sílu lovců × základ × stav ÷
 * strop, celé kusy se uloví a odečtou ze stavu zvěře, maso jde přes porážku (1 člověkoden na 20 kg
 * a uzení – Martin 26. 10. 2026). Rodina na poli při hladu (`lordFieldShare` > 0) na koních
 * nejede. Jedna událost kroniky za den se jménem nejlepšího lovce.
 */
export function huntDay(state: VillageState, day: number, lordFieldShare = 0): ChronicleEvent[] {
  const w = state.wildlife;
  const hunt = w?.hunt;
  const today = hunt?.today;
  if (!w || !hunt || !today || today.day !== day) return [];
  if (state.lord?.field && lordFieldShare > 0) today.riders = [];
  const caps = wildlifeCaps(w.land, villageHerds(state).pig);
  const people = new Map(state.people.map((p) => [p.id, p]));
  const horses = new Map(villageHorses(state).map((h) => [h.id, h]));
  const strengths: { id: number; value: number }[] = [];
  let riders = 0;
  for (const r of today.riders) {
    const p = people.get(r.personId);
    const horse = horses.get(r.horseId);
    if (!p || !horse) continue;
    const value = riderStrength(p, horse, day);
    riders += value;
    strengths.push({ id: p.id, value });
  }
  // psi se rozdělí pěším – napřed nejsilnějším
  const footers = today.foot
    .map((id) => people.get(id))
    .filter((p): p is Person => p !== undefined)
    .map((p) => ({ p, base: footStrength(p, true) }))
    .sort((a, b) => b.base - a.base || a.p.id - b.p.id);
  const dogs = huntingDogs(state);
  let foot = 0;
  footers.forEach(({ p, base }, i) => {
    const value = i < dogs ? base : base * HUNT.noDogShare;
    foot += value;
    strengths.push({ id: p.id, value });
  });
  const base = HUNT.base;
  const kills: HuntKills = { boar: 0, deer: 0, wolves: 0, bear: 0 };
  let meatKg = 0;
  if (today.target === 'game') {
    // prasata: napřed dospělá, selata až bez dospělých
    const boar = w.boar;
    hunt.hope.boar +=
      (base.boar.rider * riders + base.boar.foot * foot) *
      stockShare(boar.adults + boar.piglets, caps.boar);
    let boarHope = hunt.hope.boar;
    for (; boarHope >= 1 - EPSILON; boarHope -= 1) {
      if (boar.adults >= 1 - EPSILON) {
        boar.adults -= 1;
        meatKg += HUNT.meatKg.boar;
      } else if (boar.piglets >= 1 - EPSILON) {
        boar.piglets -= 1;
        meatKg += HUNT.meatKg.piglet;
      } else break;
      kills.boar += 1;
    }
    hunt.hope.boar = Math.min(1, Math.max(0, boarHope));
    // jelení zvěř: jeleni, dokud jich je aspoň 1 na 3 laně; laně jen nad stropem; kolouši nikdy
    const deer = w.deer;
    hunt.hope.deer +=
      (base.deer.rider * riders + base.deer.foot * foot) *
      stockShare(deer.stags + deer.hinds + deer.calves, caps.deer);
    let deerHope = hunt.hope.deer;
    for (; deerHope >= 1 - EPSILON; deerHope -= 1) {
      if (deer.stags >= 1 - EPSILON && deer.stags >= deer.hinds * HUNT.stagsPerHind - EPSILON) {
        deer.stags -= 1;
        meatKg += HUNT.meatKg.stag;
      } else if (
        deer.hinds >= 1 - EPSILON &&
        deer.stags + deer.hinds + deer.calves > caps.deer + EPSILON
      ) {
        deer.hinds -= 1;
        meatKg += HUNT.meatKg.hind;
      } else break;
      kills.deer += 1;
    }
    hunt.hope.deer = Math.min(1, Math.max(0, deerHope));
  } else if (today.target === 'wolves') {
    hunt.hope.wolf +=
      (base.wolves.rider * riders + base.wolves.foot * foot) * stockShare(w.wolves, caps.wolves);
    const taken = takeWhole(hunt.hope.wolf, Math.floor(w.wolves + EPSILON));
    w.wolves -= taken.kills;
    kills.wolves = taken.kills;
    hunt.hope.wolf = taken.hope;
  } else if (w.bear.present) {
    hunt.hope.bear += base.bear.foot * foot;
    const taken = takeWhole(hunt.hope.bear, 1);
    if (taken.kills > 0) {
      w.bear = { present: false, backDay: bearBackDay(day) };
      kills.bear = 1;
      meatKg += HUNT.meatKg.bear;
    }
    hunt.hope.bear = taken.hope;
  }
  hunt.year.days += 1;
  const total = kills.boar + kills.deer + kills.wolves + kills.bear;
  if (total === 0) return [];
  if (meatKg > 0) butcher(state, meatKg);
  hunt.year.boar += kills.boar;
  hunt.year.deer += kills.deer;
  hunt.year.wolves += kills.wolves;
  hunt.year.bear += kills.bear;
  hunt.year.meatKg += meatKg;
  const best = strengths.sort((a, b) => b.value - a.value || a.id - b.id)[0];
  const name = best ? people.get(best.id)?.name : undefined;
  return [{ day, kind: 'hunt', kills, meatKg, names: name ? [name] : [] }];
}
