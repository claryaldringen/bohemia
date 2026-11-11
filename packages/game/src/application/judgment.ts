import { dateOfDayIndex } from '../domain/calendar';
import { NEGOTIATION } from '../domain/negotiation';
import {
  VASSALAGE,
  checkAidBundle,
  isEmptyBundle,
  noMacroGoods,
  type MacroBundle,
} from '../domain/vassalage';
import { tradePeopleCount, type TradePeople } from '../domain/village';
import type { DialogRepository } from './dialogs';
import type { Dispute, DisputeRepository, Verdict } from './disputes';
import type { HouseRepository } from './houses';
import { NO_HOUSE } from './negotiate';
import { chronicleHouses, houseName, type NegotiationVillages } from './negotiation-chronicle';
import type { NoticeRepository } from './notices';
import type { VassalageRepository } from './vassalages';

// Rozsudek pána (vassalage.md – Mír a spory; Martin 2. 11. 2026: „Vyřeší se tím de iure stránka
// sporu, de facto se bude řešit až následně“). Žaloba vazala na druhého vazala téhož pána →
// vyjádření → rozsudek. Hra nic nevynucuje: náhrada a vrácení lidí jsou dialog jako u dávek
// (celé, míň, nic), nesplnění se zapíše jako neplnění; rozsudek „mír“ válku nezakáže, jen ji při
// vypuknutí zapíše jako neposlušnost. Podrobnosti: docs/code/vassalage.md – Spory a rozsudek.

const JUDGMENT_REASONS = {
  notFellows: 'Žalovat smíš jen vazala svého pána.',
  noMessage: 'Napiš pánovi, o co jde.',
  messageTooLong: 'Vzkaz je příliš dlouhý.',
  running: 'Spor s tímto rodem už běží.',
  notFound: 'Takový spor není.',
  notYours: 'Tenhle spor nesoudíš ty.',
  notDefendant: 'Vyjádřit se smí jen obžalovaný.',
  answered: 'Vyjádření už je podáno.',
  closed: 'Spor už je rozsouzen.',
  wait: 'Obžalovaný se může do jednoho dne vyjádřit.',
  noLongerVassals: 'Žalobce nebo obžalovaný už není tvým vazalem.',
  badVerdict: 'Rozsudek nic neukládá.',
  noTarget: 'Žalobce nemá ves, kam by se dalo poslat.',
  extinct: 'Ten rod už není.',
} as const;

export interface JudgmentDeps extends NegotiationVillages {
  disputes: DisputeRepository;
  houses: Pick<HouseRepository, 'activeOf' | 'byId'>;
  vassalages: Pick<VassalageRepository, 'activeOf' | 'addBreach'>;
  dialogs: Pick<DialogRepository, 'openOnce'>;
  notices: Pick<NoticeRepository, 'post'>;
  now: () => Date;
}

export type JudgmentResult = { ok: true; dispute: Dispute } | { ok: false; reason: string };

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** Pán, kterého mají rody `a` a `b` společného (živá vazalství); null – žádný. */
async function commonLord(
  deps: Pick<JudgmentDeps, 'vassalages'>,
  a: string,
  b: string,
): Promise<string | null> {
  const lordsOf = async (house: string): Promise<string[]> =>
    (await deps.vassalages.activeOf(house))
      .filter((v) => v.vassalHouseId === house)
      .map((v) => v.lordHouseId);
  const bs = new Set(await lordsOf(b));
  return (await lordsOf(a)).find((l) => bs.has(l)) ?? null;
}

/** Vazal žaluje jiného vazala téhož pána; pán dostane upozornění. */
export async function fileComplaint(
  deps: JudgmentDeps,
  input: { playerId: string; against: string; message: string; today: number },
): Promise<JudgmentResult> {
  const from = await deps.houses.activeOf(input.playerId);
  if (!from) return fail(NO_HOUSE);
  const defendant = await deps.houses.byId(input.against);
  if (!defendant || defendant.endedAt !== null || defendant.id === from.id) {
    return fail(JUDGMENT_REASONS.extinct);
  }
  const message = input.message.trim();
  if (message === '') return fail(JUDGMENT_REASONS.noMessage);
  if (message.length > NEGOTIATION.messageMaxChars) return fail(JUDGMENT_REASONS.messageTooLong);
  const lordId = await commonLord(deps, from.id, defendant.id);
  if (!lordId) return fail(JUDGMENT_REASONS.notFellows);
  const dispute = await deps.disputes.file({
    lordHouseId: lordId,
    plaintiffHouseId: from.id,
    defendantHouseId: defendant.id,
    message,
    filedAt: deps.now(),
    filedDay: input.today,
  });
  if (!dispute) return fail(JUDGMENT_REASONS.running);
  const lord = await deps.houses.byId(lordId);
  if (lord?.playerId) {
    await deps.notices.post({
      playerId: lord.playerId,
      kind: 'complaint-filed',
      payload: {
        disputeId: dispute.id,
        name: await houseName(deps, from),
        otherName: await houseName(deps, defendant),
      },
      gameDay: input.today,
    });
  }
  return { ok: true, dispute };
}

