// Pohled na jednání mezi rody (docs/design/vassalage.md – Co hráč vidí, „jednání“): z dat panelu
// složí řádky podmínek, popisky a tlačítka podle toho, kdo je na tahu. Čistý modul – smí do
// prohlížeče. Rozhodnutí (kdo je na tahu, kdo smí co) je v `packages/game`, tady se jen zobrazuje.
import type { PanelNegotiation, TermItem } from '@bohemia/game';
import type { HouseLinkView } from './house-view';

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
    // ikony a čísla těchto řádků dělá rozhraní podmínek (úloha 4.2 – web); zatím jen název
    case 'tribute':
      return 'Roční dávka';
    case 'service':
      return `Vojenská služba – ${item.men} mužů na ${item.days} dní`;
    case 'target-village':
      return 'Cílová ves';
    case 'reward':
      return 'Roční odměna';
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
    rows: termRows(n.items, ownId, n.other),
    message: n.message,
    rounds: n.rounds,
    label: n.myTurn ? `${name} – čeká na tvou odpověď` : `${name} – čeká na odpověď`,
  };
}
