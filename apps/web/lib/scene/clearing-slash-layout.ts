// Hromady větví na pasece a ohořelé zbytky na spálenině (forest.md – Klučení lesa pro pole –
// postup) bez Babylonu: kde na čtverci leží a které jsou v které fázi vidět. Místa jsou
// deterministická z id dílu (hash01) – v každé fázi stejná, hromada větví na místě shoří a zbyde
// po ní ohořelý zbytek.
import { obstaclesNear, rotationCosSin, type ObstacleLayer } from '@bohemia/game';
import type { SceneFieldPart, SceneVillage } from '../village-view';
import { isRotatedSquare, rowDirection } from './field-cells';
import { villageCenter, workAt, workFrame, workSteps } from './field-look';
import { hash01 } from './smoke-schedule';
import type { Point } from './village-layout';

/** Hromad větví na čtverec – nejméně a nejvíc (návrh Clauda). */
export const SLASH_HEAPS_MIN = 2;
export const SLASH_HEAPS_MAX = 4;
/** Tři velikosti hromad – násobek sítě (malá, střední, velká). */
export const SLASH_HEAP_SCALES = [0.75, 1, 1.25] as const;
/** Odstup středu hromady od okraje čtverce (m) – hromada nepřečnívá na sousední čtverec. */
export const SLASH_EDGE_MARGIN_M = 2.4;
/** Nejmenší odstup středu hromady od pařezu či jiné překážky čtverce (m). */
export const STUMP_CLEAR_M = 1.3;
/** Nejmenší odstup středů dvou hromad (m). */
export const HEAP_GAP_M = 3.5;
/** Pokusů o místo na jednu hromadu – bez volného místa hromada na čtverci chybí. */
const TRIES = 12;

/** Hromada větví (`slash`), nebo ohořelý zbytek po ní (`char`). */
export type ClearingHeapKind = 'slash' | 'char';

/** Místo hromady na čtverci: střed ve světě, natočení kolem svislé osy a velikost. */
export interface HeapSite {
  x: number;
  z: number;
  yaw: number;
  scale: number;
}

export interface ClearingHeap extends HeapSite {
  kind: ClearingHeapKind;
}

type HeapSquare = Pick<SceneFieldPart, 'id' | 'cell' | 'x' | 'z' | 'size' | 'rotation'>;

/** Číslo čtverce pro hash – id dílu, bez něj políčko. */
function squareSeed(part: HeapSquare): number {
  return part.id ?? part.cell.x * 65_536 + part.cell.y;
}

/**
 * Místa hromad větví na čtverci: 2–4 podle id dílu, každá na prvním z TRIES míst uvnitř čtverce
 * (SLASH_EDGE_MARGIN_M od okraje), které je aspoň STUMP_CLEAR_M od všech překážek `avoid`
 * (pařezy a stromy čtverce – podle vrstvy překážek, ne podle toho, co už padlo, aby místa
 * v průběhu kácení neskákala) a HEAP_GAP_M od ostatních hromad. Stejný díl, stejná místa.
 */
export function slashHeapSites(part: HeapSquare, avoid: readonly Point[]): HeapSite[] {
  const seed = squareSeed(part);
  const count =
    SLASH_HEAPS_MIN + Math.floor(hash01(seed, 0, 11) * (SLASH_HEAPS_MAX - SLASH_HEAPS_MIN + 1));
  const reach = Math.max(0, part.size / 2 - SLASH_EDGE_MARGIN_M);
  const [c, s] = isRotatedSquare(part) ? rotationCosSin(part.rotation!) : [1, 0];
  const sites: HeapSite[] = [];
  for (let k = 0; k < count; k++) {
    for (let t = 0; t < TRIES; t++) {
      // místní osy čtverce (jako squareContains) → svět
      const u = (hash01(seed, k * TRIES + t, 12) * 2 - 1) * reach;
      const v = (hash01(seed, k * TRIES + t, 13) * 2 - 1) * reach;
      const x = part.x + u * c + v * s;
      const z = part.z - u * s + v * c;
      if (avoid.some(([ax, az]) => Math.hypot(ax - x, az - z) < STUMP_CLEAR_M)) continue;
      if (sites.some((o) => Math.hypot(o.x - x, o.z - z) < HEAP_GAP_M)) continue;
      const size = Math.min(2, Math.floor(hash01(seed, k, 14) * 3));
      sites.push({ x, z, yaw: hash01(seed, k, 15) * Math.PI * 2, scale: SLASH_HEAP_SCALES[size]! });
      break;
    }
  }
  return sites;
}

