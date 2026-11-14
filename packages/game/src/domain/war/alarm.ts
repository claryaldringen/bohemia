import { villageCentre } from '../village/people/departure';
import type { AlarmOwner, AlarmVillage, CampaignAlarm } from './alarm-types';
import { cellKey, gatherMissing, gridOf, MissingData, villageEvent } from './campaign-tick';
import type { TickContext, TickOut } from './campaign-tick';
import type { CampaignState, IntentBody } from './campaign-types';
import { villageLookouts, runTicks, type Lookout } from './lookouts';
import { lordHomeAt } from './lord-home';
import { refugeHostOf, type RefugeHost } from './refuge-choice';
import type { MarchGrid, Pos } from './march-grid';
import type { GridCell } from '../village/people/world-grid';
import { WAR } from './rules-war';
import { inSight } from './sight';

// Varování vsí v tažení útočníka (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 –
// Úloha 2): ves se o vojsku dozví, až ho spatří vesničan kdekoli na mapě, kde pracuje (`lookouts.ts`),
// a doběhne domů. Do té doby lidé pracují dál (bez `raid-day`). Stav je v `CampaignState.alarm`.

/**
 * Vlastník vsi, když svět port `alarmOf` nemá, nebo ves nezná (Úloha 6) – rod neznámý, rozhoduje
 * pravidlo.
 */
export const UNKNOWN_ALARM_OWNER: Readonly<AlarmOwner> = {
  playerId: null,
  npc: true,
  houseId: null,
};

/**
 * Záměry obránce varované vsi (plán 2026-11-09 – Rozhodnutí plánu), odpověď na přítomnost hráče
 * (`alarm-presence` – plán 2026-11-14, Rozhodnutí plánu 2) a vzdání vojvody (`lord-surrender` –
 * Rozhodnutí plánu 5).
 */
export type AlarmIntentBody = Extract<
  IntentBody,
  {
    kind: 'alarm-messenger' | 'alarm-flee' | 'alarm-domain' | 'alarm-presence' | 'lord-surrender';
  }
>;

/** Je záměr záměrem obránce varované vsi (`alarm-*`, `lord-surrender`)? */
export function isAlarmIntent(body: IntentBody): body is AlarmIntentBody {
  return (
    body.kind === 'alarm-messenger' ||
    body.kind === 'alarm-flee' ||
    body.kind === 'alarm-domain' ||
    body.kind === 'alarm-presence' ||
    body.kind === 'lord-surrender'
  );
}

/**
 * Dává záměr obránce, ne vůdce tažení (`breakout` – držitel napadené vsi, `alarm-*` – majitel
 * varované vsi, `turn-back` se `surrender` – držitel cíle dal Začít znovu)? Tažení přijme záměr
 * obránce jen od cizího hráče, ostatní jen od vůdce.
 */
export function isDefenderIntent(body: IntentBody): boolean {
  return body.kind === 'breakout' || isSurrenderIntent(body) || isAlarmIntent(body);
}

/** Ves cíle se vzdala (Začít znovu obránce – `turn-back` se `surrender`) – záměr obránce. */
export function isSurrenderIntent(body: IntentBody): boolean {
  return body.kind === 'turn-back' && body.surrender === true && body.restart === true;
}

/** Políčko vsi ve varování (`cell`, jinak políčko spatření – vesničan viděl vojsko na mapě vsi). */
export function alarmCellOf(v: AlarmVillage): GridCell {
  return v.cell ?? v.seenAt.cell;
}

/** Ví ves `villageId` v taktu `tick` o vojsku tažení (doběh vesničana, příchod posla)? */
export function isWarned(s: CampaignState, villageId: string, tick: number): boolean {
  const v = alarmVillage(s, villageId);
  return v !== null && v.warnTick <= tick;
}

