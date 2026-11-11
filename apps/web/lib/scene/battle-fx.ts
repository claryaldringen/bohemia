// Boj ve scéně (war.md – Ve scéně – Boj): šípy letí od střelce k cíli po oblouku, srážka zblízka
// zvíří prach, padlí leží do konce dne; z ochozu letí hozené kameny a oštěpy a kameny padají
// k patě hradby (fortifications.md – Obrana bez násobku 3). Bez Babylonu – rány se poznají ze dvou
// po sobě jdoucích snímků boje (jádro nastaví `cooldown` na plný interval v taktu rány), zásah
// z úbytku zdraví; kreslí army-renderer.ts.
import { FORTIFICATIONS, TICKS_PER_SECOND, WAR, type Pos } from '@bohemia/game';
import {
  BOW_TICKS,
  MELEE_TICKS,
  THROW_TICKS,
  climberPose,
  wallStandLift,
  type SceneBattle,
  type SceneFighter,
} from './army';

/** Co letí: šíp, hozený kámen, oštěp. */
export type MissileKind = 'arrow' | 'stone' | 'javelin';

/** Výstřel či hod: odkud, kam a kdy (s, čas scény); zvednutí konců nad terén (ochoz, žebřík). */
export interface Shot {
  key: string;
  /** Chybí – šíp. */
  kind?: MissileKind;
  from: Pos;
  to: Pos;
  startS: number;
  /** Délka letu (s). */
  flightS: number;
  /** Zvednutí střelce a zasaženého nad terén (m); chybí – 0. */
  fromLift?: number;
  toLift?: number;
  /** Mimo – dopadne na zem za cílem (konec letu u země, ne v rameni). */
  miss?: true;
}

/** Srážka zblízka – prach mezi muži. */
export interface Clash {
  key: string;
  at: Pos;
  startS: number;
}

/** Rychlost šípu (m/s, návrh Clauda – 40–60 m za ≈ 1 s). */
export const ARROW_M_S = 45;
/** Let hozeného kamene a oštěpu z ochozu (do 15 m) a kamene k patě (s, návrh Clauda). */
export const THROW_FLIGHT_S = 0.5;
/** Výška oblouku jako podíl vzdálenosti – šíp, hod (kámen a oštěp letí výš). */
const ARC: Record<MissileKind, number> = { arrow: 0.12, stone: 0.25, javelin: 0.2 };
/** Výška ramene střelce a cíle (m). */
const SHOULDER_M = 1.5;
/** Jak dlouho se prach srážky zvedá (s). */
export const DUST_S = 0.7;
/** Šíp mimo dopadne tolik m za cílem. */
const MISS_PAST_M = 2.5;
/** Zasažený jiný muž (kruh rozptylu – aim.ts) nejvýš tolik m od cíle. */
const SPREAD_REACH_M = 8;

/** Zvednutí muže nad terén ve snímku: lezec na žebříku, obránce na ochozu, jinak 0. */
function liftOf(b: SceneBattle, f: SceneFighter): number {
  if (f.state === 'climb' && f.climb) return climberPose(b, f, f.climb.ticks)?.lift ?? 0;
  return f.onWall ? wallStandLift(b.walls, f.pos) : 0;
}

/** Hod z ochozu – kámen, nebo oštěp; muž je střídá podle hodu (návrh Clauda). */
function throwKind(id: string, ticks: number): MissileKind {
  let h = Math.floor(ticks / THROW_TICKS);
  for (let i = 0; i < id.length; i++) h += id.charCodeAt(i);
  return h % 2 === 0 ? 'stone' : 'javelin';
}

/**
 * Takty před `cur` (0 = v taktu `cur`), ve kterých muž udeřil s intervalem `full`, když mezi snímky
 * uběhlo `dt` taktů: jádro v taktu rány nastaví `cooldown` na `full` a pak ho každý takt sníží o 1,
 * rána přijde až na nule – poslední rána je tedy `full − cooldown` taktů zpět a jen když ji `cooldown`
 * z `prev` pustil. Dřívější rány téhož boje (stejný stav i cíl už v `prev`) po `full` taktech zpět
 * (dotaz scény vynechá takty; rytmus rány je jádra, jen zobrazení). Nejnovější první; jen rány
 * méně než `within` taktů zpět (posun k novému snímku je zkrácený – dopočet po přestávce).
 */
export function strikeTicks(
  was: Pick<SceneFighter, 'cooldown' | 'state' | 'aim'>,
  now: Pick<SceneFighter, 'cooldown' | 'state' | 'aim'>,
  full: number,
  dt: number,
  within = dt,
): number[] {
  if (now.cooldown <= 0 || now.cooldown > full) return [];
  const last = full - now.cooldown;
  if (last >= Math.min(dt, within) || was.cooldown > dt - last) return [];
  const out = [last];
  if (was.state === now.state && was.aim === now.aim) {
    for (let k = last + full; k < Math.min(dt, within) && was.cooldown <= dt - k; k += full) {
      out.push(k);
    }
  }
  return out;
}

