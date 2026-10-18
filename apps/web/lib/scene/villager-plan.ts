// SPIKE – lidé ve vsi (ukázka animovaných postav z 0 A.D.). Kdo kde je a co dělá je čistá
// funkce vsi a času – zatím natvrdo (ženy žnou na poli, muži okopávají, nosiči chodí mezi
// obydlím a polem, pasáček u ovcí). Skutečná verze by brala práci z rozvrhu vsi (člověkodny).
import type { SceneVillage } from '../village-view';

export type VillagerKind = 'woman' | 'man';
export type VillagerClip = 'walk' | 'idle' | 'reap' | 'hoe' | 'carry';

/** Rychlost chůze (m/s) při přehrávání klipu rychlostí 1 – ať nohy neklouzají (měřeno z GLB). */
export const WALK_SPEED: Record<VillagerKind, Partial<Record<VillagerClip, number>>> = {
  woman: { walk: 1.25, carry: 1.05 },
  man: { walk: 1.0, carry: 1.1 },
};

export interface VillagerPose {
  x: number;
  z: number;
  /** Kam postava míří (jednotkový vektor v rovině x–z). */
  headingX: number;
  headingZ: number;
  clip: VillagerClip;
}

/** Stádo, u kterého stojí pasáček (střed a poloměr), a jestli se právě stěhuje. */
export interface HerdView {
  x: number;
  z: number;
  radiusM: number;
  moving: number;
  headingX: number;
  headingZ: number;
}

export interface PlannedVillager {
  kind: VillagerKind;
  scale: number;
  /** Posun fáze animace (0–1) – sousedé se nehýbou naráz. */
  phase: number;
  pose(tS: number, herd: HerdView | null, out: VillagerPose): VillagerPose;
}

/** Nejvýš tolik postav (spike – ať se dá změřit cena). */
const MAX_PEOPLE = 60;

export function createVillagerPose(): VillagerPose {
  return { x: 0, z: 0, headingX: 0, headingZ: 1, clip: 'idle' };
}

/**
 * Lidé vsi: ženy žnou srpem na prvních dílech pole (řada postupuje po metru), muži okopávají
 * další díl, nosiči chodí s nůší mezi obydlím a polem, u obydlí pár lidí postává a u stáda ovcí
 * jeden až dva pasáčci (zmenšený muž).
 */