/**
 * Skončilo varování vsi `villageId` před tímto tažením vzdáním jejího vojvody (war.md – Hráč ve
 * vsi a mimo ni: vzdáním „nájezd končí“; plán 2026-11-14 – Úloha 5b)? Vzdát jde jen cíl tažení
 * (`yieldingLord`) a vojsko se pak vrací s důvodem `'yielded'`, který se už nezmění. Ves před
 * odcházejícím vojskem neutíká ani neposílá posla a nastavení za ni nerozhoduje: záměr obránce
 * k ní je jen přítomnost (`applyAlarm`) a `decideAlarms` ji přeskočí. Kdo už odešel nebo běží,
 * jde dál; ves o vojsku dál ví (`isWarned` – bariéra dnů nájezdu, dokud vojsko stojí na její mapě).
 */
export function alarmEnded(s: CampaignState, villageId: string): boolean {
  return s.returnReason === 'yielded' && villageId === s.target.villageId;
}

/** Záznam varování vsi v tažení; chybí – ves vojsko nespatřila. */
export function alarmVillage(s: CampaignState, villageId: string): AlarmVillage | null {
  return s.alarm?.villages.find((v) => v.villageId === villageId) ?? null;
}

/**
 * Spatření vojska po pohybu taktu (plán 2026-11-09 – Úloha 2, Otevřené 3): pro každou ves na mapě,
 * kde stojí skupina s aktivním mužem (kromě vsí, kterým vojsko neškodí – `harmless`), oči vsi ×
 * polohy skupin (`inSight`). První spatření zapíše `AlarmVillage` (`warnTick` = takt + doběh od
 * oka do středu vsi – z domu 0); pozdější spatření s dřívějším doběhem varování uspíší. V taktu
 * varování jde majiteli upozornění `army-warned` a vsi signál hrozby `army-seen` (na týž den –
 * ves drží bariéra).
 *
 * Co takt ze světa nemá (vlastník, stav vsi, kandidáti hradišť), ohlásí za všechny vsi jedním
 * `MissingData` (`gatherMissing` – závěrečná recenze D1): jeden průchod tak načte data všech vsí
 * taktu, ne jedné. Ves, která už ve varování je (vesničan běží domů), má vlastníka zapsaného –
 * svět se na něj znovu neptá.
 */
export function sightAlarms(s: CampaignState, tick: number, ctx: TickContext, out: TickOut): void {
  const sights: { villageId: string; cell: GridCell; eyes: Pos[] }[] = [];
  for (const { cell, eyes } of armyEyes(s)) {
    const map = ctx.world.landscapeOf(cell);
    if (map === null) throw new MissingData([{ ...cell }], []);
    for (const villageId of map.villageIds) {
      if (ctx.world.harmless?.(villageId, s.playerId)) continue;
      if (!isWarned(s, villageId, tick)) sights.push({ villageId, cell, eyes });
    }
  }
  gatherMissing(sights, (x) => sightVillage(s, x.villageId, x.cell, x.eyes, tick, ctx));
  for (const v of s.alarm?.villages ?? []) {
    if (v.warnTick === tick) warn(s, v.villageId, ctx, out);
  }
}

/** Spatření vojska vsí `villageId` na mapě `cell` (`sightAlarms`); chybí-li data, `MissingData`. */
function sightVillage(
  s: CampaignState,
  villageId: string,
  cell: GridCell,
  eyes: readonly Pos[],
  tick: number,
  ctx: TickContext,
): void {
  const known = alarmVillage(s, villageId);
  const owner = known?.owner ?? ownerOf(villageId, ctx);
  const sighting =
    lordSighting(s, villageId, owner, eyes, ctx) ?? spot(s, villageId, cell, eyes, ctx);
  if (sighting === null) return;
  const by = sighting.by;
  const warnTick = tick + sighting.run;
  if (known === null) {
    const hosts = hostCandidates(villageId, cell, ctx);
    addVillage(s, {
      villageId,
      owner,
      seenTick: tick,
      seenAt: { cell: { ...cell }, pos: { ...sighting.at } },
      warnTick,
      by,
      ...(hosts === null ? {} : { hosts }),
    });
  } else if (warnTick < known.warnTick) {
    known.warnTick = warnTick;
    known.by = by;
  }
}

/**
 * Polohy skupin s aktivním mužem podle políčka (pořadí skupin podle stavu – pevné); i pohled tažení
 * (`lookOut` – znalost rodu).
 */
