import { dateOfDayIndex } from '../../calendar';
import { WAR } from '../../war/rules-war';
import { FORTIFICATIONS } from '../rules-fortifications';
import type { WallKind } from '../types';
import { layerBuilt, segmentRampart, segmentState, segmentWall } from './life';
import { gatePincerStands, gateTowerStands } from './pincer';
import type { FortSegment, Fortification } from './types';

// Přechod hradby (fortifications.md – Hradby a obrana, Přechod hradby; Martin 8. 11. 2026): čistá
// doména – které postupy místo nabízí, kolik stojí mužohodin a jak dlouho trvá pohyb jednoho muže.
// Bitva (`war/ladders.ts`, `war/wall-defense.ts`) a NPC velitel z toho jen čtou. Čísla jsou
// v `FORTIFICATIONS.assault` a `FORTIFICATIONS.defense`.

/** Postup přes místo: mezera, přelézt plot, žebřík, prosekat, vypálit, odkopat, podkopat. */
export type AssaultMethod = 'open' | 'climb' | 'ladder' | 'cut' | 'burn' | 'dig' | 'mine';

/** Co na místě stojí: hradba se stavem, val s příkopem (voda jen napuštěná a nezamrzlá), brána. */
export interface CrossingLayers {
  wall: { kind: WallKind; state: number } | null;
  rampart: { height: number; water: boolean } | null;
  gate: { pincer: boolean; tower: boolean } | null;
}

/** Jeden postup místa: práce, otepi a hoření pro oheň, zasypání před ním. */
export interface AssaultStep {
  method: AssaultMethod;
  manHours: number;
  /** Mužohodiny sběru otepí (jen oheň). */
  fuelManHours: number;
  /** Hodiny hoření (jen oheň, nezávisí na počtu mužů). */
  burnHours: number;
  /** Co se musí napřed zasypat; při obojím `moat` (součet práce v `fillManHours`). */
  fill: 'rampart' | 'moat' | null;
  fillManHours: number;
}

/** Zimní zamrznutí vodního příkopu: měsíce 12, 1, 2. */
export function moatFrozen(day: number): boolean {
  return FORTIFICATIONS.moat.frozenMonths.includes(dateOfDayIndex(day).month);
}

/**
 * Vrstvy místa ke dni `day`: hradba (stav podle stáří; chybí, je-li úsek otevřený či nedostavěný),
 * val, a je-li místo bránou, její vylepšení. Voda jen napuštěná a nezamrzlá.
 */
export function crossingLayers(
  fort: Fortification,
  seg: FortSegment,
  day: number,
  atGate: boolean,
): CrossingLayers {
  const open = seg.breachedDay !== undefined || seg.demolishedDay !== undefined;
  const wallLayer = open ? null : segmentWall(fort, seg);
  const wall =
    wallLayer && wallLayer.builtDay !== null
      ? { kind: wallLayer.kind, state: segmentState(fort, seg, day) }
      : null;
  const rampartLayer = open ? null : segmentRampart(fort, seg);
  const rampart = layerBuilt(rampartLayer)
    ? { height: rampartLayer!.height, water: rampartLayer!.water && !moatFrozen(day) }
    : null;
  let gate: CrossingLayers['gate'] = null;
  if (atGate) {
    const g = fort.gates.find((x) => x.segment === seg.index);
    gate = {
      pincer: g !== undefined && gatePincerStands(g, day),
      // dožilá věž bez přestavby po chátrání spadne (`gateTowerStands`)
      tower: g !== undefined && gateTowerStands(g, day),
    };
  }
  return { wall, rampart, gate };
}

const A = FORTIFICATIONS.assault;

function step(method: AssaultMethod, extra: Partial<AssaultStep> = {}): AssaultStep {
  return {
    method,
    manHours: 0,
    fuelManHours: 0,
    burnHours: 0,
    fill: null,
    fillManHours: 0,
    ...extra,
  };
}

/**
 * Všechny postupy místa. Práce a hoření se násobí stavem hradby (poloviční hradba = poloviční
 * práce); stav 0 nebo žádná hradba = mezera (`open`). Vodní příkop je napřed nutné zasypat
 * u každého postupu mimo bránu – brána má přes příkop hráz či most (návrh Clauda); oheň u palisády
 * na valu navíc zasypat val. Sekat a pálit se smí až po výstupu na val a kopat ze dna příkopu – to
 * je věcí pohybu, ne postupu.
 */
