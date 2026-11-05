import { NEGOTIATION, type TermItem } from '@bohemia/game';

// Vstup server actions panelu „Rod a vazalové“ – jen tvar, kód ověří až use-case.

/** `{ code }` – pozvánkový kód (text do 16 znaků), jinak null. */
export function parseRevokeInviteInput(input: unknown): { code: string } | null {
  if (typeof input !== 'object' || input === null) return null;
  const code = (input as { code?: unknown }).code;
  return typeof code === 'string' && code.length > 0 && code.length <= 16 ? { code } : null;
}

const ID_MAX = 64;

const idOf = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 && value.length <= ID_MAX ? value : null;

/** Podmínky z klienta: neprázdné pole řádků (zatím jen přísaha mezi dvěma id rodů), jinak null. */
export function parseTermItems(input: unknown): TermItem[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 8) return null;
  const items: TermItem[] = [];
  for (const raw of input as unknown[]) {
    if (typeof raw !== 'object' || raw === null) return null;
    const row = raw as { kind?: unknown; lord?: unknown; vassal?: unknown };
    if (row.kind !== 'oath') return null;
    const lord = idOf(row.lord);
    const vassal = idOf(row.vassal);
    if (lord === null || vassal === null) return null;
    items.push({ kind: 'oath', lord, vassal });
  }
  return items;
}

/** Vzkaz: chybí / prázdný = žádný; text delší než mez (`NEGOTIATION.messageMaxChars`) = chyba. */
export function parseMessage(input: unknown): string | null | undefined {
  if (input === undefined || input === null) return null;
  if (typeof input !== 'string') return undefined;
  const text = input.trim();
  if (text.length > NEGOTIATION.messageMaxChars) return undefined;
  return text === '' ? null : text;
}

/** `{ to, items, message }` – nová nabídka jednání. */
export function parseOpenNegotiationInput(
  input: unknown,
): { to: string; items: TermItem[]; message: string | null } | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as { to?: unknown; items?: unknown; message?: unknown };
  const to = idOf(raw.to);
  const items = parseTermItems(raw.items);
  const message = parseMessage(raw.message);
  return to !== null && items !== null && message !== undefined ? { to, items, message } : null;
}

export type NegotiationAnswer =
  | { negotiationId: string; answer: 'accept' | 'reject' | 'withdraw' }
  | { negotiationId: string; answer: 'counter'; items: TermItem[]; message: string | null };

/** `{ negotiationId, answer, items?, message? }` – odpověď na jednání. */
export function parseNegotiationAnswerInput(input: unknown): NegotiationAnswer | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as {
    negotiationId?: unknown;
    answer?: unknown;
    items?: unknown;
    message?: unknown;
  };
  const negotiationId = idOf(raw.negotiationId);
  if (negotiationId === null) return null;
  if (raw.answer === 'accept' || raw.answer === 'reject' || raw.answer === 'withdraw') {
    return { negotiationId, answer: raw.answer };
  }
  if (raw.answer !== 'counter') return null;
  const items = parseTermItems(raw.items);
  const message = parseMessage(raw.message);
  return items !== null && message !== undefined
    ? { negotiationId, answer: 'counter', items, message }
    : null;
}

/** `{ target }` – id rodu, který se blokuje. */
export function parseBlockInput(input: unknown): { target: string } | null {
  if (typeof input !== 'object' || input === null) return null;
  const target = idOf((input as { target?: unknown }).target);
  return target === null ? null : { target };
}
