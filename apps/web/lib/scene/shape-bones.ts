// Varianty rozměrů obydlí v modelu bez Babylonu (population.md – Varianty rozměrů): zobrazení
// tvaru z jádra (`shapeX`, `shapeY`, `shapeZ`) je po kouscích afinní – napříč tři pásy (vlevo od
// dveří, dveře, vpravo), podél dva (dům, šíje s tím, co je před ní), svisle dva (pod terénem, nad
// ním). Každý vrchol modelu patří do jedné z 12 oblastí a dostane její „kost“ – matici, kterou
// shader instance použije (shaped-model.ts, Babylon VAT). Vrchol se tak zobrazí přesně jako
// `shapeX/Y/Z` a dveře, schody ani šíje se nenatahují.
import {
  DWELLING_SHAPE,
  shapeXPieces,
  shapeYPieces,
  shapeZPieces,
  type DwellingType,
  type ShapeFrame,
} from '@bohemia/game';

/** Počet oblastí (kostí) zobrazení: 3 napříč × 2 podél × 2 svisle. */
export const SHAPE_BONES = 12;
/** Čísel na jednu variantu (snímek VAT): 12 matic 4 × 4. */
export const SHAPE_FRAME_FLOATS = SHAPE_BONES * 16;

/**
 * Oblast vrcholu (x napříč, y nahoru od paty, z k vchodu) modelu stavby druhu `type`: napříč podle
 * pásu dveří (DWELLING_SHAPE.doorHalfM), podél podle začátku šíje (frontM), svisle podle terénu.
 */
export function shapeRegion(type: DwellingType, x: number, y: number, z: number): number {
  const door = DWELLING_SHAPE.doorHalfM;
  const ix = x < -door ? 0 : x > door ? 2 : 1;
  const iz = z < DWELLING_SHAPE.frontM[type] ? 0 : 1;
  const iy = y < 0 ? 0 : 1;
  return ix + 3 * iz + 6 * iy;
}

/**
 * Matice oblastí pro zobrazení `frame` (rozložení jako `Matrix.m` Babylonu: měřítko na
 * úhlopříčce, posun v m[12..14]) do `out` od `offset`.
 */
export function shapeBoneMatrices(frame: ShapeFrame, out: Float32Array, offset = 0): void {
  const xs = shapeXPieces(frame);
  const zs = shapeZPieces(frame);
  const ys = shapeYPieces(frame);
  for (let bone = 0; bone < SHAPE_BONES; bone++) {
    const px = xs[bone % 3]!;
    const pz = zs[Math.floor(bone / 3) % 2]!;
    const py = ys[Math.floor(bone / 6)]!;
    const m = offset + bone * 16;
    out.fill(0, m, m + 16);
    out[m] = px.scale;
    out[m + 5] = py.scale;
    out[m + 10] = pz.scale;
    out[m + 12] = px.offset;
    out[m + 13] = py.offset;
    out[m + 14] = pz.offset;
    out[m + 15] = 1;
  }
}

/** Klíč zobrazení – instance se stejnou variantou sdílejí snímek VAT. */
export function shapeFrameKey(frame: ShapeFrame): string {
  return `${frame.door}|${frame.kx}|${frame.front}|${frame.sz}|${frame.sy}`;
}
