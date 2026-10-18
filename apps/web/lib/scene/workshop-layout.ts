// Řemeslné dílny ve scéně bez Babylonu (docs/design/crafts.md): který model dílna má, kde stojí
// milíř uhlíře, odkud stoupá dým z pece, výhně a milíře a kde v dílně stojí řemeslníci. Souřadnice
// modelu jako `localToWorld` (x napříč, z k vchodu); modely z tools/blender/crafts.py (tam
// Blender: x napříč, y podél hřebene s vchodem v −y – ve scéně x → −x, y → −z).
import { MILIR, milirPosition, type Craft, type Position } from '@bohemia/game';
import type { CraftKind } from './village-construction';
import { localToWorld, type HideShape, type Point } from './village-layout';

/** Model dílny podle řemesla – public/models/crafts/<model>.glb a díly staveniště „<model>-…“. */
export type WorkshopModel = Exclude<CraftKind, 'milir'>;
export const CRAFT_MODEL: Readonly<Record<Craft, WorkshopModel>> = {
  potter: 'hrncir',
  smith: 'kovar',
  burner: 'uhlir',
};

/** Přední okraj přístřešku hrnčíře a kováře (m od středu, crafts.py PZ_O + PORCH). */
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
 * Dým pracující dílny: hrnčířská pec a výheň stojí pod přístřeškem – dým vychází zpod jeho
 * předního okraje (pec v crafts.py na (0,72; −4,55), výheň na (0,85; −4,75)); uhlíř topí jen
 * v milíři – dým z komína navrchu kupy.
 */
export function workshopVents(craft: Craft, position: Position): WorkshopVent[] {
  if (craft === 'burner') {
    const c = milirPlace(position);
    return [{ kind: 'milir', x: c.x, z: c.z, y: MILIR_SHAPE_M.height + 0.1 }];
  }
  const lx = craft === 'potter' ? -0.72 : -0.85;
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
 * Místa řemeslníků (Martin: řemeslník pracuje v dílně) – hrnčíř u kruhu, u topeniště pece a u
 * police, kovář u kovadliny, u měchů a u koryta (souřadnice z crafts.py), uhlíř kolem milíře
 * s hrabicí. Postavy se střídají po místech dokola.
 */
export function craftSpots(craft: Craft, position: Position): CraftSpot[] {
  if (craft === 'burner') {
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
  // [x, z, směr x, směr z, klip] v souřadnicích modelu
  const local: [number, number, number, number, CraftSpot['clip']][] =
    craft === 'potter'
      ? [
          [0.55, 5.05, 0, -1, 'weed'], // u hrnčířského kruhu (0,55; 4,45)
          [-0.72, 5.95, 0, -1, 'build'], // u topeniště pece
          [1.85, 4.3, -1, 0, 'idle'], // u police se sušícími se hrnci
          [-1.9, 5.3, 1, 0, 'build'],
        ]
      : [
          [0.35, 5.3, 0, -1, 'build'], // u kovadliny (0,35; 4,7)
          [-1.75, 3.8, 1, 0, 'weed'], // u měchů za výhní
          [1.75, 5.2, -1, 0, 'idle'], // u koryta s vodou
          [-0.85, 5.95, 0, -1, 'build'],
        ];
  const c = Math.cos(position.rotation);
  const s = Math.sin(position.rotation);
  return local.map(([lx, lz, dx, dz, clip]) => {
    const [x, z] = localToWorld(position, lx, lz);
    return { x, z, hx: dx * c + dz * s, hz: -dx * s + dz * c, clip };
  });
}
