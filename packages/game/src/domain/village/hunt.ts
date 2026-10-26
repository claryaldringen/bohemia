// Velký lov rodu (wildlife.md – Lov rodu): kdo a kdy loví (`planHuntDay` ráno), úlovek dne
// a maso do zásoby (`huntDay` před výcvikem). Úlovek jde akumulátorem bez náhody; jediný los je
// riziko zranění a smrti (`huntRisk`, vlastní proud ze seedu vsi a dne). Lov navíc na pokyn hráče
// (`canDeclareHunt`, `declareHunt`) vyhlásí hráč přes use-case `declareHuntInVillage`.
import { dateOfDayIndex } from '../calendar';
import { createRandom, deriveSeed } from '../landscape/random';
import { bury } from './cemetery';
import { removePeople } from './kinship';
import { assignRiders, riderPower } from './horse-riders';
import { isUnshod } from './horse-shoeing-term';
import { huntingDogs, huntPool } from './hunt-party';
import { villageHerds, butcher } from './livestock';
import { trainingFamily } from './lord';
import { ageGroup, ageYears } from './people';
import { HUNT, HUNT_RISK, PREDATION } from './rules-wildlife';
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
  const onField = state.lord?.field !== undefined;
  const mount = (p: Person, boy = false): boolean => {
    const horse = horseOf.get(p.id);
    if (target === 'bear' || !horse || !mounted.has(p.id)) return false;
    // slabý jezdec je na koni horší než pěšky se psem – pak jde pěšky a kůň zůstane (návrh Clauda)
    if (!boy && !ridesBetter(p, horse, day)) return false;
    riders.push({ personId: p.id, horseId: horse.id });
    return true;
  };
  // rodina na poli kvůli hladu neloví (jen odešlí synové); vesnice ji potřebuje v práci
  if (!onField) {
    for (const p of pool.manor) if (!mount(p)) foot.push(p.id);
    for (const p of pool.boys) mount(p, true);
  }
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

/**
 * Vyplatí se jezdci kůň? Úlovek jezdce i pěšího se váží koeficienty `HUNT.base` (jezdec uloví z téže
 * síly víc), proto se porovnává příspěvek na prasata i jeleny, ne holá síla (návrh Clauda).
 */
function ridesBetter(p: Person, horse: Horse, day: number): boolean {
  const rider = riderStrength(p, horse, day);
  const foot = footStrength(p, true);
  const { boar, deer } = HUNT.base;
  return (
    rider * boar.rider >= foot * boar.foot - EPSILON &&
    rider * deer.rider >= foot * deer.foot - EPSILON
  );
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
 * a uzení – Martin 26. 10. 2026). Rodina na poli při hladu (`lordFieldShare` > 0) neloví
 * (ani na koních, ani pěšky; odešlí synové smějí). Jedna událost kroniky za den se jménem nejlepšího lovce.
 */
export function huntDay(state: VillageState, day: number, lordFieldShare = 0): ChronicleEvent[] {
  const w = state.wildlife;
  const hunt = w?.hunt;
  const today = hunt?.today;
  if (!w || !hunt || !today || today.day !== day) return [];
  if (state.lord?.field && lordFieldShare > 0) {
    // rodina se dnes nechala strhnout polem: jezdci nejedou a pěší muži dvorce také ne
    today.riders = [];
    const family = trainingFamily(state, day);
    const manorIds = new Set(family ? family.trainees.map((p) => p.id) : []);
    today.foot = today.foot.filter((id) => !manorIds.has(id));
  }
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
  // zvěř, která může lovce zranit (před úlovkem – ulovená zvěř riziko neruší)
  const quarry: 'boar' | 'bear' | null =
    today.target === 'bear'
      ? w.bear.present
        ? 'bear'
        : null
      : today.target === 'game' && w.boar.adults + w.boar.piglets >= 1 - EPSILON
        ? 'boar'
        : null;
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
  const events: ChronicleEvent[] = [];
  const total = kills.boar + kills.deer + kills.wolves + kills.bear;
  if (total > 0) {
    if (meatKg > 0) butcher(state, meatKg);
    hunt.year.boar += kills.boar;
    hunt.year.deer += kills.deer;
    hunt.year.wolves += kills.wolves;
    hunt.year.bear += kills.bear;
    hunt.year.meatKg += meatKg;
    const best = strengths.sort((a, b) => b.value - a.value || a.id - b.id)[0];
    const name = best ? people.get(best.id)?.name : undefined;
    events.push({ day, kind: 'hunt', kills, meatKg, names: name ? [name] : [] });
  }
  if (quarry) events.push(...huntRisk(state, day, quarry));
  return events;
}

