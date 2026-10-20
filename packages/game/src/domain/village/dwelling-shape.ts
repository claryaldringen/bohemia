// Varianty rozměrů obydlí a dílen (population.md – Varianty rozměrů; Martin, GitHub #1): každá
// stavba má svou plochu, poměr stěn a výšku – nejvýš ±10 % proti dnešnímu tvaru. Varianta je čistá
// funkce polohy stavby (souřadnice na cm), takže ji spočítá server i prohlížeč stejně a jde znát už
// u kurzoru, kdy stavba ještě nemá id. Jen přesně zaokrouhlované operace (celočíselný hash, + − × ÷
// a odmocnina) – soubor je v deterministické vrstvě (ESLint).
//
// Tvar se mění jedním zobrazením souřadnic modelu (x napříč, y nahoru od terénu, z k vchodu):
// - napříč: pás dveří |x| ≤ doorHalfM zůstává, stěny za ním se natáhnou (`kx`) – šířka půdorysu
//   je pak přesně `sx` × dnešní;
// - podél: dům až po začátek vstupní šíje (`front`) se škáluje `sz`, šíje se schody a vše před ní
//   se jen posune se štítem – šíje se nenatahuje;
// - svisle: nad terénem × výška, jáma pod terénem zůstává (hloubka i schody).
// Bez varianty (`PLAIN_SHAPE`) je zobrazení přesně identita – bit po bitu jako dřív.
import { DWELLING_FOOTPRINT_M, DWELLING_SHAPE } from './rules';
import type { DwellingType, PlotVariant } from './types';

/** Varianta rozměrů – násobky proti dnešnímu tvaru (každý 0,9–1,1). */
export interface DwellingShape {
  /** Plocha půdorysu. */
  area: number;
  /** Poměr stěn – délka (podél hřebene, z) : šířka (x) proti dnešnímu poměru. */
  ratio: number;
  /** Výška stěn a střechy nad terénem. */
  height: number;
}

/** Dnešní tvar – bez odchylek (dvorec, stavby zmenšené kvůli sousední stavbě). */
export const PLAIN_SHAPE: DwellingShape = Object.freeze({ area: 1, ratio: 1, height: 1 });

/** Co určuje variantu stavby: druh, poloha, u polozemnice varianta pozemku, příznak dnešního tvaru. */
export interface ShapedDwelling {
  readonly type: DwellingType;
  readonly position: { readonly x: number; readonly z: number };
  /** Pozemek – kde na něm dům stojí (bez údaje jako uprostřed). */
  readonly plot?: { readonly variant?: PlotVariant };
  /**
   * Dnešní tvar bez odchylek – stavba ve vsi uložené před variantami, které by větší varianta
   * zasáhla jinou stavbu (`withDwellingShapes`).
   */
  readonly plainShape?: boolean;
}

