import type { WorldClock } from '../domain/calendar';
import type { FlightMode, VillageState } from '../domain/village/types';
import type { GridCell } from '../domain/village/people/world-grid';
import { alarmEnded, alarmVillage } from '../domain/war/alarm';
import { alarmChoices, heardTick } from '../domain/war/alarm-steward';
import type { AlarmFlight, AlarmMessenger, AlarmVillage } from '../domain/war/alarm-types';
import { MissingData, tickContext, type TickContext } from '../domain/war/campaign-tick';
import type {
  CampaignMap,
  CampaignState,
  CampaignWorld,
  IntentBody,
} from '../domain/war/campaign-types';
import { yieldingLord } from '../domain/war/campaign';
import { flightPace } from '../domain/war/evacuation';
import { lordHomeAt } from '../domain/war/lord-home';
import { prisonerKey } from '../domain/war/raid-apply';
import type { MarchGridMemo } from '../domain/war/march-grid';
import { domainTargets, type DomainTarget } from '../domain/war/messenger';
import {
  armyEtaTicks,
  flightEtaTicks,
  messengerCandidates,
  type AlarmBlock,
  type AlarmOption,
} from '../domain/war/refuge-choice';
import { WAR } from '../domain/war/rules-war';
import { hoursPerTick } from '../domain/war/ticks';
import {
  queueCampaignIntent,
  type AlarmOwnerPort,
  type CampaignCells,
  type CampaignRepository,
} from './campaigns';
import { refugeReturnState } from './refuge-return';
import { ACTION_RIGHTS, requireRight, villageAccess, type RightsDeps } from './rights';
import type { VillageRecord } from './villages';

// Pohled na varování a příkazy obránce (war.md – Varování, poslové a útěk do hradiště: „při
// varování v panelu vsi ikony Poslat posla, Ukrýt v lese, Do hradiště – jen lidé, Do hradiště – se
// vším (zašedlé s důvodem, když nejde – „Pán nemá hradiště“, „Nestihnou to“ s odhadem času), po
// útěku Vrátit se“; plán 2026-11-09 – Úloha 12). Co ves může, počítá táž doména jako tažení
// (`alarmChoices` – pravidlo správce), nad posledním kontrolním bodem tažení; příkaz jde jako záměr
// do tažení na takt teď + 2 (jako `orderBreakout`) a tažení ho ověří znovu. Nevarovaná ves o vojsku
// neví – pohled ji nerozliší od vsi, na kterou nikdo netáhne (mlha války).

/** Volba při varování (ikony v panelu vsi). */
export type AlarmChoice = 'messenger' | FlightMode;

/** Pořadí ikon: Poslat posla, Ukrýt v lese, Do hradiště – jen lidé, Do hradiště – se vším. */
export const ALARM_CHOICES: readonly AlarmChoice[] = ['messenger', 'forest', 'people', 'all'];

/**
 * Proč volba nejde: důvody domény (`AlarmBlock`) a pohledu – ves o vojsku neví, u vsi se už bojuje
 * (útěk rozhoduje postoj), hradiště nemá komu poslat posly, tažení skončilo.
 */
export type AlarmViewBlock =
  AlarmBlock | 'unwarned' | 'battle' | 'no-domain' | 'over' | 'lordAway' | 'notRaided';

/**
 * Texty důvodů (jediné místo – rozhraní u kurzoru i odpověď příkazu). Doslovně ze specu „Pán nemá
 * hradiště“ a „Nestihnou to“ (rozhraní k němu doplní odhad času); ostatní návrh Clauda.
 */
