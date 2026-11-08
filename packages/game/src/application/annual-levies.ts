import { dateOfDayIndex, dayIndexOf } from '../domain/calendar';
import { NEGOTIATION, TRADE_REASONS } from '../domain/negotiation';
import {
  LEVY_GOODS,
  bundleOfAmounts,
  checkAidBundle,
  checkBundle,
  corveeWorkers,
  dueGoods,
  flattenBundle,
  installmentValue,
  overdueDebt,
  houseSpare,
  isEmptyBundle,
  noMacroGoods,
  scaleBundle,
  suggestSplit,
  sumBundles,
  type LevyAmounts,
  type LevyAnswerLine,
  type LevyPart,
  type MacroBundle,
  type MacroGoods,
} from '../domain/vassalage';
import type { VillageState } from '../domain/village';
import type { Dialog, DialogRepository } from './dialogs';
import type { House, HouseRepository } from './houses';
import { chronicleHouses, houseName, type NegotiationVillages } from './negotiation-chronicle';
import type { Loan, LoanRepository } from './loans';
import type { NegotiationRepository } from './negotiations';
import type { NoticeRepository } from './notices';
import { sendCorvee, sendShipment, type ShipmentDeps } from './shipments';
import type { Vassalage, VassalageRepository } from './vassalages';

// Roční Odvody (vassalage.md – Roční dialog 1. 11.): každý herní rok 1. 11. se vazalovi s domluvenou
// dávkou otevře dialog; neodpoví-li, dialog počká a další 1. 11. o rok naroste (druhý nevznikne),
// každý zmeškaný rok je neplnění. Odpověď pošle zásilky z vsí rodu vazala a zapíše kroniku obou
// rodů a upozornění pánovi. Nic se nevymáhá. Podrobnosti: docs/code/vassalage.md – Roční Odvody.

/** Herní měsíc a den ročního dialogu. */
const LEVY_MONTH = 11;

/** Zaokrouhlovací mez porovnání hodnot splátek (kg obilí). */
const REPAY_EPSILON = 1e-6;

export const NOT_YOUR_DIALOG = 'Tenhle dialog nemáš.';
export const DIALOG_CLOSED = 'Na tenhle dialog už je odpovězeno.';
export const LEVY_ENDED = 'Dohoda už neplatí.';
export const LEVY_NOT_YOUR_VILLAGE = 'Odvádět smí jen vsi tvého rodu.';
export const LEVY_BAD_ANSWER = 'Součet po vsích nesedí s odpovědí.';
export const LEVY_NO_TARGET = 'Pánova cílová ves neexistuje.';
export const LEVY_MESSAGE_TOO_LONG = 'Vzkaz je příliš dlouhý.';

/** Body dialogu Odvody: jen odkaz na vazalství (dávka se čte z živých podmínek). */
export interface LevyBody extends Record<string, unknown> {
  vassalageId: string;
  lordHouseId: string;
}

/** Body dialogu splátky: odkaz na půjčku. */
interface RepayBody extends Record<string, unknown> {
  loanId: string;
  lordHouseId: string;
}

export interface AnnualLevyDeps extends NegotiationVillages {
  dialogs: DialogRepository;
  vassalages: Pick<VassalageRepository, 'allActive' | 'activeOf' | 'byId' | 'addBreach'>;
  houses: Pick<HouseRepository, 'activeOf' | 'byId'>;
  notices: Pick<NoticeRepository, 'post'>;
  /** Půjčky: splátky přijdou v Odvodech jako řádek (bez nich Odvody splátky nenabízejí). */
  loans?: Pick<LoanRepository, 'allActive' | 'byId' | 'pay' | 'addBreach'>;
  /**
   * Tribut z míru (war.md – Konec války): opakovaná platba bez vazalství, přijde v Odvodech jako
   * dialog `tribute-send`; `dayOf` převede čas přijetí na herní den.
   */
  tributes?: Pick<NegotiationRepository, 'peaceTributes'> & { dayOf: (at: Date) => number };
}

/** Závislosti odpovědi: zásilky + dopočet vsi do dneška (composition root: `loadVillage`). */
export interface LevyDeps extends AnnualLevyDeps {
  shipments: ShipmentDeps;
  prepareVillage: (villageId: string, today: number) => Promise<unknown>;
}

/** Herní rok posledního 1. 11. do dne `today` (null – ještě žádný). */
function levyYearOf(today: number): number | null {
  const date = dateOfDayIndex(today);
  const year = date.month >= LEVY_MONTH ? date.year : date.year - 1;
  return year >= dateOfDayIndex(0).year ? year : null;
}

const levyDay = (year: number): number => dayIndexOf({ year, month: LEVY_MONTH, day: 1 });

