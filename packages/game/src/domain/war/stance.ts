import { refugeAdmit, refugeCapacity } from '../village/fortification';
import type { Arrival, RefugeResult } from '../village/fortification';
import { FORTIFICATIONS } from '../village/rules/rules-fortifications';
import { ageYears, isAway } from '../village/people/people';
import type { DefenseStance, HerdSpecies, VillageState } from '../village/types';
import type { BattleField, BattleFort } from './battle';
import { houseGroups, type Defender } from './defenders';
import { fleeParty, isOverpowered, type FleeParty } from './flight';
import { nearestReachableForest } from './forest-doors';
import type { Pos } from './march-grid';
import { dist2 } from './orders';
import { TICKS_PER_SECOND } from './ticks';
import { WAR } from './rules-war';
import { crownAt, towerPosts, wallPosts } from './wall-defense';

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
  /**
   * Opevnění útočiště (pořadí na bojišti) pro každého z `refuge` ve stejném pořadí – dobytí
   * útočiště (`rout.ts`); chybí u starších bojů.
   */
  refugeAt?: number[];
  /** Lidé (id), kteří utekli do lesa. */
  forest: number[];
  /** Lidé (id), kteří se vzdali (skupina domů vzdala). */
  surrendered: number[];
  /** Zásoby (kg) odnesené do útočiště a do lesa – útočník je nedostane. */
  carriedKg: number;
  /** Dobytek v útočišti a v lese (kusy podle druhu); zbytek zůstal ve vsi. */
  livestockRefuge: Record<HerdSpecies, number>;
  livestockForest: Record<HerdSpecies, number>;
  /**
   * Uprchlíci v hradišti bez mužů (`StanceInput.refugeLoad` – ženy, děti, starší) a jejich dobytek:
   * kolik je v útočišti a kolik stojí venku (war.md – Varování, poslové a útěk do hradiště – Místo
   * v hradišti). Muži uprchlíků jsou v `refuge` pod zápornými čísly jako hosté. Chybí bez uprchlíků.
   */
  refugees?: RefugeesPlace;
}

/** Místo uprchlíků v útočišti hradiště (`ShelterReport.refugees`). */
export interface RefugeesPlace {
  inside: number;
  outside: number;
  herdInside: Record<HerdSpecies, number>;
  herdOutside: Record<HerdSpecies, number>;
}

/** Uprchlíci v hradišti, kteří nebojují (`StanceInput.refugeLoad`). */
export interface RefugeLoad {
  /** Ženy, děti, starší a ranění muži uprchlíků. */
  people: number;
  /** Stáda uprchlíků (pasou se u hradiště – `RefugeStay.herd`). */
  herd: Record<HerdSpecies, number>;
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
   * Ves o vojsku věděla předem – spatřil ho vesničan, nebo ho ohlásil posel (war.md – Varování,
   * poslové a útěk do hradiště; `isWarned` v tažení, ze starých bodů `VillageState.armySeen`): ves
   * se zachovala podle postoje dřív – do útočiště doběhnou všichni, kdo se vejdou (brány se zavřou
   * až za nimi).
   */
  warned?: boolean;
  /**
   * Uprchlíci v hradišti, kteří nebojují, a jejich stádo (war.md – Varování, poslové a útěk do
   * hradiště – Místo v hradišti; plán 2026-11-09, Úloha 9): do útočiště nejbližšího dvorci až za
   * domácími a muži uprchlíků (obránci `Defender.refugee` – návrh Clauda: muži napřed, obsadí
   * hradbu), dobytek za dobytkem vsi; co se nevejde, stojí venku (stáda první). Uprchlíci v útočišti
   * bydlí – brána je nezastaví. Chybí – bez uprchlíků (rozdělení jako dřív).
   */
  refugeLoad?: RefugeLoad;
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
 * se tam vydají; kdo stihne doběhnout před zavřením brány a vejde se, je uvnitř (muži obsadí
 * hradbu – `wallPosts`, zbytek je záloha ve středu; ostatní nebojují). Kdo zůstal venku, jedná
 * skupina domů podle postoje: bránit se u domů; vzdát se při přesile (útočníků víc než 1,5× mužů
 * skupiny, jezdec za dva), jinak bránit; raději utéct do nejbližšího lesa s dobytkem – bez lesa
 * jako „vzdát se při přesile“. Poslední muž rodu doma se nevzdá, vždy uteče.
 */
export function planDefense(input: StanceInput): StancePlan {
  const people = presentPeople(input);
  const fighterOf = new Map(input.defenders.map((d) => [d.personId, d]));
  const shelter = emptyShelter(input);
  // --- útočiště: nejbližší opevnění s plochou ---
  const inRefuge = seekRefuge(input, people, shelter);

  // --- kdo zůstal venku: po skupinách domů ---
  const fighters: Defender[] = [];
  manWalls(input, inRefuge, fighterOf, shelter, fighters);
  const fledSet = outsideGroups(input, people, inRefuge, fighterOf, shelter, fighters);
  fighters.sort((a, b) => a.personId - b.personId);

  // zásoby a dobytek těch, kdo utekli do lesa
  if (fledSet.size > 0) forestCarry(input, shelter, fledSet);
  return { fighters, shelter };
}

/** Přítomný člověk vsi (i host z ochrany) – kde je a ke které skupině domů patří. */
interface StancePerson {
  id: number;
  pos: Pos;
  group: number;
  age: number;
  refugee: boolean;
}

/** Opevnění s plochou pro útočiště a kolik se do něj vejde. */
interface RefugeFort {
  bf: BattleFort;
  capacity: number;
}

/** Přítomní lidé vsi podle id a hosté z ochrany se skupinou svého místa. */
function presentPeople(input: StanceInput): StancePerson[] {
  const { state, day } = input;
  const groupOf = houseGroups(state.dwellings);
  const homes = new Map(state.dwellings.map((d) => [d.id, d]));
  const people: StancePerson[] = state.people
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
        refugee: false,
      };
    });
  // hosté z ochrany jednají se skupinou svého místa (útočiště, les, vzdání) jako dospělí
  for (const d of input.defenders) {
    if (d.guest) {
      people.push({
        id: d.personId,
        pos: { ...d.pos },
        group: d.houseGroup,
        age: WAR.flight.adultFromYears,
        refugee: d.refugee === true,
      });
    }
  }
  return people;
}