export const ALARM_BLOCKED: Readonly<Record<AlarmViewBlock, string>> = {
  'no-hillfort': 'Pán nemá hradiště.',
  'too-late': 'Nestihnou to.',
  'no-forest': 'Na mapě není les.',
  'no-runner': 'Nikdo nemůže běžet.',
  gone: 'Lidé už odešli.',
  sent: 'Posel už běží.',
  unwarned: 'Ves o vojsku neví.',
  battle: 'U vsi se už bojuje.',
  'no-domain': 'Do domény není koho varovat.',
  over: 'Vojsko už odtáhlo.',
  // vzdání vojvody (plán 2026-11-14 – Úloha 8, návrh Clauda)
  lordAway: 'Vojvoda není doma.',
  notRaided: 'Vojsko ještě nepřišlo.',
};

/** Jedna volba v pohledu: zda jde a odhady v herních dnech (2 desetinná místa). */
export interface AlarmViewOption {
  blocked: AlarmViewBlock | null;
  /** Za kolik dní dojdou do cíle (hradiště, les) / posel do hradiště. */
  etaDays?: number;
  /** Za kolik dní skupina opustí mapu vsi (útěk do hradiště – „z mapy jim to potrvá…“). */
  leaveDays?: number;
}

/** Koho lze poslat jako posla (Martin 9. 11. 2026: „Kdo je poslem, volí hráč“). */
export interface AlarmRunner {
  personId: number;
  /** Jméno muže rodu; vesničan bez jména null. */
  name: string | null;
  /** Muž rodu (jinak vesničan – výchozí posel pěšky). */
  line: boolean;
  /** Jede na koni (muž rodu, který umí jezdit a má jezdeckého koně). */
  mounted: boolean;
  /** Za kolik dní doběhne do hradiště; bez hradiště null. */
  etaDays: number | null;
}

/** Ves domény, kam může hradiště hráče poslat posla (`alarm-domain`). */
export interface AlarmDomainVillage {
  villageId: string;
  name: string;
  /** Už ví o vojsku, nebo k ní posel běží. */
  warned: boolean;
}

/** Tlačítko **Vrátit se** – po útěku. */
export interface AlarmReturn {
  /** Proč teď nejde (`REFUGE_RETURN_REASONS`); null – jde. */
  blocked: string | null;
  /** Návrat je rozhodnutý – lidé budou doma za tolik dní. */
  backInDays?: number;
}

/** Pohled hráče na varování vsi (panel vsi – Úloha 13, scéna – Úloha 14). */
export interface AlarmView {
  /** Tažení, ze kterého ves ví (nejnovější varování); nevarovaná ves null. */
  campaignId: string | null;
  villageId: string;
  /** Ves o cizím vojsku ví (vesničan doběhl, posel přišel). */
  warned: boolean;
  /** Kdo za ves už rozhodl; null – nikdo. */
  decided: 'player' | 'steward' | null;
  /** Za kolik dní tu může být vojsko (odhad od místa spatření); nevarovaná ves null. */
  armyEtaDays: number | null;
  options: Record<AlarmChoice, AlarmViewOption>;
  /** Koho lze poslat – první je výchozí posel; prázdné – nikdo. */
  runners: AlarmRunner[];
  /** Hradiště, kam by šli a kam běží posel; null – žádné. */
  host: { villageId: string; name: string } | null;
  /** Posel vsi; null – žádný nevyběhl. */
  messenger: { status: AlarmMessenger['status']; mounted: boolean } | null;
  /** Skupina uprchlíků vsi; null – nikdo neodešel. `etaDays` jen na cestě. */
  flight: { mode: FlightMode; status: AlarmFlight['status']; etaDays: number | null } | null;
  /**
   * Vzdání vojvody (bílá vlajka): null – hráčův muž ve vsi nežije (nebo ves o vojsku neví);
   * jinak `blocked` je důvod, proč teď nejde (`lordAway`, `notRaided`), nebo null – jde.
   */
  yieldLord: { blocked: AlarmViewBlock | null } | null;
  /** Vrátit se (ves má lidi na útěku – i po skončeném tažení); null – nikdo pryč. */
  ret: AlarmReturn | null;
  /**
   * Hradiště hráče, ke kterému doběhl posel vsi (Otevřené 5): vsi domény v dosahu, nejbližší
   * k místu spatření první; chybí – ves hradištěm není (nebo svět doménu nezná).
   */
  domain?: AlarmDomainVillage[];
  /** Kolik poslů hradiště do domény ještě smí poslat (`WAR.alarm.hillfortMessengers`). */
  domainLeft?: number;
}

