import { partCenter } from '../village/forest-clearing';
import { orchardSquareCenter } from '../village/orchard';
import { isAway } from '../village/people';
import { raidHiding } from '../village/raid-day';
import type { VillageState } from '../village/types';
import type { MarchGrid, Pos } from './march-grid';
import { marchPath } from './march';
import { WAR } from './rules-war';
import { isMarchWinter } from './season';
import { TICKS_PER_SECOND } from './ticks';

// Oči vsi (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 – Otevřené 3): ves se
// o cizím vojsku dozví, až ho spatří vesničan kdekoli na mapě, kde zrovna pracuje, a doběhne domů.

/** Kde vesničan je: dům, díl pole, milíř, lom, hromada klád, sad, ohrada. */
export type LookoutKind = 'home' | 'field' | 'kiln' | 'quarry' | 'logs' | 'orchard' | 'pen';

/** Oko vsi – místo, odkud vesničan vidí (`inSight`), a id stavby, u které je. */
export interface Lookout {
  kind: LookoutKind;
  id: number;
  pos: Pos;
}

const KIND_ORDER: readonly LookoutKind[] = [
  'home',
  'field',
  'kiln',
  'quarry',
  'logs',
  'orchard',
  'pen',
];

/**
 * Oči vsi v den `day` (plán 2026-11-09 – Otevřené 3): domy (obydlí včetně dvorce; dokud žádné
 * nestojí, staveniště obydlí zakladatelů – návrh Clauda) vždy; díly polí
 * mimo zimu tažení (`isMarchWinter`); milíře uhlířů s místem, lomy, hromady klád s kládami, sady
 * (první čtverec) a ohrady. Ves, která se dnes skrývá před vojskem (`raidHiding`), má oči jen
 * v domech; ves bez přítomného člověka nevidí nic. Pořadí pevné – druh, pak id.
 */
export function villageLookouts(state: VillageState, day: number): Lookout[] {
  if (!state.people.some((p) => !isAway(p, day))) return [];
  const out: Lookout[] = state.dwellings.map((d) => ({
    kind: 'home',
    id: d.id,
    pos: { x: d.position.x, z: d.position.z },
  }));
  // zakladatelé bydlí na staveništi, dokud nestojí první obydlí (jako `villageManorId`)
  if (out.length === 0) {
    for (const c of state.constructions) {
      if (c.kind !== 'dwelling' || c.position === null) continue;
      out.push({
        kind: 'home',
        id: c.dwellingId ?? c.id,
        pos: { x: c.position.x, z: c.position.z },
      });
    }
  }
  if (!raidHiding(state, day)) {
    if (!isMarchWinter(day)) {
      for (const part of state.parts) {
        if (part.abandoned) continue;
        const pos = partCenter(state, part);
        if (pos) out.push({ kind: 'field', id: part.id, pos });
      }
    }
    for (const d of state.dwellings) {
      const w = d.workshop;
      if (w?.craft !== 'burner') continue;
      for (const k of [...(w.kilns ?? []), ...(w.kiln ? [w.kiln] : [])]) {
        if (k.site) out.push({ kind: 'kiln', id: k.id ?? d.id, pos: { x: k.site.x, z: k.site.z } });
      }
    }
    for (const q of state.quarries ?? []) {
      out.push({ kind: 'quarry', id: q.outcropId, pos: { x: q.x, z: q.z } });
    }
    for (const stack of state.logStacks ?? []) {
      if (stack.logs > 0) out.push({ kind: 'logs', id: stack.id, pos: { x: stack.x, z: stack.z } });
    }
    for (const orchard of state.orchards ?? []) {
      const first = orchard.squares[0];
      if (first)
        out.push({ kind: 'orchard', id: orchard.id, pos: orchardSquareCenter(orchard, first) });
    }
    for (const pen of state.pens ?? []) {
      out.push({ kind: 'pen', id: pen.id, pos: { x: pen.x, z: pen.z } });
    }
  }
  return out.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.id - b.id);
}

/**
 * Takty, za které vesničan doběhne z `from` do `to` (plán 2026-11-09 – Otevřené 3): po mřížce
 * pochodu (`marchPath` – metry louky) během `WAR.alarm.runFactor` × pěší tempo vojska, nahoru;
 * bez cesty vzdušnou čarou.
 */
export function runTicks(grid: MarchGrid, from: Pos, to: Pos): number {
  const path = marchPath(grid, from, to);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const meters = path ? path.meadowM[path.meadowM.length - 1]! : Math.sqrt(dx * dx + dz * dz);
  const speed = WAR.pace.metersPerSecond * WAR.alarm.runFactor;
  return Math.ceil((meters / speed) * TICKS_PER_SECOND);
}
