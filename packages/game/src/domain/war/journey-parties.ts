import { cloneData } from '../village/core/clone';
import { directionBetween, sameCell, type GridCell } from '../village/people/world-grid';
import type { Pen, VillageState } from '../village/types';
import { cellKey, type TickContext, type TickOut } from './campaign-tick';
import type { CampaignPlace } from './campaign-types';
import { homeVillage, horseWorkTicks, pickGroom, riderHorse, sendHorse } from './journey-horses';
import type {
  HorseWork,
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
 * odvolání domů (`recall`), Osedlat (`saddle`) a Sesednout (`dismount`). Rozkazy hráče platí jen
 * pro skupiny bez `leaderless`, `recall` pro všechny. `ctx` je svět taktu pro příkazy, které čtou ves
 * (koně a vesničan); `out` dostane znalost map hloučků, které příkaz zastavil (zastavení je dojetí),
 * a události do vsi (`journey-horse`).
 */
export function applyCommand(
  s: JourneyState,
  command: JourneyCommand,
  ctx: TickContext,
  out: TickOut,
): void {
  switch (command.kind) {
    case 'recall':
      recall(s, command.cells);
      break;
    case 'order':
      orderPeople(s, command, out);
      break;
    case 'saddle':
      saddle(s, command, ctx, out);
      break;
    case 'dismount':
      dismount(s, command, ctx);
      break;
  }
}

/**
 * Komu příkaz hráče platí: živí lidé výpravy z `people` (chybí = všichni), jejichž skupina hráče
 * poslouchá (bez `leaderless`); v pořadí `members`.
 */
function chosenMembers(s: JourneyState, people: readonly number[] | undefined): JourneyMember[] {
  const leaderless = new Set(s.parties.filter((p) => p.leaderless).map((p) => p.id));
  const partyOfGroup = new Map(s.groups.map((g) => [g.id, g.party]));
  const wanted = people === undefined ? null : new Set(people);
  return s.members.filter(
    (m) =>
      m.status === 'active' &&
      !leaderless.has(partyOfGroup.get(m.group)!) &&
      (wanted === null || wanted.has(m.ref.personId)),
  );
}

/** Noví lidé ze vsi – `recruits` s id, které ve výpravě není (každý jednou), zatím bez hloučku. */
function freshMembers(s: JourneyState, recruits: readonly JourneyRecruit[]): JourneyMember[] {
  const known = new Set(s.members.map((m) => m.ref.personId));
  const fresh: JourneyMember[] = [];
  for (const recruit of recruits) {
    if (known.has(recruit.ref.personId)) continue;
    known.add(recruit.ref.personId);
    fresh.push(recruitMember(recruit, -1));
  }
  return fresh;
}

/**
 * Noví lidé stojí doma v novém hloučku skupiny `party` (id z `nextId`). Jezdec, který vyjel rovnou na
 * koni (starý adaptér s `horseId`), hned ohlásí vsi koně venku (`journey-horse`).
 */
function joinAtHome(
  s: JourneyState,
  party: number,
  fresh: readonly JourneyMember[],
  out: TickOut,
): void {
  const g: JourneyGroup = {
    id: s.nextId++,
    party,
    order: 'follow-leader',
    cell: { ...s.home.cell },
    pos: { ...s.home.pos },
    goal: null,
    route: [],
    leg: null,
    arrived: true,
    crossings: [],
  };
  s.groups.push(g);
  for (const m of fresh) {
    m.group = g.id;
    s.members.push(m);
    if (m.horse === 'ridden' && m.horseId !== undefined) {
      sendHorse(s, out, m.ref.personId, m.horseId);
    }
  }
}

/**
 * Noví lidé bez rozkazu stojí doma v nové skupině; její lhůta (3 dny, pak jde domů sama) běží od
 * tohoto taktu – hráč je mezitím může poslat znovu. Nikdo nový – nic.
 */
function standAtHome(s: JourneyState, fresh: readonly JourneyMember[], out: TickOut): void {
  if (fresh.length === 0) return;
  const party: JourneyParty = { id: s.nextId++, phase: 'out', arrivedTick: s.tick };
  s.parties.push(party);
  joinAtHome(s, party.id, fresh, out);
}

/**
 * Rozkaz lidem (Rozhodnutí 3): vybraní jsou lidé `people`, kteří jsou ve výpravě živí a jejich
 * skupina hráče poslouchá (chybí = všichni takoví), a noví lidé `recruits` (id, která ve výpravě
 * nejsou) – ti stojí doma v novém hloučku. Napřed ověření: „Přes okraj“ na políčko nesousedící
 * s hloučkem vůdce výběru se zahodí; noví lidé ale ze vsi už odešli (`musterExpedition`), proto
 * stojí doma v nové skupině bez rozkazu (`standAtHome` – jako u Osedlat). Pak:
 * - vybraní tvoří jednu skupinu – výběr právě celé jedné skupiny (nováčci navíc) si nechá její id,
 *   jinak dostane nové (`nextId`);
 * - skupina, z níž je vybraná jen část, si nechá zbytek: její hloučky zastaví a lhůta jí běží od
 *   tohoto taktu; smíšený hlouček se rozdělí (vybraní v novém hloučku na stejném místě);
 * - hloučky výběru, které stojí na stejném místě, splynou (nováčci doma tak přejdou do hloučku
 *   skupiny, která stojí celá doma);
 * - práce s koňmi jde s jezdci (`carryHorseWork`);
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
  const chosen = chosenMembers(s, command.people);
  const fresh = freshMembers(s, command.recruits ?? []);
  if (chosen.length === 0 && fresh.length === 0) return;
  // místo vůdce výběru (nový člověk stojí doma) – k němu se měří „Jdi sem“ i „Přes okraj“
  const leader = partyLeader([...chosen, ...fresh])!;
  const at = leader.group < 0 ? s.home : groups.get(leader.group)!;
  const from: CampaignPlace = { cell: { ...at.cell }, pos: { ...at.pos } };
  const order = command.order;
  if (order.kind === 'cross' && directionBetween(from.cell, order.cell) === null) {
    standAtHome(s, fresh, out);
    return;
  }

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
  if (target !== only) {
    s.parties.push(target);
    carryHorseWork(s, touched, target, picked, out);
  }

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
  if (fresh.length > 0) joinAtHome(s, target.id, fresh, out);
  for (const p of touched) if (p !== target) stopRest(s, p, out);
  s.parties = s.parties.filter((p) => s.groups.some((g) => g.party === p.id));
  mergeGroups(s, target.id, (a, b) => a.arrived && b.arrived && samePlace(a, b));
  orderParty(s, target, order, from);
}

/**
 * Práce s koňmi po rozdělení nebo spojení skupin (plán 2026-11-14 – Rozhodnutí 7: rozkaz během
 * sedlání platí po něm; návrh Clauda): jezdci z výběru `picked` si ji vezmou s sebou – nová skupina
 * `target` čeká na tu ze skupin `touched`, která skončí nejpozději, a sejdou se v ní jezdci prací
 * téhož druhu. Skupině zbudou její ostatní jezdci; bez nich nečeká. Jezdec z práce jiného druhu
 * (osedlání i sesednutí v jednom výběru) ji opustí – sesedaný zůstane na koni (kůň je venku dál),
 * sedlaný zůstane bez koně a ves dostane `journey-horse` null (kůň, kterého vesničan vedl, je zase
 * v ohradě).
 */
function carryHorseWork(
  s: JourneyState,
  touched: readonly JourneyParty[],
  target: JourneyParty,
  picked: ReadonlySet<number>,
  out: TickOut,
): void {
  const works = touched.flatMap((p) =>
    p.horseWork?.riders.some((id) => picked.has(id)) ? [p.horseWork] : [],
  );
  let kept: HorseWork | undefined;
  for (const w of works) if (kept === undefined || w.untilTick > kept.untilTick) kept = w;
  if (kept !== undefined) {
    const kind = kept.kind;
    const riders = works
      .filter((w) => w.kind === kind)
      .flatMap((w) => w.riders.filter((id) => picked.has(id)));
    target.horseWork = { ...cloneData(kept), riders };
    if (kind === 'unsaddle') {
      for (const w of works) {
        if (w.kind !== 'saddle') continue;
        for (const id of w.riders) if (picked.has(id)) sendHorse(s, out, id, null);
      }
    }
  }
  for (const p of touched) {
    const rest = p.horseWork?.riders.filter((id) => !picked.has(id));
    if (rest === undefined) continue;
    if (rest.length > 0) p.horseWork!.riders = rest;
    else delete p.horseWork;
  }
}

/**
 * Osedlat (expeditions.md – Koně; plán 2026-11-14 – Rozhodnutí 7): vybraní jsou lidé
 * `chosenMembers` a noví lidé `recruits` – ti stojí doma v nové skupině bez rozkazu; ostatní zůstanou
 * ve svých skupinách (Osedlat skupiny nedělí ani nespojuje). Po skupinách; skupina, která už
 * s koňmi pracuje (`horseWork`), příkaz nevidí:
 * - jezdec s koněm vedeným za uzdu nasedne hned (i venku);
 * - jezdci bez koně u sebe, jejichž hlouček je na domovské mapě a kůň v ohradě (`riderHorse`),
 *   dostanou jednu práci `saddle`: vesničan `pickGroom` k hloučku vůdce těchto jezdců
 *   (`partyLeader`), ohrada koně prvního z nich, trvání `horseWorkTicks`; ves hned dostane
 *   `journey-horse` za každého (kůň s `riderId` jezdce je v ohradě – `applyJourneyHorse` ho vezme);
 * - jezdec venku s koněm v ohradě nenasedne („Kůň je doma.“).
 */
function saddle(
  s: JourneyState,
  command: Extract<JourneyCommand, { kind: 'saddle' }>,
  ctx: TickContext,
  out: TickOut,
): void {
  const chosen = chosenMembers(s, command.people);
  const fresh = freshMembers(s, command.recruits ?? []);
  if (fresh.length > 0) {
    standAtHome(s, fresh, out);
    chosen.push(...fresh);
  }
  if (chosen.length === 0) return;
  const groups = new Map(s.groups.map((g) => [g.id, g]));
  const skip = new Set(s.members.map((m) => m.ref.personId));
  const home = lazyHomeVillage(s, ctx);
  for (const party of s.parties) {
    if (party.horseWork) continue;
    const waiting: { m: JourneyMember; horseId: number; pen: Pen }[] = [];
    for (const m of chosen) {
      const g = groups.get(m.group)!;
      if (g.party !== party.id) continue;
      if (m.horse === 'led') {
        m.mounted = true;
        m.horse = 'ridden';
        continue;
      }
      if (m.horse !== undefined || m.horseId === undefined || !sameCell(g.cell, s.home.cell)) {
        continue;
      }
      const village = home();
      const found = village && riderHorse(village, m.ref.personId, m.horseId, s.day);
      if (found) waiting.push({ m, horseId: m.horseId, pen: found.pen });
    }
    const village = waiting.length > 0 ? home() : null;
    if (village === null) continue;
    const near = groups.get(partyLeader(waiting.map((w) => w.m))!.group)!.pos;
    const pen = { x: waiting[0]!.pen.x, z: waiting[0]!.pen.z };
    const groom = pickGroom(village, s.day, near, skip);
    const ticks = horseWorkTicks({
      kind: 'saddle',
      groom: groom?.from ?? null,
      pen,
      riders: near,
      day: s.day,
    });
    party.horseWork = {
      kind: 'saddle',
      groomId: groom?.personId ?? null,
      riders: waiting.map((w) => w.m.ref.personId),
      fromTick: s.tick,
      untilTick: s.tick + ticks,
      pen,
    };
    for (const w of waiting) sendHorse(s, out, w.m.ref.personId, w.horseId);
  }
}

/**
 * Sesednout (expeditions.md – Koně: jde kdykoli) jezdcům na koni (`horse: 'ridden'`) z výběru
 * `chosenMembers`, po skupinách; skupina, která už s koňmi pracuje, příkaz nevidí:
 * - doma (hlouček na domovské mapě, kůň jezdce ve vsi – `riderHorse`) s vesničanem (`pickGroom`)
 *   jedna práce `unsaddle` – jezdci sedí do `untilTick`, pak je kůň v ohradě (`finishHorseWork`);
 * - jinak hned `mounted` false a kůň vedený za uzdu (`led`) – mimo ves, doma bez nikoho (Rozhodnutí
 *   7: kůň zůstane u jezdce do návratu) i kůň, o kterém ves neví (starší bod).
 */
function dismount(
  s: JourneyState,
  command: Extract<JourneyCommand, { kind: 'dismount' }>,
  ctx: TickContext,
): void {
  const chosen = chosenMembers(s, command.people).filter((m) => m.horse === 'ridden');
  if (chosen.length === 0) return;
  const groups = new Map(s.groups.map((g) => [g.id, g]));
  const skip = new Set(s.members.map((m) => m.ref.personId));
  const home = lazyHomeVillage(s, ctx);
  for (const party of s.parties) {
    if (party.horseWork) continue;
    const riding = chosen.filter((m) => groups.get(m.group)!.party === party.id);
    const atHome: { m: JourneyMember; pen: Pen }[] = [];
    for (const m of riding) {
      if (!sameCell(groups.get(m.group)!.cell, s.home.cell)) continue;
      const village = home();
      const found = village && riderHorse(village, m.ref.personId, m.horseId, s.day);
      if (found) atHome.push({ m, pen: found.pen });
    }
    const village = atHome.length > 0 ? home() : null;
    if (village !== null) {
      const near = groups.get(partyLeader(atHome.map((h) => h.m))!.group)!.pos;
      const groom = pickGroom(village, s.day, near, skip);
      if (groom !== null) {
        const pen = { x: atHome[0]!.pen.x, z: atHome[0]!.pen.z };
        const ticks = horseWorkTicks({
          kind: 'unsaddle',
          groom: groom.from,
          pen,
          riders: near,
          day: s.day,
        });
        party.horseWork = {
          kind: 'unsaddle',
          groomId: groom.personId,
          riders: atHome.map((h) => h.m.ref.personId),
          fromTick: s.tick,
          untilTick: s.tick + ticks,
          pen,
        };
      }
    }
    const unsaddled = new Set(party.horseWork?.riders ?? []);
    for (const m of riding) {
      if (unsaddled.has(m.ref.personId)) continue;
      m.mounted = false;
      m.horse = 'led';
    }
  }
}

/** Domovská ves taktu (`homeVillage`) načtená jen jednou a jen tehdy, když ji příkaz potřebuje. */
function lazyHomeVillage(s: JourneyState, ctx: TickContext): () => VillageState | null {
  let village: VillageState | null | undefined;
  return () => {
    if (village === undefined) village = homeVillage(s, ctx);
    return village;
  };
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
      // stojí na stejném místě – paměť cesty druhého vede sem také
      if (!a.crossings && b.crossings) a.crossings = b.crossings;
      for (const m of s.members) if (m.group === b.id) m.group = a.id;
    }
  }
  if (gone.size > 0) s.groups = s.groups.filter((g) => !gone.has(g));
}

/** Hloučky stojí na stejném místě (políčko i poloha). */
export function samePlace(a: JourneyGroup, b: JourneyGroup): boolean {
  return sameCell(a.cell, b.cell) && a.pos.x === b.pos.x && a.pos.z === b.pos.z;
}

/**
 * Nový člověk výpravy v hloučku `group`: zdravý, živý; jezdec s `horseId` a `strengthMounted`. Kůň
 * je v ohradě, dokud ho jezdec neosedlá.
 */
export function recruitMember(recruit: JourneyRecruit, group: number): JourneyMember {
  return {
    ref: { ...recruit.ref },
    lord: recruit.lord,
    mounted: false,
    ...(recruit.horseId === undefined ? {} : { horseId: recruit.horseId }),
    strength: recruit.strength,
    ...(recruit.strengthMounted === undefined ? {} : { strengthMounted: recruit.strengthMounted }),
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
