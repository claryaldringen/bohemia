import type { Landscape, ObstacleLayer } from '../../../landscape';
import { cloneState } from '../../core/clone';
import type { RoadPoint } from '../../types';
import {
  addGate,
  busySegments,
  fortificationCost,
  fortOutlineOf,
  fortSegments,
  GATE_PARTS,
  gatePartLengthM,
  gatePartView,
  gateStands,
  layerBuilt,
  PIECE_MIN_M,
  segmentRampart,
  segmentWall,
  type FortCost,
  type FortGate,
} from '..';
import type { Walk } from '../../paths/walking';
import { FORTIFICATIONS } from '../../rules/rules-fortifications';
import type { FortKind, Fortification, FortSegment, VillageState } from '../../types';
import {
  addGateToFortification,
  FORT_BUSY,
  FORT_UNKNOWN,
  outlineOf,
  pushWork,
  villageFortifications,
  type FortificationResult,
} from './fortifications';

// Otvor po zbořené (i shnilé opuštěné) bráně (demolition.md – Rozhodnutí, Martin 14. 11. 2026:
// „mezeru hráč zastaví stejně – běžnou stavbou od brány k bráně (nebo od konce hradby)“; D45).
// Otvor je tětiva brány (4 m) uvnitř dílu, ne celý díl – stav ho drží zbořená brána (`gates`).
// Návrh Clauda: běžná stavba opevnění ho zastaví hradbou dílu po staré křivce (body nejdou přidat
// – jinou trasu nese úsek od brány k bráně), cena jako nová hradba šířky brány; po dokončení brána
// zmizí a úseky kolem splynou (`closeGateGap`). Přidat bránu do dílu se zbořenou branou postaví
// bránu znovu do otvoru za tutéž cenu – v otvoru není z čeho ji udělat.

/** Brána dílu stojí, nebo díl bránu nemá – otvor po bráně tu není. */
export const FORT_GAP_NO_GATE = 'Tady otvor po bráně není.';
/** Kus hradby u otvoru nestojí – otvor je kus větší mezery od brány k bráně. */
export const FORT_GAP_SIDES = 'Hradba vedle otvoru nestojí – postavte úsek od brány k bráně.';
/** Kusy hradby po stranách otvoru jsou různé – díl by po zastavení nebyl jedna hradba. */
export const FORT_GAP_MIXED = 'Po stranách otvoru stojí různá hradba – napřed vylepšete nižší.';
/** Bránu jde postavit znovu jen do hradby (díl brány stojí). */
export const FORT_GAP_NO_WALL = 'Bránu jde postavit jen do stojící hradby.';

/** Jména druhů v důvodu – druh z rozcestníku opevnění. */
const KIND_NAMES: Record<FortKind, string> = {
  fence: 'plot',
  palisade: 'palisáda',
  walkway: 'palisáda',
  crib: 'roštová hradba',
  chamber: 'komorová hradba',
  rampart: 'val',
};

/** Otvor zastaví jen hradba, ve které brána stála. */
export function FORT_GAP_KIND(kind: FortKind): string {
  return `Otvor zastaví jen hradba kolem – ${KIND_NAMES[kind]}.`;
}

/** Druh pro rozcestník – ochoz je přístavba palisády (rozcestník ho nemá). */
function pickKind(kind: FortKind): FortKind {
  return kind === 'walkway' ? 'palisade' : kind;
}

/** Stojí na dílu (či kusu) celá hradba – základ i nástavba dostavěné a nezbořené? */
function layersStand(fort: Fortification, s: FortSegment): boolean {
  if (s.demolishedDay !== undefined) return false;
  const rampart = segmentRampart(fort, s);
  const wall = segmentWall(fort, s);
  if (rampart === null && wall === null) return false;
  return (rampart === null || layerBuilt(rampart)) && (wall === null || layerBuilt(wall));
}

/** Hradba v místě – val (vně hradby, s vodou v příkopu) a druh hradby, bez stáří. */
function wallSign(fort: Fortification, s: FortSegment): string {
  const rampart = segmentRampart(fort, s);
  const base = rampart
    ? `rampart${rampart.outside ? ':outside' : ''}${rampart.water ? ':water' : ''}`
    : '';
  return `${base}:${segmentWall(fort, s)?.kind ?? ''}`;
}

