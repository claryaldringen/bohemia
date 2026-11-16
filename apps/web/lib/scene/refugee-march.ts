// Průvod uprchlíků a posel ve scéně (war.md – Varování, poslové a útěk do hradiště; Ú14): lidé vsi
// jdou hloučkem s nůšemi k okraji mapy (hradiště) nebo k lesu, stádo za nimi, posel běží sám nebo
// jede na koni. Kde skupina je, rozhodl server (`WarSceneView.refugeMarch`, `messengers` – už po
// mlze války); mezi snímky jde plynule (`alarmAt` jako `marchAt`). Čisté funkce bez Babylonu.
import type { FlightMode, Pos } from '@bohemia/game';
import { ARMY_LOOKS, MARCH_GLIDE_M_S, RIDER_LIFT_M, huddleSlots } from './army';
import type { ArmyAnimal, ArmyFigure, FigureKind } from './army';
import { DRIVEN_HERD_M, drivenHerd, fleeWalkAt, type FleeWalk } from './villager-plan';

/** Člověk průvodu – vzhled. */
export interface SceneRefugee {
  kind: FigureKind;
  child: boolean;
  carries: boolean;
}

/** Průvod uprchlíků pro scénu (jádro – `WarSceneRefugeMarch`). */
export interface SceneRefugees {
  key: string;
  mode: FlightMode;
  pos: Pos;
  heading: Pos;
  people: SceneRefugee[];
  /** Kusů dobytka za nimi (scéna kreslí nejvýš `SCENE_HERD_MAX`). */
  herd: number;
}

/** Posel pro scénu (jádro – `WarSceneMessenger`). */
export interface SceneMessenger {
  key: string;
  pos: Pos;
  heading: Pos;
  mounted: boolean;
}

/** Průvody a poslové na mapě v taktu snímku `tick`. */
export interface SceneAlarm {
  tick: number;
  refugees: SceneRefugees[];
  messengers: SceneMessenger[];
}

/** Rozestup lidí v hloučku průvodu (m) – volněji než vojsko, nesou nůše (návrh Clauda). */
export const REFUGEE_SPACING_M = 1.9;
/** Dítě je menší postava (podíl výšky dospělého – návrh Clauda). */
export const CHILD_FIGURE_SCALE = 0.68;
/** Tempo klipu běžícího posla (chůze zrychlená – postava nemá klip běhu). */
const RUN_PACE = 1.9;
/** Rychlost kroku zvířat průvodu a koně posla (m/s – krok nohou). */
const HERD_M_S = 1.2;
const HORSE_M_S = 3.5;

/** Bod hloučku ve světě: střed, směr chůze, místo (vpravo, vpřed). */
function placeIn(center: Pos, heading: Pos, slot: Pos): Pos {
  return {
    x: center.x + heading.z * slot.x + heading.x * slot.z,
    z: center.z - heading.x * slot.x + heading.z * slot.z,
  };
}

/**
 * Postavy a zvířata průvodů a poslů: lidé v hloučku (dospělí vpředu, děti uprostřed hloučku za
 * nimi), s nůší klip `carry`; stádo za hloučkem (`drivenHerd` – jako stádo za vojskem); posel pěšky
 * zrychlenou chůzí, na koni jako jezdec vojska.
 */
export function alarmFigures(alarm: SceneAlarm): { figures: ArmyFigure[]; animals: ArmyAnimal[] } {
  const figures: ArmyFigure[] = [];
  const animals: ArmyAnimal[] = [];
  for (const r of alarm.refugees) {
    const order = r.people
      .map((p, i) => ({ p, i }))
      .sort((a, b) => Number(a.p.child) - Number(b.p.child) || a.i - b.i);
    const slots = huddleSlots(order.length, REFUGEE_SPACING_M);
    order.forEach(({ p, i }, n) => {
      const at = placeIn(r.pos, r.heading, slots[n]!);
      figures.push({
        key: `r${r.key}:${i}`,
        kind: p.kind,
        x: at.x,
        z: at.z,
        hx: r.heading.x,
        hz: r.heading.z,
        clip: p.carries ? 'carry' : 'walk',
        pace: 1,
        lift: 0,
        lying: false,
        side: 'folk',
        look: ARMY_LOOKS.folk,
        ...(p.child ? { scale: CHILD_FIGURE_SCALE } : {}),
      });
    });
    if (r.herd <= 0) continue;
    // stádo za posledním kruhem hloučku
    const radius = REFUGEE_SPACING_M * Math.sqrt(order.length) * 0.62;
    const lead = placeIn(r.pos, r.heading, { x: 0, z: -(radius + 1 - DRIVEN_HERD_M.behind) });
    drivenHerd(lead, r.heading, r.herd).forEach((p, i) => {
      animals.push({
        key: `rc${r.key}:${i}`,
        species: 'cow',
        x: p.x,
        z: p.z,
        hx: r.heading.x,
        hz: r.heading.z,
        speed: HERD_M_S,
      });
    });
  }
  for (const m of alarm.messengers) {
    if (m.mounted) {
      animals.push({
        key: `mh${m.key}`,
        species: 'horse',
        x: m.pos.x,
        z: m.pos.z,
        hx: m.heading.x,
        hz: m.heading.z,
        speed: HORSE_M_S,
      });
    }
    figures.push({
      key: `ms${m.key}`,
      kind: 'man',
      x: m.pos.x,
      z: m.pos.z,
      hx: m.heading.x,
      hz: m.heading.z,
      clip: m.mounted ? 'ride' : 'walk',
      pace: m.mounted ? 1 : RUN_PACE,
      lift: m.mounted ? RIDER_LIFT_M : 0,
      lying: false,
      side: 'folk',
      // na koni jede muž rodu (Martin 9. 11. 2026), pěšky vesničan
      look: m.mounted ? ARMY_LOOKS.line : ARMY_LOOKS.folk,
    });
  }
  return { figures, animals };
}