/** Nejvýš tolik ran z jednoho snímku (dopočet po dlouhé přestávce nezahltí scénu prachem a šípy). */
export const MAX_STRIKES_PER_SNAPSHOT = 240;

/**
 * Rány od snímku `prev` do `cur`: muž v boji s cílem, kterému jádro nastavilo plný interval rány
 * (`strikeTicks` – i v taktech, které dotaz scény vynechal) – na 20–60 m lukem (šíp), z ochozu hod
 * kamenem či oštěpem do 15 m, z ochozu k patě hradby kámen (do 3 m), jinak zblízka srážka (lezce na
 * žebříku bez prachu). Šíp a hod letí k tomu, komu ubylo zdraví (cíl, nebo jiný muž v kruhu
 * rozptylu – kruh se nekreslí); nikomu – dopadne za cíl. Bez předchozího snímku nic (rány nejsou
 * poznat). `nowS` – kdy snímek přišel; `spanS` – jak dlouho muži jdou z `prev` do `cur` (výchozí
 * takty × délka taktu): rána z vynechaného taktu začne, až ho plynulý pohyb dojde, z místa, kde
 * tehdy muži byli (mezi snímky rovnoměrně).
 */
export function strikesOf(
  prev: SceneBattle | null,
  cur: SceneBattle,
  nowS: number,
  spanS?: number,
): { shots: Shot[]; clashes: Clash[] } {
  const shots: Shot[] = [];
  const clashes: Clash[] = [];
  if (!prev || cur.ticks <= prev.ticks) return { shots, clashes };
  const dt = cur.ticks - prev.ticks;
  const span = spanS ?? dt / TICKS_PER_SECOND;
  // posun kratší než takty (dopočet po přestávce) – rány jen z posledních taktů v jeho délce
  const within = Math.max(1, Math.min(dt, Math.round(span * TICKS_PER_SECOND)));
  const before = new Map(prev.fighters.map((f) => [f.id, f]));
  const byId = new Map(cur.fighters.map((f) => [f.id, f]));
  const hurt = cur.fighters.filter((f) => {
    const was = before.get(f.id);
    // rána: méně zdraví, nebo víc zásahů (cizí muž ze serveru nese jen počet zásahů)
    return was !== undefined && (f.health < was.health || (f.hits ?? 0) > (was.hits ?? 0));
  });
  const c = WAR.combat;
  const footM = FORTIFICATIONS.defense.footStoneM;
  /** Poloha muže `k` taktů před `cur` – mezi snímky rovnoměrně. */
  const posAt = (f: SceneFighter, k: number): Pos => {
    const was = before.get(f.id);
    if (!was || k <= 0) return { x: f.pos.x, z: f.pos.z };
    const u = (dt - k) / dt;
    return { x: was.pos.x + (f.pos.x - was.pos.x) * u, z: was.pos.z + (f.pos.z - was.pos.z) * u };
  };
  /** Kdy rána `k` taktů před `cur` začne (s) – až k ní dojde plynulý pohyb (konec posunu = `cur`). */
  const startOf = (k: number): number => nowS + Math.max(0, span - (k + 1) / TICKS_PER_SECOND);
  /** Kam střela letí: k zasaženému (cíl, nebo nejbližší zraněný u cíle), jinak za cíl na zem. */
  const flight = (
    f: SceneFighter,
    t: SceneFighter,
    kind: MissileKind,
    flightS: (d: number) => number,
    k: number,
  ): Shot => {
    const hit = hurt.includes(t)
      ? t
      : hurt
          .filter((h) => h.id !== f.id)
          .map((h) => ({ h, d2: (h.pos.x - t.pos.x) ** 2 + (h.pos.z - t.pos.z) ** 2 }))
          .filter((x) => x.d2 <= SPREAD_REACH_M * SPREAD_REACH_M)
          .sort((a, b) => a.d2 - b.d2)[0]?.h;
    const from = posAt(f, k);
    const aim = posAt(t, k);
    const dx = aim.x - from.x;
    const dz = aim.z - from.z;
    const l = Math.hypot(dx, dz) || 1;
    const to = hit
      ? posAt(hit, k)
      : { x: aim.x + (dx / l) * MISS_PAST_M, z: aim.z + (dz / l) * MISS_PAST_M };
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    const fromLift = liftOf(cur, f);
    const toLift = hit ? liftOf(cur, hit) : 0;
    return {
      key: `${f.id}@${cur.ticks - k}`,
      ...(kind === 'arrow' ? {} : { kind }),
      from,
      to,
      startS: startOf(k),
      flightS: flightS(d),
      ...(fromLift > 0 ? { fromLift } : {}),
      ...(toLift > 0 ? { toLift } : {}),
      ...(hit ? {} : { miss: true as const }),
    };
  };
  for (const f of cur.fighters) {
    const fighting = f.state === 'fight' || (f.state === 'climb' && f.aim !== null);
    if (!fighting || f.aim === null) continue;
    const t = byId.get(f.aim);
    const was = before.get(f.id);
    if (!t || !was) continue;
    if (shots.length + clashes.length >= MAX_STRIKES_PER_SNAPSHOT) break;
    // nový interval rány: cooldown se v taktu rány nastaví na plno (`strikeTicks`)
    const d = Math.hypot(t.pos.x - f.pos.x, t.pos.z - f.pos.z);
    const bow = f.bow && d >= c.bowMinM ? strikeTicks(was, f, BOW_TICKS, dt, within) : [];
    const thrown = bow.length === 0 && f.onWall ? strikeTicks(was, f, THROW_TICKS, dt, within) : [];
    if (bow.length > 0) {
      for (const k of bow) shots.push(flight(f, t, 'arrow', (x) => x / ARROW_M_S, k));
    } else if (thrown.length > 0 && d > c.meleeM) {
      for (const k of thrown) {
        shots.push(flight(f, t, throwKind(f.id, cur.ticks - k), () => THROW_FLIGHT_S, k));
      }
    } else if (d <= c.meleeM + 0.5) {
      for (const k of strikeTicks(was, f, MELEE_TICKS, dt, within)) {
        if (f.onWall && t.state !== 'climb' && !t.onWall && d <= footM + 0.5) {
          // z ochozu kámen k patě hradby – padá dolů na muže u paty
          shots.push(flight(f, t, 'stone', () => THROW_FLIGHT_S, k));
        } else if (t.state !== 'climb' && f.state !== 'climb') {
          const a = posAt(f, k);
          const b = posAt(t, k);
          clashes.push({
            key: `${f.id}@${cur.ticks - k}`,
            at: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
            startS: startOf(k),
          });
        }
      }
    }
  }
  return { shots, clashes };
}

