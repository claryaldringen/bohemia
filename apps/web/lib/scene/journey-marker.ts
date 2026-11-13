// Praporek cíle a přesýpací hodiny výjezdu vojvody (lord-control.md – Co hráč vidí: „na zemi
// zůstane praporek cíle“, „Čekání: nad vojvodou přesýpací hodiny s počtem dní do návratu“;
// journey.md – Scéna vsi). Praporek stojí na zemi v cíli `group.goal` – jádro cíl ve vodě posune
// na nejbližší dosažitelné místo (`settleGoal`), takže praporek stojí tam. Hodiny jsou obrázek
// natočený ke kameře, kreslí se přes vše. Tři meshe bez modelů (vlastní geometrie), kreslí se jen
// při změně. Použije i scéna cizí mapy (Úloha 9).
import { Constants } from '@babylonjs/core/Engines/constants';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { Pos } from '@bohemia/game';
import type { SceneJourney } from './journey-riders';

/** Co značky ukazují: praporek v cíli a hodiny nad čekající skupinou (dny do návratu). */
export interface JourneyMarks {
  goal: Pos | null;
  wait: { pos: Pos; days: number } | null;
}

/**
 * Značky vlastního výjezdu (návrh Clauda): praporek, dokud skupina jede ven nebo na místě čeká
 * a cíl je na této mapě; hodiny, když stojí a čeká (`waitDaysLeft`). Cizí výjezd ani návrat domů
 * praporek nemají – cíl je rozkaz hráče.
 */
export function journeyMarks(journeys: readonly SceneJourney[]): JourneyMarks {
  const own = journeys.find((j) => j.own && j.phase !== null);
  if (!own) return { goal: null, wait: null };
  return {
    goal: own.phase === 'out' && own.goal ? { x: own.goal.x, z: own.goal.z } : null,
    wait:
      own.waitDaysLeft !== null
        ? { pos: { x: own.pos.x, z: own.pos.z }, days: own.waitDaysLeft }
        : null,
  };
}

/** Číslice 3 × 5 (řádky shora, 1 = plno). */
const DIGITS: Readonly<Record<string, readonly string[]>> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};

const WOOD = [110, 72, 40] as const;
const GLASS = [225, 235, 240] as const;
const SAND = [226, 182, 92] as const;
const INK = [24, 20, 16] as const;
const WHITE = [250, 246, 236] as const;

/**
 * Obrázek hodin (RGBA `px` × `px`, řádek 0 dole jako textura): přesýpací hodiny vlevo a počet dní
 * vpravo, obrys tmavý (čitelné na trávě i sněhu). Stejné dny = stejný obrázek.
 */
export function hourglassPixels(days: number, px: number): Uint8Array {
  const out = new Uint8Array(px * px * 4);
  const put = (x: number, y: number, c: readonly number[], a = 255): void => {
    if (x < 0 || y < 0 || x >= px || y >= px) return;
    const o = ((px - 1 - y) * px + x) * 4;
    out[o] = c[0]!;
    out[o + 1] = c[1]!;
    out[o + 2] = c[2]!;
    out[o + 3] = a;
  };
  const u = px / 32;
  // hodiny: dřevěná víčka nahoře a dole, sklo zúžené uprostřed, písek dole
  const left = Math.round(2 * u);
  const width = Math.round(13 * u);
  const top = Math.round(4 * u);
  const bottom = Math.round(28 * u);
  const mid = (top + bottom) / 2;
  const half = width / 2;
  const cx = left + half;
  for (let y = top - Math.round(u); y <= bottom + Math.round(u); y++) {
    for (let x = left - Math.round(u); x <= left + width + Math.round(u); x++) {
      const cap = y < top + 2 * u || y > bottom - 2 * u;
      const span = cap ? half : 1 + (half - 1) * (Math.abs(y - mid) / (mid - top));
      const inside = Math.abs(x + 0.5 - cx) <= span;
      const edge = Math.abs(x + 0.5 - cx) <= span + u;
      if (inside) {
        const sand = !cap && (y > mid + (bottom - mid) * 0.35 || (y < mid && y > mid - 2 * u));
        put(x, y, cap ? WOOD : sand ? SAND : GLASS);
      } else if (edge && y >= top - u && y <= bottom + u) put(x, y, INK);
    }
  }
  // počet dní vpravo (nejvýš dvě číslice)
  const text = String(Math.max(0, Math.min(99, Math.round(days))));
  const cell = Math.max(1, Math.round((text.length > 1 ? 2.6 : 3.4) * u));
  const glyphW = 3 * cell;
  const startX = Math.round(17 * u + (14 * u - text.length * (glyphW + cell)) / 2);
  const startY = Math.round(16 * u - 2.5 * cell);
  [...text].forEach((ch, n) => {
    const rows = DIGITS[ch]!;
    const gx = startX + n * (glyphW + cell);
    rows.forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        if (bit !== '1') return;
        for (let y = 0; y < cell; y++) {
          for (let x = 0; x < cell; x++) {
            const X = gx + rx * cell + x;
            const Y = startY + ry * cell + y;
            // obrys kolem číslice
            for (let oy = -1; oy <= 1; oy++) {
              for (let ox = -1; ox <= 1; ox++) {
                const o = ((px - 1 - (Y + oy)) * px + (X + ox)) * 4;
                if (o >= 0 && o < out.length && out[o + 3] === 0) put(X + ox, Y + oy, INK);
              }
            }
          }
        }
      });
    });
    rows.forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        if (bit !== '1') return;
        for (let y = 0; y < cell; y++) {
          for (let x = 0; x < cell; x++) put(gx + rx * cell + x, startY + ry * cell + y, WHITE);
        }
      });
    });
  });
  return out;
}

