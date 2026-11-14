import type {
  GridCell,
  JourneyRefusal,
  JourneyView,
  JourneyVisitor,
  Pos,
  SeenCell,
} from '@bohemia/game';
import type { LandscapeTransfer } from './landscape-transfer';
import type { SceneJourney } from './scene/journey-riders';

// Pohled na výjezd vojvody pro prohlížeč (lord-control.md; plán 2026-11-13 – Úloha 7): typy jsou
// z jádra (`application/journey-view.ts`), tady jen texty důvodů a interpolace mezi dvěma dotazy.

export type {
  JourneyView,
  JourneyVisitor,
  JourneyOrder,
  JourneyRefusal,
  SeenCell,
} from '@bohemia/game';
export type { JourneyCommandResult } from '@bohemia/game';

/** Jak často se prohlížeč ptá na běžící výjezd – 2× za sekundu jako u tažení. */
export const JOURNEY_POLL_MS = 500;

/** Odpověď `GET /api/journey` – pohled (null = hráč žádný výjezd nemá), nebo chyba. */
export type JourneyResponse = { view: JourneyView | null } | { error: string };

/** Text u zašedlého oka: rod mapu tohoto rodu nezná (docs/design/lord-control.md – Co hráč vidí). */
export const UNKNOWN_MAP = 'Tu mapu rod nezná.';

/** Mapa, kterou rod zná, a rod, který na ní sídlí (`GET /api/journey?known=villages`). */
export interface KnownVillage {
  cell: GridCell;
  houseId: string | null;
}

/** Odpověď `GET /api/journey?known=x,y` – krajina a znalost rodu, nebo chyba (404 – nezná). */
export type KnownMapResponse =
  { map: { cell: GridCell; landscape: LandscapeTransfer }; seen: SeenCell } | { error: string };

/**
 * Mapa, kterou otevře další klik na oko rodu `houseId`: rod může mít víc známých map (víc vsí),
 * klik po klikovi je prochází dokola; `last` je naposled otevřená (nebo null – první).
 */
export function nextKnownCell(
  known: readonly KnownVillage[],
  houseId: string,
  last: GridCell | null,
): GridCell | null {
  const cells = known
    .filter((k) => k.houseId === houseId)
    .map((k) => k.cell)
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (cells.length === 0) return null;
  const at = last ? cells.findIndex((c) => c.x === last.x && c.y === last.y) : -1;
  return cells[(at + 1) % cells.length] ?? null;
}

/** Důvod odmítnutí vyslání nebo rozkazu (`refused` = rozkaz, který nedává smysl). */
export type JourneyReason = JourneyRefusal | 'refused';

const REASONS: Record<JourneyReason, string> = {
  'no-lord': 'Vojvoda tu není.',
  'lord-young': 'Vojvoda je ještě mladý.',
  'lord-wounded': 'Vojvoda je raněný.',
  'lord-away': 'Vojvoda je na tažení.',
  'village-attacked': 'Ves je napadena.',
  'journey-active': 'Vojvoda už je na cestě.',
  'bad-retinue': 'Tuhle družinu nelze vyslat.',
  unreachable: 'Tam vojvoda nedojde.',
  'war-there': 'Tam je válka.',
  refused: 'Rozkaz nelze dát.',
};

/** Text důvodu u kurzoru (docs/design/lord-control.md – Co hráč vidí). */
export function journeyReason(reason: JourneyReason): string {
  return REASONS[reason];
}

const lerp = (a: Pos, b: Pos, t: number): Pos => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t,
});

/**
 * Pohled mezi stavem `prev` a `next` v podílu `t` (0 = `prev`, 1 = `next`): poloha skupiny se
 * posune rovnoměrně, je-li na téže mapě; jinak (a bez `prev`, nebo po čase) stojí v `next`.
 */
export function interpolateJourney(
  prev: JourneyView | null,
  next: JourneyView,
  t: number,
): JourneyView {
  if (
    prev === null ||
    prev.journeyId !== next.journeyId ||
    t >= 1 ||
    prev.cell.x !== next.cell.x ||
    prev.cell.y !== next.cell.y
  ) {
    return next;
  }
  const pos = lerp(prev.group.pos, next.group.pos, Math.max(0, t));
  return { ...next, group: { ...next.group, pos } };
}

