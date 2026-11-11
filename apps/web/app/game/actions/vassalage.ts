'use server';

import { answerLevyForPlayer, levyDialogsForPlayer } from '@/lib/levies';
import {
  answerPassageForPlayer,
  answerSummonsForPlayer,
  passagesForPlayer,
  summonsDialogsForPlayer,
  summonVassalsForPlayer,
  type PassageView,
  type SummonsDialogView,
} from '@/lib/summons';
import {
  announceWarPassageForPlayer,
  protectionViewForPlayer,
  recallProtectionForPlayer,
  requestProtectionForPlayer,
  sendProtectionForPlayer,
  type ProtectionView,
} from '@/lib/protection';
import {
  consentEscheatForPlayer,
  escheatDialogsForPlayer,
  proposeEscheatForPlayer,
} from '@/lib/escheats';
import { parseConsentEscheatInput, parseProposeEscheatInput } from '@/lib/escheat-input';
import { type EscheatView, type LevyDialogView } from '@bohemia/game';
import { parseAnswerLevyInput } from '@/lib/house-input';
import { NOT_SIGNED_IN, INVALID_INPUT, isId, isRecord, isText, playerId } from './_shared';

/** Otevřené dialogy Odvody hráče s předvyplněným rozdělením po vsích (počítá se na vyžádání). */
export async function levyDialogs(): Promise<
  { dialogs: LevyDialogView[]; summons: SummonsDialogView[] } | { error: string }
> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const levy = await levyDialogsForPlayer(id);
  if ('error' in levy) return levy;
  return { ...levy, summons: await summonsDialogsForPlayer(id) };
}

/** Svolání vazalů: `{ warId, vassalageIds: string[], targetVillageId }` (vassalage.md – Svolání). */
export async function summonVassals(
  input: unknown,
): Promise<{ ok: true; opened: number; skipped: string[] } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !isId(input.warId) || !isId(input.targetVillageId)) {
    return { error: INVALID_INPUT };
  }
  const ids = input.vassalageIds;
  if (!Array.isArray(ids) || ids.length > 50 || !ids.every(isId)) return { error: INVALID_INPUT };
  return summonVassalsForPlayer(id, {
    warId: input.warId,
    vassalageIds: ids,
    targetVillageId: input.targetVillageId,
  });
}

/** Odpověď na Svolání: `{ dialogId, men: [{ villageId, personId }], message? }`. */
export async function answerSummons(
  input: unknown,
): Promise<{ ok: true; sent: number; arrivesDay: number | null } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !isId(input.dialogId) || !Array.isArray(input.men)) {
    return { error: INVALID_INPUT };
  }
  const men = input.men.filter(
    (m): m is { villageId: string; personId: number } =>
      isRecord(m) && isId(m.villageId) && Number.isInteger(m.personId),
  );
  if (men.length !== input.men.length || men.length > 100) return { error: INVALID_INPUT };
  const message = input.message === undefined || input.message === null ? null : input.message;
  if (message !== null && !isText(message)) return { error: INVALID_INPUT };
  return answerSummonsForPlayer(id, {
    dialogId: input.dialogId,
    men: men.map((m) => ({ villageId: m.villageId, personId: m.personId })),
    message,
  });
}

/** Ohlášení průchodu, na která hráč může odpovědět (panel války). */
export async function passagesToAnswer(): Promise<{ passages: PassageView[] } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  return { passages: await passagesForPlayer(id) };
}

/** Odpověď na ohlášení průchodu: `{ passageId, trust, message? }` (trust false = „Nevěřit“). */
export async function answerPassage(input: unknown): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !isId(input.passageId) || typeof input.trust !== 'boolean') {
    return { error: INVALID_INPUT };
  }
  const message = input.message === undefined ? '' : input.message;
  if (!isText(message)) return { error: INVALID_INPUT };
  return answerPassageForPlayer(id, { passageId: input.passageId, trust: input.trust, message });
}

/**
 * Odpoví na dialog Odvody: `{ dialogId, lines: [{ good, amount }], split: { <villageId>: svazek },
 * message? }`; pošle zásilky z vsí rodu a upozorní pána.
 */
export async function answerLevy(
  input: unknown,
): Promise<{ ok: true; arrivesDay: number | null } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseAnswerLevyInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return answerLevyForPlayer(id, parsed);
}

/** Nerozhodnuté odúmrti hráče (dialog Odúmrť – počítá se na vyžádání). */
export async function escheatDialogs(): Promise<{ escheats: EscheatView[] } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  return escheatDialogsForPlayer(id);
}

/** Návrh dělení odúmrti: `{ escheatId, parts: [{ toHouseId, villageIds, vassalIds }] }`. */
export async function proposeEscheat(
  input: unknown,
): Promise<{ ok: true; decided: boolean } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseProposeEscheatInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return proposeEscheatForPlayer(id, parsed);
}

/** Souhlas s návrhem dělení odúmrti: `{ escheatId, version }`. */
export async function consentEscheat(
  input: unknown,
): Promise<{ ok: true; decided: boolean } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseConsentEscheatInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return consentEscheatForPlayer(id, parsed);
}

/** Ochrana v panelu války pro zobrazenou ves `{ villageId }` (vassalage.md – Ochrana vojskem). */
export async function protectionView(
  input: unknown,
): Promise<{ protection: ProtectionView } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !(input.villageId === null || isId(input.villageId))) {
    return { error: INVALID_INPUT };
  }
  return { protection: await protectionViewForPlayer(id, input.villageId) };
}

/** Vazal žádá pána o ochranu vsi: `{ vassalageId, villageId, message? }`. */
export async function requestProtection(input: unknown): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !isId(input.vassalageId) || !isId(input.villageId)) {
    return { error: INVALID_INPUT };
  }
  const message = input.message ?? '';
  if (!isText(message)) return { error: INVALID_INPUT };
  return requestProtectionForPlayer(id, {
    vassalageId: input.vassalageId,
    villageId: input.villageId,
    message,
  });
}

/** Pán pošle muže rodu na ochranu vsi vazala: `{ vassalageId, villageId, men }` (počet). */
export async function sendProtection(
  input: unknown,
): Promise<{ ok: true; sent: number } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !isId(input.vassalageId) || !isId(input.villageId)) {
    return { error: INVALID_INPUT };
  }
  const men = input.men;
  if (typeof men !== 'number' || !Number.isInteger(men) || men < 1 || men > 100) {
    return { error: INVALID_INPUT };
  }
  return sendProtectionForPlayer(id, {
    vassalageId: input.vassalageId,
    villageId: input.villageId,
    men,
  });
}

/** Pán odvolá své muže z ochrany vsi vazala: `{ vassalageId, villageId }`. */
export async function recallProtection(
  input: unknown,
): Promise<{ ok: true; men: number } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !isId(input.vassalageId) || !isId(input.villageId)) {
    return { error: INVALID_INPUT };
  }
  return recallProtectionForPlayer(id, {
    vassalageId: input.vassalageId,
    villageId: input.villageId,
  });
}

/** Ohlášení průchodu z panelu války: `{ warId, house, message? }` – mapy dopočte server. */
export async function announceWarPassage(
  input: unknown,
): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !isId(input.warId) || !isId(input.house)) {
    return { error: INVALID_INPUT };
  }
  const message = input.message ?? '';
  if (!isText(message)) return { error: INVALID_INPUT };
  return announceWarPassageForPlayer(id, { warId: input.warId, house: input.house, message });
}
