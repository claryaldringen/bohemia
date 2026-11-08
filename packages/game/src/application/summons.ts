import { dateOfDayIndex, dayIndexOf } from '../domain/calendar';
import { NEGOTIATION } from '../domain/negotiation';
import { ABSENT_VASSAL } from '../domain/vassalage/rules-absence';
import type { PersonRef } from '../domain/village';
import { lineCandidates, lineManStrength, nobleLineCandidates } from '../domain/war';
import type { Dialog, DialogRepository } from './dialogs';
import type { House, HouseRepository } from './houses';
import { NO_HOUSE } from './negotiate';
import { chronicleHouses, houseName, type NegotiationVillages } from './negotiation-chronicle';
import type { NoticeRepository } from './notices';
import { findPlayerVillage } from './player-villages';
import type { SettlementRepository } from './settlements';
import { canReceive, sendMen, type ShipmentDeps } from './shipments';
import type { StewardshipRepository } from './stewardships';
import type { Vassalage, VassalageRepository } from './vassalages';
import type { VillageRepository } from './villages';
import type { WarRepository } from './wars';

// Svolání vazalů do války (vassalage.md – Svolání; Martin 2. 11. 2026: „Stejně jako u dávek, ale
// vazal musí poslat muže schopné vojenské služby, tj. příslušníky svého rodu“). Pán ve válce
// svolá vazaly – každý dostane dialog `summons` s domluveným počtem mužů a dny služby; pošle
// domluvené, míň nebo víc mužů rodu (se vzkazem), míň = neplnění. Dny služby za herní rok jsou
// strop, pán smí svolat víckrát, dokud je nevyčerpá. Bez odpovědi dialog propadne s koncem války –
// kronika „Ctibor nepřišel do války“ a neplnění. Vazal B smí na svolání pána A svolat své vazaly
// s cílem rovnou u A; jejich muži se počítají do služby B. NPC vazal (povýšený) plní přesně a bez
// dialogu (vassalage.md – Povýšení vesničana) – `answerNpcSummons`. Neodpoví-li hráč do lhůty, pošle
// za něj domluvené muže formální správce (absence.md – Povinnosti vazala) – `answerAbsentSummons`.

export const SUMMONS_REASONS = {
  notAtWar: 'Svolávat smíš jen ve válce.',
  noVassals: 'Vyber vazaly ke svolání.',
  notYourVassal: 'To není tvůj vazal.',
  noService: 'Vazal službu nedomluvil.',
  exhausted: 'Dny služby na letošek jsou vyčerpané.',
  waiting: 'Svolání už čeká na odpověď.',
  noTarget: 'Muži nemají kam přijít.',
  notFound: 'Takové svolání není.',
  answered: 'Na svolání už jsi odpověděl.',
  warOver: 'Válka už skončila.',
  notLineMan: 'Do služby smí jen muži rodu schopní služby.',
  messageTooLong: 'Vzkaz je příliš dlouhý.',
  ended: 'Vazalství už skončilo.',
} as const;

/** Tělo dialogu Svolání. */
export interface SummonsBody {
  warId: string;
  /** Strany války – podle nich se pozná její konec. */
  warHouses: [string, string];
  vassalageId: string;
  lordHouseId: string;
  vassalHouseId: string;
  targetVillageId: string;
  /** Domluvený počet mužů. */
  men: number;
  /** Dny služby tohoto svolání (nejvýš zbytek dní roku). */
  days: number;
  /**
   * Herní den svolání – od něj běží lhůta, po které za hráče odpoví správce (absence.md). Starší
   * svolání ho nemají – lhůta běží od 1. 1. roku dialogu.
   */
  openedDay?: number;
  /** Svolání vazala vazala: dialog svolání pána, do jehož služby se muži počítají. */
  forDialogId?: string;
  /** Odpověď: kolik mužů vazal poslal a vzkaz; `steward` – za nepřítomného poslal správce. */
  sent?: number;
  message?: string | null;
  steward?: boolean;
}

/** Den, kdy za hráče odpoví na Svolání správce (absence.md – Povinnosti vazala). */
export function summonsStewardDay(dialog: Pick<Dialog, 'body' | 'year'>): number {
  const opened =
    summonsBody(dialog).openedDay ?? dayIndexOf({ year: dialog.year, month: 1, day: 1 });
  return opened + ABSENT_VASSAL.summonsAnswerDays;
}

