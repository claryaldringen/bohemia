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
import type { DialogRepository } from './dialogs';
import type { HouseRepository, House } from './houses';
import { applyItem, checkItem, StewardshipTaken } from './negotiation-effects';
import {
  chronicleHouses,
  houseName,
  noticeHouse,
  type NegotiationVillages,
} from './negotiation-chronicle';
import type { NegotiationRecord, NegotiationRepository, NegotiationTx } from './negotiations';
import type { LoanRepository } from './loans';
import { sendShipment, type ShipmentDeps } from './shipments';
import type { Vassalage } from './vassalages';
import type { WorldDirectory } from './world-directory';

// Use-casy jednání mezi hráči (vassalage.md – Vznik a jednání, Meze). Strany jsou rody; hráč jedná
// za svůj živý rod. Vše mění stav v jedné transakci nad vlastními tabulkami (bez zámku hráče),
// účinky přijetí (vazalství) jedou v téže transakci. Kronika se zapisuje až po ní.

/** Závislosti dovozu pomoci: zásilky, dopočet vsi do dneška a zrušení půjčky, jejíž zboží nedošlo. */
export interface AidDeps {
  shipments: ShipmentDeps;
  prepareVillage: (villageId: string, today: number) => Promise<unknown>;
  loans: Pick<LoanRepository, 'cancelOfNegotiation'>;
}

export interface NegotiateDeps extends NegotiationVillages {
  /** Bez něj nejde přijmout dar ani půjčku (nemá kdo poslat zásilku). */
  aid?: AidDeps;
  /** Bez něj nejde přijmout obchod (nemá se kde otevřít dialog odeslání). */
  dialogs?: Pick<DialogRepository, 'openOnce'>;
  houses: Pick<HouseRepository, 'activeOf' | 'byId'>;
  negotiations: NegotiationRepository;
  /** Čte se z něj, které vsi rod vlastní (cílová ves musí patřit pánovi). */
  worldDirectory: Pick<WorldDirectory, 'entriesOf'>;
}

export type NegotiateResult =
  { ok: true; negotiation: NegotiationRecord } | { ok: false; reason: string };

export const NO_HOUSE = 'Nemáš živý rod.';
export const NO_NEGOTIATION = 'Jednání neexistuje.';
export const NO_AID = 'Pomoc teď nejde poslat.';
export const NO_AGREEMENT = 'Dohoda mezi rody neexistuje.';

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

const isAlive = (house: House | null): house is House => house !== null && house.endedAt === null;

/** Doménový pohled na záznam; `ended` (rod vymřel) už nelze měnit. */
function domainOf(record: NegotiationRecord): Negotiation | null {
  if (record.status === 'ended') return null;
  return { ...record, status: record.status };
}

function oathOf(items: readonly TermItem[]): { lord: string; vassal: string } | null {
  for (const i of items) if (i.kind === 'oath') return { lord: i.lord, vassal: i.vassal };
  return null;
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

interface Actors {
  actor: House;
  other: House;
}

/** Kroniku obou rodů zapíše po transakci jedním druhem události (`step`). */
async function chronicleStep(
  deps: NegotiateDeps,
  { actor, other }: Actors,
  record: NegotiationRecord,
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
  await chronicleHouses(
    deps,
    [actor, other],
    `neg:${record.id}:${record.rounds.length}:${step}`,
    event,
  );
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
  },
): Promise<NegotiateResult> {
  const from = await deps.houses.activeOf(input.playerId);
  if (!from) return fail(NO_HOUSE);
  const to = await deps.houses.byId(input.to);
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
    const trade = input.items.some(isTradeLine);
    const existing = oath || trade ? null : await agreementBetween(tx, from.id, input.to);
    if (!oath && !existing && !trade) return fail(NO_AGREEMENT);
    const badTrade = await checkTradeRound(deps, input.items, [from.id, input.to]);
    if (badTrade) return fail(badTrade);
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
    });
    if (!record) return fail(R.negotiating);
    if (to) {
      await noticeHouse(
        tx,
        to,
        'negotiation-offer',
        { negotiationId: record.id, houseId: from.id, name: await houseName(deps, from) },
        input.today,
      );
    }
    return { ok: true, negotiation: record };
  });
  if (result.ok && to) {
    await chronicleStep(deps, { actor: from, other: to }, result.negotiation, 'offer', input.today);
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
    const next = counterRound(
      loaded.negotiation,
      loaded.actor.id,
      input.items,
      input.message,
      input.now,
    );
    if (!next.ok) return next;
    const first = oathOf(loaded.record.rounds[0]?.items ?? []);
    const trade = (loaded.record.rounds[0]?.items ?? []).some(isTradeLine);
    // obchod zůstává obchodem a ostatní jednání obchodem nebude
    if (input.items.some(isTradeLine) !== trade) return fail(TRADE_REASONS.onlyTrade);
    const existing =
      first || trade ? null : await agreementBetween(tx, loaded.actor.id, loaded.other.id);
    if (!first && !existing && !trade) return fail(NO_AGREEMENT);
    const badTrade = await checkTradeRound(deps, input.items, [loaded.actor.id, loaded.other.id]);
    if (badTrade) return fail(badTrade);
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
    await chronicleStep(deps, actors, result.negotiation, 'counter', input.today);
  return result;
}

/**
 * Přijetí posledního kola: ověří živé rody a vzájemnost, uzavře jednání a spustí účinky všech
 * řádků – vše v jedné transakci (kdo přijetí vyhraje souběh, vazalství vznikne jedno).
 */
