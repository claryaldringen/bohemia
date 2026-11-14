import { dateOfDayIndex } from '../domain/calendar';
import {
  acceptRound,
  canOpen,
  counterRound,
  NEGOTIATION_REASONS as R,
  openRound,
  rejectRound,
  withdrawRound,
  type Negotiation,
  type NegotiationResult,
  termLinesOf,
  checkTradeItems,
  isTradeLine,
  isStewardshipLine,
  isVillageGiftLine,
  isWarDemandLine,
  isPeaceLine,
  isRansomLine,
  RANSOM_REASONS,
  checkRansomItems,
  type RansomLine,
  checkPeaceItems,
  PEACE_REASONS,
  type PeaceLine,
  WAR_DEMAND_REASONS,
  checkWarDemandItems,
  type WarDemandLine,
  type VillageGiftLine,
  checkStewardshipItems,
  STEWARDSHIP_REASONS,
  TRADE_REASONS,
  type TermItem,
  type TradeLine,
} from '../domain/negotiation';
import { AID_REASONS, checkAidItems, isAidLine, type AidLine } from '../domain/vassalage/loan';
import { TERM_REASONS, termsOfLines } from '../domain/vassalage/terms';
import { wouldBeMutual } from '../domain/vassalage/tree';
import type { ChronicleEvent } from '../domain/village';
import {
  ACCEPTED_VERSION,
  houseRef,
  type Accepted,
  type Actors,
  type HouseRef,
  type PeaceLater,
  type Ransoming,
  type TradeSending,
} from './acceptance-outbox';
import type { CedeHooks } from './cede-village';
import type { DialogRepository } from './dialogs';
import type { HouseRepository, House } from './houses';
import { applyItem, checkItem, StewardshipTaken } from './negotiation-effects';
import {
  chronicleHouses,
  houseName,
  noticeHouse,
  type NegotiationVillages,
} from './negotiation-chronicle';
import type {
  NegotiationRecord,
  NegotiationRepository,
  NegotiationTx,
  OutboxClaim,
  OutboxPolicy,
} from './negotiations';
import type { LoanRepository } from './loans';
import { chronicleWar } from './war-chronicle';
import { sendShipment, type ShipmentDeps } from './shipments';
import type { Vassalage } from './vassalages';
import type { WorldDirectory } from './world-directory';
import { NEWCOMERS } from '../domain/world';
import {
  NEWCOMER_REASONS,
  closeNewcomerRequests,
  newcomerDeadline,
  placeNewcomer,
  startFree,
} from './newcomers';

// Use-casy jednání mezi hráči (vassalage.md – Vznik a jednání, Meze). Strany jsou rody; hráč jedná
// za svůj živý rod. Vše mění stav v jedné transakci nad vlastními tabulkami (bez zámku hráče),
// účinky přijetí (vazalství) jedou v téže transakci. Kronika se zapisuje až po ní. Účinky přijetí
// mimo transakci (pomoc, výkupné, mír, obchod, kronika) jdou přes schránku zapsanou v transakci
// (`acceptance-outbox.ts`) – po pádu webu je dokončí worker (`deliverPendingAcceptances`).

/** Závislosti dovozu pomoci: zásilky, dopočet vsi do dneška a zrušení půjčky, jejíž zboží nedošlo. */
export interface AidDeps {
  shipments: ShipmentDeps;
  prepareVillage: (villageId: string, today: number) => Promise<unknown>;
  loans: Pick<LoanRepository, 'cancelOfNegotiation' | 'ofNegotiation'>;
}

export interface NegotiateDeps extends NegotiationVillages {
  /** Bez něj nejde přijmout dar ani půjčku (nemá kdo poslat zásilku). */
  aid?: AidDeps;
  /** Bez něj nejde přijmout obchod (nemá se kde otevřít dialog odeslání). */
  dialogs?: Pick<DialogRepository, 'openOnce'>;
  houses: Pick<HouseRepository, 'activeOf' | 'byId'>;
  negotiations: NegotiationRepository;
  /**
   * Převod věnovaného dílu odúmrti po přijetí (`giveEscheatPart`); bez něj věnování přijmout nejde.
   */
  escheatGift?: (input: {
    line: VillageGiftLine;
    fromHouseId: string;
    toHouseId: string;
    now: Date;
    today: number;
  }) => Promise<void>;
  /** Postoupení vsí v míru (`cede-village.ts`); bez něj nejde sjednat mír s postoupením. */
  cede?: CedeHooks;
  /** Výkupné zajatců (`prisoners.ts`); bez něj nejde výkupné sjednat. */
  ransom?: RansomHooks;
  /** Čte se z něj, které vsi rod vlastní (cílová ves musí patřit pánovi). */
  worldDirectory: Pick<WorldDirectory, 'entriesOf'>;
  /**
   * Seed světa – přijatý nováček se přesune jen na suchá políčka kostry (`placeNewcomer`); bez něj
   * (testy jednání bez kostry) se kostra při umístění nováčka nebere v úvahu.
   */
  worldSeed?: number;
}

/** Výkupné zajatců: kontrola před jednáním a provedení po přijetí (zaplacení a propuštění). */
export interface RansomHooks {
  /** Zajatci musí držet jedna ze stran a patřit druhé; vrací věznitele (rod). */
  check(
    parties: readonly [string, string],
    line: RansomLine,
  ): Promise<{ ok: true; captorHouseId: string } | { ok: false; reason: string }>;
  /** Mír: propustí zajatce `prisonerIds` držené kteroukoli ze stran (bez platby). */
  release(input: {
    prisonerIds: readonly string[];
    parties: readonly [string, string];
    negotiationId: string;
    now: Date;
    today: number;
  }): Promise<void>;
  /** Zaplatí výkupné z vsi platícího věznitelově vsi a propustí zajatce; vrací důvod neúspěchu. */
  apply(input: {
    line: RansomLine;
    captorHouseId: string;
    payerHouseId: string;
    negotiationId: string;
    now: Date;
    today: number;
  }): Promise<string | null>;
}

export type NegotiateResult =
  { ok: true; negotiation: NegotiationRecord } | { ok: false; reason: string };

export const NO_HOUSE = 'Nemáš živý rod.';
export const NO_NEGOTIATION = 'Jednání neexistuje.';
const NO_AID = 'Pomoc teď nejde poslat.';
export const NO_AGREEMENT = 'Dohoda mezi rody neexistuje.';

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

const isAlive = (house: House | null): house is House => house !== null && house.endedAt === null;

/** Doménový pohled na záznam; `ended` (rod vymřel) a `expired` (vypršelo) už nelze měnit. */
function domainOf(record: NegotiationRecord): Negotiation | null {
  if (record.status === 'ended' || record.status === 'expired') return null;
  return { ...record, status: record.status };
}

function oathOf(items: readonly TermItem[]): { lord: string; vassal: string } | null {
  for (const i of items) if (i.kind === 'oath') return { lord: i.lord, vassal: i.vassal };
  return null;
}

/** Přísaha v požadavku opovědi musí být mezi stranami jednání; bez požadavku nic neověřuje. */
function checkWarDemandParties(items: readonly TermItem[], a: string, b: string): string | null {
  const bad = checkWarDemandItems(items);
  if (bad) return bad;
  const line = items.find(isWarDemandLine);
  const oath = line ? oathOf(line.items) : null;
  if (!oath) return null;
  const pair = [a, b];
  return pair.includes(oath.lord) && pair.includes(oath.vassal) && oath.lord !== oath.vassal
    ? null
    : R.badOath;
}

/**
 * Kontrola mírového kola: tvar a čísla (doména), válka mezi stranami běží, postoupené vsi patří
 * postupující straně a není to její poslední ves. Kolo bez řádku míru je v pořádku.
 */
