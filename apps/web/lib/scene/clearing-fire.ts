// Pálení paseky ve scéně bez Babylonu (forest.md – Klučení lesa pro pole – postup, bod 3;
// scene.md – Paseka klučení – ohně a kouř): které čtverce dnes hoří nebo doutnají, kde na nich
// hoří hromady větví a v jakém pořadí se zapalují a odkud stoupá dým. Kdy co hoří a jak silně,
// počítá `clearingFireState` (smoke-schedule.ts) – deterministicky podle herního času.
import { isSmoldering } from '@bohemia/game';
import type { SceneFieldPart, SceneVillage } from '../village-view';
import { slashHeapSites, type HeapSite } from './clearing-slash-layout';
import { rowDirection } from './field-cells';
import { villageCenter, workAt, workFrame, workSteps } from './field-look';
import type { FireShape } from './pyre-fire';
import type { ClearingBurn } from './smoke-schedule';
import type { Point } from './village-layout';

/**
 * Na kolika čtvercích nejblíž kameře se kreslí plameny – velká ves spálí celé pole za den,
 * ostatní hořící čtverce jen kouří (návrh Clauda).
 */
export const MAX_FIRE_SQUARES = 12;
/** Nejvýš sloupců dýmu z pálení – po jednom na čtverec, podle id dílu (návrh Clauda). */
export const MAX_SLASH_PLUMES = 16;
/** Plamenů a jisker na hromadu větví – menší oheň než hranice (26 a 16). */
const HEAP_FLAMES = 10;
const HEAP_SPARKS = 5;
/** Kupa větví při velikosti 1 (m) – jako síť hromady (clearing-slash.ts – 2 × HEAP_A, 2 × HEAP_B, HEAP_H). */
const HEAP_SIZE_M = { length: 3, width: 1.9, height: 0.55 } as const;

/** Čtverec, který se dnes pálí nebo doutná. */
export interface BurningSquare {
  fieldId: number;
  part: SceneFieldPart;
  burn: ClearingBurn;
}

/** Hořící hromada větví: místo, číslo pro sprity, pořadí zapálení (0–1) a pálení čtverce. */
export interface HeapFire extends HeapSite {
  /** Id dílu (bez něj políčko) – hromady jednoho čtverce mají stejné. */
  square: string;
  seed: number;
  order: number;
  burn: ClearingBurn;
}

/** Tvar ohně hromady větví velikosti `scale` (SLASH_HEAP_SCALES). */
export function heapFireShape(scale: number): FireShape {
  return {
    lengthM: HEAP_SIZE_M.length * scale,
    widthM: HEAP_SIZE_M.width * scale,
    heightM: HEAP_SIZE_M.height * scale,
    flames: HEAP_FLAMES,
    sparks: HEAP_SPARKS,
    scale: 0.55 * scale,
  };
}

/** Sprity jednoho ohně hromady (plameny, jiskry, záře) – stejně pro všechny velikosti. */
export const HEAP_FIRE_SPRITES = HEAP_FLAMES + HEAP_SPARKS + 1;

/** Rozpracované pálení: spálenina v hotové části, paseka ve zbytku (fieldPartLooks v jádru). */
export function isBurningPart(part: Pick<SceneFieldPart, 'look' | 'before' | 'work'>): boolean {
  return (
    part.look === 'burnt' &&
    part.before === 'slash' &&
    part.work !== undefined &&
    part.work > 0 &&
    part.work < 1
  );
}

function squareKey(part: SceneFieldPart): string {
  return part.id === undefined ? `${part.cell.x},${part.cell.y}` : String(part.id);
}

/**
 * Čtverce, které v den `day` hoří nebo doutnají, podle id dílu: dohořelé dnes nebo před méně
 * než `smolderDays` dny (`isSmoldering` v jádru – `burnedDay`) a rozpracované pálení na poli,
 * které dnes dostalo práci zakládání (`found-field` v rozdělení práce; bez rozdělení práce se
 * předpokládá, že se pálí).
 */
