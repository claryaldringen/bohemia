import {
  HUNT,
  TICK_MS,
  TICKS_PER_SECOND,
  beatersAt,
  type Pos,
  type QuarryKind,
} from '@bohemia/game';
import type { SceneHunt } from '../journey-view';
import type { SceneVillage } from '../village-view-scene-types';
import { PLAY_BEHIND_MAX_TICKS, PLAY_LAG_TICKS, PLAY_SLACK } from './journey-riders';
import type { WildModel } from './wildlife-placement';

// Lov ve scéně (hunting.md – Pravidla 3 a 7; plán 2026-11-22-hunting – Úloha 10): vyhnané zvíře
// klouže mezi pohledy ze serveru po taktech, honci a psi jdou podle taktu (`beatersAt` – čistá
// funkce taktu), zabité zvíře nesou honci 0 a 1 na tyči. Čisté pózy bez Babylonu – kreslí
// hunt-renderer.ts. Útočníky kreslí scéna jako lidi výpravy (journey-riders.ts).

/** Zvíře lovu, jak ho scéna kreslí. */
export interface QuarryPose {
  model: WildModel;
  pos: Pos;
  /** Kam hledí (rad; 0 = +z, π/2 = +x – jako `rotation.y` v Babylonu). */
  yaw: number;
  /** Zabité – leží na boku (nebo visí na tyči, nesou-li ho honci). */
  lying: boolean;
  scale: number;
}

/** Honec ve scéně: poloha, kam hledí, zda nese úlovek a jak rychle jde (m/s; 0 stojí). */
export interface BeaterFigure {
  pos: Pos;
  yaw: number;
  carrying: boolean;
  speed: number;
}

/** Pes lovu ve scéně (jde za svým honcem). */
export interface HuntDogFigure {
  pos: Pos;
  yaw: number;
  speed: number;
}

/** Model a měřítko zvířete – bachyně je model kance v měřítku 0,85 (plán – Úloha 10). */
const QUARRY_MODELS: Record<QuarryKind, { model: WildModel; scale: number }> = {
  stag: { model: 'wild-stag', scale: 1 },
  hind: { model: 'wild-hind', scale: 1 },
  boar: { model: 'wild-boar', scale: 1 },
  sow: { model: 'wild-boar', scale: 0.85 },
  wolf: { model: 'wild-wolf', scale: 1 },
  bear: { model: 'wild-bear', scale: 1 },
};

/** Model a měřítko zvířete druhu `kind`. */
export function quarryModel(kind: QuarryKind): { model: WildModel; scale: number } {
  return QUARRY_MODELS[kind];
}

/** Psi lovu ve scéně – nejvýš jako smečka u dvorce (wildlife-view.ts – `SCENE_DOGS_MAX`). */
export const HUNT_DOGS_MAX = 8;
/** Pes jde za svým honcem: tolik m za ním (další řada o tolik dál) a do strany (návrh Clauda). */
const DOG_BEHIND_M = 1.8;
const DOG_SIDE_M = 0.9;
/** Vzorků zvířete se drží nejvýš tolik (přehrávání stojí – skrytý panel). */
const TRACK_MAX = 64;

/** Zvíře v pohledu (null – v lese nebo zmizelé). */
type QuarryView = SceneHunt['quarry'];

/** Pohled na zvíře v taktu výpravy. */
interface Sample {
  tick: number;
  quarry: QuarryView;
}

const lerp = (a: Pos, b: Pos, t: number): Pos => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t,
});

/** Úhel směru (rad; 0 = +z) – nulový vektor null. */
function yawOf(dx: number, dz: number): number | null {
  return Math.hypot(dx, dz) < 1e-9 ? null : Math.atan2(dx, dz);
}

/**
 * Vyhnané zvíře mezi pohledy ze serveru (jako `JourneyGlide` – D49 stálé tempo): pohledy se
 * přehrávají podle svých taktů (délka taktu `TICK_MS`) se zpožděním `PLAY_LAG_TICKS`, které drží
 * zrychlení či zpomalení nejvýš o `PLAY_SLACK` – zvíře jde mezi nimi plynule, i když pohledy chodí
 * nepravidelně, a se stejným zpožděním jako útočníci (hloučky výpravy). Přehrávání nikdy necouvá
 * a jde dál i za poslední pohled – honci jsou čistá funkce taktu (`tickAt` → `beaterFigures`),
 * zvíře tam stojí na posledním pohledu. Takt se odvozuje od přijetí pohledu, ne od hodin světa –
 * scéna je ve vývojovém skoku v čase posunutá o celé dny, výprava běží v taktech světa.
 */