export function planVillagers(village: SceneVillage, seed: number): PlannedVillager[] {
  const built = village.dwellings.filter((d) => d.built);
  const parts = village.fields.flatMap((f) => f.parts);
  if (built.length === 0) return [];
  const center = {
    x: built.reduce((s, d) => s + d.position.x, 0) / built.length,
    z: built.reduce((s, d) => s + d.position.z, 0) / built.length,
  };
  const byDistance = [...parts].sort(
    (a, b) =>
      Math.hypot(a.x - center.x, a.z - center.z) - Math.hypot(b.x - center.x, b.z - center.z),
  );
  const random = mulberry(seed);
  const people: PlannedVillager[] = [];

  // Žnečky: řada 4 žen napříč dílem, žnou 8 s a popojdou o metr; na konci dílu se otočí.
  byDistance.slice(0, 4).forEach((part, p) => {
    const toVillage = unit(center.x - part.x, center.z - part.z);
    // řada postupuje od vsi pryč, ženy stojí napříč
    const ax = -toVillage.x;
    const az = -toVillage.z;
    const across = { x: -az, z: ax };
    const half = part.size / 2 - 1;
    for (let i = 0; i < 4; i++) {
      const offset = -half + ((i + 0.5) * (2 * half)) / 4 + (random() - 0.5);
      people.push(
        rowWorker('woman', 'reap', part, { x: ax, z: az }, across, offset, half, random(), p),
      );
    }
  });
  // Okopávači: 3 muži na pátém dílu (nebo na prvním, když je pole malé).
  const hoePart = byDistance[4] ?? byDistance[0];
  if (hoePart) {
    const dir = unit(hoePart.x - center.x, hoePart.z - center.z);
    const across = { x: -dir.z, z: dir.x };
    const half = hoePart.size / 2 - 1;
    for (let i = 0; i < 3; i++) {
      people.push(
        rowWorker('man', 'hoe', hoePart, dir, across, -half + 2 + i * 4, half, random(), 7),
      );
    }
  }
  // Nosiči: od obydlí k nejbližšímu dílu pole a s nůší zpět.
  if (byDistance.length > 0) {
    built.slice(0, 6).forEach((d, i) => {
      const target = byDistance[i % Math.min(4, byDistance.length)]!;
      const kind: VillagerKind = i % 2 === 0 ? 'woman' : 'man';
      people.push(carrier(kind, d.position, target, random()));
    });
  }
  // Postávající u obydlí: dvojice natočené k sobě.
  built.slice(0, 3).forEach((d, i) => {
    const side = unit(Math.cos(d.position.rotation), Math.sin(d.position.rotation));
    const base = { x: d.position.x + side.x * 5, z: d.position.z + side.z * 5 };
    const kinds: VillagerKind[] = i === 1 ? ['man', 'man'] : ['woman', 'man'];
    kinds.forEach((kind, k) => {
      const x = base.x + (k === 0 ? -0.7 : 0.7);
      const z = base.z;
      people.push(stander(kind, x, z, k === 0 ? 1 : -1, 0, random()));
    });
  });
  // Pasáčci u stáda ovcí.
  for (let i = 0; i < 2; i++) people.push(herdBoy(seed + i * 977, i, random()));
  return people.slice(0, MAX_PEOPLE);
}

/**
 * Práce v řadě: `clip` na místě 8,8 s, pak 1,2 s chůze o metr dál; po průchodu dílem se řada
 * otočí a jde zpět (vedlejší pruh – posun napříč o 0,5 m).
 */
function rowWorker(
  kind: VillagerKind,
  clip: VillagerClip,
  part: { x: number; z: number },
  dir: { x: number; z: number },
  across: { x: number; z: number },
  offset: number,
  half: number,
  phase: number,
  seedShift: number,
): PlannedVillager {
  const stepS = 10;
  const workS = 8.8;
  const stepM = 1.0;
  const steps = Math.max(1, Math.floor((2 * half) / stepM));
  const shift = seedShift * 3.7 + phase * stepS;
  return {
    kind,
    scale: kind === 'woman' ? 0.97 + phase * 0.06 : 0.95 + phase * 0.1,
    phase,
    pose(tS, _herd, out) {
      const t = tS + shift;
      const k = Math.floor(t / stepS);
      const within = t - k * stepS;
      const pass = Math.floor(k / steps);
      const back = pass % 2 === 1;
      const step = k % steps;
      const progress = step + (within > workS ? (within - workS) / (stepS - workS) : 0);
      const along = -half + (back ? 2 * half - progress * stepM : progress * stepM);
      const lane = offset + (back ? 0.5 : 0);
      out.x = part.x + dir.x * along + across.x * lane;
      out.z = part.z + dir.z * along + across.z * lane;
      out.headingX = back ? -dir.x : dir.x;
      out.headingZ = back ? -dir.z : dir.z;
      out.clip = within > workS ? 'walk' : clip;
      return out;
    },
  };
}

