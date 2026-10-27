// Kování koní ve scéně (horses.md – Kování, Ve scéně; Martin 27. 10. 2026: „Ano na jedno
// upozornění být nemusí, děje se to automaticky. Jen každý kovář musí fyzicky dojít do té ohrady
// a koně okovat“). Čisté funkce skutečného času a plánu: kovář jde po cestě k brance ohrady koní,
// u kůlu vedle branky kuje jednoho jezdeckého koně po druhém (kůň stojí uvázaný mimo ohradu –
// `RidePlan.tied`, kreslí ho livestock.ts) a vrací se stejnou cestou. Kdo a kdy kuje, určuje
// jádro (`SceneLabor.shoeing`); scéna jen kreslí.
//
// Rozvrh dne (návrh Clauda): kuje se kolem poledne, na koně `SHOE_HORSE_H` hodin. Kovář vyjde
// tak, aby k brance došel právě na začátek kování, a po něm se hned vrací; cesta se musí vejít
// do výpravy dne (`SHOEING_TRIP_H` – vlastní kovář od rána do večera, cizí od svítání do soumraku).
// Delší cesta jde časosběrem jako karavana (rychleji, klip chůze se přehrává rychleji) – den má
// jen 86 s a cizí kovář jde přes půl mapy. Posledních `NEAR_M` u ohrady jde kovář nejvýš
// `NEAR_PACE` × chůze, když to cesta dovolí – daleko od vsi (mimo pohled hráče) pak jde rychleji.
import type { DayWindow } from './caravan';
import { dayHour, hourSeconds, type RidePlan } from './riders';
import type { TrainingSpot } from './training-ground-layout';
import { alongRoute, type PoseFn, type Route } from './villager-motion';

/** Hodin kování na jednoho koně (návrh Clauda – kování čtyř kopyt). */
export const SHOE_HORSE_H = 1.5;
/** Nejvýš tolik hodin kování za den – víc koní se kuje rychleji. */
export const SHOE_MAX_H = 8;
/** Kování je kolem poledne (h). */
export const SHOE_NOON_H = 12;
/** Výprava kováře dne (h od–do): vlastní od rána do večera, cizí od svítání do soumraku. */
export const SHOEING_TRIP_H = { own: [5, 19], foreign: [4, 20] } as const;
/** Část času koně na začátku, kdy kovář koně přivádí a uvazuje (stojí) – pak kuje. */
const LEAD_SHARE = 0.15;
/** Úsek cesty u ohrady (m) s mírnějším časosběrem a jeho tempo (násobek chůze). */
const NEAR_M = 80;
const NEAR_PACE = 3;
/** Na úsek u ohrady připadne nejvýš tato část času cesty. */
const NEAR_TIME_SHARE = 0.6;
/** Klip chůze se přehrává nejvýš tolikrát rychleji (dál jen klouže – daleko od vsi). */
const MAX_CLIP_PACE = 6;

/** Kůl vedle branky: kolik m stranou od středu branky podél plotu. */
const POST_SIDE_M = 2;
/** Kůň stojí podél plotu hlavou ke kůlu: střed koně od kůlu ven a podél plotu (m). */
const HORSE_OUT_M = 1.1;
const HORSE_ALONG_M = 1.3;
/** Kovář u předního kopyta: od středu koně ven a k hlavě (m). */
const SMITH_OUT_M = 0.85;
const SMITH_FORWARD_M = 0.5;

/** Branka ohrady: střed mezery a směr ven z ohrady (jednotkový). */
export interface ShoeingGate {
  x: number;
  z: number;
  outX: number;
  outZ: number;
}