/**
 * Otevře roční dialogy Odvody (worker 1× za minutu v úlohách světa; doběhne po výpadku: stačí den
 * po 1. 11. a chybějící dialog roku). Vazalství vzniklé až od 1. 11. toho roku se ptá příště.
 * Čekající dialog z minulého roku jen naroste (`years`) a každý zmeškaný rok zapíše neplnění.
 * Opakované volání nic nezdvojí. Vrací, kolik dialogů se otevřelo.
 */
export async function openAnnualDialogs(
  deps: AnnualLevyDeps,
  input: { today: number },
): Promise<number> {
  const year = levyYearOf(input.today);
  if (year === null) return 0;
  const nov1 = levyDay(year);
  let opened = 0;
  for (const v of await deps.vassalages.allActive()) {
    if (!v.terms.tribute || v.sinceDay >= nov1) continue;
    const vassal = await deps.houses.byId(v.vassalHouseId);
    if (!vassal || vassal.playerId === null || vassal.endedAt !== null) continue;

    const waiting = await deps.dialogs.openFor(v.id, 'levy');
    if (waiting) {
      if (waiting.year >= year) continue;
      const added = await deps.dialogs.bumpYears(waiting.key, year);
      // každý zmeškaný 1. 11. je neplnění (zapsané ke dni, kdy se dalo odpovědět)
      for (let i = 0; i < added; i++) {
        await deps.vassalages.addBreach(v.id, 'levy', levyDay(waiting.year + 1 + i));
      }
      continue;
    }
    const created = await deps.dialogs.openOnce(`levy:${v.id}:${year}`, {
      playerId: vassal.playerId,
      kind: 'levy',
      refId: v.id,
      year,
      body: { vassalageId: v.id, lordHouseId: v.lordHouseId } satisfies LevyBody,
    });
    if (!created) continue;
    opened++;
    const lord = await deps.houses.byId(v.lordHouseId);
    await deps.notices.post({
      playerId: vassal.playerId,
      kind: 'levy-pending',
      payload: { lordName: lord ? await houseName(deps, lord) : '', years: 1 },
      gameDay: input.today,
    });
  }
  if (deps.loans) opened += await openRepayDialogs(deps, { year, nov1, today: input.today });
  if (deps.tributes)
    opened += await openTributeDialogs(deps, deps.tributes, { year, nov1, today: input.today });
  return opened;
}

/**
 * Tribut z míru: plátci (rod, který žije) se každý 1. 11. otevře dialog s domluveným zbožím do
 * pánovy – příjemcovy – vsi; čekající dialog jen naroste o rok. Neplnění se nevymáhá, řeší ho
 * hráči (war.md – Konec války). Mír přijatý až od 1. 11. toho roku se ptá příště.
 */
async function openTributeDialogs(
  deps: AnnualLevyDeps,
  tributes: NonNullable<AnnualLevyDeps['tributes']>,
  input: { year: number; nov1: number; today: number },
): Promise<number> {
  let opened = 0;
  for (const t of await tributes.peaceTributes()) {
    if (tributes.dayOf(t.acceptedAt) >= input.nov1) continue;
    const payer = await deps.houses.byId(t.payerHouseId);
    const recipient = await deps.houses.byId(t.recipientHouseId);
    const toVillageId = recipient?.lord?.villageId;
    if (!payer || payer.playerId === null || payer.endedAt !== null || !recipient || !toVillageId) {
      continue;
    }
    const waiting = await deps.dialogs.openFor(t.negotiationId, 'tribute-send');
    if (waiting) {
      if (waiting.year >= input.year) continue;
      const added = await deps.dialogs.bumpYears(waiting.key, input.year);
      // každý zmeškaný 1. 11. je neplnění (zapsané ke dni, kdy se dalo odpovědět)
      for (let i = 0; i < added; i++) {
        const day = levyDay(waiting.year + 1 + i);
        await tributeBreach(
          deps,
          `tribute-missed:${t.negotiationId}:${waiting.year + 1 + i}`,
          payer,
          recipient,
          day,
        );
      }
      continue;
    }
    const created = await deps.dialogs.openOnce(`tribute:${t.negotiationId}:${input.year}`, {
      playerId: payer.playerId,
      kind: 'tribute-send',
      refId: t.negotiationId,
      year: input.year,
      body: {
        negotiationId: t.negotiationId,
        fromHouseId: payer.id,
        toHouseId: recipient.id,
        toVillageId,
        goods: t.goods,
      },
    });
    if (!created) continue;
    opened++;
    await deps.notices.post({
      playerId: payer.playerId,
      kind: 'levy-pending',
      payload: { lordName: await houseName(deps, recipient), years: 1, peace: true },
      gameDay: input.today,
    });
  }
  return opened;
}

