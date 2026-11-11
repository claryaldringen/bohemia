// Val s příkopem jako síť podél obvodu bez Babylonu (fortifications.md – Ve scéně): vně příkop
// 4 m široký a 1,5 m hluboký, za ním násep 6 m u paty a 2 m vysoký. Průřez se opakuje po
// obvodu (rovné části po 1,5 m, oblouky po osminách) a mění se po úsecích – staveniště roste,
// starý val se snižuje a zaobluje, čerstvá hlína zarůstá trávou. Terén pod příkopem prořízne
// pit-cut.ts (`ditchCuts`), síť sama se neprořezává. Výšky pod síť dává scéna.
import type { SceneFortification } from '../fort-view';
import {
  RAMPART,
  RAMPART_BAND_M,
  RAMPART_CROWN_M,
  fortBand,
  moatWaterRuns,
  hash01,
  insetPoint,
  perimeterSamples,
  rampartAt,
  rampartLooks,
  rampartProfile,
  wallCoreAt,
  wallCoreProfile,
  crownLift,
  RAMPART_GRASS_YEARS,
  type RampartLook,
  type WallCore,
} from './fortification-layout';
import type { HeightFn } from './village-meshes';

/** Pole vrcholů sítě: polohy, barvy (RGBA), UV a trojúhelníky. */
export interface MeshArrays {
  positions: number[];
  colors: number[];
  uvs: number[];
  indices: number[];
}

/** Hlína a tráva valu – dvě sítě (dva materiály), stejné vrcholy, čtverce rozdělené podle trávy. */
export interface RampartMeshData {
  earth: MeshArrays;
  grass: MeshArrays;
}

/**
 * Hloubky průřezu (m od vnějšího okraje dovnitř): okraj přesahuje o 0,3 m na obě strany přes
 * terén (prořez končí přesně na okraji příkopu), příkop 0–4 m, násep 4–10 m – v rohu se násep
 * roztáhne až k vnitřnímu okraji pásu (`insetPoint`), profil podle poměrné polohy.
 */
export const RAMPART_COLUMNS: readonly number[] = [
  -0.3, 0, 0.45, 1.2, 2, 2.8, 3.55, 4, 4.6, 5.2, 5.8, 6.4, 7, 7.6, 8.2, 8.8, 9.4, 10, 10.3,
];
/** Okraj sítě kousek nad terénem (bez z-fightingu s loukou). */
const RIM_LIFT_M = 0.02;
/** Krok průřezů po rovných částech obvodu (m). */
export const RAMPART_RING_STEP_M = 1.5;

/** Barvy hlíny (násobí texturu bahna): dno příkopu tmavší, násep světlejší podloží. */
const DITCH_COLOR: readonly [number, number, number] = [0.52, 0.43, 0.33];
const BANK_COLOR: readonly [number, number, number] = [0.78, 0.66, 0.5];
const RIM_COLOR: readonly [number, number, number] = [0.62, 0.53, 0.4];
/** Tráva valu – textura trávy terénu skoro beze změny. */
const GRASS_COLOR: readonly [number, number, number] = [0.95, 0.97, 0.92];

function emptyArrays(): MeshArrays {
  return { positions: [], colors: [], uvs: [], indices: [] };
}

/**
 * Síť valu opevnění: průřezy po obvodu (`RAMPART_COLUMNS`) ve výšce `rim` (terén s převýšením
 * obtisků) plus profil náspu a příkopu podle úseku (`rampartAt`). Kus obvodu bez valu (nestojící
 * úseky, průchod brány) se vynechá. Čtverec sítě je tráva, když jeho pevné číslo spadne pod
 * podíl trávy úseku – val zarůstá po skvrnách, dno příkopu nakonec.
 */