export interface AlarmViewDeps extends RightsDeps {
  campaigns: Pick<CampaignRepository, 'activeAlarming' | 'checkpoint'>;
  /** Mapy políček (krajina, vsi na mapě) – jako tažení. */
  cells: CampaignCells;
  /** Hodiny světa – takty herního dne v odhadech. */
  world: WorldClock;
  /** Doména hradiště hráče; chybí – posly do domény pohled nenabízí. */
  alarmOwners?: Pick<AlarmOwnerPort, 'domainOf'>;
  /**
   * Mřížky pochodu napříč dotazy (klíč = identita krajiny, překážek a stavu vsi a den) – pohled se
   * ptá každé 2 s nad týmž stavem; chybí – mřížka se staví v každém dotazu.
   */
  grids?: MarchGridMemo;
}

export interface CommandAlarmDeps extends AlarmViewDeps {
  campaigns: Pick<CampaignRepository, 'activeAlarming' | 'checkpoint' | 'addIntent'>;
}

/** Příkaz obránce varované vsi. */
export type AlarmCommand =
  /** Poslat posla – `personId` vybraný muž (`runners`), bez něj výchozí vesničan. */
  | { kind: 'messenger'; personId?: number }
  /** Ukrýt v lese, Do hradiště – jen lidé / se vším. */
  | { kind: 'flee'; mode: FlightMode }
  /** Hradiště pošle posly do vybraných vsí domény (i nikam – správce už nerozhoduje). */
  | { kind: 'domain'; to: string[] }
  /** Vzdát vojvodu – zajetí vojvody, nájezd končí (`lord-surrender`). */
  | { kind: 'yield-lord' };

export type CommandAlarmResult = { ok: true; campaignId: string } | { ok: false; reason: string };

/** Nejvýš tolik kol načítání dat pro výpočet voleb (mapy, vsi). */
const MAX_LOADS = 8;
const NO_OPTION: AlarmViewOption = { blocked: 'unwarned' };

/** Varování vsi v tažení, ze kterého ves ví. */
interface FoundAlarm {
  campaignId: string;
  s: CampaignState;
  av: AlarmVillage;
}

/**
 * Nejnovější varování vsi `villageId` (největší `warnTick`; shoda – novější tažení), za kterou
 * rozhoduje hráč `playerId`: jen ves, která v taktu kontrolního bodu o vojsku ví.
 */
async function latestAlarm(
  deps: Pick<AlarmViewDeps, 'campaigns'>,
  villageId: string,
  playerId: string,
): Promise<FoundAlarm | null> {
  let best: FoundAlarm | null = null;
  for (const campaignId of await deps.campaigns.activeAlarming(villageId)) {
    const s = (await deps.campaigns.checkpoint(campaignId))?.state;
    const av = s ? alarmVillage(s, villageId) : null;
    if (!s || !av || av.warnTick > s.tick || av.owner.playerId !== playerId) continue;
    if (!best || av.warnTick >= best.av.warnTick) best = { campaignId, s, av };
  }
  return best;
}

/**
 * Svět tažení pro pohled: mapy a vsi se načtou, když na ně výpočet čeká (`MissingData`), jako
 * v `computeCampaign`, ale bez bariéry – uložený stav vsi (odhad; tažení volbu ověří znovu).
 * Kandidáti hradišť jsou ti, které tažení zapsalo do varování (`AlarmVillage.hosts`).
 */
