// Obdélník hřbitůvku kostela ve světě (churches.md – Stavba) – pro kontrolu umístění kostela
// i ostatních staveb.

import { churchLocalToWorld, churchyardRect } from '../buildings/church-geometry';
import type { ChurchDims, ChurchType, Position } from '../types';
import { type Point } from './polygon';

/**
 * Obdélník v místních souřadnicích kostela (x = osa vstup → kněžiště, střed `cx`) ve světě –
 * stejné natočení jako `churchFootprintWorld`.
 */
export function churchLocalRect(
  position: Position,
  cx: number,
  length: number,
  width: number,
): Point[] {
  const at = (x: number, z: number): Point => {
    const p = churchLocalToWorld(position, x, z);
    return [p.x, p.z];
  };
  const x0 = cx - length / 2;
  const x1 = cx + length / 2;
  return [at(x0, -width / 2), at(x1, -width / 2), at(x1, width / 2), at(x0, width / 2)];
}

/** Obdélník hřbitůvku ve světě (4 rohy) – zabírá ho kostel i staveniště (pec v jeho pásu). */
export function churchyardWorld(type: ChurchType, dims: ChurchDims, position: Position): Point[] {
  const rect = churchyardRect(type, dims);
  return churchLocalRect(position, rect.offsetX, rect.length, rect.width);
}