/** Prázdná zpráva o úkrytu; s uprchlíky zatím všichni venku. */
function emptyShelter(input: StanceInput): ShelterReport {
  const { stance } = input;
  const shelter: ShelterReport = {
    stance,
    refuge: [],
    forest: [],
    surrendered: [],
    carriedKg: 0,
    livestockRefuge: none(),
    livestockForest: none(),
  };
  const load = input.refugeLoad;
  if (load) {
    shelter.refugees = {
      inside: 0,
      outside: load.people,
      herdInside: none(),
      herdOutside: { ...load.herd },
    };
  }
  return shelter;
}

/** Útočiště: lidé a dobytek k nejbližšímu opevnění s plochou. Vrací, kdo je uvnitř (a kde). */
function seekRefuge(
  input: StanceInput,
  people: readonly StancePerson[],
  shelter: ShelterReport,
): Map<number, BattleFort> {
  const { state, day, field } = input;
  const inRefuge = new Map<number, BattleFort>();
  const load = input.refugeLoad;
  const forts: RefugeFort[] = field.forts
    .map((bf) => ({ bf, capacity: refugeCapacity(field.geo, bf.fort) }))
    .filter((f) => f.capacity > 0 && f.bf.shapes.length > 0);
  if (!(forts.length > 0 && (people.length > 0 || load))) return inRefuge;
  const nearest = (p: Pos): RefugeFort =>
    forts.reduce((a, b) => (dist2(b.bf.center, p) < dist2(a.bf.center, p) ? b : a));
  const byFort = new Map<RefugeFort, StancePerson[]>();
  for (const p of people) {
    const f = nearest(p.pos);
    byFort.set(f, [...(byFort.get(f) ?? []), p]);
  }
  const centre = state.dwellings[0]?.position ?? { x: 0, z: 0 };
  const herdFort = nearest({ x: centre.x, z: centre.z });
  // uprchlíci bydlí v útočišti u dvorce, i když z vsi nikdo nepřiběhne
  if (load && !byFort.has(herdFort)) byFort.set(herdFort, []);
  let livestockLeft = fleeParty(state, day).livestock;
  for (const [fort, members] of byFort) {
    livestockLeft = admitFort(input, shelter, inRefuge, {
      fort,
      members,
      herdFort,
      centre,
      livestock: livestockLeft,
    });
  }
  shelter.refuge = [...inRefuge.keys()];
  shelter.refugeAt = shelter.refuge.map((id) => field.forts.indexOf(inRefuge.get(id)!));
  shelter.carriedKg = Math.min(shelter.carriedKg, Math.max(0, state.storesKg));
  return inRefuge;
}

