import { NEGOTIATION } from '../domain/negotiation';
import { WAR } from '../domain/war';
import type { House, HouseRepository } from './houses';
import { NO_HOUSE } from './negotiate';
import { chronicleHouses, houseName, type NegotiationVillages } from './negotiation-chronicle';
import type { NoticeRepository } from './notices';
import type { Passage, PassageRepository } from './passages';
import type { WorldCell } from './settlements';
import type { WarRepository } from './wars';

// Ohlášení průchodu (war.md – Pohyb: Průchod územím neutrálního rodu; Martin 2. 11. 2026:
// „Neutrálnímu rodu by mělo jít dát vědět, že chci táhnout přes jeho území. On se k tomu sice může
// vyjádřit, ale nic to neznamená.“). Ohlášení se vsím rodu předá samo – ohlášené vojsko je pro ně
// neškodné (`passageCovers` ve `villageWatchers`); odpověď „Nevěřit“ vrátí vsím postoj. Útok po
// ohlášení hra nezakazuje: začne válku bez opovědi a ohlášení přestane platit (`voidBetween`).

export const PASSAGE_REASONS = {
  extinct: 'Ten rod už není.',
  own: 'Vlastním územím projdeš bez ohlášení.',
  atWar: 'S tímto rodem válčíte.',
  noCells: 'Vyber mapy, kudy vojsko půjde.',
  tooManyCells: 'Tolik map najednou ohlásit nejde.',
  messageTooLong: 'Vzkaz je příliš dlouhý.',
  notFound: 'Takové ohlášení není.',
  notYours: 'Tohle ohlášení ti nepatří.',
  answered: 'Na ohlášení už jsi odpověděl.',
} as const;

export interface PassageDeps extends NegotiationVillages {
  passages: PassageRepository;
  houses: Pick<HouseRepository, 'activeOf' | 'byId'>;
  wars: Pick<WarRepository, 'activeBetween'>;
  notices: Pick<NoticeRepository, 'post'>;
  now: () => Date;
}

export type PassageResult = { ok: true; passage: Passage } | { ok: false; reason: string };

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

function alive(house: House | null): house is House {
  return house !== null && house.endedAt === null;
}

function cleanMessage(message: string): string | null {
  const text = message.trim();
  return text.length > NEGOTIATION.messageMaxChars ? null : text;
}

/** Políčka bez opakování, jen celá čísla; null – špatný vstup. */
function cleanCells(cells: readonly WorldCell[]): WorldCell[] | null {
  const seen = new Set<string>();
  const out: WorldCell[] = [];
  for (const c of cells) {
    if (!Number.isInteger(c.x) || !Number.isInteger(c.y)) return null;
    const key = `${c.x},${c.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x: c.x, y: c.y });
  }
  return out;
}

/**
 * Rod hráče ohlásí rodu `house` průchod vojska mapami `cells` zhruba v herní den `eta`. Druhý rod
 * dostane upozornění, kroniky obou rodů zápis „Bořivoj ohlásil průchod.“.
 */
export async function announcePassage(
  deps: PassageDeps,
  input: {
    playerId: string;
    house: string;
    cells: readonly WorldCell[];
    eta: number;
    message: string;
    today: number;
  },
): Promise<PassageResult> {
  const from = await deps.houses.activeOf(input.playerId);
  if (!from) return fail(NO_HOUSE);
  const to = await deps.houses.byId(input.house);
  if (!alive(to)) return fail(PASSAGE_REASONS.extinct);
  if (to.id === from.id) return fail(PASSAGE_REASONS.own);
  if (await deps.wars.activeBetween(from.id, to.id)) return fail(PASSAGE_REASONS.atWar);
  const cells = cleanCells(input.cells);
  if (!cells || cells.length === 0) return fail(PASSAGE_REASONS.noCells);
  if (cells.length > WAR.passage.maxCells) return fail(PASSAGE_REASONS.tooManyCells);
  const message = cleanMessage(input.message);
  if (message === null) return fail(PASSAGE_REASONS.messageTooLong);
  const passage = await deps.passages.announce({
    fromHouseId: from.id,
    toHouseId: to.id,
    cells,
    etaDay: Math.max(input.today, Math.round(input.eta)),
    message,
    announcedAt: deps.now(),
    announcedDay: input.today,
  });
  const name = await houseName(deps, from);
  if (to.playerId !== null) {
    await deps.notices.post({
      playerId: to.playerId,
      kind: 'passage-announced',
      payload: { passageId: passage.id, houseId: from.id, name, etaDay: passage.etaDay },
      gameDay: input.today,
    });
  }
  await chronicleHouses(deps, [from, to], `passage:${passage.id}`, {
    day: input.today,
    kind: 'passage-announced',
    name,
  });
  return { ok: true, passage };
}

/**
 * Rod, jemuž byl průchod ohlášen, odpoví (jednou): `trust` false = „Nevěřit“ – jeho vsi se
 * zachovají podle postoje. Ohlašující rod dostane upozornění se vzkazem.
 */
export async function answerPassage(
  deps: PassageDeps,
  input: { playerId: string; passageId: string; trust: boolean; message: string; today: number },
): Promise<PassageResult> {
  const house = await deps.houses.activeOf(input.playerId);
  if (!house) return fail(NO_HOUSE);
  const passage = await deps.passages.byId(input.passageId);
  if (!passage) return fail(PASSAGE_REASONS.notFound);
  if (passage.toHouseId !== house.id) return fail(PASSAGE_REASONS.notYours);
  const message = cleanMessage(input.message);
  if (message === null) return fail(PASSAGE_REASONS.messageTooLong);
  const reply = message === '' ? null : message;
  const at = deps.now();
  if (!(await deps.passages.answer(passage.id, input.trust, reply, at))) {
    return fail(PASSAGE_REASONS.answered);
  }
  const from = await deps.houses.byId(passage.fromHouseId);
  if (from?.playerId) {
    await deps.notices.post({
      playerId: from.playerId,
      kind: 'passage-answered',
      payload: {
        passageId: passage.id,
        name: await houseName(deps, house),
        trust: input.trust,
        message: reply,
      },
      gameDay: input.today,
    });
  }
  return { ok: true, passage: { ...passage, trust: input.trust, reply, answeredAt: at } };
}

/** Ohlášení, na která rod hráče může odpovědět (platná, bez odpovědi) – panel války. */
export async function passagesToAnswer(
  deps: Pick<PassageDeps, 'passages' | 'houses'>,
  playerId: string,
): Promise<Passage[]> {
  const house = await deps.houses.activeOf(playerId);
  return house ? deps.passages.openTo(house.id) : [];
}
