// Řetěz s vědry v den požáru (disasters.md – Hašení – řetěz s vědry; Martin 27. 10. 2026: „Chci,
// aby všichni dospělí hasili. Ať udělají řetěz s vědry od nejbližší vody“ a „Lidé musí být
// rozložení ve stejných vzdálenostech. Ne že všichni stojí u sebe aby si mohli dobře podávat
// a ten poslední chodí“). Dospělí stojí rovnoměrně na úsečce od bodu vody (`SceneFireChain.water`)
// k hořící stavbě. Rozestup do 2,5 m (`FIRE.firefighting.handoverM`) – stojí střídavě po obou
// stranách řady čelem k ní a vědra jdou z ruky do ruky; větší – každý chodí tam a zpět po svém
// úseku (od souseda k sousedovi) s vědrem a sousedé se potkají na konci úseku (předají si ho).
// Vědra kreslí fire-buckets.ts z téhož rozvrhu (`fireBuckets`) – samostatný mesh, ne rekvizita
// postavy (WebGPU limit 8 vertex bufferů). Čistý modul bez Babylonu.
import { FIRE } from '@bohemia/game';
import type { SceneFire } from '../village-view';
import { walkSpeed, type PoseFn, type VillagerKind } from './villager-motion';
import { ADULTS } from './villager-roster';
import { FIGURE_SCALE, type Context, type PlannedVillager } from './villager-plan-types';
import { adultHair, cast, figure, womenChance } from './villager-plan-cast';

/** Nejvýš tolik postav v řetězu (víc dospělých – řada od ohně k vodě s rozestupem jádra). */
export const MAX_FIRE_FIGURES = 80;
/** Rozestup, do kterého si lidé vědra podávají z ruky do ruky (m) – jako jádro. */
export const FIRE_HANDOVER_M = FIRE.firefighting.handoverM;
/** Jak daleko od středu hořící stavby stojí poslední člověk (m) – kousek před stěnou. */
const HOUSE_CLEAR_M = {
  zemnice: 4.2,
  polozemnice: 4.6,
  srub: 4.9,
  dvorec: 6.5,
  'dvorec-srub': 7.4,
} as const;
/** Podávání: o kolik stojí člověk stranou od osy řady (m, střídavě vlevo a vpravo). */
const PASS_SIDE_M = 0.45;
/** Podávání: jedno předání od souseda k sousedovi (s) a mezera mezi vědry (počet lidí). */
const PASS_HOP_S = 1.1;
const PASS_BUCKET_GAP = 2;
/** Podávání: podíl předání, kdy vědro drží jeden člověk, než ho podá dál. */
const PASS_HOLD = 0.35;
/** Chůze s vědrem (m/s – spěchají) a zastávka na konci úseku při předání (s). */
const WALK_M_S = 1.15;
const WALK_PAUSE_S = 0.8;
/** Chodec se zastaví tak daleko před koncem úseku (m) – sousedé stojí proti sobě. */
const WALK_STOP_M = 0.4;
/** Vědro v ruce vůči nohám postavy velikosti 1 (m): v pravé ruce dole u boku, při podávání před tělem. */
const BUCKET_HAND = { right: 0.22, forward: 0.06, up: 0.52 } as const;
const BUCKET_PASS_UP = 0.66;

/** Rozvržení řetězu: podávání (stojí) nebo chůze po úsecích, stanoviště od vody k ohni. */
export interface FireChainLayout {
  mode: 'pass' | 'walk';
  /** Podávání: kde stojí lidé (osa řady, `count` bodů); chůze: konce úseků (`count + 1`). */
  stations: { x: number; z: number }[];
  /** Jednotkový směr od vody k ohni. */
  dir: { x: number; z: number };
  count: number;
  /** Vzdálenost sousedních stanovišť (m). */
  stepM: number;
}

