import { villageCentre } from '../village/people/departure';
import type { Prisoner } from '../village/types';
import type { GridCell } from '../village/people/world-grid';
import {
  addVillage,
  alarmCellOf,
  alarmVillage,
  cellsBetween,
  hostCandidates,
  isWarned,
  ownerOf,
  refugeHosts,
  warn,
} from './alarm';
import type { AlarmMessenger, AlarmVillage, CampaignAlarm } from './alarm-types';
import {
  gatherMissing,
  gridOf,
  MissingData,
  sameCell,
  villageEvent,
  villageStart,
} from './campaign-tick';
import type { TickContext, TickOut } from './campaign-tick';
import type { CampaignState } from './campaign-types';
import { stepMover } from './movement';
import { guardPrisonerKey } from './raid-apply';
import { alarmTaken, messengerBackTick, withoutTaken } from './evacuation';
import { messengerOf, messengerSpeed, refugeOptions, refugeRoute } from './refuge-choice';
import { WAR } from './rules-war';
import { inSight } from './sight';
import { dayOfTick, TICKS_PER_SECOND } from './ticks';

// Posel z varované vsi do hradiště pána (war.md – Varování, poslové a útěk do hradiště; plán
// 2026-11-09 – Úloha 5, Otevřené 4; Martin 9. 11. 2026: „Posel jde pěšky“, „Kdo je poslem, volí
// hráč“). Posel běží po mapách jako skupina vojska (`stepMover`) tempem běhu – vesničan pěšky, muž
// rodu, kterého vybral hráč, na svém koni. Každá ves na mapě, kam vstoupí, se o vojsku dozví;
// hradiště, až doběhne. Vojsko ho chytí do 30 m, skupina s jezdcem už na dohled. Hradiště pak
// rozešle posly do vsí své domény (Úloha 6, Otevřené 5).

/** Co tažení z vsi odvedlo – i skupiny uprchlíků (Úloha 8); dřív zde. */
export { alarmTaken, withoutTaken, type AlarmTaken } from './evacuation';

/**
 * Ves `villageId` pošle posla do hradiště (záměr `alarm-messenger` hráče, pravidlo správce –
 * `decideAlarms`, Úloha 11): ves je varovaná a posla ještě neposlala, `refugeOptions` posla pustí
 * (hradiště, kdo běžet).
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
  const centre = villageStart(state, cell, ctx);
  const { hosts, ids } = refugeHosts(s, villageId, cell, ctx);
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
  const m = launch(s, ctx, out, {
    fromVillageId: villageId,
    personId: runner.personId,
    toVillageId: host.villageId,
    mounted: runner.mounted,
    cell,
    pos: centre,
    route: options.route.slice(1),
    target: { cell: host.cell, pos: host.center },
  });
  av.messenger = m.refId;
  av.decided ??= opts.by;
  av.hosts = ids;
  return true;
}

/**
 * Posel vyběhne (vsi do hradiště i hradiště do domény): `AlarmMessenger` s novým `refId`, domů
 * `messenger-out` na týž den; ostatní vsi na mapě výchozí vsi se dozví hned, jak vyběhne.
 */
function launch(
  s: CampaignState,
  ctx: TickContext,
  out: TickOut,
  spec: Pick<
    AlarmMessenger,
    'fromVillageId' | 'personId' | 'toVillageId' | 'mounted' | 'cell' | 'pos' | 'route' | 'target'
  >,
): AlarmMessenger {
  const alarm = s.alarm!;
  const refId = `${s.id}:a${alarm.nextRef}`;
  alarm.nextRef++;
  const m: AlarmMessenger = {
    refId,
    fromVillageId: spec.fromVillageId,
    personId: spec.personId,
    toVillageId: spec.toVillageId,
    mounted: spec.mounted,
    status: 'running',
    departTick: s.tick,
    cell: { ...spec.cell },
    pos: { ...spec.pos },
    route: spec.route.map((c) => ({ ...c })),
    leg: null,
    target: { cell: { ...spec.target.cell }, pos: { ...spec.target.pos } },
  };
  addMessenger(alarm, m);
  villageEvent(s, out, m.fromVillageId, s.day, {
    kind: 'messenger-out',
    campaignId: s.id,
    refId,
    personId: m.personId,
    toVillageId: m.toVillageId,
    mounted: m.mounted,
  });
  warnMap(s, m, ctx, out);
  return m;
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
  // poslové, které hradiště v tomto taktu rozešle do domény, vyběhnou až v dalším taktu
  for (const m of [...(s.alarm?.messengers ?? [])]) {
    if (m.status !== 'running') continue;
    const stepM = messengerSpeed(m.mounted, s.day) / TICKS_PER_SECOND;
    const step = stepMover(m, m.target.pos, stepM, s.day, ctx);
    if (step === 'crossed') warnMap(s, m, ctx, out);
    else if (step === 'arrived') {
      m.status = 'arrived';
      m.doneTick = s.tick;
      warnByMessenger(s, m, m.toVillageId, ctx, out);
      comeBack(s, m, ctx, out);
      hillfortHeard(s, m, ctx, out);
    } else if (step === 'stuck') recall(s, m, ctx, out);
  }
}

