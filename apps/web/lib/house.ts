import { escheatGift } from './escheats';
import { ransom } from './prisoners';
import {
  acceptNegotiation,
  blockPlayer,
  unblockPlayer,
  dismissSteward,
  counterNegotiation,
  declareWar,
  answerComplaint,
  fileComplaint,
  judgeDispute,
  type Verdict,
  housePanel,
  houseSpareOutlook,
  issueInvite,
  openNegotiation,
  rejectNegotiation,
  newcomerStatus,
  requestLords,
  startFree,
  renounceVassalage,
  revokeInvite,
  withdrawNegotiation,
  type HousePanelData,
  type MacroSpare,
  type NegotiateResult,
  type IssueInviteResult,
} from '@bohemia/game';
import { gameDeps, playerToday } from './game';
import { exclusivePlayer } from './exclusive';
import { getPlayerLock } from './db';
import { aidDeps } from './levies';
import type { NegotiationAnswer } from './house-input';
import { houseView, type HouseView } from './house-view';
import { newcomerStatusView, type NewcomerStatusView } from './newcomer-view';
import type { TermItem } from '@bohemia/game';

// Composition root panelu „Rod a vazalové“: use-casy nad skutečnými repozitáři. Herní logika je
// v `packages/game` (`housePanel`, `issueInvite`, `revokeInvite`), tady se jen spojují závislosti
// a výsledek se převádí na pohled pro rozhraní.

/** Panel hráče; bez herního dne (výpadek světa) chyba česky. */
export async function housePanelForPlayer(
  playerId: string,
): Promise<HouseView | { error: string }> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const data: HousePanelData = await housePanel(gameDeps(), { playerId, today: today.day });
  return houseView(data, Date.now());
}

/** Vydá pozvánku; vrací kód (bez pomlčky) k zobrazení, nebo důvod odmítnutí česky. */
export async function issueInviteForPlayer(
  playerId: string,
): Promise<{ code: string } | { error: string }> {
  const result: IssueInviteResult = await issueInvite(gameDeps(), playerId);
  return result.ok ? { code: result.invite.code } : { error: result.error };
}

/** Zruší vlastní nevyužitý kód. */
export async function revokeInviteForPlayer(
  playerId: string,
  code: string,
): Promise<{ ok: true } | { error: string }> {
  return (await revokeInvite(gameDeps(), playerId, code))
    ? { ok: true }
    : { error: 'Pozvánku nejde zrušit.' };
}

/** Výsledek akce jednání pro klienta: `{ ok }`, nebo důvod odmítnutí česky. */
export type NegotiationActionResult = { ok: true } | { error: string };

const outcome = (result: { ok: true } | { ok: false; reason: string }): NegotiationActionResult =>
  result.ok ? { ok: true } : { error: result.reason };

/** Hráč za svůj rod otevře jednání s rodem `to` (nabídka vazalství nebo žádost o přijetí). */
export async function openNegotiationForPlayer(
  playerId: string,
  input: { to: string; items: TermItem[]; message: string | null },
): Promise<NegotiationActionResult> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const result: NegotiateResult = await openNegotiation(
    { ...gameDeps(), ransom: ransom() },
    {
      playerId,
      ...input,
      now: new Date(),
      today: today.day,
    },
  );
  return outcome(result);
}

/** Hráč za svůj rod opoví válku rodu `target` (volitelně s požadavkem a vzkazem). */
export async function declareWarForPlayer(
  playerId: string,
  input: { target: string; demand: TermItem[]; message: string | null },
): Promise<NegotiationActionResult> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const result = await declareWar(gameDeps(), {
    playerId,
    ...input,
    now: new Date(),
    today: today.day,
  });
  return result.ok ? { ok: true } : { error: result.reason };
}

/** Stav nováčka (newcomers.md): odříznutý – nabídka pánů, žádosti a konec týdne; jinak umístěný. */
export async function newcomerStatusForPlayer(playerId: string): Promise<NewcomerStatusView> {
  return newcomerStatusView(await newcomerStatus(gameDeps(), playerId));
}

/** Nováček začne svobodný (newcomers.md) – stáhne žádosti a umístí se k rodům svého jazyka. */
export async function startFreeForPlayer(playerId: string): Promise<NegotiationActionResult> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const result = await startFree(gameDeps(), { playerId, now: new Date(), today: today.day });
  return result.ok ? { ok: true } : { error: result.reason };
}