/** Obžalovaný se vyjádří (jednou); pán dostane upozornění. */
export async function answerComplaint(
  deps: JudgmentDeps,
  input: { playerId: string; disputeId: string; statement: string; today: number },
): Promise<JudgmentResult> {
  const house = await deps.houses.activeOf(input.playerId);
  if (!house) return fail(NO_HOUSE);
  const dispute = await deps.disputes.byId(input.disputeId);
  if (!dispute) return fail(JUDGMENT_REASONS.notFound);
  if (dispute.defendantHouseId !== house.id) return fail(JUDGMENT_REASONS.notDefendant);
  if (dispute.status !== 'filed') return fail(JUDGMENT_REASONS.closed);
  const statement = input.statement.trim();
  if (statement === '') return fail(JUDGMENT_REASONS.noMessage);
  if (statement.length > NEGOTIATION.messageMaxChars) return fail(JUDGMENT_REASONS.messageTooLong);
  if (!(await deps.disputes.answer(dispute.id, statement))) return fail(JUDGMENT_REASONS.answered);
  const lord = await deps.houses.byId(dispute.lordHouseId);
  if (lord?.playerId) {
    await deps.notices.post({
      playerId: lord.playerId,
      kind: 'complaint-answered',
      payload: { disputeId: dispute.id, name: await houseName(deps, house) },
      gameDay: input.today,
    });
  }
  return { ok: true, dispute: { ...dispute, statement } };
}

/** Může pán soudit už teď? Po vyjádření, nebo když od žaloby uplynul 1 skutečný den. */
export function canJudgeNow(dispute: Dispute, now: Date): boolean {
  return (
    dispute.status === 'filed' &&
    (dispute.statement !== null ||
      now.getTime() - dispute.filedAt.getTime() >= VASSALAGE.verdictAfterMs)
  );
}

const DAYS_PER_YEAR = 365.25;

/** Svazek rozsudku pro dialog; null – rozsudek nic neukládá. */
function bundleOf(verdict: Verdict): MacroBundle | null {
  if (verdict.kind === 'compensation') {
    return isEmptyBundle(verdict.bundle) ? null : verdict.bundle;
  }
  if (verdict.kind === 'return-people') {
    return tradePeopleCount(verdict.people) > 0
      ? { ...noMacroGoods(), people: verdict.people, laborDays: 0 }
      : null;
  }
  return null;
}

/** Kontrola čísel rozsudku (jen zboží bez lidí a roboty u náhrady, lidé u vrácení). */
function checkVerdict(verdict: Verdict): string | null {
  if (verdict.kind === 'compensation') {
    const bad = isEmptyBundle(verdict.bundle) ? JUDGMENT_REASONS.badVerdict : null;
    return bad ?? checkAidBundle(verdict.bundle);
  }
  if (verdict.kind === 'return-people') {
    const p: TradePeople = verdict.people;
    const whole = [p.families, p.men, p.women].every((n) => Number.isInteger(n) && n >= 0);
    return whole && tradePeopleCount(p) > 0 ? null : JUDGMENT_REASONS.badVerdict;
  }
  return null;
}

/**
 * Pán vynese rozsudek. Náhrada a vrácení lidí otevřou obžalovanému dialog `judgment` (zboží,
 * resp. lidé do žalobcovy hlavní vsi); mír a zamítnutí jen spor uzavřou. Obě strany dostanou
 * upozornění. Soudit smí jen pán, jemuž oba rody dosud přísahají.
 */