export interface SummonsDeps extends NegotiationVillages {
  dialogs: Pick<
    DialogRepository,
    'openOnce' | 'openFor' | 'listFor' | 'listOpen' | 'byId' | 'answer' | 'openOfKind' | 'lapse'
  >;
  vassalages: Pick<VassalageRepository, 'activeOf' | 'byId' | 'addBreach'>;
  houses: Pick<HouseRepository, 'activeOf' | 'byId'>;
  wars: Pick<WarRepository, 'activeOf' | 'activeBetween'>;
  notices: Pick<NoticeRepository, 'post'>;
  villages: VillageRepository;
  settlements: SettlementRepository;
  shipments: ShipmentDeps;
  /** Vsi, které NPC rod spravuje – v nich žijí jeho muži. */
  stewardships: Pick<StewardshipRepository, 'listByStewardHouse'>;
  /** Dopočítá ves k dnešku před odesláním mužů (jako u Odvodů). */
  prepareVillage: (villageId: string, today: number) => Promise<unknown>;
}

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

export function summonsBody(dialog: Pick<Dialog, 'body'>): SummonsBody {
  return dialog.body as unknown as SummonsBody;
}

/** Dny služby, které už svolání vazalství `vassalageId` v herním roce `year` vzala. */
async function usedDays(
  deps: Pick<SummonsDeps, 'dialogs'>,
  vassalageId: string,
  year: number,
): Promise<{ days: number; count: number }> {
  const all = await deps.dialogs.listFor(vassalageId, 'summons');
  const days = all
    .filter((d) => d.status !== 'dropped' && d.year === year)
    .reduce((sum, d) => sum + summonsBody(d).days, 0);
  return { days, count: all.length };
}

/** Válka, kterou svolání slouží: vlastní válka rodu, nebo svolání od pána (vazal vazalů). */
async function warFor(
  deps: Pick<SummonsDeps, 'wars' | 'dialogs'>,
  input: { playerId: string; houseId: string; warId: string },
): Promise<{ warHouses: [string, string]; forDialog: Dialog | null } | null> {
  const own = (await deps.wars.activeOf(input.houseId)).find((w) => w.id === input.warId);
  if (own) return { warHouses: [...own.houses], forDialog: null };
  const relay = (await deps.dialogs.listOpen(input.playerId)).find(
    (d) => d.kind === 'summons' && summonsBody(d).warId === input.warId,
  );
  if (!relay) return null;
  const body = summonsBody(relay);
  const war = await deps.wars.activeBetween(body.warHouses[0], body.warHouses[1]);
  return war?.id === input.warId ? { warHouses: body.warHouses, forDialog: relay } : null;
}

export type SummonResult =
  | {
      ok: true;
      opened: Dialog[];
      skipped: { vassalageId: string; reason: string }[];
      /** Svolání NPC vazalů – vstupní bod je hned splní `answerNpcSummons` (mimo zámek vsi). */
      npcDialogIds: string[];
    }
  | { ok: false; reason: string };

/**
 * Pán ve válce `warId` svolá vazaly `vassalageIds` do vsi `targetVillageId` (u vazala vazalů cíl
 * u pána, který svolává jeho – `forDialogId`). Každému otevře dialog Svolání (domluvení muži,
 * dny služby – nejvýš zbytek roku, `days` je volitelný menší počet). Vazal s čekajícím svoláním
 * nebo vyčerpanými dny se přeskočí; neotevře-li se nic, vrátí důvod prvního.
 */