export function armyEyes(s: CampaignState): { cell: GridCell; eyes: Pos[] }[] {
  const byCell = new Map<string, { cell: GridCell; eyes: Pos[] }>();
  for (const g of s.groups) {
    if (!s.members.some((m) => m.group === g.id && m.status === 'active')) continue;
    const key = cellKey(g.cell);
    let entry = byCell.get(key);
    if (!entry) {
      entry = { cell: g.cell, eyes: [] };
      byCell.set(key, entry);
    }
    entry.eyes.push(g.pos);
  }
  return [...byCell.values()];
}

/**
 * Nejrychlejší zpráva vsi: oko, které vidí některou skupinu, s nejkratším doběhem do středu vsi
 * (`villageCentre`), a kde vojsko viděli; nikdo nevidí – null.
 */
function spot(
  s: CampaignState,
  villageId: string,
  cell: GridCell,
  eyes: readonly Pos[],
  ctx: TickContext,
): { run: number; at: Pos; by: 'villager' } | null {
  const key = `${villageId}@${s.day}`;
  let lookouts = ctx.lookouts.get(key);
  const village = ctx.world.villageAt(villageId, s.day);
  if (village === null) throw new MissingData([], [villageId]);
  if (!lookouts) {
    lookouts = villageLookouts(village, s.day);
    ctx.lookouts.set(key, lookouts);
  }
  if (lookouts.length === 0) return null;
  const grid = gridOf(cell, s.day, ctx);
  let best: { run: number; at: Pos; by: 'villager' } | null = null;
  lookouts.forEach((lookout, i) => {
    if (best?.run === 0) return;
    const at = eyes.find((e) => inSight(grid, e, lookout.pos));
    if (at === undefined) return;
    const run = runOf(key, i, lookout, grid, villageCentre(village), ctx);
    if (best === null || run < best.run) best = { run, at, by: 'villager' };
  });
  return best;
}

/**
 * Vojvoda doma (war.md – Hráč ve vsi a mimo ni; plán 2026-11-14 – Úloha 4) vidí vojsko hned, jak
 * vstoupí na mapu vsi: spatření bez doběhu v poloze skupiny nejblíž středu vsi (shoda – první
 * v `armyEyes`). Vojvoda pryč (nebo ho tažení odvedlo) – null, rozhodne `spot`.
 */
function lordSighting(
  s: CampaignState,
  villageId: string,
  owner: AlarmOwner,
  eyes: readonly Pos[],
  ctx: TickContext,
): { run: number; at: Pos; by: 'lord' } | null {
  if (owner.lordId === undefined || !lordHomeAt(s, villageId, owner, ctx)) return null;
  const village = ctx.world.villageAt(villageId, s.day);
  if (village === null) throw new MissingData([], [villageId]);
  const centre = villageCentre(village);
  let at: Pos | null = null;
  let best = Infinity;
  for (const e of eyes) {
    const dx = e.x - centre.x;
    const dz = e.z - centre.z;
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      at = e;
    }
  }
  return at === null ? null : { run: 0, at, by: 'lord' };
}

/** Doběh od oka do středu vsi (takty) – z domu 0; mezipaměť volání podle vsi, dne a oka. */
function runOf(
  key: string,
  index: number,
  lookout: Lookout,
  grid: MarchGrid,
  centre: Pos,
  ctx: TickContext,
): number {
  if (lookout.kind === 'home') return 0;
  const runKey = `${key}:${index}`;
  let run = ctx.runs.get(runKey);
  if (run === undefined) {
    run = runTicks(grid, lookout.pos, centre);
    ctx.runs.set(runKey, run);
  }
  return run;
}

/**
 * Kdo za ves rozhoduje – ze světa (`CampaignWorld.alarmOf`, Úloha 6), bez portu neznámý rod; port
 * vrátí `null` = svět ještě nenačetl (takt čeká).
 */
export function ownerOf(villageId: string, ctx: TickContext): AlarmOwner {
  const ask = ctx.world.alarmOf;
  if (!ask) return { ...UNKNOWN_ALARM_OWNER };
  const owner = ask(villageId);
  if (owner === null) throw new MissingData([], [villageId]);
  return { ...owner };
}