/** Neplnění splátky: půjčka a – trvá-li mezi věřitelem a dlužníkem vazalství – i vazalství. */
async function repayBreach(deps: AnnualLevyDeps, loan: Loan, day: number): Promise<void> {
  await deps.loans?.addBreach(loan.id);
  const list = await deps.vassalages.activeOf(loan.debtorHouseId);
  const v = list.find(
    (x) => x.lordHouseId === loan.creditorHouseId && x.vassalHouseId === loan.debtorHouseId,
  );
  if (v) await deps.vassalages.addBreach(v.id, 'repay', day);
}

/**
 * Splátky půjček v Odvodech (vassalage.md – Pomoc na žádost: „Splátky jako dávky“): dlužníkovi
 * s dluhem po splatnosti se 1. 11. otevře dialog `repay` (půjčka je samostatná dohoda – nezávisí
 * na vazalství); čekající dialog naroste a každý zmeškaný rok je neplnění. Vrací počet nových.
 */
async function openRepayDialogs(
  deps: AnnualLevyDeps,
  at: { year: number; nov1: number; today: number },
): Promise<number> {
  let opened = 0;
  for (const loan of (await deps.loans?.allActive()) ?? []) {
    if (loan.sinceDay >= at.nov1) continue;
    const debtor = await deps.houses.byId(loan.debtorHouseId);
    if (!debtor || debtor.playerId === null || debtor.endedAt !== null) continue;
    const waiting = await deps.dialogs.openFor(loan.id, 'repay');
    if (waiting) {
      if (waiting.year >= at.year) continue;
      const added = await deps.dialogs.bumpYears(waiting.key, at.year);
      for (let i = 0; i < added; i++) await repayBreach(deps, loan, levyDay(waiting.year + 1 + i));
      continue;
    }
    if (overdueDebt(loan.schedule, loan.paidKg, at.year) <= REPAY_EPSILON) continue;
    const created = await deps.dialogs.openOnce(`repay:${loan.id}:${at.year}`, {
      playerId: debtor.playerId,
      kind: 'repay',
      refId: loan.id,
      year: at.year,
      body: { loanId: loan.id, lordHouseId: loan.creditorHouseId } satisfies RepayBody,
    });
    if (!created) continue;
    opened++;
    const creditor = await deps.houses.byId(loan.creditorHouseId);
    await deps.notices.post({
      playerId: debtor.playerId,
      kind: 'levy-pending',
      payload: { lordName: creditor ? await houseName(deps, creditor) : '', years: 1, loan: true },
      gameDay: at.today,
    });
  }
  return opened;
}

/** Ves rodu pro Odvody: id, jméno a mapa (sídlo) – jen vsi, které rod drží. */
async function houseVillages(
  deps: Pick<ShipmentDeps, 'settlements' | 'villages'>,
  playerId: string,
): Promise<{ id: string; name: string; cell: { x: number; y: number }; state: unknown }[]> {
  const out = [];
  for (const settlement of await deps.settlements.listActive(playerId)) {
    for (const village of await deps.villages.listBySettlement(settlement.id)) {
      out.push({
        id: village.id,
        name: village.name,
        cell: settlement.worldCell ?? { x: 0, y: 0 },
        state: village.state,
      });
    }
  }
  return out;
}

/** Cílová ves dávky: `targetVillageId` z podmínek, jinak vlastní (sídelní) ves pána. */
function targetOf(v: Vassalage, lordVillageId: string | undefined): string | null {
  return v.terms.targetVillageId ?? lordVillageId ?? null;
}

/** Otevřený dialog Odvody pro rozhraní. */
export interface LevyDialogView {
  dialogId: string;
  /** `levy` – roční dávka vazalství, `repay` – řádek splátky půjčky (samostatná dohoda). */
  kind: 'levy' | 'repay' | 'trade-send' | 'fee-send' | 'tribute-send' | 'judgment';
  /**
   * U `trade-send` (obchod mezi hráči, plán – úloha 4.7) je `lordHouseId` / `lordName` druhá strana
   * obchodu a `agreed` zboží, které má hráč poslat; `vassalageId` je prázdné.
   */
  /** U `repay` prázdné (půjčka nezávisí na vazalství) – místo něj `loanId`. */
  vassalageId: string;
  loanId?: string;
  /** U `repay` dluh po splatnosti v kg obilí (zaplatit smí i jiným zbožím podle hodnoty). */
  owedKg?: number;
  lordHouseId: string;
  lordName: string;
  /** Za kolik let dialog čeká (2 = nepřišla odpověď na minulý 1. 11.). */
  years: number;
  /** Domluvená dávka za všechny čekající roky (roční dávka × `years`). */
  agreed: MacroBundle;
  /**
   * Vsi rodu s předvyplněným dílem podle přebytku; `corveeHands` = kolik lidí může ves poslat na
   * robotu (`corveeWorkers` – dospělí od 16 let, ne muži rodu), podle toho dialog ukáže lidi × dny.
   */
  villages: { villageId: string; name: string; suggested: MacroBundle; corveeHands: number }[];
}