/**
 * Překážky čtverce z vrstvy (pařezy, stromy, kameny – i ty, které už padly, aby místa hromad
 * v průběhu kácení neskákala): `avoid` pro slashHeapSites. Hromady (clearing-slash.ts), ohně
 * (clearing-fire.ts) i lidé u ohňů (villager-plan-fields.ts) je hledají stejně.
 */
export function squareObstacles(
  layer: ObstacleLayer,
  part: Pick<SceneFieldPart, 'x' | 'z' | 'size'>,
): Point[] {
  const h = part.size * 0.71;
  return obstaclesNear(layer, part.x - h, part.z - h, part.x + h, part.z + h).map((i): Point => [
    layer.x[i]!,
    layer.z[i]!,
  ]);
}

/** Vzhledy, na kterých leží hromady: paseka (větve) a spálenina (ohořelé zbytky). */
function heapKindOf(look: SceneFieldPart['look']): ClearingHeapKind | null {
  return look === 'slash' ? 'slash' : look === 'burnt' ? 'char' : null;
}

/** Díl, na kterém je aspoň kus paseky nebo spáleniny. */
export function hasClearingLook(part: Pick<SceneFieldPart, 'look' | 'before'>): boolean {
  return heapKindOf(part.look) !== null || heapKindOf(part.before) !== null;
}

/**
 * Hromady na dílech pole podle vzhledu povrchu pod nimi (fieldPartLooks v jádru): na pasece
 * hromada větví, na spálenině ohořelý zbytek, jinde nic. Rozpracovaný díl (`work`) má hotovou
 * část (`look`) a zbytek (`before`) po pruzích jako obtisk pole – kácení: větve jen tam, kde už
 * stromy padly; pálení: spálená část ohořelé zbytky, zbytek ještě větve; první práce na
 * spálenině (kopání, setí): ohořelé zbytky jen na nezpracované části. `avoidOf` – překážky
 * čtverce (pařezy a stromy).
 */
export function clearingHeaps(
  village: Pick<SceneVillage, 'fields' | 'dwellings'>,
  avoidOf: (part: SceneFieldPart) => readonly Point[],
): ClearingHeap[] {
  const heaps: ClearingHeap[] = [];
  for (const field of village.fields) {
    const parts = field.parts.filter(hasClearingLook);
    if (parts.length === 0) continue;
    const rows = rowDirection(field.parts);
    const center = villageCenter(village, field.parts);
    for (const part of parts) {
      const frame = workFrame(part, rows, center);
      const done = part.work === undefined ? 1 : workSteps(part.work);
      for (const site of slashHeapSites(part, avoidOf(part))) {
        const look =
          part.work === undefined || workAt(frame, part, site.x, site.z) < done
            ? part.look
            : part.before;
        const kind = heapKindOf(look);
        if (kind) heaps.push({ ...site, kind });
      }
    }
  }
  return heaps;
}

/**
 * Klíč hromad: díly s pasekou či spáleninou, jejich vzhled a hotové pruhy, směr řádků (počet
 * dílů pole) a střed vsi (obydlí) – beze změny klíče se hromady nepřestaví.
 */
export function clearingHeapsKey(village: Pick<SceneVillage, 'fields' | 'dwellings'>): string {
  const parts: string[] = [];
  for (const field of village.fields) {
    const key = field.parts
      .filter(hasClearingLook)
      .map(
        (p) =>
          `${p.id ?? ''}:${p.cell.x},${p.cell.y}:${p.look ?? ''}:${p.before ?? ''}:${
            p.work === undefined ? '' : workSteps(p.work)
          }`,
      )
      .join(';');
    if (key) parts.push(`${field.id}/${field.parts.length}/${key}`);
  }
  return parts.length === 0 ? '' : `${village.dwellings.length}|${parts.join('|')}`;
}
