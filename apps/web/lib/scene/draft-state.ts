// Co spřežení s rádlem právě dělá (villagers.md – Výběr postavy, oxen.md – Výběr spřežení): orá
// díl pole, jde na pole, přechází mezi díly, vrací se do ohrady, nebo má hotovo. Čisté funkce
// času bez Babylonu – podle dráhy spřežení (plough-team.ts), počítá se jen pro vybrané spřežení.
import type { RouteTrack, TeamTrack } from './plough-team';
import { routeDistance } from './plough-team';

/** Díl, který spřežení orá (pole a díl v herním jádru; díl bez id – starší data – null). */
export interface PloughedPart {
  fieldId: number;
  partId: number | null;
}

/**
 * Co spřežení dělá: orá díl (`plough`), jde z ohrady nebo z místa, kde stálo, na pole
 * (`to-field`), přechází se zvednutým rádlem mezi díly (`between`), vrací se do ohrady (`to-pen`),
 * nebo má orbu dne hotovou (`done` – stojí u ohrady, nebo na konci poslední řady).
 */
export type TeamActivity =
  | { kind: 'plough'; part: PloughedPart | null }
  | { kind: 'to-field' }
  | { kind: 'between' }
  | { kind: 'to-pen' }
  | { kind: 'done'; atPen: boolean };

/** Stejná činnost (změnu hlásí scéna jen při rozdílu)? */
export function sameTeamActivity(a: TeamActivity, b: TeamActivity): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'plough' && b.kind === 'plough') {
    return a.part?.fieldId === b.part?.fieldId && a.part?.partId === b.part?.partId;
  }
  if (a.kind === 'done' && b.kind === 'done') return a.atPen === b.atPen;
  return true;
}

/**
 * Spřežení na pruhu (orba jen čela dne – plough-front.ts) v čase `t` (s): během přechodu na nový
 * pruh jde na pole, jinak orá díl `part`.
 */
export function loopActivity(track: TeamTrack, t: number, part: PloughedPart | null): TeamActivity {
  const transit = track.transit;
  if (transit && t < transit.arriveS) return { kind: 'to-field' };
  return { kind: 'plough', part };
}

/**
 * Spřežení na trase celé dnešní orby (plough-day.ts) v okamžiku `nowMs`: na pruhu dílu orá
 * (i obrat na souvrati patří k pruhu), přesun před prvním pruhem je cesta na pole (výjezd
 * z ohrady nebo přesun od předchozího bloku), mezi pruhy přechod, za posledním návrat do ohrady
 * (`home` – den návratu, oxen.md – Spřežení zůstane na poli); po konci trasy hotovo (s návratem
 * stojí u ohrady, jinak na poli).
 */
export function routeActivity(track: RouteTrack, nowMs: number, home: boolean): TeamActivity {
  const route = track.route;
  const done: TeamActivity = { kind: 'done', atPen: home };
  if (route.length <= 0 || route.stints.length === 0) return done;
  if (nowMs >= track.endMs) return done;
  const s = routeDistance(track, nowMs);
  let index = 0;
  while (index < route.segments.length - 1 && route.starts[index + 1]! <= s) index++;
  const stint = route.segmentStint[index] ?? -1;
  if (stint >= 0) {
    const { fieldId, partId } = route.stints[stint]!.stint;
    return { kind: 'plough', part: { fieldId, partId } };
  }
  const first = route.segmentStint.findIndex((k) => k >= 0);
  let last = -1;
  route.segmentStint.forEach((k, i) => {
    if (k >= 0) last = i;
  });
  if (first < 0 || index < first) return { kind: 'to-field' };
  return index > last ? { kind: 'to-pen' } : { kind: 'between' };
}