export class QuarryGlide {
  private shown: SceneHunt | null = null;
  private track: Sample[] = [];
  private play = { tick: 0, ms: 0, rate: 1 };

  /** Lov, který se přehrává (poslední pohled); žádný – null. */
  get hunt(): SceneHunt | null {
    return this.shown;
  }

  /** Nový pohled na lov v čase `nowMs` (ms). Jiný lov (výprava, začátek honců) začne znovu. */
  push(h: SceneHunt, nowMs: number): void {
    const was = this.shown;
    if (!was || was.journeyId !== h.journeyId || was.beaters.startTick !== h.beaters.startTick) {
      this.shown = h;
      this.track = [{ tick: h.tick, quarry: h.quarry }];
      this.play = { tick: h.tick - PLAY_LAG_TICKS, ms: nowMs, rate: 1 };
      return;
    }
    const last = this.track[this.track.length - 1]!;
    // starší pohled (přišel pozdě) nic nezmění
    if (h.tick < last.tick) return;
    this.shown = h;
    if (h.tick === last.tick) {
      this.track[this.track.length - 1] = { tick: h.tick, quarry: h.quarry };
      return;
    }
    let p = this.tickAt(nowMs);
    // zásoba po přestávce se zahodí – zvíře a honci skočí blíž
    if (h.tick - p > PLAY_BEHIND_MAX_TICKS) p = h.tick - PLAY_LAG_TICKS;
    const behind = h.tick - p;
    const rate =
      behind > PLAY_LAG_TICKS ? 1 + PLAY_SLACK : behind < PLAY_LAG_TICKS ? 1 - PLAY_SLACK : 1;
    this.play = { tick: p, ms: nowMs, rate };
    // vzorky před přehrávaným úsekem pryč – poslední z nich zůstane, od něj zvíře klouže
    let first = 0;
    while (first + 1 < this.track.length && this.track[first + 1]!.tick <= p) first++;
    this.track = [...this.track.slice(first), { tick: h.tick, quarry: h.quarry }].slice(-TRACK_MAX);
  }

  /** Takt, který scéna v čase `nowMs` ukazuje (i mezi takty). */
  tickAt(nowMs: number): number {
    return this.play.tick + (Math.max(0, nowMs - this.play.ms) / TICK_MS) * this.play.rate;
  }

  /** Takt posledního pohledu (omezený pohyb kreslí poslední stav); bez lovu null. */
  lastTick(): number | null {
    return this.track[this.track.length - 1]?.tick ?? null;
  }

  /** Zvíře v čase `nowMs`; v lese, zmizelé a bez lovu null. */
  at(nowMs: number): QuarryPose | null {
    return this.atTick(this.tickAt(nowMs));
  }

  /** Zvíře v taktu `tick` (i mezi takty). */
  atTick(tick: number): QuarryPose | null {
    const q = this.quarryAt(tick);
    if (!q) return null;
    const { model, scale } = quarryModel(q.kind);
    return { model, pos: q.pos, yaw: q.yaw, lying: q.state === 'dead', scale };
  }

  /** Kolikrát už je zvíře zasažené v čase `nowMs` (nový zásah = prach); bez zvířete 0. */
  hitsAt(nowMs: number): number {
    return this.hitsAtTick(this.tickAt(nowMs));
  }

  /** Rány zvířete v taktu `tick`; bez zvířete 0. */
  hitsAtTick(tick: number): number {
    return this.quarryAt(tick)?.hits ?? 0;
  }

