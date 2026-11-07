import type { Landscape, ObstacleLayer } from '../../landscape';
import {
  fortWorkOrder,
  outlineCenter,
  outlineOf,
  pushWork,
  villageAnchor,
  villageFortifications,
  segmentKind,
} from '../fortifications';
import { FORTIFICATIONS } from '../rules-fortifications';
import type { Construction, FortSegmentWork, Fortification, VillageState } from '../types';
import { fortificationCost } from './cost';
import { FORT_DAYS_PER_YEAR, segmentIsOld, segmentState } from './life';
import { fortSegments } from './segments';

export { segmentState } from './life';

// Stáří, přestavba a údržba opevnění (fortifications.md – Životnost a oprava): obyvatelé sami
// přestaví dožilý úsek, průlom a val pod výškou obnovy; val bez údržby klesá. Čísla v
// `rules-fortifications.ts`.

/** Tolerance porovnání výšky valu. */
const EPSILON = 1e-9;

/** Geometrie krajiny, ze které se počítá délka úseků. */
type Geometry = Pick<Landscape, 'size' | 'cellSizeM'>;

/** Stavba, která na opevnění právě pracuje (nejvýš jedna). */
function running(state: VillageState, fort: Fortification): Construction | undefined {
  return state.constructions.find(
    (c) => c.kind === 'fortification' && c.fortificationId === fort.id,
  );
}

/** Úseky, které obyvatelé přestaví: průlom, dožilý plot či palisáda a dožilá nástavba valu. */
function dueSegments(fort: Fortification, day: number): number[] {
  const breached: number[] = [];
  const old: number[] = [];
  for (const s of fort.segments) {
    if (s.builtDay === null) continue;
    if (s.breachedDay !== undefined) breached.push(s.index);
    else if (segmentIsOld(fort, s, day)) old.push(s.index);
  }
  return [...breached, ...old];
}

/** Celková délka (m) stojících hotových úseků valu a opevnění; null, když tvar nejde spočítat. */
function builtLengths(geo: Geometry, fort: Fortification): Map<number, number> | null {
  const outline = outlineOf(geo, fort);
  if (!outline) return null;
  const lengths = new Map<number, number>();
  for (const shape of fortSegments(outline)) lengths.set(shape.index, shape.lengthM);
  return lengths;
}

/**
 * Přestavby opevnění dne (mutuje stav): u každého opevnění napřed zapíše stav úseků ke dni
 * (`segmentState`; úsek, na který se právě staví, drží stav – stojí a brání), pak, když na něm
 * neběží jiná stavba, založí přestavbu dožilých úseků (průlom přednostně) – za cenu nového úseku,
 * jen když je dřevo, jinak úsek chátrá dál – nebo obnovu valu pod výškou 0,75 za polovinu ceny
 * valu. Rozhoduje jen stáří a výška, hráčovo opevnění stejně. Bez krajiny nebo lidí nic.
 */
export function decideFortRebuilds(
  state: VillageState,
  day: number,
  geo: Geometry | null,
  obstacles: ObstacleLayer | null,
): Construction[] {
  const started: Construction[] = [];
  const forts = villageFortifications(state);
  if (forts.length === 0 || !geo || state.people.length === 0) return started;
  for (const fort of forts) {
    const work = running(state, fort);
    if (!work) {
      for (const s of fort.segments) {
        const value = segmentState(fort, s, day);
        // průlom drží stav 0, dokud ho obyvatelé nepřestaví
        if (s.builtDay !== null && s.breachedDay === undefined && s.state !== value)
          s.state = value;
      }
    }
    if (work) continue;
    const lengths = builtLengths(geo, fort);
    if (!lengths) continue;
    const outline = outlineOf(geo, fort);
    if (!outline) continue;
    const due = new Set(dueSegments(fort, day));
    const height = fort.rampartHeight ?? 1;
    const restore =
      fort.kind === 'rampart' && height < FORTIFICATIONS.rampartUpkeep.renewBelowHeight;
    if (due.size === 0 && !restore) continue;
    const anchor = villageAnchor(state);
    const order = fortWorkOrder(lengths.size, fort.gates, anchor);
    let plan: { segments: FortSegmentWork[]; wood: number };
    let kind: 'rebuild' | 'restore';
    if (due.size > 0) {
      kind = 'rebuild';
      // průlom napřed, pak ostatní v pořadí práce od brány
      const isBreach = (i: number): boolean =>
        fort.segments.find((s) => s.index === i)?.breachedDay !== undefined;
      const picked = order.filter((i) => due.has(i));
      const indices = [...picked.filter(isBreach), ...picked.filter((i) => !isBreach(i))];
      plan = { segments: [], wood: 0 };
      for (const index of indices) {
        const seg = fort.segments.find((s) => s.index === index)!;
        const length = lengths.get(index) ?? 0;
        const top = fort.kind === 'rampart' && seg.breachedDay === undefined;
        const cost = top
          ? fortificationCost(fort.top ?? 'fence', length, 'top')
          : fortificationCost(segmentKind(fort, seg), length, 'new');
        plan.wood += cost.upfront.wood ?? 0;
        plan.segments.push({ index, cost: cost.laborManDays });
      }
    } else {
      kind = 'restore';
      plan = { segments: [], wood: 0 };
      for (const s of fort.segments) {
        if (s.builtDay === null) continue;
        const cost = fortificationCost('rampart', lengths.get(s.index) ?? 0, 'new');
        plan.segments.push({
          index: s.index,
          cost: cost.laborManDays * FORTIFICATIONS.rampartUpkeep.renewCostShare,
        });
      }
    }
    const before = state.constructions.length;
    const ok = pushWork(
      state,
      day,
      obstacles,
      {
        fortificationId: fort.id,
        work: kind,
        plan,
        center: outlineCenter(outline),
        clearedIds: [],
        clearedTrees: 0,
      },
      undefined,
    );
    if (ok && state.constructions.length > before) {
      started.push(state.constructions[state.constructions.length - 1]!);
    }
  }
  return started;
}

/**
 * Údržba valu ze společné práce (mutuje stav; vrací spotřebované čd): 2 čd na 100 m hotového valu
 * ročně, počítá se za den. Nedodělek se neodkládá – výška valu klesne o jeho podíl, tempo
 * (0,5 za 50 let) určují `rampartNeglect`; víc práce výšku nevrací, to dělá až obnova valu.
 */
export function rampartMaintenance(
  state: VillageState,
  labor: number,
  geo: Geometry | null,
): number {
  const forts = villageFortifications(state);
  if (forts.length === 0 || !geo) return 0;
  let left = Math.max(0, labor);
  let used = 0;
  for (const fort of forts) {
    if (fort.kind !== 'rampart') continue;
    const lengths = builtLengths(geo, fort);
    if (!lengths) continue;
    let meters = 0;
    for (const s of fort.segments) if (s.builtDay !== null) meters += lengths.get(s.index) ?? 0;
    const need =
      (meters / 100) * (FORTIFICATIONS.rampartUpkeep.manDaysPer100MYear / FORT_DAYS_PER_YEAR);
    if (need <= EPSILON) continue;
    const given = Math.min(left, need);
    left -= given;
    used += given;
    const shortfall = (need - given) / need;
    if (shortfall > EPSILON) {
      const { years, height } = FORTIFICATIONS.rampartNeglect;
      const next =
        (fort.rampartHeight ?? 1) - (shortfall * (1 - height)) / (years * FORT_DAYS_PER_YEAR);
      fort.rampartHeight = Math.max(0, next);
    }
  }
  return used;
}