export function assaultSteps(layers: CrossingLayers): AssaultStep[] {
  const { wall, rampart, gate } = layers;
  const moat = rampart?.water === true;
  const steps: AssaultStep[] = [];
  if (!wall || wall.state <= 0) steps.push(step('open'));
  else {
    const s = wall.state;
    const m = A.manHours;
    const kind = wall.kind;
    if (kind === 'fence') {
      if (gate) steps.push(step('cut', { manHours: m.cutGate.fence }));
      else {
        steps.push(step('climb'));
        steps.push(step('cut', { manHours: m.cutFence * s }));
      }
    } else if (gate) {
      steps.push(step('cut', { manHours: m.cutGate[kind] * s }));
      steps.push(
        step('burn', {
          fuelManHours: A.burn.gate.fuelManHours * s,
          burnHours: A.burn.gate.burnHours * s,
        }),
      );
      steps.push(step('ladder', { manHours: m.ladder }));
    } else {
      steps.push(step('ladder', { manHours: m.ladder }));
      if (kind === 'palisade' || kind === 'walkway') {
        steps.push(step('cut', { manHours: m.cutPalisade * s }));
        steps.push(step('dig', { manHours: m.dig * s }));
        steps.push(
          step('burn', {
            fuelManHours: A.burn.palisade.fuelManHours * s,
            burnHours: A.burn.palisade.burnHours * s,
            ...(rampart ? { fill: 'rampart' as const, fillManHours: m.fillRampart } : {}),
          }),
        );
      } else {
        steps.push(step('mine', { manHours: m.mine[kind] * s }));
      }
    }
  }
  // brána: hráz či most přes vodní příkop – branou se jde bez zasypání
  if (!moat || gate) return steps;
  return steps.map((p) => ({
    ...p,
    fill: 'moat' as const,
    fillManHours: p.fillManHours + A.manHours.fillMoat,
  }));
}

/**
 * Hodiny postupu: pracuje nejvýš 4 muži na místo; otepi do 100 m, dál úměrně déle; hoří 2
 * přikládající (jeden muž zdrží hoření dvojnásobně). Bez mužů nikdy.
 */
export function assaultHours(step: AssaultStep, men: number, fuelDistanceM: number): number {
  const workers = Math.min(men, A.maxMen);
  if (workers <= 0) return Number.POSITIVE_INFINITY;
  const fuel = step.fuelManHours * Math.max(1, fuelDistanceM / A.burn.fuelM);
  const burn =
    step.burnHours > 0
      ? (step.burnHours * A.burn.lighters) / Math.min(workers, A.burn.lighters)
      : 0;
  return (step.manHours + step.fillManHours + fuel) / workers + burn;
}

/** Podíl práce, po kterém jsou kopáči podkopu pod zemí a obránci je nezasáhnou. */
export function mineUnderground(done: number, required: number): boolean {
  return required > 0 && done >= required * A.undergroundShare - 1e-9;
}

const TPS = WAR.campaign.ticksPerSecond;

/**
 * Pohyb jednoho muže v taktech: opřít žebřík, vylézt, přetáhnout druhý žebřík (jen palisáda bez
 * ochozu, jednou) a slézt dovnitř; plot se jen přelézá (`up`). Hradba na koruně valu výšky
 * `rampart` (0–1; Martin 9. 11. 2026) – žebřík je o výšku valu delší, výstup o `upRampart` s ×
 * výška déle; plot na valu se přelézá jako na zemi (na val se vyleze chůzí – `rampartPace`).
 */
export function climbTicks(
  wall: WallKind,
  rampart: number | null = null,
): {
  lean: number;
  up: number;
  overLadder: number;
  down: number;
} {
  const c = A.climbSeconds;
  if (wall === 'fence') return { lean: 0, up: c.fence * TPS, overLadder: 0, down: 0 };
  return {
    lean: c.lean * TPS,
    up: c.up[wall] * TPS + Math.round(c.upRampart * (rampart ?? 0) * TPS),
    overLadder: wall === 'palisade' ? c.overLadder * TPS : 0,
    down: c.down[wall] * TPS,
  };
}

/** Tempo přes val a příkop: 1 ÷ (1 + 3 × výška); plný val čtvrtinové. */
export function rampartPace(height: number): number {
  return 1 / (1 + A.rampartSlowdown * height);
}

/** Únava po sestupu a výstupu valu: 1 − 0,15 × výška. */
export function rampartFatigue(height: number): number {
  return 1 - A.rampartFatigue * height;
}

/** Síla po `ticksSince` taktech od únavy `start`: lineárně zpět k 1 za 120 taktů. */
export function fatigueFactor(start: number, ticksSince: number): number {
  const t = Math.min(1, Math.max(0, ticksSince / A.fatigueTicks));
  return start + (1 - start) * t;
}

/** Obsazenost místa: obránců na 5 m ochozu (nejvýš 1) – pro správce, panel i NPC velitele. */
export function fortOccupancy(men: number, lengthM: number): number {
  if (lengthM <= 0) return 1;
  return Math.min(1, (men * FORTIFICATIONS.defense.perDefenderM) / lengthM);
}
