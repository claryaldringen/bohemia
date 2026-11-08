import {
  ageYears,
  announcePassage,
  answerNpcSummons,
  answerPassage,
  answerSummons,
  houseName,
  passagesToAnswer,
  serviceMenOf,
  summonVassals,
  summonsBody,
  summonsStewardDay,
  type PersonRef,
  type SummonsDeps,
  type WorldCell,
} from '@bohemia/game';
import { levyDeps } from './levies';
import { gameDeps, playerToday } from './game';
import { summonVassalsActionForPlayer } from './village';

// Composition root svolání vazalů a ohlášení průchodu (Úloha 6.13): use-casy `summonVassals`,
// `answerSummons`, `announcePassage` a `answerPassage` nad skutečnými repozitáři. Herní logika je
// v `packages/game/src/application/summons.ts` a `passage.ts`.

/** Muž rodu schopný služby v dialogu Svolání. */
export interface SummonsManView {
  villageId: string;
  personId: number;
  name: string | null;
  age: number;
  strength: number;
}

/** Otevřený dialog Svolání s muži rodu (nejzdatnější první – předvybraných je `men`). */
export interface SummonsDialogView {
  dialogId: string;
  lordName: string;
  targetName: string;
  men: number;
  days: number;
  /** Herní den, kdy za hráče pošle domluvené muže správce (absence.md). */
  stewardDay?: number;
  candidates: SummonsManView[];
}

/** Ohlášení průchodu, na které hráč může odpovědět. */
export interface PassageView {
  passageId: string;
  name: string;
  etaDay: number;
  message: string;
}

function summonsDeps(): SummonsDeps {
  const deps = gameDeps();
  const levy = levyDeps();
  return {
    dialogs: deps.dialogs,
    vassalages: deps.vassalages,
    houses: deps.houses,
    wars: deps.wars,
    notices: deps.notices,
    villages: deps.villages,
    settlements: deps.settlements,
    shipments: levy.shipments,
    stewardships: deps.stewardships,
    prepareVillage: levy.prepareVillage,
  };
}

/** Otevřené dialogy Svolání hráče (počítá se na vyžádání spolu s Odvody). */
export async function summonsDialogsForPlayer(playerId: string): Promise<SummonsDialogView[]> {
  const today = await playerToday(playerId);
  if (!today.ok) return [];
  const deps = summonsDeps();
  // svolání NPC vazala drží svolávající, než ho NPC splní – hráči se neukazuje
  const own = await deps.houses.activeOf(playerId);
  const open = (await deps.dialogs.listOpen(playerId)).filter(
    (d) => d.kind === 'summons' && summonsBody(d).vassalHouseId === own?.id,
  );
  if (open.length === 0) return [];
  const men = await serviceMenOf(deps, { playerId, today: today.day });
  const candidates = men.map((m) => ({
    villageId: m.ref.villageId,
    personId: m.ref.personId,
    name: m.name,
    age: ageYears(m.bornDay, today.day),
    strength: Math.round(m.strength * 10) / 10,
  }));
  const views: SummonsDialogView[] = [];
  for (const dialog of open) {
    const body = summonsBody(dialog);
    const lord = await deps.houses.byId(body.lordHouseId);
    const target = await deps.villages.find(body.targetVillageId);
    views.push({
      dialogId: dialog.id,
      lordName: lord ? await houseName(deps, lord) : '',
      targetName: target?.name ?? '',
      men: body.men,
      days: body.days,
      stewardDay: summonsStewardDay(dialog),
      candidates,
    });
  }
  return views;
}

/** Pán svolá vazaly do své vsi `targetVillageId` (pod zámkem vsi, právo `war`). */
export async function summonVassalsForPlayer(
  playerId: string,
  input: { warId: string; vassalageIds: string[]; targetVillageId: string },
): Promise<{ ok: true; opened: number; skipped: string[] } | { error: string }> {
  const done = await summonVassalsActionForPlayer(playerId, input.targetVillageId, async (ctx) => ({
    result: await summonVassals(summonsDeps(), { playerId, ...input, today: ctx.day }),
    today: ctx.day,
  }));
  if ('error' in done) return done;
  const { result, today } = done;
  if (!result.ok) return { error: result.reason };
  // NPC vazal plní hned a přesně – mimo zámek vsi (`sendMen` bere zámek držitele sám)
  for (const dialogId of result.npcDialogIds) {
    await answerNpcSummons(summonsDeps(), { dialogId, today });
  }
  return { ok: true, opened: result.opened.length, skipped: result.skipped.map((s) => s.reason) };
}

/** Vazal odpoví na Svolání – pošle vybrané muže rodu. */
export async function answerSummonsForPlayer(
  playerId: string,
  input: { dialogId: string; men: PersonRef[]; message: string | null },
): Promise<{ ok: true; sent: number; arrivesDay: number | null } | { error: string }> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const result = await answerSummons(summonsDeps(), { playerId, ...input, today: today.day });
  return result.ok
    ? { ok: true, sent: result.sent, arrivesDay: result.arrivesDay }
    : { error: result.reason };
}

function passageDeps(): Parameters<typeof announcePassage>[0] {
  const deps = gameDeps();
  return {
    passages: deps.passages,
    houses: deps.houses,
    wars: deps.wars,
    notices: deps.notices,
    villages: deps.villages,
    now: () => new Date(),
  };
}

/** Ohlášení průchodu, na která hráč může odpovědět (panel války). */
export async function passagesForPlayer(playerId: string): Promise<PassageView[]> {
  const deps = passageDeps();
  const views: PassageView[] = [];
  for (const p of await passagesToAnswer(deps, playerId)) {
    const from = await deps.houses.byId(p.fromHouseId);
    views.push({
      passageId: p.id,
      name: from ? await houseName(deps, from) : '',
      etaDay: p.etaDay,
      message: p.message,
    });
  }
  return views;
}

/** Rod hráče ohlásí průchod vojska mapami `cells` rodu `house`. */
export async function announcePassageForPlayer(
  playerId: string,
  input: { house: string; cells: WorldCell[]; eta: number; message: string },
): Promise<{ ok: true } | { error: string }> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const result = await announcePassage(passageDeps(), { playerId, ...input, today: today.day });
  return result.ok ? { ok: true } : { error: result.reason };
}

/** Odpověď na ohlášení průchodu (`trust` false = „Nevěřit“). */
export async function answerPassageForPlayer(
  playerId: string,
  input: { passageId: string; trust: boolean; message: string },
): Promise<{ ok: true } | { error: string }> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const result = await answerPassage(passageDeps(), { playerId, ...input, today: today.day });
  return result.ok ? { ok: true } : { error: result.reason };
}
