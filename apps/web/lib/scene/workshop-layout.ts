// Řemeslné dílny ve scéně bez Babylonu (docs/design/crafts.md): který model dílna má, kde stojí
// milíř uhlíře, odkud stoupá dým z pece, výhně a milíře a kde v dílně stojí řemeslníci. Souřadnice
// modelu jako `localToWorld` (x napříč, z k vchodu); modely z tools/blender/crafts.py (tam
// Blender: x napříč, y podél hřebene s vchodem v −y – ve scéně x → −x, y → −z).
import { MILIR, milirPosition, type Craft, type Position } from '@bohemia/game';
import type { CraftKind } from './village-construction';
import { localToWorld, type HideShape, type Point } from './village-layout';

/**
 * Model dílny podle řemesla – public/models/crafts/<model>.glb a díly staveniště „<model>-…“.
 * Tesař (`tesar`, wagons.md) – model, díly staveniště, místa řemeslníků a fáze stavby.
 */
export type WorkshopModel = Exclude<CraftKind, 'milir'>;
export const CRAFT_MODEL: Readonly<Record<Craft, WorkshopModel>> = {
  potter: 'hrncir',
  smith: 'kovar',
  burner: 'uhlir',
  carpenter: 'tesar',
};

/** Dílny na polozemnici s přístřeškem před domem (crafts.py – build_porch_house). */
export const PORCH_WORKSHOPS: readonly WorkshopModel[] = ['hrncir', 'kovar', 'tesar'];

/** Má model (druh stavby) přístřešek před domem? Ušlapaná tráva sahá i pod něj. */
export function hasPorch(kind: string): boolean {
  return (PORCH_WORKSHOPS as readonly string[]).includes(kind);
}

/** Přední okraj přístřešku hrnčíře, kováře a tesaře (m od středu, crafts.py PZ_O + PORCH). */
export const PORCH_FRONT_M = 2.1 + 3.6;
/** Kupa milíře (crafts.py MILIR_R, MILIR_H) – poloměr a výška nad patou (m). */
export const MILIR_SHAPE_M = { radius: 2.3, height: 2.15 } as const;

/** Poloha milíře uhlíře u zemnice (střed a natočení zemnice) – herní jádro, MILIR.offset. */
export function milirPlace(position: Position): Position {
  return milirPosition(position);
}

/**
 * Milíř v lese (crafts.md – Uhlíř): „poloha zemnice“, ke které by milíř se středem `center` patřil
 * (natočení 0) – funkce milíře (`milirPlace`, `milirCircle`, `craftSpots`, `workshopVents`…)
 * s ní kreslí a rozestavují lesní milíř stejně jako milíř u dílny.
 */
export function forestKilnAnchor(center: { x: number; z: number }): Position {
  return { x: center.x - MILIR.offset.x, z: center.z - MILIR.offset.z, rotation: 0 };
}

/**
 * Body na obvodu milíře pro patu modelu (střed a čtyři body na okraji kupy) – milíř stojí na
 * terénu, na svahu se zapustí do nejnižšího místa.
 */
export function milirFootPoints(position: Position): Point[] {
  const c = milirPlace(position);
  const r = MILIR_SHAPE_M.radius;
  return [
    [c.x, c.z],
    [c.x + r, c.z],
    [c.x - r, c.z],
    [c.x, c.z + r],
    [c.x, c.z - r],
  ];
}

/** Kruh kolem milíře (vyklizený a ušlapaný – MILIR.clearingRadiusM) jako oblast pro skrytí. */
export function milirHideShape(
  position: Position,
  radius: number = MILIR.clearingRadiusM,
): HideShape {
  const c = milirPlace(position);
  return {
    bounds: { minX: c.x - radius, maxX: c.x + radius, minZ: c.z - radius, maxZ: c.z + radius },
    contains: (x, z) => Math.hypot(x - c.x, z - c.z) <= radius,
  };
}

/** Kruh se středem v milíři (body po obvodu ve světě) – vytyčení a ušlapaná tráva. */
export function milirCircle(position: Position, radius: number): Point[] {
  const c = milirPlace(position);
  const n = Math.max(24, Math.round(radius * 6));
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [c.x + radius * Math.cos(a), c.z + radius * Math.sin(a)];
  });
}

/** Odkud stoupá dým dílny: pec nebo výheň (`craft`), nebo komín milíře (`milir`). */
export interface WorkshopVent {
  kind: 'craft' | 'milir';
  x: number;
  z: number;
  /** Výška nad patou modelu (dílny, nebo milíře). */
  y: number;
}

/**
 * Kde pod přístřeškem dílny je oheň (x napříč v souřadnicích modelu): hrnčířská pec v crafts.py
 * na (0,72; −4,55), výheň na (0,85; −4,75); tesař oheň nemá.
 */
