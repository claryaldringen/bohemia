// Schránka vsi – jediná cesta, jak cizí věc (jiný hráč, svět) změní ves (docs/code/village-core.md
// – Schránka vsi). Událost má herní den a tělo; dopočet ji použije na začátku jejího dne, před
// simulací dne (`advanceVillageSteps`). Výsledek tak nezávisí na tom, po jakých kouscích se ves
// dopočítá – události dne patří k tomu dni, ne k dopočtu.

import { settleAppointee, type AppointeeParty } from './appoint-lord';
import { settleNoble } from '../vassalage/ennoble';
import { dismissGuests, endAway, hostGuests } from '../vassalage/guests';
import { receiveShipment } from '../vassalage/shipment';
import { pruneThreats } from './fortification/threat';
import {
  applyCampaignReturn,
  applyFortificationBreach,
  applyGuardLosses,
  applyLineManFell,
  applyRaidResult,
  type CampaignReturn,
  type GuardLosses,
  type RaidResult,
} from '../war/raid-apply';
import { applyCaptiveReturns, type CaptiveReturns } from '../war/captives';
import {
  applyMessengerBack,
  applyMessengerCaught,
  applyMessengerOut,
  applyRefugeArrive,
  applyRefugeBack,
  applyRefugeCaught,
  applyRefugeDepart,
  applyRefugeHidden,
} from './refugees';
import type {
  AwayKind,
  ChronicleEvent,
  FlightMode,
  Guest,
  HerdSpecies,
  PersonRef,
  RefugeePerson,
  ShipmentBody,
  ThreatSignal,
  VillageState,
} from './types';

/**
 * Tělo události schránky – diskriminovaná unie podle `kind`. Další druhy přidají pozdější
 * mechaniky (vazalství, zásilky, válka); `applyEvent` je musí obsloužit (kontrola vyčerpání).
 */
