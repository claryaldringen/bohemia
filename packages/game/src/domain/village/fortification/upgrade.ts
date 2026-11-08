import type { WallKind } from '../types';
import { layerBuilt, segmentKind, segmentRampart, segmentWall, WALL_ORDER } from './life';
import type { FortSegment, Fortification } from './types';

// Vylepšení po úsecích (fortifications.md – Hradby a obrana, Druhy a postup vylepšení;
// demolition.md – Opevnění): co na dílu stojí, zda ho vylepšení na cílovou hradbu mění a jak díl
// vypadá, když na něj práce dojde. Stará hradba stojí a brání, dokud díl není hotový.

/**
 * Co na dílu stojí z pohledu vylepšení: hradba (`wall`, i na valu), holý val (`rampart` – i se
 * zbořenou nástavbou), nebo mezera (`gap` – zbořený nebo nedostavěný díl).
 */
export type UpgradeBase =
  { kind: 'wall'; wall: WallKind; onRampart: boolean } | { kind: 'rampart' } | { kind: 'gap' };

/** Co na dílu stojí (`UpgradeBase`) – čte jen vrstvy. */
export function upgradeBase(
  fort: Pick<Fortification, 'kind' | 'top' | 'rampartHeight'>,
  seg: FortSegment,
): UpgradeBase {
  if (seg.demolishedDay !== undefined) return { kind: 'gap' };
  const wall = segmentWall(fort, seg);
  const rampart = segmentRampart(fort, seg);
  if (wall !== null && layerBuilt(wall)) {
    return { kind: 'wall', wall: wall.kind, onRampart: rampart !== null };
  }
  if (rampart !== null && layerBuilt(rampart)) return { kind: 'rampart' };
  return { kind: 'gap' };
}

/** Stupeň hradby 1–5 (`WALL_ORDER`). */
export function wallRank(kind: WallKind): number {
  return WALL_ORDER.indexOf(kind) + 1;
}

/** Mění vylepšení na hradbu `target` díl? Hradbu stejnou či vyšší nechá (nižší stupeň nic nevrací). */
export function needsUpgrade(base: UpgradeBase, target: WallKind): boolean {
  return base.kind !== 'wall' || wallRank(base.wall) < wallRank(target);
}

/** Staví hradba na dílu na valu (holý val, nebo hradba na valu)? Mezera dostane hradbu bez valu. */
export function upgradeOnRampart(base: UpgradeBase): boolean {
  return base.kind === 'rampart' || (base.kind === 'wall' && base.onRampart);
}

/**
 * Je díl hotový pro vylepšení na `target`: celý díl – stojí na něm hradba `target`; kus dílu
 * s branou (`part`) – kus už není mezera.
 */
export function upgradeDone(
  fort: Pick<Fortification, 'kind' | 'top' | 'rampartHeight'>,
  seg: FortSegment,
  target: WallKind,
  part?: 'before' | 'after',
): boolean {
  if (part === 'before') return seg.demolishedBeforeGate === undefined;
  if (part === 'after') return seg.demolishedAfterGate === undefined;
  const base = upgradeBase(fort, seg);
  return base.kind === 'wall' && base.wall === target;
}

/** Druh dílu bez valu – přepis jen, když se liší od druhu opevnění. */
function setWallKind(fort: Pick<Fortification, 'kind'>, seg: FortSegment, kind: WallKind): void {
  if (kind === fort.kind) delete seg.kind;
  else seg.kind = kind;
}

/**
 * Práce vylepšení došla na díl (mutuje díl): stojí na něm hradba `target`. Mezera dostane hradbu
 * bez valu (den dokončení, plný stav, už není zbořená); na valu nástavba (`top`, `topBuiltDay`);
 * hradba bez valu nový druh a den. Ochoz je přístavba – palisáda drží svůj den i stav (stáří kůlů
 * běží dál). Průlom dílu vylepšení zavře. Kus dílu s branou (`part`) přestane být mezerou – druh
 * dílu s branou se nemění.
 */
export function completeUpgrade(
  fort: Pick<Fortification, 'kind' | 'top' | 'rampartHeight'>,
  seg: FortSegment,
  target: WallKind,
  day: number,
  part?: 'before' | 'after',
): void {
  if (part === 'before') {
    delete seg.demolishedBeforeGate;
    return;
  }
  if (part === 'after') {
    delete seg.demolishedAfterGate;
    return;
  }
  const base = upgradeBase(fort, seg);
  delete seg.breachedDay;
  delete seg.burnedDay;
  if (base.kind === 'gap') {
    seg.builtDay = day;
    seg.state = 1;
    setWallKind(fort, seg, target);
    delete seg.demolishedDay;
    delete seg.top;
    delete seg.topBuiltDay;
    delete seg.rampartHeight;
    delete seg.rampartOutside;
    delete seg.moatDay;
    delete seg.extraAgeDays;
    return;
  }
  const annex = base.kind === 'wall' && base.wall === 'palisade' && target === 'walkway';
  if (upgradeOnRampart(base)) {
    if (target === fort.top) delete seg.top;
    else seg.top = target;
    if (!annex) {
      seg.topBuiltDay = day;
      seg.state = 1;
      delete seg.extraAgeDays;
    }
    return;
  }
  setWallKind(fort, seg, target);
  if (!annex) {
    seg.builtDay = day;
    seg.state = 1;
    delete seg.extraAgeDays;
  }
}

/**
 * Po vylepšení (mutuje opevnění): mají-li všechny nezbořené díly týž druh jiný než opevnění,
 * stane se druhem opevnění a přepisy dílů zmizí (plot, který je celý palisádou, je palisáda).
 * Opevnění, které už nemá val, ztratí i nástavbu valu.
 */
export function settleUpgrade(fort: Fortification): void {
  const kinds = new Set(
    fort.segments.filter((s) => s.demolishedDay === undefined).map((s) => segmentKind(fort, s)),
  );
  if (kinds.size !== 1) return;
  const kind = [...kinds][0]!;
  if (kind === fort.kind) return;
  fort.kind = kind;
  for (const s of fort.segments) {
    if (s.kind === kind || s.demolishedDay !== undefined) delete s.kind;
  }
  if (kind !== 'rampart' && fort.top !== undefined) {
    delete fort.top;
    for (const s of fort.segments) {
      delete s.top;
      delete s.topBuiltDay;
    }
  }
}