const PORCH_FIRE_X: Record<Exclude<WorkshopModel, 'uhlir'>, number | null> = {
  hrncir: -0.72,
  kovar: -0.85,
  tesar: null,
};

/**
 * Dým pracující dílny: hrnčířská pec a výheň stojí pod přístřeškem – dým vychází zpod jeho
 * předního okraje; uhlíř topí jen v milíři – dým z komína navrchu kupy; tesař nekouří.
 */
export function workshopVents(craft: Craft, position: Position): WorkshopVent[] {
  return modelVents(CRAFT_MODEL[craft], position);
}

/** Dým dílny podle modelu (`workshopVents` – i pro dílnu, jejíž řemeslo jádro ještě nezná). */
export function modelVents(model: WorkshopModel, position: Position): WorkshopVent[] {
  if (model === 'uhlir') {
    const c = milirPlace(position);
    return [{ kind: 'milir', x: c.x, z: c.z, y: MILIR_SHAPE_M.height + 0.1 }];
  }
  const lx = PORCH_FIRE_X[model];
  if (lx === null) return [];
  const [x, z] = localToWorld(position, lx, PORCH_FRONT_M + 0.2);
  return [{ kind: 'craft', x, z, y: 1.3 }];
}

/** Kde v dílně stojí řemeslník: místo (svět), směr pohledu a práce (klip postavy). */
export interface CraftSpot {
  x: number;
  z: number;
  /** Směr pohledu (jednotkový, svět). */
  hx: number;
  hz: number;
  clip: 'build' | 'weed' | 'idle';
}

/**
 * Místa řemeslníků pod přístřeškem: [x, z, směr x, směr z, klip] v souřadnicích modelu
 * (souřadnice z crafts.py: x → −x, y → −z).
 */
const PORCH_SPOTS: Record<
  Exclude<WorkshopModel, 'uhlir'>,
  readonly (readonly [number, number, number, number, CraftSpot['clip']])[]
> = {
  hrncir: [
    [0.55, 5.05, 0, -1, 'weed'], // u hrnčířského kruhu (0,55; 4,45)
    [-0.72, 5.95, 0, -1, 'build'], // u topeniště pece
    [1.85, 4.3, -1, 0, 'idle'], // u police se sušícími se hrnci
    [-1.9, 5.3, 1, 0, 'build'],
  ],
  kovar: [
    [0.35, 5.3, 0, -1, 'build'], // u kovadliny (0,35; 4,7)
    [-1.75, 3.8, 1, 0, 'weed'], // u měchů za výhní
    [1.75, 5.2, -1, 0, 'idle'], // u koryta s vodou
    [-0.85, 5.95, 0, -1, 'build'],
  ],
  tesar: [
    [0.25, 3.9, 1, 0, 'build'], // u otesávaného trámu na kozlících (0,85; 2,6–5,5)
    [-0.55, 5.1, 0, -1, 'weed'], // u rozdělaného kola na špalcích (−0,55; 4,25)
    [1.5, 5.9, 0, -1, 'build'], // u špalku se sekerou (1,5; 5,25)
    [-1.3, 3.4, -1, 0, 'idle'], // u zásoby trámů pod okapem
  ],
};

/**
 * Místa řemeslníků (Martin: řemeslník pracuje v dílně) – hrnčíř u kruhu, u topeniště pece a u
 * police, kovář u kovadliny, u měchů a u koryta, tesař u trámu na kozlících, u rozdělaného kola,
 * u špalku a u zásoby trámů (PORCH_SPOTS), uhlíř kolem milíře s hrabicí. Postavy se střídají po
 * místech dokola.
 */
export function craftSpots(craft: Craft, position: Position): CraftSpot[] {
  return modelSpots(CRAFT_MODEL[craft], position);
}

/** Místa řemeslníků podle modelu dílny (`craftSpots` – i pro tesaře před řemeslem v jádru). */
export function modelSpots(model: WorkshopModel, position: Position): CraftSpot[] {
  if (model === 'uhlir') {
    const c = milirPlace(position);
    const r = MILIR_SHAPE_M.radius + 0.9;
    return [0.3, 2.4, 4.5, 1.35, 3.45, 5.55].map((a) => ({
      x: c.x + Math.cos(a) * r,
      z: c.z + Math.sin(a) * r,
      hx: -Math.cos(a),
      hz: -Math.sin(a),
      clip: 'build' as const,
    }));
  }
  const local = PORCH_SPOTS[model];
  const c = Math.cos(position.rotation);
  const s = Math.sin(position.rotation);
  return local.map(([lx, lz, dx, dz, clip]) => {
    const [x, z] = localToWorld(position, lx, lz);
    return { x, z, hx: dx * c + dz * s, hz: -dx * s + dz * c, clip };
  });
}
