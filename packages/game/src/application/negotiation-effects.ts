import { checkStewardshipItems, checkTradeLine, type TermItem } from '../domain/negotiation';
import { AID_REASONS, checkAidLine, type AidLine } from '../domain/vassalage/loan';
import { checkTermLine, type TermLine, type VassalTerms } from '../domain/vassalage/terms';
import { STEWARD_TAKEN } from './stewardships';
import type { NegotiationTx } from './negotiations';

/** Ves dostala správce souběžně jinou cestou – přijetí se vrací (transakce se zruší). */
export class StewardshipTaken extends Error {
  constructor() {
    super(STEWARD_TAKEN);
  }
}

/** Kdy a v jakém herním dni se dohoda uzavřela. */
export interface EffectContext {
  now: Date;
  day: number;
  /** Podmínky z celého přijatého kola (bez přísahy) – nová dohoda je dostane při založení. */
  terms: VassalTerms;
  /** Jednání, které se přijímá (půjčka z něj vzejde nejvýš jednou). */
  negotiationId: string;
  /** Dohoda, o jejíž pomoci se jedná (pán = věřitel, vazal = dlužník); u jiných řádků nevyužito. */
  agreement: { lordHouseId: string; vassalHouseId: string } | null;
  /** Kam zásilka z pomoci dojde (ves příjemce); null – příjemce nemá kam. */
  aidTargetVillageId: string | null;
  /** Pán a vazal dohody, na které správa vsi stojí (řádek `stewardship`); jinak null. */
  stewardship: { lordHouseId: string; stewardHouseId: string } | null;
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
 * Řádek pomoci (vassalage.md – Pomoc na žádost): `check` hlídá čísla (doména). Dar sám nic
 * nezapisuje – zásilku pošle `acceptNegotiation` po transakci (pod zámkem držitele věřitelovy vsi).
 */
const aidEffect = <K extends AidLine['kind']>(): NegotiationEffect<K> => ({
  check: (_tx, item) => Promise.resolve(checkAidLine(item as AidLine)),
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
  // žádost sama přijmout nejde – pán na ni odpovídá darem nebo půjčkou
  'aid-request': {
    check: () => Promise.resolve(AID_REASONS.answerNeeded),
    apply: () => Promise.resolve(),
  },
  gift: aidEffect<'gift'>(),
  // obchod mezi hráči: nic se nezapisuje, dialogy odeslání otevře `acceptNegotiation` po transakci
  trade: {
    check: (_tx, item) => Promise.resolve(checkTradeLine(item)),
    apply: () => Promise.resolve(),
  },
  // správa cizí vsi: stojí na živé dohodě pána a správce (přísaha už proběhla), ves smí mít jednu
  stewardship: {
    check: (_tx, item) => Promise.resolve(checkStewardshipItems([item])),
    apply: async (tx, item, ctx) => {
      if (!ctx.stewardship) return;
      const agreement = (await tx.vassalages.activeOf(ctx.stewardship.stewardHouseId)).find(
        (v) => v.lordHouseId === ctx.stewardship?.lordHouseId,
      );
      const started = await tx.stewardships.start({
        villageId: item.villageId,
        stewardHouseId: ctx.stewardship.stewardHouseId,
        holderHouseId: ctx.stewardship.lordHouseId,
        kind: 'player',
        vassalageId: agreement?.id ?? null,
        since: ctx.now,
      });
      if (!started) throw new StewardshipTaken();
    },
  },
  // půjčka je samostatná dohoda: řádek se zapíše v transakci přijetí, zboží pošle use-case po ní
  loan: {
    check: (_tx, item) => Promise.resolve(checkAidLine(item)),
    apply: async (tx, item, ctx) => {
      if (!ctx.agreement) return;
      await tx.loans.create({
        negotiationId: ctx.negotiationId,
        creditorHouseId: ctx.agreement.lordHouseId,
        debtorHouseId: ctx.agreement.vassalHouseId,
        creditorVillageId: item.fromVillageId,
        debtorVillageId: ctx.aidTargetVillageId,
        principal: {
          grainKg: item.bundle.grainKg,
          hayKg: item.bundle.hayKg,
          cattle: { ...item.bundle.cattle },
          horses: item.bundle.horses,
          logs: item.bundle.logs,
        },
        schedule: item.schedule,
        sinceAt: ctx.now,
        sinceDay: ctx.day,
      });
    },
  },
};

/** Kontrola řádku podle jeho druhu (registr je typově rozepsaný po druzích, volání je sjednocené). */
export function checkItem(tx: NegotiationTx, item: TermItem): Promise<string | null> {
  return (NEGOTIATION_EFFECTS[item.kind] as NegotiationEffect).check(tx, item);
}

/** Účinek řádku podle jeho druhu. */
export function applyItem(tx: NegotiationTx, item: TermItem, ctx: EffectContext): Promise<void> {
  return (NEGOTIATION_EFFECTS[item.kind] as NegotiationEffect).apply(tx, item, ctx);
}
