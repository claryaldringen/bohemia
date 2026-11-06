import { NEGOTIATION, type MacroBundle, type TermItem } from '@bohemia/game';

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

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Svazek makrokomodit z klienta (dávka, odměna): všechna pole čísla, jinak null. Meze hlídá doména. */
function parseBundle(input: unknown): MacroBundle | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  const cattle = raw.cattle as Record<string, unknown> | null | undefined;
  const people = raw.people as Record<string, unknown> | null | undefined;
  if (!cattle || !people) return null;
  const fields = [
    num(raw.grainKg),
    num(raw.hayKg),
    num(cattle.cows),
    num(cattle.youngOxen),
    num(cattle.trainedOxen),
    num(raw.horses),
    num(raw.logs),
    num(people.families),
    num(people.men),
    num(people.women),
    num(raw.laborDays),
  ];
  if (fields.some((f) => f === null)) return null;
  const [
    grainKg,
    hayKg,
    cows,
    youngOxen,
    trainedOxen,
    horses,
    logs,
    families,
    men,
    women,
    laborDays,
  ] = fields as number[];
  return {
    grainKg: grainKg!,
    hayKg: hayKg!,
    cattle: { cows: cows!, youngOxen: youngOxen!, trainedOxen: trainedOxen! },
    horses: horses!,
    logs: logs!,
    people: { families: families!, men: men!, women: women! },
    laborDays: laborDays!,
  };
}

/**
 * Podmínky z klienta: pole řádků (přísaha mezi dvěma id rodů, dávka, služba, cílová ves, odměna),
 * jinak null. Prázdné pole je platné (změna podmínek na holou přísahu); obsah čísel ověří doména.
 */
export function parseTermItems(input: unknown): TermItem[] | null {
  if (!Array.isArray(input) || input.length > 8) return null;
  const items: TermItem[] = [];
  for (const raw of input as unknown[]) {
    if (typeof raw !== 'object' || raw === null) return null;
    const row = raw as Record<string, unknown>;
    switch (row.kind) {
      case 'oath': {
        const lord = idOf(row.lord);
        const vassal = idOf(row.vassal);
        if (lord === null || vassal === null) return null;
        items.push({ kind: 'oath', lord, vassal });
        break;
      }
      case 'tribute':
      case 'reward': {
        const goods = parseBundle(row.goods);
        if (goods === null) return null;
        items.push({ kind: row.kind, goods });
        break;
      }
      case 'service': {
        const men = num(row.men);
        const days = num(row.days);
        if (men === null || days === null) return null;
        items.push({ kind: 'service', men, days });
        break;
      }
      case 'target-village': {
        const villageId = idOf(row.villageId);
        if (villageId === null) return null;
        items.push({ kind: 'target-village', villageId });
        break;
      }
      default:
        return null;
    }
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

/** `{ vassalageId, message? }` – vypovězení dohody. */
export function parseRenounceInput(
  input: unknown,
): { vassalageId: string; message: string | null } | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as { vassalageId?: unknown; message?: unknown };
  const vassalageId = idOf(raw.vassalageId);
  const message = parseMessage(raw.message);
  return vassalageId !== null && message !== undefined ? { vassalageId, message } : null;
}

/** `{ toHouseId, targetVillageId? }` – výhled pro dávku rodu `toHouseId`. */
export function parseSpareInput(
  input: unknown,
): { toHouseId: string; targetVillageId?: string } | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as { toHouseId?: unknown; targetVillageId?: unknown };
  const toHouseId = idOf(raw.toHouseId);
  if (toHouseId === null) return null;
  if (raw.targetVillageId === undefined || raw.targetVillageId === null) return { toHouseId };
  const targetVillageId = idOf(raw.targetVillageId);
  return targetVillageId === null ? null : { toHouseId, targetVillageId };
}
