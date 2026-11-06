import {
  consentEscheat,
  escheatDialogs,
  giveEscheatPart,
  proposeEscheat,
  type EscheatPart,
  type EscheatView,
  type NegotiateDeps,
} from '@bohemia/game';
import { gameDeps, playerToday } from './game';

// Composition root odúmrti (úloha 4.10): dialog pána nad vsemi a vazaly vymřelého rodu. Herní
// logika je v `packages/game/src/application/escheat.ts`; web jen skládá závislosti. Žádná akce tu
// nedrží zámek hráče – převod vsí si zámky bere postupně (starý, pak nový držitel).

function escheatDeps(): Parameters<typeof proposeEscheat>[0] {
  const deps = gameDeps();
  return {
    houses: deps.houses,
    escheats: deps.escheats,
    vassalages: deps.vassalages,
    loans: deps.loans,
    dialogs: deps.dialogs,
    negotiations: deps.negotiations,
    settlements: deps.settlements,
    villages: deps.villages,
    locks: deps.locks,
  };
}

/** Převod věnovaného dílu po přijetí jednání `village-gift` (závislost `acceptNegotiation`). */
export function escheatGift(): NonNullable<NegotiateDeps['escheatGift']> {
  return (input) => giveEscheatPart(escheatDeps(), input);
}

/** Nerozhodnuté odúmrti hráče (počítá se na vyžádání – dialog). */
export async function escheatDialogsForPlayer(
  playerId: string,
): Promise<{ escheats: EscheatView[] } | { error: string }> {
  const deps = gameDeps();
  return { escheats: await escheatDialogs({ ...deps, villages: deps.villages }, { playerId }) };
}

/** Pán navrhne dělení (s jediným pánem platí hned). */
export async function proposeEscheatForPlayer(
  playerId: string,
  input: { escheatId: string; parts: EscheatPart[] },
): Promise<{ ok: true; decided: boolean } | { error: string }> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const result = await proposeEscheat(escheatDeps(), {
    playerId,
    ...input,
    now: new Date(),
    today: today.day,
  });
  return result.ok ? { ok: true, decided: result.decided } : { error: result.reason };
}

/** Pán souhlasí s návrhem ve verzi, kterou viděl. */
export async function consentEscheatForPlayer(
  playerId: string,
  input: { escheatId: string; version: number },
): Promise<{ ok: true; decided: boolean } | { error: string }> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const result = await consentEscheat(escheatDeps(), {
    playerId,
    ...input,
    now: new Date(),
    today: today.day,
  });
  return result.ok ? { ok: true, decided: result.decided } : { error: result.reason };
}
