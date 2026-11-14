import type {
  ExpeditionRefusal,
  ExpeditionView,
  ExpeditionVisitor,
  GridCell,
  JourneyRefusal,
  JourneyView,
  PartyView,
  Pos,
  SeenCell,
} from '@bohemia/game';
import type { LandscapeTransfer } from './landscape-transfer';
import type { SceneJourney } from './scene/journey-riders';

// Pohled na výjezd vojvody pro prohlížeč (lord-control.md; expeditions.md): typy jsou
// z jádra (`application/{journey,expedition}-view.ts`), tady jen texty důvodů a interpolace mezi dvěma dotazy.

export type {
  ExpeditionView,
  ExpeditionVisitor,
  PartyView,
  JourneyView,
  JourneyVisitor,
  JourneyOrder,
  JourneyRefusal,
  SeenCell,
} from '@bohemia/game';
export type { JourneyCommandResult } from '@bohemia/game';

/** Jak často se prohlížeč ptá na běžící výjezd – 2× za sekundu jako u tažení. */
export const JOURNEY_POLL_MS = 500;

/** Odpověď `GET /api/journey` – pohledy na výpravy hráče (prázdné = žádnou nemá), nebo chyba. */
export type JourneyResponse = { views: ExpeditionView[] } | { error: string };

/** Text u zašedlého oka: rod mapu tohoto rodu nezná (docs/design/lord-control.md – Co hráč vidí). */
export const UNKNOWN_MAP = 'Tu mapu rod nezná.';

/** Mapa, kterou rod zná, a rod, který na ní sídlí (`GET /api/journey?known=villages`). */
export interface KnownVillage {
  cell: GridCell;
  houseId: string | null;
}

/** Odpověď `GET /api/journey?known=x,y` – krajina a znalost rodu, nebo chyba (404 – nezná). */
export type KnownMapResponse =
  { map: { cell: GridCell; landscape: LandscapeTransfer }; seen: SeenCell } | { error: string };

/**
 * Mapa, kterou otevře další klik na oko rodu `houseId`: rod může mít víc známých map (víc vsí),
 * klik po klikovi je prochází dokola; `last` je naposled otevřená (nebo null – první).
 */
export function nextKnownCell(
  known: readonly KnownVillage[],
  houseId: string,
  last: GridCell | null,
): GridCell | null {
  const cells = known
    .filter((k) => k.houseId === houseId)
    .map((k) => k.cell)
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (cells.length === 0) return null;
  const at = last ? cells.findIndex((c) => c.x === last.x && c.y === last.y) : -1;
  return cells[(at + 1) % cells.length] ?? null;
}

/** Důvod odmítnutí vyslání nebo rozkazu (`refused` = rozkaz, který nedává smysl). */
export type JourneyReason = JourneyRefusal | 'refused';

const REASONS: Record<JourneyReason, string> = {
  'no-lord': 'Vojvoda tu není.',
  'lord-young': 'Vojvoda je ještě mladý.',
  'lord-wounded': 'Vojvoda je raněný.',
  'lord-away': 'Vojvoda je na tažení.',
  'village-attacked': 'Ves je napadena.',
  'journey-active': 'Vojvoda už je na cestě.',
  'bad-retinue': 'Tuhle družinu nelze vyslat.',
  unreachable: 'Tam vojvoda nedojde.',
  'war-there': 'Tam je válka.',
  refused: 'Rozkaz nelze dát.',
};

/** Text důvodu u kurzoru (docs/design/lord-control.md – Co hráč vidí). */
export function journeyReason(reason: JourneyReason): string {
  return REASONS[reason];
}

/** Důvod odmítnutí příkazu výpravě (`refused` = rozkaz, který nedává smysl). */
export type ExpeditionReason = ExpeditionRefusal | 'refused';

/**
 * Text důvodu u kurzoru (expeditions.md – Kdo smí jít; texty z plánu 2026-11-14); `female` – raněná
 * místo raněný (důvod prvního z výběru, který nemůže).
 */
