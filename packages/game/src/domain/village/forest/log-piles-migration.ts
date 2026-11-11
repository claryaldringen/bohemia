// Převod starších vsí na hromady klád u cesty (forest.md – Mýcení a hromada klád, Starší vsi):
// dřívější hromada u vsi (klády bez hromady – `pileLogs`) se stane hromadou na svém dnešním místě
// – u obydlí nejblíž okraji lesa, jak ji kreslí scéna –, aby se klády ve hře nestěhovaly. Dál se
// chová jako ostatní hromady (odběr od nejbližší, hnití).

import type { Landscape } from '../../landscape';
import { logArrivalPoint } from './log-piles';
import { forestEdgeDistanceM } from '../placement/placement-squares';
import type { VillageState } from '../types';
import { pileLogs } from './wood';

/** Méně klád bez hromady je jen chyba zaokrouhlení – převod se přeskočí. */
const LOOSE_EPSILON = 1e-9;

/**
 * Ves s kládami bez hromady (dřívější hromada u vsi) je převede na hromadu u obydlí, u kterého
 * leží dnes: obydlí i rozestavěné obydlí nejblíž okraji lesa, při shodě menší id (jako scéna –
 * `logPileSite`); bez obydlí u místa, kam se skládají dovezené klády. Jednou a idempotentně – po
 * převodu klády bez hromady nezbývají; ves bez nich vrací beze změny.
 */
export function withRoadLogPiles(state: VillageState, landscape: Landscape): VillageState {
  const loose = pileLogs(state);
  if (loose <= LOOSE_EPSILON) return state;
  const next = structuredClone(state);
  const homes = [
    ...next.dwellings.map((d) => ({ id: d.id, x: d.position.x, z: d.position.z })),
    ...next.constructions.flatMap((c) =>
      (c.kind === 'dwelling' || c.kind === 'rebuild') && c.dwellingType !== null && c.position
        ? [{ id: c.id, x: c.position.x, z: c.position.z }]
        : [],
    ),
  ];
  let home: (typeof homes)[number] | null = null;
  let best = Infinity;
  for (const h of homes) {
    const distance = forestEdgeDistanceM(landscape, h.x, h.z);
    if (distance < best || (distance === best && home !== null && h.id < home.id)) {
      best = distance;
      home = h;
    }
  }
  const at = home ?? logArrivalPoint(next);
  (next.logStacks ??= []).push({
    id: next.nextId++,
    fieldId: 0,
    x: at.x,
    z: at.z,
    ...(home ? { dwellingId: home.id } : {}),
    logs: loose,
  });
  return next;
}