/** Řetěz dne požáru, nebo null (bez vody, bez hasičů, voda u stavby). */
export function fireChainLayout(fire: SceneFire | undefined): FireChainLayout | null {
  const chain = fire?.chain;
  if (!chain || chain.people <= 0) return null;
  const dx = chain.target.x - chain.water.x;
  const dz = chain.target.z - chain.water.z;
  const len = Math.hypot(dx, dz);
  if (len < 1) return null;
  const dir = { x: dx / len, z: dz / len };
  const house = fire.burning.find((b) => b.x === chain.target.x && b.z === chain.target.z);
  const clear = Math.min(HOUSE_CLEAR_M[house?.type ?? 'polozemnice'], len * 0.5);
  const end = { x: chain.target.x - dir.x * clear, z: chain.target.z - dir.z * clear };
  const reach = len - clear;
  const count = Math.min(chain.people, MAX_FIRE_FIGURES);
  const truncated = chain.people > count;
  const at = (back: number): { x: number; z: number } => ({
    x: end.x - dir.x * back,
    z: end.z - dir.z * back,
  });
  if (chain.spacingM <= FIRE_HANDOVER_M) {
    // stojí a podávají – rovnoměrně od vody k ohni (víc lidí než postav: od ohně s rozestupem)
    const step = count > 1 ? (truncated ? chain.spacingM : reach / (count - 1)) : 0;
    const stations = Array.from({ length: count }, (_, i) => at((count - 1 - i) * step));
    return { mode: 'pass', stations, dir, count, stepM: step };
  }
  const step = truncated ? chain.spacingM : reach / count;
  const stations = Array.from({ length: count + 1 }, (_, i) => at((count - i) * step));
  return { mode: 'walk', stations, dir, count, stepM: step };
}

/** Poloha chodce `i` v čase `t` (s): x, z, směr a jestli jde (jinak stojí a předává). */
interface WalkerAt {
  x: number;
  z: number;
  hx: number;
  hz: number;
  moving: boolean;
}

function walkerAt(layout: FireChainLayout, i: number, t: number, out: WalkerAt): WalkerAt {
  const a = layout.stations[i]!;
  const { dir } = layout;
  const stop = Math.min(WALK_STOP_M, layout.stepM * 0.25);
  const legM = Math.max(0.1, layout.stepM - 2 * stop);
  const legS = legM / WALK_M_S;
  const period = 2 * (legS + WALK_PAUSE_S);
  // sousedé jdou v protifázi – na konci úseku se potkají a předají si vědro
  const tau = (((t / period + (i % 2) * 0.5) % 1) + 1) % 1;
  const s = tau * period;
  let d: number;
  let forward: boolean;
  out.moving = false;
  if (s < legS) {
    d = s * WALK_M_S;
    forward = true;
    out.moving = true;
  } else if (s < legS + WALK_PAUSE_S) {
    d = legM;
    forward = true;
  } else if (s < 2 * legS + WALK_PAUSE_S) {
    d = legM - (s - legS - WALK_PAUSE_S) * WALK_M_S;
    forward = false;
    out.moving = true;
  } else {
    // čeká na začátku úseku čelem k sousedovi, který vědro nese
    d = 0;
    forward = false;
  }
  out.x = a.x + dir.x * (stop + d);
  out.z = a.z + dir.z * (stop + d);
  out.hx = forward ? dir.x : -dir.x;
  out.hz = forward ? dir.z : -dir.z;
  return out;
}

/** Strana, na které stojí člověk `i` při podávání (1 vlevo od osy, −1 vpravo). */
function passSide(i: number): number {
  return i % 2 === 0 ? 1 : -1;
}

/** Póza člověka `i` řetězu (`kind`, `scale` – tempo chůze, ať nohy neklouzají). */
export function fireChainPose(
  layout: FireChainLayout,
  i: number,
  kind: VillagerKind,
  scale: number,
): PoseFn {
  const { dir } = layout;
  // normála k ose řady (vlevo od směru k ohni)
  const nx = -dir.z;
  const nz = dir.x;
  if (layout.mode === 'pass') {
    const st = layout.stations[i]!;
    const side = passSide(i);
    return (_t, _herds, out) => {
      out.x = st.x + nx * side * PASS_SIDE_M;
      out.z = st.z + nz * side * PASS_SIDE_M;
      out.headingX = -nx * side;
      out.headingZ = -nz * side;
      out.clip = 'idle';
      out.pace = 1;
      return out;
    };
  }
  const at: WalkerAt = { x: 0, z: 0, hx: 0, hz: 0, moving: false };
  const pace = WALK_M_S / walkSpeed(kind, 'walk', scale);
  return (t, _herds, out) => {
    walkerAt(layout, i, t, at);
    out.x = at.x;
    out.z = at.z;
    out.headingX = at.hx;
    out.headingZ = at.hz;
    out.clip = at.moving ? 'walk' : 'idle';
    out.pace = at.moving ? pace : 1;
    return out;
  };
}

/**
 * Lidé řetězu – dospělí vsi (villagers.md – Výběr postavy; jádro jim ten den jinou práci nedává),
 * nejvýš `layout.count`. Kdo v řetězu není (málo lidí ve scéně), ten úsek chybí.
 */
