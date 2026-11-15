import { cloneState } from '../../core/clone';
import {
  busySegments,
  fortificationFullCost,
  gateStands,
  pincerArmKind,
  segmentBuilt,
  segmentKind,
  segmentWall,
  type FortGate,
} from '..';
import { currentLord } from '../../people/dynasty';
import { DEMOLITION } from '../../rules/rules-buildings';
import { FORTIFICATIONS } from '../../rules/rules-fortifications';
import type { Fortification, FortSegment, VillageState } from '../../types';
import {
  FORT_BUSY,
  FORT_UNKNOWN,
  villageFortifications,
  type FortificationResult,
} from './fortifications';

// Opustit a zbořit bránu (demolition.md – Rozhodnutí, Martin 14. 11. 2026; návrh Clauda):
// zbořená brána nechá mezeru šířky brány, opuštěná se přestane udržovat a po shnití zbyde mezera.
// Hradba dílu kolem brány stojí dál („Hradba je hradba, brána je brána.“ se mění jen tím, že brána
// má vlastní Opustit a Zbořit). Mezeru hráč zastaví běžnou stavbou opevnění od brány k bráně.

/** Brána zmizela (zbořená nebo shnilá) – v rozhraní důvod u Zbořit a Opustit. */
export const FORT_GATE_GONE = 'Brána už je zbořená.';
/** Díl brány ještě nestojí (rozestavěný) nebo je celý zbořený. */
const FORT_GATE_NOT_BUILT = 'Brána ještě nestojí.';
/** Opustit bránu, která už opuštěná je. */
const FORT_GATE_ABANDONED = 'Brána už je opuštěná.';
/** Vrátit bránu, která opuštěná není. */
const FORT_GATE_IN_USE = 'Brána není opuštěná.';

/** Vstup Opustit / Vrátit / Zbořit bránu – brána dílu `segment`. */
export interface GateUseInput {
  fortificationId: number;
  segment: number;
}

/** Co zboření brány udělá: práce (čd) a klády zpět na hromadu. */
export interface GateDemolition {
  laborManDays: number;
  logs: number;
}

/** Opevnění, brána a její díl ze stavu, nebo důvod. */
function gateOf(
  state: VillageState,
  input: GateUseInput,
): { fort: Fortification; gate: FortGate; seg: FortSegment } | { reason: string } {
  const fort = villageFortifications(state).find((f) => f.id === input.fortificationId);
  const gate = fort?.gates.find((g) => g.segment === input.segment);
  const seg = fort?.segments.find((s) => s.index === input.segment);
  if (!fort || !gate || !seg) return { reason: FORT_UNKNOWN };
  if (!gateStands(gate)) return { reason: FORT_GATE_GONE };
  if (!segmentBuilt(seg) || seg.demolishedDay !== undefined) return { reason: FORT_GATE_NOT_BUILT };
  return { fort, gate, seg };
}

/**
 * Práce a klády zboření brány (demolition.md – Čísla, jako kus úseku): brána je kus hradby dílu
 * šířky brány (`FORTIFICATIONS.gate.widthM`) – `laborShare` práce komplet, `logShare` klád × stav
 * dílu (holý val `rampartLaborShare` práce valu, klády žádné); klešťová brána a věž padnou s ní
 * – jejich práce a klády stejně (návrh Clauda). Klády necelé.
 */
function gateDemolitionCost(fort: Fortification, gate: FortGate, seg: FortSegment): GateDemolition {
  const width = FORTIFICATIONS.gate.widthM;
  const wall = segmentWall(fort, seg);
  const kind = fort.kind === 'rampart' ? (wall?.kind ?? null) : segmentKind(fort, seg);
  let labor = 0;
  let logs = 0;
  if (kind === null || kind === 'rampart') {
    labor += DEMOLITION.rampartLaborShare * fortificationFullCost('rampart', width).laborManDays;
  } else {
    const cost = fortificationFullCost(kind, width);
    labor += DEMOLITION.laborShare * cost.laborManDays;
    logs += DEMOLITION.logShare * cost.logs * seg.state;
  }
  if (typeof gate.pincerDay === 'number' && wall) {
    const arms = fortificationFullCost(pincerArmKind(wall.kind), FORTIFICATIONS.pincerGate.wallM);
    labor += DEMOLITION.laborShare * arms.laborManDays;
    logs += DEMOLITION.logShare * arms.logs;
  }
  if (typeof gate.towerDay === 'number') {
    labor += DEMOLITION.laborShare * FORTIFICATIONS.tower.laborManDays;
    logs += DEMOLITION.logShare * FORTIFICATIONS.tower.wood;
  }
  return { laborManDays: labor, logs };
}