const sameCell = (a: GridCell, b: GridCell): boolean => a.x === b.x && a.y === b.y;

/**
 * Výjezdy na mapě vsi `cell` pro scénu (journey.md – Scéna vsi): vlastní z pohledu `own` (2× za
 * sekundu, s fázi a dny čekání), je-li skupina na této mapě; ostatní z návštěvníků vsi (cizí v dohledu
 * domů, vlastní z jiné vsi rodu). Jméno a rod vlastního vojvody dodá jeho záznam mezi návštěvníky.
 */
export function sceneJourneysOf(input: {
  own: JourneyView | null;
  visitors: readonly JourneyVisitor[];
  cell: GridCell | null;
}): SceneJourney[] {
  const { own, visitors, cell } = input;
  const out: SceneJourney[] = [];
  const mine = own && cell && sameCell(own.cell, cell) ? own : null;
  if (mine) {
    const listed = visitors.find((v) => v.journeyId === mine.journeyId);
    const goal = mine.group.goal;
    out.push({
      journeyId: mine.journeyId,
      own: true,
      leader: listed?.leader ?? '',
      house: listed?.house ?? '',
      tick: mine.tick,
      pos: { x: mine.group.pos.x, z: mine.group.pos.z },
      goal: goal && sameCell(goal.cell, mine.cell) ? { x: goal.pos.x, z: goal.pos.z } : null,
      men: mine.men.map((m) => ({
        key: String(m.personId),
        personId: m.personId,
        lord: m.lord,
        mounted: m.mounted,
        wounded: m.wounded,
      })),
      arrived: mine.group.arrived,
      phase: mine.phase,
      waitDaysLeft: mine.waitDaysLeft,
      home: { x: mine.homePos.x, z: mine.homePos.z },
    });
  }
  for (const v of visitors) {
    if (mine && v.journeyId === mine.journeyId) continue;
    out.push({
      journeyId: v.journeyId,
      own: v.own,
      leader: v.leader,
      house: v.house,
      tick: v.tick,
      pos: { x: v.pos.x, z: v.pos.z },
      goal: v.goal ? { x: v.goal.x, z: v.goal.z } : null,
      men: v.men.map((m, i) => ({
        key: String(i),
        personId: null,
        lord: m.lord,
        mounted: m.mounted,
        wounded: false,
      })),
      arrived: null,
      phase: null,
      waitDaysLeft: null,
      home: null,
    });
  }
  return out;
}

/** Odpověď `GET /api/journey?visitors=<ves>` – jezdci na mapě vsi, nebo chyba. */
export type JourneyVisitorsResponse = { visitors: JourneyVisitor[] } | { error: string };

/** Bez jezdců na mapě se prohlížeč na návštěvníky ptá po 5 s (s nimi 2× za sekundu). */
export const VISITORS_IDLE_MS = 5000;

/** Stav seznamu známých map ve hře: načítá se, dotaz selhal, nebo je načtený. */
export type KnownStatus = 'loading' | 'error' | 'ready';

/**
 * Co ukáže oko: `hidden` – nemá rod (cíl tažení není vybraný); `pending` – seznam se ještě
 * nenačetl nebo dotaz selhal, oko je zašedlé a důvod se nevymýšlí; `unknown` – seznam je načtený
 * a mapu rod opravdu nezná; `open` – otevře mapu `cell`.
 */
export type KnownEyeState =
  { kind: 'hidden' } | { kind: 'pending' } | { kind: 'unknown' } | { kind: 'open'; cell: GridCell };

export function knownEyeState(
  status: KnownStatus,
  known: readonly KnownVillage[],
  houseId: string | null,
  last: GridCell | null,
): KnownEyeState {
  if (houseId === null) return { kind: 'hidden' };
  if (status !== 'ready') return { kind: 'pending' };
  const cell = nextKnownCell(known, houseId, last);
  return cell ? { kind: 'open', cell } : { kind: 'unknown' };
}
