import type { VassalEdge } from '../vassalage/tree';
import { wouldBeMutual } from '../vassalage/tree';
import { NEGOTIATION, NEGOTIATION_REASONS as R } from './rules-negotiation';
import type { Negotiation, NegotiationResult, TermItem } from './types';

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** Jednání otevřené, strana `houseId` jednání se účastní a ten, kdo čeká na odpověď. */
function lastRound(n: Negotiation): Negotiation['rounds'][number] | undefined {
  return n.rounds[n.rounds.length - 1];
}

function other(n: Negotiation, houseId: string): string {
  return houseId === n.initiatorHouseId ? n.recipientHouseId : n.initiatorHouseId;
}

function checkMessage(message: string | null): string | null {
  return message !== null && message.length > NEGOTIATION.messageMaxChars ? R.messageTooLong : null;
}

/** Přísaha z podmínek (nejvýš jedna). */
function oathOf(items: readonly TermItem[]): TermItem | undefined {
  return items.find((i) => i.kind === 'oath');
}

/** Zahájí jednání prvním kolem; přísaha musí být mezi `from` a `to` (kdokoli z nich je pán). */
export function openRound(input: {
  id: string;
  from: string;
  to: string;
  items: TermItem[];
  message: string | null;
  at: Date;
}): NegotiationResult {
  if (input.from === input.to) return fail(R.yourselfOnly);
  const tooLong = checkMessage(input.message);
  if (tooLong) return fail(tooLong);
  const oath = oathOf(input.items);
  const pair = [input.from, input.to];
  if (
    !oath ||
    !pair.includes(oath.lord) ||
    !pair.includes(oath.vassal) ||
    oath.lord === oath.vassal
  ) {
    return fail(R.badOath);
  }
  return {
    ok: true,
    negotiation: {
      id: input.id,
      initiatorHouseId: input.from,
      recipientHouseId: input.to,
      status: 'open',
      rounds: [
        { authorHouseId: input.from, items: input.items, message: input.message, at: input.at },
      ],
      resolvedAt: null,
    },
  };
}

/** Společná kontrola: jednání je otevřené a `actor` je jeho stranou. */
function checkParty(n: Negotiation, actor: string): string | null {
  if (n.status !== 'open') return R.finished;
  if (actor !== n.initiatorHouseId && actor !== n.recipientHouseId) return R.notParty;
  return null;
}

/** Protinávrh: na tahu je ten, kdo nenapsal poslední kolo; role přísahy zůstává z prvního kola. */
export function counterRound(
  n: Negotiation,
  actor: string,
  items: TermItem[],
  message: string | null,
  at: Date,
): NegotiationResult {
  const bad = checkParty(n, actor);
  if (bad) return fail(bad);
  if (lastRound(n)?.authorHouseId === actor) return fail(R.notYourTurn);
  const tooLong = checkMessage(message);
  if (tooLong) return fail(tooLong);
  const first = oathOf(n.rounds[0]?.items ?? []);
  const oath = oathOf(items);
  if (first && (!oath || oath.lord !== first.lord || oath.vassal !== first.vassal)) {
    return fail(R.oathChanged);
  }
  return {
    ok: true,
    negotiation: {
      ...n,
      rounds: [...n.rounds, { authorHouseId: actor, items, message, at }],
    },
  };
}

function resolve(
  n: Negotiation,
  status: 'accepted' | 'rejected' | 'withdrawn',
  at: Date,
): Negotiation {
  return { ...n, status, resolvedAt: at };
}

/** Přijmout / odmítnout smí jen ten, na koho poslední kolo míří. */
function respond(
  n: Negotiation,
  actor: string,
  status: 'accepted' | 'rejected',
  at: Date,
): NegotiationResult {
  const bad = checkParty(n, actor);
  if (bad) return fail(bad);
  if (lastRound(n)?.authorHouseId === actor) return fail(R.notYourTurn);
  return { ok: true, negotiation: resolve(n, status, at) };
}

/** Přijetí posledního kola. Dohodu zakládá use-case (ověří žijící rody a `wouldBeMutual`). */
export function acceptNegotiation(n: Negotiation, actor: string, at: Date): NegotiationResult {
  return respond(n, actor, 'accepted', at);
}

/** Odmítnutí končí jednání; odmítnutý čeká pauzu (`canOpen`). */
export function rejectNegotiation(n: Negotiation, actor: string, at: Date): NegotiationResult {
  return respond(n, actor, 'rejected', at);
}

/** Stažení: jen autor posledního kola, dokud druhý neodpověděl. */
export function withdrawRound(n: Negotiation, actor: string, at: Date): NegotiationResult {
  const bad = checkParty(n, actor);
  if (bad) return fail(bad);
  if (lastRound(n)?.authorHouseId !== actor) return fail(R.onlyAuthorWithdraws);
  return { ok: true, negotiation: resolve(n, 'withdrawn', at) };
}

/** Strana, která má odpovědět (druhá než autor posledního kola); null, když jednání skončilo. */
export function respondingHouse(n: Negotiation): string | null {
  const last = lastRound(n);
  if (n.status !== 'open' || !last) return null;
  return other(n, last.authorHouseId);
}

/** Vstup pro `canOpen` – adaptér složí z DB, doména nesahá na čas ani úložiště. */
export interface OpenContext {
  from: string;
  to: string;
  now: Date;
  fromAlive: boolean;
  toAlive: boolean;
  /** `to` zablokoval `from`. */
  blockedByTarget: boolean;
  /** Mezi rody už je otevřené jednání (jakéhokoli druhu). */
  negotiationOpen: boolean;
  /** Kdy `to` naposledy odmítl návrh od `from` (null = nikdy). */
  rejectedByTargetAt: Date | null;
  /** Navrhovaná přísaha (null = jednání bez přísahy, např. jen změna jiných podmínek). */
  oath: { lord: string; vassal: string } | null;
  /** Živá vazalství v síti. */
  edges: readonly VassalEdge[];
}

/**
 * Smí `from` otevřít jednání s `to`? Vrací důvod odmítnutí, nebo null. Rody jsou strany i pro
 * blokování a pauzu – nový rod po restartu začíná s čistým štítem (návrh Clauda).
 */
export function canOpen(ctx: OpenContext): string | null {
  if (ctx.from === ctx.to) return R.yourselfOnly;
  if (!ctx.fromAlive || !ctx.toAlive) return R.extinct;
  if (ctx.blockedByTarget) return R.blocked;
  if (ctx.negotiationOpen) return R.negotiating;
  if (
    ctx.rejectedByTargetAt !== null &&
    ctx.now.getTime() - ctx.rejectedByTargetAt.getTime() < NEGOTIATION.pauseAfterRejectMs
  ) {
    return R.rejectedPause;
  }
  if (ctx.oath) {
    if (wouldBeMutual(ctx.edges, ctx.oath.lord, ctx.oath.vassal)) return R.isYourLord;
    if (
      ctx.edges.some((e) => e.lordHouseId === ctx.oath?.lord && e.vassalHouseId === ctx.oath.vassal)
    ) {
      return R.alreadyVassal;
    }
  }
  return null;
}
