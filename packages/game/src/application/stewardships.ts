import { findPlayerVillage } from './player-villages';
import { villageAccess, type RightsDeps } from './rights';
import type { SettlementRepository } from './settlements';
import type { VillageRepository } from './villages';

// Správa cizí vsi (vassalage.md – Hráč jako správce cizí vsi): držitel (rod, kterému ves patří –
// `settlement.owner_id`) svěří běžné řízení vsi jinému rodu. Správa stojí na dohodě (vazalství)
// a držitel ji smí kdykoli odvolat. Ves dál dopočítává worker u držitele, akce správce běží pod
// zámkem držitele (technické rozhodnutí 1 a 5 plánu) – jeden zámek, nikdy vnořený.

/** Kdo ves spravuje: hráč (`player`), nebo NPC rod povýšeného vesničana (`npc`, úloha 4.9). */
export type StewardKind = 'player' | 'npc';

export interface Stewardship {
  id: string;
  villageId: string;
  stewardHouseId: string;
  holderHouseId: string;
  kind: StewardKind;
  /** Dohoda, na které správa stojí; null – dohoda zmizela (správa se ukončuje s ní). */
  vassalageId: string | null;
  since: Date;
}

export type NewStewardship = Pick<
  Stewardship,
  'villageId' | 'stewardHouseId' | 'holderHouseId' | 'kind' | 'vassalageId'
> & { since: Date };

/** Operace nad správami uvnitř transakce jednání (účinek přijetí). */
export interface StewardshipTx {
  /** Živá správa vsi, nebo null. */
  of(villageId: string): Promise<Stewardship | null>;
  /** Založí správu; ves už živou správu má → null (souběh, jedna správa na ves). */
  start(input: NewStewardship): Promise<Stewardship | null>;
}

/** Port repozitáře správ. */
export interface StewardshipRepository extends StewardshipTx {
  /** Živé správy rodu jako správce (vsi do přepínače). */
  listByStewardHouse(houseId: string): Promise<Stewardship[]>;
  /** Živé správy vsí rodu jako držitele. */
  listByHolderHouse(houseId: string): Promise<Stewardship[]>;
  /** Ukončí živou správu vsi; true jen při změně. */
  end(villageId: string, reason: string, at?: Date): Promise<boolean>;
  /** Ukončí živé správy stojící na dohodě (její konec); vrací id vsí. */
  endByVassalage(vassalageId: string, reason: string, at?: Date): Promise<string[]>;
}

export const NOT_HOLDER = 'Tuhle ves nedržíš.';
export const NO_STEWARD = 'Ves nemá správce.';
export const STEWARD_TAKEN = 'Ves už správce má.';

/** Závislosti zjištění držitele a odvolání. */
export interface StewardshipDeps {
  settlements: Pick<SettlementRepository, 'find'>;
  villages: Pick<VillageRepository, 'find'>;
  stewardships: Pick<StewardshipRepository, 'of' | 'end'>;
}

/**
 * Hráč, kterému ves patří (`settlement.owner_id`) – jeho zámek platí pro všechny akce ve vsi,
 * i správcovy. Neexistující ves nebo archivované sídlo – chyba (volající ves už načetl).
 */
export async function holderOf(
  deps: Pick<StewardshipDeps, 'settlements' | 'villages'>,
  villageId: string,
): Promise<string> {
  const village = await deps.villages.find(villageId);
  const settlement = village ? await deps.settlements.find(village.settlementId) : null;
  if (!settlement) throw new Error('Ves nemá držitele.');
  return settlement.ownerId;
}

/**
 * Držitel odvolá správce své vsi (kdykoli). Dohoda (vazalství) trvá dál. Správce nic nedostane
 * vědět o stavu vsi – jeho další akce server odmítne jako u cizí vsi.
 */
export async function dismissSteward(
  deps: StewardshipDeps,
  input: { playerId: string; villageId: string; at?: Date },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const holder = await holderOf(deps, input.villageId).catch(() => null);
  if (holder !== input.playerId) return { ok: false, reason: NOT_HOLDER };
  const ended = await deps.stewardships.end(input.villageId, 'dismissed', input.at);
  return ended ? { ok: true } : { ok: false, reason: NO_STEWARD };
}

/**
 * Hráč, jehož zámek platí pro akci hráče `playerId` ve vsi `villageId`: u vlastní vsi on sám, u vsi,
 * kterou spravuje (živá správa jeho rodu), její držitel – správce tak jede pod zámkem držitele a vlastní
 * zámek navíc nebere (technické rozhodnutí 1 a 5 plánu: jeden zámek, nikdy vnořený). Bez práva
 * k vsi (cizí ves, odvolaný správce) zámek hráče samotného – akci pak odmítne kontrola práv.
 */
export async function lockOwnerOf(
  deps: RightsDeps,
  input: { playerId: string; villageId: string },
): Promise<string> {
  if (await findPlayerVillage(deps, input)) return input.playerId;
  const access = await villageAccess(deps, { ...input, today: 0 });
  return access?.found.settlement.ownerId ?? input.playerId;
}