export function rampartMeshData(fort: SceneFortification, rim: HeightFn): RampartMeshData {
  const data: RampartMeshData = { earth: emptyArrays(), grass: emptyArrays() };
  const looks = rampartLooks(fort);
  if (!looks.some((l) => l.height > 0)) return data;
  const samples = perimeterSamples(fort, RAMPART_RING_STEP_M);
  const band = fortBand(fort);
  const n = samples.length;
  if (n < 3) return data;
  const cols = RAMPART_COLUMNS.length;
  const rings: { looks: RampartLook; heights: number[] }[] = [];
  for (const p of samples) {
    const look = rampartAt(fort, looks, p.s);
    // val vně hradby: pás před křivkou (`offset`), koruna rozšířená pod hradbu (`wide`)
    const wide = look.wide ?? 0;
    const depths = RAMPART_COLUMNS.map((d) => (d > RAMPART_CROWN_M ? d + wide : d));
    const heights = depths.map((d) =>
      rampartProfile(Math.min(Math.max(d, 0), RAMPART_BAND_M + wide), look),
    );
    for (const target of [data.earth, data.grass]) {
      RAMPART_COLUMNS.forEach((d, c) => {
        const [x, z] = insetPoint(p, (look.offset ?? 0) + depths[c]!, band);
        const y = rim(x, z) + RIM_LIFT_M + heights[c]!;
        target.positions.push(x, y, z);
        const color =
          target === data.grass
            ? GRASS_COLOR
            : d < 0 || d > RAMPART_BAND_M
              ? RIM_COLOR
              : d <= RAMPART.ditchM
                ? DITCH_COLOR
                : BANK_COLOR;
        // stín na dně příkopu – tmavší s hloubkou
        const shade = 1 + Math.min(0, heights[c]!) * 0.12;
        target.colors.push(color[0] * shade, color[1] * shade, color[2] * shade, 1);
        target.uvs.push(x * 0.25, z * 0.25 + y * 0.15);
      });
    }
    rings.push({ looks: look, heights });
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = rings[i]!;
    const b = rings[j]!;
    // kus bez valu (obě strany ploché) se nekreslí – ležel by na terénu
    if (a.heights.every((h) => Math.abs(h) < 0.005) && b.heights.every((h) => Math.abs(h) < 0.005))
      continue;
    const grass = (a.looks.grass + b.looks.grass) / 2;
    for (let c = 0; c + 1 < cols; c++) {
      const d = RAMPART_COLUMNS[c]!;
      // dno příkopu zarůstá poslední
      const bias = d > 0.4 && d < RAMPART.ditchM - 0.4 ? 0.25 : 0;
      const patch = grassNoise(fort.id, samples[i]!.s, d) + 0.12 * hash01(fort.id, i * 32 + c, 21);
      const target = patch * 0.88 + bias < grass * 1.25 ? data.grass : data.earth;
      const v00 = i * cols + c;
      const v01 = i * cols + c + 1;
      const v10 = j * cols + c;
      const v11 = j * cols + c + 1;
      target.indices.push(v00, v10, v11, v00, v11, v01);
    }
  }
  return data;
}

/**
 * Průřez zeminy hradby (m od `wallCoreLine` dovnitř) – stejný počet sloupců pro všechny druhy:
 * násyp ochozu za kůly, hliněné jádro roštové (od plenty po týl), výplň komor komorové hradby
 * (mezi vnitřními líci srubů). Krajní sloupce leží na zemi.
 */
export const WALL_CORE_COLUMNS: Record<WallCore['kind'], readonly number[]> = {
  walkway: [0.08, 0.12, 0.9, 1.75, 2.75, 3.75, 4.75, 4.85],
  crib: [0.45, 0.5, 2, 3.5, 5, 5.6, 6.3, 7],
  chamber: [1.45, 1.5, 2.9, 4.4, 5.8, 7.3, 7.35, 7.4],
};
/** Barvy zeminy hradby: násyp ochozu jako val, jádro roštu tmavší, výplň komor kamenitá. */
const CORE_COLORS: Record<WallCore['kind'], readonly [number, number, number]> = {
  walkway: BANK_COLOR,
  crib: [0.6, 0.5, 0.38],
  chamber: [0.6, 0.57, 0.52],
};

/**
 * Zemina hradeb opevnění (fortifications.md – Hradby a obrana, Rozhraní a scéna): násyp ochozu
 * 4 m zevnitř za palisádou, hliněné jádro roštové hradby a výplň komor komorové – průřezy po
 * obvodu (`WALL_CORE_COLUMNS`), výška podle stavby úseku. Na valu se zvedne o korunu. Násyp
 * ochozu zarůstá trávou jako val, jádro a výplň zůstanou hlínou (mezi kládami a kamením).
 */