/**
 * Posel vsi doběhl do hradiště (ne posel hradiště do domény): NPC hradiště hned rozešle posly do
 * vsí své domény (Otevřené 5) – jednou. Za hradiště hráče rozhoduje `deciderOf` v `decideAlarms`
 * (`decideDomain`, plán 2026-11-14): vojvoda není doma – nastavení hned; vojvoda doma – hráč
 * u hry volí sám (`alarm-domain`), bez přítomnosti déle než `absentTicks` rozhodne nastavení.
 */
function hillfortHeard(s: CampaignState, m: AlarmMessenger, ctx: TickContext, out: TickOut): void {
  if (alarmVillage(s, m.fromVillageId)?.messenger !== m.refId) return;
  const hillfort = alarmVillage(s, m.toVillageId);
  if (!hillfort || !hillfort.owner.npc || hillfort.domain !== undefined) return;
  warnDomain(s, hillfort.villageId, ctx, out, null);
}

/**
 * Hradiště (ves `villageId` ve varování) rozešle posly do vsí své domény (war.md – Varování: „Hradiště
 * pak pošle posly do vsí domény, ke kterým vojsko míří“; plán – Otevřené 5): vsi vlastního rodu
 * a přímých vazalů ze světa (`CampaignWorld.domainOf`) do `WAR.alarm.domainRadiusCells` políček od
 * místa spatření, které o vojsku ještě nevědí a nikdo k nim neběží (kromě vsí, kterým vojsko
 * neškodí), nejbližší k místu spatření první (shoda – menší id), celkem nejvýš
 * `WAR.alarm.hillfortMessengers` poslů. `only` = vsi, které vybral hráč (`alarm-domain`); null =
 * všechny (NPC). Každý posel je jiný muž hradiště (`messengerOf` – vesničan pěšky); dojdou-li,
 * další nejde. Domů `messenger-out` na týž den (hradiště drží bariéra – je ve varování). Bez portu
 * nic; svět doménu ještě nenačetl – takt čeká. Vrací počet poslů.
 */
export function warnDomain(
  s: CampaignState,
  villageId: string,
  ctx: TickContext,
  out: TickOut,
  only: readonly string[] | null,
): number {
  const av = alarmVillage(s, villageId);
  const ask = ctx.world.domainOf;
  if (!av || !isWarned(s, villageId, s.tick) || !ask) return 0;
  const domain = ask(villageId);
  if (domain === null) throw new MissingData([], [villageId]);
  const sent = (av.domain ??= []);
  const chosen = only === null ? null : new Set(only);
  const targets = domainTargets(s, av, domain).filter(
    (d) => (chosen === null || chosen.has(d.villageId)) && !d.warned,
  );
  let count = 0;
  for (const target of targets) {
    if (sent.length >= WAR.alarm.hillfortMessengers) break;
    // ves na mapě hradiště se dozvěděla od posla, který vyběhl před chvílí
    if (isWarned(s, target.villageId, s.tick)) continue;
    const there = ctx.world.villageAt(target.villageId, s.day);
    if (there === null) throw new MissingData([], [target.villageId]);
    if (ctx.world.harmless?.(target.villageId, s.playerId)) continue;
    const state = ctx.world.villageAt(villageId, s.day);
    if (state === null) throw new MissingData([], [villageId]);
    const home = withoutTaken(state, alarmTaken(s, villageId, s.day, ctx.world.clock));
    const runner = messengerOf(home, s.day);
    if (runner === null) break;
    const cell = alarmCellOf(av);
    const m = launch(s, ctx, out, {
      fromVillageId: villageId,
      personId: runner.personId,
      toVillageId: target.villageId,
      mounted: runner.mounted,
      cell,
      pos: villageStart(state, cell, ctx),
      route: refugeRoute(cell, target.cell).slice(1),
      target: { cell: { ...target.cell }, pos: villageCentre(there) },
    });
    sent.push(m.refId);
    count++;
  }
  return count;
}

