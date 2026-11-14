import { cloneData } from '../village/core/clone';
import { directionBetween, sameCell, type GridCell } from '../village/people/world-grid';
import { cellKey, type TickContext, type TickOut } from './campaign-tick';
import type { CampaignPlace } from './campaign-types';
import type {
  JourneyCommand,
  JourneyGroup,
  JourneyMember,
  JourneyOrder,
  JourneyParty,
  JourneyRecruit,
  JourneyState,
} from './journey-types';
import { sendGroup } from './movement';
import { WAR } from './rules-war';
import { edgeCrossing } from './world-route';

// Skupiny výpravy (expeditions.md – Výběr a skupina, Rozkazy; plán 2026-11-14 – Rozhodnutí 2 a 3):
// rozkaz nese id lidí, ne id skupiny – krok podle nich skupiny dělí a spojuje a nové lidi ze vsi
// přidá. Skupina (`JourneyParty`) je výběr hráče s jedním rozkazem a lhůtou, hlouček
// (`JourneyGroup`) lidé jedné skupiny na jednom místě. Funkce mutují stav taktu (kopii, kterou
// `journeyTick` zahodí, chybí-li data) a jsou deterministické – žádná náhoda ani čas.

/**
 * Vůdce skupiny (expeditions.md – Koně mimo ves: upozornění nesou jméno vůdce; návrh Clauda):
 * vojvoda, jinak nejstarší muž, jinak nejstarší člen (`bornDay`, chybí = nejmladší), při shodě
 * nižší id osoby. Z `members` tak, jak jsou – živé předá volající.
 */
export function partyLeader(members: readonly JourneyMember[]): JourneyMember | undefined {
  let leader: JourneyMember | undefined;
  for (const m of members) if (leader === undefined || leads(m, leader)) leader = m;
  return leader;
}

/** Má `a` přednost před `b` ve vedení skupiny? */
function leads(a: JourneyMember, b: JourneyMember): boolean {
  if (a.lord !== b.lord) return a.lord;
  if ((a.female === true) !== (b.female === true)) return a.female !== true;
  const bornA = a.bornDay ?? Infinity;
  const bornB = b.bornDay ?? Infinity;
  if (bornA !== bornB) return bornA < bornB;
  return a.ref.personId < b.ref.personId;
}

/**
 * Příkaz v taktu (`stepJourney` ho volá pro každý záměr v pořadí `seq`): rozkaz lidem (`order`),
 * nebo odvolání domů (`recall`). Rozkazy hráče platí jen pro skupiny bez `leaderless`, `recall` pro
 * všechny. `ctx` je svět taktu pro příkazy, které čtou ves; `out` dostane znalost map hloučků, které
 * příkaz zastavil (zastavení je dojetí).
 */
export function applyCommand(
  s: JourneyState,
  command: JourneyCommand,
  ctx: TickContext,
  out: TickOut,
): void {
  if (command.kind === 'recall') recall(s, command.cells);
  else orderPeople(s, command, out);
}

/**
 * Rozkaz lidem (Rozhodnutí 3): vybraní jsou lidé `people`, kteří jsou ve výpravě živí a jejich
 * skupina hráče poslouchá (chybí = všichni takoví), a noví lidé `recruits` (id, která ve výpravě
 * nejsou) – ti stojí doma v novém hloučku. Napřed ověření: „Přes okraj“ na políčko nesousedící
 * s hloučkem vůdce výběru se zahodí celé (ani noví lidé nepřibudou). Pak:
 * - vybraní tvoří jednu skupinu – výběr právě celé jedné skupiny (nováčci navíc) si nechá její id,
 *   jinak dostane nové (`nextId`);
 * - skupina, z níž je vybraná jen část, si nechá zbytek: její hloučky zastaví a lhůta jí běží od
 *   tohoto taktu; smíšený hlouček se rozdělí (vybraní v novém hloučku na stejném místě);
 * - hloučky výběru, které stojí na stejném místě, splynou (nováčci doma tak přejdou do hloučku
 *   skupiny, která stojí celá doma);
 * - rozkaz dostanou všechny hloučky skupiny (`orderParty`).
 */