/** Výška tyče praporku (m) – nad jezdce na koni, ať je cíl vidět i se skupinou na místě. */
export const BANNER_POLE_M = 3.4;
/** Hodiny nad středem skupiny (m nad terénem) – nad hlavou jezdce. */
export const HOURGLASS_LIFT_M = 4.6;
/** Strana obrázku hodin ve scéně (m). */
const HOURGLASS_M = 2.4;
const HOURGLASS_PX = 64;

/**
 * Praporek a hodiny ve scéně. `set` značky přepíše jen při změně a vrátí, jestli je co překreslit;
 * nic se samo nehýbe (žádné kreslení navíc).
 */
export class JourneyMarker {
  private pole: Mesh | null = null;
  private flag: Mesh | null = null;
  private glass: { mesh: Mesh; texture: RawTexture; days: number } | null = null;
  private marks: JourneyMarks = { goal: null, wait: null };

  constructor(
    private readonly scene: Scene,
    private readonly groundHeight: (x: number, z: number) => number,
  ) {}

  /** Nové značky; true – změnily se (překreslit). */
  set(marks: JourneyMarks): boolean {
    if (sameMarks(this.marks, marks)) return false;
    this.marks = marks;
    const goal = marks.goal;
    if (goal) {
      const { pole, flag } = this.ensureBanner();
      const y = this.groundHeight(goal.x, goal.z);
      pole.position.set(goal.x, y + BANNER_POLE_M / 2, goal.z);
      flag.position.set(goal.x, y + BANNER_POLE_M, goal.z);
    }
    this.pole?.setEnabled(goal !== null);
    this.flag?.setEnabled(goal !== null);
    const wait = marks.wait;
    if (wait) {
      const glass = this.ensureGlass(wait.days);
      glass.mesh.position.set(
        wait.pos.x,
        this.groundHeight(wait.pos.x, wait.pos.z) + HOURGLASS_LIFT_M,
        wait.pos.z,
      );
    }
    this.glass?.mesh.setEnabled(wait !== null);
    return true;
  }

  /** Co značky ukazují (e2e): praporek a počet dní na hodinách. */
  stats(): { banner: Pos | null; hourglass: number | null } {
    return {
      banner: this.marks.goal ? { ...this.marks.goal } : null,
      hourglass: this.marks.wait?.days ?? null,
    };
  }

  dispose(): void {
    for (const mesh of [this.pole, this.flag, this.glass?.mesh]) {
      mesh?.material?.dispose(true, true);
      mesh?.dispose();
    }
    this.glass?.texture.dispose();
  }

  private ensureBanner(): { pole: Mesh; flag: Mesh } {
    if (this.pole && this.flag) return { pole: this.pole, flag: this.flag };
    const pole = CreateBox(
      'journey-banner-pole',
      { width: 0.09, depth: 0.09, height: BANNER_POLE_M },
      this.scene,
    );
    pole.isPickable = false;
    pole.material = flatMaterial(this.scene, 'journey-banner-pole', new Color3(0.36, 0.25, 0.15));
    // praporek: trojúhelníkový cíp od tyče, rozkmit jen vzhledem (bez animace)
    const flag = new Mesh('journey-banner-flag', this.scene);
    const data = new VertexData();
    data.positions = [0, 0, 0, 1.15, -0.22, 0.08, 0, -0.7, 0];
    data.indices = [0, 1, 2];
    data.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
    data.applyToMesh(flag);
    flag.isPickable = false;
    const cloth = flatMaterial(this.scene, 'journey-banner-flag', new Color3(0.72, 0.12, 0.1));
    cloth.backFaceCulling = false;
    flag.material = cloth;
    this.pole = pole;
    this.flag = flag;
    return { pole, flag };
  }

  private ensureGlass(days: number): { mesh: Mesh; texture: RawTexture; days: number } {
    if (this.glass) {
      if (this.glass.days !== days) {
        this.glass.texture.update(hourglassPixels(days, HOURGLASS_PX));
        this.glass.days = days;
      }
      return this.glass;
    }
    const mesh = new Mesh('journey-hourglass', this.scene);
    const data = new VertexData();
    const h = HOURGLASS_M / 2;
    data.positions = [-h, -h, 0, h, -h, 0, h, h, 0, -h, h, 0];
    data.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    data.indices = [0, 1, 2, 0, 2, 3];
    data.applyToMesh(mesh);
    mesh.isPickable = false;
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    mesh.alphaIndex = 9;
    const texture = RawTexture.CreateRGBATexture(
      hourglassPixels(days, HOURGLASS_PX),
      HOURGLASS_PX,
      HOURGLASS_PX,
      this.scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.hasAlpha = true;
    texture.name = 'journey-hourglass';
    const material = new StandardMaterial('journey-hourglass-material', this.scene);
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.disableLighting = true;
    material.emissiveColor = Color3.White();
    material.backFaceCulling = false;
    // přes vše jako ikony rozkazů vojska
    material.depthFunction = Constants.ALWAYS;
    mesh.material = material;
    this.glass = { mesh, texture, days };
    return this.glass;
  }
}

function flatMaterial(scene: Scene, name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(`${name}-material`, scene);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(0.35);
  material.specularColor = Color3.Black();
  return material;
}

function sameMarks(a: JourneyMarks, b: JourneyMarks): boolean {
  const samePos = (p: Pos | null, q: Pos | null): boolean =>
    p === q || (p !== null && q !== null && p.x === q.x && p.z === q.z);
  return (
    samePos(a.goal, b.goal) &&
    (a.wait === b.wait ||
      (a.wait !== null &&
        b.wait !== null &&
        a.wait.days === b.wait.days &&
        samePos(a.wait.pos, b.wait.pos)))
  );
}