/** Ves domény hradiště v dosahu varování (`domainTargets`). */
export interface DomainTarget {
  villageId: string;
  cell: GridCell;
  /** Ves o vojsku už ví, nebo k ní posel běží – posla nepotřebuje. */
  warned: boolean;
}

/**
 * Vsi domény hradiště `av` (`domain` ze světa – `CampaignWorld.domainOf`) do
 * `WAR.alarm.domainRadiusCells` políček od místa spatření, kromě hradiště samého, nejbližší
 * k místu spatření první (čtverec vzdálenosti políček, shoda – menší id). `warned` – ví o vojsku
 * (`isWarned`), nebo k ní posel běží. Komu hradiště posly pošle (`warnDomain`) a co hráč vybírá
 * (pohled – Úloha 12).
 */
export function domainTargets(
  s: CampaignState,
  av: AlarmVillage,
  domain: readonly { villageId: string; cell: GridCell }[],
): DomainTarget[] {
  const seen = av.seenAt.cell;
  const running = new Set(
    (s.alarm?.messengers ?? []).filter((m) => m.status === 'running').map((m) => m.toVillageId),
  );
  const dist = (c: GridCell): number =>
    (c.x - seen.x) * (c.x - seen.x) + (c.y - seen.y) * (c.y - seen.y);
  return domain
    .filter(
      (d) =>
        d.villageId !== av.villageId && cellsBetween(d.cell, seen) <= WAR.alarm.domainRadiusCells,
    )
    .sort(
      (a, b) =>
        dist(a.cell) - dist(b.cell) ||
        (a.villageId < b.villageId ? -1 : a.villageId > b.villageId ? 1 : 0),
    )
    .map((d) => ({
      villageId: d.villageId,
      cell: { ...d.cell },
      warned: isWarned(s, d.villageId, s.tick) || running.has(d.villageId),
    }));
}

/**
 * Vsi na mapě posla (kromě hradiště – to se dozví, až posel doběhne) se o vojsku dozví; co ze světa
 * chybí, ohlásí za všechny vsi najednou (`gatherMissing`).
 */
function warnMap(s: CampaignState, m: AlarmMessenger, ctx: TickContext, out: TickOut): void {
  const map = ctx.world.landscapeOf(m.cell);
  if (map === null) throw new MissingData([{ ...m.cell }], []);
  const others = map.villageIds.filter((id) => id !== m.toVillageId);
  gatherMissing(others, (villageId) => warnByMessenger(s, m, villageId, ctx, out));
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
    const owner = ownerOf(villageId, ctx);
    const hosts = hostCandidates(villageId, m.cell, ctx);
    const v: AlarmVillage = {
      villageId,
      owner,
      seenTick: from.seenTick,
      seenAt: structuredClone(from.seenAt),
      warnTick: s.tick,
      by: 'messenger',
      cell: { ...m.cell },
      ...(hosts === null ? {} : { hosts }),
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
  villageEvent(s, out, m.fromVillageId, dayOfTick(messengerBackTick(m), ctx.world.clock), {
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
    // klíč zajetí s vsí posla – číslo osoby by se mohlo potkat s lidmi napadené vsi (jako uprchlíci)
    const prisonerId = guardPrisonerKey(s.id, ref);
    if (fate === 'led' && p) {
      s.loot.people = [...(s.loot.people ?? []), structuredClone(p)];
      s.captives.push(ref);
    }
    if (fate === 'captured' && p) {
      const prisoner: Prisoner = {
        id: prisonerId,
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
      ...(fate === 'captured' ? { captorVillageId: s.assembly.villageId, prisonerId } : {}),
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
