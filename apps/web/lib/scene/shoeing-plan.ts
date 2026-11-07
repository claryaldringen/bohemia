// Kování koní ve scéně (horses.md – Kování, Ve scéně; Martin 27. 10. 2026: „Ano na jedno
// upozornění být nemusí, děje se to automaticky. Jen každý kovář musí fyzicky dojít do té ohrady
// a koně okovat“). Čisté funkce skutečného času a plánu: kovář jde po cestě k brance ohrady koní,
// u kůlu vedle branky kuje jednoho jezdeckého koně po druhém (kůň stojí uvázaný mimo ohradu –
// `RidePlan.tied`, kreslí ho livestock.ts) a vrací se stejnou cestou. Kdo a kdy kuje, určuje
// jádro (`SceneLabor.shoeing`); scéna jen kreslí.
//
// Rozvrh (návrh Clauda; villagers.md – Činnosti od začátku do konce, Martin 31. 10. 2026: „Ve
// vykreslování by lidé měli dělat své činnosti od začátku do konce“): kování začne se svým herním
// dnem a hraje se ve skutečném čase přes tolik herních dní, kolik trvá – kovář vyjde se začátkem
// dne kování, jde běžnou chůzí (žádný časosběr), každého koně kuje `SHOE_HORSE_S` s a vrací se
// chůzí. Jádro to dál počítá jako práci jednoho dne; scéna dostává kování posledních dní
// (`SceneShoeing.day`).
import { LIVESTOCK_EPOCH_MS } from './livestock-motion';
import type { RidePlan } from './riders';
import type { TrainingSpot } from './training-ground-layout';
import { alongRoute, type PoseFn, type Route } from './villager-motion';

/**
 * Kování jednoho koně ve skutečném čase (s – návrh Clauda): kovář koně přivede od ohrady, uváže
 * a okove čtyři kopyta – dvě minuty, ať je to vidět (1,5 herní hodiny by bylo 5 s).
 */
export const SHOE_HORSE_S = 120;
/** Část času koně na začátku, kdy kovář koně přivádí a uvazuje (stojí) – pak kuje. */
const LEAD_SHARE = 0.15;

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

/** Rozvrh kováře (skutečný čas, ms) a rychlost chůze (m/s). */
export interface ShoeingSchedule {
  /** Vyjde (od kovárny, z kraje mapy). */
  departMs: number;
  /** Dojde k brance – začne kovat. */
  arriveMs: number;
  /** Dokove – vrací se. */
  doneMs: number;
  /** Je zpátky. */
  backMs: number;
  /** Rychlost chůze (m/s) – běžná chůze kováře, klip se přehrává běžně. */
  speed: number;
}

/**
 * Rozvrh kování `horses` koní od `startMs` (začátek herního dne kování): cesta délky `lengthM` (m)
 * běžnou chůzí `walk` (m/s), u branky `SHOE_HORSE_S` s na koně, zpět touž chůzí.
 */
export function shoeingSchedule(
  lengthM: number,
  horses: number,
  startMs: number,
  walk: number,
): ShoeingSchedule {
  const speed = Math.max(0.1, walk);
  const legMs = (Math.max(0, lengthM) / speed) * 1000;
  const arriveMs = startMs + legMs;
  const doneMs = arriveMs + Math.max(1, horses) * SHOE_HORSE_S * 1000;
  return { departMs: startMs, arriveMs, doneMs, backMs: doneMs + legMs, speed };
}

/** Kdy stojí uvázaný každý kůň (ms, v pořadí kování) – po `SHOE_HORSE_S` od příchodu kováře. */
export function tiedSpans(schedule: ShoeingSchedule, horses: number): [number, number][] {
  const n = Math.max(1, horses);
  const slot = (schedule.doneMs - schedule.arriveMs) / n;
  return Array.from({ length: horses }, (_, k): [number, number] => [
    schedule.arriveMs + k * slot,
    schedule.arriveMs + (k + 1) * slot,
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
}

/**
 * Póza kováře: před odchodem a po návratu není vidět (v kovárně, u souseda), cestou jde po `way`
 * běžnou chůzí (`stage` out a back), u branky kuje v předklonu s kladívkem (klip `build`); na
 * začátku každého koně chvíli stojí – přivádí ho od ohrady.
 */
export function smithShoeingPose(plan: ShoeingScene): PoseFn {
  const { way, schedule } = plan;
  const slots = tiedSpans(schedule, plan.horses.length);
  return (t, _herds, out) => {
    const ms = t * 1000 + LIVESTOCK_EPOCH_MS;
    out.hidden = false;
    out.pace = 1;
    if (ms < schedule.departMs || ms >= schedule.backMs) {
      alongRoute(way, 0, false, out);
      out.clip = 'idle';
      out.hidden = true;
      out.stage = 'home';
      return out;
    }
    if (ms < schedule.arriveMs) {
      alongRoute(way, ((ms - schedule.departMs) / 1000) * schedule.speed, false, out);
      out.clip = 'walk';
      out.stage = 'out';
      return out;
    }
    if (ms >= schedule.doneMs) {
      alongRoute(way, ((schedule.backMs - ms) / 1000) * schedule.speed, true, out);
      out.clip = 'walk';
      out.stage = 'back';
      return out;
    }
    out.x = plan.smith.x;
    out.z = plan.smith.z;
    out.headingX = plan.smith.headingX;
    out.headingZ = plan.smith.headingZ;
    const slot = slots.find(([from, to]) => ms >= from && ms < to);
    const leading = slot ? ms < slot[0] + (slot[1] - slot[0]) * LEAD_SHARE : false;
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
  const slots = tiedSpans(plan.schedule, plan.horses.length);
  return plan.horses.map((horseId, k) => ({
    riderId: -1,
    horseId,
    route: null,
    behind: 0,
    side: 0,
    offset: 0,
    blocks: [],
    hitch: plan.hitch,
    window: null,
    tied: [slots[k]!],
  }));
}
