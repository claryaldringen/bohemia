import type { Landscape, ObstacleLayer } from '../../landscape';
import {
  fortWorkOrder,
  outlineCenter,
  outlineOf,
  pushWork,
  villageAnchor,
  villageFortifications,
} from '../fortifications';
import { decideTowerRebuilds } from '../fortification-gate';
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
import {
  gatePartLengthM,
  gatePartView,
  GATE_PARTS,
  gonePartDay,
  ownGatePart,
  type GatePart,
} from './gate-parts';
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

/** Kus k přestavbě – celý díl, nebo kus dílu s branou s vlastní hradbou (`part`). */
interface DuePiece {
  index: number;
  part?: GatePart;
}

/** Kusy dílu s branou s vlastní hradbou, které stojí (ne zbořené se sousedním úsekem). */
function ownParts(fort: Fortification, s: FortSegment): GatePart[] {
  if (!fort.gates.some((g) => g.segment === s.index)) return [];
  return GATE_PARTS.filter(
    (p) => ownGatePart(s, p) !== undefined && gonePartDay(s, p) === undefined,
  );
}

/**
 * Délka kusu (m): kus dílu s branou podle brány, celý díl bez kusů s vlastní hradbou (ty se
 * přestavují a udržují zvlášť).
 */
function pieceLength(fort: Fortification, s: FortSegment, length: number, part?: GatePart): number {
  const gate = fort.gates.find((g) => g.segment === s.index);
  if (!gate) return length;
  if (part !== undefined) return gatePartLengthM(length, gate.offsetM, part);
  let rest = length;
  for (const p of ownParts(fort, s)) rest -= gatePartLengthM(length, gate.offsetM, p);
  return Math.max(0, rest);
}

/**
 * Úseky, které obyvatelé přestaví: průlom a dožilá hradba (i na valu) – i kus dílu s branou
 * s vlastní hradbou zvlášť. Zbořený díl ne – hráč ho zbořil (demolition.md – Opevnění).
 */
