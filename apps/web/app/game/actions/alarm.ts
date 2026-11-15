'use server';

import { alarmViewForPlayer, commandAlarmForPlayer, returnFromRefugeForPlayer } from '@/lib/alarm';
import { parseAlarmCommand, parseAlarmVillage } from '@/lib/alarm-input';
import { type AlarmView } from '@/lib/alarm-view';
import { NOT_SIGNED_IN, INVALID_INPUT, playerId } from './_shared';

/**
 * Pohled na varování vsi `{ villageId }` (war.md – Varování, poslové a útěk do hradiště): volby
 * při varování s důvody a odhady, posel, skupina uprchlíků, Vrátit se; null = ves hráč nevidí.
 * Dotazy `useAlarm` jdou na události serveru (server-events.md).
 */
export async function getAlarmView(input: unknown): Promise<AlarmView | null | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseAlarmVillage(input);
  if (parsed === null) return { error: INVALID_INPUT };
  // ves a hradiště se čtou víckrát (práva, volby) a dotaz přijde při každé změně vsi – paměť vsí
  // přes dotazy drží `alarmViewForPlayer` (lib/alarm.ts)
  return alarmViewForPlayer(id, parsed.villageId);
}

/**
 * Příkaz obránce varované vsi `{ villageId, command }` – `{ kind: 'messenger', personId? }`,
 * `{ kind: 'flee', mode: 'forest' | 'people' | 'all' }`, `{ kind: 'domain', to: [vsi] }`: jen
 * držitel vsi (právo `war`); záměr do tažení na takt teď + 2, jinak důvod česky.
 */
export async function commandAlarm(input: unknown): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseAlarmCommand(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return commandAlarmForPlayer(id, parsed.villageId, parsed.command);
}

/**
 * Vrátit se `{ villageId }` – uprchlíci vsi domů (war.md – Varování: „domů se vrátí, až vojsko
 * odtáhne z jejich mapy – rozhodne hráč“): jen držitel vsi; den příchodu, nebo důvod česky.
 */
export async function returnFromRefuge(
  input: unknown,
): Promise<{ ok: true; arrivesDay: number } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseAlarmVillage(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return returnFromRefugeForPlayer(id, parsed.villageId);
}
