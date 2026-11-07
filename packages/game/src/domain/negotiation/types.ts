import type { AidLine } from '../vassalage/loan';
import type { MacroBundle } from '../vassalage/macro';
import type { TermLine, VassalTerms } from '../vassalage/terms';

/**
 * Řádek podmínek: přísaha (povinná u nové dohody; u změny podmínek existující dohody chybí)
 * a volitelné řádky – dávka, služba, cílová ves a odměna (`TermLine`, vassalage.md – Podmínky
 * dohody) nebo řádek jednání o pomoci (`AidLine` – žádost, dar, půjčka; vassalage.md – Pomoc na
 * žádost). Strany jsou **rody** (`house.id`), ne hráči (technické rozhodnutí 2 plánu).
 */
export type TermItem =
  | { kind: 'oath'; lord: string; vassal: string }
  | TermLine
  | AidLine
  | TradeLine
  | StewardshipLine
  | VillageGiftLine
  | WarDemandLine
  | PeaceLine
  | RansomLine;

/**
 * Obchod mezi hráči (vassalage.md – Hospodářství mezi hráči): autor kola `give` pošle, `get`
 * dostane. Jen makrokomodity (zboží, ne lidé a robota), obě strany neprázdné. `fromVillage` =
 * rod (`house.id`) → jeho ves, ze které zboží pošle; rod bez záznamu pošle z vsi hlavy rodu.
 * Obchod je samostatné jednání mezi dvěma rody, nevyžaduje vazalství.
 */
export interface TradeLine {
  kind: 'trade';
  give: MacroBundle;
  get: MacroBundle;
  fromVillage: Record<string, string>;
}

/**
 * Správa cizí vsi (vassalage.md – Hráč jako správce cizí vsi): pán (držitel) nabídne svému vazalovi
 * (i novému – spolu s přísahou) běžné řízení vsi `villageId`. Může být spolu s řádky podmínek
 * (odměna); přijetí = vznik správy.
 */
export interface StewardshipLine {
  kind: 'stewardship';
  villageId: string;
}

/**
 * Věnování dílu odúmrti (vassalage.md – Vymření rodu – odúmrť): pán nabídne svému vazalovi celé vsi
 * `villageIds` a vazaly `vassalIds` z odúmrti `escheatId`. Přijetí = obdarovaný se stane držitelem
 * vsí a pánem vazalů; odmítnutí – díl zůstane pánovi.
 */
export interface VillageGiftLine {
  kind: 'village-gift';
  escheatId: string;
  villageIds: string[];
  vassalIds: string[];
}

/**
 * Požadavek při opovědi války (war.md – Začátek války): `items` jsou podmínky míru (přísaha
 * a řádky dávky, služby, odměny). Přijetí = válka končí mírem s těmi podmínkami; prázdný požadavek
 * je holá opověď se vzkazem (přijetí = mír bez podmínek). Je jediným řádkem kola.
 */
export interface WarDemandLine {
  kind: 'war-demand';
  items: TermItem[];
}

/**
 * Podmínky míru (war.md – Konec války – mírové jednání): mírové jednání mezi stranami aktivní
 * války, jediný řádek kola; všechny podmínky jsou volitelné (mír smí být bez podmínek). `fee` =
 * jednorázový poplatek, který pošle `payer` (dialog `fee-send`); `vassalage` = vazalství z míru
 * (`lord` / `vassal` jsou strany jednání) s podmínkami; `tribute` = opakovaná platba bez vazalství
 * (chodí v Odvodech 1. 11.); `cede` = vsi, které strana s jejich vlastnictvím postupuje druhé
 * (ves přejde celá); `releasePrisoners` = klíče zajetí k propuštění po přijetí míru.
 */
export interface PeaceLine {
  kind: 'peace';
  fee?: MacroBundle;
  payer?: string;
  vassalage?: { lord: string; vassal: string; terms: VassalTerms };
  tribute?: { goods: MacroBundle; payer: string };
  cede?: string[];
  releasePrisoners?: string[];
}

/**
 * Výkupné zajatců (war.md – Vzdaní, zajetí a výkupné): věznitel nabídne rodu zajatců propuštění
 * `prisonerIds` (klíče zajetí) za `price` (a případně vazalství `vassalage` – strany jsou strany
 * jednání), stejným jednáním jako u vazalství; přijetí = zaplacení zboží a propuštění. Samostatné
 * jednání (jako obchod) – vazalství mezi rody nevyžaduje. Je jediným řádkem kola.
 */
export interface RansomLine {
  kind: 'ransom';
  prisonerIds: string[];
  price: MacroBundle;
  vassalage?: { lord: string; vassal: string; terms: VassalTerms };
}

/** Jedno kolo jednání: podmínky jedné strany a volitelný vzkaz. */
export interface NegotiationRound {
  authorHouseId: string;
  items: TermItem[];
  message: string | null;
  at: Date;
}

export type NegotiationStatus = 'open' | 'accepted' | 'rejected' | 'withdrawn';

/** Jednání mezi dvěma rody; strany se střídají, kol je neomezeně. */
export interface Negotiation {
  id: string;
  /** Rod, který jednání zahájil. */
  initiatorHouseId: string;
  /** Rod, kterému byl poslán první návrh. */
  recipientHouseId: string;
  status: NegotiationStatus;
  rounds: NegotiationRound[];
  resolvedAt: Date | null;
}

export type NegotiationResult =
  { ok: true; negotiation: Negotiation } | { ok: false; reason: string };