/** Kde u branky stojí kůň (uvázaný u kůlu, čelem ke kůlu) a kovář (čelem ke koni). */
export function shoeingSpots(gate: ShoeingGate): { hitch: TrainingSpot; smith: TrainingSpot } {
  // podél plotu (doleva od směru ven)
  const sx = -gate.outZ;
  const sz = gate.outX;
  const postX = gate.x + sx * POST_SIDE_M;
  const postZ = gate.z + sz * POST_SIDE_M;
  const hitch: TrainingSpot = {
    x: postX + gate.outX * HORSE_OUT_M + sx * HORSE_ALONG_M,
    z: postZ + gate.outZ * HORSE_OUT_M + sz * HORSE_ALONG_M,
    headingX: -sx,
    headingZ: -sz,
  };
  const smith: TrainingSpot = {
    x: hitch.x + gate.outX * SMITH_OUT_M + hitch.headingX * SMITH_FORWARD_M,
    z: hitch.z + gate.outZ * SMITH_OUT_M + hitch.headingZ * SMITH_FORWARD_M,
    headingX: -gate.outX,
    headingZ: -gate.outZ,
  };
  return { hitch, smith };
}

/** Rozvrh kováře dne (h herního dne) a tempo chůze. */
export interface ShoeingSchedule {
  /** Vyjde (od kovárny, z kraje mapy). */
  depart: number;
  /** Dojde k brance – začne kovat. */
  arrive: number;
  /** Dokove – vrací se. */
  done: number;
  /** Je zpátky. */
  back: number;
  /** Rychlost chůze (m/s) a tempo klipu chůze (násobek běžné chůze) – daleko od ohrady. */
  speed: number;
  pace: number;
  /** Úsek u ohrady (m, konec cesty) a jeho rychlost (m/s) a tempo klipu; bez něj 0. */
  nearM: number;
  nearSpeed: number;
  nearPace: number;
}

/**
 * Rozvrh dne: kování `horses` koní kolem poledne, cesta délky `lengthM` (m) běžnou chůzí `walk`
 * (m/s) – nevejde-li se do výpravy dne, časosběrem (rychleji).
 */
export function shoeingSchedule(
  lengthM: number,
  horses: number,
  own: boolean,
  hourS: number,
  walk: number,
): ShoeingSchedule {
  const shoeH = Math.min(SHOE_MAX_H, Math.max(1, horses) * SHOE_HORSE_H);
  const arrive = SHOE_NOON_H - shoeH / 2;
  const done = SHOE_NOON_H + shoeH / 2;
  const [from] = own ? SHOEING_TRIP_H.own : SHOEING_TRIP_H.foreign;
  const natural = lengthM / Math.max(0.1, walk) / hourS;
  const leg = Math.max(1e-3, Math.min(natural, arrive - from));
  const legS = leg * hourS;
  const uniform = Math.max(walk, lengthM / legS);
  const nearM = Math.min(NEAR_M, lengthM);
  const nearSpeed = Math.max(walk * NEAR_PACE, nearM / (NEAR_TIME_SHARE * legS));
  const times = { depart: arrive - leg, arrive, done, back: done + leg };
  const clip = (v: number): number => Math.min(MAX_CLIP_PACE, v / walk);
  if (nearSpeed >= uniform || lengthM <= nearM) {
    return { ...times, speed: uniform, pace: clip(uniform), nearM: 0, nearSpeed: 0, nearPace: 0 };
  }
  // daleko rychleji, u ohrady mírněji – oba úseky dohromady trvají celou cestu
  const speed = (lengthM - nearM) / (legS - nearM / nearSpeed);
  return { ...times, speed, pace: clip(speed), nearM, nearSpeed, nearPace: clip(nearSpeed) };
}

/**
 * Kolik m od začátku cesty (od kovárny, z kraje mapy) je kovář `s` sekund po vyjití, a tempo
 * klipu: napřed daleký úsek rychlostí `speed`, pak úsek u ohrady `nearSpeed`.
 */