export async function summonVassals(
  deps: SummonsDeps,
  input: {
    playerId: string;
    warId: string;
    vassalageIds: readonly string[];
    targetVillageId: string;
    days?: number;
    today: number;
  },
): Promise<SummonResult> {
  const lord = await deps.houses.activeOf(input.playerId);
  if (!lord) return fail(NO_HOUSE);
  if (input.vassalageIds.length === 0) return fail(SUMMONS_REASONS.noVassals);
  const war = await warFor(deps, {
    playerId: input.playerId,
    houseId: lord.id,
    warId: input.warId,
  });
  if (!war) return fail(SUMMONS_REASONS.notAtWar);
  let targetVillageId = input.targetVillageId;
  if (war.forDialog) {
    targetVillageId = summonsBody(war.forDialog).targetVillageId;
  } else if (
    !(await findPlayerVillage(deps, { playerId: input.playerId, villageId: targetVillageId }))
  ) {
    return fail(SUMMONS_REASONS.noTarget);
  }
  const year = dateOfDayIndex(input.today).year;
  const lordName = await houseName(deps, lord);
  const opened: Dialog[] = [];
  const npcDialogIds: string[] = [];
  const skipped: { vassalageId: string; reason: string }[] = [];
  for (const vassalageId of new Set(input.vassalageIds)) {
    const skip = (reason: string): void => {
      skipped.push({ vassalageId, reason });
    };
    const v = await deps.vassalages.byId(vassalageId);
    if (!v || v.endedAt !== null || v.lordHouseId !== lord.id) {
      skip(SUMMONS_REASONS.notYourVassal);
      continue;
    }
    const service = v.terms.service;
    if (!service || service.men <= 0 || service.days <= 0) {
      skip(SUMMONS_REASONS.noService);
      continue;
    }
    const vassal = await deps.houses.byId(v.vassalHouseId);
    const npc = vassal?.kind === 'npc';
    if (!vassal || vassal.endedAt !== null || (vassal.playerId === null && !npc)) {
      skip(SUMMONS_REASONS.ended);
      continue;
    }
    if (await deps.dialogs.openFor(v.id, 'summons')) {
      skip(SUMMONS_REASONS.waiting);
      continue;
    }
    const used = await usedDays(deps, v.id, year);
    const left = service.days - used.days;
    const days = Math.min(left, Math.floor(input.days ?? left));
    if (days <= 0) {
      skip(SUMMONS_REASONS.exhausted);
      continue;
    }
    const body: SummonsBody = {
      warId: input.warId,
      warHouses: war.warHouses,
      vassalageId: v.id,
      lordHouseId: lord.id,
      vassalHouseId: vassal.id,
      targetVillageId,
      men: service.men,
      days,
      openedDay: input.today,
      ...(war.forDialog ? { forDialogId: war.forDialog.id } : {}),
    };
    // klíč podle pořadí svolání vazalství – ze dvou souběžných svolání projde jedno
    // NPC rod hráče nemá – dialog drží svolávající (hned se splní, nikdo ho neuvidí otevřený)
    const dialog = await deps.dialogs.openOnce(`summons:${v.id}:${used.count}`, {
      playerId: vassal.playerId ?? input.playerId,
      kind: 'summons',
      refId: v.id,
      year,
      body: { ...body },
    });
    if (!dialog) {
      skip(SUMMONS_REASONS.waiting);
      continue;
    }
    opened.push(dialog);
    if (vassal.playerId === null) {
      npcDialogIds.push(dialog.id);
      continue;
    }
    await deps.notices.post({
      playerId: vassal.playerId,
      kind: 'summons-open',
      payload: { dialogId: dialog.id, name: lordName },
      gameDay: input.today,
    });
  }
  if (opened.length === 0) return fail(skipped[0]?.reason ?? SUMMONS_REASONS.noVassals);
  return { ok: true, opened, skipped, npcDialogIds };
}

/** Muž rodu schopný služby – do dialogu Svolání (předvyplnění podle výcviku). */
export interface ServiceMan {
  ref: PersonRef;
  name: string | null;
  bornDay: number;
  /** Síla pěšího muže rodu (výcvik) – podle ní se předvyplňuje. */
  strength: number;
}

/**
 * Muži rodu hráče schopní služby ve všech jeho vsích, nejzdatnější první (při shodě starší ves
 * a nižší id). Stav vsí uložený (nedopočítaný).
 */
export async function serviceMenOf(
  deps: Pick<SummonsDeps, 'settlements' | 'villages'>,
  input: { playerId: string; today: number },
): Promise<ServiceMan[]> {
  const out: ServiceMan[] = [];
  for (const settlement of await deps.settlements.listActive(input.playerId)) {
    for (const village of await deps.villages.listBySettlement(settlement.id)) {
      for (const p of lineCandidates(village.state, input.today)) {
        out.push({
          ref: { villageId: village.id, personId: p.id },
          name: p.name ?? null,
          bornDay: p.bornDay,
          strength: lineManStrength(p, null),
        });
      }
    }
  }
  return out.sort((a, b) => b.strength - a.strength);
}