export type VillageEventBody =
  /** Zápis do kroniky vsi – den zápisu je den použití události. */
  | { kind: 'chronicle'; event: ChronicleEvent }
  /**
   * Dosazený vojvoda z jiné vsi rodu dorazil s rodinou a jídlem (seniorate.md – dosazení vojvody;
   * `settleAppointee`). Ves, která mezitím vojvodu má, družinu přijme jako ostatní muže rodu.
   */
  | { kind: 'lord-arrives'; party: AppointeeParty; fromVillageId: string }
  /**
   * Povýšený vesničan z jiné vsi rodu dorazil s rodinou do vsi bez vojvody (vassalage.md –
   * Povýšení vesničana; `settleNoble`) – ves řídí NPC rod `houseId`.
   */
  | { kind: 'noble-arrives'; party: AppointeeParty; houseId: string; fromVillageId: string }
  /**
   * Zásilka od jiného hráče dorazila (vassalage.md – Doprava a cílová ves; `receiveShipment`) –
   * zboží, dobytek a lidé z jiné vsi, v cílové dostanou nová místní id.
   */
  | { kind: 'shipment'; shipment: ShipmentBody }
  /**
   * Signál hrozby (fortifications.md – Hrozba; zapisuje ho válka): nájezd, cizí vojsko, válka.
   * Ves ho zapíše do `VillageState.threats` a zapomene po 50 letech; stejný signál dvakrát se
   * nezapisuje. Konec války (`endDay`) doplní signál `war` téže války (shodný `day`).
   */
  | { kind: 'threat-signal'; signal: ThreatSignal }
  /**
   * Hosté z jiné vsi přišli na čas (plán 2026-11-03 – rozhodnutí 11; vassalage.md – Lidé a robota):
   * ves je zapíše do `VillageState.guests` (`hostGuests`) – jedí z jejích zásob a pracují jí, odejdou
   * v pevný den (`returnHome`). Osoby zůstávají ve stavu domovské vsi `fromVillageId`.
   */
  | { kind: 'guests-arrive'; fromVillageId: string; fromName: string; guests: Guest[] }
  /**
   * Ochrana odvolána (vassalage.md – Ochrana vojskem): hosté `guests` druhu `away` ves opustí
   * na začátku dne (`dismissGuests`).
   */
  | { kind: 'guests-leave'; away: AwayKind; guests: PersonRef[] }
  /**
   * Muži pryč do odvolání (ochrana) mají den návratu (`endAway`): lidé s `away.refId` = `refId`
   * bez dne návratu se vrátí na začátku dne `untilDay` (`returnHome`).
   */
  | { kind: 'away-ends'; refId: string; untilDay: number }
  /**
   * Den nájezdu (war.md – Ves během nájezdu nepracuje; plán 2026-11-03 – Úloha 6.7): cizí vojsko je
   * dnes na mapě vsi – lidé se skrývají a ves dnes nepracuje (`VillageState.raidDay`). Tažení ho
   * pošle na každý den, kdy na mapě stojí; den po odchodu vojska ves pracuje.
   */
  | { kind: 'raid-day'; campaignId: string }
  /**
   * Posel z jiné vsi rodu, kterou cizí vojsko tažení `campaignId` prošlo (war.md – Obránci, Kdy):
   * ves se podle postoje zachová dřív, než vojsko spatří (`VillageState.armySeen`). Signál hrozby
   * pro správce jde zvlášť (`threat-signal` druhu `army-seen`).
   */
  | { kind: 'army-seen'; campaignId: string; fromVillageId: string }
  /**
   * Výsledek nájezdu v napadené vsi (war.md – Ztráty, Kořist; `applyRaidResult`): padlí, ranění,
   * odvedení a kořist ze zásob a stád.
   */
  | { kind: 'raid-result'; result: RaidResult }
  /** Tažení se vrátilo do vsi útočníka (`applyCampaignReturn`): muži, kořist, odvedení. */
  | { kind: 'campaign-return'; result: CampaignReturn }
  /**
   * Konec zajetí (propuštění nebo výkupné; `applyCaptiveReturns`): zajatec jde domů, věznitelova ves
   * ho přestane živit. Událost jde do obou vsí, každá použije svou stranu.
   */
  | ({ kind: 'captive-returns' } & CaptiveReturns)
  /** Muž rodu padl na tažení (war.md – Ztráty; `applyLineManFell`): smrt a nástupnictví. */
  | { kind: 'line-man-fell'; personId: number; campaignId: string }
  /**
   * Ztráty mužů vsi, kteří bránili jinou ves jako hosté z ochrany pánem (`applyGuardLosses`):
   * padlí (muž rodu – nástupnictví), ranění a zajatí.
   */
  | ({ kind: 'guard-losses' } & GuardLosses)
  /**
   * Průlom opevnění (fortifications.md – Prolomení; `applyFortificationBreach`): úseky se stavem 0,
   * obyvatelé je přestaví přednostně. `burned` – díly prolomené ohněm (scéna – ohořelý průlom),
   * `gatesBurned` – díly s vypálenou branou (věž nad ní shoří; Přechod hradby – Oheň); chybí = žádné.
   */
  | {
      kind: 'fortification-breach';
      fortificationId: number;
      segments: number[];
      burned?: number[];
      gatesBurned?: number[];
    }
  /*
   * Varování, poslové a útěk do hradiště (war.md; plán 2026-11-09 – Úloha 1 tvar, Úloha 7 aplikace
   * v `refugees.ts`).
   * `refId` = posel nebo skupina uprchlíků v tažení `campaignId` (`AlarmMessenger`, `AlarmFlight`).
   */
  /**
   * Posel vyběhl z vsi do hradiště `toVillageId` (na koni vsi, je-li `mounted`): osoba `personId`
   * je pryč (`away` druhu `messenger`).
   */
  | {
      kind: 'messenger-out';
      campaignId: string;
      refId: string;
      personId: number;
      toVillageId: string;
      mounted: boolean;
    }
  /** Posel se po doručení vrátil domů. */
  | { kind: 'messenger-back'; campaignId: string; refId: string; personId: number }
  /** Vojsko posla chytilo: `killed` – padl, `led` – odveden (z vsi zmizí). */
  | {
      kind: 'messenger-caught';
      campaignId: string;
      refId: string;
      personId: number;
      fate: 'killed' | 'led';
    }
  /**
   * Lidé `people` odešli skupinou do hradiště `hostVillageId`, nebo (null) do lesa, s `carriedKg`
   * zásob a stádem `herd` – ves je odečte a zapíše `VillageState.refuge`.
   */
  | {
      kind: 'refuge-depart';
      campaignId: string;
      refId: string;
      mode: FlightMode;
      hostVillageId: string | null;
      people: number[];
      carriedKg: number;
      herd: Record<HerdSpecies, number>;
      /** Jméno hradiště do kroniky (Úloha 7); chybí – kronika bez jména. */
      hostName?: string;
    }
  /** Skupina došla do lesa a ukryla se se zásobami a stádem (`VillageRefuge.hidden`). */
  | {
      kind: 'refuge-hidden';
      campaignId: string;
      refId: string;
      foodKg: number;
      herd: Record<HerdSpecies, number>;
    }
  /** Vojsko skupinu dostihlo a vzala se: `killed` padli, `led` odvedeni; ostatní jdou dál. */
  | { kind: 'refuge-caught'; campaignId: string; refId: string; killed: number[]; led: number[] }
  /**
   * Uprchlíci z vsi `fromVillageId` došli do hradiště (hostitel): hosté druhu `refuge` a pobyt
   * `RefugeStay` s jejich zásobami a stádem.
   */
  | {
      kind: 'refuge-arrive';
      campaignId: string;
      refId: string;
      fromVillageId: string;
      fromName: string;
      people: RefugeePerson[];
      foodKg: number;
      herd: Record<HerdSpecies, number>;
    }
  /**
   * Uprchlíci se vrátili domů (domov) se zbylými zásobami a stádem z hradiště (`leaveRefuge`);
   * z lesa jen s tím, co ukryli (`refuge.hidden`).
   */
  | { kind: 'refuge-back'; refId: string; foodKg: number; herd: Record<HerdSpecies, number> };