/**
 * Otevřené dialogy Odvody hráče s předvyplněným rozdělením po vsích (počítá se jen na vyžádání –
 * načítá stavy vsí rodu): u každé vsi menší z přebytku a z dopravy do pánovy cílové vsi.
 */
export async function levyDialogs(
  deps: LevyDeps,
  input: { playerId: string },
): Promise<LevyDialogView[]> {
  const out: LevyDialogView[] = [];
  const own = await houseVillages(deps.shipments, input.playerId);
  for (const dialog of await deps.dialogs.listOpen(input.playerId)) {
    if (dialog.kind === 'repay') {
      const view = await repayView(deps, dialog, own);
      if (view) out.push(view);
      continue;
    }
    if (isSendKind(dialog.kind)) {
      const view = await tradeView(deps, dialog, own);
      if (view) out.push(view);
      continue;
    }
    if (dialog.kind !== 'levy') continue;
    const v = await deps.vassalages.byId(dialog.refId);
    if (!v || v.endedAt !== null || !v.terms.tribute) continue;
    const lord = await deps.houses.byId(v.lordHouseId);
    const targetId = targetOf(v, lord?.lord?.villageId);
    const targetCell = targetId ? await cellOfVillage(deps.shipments, targetId) : null;
    const agreed = scaleBundle(v.terms.tribute, dialog.years);
    const spares = own.map((village) => ({
      id: village.id,
      spare: houseSpare(
        [{ state: village.state as never, cell: village.cell }],
        targetCell ?? village.cell,
        noMacroGoods(),
      ),
    }));
    const split = suggestSplit(agreed, spares);
    out.push({
      dialogId: dialog.id,
      kind: 'levy',
      vassalageId: v.id,
      lordHouseId: v.lordHouseId,
      lordName: lord ? await houseName(deps, lord) : '',
      years: dialog.years,
      agreed,
      villages: own.map((village) => ({
        villageId: village.id,
        name: village.name,
        suggested: split[village.id] ?? bundleOfAmounts(sumBundles([])),
        corveeHands: corveeHandsOf(village.state),
      })),
    });
  }
  return out;
}

/** Kolik lidí může ves poslat na robotu (stav vsi v den jejího posledního spočítaného dne). */
function corveeHandsOf(state: unknown): number {
  const village = state as VillageState;
  return corveeWorkers(village, village.lastDay).length;
}

/** Řádek splátky půjčky: dluh po splatnosti a rozdělení po vsích předvyplněné podle přebytku. */
async function repayView(
  deps: LevyDeps,
  dialog: Dialog,
  own: Awaited<ReturnType<typeof houseVillages>>,
): Promise<LevyDialogView | null> {
  const loan = await deps.loans?.byId(dialog.refId);
  if (!loan || loan.status !== 'active') return null;
  const owedKg = overdueDebt(loan.schedule, loan.paidKg, dialog.year);
  const creditor = await deps.houses.byId(loan.creditorHouseId);
  const targetCell = await cellOfVillage(deps.shipments, loan.creditorVillageId);
  // domluvené zboží splátek; po částečné splátce jen dluh přepočtený na obilí
  const agreed = bundleOfGoods(
    loan.paidKg === 0
      ? dueGoods(loan.schedule, dialog.year)
      : { ...noMacroGoods(), grainKg: owedKg },
  );
  const spares = own.map((village) => ({
    id: village.id,
    spare: houseSpare(
      [{ state: village.state as never, cell: village.cell }],
      targetCell ?? village.cell,
      noMacroGoods(),
    ),
  }));
  const split = suggestSplit(agreed, spares);
  return {
    dialogId: dialog.id,
    kind: 'repay',
    vassalageId: '',
    loanId: loan.id,
    owedKg,
    lordHouseId: loan.creditorHouseId,
    lordName: creditor ? await houseName(deps, creditor) : '',
    years: dialog.years,
    agreed,
    villages: own.map((village) => ({
      villageId: village.id,
      name: village.name,
      suggested: split[village.id] ?? bundleOfAmounts(sumBundles([])),
      corveeHands: 0,
    })),
  };
}

/** Body dialogu obchodu (`openTradeDialogs` v `negotiate.ts`). */
interface TradeBody {
  fromHouseId: string;
  toHouseId: string;
  toVillageId: string;
  goods: MacroBundle;
  /** Jen u rozsudku (`judgment`): dohoda obžalovaného s pánem (zápis neplnění) a pán. */
  vassalageId?: string;
  lordHouseId?: string;
}

