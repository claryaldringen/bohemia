// Pochůzka je celý cyklus (docs/design/villagers.md – Pochůzka se dokončí; Martin 24. 10. 2026:
// „Postavy musí svou činnost dokončit. Například ženy nesoucí vodu nesmí z cesty náhle zmizet,
// ale musí dojít domů a do toho domu vejít.“): při změně plánu postava na cestě dojde svůj
// rozběhnutý cyklus po dosavadní trase a zmizí až ve dveřích, noví lidé v proudu vyjdou z domu
// a nikdo není ve dvou postavách naráz. Čisté funkce skutečného času (jako villager-motion.ts),
// volá se jen při přeplánování, nikdy za snímek.
import {
  createVillagerPose,
  shuttleCycle,
  walkSpeed,
  walkThen,
  type PoseFn,
  type Route,
  type ShuttleCycle,
  type ShuttleOptions,
  type VillagerPose,
} from './villager-motion';
import type { Errand, PlannedVillager } from './villager-plan-types';

/**
 * Po přeplánování dojde postava na nové místo pěšky, když je od starého dál než `from` a blíž
 * než `to` (m) – další čtverec pole, další strom; dál (jiná práce jinde ve vsi) se objeví hned.
 */
export const WALK_OVER_M = { from: 2.5, to: 90 };

/** Přípona klíče dokončované pochůzky – nový plán ji nikdy nemá, postava dojde a odpadne. */
export const ERRAND_DONE = '#done';

/** Pochůzka postavy, která chodí `shuttle(r, o)` – cyklus a otisk trasy (`sameErrand`). */
export function shuttleErrand(r: Route, o: ShuttleOptions): Errand {
  const cycle = shuttleCycle(r, o);
  const [ax, az] = r.points[0] ?? [0, 0];
  const [bx, bz] = r.points[r.points.length - 1] ?? [0, 0];
  const sig = [
    r.points.length,
    r.length.toFixed(2),
    `${ax.toFixed(2)},${az.toFixed(2)}`,
    `${bx.toFixed(2)},${bz.toFixed(2)}`,
    cycle.cycleS.toFixed(3),
    cycle.shiftS.toFixed(3),
  ].join(':');
  return { ...cycle, sig };
}

/** Čas v cyklu (s) v okamžik `t`. */
export function cycleAt(c: ShuttleCycle, t: number): number {
  return (((t + c.shiftS) % c.cycleS) + c.cycleS) % c.cycleS;
}

/** Je postava v okamžik `t` venku na pochůzce (ne doma, ne čekající na svůj cyklus)? */
export function outside(e: Errand, t: number): boolean {
  if (e.fromS !== undefined && t < e.fromS) return false;
  if (e.untilS !== undefined) return t < e.untilS;
  return cycleAt(e, t) < e.homeS;
}

/** Kdy postava venku dojde domů (s); doma už je – `t`. */
export function homeAt(e: Errand, t: number): number {
  if (e.untilS !== undefined) return Math.max(t, e.untilS);
  const at = cycleAt(e, t);
  return at < e.homeS ? t + e.homeS - at : t;
}

/** Nejbližší začátek cyklu (vyjde ze dveří) v okamžik `t` nebo po něm. */
export function nextStart(c: ShuttleCycle, t: number): number {
  const at = cycleAt(c, t);
  return at < 1e-9 ? t : t + c.cycleS - at;
}

function hideAt(out: VillagerPose, x: number, z: number): VillagerPose {
  out.x = x;
  out.z = z;
  out.clip = 'idle';
  out.pace = 1;
  out.stage = 'rest';
  out.hidden = true;
  return out;
}

/** Kde je postava v okamžik `t` (vchod u konce cyklu). */
function spotAt(pose: PoseFn, t: number): { x: number; z: number } {
  const probe = pose(t, [], createVillagerPose());
  return { x: probe.x, z: probe.z };
}

/** Postava dojde, co má rozběhnuté, ve dveřích (`untilS`) zmizí a už nevyjde. */
function finished(p: PlannedVillager, errand: Errand, untilS: number): PlannedVillager {
  const inner = p.pose;
  const door = spotAt(inner, untilS);
  return {
    ...p,
    key: `${p.key}${ERRAND_DONE}`,
    errand: { ...errand, untilS },
    pose: (t, herds, out) => (t < untilS ? inner(t, herds, out) : hideAt(out, door.x, door.z)),
  };
}

