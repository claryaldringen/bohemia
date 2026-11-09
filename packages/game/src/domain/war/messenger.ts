import type { WorldClock } from '../calendar';
import { villageCentre } from '../village/departure';
import type { Prisoner, VillageState } from '../village/types';
import type { GridCell } from '../village/world-grid';
import { addVillage, alarmCellOf, alarmVillage, isWarned, ownerOf, warn } from './alarm';
import type { AlarmMessenger, AlarmVillage, CampaignAlarm } from './alarm-types';
import { gridOf, MissingData, sameCell, villageEvent } from './campaign-tick';
import type { TickContext, TickOut } from './campaign-tick';
import type { CampaignState } from './campaign-types';
import { stepMover } from './movement';
import { prisonerKey } from './raid-apply';
import {
  messengerOf,
  messengerSpeed,
  refugeHostOf,
  refugeOptions,
  type RefugeHost,
} from './refuge-choice';
import { WAR } from './rules-war';
import { inSight } from './sight';
import { dayOfTick, TICKS_PER_SECOND } from './ticks';

// Posel z varované vsi do hradiště pána (war.md – Varování, poslové a útěk do hradiště; plán
// 2026-11-09 – Úloha 5, Otevřené 4; Martin 9. 11. 2026: „Posel jde pěšky“, „Kdo je poslem, volí
// hráč“). Posel běží po mapách jako skupina vojska (`stepMover`) tempem běhu – vesničan pěšky, muž
// rodu, kterého vybral hráč, na svém koni. Každá ves na mapě, kam vstoupí, se o vojsku dozví;
// hradiště, až doběhne. Vojsko ho chytí do 30 m, skupina s jezdcem už na dohled.

/** Co tažení v den `day` z vsi odvedlo (plán – Review Focus 2); Úloha 8 doplní zásoby a stádo. */
export interface AlarmTaken {
  /** Lidé vsi, kteří jsou pryč s tažením (posel) – v boji ani ve skupinách domů nejsou. */
  people: Set<number>;
}

/**
 * Co tažení z vsi `villageId` odvedlo do dne `day` a stav vsi `villageAt(…, day)` (ke konci dne
 * `day − 1`) to ještě nemusí znát: poslové, kteří vyběhli nejpozději v den `day` a nevrátili se
 * domů před ním.
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
      if (dayOfTick(backTick(m), clock) < day) continue;
    }
    people.add(m.personId);
  }
  return { people };
}

/** Stav vsi bez lidí, které tažení odvedlo (mělká kopie – lidé se jen vynechají). */
export function withoutTaken(state: VillageState, taken: AlarmTaken): VillageState {
  if (taken.people.size === 0) return state;
  return { ...state, people: state.people.filter((p) => !taken.people.has(p.id)) };
}

/** Takt návratu posla domů – vrací se tak dlouho, jak dlouho běžel (plán – Úloha 5). */
function backTick(m: AlarmMessenger): number {
  const done = m.doneTick ?? m.departTick;
  return done + (done - m.departTick);
}

/**
 * Hradiště pro ves (Otevřené 1): kandidáti ze světa (`CampaignWorld.refugeHostsOf` – Úloha 6; bez
 * portu žádní = „Pán nemá hradiště“) do `WAR.alarm.refugeMaxCells` políček, s hotovým opevněním
 * s plochou ke dni tažení.
 */
function refugeHosts(
  s: CampaignState,
  villageId: string,
  cell: GridCell,
  ctx: TickContext,
): RefugeHost[] {
  const ask = ctx.world.refugeHostsOf;
  if (!ask) return [];
  const candidates = ask(villageId);
  if (candidates === null) throw new MissingData([], [villageId]);
  const hosts: RefugeHost[] = [];
  for (const c of candidates) {
    const cells = Math.max(Math.abs(c.cell.x - cell.x), Math.abs(c.cell.y - cell.y));
    if (cells > WAR.alarm.refugeMaxCells) continue;
    const map = ctx.world.landscapeOf(c.cell);
    if (map === null) throw new MissingData([{ ...c.cell }], []);
    const state = ctx.world.villageAt(c.villageId, s.day);
    if (state === null) throw new MissingData([], [c.villageId]);
    const host = refugeHostOf(c.villageId, state, map.landscape, c.cell, s.day);
    if (host) hosts.push(host);
  }
  return hosts;
}

/**
 * Ves `villageId` pošle posla do hradiště (záměr `alarm-messenger` hráče; správce – Úloha 11):
 * ves je varovaná a posla ještě neposlala, `refugeOptions` posla pustí (hradiště, kdo běžet).
 * Posel `personId` (výběr hráče – `messengerOf`), bez něj vesničan pěšky. Domů `messenger-out` na
 * týž den (ves drží bariéra – je ve varování). Vrací, zda posel vyběhl.
 */