/** Kolik mužů poslali do služby vazala `houseId` jeho vazalové na svolání `dialogId`. */
async function relayedMen(
  deps: Pick<SummonsDeps, 'vassalages' | 'dialogs'>,
  houseId: string,
  dialogId: string,
): Promise<number> {
  let men = 0;
  for (const v of await deps.vassalages.activeOf(houseId)) {
    if (v.lordHouseId !== houseId) continue;
    for (const d of await deps.dialogs.listFor(v.id, 'summons')) {
      const body = summonsBody(d);
      if (d.status === 'answered' && body.forDialogId === dialogId) men += body.sent ?? 0;
    }
  }
  return men;
}

export type AnswerSummonsResult =
  | { ok: true; sent: number; arrivesDay: number | null; short: boolean }
  | { ok: false; reason: string };

/**
 * Vazal odpoví na Svolání: pošle muže rodu `men` (z kterékoli své vsi, jen schopné služby) do
 * cílové vsi na dny služby a připojí vzkaz. Míň než domluveno (i se svými vazaly, kteří přišli
 * na jeho svolání) = neplnění; víc smí. Pán dostane upozornění „Ctibor poslal 3 muže.“.
 */
export async function answerSummons(
  deps: SummonsDeps,
  input: {
    playerId: string;
    dialogId: string;
    men: readonly PersonRef[];
    message: string | null;
    today: number;
  },
): Promise<AnswerSummonsResult> {
  const dialog = await deps.dialogs.byId(input.dialogId);
  if (!dialog || dialog.kind !== 'summons' || dialog.playerId !== input.playerId) {
    return fail(SUMMONS_REASONS.notFound);
  }
  if (dialog.status !== 'open') return fail(SUMMONS_REASONS.answered);
  const body = summonsBody(dialog);
  const war = await deps.wars.activeBetween(body.warHouses[0], body.warHouses[1]);
  if (war?.id !== body.warId) return fail(SUMMONS_REASONS.warOver);
  const vassal = await deps.houses.activeOf(input.playerId);
  if (!vassal || vassal.id !== body.vassalHouseId) return fail(SUMMONS_REASONS.notFound);
  const v = await deps.vassalages.byId(body.vassalageId);
  if (!v || v.endedAt !== null) return fail(SUMMONS_REASONS.ended);
  const message = input.message?.trim() ?? '';
  if (message.length > NEGOTIATION.messageMaxChars) return fail(SUMMONS_REASONS.messageTooLong);

  // jen muži rodu schopní služby z vlastních vsí (Martin: „nikdo jiný vojenské zkušenosti nemá“)
  const byVillage = refsByVillage(input.men);
  for (const [villageId, ids] of byVillage) {
    const own = await findPlayerVillage(deps, { playerId: input.playerId, villageId });
    if (!own) return fail(SUMMONS_REASONS.notLineMan);
    const fit = new Set(lineCandidates(own.village.state, input.today).map((p) => p.id));
    if (ids.some((id) => !fit.has(id))) return fail(SUMMONS_REASONS.notLineMan);
  }
  return dispatchSummons(
    deps,
    { dialog, body, vassal, vassalage: v, byVillage, message },
    input.today,
  );
}

/** Odkazy na muže po vsích (každý muž jednou). */
function refsByVillage(refs: readonly PersonRef[]): Map<string, number[]> {
  const byVillage = new Map<string, number[]>();
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.villageId}:${ref.personId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byVillage.get(ref.villageId) ?? [];
    list.push(ref.personId);
    byVillage.set(ref.villageId, list);
  }
  return byVillage;
}

/**
 * Odpověď na Svolání: podmíněné `answer` s počtem a vzkazem, pak muži odejdou do cílové vsi
 * (`sendMen` – služba na dny svolání). Míň než domluveno (i se svými vazaly) = neplnění; pán
 * dostane „Ctibor poslal 3 muže.“.
 */
