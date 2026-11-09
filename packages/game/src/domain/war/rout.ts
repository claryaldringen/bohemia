import { ageYears, isInjured } from '../village/people';
import type { Person } from '../village/types-people';
import type { BattleField, BattleFort, BattleState, Fighter } from './battle';
import { nearestForest } from './flight';
import { dist2, inFight } from './orders';
import { WAR } from './rules-war';
import { TICKS_PER_SECOND } from './ticks';
import { fortOfPost, withinWalls } from './wall-defense';

// Bod zlomu za hradbou, probíjení a dobytí útočiště (fortifications.md – Obrana bez násobku 3,
// Kryt pod palbou a bod zlomu jen v útoku, Bod zlomu a probíjení; Martin 9. 11. 2026). Obránci
// za hradbou tvoří jeden celek opevnění: bod zlomu (45 %) se počítá jen ze ztrát v útoku – padlí
// a ranění, které nesrazilo ostřelování přes hradbu (`Fighter.shotDown`). Bod zlomu = chaos, nikdo
// nevelí: brány opevnění se otevřou, zdraví utíkají každý sám nejbližší branou či mezerou do lesa,
// raněný pod polovinou zdraví se vzdá (odříznutý také – `battle.ts`). Probíjení je rozkaz velitele
// obrany před bodem zlomu: skupina se shromáždí u vybrané brány a pohromadě se probije do lesa
// (`wall-defense.ts` – plán). Útočiště je dobyté, až útočník stojí uvnitř obvodu. Jen det-math.

/**
 * Útěk (war.md – Bod zlomu): útočník domů – kudy přišel (rozpad po hloučcích Ú6.12), obránce do
 * nejbližšího lesa (bez lesa hned pryč). Obránce z opevnění vede ven branou takt (`battle.ts`).
 */
export function startFlee(f: Fighter, field: BattleField): void {
  f.state = 'flee';
  f.aim = null;
  f.route = [];
  f.routeFor = null;
  f.breachAt = null;
  delete f.cover;
  f.fleeTo = f.side === 'attack' ? { ...f.home } : nearestForest(field.grid, f.pos);
  if (f.fleeTo === null) f.state = 'fled';
}

/** Vzdá se (bod zlomu za hradbou – raněný, odříznutý): z boje odejde, útočník ho odvede. */
export function surrender(f: Fighter): void {
  f.state = 'fled';
  f.surrendered = true;
  f.aim = null;
  f.route = [];
  f.routeFor = null;
  f.fleeTo = null;
  delete f.cover;
}

/** Obránci za hradbou opevnění `fort` – se stanovištěm (`post`) v něm, v pořadí bojovníků. */
export function fortDefenders(
  b: Pick<BattleState, 'fighters'>,
  forts: readonly BattleFort[],
  fort: number,
): Fighter[] {
  return b.fighters.filter(
    (f) => f.side === 'defend' && f.post !== undefined && fortOfPost(forts, f.post) === fort,
  );
}

/** Podíl ztrát v útoku: padlí a ranění bez sražených ostřelováním ÷ všichni, kdo vstoupili. */
export function assaultLossShare(men: readonly Fighter[]): number {
  if (men.length === 0) return 0;
  return men.filter((f) => f.state === 'down' && !f.shotDown).length / men.length;
}

/** Otevře brány opevnění `fort` (jen tu na úseku `segment`, je-li dán) – už se nezavřou. */
function openGates(
  b: BattleState,
  forts: readonly BattleFort[],
  fort: number,
  segment?: number,
): void {
  for (const g of forts[fort]?.fort.gates ?? []) {
    if (segment !== undefined && g.segment !== segment) continue;
    const key = `${fort}:${g.segment}`;
    b.closedGates = b.closedGates.filter((k) => k !== key);
    if (!(b.openedGates ?? []).includes(key)) b.openedGates = [...(b.openedGates ?? []), key];
  }
}

/**
 * Bod zlomu obránců opevnění `fort` – chaos (návrh Clauda podle Martina): brány se otevřou, kdo má
 * méně než polovinu zdraví, vzdá se (poslední muž rodu ne – uteče), ostatní utíkají do lesa.
 */
function routFort(
  b: BattleState,
  field: BattleField,
  forts: readonly BattleFort[],
  fort: number,
  men: readonly Fighter[],
): void {
  b.routed = [...(b.routed ?? []), fort];
  openGates(b, forts, fort);
  b.breakouts = (b.breakouts ?? []).filter((x) => x.fort !== fort);
  for (const f of men) {
    if (f.state !== 'fight') continue;
    if (f.health < WAR.rout.fleeMinHealth - 1e-9 && !f.lastLine) surrender(f);
    else startFlee(f, field);
  }
}

/**
 * Brána pro probíjení (návrh Clauda): s nejméně útočníky na nohou do 30 m (při shodě dřívější
 * v opevnění). Velitel obrany (`weakOnly`) jen volnou nebo slabě hlídanou – útočníků nejvýš
 * polovina proti probíjejícím, jinak null; rozkaz hráče (`weakOnly` false) jde i hlídanou branou
 * (návrh Clauda – přítomný hráč rozkáže sám, brána, kudy se dá nejlépe probít). Bez brány či
 * obránců na nohou null.
 */
