'use server';

import {
  answerNegotiationForPlayer,
  blockHouseForPlayer,
  unblockHouseForPlayer,
  housePanelForPlayer,
  houseSpareForPlayer,
  renounceVassalageForPlayer,
  dismissStewardForPlayer,
  issueInviteForPlayer,
  openNegotiationForPlayer,
  declareWarForPlayer,
  newcomerStatusForPlayer,
  requestLordsForPlayer,
  startFreeForPlayer,
  fileComplaintForPlayer,
  answerComplaintForPlayer,
  judgeDisputeForPlayer,
  revokeInviteForPlayer,
  type NegotiationActionResult,
} from '@/lib/house';
import { type NewcomerStatusView } from '@/lib/newcomer-view';
import { decidePrisonerForPlayer } from '@/lib/prisoners';
import { type HouseView } from '@/lib/house-view';
import { type MacroSpare } from '@bohemia/game';
import {
  parseBlockInput,
  parsePrisonerInput,
  parseComplaintInput,
  parseStatementInput,
  parseJudgeInput,
  parseDeclareWarInput,
  parseNegotiationAnswerInput,
  parseOpenNegotiationInput,
  parseRenounceInput,
  parseDismissStewardInput,
  parseRevokeInviteInput,
  parseSpareInput,
} from '@/lib/house-input';
import { NOT_SIGNED_IN, INVALID_INPUT, playerId } from './_shared';

/**
 * Panel „Rod a vazalové“ (vassalage.md – Co hráč vidí): vlastní rod, páni, vazalové, nejbližší
 * hráči a pozvánky. Bez vstupu; hráč jen ze session, o cizích rodech jen veřejné údaje.
 */
export async function housePanel(): Promise<HouseView | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  return housePanelForPlayer(id);
}

/** Vydá novou pozvánku (nejvýš tři nevyužité): `{ code }` bez pomlčky, nebo důvod česky. */
export async function issueInvite(): Promise<{ code: string } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  return issueInviteForPlayer(id);
}

/** Zruší vlastní nevyužitý kód: `{ code }`. */
export async function revokeInvite(input: unknown): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseRevokeInviteInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return revokeInviteForPlayer(id, parsed.code);
}

/** Nabídne vazalství / požádá o přijetí: `{ to, items, message }` (id rodu, podmínky, vzkaz). */
export async function openNegotiation(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseOpenNegotiationInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return openNegotiationForPlayer(id, parsed);
}

/** Opoví válku rodu: `{ target, items, message }` (id rodu, požadavek jako podmínky míru, vzkaz). */
export async function declareWarOnHouse(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseDeclareWarInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return declareWarForPlayer(id, parsed);
}

/** Stav nováčka: odříznutý (nabídka pánů, žádosti, konec týdne), nebo umístěný (newcomers.md). */
export async function newcomerStatusAction(): Promise<NewcomerStatusView | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  return newcomerStatusForPlayer(id);
}

/** Odříznutý nováček začne svobodný – umístí se na mapu světa (newcomers.md). */
export async function startFreeAction(): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  return startFreeForPlayer(id);
}

/** Nováček žádá rody z nabídky o přijetí za vazala: pole id rodů (1–5). */
export async function requestLordsAction(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!Array.isArray(input) || !input.every((h): h is string => typeof h === 'string')) {
    return { error: INVALID_INPUT };
  }
  return requestLordsForPlayer(id, input);
}

/** Žaloba na spoluvazala před společným pánem: `{ against, message }`. */
export async function fileComplaintAction(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseComplaintInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return fileComplaintForPlayer(id, parsed);
}

/** Vyjádření obžalovaného: `{ disputeId, statement }`. */
export async function answerComplaintAction(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseStatementInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return answerComplaintForPlayer(id, parsed);
}

/** Rozsudek pána: `{ disputeId, verdict }`. */
export async function judgeDisputeAction(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseJudgeInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return judgeDisputeForPlayer(id, parsed);
}

/** Odpoví na jednání: `{ negotiationId, answer: accept | reject | withdraw | counter, ... }`. */
export async function answerNegotiation(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseNegotiationAnswerInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return answerNegotiationForPlayer(id, parsed);
}

/** Zablokuje rod: `{ target }`. */
export async function blockHouse(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseBlockInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return blockHouseForPlayer(id, parsed.target);
}

/** Věznitel rozhodne o zajatci: `{ prisonerId, action: 'hold' | 'release' | 'execute' }`. */
export async function decidePrisonerAction(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parsePrisonerInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  const result = await decidePrisonerForPlayer(id, parsed);
  return result.ok ? { ok: true } : { error: result.reason };
}

/** Zruší zablokování rodu: `{ target }`. */
export async function unblockHouse(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseBlockInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return unblockHouseForPlayer(id, parsed.target);
}

/**
 * Výhled „kolik můžu postrádat“ pro formulář podmínek: `{ toHouseId, targetVillageId? }` →
 * `{ spare }` (makrokomodity, lidé a robota). Počítá se jen na vyžádání.
 */
export async function houseSpare(
  input: unknown,
): Promise<{ spare: MacroSpare } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseSpareInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return houseSpareForPlayer(id, parsed);
}

/** Vypoví dohodu: `{ vassalageId, message? }`; platí hned, upozorní celý strom. */
export async function renounceVassalage(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseRenounceInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return renounceVassalageForPlayer(id, parsed);
}

/** Odvolá správce vsi: `{ villageId }`; smí jen držitel vsi, platí hned. */
export async function dismissSteward(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseDismissStewardInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return dismissStewardForPlayer(id, parsed.villageId);
}
