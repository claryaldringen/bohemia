import {
  LEVY_GOODS,
  NEGOTIATION,
  VASSALAGE,
  type LevyAnswerLine,
  type LevyGood,
  type LoanInstallment,
  type MacroBundle,
  type MacroGoods,
  type TermItem,
  type VassalTerms,
  type Verdict,
} from '@bohemia/game';

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

const BUNDLE_KEYS = [
  'grainKg',
  'hayKg',
  'cattle',
  'horses',
  'logs',
  'people',
  'laborDays',
] as const;

/**
 * Strana obchodu z klienta: svazek jen makrokomodit. Cokoli navíc (mikrokomodita – hrnce, železo,
 * nářadí…) se odmítne už tady; lidé a robota (nulové) projdou tvarem, odmítne je doména.
 */
function parseTradeSide(input: unknown): MacroBundle | null {
  if (typeof input !== 'object' || input === null) return null;
  const keys = Object.keys(input as Record<string, unknown>);
  if (keys.some((k) => !(BUNDLE_KEYS as readonly string[]).includes(k))) return null;
  return parseBundle(input);
}

/** `{ <rod>: <ves> }` – ves, ze které strana obchodu zboží pošle (nejvýš dvě strany). */
function parseFromVillage(input: unknown): Record<string, string> | null {
  if (input === undefined) return {};
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > 2) return null;
  const out: Record<string, string> = {};
  for (const [houseId, villageId] of entries) {
    const house = idOf(houseId);
    const village = idOf(villageId);
    if (house === null || village === null) return null;
    out[house] = village;
  }
  return out;
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
      case 'stewardship': {
        const villageId = idOf(row.villageId);
        if (villageId === null) return null;
        items.push({ kind: 'stewardship', villageId });
        break;
      }
      case 'trade': {
        const give = parseTradeSide(row.give);
        const get = parseTradeSide(row.get);
        const fromVillage = parseFromVillage(row.fromVillage);
        if (give === null || get === null || fromVillage === null) return null;
        items.push({ kind: 'trade', give, get, fromVillage });
        break;
      }
      case 'aid-request': {
        const bundle = parseBundle(row.bundle);
        const villageId = idOf(row.villageId);
        if (bundle === null || villageId === null) return null;
        items.push({ kind: 'aid-request', bundle, villageId });
        break;
      }
      case 'gift':
      case 'loan': {
        const bundle = parseBundle(row.bundle);
        const fromVillageId = idOf(row.fromVillageId);
        const toVillageId = row.toVillageId === undefined ? undefined : idOf(row.toVillageId);
        if (bundle === null || fromVillageId === null || toVillageId === null) return null;
        const target = toVillageId === undefined ? {} : { toVillageId };
        if (row.kind === 'gift') {
          items.push({ kind: 'gift', bundle, fromVillageId, ...target });
          break;
        }
        const schedule = parseSchedule(row.schedule);
        if (schedule === null) return null;
        items.push({ kind: 'loan', bundle, fromVillageId, ...target, schedule });
        break;
      }
      case 'peace': {
        const line = parsePeace(row);
        if (line === null) return null;
        items.push(line);
        break;
      }
      default:
        return null;
    }
  }
  return items;
}

/** Id rodu z `payer` – chybí = undefined, špatný tvar = null. */
function optionalId(input: unknown): string | undefined | null {
  return input === undefined ? undefined : idOf(input);
}