export function breakoutGate(
  b: BattleState,
  forts: readonly BattleFort[],
  fort: number,
  weakOnly = true,
): number | null {
  const gates = forts[fort]?.fort.gates ?? [];
  const men = fortDefenders(b, forts, fort).filter((f) => f.state === 'fight').length;
  if (gates.length === 0 || men === 0) return null;
  const r2 = WAR.breakout.gateWatchM * WAR.breakout.gateWatchM;
  let best: number | null = null;
  let bestN = Infinity;
  for (const g of gates) {
    const n = b.fighters.filter(
      (a) => a.side === 'attack' && inFight(a) && dist2(a.pos, g) <= r2,
    ).length;
    if (n < bestN) {
      bestN = n;
      best = g.segment;
    }
  }
  return !weakOnly || bestN <= WAR.breakout.weakGuardShare * men + 1e-9 ? best : null;
}

/**
 * Proč obráncům za hradbou nejde rozkázat „Probít se“: boj neběží (`over`), nikdo nebrání hradbu
 * – žádný obránce se stanovištěm na nohou (`undefended`), obránci po bodu zlomu utíkají (`routed`),
 * už se probíjejí (`underway`).
 */
export type BreakoutBlock = 'over' | 'undefended' | 'routed' | 'underway';

/** Rozkaz „Probít se“: opevnění, jehož obránci se probijí, nebo proč nejde. */
export type BreakoutChoice = { fort: number } | { blocked: BreakoutBlock };

/**
 * Komu hráč obránců rozkáže „Probít se“ (fortifications.md – Obrana bez násobku 3, Bod zlomu
 * a probíjení): opevnění s branou před bodem zlomu, které se ještě neprobíjí, s obránci na nohou
 * – při víc takových to s nejvíc obránci na nohou (návrh Clauda; při shodě dřívější). Jinak proč
 * ne (`BreakoutBlock`). Bojiště bez opevnění s branou – null (rozkaz není).
 */
export function breakoutChoice(
  b: Pick<BattleState, 'fighters' | 'outcome' | 'routed' | 'breakouts' | 'breakoutOrder'>,
  forts: readonly BattleFort[],
): BreakoutChoice | null {
  const gated = forts.flatMap((bf, i) =>
    bf.shapes.length > 0 && bf.fort.gates.length > 0 ? [i] : [],
  );
  if (gated.length === 0) return null;
  if (b.outcome !== 'ongoing') return { blocked: 'over' };
  const routed = new Set(b.routed ?? []);
  const busy = new Set([
    ...(b.breakouts ?? []).map((x) => x.fort),
    ...(b.breakoutOrder ? [b.breakoutOrder.fort] : []),
  ]);
  const standing = gated.map((fort) => ({
    fort,
    men: fortDefenders(b, forts, fort).filter((f) => f.state === 'fight').length,
  }));
  let best: { fort: number; men: number } | null = null;
  for (const x of standing) {
    if (x.men === 0 || routed.has(x.fort) || busy.has(x.fort)) continue;
    if (!best || x.men > best.men) best = x;
  }
  if (best) return { fort: best.fort };
  if (standing.some((x) => x.men > 0 && busy.has(x.fort) && !routed.has(x.fort))) {
    return { blocked: 'underway' };
  }
  return { blocked: gated.some((f) => routed.has(f)) ? 'routed' : 'undefended' };
}

/**
 * Rozkaz k probíjení obráncům opevnění `fort` branou na úseku `segment` (přítomný hráč, nebo velitel
 * obrany): brána se otevře, skupina se u ní shromáždí a probije se do nejbližšího lesa. Ne po bodu
 * zlomu, bez brány na úseku ani bez obránců na nohou. Vrací, zda rozkaz platí.
 */
export function orderBreakout(
  b: BattleState,
  field: BattleField,
  forts: readonly BattleFort[],
  fort: number,
  segment: number,
): boolean {
  const gate = forts[fort]?.fort.gates.find((g) => g.segment === segment);
  if (!gate || b.outcome !== 'ongoing' || (b.routed ?? []).includes(fort)) return false;
  if (!fortDefenders(b, forts, fort).some((f) => f.state === 'fight')) return false;
  openGates(b, forts, fort, segment);
  b.breakouts = [
    ...(b.breakouts ?? []).filter((x) => x.fort !== fort),
    { fort, segment, to: nearestForest(field.grid, { x: gate.x, z: gate.z }), tick: b.ticks },
  ];
  return true;
}

/**
 * Bod zlomu a probíjení obránců za hradbou (na začátku taktu, po opevněních): ztráty v útoku
 * dosáhly 45 % → chaos; jinak při 30 % a volné či slabě hlídané bráně rozhodne velitel obrany
 * (muž rodu, jinak správce) o probíjení – jednou za boj na opevnění.
 */