export async function acceptNegotiation(
  deps: NegotiateDeps,
  input: { playerId: string; negotiationId: string; now: Date; today: number },
): Promise<NegotiateResult> {
  let actors: Actors | null = null;
  let oath: { lord: string; vassal: string } | null = null;
  let aid: {
    line: Extract<AidLine, { kind: 'gift' | 'loan' }>;
    toVillageId: string | null;
  } | null = null;
  let trading: { sendings: TradeSending[]; today: number } | null = null;
  const result = await deps.negotiations
    .transaction(async (tx): Promise<NegotiateResult> => {
      const loaded = await loadForResponse(deps, tx, input.playerId, input.negotiationId);
      if (!loaded.ok) return loaded;
      const done = acceptRound(loaded.negotiation, loaded.actor.id, input.now);
      if (!done.ok) return done;
      const items = loaded.negotiation.rounds[loaded.negotiation.rounds.length - 1]?.items ?? [];
      const terms = termsOfLines(termLinesOf(items));
      const oathItem = oathOf(items);
      // bez přísahy jde o změnu podmínek existující dohody
      const tradeLine = items.find(isTradeLine);
      const existing =
        oathItem || tradeLine ? null : await agreementBetween(tx, loaded.actor.id, loaded.other.id);
      if (!oathItem && !existing && !tradeLine) return fail(NO_AGREEMENT);
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
      // jednání o pomoci podmínky dohody nemění; zboží dar i půjčky pošle věřitel po transakci
      const aidLine = items.find(isAidLine);
      if (aidLine) {
        if (!existing) return fail(NO_AGREEMENT);
        if (aidLine.kind !== 'aid-request' && !deps.aid) return fail(NO_AID);
      }
      const vassalHouse = existing ? await deps.houses.byId(existing.vassalHouseId) : null;
      const aidTarget =
        aidLine && aidLine.kind !== 'aid-request'
          ? (aidLine.toVillageId ?? vassalHouse?.lord?.villageId ?? null)
          : null;
      if (aidLine && aidLine.kind !== 'aid-request' && aidTarget === null) {
        return fail(AID_REASONS.noTarget);
      }
      // staré podmínky platí do této chvíle; selhání (dohoda mezitím skončila) nezapíše nic
      if (
        existing &&
        !aidLine &&
        !tradeLine &&
        // správa bez řádků podmínek stávající podmínky dohody nemění
        !(stewardLine && termLinesOf(items).length === 0) &&
        !(await tx.vassalages.updateTerms(existing.id, terms, existing.version))
      ) {
        return fail(NO_AGREEMENT);
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
        });
      }
      await noticeHouse(
        tx,
        loaded.other,
        'negotiation-accepted',
        {
          negotiationId: loaded.record.id,
          houseId: loaded.actor.id,
          name: await houseName(deps, loaded.actor),
        },
        input.today,
      );
      if (tradeLine) {
        // obě strany se dozvědí, že čeká odeslání zboží (dialog Odvody, řádek obchodu)
        for (const side of [loaded.actor, loaded.other]) {
          const partner = side === loaded.actor ? loaded.other : loaded.actor;
          await noticeHouse(
            tx,
            side,
            'levy-pending',
            { lordName: await houseName(deps, partner), years: 1, trade: true },
            input.today,
          );
        }
        trading = { sendings, today: input.today };
      }
      actors = { actor: loaded.actor, other: loaded.other };
      oath = oathItem;
      if (aidLine && aidLine.kind !== 'aid-request')
        aid = { line: aidLine, toVillageId: aidTarget };
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
  const sending = aid as {
    line: Extract<AidLine, { kind: 'gift' | 'loan' }>;
    toVillageId: string | null;
  } | null;
  if (result.ok && sending && deps.aid && sending.toVillageId) {
    const failed = await sendAid(deps.aid, sending.line, sending.toVillageId, {
      negotiationId: result.negotiation.id,
      today: input.today,
      now: input.now,
    });
    if (failed) return fail(failed);
  }
  const opening = trading as { sendings: TradeSending[]; today: number } | null;
  if (result.ok && opening && deps.dialogs) {
    await openTradeDialogs(deps.dialogs, result.negotiation.id, opening.sendings, input.today);
  }
  if (result.ok && actors) {
    const { actor, other } = actors as Actors;
    const o = oath as { lord: string; vassal: string } | null;
    if (o) {
      const lord = o.lord === actor.id ? actor : other;
      const vassal = o.vassal === actor.id ? actor : other;
      await chronicleHouses(
        deps,
        [actor, other],
        `neg:${result.negotiation.id}:${result.negotiation.rounds.length}:accepted`,
        {
          day: input.today,
          kind: 'negotiation-accepted',
          lord: await houseName(deps, lord),
          vassal: await houseName(deps, vassal),
        },
      );
    } else {
      await chronicleStep(
        deps,
        actors as Actors,
        result.negotiation,
        sending
          ? sending.line.kind === 'gift'
            ? 'aid-gift'
            : 'aid-loan'
          : opening
            ? 'trade-accepted'
            : 'terms-accepted',
        input.today,
      );
    }
  }
  return result;
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
    await chronicleStep(deps, actors, result.negotiation, 'rejected', input.today);
  return result;
}

/** Stažení posledního kola – smí jen jeho autor, dokud druhý neodpověděl. */
export async function withdrawNegotiation(
  deps: NegotiateDeps,
  input: { playerId: string; negotiationId: string; now: Date; today: number },
): Promise<NegotiateResult> {
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
    await chronicleStep(deps, actors, result.negotiation, 'withdrawn', input.today);
  return result;
}

export type { NegotiationResult };

/** Co a komu posílá jedna strana obchodu (dialog `trade-send`). */
interface TradeSending {
  fromHouse: House;
  toHouse: House;
  goods: TradeLine['give'];
  /** Ves příjemce, kam zásilka dojde (domluvená, jinak ves hlavy rodu); null – nemá kam. */
  toVillageId: string | null;
}

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