export function wallCoreMeshData(fort: SceneFortification, rim: HeightFn): RampartMeshData {
  const data: RampartMeshData = { earth: emptyArrays(), grass: emptyArrays() };
  const coreAt = wallCoreAt(fort);
  const samples = perimeterSamples(fort, RAMPART_RING_STEP_M);
  const n = samples.length;
  if (n < 3) return data;
  const band = fortBand(fort);
  const crown = crownLift(fort);
  const cores = samples.map(coreAt);
  // kus bez zeminy má průřez jako zemina opevnění – konec násypu u brány se nezkosí
  const fallback = cores.find((c) => c !== null);
  if (!fallback) return data;
  const cols = WALL_CORE_COLUMNS.walkway.length;
  const rings: { heights: number[]; grass: number }[] = [];
  samples.forEach((p, i) => {
    const core = cores[i]!;
    const columns = WALL_CORE_COLUMNS[core?.kind ?? fallback.kind];
    const heights = columns.map((d) => (core ? wallCoreProfile(core.kind, d) * core.earth : 0));
    const lift = crown(p.s);
    const grass =
      core?.kind === 'walkway' && core.earth >= 1
        ? Math.min(
            1,
            Math.max(
              0,
              (core.age - RAMPART_GRASS_YEARS.from) /
                (RAMPART_GRASS_YEARS.full - RAMPART_GRASS_YEARS.from),
            ),
          )
        : 0;
    const color = CORE_COLORS[core?.kind ?? fallback.kind];
    for (const target of [data.earth, data.grass]) {
      columns.forEach((d, c) => {
        const [x, z] = insetPoint(p, (core ?? fallback).line + d, band);
        const y = rim(x, z) + RIM_LIFT_M + lift + heights[c]!;
        target.positions.push(x, y, z);
        const tint = target === data.grass ? GRASS_COLOR : color;
        target.colors.push(tint[0], tint[1], tint[2], 1);
        target.uvs.push(x * 0.25, z * 0.25 + y * 0.15);
      });
    }
    rings.push({ heights, grass });
  });
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = rings[i]!;
    const b = rings[j]!;
    for (let c = 0; c + 1 < cols; c++) {
      // kus bez zeminy (brána, jiný druh, nestojí) se nekreslí – ležel by na terénu
      const hs = [a.heights[c]!, a.heights[c + 1]!, b.heights[c]!, b.heights[c + 1]!];
      if (hs.every((h) => h < 0.005)) continue;
      const grass = (a.grass + b.grass) / 2;
      const patch = grassNoise(fort.id, samples[i]!.s, c);
      const target = grass > 0 && patch * 0.88 < grass * 1.25 ? data.grass : data.earth;
      const v00 = i * cols + c;
      const v01 = i * cols + c + 1;
      const v10 = j * cols + c;
      const v11 = j * cols + c + 1;
      target.indices.push(v00, v10, v11, v00, v11, v01);
    }
  }
  return data;
}

/**
 * Skvrny trávy: hladký šum po obvodu (buňky 5 m) a napříč valem (2,5 m) – tráva zarůstá
 * souvislými plochami, ne po jednotlivých čtvercích sítě.
 */
function grassNoise(seed: number, s: number, d: number): number {
  const u = s / 5;
  const v = (d + 0.5) / 2.5;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  const su = fu * fu * (3 - 2 * fu);
  const sv = fv * fv * (3 - 2 * fv);
  const at = (a: number, b: number): number => hash01(seed, a, 40 + b);
  const top = at(i, j) + (at(i + 1, j) - at(i, j)) * su;
  const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
  return top + (bottom - top) * sv;
}

/** Vykopaný žlab palisády (staveniště) – úzký pruh hlíny podél úseček (`PalisadeLayout.trench`). */
export function trenchMeshData(
  trench: readonly (readonly [number, number, number, number])[],
  rim: HeightFn,
): MeshArrays {
  const out = emptyArrays();
  const half = 0.3;
  for (const [ax, az, bx, bz] of trench) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const nx = (-(bz - az) / len) * half;
    const nz = ((bx - ax) / len) * half;
    const base = out.positions.length / 3;
    for (const [x, z] of [
      [ax + nx, az + nz],
      [ax - nx, az - nz],
      [bx + nx, bz + nz],
      [bx - nx, bz - nz],
    ] as const) {
      out.positions.push(x, rim(x, z) + 0.01, z);
      out.colors.push(0.42, 0.34, 0.26, 1);
      out.uvs.push(x * 0.25, z * 0.25);
    }
    out.indices.push(base, base + 2, base + 3, base, base + 3, base + 1);
  }
  return out;
}

