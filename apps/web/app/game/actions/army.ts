'use server';

import { withVillageCache } from '@bohemia/server';
import { orderBreakoutForPlayer } from '@/lib/war-scene';
import { type CampaignCommand } from '@bohemia/game';
import { armyPanelForPlayer, launchCampaignForPlayer, planCampaignForPlayer } from '@/lib/army';
import { type ArmyPanelData, type CampaignEstimate } from '@/lib/army-view';
import { parseArmyPanelInput, parseCampaignPlanInput } from '@/lib/army-input';
import { campaignsOfPlayer, commandCampaignForPlayer } from '@/lib/campaign';
import { type CampaignSummary } from '@/lib/campaign-view';
import {
  parseGroupOrderInput,
  parseLeaderInput,
  parseSurrenderedInput,
} from '@/lib/campaign-input';
import { NOT_SIGNED_IN, INVALID_INPUT, isId, isRecord, playerId } from './_shared';

/**
 * Panel Vojsko (war.md): `{ villageId, targetVillageId }` – vsi rodu s muži, cíle ve válce a
 * (s vybraným cílem) dobrovolníci po vsích. Jen s právem `war` ve vsi `villageId`.
 */
export async function getArmyPanel(input: unknown): Promise<ArmyPanelData | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseArmyPanelInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return withVillageCache(() => armyPanelForPlayer(id, parsed));
}

/** Odhad tažení `{ plan }` (síla, cesta, zásoby), nebo důvod odmítnutí; nic nemění. */
export async function planArmyCampaign(
  input: unknown,
): Promise<CampaignEstimate | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseCampaignPlanInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return withVillageCache(() => planCampaignForPlayer(id, parsed.plan));
}

/** Vyšle tažení `{ plan }`: muži odejdou, jídlo se odečte a tažení vyrazí ze shromaždiště. */
export async function launchArmyCampaign(
  input: unknown,
): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseCampaignPlanInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return withVillageCache(() => launchCampaignForPlayer(id, parsed.plan));
}

/** Běžící tažení, která hráč vede (panel Vojsko – pohled na tažení). */
export async function getMyCampaigns(): Promise<CampaignSummary[] | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  return campaignsOfPlayer(id);
}

/** Odmítnutý pokyn do tažení – jedna odpověď pro každý důvod (nic se neprozradí). */
const COMMAND_REFUSED = 'Rozkaz nelze dát.';
/** Místo, kam vojsko z mapy, na které stojí, nedojde (war.md – Pohyb – Cíl v neprůchodné buňce). */
const COMMAND_UNREACHABLE = 'Tam vojsko nedojde.';

/** Pokyn do tažení přijat – `tick` = takt záměru (mapa tažení do něj ukazuje cíl z kliku). */
type CampaignCommandReply = { ok: true; tick: number } | { error: string };

async function campaignCommand(
  input: unknown,
  parse: (value: unknown) => { campaignId: string; command: CampaignCommand } | null,
): Promise<CampaignCommandReply> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parse(input);
  if (parsed === null) return { error: INVALID_INPUT };
  const result = await commandCampaignForPlayer(id, parsed.campaignId, parsed.command);
  if (result.queued) return { ok: true, tick: result.tick };
  return { error: result.reason === 'unreachable' ? COMMAND_UNREACHABLE : COMMAND_REFUSED };
}

/**
 * Živé vedení (war.md – Velení): `{ campaignId, target }` – velitel jde na místo, k objevené
 * stavbě, napadne muže v dohledu, nebo obrátí domů. Záměr na takt teď + 2; jen vlastní živý
 * nezajatý velitel a cíl, který hráč zná.
 */
export async function commandLeader(input: unknown): Promise<CampaignCommandReply> {
  return campaignCommand(input, parseLeaderInput);
}

/** Rozkaz skupině `{ campaignId, group, order, at? }` (war.md – Boj – Změna rozkazu). */
export async function setGroupOrder(input: unknown): Promise<CampaignCommandReply> {
  return campaignCommand(input, parseGroupOrderInput);
}

/** Volba ke vzdaným `{ campaignId, group, choice }` – pobít / odvést / nechat (war.md – Velení). */
export async function chooseSurrendered(input: unknown): Promise<CampaignCommandReply> {
  return campaignCommand(input, parseSurrenderedInput);
}

/**
 * Rozkaz „Probít se“ obráncům napadené vsi `{ villageId }` (fortifications.md – Obrana bez násobku
 * 3, Bod zlomu a probíjení): jen držitel vsi (právo `war`) při boji u ní; jinak důvod česky.
 */
export async function orderBreakout(input: unknown): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !isId(input.villageId)) return { error: INVALID_INPUT };
  return orderBreakoutForPlayer(id, input.villageId);
}
