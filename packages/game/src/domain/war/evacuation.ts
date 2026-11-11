import type { WorldClock } from '../calendar';
import { villageCentre } from '../village/people/departure';
import { isLineMan, lineMen } from '../village/people/dynasty';
import type { VillageEventBody } from '../village/core/inbox';
import { guestFoodNeed } from '../village/people/people';
import { takeGrain, takeHerd } from '../village/fortification/state/refugees';
import type {
  FlightMode,
  HerdSpecies,
  Person,
  Prisoner,
  RaidLoot,
  RefugeePerson,
  VillageState,
} from '../village/types';
import { alarmCellOf, alarmVillage, isWarned, refugeHosts } from './alarm';
import type { AlarmFlight, AlarmMessenger, CampaignAlarm } from './alarm-types';
import { gridOf, MissingData, sameCell, villageEvent } from './campaign-tick';
import type { TickContext, TickOut } from './campaign-tick';
import type { CampaignPlace, CampaignState } from './campaign-types';
import { isOverpowered, nearestForest } from './flight';
import { marchSpeed, type GroupPace } from './march';
import { stepMover } from './movement';
import { guardPrisonerKey, lootCapacity, lootTotals, noLoot, sumLoot } from './raid-apply';
import { flightLoad, refugeOptions } from './refuge-choice';
import { WAR } from './rules-war';
import { dayOfTick, TICKS_PER_SECOND } from './ticks';

// Evakuace v tažení útočníka (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 –
// Úloha 8, Otevřené 7, 8, Review Focus 2). Varovaná ves odejde skupinou do hradiště pána („jen
// lidé“ / „se vším“) nebo se ukryje v lese na své mapě. Skupina jde po mapách jako skupina vojska
// (`stepMover`) tempem pěších, se stády a vozy tempem stáda; cestou jí ze svých zásob. Vojsko,
// které ji dostihne (do 30 m) v přesile, ji oloupí – lidé podle volby ke vzdaným, zásoby do
// nosnosti a stádo do kořisti. Prázdnou ves nájezdník vyplení o to, co zůstalo. Do stavů vsí jdou
// jen události schránky (`refuge-*`, aplikace – `village/fortification/state/refugees.ts`). Jen det-math.

const SPECIES: readonly HerdSpecies[] = ['sheep', 'goat', 'pig', 'cow'];

function noHerd(): Record<HerdSpecies, number> {
  return { sheep: 0, goat: 0, pig: 0, cow: 0 };
}

// --- Co tažení z vsi odvedlo (Review Focus 2) --------------------------------------------------

/** Co tažení z vsi v den `day` odvedlo a stav vsi ze včerejška to ještě nezná (plán – Review Focus 2). */
export interface AlarmTaken {
  /** Lidé vsi, kteří jsou pryč s tažením (posel, skupina) – v boji ani ve skupinách domů nejsou. */
  people: Set<number>;
  /** Obilí, které skupiny dnes odnesly (kg). */
  foodKg: number;
  /** Dobytek, který skupiny dnes sehnaly. */
  herd: Record<HerdSpecies, number>;
}

/** Takt návratu posla domů – vrací se tak dlouho, jak dlouho běžel (plán – Úloha 5). */
export function messengerBackTick(m: AlarmMessenger): number {
  const done = m.doneTick ?? m.departTick;
  return done + (done - m.departTick);
}

/**
 * Co tažení z vsi `villageId` odvedlo do dne `day` a stav vsi `villageAt(…, day)` (ke konci dne
 * `day − 1`) to ještě nemusí znát: poslové, kteří vyběhli nejpozději v den `day` a nevrátili se
 * domů před ním, a skupiny uprchlíků, které odešly v den `day` (lidé, nesené obilí a stádo –
 * `refuge-depart` přistane na týž den; stav vsi ode dne nato ho už zná).
 */
export function alarmTaken(
  s: CampaignState,
  villageId: string,
  day: number,
  clock: WorldClock,
): AlarmTaken {
  const people = new Set<number>();
  for (const m of s.alarm?.messengers ?? []) {
    if (m.fromVillageId !== villageId || dayOfTick(m.departTick, clock) > day) continue;
    if (m.doneTick !== undefined && (m.status === 'arrived' || m.status === 'recalled')) {
      if (dayOfTick(messengerBackTick(m), clock) < day) continue;
    }
    people.add(m.personId);
  }
  let foodKg = 0;
  const herd = noHerd();
  for (const f of s.alarm?.flights ?? []) {
    if (f.villageId !== villageId || dayOfTick(f.departTick, clock) !== day) continue;
    for (const p of f.people) people.add(p.id);
    const carried = f.carried ?? { foodKg: f.foodKg, herd: f.herd };
    foodKg += carried.foodKg;
    for (const sp of SPECIES) herd[sp] += carried.herd[sp];
  }
  return { people, foodKg, herd };
}