/** Zasypávaný pruh vodního příkopu – šířka (průlom 4 m) a hloubka bočnic pod hladinou zásypu. */
const MOAT_FILL = { widthM: 4, sideM: 2.5 } as const;

/**
 * Zasypávaný kus vodního příkopu v boji (fortifications.md – Přechod hradby – S valem; jádro –
 * `BattleBreach.moat`): pruh čerstvé hlíny 4 m od zasypávajících k hradbě, hladina zásypu stoupá
 * ode dna příkopu k okraji podle podílu `share`; bočnice dolů zakryjí vodu a stěny příkopu.
 */
export function moatFillMeshData(
  fills: readonly { from: { x: number; z: number }; to: { x: number; z: number }; share: number }[],
  rim: HeightFn,
): MeshArrays {
  const out = emptyArrays();
  const half = MOAT_FILL.widthM / 2;
  for (const f of fills) {
    const dx = f.to.x - f.from.x;
    const dz = f.to.z - f.from.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const nx = (-dz / len) * half;
    const nz = (dx / len) * half;
    const below = RAMPART.ditchDepthM * (1 - Math.min(1, Math.max(0, f.share)));
    const corners = [
      [f.from.x + nx, f.from.z + nz],
      [f.from.x - nx, f.from.z - nz],
      [f.to.x + nx, f.to.z + nz],
      [f.to.x - nx, f.to.z - nz],
    ] as const;
    const top = corners.map(([x, z]) => rim(x, z) + 0.02 - below);
    const quad = (pts: readonly (readonly [number, number, number])[], shade: number): void => {
      const base = out.positions.length / 3;
      for (const [x, y, z] of pts) {
        out.positions.push(x, y, z);
        out.colors.push(0.42 * shade, 0.34 * shade, 0.26 * shade, 1);
        out.uvs.push(x * 0.25, z * 0.25);
      }
      out.indices.push(base, base + 2, base + 3, base, base + 3, base + 1);
      out.indices.push(base, base + 3, base + 2, base, base + 1, base + 3);
    };
    const p = (i: number, dy = 0): readonly [number, number, number] => [
      corners[i]![0],
      top[i]! + dy,
      corners[i]![1],
    ];
    quad([p(0), p(1), p(2), p(3)], 1);
    // bočnice podél pruhu – svah zásypu do vody
    quad([p(0), p(0, -MOAT_FILL.sideM), p(2), p(2, -MOAT_FILL.sideM)], 0.8);
    quad([p(1), p(1, -MOAT_FILL.sideM), p(3), p(3, -MOAT_FILL.sideM)], 0.8);
  }
  return out;
}

/**
 * Hladina vody v příkopu (fortifications.md – Hradby a obrana, vodní příkop): pruh po souvislých
 * kusech s vodou (`moatWaterRuns`) – rovný napříč (výška okraje na ose příkopu − hloubka
 * hladiny), okraje zasunuté do stěn příkopu. Led v zimě je tatáž síť s jiným materiálem.
 */
export function moatWaterMeshData(fort: SceneFortification, rim: HeightFn): MeshArrays {
  const out = emptyArrays();
  for (const run of moatWaterRuns(fort)) {
    const base = out.positions.length / 3;
    run.forEach((w, i) => {
      const y = rim(w.axis[0], w.axis[1]) + RIM_LIFT_M - w.below;
      for (const [x, z] of [w.outer, w.inner]) {
        out.positions.push(x, y, z);
        out.colors.push(1, 1, 1, 1);
        out.uvs.push(x * 0.1, z * 0.1);
      }
      if (i === 0) return;
      const a = base + (i - 1) * 2;
      const b = base + i * 2;
      out.indices.push(a, b, b + 1, a, b + 1, a + 1);
    });
  }
  return out;
}