async function checkPeaceRound(
  deps: NegotiateDeps,
  tx: NegotiationTx,
  items: readonly TermItem[],
  a: string,
  b: string,
): Promise<string | null> {
  const line = items.find(isPeaceLine);
  if (!line) return null;
  const bad = checkPeaceItems(items, [a, b]);
  if (bad) return bad;
  if (!(await tx.wars.activeBetween(a, b))) return PEACE_REASONS.noWar;
  if (line.cede) {
    if (!deps.cede) return PEACE_REASONS.noCede;
    const checked = await deps.cede.check([a, b], line.cede);
    if (!checked.ok) return checked.reason;
  }
  return null;
}

/** Kontrola výkupného v kole: tvar a čísla (doména), strany vazalství a zajatci ve věznitelově vsi. */
async function checkRansomRound(
  deps: NegotiateDeps,
  items: readonly TermItem[],
  a: string,
  b: string,
): Promise<{ reason: string } | { captorHouseId: string } | null> {
  const line = items.find(isRansomLine);
  if (!line) return null;
  const bad = checkRansomItems(items, [a, b]);
  if (bad) return { reason: bad };
  if (!deps.ransom) return { reason: RANSOM_REASONS.noHost };
  const checked = await deps.ransom.check([a, b], line);
  return checked.ok ? { captorHouseId: checked.captorHouseId } : { reason: checked.reason };
}

/** Živá dohoda mezi dvěma rody (v libovolném směru), nebo null. */
async function agreementBetween(
  tx: NegotiationTx,
  a: string,
  b: string,
): Promise<Vassalage | null> {
  const list = await tx.vassalages.activeOf(a);
  return list.find((v) => v.lordHouseId === b || v.vassalHouseId === b) ?? null;
}

/** Strany správy: pán a vazal z přísahy, nebo ze stávající dohody; bez nich null. */
function stewardSides(
  oath: { lord: string; vassal: string } | null,
  existing: Vassalage | null,
): { lordId: string; vassalId: string } | null {
  if (oath) return { lordId: oath.lord, vassalId: oath.vassal };
  return existing ? { lordId: existing.lordHouseId, vassalId: existing.vassalHouseId } : null;
}

/** Cílová ves z řádků musí patřit pánovi (`lordId`); bez řádku nic neověřuje. */
async function checkTargetVillage(
  deps: NegotiateDeps,
  items: readonly TermItem[],
  lordId: string,
): Promise<string | null> {
  for (const item of items) {
    if (item.kind !== 'target-village') continue;
    const entries = await deps.worldDirectory.entriesOf([lordId]);
    const owns = entries.some(
      (e) => e.house.id === lordId && e.digests.some((d) => d.id === item.villageId),
    );
    return owns ? null : TERM_REASONS.badVillage;
  }
  return null;
}

/** Ves `villageId` patří rodu `houseId`? */
async function ownsVillage(
  deps: NegotiateDeps,
  houseId: string,
  villageId: string,
): Promise<boolean> {
  const entries = await deps.worldDirectory.entriesOf([houseId]);
  return entries.some((e) => e.house.id === houseId && e.digests.some((d) => d.id === villageId));
}

/**
 * Kontrola kola se správou vsi (vassalage.md – Hráč jako správce cizí vsi): jediný řádek, ves patří
 * pánovi, vazal je živý hráč a ves ještě nemá správce. Bez řádku správy nic neověřuje.
 */
async function checkStewardRound(
  deps: NegotiateDeps,
  tx: NegotiationTx,
  items: readonly TermItem[],
  sides: { lordId: string; vassalId: string } | null,
): Promise<string | null> {
  const bad = checkStewardshipItems(items);
  if (bad) return bad;
  const line = items.find(isStewardshipLine);
  if (!line) return null;
  if (!sides) return NO_AGREEMENT;
  if (!(await ownsVillage(deps, sides.lordId, line.villageId))) {
    return STEWARDSHIP_REASONS.badVillage;
  }
  const steward = await deps.houses.byId(sides.vassalId);
  if (!isAlive(steward)) return STEWARDSHIP_REASONS.noLive;
  if (steward.playerId === null) return STEWARDSHIP_REASONS.noPlayer;
  return (await tx.stewardships.of(line.villageId)) ? STEWARDSHIP_REASONS.taken : null;
}

/**
 * Kontrola kola jednání o pomoci (vassalage.md – Pomoc na žádost): dohoda mezi rody trvá, kolo má
 * jediný řádek o pomoci (žádost vazala, dar nebo půjčka pána), první kolo je žádost a vsi z řádku
 * patří těm, kdo je uvádějí. Kolo bez řádků o pomoci je v pořádku jen mimo jednání o pomoci.
 */
async function checkAidRound(
  deps: NegotiateDeps,
  items: readonly TermItem[],
  ctx: { authorId: string; agreement: Vassalage | null; aidNegotiation: boolean; first: boolean },
): Promise<string | null> {
  const hasAid = items.some(isAidLine);
  if (!hasAid) return ctx.aidNegotiation ? AID_REASONS.mixed : null;
  if (!ctx.agreement) return NO_AGREEMENT;
  const { lordHouseId, vassalHouseId } = ctx.agreement;
  const bad = checkAidItems(items, ctx.authorId === vassalHouseId);
  if (bad) return bad;
  const line = items.find(isAidLine) as AidLine;
  if (ctx.first && line.kind !== 'aid-request') return AID_REASONS.firstIsRequest;
  const checks: [string, string | undefined][] =
    line.kind === 'aid-request'
      ? [[vassalHouseId, line.villageId]]
      : [
          [lordHouseId, line.fromVillageId],
          [vassalHouseId, line.toVillageId],
        ];
  for (const [houseId, villageId] of checks) {
    if (villageId !== undefined && !(await ownsVillage(deps, houseId, villageId))) {
      return AID_REASONS.badVillage;
    }
  }
  return null;
}

/** Zapsané jednání (po kole / přechodu) – záznam z přechodu domény nese stav a poslední kolo. */
function lastAuthor(record: NegotiationRecord): string | undefined {
  return record.rounds[record.rounds.length - 1]?.authorHouseId;
}

/** Klíč kroniky kroku jednání (`neg:<jednání>:<kola>`) – opakovaný zápis téhož se zahodí. */
const stepKey = (record: NegotiationRecord): string => `neg:${record.id}:${record.rounds.length}`;

/** Kroniku obou rodů zapíše po transakci jedním druhem události (`step`). */
async function chronicleStep(
  deps: NegotiateDeps,
  { actor, other }: Actors,
  key: string,
  step:
    | 'offer'
    | 'counter'
    | 'rejected'
    | 'withdrawn'
    | 'terms-accepted'
    | 'aid-gift'
    | 'aid-loan'
    | 'trade-accepted',
  today: number,
): Promise<void> {
  const event: ChronicleEvent = {
    day: today,
    kind: 'negotiation',
    step,
    actor: await houseName(deps, actor),
    other: await houseName(deps, other),
  };
  await chronicleHouses(deps, [actor, other], `${key}:${step}`, event);
}

/** Společný začátek odpovědi: hráčův živý rod, jednání a druhá strana (živá, jinak chyba). */
async function loadForResponse(
  deps: NegotiateDeps,
  tx: NegotiationTx,
  playerId: string,
  negotiationId: string,
): Promise<
  | { ok: true; actor: House; other: House; record: NegotiationRecord; negotiation: Negotiation }
  | { ok: false; reason: string }
> {
  const actor = await deps.houses.activeOf(playerId);
  if (!actor) return fail(NO_HOUSE);
  const record = await tx.getForUpdate(negotiationId);
  if (!record) return fail(NO_NEGOTIATION);
  const negotiation = domainOf(record);
  // žádost nováčka zanikla, protože ho umístil jiný pán nebo los (closeNewcomerRequests)
  if (!negotiation && record.newcomer && record.status === 'ended') {
    return fail(NEWCOMER_REASONS.taken);
  }
  if (!negotiation) return fail(R.finished);
  if (actor.id !== record.initiatorHouseId && actor.id !== record.recipientHouseId) {
    return fail(R.notParty);
  }
  const otherId =
    actor.id === record.initiatorHouseId ? record.recipientHouseId : record.initiatorHouseId;
  const other = await deps.houses.byId(otherId);
  if (!isAlive(other)) return fail(R.extinct);
  return { ok: true, actor, other, record, negotiation };
}