function orderPeople(
  s: JourneyState,
  command: Extract<JourneyCommand, { kind: 'order' }>,
  out: TickOut,
): void {
  const parties = new Map(s.parties.map((p) => [p.id, p]));
  const groups = new Map(s.groups.map((g) => [g.id, g]));
  const partyOf = (m: JourneyMember): JourneyParty => parties.get(groups.get(m.group)!.party)!;
  const wanted = command.people === undefined ? null : new Set(command.people);
  const chosen = s.members.filter(
    (m) =>
      m.status === 'active' &&
      !partyOf(m).leaderless &&
      (wanted === null || wanted.has(m.ref.personId)),
  );
  const known = new Set(s.members.map((m) => m.ref.personId));
  const fresh: JourneyMember[] = [];
  for (const recruit of command.recruits ?? []) {
    if (known.has(recruit.ref.personId)) continue;
    known.add(recruit.ref.personId);
    fresh.push(recruitMember(recruit, -1));
  }
  if (chosen.length === 0 && fresh.length === 0) return;
  // místo vůdce výběru (nový člověk stojí doma) – k němu se měří „Jdi sem“ i „Přes okraj“
  const leader = partyLeader([...chosen, ...fresh])!;
  const at = leader.group < 0 ? s.home : groups.get(leader.group)!;
  const from: CampaignPlace = { cell: { ...at.cell }, pos: { ...at.pos } };
  const order = command.order;
  if (order.kind === 'cross' && directionBetween(from.cell, order.cell) === null) return;

  const picked = new Set(chosen.map((m) => m.ref.personId));
  const touched = s.parties.filter((p) => chosen.some((m) => partyOf(m) === p));
  const only = touched.length === 1 ? touched[0]! : null;
  const whole =
    only !== null &&
    s.members.every(
      (m) => m.status !== 'active' || partyOf(m) !== only || picked.has(m.ref.personId),
    );
  const target: JourneyParty =
    whole && only ? only : { id: s.nextId++, phase: 'out', arrivedTick: null };
  if (target !== only) s.parties.push(target);

  for (const g of [...s.groups]) {
    if (g.party === target.id) continue;
    const inside = s.members.filter((m) => m.group === g.id);
    const mine = inside.filter((m) => picked.has(m.ref.personId));
    if (mine.length === 0) continue;
    if (!inside.some((m) => m.status === 'active' && !picked.has(m.ref.personId))) {
      // celý hlouček (i s padlými) přejde do skupiny výběru
      g.party = target.id;
      continue;
    }
    const part: JourneyGroup = { ...cloneData(g), id: s.nextId++, party: target.id };
    s.groups.push(part);
    for (const m of mine) m.group = part.id;
  }
  if (fresh.length > 0) {
    const g: JourneyGroup = {
      id: s.nextId++,
      party: target.id,
      order: 'follow-leader',
      cell: { ...s.home.cell },
      pos: { ...s.home.pos },
      goal: null,
      route: [],
      leg: null,
      arrived: true,
    };
    s.groups.push(g);
    for (const m of fresh) {
      m.group = g.id;
      s.members.push(m);
    }
  }
  for (const p of touched) if (p !== target) stopRest(s, p, out);
  s.parties = s.parties.filter((p) => s.groups.some((g) => g.party === p.id));
  mergeGroups(s, target.id, (a, b) => a.arrived && b.arrived && samePlace(a, b));
  orderParty(s, target, order, from);
}

/**
 * Zbytek skupiny po rozdělení stojí, kde je, a čeká (expeditions.md – Výběr a skupina): hloučky
 * zastaví, lhůta běží od tohoto taktu. Hlouček, který šel a zastavil, dojel – znalost jeho mapy jde
 * rodu jako po dojetí.
 */
function stopRest(s: JourneyState, p: JourneyParty, out: TickOut): void {
  const shared = new Set<string>();
  for (const g of s.groups) {
    if (g.party !== p.id) continue;
    if (!g.arrived && !shared.has(cellKey(g.cell))) {
      shared.add(cellKey(g.cell));
      shareKnowledge(s, g.cell, out);
    }
    g.goal = null;
    g.route = [];
    g.leg = null;
    g.arrived = true;
  }
  p.phase = 'out';
  p.arrivedTick = s.tick;
  delete p.crossing;
}

/**
 * Rozkaz skupině `party` – dostanou ho všechny její hloučky; `from` je místo vůdce. „Jdi sem“ míří
 * na místo `pos` na mapě `order.cell` (chybí = mapa vůdce), „Přes okraj“ na místo naproti na okraji
 * sousední mapy (`edgeCrossing` od vůdce; nesousední políčko se zahodí beze změny), „Domů“ do
 * domovské vsi. Nový rozkaz nahradí starý a zruší čekání; „Jdi sem“ a „Přes okraj“ vrátí i skupinu,
 * která se vrací.
 */
