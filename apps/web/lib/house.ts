import {
  housePanel,
  issueInvite,
  revokeInvite,
  type HousePanelData,
  type IssueInviteResult,
} from '@bohemia/game';
import { gameDeps, playerToday } from './game';
import { houseView, type HouseView } from './house-view';

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