/** Dialogy odeslání zboží druhé straně: obchod, poplatek z míru a tribut z míru (stejná odpověď). */
type SendKind = 'trade-send' | 'fee-send' | 'tribute-send' | 'judgment';
const isSendKind = (kind: string): kind is SendKind =>
  kind === 'trade-send' || kind === 'fee-send' || kind === 'tribute-send' || kind === 'judgment';

const tradeBodyOf = (dialog: Dialog): TradeBody => dialog.body as unknown as TradeBody;

/** Dialog odeslání obchodu: dohodnuté zboží, rozdělení po vsích předvyplněné podle přebytku. */
async function tradeView(
  deps: LevyDeps,
  dialog: Dialog,
  own: Awaited<ReturnType<typeof houseVillages>>,
): Promise<LevyDialogView | null> {
  const body = tradeBodyOf(dialog);
  const partner = await deps.houses.byId(body.toHouseId);
  const targetCell = await cellOfVillage(deps.shipments, body.toVillageId);
  const spares = own.map((village) => ({
    id: village.id,
    spare: houseSpare(
      [{ state: village.state as never, cell: village.cell }],
      targetCell ?? village.cell,
      noMacroGoods(),
    ),
  }));
  const split = suggestSplit(body.goods, spares);
  return {
    dialogId: dialog.id,
    kind: dialog.kind as SendKind,
    vassalageId: '',
    lordHouseId: body.toHouseId,
    lordName: partner ? await houseName(deps, partner) : '',
    years: dialog.kind === 'tribute-send' ? dialog.years : 1,
    agreed: dialog.kind === 'tribute-send' ? scaleBundle(body.goods, dialog.years) : body.goods,
    villages: own.map((village) => ({
      villageId: village.id,
      name: village.name,
      suggested: split[village.id] ?? bundleOfAmounts(sumBundles([])),
      corveeHands: 0,
    })),
  };
}

/** Zboží bez lidí a roboty jako svazek. */
function bundleOfGoods(goods: MacroGoods): MacroBundle {
  return { ...goods, people: { families: 0, men: 0, women: 0 }, laborDays: 0 };
}

async function cellOfVillage(
  deps: Pick<ShipmentDeps, 'settlements' | 'villages'>,
  villageId: string,
): Promise<{ x: number; y: number } | null> {
  const village = await deps.villages.find(villageId);
  const settlement = village ? await deps.settlements.find(village.settlementId) : null;
  return settlement?.worldCell ? { x: settlement.worldCell.x, y: settlement.worldCell.y } : null;
}

export type AnswerLevyResult =
  { ok: true; arrivesDay: number | null; dialog: Dialog } | { ok: false; reason: string };

/**
 * Vazal odpoví na dialog Odvody: `split` = co pošle která ves rodu (id vsi → svazek), `lines` =
 * totéž po řádcích celkem (musí souhlasit se součtem `split`), `message` = vzkaz pánovi. Zásilky
 * jdou po jedné vsi (zámky po sobě, ne naráz) s jedinečným klíčem `levy:<dialog>:<ves>` –
 * opakování po pádu nebo dvojklik nic nezdvojí. Teprve potom se dialog podmíněně uzavře a vítěz
 * zapíše kroniku obou rodů, upozornění pánovi (co, kdy dorazí, vzkaz) a méně než domluveno
 * jako neplnění (`addBreach`). Posílat víc než domluveno smí.
 */