export function shoeingWalked(
  schedule: ShoeingSchedule,
  lengthM: number,
  s: number,
): { d: number; pace: number } {
  const farM = lengthM - schedule.nearM;
  const farS = farM / schedule.speed;
  if (schedule.nearM <= 0 || s <= farS) return { d: s * schedule.speed, pace: schedule.pace };
  return { d: farM + (s - farS) * schedule.nearSpeed, pace: schedule.nearPace };
}

/** Hodiny, kdy stojí uvázaný každý kůň (v pořadí kování) – rovným dílem mezi příchodem a koncem. */
export function tiedHours(schedule: ShoeingSchedule, horses: number): [number, number][] {
  const n = Math.max(1, horses);
  const slot = (schedule.done - schedule.arrive) / n;
  return Array.from({ length: horses }, (_, k): [number, number] => [
    schedule.arrive + k * slot,
    schedule.arrive + (k + 1) * slot,
  ]);
}

/** Kování dne ve scéně: kdo kuje, kudy jde, kde u branky kuje, koně a rozvrh. */
export interface ShoeingScene {
  own: boolean;
  /** Cesta kováře k brance (od kovárny / z kraje mapy); zpět touž cestou. */
  way: Route;
  hitch: TrainingSpot;
  smith: TrainingSpot;
  /** Koně (id) v pořadí kování. */
  horses: readonly number[];
  schedule: ShoeingSchedule;
  window: DayWindow | null;
}

/**
 * Póza kováře: před odchodem a po návratu není vidět (v kovárně, u souseda), cestou jde po `way`
 * (`stage` out a back), u branky kuje v předklonu s kladívkem (klip `build`); na začátku každého
 * koně chvíli stojí – přivádí ho od ohrady.
 */
export function smithShoeingPose(plan: ShoeingScene): PoseFn {
  const { way, schedule } = plan;
  const hourS = hourSeconds(plan.window);
  const slots = tiedHours(schedule, plan.horses.length);
  return (t, _herds, out) => {
    const hour = dayHour(plan.window, t);
    out.hidden = false;
    out.pace = 1;
    if (hour < schedule.depart || hour >= schedule.back) {
      alongRoute(way, 0, false, out);
      out.clip = 'idle';
      out.hidden = true;
      out.stage = 'home';
      return out;
    }
    if (hour < schedule.arrive) {
      const walked = shoeingWalked(schedule, way.length, (hour - schedule.depart) * hourS);
      alongRoute(way, walked.d, false, out);
      out.clip = 'walk';
      out.pace = walked.pace;
      out.stage = 'out';
      return out;
    }
    if (hour >= schedule.done) {
      // zpět zrcadlově: od ohrady napřed mírněji, pak rychleji
      const walked = shoeingWalked(schedule, way.length, (schedule.back - hour) * hourS);
      alongRoute(way, walked.d, true, out);
      out.clip = 'walk';
      out.pace = walked.pace;
      out.stage = 'back';
      return out;
    }
    out.x = plan.smith.x;
    out.z = plan.smith.z;
    out.headingX = plan.smith.headingX;
    out.headingZ = plan.smith.headingZ;
    const slot = slots.find(([from, to]) => hour >= from && hour < to);
    const leading = slot ? hour < slot[0] + (slot[1] - slot[0]) * LEAD_SHARE : false;
    out.clip = leading ? 'idle' : 'build';
    delete out.stage;
    return out;
  };
}

/**
 * Plány koní při kování (livestock.ts kreslí jako jezdecké koně bez jezdce): každý kůň stojí
 * uvázaný u kůlu (`hitch`) jen ve svém čase kování, jinak je v ohradě.
 */
export function shodHorsePlans(plan: ShoeingScene): RidePlan[] {
  const slots = tiedHours(plan.schedule, plan.horses.length);
  return plan.horses.map((horseId, k) => ({
    riderId: -1,
    horseId,
    route: null,
    behind: 0,
    side: 0,
    offset: 0,
    blocks: [],
    hitch: plan.hitch,
    window: plan.window,
    tied: [slots[k]!],
  }));
}