class AlarmWorld {
  private readonly maps = new Map<string, CampaignMap>();
  private readonly states = new Map<string, VillageState>();
  readonly names = new Map<string, string>();
  private readonly hosts = new Map<string, { villageId: string; cell: GridCell }[]>();
  readonly ctx: TickContext;

  constructor(private readonly deps: AlarmViewDeps) {
    const key = (c: GridCell): string => `${c.x},${c.y}`;
    const world: CampaignWorld = {
      clock: deps.world,
      landscapeOf: (cell) => this.maps.get(key(cell)) ?? null,
      villageAt: (villageId) => this.states.get(villageId) ?? null,
      villageNameOf: (villageId) => this.names.get(villageId) ?? null,
      refugeHostsOf: (villageId) => this.hosts.get(villageId) ?? [],
      ...(deps.grids ? { grids: deps.grids } : {}),
    };
    this.ctx = tickContext(world);
  }

  /** Kandidáti hradišť vsi `av` s políčky jejich sídel (vsi bez políčka světa ne). */
  async loadHosts(av: AlarmVillage): Promise<void> {
    const out: { villageId: string; cell: GridCell }[] = [];
    for (const villageId of av.hosts ?? []) {
      const record = await this.record(villageId);
      const settlement = record ? await this.deps.settlements.find(record.settlementId) : null;
      if (settlement?.worldCell) out.push({ villageId, cell: { ...settlement.worldCell } });
    }
    this.hosts.set(av.villageId, out);
  }

  /** Ves z úložiště (zapamatuje stav a jméno). */
  async record(villageId: string): Promise<VillageRecord | null> {
    const record = await this.deps.villages.find(villageId);
    if (record) {
      this.states.set(villageId, record.state);
      this.names.set(villageId, record.name);
    }
    return record;
  }

  /** Spočte `run`; chybí-li data, načte je a zkusí znovu. Nedají-li se načíst, null. */
  async compute<T>(run: (ctx: TickContext) => T): Promise<T | null> {
    for (let round = 0; round < MAX_LOADS; round++) {
      try {
        return run(this.ctx);
      } catch (error) {
        if (!(error instanceof MissingData)) throw error;
        let loaded = false;
        for (const cell of error.cells) {
          const key = `${cell.x},${cell.y}`;
          if (this.maps.has(key)) continue;
          this.maps.set(key, await this.deps.cells.mapOf(cell));
          loaded = true;
        }
        for (const villageId of error.villageIds) {
          if (!this.states.has(villageId) && (await this.record(villageId))) loaded = true;
        }
        if (!loaded) return null;
      }
    }
    return null;
  }
}

/** Takty → herní dny (2 desetinná místa). */
function toDays(ticks: number, world: WorldClock): number {
  return Math.round((ticks / (24 / hoursPerTick(world))) * 100) / 100;
}

/** Volba domény do pohledu; útěk při boji u vsi zašedne (rozhoduje postoj). */
function viewOption(
  o: AlarmOption,
  flee: boolean,
  battle: boolean,
  world: WorldClock,
): AlarmViewOption {
  return {
    blocked: o.blocked ?? (flee && battle ? 'battle' : null),
    ...(o.etaTicks === undefined ? {} : { etaDays: toDays(o.etaTicks, world) }),
    ...(o.leaveTicks === undefined ? {} : { leaveDays: toDays(o.leaveTicks, world) }),
  };
}

/** Bojuje se u vsi (útěk už rozhoduje postoj vsi – `planDefense`)? */
const battleAt = (s: CampaignState, villageId: string): boolean =>
  s.battle !== undefined && s.target.villageId === villageId;

/** Vrátit se – stav návratu vsi a dny do příchodu. */
async function returnView(
  deps: AlarmViewDeps,
  home: VillageRecord,
  today: number,
): Promise<AlarmReturn | null> {
  const state = await refugeReturnState(deps, home);
  if (!state) return null;
  return {
    blocked: state.blocked,
    ...(state.arrivesDay === undefined
      ? {}
      : { backInDays: Math.max(0, state.arrivesDay - today) }),
  };
}

