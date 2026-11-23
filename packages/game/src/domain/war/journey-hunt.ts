import type { NewVillageEvent } from '../village/core/inbox';
import { gridOf, type TickContext } from './campaign-tick';
import { beatersPlan, endBeaters, type HuntStart } from './hunt-beaters';
import {
  addHunters,
  dropHunters,
  fightResult,
  huntFightTick,
  newHuntFight,
  releaseQuarry,
  type HuntFight,
  type NewHunter,
  type QuarryState,
} from './hunt-fight';
import type { JourneyHunt, JourneyMember, JourneyState } from './journey-types';
import { dayOfTick, hoursPerTick, tickRandom } from './ticks';

// Lov ve výpravě (hunting.md – Pravidla 3, 7; plán 2026-11-22-hunting – Rozhodnutí 1, 4, 6): lov
// je součást výpravy domovské vsi (`JourneyState.hunt`) – honci jdou ze dvorce k dveřím lesa,
// tam zvíře vyběhne a běží souboj (`hunt-fight.ts`) na mřížce pochodu domovské mapy. Konec
// souboje (zabití, nebo útěk po nečinnosti) vydá jednou výsledek do vsi a pošle honce domů; až
// jsou doma, lov zmizí – výprava bez skupin pak končí (`journey.ts`). Útočníci (povel `strike`,
// Úloha 7) jsou lidé výpravy ve skupinách s `hunting`: do souboje je přidá `joinHunt`, každý takt
// po souboji dostanou polohu, zdraví, rány a ztrátu koně svého bojovníka. Mutuje stav taktu (kopii,
// kterou `journeyTick` zahodí, chybí-li data); náhoda jen ze seedu výpravy, taktu a id lovu.

/**
 * Co vydal takt lovu: události do vsi (`hunt-result`), zda někdo z útočníků padl či byl raněn
 * (`losses` – `afterLosses`) a zda v tomto taktu souboj skončil (`ended` – útočníci jdou domů
 * s honci; plán – Otázky vyřešeno 2).
 */
export interface HuntTickOut {
  events: NewVillageEvent[];
  losses: boolean;
  ended: boolean;
}

/**
 * Nový lov ve výpravě; běží-li jiný, nic. Honci vyjdou ze dvorce (`home.pos`) v taktu `tick`,
 * zvíře čeká skryté u dveří lesa (`newHuntFight`); id lovu je z `nextId` výpravy.
 */
export function startHunt(s: JourneyState, start: HuntStart, tick: number): void {
  if (s.hunt !== undefined) return;
  s.hunt = {
    id: s.nextId++,
    day: start.day,
    dogs: start.dogs,
    out: { x: start.out.x, z: start.out.z },
    beaters: beatersPlan(s.home.pos, start.door, tick),
    fight: newHuntFight(start.quarry, start.door, tick),
  };
}

/**
 * Takt lovu `tick` (stav výpravy už má den taktu): honci u dveří → skryté zvíře vyběhne
 * (`releaseQuarry`); souboj taktu (`huntFightTick` – na mřížce pochodu domovské mapy pro den taktu
 * jako pohyb hloučků, náhoda `tickRandom(seed, takt, 'hunt:<id>')`; skryté zvíře jen čeká). Konec
 * souboje → honci domů (`endBeaters` – s úlovkem přes místo, kde padl) a jednou `hunt-result` do
 * domovské vsi na den taktu (`ref` `journey:<id>:hunt:<id lovu>` – druhé doručení zahodí
 * schránka). Honci doma (`homeTick`) → lov zmizí.
 */