async function dispatchSummons(
  deps: SummonsDeps,
  a: {
    dialog: Dialog;
    body: SummonsBody;
    vassal: House;
    vassalage: Vassalage;
    byVillage: Map<string, number[]>;
    message: string;
    /** Za nepřítomného hráče posílá správce (absence.md) – pán to vidí v upozornění. */
    steward?: boolean;
  },
  today: number,
): Promise<AnswerSummonsResult> {
  let sent = 0;
  for (const ids of a.byVillage.values()) sent += ids.length;
  const reply = { sent, message: a.message || null, ...(a.steward ? { steward: true } : {}) };
  if (!(await deps.dialogs.answer(a.dialog.id, 'open', reply))) {
    return fail(SUMMONS_REASONS.answered);
  }
  let arrivesDay: number | null = null;
  for (const [villageId, ids] of a.byVillage) {
    await deps.prepareVillage(villageId, today);
    const result = await sendMen(deps.shipments, {
      fromVillageId: villageId,
      toVillageId: a.body.targetVillageId,
      personIds: ids,
      kind: 'service',
      days: a.body.days,
      refId: `summons:${a.dialog.id}`,
      today,
    });
    if (!result.ok) return fail(result.reason);
    arrivesDay = Math.max(arrivesDay ?? 0, result.arrivesDay);
  }
  const relayed = await relayedMen(deps, a.vassal.id, a.dialog.id);
  const short = sent + relayed < a.body.men;
  if (short) await deps.vassalages.addBreach(a.vassalage.id, 'summons', today);
  const lord = await deps.houses.byId(a.body.lordHouseId);
  if (lord?.playerId) {
    await deps.notices.post({
      playerId: lord.playerId,
      kind: 'summons-sent',
      payload: {
        dialogId: a.dialog.id,
        name: await houseName(deps, a.vassal),
        men: sent,
        message: a.message || null,
        ...(a.steward ? { steward: true } : {}),
      },
      gameDay: today,
    });
  }
  return { ok: true, sent, arrivesDay, short };
}

/**
 * NPC vazal splní Svolání přesně a bez dialogu (vassalage.md – Povýšení vesničana: „NPC rod vždy
 * přijme a plní přesně – neposílá míň ani víc“): pošle domluvený počet nejzdatnějších mužů rodu
 * ze vsí, které spravuje (jako předvyplnění dialogu u hráče). Nemá-li jich tolik, pošle všechny
 * a chybějící = neplnění jako u každého vazala (návrh Clauda). Vstupní bod volá hned po
 * `summonVassals` mimo zámek vsi (`sendMen` bere zámek sám); opakování nic nezdvojí.
 */
export async function answerNpcSummons(
  deps: SummonsDeps,
  input: { dialogId: string; today: number },
): Promise<AnswerSummonsResult> {
  const dialog = await deps.dialogs.byId(input.dialogId);
  if (!dialog || dialog.kind !== 'summons') return fail(SUMMONS_REASONS.notFound);
  if (dialog.status !== 'open') return fail(SUMMONS_REASONS.answered);
  const body = summonsBody(dialog);
  const npc = await deps.houses.byId(body.vassalHouseId);
  if (!npc || npc.kind !== 'npc' || npc.endedAt !== null) return fail(SUMMONS_REASONS.notFound);
  const war = await deps.wars.activeBetween(body.warHouses[0], body.warHouses[1]);
  if (war?.id !== body.warId) return fail(SUMMONS_REASONS.warOver);
  const v = await deps.vassalages.byId(body.vassalageId);
  if (!v || v.endedAt !== null) return fail(SUMMONS_REASONS.ended);
  const pool: ServiceMan[] = [];
  for (const s of await deps.stewardships.listByStewardHouse(npc.id)) {
    await deps.prepareVillage(s.villageId, input.today);
    const village = await deps.villages.find(s.villageId);
    if (!village) continue;
    for (const p of nobleLineCandidates(village.state, input.today, npc.id)) {
      pool.push({
        ref: { villageId: village.id, personId: p.id },
        name: p.name ?? null,
        bornDay: p.bornDay,
        strength: lineManStrength(p, null),
      });
    }
  }
  pool.sort((x, y) => y.strength - x.strength);
  const byVillage = refsByVillage(pool.slice(0, body.men).map((m) => m.ref));
  return dispatchSummons(
    deps,
    { dialog, body, vassal: npc, vassalage: v, byVillage, message: '' },
    input.today,
  );
}

/**
 * Úloha světa (absence.md – Povinnosti vazala, když hráč nehraje): na Svolání, na které hráč
 * neodpověděl do lhůty (`ABSENT_VASSAL.summonsAnswerDays` od svolání), pošle formální správce rodu
 * domluvený počet nejzdatnějších mužů rodu, kteří jsou doma a zdraví (`lineCandidates` ve vsích
 * rodu dopočítaných do dneška – předvyplnění dialogu, jako NPC rod). Nemá-li jich tolik, pošle
 * všechny a míň = neplnění; své vazaly správce nesvolává. Po konci války nic – svolání propadne
 * (`lapseSummons`); skončilá dohoda svolání zahodí. Zanikla-li cílová ves (chyba, která se sama
 * nespraví), uzavře se svolání jako „nikoho neposlal“ = neplnění. NPC svolání splní vstupní bod
 * hned (`answerNpcSummons`). Odpověď hráče do lhůty
 * má přednost (podmíněné `answer`). Vazal dostane `summons-steward`. Vrací počet odpovědí správce.
 */