/**
 * Stav vsi bez toho, co tažení odvedlo (kopie – lidé se vynechají, obilí a dobytek ubudou stejně
 * jako v `applyRefugeDepart`); nic neodvedlo – týž stav.
 */
export function withoutTaken(state: VillageState, taken: AlarmTaken): VillageState {
  const herd = SPECIES.some((sp) => taken.herd[sp] > 0);
  if (taken.people.size === 0 && taken.foodKg <= 0 && !herd) return state;
  const out: VillageState = {
    ...state,
    people: state.people.filter((p) => !taken.people.has(p.id)),
  };
  if (taken.foodKg > 0) {
    if (state.grainPits) out.grainPits = structuredClone(state.grainPits);
    if (state.grainPitWork) out.grainPitWork = structuredClone(state.grainPitWork);
    takeGrain(out, taken.foodKg);
  }
  if (herd && state.livestock) {
    out.livestock = structuredClone(state.livestock);
    takeHerd(out, taken.herd);
  }
  return out;
}

// --- Odchod ------------------------------------------------------------------------------------

/**
 * Varovaná ves `villageId` odejde skupinou (záměr `alarm-flee` hráče, pravidlo správce –
 * `decideAlarms`, Úloha 11): ves ještě neodešla, boj u ní nezačal (pak rozhoduje postoj –
 * `planDefense`) a `refugeOptions` volbu pustí (hradiště, „Stihnou to“, les). Složení `flightLoad` ze stavu bez toho, co tažení dnes
 * odvedlo; cíl – střed útočiště hradiště (trasa `refugeRoute`), nebo nejbližší hustý les na mapě
 * vsi. Domů `refuge-depart` na týž den (ves drží bariéra – je ve varování). Skupina do hradiště sní
 * hned jídlo dne odchodu (doma už nejí). Vrací, zda skupina odešla.
 */
export function departFlight(
  s: CampaignState,
  villageId: string,
  mode: FlightMode,
  ctx: TickContext,
  out: TickOut,
  opts: { by: 'player' | 'steward' },
): boolean {
  if (mode !== 'forest' && mode !== 'people' && mode !== 'all') return false;
  const av = alarmVillage(s, villageId);
  if (!av || !isWarned(s, villageId, s.tick) || av.flight !== undefined) return false;
  if (s.battle && s.target.villageId === villageId) return false;
  const cell = alarmCellOf(av);
  const state = ctx.world.villageAt(villageId, s.day);
  if (state === null) throw new MissingData([], [villageId]);
  const home = withoutTaken(state, alarmTaken(s, villageId, s.day, ctx.world.clock));
  const centre = villageCentre(state);
  const grid = gridOf(cell, s.day, ctx);
  // les hradiště nepotřebuje – jeho kandidáty (a jejich stav) čte jen útěk do hradiště
  const { hosts, ids } =
    mode === 'forest' ? { hosts: [], ids: [] } : refugeHosts(s, villageId, cell, ctx);
  const options = refugeOptions({
    state: home,
    day: s.day,
    village: { cell, pos: centre },
    grid,
    seenAt: av.seenAt,
    sinceSeenTicks: s.tick - av.seenTick,
    hosts,
    messengerSent: av.messenger !== undefined,
  });
  if (options[mode].blocked !== null) return false;
  let target: CampaignPlace;
  let route: AlarmFlight['route'];
  let hostVillageId: string | null;
  if (mode === 'forest') {
    const spot = nearestForest(grid, centre);
    if (!spot) return false;
    target = { cell: { ...cell }, pos: spot };
    route = [];
    hostVillageId = null;
  } else {
    const host = options.host;
    if (!host) return false;
    target = { cell: { ...host.cell }, pos: { ...host.center } };
    route = options.route.slice(1).map((c) => ({ ...c }));
    hostVillageId = host.villageId;
    av.hosts = ids;
  }
  const load = flightLoad(home, s.day, mode);
  const alarm = s.alarm!;
  const refId = `${s.id}:a${alarm.nextRef}`;
  alarm.nextRef++;
  const f: AlarmFlight = {
    refId,
    villageId,
    mode,
    hostVillageId,
    people: load.people.map((p) => ({ ...p })),
    foodKg: load.foodKg,
    herd: { ...load.herd },
    carts: load.carts,
    carried: { foodKg: load.foodKg, herd: { ...load.herd } },
    ...(load.pace.woundedOnFoot > 0 ? { wounded: load.pace.woundedOnFoot } : {}),
    status: 'marching',
    departTick: s.tick,
    cell: { ...cell },
    pos: { ...centre },
    route,
    leg: null,
    target,
  };
  addFlight(alarm, f);
  av.flight = refId;
  av.decided ??= opts.by;
  const hostName =
    hostVillageId === null ? null : (ctx.world.villageNameOf?.(hostVillageId) ?? null);
  villageEvent(s, out, villageId, s.day, {
    kind: 'refuge-depart',
    campaignId: s.id,
    refId,
    mode,
    hostVillageId,
    people: f.people.map((p) => p.id),
    carriedKg: load.foodKg,
    herd: { ...load.herd },
    ...(hostName === null ? {} : { hostName }),
  });
  eatOnTheWay(f, s.day);
  return true;
}

