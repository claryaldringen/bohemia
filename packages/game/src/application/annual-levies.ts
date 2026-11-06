import { dateOfDayIndex, dayIndexOf } from '../domain/calendar';
import { NEGOTIATION } from '../domain/negotiation';
import {
  LEVY_GOODS,
  bundleOfAmounts,
  checkBundle,
  flattenBundle,
  houseSpare,
  isEmptyBundle,
  noMacroGoods,
  scaleBundle,
  suggestSplit,
  sumBundles,
  type LevyAnswerLine,
  type LevyPart,
  type MacroBundle,
} from '../domain/vassalage';
import type { Dialog, DialogRepository } from './dialogs';
import type { HouseRepository } from './houses';
import { chronicleHouses, houseName, type NegotiationVillages } from './negotiation-chronicle';
import type { NoticeRepository } from './notices';
import { sendShipment, type ShipmentDeps } from './shipments';
import type { Vassalage, VassalageRepository } from './vassalages';

// Roční Odvody (vassalage.md – Roční dialog 1. 11.): každý herní rok 1. 11. se vazalovi s domluvenou
// dávkou otevře dialog; neodpoví-li, dialog počká a další 1. 11. o rok naroste (druhý nevznikne),
// každý zmeškaný rok je neplnění. Odpověď pošle zásilky z vsí rodu vazala a zapíše kroniku obou
// rodů a upozornění pánovi. Nic se nevymáhá. Podrobnosti: docs/code/vassalage.md – Roční Odvody.

/** Herní měsíc a den ročního dialogu. */
const LEVY_MONTH = 11;

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

export interface AnnualLevyDeps extends NegotiationVillages {
  dialogs: DialogRepository;
  vassalages: Pick<VassalageRepository, 'allActive' | 'byId' | 'addBreach'>;
  houses: Pick<HouseRepository, 'activeOf' | 'byId'>;
  notices: Pick<NoticeRepository, 'post'>;
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
  vassalageId: string;
  lordHouseId: string;
  lordName: string;
  /** Za kolik let dialog čeká (2 = nepřišla odpověď na minulý 1. 11.). */
  years: number;
  /** Domluvená dávka za všechny čekající roky (roční dávka × `years`). */
  agreed: MacroBundle;
  /** Vsi rodu s předvyplněným dílem podle přebytku. */
  villages: { villageId: string; name: string; suggested: MacroBundle }[];
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
      vassalageId: v.id,
      lordHouseId: v.lordHouseId,
      lordName: lord ? await houseName(deps, lord) : '',
      years: dialog.years,
      agreed,
      villages: own.map((village) => ({
        villageId: village.id,
        name: village.name,
        suggested: split[village.id] ?? bundleOfAmounts(sumBundles([])),
      })),
    });
  }
  return out;
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
  if (!dialog || dialog.playerId !== input.playerId || dialog.kind !== 'levy') {
    return { ok: false, reason: NOT_YOUR_DIALOG };
  }
  if (dialog.status !== 'open') return { ok: false, reason: DIALOG_CLOSED };
  if (input.message !== null && input.message.length > NEGOTIATION.messageMaxChars) {
    return { ok: false, reason: LEVY_MESSAGE_TOO_LONG };
  }
  const v = await deps.vassalages.byId(dialog.refId);
  if (!v || v.endedAt !== null || !v.terms.tribute) return { ok: false, reason: LEVY_ENDED };
  const vassal = await deps.houses.activeOf(input.playerId);
  if (!vassal || vassal.id !== v.vassalHouseId) return { ok: false, reason: NOT_YOUR_DIALOG };
  const lord = await deps.houses.byId(v.lordHouseId);

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

  let arrivesDay: number | null = null;
  if (shipping.length > 0) {
    const targetId = targetOf(v, lord?.lord?.villageId);
    if (!targetId) return { ok: false, reason: LEVY_NO_TARGET };
    for (const [villageId, bundle] of shipping) {
      await deps.prepareVillage(villageId, input.today);
      const result = await sendShipment(deps.shipments, {
        fromVillageId: villageId,
        toVillageId: targetId,
        bundle,
        purpose: 'levy',
        refId: `levy:${dialog.id}:${villageId}`,
        today: input.today,
      });
      if (!result.ok) return { ok: false, reason: result.reason };
      arrivesDay = Math.max(arrivesDay ?? 0, result.arrivesDay);
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
