// Klát a rám s kůží u obydlí bez Babylonu (hides-honey.md – Ve scéně): klát stojí u boční stěny za
// okapem u zadního štítu česnem ven, rám s kůží u přední stěny vedle vchodu. Souřadnice Blenderu
// (x napříč, y podél hřebene, vchod v −y) se do modelu ve scéně převádějí jako u okolí obydlí.
import { PLAIN_FRAME, shapeX, shapeZ, type DwellingType, type ShapeFrame } from '@bohemia/game';
import { DWELLING_EAVES } from './dwelling-decor';
import { chickenBox } from './livestock-placement';
import { localToWorld } from './village-layout';

export interface WarePlacement {
  x: number;
  z: number;
  rotationY: number;
}

/** Klát stojí tolik (m) za kapkovou linií okapu. */
const HIVE_BEHIND_EAVE_M = 0.8;
/** Klát je tolik (m) před zadním koncem střechy (podél hřebene). */
const HIVE_FROM_BACK_M = 0.6;
/** Rám je tolik (m) před přední stěnou (od `frontY`) a tolik (m) od okapu dovnitř. */
const FRAME_BEFORE_FRONT_M = 1.5;
const FRAME_FROM_EAVE_M = 0.6;
/** Mimo pás slepic (`chickenBox`) o tolik (m): klát za jeho zadním okrajem, rám za předním. */
const HIVE_CLEAR_M = 0.5;

/**
 * Klát u obydlí: bod modelu (−eaveX − 0,8, zadní štít), česno míří ven z domu, tedy do −x modelu.
 * Překrýval-li by pás slepic (`chickenBox`), posune se za jeho zadní okraj.
 */
export function hivePlacement(
  type: DwellingType,
  frame: ShapeFrame = PLAIN_FRAME,
  position: { x: number; z: number; rotation: number } = { x: 0, z: 0, rotation: 0 },
): WarePlacement {
  const { eaveX, eaveHalf } = DWELLING_EAVES[type];
  const box = chickenBox(type, frame);
  const lx = shapeX(frame, -(eaveX + HIVE_BEHIND_EAVE_M));
  let lz = shapeZ(frame, -(eaveHalf - HIVE_FROM_BACK_M));
  if (Math.abs(lx) < box.halfX + 0.3 && lz > box.minZ - HIVE_CLEAR_M) {
    lz = box.minZ - HIVE_CLEAR_M;
  }
  return place(position, lx, lz, -Math.PI / 2);
}

/** Rám s kůží: u přední stěny vedle vchodu (`frontY − 1,5 m`, `x = eaveX − 0,6`), rovnoběžně s ní. */
export function hideFramePlacement(
  type: DwellingType,
  frame: ShapeFrame = PLAIN_FRAME,
  position: { x: number; z: number; rotation: number } = { x: 0, z: 0, rotation: 0 },
): WarePlacement {
  const { eaveX, frontY } = DWELLING_EAVES[type];
  const lx = shapeX(frame, -(eaveX - FRAME_FROM_EAVE_M));
  // šíje před vchodem a pás slepic (`chickenBox`) zůstanou volné – rám za nimi
  const lz = Math.max(
    shapeZ(frame, -(frontY - FRAME_BEFORE_FRONT_M)),
    chickenBox(type, frame).maxZ + HIVE_CLEAR_M,
  );
  return place(position, lx, lz, 0);
}

/** Bod modelu (lx, lz) už po změně tvaru → svět; `turn` je natočení proti obydlí (česno −x = −π/2). */
function place(
  position: { x: number; z: number; rotation: number },
  lx: number,
  lz: number,
  turn: number,
): WarePlacement {
  const [x, z] = localToWorld(position, lx, lz);
  return { x, z, rotationY: position.rotation + turn };
}

/**
 * Která obydlí dnes mají před domem rám s kůží: z obývaných (podle id) od indexu `day mod n`
 * dokola `min(n, frames)` obydlí – rámy se tak střídají a stejné vstupy dají stejný výsledek.
 */
export function hideFrameDwellings(
  dwellings: readonly { id: number; inhabited?: boolean }[],
  frames: number,
  day: number,
): number[] {
  const ids = dwellings
    .filter((d) => d.inhabited !== false)
    .map((d) => d.id)
    .sort((a, b) => a - b);
  const n = ids.length;
  if (n === 0 || frames <= 0) return [];
  const start = ((day % n) + n) % n;
  return Array.from({ length: Math.min(n, frames) }, (_, i) => ids[(start + i) % n]!);
}