export async function judgeDispute(
  deps: JudgmentDeps,
  input: { playerId: string; disputeId: string; verdict: Verdict; today: number },
): Promise<JudgmentResult> {
  const lord = await deps.houses.activeOf(input.playerId);
  if (!lord) return fail(NO_HOUSE);
  const dispute = await deps.disputes.byId(input.disputeId);
  if (!dispute) return fail(JUDGMENT_REASONS.notFound);
  if (dispute.lordHouseId !== lord.id) return fail(JUDGMENT_REASONS.notYours);
  if (dispute.status !== 'filed') return fail(JUDGMENT_REASONS.closed);
  if (!canJudgeNow(dispute, deps.now())) return fail(JUDGMENT_REASONS.wait);
  const bad = checkVerdict(input.verdict);
  if (bad) return fail(bad);
  const own = await deps.vassalages.activeOf(lord.id);
  const vassalageOf = (houseId: string): string | null =>
    own.find((v) => v.lordHouseId === lord.id && v.vassalHouseId === houseId)?.id ?? null;
  const defendantVassalage = vassalageOf(dispute.defendantHouseId);
  if (!defendantVassalage || !vassalageOf(dispute.plaintiffHouseId)) {
    return fail(JUDGMENT_REASONS.noLongerVassals);
  }
  const plaintiff = await deps.houses.byId(dispute.plaintiffHouseId);
  const defendant = await deps.houses.byId(dispute.defendantHouseId);
  if (!plaintiff || !defendant) return fail(JUDGMENT_REASONS.extinct);
  const bundle = bundleOf(input.verdict);
  const targetVillageId = plaintiff.lord?.villageId ?? null;
  if (bundle && !targetVillageId) return fail(JUDGMENT_REASONS.noTarget);

  const peaceUntilDay =
    input.verdict.kind === 'peace'
      ? Math.round(input.today + VASSALAGE.judgmentPeaceYears * DAYS_PER_YEAR)
      : null;
  if (!(await deps.disputes.judge(dispute.id, input.verdict, input.today, peaceUntilDay))) {
    return fail(JUDGMENT_REASONS.closed);
  }
  if (bundle && targetVillageId && defendant.playerId !== null) {
    await deps.dialogs.openOnce(`judgment:${dispute.id}`, {
      playerId: defendant.playerId,
      kind: 'judgment',
      // s koncem vazalství obžalovaného dialog zmizí (`dropFor`)
      refId: defendantVassalage,
      year: dateOfDayIndex(input.today).year,
      body: {
        disputeId: dispute.id,
        vassalageId: defendantVassalage,
        lordHouseId: lord.id,
        fromHouseId: defendant.id,
        toHouseId: plaintiff.id,
        toVillageId: targetVillageId,
        goods: bundle,
      },
    });
  }
  const lordName = await houseName(deps, lord);
  for (const [side, other] of [
    [plaintiff, defendant],
    [defendant, plaintiff],
  ] as const) {
    if (side.playerId === null) continue;
    await deps.notices.post({
      playerId: side.playerId,
      kind: 'judgment-given',
      payload: {
        disputeId: dispute.id,
        lordName,
        otherName: await houseName(deps, other),
        verdict: input.verdict.kind,
        asDefendant: side.id === defendant.id,
      },
      gameDay: input.today,
    });
  }
  return { ok: true, dispute: { ...dispute, status: 'judged', verdict: input.verdict } };
}

export interface BrokenPeaceDeps extends NegotiationVillages {
  disputes: Pick<DisputeRepository, 'peaceBetween' | 'markBroken'>;
  houses: Pick<HouseRepository, 'byId'>;
  vassalages: Pick<VassalageRepository, 'activeOf' | 'addBreach'>;
}

/**
 * Vypukla válka mezi rody `aggressor` a `other`: platí-li mezi nimi rozsudek „mír“, zapíše se
 * agresorovi neplnění vůči pánovi a do kronik „Ctibor neposlechl pána“. Válku to nezakáže ani
 * nezastaví (návrh Clauda); každému rodu se zapíše jednou na rozsudek. Vrací, zda se zapsalo.
 */
export async function noteBrokenPeace(
  deps: BrokenPeaceDeps,
  input: { aggressorId: string; otherId: string; today: number },
): Promise<boolean> {
  const dispute = await deps.disputes.peaceBetween(input.aggressorId, input.otherId, input.today);
  if (!dispute) return false;
  if (!(await deps.disputes.markBroken(dispute.id, input.aggressorId))) return false;
  const vassalage = (await deps.vassalages.activeOf(input.aggressorId)).find(
    (v) => v.lordHouseId === dispute.lordHouseId && v.vassalHouseId === input.aggressorId,
  );
  if (vassalage) await deps.vassalages.addBreach(vassalage.id, 'judgment', input.today);
  const aggressor = await deps.houses.byId(input.aggressorId);
  const lord = await deps.houses.byId(dispute.lordHouseId);
  if (!aggressor) return true;
  await chronicleHouses(
    deps,
    [aggressor, ...(lord ? [lord] : [])],
    `disobeyed:${dispute.id}:${aggressor.id}`,
    { day: input.today, kind: 'disobeyed', name: await houseName(deps, aggressor) },
  );
  return true;
}
