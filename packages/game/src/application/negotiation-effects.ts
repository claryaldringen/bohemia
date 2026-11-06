import type { TermItem } from '../domain/negotiation';
import { checkTermLine, type TermLine, type VassalTerms } from '../domain/vassalage/terms';
import type { NegotiationTx } from './negotiations';

/** Kdy a v jakém herním dni se dohoda uzavřela. */
export interface EffectContext {
  now: Date;
  day: number;
  /** Podmínky z celého přijatého kola (bez přísahy) – nová dohoda je dostane při založení. */
  terms: VassalTerms;
}

/**
 * Účinek jednoho druhu řádku podmínek při přijetí jednání (vassalage.md – Vznik a jednání).
 * `check` neměnící nic vrací důvod odmítnutí, `apply` zapisuje; oba běží v transakci přijetí.
 */
export interface NegotiationEffect<K extends TermItem['kind'] = TermItem['kind']> {
  check(tx: NegotiationTx, item: Extract<TermItem, { kind: K }>): Promise<string | null>;
  apply(tx: NegotiationTx, item: Extract<TermItem, { kind: K }>, ctx: EffectContext): Promise<void>;
}

/**
 * Řádek podmínek (dávka, služba, cílová ves, odměna): `check` hlídá čísla (doména), vlastní zápis
 * dělá přísaha při založení dohody, nebo `updateTerms` nad existující dohodou (`acceptNegotiation`) –
 * zapisují se podmínky celého kola najednou, ne po řádcích.
 */
const termLineEffect = <K extends TermLine['kind']>(): NegotiationEffect<K> => ({
  check: (_tx, item) => Promise.resolve(checkTermLine(item as TermLine)),
  apply: () => Promise.resolve(),
});

/**
 * Registr účinků podle druhu řádku. Nový druh řádku bez účinku nepřeloží (`Record` přes unii).
 * Holá přísaha: vazalství `origin: 'negotiation'` bez podmínek; druhý pán přibude vedle
 * stávajících, stejná dvojice už svázaná – `create` vrátí živé vazalství a nic nepřidá.
 */
export const NEGOTIATION_EFFECTS: { [K in TermItem['kind']]: NegotiationEffect<K> } = {
  oath: {
    check: () => Promise.resolve(null),
    apply: async (tx, item, ctx) => {
      await tx.vassalages.create({
        lordHouseId: item.lord,
        vassalHouseId: item.vassal,
        terms: ctx.terms,
        origin: 'negotiation',
        sinceAt: ctx.now,
        sinceDay: ctx.day,
      });
    },
  },
  tribute: termLineEffect<'tribute'>(),
  service: termLineEffect<'service'>(),
  'target-village': termLineEffect<'target-village'>(),
  reward: termLineEffect<'reward'>(),
};

/** Kontrola řádku podle jeho druhu (registr je typově rozepsaný po druzích, volání je sjednocené). */
export function checkItem(tx: NegotiationTx, item: TermItem): Promise<string | null> {
  return (NEGOTIATION_EFFECTS[item.kind] as NegotiationEffect).check(tx, item);
}

/** Účinek řádku podle jeho druhu. */
export function applyItem(tx: NegotiationTx, item: TermItem, ctx: EffectContext): Promise<void> {
  return (NEGOTIATION_EFFECTS[item.kind] as NegotiationEffect).apply(tx, item, ctx);
}
