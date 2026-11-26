// Jména vsí pro cizího správce (markets.md – Rozhodnutí plánu 3, bod 14; Global Constraints):
// správce spravované vsi (jednající hráč ≠ držitel) nesmí vidět jména ostatních vsí držitele –
// ani v kronice, upozorněních a tooltipech zakázek a kování. Server jména při skládání pohledu
// nahradí prázdným (texty pak říkají „sousední ves“), klient je nikdy nedostane. Čistá funkce.
import type { ChronicleEvent, VillageState } from '@bohemia/game';

/** Druhy kroniky plánu 3, které nesou jméno vsi (`villageName`) a její `villageId`. */
type Named = Extract<
  ChronicleEvent,
  {
    kind:
      | 'market-arrived'
      | 'market-departed'
      | 'market-returned'
      | 'order-ready'
      | 'extra-wife'
      | 'bride-from-outside'
      | 'groom-from-outside'
      | 'married-away'
      | 'newcomer'
      | 'stranded-coins'
      | 'horses-shod';
  }
>;

const NAMED_KINDS: ReadonlySet<ChronicleEvent['kind']> = new Set<Named['kind']>([
  'market-arrived',
  'market-departed',
  'market-returned',
  'order-ready',
  'extra-wife',
  'bride-from-outside',
  'groom-from-outside',
  'married-away',
  'newcomer',
  'stranded-coins',
  'horses-shod',
]);

/** Má událost jméno vsi, které smí být maskované? */
function isNamed(event: ChronicleEvent): event is Named {
  return (
    NAMED_KINDS.has(event.kind) && 'villageName' in event && typeof event.villageName === 'string'
  );
}

/**
 * Starší druhy kroniky se jménem vsi bez `villageId` (vojvoda do jiné vsi rodu, zásilky, lidé na
 * čas, hosté, útěk do hradiště) – nelze ověřit, čí ves je, jméno se maskuje vždy. Kování vozů
 * (`iron-trip`) nese jméno v `to`.
 */
type OldNamed = Extract<
  ChronicleEvent,
  {
    kind:
      | 'lord-sent'
      | 'shipment-sent'
      | 'shipment-received'
      | 'people-away'
      | 'guests-came'
      | 'refuge-left';
  }
>;

const OLD_NAMED_KINDS: ReadonlySet<ChronicleEvent['kind']> = new Set<OldNamed['kind']>([
  'lord-sent',
  'shipment-sent',
  'shipment-received',
  'people-away',
  'guests-came',
  'refuge-left',
]);

function isOldNamed(event: ChronicleEvent): event is OldNamed {
  return OLD_NAMED_KINDS.has(event.kind);
}

/** Záznam kroniky se jménem vsi, které cizí správce nesmí vidět, prázdným; jinak týž záznam. */
function maskedEvent(
  event: ChronicleEvent,
  hidden: (id: string | undefined) => boolean,
): ChronicleEvent {
  if (event.kind === 'iron-trip') return event.to === '' ? event : { ...event, to: '' };
  if (isOldNamed(event)) {
    return event.villageName === undefined || event.villageName === ''
      ? event
      : { ...event, villageName: '' };
  }
  if (!isNamed(event) || event.villageName === '' || !hidden(event.villageId)) return event;
  return { ...event, villageName: '' };
}

/**
 * Stav vsi s prázdnými jmény vsí, které `allowed` neobsahuje: jméno záznamu kroniky (výpravy,
 * sňatky, lidé, kovář, zakázky; starší druhy – vojvoda do jiné vsi, zásilky, lidé na čas, hosté,
 * útěk, kování vozů), zakázky (`orders`), čekajícího dotazu na kováře (`shoeing.asked`) a cíle
 * výprav na trh. Záznam se jménem bez `villageId` (starší než plán 3) se maskuje také – nelze
 * ověřit, čí je. Vstup se nemění, bez nutnosti maskování vrátí týž stav.
 */
export function maskVillageNames(state: VillageState, allowed: ReadonlySet<string>): VillageState {
  const hidden = (id: string | undefined): boolean => id === undefined || !allowed.has(id);
  let changed = false;
  const chronicle = state.chronicle.map((event) => {
    const masked = maskedEvent(event, hidden);
    if (masked !== event) changed = true;
    return masked;
  });
  const orders = state.orders?.map((order) => {
    if (order.name === '' || !hidden(order.villageId)) return order;
    changed = true;
    return { ...order, name: '' };
  });
  const asked = state.shoeing?.asked;
  const shoeing =
    state.shoeing && asked && asked.name !== '' && hidden(asked.villageId)
      ? { ...state.shoeing, asked: { ...asked, name: '' } }
      : state.shoeing;
  if (shoeing !== state.shoeing) changed = true;
  const trade = state.trade && {
    ...state.trade,
    expeditions: state.trade.expeditions.map((e) => {
      if (!e.market || e.market.name === '' || !hidden(e.market.villageId)) return e;
      changed = true;
      return { ...e, market: { ...e.market, name: '' } };
    }),
  };
  if (!changed) return state;
  return {
    ...state,
    chronicle,
    ...(orders ? { orders } : {}),
    ...(shoeing ? { shoeing } : {}),
    ...(trade ? { trade } : {}),
  };
}