/** Pohled nevarované vsi – volby zašedlé, jen případný návrat. */
function quietView(villageId: string, ret: AlarmReturn | null): AlarmView {
  return {
    campaignId: null,
    villageId,
    warned: false,
    decided: null,
    yieldLord: null,
    armyEtaDays: null,
    options: { messenger: NO_OPTION, forest: NO_OPTION, people: NO_OPTION, all: NO_OPTION },
    runners: [],
    host: null,
    messenger: null,
    flight: null,
    ret,
  };
}

/** Doběhl k vsi posel jiné vsi (je hradištěm) a smí ještě poslat posly do domény? */
function domainOpen(s: CampaignState, av: AlarmVillage): boolean {
  return (
    heardTick(s, av.villageId) !== null && (av.domain?.length ?? 0) < WAR.alarm.hillfortMessengers
  );
}

/** Vsi domény hradiště v dosahu (port `domainOf`); bez portu nebo hradiště null. */
async function domainOf(deps: AlarmViewDeps, found: FoundAlarm): Promise<DomainTarget[] | null> {
  if (!deps.alarmOwners || !domainOpen(found.s, found.av)) return null;
  const domain = await deps.alarmOwners.domainOf(found.av.villageId);
  return domainTargets(found.s, found.av, domain);
}

/**
 * Pohled hráče `playerId` na varování vsi `villageId` (panel vsi – Úloha 13): dívat se smí, kdo
 * vidí ves (i bez práva `war` – rozhraní volby zašedí důvodem práva); cizí hráč null. Varovaná ves:
 * tažení s nejnovějším varováním, volby (`alarmChoices` nad kontrolním bodem) s důvody a odhady ve
 * dnech, koho lze poslat, posel a skupina; hradiště hráče i vsi domény. Ves s lidmi na útěku – i po
 * skončeném tažení – Vrátit se.
 */
export async function villageAlarmView(
  deps: AlarmViewDeps,
  input: { playerId: string; villageId: string; today: number },
): Promise<AlarmView | null> {
  const access = await villageAccess(deps, input);
  if (!access) return null;
  const home = access.found.village;
  const ret = await returnView(deps, home, input.today);
  const found = await latestAlarm(deps, home.id, access.found.settlement.ownerId);
  // vzdáním vojvody varování té vsi před tímto tažením končí (Ruling 7)
  if (!found || alarmEnded(found.s, home.id)) return quietView(home.id, ret);
  const { s, av } = found;
  const world = new AlarmWorld(deps);
  await world.loadHosts(av);
  const domain = await domainOf(deps, found);
  const computed = await world.compute((ctx) => {
    const base = alarmChoices(s, av, s.tick, ctx);
    const picks = messengerCandidates(base.home, s.day);
    // posel na koni doběhne dřív – odhad zvlášť pro pěšího a jezdce
    const eta = new Map<boolean, number | undefined>();
    for (const p of picks) {
      if (eta.has(p.mounted)) continue;
      const o = alarmChoices(s, av, s.tick, ctx, p.personId).options.messenger;
      eta.set(p.mounted, o.etaTicks);
    }
    return { base, picks, eta };
  });
  if (!computed) return quietView(home.id, ret);
  const { base, picks, eta } = computed;
  const state = base.home;
  const battle = battleAt(s, av.villageId);
  const messenger = s.alarm?.messengers.find((m) => m.refId === av.messenger) ?? null;
  const flight = s.alarm?.flights.find((f) => f.refId === av.flight) ?? null;
  const armyEta = Math.max(
    0,
    armyEtaTicks(av.seenAt, base.village, s.day) - (s.tick - av.seenTick),
  );
  const host = base.options.host;
  const view: AlarmView = {
    campaignId: found.campaignId,
    villageId: home.id,
    warned: true,
    decided: av.decided ?? null,
    armyEtaDays: toDays(armyEta, deps.world),
    options: {
      messenger: viewOption(base.options.messenger, false, battle, deps.world),
      forest: viewOption(base.options.forest, true, battle, deps.world),
      people: viewOption(base.options.people, true, battle, deps.world),
      all: viewOption(base.options.all, true, battle, deps.world),
    },
    runners: picks.map((p) => {
      const person = state.people.find((x) => x.id === p.personId);
      const ticks = eta.get(p.mounted);
      return {
        personId: p.personId,
        name: person?.name ?? null,
        line: person?.line === true,
        mounted: p.mounted,
        etaDays: host && ticks !== undefined ? toDays(ticks, deps.world) : null,
      };
    }),
    host: host ? { villageId: host.villageId, name: world.names.get(host.villageId) ?? '' } : null,
    messenger: messenger ? { status: messenger.status, mounted: messenger.mounted } : null,
    flight: flight
      ? {
          mode: flight.mode,
          status: flight.status,
          etaDays:
            flight.status === 'marching'
              ? toDays(flightEtaTicks(flight, flight.target, flightPace(flight), s.day), deps.world)
              : null,
        }
      : null,
    yieldLord: await yieldState(deps, world, found),
    ret,
  };
  if (domain) {
    const villages: AlarmDomainVillage[] = [];
    for (const d of domain) {
      const name = world.names.get(d.villageId) ?? (await world.record(d.villageId))?.name ?? '';
      villages.push({ villageId: d.villageId, name, warned: d.warned });
    }
    view.domain = villages;
    view.domainLeft = WAR.alarm.hillfortMessengers - (av.domain?.length ?? 0);
  }
  return view;
}