/** Poslední kolo záznamu po `domainResult` – `negotiation.rounds` nese i nové kolo. */
function withRounds(record: NegotiationRecord, result: Negotiation): NegotiationRecord {
  return { ...record, rounds: result.rounds };
}

/** Hráč za svůj rod otevře jednání s rodem `to` (`input.to` = id rodu). */
export async function openNegotiation(
  deps: NegotiateDeps,
  input: {
    playerId: string;
    to: string;
    items: TermItem[];
    message: string | null;
    now: Date;
    today: number;
    /** Žádost odříznutého nováčka o pána (`requestLords`, newcomers.md). */
    newcomer?: boolean;
  },
): Promise<NegotiateResult> {
  const from = await deps.houses.activeOf(input.playerId);
  if (!from) return fail(NO_HOUSE);
  const to = await deps.houses.byId(input.to);
  // odříznutý rod (newcomers.md) s nikým nejedná – jen nováček žádá umístěný rod o přijetí
  const newcomer = input.newcomer === true;
  if ((from.placedAt === null) !== newcomer) {
    return fail(newcomer ? NEWCOMER_REASONS.placed : NEWCOMER_REASONS.notPlaced);
  }
  if (to && to.placedAt === null) return fail(NEWCOMER_REASONS.isolatedTarget);
  const opened = openRound({
    id: '',
    from: from.id,
    to: input.to,
    items: input.items,
    message: input.message,
    at: input.now,
    withoutOath: oathOf(input.items) === null,
  });
  if (!opened.ok) return opened;
  const round = opened.negotiation.rounds[0];
  if (!round) return fail(R.badOath);
  const result = await deps.negotiations.transaction(async (tx): Promise<NegotiateResult> => {
    if (newcomer) {
      // žádosti nováčka po jedné pod zámkem řádku rodu: souběžné výběry dohromady nejvýš 5
      // a po umístění žádná nepřibude (newcomers.md)
      if (!(await tx.placement.lockIsolated(from.id))) return fail(NEWCOMER_REASONS.placed);
      const pending = (await tx.openOf(from.id)).filter(
        (r) => r.newcomer && r.initiatorHouseId === from.id,
      );
      if (pending.length >= NEWCOMERS.maxChoices) return fail(NEWCOMER_REASONS.choices);
    }
    const reason = canOpen({
      from: from.id,
      to: input.to,
      now: input.now,
      fromAlive: true,
      toAlive: isAlive(to),
      blockedByTarget: await tx.blocks(input.to, from.id),
      negotiationOpen: (await tx.openBetween(from.id, input.to)) !== null,
      rejectedByTargetAt: await tx.lastReject(from.id, input.to),
      oath: oathOf(input.items),
      edges: await tx.vassalages.edgesNear(from.id, 1),
    });
    if (reason) return fail(reason);
    // změna podmínek: dohoda mezi rody musí trvat, cílová ves patří jejímu pánovi
    const oath = oathOf(input.items);
    const trade = input.items.some((i) => isTradeLine(i) || isRansomLine(i));
    const warDemand = input.items.some((i) => isWarDemandLine(i) || isPeaceLine(i));
    const existing =
      oath || trade || warDemand ? null : await agreementBetween(tx, from.id, input.to);
    if (!oath && !existing && !trade && !warDemand) return fail(NO_AGREEMENT);
    const badWar = checkWarDemandParties(input.items, from.id, input.to);
    if (badWar) return fail(badWar);
    const badPeace = await checkPeaceRound(deps, tx, input.items, from.id, input.to);
    if (badPeace) return fail(badPeace);
    const badTrade = await checkTradeRound(deps, input.items, [from.id, input.to]);
    if (badTrade) return fail(badTrade);
    const badRansom = await checkRansomRound(deps, input.items, from.id, input.to);
    if (badRansom && 'reason' in badRansom) return fail(badRansom.reason);
    const lordId = oath?.lord ?? existing?.lordHouseId ?? '';
    const badVillage = await checkTargetVillage(deps, input.items, lordId);
    if (badVillage) return fail(badVillage);
    const badAid = await checkAidRound(deps, input.items, {
      authorId: from.id,
      agreement: existing,
      aidNegotiation: false,
      first: true,
    });
    if (badAid) return fail(badAid);
    const badSteward = await checkStewardRound(deps, tx, input.items, stewardSides(oath, existing));
    if (badSteward) return fail(badSteward);
    const record = await tx.open({
      initiatorHouseId: from.id,
      recipientHouseId: input.to,
      round,
      newcomer,
    });
    if (!record) return fail(R.negotiating);
    if (to) {
      await noticeHouse(
        tx,
        to,
        newcomer ? 'newcomer-request' : 'negotiation-offer',
        { negotiationId: record.id, houseId: from.id, name: await houseName(deps, from) },
        input.today,
      );
    }
    return { ok: true, negotiation: record };
  });
  if (result.ok && to) {
    await chronicleStep(
      deps,
      { actor: from, other: to },
      stepKey(result.negotiation),
      'offer',
      input.today,
    );
  }
  return result;
}

/** Protinávrh: na tahu je ten, kdo nenapsal poslední kolo. */
export async function counterNegotiation(
  deps: NegotiateDeps,
  input: {
    playerId: string;
    negotiationId: string;
    items: TermItem[];
    message: string | null;
    now: Date;
    today: number;
  },
): Promise<NegotiateResult> {
  let actors: Actors | null = null;
  const result = await deps.negotiations.transaction(async (tx): Promise<NegotiateResult> => {
    const loaded = await loadForResponse(deps, tx, input.playerId, input.negotiationId);
    if (!loaded.ok) return loaded;
    // žádost nováčka pán jen přijme nebo odmítne (newcomers.md – Nabídka pánů)
    if (loaded.record.newcomer) return fail(NEWCOMER_REASONS.onlyAccept);
    const next = counterRound(
      loaded.negotiation,
      loaded.actor.id,
      input.items,
      input.message,
      input.now,
    );
    if (!next.ok) return next;
    const first = oathOf(loaded.record.rounds[0]?.items ?? []);
    // na opověď i na mír se odpovídá mírovým jednáním (war.md – Konec války); mír mimo ně nepatří
    const warLike = (loaded.record.rounds[0]?.items ?? []).some(
      (i) => isWarDemandLine(i) || isPeaceLine(i),
    );
    if (warLike && !input.items.some(isPeaceLine)) return fail(WAR_DEMAND_REASONS.noCounter);
    if (!warLike && input.items.some(isPeaceLine)) return fail(PEACE_REASONS.noWar);
    const independent = (list: readonly TermItem[]): boolean =>
      list.some((i) => isTradeLine(i) || isRansomLine(i));
    const trade = independent(loaded.record.rounds[0]?.items ?? []);
    // obchod a výkupné zůstávají samostatným jednáním a ostatní jednání jím nebude
    if (independent(input.items) !== trade) return fail(TRADE_REASONS.onlyTrade);
    const existing =
      first || trade || warLike
        ? null
        : await agreementBetween(tx, loaded.actor.id, loaded.other.id);
    if (!first && !existing && !trade && !warLike) return fail(NO_AGREEMENT);
    const badPeace = await checkPeaceRound(deps, tx, input.items, loaded.actor.id, loaded.other.id);
    if (badPeace) return fail(badPeace);
    const badTrade = await checkTradeRound(deps, input.items, [loaded.actor.id, loaded.other.id]);
    if (badTrade) return fail(badTrade);
    const badRansom = await checkRansomRound(deps, input.items, loaded.actor.id, loaded.other.id);
    if (badRansom && 'reason' in badRansom) return fail(badRansom.reason);
    const badVillage = await checkTargetVillage(
      deps,
      input.items,
      first?.lord ?? existing?.lordHouseId ?? '',
    );
    if (badVillage) return fail(badVillage);
    const badAid = await checkAidRound(deps, input.items, {
      authorId: loaded.actor.id,
      agreement: existing,
      aidNegotiation: (loaded.record.rounds[0]?.items ?? []).some(isAidLine),
      first: false,
    });
    if (badAid) return fail(badAid);
    const badSteward = await checkStewardRound(
      deps,
      tx,
      input.items,
      stewardSides(first ?? null, existing),
    );
    if (badSteward) return fail(badSteward);
    const round = next.negotiation.rounds[next.negotiation.rounds.length - 1];
    if (!round) return fail(R.finished);
    await tx.addRound(loaded.record.id, round);
    await noticeHouse(
      tx,
      loaded.other,
      'negotiation-counter',
      {
        negotiationId: loaded.record.id,
        houseId: loaded.actor.id,
        name: await houseName(deps, loaded.actor),
      },
      input.today,
    );
    actors = { actor: loaded.actor, other: loaded.other };
    return { ok: true, negotiation: withRounds(loaded.record, next.negotiation) };
  });
  if (result.ok && actors)
    await chronicleStep(deps, actors, stepKey(result.negotiation), 'counter', input.today);
  return result;
}