function dueSegments(fort: Fortification, day: number, busy: ReadonlySet<number>): DuePiece[] {
  const breached: DuePiece[] = [];
  const old: DuePiece[] = [];
  for (const s of fort.segments) {
    if (!segmentBuilt(s) || s.demolishedDay !== undefined || busy.has(s.index)) continue;
    if (s.breachedDay !== undefined) {
      breached.push({ index: s.index });
      continue;
    }
    if (segmentIsOld(fort, s, day)) old.push({ index: s.index });
    for (const part of ownParts(fort, s)) {
      if (segmentIsOld(fort, gatePartView(s, part), day)) old.push({ index: s.index, part });
    }
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
      // kus dílu s branou s vlastní hradbou chátrá po svém
      if (!segmentBuilt(s) || s.breachedDay !== undefined || s.demolishedDay !== undefined)
        continue;
      for (const part of ownParts(fort, s)) {
        const own = ownGatePart(s, part)!;
        const next = segmentState(fort, gatePartView(s, part), day);
        if (own.state !== next) own.state = next;
      }
    }
    if (fort.segments.every((s) => busy.has(s.index))) continue;
    const lengths = builtLengths(geo, fort);
    if (!lengths) continue;
    const outline = outlineOf(geo, fort);
    if (!outline) continue;
    const due = dueSegments(fort, day, busy);
    const height = fort.rampartHeight ?? 1;
    const restore =
      fort.kind === 'rampart' && height < FORTIFICATIONS.rampartUpkeep.renewBelowHeight;
    if (due.length === 0 && !restore) continue;
    const anchor = villageAnchor(state);
    const order = fortWorkOrder(lengths.size, fort.gates, anchor);
    let plan: { segments: FortSegmentWork[]; wood: number };
    let kind: 'rebuild' | 'restore';
    if (due.length > 0) {
      kind = 'rebuild';
      // průlom napřed, pak ostatní v pořadí práce od brány (celý díl před kusy u brány)
      const isBreach = (i: number): boolean =>
        fort.segments.find((s) => s.index === i)?.breachedDay !== undefined;
      const picked = order.flatMap((i) => due.filter((d) => d.index === i));
      const pieces = [
        ...picked.filter((d) => isBreach(d.index)),
        ...picked.filter((d) => !isBreach(d.index)),
      ];
      plan = { segments: [], wood: 0 };
      for (const { index, part } of pieces) {
        const whole = fort.segments.find((s) => s.index === index)!;
        // kus dílu s branou s vlastní hradbou se přestavuje po svém (`gatePartView`)
        const seg = part === undefined ? whole : gatePartView(whole, part);
        const length = pieceLength(fort, whole, lengths.get(index) ?? 0, part);
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
        plan.segments.push({ index, ...(part ? { part } : {}), cost: cost.laborManDays });
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
  // dožilé věže nad branami – až po dílech, aby na dílu brány neběžely dvě stavby
  started.push(...decideTowerRebuilds(state, day, obstacles));
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
    const aging: { layers: { extraAgeDays?: number }; need: number }[] = [];
    let rampartNeed = 0;
    for (const s of fort.segments) {
      if (busy.has(s.index) || s.demolishedDay !== undefined) continue;
      const length = lengths.get(s.index) ?? 0;
      const perDay = (kind: FortKind, m: number): number =>
        ((m / 100) * FORTIFICATIONS.upkeepPer100MYear[kind]) / FORT_DAYS_PER_YEAR;
      // průlom čeká na přestavbu, shnilá hradba na nule už nemá co udržovat; kus dílu s branou
      // s vlastní hradbou a valem se udržuje po svém
      const parts = ownParts(fort, s);
      // srovnaný val se neudržuje
      const wholeM = parts.length > 0 ? pieceLength(fort, s, length) : length;
      if (layerBuilt(segmentRampart(fort, s))) rampartNeed += perDay('rampart', wholeM);
      for (const part of parts) {
        if (layerBuilt(segmentRampart(fort, gatePartView(s, part)))) {
          rampartNeed += perDay('rampart', pieceLength(fort, s, length, part));
        }
      }
      const pieces: { layers: { extraAgeDays?: number }; view: FortSegment; m: number }[] = [
        { layers: s, view: s, m: parts.length > 0 ? pieceLength(fort, s, length) : length },
        ...parts.map((part) => ({
          layers: ownGatePart(s, part)!,
          view: gatePartView(s, part),
          m: pieceLength(fort, s, length, part),
        })),
      ];
      for (const { layers, view, m } of pieces) {
        const wall = segmentWall(fort, view);
        if (
          wall &&
          wall.builtDay !== null &&
          s.breachedDay === undefined &&
          (view.state ?? 1) > 0
        ) {
          const wallNeed = perDay(wall.kind, m);
          aging.push({ layers, need: wallNeed });
          need += wallNeed;
        }
      }
    }
    need += rampartNeed;
    // věž nad branou – údržba za věž (`tower.upkeepManDaysYear`), stárne navíc jako hradba
    const towers = fort.gates.filter((g) => g.towerDay != null && !busy.has(g.segment));
    need += (towers.length * FORTIFICATIONS.tower.upkeepManDaysYear) / FORT_DAYS_PER_YEAR;
    if (need <= EPSILON) continue;
    const given = Math.min(left, need);
    left -= given;
    used += given;
    const shortfall = (need - given) / need;
    if (shortfall <= EPSILON) continue;
    for (const { layers } of aging) layers.extraAgeDays = (layers.extraAgeDays ?? 0) + shortfall;
    for (const g of towers) g.towerExtraAgeDays = (g.towerExtraAgeDays ?? 0) + shortfall;
    if (rampartNeed > EPSILON) {
      const { years, height } = FORTIFICATIONS.rampartNeglect;
      const next =
        (fort.rampartHeight ?? 1) - (shortfall * (1 - height)) / (years * FORT_DAYS_PER_YEAR);
      fort.rampartHeight = Math.max(0, next);
    }
  }
  return { used };
}