/** Celočíselný hash souřadnic na cm (32 bitů) → 0–1. */
function unit(xCm: number, zCm: number, salt: number): number {
  let h = Math.imul(xCm | 0, 0x27d4eb2d) ^ Math.imul(zCm | 0, 0x165667b1);
  h = Math.imul(h ^ Math.imul(salt, 0x9e3779b9), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x2c1b3c6d);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Odchylka ±spread z hashe, na promile (stejný tvar i po převodu JSON). */
function deviation(xCm: number, zCm: number, salt: number): number {
  const spread = DWELLING_SHAPE.spread;
  return 1 + Math.round((2 * unit(xCm, zCm, salt) - 1) * spread * 1000) / 1000;
}

/**
 * Varianta stavby na místě (x, z) – jen z polohy na cm: stejné místo dá vždy stejný tvar (i po
 * přestavbě – rodina staví znovu dům, jaký tu stál, a dům se vejde, kam se vešel).
 */
export function dwellingShapeAt(x: number, z: number): DwellingShape {
  const xCm = Math.round(x * 100);
  const zCm = Math.round(z * 100);
  return {
    area: deviation(xCm, zCm, 1),
    ratio: deviation(xCm, zCm, 2),
    height: deviation(xCm, zCm, 3),
  };
}

/** Škála šířky (x) a délky (z) půdorysu z plochy a poměru stěn. */
export function shapeScales(shape: DwellingShape): { sx: number; sz: number } {
  if (shape.area === 1 && shape.ratio === 1) return { sx: 1, sz: 1 };
  return { sx: Math.sqrt(shape.area / shape.ratio), sz: Math.sqrt(shape.area * shape.ratio) };
}

/**
 * Varianta stavby: dvorec a stavby s příznakem dnešního tvaru žádnou nemají. Dům v rohu pozemku
 * se smí rozšířit nejvýš o DWELLING_SHAPE.plotCornerMaxWidth – větší plocha se mu zmenší, ať
 * zůstane uvnitř plotu (poměr stěn a výška zůstanou).
 */
export function dwellingShape(d: ShapedDwelling): DwellingShape {
  if (d.type === 'dvorec' || d.plainShape) return PLAIN_SHAPE;
  const shape = dwellingShapeAt(d.position.x, d.position.z);
  if (!d.plot?.variant || d.plot.variant === 'center') return shape;
  const max = DWELLING_SHAPE.plotCornerMaxWidth;
  const area = Math.min(shape.area, max * max * shape.ratio);
  return area === shape.area ? shape : { ...shape, area: Math.round(area * 1000) / 1000 };
}

/** Je to dnešní tvar (bez odchylek)? */
export function isPlainShape(shape: DwellingShape): boolean {
  return shape.area === 1 && shape.ratio === 1 && shape.height === 1;
}

/**
 * Zobrazení souřadnic modelu stavby podle varianty: napříč pás dveří `door` zůstává a za ním
 * x' = ±door + kx · (|x| − door), podél do `front` × sz a dál jen posun, nad terénem × sy.
 */
export interface ShapeFrame {
  door: number;
  kx: number;
  front: number;
  sz: number;
  sy: number;
}

/** Zobrazení bez změny – dnešní tvar. */
export const PLAIN_FRAME: ShapeFrame = Object.freeze({ door: 0, kx: 1, front: 0, sz: 1, sy: 1 });

/** Zobrazení varianty `shape` stavby druhu `type` – šířka půdorysu vyjde přesně sx × dnešní. */
export function shapeFrame(type: DwellingType, shape: DwellingShape): ShapeFrame {
  if (isPlainShape(shape)) return PLAIN_FRAME;
  const { sx, sz } = shapeScales(shape);
  const door = DWELLING_SHAPE.doorHalfM;
  const half = DWELLING_FOOTPRINT_M[type].width / 2;
  return {
    door,
    kx: (sx * half - door) / (half - door),
    front: DWELLING_SHAPE.frontM[type],
    sz,
    sy: shape.height,
  };
}

/** Zobrazení stavby `d` (varianta podle polohy, pozemku a příznaku). */
export function dwellingFrame(d: ShapedDwelling): ShapeFrame {
  return shapeFrame(d.type, dwellingShape(d));
}

/** Souřadnice modelu napříč (x) po změně tvaru. */
export function shapeX(frame: ShapeFrame, x: number): number {
  if (frame.kx === 1) return x;
  const door = frame.door;
  const inside = x < -door ? -door : x > door ? door : x;
  return x + (frame.kx - 1) * (x - inside);
}

/** Souřadnice modelu podél (z, k vchodu) po změně tvaru. */
export function shapeZ(frame: ShapeFrame, z: number): number {
  if (frame.sz === 1) return z;
  return z + (frame.sz - 1) * (z < frame.front ? z : frame.front);
}

/** Výška v modelu (y nad patou) po změně tvaru – pod terénem beze změny. */
export function shapeY(frame: ShapeFrame, y: number): number {
  if (frame.sy === 1 || y <= 0) return y;
  return y * frame.sy;
}

/** Obdélník v souřadnicích modelu (x napříč, z k vchodu). */
export interface ShapeRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Obdélník modelu po změně tvaru (zobrazení je po osách rostoucí – obdélník zůstane obdélníkem). */
export function shapeRect<R extends ShapeRect>(frame: ShapeFrame, rect: R): R {
  if (frame === PLAIN_FRAME) return rect;
  return {
    ...rect,
    minX: shapeX(frame, rect.minX),
    maxX: shapeX(frame, rect.maxX),
    minZ: shapeZ(frame, rect.minZ),
    maxZ: shapeZ(frame, rect.maxZ),
  };
}

/**
 * Půdorys obydlí v souřadnicích domu po změně tvaru (population.md – Varianty rozměrů): šířka,
 * délka a posun středu k vchodu (`centerZ` – šíje se nenatahuje, střed se může posunout).
 */
export function shapedFootprint(
  type: DwellingType,
  shape: DwellingShape,
  porchM = 0,
): { width: number; depth: number; centerZ: number } {
  const { width, depth } = DWELLING_FOOTPRINT_M[type];
  const frame = shapeFrame(type, shape);
  if (frame === PLAIN_FRAME) return { width, depth: depth + porchM, centerZ: porchM / 2 };
  const r = shapeRect(frame, {
    minX: -width / 2,
    maxX: width / 2,
    minZ: -depth / 2,
    maxZ: depth / 2 + porchM,
  });
  return { width: r.maxX - r.minX, depth: r.maxZ - r.minZ, centerZ: (r.minZ + r.maxZ) / 2 };
}

/**
 * Úsek osy, na kterém se zobrazení chová jako jedno afinní – pro kreslení modelu po kouscích
 * (kosti instancí ve scéně): na úseku `index` je x' = scale · x + offset.
 */
export interface AxisPiece {
  scale: number;
  offset: number;
}

/** Tři úseky napříč: vlevo od dveří, pás dveří, vpravo od dveří (podle x < −door, x > door). */
export function shapeXPieces(frame: ShapeFrame): readonly [AxisPiece, AxisPiece, AxisPiece] {
  const k = frame.kx;
  const d = frame.door;
  return [
    { scale: k, offset: (k - 1) * d },
    { scale: 1, offset: 0 },
    { scale: k, offset: -(k - 1) * d },
  ];
}

/** Dva úseky podél: dům (z < front) a šíje s tím, co je před ní. */
export function shapeZPieces(frame: ShapeFrame): readonly [AxisPiece, AxisPiece] {
  return [
    { scale: frame.sz, offset: 0 },
    { scale: 1, offset: (frame.sz - 1) * frame.front },
  ];
}

/** Dva úseky svisle: pod terénem a nad ním. */
export function shapeYPieces(frame: ShapeFrame): readonly [AxisPiece, AxisPiece] {
  return [
    { scale: 1, offset: 0 },
    { scale: frame.sy, offset: 0 },
  ];
}
