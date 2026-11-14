import { createRandom, deriveSeed } from '../landscape/random';
import { ageYears, isAway } from '../village/people/people';
import type { DefenseStance, HerdSpecies, VillageState } from '../village/types';
import { treeBelow, type VassalEdge } from '../vassalage/tree';
import { dist2 } from './orders';
import { MARCH_FOREST, marchCellCenter, type MarchGrid, type Pos } from './march-grid';
import { WAR } from './rules-war';

// Včasný útěk a skryté jámy (war.md – Obránci – postoje a útěk): kam, s čím a kdy se lidé vrátí,
// kdy se skupina vzdá při přesile a s jakou pravděpodobností útočník najde zapečetěnou jámu. Čisté
// funkce, jen det-math; náhoda ze seedu tažení a jámy.

/**
 * Postoj vsi, který platí – chybí-li, výchozí (evakuace). Stav vsi, kterou tažení čte bez převodu
 * (`migrateVillage` běží jen při dopočtu vsi), může nést zrušený postoj `'surrender'` – čte se jako
 * výchozí, stejně jako v převodu `stance-surrender` (závěrečná recenze, drobný 6).
 */
export function stanceOf(state: Pick<VillageState, 'defense'>): DefenseStance {
  const stance = state.defense?.stance;
  return stance === 'defend' || stance === 'flee' ? stance : WAR.flight.defaultStance;
}

/** Nejbližší hustý les (střed buňky mřížky pochodu) od bodu `from`; bez lesa null. */
export function nearestForest(grid: MarchGrid, from: Pos): Pos | null {
  let best: Pos | null = null;
  let bestD = Infinity;
  for (let c = 0; c < grid.flags.length; c++) {
    if ((grid.flags[c]! & MARCH_FOREST) === 0) continue;
    const p = marchCellCenter(grid, c);
    const d = dist2(p, from);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Co si skupina odnese: zásoby a dobytek (dobytek celý). */
export interface FleeParty {
  adults: number;
  /** Děti 7–15 let – nesou 10 kg. */
  children: number;
  /** Mladší děti – nic nenesou. */
  infants: number;
  /** Zásoby, které lidé odnesou (kg) – nejvýš tolik, kolik ves má. */
  carriedKg: number;
  livestock: Record<HerdSpecies, number>;
}

const SPECIES: readonly HerdSpecies[] = ['sheep', 'goat', 'pig', 'cow'];

/**
 * Co odnese skupina lidí `who` (jinak všichni přítomní) z vsi v den `day`: dospělý 25 kg, dítě
 * 7–15 let 10 kg, mladší nic; dobytek celý (podíl podle podílu odcházejících lidí). Zásoby nejvýš
 * do výše zásob vsi.
 */
export function fleeParty(state: VillageState, day: number, who?: ReadonlySet<number>): FleeParty {
  const present = state.people.filter((p) => !isAway(p, day));
  const going = who ? present.filter((p) => who.has(p.id)) : present;
  const f = WAR.flight;
  let adults = 0;
  let children = 0;
  let infants = 0;
  for (const p of going) {
    const age = ageYears(p.bornDay, day);
    if (age >= f.adultFromYears) adults++;
    else if (age >= f.childFromYears) children++;
    else infants++;
  }
  const share = present.length === 0 ? 0 : going.length / present.length;
  const livestock = { sheep: 0, goat: 0, pig: 0, cow: 0 };
  for (const sp of SPECIES) {
    const heads = (state.livestock?.herds[sp] ?? 0) + (state.livestock?.young[sp] ?? 0);
    livestock[sp] = Math.floor(heads * share + 1e-9);
  }
  const carriedKg = Math.min(
    Math.max(0, state.storesKg),
    adults * f.adultKg + children * f.childKg,
  );
  return { adults, children, infants, carriedKg, livestock };
}

/**
 * Najde útočník zapečetěnou jámu? Až když pobyl ve skupině domů aspoň 1 herní den; pak los ze
 * seedu tažení a jámy s pravděpodobností 30 % (war.md – Obránci; Martin: „s určitou
 * pravděpodobností“).
 */
export function pitFound(seed: number, pitId: number, daysInGroup: number): boolean {
  if (daysInGroup < 1 - 1e-9) return false;
  return createRandom(deriveSeed(seed, `pit:${pitId}`)).next() < WAR.pitFoundChance;
}

/** Den, kdy se lidé vrátí: 1 herní den po odchodu vojska z mapy. */
export function returnDayAfter(armyLeftDay: number): number {
  return armyLeftDay + WAR.flight.returnDays;
}

/**
 * Přesila (war.md – Vzdát se při přesile): útočníků v dohledu víc než 1,5× obránců; jezdec za dva
 * (návrh Clauda). `threshold` je horní mez bez přesily.
 */
export function attackerWeight(attackers: readonly { mounted: boolean }[]): number {
  let n = 0;
  for (const a of attackers) n += a.mounted ? 2 : 1;
  return n;
}

export function isOverpowered(
  attackers: readonly { mounted: boolean }[],
  defenders: number,
  threshold: number = WAR.surrenderRatio * defenders,
): boolean {
  const weight = attackerWeight(attackers);
  return weight > 0 && weight > threshold + 1e-9;
}

/**
 * Je vojsko neškodné pro ves (Martin 3. 11. 2026: vlastní vojska a vojska pána a vazalů)? Rody
 * `armyHouse` a `villageHouse` jsou táž, nebo jeden leží ve stromu vazalů druhého.
 */
export function isHarmlessArmy(
  armyHouse: string,
  villageHouse: string,
  edges: readonly VassalEdge[],
): boolean {
  if (armyHouse === villageHouse) return true;
  return (
    treeBelow(edges, armyHouse).includes(villageHouse) ||
    treeBelow(edges, villageHouse).includes(armyHouse)
  );
}