/** Druh hradby dílu brány – hradba (i na valu), holý val `rampart`. */
function gapKind(fort: Fortification, seg: FortSegment): FortKind {
  return segmentWall(fort, seg)?.kind ?? 'rampart';
}

/**
 * Cena otvoru – nová hradba dílu brány šířky brány (`FORTIFICATIONS.gate.widthM`): val i nástavba
 * na valu, jinak hradba (Cena – práce bez kácení a lámání, klády a kámen předem).
 */
function gapCost(fort: Fortification, seg: FortSegment): FortCost {
  const width = FORTIFICATIONS.gate.widthM;
  const wall = segmentWall(fort, seg);
  const parts = [
    ...(segmentRampart(fort, seg) !== null ? [fortificationCost('rampart', width)] : []),
    ...(wall ? [fortificationCost(wall.kind, width)] : []),
  ];
  return parts.reduce(
    (sum, c) => ({
      laborManDays: sum.laborManDays + c.laborManDays,
      logs: sum.logs + c.logs,
      stoneM3: sum.stoneM3 + c.stoneM3,
    }),
    { laborManDays: 0, logs: 0, stoneM3: 0 },
  );
}

/** Zbořená brána dílu `segment` a díl, nebo důvod. */
function goneGate(
  fort: Fortification,
  segment: number,
): { gate: FortGate; seg: FortSegment } | { reason: string } {
  const gate = fort.gates.find((g) => g.segment === segment);
  const seg = fort.segments.find((s) => s.index === segment);
  if (!gate || !seg || gateStands(gate)) return { reason: FORT_GAP_NO_GATE };
  return { gate, seg };
}

/**
 * Jde otvor po zbořené bráně dílu `segment` zastavit hradbou `target` (null – druh nekontrolovat,
 * jen najít otvor)? Kusy hradby po obou stranách otvoru stojí (`FORT_GAP_SIDES`; pahýl pod
 * `PIECE_MIN_M` se nepočítá) a mají tutéž hradbu jako díl (`FORT_GAP_MIXED`), druh z rozcestníku
 * je hradba kolem (`FORT_GAP_KIND`; palisáda i u palisády s ochozem). Vrátí druh a cenu, nebo
 * důvod. Běžící stavbu nekontroluje. Čistá funkce.
 */
export function gateGapFill(
  fort: Fortification,
  geo: Pick<Landscape, 'size' | 'cellSizeM'>,
  segment: number,
  target: FortKind | null,
): { kind: FortKind; cost: FortCost } | { reason: string } {
  const found = goneGate(fort, segment);
  if ('reason' in found) return found;
  const { gate, seg } = found;
  if (!layersStand(fort, seg)) return { reason: FORT_GAP_SIDES };
  const outline = fortOutlineOf(geo, fort, fort.kind);
  const shape = outline ? fortSegments(outline)[segment] : undefined;
  if (!shape) return { reason: FORT_GAP_NO_GATE };
  for (const part of GATE_PARTS) {
    if (gatePartLengthM(shape.lengthM, gate.offsetM, part) < PIECE_MIN_M) continue;
    const view = gatePartView(seg, part);
    if (!layersStand(fort, view)) return { reason: FORT_GAP_SIDES };
    if (wallSign(fort, view) !== wallSign(fort, seg)) return { reason: FORT_GAP_MIXED };
  }
  const kind = gapKind(fort, seg);
  if (target !== null && pickKind(target) !== pickKind(kind)) {
    return { reason: FORT_GAP_KIND(pickKind(kind)) };
  }
  return { kind, cost: gapCost(fort, seg) };
}

/** Vstup otvoru po bráně – zbořená brána dílu `segment`. */
export interface GateGapInput {
  fortificationId: number;
  segment: number;
}

