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
  'horses-shod',
]);

/** Má událost jméno vsi, které smí být maskované? */
function isNamed(event: ChronicleEvent): event is Named {
  return (
    NAMED_KINDS.has(event.kind) && 'villageName' in event && typeof event.villageName === 'string'
  );
}

/**
 * Stav vsi s prázdnými jmény vsí, které `allowed` neobsahuje: jméno záznamu kroniky (výpravy,
 * sňatky, lidé, kovář, zakázky), zakázky (`orders`), čekajícího dotazu na kováře
 * (`shoeing.asked`) a cíle výprav na trh. Záznam se jménem bez `villageId` (starší než plán 3) se
 * maskuje také – nelze ověřit, čí je. Vstup se nemění, bez nutnosti maskování vrátí týž stav.
 */
export function maskVillageNames(state: VillageState, allowed: ReadonlySet<string>): VillageState {
  const hidden = (id: string | undefined): boolean => id === undefined || !allowed.has(id);
  let changed = false;
  const chronicle = state.chronicle.map((event) => {
    if (!isNamed(event) || event.villageName === '' || !hidden(event.villageId)) return event;
    changed = true;
    return { ...event, villageName: '' };
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