export function fortBreakpoints(
  b: BattleState,
  field: BattleField,
  forts: readonly BattleFort[],
): void {
  forts.forEach((bf, fi) => {
    if (bf.shapes.length === 0 || (b.routed ?? []).includes(fi)) return;
    const men = fortDefenders(b, forts, fi);
    if (men.length === 0) return;
    const share = assaultLossShare(men);
    if (share >= WAR.breakpoint.defender - 1e-9) {
      routFort(b, field, forts, fi, men);
      return;
    }
    if (share < WAR.breakout.lossShare - 1e-9) return;
    if ((b.breakouts ?? []).some((x) => x.fort === fi)) return;
    const segment = breakoutGate(b, forts, fi);
    if (segment !== null) orderBreakout(b, field, forts, fi, segment);
  });
}

/**
 * Probíjení v taktu (před pohybem): skupina vyrazí, když jsou všichni na nohou do 6 m od brány,
 * nejpozději 60 s po rozkazu; kdo je venku za hradbou a došel k lesu (bez lesa hned), je pryč.
 */
export function breakoutStep(b: BattleState, forts: readonly BattleFort[]): void {
  const gatherTicks = WAR.breakout.gatherSeconds * TICKS_PER_SECOND;
  const near2 = WAR.breakout.gatherM * WAR.breakout.gatherM;
  for (const bo of b.breakouts ?? []) {
    const bf = forts[bo.fort];
    const gate = bf?.fort.gates.find((g) => g.segment === bo.segment);
    if (!bf || !gate) continue;
    const men = fortDefenders(b, forts, bo.fort).filter((f) => f.state === 'fight');
    if (!bo.gathered) {
      const ready =
        men.every((f) => dist2(f.pos, gate) <= near2) || b.ticks - bo.tick >= gatherTicks;
      if (ready) bo.gathered = true;
    }
    for (const f of men) {
      if (withinWalls(bf, f.pos)) continue;
      if (bo.to === null || dist2(f.pos, bo.to) <= 4) {
        f.state = 'fled';
        f.aim = null;
        delete f.onWall;
      }
    }
  }
}

/** Útočiště boje – opevnění s obránci za hradbou nebo s lidmi v útočišti (s tvarem obvodu). */
export function refugeForts(b: BattleState, forts: readonly BattleFort[]): number[] {
  const out = new Set<number>();
  for (const f of b.fighters) {
    if (f.side === 'defend' && f.post !== undefined) out.add(fortOfPost(forts, f.post));
  }
  for (const fi of b.shelter?.refugeAt ?? []) out.add(fi);
  return [...out].filter((fi) => (forts[fi]?.shapes.length ?? 0) > 0).sort((x, y) => x - y);
}

/** Zapíše dobytá útočiště – útočník ve stavu boje stojí uvnitř obvodu (`withinWalls`). */
export function markTaken(b: BattleState, forts: readonly BattleFort[]): void {
  for (const fi of refugeForts(b, forts)) {
    if ((b.taken ?? []).includes(fi)) continue;
    const bf = forts[fi]!;
    if (
      b.fighters.some((a) => a.side === 'attack' && a.state === 'fight' && withinWalls(bf, a.pos))
    ) {
      b.taken = [...(b.taken ?? []), fi];
    }
  }
}

/** Útočiště, kam útočník ještě nevstoupil. */
export function untakenForts(b: BattleState, forts: readonly BattleFort[]): number[] {
  const taken = b.taken ?? [];
  return refugeForts(b, forts).filter((fi) => !taken.includes(fi));
}

/**
 * Lidé v dobytém útočišti (fortifications.md – Bod zlomu a probíjení – „lidé v útočišti stejně“):
 * zdraví dospělí utečou; děti do 16 let, matky dětí do 7 let v útočišti, staří od 60 let a ranění
 * či nemocní se vzdají. Vrací vzdané a utečené (id vzestupně).
 */
export function refugeRout(
  everyone: readonly Pick<
    Person,
    'id' | 'bornDay' | 'motherId' | 'injuredUntilDay' | 'woundedUntil'
  >[],
  day: number,
  ids: readonly number[],
): { surrendered: number[]; fled: number[] } {
  const r = WAR.rout;
  const here = new Set(ids);
  const people = everyone.filter((p) => here.has(p.id));
  const mothers = new Set<number>();
  for (const p of people) {
    if (p.motherId !== undefined && ageYears(p.bornDay, day) < r.motherOfChildUnderYears) {
      mothers.add(p.motherId);
    }
  }
  const surrendered: number[] = [];
  const fled: number[] = [];
  for (const p of [...people].sort((x, y) => x.id - y.id)) {
    const age = ageYears(p.bornDay, day);
    const stays =
      age < WAR.flight.adultFromYears ||
      age >= r.elderFromYears ||
      mothers.has(p.id) ||
      isInjured(p, day);
    (stays ? surrendered : fled).push(p.id);
  }
  return { surrendered, fled };
}
