import { smoothstep, type DecalGrid } from './village-layout';

// Plácek křižovatky jako obtisk se stejnými měkkými okraji jako pásy cest (paths.md –
// Křižovatky; Martin 24. 10. 2026: „ty ostrý křižovatky už jsou upravený?“ – plácek byl plochý
// mnohoúhelník s tvrdým okrajem, ostrými rohy a rovným řezem ramen). Pásy cest končí ve vzdálenosti
// řezu od středu (road-works-layout.ts `roadBands`), plácek je navazuje: krytí v bodě je průřez
// pásu (plné do 0,35 × půl šířky od osy, k okraji pásu + měkkému okraji lineárně do nuly –
// path-ribbon.ts `addRibbon`) podle vzdálenosti k osám ramen, ramena se slévají hladkým minimem –
// vnitřní rohy jsou oblouk, ne ostrý roh (Martin: všude ve hře oblouk místo ostrého rohu). V řezu
// je krytí přesně průřez pásu, takže přechod z pásu do plácku není vidět. Čisté funkce, bez Babylonu.

/** Bod (m). */
interface Pt {
  x: number;
  z: number;
}

/**
 * Rameno plácku: osa od řezu pásu cesty (první bod) do středu křižovatky, poloviční šířka pásu
 * v řezu (bez měkkého okraje), měkký okraj a krytí – jako průřez pásu té cesty.
 */
export interface PatchArm {
  axis: readonly Pt[];
  half: number;
  softM: number;
  alpha: number;
  /** Volný konec v řezu (krátký úsek k brance): krytí ramene k němu klesá na tolik m jako pás. */
  openM?: number;
}

/** Plné krytí do takového podílu poloviční šířky od osy (průřez pásu – ±0,35 × půl šířky). */
export const PATCH_CORE = 0.35;
/**
 * Hladké minimum ramen (v podílech přechodu od plného krytí k nule): čím víc, tím větší oblouk
 * ve vnitřním rohu. Řez pásu musí být dost daleko, aby tam sousední rameno nic nepřidalo
 * (`JUNCTION_CUT_EXTRA_M` v junction-shape.ts).
 */
export const PATCH_BLEND = 0.8;
/** Krok paprsků (rad) a počet kroků po paprsku od středu k okraji plácku. */
const RAY_STEP = (5 * Math.PI) / 180;
const RINGS = 10;
/** Paprsky blíž než tolik (rad) se sloučí – vynucený paprsek do rohu průřezu má přednost. */
const RAY_MERGE = (0.6 * Math.PI) / 180;
/** O kolik (m) osa ramene za řezem pokračuje rovně – pás tam navazuje. */
const AXIS_EXTEND_M = 20;

/** Vzdálenost bodu od úsečky a podíl délky úsečky u nejbližšího bodu. */
function segmentDistance(p: Pt, a: Pt, b: Pt): { d: number; t: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return { d: Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)), t };
}

/** Řez ramene: bod, směr ven (od středu) a kolmice vlevo od směru ven. */
function cutOf(arm: PatchArm): { p: Pt; tx: number; tz: number } {
  const p = arm.axis[0]!;
  const q = arm.axis[1] ?? p;
  const len = Math.max(1e-6, Math.hypot(p.x - q.x, p.z - q.z));
  return { p, tx: (p.x - q.x) / len, tz: (p.z - q.z) / len };
}

/**
 * Poloha v průřezu ramene: 0 = okraj plného krytí (PATCH_CORE × půl šířky od osy), 1 = vnější
 * okraj měkkého přechodu (krytí 0), uvnitř záporná; a vzdálenost nejbližšího bodu osy od řezu (m).
 */
function armFade(arm: PatchArm, p: Pt): { fade: number; along: number } {
  const { p: c, tx, tz } = cutOf(arm);
  const ext = { x: c.x + tx * AXIS_EXTEND_M, z: c.z + tz * AXIS_EXTEND_M };
  let best = segmentDistance(p, ext, c).d;
  let along = 0;
  let walked = 0;
  for (let k = 1; k < arm.axis.length; k++) {
    const a = arm.axis[k - 1]!;
    const b = arm.axis[k]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const { d, t } = segmentDistance(p, a, b);
    if (d < best) {
      best = d;
      along = walked + t * length;
    }
    walked += length;
  }
  return {
    fade: (best - PATCH_CORE * arm.half) / ((1 - PATCH_CORE) * arm.half + arm.softM),
    along,
  };
}

/** Hladké minimum (polynom): přesně min(a, b), když se liší aspoň o k. */
function smoothMin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

/**
 * Krytí plácku v bodě: průřez pásu podle nejbližší osy ramene, ramena slitá hladkým minimem
 * (oblouk ve vnitřních rozích); krytí ramen vážené podle blízkosti (zarůstající cesta je slabší).
 */
export function patchAlpha(arms: readonly PatchArm[], p: Pt): number {
  let fade = Infinity;
  let weights = 0;
  let sum = 0;
  for (const arm of arms) {
    const { fade: f, along } = armFade(arm, p);
    fade = fade === Infinity ? f : smoothMin(fade, f, PATCH_BLEND);
    const w = Math.exp(-4 * Math.max(0, f));
    weights += w;
    sum += w * arm.alpha * (arm.openM === undefined ? 1 : smoothstep(0, arm.openM, along));
  }
  if (weights <= 0) return 0;
  return (sum / weights) * Math.min(1, Math.max(0, 1 - fade));
}