/**
 * Průvody a poslové v podílu `t` mezi nakresleným `from` a novým snímkem `to` (jako `marchAt`):
 * posun rovnoměrně ve směru posunu; nový (přišel z jiné mapy) a skok rychlejší než
 * `MARCH_GLIDE_M_S` za `spanS` sekund stojí rovnou v `to`. Jen zobrazení.
 */
export function alarmAt(
  from: SceneAlarm | null,
  to: SceneAlarm,
  t: number,
  spanS: number,
): SceneAlarm {
  if (!from || !(t < 1) || spanS <= 0) return to;
  const k = Math.max(0, t);
  const glide = <T extends { key: string; pos: Pos; heading: Pos }>(
    was: readonly T[],
    now: readonly T[],
    moving: (x: T) => T,
  ): T[] => {
    const before = new Map(was.map((x) => [x.key, x]));
    return now.map((x) => {
      const w = before.get(x.key);
      if (!w) return x;
      const dx = x.pos.x - w.pos.x;
      const dz = x.pos.z - w.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05 || d > MARCH_GLIDE_M_S * spanS) return x;
      return moving({
        ...x,
        pos: { x: w.pos.x + dx * k, z: w.pos.z + dz * k },
        heading: { x: dx / d, z: dz / d },
      });
    });
  };
  return {
    ...to,
    refugees: glide(from.refugees, to.refugees, (r) => r),
    messengers: glide(from.messengers, to.messengers, (m) => m),
  };
}

/** Jde něco z průvodů a poslů (scéna se kreslí v taktu animací)? */
export function alarmMoving(alarm: SceneAlarm | null): boolean {
  return !!alarm && (alarm.messengers.length > 0 || alarm.refugees.length > 0);
}

/**
 * Útěk vsi do lesa v čase `ft` (s od jeho začátku; war.md – Ve scéně): kdo doběhl k lesu, zmizel
 * a nekreslí se; stádo za posledním z vsi zmizí s posledním, kdo doběhl. `moving` – někdo ještě jde.
 */
export function fleeFigures(
  flight: { walks: readonly FleeWalk[]; herd?: number },
  ft: number,
): { figures: ArmyFigure[]; animals: ArmyAnimal[]; moving: boolean } {
  const figures: ArmyFigure[] = [];
  const animals: ArmyAnimal[] = [];
  let moving = false;
  let allGone = true;
  for (const walk of flight.walks) {
    const at = fleeWalkAt(walk, ft);
    moving ||= at.moving;
    if (at.gone) continue; // zmizel v lese
    allGone = false;
    figures.push({
      key: `f${walk.id}`,
      kind: walk.kind,
      x: at.x,
      z: at.z,
      hx: at.hx,
      hz: at.hz,
      clip: at.moving ? walk.clip : 'idle',
      pace: at.moving ? walk.speed / 1.3 : 1,
      lift: 0,
      lying: false,
      side: 'folk',
      look: ARMY_LOOKS.folk,
    });
  }
  // dobytek žene poslední, kdo z vsi vyšel (stádo za ním jako za vojskem)
  const drover = flight.walks[flight.walks.length - 1];
  if (drover && flight.herd && !allGone) {
    const at = fleeWalkAt(drover, ft);
    drivenHerd(at, { x: at.hx, z: at.hz }, flight.herd).forEach((p, i) => {
      animals.push({
        key: `fc${i}`,
        species: 'cow',
        x: p.x,
        z: p.z,
        hx: at.hx,
        hz: at.hz,
        speed: at.moving ? drover.speed : 0,
      });
    });
  }
  return { figures, animals, moving };
}
