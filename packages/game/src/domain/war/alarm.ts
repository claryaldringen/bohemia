import { villageCentre } from '../village/departure';
import type { AlarmOwner, AlarmVillage, CampaignAlarm } from './alarm-types';
import { cellKey, gridOf, MissingData, villageEvent } from './campaign-tick';
import type { TickContext, TickOut } from './campaign-tick';
import type { CampaignState, IntentBody } from './campaign-types';
import { villageLookouts, runTicks, type Lookout } from './lookouts';
import type { MarchGrid, Pos } from './march-grid';
import type { GridCell } from '../village/world-grid';
import { inSight } from './sight';

// Varování vsí v tažení útočníka (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 –
// Úloha 2): ves se o vojsku dozví, až ho spatří vesničan kdekoli na mapě, kde pracuje (`lookouts.ts`),
// a doběhne domů. Do té doby lidé pracují dál (bez `raid-day`). Stav je v `CampaignState.alarm`.

/** Vlastník vsi, dokud svět port `alarmOf` nedodá (Úloha 6) – rod neznámý, rozhoduje pravidlo. */
const UNKNOWN_OWNER: AlarmOwner = { playerId: null, npc: true, houseId: null };

/** Záměry obránce varované vsi (plán 2026-11-09 – Rozhodnutí plánu). */
export type AlarmIntentBody = Extract<
  IntentBody,
  { kind: 'alarm-messenger' | 'alarm-flee' | 'alarm-domain' }
>;

/** Je záměr záměrem obránce varované vsi (`alarm-*`)? */
export function isAlarmIntent(body: IntentBody): body is AlarmIntentBody {
  return (
    body.kind === 'alarm-messenger' || body.kind === 'alarm-flee' || body.kind === 'alarm-domain'
  );
}

/**
 * Dává záměr obránce, ne vůdce tažení (`breakout` – držitel napadené vsi, `alarm-*` – majitel
 * varované vsi)? Tažení přijme záměr obránce jen od cizího hráče, ostatní jen od vůdce.
 */
export function isDefenderIntent(body: IntentBody): boolean {
  return body.kind === 'breakout' || isAlarmIntent(body);
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
 */
export function sightAlarms(s: CampaignState, tick: number, ctx: TickContext, out: TickOut): void {
  for (const { cell, eyes } of armyEyes(s)) {
    const map = ctx.world.landscapeOf(cell);
    if (map === null) throw new MissingData([{ ...cell }], []);
    for (const villageId of map.villageIds) {
      if (ctx.world.harmless?.(villageId, s.playerId)) continue;
      if (isWarned(s, villageId, tick)) continue;
      const sighting = spot(s, villageId, cell, eyes, ctx);
      if (sighting === null) continue;
      const warnTick = tick + sighting.run;
      const known = alarmVillage(s, villageId);
      if (known === null) {
        addVillage(s, {
          villageId,
          owner: ownerOf(villageId, ctx),
          seenTick: tick,
          seenAt: { cell: { ...cell }, pos: { ...sighting.at } },
          warnTick,
          by: 'villager',
        });
      } else if (warnTick < known.warnTick) {
        known.warnTick = warnTick;
        known.by = 'villager';
      }
    }
  }
  for (const v of s.alarm?.villages ?? []) {
    if (v.warnTick === tick) warn(s, v.villageId, ctx, out);
  }
}

/** Polohy skupin s aktivním mužem podle políčka (pořadí skupin podle stavu – pevné). */
function armyEyes(s: CampaignState): { cell: GridCell; eyes: Pos[] }[] {
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
): { run: number; at: Pos } | null {
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
  let best: { run: number; at: Pos } | null = null;
  lookouts.forEach((lookout, i) => {
    if (best?.run === 0) return;
    const at = eyes.find((e) => inSight(grid, e, lookout.pos));
    if (at === undefined) return;
    const run = runOf(key, i, lookout, grid, villageCentre(village), ctx);
    if (best === null || run < best.run) best = { run, at };
  });
  return best;
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

/** Kdo za ves rozhoduje – ze světa (Úloha 6), jinak neznámý rod; `null` = svět ještě nenačetl. */
export function ownerOf(villageId: string, ctx: TickContext): AlarmOwner {
  const ask = ctx.world.alarmOf;
  if (!ask) return { ...UNKNOWN_OWNER };
  const owner = ask(villageId);
  if (owner === null) throw new MissingData([], [villageId]);
  return { ...owner };
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