/**
 * Zranění a smrt na lovu (wildlife.md – Nebezpečí pro lidi; mutuje stav): lovci podle id, každý
 * dostane vždy oba losy (zranění, smrt) z vlastního proudu `hunt:` + den, ať pořadí losů nezávisí
 * na výsledku a losy porodů a úmrtí (`day:`) zůstanou stejné. Zraněný 60 dní nepracuje, necvičí
 * ani neloví; mrtvého lovce pohřbí hřbitov, nástupnictví řeší `dynastyDay` týž den.
 */
export function huntRisk(
  state: VillageState,
  day: number,
  quarry: 'boar' | 'bear',
): ChronicleEvent[] {
  const today = state.wildlife?.hunt?.today;
  if (!today || today.day !== day) return [];
  const mounted = new Set(today.riders.map((r) => r.personId));
  const ids = [...new Set([...mounted, ...today.foot])].sort((a, b) => a - b);
  const rules = HUNT_RISK[quarry];
  const random = createRandom(deriveSeed(state.seed, 'hunt:' + day));
  const people = new Map(state.people.map((p) => [p.id, p]));
  const events: ChronicleEvent[] = [];
  const dead = new Set<number>();
  for (const id of ids) {
    const injuryRoll = random.next();
    const deathRoll = random.next();
    const p = people.get(id);
    if (!p) continue;
    const combat = Math.min(100, Math.max(0, p.arms?.combat ?? 0));
    const injury = quarry === 'bear' ? rules.injury * (1 - combat / 200) : rules.injury;
    const death =
      rules.death * (2 - combat / 100) * (mounted.has(id) ? 1 : HUNT_RISK.footDeathFactor);
    const name = p.name === undefined ? {} : { name: p.name };
    if (deathRoll < death) {
      dead.add(id);
      events.push({
        day,
        kind: 'death',
        group: ageGroup(p, day),
        age: ageYears(p.bornDay, day),
        cause: 'hunt',
        prey: quarry,
        ...name,
      });
      const full = bury(state, day, p);
      if (full) events.push(full);
    } else if (injuryRoll < injury) {
      p.injuredUntilDay = day + 1 + HUNT_RISK.injuryDays;
      events.push({ day, kind: 'hunt-injury', prey: quarry, ...name });
    }
  }
  if (dead.size > 0) {
    removePeople(state, dead);
    today.riders = today.riders.filter((r) => !dead.has(r.personId));
    today.foot = today.foot.filter((id) => !dead.has(id));
  }
  return events;
}

/** Důvody, proč nejde vyhlásit lov navíc (`canDeclareHunt`), česky pro hráče. */
export const HUNT_DENIED_TEXT = {
  'closed-season': 'Zvěř má hájení – od března do května se neloví.',
  'too-soon': 'Lovci si ještě nevydechli – lov navíc nejdřív za 3 dny po minulém.',
  'no-hunters': 'Na lov není kdo jít.',
  already: 'Lov už je na zítřek vyhlášen.',
} as const;

export type HuntDenied = keyof typeof HUNT_DENIED_TEXT;

/**
 * Smí hráč vyhlásit lov navíc (wildlife.md – Kdy; Martin 24. 10. 2026: „Obojí“)? `day` je dnešní
 * (odsimulovaný) den, lov je zítra. Vrací null, nebo důvod: hájení (březen–květen), méně než 3 dny
 * od minulého lovu navíc, lov už je zítra (vyhlášený nebo v kalendáři), nebo není kdo.
 */
export function canDeclareHunt(state: VillageState, day: number): HuntDenied | null {
  const target = day + 1;
  const { month } = dateOfDayIndex(target);
  if (month >= HUNT.extra.closedFromMonth && month <= HUNT.extra.closedToMonth) {
    return 'closed-season';
  }
  const w = state.wildlife;
  if (w?.hunt?.extraDay === target || isHuntCalendarDay(target)) return 'already';
  const last = w?.hunt?.lastExtraDay;
  if (last !== undefined && target - last < HUNT.extra.minGapDays) return 'too-soon';
  const family = trainingFamily(state, target);
  if (!family) return 'no-hunters';
  const pool = huntPool(state, target, family);
  const hunters = (state.lord?.field ? 0 : pool.manor.length) + pool.away.length;
  return hunters > 0 ? null : 'no-hunters';
}

/**
 * Hráč vyhlásí lov navíc na zítřek (mutuje stav; `day` = dnešní odsimulovaný den): zapíše
 * `extraDay` a `lastExtraDay`, zítra ho vezme `planHuntDay`. Mimo zimu den lovu chybí v hlídce,
 * výcviku a práci odešlých synů (cena rozhodnutí – návrh Clauda). Vrací důvod odepření, nebo null.
 */
export function declareHunt(state: VillageState, day: number): HuntDenied | null {
  const denied = canDeclareHunt(state, day);
  if (denied) return denied;
  const w = state.wildlife;
  if (!w) return 'no-hunters';
  const hunt = (w.hunt ??= emptyHunt());
  hunt.extraDay = day + 1;
  hunt.lastExtraDay = day + 1;
  return null;
}