export async function answerAbsentSummons(
  deps: SummonsDeps,
  input: { today: number },
): Promise<number> {
  let answered = 0;
  for (const dialog of await deps.dialogs.openOfKind('summons')) {
    if (input.today < summonsStewardDay(dialog)) continue;
    const body = summonsBody(dialog);
    const vassal = await deps.houses.byId(body.vassalHouseId);
    if (!vassal || vassal.playerId === null || vassal.endedAt !== null) continue;
    const war = await deps.wars.activeBetween(body.warHouses[0], body.warHouses[1]);
    if (war?.id !== body.warId) continue;
    const v = await deps.vassalages.byId(body.vassalageId);
    if (!v || v.endedAt !== null) {
      // dohoda skončila – svolání zmizí, ať se nezkouší každou minutu
      await deps.dialogs.lapse(dialog.id);
      continue;
    }
    for (const settlement of await deps.settlements.listActive(vassal.playerId)) {
      for (const village of await deps.villages.listBySettlement(settlement.id)) {
        await deps.prepareVillage(village.id, input.today);
      }
    }
    // cílová ves zanikla (nebo nemá sídlo) – chyba, která se sama nespraví: uzavřít jako
    // „nikoho neposlal“ = neplnění
    const reachable = await canReceive(deps.shipments, body.targetVillageId);
    const men = reachable
      ? await serviceMenOf(deps, { playerId: vassal.playerId, today: input.today })
      : [];
    const byVillage = refsByVillage(men.slice(0, body.men).map((m) => m.ref));
    const result = await dispatchSummons(
      deps,
      { dialog, body, vassal, vassalage: v, byVillage, message: '', steward: true },
      input.today,
    );
    if (!result.ok) {
      // odpověď je zapsaná, ale muži neodešli – neplnění (opakovat nejde, dialog je uzavřený)
      if (result.reason !== SUMMONS_REASONS.answered) {
        await deps.vassalages.addBreach(v.id, 'summons', input.today);
      }
      continue;
    }
    answered++;
    const lord = await deps.houses.byId(body.lordHouseId);
    await deps.notices.post({
      playerId: vassal.playerId,
      kind: 'summons-steward',
      payload: { name: lord ? await houseName(deps, lord) : '', men: result.sent },
      gameDay: input.today,
    });
  }
  return answered;
}

/**
 * Úloha světa: Svolání bez odpovědi propadne s koncem války (vassalage.md – Svolání): kronika obou
 * rodů „Ctibor nepřišel do války.“, neplnění a upozornění pánovi. Opakování nic nezdvojí
 * (podmíněné `lapse`). Vrací počet propadlých.
 */
export async function lapseSummons(
  deps: Pick<SummonsDeps, 'dialogs' | 'wars' | 'vassalages' | 'houses' | 'notices' | 'villages'>,
  input: { today: number },
): Promise<number> {
  let lapsed = 0;
  for (const dialog of await deps.dialogs.openOfKind('summons')) {
    const body = summonsBody(dialog);
    const war = await deps.wars.activeBetween(body.warHouses[0], body.warHouses[1]);
    if (war?.id === body.warId) continue;
    if (!(await deps.dialogs.lapse(dialog.id))) continue;
    lapsed++;
    const v = await deps.vassalages.byId(body.vassalageId);
    if (v && v.endedAt === null) await deps.vassalages.addBreach(v.id, 'summons', input.today);
    const vassal = await deps.houses.byId(body.vassalHouseId);
    const lord = await deps.houses.byId(body.lordHouseId);
    if (!vassal) continue;
    const name = await houseName(deps, vassal);
    await chronicleHouses(deps, [vassal, ...(lord ? [lord] : [])], `no-show:${dialog.id}`, {
      day: input.today,
      kind: 'no-show',
      name,
    });
    if (lord?.playerId) {
      await deps.notices.post({
        playerId: lord.playerId,
        kind: 'summons-lapsed',
        payload: { dialogId: dialog.id, name },
        gameDay: input.today,
      });
    }
  }
  return lapsed;
}