/** Zapíše skupinu – seřazené podle `refId` (stav je JSON, pořadí pevné). */
function addFlight(alarm: CampaignAlarm, f: AlarmFlight): void {
  const at = alarm.flights.findIndex((x) => x.refId > f.refId);
  if (at < 0) alarm.flights.push(f);
  else alarm.flights.splice(at, 0, f);
}

/** Kdo ze skupiny ještě jde (bez padlých, odvedených a zajatých). */
function remaining(f: AlarmFlight): RefugeePerson[] {
  if (!f.lost || f.lost.length === 0) return f.people;
  const lost = new Set(f.lost);
  return f.people.filter((p) => !lost.has(p.id));
}

/** Tempo skupiny: pěší (ranění pomaleji); dobytek a vozy na tempo stáda (jako `flightLoad`). */
export function flightPace(f: AlarmFlight): GroupPace {
  const people = remaining(f).length;
  const wounded = Math.min(f.wounded ?? 0, people);
  let heads = f.carts;
  for (const sp of SPECIES) heads += f.herd[sp];
  return { onFoot: people - wounded, riders: 0, woundedOnFoot: wounded, herd: heads };
}

/**
 * Jídlo skupiny do hradiště na den `day` (mutuje): každý podle věku (`guestFoodNeed` – jako host)
 * ze zásob skupiny; bez jídla jde dál (cesta je krátká – hlad se nepočítá; plán – Rizika). Skupina
 * do lesa jí doma už od odchodu (`refugeFoodDay` ve vsi – Úloha 7).
 */
function eatOnTheWay(f: AlarmFlight, day: number): void {
  if (f.hostVillageId === null || f.foodKg <= 0) return;
  let need = 0;
  for (const p of remaining(f)) need += guestFoodNeed(p, day);
  f.foodKg = Math.max(0, f.foodKg - need);
}

/** Denní krok tažení (`dailyStep`): skupiny na cestě do hradiště snědí jídlo dne. */
export function flightFoodDay(s: CampaignState): void {
  for (const f of s.alarm?.flights ?? []) {
    if (f.status === 'marching') eatOnTheWay(f, s.day);
  }
}

// --- Cesta a příchod ---------------------------------------------------------------------------

/**
 * Skupiny o jeden takt (po pohybu vojska, spatření a poslech): tempem skupiny po mapách; v cíli
 * se ukryjí v lese, nebo dojdou do hradiště (`settle`). Nemá-li kudy, zůstane, kde je – jako by
 * došla (návrh Clauda; mřížka světa je louka, nastane jen výjimečně).
 */
export function moveFlights(s: CampaignState, ctx: TickContext, out: TickOut): void {
  for (const f of s.alarm?.flights ?? []) {
    if (f.status !== 'marching') continue;
    const stepM = marchSpeed(flightPace(f), s.day) / TICKS_PER_SECOND;
    const step = stepMover(f, f.target.pos, stepM, s.day, ctx);
    if (step === 'arrived' || step === 'stuck') settle(s, f, ctx, out);
  }
}