/**
 * Událost ve schránce vsi `villageId`. `day` = herní den, na jehož začátku se použije (nikdy ne
 * už spočítaný den – schránka ho při zápisu posune na `lastDay + 1`); `seq` = pořadí zápisu
 * (v rámci dne se události použijí podle něj).
 */
export interface VillageEvent {
  id: string;
  villageId: string;
  day: number;
  seq: number;
  body: VillageEventBody;
}

/** Nová událost pro zápis do schránky; `ref` je jedinečný – druhý zápis téhož `ref` se zahodí. */
export type NewVillageEvent = Omit<VillageEvent, 'id' | 'seq'> & { ref: string };

/**
 * Použije události dne `day` (ostatní dny přeskočí) v pořadí `seq` – mutuje stav jako kroky dne
 * simulace. Vrací zápisy do kroniky (volající je přidá do `state.chronicle`). Vstupní události
 * nemění.
 */
export function applyInboxDay(
  state: VillageState,
  day: number,
  events: readonly VillageEvent[],
): ChronicleEvent[] {
  const chronicle: ChronicleEvent[] = [];
  const today = events.filter((e) => e.day === day).sort((a, b) => a.seq - b.seq);
  for (const event of today) chronicle.push(...applyEvent(state, day, event.body));
  return chronicle;
}