export function sendMessenger(
  s: CampaignState,
  villageId: string,
  ctx: TickContext,
  out: TickOut,
  opts: { personId?: number; by: 'player' | 'steward' },
): boolean {
  const av = alarmVillage(s, villageId);
  if (!av || !isWarned(s, villageId, s.tick) || av.messenger !== undefined) return false;
  const cell = alarmCellOf(av);
  const state = ctx.world.villageAt(villageId, s.day);
  if (state === null) throw new MissingData([], [villageId]);
  const home = withoutTaken(state, alarmTaken(s, villageId, s.day, ctx.world.clock));
  const centre = villageCentre(state);
  const hosts = refugeHosts(s, villageId, cell, ctx);
  const options = refugeOptions({
    state: home,
    day: s.day,
    village: { cell, pos: centre },
    grid: gridOf(cell, s.day, ctx),
    seenAt: av.seenAt,
    sinceSeenTicks: s.tick - av.seenTick,
    hosts,
    ...(opts.personId === undefined ? {} : { messengerId: opts.personId }),
  });
  const host = options.host;
  const runner = messengerOf(home, s.day, opts.personId);
  if (options.messenger.blocked !== null || host === null || runner === null) return false;
  const alarm = s.alarm!;
  const refId = `${s.id}:a${alarm.nextRef}`;
  alarm.nextRef++;
  const m: AlarmMessenger = {
    refId,
    fromVillageId: villageId,
    personId: runner.personId,
    toVillageId: host.villageId,
    mounted: runner.mounted,
    status: 'running',
    departTick: s.tick,
    cell: { ...cell },
    pos: { ...centre },
    route: options.route.slice(1).map((c) => ({ ...c })),
    leg: null,
    target: { cell: { ...host.cell }, pos: { ...host.center } },
  };
  addMessenger(alarm, m);
  av.messenger = refId;
  av.decided ??= opts.by;
  av.hosts = hosts.map((h) => h.villageId).sort();
  villageEvent(s, out, villageId, s.day, {
    kind: 'messenger-out',
    campaignId: s.id,
    refId,
    personId: m.personId,
    toVillageId: m.toVillageId,
    mounted: m.mounted,
  });
  // ostatní vsi na mapě vsi se dozví hned, jak posel vyběhne
  warnMap(s, m, ctx, out);
  return true;
}

/** Zapíše posla – seřazené podle `refId` (stav je JSON, pořadí pevné). */
function addMessenger(alarm: CampaignAlarm, m: AlarmMessenger): void {
  const at = alarm.messengers.findIndex((x) => x.refId > m.refId);
  if (at < 0) alarm.messengers.push(m);
  else alarm.messengers.splice(at, 0, m);
}

/**
 * Posli o jeden takt (po pohybu vojska a spatření): běh `messengerSpeed` po mapách; na nové mapě
 * varuje vsi, v cíli hradiště (`arrived`, `messenger-back` domů za tolik, kolik běžel). Kdo nemá
 * kudy, vrátí se domů (`recalled`).
 */
export function moveMessengers(s: CampaignState, ctx: TickContext, out: TickOut): void {
  for (const m of s.alarm?.messengers ?? []) {
    if (m.status !== 'running') continue;
    const stepM = messengerSpeed(m.mounted, s.day) / TICKS_PER_SECOND;
    const step = stepMover(m, m.target.pos, stepM, s.day, ctx);
    if (step === 'crossed') warnMap(s, m, ctx, out);
    else if (step === 'arrived') {
      m.status = 'arrived';
      m.doneTick = s.tick;
      warnByMessenger(s, m, m.toVillageId, ctx, out);
      comeBack(s, m, ctx, out);
    } else if (step === 'stuck') recall(s, m, ctx, out);
  }
}

/** Vsi na mapě posla (kromě hradiště – to se dozví, až posel doběhne) se o vojsku dozví. */
function warnMap(s: CampaignState, m: AlarmMessenger, ctx: TickContext, out: TickOut): void {
  const map = ctx.world.landscapeOf(m.cell);
  if (map === null) throw new MissingData([{ ...m.cell }], []);
  for (const villageId of map.villageIds) {
    if (villageId !== m.toVillageId) warnByMessenger(s, m, villageId, ctx, out);
  }
}

/**
 * Posel varuje ves `villageId` na své mapě (kromě vsí, kterým vojsko neškodí – `harmless`): ves,
 * která o vojsku neví, je varovaná v tomto taktu (`by: 'messenger'`, spatření – kde a kdy vojsko
 * viděla ves posla, z toho ves odhaduje, zda útěk stihne). Signál hrozby den nato (rozhodnutí 13 –
 * ves daleko od vojska bariéra držet nemusí).
 */
function warnByMessenger(
  s: CampaignState,
  m: AlarmMessenger,
  villageId: string,
  ctx: TickContext,
  out: TickOut,
): void {
  if (ctx.world.harmless?.(villageId, s.playerId)) return;
  const known = alarmVillage(s, villageId);
  if (known !== null && known.warnTick <= s.tick) return;
  const from = alarmVillage(s, m.fromVillageId);
  if (from === null) return;
  if (known === null) {
    const v: AlarmVillage = {
      villageId,
      owner: ownerOf(villageId, ctx),
      seenTick: from.seenTick,
      seenAt: structuredClone(from.seenAt),
      warnTick: s.tick,
      by: 'messenger',
      cell: { ...m.cell },
    };
    addVillage(s, v);
  } else {
    known.warnTick = s.tick;
    known.by = 'messenger';
  }
  warn(s, villageId, ctx, out, s.day + 1);
}