/**
 * Konec tažení (`finish`): skupiny na cestě dojdou, kam šly – vojsko odtáhlo, další takty nebudou
 * (návrh Clauda; zbytek cesty se nesimuluje – jako návrat z hradiště, Otevřené 11).
 */
export function settleFlights(s: CampaignState, ctx: TickContext, out: TickOut): void {
  for (const f of s.alarm?.flights ?? []) {
    if (f.status === 'marching') settle(s, f, ctx, out);
  }
}

/**
 * Skupina došla: do lesa – ukryla se (`refuge-hidden` domů na týž den – ves drží bariéra), do
 * hradiště – `refuge-arrive` hostiteli den nato (rozhodnutí 13) se zbylými lidmi, zásobami
 * a stádem, majiteli vsi upozornění `refuge-arrived`.
 */
function settle(s: CampaignState, f: AlarmFlight, ctx: TickContext, out: TickOut): void {
  f.doneTick = s.tick;
  if (f.hostVillageId === null) {
    f.status = 'hidden';
    villageEvent(s, out, f.villageId, s.day, {
      kind: 'refuge-hidden',
      campaignId: s.id,
      refId: f.refId,
      foodKg: f.foodKg,
      herd: { ...f.herd },
    });
    return;
  }
  f.status = 'arrived';
  villageEvent(s, out, f.hostVillageId, s.day + 1, {
    kind: 'refuge-arrive',
    campaignId: s.id,
    refId: f.refId,
    fromVillageId: f.villageId,
    fromName: ctx.world.villageNameOf?.(f.villageId) ?? '',
    people: remaining(f).map((p) => ({ ...p })),
    foodKg: f.foodKg,
    herd: { ...f.herd },
  });
  const watcher = ctx.world.watcherOf?.(f.villageId);
  if (watcher && watcher.playerId !== s.playerId) {
    const hostName = ctx.world.villageNameOf?.(f.hostVillageId) ?? null;
    out.notices.push({
      playerId: watcher.playerId,
      kind: 'refuge-arrived',
      payload: {
        villageId: f.villageId,
        name: watcher.name,
        campaignId: s.id,
        hostVillageId: f.hostVillageId,
        ...(hostName === null ? {} : { hostName }),
      },
      gameDay: s.day,
    });
  }
}

// --- Dostižení (Otevřené 8) ------------------------------------------------------------------

/**
 * Dostižení po pohybu (Otevřené 8): skupina vojska s aktivním mužem na mapě skupiny uprchlíků do
 * `WAR.alarm.catchM` (cíleně je nepronásleduje – kudy jde, rozhoduje vůdce). Přesila
 * (`isOverpowered` – muži těch skupin vojska proti mužům uprchlíků) → skupina se vzdá (`surrender`);
 * bez přesily jde dál. Skupina se vzdá nejvýš jednou.
 */
export function catchFlights(s: CampaignState, ctx: TickContext, out: TickOut): void {
  for (const f of s.alarm?.flights ?? []) {
    if (f.status !== 'marching' || f.caughtTick !== undefined) continue;
    const attackers = catchersOf(s, f);
    if (attackers.length === 0) continue;
    const men = remaining(f).filter((p) => p.man).length;
    if (isOverpowered(attackers, men)) surrender(s, f, ctx, out);
  }
}

/** Kořist do tažení (mutuje): součty a rozpis po druzích (`CampaignLoot.detail` – sloučí se). */
export function takeLoot(s: CampaignState, loot: RaidLoot): void {
  const totals = lootTotals(loot);
  s.loot = {
    ...s.loot,
    foodKg: s.loot.foodKg + totals.foodKg,
    herd: s.loot.herd + totals.herd,
    detail: s.loot.detail ? sumLoot(s.loot.detail, loot) : structuredClone(loot),
  };
}

/** Muži skupin vojska (s aktivním mužem) na mapě skupiny uprchlíků do `catchM` od ní. */
function catchersOf(s: CampaignState, f: AlarmFlight): { mounted: boolean }[] {
  const reach = WAR.alarm.catchM * WAR.alarm.catchM;
  const out: { mounted: boolean }[] = [];
  for (const g of s.groups) {
    if (!sameCell(g.cell, f.cell)) continue;
    const dx = g.pos.x - f.pos.x;
    const dz = g.pos.z - f.pos.z;
    if (dx * dx + dz * dz > reach) continue;
    for (const m of s.members) {
      if (m.group === g.id && m.status === 'active') out.push({ mounted: m.mounted });
    }
  }
  return out;
}