export function expeditionReason(reason: ExpeditionReason, female = false): string {
  switch (reason) {
    case 'young':
      return 'Od 12 let.';
    case 'wounded':
      return female ? 'Je raněná.' : 'Je raněný.';
    case 'campaign':
      return 'Je na tažení.';
    case 'away':
      return 'Je pryč.';
    case 'village-attacked':
      return 'Ves je napadena.';
    case 'unreachable':
      return 'Tam nedojde.';
    case 'war-there':
      return 'Tam je válka.';
    case 'horse-home':
      return 'Kůň je doma.';
    case 'no-village':
    case 'nobody':
    case 'refused':
      return 'Rozkaz nelze dát.';
  }
}

const lerp = (a: Pos, b: Pos, t: number): Pos => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t,
});

/**
 * Pohledy mezi stavem `prev` a `next` v podílu `t` (0 = `prev`, 1 = `next`): poloha každého
 * hloučku se posune rovnoměrně, je-li na téže mapě a ve stejné výpravě; jinak (a bez `prev`, nebo
 * po čase) stojí v `next`. Vstup se nemění.
 */
export function interpolateExpeditions(
  prev: readonly ExpeditionView[],
  next: readonly ExpeditionView[],
  t: number,
): ExpeditionView[] {
  if (t >= 1 || prev.length === 0) return [...next];
  return next.map((view) => {
    const before = prev.find((p) => p.journeyId === view.journeyId);
    if (!before) return view;
    return {
      ...view,
      parties: view.parties.map((party) => {
        const was = before.parties.find((p) => p.id === party.id);
        if (!was) return party;
        return {
          ...party,
          groups: party.groups.map((g) => {
            const old = was.groups.find((w) => w.id === g.id);
            return old && sameCell(old.cell, g.cell)
              ? { ...g, pos: lerp(old.pos, g.pos, Math.max(0, t)) }
              : g;
          }),
        };
      }),
    };
  });
}

const sameCell = (a: GridCell, b: GridCell): boolean => a.x === b.x && a.y === b.y;

/**
 * Pohled na výjezd vojvody pro jeho panel a scénu cizí mapy (lord-control.md): skupina s vojvodou
 * (`lord`) a její hlouček s vojvodou z pohledů na výpravy. Bez vojvody ve výpravě null.
 */
export function lordJourneyViewOf(views: readonly ExpeditionView[]): JourneyView | null {
  for (const view of views) {
    for (const party of view.parties) {
      const lord = party.people.find((p) => p.lord);
      const group = party.groups.find((g) => g.id === lord?.group);
      if (!lord || !group) continue;
      const home = sameCell(group.cell, view.home);
      return {
        journeyId: view.journeyId,
        tick: view.tick,
        day: view.day,
        phase: party.phase,
        cell: { ...group.cell },
        home: { ...view.home },
        homePos: { ...view.homePos },
        men: party.people.map((p) => ({
          personId: p.personId,
          lord: p.lord,
          mounted: p.mounted,
          wounded: p.wounded,
        })),
        group: { pos: { ...group.pos }, goal: group.goal, arrived: group.arrived },
        waitDaysLeft: party.waitDaysLeft,
        controllable: party.controllable,
        seen: home ? null : (view.seen[`${group.cell.x},${group.cell.y}`] ?? null),
      };
    }
  }
  return null;
}

/** Skupiny výpravy vsi `villageId` (null = všech výprav) – panel osoby podle její skupiny. */
export function partiesOf(views: readonly ExpeditionView[], villageId: string | null): PartyView[] {
  return views
    .filter((v) => villageId === null || v.villageId === villageId)
    .flatMap((v) => v.parties);
}

/** Klíč hloučku ve scéně – jeden `SceneJourney` na hlouček. */
export const sceneJourneyKey = (journeyId: string, groupId: number): string =>
  `${journeyId}:${groupId}`;

/**
 * Hloučky výprav na mapě vsi `cell` pro scénu (journey.md – Scéna vsi): jeden `SceneJourney` na
 * hlouček (klíč `${journeyId}:${groupId}`, `partyId` skupiny – praporek a výběr celé skupiny), muži
 * z lidí hloučku. Vlastní hloučky z pohledů `own` (2× za sekundu, s fází a dny čekání), ostatní
 * z návštěvníků vsi (cizí v dohledu domů, vlastní z jiné vsi rodu). Jméno vůdce a rod vlastní
 * skupiny dodá její záznam mezi návštěvníky.
 */