/** Podmínky míru z klienta (tvar; meze a vlastnictví vsí ověřuje server v doméně a use-casu). */
function parsePeace(row: Record<string, unknown>): TermItem | null {
  const line: Extract<TermItem, { kind: 'peace' }> = { kind: 'peace' };
  if (row.fee !== undefined) {
    const fee = parseBundle(row.fee);
    const payer = optionalId(row.payer);
    if (fee === null || !payer) return null;
    line.fee = fee;
    line.payer = payer;
  }
  if (row.tribute !== undefined) {
    const t = row.tribute as { goods?: unknown; payer?: unknown } | null;
    const goods = t ? parseBundle(t.goods) : null;
    const payer = t ? idOf(t.payer) : null;
    if (goods === null || payer === null) return null;
    line.tribute = { goods, payer };
  }
  if (row.vassalage !== undefined) {
    const v = row.vassalage as { lord?: unknown; vassal?: unknown; terms?: unknown } | null;
    const lord = v ? idOf(v.lord) : null;
    const vassal = v ? idOf(v.vassal) : null;
    const terms = v ? parseTerms(v.terms) : null;
    if (lord === null || vassal === null || terms === null) return null;
    line.vassalage = { lord, vassal, terms };
  }
  if (row.cede !== undefined) {
    if (!Array.isArray(row.cede) || row.cede.length > 16) return null;
    const ids = (row.cede as unknown[]).map(idOf);
    if (ids.some((i) => i === null)) return null;
    line.cede = ids as string[];
  }
  if (row.releasePrisoners !== undefined) {
    if (!Array.isArray(row.releasePrisoners) || row.releasePrisoners.length > 64) return null;
    const ids = (row.releasePrisoners as unknown[]).map(idOf);
    if (ids.some((i) => i === null)) return null;
    line.releasePrisoners = ids as string[];
  }
  return line;
}

/** Podmínky vazalství v míru: jen dávka a odměna (svazky), služba; ostatní řádky se zahodí. */
function parseTerms(input: unknown): VassalTerms | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  const terms: VassalTerms = {};
  if (raw.tribute !== undefined) {
    const b = parseBundle(raw.tribute);
    if (b === null) return null;
    terms.tribute = b;
  }
  if (raw.reward !== undefined) {
    const b = parseBundle(raw.reward);
    if (b === null) return null;
    terms.reward = b;
  }
  if (raw.service !== undefined) {
    const sv = raw.service as { men?: unknown; days?: unknown } | null;
    const men = sv ? num(sv.men) : null;
    const days = sv ? num(sv.days) : null;
    if (men === null || days === null) return null;
    terms.service = { men, days };
  }
  return terms;
}

/** Zboží splátky (makrokomodity bez lidí a roboty): všechna pole čísla, jinak null. */
function parseGoods(input: unknown): MacroGoods | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  const cattle = raw.cattle as Record<string, unknown> | null | undefined;
  if (!cattle) return null;
  const fields = [
    num(raw.grainKg),
    num(raw.hayKg),
    num(cattle.cows),
    num(cattle.youngOxen),
    num(cattle.trainedOxen),
    num(raw.horses),
    num(raw.logs),
  ];
  if (fields.some((f) => f === null)) return null;
  const [grainKg, hayKg, cows, youngOxen, trainedOxen, horses, logs] = fields as number[];
  return {
    grainKg: grainKg!,
    hayKg: hayKg!,
    cattle: { cows: cows!, youngOxen: youngOxen!, trainedOxen: trainedOxen! },
    horses: horses!,
    logs: logs!,
  };
}

/** Splátkový kalendář z klienta: roky a zboží (svazek bez lidí a roboty); mezemi se zabývá doména. */
function parseSchedule(input: unknown): LoanInstallment[] | null {
  if (!Array.isArray(input) || input.length > VASSALAGE.loan.maxInstallments) return null;
  const schedule: LoanInstallment[] = [];
  for (const raw of input as unknown[]) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { year, goods } = raw as { year?: unknown; goods?: unknown };
    const y = num(year);
    const parsed = parseGoods(goods);
    if (y === null || parsed === null) return null;
    schedule.push({ year: y, goods: parsed });
  }
  return schedule;
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

/** `{ target, items, message }` – opověď války: id rodu, požadavek (podmínky míru), vzkaz. */
export function parseDeclareWarInput(
  input: unknown,
): { target: string; demand: TermItem[]; message: string | null } | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as { target?: unknown; items?: unknown; message?: unknown };
  const target = idOf(raw.target);
  const demand = parseTermItems(raw.items);
  const message = parseMessage(raw.message);
  return target !== null && demand !== null && message !== undefined
    ? { target, demand, message }
    : null;
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

/** `{ against, message }` – žaloba na spoluvazala (id rodu a vzkaz pánovi). */
export function parseComplaintInput(input: unknown): { against: string; message: string } | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as { against?: unknown; message?: unknown };
  const against = idOf(raw.against);
  const message = typeof raw.message === 'string' ? raw.message : null;
  return against !== null && message !== null ? { against, message } : null;
}

