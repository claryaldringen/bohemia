// Pohled na jednání mezi rody (docs/design/vassalage.md – Co hráč vidí, „jednání“): z dat panelu
// složí řádky podmínek, popisky a tlačítka podle toho, kdo je na tahu. Čistý modul – smí do
// prohlížeče. Rozhodnutí (kdo je na tahu, kdo smí co) je v `packages/game`, tady se jen zobrazuje.
import type { PanelNegotiation, TermItem } from '@bohemia/game';
import type { HouseLinkView } from './house-view';
import { serviceLabel, tradeFlipped } from './terms-view';

/** Řádek podmínek jako ikona s popiskem; `item` je podmínka, ze které řádek vznikl. */
export interface TermRowView {
  kind: TermItem['kind'];
  item: TermItem;
  /** Popisek řádku: „Stane se tvým vazalem“. */
  label: string;
}

export interface NegotiationView {
  id: string;
  other: HouseLinkView;
  /** Hráč má odpovědět (Přijmout, Odmítnout, Protinávrh); jinak smí Stáhnout. */
  myTurn: boolean;
  rows: TermRowView[];
  /** Vzkaz druhé strany (nebo vlastní, když je na tahu druhý). */
  message: string | null;
  rounds: number;
  /** Popisek jednání: „Boleslav – na tahu jsi ty“. */
  label: string;
}

/** Jméno druhé strany do popisků. */
export function houseNameOf(other: { lordName: string | null }): string {
  return other.lordName ?? 'Rod bez jména';
}

/** Popisek řádku podmínek z pohledu hráčova rodu `ownId` (strany jsou id rodů). */
export function termRowLabel(
  item: TermItem,
  ownId: string,
  other: { lordName: string | null },
): string {
  switch (item.kind) {
    case 'oath':
      return item.lord === ownId
        ? `${houseNameOf(other)} se stane tvým vazalem`
        : `Staneš se vazalem rodu ${houseNameOf(other)}`;
    case 'tribute':
      return 'Roční dávka';
    case 'service':
      return `Vojenská služba: ${serviceLabel(item.men, item.days)}`;
    case 'target-village':
      return 'Správa vsi pána';
    case 'reward':
      return 'Roční odměna';
    case 'aid-request':
      return 'Žádost o pomoc';
    case 'gift':
      return 'Dar';
    case 'loan':
      return 'Půjčka se splátkovým kalendářem';
    case 'trade':
      return 'Obchod';
    case 'stewardship':
      return item.villageId.length > 0 ? 'Správa vsi svěřena tobě' : 'Správa vsi';
    case 'village-gift':
      return `Věnování z odúmrti: vsí ${item.villageIds.length}, vazalů ${item.vassalIds.length}`;
  }
}

/** Řádky podmínek k zobrazení (formulář i karta). */
export function termRows(
  items: readonly TermItem[],
  ownId: string,
  other: { lordName: string | null },
): TermRowView[] {
  return items.map((item) => ({ kind: item.kind, item, label: termRowLabel(item, ownId, other) }));
}

/** Prázdný obchod k vyplnění: hráč dává i dostává zboží; ves odeslání je jeho výchozí ves. */
export function openingTrade(ownId: string, ownVillageId: string | null): TermItem[] {
  return [
    {
      kind: 'trade',
      give: {
        grainKg: 100,
        hayKg: 0,
        cattle: { cows: 0, youngOxen: 0, trainedOxen: 0 },
        horses: 0,
        logs: 0,
        people: { families: 0, men: 0, women: 0 },
        laborDays: 0,
      },
      get: {
        grainKg: 0,
        hayKg: 0,
        cattle: { cows: 0, youngOxen: 0, trainedOxen: 0 },
        horses: 0,
        logs: 10,
        people: { families: 0, men: 0, women: 0 },
        laborDays: 0,
      },
      fromVillage: ownVillageId ? { [ownId]: ownVillageId } : {},
    },
  ];
}

/** Podmínky nabídky: `offer` = hráč je pánem, `request` = hráč žádá o přijetí (je vazalem). */
export function openingTerms(
  direction: 'offer' | 'request',
  ownId: string,
  otherId: string,
): TermItem[] {
  return [
    direction === 'offer'
      ? { kind: 'oath', lord: ownId, vassal: otherId }
      : { kind: 'oath', lord: otherId, vassal: ownId },
  ];
}

/** Pohled na jednání hráčova rodu `ownId`; `other` je druhá strana jako odkaz na rod. */
export function negotiationView(
  n: PanelNegotiation,
  ownId: string,
  other: HouseLinkView,
): NegotiationView {
  const name = houseNameOf(n.other);
  return {
    id: n.id,
    other,
    myTurn: n.myTurn,
    // obchod čte hráč ze svého pohledu: co dostal v poslední nabídce, je jeho „dostaneš“
    rows: termRows(
      n.myTurn ? n.items.map((i) => (i.kind === 'trade' ? tradeFlipped(i) : i)) : n.items,
      ownId,
      n.other,
    ),
    message: n.message,
    rounds: n.rounds,
    label: n.myTurn ? `${name} – čeká na tvou odpověď` : `${name} – čeká na odpověď`,
  };
}