/**
 * Vojvoda `lordId` vsi `villageId` se už vzdal v některém tažení (`battle.yielded`, zajatec s klíčem
 * vojvody v kořisti nebo mezi `captives`): druhé tažení na touž ves ho vidí doma až do dopočtu vsi
 * (Review Focus 4), takže druhé vzdání odmítne už pohled.
 */
async function yieldedBefore(
  deps: Pick<AlarmViewDeps, 'campaigns'>,
  villageId: string,
  lordId: number,
): Promise<boolean> {
  for (const campaignId of await deps.campaigns.activeAlarming(villageId)) {
    const s = (await deps.campaigns.checkpoint(campaignId))?.state;
    if (!s || s.target.villageId !== villageId) continue;
    if (s.battle?.yielded === lordId) return true;
    const key = prisonerKey(s.id, lordId);
    if (s.loot?.prisoners?.some((p) => p.id === key) === true) return true;
  }
  return false;
}

/**
 * Vzdání vojvody v pohledu: null – hráčův muž ve vsi nežije; jinak důvod, proč nejde (`lordAway` –
 * není doma, padl nebo se už vzdal; `notRaided` – vojsko ještě není na mapě cíle, nebo nájezd
 * skončil), nebo null – jde (`yieldingLord`).
 */
async function yieldState(
  deps: AlarmViewDeps,
  world: AlarmWorld,
  found: FoundAlarm,
): Promise<{ blocked: AlarmViewBlock | null } | null> {
  const { s, av } = found;
  const lordId = av.owner.lordId;
  if (lordId === undefined) return null;
  const record = await world.record(av.villageId);
  if (!record?.state.people.some((p) => p.id === lordId)) return null;
  if (await yieldedBefore(deps, av.villageId, lordId)) return { blocked: 'lordAway' };
  const fell = s.battle?.fighters.some((f) => f.side === 'defend' && f.ref === lordId && f.killed);
  if (fell === true) return { blocked: 'lordAway' };
  const check = await world.compute((ctx) => ({
    home: lordHomeAt(s, av.villageId, av.owner, ctx),
    can: yieldingLord(s, av, ctx) !== null,
  }));
  if (check?.can === true) return { blocked: null };
  return { blocked: check?.home === false ? 'lordAway' : 'notRaided' };
}