export function sceneJourneysOf(input: {
  own: readonly ExpeditionView[];
  visitors: readonly ExpeditionVisitor[];
  cell: GridCell | null;
}): SceneJourney[] {
  const { own, visitors, cell } = input;
  const out: SceneJourney[] = [];
  if (!cell) return out;
  const done = new Set<string>();
  for (const view of own) {
    for (const party of view.parties) {
      const listed = visitors.find(
        (v) => v.own && v.journeyId === view.journeyId && v.partyId === party.id,
      );
      for (const g of party.groups) {
        if (!sameCell(g.cell, cell)) continue;
        const key = sceneJourneyKey(view.journeyId, g.id);
        done.add(key);
        const goal = g.goal;
        out.push({
          journeyId: key,
          partyId: party.id,
          own: true,
          leader: listed?.leaderName ?? '',
          house: listed?.houseName ?? '',
          tick: view.tick,
          pos: { x: g.pos.x, z: g.pos.z },
          goal: goal && sameCell(goal.cell, g.cell) ? { x: goal.pos.x, z: goal.pos.z } : null,
          men: party.people
            .filter((m) => m.group === g.id)
            .map((m) => ({
              key: String(m.personId),
              personId: m.personId,
              lord: m.lord,
              mounted: m.mounted,
              wounded: m.wounded,
            })),
          arrived: g.arrived,
          phase: party.phase,
          waitDaysLeft: party.waitDaysLeft,
          home: { x: view.homePos.x, z: view.homePos.z },
        });
      }
    }
  }
  for (const v of visitors) {
    for (const g of v.groups) {
      const key = sceneJourneyKey(v.journeyId, g.id);
      if (done.has(key)) continue;
      out.push({
        journeyId: key,
        partyId: v.partyId,
        own: v.own,
        leader: v.leaderName ?? '',
        house: v.houseName,
        tick: v.tick,
        pos: { x: g.pos.x, z: g.pos.z },
        goal: g.goal ? { x: g.goal.x, z: g.goal.z } : null,
        men: v.people
          .filter((m) => m.group === g.id)
          .map((m, i) => ({
            key: v.own ? String(m.personId) : String(i),
            personId: v.own ? m.personId : null,
            lord: m.lord,
            mounted: m.mounted,
            wounded: false,
          })),
        arrived: null,
        phase: null,
        waitDaysLeft: null,
        home: null,
      });
    }
  }
  return out;
}

/** Odpověď `GET /api/journey?visitors=<ves>` – jezdci na mapě vsi, nebo chyba. */
export type JourneyVisitorsResponse = { visitors: ExpeditionVisitor[] } | { error: string };

/** Bez jezdců na mapě se prohlížeč na návštěvníky ptá po 5 s (s nimi 2× za sekundu). */
export const VISITORS_IDLE_MS = 5000;

/** Stav seznamu známých map ve hře: načítá se, dotaz selhal, nebo je načtený. */
export type KnownStatus = 'loading' | 'error' | 'ready';

/**
 * Co ukáže oko: `hidden` – nemá rod (cíl tažení není vybraný); `pending` – seznam se ještě
 * nenačetl nebo dotaz selhal, oko je zašedlé a důvod se nevymýšlí; `unknown` – seznam je načtený
 * a mapu rod opravdu nezná; `open` – otevře mapu `cell`.
 */
export type KnownEyeState =
  { kind: 'hidden' } | { kind: 'pending' } | { kind: 'unknown' } | { kind: 'open'; cell: GridCell };

export function knownEyeState(
  status: KnownStatus,
  known: readonly KnownVillage[],
  houseId: string | null,
  last: GridCell | null,
): KnownEyeState {
  if (houseId === null) return { kind: 'hidden' };
  if (status !== 'ready') return { kind: 'pending' };
  const cell = nextKnownCell(known, houseId, last);
  return cell ? { kind: 'open', cell } : { kind: 'unknown' };
}
