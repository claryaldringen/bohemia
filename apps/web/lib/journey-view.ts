import type {
  ExpeditionRefusal,
  ExpeditionView,
  ExpeditionVisitor,
  GridCell,
  HuntView,
  JourneyView,
  PartyView,
  Pos,
  SeenCell,
} from '@bohemia/game';
import type { LandscapeTransfer } from './landscape-transfer';
import type { JourneyLook, SceneJourney } from './scene/journey-riders';

// Pohled na výjezd vojvody pro prohlížeč (lord-control.md; expeditions.md): typy jsou
// z jádra (`application/{journey,expedition}-view.ts`), tady jen texty důvodů a interpolace mezi dvěma dotazy.

export type {
  ExpeditionView,
  ExpeditionVisitor,
  PartyView,
  JourneyView,
  JourneyVisitor,
  JourneyOrder,
  SeenCell,
} from '@bohemia/game';

/**
 * Políčko mapy vsi pro scénu a rozkazy výprav (`homeCell` – `orderCell`, hloučky na mapě vsi):
 * políčko světa sídla; ves v odříznuté krajině místní políčko sídla – na něm stojí výprava místní
 * mřížky rodu (lov odříznutého nováčka, `ExpeditionView.localGrid`); jinak null.
 */
export function homeCellOf(settlement: {
  worldCell: GridCell | null;
  localCell?: GridCell | null;
}): GridCell | null {
  const cell = settlement.worldCell ?? settlement.localCell ?? null;
  return cell ? { x: cell.x, y: cell.y } : null;
}

/**
 * Jak často přibývá nový stav výpravy ze serveru – kolo workeru, které ukládá jedoucí skupinu
 * (journey.md – Worker); podle toho se mezi dvěma stavy interpoluje.
 */
export const JOURNEY_PUSH_MS = 1_000;

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

/** Důvod odmítnutí příkazu výpravě (`refused` = rozkaz, který nedává smysl). */
export type ExpeditionReason = ExpeditionRefusal | 'refused';

/**
 * Text důvodu u kurzoru (expeditions.md – Kdo smí jít; texty z plánu 2026-11-14); `female` – raněná
 * místo raněný (důvod prvního z výběru, který nemůže).
 */