export function burningSquares(
  village: Pick<SceneVillage, 'fields' | 'labor'>,
  day: number,
): BurningSquare[] {
  const worked = new Set(
    (village.labor?.shares ?? []).flatMap((s) =>
      s.activity === 'found-field' && s.target.kind === 'field' ? [s.target.id] : [],
    ),
  );
  const list: BurningSquare[] = [];
  for (const field of village.fields) {
    for (const part of field.parts) {
      if (part.burnedDay !== undefined) {
        if (isSmoldering(part, day)) {
          list.push({ fieldId: field.id, part, burn: { burnedDay: part.burnedDay } });
        }
      } else if (isBurningPart(part) && (!village.labor || worked.has(field.id))) {
        list.push({ fieldId: field.id, part, burn: {} });
      }
    }
  }
  return list.sort((a, b) => (a.part.id ?? 0) - (b.part.id ?? 0));
}

/**
 * Hořící hromady na čtvercích, které dnes (`day`) hoří: rozpracované pálení – hromady ve
 * spálené části (tam, kam pálení došlo), dohořelé dnes – všechny. Hromady se zapalují v pořadí
 * práce (napříč čtvercem od strany blíž vsi – workFrame jako obtisk), `order` 0 = první.
 * Doutnající čtverce (dohořelé dřív) hromady nemají – jen kouří. Místa jako clearingHeaps
 * (`avoidOf` – překážky čtverce).
 */
export function heapFires(
  village: Pick<SceneVillage, 'fields' | 'dwellings' | 'labor'>,
  squares: readonly BurningSquare[],
  day: number,
  avoidOf: (part: SceneFieldPart) => readonly Point[],
): HeapFire[] {
  const fires: HeapFire[] = [];
  for (const { fieldId, part, burn } of squares) {
    if (burn.burnedDay !== undefined && burn.burnedDay !== day) continue;
    const field = village.fields.find((f) => f.id === fieldId);
    if (!field) continue;
    const frame = workFrame(part, rowDirection(field.parts), villageCenter(village, field.parts));
    const done = burn.burnedDay === undefined ? workSteps(part.work ?? 0) : 1;
    if (done <= 0) continue;
    const square = squareKey(part);
    const base = (part.id ?? part.cell.x * 65_536 + part.cell.y) * 8;
    slashHeapSites(part, avoidOf(part)).forEach((site, k) => {
      const at = Math.min(1, Math.max(0, workAt(frame, part, site.x, site.z)));
      if (at >= done) return;
      fires.push({ ...site, square, seed: base + k, order: at / done, burn });
    });
  }
  return fires;
}

/** Klíč pálení (čtverce, jejich práce a den) – beze změny se ohně ani dým nepřestaví. */
export function burningKey(squares: readonly BurningSquare[], day: number): string {
  if (squares.length === 0) return '';
  const parts = squares.map(
    (s) =>
      `${s.fieldId}/${squareKey(s.part)}:${s.burn.burnedDay ?? ''}:${workSteps(s.part.work ?? 0)}`,
  );
  return `${day}|${parts.join(';')}`;
}

/** Zdroj dýmu pálení: střed čtverce, číslo sloupce a pálení. */
export interface SlashPlume {
  seed: number;
  x: number;
  z: number;
  burn: ClearingBurn;
}

/**
 * Sloupce dýmu z pálení – po jednom ze středu čtverce, nejvýš MAX_SLASH_PLUMES: nejdřív hořící
 * čtverce, pak doutnající (dohořelé), v obou skupinách podle id dílu.
 */
export function slashPlumes(squares: readonly BurningSquare[]): SlashPlume[] {
  const rank = (s: BurningSquare): number => (s.burn.burnedDay === undefined ? 0 : 1);
  return [...squares]
    .sort((a, b) => rank(a) - rank(b) || (a.part.id ?? 0) - (b.part.id ?? 0))
    .slice(0, MAX_SLASH_PLUMES)
    .map(({ part, burn }) => ({
      seed: part.id ?? part.cell.x * 65_536 + part.cell.y,
      x: part.x,
      z: part.z,
      burn,
    }));
}