/** Nový člověk v proudu: doma (ve dveřích trasy), dokud na něj s cyklem nepřijde řada. */
function gated(p: PlannedVillager, errand: Errand, fromS: number): PlannedVillager {
  const inner = p.pose;
  const door = spotAt(inner, fromS);
  return {
    ...p,
    errand: { ...errand, fromS },
    pose: (t, herds, out) => (t >= fromS ? inner(t, herds, out) : hideAt(out, door.x, door.z)),
  };
}

/**
 * Člověk po návratu z pochůzky (doma v `untilS`, vchod `door`) k nové práci: do té doby není
 * vidět, pak od dveří dojde pěšky (blízko), nebo se tam rovnou objeví (daleko – jako přeplánování).
 */
function afterErrand(
  p: PlannedVillager,
  untilS: number,
  door: { x: number; z: number },
): PlannedVillager {
  const inner = p.pose;
  const to = spotAt(inner, untilS);
  const far = Math.hypot(to.x - door.x, to.z - door.z) > WALK_OVER_M.to;
  const next = far
    ? inner
    : walkThen(door.x, door.z, inner, untilS, walkSpeed(p.kind, 'walk', p.scale));
  return {
    ...p,
    pose: (t, herds, out) => (t < untilS ? hideAt(out, door.x, door.z) : next(t, herds, out)),
  };
}

/** Táž pochůzka v obou plánech – stejná trasa, tempo, člověk i postava. */
function sameErrand(a: PlannedVillager, b: PlannedVillager): boolean {
  return (
    a.errand !== undefined &&
    b.errand !== undefined &&
    a.errand.untilS === undefined &&
    a.errand.sig === b.errand.sig &&
    a.person === b.person &&
    a.kind === b.kind &&
    a.scale === b.scale
  );
}

/**
 * Nový plán `next` místo `before` v okamžik `t` (s): kdo byl venku na pochůzce a v novém plánu
 * ji nemá stejnou, dojde ji (postava s klíčem `…#done` navíc, po návratu skrytá – příští
 * přeplánování ji vynechá); nové pochůzky začnou se svým cyklem ve dveřích (ne dřív, než se
 * jejich člověk vrátí); člověk, který se vrací, je v nové práci až po návratu. Bez minulého plánu
 * (první zobrazení vsi) je nový plán beze změny – proud je rozběhnutý.
 *
 * `living` = lidé vsi, kteří ve vsi jsou (bez něj se nekontroluje): kdo zemřel nebo odešel, jeho
 * pochůzka se zruší hned – mrtvý nechodí ani nejde vybrat. Zmizel-li dům cíle (zboření), živý
 * člověk dojde k místu, kde dveře stály, a tam zmizí (jako ve vchodu).
 */
export function carryErrands(
  before: readonly PlannedVillager[],
  next: readonly PlannedVillager[],
  t: number,
  living?: ReadonlySet<number>,
): PlannedVillager[] {
  if (before.length === 0) return [...next];
  const nextByKey = new Map(next.map((p) => [p.key, p]));
  const oldByKey = new Map(before.map((p) => [p.key, p]));
  // člověk → kdy dojde domů a kde jsou dveře
  const busy = new Map<number, { untilS: number; door: { x: number; z: number } }>();
  const finishing: PlannedVillager[] = [];
  for (const p of before) {
    const errand = p.errand;
    if (!errand || !outside(errand, t)) continue;
    if (living && p.person !== undefined && !living.has(p.person)) continue;
    const n = nextByKey.get(p.key);
    if (n && sameErrand(p, n)) continue;
    const untilS = homeAt(errand, t);
    const done = errand.untilS !== undefined ? p : finished(p, errand, untilS);
    finishing.push(done);
    if (p.person === undefined) continue;
    const was = busy.get(p.person);
    if (!was || was.untilS < untilS) {
      busy.set(p.person, { untilS, door: spotAt(done.pose, untilS) });
    }
  }
  const out = next.map((n) => {
    const back = n.person !== undefined ? busy.get(n.person) : undefined;
    if (n.errand) {
      const p = oldByKey.get(n.key);
      if (p && sameErrand(p, n)) return p;
      const fromS = nextStart(n.errand, Math.max(t, back?.untilS ?? t));
      return fromS > t ? gated(n, n.errand, fromS) : n;
    }
    return back && back.untilS > t ? afterErrand(n, back.untilS, back.door) : n;
  });
  return [...out, ...finishing];
}
