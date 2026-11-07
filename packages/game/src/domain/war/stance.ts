import {
  defenderMultiplier,
  refugeAdmit,
  refugeCapacity,
  surrenderThreshold,
} from '../village/fortification';
import type { Arrival } from '../village/fortification';
import { FORTIFICATIONS } from '../village/rules-fortifications';
import { ageYears, isAway } from '../village/people';
import type { DefenseStance, HerdSpecies, VillageState } from '../village/types';
import type { BattleField, BattleFort } from './battle';
import { houseGroups, type Defender } from './defenders';
import { fleeParty, isOverpowered, nearestForest, type FleeParty } from './flight';
import type { Pos } from './march-grid';
import { dist2 } from './orders';
import { TICKS_PER_SECOND } from './ticks';
import { WAR } from './rules-war';

// Postoje vsi před bojem (war.md – Obránci – postoje a útěk; fortifications.md – Postoje vsi
// s opevněním, Útočiště). Vesničané spatří vojsko dřív, než dojde k boji, a podle postoje se
// rozdělí: do útočiště (opevnění je úkryt bližší než les – kdo stihne doběhnout před zavřením
// brány a vejde se), do lesa (raději utéct), vzdá se (bílá vlajka, při přesile), nebo zůstanou
// bránit dům. Kdo odešel, v boji nebojuje. Jen det-math.

/** Co ves odnesla a kam: útočiště a les, zásoby a dobytek. */
export interface ShelterReport {
  stance: DefenseStance;
  /** Lidé (id), kteří se schovali v útočišti. */
  refuge: number[];
  /** Lidé (id), kteří utekli do lesa. */
  forest: number[];
  /** Lidé (id), kteří se vzdali (skupina domů vzdala). */
  surrendered: number[];
  /** Zásoby (kg) odnesené do útočiště a do lesa – útočník je nedostane. */
  carriedKg: number;
  /** Dobytek v útočišti a v lese (kusy podle druhu); zbytek zůstal ve vsi. */
  livestockRefuge: Record<HerdSpecies, number>;
  livestockForest: Record<HerdSpecies, number>;
}

/** Útočník pro rozhodování vsi – poloha a jezdec. */
export interface Sighted {
  pos: Pos;
  mounted: boolean;
}

export interface StanceInput {
  state: VillageState;
  day: number;
  stance: DefenseStance;
  /** Soupis obránců (`defenderRoster`). */
  defenders: readonly Defender[];
  attackers: readonly Sighted[];
  field: BattleField;
  /**
   * Posel z jiné vsi rodu ohlásil vojsko předem (war.md – Obránci, Kdy; `VillageState.armySeen`):
   * ves se zachovala podle postoje dřív, než vojsko spatřila – do útočiště doběhnou všichni, kdo se
   * vejdou (brány se zavřou až za nimi).
   */
  warned?: boolean;
}

export interface StancePlan {
  /** Kdo bojuje (a kde) – vstup `openBattle`. */
  fighters: Defender[];
  shelter: ShelterReport;
}

const SPECIES: readonly HerdSpecies[] = ['sheep', 'goat', 'pig', 'cow'];
const none = (): Record<HerdSpecies, number> => ({ sheep: 0, goat: 0, pig: 0, cow: 0 });

/** Takty, které trvá cesta `m` metrů tempem vojska. */
const ticksFor = (m: number): number =>
  Math.ceil((m / WAR.pace.metersPerSecond) * TICKS_PER_SECOND);

/** Takt, od kterého se do opevnění nikdo nedostane: první útočník do 30 m od brány. */
function gateCloseTick(bf: BattleFort, attackers: readonly Sighted[]): number {
  if (bf.fort.gates.length === 0 || attackers.length === 0) return Infinity;
  const r = FORTIFICATIONS.gatesCloseWithinM;
  let best = Infinity;
  for (const gate of bf.fort.gates) {
    for (const a of attackers) {
      const d = Math.sqrt(dist2(a.pos, gate));
      best = Math.min(best, ticksFor(Math.max(0, d - r)));
    }
  }
  return best;
}

