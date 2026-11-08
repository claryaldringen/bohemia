import type { Landscape, ObstacleLayer } from '../../landscape';
import {
  fortWorkOrder,
  outlineCenter,
  outlineOf,
  pushWork,
  villageAnchor,
  villageFortifications,
} from '../fortifications';
import { FORTIFICATIONS } from '../rules-fortifications';
import type {
  Construction,
  FortKind,
  FortSegment,
  FortSegmentWork,
  Fortification,
  VillageState,
} from '../types';
import { fortificationCost, fortificationRebuildCost } from './cost';
import {
  FORT_DAYS_PER_YEAR,
  layerBuilt,
  segmentBuilt,
  segmentIsOld,
  segmentKind,
  segmentRampart,
  segmentState,
  segmentWall,
} from './life';
import { busySegments } from './runs';
import { fortSegments } from './segments';

export { segmentState } from './life';

// Stáří, přestavba a údržba opevnění (fortifications.md – Životnost a oprava): obyvatelé sami
// přestaví dožilý úsek, průlom a val pod výškou obnovy; val bez údržby klesá. Čísla v
// `rules-fortifications.ts`.

/** Tolerance porovnání výšky valu. */
const EPSILON = 1e-9;

/** Geometrie krajiny, ze které se počítá délka úseků. */
type Geometry = Pick<Landscape, 'size' | 'cellSizeM'>;

/**
 * Úseky, které obyvatelé přestaví: průlom a dožilá hradba (i na valu). Zbořený díl ne – hráč ho
 * zbořil (demolition.md – Opevnění).
 */
function dueSegments(fort: Fortification, day: number, busy: ReadonlySet<number>): number[] {
  const breached: number[] = [];
  const old: number[] = [];
  for (const s of fort.segments) {
    if (!segmentBuilt(s) || s.demolishedDay !== undefined || busy.has(s.index)) continue;
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
    // díly, na kterých běží stavba, drží stav (stojí a brání) a nepřestavují se; ostatní díly
    // chátrají a přestavují se dál (Martin 8. 11. 2026 – opevnění se staví po dílech)
    const busy = busySegments(
      state.constructions,
      fort.id,
      fort.segments.map((s) => s.index),
    );
    for (const s of fort.segments) {
      if (busy.has(s.index)) continue;
      const value = segmentState(fort, s, day);
      // průlom drží stav 0, dokud ho obyvatelé nepřestaví; zbořený díl nechátrá
      if (
        segmentBuilt(s) &&
        s.breachedDay === undefined &&
        s.demolishedDay === undefined &&
        s.state !== value
      )
        s.state = value;
    }
    if (fort.segments.every((s) => busy.has(s.index))) continue;
    const lengths = builtLengths(geo, fort);
    if (!lengths) continue;
    const outline = outlineOf(geo, fort);
    if (!outline) continue;
    const due = new Set(dueSegments(fort, day, busy));
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
        // přestavba hradby na valu – val sám stojí dál; průlom valu se staví celý
        const top = segmentRampart(fort, seg) !== null && seg.breachedDay === undefined;
        // dožilá hradba: cena podle druhu (ochoz = palisáda + fošny, roštová a komorová třetina
        // bez kamene); průlom se staví celý za cenu nového úseku
        const wallKind = segmentWall(fort, seg)?.kind ?? 'fence';
        const cost = top
          ? fortificationRebuildCost(wallKind, length)
          : seg.breachedDay === undefined && segmentKind(fort, seg) !== 'rampart'
            ? fortificationRebuildCost(wallKind, length)
            : fortificationCost(segmentKind(fort, seg), length);
        plan.wood += cost.logs;
        plan.segments.push({ index, cost: cost.laborManDays });
      }
    } else {
      kind = 'restore';
      plan = { segments: [], wood: 0 };
      for (const s of fort.segments) {
        // srovnaný val se neobnovuje
        if (
          !layerBuilt(segmentRampart(fort, s)) ||
          s.demolishedDay !== undefined ||
          busy.has(s.index)
        )
          continue;
        const cost = fortificationCost('rampart', lengths.get(s.index) ?? 0);
        plan.segments.push({
          index: s.index,
          cost: cost.laborManDays * FORTIFICATIONS.rampartUpkeep.renewCostShare,
        });
      }
    }
    if (plan.segments.length === 0) continue;
    const before = state.constructions.length;
    const ok =
      pushWork(
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
      ) === null;
    if (ok && state.constructions.length > before) {
      started.push(state.constructions[state.constructions.length - 1]!);
    }
  }
  return started;
}

/**
 * Údržba opevnění po úsecích ze společné práce (mutuje stav; Hradby a obrana – Životnost
 * a údržba): hotová, nezbořená vrstva dílu (hradba i val) potřebuje `upkeepPer100MYear` čd na
 * 100 m ročně, počítá se za den. Díl, na kterém běží stavba, se neudržuje (stavba ho obnoví).
 * Práce se bere opevnění po opevnění; co na opevnění nestačí, se rozdělí rovným dílem na všechny
 * vrstvy – hradba stárne o podíl nedodělku navíc (`extraAgeDays`, rok bez údržby = o rok víc),
 * val tratí výšku tempem `rampartNeglect` (víc práce výšku nevrací, to dělá až obnova). Vrací
 * spotřebované čd.
 */
export function fortUpkeep(
  state: VillageState,
  laborLeft: number,
  geo: Geometry | null,
): { used: number } {
  const forts = villageFortifications(state);
  if (forts.length === 0 || !geo) return { used: 0 };
  let left = Math.max(0, laborLeft);
  let used = 0;
  for (const fort of forts) {
    const lengths = builtLengths(geo, fort);
    if (!lengths) continue;
    const busy = busySegments(
      state.constructions,
      fort.id,
      fort.segments.map((s) => s.index),
    );
    let need = 0;
    const aging: { seg: FortSegment; need: number }[] = [];
    let rampartNeed = 0;
    for (const s of fort.segments) {
      if (busy.has(s.index) || s.demolishedDay !== undefined) continue;
      const hundreds = (lengths.get(s.index) ?? 0) / 100;
      const perDay = (kind: FortKind): number =>
        (hundreds * FORTIFICATIONS.upkeepPer100MYear[kind]) / FORT_DAYS_PER_YEAR;
      // srovnaný val se neudržuje
      if (layerBuilt(segmentRampart(fort, s))) rampartNeed += perDay('rampart');
      // průlom čeká na přestavbu, shnilá hradba na nule už nemá co udržovat
      const wall = segmentWall(fort, s);
      if (wall && wall.builtDay !== null && s.breachedDay === undefined && (s.state ?? 1) > 0) {
        const wallNeed = perDay(wall.kind);
        aging.push({ seg: s, need: wallNeed });
        need += wallNeed;
      }
    }
    need += rampartNeed;
    if (need <= EPSILON) continue;
    const given = Math.min(left, need);
    left -= given;
    used += given;
    const shortfall = (need - given) / need;
    if (shortfall <= EPSILON) continue;
    for (const { seg } of aging) seg.extraAgeDays = (seg.extraAgeDays ?? 0) + shortfall;
    if (rampartNeed > EPSILON) {
      const { years, height } = FORTIFICATIONS.rampartNeglect;
      const next =
        (fort.rampartHeight ?? 1) - (shortfall * (1 - height)) / (years * FORT_DAYS_PER_YEAR);
      fort.rampartHeight = Math.max(0, next);
    }
  }
  return { used };
}