export async function answerLevy(
  deps: LevyDeps,
  input: {
    playerId: string;
    dialogId: string;
    lines: LevyAnswerLine[];
    split: Record<string, MacroBundle>;
    message: string | null;
    today: number;
  },
): Promise<AnswerLevyResult> {
  const dialog = await deps.dialogs.byId(input.dialogId);
  if (
    !dialog ||
    dialog.playerId !== input.playerId ||
    (dialog.kind !== 'levy' && dialog.kind !== 'repay' && !isSendKind(dialog.kind))
  ) {
    return { ok: false, reason: NOT_YOUR_DIALOG };
  }
  if (dialog.status !== 'open') return { ok: false, reason: DIALOG_CLOSED };
  if (input.message !== null && input.message.length > NEGOTIATION.messageMaxChars) {
    return { ok: false, reason: LEVY_MESSAGE_TOO_LONG };
  }
  if (dialog.kind === 'repay') return answerRepay(deps, dialog, input);
  if (isSendKind(dialog.kind)) return answerTrade(deps, dialog, input);
  const v = await deps.vassalages.byId(dialog.refId);
  if (!v || v.endedAt !== null || !v.terms.tribute) return { ok: false, reason: LEVY_ENDED };
  const vassal = await deps.houses.activeOf(input.playerId);
  if (!vassal || vassal.id !== v.vassalHouseId) return { ok: false, reason: NOT_YOUR_DIALOG };
  const lord = await deps.houses.byId(v.lordHouseId);

  const checked = await checkAnswer(deps, input);
  if (!checked.ok) return checked;
  const { shipping, sent } = checked;

  let arrivesDay: number | null = null;
  if (shipping.length > 0) {
    const targetId = targetOf(v, lord?.lord?.villageId);
    if (!targetId) return { ok: false, reason: LEVY_NO_TARGET };
    for (const [villageId, bundle] of shipping) {
      await deps.prepareVillage(villageId, input.today);
      // zboží a lidé (natrvalo) zásilkou, robota lidmi na čas (vassalage.md – Lidé a robota)
      const goods: MacroBundle = { ...bundle, laborDays: 0 };
      if (!isEmptyBundle(goods)) {
        const result = await sendShipment(deps.shipments, {
          fromVillageId: villageId,
          toVillageId: targetId,
          bundle: goods,
          purpose: 'levy',
          refId: `levy:${dialog.id}:${villageId}`,
          today: input.today,
        });
        if (!result.ok) return { ok: false, reason: result.reason };
        arrivesDay = Math.max(arrivesDay ?? 0, result.arrivesDay);
      }
      if (bundle.laborDays > 0) {
        const corvee = await sendCorvee(deps.shipments, {
          fromVillageId: villageId,
          toVillageId: targetId,
          laborDays: bundle.laborDays,
          refId: `levy:${dialog.id}:${villageId}:corvee`,
          today: input.today,
        });
        if (!corvee.ok) return { ok: false, reason: corvee.reason };
        arrivesDay = Math.max(arrivesDay ?? 0, corvee.arrivesDay);
      }
    }
  }

  // dialog uzavře jediné volání – ostatní (dvojklik) dostanou DIALOG_CLOSED a nic nezdvojí
  if (!(await deps.dialogs.answer(dialog.id, 'open'))) {
    return { ok: false, reason: DIALOG_CLOSED };
  }

  const agreed = flattenBundle(scaleBundle(v.terms.tribute, dialog.years));
  const parts: LevyPart[] = LEVY_GOODS.filter((g) => agreed[g] > 0 || sent[g] > 0).map((good) => ({
    good,
    sent: sent[good],
    agreed: agreed[good],
  }));
  if (LEVY_GOODS.some((g) => sent[g] < agreed[g])) {
    await deps.vassalages.addBreach(v.id, 'levy', input.today);
  }
  const lordName = lord ? await houseName(deps, lord) : '';
  const vassalName = await houseName(deps, vassal);
  const sides = [lord, vassal].filter((h) => h !== null);
  await chronicleHouses(deps, sides, `levy:${dialog.id}`, {
    day: input.today,
    kind: 'levy',
    lord: lordName,
    vassal: vassalName,
    years: dialog.years,
    parts,
  });
  if (lord?.playerId) {
    await deps.notices.post({
      playerId: lord.playerId,
      kind: 'levy-sent',
      payload: {
        vassalName,
        years: dialog.years,
        // jen odeslané řádky, bez id účtů
        parts: parts.filter((p) => p.sent > 0),
        arrivesDay,
        ...(input.message ? { message: input.message } : {}),
      },
      gameDay: input.today,
    });
  }
  return { ok: true, arrivesDay, dialog: { ...dialog, status: 'answered' } };
}

/** Společná kontrola odpovědi: jen vsi rodu, čísla v mezích, řádky souhlasí se součtem po vsích. */
async function checkAnswer(
  deps: LevyDeps,
  input: {
    playerId: string;
    lines: LevyAnswerLine[];
    split: Record<string, MacroBundle>;
  },
): Promise<
  { ok: true; shipping: [string, MacroBundle][]; sent: LevyAmounts } | { ok: false; reason: string }
> {
  // jen vsi rodu vazala (ne spravované cizí) a smysluplná čísla
  const own = new Set((await houseVillages(deps.shipments, input.playerId)).map((x) => x.id));
  const shipping: [string, MacroBundle][] = [];
  for (const [villageId, bundle] of Object.entries(input.split)) {
    if (isEmptyBundle(bundle)) continue;
    if (!own.has(villageId)) return { ok: false, reason: LEVY_NOT_YOUR_VILLAGE };
    const bad = checkBundle(bundle);
    if (bad) return { ok: false, reason: bad };
    shipping.push([villageId, bundle]);
  }
  const sent = sumBundles(shipping.map(([, b]) => b));
  const stated: Record<string, number> = {};
  for (const line of input.lines) stated[line.good] = (stated[line.good] ?? 0) + line.amount;
  for (const good of LEVY_GOODS) {
    if (Math.abs((stated[good] ?? 0) - sent[good]) > 1e-6) {
      return { ok: false, reason: LEVY_BAD_ANSWER };
    }
  }
  return { ok: true, shipping, sent };
}