/**
 * Kandidáti hradišť vsi `villageId` na políčku `cell` (plán – Otevřené 1, Úloha 6): vlastní rod
 * a přímí páni ze světa (`CampaignWorld.refugeHostsOf`) do `WAR.alarm.refugeMaxCells` políček, id
 * seřazená. Zapíší se, jakmile ves vstoupí do varování (`AlarmVillage.hosts`) – bariéra dopočtu je
 * od té chvíle drží, takže volba posla nebo útěku čte jejich stav ke dni tažení. Bez portu null;
 * svět ještě nenačetl – takt čeká (`MissingData`).
 */
export function hostCandidates(
  villageId: string,
  cell: GridCell,
  ctx: TickContext,
): string[] | null {
  const ask = ctx.world.refugeHostsOf;
  if (!ask) return null;
  const candidates = ask(villageId);
  if (candidates === null) throw new MissingData([], [villageId]);
  return candidates
    .filter((c) => cellsBetween(c.cell, cell) <= WAR.alarm.refugeMaxCells)
    .map((c) => c.villageId)
    .sort();
}

/**
 * Hradiště pro ves (Otevřené 1): kandidáti ze světa (`CampaignWorld.refugeHostsOf` – Úloha 6; bez
 * portu žádní = „Pán nemá hradiště“) do `WAR.alarm.refugeMaxCells` políček, s hotovým opevněním
 * s plochou ke dni tažení. `ids` = všichni kandidáti v dosahu (čte se jejich stav – bariéra).
 */
export function refugeHosts(
  s: CampaignState,
  villageId: string,
  cell: GridCell,
  ctx: TickContext,
): { hosts: RefugeHost[]; ids: string[] } {
  const ask = ctx.world.refugeHostsOf;
  if (!ask) return { hosts: [], ids: [] };
  const candidates = ask(villageId);
  if (candidates === null) throw new MissingData([], [villageId]);
  const near = candidates.filter((c) => cellsBetween(c.cell, cell) <= WAR.alarm.refugeMaxCells);
  const hosts: RefugeHost[] = [];
  for (const c of near) {
    const map = ctx.world.landscapeOf(c.cell);
    if (map === null) throw new MissingData([{ ...c.cell }], []);
    const state = ctx.world.villageAt(c.villageId, s.day);
    if (state === null) throw new MissingData([], [c.villageId]);
    const host = refugeHostOf(c.villageId, state, map.landscape, c.cell, s.day);
    if (host) hosts.push(host);
  }
  return { hosts, ids: near.map((c) => c.villageId).sort() };
}

/** Vzdálenost políček (nejvíc kroků po řádku nebo sloupci – i úhlopříčně jeden krok). */
export function cellsBetween(a: GridCell, b: GridCell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Zapíše ves do varování – seřazené podle `villageId` (stav je JSON, pořadí pevné). */
export function addVillage(s: CampaignState, v: AlarmVillage): void {
  const alarm: CampaignAlarm = (s.alarm ??= {
    villages: [],
    messengers: [],
    flights: [],
    nextRef: 0,
  });
  const at = alarm.villages.findIndex((x) => x.villageId > v.villageId);
  if (at < 0) alarm.villages.push(v);
  else alarm.villages.splice(at, 0, v);
}

/**
 * Ves ví o vojsku: majitel dostane upozornění `army-warned` (jako „Cizí vojsko u …!“ – jen cizí
 * vojsko), ves signál hrozby `army-seen` pro správce na den `day` – týž den (ves u vojska drží
 * bariéra), ves daleko varovaná poslem den nato (rozhodnutí 13).
 */
export function warn(
  s: CampaignState,
  villageId: string,
  ctx: TickContext,
  out: TickOut,
  day: number = s.day,
): void {
  villageEvent(s, out, villageId, day, {
    kind: 'threat-signal',
    signal: { kind: 'army-seen', day },
  });
  const watcher = ctx.world.watcherOf?.(villageId);
  if (watcher && watcher.playerId !== s.playerId) {
    out.notices.push({
      playerId: watcher.playerId,
      kind: 'army-warned',
      payload: { villageId, name: watcher.name, campaignId: s.id },
      gameDay: s.day,
    });
  }
}