  /**
   * Zvíře v taktu `p`: mezi dvěma pohledy se posune rovnoměrně, stav a rány platí od taktu
   * pohledu. Vyběhne s prvním pohledem, kde je venku; utíkající do lesa (`escape`) jde ke dveřím
   * lesa (`beaters.door`) a zmizí s pohledem, kde je pryč.
   */
  private quarryAt(p: number): (NonNullable<QuarryView> & { yaw: number }) | null {
    const track = this.track;
    const first = track[0];
    if (!first) return null;
    let a = first;
    let b: Sample | null = null;
    for (const s of track) {
      if (s.tick > p) {
        b = s;
        break;
      }
      a = s;
    }
    const qa = a.quarry;
    if (!qa) return null;
    if (!b || p <= a.tick) return { ...qa, yaw: yawOf(qa.heading.x, qa.heading.z) ?? 0 };
    const t = (p - a.tick) / (b.tick - a.tick);
    const qb = b.quarry;
    const door = this.shown?.beaters.door ?? qa.pos;
    const to = qb ? qb.pos : qa.state === 'escape' ? door : qa.pos;
    const heading = qb ? lerp(qa.heading, qb.heading, t) : qa.heading;
    const yaw = yawOf(heading.x, heading.z) ?? yawOf(qa.heading.x, qa.heading.z) ?? 0;
    return { ...qa, pos: lerp(qa.pos, to, t), yaw };
  }
}

/** Honec `index` v taktu `tick` – směr podle chůze (příští takt), stojící hledí k lesu. */
function beaterAt(h: SceneHunt, tick: number, index: number): BeaterFigure | null {
  const at = beatersAt(h.beaters, tick, index);
  if (!at) return null;
  const next = beatersAt(h.beaters, tick + 1, index);
  const prev = next ? null : beatersAt(h.beaters, tick - 1, index);
  const dx = next ? next.pos.x - at.pos.x : prev ? at.pos.x - prev.pos.x : 0;
  const dz = next ? next.pos.z - at.pos.z : prev ? at.pos.z - prev.pos.z : 0;
  const walk = yawOf(dx, dz);
  const b = h.beaters;
  return {
    pos: at.pos,
    yaw: walk ?? yawOf(b.door.x - b.from.x, b.door.z - b.from.z) ?? 0,
    carrying: at.carrying,
    speed: walk === null ? 0 : Math.hypot(dx, dz) * TICKS_PER_SECOND,
  };
}

/**
 * Honci v taktu `tick` (i mezi takty) podle `beatersAt`: kdo ještě nevyšel, nebo už je doma (nosiči
 * jdou pomaleji, ostatní jsou doma dřív), chybí. Při odnosu nesou úlovek honci 0 a 1 (`carrying`).
 */
export function beaterFigures(h: SceneHunt, tick: number): BeaterFigure[] {
  const out: BeaterFigure[] = [];
  for (let i = 0; i < HUNT.beaters.men; i++) {
    const figure = beaterAt(h, tick, i);
    if (figure) out.push(figure);
  }
  return out;
}

/**
 * Psi dvorce s honci (`dogs`, nejvýš `HUNT_DOGS_MAX`): pes `k` jde za honcem `k mod 6` – kus za
 * ním a do strany, se stejným směrem a krokem; honec doma nebo ještě nevyšel – jeho pes taky ne.
 */
export function huntDogFigures(h: SceneHunt, tick: number): HuntDogFigure[] {
  const out: HuntDogFigure[] = [];
  const men = HUNT.beaters.men;
  for (let k = 0; k < Math.min(h.dogs, HUNT_DOGS_MAX); k++) {
    const lead = beaterAt(h, tick, k % men);
    if (!lead) continue;
    const fx = Math.sin(lead.yaw);
    const fz = Math.cos(lead.yaw);
    const behind = DOG_BEHIND_M * (1 + Math.floor(k / men));
    const side = (k % 2 === 0 ? 1 : -1) * DOG_SIDE_M;
    out.push({
      pos: { x: lead.pos.x - fx * behind + fz * side, z: lead.pos.z - fz * behind - fx * side },
      yaw: lead.yaw,
      speed: lead.speed,
    });
  }
  return out;
}

/** Tyč mezi nosiči `a` a `b`: střed, směr osy (rad, od `a` k `b`) a vzdálenost nosičů (m). */
export function poleBetween(a: Pos, b: Pos): { mid: Pos; yaw: number; lengthM: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return {
    mid: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
    yaw: Math.atan2(dx, dz),
    lengthM: Math.hypot(dx, dz),
  };
}

/** Ves bez psů, kteří jdou s honci (`dogs` kusů) – smečka u dvorce je zatím nekreslí. */
export function withoutHuntDogs(village: SceneVillage, dogs: number): SceneVillage {
  const home = village.wildlife?.dogs;
  if (dogs <= 0 || home === undefined || !village.wildlife) return village;
  return { ...village, wildlife: { ...village.wildlife, dogs: Math.max(0, home - dogs) } };
}