/** Posel se vrací domů – `messenger-back` na den návratu (vrací se tak dlouho, jak běžel). */
function comeBack(s: CampaignState, m: AlarmMessenger, ctx: TickContext, out: TickOut): void {
  villageEvent(s, out, m.fromVillageId, dayOfTick(backTick(m), ctx.world.clock), {
    kind: 'messenger-back',
    campaignId: s.id,
    refId: m.refId,
    personId: m.personId,
  });
}

/** Posel nedoběhne (nemá kudy, tažení skončilo) – vrátí se domů (návrh Clauda). */
function recall(s: CampaignState, m: AlarmMessenger, ctx: TickContext, out: TickOut): void {
  m.status = 'recalled';
  m.doneTick = s.tick;
  comeBack(s, m, ctx, out);
}

/**
 * Konec tažení (`finish`): kdo ještě běží, se vrátí domů – vojsko odtáhlo, další takty nebudou
 * (návrh Clauda).
 */
export function recallMessengers(s: CampaignState, ctx: TickContext, out: TickOut): void {
  for (const m of s.alarm?.messengers ?? []) {
    if (m.status === 'running') recall(s, m, ctx, out);
  }
}

/**
 * Chycení poslů po pohybu (Otevřené 4): skupina vojska s aktivním mužem na mapě posla do
 * `WAR.alarm.catchM`, nebo skupina s jezdcem, která posla vidí (`inSight`). Osud podle volby ke
 * vzdaným (`CampaignState.surrendered`, výchozí odvést): pobít – padne, odvést – vesničan do
 * kořisti (odvedený), muž rodu a šlechtic do zajetí (NPC velitel je zajme vždy – jako po nájezdu),
 * nechat – běží dál. Domů `messenger-caught` den nato, majiteli vsi upozornění.
 */
export function catchMessengers(s: CampaignState, ctx: TickContext, out: TickOut): void {
  for (const m of s.alarm?.messengers ?? []) {
    if (m.status !== 'running' || !caught(s, m, ctx)) continue;
    const home = ctx.world.villageAt(m.fromVillageId, s.day);
    if (home === null) throw new MissingData([], [m.fromVillageId]);
    const p = home.people.find((x) => x.id === m.personId);
    const noble = p !== undefined && (p.line === true || p.noble !== undefined);
    const order = s.surrendered ?? 'lead';
    const choice = noble && !s.liveCommand ? 'lead' : order;
    if (choice === 'leave') continue;
    const fate = choice === 'kill' ? 'killed' : noble ? 'captured' : 'led';
    m.status = 'caught';
    m.doneTick = s.tick;
    const ref = { villageId: m.fromVillageId, personId: m.personId };
    if (fate === 'led' && p) {
      s.loot.people = [...(s.loot.people ?? []), structuredClone(p)];
      s.captives.push(ref);
    }
    if (fate === 'captured' && p) {
      const prisoner: Prisoner = {
        id: prisonerKey(s.id, p.id),
        ref,
        ...(p.name === undefined ? {} : { name: p.name }),
        ...(p.noble ? { noble: true as const } : {}),
        sinceDay: s.day + 1,
      };
      s.loot.prisoners = [...(s.loot.prisoners ?? []), prisoner];
      s.captives.push(ref);
    }
    villageEvent(s, out, m.fromVillageId, s.day + 1, {
      kind: 'messenger-caught',
      campaignId: s.id,
      refId: m.refId,
      personId: m.personId,
      fate,
      ...(fate === 'captured' ? { captorVillageId: s.assembly.villageId } : {}),
    });
    const watcher = ctx.world.watcherOf?.(m.fromVillageId);
    if (watcher && watcher.playerId !== s.playerId) {
      out.notices.push({
        playerId: watcher.playerId,
        kind: 'messenger-caught',
        payload: { villageId: m.fromVillageId, name: watcher.name, campaignId: s.id, fate },
        gameDay: s.day,
      });
    }
  }
}

/** Chytí posla některá skupina vojska (do 30 m, nebo jezdci na dohled)? */
function caught(s: CampaignState, m: AlarmMessenger, ctx: TickContext): boolean {
  const reach = WAR.alarm.catchM * WAR.alarm.catchM;
  for (const g of s.groups) {
    if (!sameCell(g.cell, m.cell)) continue;
    const men = s.members.filter((x) => x.group === g.id && x.status === 'active');
    if (men.length === 0) continue;
    const dx = g.pos.x - m.pos.x;
    const dz = g.pos.z - m.pos.z;
    if (dx * dx + dz * dz <= reach) return true;
    if (men.some((x) => x.mounted) && inSight(gridOf(m.cell, s.day, ctx), g.pos, m.pos)) {
      return true;
    }
  }
  return false;
}
