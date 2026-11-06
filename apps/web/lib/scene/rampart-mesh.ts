// Val s příkopem jako síť podél obvodu bez Babylonu (fortifications.md – Ve scéně): vně příkop
// 4 m široký a 1,5 m hluboký, za ním násep 6 m u paty a 2 m vysoký. Průřez se opakuje po
// obvodu (rovné části po 1,5 m, oblouky po osminách) a mění se po úsecích – staveniště roste,
// starý val se snižuje a zaobluje, čerstvá hlína zarůstá trávou. Terén pod příkopem prořízne
// pit-cut.ts (`ditchCuts`), síť sama se neprořezává. Výšky pod síť dává scéna.
import type { SceneFortification } from '../fort-view';
import {
  RAMPART,
  RAMPART_BAND_M,
  fortBand,
  hash01,
  insetPoint,
  perimeterSamples,
  rampartAt,
  rampartLooks,
  rampartProfile,
  type RampartLook,
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
  if (fort.kind !== 'rampart') return data;
  const looks = rampartLooks(fort);
  const samples = perimeterSamples(fort, RAMPART_RING_STEP_M);
  const band = fortBand(fort);
  const n = samples.length;
  if (n < 3) return data;
  const cols = RAMPART_COLUMNS.length;
  const rings: { looks: RampartLook; heights: number[] }[] = [];
  for (const p of samples) {
    const look = rampartAt(fort, looks, p.s);
    const heights = RAMPART_COLUMNS.map((d) =>
      rampartProfile(Math.min(Math.max(d, 0), RAMPART_BAND_M), look),
    );
    for (const target of [data.earth, data.grass]) {
      RAMPART_COLUMNS.forEach((d, c) => {
        const [x, z] = insetPoint(p, d, band);
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

/** Počet trojúhelníků sítě (měření scény). */
export function triangleCount(arrays: MeshArrays): number {
  return arrays.indices.length / 3;
}