/**
 * Odpověď na řádek splátky půjčky: pošle zboží z vsí rodu dlužníka do věřitelovy vsi (klíč
 * `repay:<dialog>:<ves>`), zapíše zaplacenou hodnotu (jiné zboží platí podle hodnoty –
 * `installmentValue`) a míň než dluh po splatnosti je neplnění (půjčka i vazalství, pokud trvá).
 * Půjčka je samostatná dohoda: odpovědět lze i po vypovězení vazalství.
 */
async function answerRepay(
  deps: LevyDeps,
  dialog: Dialog,
  input: {
    playerId: string;
    lines: LevyAnswerLine[];
    split: Record<string, MacroBundle>;
    message: string | null;
    today: number;
  },
): Promise<AnswerLevyResult> {
  const loan = await deps.loans?.byId(dialog.refId);
  if (!loan || loan.status !== 'active') return { ok: false, reason: LEVY_ENDED };
  const debtor = await deps.houses.activeOf(input.playerId);
  if (!debtor || debtor.id !== loan.debtorHouseId) return { ok: false, reason: NOT_YOUR_DIALOG };
  const checked = await checkAnswer(deps, input);
  if (!checked.ok) return checked;
  const { shipping, sent } = checked;
  const owedKg = overdueDebt(loan.schedule, loan.paidKg, dialog.year);

  let arrivesDay: number | null = null;
  for (const [villageId, bundle] of shipping) {
    await deps.prepareVillage(villageId, input.today);
    const result = await sendShipment(deps.shipments, {
      fromVillageId: villageId,
      toVillageId: loan.creditorVillageId,
      bundle,
      purpose: 'repay',
      refId: `repay:${dialog.id}:${villageId}`,
      today: input.today,
    });
    if (!result.ok) return { ok: false, reason: result.reason };
    arrivesDay = Math.max(arrivesDay ?? 0, result.arrivesDay);
  }
  if (!(await deps.dialogs.answer(dialog.id, 'open'))) {
    return { ok: false, reason: DIALOG_CLOSED };
  }

  const paidKg = installmentValue(bundleOfGoods(sentGoods(sent)));
  await deps.loans?.pay(loan.id, paidKg, deps.shipments.now());
  if (paidKg + REPAY_EPSILON < owedKg) await repayBreach(deps, loan, input.today);
  const creditor = await deps.houses.byId(loan.creditorHouseId);
  if (creditor?.playerId) {
    const parts: LevyPart[] = LEVY_GOODS.filter((g) => sent[g] > 0).map((good) => ({
      good,
      sent: sent[good],
      agreed: 0,
    }));
    await deps.notices.post({
      playerId: creditor.playerId,
      kind: 'levy-sent',
      payload: {
        vassalName: await houseName(deps, debtor),
        years: dialog.years,
        parts,
        arrivesDay,
        loan: true,
        ...(input.message ? { message: input.message } : {}),
      },
      gameDay: input.today,
    });
  }
  return { ok: true, arrivesDay, dialog: { ...dialog, status: 'answered' } };
}

/**
 * Odpověď na dialog obchodu (vassalage.md – Hospodářství mezi hráči): pošle zboží z vsí rodu do
 * domluvené vsi druhé strany (klíč `trade:<dialog>:<ves>`; doveze ten, kdo posílá). Celé, míň,
 * nebo nic – nic se nevynucuje; druhá strana dostane upozornění, co a kdy dorazí (a že poslal
 * míň než domluveno). Lidé ani robota v obchodu nejsou.
 */
