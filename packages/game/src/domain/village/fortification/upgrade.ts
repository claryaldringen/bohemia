import type { WallKind } from '../types';
import {
  gatePartView,
  GATE_PARTS,
  gonePartDay,
  ownGatePart,
  settleGateParts,
  storeGatePart,
  type GatePart,
} from './gate-parts';
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
 * Je díl hotový pro vylepšení na `target` – stojí na něm (na kusu dílu s branou `part`) hradba
 * `target`?
 */
export function upgradeDone(
  fort: Pick<Fortification, 'kind' | 'top' | 'rampartHeight'>,
  seg: FortSegment,
  target: WallKind,
  part?: GatePart,
): boolean {
  const base = upgradeBase(fort, part === undefined ? seg : gatePartView(seg, part));
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
 * běží dál). Průlom dílu vylepšení zavře. Kus dílu s branou (`part`) totéž jen na svém kusu –
 * vlastní vrstvy kusu (`storeGatePart`), brána a druhý kus stojí (Martin 8. 11. 2026: „Hradba je
 * hradba, brána je brána.“).
 */
export function completeUpgrade(
  fort: Pick<Fortification, 'kind' | 'top' | 'rampartHeight'>,
  seg: FortSegment,
  target: WallKind,
  day: number,
  part?: GatePart,
): void {
  if (part !== undefined) {
    const view = gatePartView(seg, part);
    completeUpgrade(fort, view, target, day);
    storeGatePart(fort, seg, part, view);
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
    fort.segments
      .filter((s) => s.demolishedDay === undefined)
      .flatMap((s) => [
        segmentKind(fort, s),
        // kusy dílů s branou s vlastní hradbou
        ...GATE_PARTS.filter(
          (p) => ownGatePart(s, p) !== undefined && gonePartDay(s, p) === undefined,
        ).map((p) => segmentKind(fort, gatePartView(s, p))),
      ]),
  );
  if (kinds.size !== 1) return;
  const kind = [...kinds][0]!;
  if (kind === fort.kind) return;
  // val doplněný vně hradby není val na křivce – opevnění zůstane druhem hradby (tvar pásu)
  if (kind === 'rampart' && fort.segments.some((s) => s.rampartOutside)) return;
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
  for (const s of fort.segments) settleGateParts(fort, s);
}