/** `{ disputeId, statement }` – vyjádření obžalovaného. */
export function parseStatementInput(
  input: unknown,
): { disputeId: string; statement: string } | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as { disputeId?: unknown; statement?: unknown };
  const disputeId = idOf(raw.disputeId);
  const statement = typeof raw.statement === 'string' ? raw.statement : null;
  return disputeId !== null && statement !== null ? { disputeId, statement } : null;
}

/** Rozsudek z klienta: tvar podle druhu, čísla ověří doména. */
function parseVerdict(input: unknown): Verdict | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as { kind?: unknown; bundle?: unknown; people?: unknown };
  switch (raw.kind) {
    case 'peace':
    case 'dismiss':
      return { kind: raw.kind };
    case 'compensation': {
      const bundle = parseBundle(raw.bundle);
      return bundle ? { kind: 'compensation', bundle } : null;
    }
    case 'return-people': {
      const p = raw.people as Record<string, unknown> | null | undefined;
      const families = num(p?.families);
      const men = num(p?.men);
      const women = num(p?.women);
      return families !== null && men !== null && women !== null
        ? { kind: 'return-people', people: { families, men, women } }
        : null;
    }
    default:
      return null;
  }
}

/** `{ disputeId, verdict }` – rozsudek pána. */
export function parseJudgeInput(input: unknown): { disputeId: string; verdict: Verdict } | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as { disputeId?: unknown; verdict?: unknown };
  const disputeId = idOf(raw.disputeId);
  const verdict = parseVerdict(raw.verdict);
  return disputeId !== null && verdict !== null ? { disputeId, verdict } : null;
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

/** `{ villageId }` – odvolání správce vsi. */
export function parseDismissStewardInput(input: unknown): { villageId: string } | null {
  if (typeof input !== 'object' || input === null) return null;
  const villageId = idOf((input as { villageId?: unknown }).villageId);
  return villageId === null ? null : { villageId };
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

/** Nejvýš tolik vsí v odpovědi na Odvody (mezí je počet vsí rodu, tohle chrání jen tvar). */
const LEVY_SPLIT_MAX = 64;

/**
 * `{ dialogId, lines: [{ good, amount }], split: { <villageId>: MacroBundle }, message? }` –
 * odpověď na dialog Odvody. Obsah čísel a vlastnictví vsí ověřuje use-case.
 */
export function parseAnswerLevyInput(input: unknown): {
  dialogId: string;
  lines: LevyAnswerLine[];
  split: Record<string, MacroBundle>;
  message: string | null;
} | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  const dialogId = idOf(raw.dialogId);
  const message = parseMessage(raw.message);
  if (dialogId === null || message === undefined) return null;
  if (!Array.isArray(raw.lines) || raw.lines.length > LEVY_GOODS.length) return null;
  const lines: LevyAnswerLine[] = [];
  for (const line of raw.lines as unknown[]) {
    if (typeof line !== 'object' || line === null) return null;
    const { good, amount } = line as { good?: unknown; amount?: unknown };
    const n = num(amount);
    if (
      typeof good !== 'string' ||
      !(LEVY_GOODS as readonly string[]).includes(good) ||
      n === null
    ) {
      return null;
    }
    lines.push({ good: good as LevyGood, amount: n });
  }
  if (typeof raw.split !== 'object' || raw.split === null || Array.isArray(raw.split)) return null;
  const entries = Object.entries(raw.split as Record<string, unknown>);
  if (entries.length > LEVY_SPLIT_MAX) return null;
  const split: Record<string, MacroBundle> = {};
  for (const [villageId, bundle] of entries) {
    const id = idOf(villageId);
    const parsed = parseBundle(bundle);
    if (id === null || parsed === null) return null;
    split[id] = parsed;
  }
  return { dialogId, lines, split, message };
}

/** `{ prisonerId, action }` – rozhodnutí věznitele o zajatci (klíč zajetí `<tažení>:<osoba>`). */
export function parsePrisonerInput(
  input: unknown,
): { prisonerId: string; action: 'hold' | 'release' | 'execute' } | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as { prisonerId?: unknown; action?: unknown };
  const id = raw.prisonerId;
  if (typeof id !== 'string' || !/^[\w-]{1,80}:\d{1,9}$/.test(id)) return null;
  if (raw.action !== 'hold' && raw.action !== 'release' && raw.action !== 'execute') return null;
  return { prisonerId: id, action: raw.action };
}
