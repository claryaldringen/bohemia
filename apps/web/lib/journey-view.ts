import type { JourneyRefusal, JourneyView, Pos } from '@bohemia/game';

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