/** Nosič: od obydlí na kraj dílu (chůze), 3 s stojí, s nůší zpět, 4 s u obydlí. */
function carrier(
  kind: VillagerKind,
  home: { x: number; z: number; rotation: number },
  part: { x: number; z: number; size: number },
  phase: number,
): PlannedVillager {
  const dir = unit(part.x - home.x, part.z - home.z);
  const from = { x: home.x + dir.x * 4.5, z: home.z + dir.z * 4.5 };
  const length = Math.max(1, Math.hypot(part.x - from.x, part.z - from.z) - part.size / 2 + 1);
  const to = { x: from.x + dir.x * length, z: from.z + dir.z * length };
  const outS = length / (WALK_SPEED[kind].walk ?? 1.1);
  const backS = length / (WALK_SPEED[kind].carry ?? 1.0);
  const cycle = outS + 3 + backS + 4;
  return {
    kind,
    scale: 0.96 + phase * 0.08,
    phase,
    pose(tS, _herd, out) {
      const t = (((tS + phase * cycle) % cycle) + cycle) % cycle;
      if (t < outS) {
        const u = t / outS;
        set(out, from.x + (to.x - from.x) * u, from.z + (to.z - from.z) * u, dir.x, dir.z, 'walk');
      } else if (t < outS + 3) {
        set(out, to.x, to.z, -dir.x, -dir.z, 'idle');
      } else if (t < outS + 3 + backS) {
        const u = (t - outS - 3) / backS;
        set(out, to.x + (from.x - to.x) * u, to.z + (from.z - to.z) * u, -dir.x, -dir.z, 'carry');
      } else {
        set(out, from.x, from.z, dir.x, dir.z, 'idle');
      }
      return out;
    },
  };
}

function stander(
  kind: VillagerKind,
  x: number,
  z: number,
  hx: number,
  hz: number,
  phase: number,
): PlannedVillager {
  return {
    kind,
    scale: 0.96 + phase * 0.08,
    phase,
    pose(_t, _herd, out) {
      return set(out, x, z, hx, hz, 'idle');
    },
  };
}

/**
 * Pasáček (zmenšený muž) u stáda: každých 25 s si vybere jiné místo kolem stáda a dojde tam;
 * když se stádo stěhuje, jde s ním.
 */
function herdBoy(seed: number, index: number, phase: number): PlannedVillager {
  const slotS = 25;
  const speed = 0.9;
  const spot = (k: number, radius: number): { x: number; z: number } => {
    const angle = hash(seed, k) * Math.PI * 2;
    const r = radius + 2 + hash(seed + 1, k) * 3;
    return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
  };
  return {
    kind: 'man',
    // chlapec kolem deseti let (≈ 1,35 m)
    scale: 0.8 - index * 0.05,
    phase,
    pose(tS, herd, out) {
      if (!herd) return set(out, 0, 0, 0, 1, 'idle');
      const t = tS + phase * slotS;
      const k = Math.floor(t / slotS);
      const within = t - k * slotS;
      const a = spot(k - 1, herd.radiusM);
      const b = spot(k, herd.radiusM);
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      const walkS = d / speed;
      const u = walkS > 0 ? Math.min(1, within / walkS) : 1;
      out.x = herd.x + a.x + (b.x - a.x) * u;
      out.z = herd.z + a.z + (b.z - a.z) * u;
      if (herd.moving > 0.3) {
        out.headingX = herd.headingX;
        out.headingZ = herd.headingZ;
        out.clip = 'walk';
      } else if (u < 1) {
        out.headingX = (b.x - a.x) / d;
        out.headingZ = (b.z - a.z) / d;
        out.clip = 'walk';
      } else {
        // stojí čelem ke stádu
        const toward = unit(-b.x, -b.z);
        out.headingX = toward.x;
        out.headingZ = toward.z;
        out.clip = 'idle';
      }
      return out;
    },
  };
}

function set(
  out: VillagerPose,
  x: number,
  z: number,
  hx: number,
  hz: number,
  clip: VillagerClip,
): VillagerPose {
  out.x = x;
  out.z = z;
  out.headingX = hx;
  out.headingZ = hz;
  out.clip = clip;
  return out;
}

function unit(x: number, z: number): { x: number; z: number } {
  const l = Math.hypot(x, z);
  return l > 1e-6 ? { x: x / l, z: z / l } : { x: 0, z: 1 };
}

function hash(seed: number, k: number): number {
  let h = (seed * 374761393 + k * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
