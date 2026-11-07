import { mustAdvanceNow } from './dynasty-for-village';
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
 * Otisk pohledu na ves, jaký by teď vrátil dotaz – bez načtení stavů vsí. Jen když by pohled nic
 * nepočítal (`dynastyForVillage`): vybraná ves je mezi vsemi hráče a je dopočítaná do dneška
 * a žádná jiná ves není víc než `WORKER_LAG_DAYS` pozadu (jinak by je dotaz dopočítal a uložil –
 * otisk se změní); spící vsi se nepočítají. Jinak null (dotaz musí proběhnout celý). Posun
 * ostatních vsí workerem otisk změní (nová verze) – pohled se pošle znovu, zhruba jednou za herní
 * den. Konec rodu ze smíšených dnů (pohled by ho ověřil plným dopočtem) otisk nepozná – uzavře ho
 * worker po dopočtu vsí hráče (nové verze), bez workeru pohled, až jiná ves přejde mez.
 */
export async function currentVillageViewStamp(
  deps: { settlements: SettlementRepository; villages: VillageRepository },
  input: CurrentViewStampInput,
): Promise<string | null> {
  const settlements = await deps.settlements.listActive(input.playerId);
  const stamps = await deps.villages.stampsOf(settlements.map((s) => s.id));
  const shown = stamps.find((v) => v.id === input.villageId);
  if (!shown || (!shown.asleep && shown.lastDay < input.today)) return null;
  if (
    stamps.some(
      (v) => !v.asleep && v.lastDay < input.today && mustAdvanceNow(v, shown, input.today),
    )
  ) {
    return null;
  }
  return villageViewStamp(input.villageId, input.today, stamps);
}

export interface StewardViewStampInput {
  /** Správce, který se dívá. */
  actorId: string;
  /** Držitel vsi (vlastník sídla). */
  holderId: string;
  /** Spravovaná ves, na kterou se správce dívá. */
  villageId: string;
  /** Dnešní herní den držitele (podle něj jde zobrazená ves) a správce (jeho přepínač vsí). */
  holderToday: number;
  actorToday: number;
  /** Všechny cizí vsi, které správce spravuje (včetně zobrazené) – řádky jeho přepínače. */
  stewardedVillageIds: readonly string[];
}

/**
 * Otisk pohledu správce na spravovanou cizí ves, jaký by teď vrátil dotaz – bez načtení stavů vsí
 * (stejně jako `currentVillageViewStamp` u držitele). Skládá se jen z toho, co správce v pohledu
 * vidí: zobrazená ves (verze, jméno, den držitele), jeho vlastní vsi a vsi, které spravuje
 * (přepínač), a jeho den. Ostatní vsi držitele, konec jeho rodu ani jeho mapy do otisku nejdou.
 * Null, když by dotaz musel něco dopočítat (zobrazená ves nebo vlastní ves správce pozadu) nebo
 * některá spravovaná ves nemá souhrn – pak se pošle celý pohled.
 */
export async function currentStewardViewStamp(
  deps: { settlements: SettlementRepository; villages: VillageRepository },
  input: StewardViewStampInput,
): Promise<string | null> {
  const holderMaps = await deps.settlements.listActive(input.holderId);
  const held = await deps.villages.stampsOf(holderMaps.map((s) => s.id));
  const shown = held.find((v) => v.id === input.villageId);
  if (!shown || (!shown.asleep && shown.lastDay < input.holderToday)) return null;
  const ownMaps = await deps.settlements.listActive(input.actorId);
  const own = await deps.villages.stampsOf(ownMaps.map((s) => s.id));
  if (own.some((v) => !v.asleep && mustAdvanceNow(v, undefined, input.actorToday))) return null;
  const stewardedIds = [...new Set(input.stewardedVillageIds)];
  const digests = stewardedIds.length > 0 ? await deps.villages.digestsOf(stewardedIds) : [];
  if (digests.length < stewardedIds.length) return null;
  const rows = new Map<string, { id: string; name: string; version: number }>();
  for (const v of [...digests, ...own, shown]) {
    rows.set(v.id, { id: v.id, name: v.name, version: v.version });
  }
  // den správce a on sám patří do otisku jako zvláštní řádek
  rows.set('~actor', { id: '~actor', name: `${input.actorId}:${input.actorToday}`, version: 0 });
  return villageViewStamp(input.villageId, input.holderToday, [...rows.values()]);
}