export function fireChainFigures(ctx: Context, layout: FireChainLayout | null): PlannedVillager[] {
  if (!layout) return [];
  const out: PlannedVillager[] = [];
  for (let i = 0; i < layout.count; i++) {
    const c = cast(
      ctx,
      `fire:${i}`,
      { women: womenChance(0.5, ctx.sexes.women), child: false },
      (sex) => ctx.roster?.take({ ...ADULTS, sex }) ?? null,
    );
    if (!c) break;
    const pose = fireChainPose(layout, i, c.who.kind, c.who.scale);
    out.push(figure(c, pose, adultHair(c.who, ctx.sexes.married), { kind: 'fire' }));
  }
  return out;
}

/** Vědro ve světě: x, z, výška nad zemí (m) a natočení (směr osy x vědra). */
export interface BucketPose {
  x: number;
  z: number;
  up: number;
  hx: number;
  hz: number;
}

/** Nejvýš tolik vědel řetězu najednou. */
export function maxFireBuckets(layout: FireChainLayout): number {
  return layout.mode === 'walk' ? layout.count : Math.ceil(layout.count / PASS_BUCKET_GAP) + 1;
}

/**
 * Vědra řetězu v čase `t` (s) do `out` (přepisuje od začátku), vrátí kolik jich je. Podávání:
 * vědra jdou po ose řady od vody k ohni po jednom předání, u každého člověka chvíli zůstanou
 * (drží ho), mezi lidmi se zhoupnou; u ohně se vylijí a u vody nabírají nová. Chůze: každý nese
 * vědro v pravé ruce (k ohni plné, zpět prázdné – na konci úseku si je sousedé vymění).
 */
export function fireBuckets(layout: FireChainLayout, t: number, out: BucketPose[]): number {
  const sc = FIGURE_SCALE;
  let n = 0;
  const push = (x: number, z: number, up: number, hx: number, hz: number): void => {
    const b = (out[n] ??= { x: 0, z: 0, up: 0, hx: 1, hz: 0 });
    b.x = x;
    b.z = z;
    b.up = up;
    b.hx = hx;
    b.hz = hz;
    n++;
  };
  const { dir, stations } = layout;
  if (layout.mode === 'walk') {
    const at: WalkerAt = { x: 0, z: 0, hx: 0, hz: 0, moving: false };
    for (let i = 0; i < layout.count; i++) {
      walkerAt(layout, i, t, at);
      // vpravo od směru (hx, hz) je v levotočivé scéně (hz, −hx) – jako prut rybářů
      const x = at.x + (at.hz * BUCKET_HAND.right + at.hx * BUCKET_HAND.forward) * sc;
      const z = at.z + (-at.hx * BUCKET_HAND.right + at.hz * BUCKET_HAND.forward) * sc;
      push(x, z, BUCKET_HAND.up * sc, at.hx, at.hz);
    }
    return n;
  }
  const count = layout.count;
  if (count < 2) return 0;
  const buckets = Math.ceil(count / PASS_BUCKET_GAP) + 1;
  const cycle = buckets * PASS_BUCKET_GAP;
  for (let k = 0; k < buckets; k++) {
    const u = (((t / PASS_HOP_S + k * PASS_BUCKET_GAP) % cycle) + cycle) % cycle;
    // mimo řadu (vylité u ohně, nabírá se u vody) – vědro není vidět
    if (u > count - 1) continue;
    const i = Math.floor(u);
    const f = u - i;
    const swing = f < PASS_HOLD ? 0 : (f - PASS_HOLD) / (1 - PASS_HOLD);
    const e = swing * swing * (3 - 2 * swing);
    const a = stations[i]!;
    const b = stations[Math.min(count - 1, i + 1)]!;
    const x = a.x + (b.x - a.x) * e;
    const z = a.z + (b.z - a.z) * e;
    // mezi lidmi se vědro zhoupne trochu výš
    push(x, z, (BUCKET_PASS_UP + 0.12 * Math.sin(Math.PI * e)) * sc, dir.x, dir.z);
  }
  return n;
}

/** Klíč řetězu – mění se jen s rozvržením. */
export function fireChainKey(layout: FireChainLayout | null): string {
  if (!layout) return '';
  const first = layout.stations[0]!;
  return `${layout.mode}|${layout.count}|${first.x.toFixed(2)}|${first.z.toFixed(2)}|${layout.stepM.toFixed(3)}|${layout.dir.x.toFixed(4)}`;
}