/**
 * Rozdělení vsi podle postoje. Útočiště (je-li opevnění s plochou): všichni přítomní lidé a dobytek
 * se tam vydají; kdo stihne doběhnout před zavřením brány a vejde se, je uvnitř (muži se brání ve
 * středu opevnění, ostatní nebojují). Kdo zůstal venku, jedná skupina domů podle postoje: bránit se
 * u domů; vzdát se při přesile (útočníků víc než 1,5× mužů skupiny, jezdec za dva), jinak bránit;
 * raději utéct do nejbližšího lesa s dobytkem – bez lesa jako „vzdát se při přesile“. Poslední muž
 * rodu doma se nevzdá, vždy uteče.
 */
export function planDefense(input: StanceInput): StancePlan {
  const { state, day, stance, attackers, field } = input;
  const groupOf = houseGroups(state.dwellings);
  const homes = new Map(state.dwellings.map((d) => [d.id, d]));
  const people = state.people
    .filter((p) => !isAway(p, day))
    .sort((a, b) => a.id - b.id)
    .map((p) => {
      const home = homes.get(p.dwellingId) ?? state.dwellings[0];
      const pos: Pos = home ? { x: home.position.x, z: home.position.z } : { x: 0, z: 0 };
      return {
        id: p.id,
        pos,
        group: home ? (groupOf.get(home.id) ?? 0) : 0,
        age: ageYears(p.bornDay, day),
      };
    });
  const fighterOf = new Map(input.defenders.map((d) => [d.personId, d]));
  const shelter: ShelterReport = {
    stance,
    refuge: [],
    forest: [],
    surrendered: [],
    carriedKg: 0,
    livestockRefuge: none(),
    livestockForest: none(),
  };
  const inRefuge = new Map<number, Pos>();

  // --- útočiště: nejbližší opevnění s plochou ---
  const forts = field.forts
    .map((bf) => ({ bf, capacity: refugeCapacity(field.geo, bf.fort) }))
    .filter((f) => f.capacity > 0 && f.bf.shapes.length > 0);
  if (forts.length > 0 && people.length > 0) {
    const nearest = (p: Pos): (typeof forts)[number] =>
      forts.reduce((a, b) => (dist2(b.bf.center, p) < dist2(a.bf.center, p) ? b : a));
    const byFort = new Map<(typeof forts)[number], typeof people>();
    for (const p of people) {
      const f = nearest(p.pos);
      byFort.set(f, [...(byFort.get(f) ?? []), p]);
    }
    const centre = state.dwellings[0]?.position ?? { x: 0, z: 0 };
    const herdFort = nearest({ x: centre.x, z: centre.z });
    let livestockLeft = fleeParty(state, day).livestock;
    for (const [fort, members] of byFort) {
      const close = input.warned ? Infinity : gateCloseTick(fort.bf, attackers);
      const arrivals: Arrival[] = [];
      const order = members
        .map((p) => ({ p, tick: ticksFor(Math.sqrt(dist2(p.pos, fort.bf.center))) }))
        .sort((a, b) => a.tick - b.tick || a.p.id - b.p.id);
      for (const o of order)
        arrivals.push({
          kind: o.p.age >= WAR.flight.adultFromYears ? 'adult' : 'child',
          count: 1,
          tick: o.tick,
        });
      const herdTick = ticksFor(Math.sqrt(dist2(centre, fort.bf.center)));
      if (fort === herdFort) {
        for (const sp of SPECIES) {
          if (livestockLeft[sp] > 0)
            arrivals.push({
              kind: sp === 'cow' ? 'cow' : sp,
              count: livestockLeft[sp],
              tick: herdTick,
            });
        }
      }
      const result = refugeAdmit(fort.capacity, arrivals, close);
      // lidé: stejný druh místa, přijatí jsou první z těch, kdo stihli doběhnout
      const admittedPeople = result.admitted
        .filter((a) => a.kind === 'adult' || a.kind === 'child')
        .reduce((n, a) => n + a.count, 0);
      const early = order.filter((o) => o.tick <= close).slice(0, admittedPeople);
      for (const o of early) inRefuge.set(o.p.id, fort.bf.center);
      for (const a of result.admitted) {
        if (a.kind === 'adult' || a.kind === 'child') continue;
        shelter.livestockRefuge[a.kind as HerdSpecies] += a.count;
      }
      shelter.carriedKg += result.carriedKg;
      if (fort === herdFort) {
        livestockLeft = { ...livestockLeft };
        for (const sp of SPECIES) livestockLeft[sp] -= shelter.livestockRefuge[sp];
      }
    }
    shelter.refuge = [...inRefuge.keys()];
    shelter.carriedKg = Math.min(shelter.carriedKg, Math.max(0, state.storesKg));
  }

  // --- kdo zůstal venku: po skupinách domů ---
  const fighters: Defender[] = [];
  // za opevněním se bojuje u středu; při postoji „vzdát se“ se skupina uvnitř vzdá, je-li přesila
  // větší než 1,5 × obránců × násobek opevnění (poslední muž rodu se nevzdá, brání se)
  const insideMen = new Map<Pos, Defender[]>();
  for (const [personId, pos] of inRefuge) {
    const d = fighterOf.get(personId);
    if (d && !d.atHouseOnly) insideMen.set(pos, [...(insideMen.get(pos) ?? []), d]);
  }
  for (const [pos, men] of insideMen) {
    const mult = fortMultiplierAt(field, pos, attackers[0]?.pos ?? { x: pos.x + 1000, z: pos.z });
    const gives = stance === 'surrender' && fortSurrenders(attackers, men.length, mult);
    for (const d of men) {
      if (gives && !d.lastLine) shelter.surrendered.push(d.personId);
      else fighters.push({ ...d, pos: { ...pos } });
    }
  }
  const outside = people.filter((p) => !inRefuge.has(p.id));
  const groupIds = [...new Set(outside.map((p) => p.group))].sort((a, b) => a - b);
  const fledSet = new Set<number>();
  for (const g of groupIds) {
    const members = outside.filter((p) => p.group === g);
    const men = members
      .map((m) => fighterOf.get(m.id))
      .filter((d): d is Defender => !!d && !d.atHouseOnly);
    const here = members[0]!.pos;
    const forest = nearestForest(field.grid, here);
    const overpowered = isOverpowered(attackers, men.length);
    let action: 'fight' | 'forest' | 'surrender';
    if (stance === 'defend') action = 'fight';
    else if (stance === 'surrender') action = overpowered ? 'surrender' : 'fight';
    else action = forest !== null ? 'forest' : overpowered ? 'surrender' : 'fight';
    for (const m of members) {
      const d = fighterOf.get(m.id);
      const last = d?.lastLine === true;
      if (action === 'fight' || (last && forest === null)) {
        if (d) fighters.push(d);
      } else if (action === 'forest' || last) {
        shelter.forest.push(m.id);
        fledSet.add(m.id);
      } else {
        shelter.surrendered.push(m.id);
      }
    }
  }
  fighters.sort((a, b) => a.personId - b.personId);

  // zásoby a dobytek těch, kdo utekli do lesa
  if (fledSet.size > 0) {
    const party: FleeParty = fleeParty(state, day, fledSet);
    shelter.carriedKg = Math.min(Math.max(0, state.storesKg), shelter.carriedKg + party.carriedKg);
    if (stance === 'flee') {
      for (const sp of SPECIES) {
        const left = fleeParty(state, day).livestock[sp] - shelter.livestockRefuge[sp];
        shelter.livestockForest[sp] = Math.max(0, left);
      }
    }
  }
  return { fighters, shelter };
}

/** Násobek opevnění (bez 1,5 domácího prostředí), jak ho čte práh vzdání za opevněním. */
export function fortMultiplierAt(field: BattleField, at: Pos, from: Pos): number {
  return (
    defenderMultiplier(
      field.geo,
      field.forts.map((x) => x.fort),
      at,
      from,
      field.day,
    ) / FORTIFICATIONS.defenderKnowsPlace
  );
}

/**
 * Vzdá se skupina za opevněním? Útočníků v dohledu víc než 1,5 × obránců × násobek opevnění
 * (`surrenderThreshold`; jezdec za dva).
 */
export function fortSurrenders(
  attackers: readonly Sighted[],
  defenders: number,
  fortMultiplier: number,
): boolean {
  return isOverpowered(attackers, defenders, surrenderThreshold(defenders, fortMultiplier));
}