export function expeditionReason(reason: ExpeditionReason, female = false, strike = false): string {
  switch (reason) {
    case 'young':
      // na lov (útok na zvíře) až od 14 let, na běžnou výpravu od 12
      return strike ? 'Na lov až od 14 let.' : 'Od 12 let.';
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
    // útok na zvíře (plán 2026-11-22-hunting – Úloha 11, texty)
    case 'woman':
      return 'Na lov chodí jen muži.';
    case 'no-quarry':
      return 'Zvíře tu není.';
    case 'busy':
      return 'Zkus to znovu.';
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

/** Pohled na hlouček `group` skupiny `party` výpravy `view` (panel a scéna cizí mapy). */
function journeyViewOf(
  view: ExpeditionView,
  party: ExpeditionView['parties'][number],
  group: ExpeditionView['parties'][number]['groups'][number],
): JourneyView {
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

/**
 * Pohled na výjezd vojvody pro jeho panel a scénu cizí mapy (lord-control.md): skupina s vojvodou
 * (`lord`) a její hlouček s vojvodou z pohledů na výpravy. Bez vojvody ve výpravě null.
 */
export function lordJourneyViewOf(views: readonly ExpeditionView[]): JourneyView | null {
  for (const view of views) {
    for (const party of view.parties) {
      const lord = party.people.find((p) => p.lord);
      const group = party.groups.find((g) => g.id === lord?.group);
      if (lord && group) return journeyViewOf(view, party, group);
    }
  }
  return null;
}

/**
 * Pohled na skupinu vybraných lidí (expeditions.md – Výběr a skupina; scéna cizí mapy jde za
 * hloučkem jejího vůdce): první skupina, ve které je někdo z `personIds`, a hlouček jejího vůdce
 * (bez vůdce hlouček prvního člena). Nikdo ze skupiny – null.
 */
export function partyJourneyViewOf(
  views: readonly ExpeditionView[],
  personIds: readonly number[],
): JourneyView | null {
  for (const view of views) {
    for (const party of view.parties) {
      if (!party.people.some((p) => personIds.includes(p.personId))) continue;
      const leader = party.people.find((p) => p.personId === party.leaderId) ?? party.people[0];
      const group = party.groups.find((g) => g.id === leader?.group);
      if (group) return journeyViewOf(view, party, group);
    }
  }
  return null;
}

/**
 * Id lidí skupiny, ve které je člověk `personId` vsi `villageId` (expeditions.md – Výběr a skupina:
 * klik na člena vybere celou skupinu). Id osoby je jedinečné jen ve vsi – hledá se jen ve výpravě té
 * vsi. Člověk mimo skupinu – null.
 */
export function partyMembersOf(
  views: readonly ExpeditionView[],
  villageId: string | null,
  personId: number,
): number[] | null {
  for (const view of views) {
    if (view.villageId !== villageId) continue;
    for (const party of view.parties) {
      if (party.people.some((p) => p.personId === personId)) {
        return party.people.map((p) => p.personId);
      }
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

/**
 * Lov vsi ve scéně (plán 2026-11-22-hunting – Úloha 10): pohled na lov a výprava, ve které běží.
 * `tick` – takt výpravy, ke kterému pohled platí: po konci souboje takt souboje stojí (zvíře se už
 * nehne), honci ale jdou dál a scéna podle taktu přehrává jejich cestu (`QuarryGlide`).
 */
export type SceneHunt = HuntView & { journeyId: string };

/**
 * Lov vsi scény `villageId` z pohledů vlastních výprav (jedna výprava na ves, lov v ní nejvýš
 * jeden – Rozhodnutí 1); lov jiné vsi, žádný a bez vsi scény null. Útočníky kreslí scéna jako lidi
 * výpravy (hlouček má polohu bojovníka), tady jen zvíře, honci a psi.
 */
export function sceneHuntOf(
  own: readonly ExpeditionView[],
  villageId: string | null,
): SceneHunt | null {
  if (villageId === null) return null;
  const view = own.find((v) => v.villageId === villageId && v.hunt !== null);
  if (!view?.hunt) return null;
  return { ...view.hunt, journeyId: view.journeyId, tick: Math.max(view.hunt.tick, view.tick) };
}

/** Vzhled člověka výpravy: dítě, žena, muž rodu (vojvoda a jezdci) nebo vesničan. */
function lookOf(m: { female: boolean; child: boolean }, line: boolean): JourneyLook {
  if (m.child) return 'child';
  if (m.female) return 'woman';
  return line ? 'line' : 'man';
}

/** Klíč hloučku ve scéně – jeden `SceneJourney` na hlouček. */
export const sceneJourneyKey = (journeyId: string, groupId: number): string =>
  `${journeyId}:${groupId}`;

/** Klíč muže vlastní výpravy ve scéně – id osoby je jedinečné jen ve vsi (a tedy ve výpravě). */
export const sceneManKey = (journeyId: string, personId: number): string =>
  `${journeyId}:${personId}`;

/**
 * Hloučky výprav na mapě vsi `cell` pro scénu (journey.md – Scéna vsi): jeden `SceneJourney` na
 * hlouček (klíč `${journeyId}:${groupId}`, `partyId` skupiny – praporek a výběr celé skupiny), muži
 * z lidí hloučku (klíč `sceneManKey`). Vlastní hloučky z pohledů `own` (stav z události `journeys`, s fází a dny
 * čekání), ostatní z návštěvníků vsi (cizí v dohledu domů, vlastní z jiné vsi rodu). Jméno vůdce
 * a rod vlastní skupiny dodá její záznam mezi návštěvníky. Vlastní skupina jiné vsi než `villageId`
 * (ves scény, jejíž výběr se drží) nese svou ves (`SceneJourney.villageId` – id lidí platí jen v ní).
 * `home` (odjezd a příjezd s postavami vsi) má jen skupina vsi scény na své domovské mapě.
 */
export function sceneJourneysOf(input: {
  own: readonly ExpeditionView[];
  visitors: readonly ExpeditionVisitor[];
  cell: GridCell | null;
  villageId: string | null;
}): SceneJourney[] {
  const { own, visitors, cell } = input;
  const otherVillage = (id: string | null): { villageId?: string } =>
    id === null || id === input.villageId ? {} : { villageId: id };
  const out: SceneJourney[] = [];
  if (!cell) return out;
  const done = new Set<string>();
  for (const view of own) {
    for (const party of view.parties) {
      const listed = visitors.find(
        (v) => v.own && v.journeyId === view.journeyId && v.partyId === party.id,
      );
      const other = otherVillage(view.villageId);
      for (const g of party.groups) {
        if (!sameCell(g.cell, cell)) continue;
        const key = sceneJourneyKey(view.journeyId, g.id);
        done.add(key);
        const goal = g.goal;
        out.push({
          journeyId: key,
          partyId: party.id,
          own: true,
          ...other,
          leader: listed?.leaderName ?? '',
          house: listed?.houseName ?? '',
          tick: view.tick,
          pos: { x: g.pos.x, z: g.pos.z },
          goal: goal && sameCell(goal.cell, g.cell) ? { x: goal.pos.x, z: goal.pos.z } : null,
          men: party.people
            .filter((m) => m.group === g.id)
            .map((m) => ({
              key: sceneManKey(view.journeyId, m.personId),
              personId: m.personId,
              lord: m.lord,
              mounted: m.mounted,
              wounded: m.wounded,
              look: lookOf(m, m.lord || m.rider),
              led: m.horse === 'led',
            })),
          arrived: g.arrived,
          phase: party.phase,
          waitDaysLeft: party.waitDaysLeft,
          home:
            other.villageId === undefined && sameCell(g.cell, view.home)
              ? { x: view.homePos.x, z: view.homePos.z }
              : null,
          ...(party.horseWork ? { horseWork: structuredClone(party.horseWork) } : {}),
          ...(g.setOut
            ? { setOut: { tick: g.setOut.tick, pos: { x: g.setOut.pos.x, z: g.setOut.pos.z } } }
            : {}),
        });
      }
    }
  }
  for (const v of visitors) {
    for (const g of v.groups) {
      const key = sceneJourneyKey(v.journeyId, g.id);
      if (done.has(key)) continue;
      // vlastní skupina bez známé vsi se vybrat nedá (id lidí bez vsi nic neznamená)
      const own = v.own && v.villageId !== null;
      out.push({
        journeyId: key,
        partyId: v.partyId,
        own: v.own,
        ...otherVillage(v.villageId),
        leader: v.leaderName ?? '',
        house: v.houseName,
        tick: v.tick,
        pos: { x: g.pos.x, z: g.pos.z },
        goal: g.goal ? { x: g.goal.x, z: g.goal.z } : null,
        men: v.people
          .filter((m) => m.group === g.id)
          .map((m, i) => ({
            key: own && m.personId !== null ? sceneManKey(v.journeyId, m.personId) : String(i),
            personId: own ? m.personId : null,
            lord: m.lord,
            mounted: m.mounted,
            wounded: false,
            look: lookOf(m, m.lord || m.mounted || m.led),
            led: m.led,
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

/** Klíč pohledů na výpravy – stejné takty = nic nového (worker ukládá kontrolní bod zřídka). */
export function expeditionsKey(views: readonly ExpeditionView[]): string {
  return views.map((v) => `${v.journeyId}@${v.tick}`).join('|');
}

/** Klíč seznamu jezdců – skupiny a jejich takty (stejný klíč = scéna se nepřekresluje). */
export function visitorsKey(list: readonly ExpeditionVisitor[]): string {
  return list.map((v) => `${v.journeyId}:${v.partyId}:${v.tick}:${v.people.length}`).join('|');
}

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