/** Jednání načtené pro odpověď (`loadForResponse`). */
type Loaded = Extract<Awaited<ReturnType<typeof loadForResponse>>, { ok: true }>;

/** Přijetí jednání – kdo, které jednání a kdy. */
interface AcceptInput {
  playerId: string;
  negotiationId: string;
  now: Date;
  today: number;
}

/** Ověřené přijetí (`checkAcceptance`) – řádky posledního kola a co se z nich zapíše. */
interface AcceptCheck {
  ok: true;
  items: TermItem[];
  terms: ReturnType<typeof termsOfLines>;
  oathItem: ReturnType<typeof oathOf>;
  tradeLine: TradeLine | undefined;
  peaceLine: PeaceLine | undefined;
  warLine: WarDemandLine | PeaceLine | undefined;
  existing: Vassalage | null;
  ransoming: Ransoming | null;
  later: PeaceLater | null;
  sendings: TradeSending[];
  sides: ReturnType<typeof stewardSides>;
  stewardLine: TermItem | undefined;
  giftLine: VillageGiftLine | undefined;
  aidLine: AidLine | undefined;
  aidTarget: string | null;
}

/**
 * Přijetí posledního kola: ověří živé rody a vzájemnost, uzavře jednání a spustí účinky všech
 * řádků – vše v jedné transakci (kdo přijetí vyhraje souběh, vazalství vznikne jedno). Kroky:
 * ověření (`checkAcceptance`), zápis (`writeAcceptance`, `noticeAcceptance`), schránka účinků
 * (`acceptedOf`, `putOutbox`) a po transakci její provedení (`deliverAcceptanceOutbox` – odeslání
 * `deliverAcceptance` a kronika `chronicleAcceptance`). Spadne-li web po commitu, schránku
 * dokončí worker (`deliverPendingAcceptances`).
 */
export async function acceptNegotiation(
  deps: NegotiateDeps,
  input: AcceptInput,
): Promise<NegotiateResult> {
  // nájem schránky zapsané v transakci – web ji po commitu provede sám, worker ji do konce nájmu nevezme
  let claim: OutboxClaim | undefined;
  const result = await deps.negotiations
    .transaction(async (tx): Promise<NegotiateResult> => {
      const loaded = await loadForResponse(deps, tx, input.playerId, input.negotiationId);
      if (!loaded.ok) return loaded;
      const done = acceptRound(loaded.negotiation, loaded.actor.id, input.now);
      if (!done.ok) return done;
      const check = await checkAcceptance(deps, tx, loaded);
      if (!check.ok) return check;
      const written = await writeAcceptance(deps, tx, loaded, check, input);
      if (!written.ok) return written;
      await noticeAcceptance(deps, tx, loaded, check, written.newcomer, input.today);
      // účinky po transakci: schránka v téže transakci – přijetí bez nich nikdy nezůstane
      claim = await tx.putOutbox(
        loaded.record.id,
        acceptedOf(loaded, check, written.newcomerHouseId, input.today),
        input.now,
        ACCEPTANCE_OUTBOX_LEASE_MS,
      );
      return {
        ok: true,
        negotiation: { ...loaded.record, status: 'accepted', resolvedAt: input.now },
      };
    })
    .catch((error: unknown): NegotiateResult => {
      // souběh: ves mezitím dostala správce jinou cestou, transakce se vrátila celá
      if (error instanceof StewardshipTaken) return fail(error.message);
      throw error;
    });
  if (!result.ok) return result;
  const failed = (await deliverAcceptanceOutbox(deps, result.negotiation.id, input, claim))?.value;
  return failed ? fail(failed) : result;
}

/**
 * Nájem schránky účinků přijetí (ms, návrh Clauda – docs/code/worker.md): web ji drží od zápisu
 * v transakci přijetí (hodiny úložiště, ne začátek požadavku) a hned po commitu ji provede; během
 * účinků úložiště nájem obnovuje. Spadne-li web, vezme ji worker po vypršení nájmu – do té doby
 * hráči web vrátí důvod selhání pomoci nebo výkupného jako dřív.
 */
export const ACCEPTANCE_OUTBOX_LEASE_MS = 60_000;

/** První odklad po výjimce (ms, návrh Clauda); každý další dvojnásobný. */
const ACCEPTANCE_OUTBOX_RETRY_MS = 60_000;

/** Nejdelší odklad po výjimce (ms, návrh Clauda). */
const ACCEPTANCE_OUTBOX_RETRY_MAX_MS = 3_600_000;

/**
 * Po tolika výjimkách se schránka už nebere (návrh Clauda) – zůstane v úložišti pro ruční zásah
 * a worker to zapíše do logu.
 */
export const ACCEPTANCE_OUTBOX_MAX_ATTEMPTS = 10;

/** Nejvýš tolik schránek dokončí jeden krok workeru. */
const ACCEPTANCE_OUTBOX_BATCH = 50;

/** Odklad dalšího pokusu po `attempts`-té výjimce: 1, 2, 4… min, nejvýš 1 h. */
export function acceptanceOutboxRetryMs(attempts: number): number {
  const doublings = Math.min(Math.max(attempts - 1, 0), 20);
  return Math.min(ACCEPTANCE_OUTBOX_RETRY_MS * 2 ** doublings, ACCEPTANCE_OUTBOX_RETRY_MAX_MS);
}

const ACCEPTANCE_OUTBOX_POLICY: OutboxPolicy = {
  leaseMs: ACCEPTANCE_OUTBOX_LEASE_MS,
  retryMs: acceptanceOutboxRetryMs,
};

/**
 * Členy `NegotiateDeps`, bez kterých účinky přijetí nejdou provést (pomoc, obchod a poplatek, dar
 * odúmrti, postoupení, výkupné a propuštění). Ve schránce workeru jsou povinné (`AcceptanceDeps`);
 * chybí-li účinku za běhu, je to výjimka – schránka zůstane, nic se tiše nepřeskočí (audit A2 – M7).
 */
export const ACCEPTANCE_EFFECT_DEPS = ['aid', 'dialogs', 'escheatGift', 'cede', 'ransom'] as const;

type AcceptanceEffectDep = (typeof ACCEPTANCE_EFFECT_DEPS)[number];