/**
 * Síť plácku: paprsky ze středu (po RAY_STEP a navíc přesně do čtyř bodů průřezu pásu v řezu
 * každého ramene), po každém RINGS kroků až k okraji – k přímce řezu ramene (pás tam navazuje),
 * jinde kružnice za dosahem ramen (krytí tam je 0). Trojúhelníky s nulovým krytím se vynechají.
 */
export function junctionPatch(center: Pt, arms: readonly PatchArm[]): DecalGrid {
  const cuts = arms.filter((a) => a.axis.length >= 2).map((arm) => ({ arm, ...cutOf(arm) }));
  if (cuts.length === 0) return emptyGrid();
  const rays: { angle: number; forced: boolean }[] = [];
  for (let a = 0; a < Math.PI * 2 - 1e-9; a += RAY_STEP) rays.push({ angle: a, forced: false });
  let cap = 0;
  for (const { arm, p, tx, tz } of cuts) {
    // kolmice vlevo od směru ven – stejné body jako průřez pásu (`addRibbon`)
    const edge = arm.half + arm.softM;
    for (const o of [-edge, -arm.half * PATCH_CORE, arm.half * PATCH_CORE, edge]) {
      const qx = p.x - tz * o;
      const qz = p.z + tx * o;
      const angle = Math.atan2(qz - center.z, qx - center.x);
      rays.push({ angle: angle < 0 ? angle + Math.PI * 2 : angle, forced: true });
      cap = Math.max(cap, Math.hypot(qx - center.x, qz - center.z) * 1.05);
    }
  }
  rays.sort((a, b) => a.angle - b.angle || Number(b.forced) - Number(a.forced));
  const merged: number[] = [];
  const forcedAt: boolean[] = [];
  for (const ray of rays) {
    const last = merged.length - 1;
    if (last >= 0 && ray.angle - merged[last]! < RAY_MERGE) {
      if (ray.forced && !forcedAt[last]) {
        merged[last] = ray.angle;
        forcedAt[last] = true;
      }
      continue;
    }
    merged.push(ray.angle);
    forcedAt.push(ray.forced);
  }
  // první a poslední paprsek blízko sebe přes 2π
  if (merged.length > 1 && merged[0]! + Math.PI * 2 - merged[merged.length - 1]! < RAY_MERGE) {
    if (forcedAt[0] || !forcedAt[merged.length - 1]) merged.pop();
    else merged.shift();
  }
  const positions: number[] = [center.x, center.z];
  const alphas: number[] = [patchAlpha(arms, center)];
  for (const angle of merged) {
    const ux = Math.cos(angle);
    const uz = Math.sin(angle);
    let reach = cap;
    for (const { p, tx, tz } of cuts) {
      const along = ux * tx + uz * tz;
      if (along <= 1e-3) continue;
      const r = ((p.x - center.x) * tx + (p.z - center.z) * tz) / along;
      if (r > 0 && r < reach) reach = r;
    }
    for (let k = 1; k <= RINGS; k++) {
      const r = (reach * k) / RINGS;
      const x = center.x + ux * r;
      const z = center.z + uz * r;
      positions.push(x, z);
      alphas.push(patchAlpha(arms, { x, z }));
    }
  }
  const n = merged.length;
  const at = (ray: number, ring: number): number => (ring === 0 ? 0 : 1 + ray * RINGS + ring - 1);
  const indices: number[] = [];
  const visible = (...v: number[]): boolean => v.some((i) => alphas[i]! > 1e-3);
  for (let j = 0; j < n; j++) {
    const next = (j + 1) % n;
    for (let k = 1; k <= RINGS; k++) {
      const a = at(j, k - 1);
      const b = at(j, k);
      const c = at(next, k - 1);
      const d = at(next, k);
      if (k === 1) {
        if (visible(a, b, d)) indices.push(a, b, d);
        continue;
      }
      if (visible(a, b, c)) indices.push(a, b, c);
      if (visible(c, b, d)) indices.push(c, b, d);
    }
  }
  return compact(positions, alphas, indices);
}

/** Jen použité vrcholy (síť bez vrcholů s nulovým krytím mimo ramena). */
function compact(positions: number[], alphas: number[], indices: number[]): DecalGrid {
  const map = new Map<number, number>();
  const outPositions: number[] = [];
  const outAlphas: number[] = [];
  const outIndices = indices.map((i) => {
    let j = map.get(i);
    if (j === undefined) {
      j = outAlphas.length;
      map.set(i, j);
      outPositions.push(positions[i * 2]!, positions[i * 2 + 1]!);
      outAlphas.push(alphas[i]!);
    }
    return j;
  });
  return {
    positions: Float32Array.from(outPositions),
    alphas: Float32Array.from(outAlphas),
    indices: Uint32Array.from(outIndices),
  };
}

function emptyGrid(): DecalGrid {
  return { positions: new Float32Array(), alphas: new Float32Array(), indices: new Uint32Array() };
}

/** Sloučí sítě plácků do jedné (jeden obtisk na vrstvu). */
export function mergeGrids(grids: readonly DecalGrid[]): DecalGrid {
  const vertices = grids.reduce((n, g) => n + g.alphas.length, 0);
  const triangles = grids.reduce((n, g) => n + g.indices.length, 0);
  const positions = new Float32Array(vertices * 2);
  const alphas = new Float32Array(vertices);
  const indices = new Uint32Array(triangles);
  let v = 0;
  let t = 0;
  for (const grid of grids) {
    positions.set(grid.positions, v * 2);
    alphas.set(grid.alphas, v);
    for (let i = 0; i < grid.indices.length; i++) indices[t + i] = v + grid.indices[i]!;
    v += grid.alphas.length;
    t += grid.indices.length;
  }
  return { positions, alphas, indices };
}