export function huntTick(s: JourneyState, tick: number, ctx: TickContext): HuntTickOut {
  const out: HuntTickOut = { events: [], losses: false, ended: false };
  const hunt = s.hunt;
  if (hunt === undefined) return out;
  const f = hunt.fight;
  if (f.outcome === 'ongoing') {
    if (f.quarry.state === 'hidden' && tick >= hunt.beaters.arriveTick) {
      releaseQuarry(f, hunt.out, tick);
    }
    // souboj vzniklý v tomto taktu je už spočtený (`f.tick`); skryté zvíře mřížku nepotřebuje
    if (f.tick < tick) {
      const grid = f.quarry.state === 'hidden' ? null : gridOf(s.home.cell, s.day, ctx);
      const field = { grid, hoursPerTick: hoursPerTick(ctx.world.clock) };
      dropStrays(s, f);
      huntFightTick(f, field, tickRandom(s.seed, tick, `hunt:${hunt.id}`));
      out.losses = syncStrikers(s, f);
    }
    if (f.outcome !== 'ongoing') {
      endBeaters(hunt.beaters, tick, f.quarry.pos, f.outcome === 'killed');
      out.ended = true;
    }
  }
  if (f.outcome !== 'ongoing' && !hunt.reported) {
    hunt.reported = true;
    out.events.push(resultEvent(s, hunt, tick, ctx));
  }
  const home = hunt.beaters.homeTick;
  if (home !== null && tick >= home) delete s.hunt;
  return out;
}

/** Stav zvířete, na které útok nejde – v lese, padlé, nebo na útěku do lesa. */
const NO_STRIKE: ReadonlySet<QuarryState> = new Set<QuarryState>([
  'hidden',
  'dead',
  'escape',
  'gone',
]);

/**
 * Zvíře lovu je venku a souboj běží – útok jde (povel `strike`; plán Úloha 7): ne v lese, padlé, ani
 * na útěku do lesa (`hidden`, `dead`, `escape`, `gone`). Use-case podle toho odmítne povel předem.
 */
export function quarryOut(hunt: JourneyHunt): boolean {
  return hunt.fight.outcome === 'ongoing' && !NO_STRIKE.has(hunt.fight.quarry.state);
}

/**
 * Útočníci skupiny `party` do souboje (povel `strike`; Úloha 7): živí lidé jejích hloučků na místě
 * svého hloučku – jezdec, kdo sedí na svém koni (`mounted` a `horse: 'ridden'`), se silou na koni
 * (`strengthMounted`, chybí – jako pěšky), dovednosti luk, boj (`fight`) a jízda, muž rodu (`line`)
 * a zdraví. Jméno a jezdeckého koně si lov podrží pro výsledek (`strikers`, každého jednou).
 * Souboj, který už skončil, nikoho nepřidá (`addHunters`); bez lovu nic.
 */
export function joinHunt(s: JourneyState, party: number, tick: number): void {
  const hunt = s.hunt;
  if (hunt === undefined) return;
  const groups = new Map(s.groups.filter((g) => g.party === party).map((g) => [g.id, g]));
  const hunters: NewHunter[] = [];
  for (const m of s.members) {
    const g = groups.get(m.group);
    if (g === undefined || m.status !== 'active') continue;
    hunters.push(newHunterOf(m, g.pos));
    rememberStriker(hunt, m);
  }
  addHunters(hunt.fight, hunters, tick);
}

/** Člověk výpravy jako útočník souboje na místě `pos`. */
function newHunterOf(m: JourneyMember, pos: { x: number; z: number }): NewHunter {
  const mounted = m.mounted && m.horse === 'ridden';
  return {
    personId: m.ref.personId,
    pos: { x: pos.x, z: pos.z },
    mounted,
    strength: mounted ? (m.strengthMounted ?? m.strength) : m.strength,
    footStrength: m.strength,
    skills: { bow: m.bow ?? 0, combat: m.fight, riding: m.riding ?? 0 },
    lineMan: m.line === true,
    health: m.health,
  };
}

/** Jméno a jezdecký kůň útočníka pro výsledek – jen poprvé (padlému koni se `horseId` maže). */
function rememberStriker(hunt: JourneyHunt, m: JourneyMember): void {
  const strikers = (hunt.strikers ??= []);
  if (strikers.some((x) => x.personId === m.ref.personId)) return;
  strikers.push({
    personId: m.ref.personId,
    ...(m.name === undefined ? {} : { name: m.name }),
    ...(m.horseId === undefined ? {} : { horseId: m.horseId }),
  });
}

/**
 * Skupina `party` opouští lov (jiný rozkaz, odvolání, ztráta vojvody – plán Úloha 7): v souboji, který
 * běží, její lidé dál nejednají (`dropHunters` – výcvik a rány jim zůstanou pro výsledek) a skupina
 * přestane lovit; dál platí nový rozkaz. Skupina, která neloví, beze změny.
 */