/** Závislosti účinků přijetí – skládá je `acceptanceDeps` (`packages/server`) pro web i worker. */
export type AcceptanceDeps = NegotiateDeps & Required<Pick<NegotiateDeps, AcceptanceEffectDep>>;

/** Závislosti kroku workeru `deliverPendingAcceptances`. */
export type PendingAcceptanceDeps = AcceptanceDeps & {
  /** Log workeru – schránka, která vyčerpala pokusy a čeká na ruční zásah. */
  log: (message: string) => void;
};

/** Závislost účinku přijetí; chybí-li, účinek se nepřeskočí – výjimka nechá schránku na další pokus. */
function needed<K extends AcceptanceEffectDep>(
  deps: NegotiateDeps,
  key: K,
  negotiationId: string,
): NonNullable<NegotiateDeps[K]> {
  const dep = deps[key];
  if (dep === undefined) {
    throw new Error(`Účinky jednání ${negotiationId}: chybí závislost ${key}.`);
  }
  return dep as NonNullable<NegotiateDeps[K]>;
}

/**
 * Provede schránku účinků přijetí `negotiationId` pod nájmem (kdo ji právě provádí, toho druhý
 * přeskočí; `claim` – nájem z `putOutbox`, web ji tak vezme hned) a smaže ji: odeslání
 * (`deliverAcceptance`), pak kronika. Selhání pomoci nebo výkupného (věcný důvod) schránku uzavře
 * jako dřív – bez dalších účinků a kroniky – a vrátí důvod; výjimka (pád, neznámá verze tvaru,
 * chybějící závislost) se započítá jako pokus a schránka počká na odklad. Každý účinek je
 * idempotentní, opakování nic nezdvojí. Null – schránka už je vyřízená, nebo ji provádí jiný proces.
 */
function deliverAcceptanceOutbox(
  deps: NegotiateDeps,
  negotiationId: string,
  input: { now: Date; today: number },
  claim?: OutboxClaim,
): Promise<{ value: string | null } | null> {
  return deps.negotiations.withOutbox(
    negotiationId,
    async (effects) => {
      const version = (effects as { v?: unknown }).v;
      if (version !== ACCEPTED_VERSION) {
        throw new Error(
          `Schránka účinků jednání ${negotiationId}: neznámá verze ${String(version)}.`,
        );
      }
      const failed = await deliverAcceptance(deps, input, effects);
      if (!failed) await chronicleAcceptance(deps, effects);
      return failed;
    },
    ACCEPTANCE_OUTBOX_POLICY,
    claim,
  );
}

/**
 * Krok workeru (úlohy světa): dokončí schránky účinků přijetí, které smí převzít (nájem webu
 * i odklad po výjimce prošly, pokusů méně než `ACCEPTANCE_OUTBOX_MAX_ATTEMPTS`) – přijetí, po
 * kterém web spadl. Účinky jdou v okamžiku kroku (`now`, `today`), kronika ke dni přijetí. Chyba
 * jedné schránky nepřeruší ostatní – vyhodí se až na konci; schránku, která vyčerpala pokusy,
 * zapíše do logu. Vrací počet provedených schránek.
 */
export async function deliverPendingAcceptances(
  deps: PendingAcceptanceDeps,
  input: { now: Date; today: number },
): Promise<number> {
  let delivered = 0;
  let failure: unknown = null;
  const due = await deps.negotiations.pendingOutboxes(
    ACCEPTANCE_OUTBOX_BATCH,
    ACCEPTANCE_OUTBOX_MAX_ATTEMPTS,
  );
  for (const { negotiationId, attempts } of due) {
    try {
      if (await deliverAcceptanceOutbox(deps, negotiationId, input)) delivered++;
    } catch (error) {
      if (attempts + 1 >= ACCEPTANCE_OUTBOX_MAX_ATTEMPTS) {
        const reason = error instanceof Error ? error.message : String(error);
        deps.log(
          `schránka účinků jednání ${negotiationId}: ${ACCEPTANCE_OUTBOX_MAX_ATTEMPTS}. pokus ` +
            `selhal, dál se nebere – čeká na ruční zásah (${reason})`,
        );
      }
      failure ??= error;
    }
  }
  if (failure !== null) throw failure;
  return delivered;
}

/**
 * Ověření přijetí v transakci: dohoda mezi rody (bez přísahy jde o změnu podmínek existující
 * dohody), výkupné, mír, válečné požadavky, obchod, cílová ves, správa, vzájemnost přísah, řádky
 * a pomoc. Nic nezapisuje; vrací řádky a co se z nich zapíše, nebo důvod odmítnutí.
 */
async function checkAcceptance(
  deps: NegotiateDeps,
  tx: NegotiationTx,
  loaded: Loaded,
): Promise<AcceptCheck | { ok: false; reason: string }> {
  const items = loaded.negotiation.rounds[loaded.negotiation.rounds.length - 1]?.items ?? [];
  const terms = termsOfLines(termLinesOf(items));
  const oathItem = oathOf(items);
  // bez přísahy jde o změnu podmínek existující dohody
  const tradeLine = items.find(isTradeLine);
  const peaceLine = items.find(isPeaceLine);
  const ransomLine = items.find(isRansomLine);
  const warLine = items.find(isWarDemandLine) ?? peaceLine;
  const existing =
    oathItem || tradeLine || warLine || ransomLine
      ? null
      : await agreementBetween(tx, loaded.actor.id, loaded.other.id);
  if (!oathItem && !existing && !tradeLine && !warLine && !ransomLine) {
    return fail(NO_AGREEMENT);
  }
  // výkupné: zajatci musí být pořád ve vsi věznitele; zaplatí se a propustí po transakci
  let ransoming: Ransoming | null = null;
  if (ransomLine) {
    const parties: [string, string] = [loaded.actor.id, loaded.other.id];
    const checked = await checkRansomRound(deps, items, ...parties);
    if (checked && 'reason' in checked) return fail(checked.reason);
    if (checked) {
      ransoming = {
        line: ransomLine,
        captorHouseId: checked.captorHouseId,
        payerHouseId: checked.captorHouseId === parties[0] ? parties[1] : parties[0],
      };
    }
  }
  // mír: poplatek a postoupení se připraví tady, provedou se po transakci
  let later: PeaceLater | null = null;
  if (peaceLine) {
    const peace = await checkPeaceLater(deps, tx, items, loaded, peaceLine);
    if ('reason' in peace) return fail(peace.reason);
    later = peace;
  }
  if (warLine && !peaceLine) {
    const badWar = checkWarDemandParties(items, loaded.actor.id, loaded.other.id);
    if (badWar) return fail(badWar);
    // válka mezitím mohla utichnout nebo skončit jinak – mír nemá co ukončit
    if (!(await tx.wars.activeBetween(loaded.actor.id, loaded.other.id))) {
      return fail(WAR_DEMAND_REASONS.noWar);
    }
  }
  // obchod: ověří vsi (znovu, mezitím se mohly změnit) a připraví dva dialogy odeslání
  let sendings: TradeSending[] = [];
  if (tradeLine) {
    if (!deps.dialogs) return fail(TRADE_REASONS.noDialogs);
    const badTrade = await checkTradeRound(deps, items, [loaded.actor.id, loaded.other.id]);
    if (badTrade) return fail(badTrade);
    // autor posledního kola (druhá strana než ten, kdo přijímá) pošle `give`, přijímající `get`
    sendings = tradeSendings(tradeLine, loaded.other, loaded.actor);
    if (sendings.some((x) => x.toVillageId === null)) return fail(TRADE_REASONS.noTarget);
  }
  const badVillage = await checkTargetVillage(
    deps,
    items,
    oathItem?.lord ?? existing?.lordHouseId ?? '',
  );
  if (badVillage) return fail(badVillage);
  const sides = stewardSides(oathItem, existing);
  const stewardLine = items.find(isStewardshipLine);
  const giftLine = items.find(isVillageGiftLine);
  if (giftLine && !deps.escheatGift) return fail(NO_AGREEMENT);
  const badSteward = await checkStewardRound(deps, tx, items, sides);
  if (badSteward) return fail(badSteward);
  for (const item of items) {
    if (
      item.kind === 'oath' &&
      wouldBeMutual(await tx.vassalages.edgesNear(item.lord, 1), item.lord, item.vassal)
    ) {
      return fail(R.isYourLord);
    }
    const reason = await checkItem(tx, item);
    if (reason) return fail(reason);
  }
  const aidLine = items.find(isAidLine);
  const aid = await checkAidTarget(deps, existing, aidLine);
  if ('reason' in aid) return fail(aid.reason);
  const aidTarget = aid.target;
  return {
    ok: true,
    items,
    terms,
    oathItem,
    tradeLine,
    peaceLine,
    warLine,
    existing,
    ransoming,
    later,
    sendings,
    sides,
    stewardLine,
    giftLine,
    aidLine,
    aidTarget,
  };
}

