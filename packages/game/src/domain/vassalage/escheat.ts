import { cloneState } from '../village/clone';
import { isLineMan } from '../village/dynasty';
import { setStewardOn } from '../village/steward-state';
import type { VillageState } from '../village/types';

// Odúmrť (vassalage.md – Vymření rodu – odúmrť): celé vsi vymřelého rodu a jeho vazalové připadnou
// pánovi (víc pánů – spravují ji všichni, dělení platí po souhlasu všech). Díl = celé vsi a vazalové,
// ves se nedělí; vsi jedné mapy jdou spolu (Martin: „Ideální dělení pak bude po celých panstvích“ –
// držitel je u mapy, návrh Clauda). Čisté kontroly a převod stavu vsi; zápisy dělá use-case.

export const ESCHEAT_REASONS = {
  notLord: 'O odúmrti rozhoduje jen pán vymřelého rodu.',
  decided: 'O odúmrti už je rozhodnuto.',
  changed: 'Návrh dělení se mezitím změnil.',
  noPlan: 'Není co potvrdit – nejdřív navrhni dělení.',
  emptyPart: 'Díl odúmrti nesmí být prázdný.',
  unknownItem: 'Díl obsahuje ves nebo vazala, který do odúmrti nepatří.',
  missingItem: 'Každá ves a každý vazal odúmrti musí připadnout někomu.',
  twice: 'Ves nebo vazal je ve dvou dílech.',
  badRecipient: 'Díl smí dostat pán vymřelého rodu nebo jeho vazal.',
  oneVillage: 'Odúmrť s jedinou vsí se nedělí.',
  sameMap: 'Vsi jedné mapy připadnou témuž.',
} as const;

/** Díl odúmrti: komu připadne (`toHouseId` – pán, nebo jeho vazal jako věnování) a co. */
export interface EscheatPart {
  toHouseId: string;
  villageIds: string[];
  vassalIds: string[];
}

/** Rozsah odúmrti pro kontrolu dělení. */
export interface EscheatScope {
  lordHouseIds: readonly string[];
  villageIds: readonly string[];
  vassalIds: readonly string[];
  /** Ves → mapa (sídlo), na které stojí; vsi jedné mapy jdou do jednoho dílu. */
  mapOf: Readonly<Record<string, string>>;
  /** Vazal pána → pán, který mu věnuje (obdarovat smí jen pán svého vazala). */
  giftFrom: Readonly<Record<string, string>>;
}

/** Je díl věnováním (dostane ho vazal pána, ne pán sám)? */
export function isGiftPart(scope: Pick<EscheatScope, 'lordHouseIds'>, part: EscheatPart): boolean {
  return !scope.lordHouseIds.includes(part.toHouseId);
}

/** Pán, kterému díl připadne: příjemce sám, u věnování pán obdarovaného. */
export function partLord(
  scope: Pick<EscheatScope, 'lordHouseIds' | 'giftFrom'>,
  part: EscheatPart,
): string | null {
  if (scope.lordHouseIds.includes(part.toHouseId)) return part.toHouseId;
  return scope.giftFrom[part.toHouseId] ?? null;
}

/**
 * Kontrola návrhu dělení: každá ves a každý vazal odúmrti právě v jednom neprázdném dílu, příjemce
 * je pán, nebo vazal pána (věnování), vsi jedné mapy spolu; odúmrť s nejvýš jednou vsí jen vcelku.
 */
export function checkEscheatPlan(
  scope: EscheatScope,
  parts: readonly EscheatPart[],
): string | null {
  const known = new Set([...scope.villageIds, ...scope.vassalIds]);
  const seen = new Set<string>();
  const mapRecipient = new Map<string, string>();
  for (const part of parts) {
    if (part.villageIds.length + part.vassalIds.length === 0) return ESCHEAT_REASONS.emptyPart;
    if (partLord(scope, part) === null) return ESCHEAT_REASONS.badRecipient;
    for (const id of [...part.villageIds, ...part.vassalIds]) {
      if (!known.has(id)) return ESCHEAT_REASONS.unknownItem;
      if (seen.has(id)) return ESCHEAT_REASONS.twice;
      seen.add(id);
    }
    if (part.villageIds.some((id) => !scope.villageIds.includes(id))) {
      return ESCHEAT_REASONS.unknownItem;
    }
    if (part.vassalIds.some((id) => !scope.vassalIds.includes(id))) {
      return ESCHEAT_REASONS.unknownItem;
    }
    for (const id of part.villageIds) {
      const map = scope.mapOf[id] ?? id;
      const other = mapRecipient.get(map);
      if (other !== undefined && other !== part.toHouseId) return ESCHEAT_REASONS.sameMap;
      mapRecipient.set(map, part.toHouseId);
    }
  }
  if (seen.size !== known.size) return ESCHEAT_REASONS.missingItem;
  if (scope.villageIds.length <= 1 && parts.length > 1) return ESCHEAT_REASONS.oneVillage;
  return null;
}

/**
 * Ves vymřelého rodu připadla odúmrtí (vrací nový stav): ženy a dcery rodu zůstanou jako vesničanky
 * (bez `line`), ves řídí správce (NPC jménem pána – do rozhodnutí i potom, dokud ho držitel
 * nevypne). Vojvodu ves nemá – čeká na muže rodu nového držitele (`withAwaitingLord` při dopočtu).
 * Ves, kterou řídí povýšený vesničan (`nobles`), si jeho rod ponechá. Idempotentní.
 */
export function escheatVillage(state: VillageState, day: number): VillageState {
  const next = cloneState(state);
  const nobleHouse = next.nobles?.houseId;
  for (const p of next.people) {
    if (p.line && (nobleHouse === undefined || p.noble?.houseId !== nobleHouse)) delete p.line;
  }
  if (next.dynasty && !next.nobles) next.dynasty.lordId = null;
  if (!next.steward?.on) setStewardOn(next, Math.max(day, next.lastDay), true);
  return next;
}

/** NPC rod, který ves řídí (`nobles`), ve vsi už nemá muže po meči – jeho id; jinak null. */
export function extinctNobleHouse(state: VillageState): string | null {
  const houseId = state.nobles?.houseId;
  if (houseId === undefined) return null;
  const men = state.people.some((p) => isLineMan(p) && p.noble?.houseId === houseId);
  return men ? null : houseId;
}

/**
 * Konec NPC rodu ve vsi (vrací nový stav): ves se vrací pod rod hráče (`nobles` zmizí), ženy
 * a dcery povýšeného zůstanou jako vesničanky (bez `noble` a `line`). Idempotentní.
 */
export function endNobleHouse(state: VillageState, houseId: string): VillageState {
  if (state.nobles?.houseId !== houseId) return state;
  const next = cloneState(state);
  for (const p of next.people) {
    if (p.noble?.houseId !== houseId) continue;
    delete p.noble;
    delete p.line;
  }
  delete next.nobles;
  return next;
}