export function orderParty(
  s: JourneyState,
  party: JourneyParty,
  order: JourneyOrder,
  from: CampaignPlace,
): void {
  const groups = s.groups.filter((g) => g.party === party.id);
  switch (order.kind) {
    case 'go': {
      const to = { cell: order.cell ?? from.cell, pos: order.pos };
      for (const g of groups) sendGroup(g, to);
      party.phase = 'out';
      delete party.crossing;
      break;
    }
    case 'cross': {
      if (directionBetween(from.cell, order.cell) === null) return;
      // cíl do pohledu: místo naproti na okraji sousední mapy; hlouček zastaví, kde okraj přejde
      const to = { cell: order.cell, pos: edgeCrossing(from.cell, order.cell, from.pos) };
      for (const g of groups) sendGroup(g, to);
      party.phase = 'out';
      party.crossing = true;
      break;
    }
    case 'home':
      for (const g of groups) sendGroup(g, s.home);
      party.phase = 'returning';
      delete party.crossing;
      break;
  }
  party.arrivedTick = null;
}

/**
 * Odvolání domů (worker a válka – lord-control.md, Pořadí zavedení): skupiny s hloučkem na
 * některém z `cells`, nebo s cílem tam, jdou domů. Skupina, která se už vrací, jde dál.
 */
function recall(s: JourneyState, cells: readonly GridCell[]): void {
  const on = (cell: GridCell): boolean => cells.some((c) => sameCell(c, cell));
  for (const p of s.parties) {
    if (p.phase === 'returning') continue;
    const there = s.groups.some(
      (g) => g.party === p.id && (on(g.cell) || (g.goal !== null && on(g.goal.cell))),
    );
    if (there) turnHome(s, p);
  }
}

/** Skupina jde domů bez rozkazu hráče – po čekání, ztrátě vojvody nebo odvolání. */
export function turnHome(s: JourneyState, party: JourneyParty): void {
  party.phase = 'returning';
  party.arrivedTick = null;
  delete party.crossing;
  for (const g of s.groups) if (g.party === party.id) sendGroup(g, s.home);
}

/**
 * Hloučky skupiny `party`, pro které platí `same`, splynou do prvního z nich (pořadí `groups`):
 * jeho lidé přejdou, druhý hlouček zmizí.
 */
export function mergeGroups(
  s: JourneyState,
  party: number,
  same: (a: JourneyGroup, b: JourneyGroup) => boolean,
): void {
  const groups = s.groups.filter((g) => g.party === party);
  const gone = new Set<JourneyGroup>();
  for (let i = 0; i < groups.length; i++) {
    const a = groups[i]!;
    if (gone.has(a)) continue;
    for (let j = i + 1; j < groups.length; j++) {
      const b = groups[j]!;
      if (gone.has(b) || !same(a, b)) continue;
      gone.add(b);
      for (const m of s.members) if (m.group === b.id) m.group = a.id;
    }
  }
  if (gone.size > 0) s.groups = s.groups.filter((g) => !gone.has(g));
}

/** Hloučky stojí na stejném místě (políčko i poloha). */
export function samePlace(a: JourneyGroup, b: JourneyGroup): boolean {
  return sameCell(a.cell, b.cell) && a.pos.x === b.pos.x && a.pos.z === b.pos.z;
}

/** Nový člověk výpravy v hloučku `group`: zdravý, živý; na koni jen ze starého adaptéru. */
export function recruitMember(recruit: JourneyRecruit, group: number): JourneyMember {
  return {
    ref: { ...recruit.ref },
    lord: recruit.lord,
    mounted: recruit.mounted === true,
    strength: recruit.strength,
    fight: recruit.fight,
    health: WAR.combat.health,
    wounded: false,
    status: 'active',
    group,
    ...(recruit.name === undefined ? {} : { name: recruit.name }),
    ...(recruit.female ? { female: true as const } : {}),
    ...(recruit.bornDay === undefined ? {} : { bornDay: recruit.bornDay }),
  };
}

/**
 * Znalost mapy `cell` do úložiště rodu (Úloha 10): celé, co o ní výprava zná – sloučení
 * (`mergeKnowledge`) z toho vezme, co je novější. Domovská mapa a mapa bez záznamu nic nevydají.
 */
export function shareKnowledge(s: JourneyState, cell: GridCell, out: TickOut): void {
  const seen = s.seen?.[cellKey(cell)];
  if (seen) (out.knowledge ??= []).push({ cell: { x: cell.x, y: cell.y }, seen });
}