/** Šíp, kámen či oštěp v letu: poloha (y nad terénem) a směr; po dopadu null. */
export interface ArrowPose {
  /** Podíl letu 0–1. */
  u: number;
  x: number;
  /** Výška nad terénem pod spojnicí (m) – renderer přičte terén. */
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

/**
 * Střela v okamžiku `nowS` – parabola nad spojnicí ramene střelce (na ochozu výš) a zasaženého
 * (mimo – země za cílem); mimo let null.
 */
export function arrowAt(shot: Shot, nowS: number): ArrowPose | null {
  const u = (nowS - shot.startS) / shot.flightS;
  if (u < 0 || u > 1) return null;
  const dx = shot.to.x - shot.from.x;
  const dz = shot.to.z - shot.from.z;
  const d = Math.hypot(dx, dz);
  const h = d * ARC[shot.kind ?? 'arrow'];
  const y0 = SHOULDER_M + (shot.fromLift ?? 0);
  const y1 = (shot.miss ? 0 : SHOULDER_M) + (shot.toLift ?? 0);
  // y = y0 + (y1 − y0) u + 4 h u (1 − u), sklon dy/du = (y1 − y0) + 4 h (1 − 2u)
  const y = y0 + (y1 - y0) * u + 4 * h * u * (1 - u);
  const slope = y1 - y0 + 4 * h * (1 - 2 * u);
  const l = Math.hypot(d, slope) || 1;
  return {
    u,
    x: shot.from.x + dx * u,
    y,
    z: shot.from.z + dz * u,
    dx: dx / l,
    dy: slope / l,
    dz: dz / l,
  };
}

/** Prach srážky: poloměr (m) v okamžiku `nowS`, po dosednutí null. */
export function dustAt(clash: Clash, nowS: number): number | null {
  const u = (nowS - clash.startS) / DUST_S;
  if (u < 0 || u > 1) return null;
  return 0.6 + 1.8 * Math.sqrt(u);
}

/** Odstraní šípy a prach, které už dopadly / dosedly. */
export function pruneFx<T extends { startS: number }>(
  list: readonly T[],
  nowS: number,
  lengthS: (x: T) => number,
): T[] {
  return list.filter((x) => nowS - x.startS <= lengthS(x));
}

/**
 * Padlí a ranění leží do konce herního dne (war.md – Ve scéně): po něm (`dayEndMs`) se boj už
 * nekreslí. Bez hodin dne leží, dokud je boj ve scéně.
 */
export function fallenShown(nowMs: number, dayEndMs: number | null): boolean {
  return dayEndMs === null || nowMs < dayEndMs;
}