/** Odříznutý nováček požádá 1–5 rodů z nabídky o přijetí za vazala (newcomers.md). */
export async function requestLordsForPlayer(
  playerId: string,
  houseIds: string[],
): Promise<NegotiationActionResult> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const result = await requestLords(gameDeps(), {
    playerId,
    houseIds,
    now: new Date(),
    today: today.day,
  });
  return result.ok ? { ok: true } : { error: result.reason };
}

/** Odpověď na jednání: přijmout, odmítnout, stáhnout, nebo protinávrh. */
export async function answerNegotiationForPlayer(
  playerId: string,
  input: NegotiationAnswer,
): Promise<NegotiationActionResult> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const base = { playerId, negotiationId: input.negotiationId, now: new Date(), today: today.day };
  const deps = { ...gameDeps(), ransom: ransom() };
  switch (input.answer) {
    case 'accept':
      return outcome(
        await acceptNegotiation({ ...deps, aid: aidDeps(), escheatGift: escheatGift() }, base),
      );
    case 'reject':
      return outcome(await rejectNegotiation(deps, base));
    case 'withdraw':
      return outcome(await withdrawNegotiation(deps, base));
    case 'counter':
      return outcome(
        await counterNegotiation(deps, { ...base, items: input.items, message: input.message }),
      );
  }
}

/** Hráč za svůj rod zablokuje rod `target`. */
export async function blockHouseForPlayer(
  playerId: string,
  target: string,
): Promise<NegotiationActionResult> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  return outcome(
    await blockPlayer(gameDeps(), { playerId, target, now: new Date(), today: today.day }),
  );
}

/** Hráč zruší své zablokování rodu `target`. */
export async function unblockHouseForPlayer(
  playerId: string,
  target: string,
): Promise<NegotiationActionResult> {
  return outcome(await unblockPlayer(gameDeps(), { playerId, target, now: new Date() }));
}

/**
 * Výhled „kolik můžu postrádat“ pro dávku rodu `toHouseId` (a jeho cílovou ves). Počítá se jen na
 * vyžádání – načítá stavy všech vsí hráčova rodu, proto není součástí panelu.
 */
export async function houseSpareForPlayer(
  playerId: string,
  input: { toHouseId: string; targetVillageId?: string },
): Promise<{ spare: MacroSpare } | { error: string }> {
  const result = await houseSpareOutlook(gameDeps(), { playerId, ...input });
  return result.ok ? { spare: result.spare } : { error: result.reason };
}

/** Hráč za svůj rod vypoví dohodu (jako pán i jako vazal); platí hned. */
export async function renounceVassalageForPlayer(
  playerId: string,
  input: { vassalageId: string; message: string | null },
): Promise<NegotiationActionResult> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  return outcome(
    await renounceVassalage(gameDeps(), { playerId, ...input, now: new Date(), today: today.day }),
  );
}

/**
 * Držitel odvolá správce své vsi (kdykoli). Běží pod zámkem držitele – tentýž zámek, pod kterým
 * jedná správce, takže souběžná akce správce buď doběhne před odvoláním, nebo je po něm odmítnuta.
 */
export async function dismissStewardForPlayer(
  playerId: string,
  villageId: string,
): Promise<NegotiationActionResult> {
  const result = await exclusivePlayer(getPlayerLock(), playerId, () =>
    dismissSteward(gameDeps(), { playerId, villageId }),
  );
  return outcome(result);
}

const judgmentOutcome = (
  result: { ok: true } | { ok: false; reason: string },
): NegotiationActionResult => (result.ok ? { ok: true } : { error: result.reason });

/** Vazal žaluje spoluvazala před společným pánem (vassalage.md – Mír a spory). */
export async function fileComplaintForPlayer(
  playerId: string,
  input: { against: string; message: string },
): Promise<NegotiationActionResult> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  return judgmentOutcome(await fileComplaint(gameDeps(), { playerId, ...input, today: today.day }));
}

/** Obžalovaný se vyjádří k žalobě. */
export async function answerComplaintForPlayer(
  playerId: string,
  input: { disputeId: string; statement: string },
): Promise<NegotiationActionResult> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  return judgmentOutcome(
    await answerComplaint(gameDeps(), { playerId, ...input, today: today.day }),
  );
}

/** Pán vynese rozsudek (náhrada, vrácení lidí, mír, zamítnutí). */
export async function judgeDisputeForPlayer(
  playerId: string,
  input: { disputeId: string; verdict: Verdict },
): Promise<NegotiationActionResult> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  return judgmentOutcome(await judgeDispute(gameDeps(), { playerId, ...input, today: today.day }));
}