/**
 * Jedno útočiště: kdo doběhne před zavřením brány a vejde se (lidé vsi, dobytek u dvorce, muži
 * a ostatní uprchlíci). Vrací dobytek, který ještě zbývá ukrýt.
 */
function admitFort(
  input: StanceInput,
  shelter: ShelterReport,
  inRefuge: Map<number, BattleFort>,
  at: {
    fort: RefugeFort;
    members: readonly StancePerson[];
    herdFort: RefugeFort;
    centre: Pos;
    livestock: FleeParty['livestock'];
  },
): FleeParty['livestock'] {
  const { attackers } = input;
  const load = input.refugeLoad;
  const { fort, members, herdFort, centre } = at;
  let livestockLeft = at.livestock;
  const close = input.warned ? Infinity : gateCloseTick(fort.bf, attackers);
  const arrivals: Arrival[] = [];
  const order = members
    .filter((p) => !p.refugee)
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
  // muži uprchlíků v pořadí hostů (−1, −2, …), ostatní uprchlíci a stádo jen u dvorce
  const men = members.filter((p) => p.refugee).sort((a, b) => b.id - a.id);
  const extra = fort === herdFort ? load : undefined;
  let result: RefugeResult;
  let menIn = 0;
  if (men.length === 0 && extra === undefined) {
    result = refugeAdmit(fort.capacity, arrivals, close);
  } else {
    const admitted = admitWithRefugees(fort.capacity, arrivals, close, men.length, extra);
    result = admitted.home;
    menIn = admitted.men;
    if (extra && shelter.refugees) {
      shelter.refugees = {
        inside: admitted.people,
        outside: extra.people - admitted.people,
        herdInside: admitted.herd,
        herdOutside: Object.fromEntries(
          SPECIES.map((sp) => [sp, extra.herd[sp] - admitted.herd[sp]]),
        ) as Record<HerdSpecies, number>,
      };
    }
  }
  // lidé: stejný druh místa, přijatí jsou první z těch, kdo stihli doběhnout
  const admittedPeople = result.admitted
    .filter((a) => a.kind === 'adult' || a.kind === 'child')
    .reduce((n, a) => n + a.count, 0);
  const early = order.filter((o) => o.tick <= close).slice(0, admittedPeople);
  for (const o of early) inRefuge.set(o.p.id, fort.bf);
  // muži uprchlíků za domácími – i stanoviště na hradbě dostanou až po nich
  for (const p of men.slice(0, menIn)) inRefuge.set(p.id, fort.bf);
  for (const a of result.admitted) {
    if (a.kind === 'adult' || a.kind === 'child') continue;
    shelter.livestockRefuge[a.kind as HerdSpecies] += a.count;
  }
  shelter.carriedKg += result.carriedKg;
  if (fort === herdFort) {
    livestockLeft = { ...livestockLeft };
    for (const sp of SPECIES) livestockLeft[sp] -= shelter.livestockRefuge[sp];
  }
  return livestockLeft;
}

/** Muži za opevněním: hradba, věže nad branami a záloha ve středu. */
function manWalls(
  input: StanceInput,
  inRefuge: ReadonlyMap<number, BattleFort>,
  fighterOf: ReadonlyMap<number, Defender>,
  shelter: ShelterReport,
  fighters: Defender[],
): void {
  const { day } = input;
  // za opevněním muži obsadí hradbu (`wallPosts` – brány po 2, pak obvod po 5 m), kdo stanoviště
  // nedostane, je záloha ve středu; skupina za opevněním se podle postoje nevzdává (bod zlomu a
  // `rout` dál platí, war.md – Obránci)
  const insideMen = new Map<BattleFort, Defender[]>();
  for (const [personId, bf] of inRefuge) {
    const d = fighterOf.get(personId);
    if (d && !d.atHouseOnly) insideMen.set(bf, [...(insideMen.get(bf) ?? []), d]);
  }
  for (const [bf, men] of insideMen) {
    const staying: Defender[] = men;
    const posts = wallPosts([bf], staying.length, day);
    // věže nad branami (první stanoviště) obsadí napřed muži rodu (plán hradeb Ú19)
    const tower = Math.min(staying.length, towerPosts([bf], day).length);
    if (tower > 0) {
      const first = [...staying.filter((d) => d.line), ...staying.filter((d) => !d.line)].slice(
        0,
        tower,
      );
      const rest = staying.filter((d) => !first.includes(d));
      staying.splice(0, staying.length, ...first, ...rest);
    }
    staying.forEach((d, i) => {
      const post = posts[i] ?? bf.center;
      const onWall = posts[i] !== undefined && crownAt([bf], post, day);
      fighters.push({
        ...d,
        pos: { ...post },
        post: { ...post },
        ...(onWall ? { onWall: true as const } : {}),
      });
    });
  }
}

