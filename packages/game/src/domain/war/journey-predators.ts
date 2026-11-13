// Šelmy v hustém lese (lord-control.md – Nebezpečí, bod 3; wildlife.md – Nebezpečí pro lidi):
// osamělého vojvodu nebo malou družinu (nejvýš `JOURNEY.predatorGroupMax` mužů) v hustém lese
// napadne medvěd nebo vlci. Čísla jsou čísla lovu (`HUNT_RISK`) – žádná nová. Los je čistá funkce
// seedu výjezdu, dne a pořadí muže, takže nezávisí na kouskování dopočtu.
import { createRandom, deriveSeed } from '../landscape/random';
import type { Landscape } from '../landscape';
import { HUNT_RISK } from '../village/rules/rules-wildlife';
import type { VillageState } from '../village/types';
import { wildlifeOfEmptyMap } from '../village/wildlife/wildlife';
import type { JourneyMember } from './journey-types';
import { JOURNEY } from './rules-war';

/** Šelmy na mapě: je tu medvěd, jsou tu vlci? */
export interface MapWildlife {
  bear: boolean;
  wolves: boolean;
}

/** Jeden útok – index muže v `members`. */
export interface PredatorHit {
  index: number;
  outcome: 'wounded' | 'dead';
  by: 'bear' | 'wolves';
}

/**
 * Los dne pro skupinu na začátku dne. Nic, když skupina nestojí v hustém lese, je větší než
 * `JOURNEY.predatorGroupMax` (počítají se živí) nebo na mapě šelma není. Útočí medvěd (zranění
 * 5 % × (1 − boj ÷ 200), smrt 0,3 % × (2 − boj ÷ 100)), jinak vlci čísly lovu prasat (0,5 %,
 * 0,02 % × (2 − boj ÷ 100)); pěšky smrt × 2. Každý muž dostane vždy oba losy v pořadí podle
 * indexu (zranění, smrt), ať pořadí losů nezávisí na výsledku; smrt má přednost před zraněním.
 */
export function predatorDay(input: {
  members: readonly JourneyMember[];
  inForest: boolean;
  wildlife: MapWildlife;
  seed: number;
  day: number;
}): PredatorHit[] {
  const { members, wildlife } = input;
  if (!input.inForest || (!wildlife.bear && !wildlife.wolves)) return [];
  if (members.filter((m) => m.status === 'active').length > JOURNEY.predatorGroupMax) return [];
  const by = wildlife.bear ? 'bear' : 'wolves';
  const rules = wildlife.bear ? HUNT_RISK.bear : HUNT_RISK.boar;
  const random = createRandom(deriveSeed(input.seed, 'predators:' + input.day));
  const hits: PredatorHit[] = [];
  members.forEach((m, index) => {
    const injuryRoll = random.next();
    const deathRoll = random.next();
    if (m.status !== 'active') return;
    const fight = Math.min(100, Math.max(0, m.fight));
    const injury = wildlife.bear ? rules.injury * (1 - fight / 200) : rules.injury;
    const death = rules.death * (2 - fight / 100) * (m.mounted ? 1 : HUNT_RISK.footDeathFactor);
    if (deathRoll < death) hits.push({ index, outcome: 'dead', by });
    else if (injuryRoll < injury) hits.push({ index, outcome: 'wounded', by });
  });
  return hits;
}

/** Zvěř prázdné mapy podle krajiny – počítá se jednou (krajina se nemění). */
const EMPTY_MAPS = new WeakMap<Landscape, MapWildlife>();

/**
 * Šelmy na mapě: mapa se vsí má zvěř té vsi (ulovený medvěd = bezpečno, dokud se nevrátí), prázdná
 * mapa nebo ves bez údajů o zvěři (`wildlife` chybí) zvěř na stropu podle krajiny kolem středu.
 */
export function wildlifeOfMap(
  map: { landscape: Landscape; villageIds: readonly string[] },
  village: VillageState | null,
): MapWildlife {
  if (village?.wildlife) {
    return { bear: village.wildlife.bear.present, wolves: village.wildlife.wolves > 0 };
  }
  let cached = EMPTY_MAPS.get(map.landscape);
  if (!cached) {
    const fresh = wildlifeOfEmptyMap(map.landscape);
    cached = { bear: fresh.bear.present, wolves: fresh.wolves > 0 };
    EMPTY_MAPS.set(map.landscape, cached);
  }
  return cached;
}