export function leaveHunt(s: JourneyState, party: number): void {
  const p = s.parties.find((x) => x.id === party);
  if (p?.hunting !== true) return;
  delete p.hunting;
  const f = s.hunt?.fight;
  if (f === undefined || f.outcome !== 'ongoing') return;
  const groups = new Set(s.groups.filter((g) => g.party === party).map((g) => g.id));
  dropHunters(
    f,
    s.members.filter((m) => groups.has(m.group)).map((m) => m.ref.personId),
  );
}

/**
 * Útočníci po taktu souboje (Úloha 7): živý člověk skupiny s `hunting`, který v souboji je, dostane
 * polohu bojovníka do svého hloučku a jeho zdraví; komu padl kůň (`horseLost`), sedí pěšky bez koně
 * (`mounted`, `horse` i `horseId` pryč – ves koně ztratí výsledkem); padlý bojovník (`down`) je
 * mrtvý (`fallen`), nebo raněný (`wounded`, `woundedDay` den taktu). Vrací, zda někdo nově padl či byl
 * raněn (`afterLosses`).
 */
function syncStrikers(s: JourneyState, f: HuntFight): boolean {
  const hunting = new Set(s.parties.filter((p) => p.hunting).map((p) => p.id));
  if (hunting.size === 0) return false;
  const fighters = new Map(f.hunters.map((h) => [h.personId, h]));
  const groups = new Map(s.groups.map((g) => [g.id, g]));
  let losses = false;
  for (const m of s.members) {
    const g = groups.get(m.group);
    const h = fighters.get(m.ref.personId);
    if (g === undefined || h === undefined || !hunting.has(g.party) || m.status !== 'active') {
      continue;
    }
    if (g.pos.x !== h.pos.x || g.pos.z !== h.pos.z) g.pos = { x: h.pos.x, z: h.pos.z };
    m.health = h.health;
    if (h.horseLost && (m.mounted || m.horse !== undefined || m.horseId !== undefined)) {
      m.mounted = false;
      delete m.horse;
      delete m.horseId;
    }
    if (h.state !== 'down') continue;
    if (h.killed) {
      m.status = 'fallen';
      losses = true;
    } else if (!m.wounded) {
      m.wounded = true;
      m.woundedDay = s.day;
      losses = true;
    }
  }
  return losses;
}

/**
 * Bojovník, jehož člověk v lovící skupině výpravy už není (zemřel doma – `homeDay`), v souboji dál
 * nejedná (`dropHunters`) – zvíře tak nehoní a nezabije nikdo, kdo ve výpravě není.
 */
function dropStrays(s: JourneyState, f: HuntFight): void {
  if (f.hunters.length === 0) return;
  const hunting = new Set(s.parties.filter((p) => p.hunting).map((p) => p.id));
  const partyOfGroup = new Map(s.groups.map((g) => [g.id, g.party]));
  const on = new Set(
    s.members
      .filter((m) => m.status === 'active' && hunting.has(partyOfGroup.get(m.group) ?? -1))
      .map((m) => m.ref.personId),
  );
  const strays = f.hunters.filter((h) => !h.left && h.state !== 'down' && !on.has(h.personId));
  if (strays.length > 0)
    dropHunters(
      f,
      strays.map((h) => h.personId),
    );
}

/**
 * Výsledek lovu do domovské vsi (`fightResult`): jména útočníků a jejich jezdecké koně
 * (`horseId`) z útočníků, které si lov podržel (`strikers`), jinak z lidí výpravy.
 */
function resultEvent(
  s: JourneyState,
  hunt: JourneyHunt,
  tick: number,
  ctx: TickContext,
): NewVillageEvent {
  const names = new Map<number, string>();
  const horses = new Map<number, number>();
  for (const m of [...s.members, ...(hunt.strikers ?? [])]) {
    const id = 'ref' in m ? m.ref.personId : m.personId;
    if (m.name !== undefined) names.set(id, m.name);
    if (m.horseId !== undefined) horses.set(id, m.horseId);
  }
  return {
    villageId: s.home.villageId,
    day: dayOfTick(tick, ctx.world.clock),
    ref: `journey:${s.id}:hunt:${hunt.id}`,
    body: {
      kind: 'hunt-result',
      journeyId: s.id,
      huntId: hunt.id,
      result: fightResult(hunt.fight, names, horses),
    },
  };
}
