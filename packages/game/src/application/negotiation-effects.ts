import type { TermItem } from '../domain/negotiation';
import type { NegotiationTx } from './negotiations';

/** Kdy a v jakém herním dni se dohoda uzavřela. */
export interface EffectContext {
  now: Date;
  day: number;
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
        terms: {},
        origin: 'negotiation',
        sinceAt: ctx.now,
        sinceDay: ctx.day,
      });
    },
  },
};