async function answerTrade(
  deps: LevyDeps,
  dialog: Dialog,
  input: {
    playerId: string;
    lines: LevyAnswerLine[];
    split: Record<string, MacroBundle>;
    message: string | null;
    today: number;
  },
): Promise<AnswerLevyResult> {
  const body = tradeBodyOf(dialog);
  const sender = await deps.houses.activeOf(input.playerId);
  if (!sender || sender.id !== body.fromHouseId) return { ok: false, reason: NOT_YOUR_DIALOG };
  for (const bundle of Object.values(input.split)) {
    // rozsudek smí ukládat i lidi (vrácení lidí) a poplatek z míru také (war.md – Konec války);
    // obchod a tribut jen zboží
    const withPeople = dialog.kind === 'judgment' || dialog.kind === 'fee-send';
    if (!withPeople && !isEmptyBundle(bundle) && checkAidBundle(bundle) !== null) {
      return { ok: false, reason: TRADE_REASONS.badGoods };
    }
  }
  const checked = await checkAnswer(deps, input);
  if (!checked.ok) return checked;
  const { shipping, sent } = checked;

  let arrivesDay: number | null = null;
  for (const [villageId, bundle] of shipping) {
    await deps.prepareVillage(villageId, input.today);
    const result = await sendShipment(deps.shipments, {
      fromVillageId: villageId,
      toVillageId: body.toVillageId,
      bundle,
      purpose: 'trade',
      refId: `${dialog.kind.replace('-send', '')}:${dialog.id}:${villageId}`,
      today: input.today,
    });
    if (!result.ok) return { ok: false, reason: result.reason };
    arrivesDay = Math.max(arrivesDay ?? 0, result.arrivesDay);
  }
  if (!(await deps.dialogs.answer(dialog.id, 'open'))) {
    return { ok: false, reason: DIALOG_CLOSED };
  }

  const agreed = flattenBundle(
    dialog.kind === 'tribute-send' ? scaleBundle(body.goods, dialog.years) : body.goods,
  );
  const parts: LevyPart[] = LEVY_GOODS.filter((g) => agreed[g] > 0 || sent[g] > 0).map((good) => ({
    good,
    sent: sent[good],
    agreed: agreed[good],
  }));
  const short = LEVY_GOODS.some((g) => sent[g] < agreed[g]);
  if (dialog.kind === 'judgment' && short)
    await judgmentBreach(deps, dialog, body, sender, input.today);
  const partner = await deps.houses.byId(body.toHouseId);
  if (dialog.kind === 'tribute-send' && short && partner) {
    await tributeBreach(deps, `tribute:${dialog.id}`, sender, partner, input.today);
  }
  if (partner?.playerId) {
    await deps.notices.post({
      playerId: partner.playerId,
      kind: 'levy-sent',
      payload: {
        vassalName: await houseName(deps, sender),
        years: 1,
        // jen odeslané řádky; `short` – poslal míň, než bylo domluveno (nic se nevynucuje)
        parts: parts.filter((p) => p.sent > 0),
        arrivesDay,
        trade: true,
        ...(dialog.kind === 'judgment' ? { judgment: true } : {}),
        short,
        ...(input.message ? { message: input.message } : {}),
      },
      gameDay: input.today,
    });
  }
  return { ok: true, arrivesDay, dialog: { ...dialog, status: 'answered' } };
}

/**
 * Rozsudek splněn míň než uloženo (nebo vůbec): neplnění vůči pánovi a zápis do kronik obžalovaného
 * a pána – „Ctibor neposlechl pána“. Nic dalšího se nevynucuje (vassalage.md – Mír a spory).
 */
async function judgmentBreach(
  deps: LevyDeps,
  dialog: Dialog,
  body: TradeBody,
  defendant: House,
  today: number,
): Promise<void> {
  if (body.vassalageId) await deps.vassalages.addBreach(body.vassalageId, 'judgment', today);
  const lord = body.lordHouseId ? await deps.houses.byId(body.lordHouseId) : null;
  await chronicleHouses(deps, [defendant, ...(lord ? [lord] : [])], `judgment:${dialog.id}`, {
    day: today,
    kind: 'disobeyed',
    name: await houseName(deps, defendant),
  });
}

/**
 * Tribut z míru nesplněn celý (war.md – Konec války: „neplnění se zapíše a řešení je na hráčích“):
 * záznam do kronik obou rodů a – trvá-li mezi nimi vazalství (plátce vazal příjemce) – i neplnění
 * dohody. Nic se nevynucuje.
 */
async function tributeBreach(
  deps: AnnualLevyDeps,
  ref: string,
  payer: House,
  recipient: House,
  day: number,
): Promise<void> {
  const list = await deps.vassalages.activeOf(payer.id);
  const v = list.find((x) => x.lordHouseId === recipient.id && x.vassalHouseId === payer.id);
  if (v) await deps.vassalages.addBreach(v.id, 'levy', day);
  await chronicleHouses(deps, [payer, recipient], ref, {
    day,
    kind: 'tribute-short',
    payer: await houseName(deps, payer),
    recipient: await houseName(deps, recipient),
  });
}

/** Odvedené řádky jako zboží (lidé a robota u splátek nejsou). */
function sentGoods(sent: LevyAmounts): MacroGoods {
  return {
    grainKg: sent.grainKg,
    hayKg: sent.hayKg,
    cattle: { cows: sent.cows, youngOxen: sent.youngOxen, trainedOxen: sent.trainedOxen },
    horses: sent.horses,
    logs: sent.logs,
    stoneM3: sent.stoneM3,
  };
}