/**
 * Co by zboření brány stálo a vrátilo (popisek tlačítka Zbořit), nebo důvod, proč nejde
 * (`FORT_GATE_GONE`, `FORT_BUSY` – na dílu brány běží stavba). Klády dolů na celé. Stav nemění.
 */
export function gateDemolition(
  state: VillageState,
  input: GateUseInput,
): GateDemolition | { reason: string } {
  const found = gateOf(state, input);
  if ('reason' in found) return found;
  const { fort, gate, seg } = found;
  const busy = busySegments(
    state.constructions,
    fort.id,
    fort.segments.map((s) => s.index),
  );
  if (busy.has(seg.index)) return { reason: FORT_BUSY };
  const cost = gateDemolitionCost(fort, gate, seg);
  return { laborManDays: cost.laborManDays, logs: Math.floor(cost.logs + 1e-9) };
}

/**
 * Hráč zboří bránu (demolition.md – Rozhodnutí): stavba opevnění `demolish` na dílu brány
 * (`fortGate.level` `demolish`) ze společné práce vsi jako zboření úseku, bez ceny předem; po
 * dokončení brána zmizí (`removeGate`) a klády přijdou na hromadu u brány. Vstupní stav nemění.
 */
export function startGateDemolition(
  state: VillageState,
  day: number,
  input: GateUseInput,
): FortificationResult {
  const check = gateDemolition(state, input);
  if ('reason' in check) return { ok: false, reason: check.reason };
  const found = gateOf(state, input) as { fort: Fortification; gate: FortGate; seg: FortSegment };
  const cost = gateDemolitionCost(found.fort, found.gate, found.seg);
  const lord = currentLord(state)?.name;
  const next = cloneState(state);
  next.constructions.push({
    id: next.nextId++,
    kind: 'fortification',
    startedDay: day,
    cost: cost.laborManDays,
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    fortificationId: input.fortificationId,
    fortWork: 'demolish',
    fortSegments: [{ index: input.segment, cost: cost.laborManDays, logs: cost.logs }],
    fortGate: { segment: input.segment, level: 'demolish' },
    fortLogsAt: { x: found.gate.x, z: found.gate.z },
    // kronika: vojvoda v den rozkazu, zbořená brána
    fortNote: {
      ...(lord === undefined ? {} : { lord }),
      lengthM: FORTIFICATIONS.gate.widthM,
      gate: true,
    },
  });
  return { ok: true, state: next };
}

/**
 * Hráč bránu opustí (`abandoned` true), nebo vrátí (demolition.md – Rozhodnutí): opuštěnou bránu
 * obyvatelé nepřestaví (díl brány ani věž – `decideFortRebuilds`, `decideTowerRebuilds`), shnije
 * a zbyde mezera (`settleAbandonedGates` v `decay.ts`). Vrácená se zase udržuje. Vstupní stav nemění.
 */
export function setGateAbandoned(
  state: VillageState,
  day: number,
  input: GateUseInput,
  abandoned: boolean,
): FortificationResult {
  const found = gateOf(state, input);
  if ('reason' in found) return { ok: false, reason: found.reason };
  if (abandoned === (found.gate.abandonedDay !== undefined)) {
    return { ok: false, reason: abandoned ? FORT_GATE_ABANDONED : FORT_GATE_IN_USE };
  }
  const next = cloneState(state);
  const gate = villageFortifications(next)
    .find((f) => f.id === input.fortificationId)!
    .gates.find((g) => g.segment === input.segment)!;
  if (abandoned) gate.abandonedDay = day;
  else delete gate.abandonedDay;
  return { ok: true, state: next };
}
