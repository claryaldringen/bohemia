import type { SettlementRepository } from './settlements';
import type { VillageRepository } from './villages';

// Dotazování na ves (klient se ptá na začátku každého herního dne): pohled na ves je čistá
// funkce vybrané vsi, dne a stavu všech vsí hráče (přepínač vsí, konec hry) – a stav vsi se
// mění jen s verzí (jméno mimo ni). Shodný otisk = stejný pohled, server ho pak neposílá znovu
// a hlavně nenačítá stavy vsí (u velké vsi přes 1 MB JSON).

/**
 * Otisk pohledu na ves `villageId` v den `day` ze vsí hráče (id, jméno a verze – pořadí vsí
 * nehraje roli). 16 šestnáctkových číslic (dvě 32bitové FNV-1a).
 */
export function villageViewStamp(
  villageId: string,
  day: number,
  villages: readonly { id: string; name: string; version: number }[],
): string {
  const list = [...villages]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((v) => [v.id, v.version, v.name]);
  const text = JSON.stringify([villageId, day, list]);
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 15);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

export interface CurrentViewStampInput {
  playerId: string;
  /** Ves, na kterou se hráč dívá. */
  villageId: string;
  /** Dnešní herní den hráče. */
  today: number;
}

/**
 * Otisk pohledu na ves, jaký by teď vrátil dotaz – bez načtení stavů vsí. Jen když jsou všechny
 * vsi hráče dopočítané do dneška (jinak by je dotaz dopočítal a uložil – otisk se změní)
 * a vybraná ves mezi nimi je; jinak null (dotaz musí proběhnout celý).
 */
export async function currentVillageViewStamp(
  deps: { settlements: SettlementRepository; villages: VillageRepository },
  input: CurrentViewStampInput,
): Promise<string | null> {
  const settlements = await deps.settlements.listActive(input.playerId);
  const stamps = await deps.villages.stampsOf(settlements.map((s) => s.id));
  if (!stamps.some((v) => v.id === input.villageId)) return null;
  if (stamps.some((v) => !v.asleep && v.lastDay < input.today)) return null;
  return villageViewStamp(input.villageId, input.today, stamps);
}