/** Stavba v otvoru: `fill` – hradba, `rebuild` – brána; klády a kámen předem (`pushWork`). */
function startGapWork(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer,
  fort: Fortification,
  gate: FortGate,
  level: 'fill' | 'rebuild',
  cost: FortCost,
  walk: Walk | undefined,
): FortificationResult {
  const busy = busySegments(
    state.constructions,
    fort.id,
    fort.segments.map((s) => s.index),
  );
  if (busy.has(gate.segment)) return { ok: false, reason: FORT_BUSY };
  const next = cloneState(state);
  const missing = pushWork(
    next,
    day,
    obstacles,
    {
      fortificationId: fort.id,
      work: 'gate',
      plan: {
        segments: [{ index: gate.segment, cost: cost.laborManDays }],
        wood: cost.logs,
        ...(cost.stoneM3 > 0 ? { stoneM3: [cost.stoneM3] } : {}),
      },
      // klády a kámen se hledají od otvoru
      center: { x: gate.x, z: gate.z },
      clearedIds: [],
      clearedTrees: 0,
      fortGate: { segment: gate.segment, level },
    },
    walk,
  );
  if (missing) return { ok: false, reason: missing };
  return { ok: true, state: next };
}

/**
 * Hráč zastaví otvor po zbořené bráně běžnou stavbou opevnění (druh `target` z rozcestníku –
 * `gateGapFill`): stavba `gate` s `fortGate.level` `fill` na dílu brány, cena nové hradby šířky
 * brány; otvor zůstane otvorem, dokud není hotová (`completeGateWork` → `closeGateGap`). Díl
 * s jinou stavbou `FORT_BUSY`. Tvar obvodu se nemění. Vstupní stav nemění.
 */
export function startGateGapFill(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  input: GateGapInput & { target: FortKind },
  walk?: Walk,
): FortificationResult {
  const fort = villageFortifications(state).find((f) => f.id === input.fortificationId);
  if (!fort) return { ok: false, reason: FORT_UNKNOWN };
  const check = gateGapFill(fort, landscape, input.segment, input.target);
  if ('reason' in check) return { ok: false, reason: check.reason };
  const gate = fort.gates.find((g) => g.segment === input.segment)!;
  return startGapWork(state, day, obstacles, fort, gate, 'fill', check.cost, walk);
}

/**
 * Hráč postaví bránu do dílu se zbořenou branou (Přidat bránu – `addGateToFortification`): brána
 * přijde do otvoru po staré (ne na místo kliku) – otvor je díra v hradbě, jinde v dílu stojí hradba.
 * Díl musí stát (`FORT_GAP_NO_WALL`); cena jako zastavení otvoru (hradba šířky brány – brána
 * ve stojící hradbě nic navíc nestojí, v otvoru chybí dřevo), stavba `gate` s `fortGate.level`
 * `rebuild`. Vstupní stav nemění.
 */
export function startGateRebuild(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer,
  input: GateGapInput,
  walk?: Walk,
): FortificationResult {
  const fort = villageFortifications(state).find((f) => f.id === input.fortificationId);
  if (!fort) return { ok: false, reason: FORT_UNKNOWN };
  const found = goneGate(fort, input.segment);
  if ('reason' in found) return { ok: false, reason: found.reason };
  if (!layersStand(fort, found.seg)) return { ok: false, reason: FORT_GAP_NO_WALL };
  const cost = gapCost(fort, found.seg);
  return startGapWork(state, day, obstacles, fort, found.gate, 'rebuild', cost, walk);
}

/**
 * Hráč přidá bránu kliknutím na obvod (fortifications.md – Brány; use-case `addFortificationGate`):
 * padne-li klik do dílu se zbořenou branou, brána se postaví znovu do otvoru (`startGateRebuild`),
 * jinak `addGateToFortification` (nejvýš jedna brána na díl, ve stojící hradbě nic nestojí).
 * Vstupní stav nemění.
 */
export function addGateOrRebuild(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  input: { fortificationId: number; position: RoadPoint },
  walk?: Walk,
): FortificationResult {
  const fort = villageFortifications(state).find((f) => f.id === input.fortificationId);
  const outline = fort ? outlineOf(landscape, fort) : null;
  if (fort && outline) {
    const standing = fort.gates.filter(gateStands);
    const added = addGate(outline, standing, input.position);
    const fresh = 'error' in added ? undefined : added.find((g) => !standing.includes(g));
    const gone = fresh && fort.gates.find((g) => g.segment === fresh.segment);
    if (gone) {
      return startGateRebuild(
        state,
        day,
        obstacles,
        { fortificationId: fort.id, segment: gone.segment },
        walk,
      );
    }
  }
  return addGateToFortification(state, landscape, input.fortificationId, input.position);
}