/** Proč příkaz nejde – stejné volby jako pohled (`alarmChoices`); null – jde. */
async function commandBlock(
  deps: CommandAlarmDeps,
  found: FoundAlarm,
  command: AlarmCommand,
): Promise<AlarmViewBlock | null> {
  const { s, av } = found;
  if (command.kind === 'yield-lord') {
    const state = await yieldState(deps, new AlarmWorld(deps), found);
    return state === null ? 'lordAway' : state.blocked;
  }
  if (command.kind === 'domain') {
    const domain = await domainOf(deps, found);
    if (!domain) return 'no-domain';
    const open = new Set(domain.filter((d) => !d.warned).map((d) => d.villageId));
    return command.to.every((id) => open.has(id)) ? null : 'no-domain';
  }
  const world = new AlarmWorld(deps);
  // les hradiště nepotřebuje (jako `departFlight`)
  if (command.kind === 'messenger' || command.mode !== 'forest') await world.loadHosts(av);
  const personId = command.kind === 'messenger' ? command.personId : undefined;
  const options = await world.compute((ctx) => alarmChoices(s, av, s.tick, ctx, personId).options);
  if (!options) return 'unwarned';
  if (command.kind === 'messenger') return options.messenger.blocked;
  return options[command.mode].blocked ?? (battleAt(s, av.villageId) ? 'battle' : null);
}

/** Záměr tažení z příkazu. */
function intentOf(villageId: string, command: AlarmCommand): IntentBody {
  switch (command.kind) {
    case 'messenger':
      return {
        kind: 'alarm-messenger',
        village: villageId,
        ...(command.personId === undefined ? {} : { personId: command.personId }),
      };
    case 'flee':
      return { kind: 'alarm-flee', village: villageId, mode: command.mode };
    case 'domain':
      return { kind: 'alarm-domain', village: villageId, to: [...command.to] };
    case 'yield-lord':
      return { kind: 'lord-surrender', village: villageId };
  }
}

/**
 * Příkaz obránce varované vsi (ikony v panelu vsi): právo `war` (`ACTION_RIGHTS.commandAlarm` –
 * správce cizí vsi ho nemá), tažení s nejnovějším varováním vsi, volba znovu nad posledním
 * kontrolním bodem (zablokovaná – důvod, žádný záměr) a záměr `alarm-*` na takt teď + 2 jako
 * `orderBreakout`. Bez zámku vsi – stav vsi se nemění a příkaz nesmí čekat na dopočet.
 */
export async function commandAlarm(
  deps: CommandAlarmDeps,
  input: {
    playerId: string;
    villageId: string;
    command: AlarmCommand;
    /** Dnešní herní den hráče – práva ve vsi rodu. */
    today: number;
    /** Skutečný čas příkazu – takt záměru. */
    nowMs: number;
  },
): Promise<CommandAlarmResult> {
  const found = await requireRight(deps, {
    playerId: input.playerId,
    villageId: input.villageId,
    right: ACTION_RIGHTS.commandAlarm,
    today: input.today,
  });
  if (typeof found === 'string') return { ok: false, reason: found };
  const alarm = await latestAlarm(deps, found.village.id, input.playerId);
  if (!alarm) return { ok: false, reason: ALARM_BLOCKED.unwarned };
  const blocked = await commandBlock(deps, alarm, input.command);
  if (blocked !== null) return { ok: false, reason: ALARM_BLOCKED[blocked] };
  const queued = await queueCampaignIntent(deps, {
    campaignId: alarm.campaignId,
    playerId: input.playerId,
    body: intentOf(found.village.id, input.command),
    nowMs: input.nowMs,
  });
  return queued
    ? { ok: true, campaignId: alarm.campaignId }
    : { ok: false, reason: ALARM_BLOCKED.over };
}