/**
 * Pomoc při přijetí: jednání o pomoci podmínky dohody nemění (bez dohody nejde); zboží dar
 * i půjčky pošle věřitel po transakci do cílové vsi – z řádku, jinak do vsi vazala.
 */
async function checkAidTarget(
  deps: NegotiateDeps,
  existing: Vassalage | null,
  aidLine: AidLine | undefined,
): Promise<{ target: string | null } | { reason: string }> {
  if (aidLine) {
    if (!existing) return { reason: NO_AGREEMENT };
    if (aidLine.kind !== 'aid-request' && !deps.aid) return { reason: NO_AID };
  }
  const vassalHouse = existing ? await deps.houses.byId(existing.vassalHouseId) : null;
  const aidTarget =
    aidLine && aidLine.kind !== 'aid-request'
      ? (aidLine.toVillageId ?? vassalHouse?.lord?.villageId ?? null)
      : null;
  if (aidLine && aidLine.kind !== 'aid-request' && aidTarget === null) {
    return { reason: AID_REASONS.noTarget };
  }
  return { target: aidTarget };
}

/**
 * Mír při přijetí: ověří kolo míru a připraví poplatek (dialog plátci, který je hráč) a postoupení
 * vsí – provedou se po transakci (`applyPeaceLater`).
 */
async function checkPeaceLater(
  deps: NegotiateDeps,
  tx: NegotiationTx,
  items: readonly TermItem[],
  loaded: Loaded,
  peaceLine: PeaceLine,
): Promise<PeaceLater | { reason: string }> {
  const badPeace = await checkPeaceRound(deps, tx, items, loaded.actor.id, loaded.other.id);
  if (badPeace) return { reason: badPeace };
  const later: PeaceLater = { line: peaceLine, sendings: [], cede: null };
  const pays = (payer: string | undefined): House | null =>
    payer === loaded.actor.id ? loaded.actor : payer === loaded.other.id ? loaded.other : null;
  const payer = peaceLine.fee ? pays(peaceLine.payer) : null;
  if (payer && payer.playerId !== null) {
    if (!deps.dialogs) return { reason: TRADE_REASONS.noDialogs };
    const to = payer === loaded.actor ? loaded.other : loaded.actor;
    if (to.lord?.villageId === undefined) return { reason: TRADE_REASONS.noTarget };
    later.sendings.push({ fromHouse: payer, toHouse: to, toVillageId: to.lord.villageId });
  }
  if (peaceLine.cede && deps.cede) {
    const checked = await deps.cede.check([loaded.actor.id, loaded.other.id], peaceLine.cede);
    if (!checked.ok) return { reason: checked.reason };
    later.cede = {
      fromHouseId: checked.fromHouseId,
      toHouseId: checked.toHouseId,
      villageIds: peaceLine.cede,
    };
  }
  return later;
}

/**
 * Zápis přijetí v transakci: nové podmínky dohody, umístění nováčka, stav jednání a účinky
 * řádků (správa až po přísaze). Selhání (dohoda mezitím skončila, nováčka umístil jiný pán,
 * jednání skončilo) nezapíše nic.
 */
async function writeAcceptance(
  deps: NegotiateDeps,
  tx: NegotiationTx,
  loaded: Loaded,
  check: AcceptCheck,
  input: AcceptInput,
): Promise<
  | { ok: true; newcomer: NegotiationRecord['newcomer']; newcomerHouseId: string | null }
  | { ok: false; reason: string }
> {
  const { items, terms, existing, tradeLine, stewardLine, giftLine, aidLine, aidTarget, sides } =
    check;
  let newcomerHouseId: string | null = null;
  // staré podmínky platí do této chvíle; selhání (dohoda mezitím skončila) nezapíše nic
  if (
    existing &&
    !aidLine &&
    !tradeLine &&
    // správa bez řádků podmínek stávající podmínky dohody nemění
    !((stewardLine || giftLine) && termLinesOf(items).length === 0) &&
    !(await tx.vassalages.updateTerms(existing.id, terms, existing.version))
  ) {
    return fail(NO_AGREEMENT);
  }
  // žádost nováčka: první přijetí vyhraje – podmíněné umístění shluku vsí (`placed_at IS
  // NULL`) před změnou stavu; prohra nezapíše nic
  const newcomer = loaded.record.newcomer;
  if (newcomer) {
    if (loaded.actor.id !== loaded.record.recipientHouseId) return fail(R.notParty);
    const placed = await placeNewcomer(deps, tx, {
      houseId: loaded.other.id,
      lordHouseId: loaded.actor.id,
      origin: 'newcomer',
      now: input.now,
      today: input.today,
    });
    if (!placed.ok) return placed;
    newcomerHouseId = loaded.other.id;
  }
  if (!(await tx.setStatus(loaded.record.id, 'accepted', loaded.record.version, input.now))) {
    return fail(R.finished);
  }
  // správa vzniká až po přísaze (stojí na dohodě, kterou přísaha zakládá)
  const ordered = [
    ...items.filter((i) => !isStewardshipLine(i)),
    ...items.filter(isStewardshipLine),
  ];
  for (const item of ordered) {
    // vazalství nováčka založilo umístění (`placeNewcomer`, origin `newcomer`)
    if (newcomer && item.kind === 'oath') continue;
    await applyItem(tx, item, {
      now: input.now,
      day: input.today,
      terms,
      negotiationId: loaded.record.id,
      agreement: existing
        ? { lordHouseId: existing.lordHouseId, vassalHouseId: existing.vassalHouseId }
        : null,
      aidTargetVillageId: aidTarget,
      stewardship: sides ? { lordHouseId: sides.lordId, stewardHouseId: sides.vassalId } : null,
      parties: [loaded.actor.id, loaded.other.id],
    });
  }
  return { ok: true, newcomer, newcomerHouseId };
}

/**
 * Upozornění rodům v transakci: druhá strana se dozví o přijetí (nováček dostal
 * `newcomer-accepted` už při umístění), plátce poplatku míru a obě strany obchodu o čekajícím
 * odeslání zboží.
 */
async function noticeAcceptance(
  deps: NegotiateDeps,
  tx: NegotiationTx,
  loaded: Loaded,
  check: AcceptCheck,
  newcomer: NegotiationRecord['newcomer'],
  today: number,
): Promise<void> {
  const { later, tradeLine } = check;
  // nováček dostal `newcomer-accepted` už při umístění
  if (!newcomer) {
    await noticeHouse(
      tx,
      loaded.other,
      'negotiation-accepted',
      {
        negotiationId: loaded.record.id,
        houseId: loaded.actor.id,
        name: await houseName(deps, loaded.actor),
      },
      today,
    );
  }
  for (const s of later?.sendings ?? []) {
    await noticeHouse(
      tx,
      s.fromHouse,
      'levy-pending',
      { lordName: await houseName(deps, s.toHouse), years: 1, peace: true },
      today,
    );
  }
  if (tradeLine) {
    // obě strany se dozvědí, že čeká odeslání zboží (dialog Odvody, řádek obchodu)
    for (const side of [loaded.actor, loaded.other]) {
      const partner = side === loaded.actor ? loaded.other : loaded.actor;
      await noticeHouse(
        tx,
        side,
        'levy-pending',
        { lordName: await houseName(deps, partner), years: 1, trade: true },
        today,
      );
    }
  }
}