/**
 * Skupina se vzdá (Otevřené 8; mutuje): lidé podle volby ke vzdaným (`CampaignState.surrendered`,
 * výchozí odvést) – pobít padnou, odvést: vesničan do kořisti (odvedený), muž rodu a šlechtic do
 * zajetí (NPC velitel je zajme vždy – jako po nájezdu a u posla), nechat – jdou dál. Poslední muž
 * rodu vsi se nevzdá – uteče lesem a jde dál sám (návrh Clauda). Zásoby do nosnosti vojska
 * (`lootCapacity` bez už nesené kořisti) a celé stádo do kořisti, zbytek zásob zahodí. Domů
 * `refuge-caught` den nato (někdo-li padl, byl odveden nebo zajat), majiteli upozornění.
 */
function surrender(s: CampaignState, f: AlarmFlight, ctx: TickContext, out: TickOut): void {
  const home = ctx.world.villageAt(f.villageId, s.day);
  if (home === null) throw new MissingData([], [f.villageId]);
  const persons = new Map(home.people.map((p) => [p.id, p]));
  const lastLine = lineMen(home).length === 1;
  const order = s.surrendered ?? 'lead';
  const killed: number[] = [];
  const led: Person[] = [];
  const captured: Person[] = [];
  for (const r of remaining(f)) {
    const p = persons.get(r.id);
    if (!p) continue;
    if (lastLine && isLineMan(p)) continue;
    const noble = p.line === true || Boolean(p.noble);
    const choice = noble && !s.liveCommand ? 'lead' : order;
    if (choice === 'leave') continue;
    if (choice === 'kill') killed.push(p.id);
    else if (noble) captured.push(p);
    else led.push(p);
  }
  // kořist: zásoby do nosnosti, celé stádo
  const fit = s.members.filter((m) => m.status === 'active' && !m.wounded).length;
  const room = Math.max(0, lootCapacity(fit, s.supplies.foodKg) - s.loot.foodKg);
  const loot = noLoot();
  loot.grainKg = Math.min(f.foodKg, room);
  for (const sp of SPECIES) loot.livestock[sp] = Math.floor(f.herd[sp] + 1e-9);
  takeLoot(s, loot);
  f.foodKg = 0;
  f.herd = noHerd();
  // lidé
  const ref = (p: Person): { villageId: string; personId: number } => ({
    villageId: f.villageId,
    personId: p.id,
  });
  if (led.length > 0) {
    s.loot.people = [...(s.loot.people ?? []), ...led.map((p) => structuredClone(p))];
  }
  const prisoners: Prisoner[] = captured.map((p) => ({
    id: guardPrisonerKey(s.id, ref(p)),
    ref: ref(p),
    ...(p.name === undefined ? {} : { name: p.name }),
    ...(p.noble ? { noble: true as const } : {}),
    sinceDay: s.day + 1,
  }));
  if (prisoners.length > 0) s.loot.prisoners = [...(s.loot.prisoners ?? []), ...prisoners];
  for (const p of [...led, ...captured]) s.captives.push(ref(p));
  const lost = [...killed, ...led.map((p) => p.id), ...captured.map((p) => p.id)];
  f.caughtTick = s.tick;
  if (lost.length > 0) f.lost = [...(f.lost ?? []), ...lost].sort((a, b) => a - b);
  if (remaining(f).length === 0) {
    f.status = 'caught';
    f.doneTick = s.tick;
  }
  if (lost.length > 0) {
    const body: VillageEventBody = {
      kind: 'refuge-caught',
      campaignId: s.id,
      refId: f.refId,
      killed: [...killed].sort((a, b) => a - b),
      led: led.map((p) => p.id).sort((a, b) => a - b),
      ...(prisoners.length > 0
        ? {
            captured: prisoners.map((x) => ({ personId: x.ref.personId, prisonerId: x.id })),
            captorVillageId: s.assembly.villageId,
          }
        : {}),
    };
    villageEvent(s, out, f.villageId, s.day + 1, body);
  }
  const watcher = ctx.world.watcherOf?.(f.villageId);
  if (watcher && watcher.playerId !== s.playerId) {
    out.notices.push({
      playerId: watcher.playerId,
      kind: 'refuge-caught',
      payload: {
        villageId: f.villageId,
        name: watcher.name,
        campaignId: s.id,
        killed: killed.length,
        led: led.length,
        captured: captured.length,
      },
      gameDay: s.day,
    });
  }
}
