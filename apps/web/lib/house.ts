import { escheatGift } from './escheats';
import {
  acceptNegotiation,
  blockPlayer,
  dismissSteward,
  counterNegotiation,
  declareWar,
  housePanel,
  houseSpareOutlook,
  issueInvite,
  openNegotiation,
  rejectNegotiation,
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
  const result: NegotiateResult = await openNegotiation(gameDeps(), {
    playerId,
    ...input,
    now: new Date(),
    today: today.day,
  });
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

/** Odpověď na jednání: přijmout, odmítnout, stáhnout, nebo protinávrh. */
export async function answerNegotiationForPlayer(
  playerId: string,
  input: NegotiationAnswer,
): Promise<NegotiationActionResult> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const base = { playerId, negotiationId: input.negotiationId, now: new Date(), today: today.day };
  const deps = gameDeps();
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