/** Schránka účinků přijetí po transakci z ověřených řádků (`checkAcceptance`); rody jako odkazy. */
function acceptedOf(
  loaded: Loaded,
  check: AcceptCheck,
  newcomerHouseId: string | null,
  today: number,
): Accepted {
  const { oathItem, peaceLine, warLine, giftLine, aidLine, aidTarget, tradeLine, sendings } = check;
  const refs = <T extends { fromHouse: HouseRef; toHouse: HouseRef }>(s: T): T => ({
    ...s,
    fromHouse: houseRef(s.fromHouse),
    toHouse: houseRef(s.toHouse),
  });
  return {
    v: ACCEPTED_VERSION,
    negotiationId: loaded.record.id,
    rounds: loaded.record.rounds.length,
    day: today,
    actors: { actor: houseRef(loaded.actor), other: houseRef(loaded.other) },
    oath:
      oathItem ??
      (peaceLine?.vassalage
        ? { lord: peaceLine.vassalage.lord, vassal: peaceLine.vassalage.vassal }
        : warLine && warLine.kind === 'war-demand'
          ? oathOf(warLine.items)
          : null),
    // dar i půjčku zboží pošle věřitel po transakci
    aid:
      aidLine && aidLine.kind !== 'aid-request' ? { line: aidLine, toVillageId: aidTarget } : null,
    trading: tradeLine ? { sendings: sendings.map(refs) } : null,
    // dárce = autor posledního kola (druhá strana), obdarovaný přijímá
    gift: giftLine
      ? { line: giftLine, fromHouseId: loaded.other.id, toHouseId: loaded.actor.id }
      : null,
    peace: warLine ?? null,
    ransoming: check.ransoming,
    newcomerHouseId,
    peaceLater: check.later ? { ...check.later, sendings: check.later.sendings.map(refs) } : null,
  };
}

/**
 * Po transakci (ze schránky): ostatní žádosti nováčka zaniknou, věřitel pošle pomoc, dárce ves,
 * výkupné se zaplatí, mír propustí zajatce, postoupí vsi a otevře dialogy poplatku, obchod dialogy
 * odeslání. Vrací důvod selhání pomoci nebo výkupného, jinak null. Každý krok je idempotentní
 * (klíč jednání a druhu účinku) – po pádu se schránka provede znovu celá a nic se nezdvojí.
 */
async function deliverAcceptance(
  deps: NegotiateDeps,
  input: { now: Date; today: number },
  effects: Accepted,
): Promise<string | null> {
  const { newcomerHouseId, aid: sending, gift: giving, ransoming: ransom, trading } = effects;
  const negotiationId = effects.negotiationId;
  if (newcomerHouseId) {
    // ostatní žádosti nováčka zaniknou (jejich páni se to dozvědí)
    await closeNewcomerRequests(deps, {
      houseId: newcomerHouseId,
      status: 'ended',
      notify: true,
      now: input.now,
      today: input.today,
    });
  }
  if (sending?.toVillageId) {
    const aid = needed(deps, 'aid', negotiationId);
    const failed = await sendAid(aid, sending.line, sending.toVillageId, {
      negotiationId,
      today: input.today,
      now: input.now,
    });
    if (failed) return failed;
  }
  if (giving) {
    await needed(
      deps,
      'escheatGift',
      negotiationId,
    )({
      ...giving,
      now: input.now,
      today: input.today,
    });
  }
  if (ransom) {
    const failed = await needed(deps, 'ransom', negotiationId).apply({
      ...ransom,
      negotiationId,
      now: input.now,
      today: input.today,
    });
    if (failed) return failed;
  }
  if (effects.peaceLater) {
    await applyPeaceLater(deps, input, negotiationId, effects.peaceLater, effects.actors);
  }
  if (trading) {
    const dialogs = needed(deps, 'dialogs', negotiationId);
    await openTradeDialogs(dialogs, negotiationId, trading.sendings, input.today);
  }
  return null;
}

/** Mír po transakci: propuštění zajatců, postoupení vsí a dialogy poplatku plátci. */
async function applyPeaceLater(
  deps: NegotiateDeps,
  input: { now: Date; today: number },
  negotiationId: string,
  later: PeaceLater,
  { actor, other }: Actors,
): Promise<void> {
  if (later.line.releasePrisoners?.length) {
    await needed(deps, 'ransom', negotiationId).release({
      prisonerIds: later.line.releasePrisoners,
      parties: [actor.id, other.id],
      negotiationId,
      now: input.now,
      today: input.today,
    });
  }
  if (later.cede) {
    await needed(deps, 'cede', negotiationId).apply({
      ...later.cede,
      negotiationId,
      now: input.now,
      today: input.today,
    });
  }
  if (later.line.fee && later.sendings.length > 0) {
    const dialogs = needed(deps, 'dialogs', negotiationId);
    for (const s of later.sendings) {
      await dialogs.openOnce(`fee:${negotiationId}:${s.fromHouse.id}`, {
        playerId: s.fromHouse.playerId as string,
        kind: 'fee-send',
        refId: negotiationId,
        year: dateOfDayIndex(input.today).year,
        body: {
          negotiationId,
          fromHouseId: s.fromHouse.id,
          toHouseId: s.toHouse.id,
          toVillageId: s.toVillageId,
          goods: later.line.fee,
        },
      });
    }
  }
}

/**
 * Kronika přijetí: přísaha pod jmény pána a vazala, jinak (bez míru) druh kroku – pomoc,
 * obchod, nebo podmínky; mír zapíše kronika války.
 */
async function chronicleAcceptance(deps: NegotiateDeps, effects: Accepted): Promise<void> {
  const { actors, oath: o, peace, aid: sending, trading: opening, day: today } = effects;
  const { actor, other } = actors;
  const key = `neg:${effects.negotiationId}:${effects.rounds}`;
  if (o) {
    const lord = o.lord === actor.id ? actor : other;
    const vassal = o.vassal === actor.id ? actor : other;
    await chronicleHouses(deps, [actor, other], `${key}:accepted`, {
      day: today,
      kind: 'negotiation-accepted',
      lord: await houseName(deps, lord),
      vassal: await houseName(deps, vassal),
    });
  } else if (!peace) {
    await chronicleStep(
      deps,
      actors,
      key,
      sending
        ? sending.line.kind === 'gift'
          ? 'aid-gift'
          : 'aid-loan'
        : opening
          ? 'trade-accepted'
          : 'terms-accepted',
      today,
    );
  }
  if (peace) {
    await chronicleWar(deps, actor, other, 'peace', `war-peace:${effects.negotiationId}`, today);
  }
}

/**
 * Pošle zboží z věřitelovy vsi (dar, půjčka; doveze ten, kdo posílá) – hned po přijetí, pod
 * zámkem držitele odesílající vsi (`sendShipment`), ne v transakci jednání. Jedinečný klíč
 * `aid:<jednání>` zaručí jedinou zásilku. Nepodaří-li se, půjčka se zruší a vrací se důvod.
 */