/** Kdo zůstal venku: skupiny domů podle postoje – boj, les, nebo vzdání. Vrací, kdo utekl do lesa. */
function outsideGroups(
  input: StanceInput,
  people: readonly StancePerson[],
  inRefuge: ReadonlyMap<number, BattleFort>,
  fighterOf: ReadonlyMap<number, Defender>,
  shelter: ShelterReport,
  fighters: Defender[],
): Set<number> {
  const { stance, attackers, field } = input;
  const outside = people.filter((p) => !inRefuge.has(p.id));
  const groupIds = [...new Set(outside.map((p) => p.group))].sort((a, b) => a - b);
  const fledSet = new Set<number>();
  for (const g of groupIds) {
    const members = outside.filter((p) => p.group === g);
    const men = members
      .map((m) => fighterOf.get(m.id))
      .filter((d): d is Defender => !!d && !d.atHouseOnly);
    const here = members[0]!.pos;
    const forest = nearestReachableForest(field.grid, here);
    const overpowered = isOverpowered(attackers, men.length);
    let action: 'fight' | 'forest' | 'surrender';
    if (stance === 'defend') action = 'fight';
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
  return fledSet;
}

/** Zásoby a dobytek těch, kdo utekli do lesa. */
function forestCarry(
  input: StanceInput,
  shelter: ShelterReport,
  fledSet: ReadonlySet<number>,
): void {
  const { state, day, stance } = input;
  const party: FleeParty = fleeParty(state, day, fledSet);
  shelter.carriedKg = Math.min(Math.max(0, state.storesKg), shelter.carriedKg + party.carriedKg);
  if (stance === 'flee') {
    for (const sp of SPECIES) {
      const left = fleeParty(state, day).livestock[sp] - shelter.livestockRefuge[sp];
      shelter.livestockForest[sp] = Math.max(0, left);
    }
  }
}

/**
 * Útočiště s uprchlíky (war.md – Místo v hradišti; návrh Clauda): napřed lidé vsi (kdo stihne
 * doběhnout před zavřením brány), pak muži uprchlíků, pak ostatní uprchlíci (bydlí uvnitř – brána
 * je nezastaví, nic nenesou), pak dobytek vsi a nakonec stádo uprchlíků. Vrací výsledek pro ves
 * (lidé a dobytek vsi jako `refugeAdmit`) a kolik uprchlíků a jejich kusů se vešlo.
 */
function admitWithRefugees(
  capacityM2: number,
  arrivals: readonly Arrival[],
  close: number,
  men: number,
  load: RefugeLoad | undefined,
): { home: RefugeResult; men: number; people: number; herd: Record<HerdSpecies, number> } {
  const isPerson = (a: Arrival): boolean => a.kind === 'adult' || a.kind === 'child';
  const homePeople = refugeAdmit(capacityM2, arrivals.filter(isPerson), close);
  let left = capacityM2 - homePeople.usedM2;
  const refugees = refugeAdmit(
    left,
    [
      { kind: 'adult', count: men, tick: 0, homeInside: true },
      { kind: 'adult', count: load?.people ?? 0, tick: 1, homeInside: true },
    ],
    Infinity,
  );
  left -= refugees.usedM2;
  const homeHerd = refugeAdmit(
    left,
    arrivals.filter((a) => !isPerson(a)),
    close,
  );
  left -= homeHerd.usedM2;
  const theirHerd = refugeAdmit(
    left,
    SPECIES.map((sp) => ({ kind: sp, count: load?.herd[sp] ?? 0, tick: 0 })),
    Infinity,
  );
  const count = (r: RefugeResult, tick: number): number =>
    r.admitted.filter((a) => a.tick === tick).reduce((n, a) => n + a.count, 0);
  const herd = none();
  for (const a of theirHerd.admitted) herd[a.kind as HerdSpecies] += a.count;
  return {
    home: {
      admitted: [...homePeople.admitted, ...homeHerd.admitted],
      outside: [...homePeople.outside, ...homeHerd.outside],
      capacityM2,
      usedM2: homePeople.usedM2 + homeHerd.usedM2,
      carriedKg: homePeople.carriedKg + homeHerd.carriedKg,
    },
    men: count(refugees, 0),
    people: count(refugees, 1),
    herd,
  };
}