/** Jedna událost – každý druh těla má svou větev (nový druh bez větve = chyba překladu). */
function applyEvent(state: VillageState, day: number, body: VillageEventBody): ChronicleEvent[] {
  switch (body.kind) {
    case 'chronicle':
      return [{ ...structuredClone(body.event), day }];
    case 'lord-arrives':
      return settleAppointee(state, day, structuredClone(body.party), body.fromVillageId);
    case 'noble-arrives':
      return settleNoble(state, day, structuredClone(body.party), body.houseId);
    case 'shipment':
      return receiveShipment(state, day, structuredClone(body.shipment));
    case 'threat-signal':
      recordThreat(state, day, body.signal);
      return [];
    case 'guests-arrive':
      return arriveGuests(state, day, body);
    case 'guests-leave':
      dismissGuests(state, body.away, body.guests);
      return [];
    case 'away-ends':
      endAway(state, body.refId, Math.max(day, body.untilDay));
      return [];
    case 'raid-day':
      state.raidDay = day;
      return [];
    case 'army-seen':
      state.armySeen = { day, campaignId: body.campaignId, fromVillageId: body.fromVillageId };
      return [];
    case 'raid-result':
      return applyRaidResult(state, day, structuredClone(body.result));
    case 'campaign-return':
      return applyCampaignReturn(state, day, structuredClone(body.result));
    case 'captive-returns':
      return applyCaptiveReturns(state, day, body);
    case 'line-man-fell':
      return applyLineManFell(state, day, body);
    case 'guard-losses':
      return applyGuardLosses(state, day, body);
    case 'fortification-breach':
      applyFortificationBreach(state, day, body);
      return [];
    case 'messenger-out':
      return applyMessengerOut(state, day, body);
    case 'messenger-back':
      return applyMessengerBack(state, day, body);
    case 'messenger-caught':
      return applyMessengerCaught(state, day, body);
    case 'refuge-depart':
      return applyRefugeDepart(state, day, body);
    case 'refuge-hidden':
      return applyRefugeHidden(state, day, body);
    case 'refuge-caught':
      return applyRefugeCaught(state, day, body);
    case 'refuge-arrive':
      return applyRefugeArrive(state, day, body);
    case 'refuge-back':
      return applyRefugeBack(state, day, body);
    default:
      return unknownBody(body);
  }
}

/** Hosté přišli: zapíše je a do kroniky, kolik jich přišlo (po druzích; nikdo nový – nic). */
function arriveGuests(
  state: VillageState,
  day: number,
  body: Extract<VillageEventBody, { kind: 'guests-arrive' }>,
): ChronicleEvent[] {
  const before = state.guests?.length ?? 0;
  hostGuests(state, day, body.guests);
  const added = (state.guests ?? []).slice(before);
  const kinds = [...new Set(added.map((g) => g.kind))];
  return kinds.map((kind) => ({
    day,
    kind: 'guests-came' as const,
    away: kind,
    people: added.filter((g) => g.kind === kind).length,
    villageName: body.fromName,
  }));
}

/** Zapíše signál hrozby (mutuje stav): válka téhož `day` se doplní o konec, ostatní se přidají. */
function recordThreat(state: VillageState, day: number, signal: ThreatSignal): void {
  const threats = pruneThreats(state.threats ?? [], day);
  const same = threats.find((t) => t.kind === signal.kind && t.day === signal.day);
  if (same) {
    if (signal.kind === 'war' && signal.endDay !== undefined) same.endDay = signal.endDay;
  } else {
    threats.push({ ...signal });
  }
  state.threats = threats;
}

function unknownBody(body: never): never {
  throw new Error(`Neznámý druh události schránky vsi: ${JSON.stringify(body)}`);
}

/** Události podle dne – dopočet je hledá den po dni. */
export function inboxByDay(events: readonly VillageEvent[]): Map<number, VillageEvent[]> {
  const byDay = new Map<number, VillageEvent[]>();
  for (const event of events) {
    const list = byDay.get(event.day);
    if (list) list.push(event);
    else byDay.set(event.day, [event]);
  }
  return byDay;
}