async function sendAid(
  aid: AidDeps,
  line: Extract<AidLine, { kind: 'gift' | 'loan' }>,
  toVillageId: string,
  input: { negotiationId: string; today: number; now: Date },
): Promise<string | null> {
  // opakování po pádu (schránka jednání – audit A2, M6): dřívější pokus mohl půjčku zrušit, protože
  // zboží nešlo poslat – teď by už šlo a vazal by ho dostal bez splátek
  if (line.kind === 'loan') {
    const existing = await aid.loans.ofNegotiation(input.negotiationId);
    if (existing?.status === 'cancelled') return 'Půjčka byla zrušena, zboží se neposílá.';
  }
  await aid.prepareVillage(line.fromVillageId, input.today);
  const sent = await sendShipment(aid.shipments, {
    fromVillageId: line.fromVillageId,
    toVillageId,
    bundle: line.bundle,
    purpose: 'aid',
    refId: `aid:${input.negotiationId}`,
    today: input.today,
  });
  if (sent.ok) return null;
  if (line.kind === 'loan') await aid.loans.cancelOfNegotiation(input.negotiationId, input.now);
  return `Zboží se nepodařilo poslat: ${sent.reason}`;
}

/** Odmítnutí končí jednání a spouští pauzu (odmítnutý smí znovu za 1 skutečný den). */
export async function rejectNegotiation(
  deps: NegotiateDeps,
  input: { playerId: string; negotiationId: string; now: Date; today: number },
): Promise<NegotiateResult> {
  let actors: Actors | null = null;
  const result = await deps.negotiations.transaction(async (tx): Promise<NegotiateResult> => {
    const loaded = await loadForResponse(deps, tx, input.playerId, input.negotiationId);
    if (!loaded.ok) return loaded;
    const done = rejectRound(loaded.negotiation, loaded.actor.id, input.now);
    if (!done.ok) return done;
    if (!(await tx.setStatus(loaded.record.id, 'rejected', loaded.record.version, input.now))) {
      return fail(R.finished);
    }
    // navrhovatelem je autor posledního kola; pauza platí pro něj vůči odmítajícímu
    await tx.recordReject(lastAuthor(loaded.record) ?? loaded.other.id, loaded.actor.id, input.now);
    // nováčka odmítli všichni vybraní – smí do konce týdne vybrat znovu (newcomers.md)
    if (
      loaded.record.newcomer &&
      !(await tx.openOf(loaded.other.id)).some(
        (r) => r.newcomer && r.id !== loaded.record.id && r.initiatorHouseId === loaded.other.id,
      )
    ) {
      const deadline = newcomerDeadline(loaded.other);
      await noticeHouse(
        tx,
        loaded.other,
        'newcomer-rejected-all',
        { deadline: deadline?.toISOString() ?? null },
        input.today,
      );
    }
    await noticeHouse(
      tx,
      loaded.other,
      'negotiation-rejected',
      {
        negotiationId: loaded.record.id,
        houseId: loaded.actor.id,
        name: await houseName(deps, loaded.actor),
      },
      input.today,
    );
    actors = { actor: loaded.actor, other: loaded.other };
    return {
      ok: true,
      negotiation: { ...loaded.record, status: 'rejected', resolvedAt: input.now },
    };
  });
  if (result.ok && actors)
    await chronicleStep(deps, actors, stepKey(result.negotiation), 'rejected', input.today);
  return result;
}

/**
 * Stažení žádosti odříznutého nováčka = Svobodný (newcomers.md – „Stáhnout žádosti = svobodný“):
 * stáhne všechny žádosti a umístí ho bez pána (`startFree`), jinak by obešel „nový výběr jen po
 * odmítnutí všemi“. Vrací null, když nejde o otevřenou žádost odříznutého hráče.
 */
async function withdrawNewcomerRequest(
  deps: NegotiateDeps,
  input: { playerId: string; negotiationId: string; now: Date; today: number },
): Promise<NegotiateResult | null> {
  const own = await deps.houses.activeOf(input.playerId);
  if (!own || own.placedAt !== null) return null;
  const record = (await deps.negotiations.newcomerRequestsOf(own.id)).find(
    (r) => r.id === input.negotiationId && r.status === 'open' && r.initiatorHouseId === own.id,
  );
  if (!record) return null;
  const freed = await startFree(deps, input);
  return freed.ok
    ? { ok: true, negotiation: { ...record, status: 'withdrawn', resolvedAt: input.now } }
    : freed;
}

/** Stažení posledního kola – smí jen jeho autor, dokud druhý neodpověděl. */
export async function withdrawNegotiation(
  deps: NegotiateDeps,
  input: { playerId: string; negotiationId: string; now: Date; today: number },
): Promise<NegotiateResult> {
  const freed = await withdrawNewcomerRequest(deps, input);
  if (freed) return freed;
  let actors: Actors | null = null;
  const result = await deps.negotiations.transaction(async (tx): Promise<NegotiateResult> => {
    const loaded = await loadForResponse(deps, tx, input.playerId, input.negotiationId);
    if (!loaded.ok) return loaded;
    const done = withdrawRound(loaded.negotiation, loaded.actor.id, input.now);
    if (!done.ok) return done;
    if (!(await tx.setStatus(loaded.record.id, 'withdrawn', loaded.record.version, input.now))) {
      return fail(R.finished);
    }
    await noticeHouse(
      tx,
      loaded.other,
      'negotiation-withdrawn',
      {
        negotiationId: loaded.record.id,
        houseId: loaded.actor.id,
        name: await houseName(deps, loaded.actor),
      },
      input.today,
    );
    actors = { actor: loaded.actor, other: loaded.other };
    return {
      ok: true,
      negotiation: { ...loaded.record, status: 'withdrawn', resolvedAt: input.now },
    };
  });
  if (result.ok && actors)
    await chronicleStep(deps, actors, stepKey(result.negotiation), 'withdrawn', input.today);
  return result;
}

export type { NegotiationResult };

/** Obě strany obchodu: `author` pošle `give`, `accepter` pošle `get`. */
function tradeSendings(line: TradeLine, author: House, accepter: House): TradeSending[] {
  const target = (house: House): string | null =>
    line.fromVillage[house.id] ?? house.lord?.villageId ?? null;
  return [
    { fromHouse: author, toHouse: accepter, goods: line.give, toVillageId: target(accepter) },
    { fromHouse: accepter, toHouse: author, goods: line.get, toVillageId: target(author) },
  ];
}

/**
 * Kontrola kola jednání o obchodu (vassalage.md – Hospodářství mezi hráči): jediný řádek obchodu,
 * čísla v mezích a ves, kterou strana uvádí, jí patří. Kolo bez řádku obchodu je v pořádku.
 */
async function checkTradeRound(
  deps: NegotiateDeps,
  items: readonly TermItem[],
  parties: readonly [string, string],
): Promise<string | null> {
  const line = items.find(isTradeLine);
  if (!line) return null;
  const bad = checkTradeItems(items);
  if (bad) return bad;
  for (const [houseId, villageId] of Object.entries(line.fromVillage)) {
    if (!parties.includes(houseId) || !(await ownsVillage(deps, houseId, villageId))) {
      return TRADE_REASONS.badVillage;
    }
  }
  return null;
}

/**
 * Otevře každé straně dialog odeslání (jedinečný klíč `trade:<jednání>:<rod>` – opakování nic
 * nezdvojí). Dialog drží dohodnuté zboží a cílovou ves; hráč pošle celé, míň, nebo nic.
 */
async function openTradeDialogs(
  dialogs: Pick<DialogRepository, 'openOnce'>,
  negotiationId: string,
  sendings: readonly TradeSending[],
  today: number,
): Promise<void> {
  for (const s of sendings) {
    if (s.fromHouse.playerId === null || s.toVillageId === null) continue;
    await dialogs.openOnce(`trade:${negotiationId}:${s.fromHouse.id}`, {
      playerId: s.fromHouse.playerId,
      kind: 'trade-send',
      refId: negotiationId,
      year: dateOfDayIndex(today).year,
      body: {
        negotiationId,
        fromHouseId: s.fromHouse.id,
        toHouseId: s.toHouse.id,
        toVillageId: s.toVillageId,
        goods: s.goods,
      },
    });
  }
}
