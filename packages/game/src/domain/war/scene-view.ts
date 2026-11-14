import { crossingLayers } from '../village/fortification';
import { ageYears, isAway } from '../village/people/people';
import type {
  DwellingType,
  FlightMode,
  Position,
  RefugeePerson,
  VillageState,
  WallKind,
} from '../village/types';
import { sameCell, type GridCell } from '../village/people/world-grid';
import type { AlarmMover } from './alarm-types';
import type {
  BattleBreach,
  BattleFort,
  BattleGroup,
  BattleOutcome,
  BattleSide,
  BattleState,
  Fighter,
} from './battle';
import type { CampaignGroup, CampaignLeg, CampaignMember, CampaignState } from './campaign-types';
import { houseGroups } from './defenders';
import { nearestForest } from './flight';
import type { BattleLadder } from './ladders';
import type { MarchGrid, Pos } from './march-grid';
import { WAR } from './rules-war';
import { breakoutChoice, type BreakoutBlock } from './rout';
import type { SeenCell } from './seen';
import { inSight } from './sight';

// Válka ve scéně jedné mapy (war.md – Ve scéně; scene.md – Vojsko, boj a mlha války): co z tažení
// vidí hráč na mapě, kterou má právě ve 3D scéně – vlastní stranu celou, druhou jen v dohledu
// vlastních očí (mlha války jako `campaignView`). Server je jediná autorita, scéna jen kreslí.

/**
 * Bojovník pro scénu – jen co scéna kreslí (žádné `ref`, síla, cíle ani trasy). Zdraví jen u vlastní
 * strany; cizí muž nese hrubý stav (`state` – na nohou / `down`, `killed` – padlý) a počet zásahů
 * `hits` (scéna pozná ránu; přesné zdraví pohled na tažení tají – `CampaignViewForeign`).
 */
export type WarSceneFighter = Pick<
  Fighter,
  | 'id'
  | 'side'
  | 'group'
  | 'line'
  | 'bow'
  | 'mounted'
  | 'hits'
  | 'pos'
  | 'home'
  | 'state'
  | 'cooldown'
  | 'aim'
  | 'killed'
  | 'breachAt'
  | 'ladder'
  | 'onWall'
  | 'underground'
  | 'climb'
  | 'cover'
  | 'surrendered'
> & {
  /** Zdraví 0–100 – jen vlastní strana. */
  health?: number;
};

/** Rozdělaný průlom pro scénu (bez cílů a dalších údajů boje). */
export type WarSceneBreach = Pick<
  BattleBreach,
  'key' | 'fort' | 'segment' | 'spot' | 'at' | 'method' | 'phase' | 'need' | 'moat' | 'progress'
>;

/** Hradba úseku na bojišti: lomená čára, stojící hradba (null – mezera, průlom) a výška valu. */
export interface WarSceneWall {
  fort: number;
  segment: number;
  path: Pos[];
  kind: WallKind | null;
  rampart: number;
}

/** Boj na mapě – jen viditelné. */
export interface WarSceneBattle {
  ticks: number;
  outcome: BattleOutcome;
  fighters: WarSceneFighter[];
  groups: Pick<BattleGroup, 'side' | 'id' | 'order' | 'broken'>[];
  closedGates: string[];
  breaches: WarSceneBreach[];
  ladders: BattleLadder[];
  walls: WarSceneWall[];
}

/** Skupina vojska na pochodu – poloha, rozkaz a směr chůze (jednotkový). */
export type WarSceneGroup = Pick<CampaignGroup, 'id' | 'order' | 'pos' | 'arrived'> & {
  heading: Pos;
};

/** Pochod na mapě – viditelné skupiny a jejich muži (vzhled, ne kdo to je). */
export interface WarSceneMarch {
  members: Pick<CampaignMember, 'line' | 'mounted' | 'wounded' | 'group' | 'status'>[];
  groups: WarSceneGroup[];
  /**
   * Odehnané stádo (kořist – `CampaignLoot.herd` kusů) jde se skupinou `group` (war.md – Napadená
   * ves). Chybí – stádo nevedou, nebo jeho skupina není vidět.
   */
  herd?: { group: number; count: number };
}

/**
 * Člověk napadené vsi pro útěk ve scéně (`sceneFolkOf`) – dům, skupina domů (`houseGroups`),
 * postava, dítě a jestli nese zásoby (`fleeParty`). Jen vlastní ves obránce.
 */
export interface WarSceneFolk {
  id: number;
  home: Pos;
  group: number;
  kind: 'man' | 'woman';
  /** Dítě (mladší než `WAR.flight.adultFromYears`) – menší postava. */
  child: boolean;
  /** Nese zásoby (od `WAR.flight.childFromYears` – dospělý 25 kg, dítě 10 kg). */
  carries: boolean;
}

/** Utíkající člověk – od domu k okraji lesa `forest` (index v `WarSceneFlight.forests`). */
export type WarSceneFleeing = Omit<WarSceneFolk, 'group'> & { forest: number };

/**
 * Útěk vsi do lesa (war.md – Napadená ves; `ShelterReport.forest`, `livestockForest`): kdo utekl,
 * ke kterému okraji lesa a kolik dobytka hnali. Jen obránce na mapě své vsi.
 */
export interface WarSceneFlight {
  /** Takt, kdy ves utekla (otevření boje – `BattleState.openTick`); null – neznámo, stojí u lesa. */
  startTick: number | null;
  /** Okraje lesa (`nearestForest` od první skupiny domů jako v `planDefense`). */
  forests: Pos[];
  people: WarSceneFleeing[];
  /** Dobytek hnaný do lesa (kusů). */
  herd: number;
}

/** Člověk v průvodu uprchlíků – jen vzhled: postava, dítě, nese zásoby. */
export type WarSceneRefugee = Pick<WarSceneFolk, 'kind' | 'child' | 'carries'>;

/**
 * Průvod uprchlíků na mapě (war.md – Varování, poslové a útěk do hradiště: evakuace; `AlarmFlight`)
 * – hlouček lidí s nákladem, za nimi stádo a vozy. Vlastní (`own` – ves hráče) vidí hráč vždy,
 * cizí jen v dohledu vlastních očí.
 */
export interface WarSceneRefugeMarch {
  refId: string;
  /** Skupina z vsi hráče, který se dívá. */
  own: boolean;
  mode: FlightMode;
  pos: Pos;
  /** Směr chůze (jednotkový) – k dalšímu bodu úseku, jinak k cíli. */
  heading: Pos;
  /** Jdou (`marching`); false – stojí ukrytí u lesa (`hidden`, jen vlastní). */
  moving: boolean;
  /** Kdo jde (bez padlých a odvedených – `lost`), vzestupně podle id. */
  people: WarSceneRefugee[];
  /** Hnaný dobytek (kusů všech druhů). */
  herd: number;
  /** Vozy se spřežením. */
  carts: number;
}

/** Posel na mapě (`AlarmMessenger`, jen běžící) – jedna postava během, nebo jezdec. */
export interface WarSceneMessenger {
  refId: string;
  /** Posel z vsi hráče, který se dívá. */
  own: boolean;
  pos: Pos;
  heading: Pos;
  mounted: boolean;
}

/** Dům cílové vsi, který útočník objevil (`CampaignState.discovered`) – jen co scéna kreslí. */
export interface WarSceneBuilding {
  id: number;
  type: DwellingType;
  position: Position;
}

/** Válka na jedné mapě z pohledu jedné strany. */
export interface WarSceneView {
  campaignId: string;
  /** Takt stavu – klient se ptá `since`. */
  tick: number;
  day: number;
  /** Ze které strany se hráč dívá (mlha – scéna kreslí jen to, co poslal server). */
  side: BattleSide;
  battle: WarSceneBattle | null;
  march: WarSceneMarch | null;
  /**
   * Útočník na mapě cíle: objevené domy cílové vsi (mlha války – nic dalšího o cizí vsi). Obránce
   * svou ves kreslí ze svého stavu – pole chybí.
   */
  buildings?: WarSceneBuilding[];
  /**
   * Útočník na mapě, kde vojsko stojí: co jeho rod o mapě ví (plán 2026-11-13 – Úlohy 11 a 12b) –
   * stopa k odkrytí mlhy a stavby naposled viděné. Na mapě cíle `knownTarget` (bez objevených domů
   * – `buildings` – a opevnění), na mapě po cestě znalost rodu té mapy, jak je. Doplní use-case
   * `warSceneOnMap`; chybí – rod mapu nezná (a na mapě cíle na ní tažení nebylo). Obránce nikdy.
   */
  known?: SeenCell;
  /** Obránce na mapě své vsi: útěk vsi do lesa se stády. Chybí – nikdo neutekl. */
  flight?: WarSceneFlight;
  /**
   * Obránce na mapě své vsi s opevněním s branou při boji (fortifications.md – Obrana bez násobku
   * 3, Bod zlomu a probíjení): rozkaz „Probít se“ jde (`blocked` null), nebo proč ne
   * (`breakoutChoice`). Chybí – ves nemá opevnění s branou, nebo se nebojuje.
   */
  breakout?: { blocked: BreakoutBlock | null };
  /**
   * Průvody uprchlíků na mapě (Ú14): vlastní vždy, cizí jen v dohledu (`inSight`). Chybí – žádný
   * vidět není.
   */
  refugeMarch?: WarSceneRefugeMarch[];
  /** Běžící poslové na mapě – vlastní vždy, cizí jen v dohledu. Chybí – žádný vidět není. */
  messengers?: WarSceneMessenger[];
}

/** Vstup: mapa, strana hráče, mřížka mapy (dohled v lese) a oči mimo boj (domy vsi obránce). */
export interface WarSceneInput {
  cell: GridCell;
  side: BattleSide;
  /** Mřížka pochodu mapy; null = dohled všude jako v lese (raději skryje víc). */
  grid: MarchGrid | null;
  /** Odkud strana vidí i bez bojovníků – u obránce domy vsi (návrh Clauda); útočník []. */
  eyes: readonly Pos[];
  /** Opevnění bojiště (jako v boji – `battleForts`) a den – výšky hradeb; [] = bez hradeb. */
  forts: readonly BattleFort[];
  /** Domy cílové vsi – útočník na mapě cíle z nich vidí jen objevené (`discovered`). */
  buildings?: readonly WarSceneBuilding[];
  /** Lidé napadené vsi (`sceneFolkOf`) – jen obránce, pro útěk do lesa. */
  folk?: readonly WarSceneFolk[];
  /**
   * Hráč, který se dívá – skupiny uprchlíků a posly svých vsí (`AlarmVillage.owner`) vidí vždy;
   * chybí – všechny jen v dohledu.
   */
  playerId?: string;
  /**
   * Obránce s vojvodou doma (war.md – Hráč ve vsi a mimo ni): na své mapě vidí všechny skupiny
   * a bojovníky bez ohledu na dohled – ihned, jak jsou na ní. Chybí – mlha války jako dřív.
   */
  seesAll?: boolean;
}

/**
 * Hradby bojiště (`BattleFort`, `crossingLayers`): po úsecích lomená čára, stojící hradba v den
 * `day` a výška valu – lezci a obránci na ochozu stojí ve správné výšce. Pořadí jako na bojišti.
 */
export function battleWallsOf(forts: readonly BattleFort[], day: number): WarSceneWall[] {
  return forts.flatMap((bf, fort) =>
    bf.shapes.flatMap((shape) => {
      const seg = bf.fort.segments.find((s) => s.index === shape.index);
      if (!seg) return [];
      const layers = crossingLayers(bf.fort, seg, day, false);
      return [
        {
          fort,
          segment: shape.index,
          path: shape.path.map(([x, z]) => ({ x, z })),
          kind: layers.wall?.kind ?? null,
          rampart: layers.rampart?.height ?? 0,
        },
      ];
    }),
  );
}

const STANDING: ReadonlySet<Fighter['state']> = new Set(['fight', 'breach', 'climb']);

/**
 * Boj, který scéna ukazuje: běžící, nebo rozhodnutý v dnešní herní den (padlí leží do konce dne,
 * ranění sedí u domů – war.md, Ve scéně: Boj). Jinak null.
 */
export function shownBattle(state: CampaignState): BattleState | null {
  const b = state.battle;
  if (!b) return null;
  if (b.outcome === 'ongoing') return b;
  // výsledek nájezdu odchází v taktu rozhodnutí (`reportRaid` – `raidDay` = den rozhodnutí)
  return state.raidDay === state.day ? b : null;
}

/**
 * Co strana `side` vidí z tažení na mapě `cell`: vlastní strana celá, druhá jen v dohledu (`inSight`)
 * vlastních bojovníků na nohou a očí `eyes`. Útočník je vlastní stranou celé vojsko tažení (i muži
 * vazalů). Boj je jen na mapě cíle – běžící celý, rozhodnutý do konce dne jen padlí a ranění (vedle
 * pochodu). Obránce na mapě své vsi vidí i útěk vsi do lesa. Nic na mapě – null.
 */
export function warSceneView(state: CampaignState, input: WarSceneInput): WarSceneView | null {
  const { side, grid } = input;
  const onTarget = sameCell(state.target.cell, input.cell);
  const shown = onTarget ? shownBattle(state) : null;
  const fight = shown?.outcome === 'ongoing' ? shown : null;
  const battle = shown ? battleView(shown, state.day, input, fight === null) : null;
  // po konci boje se kreslí pochod – vojsko jde dál (vedle padlých do konce dne)
  const march = fight ? null : marchView(state, input);
  const alarm = alarmView(state, input, shown);
  if (!battle && !march && !alarm.refugeMarch && !alarm.messengers) return null;
  const view: WarSceneView = {
    campaignId: state.id,
    tick: state.tick,
    day: state.day,
    side,
    battle,
    march,
  };
  // cizí ves útočník zná jen z domů, na které jeho muži dohlédli (objevené zůstane)
  const known = new Set(state.discovered);
  const buildings =
    side === 'attack' && onTarget
      ? (input.buildings ?? [])
          .filter((b) => known.has(b.id))
          .map((b) => ({
            id: b.id,
            type: b.type,
            position: { x: b.position.x, z: b.position.z, rotation: b.position.rotation },
          }))
      : [];
  if (buildings.length > 0) view.buildings = buildings;
  const flight = side === 'defend' && onTarget ? flightView(state, input) : null;
  if (flight) view.flight = flight;
  const breakout = side === 'defend' && shown ? breakoutChoice(shown, input.forts) : null;
  if (breakout) view.breakout = { blocked: 'blocked' in breakout ? breakout.blocked : null };
  if (alarm.refugeMarch) view.refugeMarch = alarm.refugeMarch;
  if (alarm.messengers) view.messengers = alarm.messengers;
  return view;

  function marchView(s: CampaignState, inp: WarSceneInput): WarSceneMarch | null {
    const groups = s.groups.filter(
      (g) =>
        sameCell(g.cell, inp.cell) &&
        (side === 'attack' ||
          inp.seesAll === true ||
          inp.eyes.some((e) => inSight(grid, e, g.pos))),
    );
    const ids = new Set(groups.map((g) => g.id));
    const members = s.members
      .filter((m) => ids.has(m.group) && m.status === 'active')
      .map((m) => ({
        line: m.line,
        mounted: m.mounted,
        wounded: m.wounded,
        group: m.group,
        status: m.status,
      }));
    if (members.length === 0) return null;
    const out: WarSceneMarch = {
      members,
      groups: groups.map((g) => ({
        id: g.id,
        order: g.order,
        pos: { x: g.pos.x, z: g.pos.z },
        arrived: g.arrived,
        heading: headingOf(g),
      })),
    };
    const herd = herdGroupOf(s);
    if (herd !== null && ids.has(herd)) out.herd = { group: herd, count: s.loot.herd };
    return out;
  }
}

/**
 * Skupina, se kterou jde odehnané stádo: nejmenší id skupiny s mužem na nohou (návrh Clauda –
 * kořist nese vojsko jako celek, stádo jde s jednou skupinou). null – stádo nevedou.
 */
function herdGroupOf(s: CampaignState): number | null {
  if (s.loot.herd <= 0) return null;
  const active = s.members.filter((m) => m.status === 'active').map((m) => m.group);
  return active.length > 0 ? Math.min(...active) : null;
}

/**
 * Lidé vsi pro útěk ve scéně v den `day` (přítomní – `isAway`): dům, skupina domů jako
 * v `planDefense` (`houseGroups`), postava, dítě a nesení zásob jako `fleeParty`.
 */
export function sceneFolkOf(state: VillageState, day: number): WarSceneFolk[] {
  const groupOf = houseGroups(state.dwellings);
  const homes = new Map(state.dwellings.map((d) => [d.id, d]));
  const f = WAR.flight;
  return state.people
    .filter((p) => !isAway(p, day))
    .flatMap((p) => {
      const home = homes.get(p.dwellingId) ?? state.dwellings[0];
      if (!home) return [];
      const age = ageYears(p.bornDay, day);
      return [
        {
          id: p.id,
          home: { x: home.position.x, z: home.position.z },
          group: groupOf.get(home.id) ?? 0,
          kind: p.sex === 'female' ? ('woman' as const) : ('man' as const),
          child: age < f.adultFromYears,
          carries: age >= f.childFromYears,
        },
      ];
    })
    .sort((a, b) => a.id - b.id);
}

/**
 * Útěk vsi do lesa z pohledu obránce (`ShelterReport.forest` – kdo utekl, `livestockForest` –
 * dobytek): každá skupina domů k okraji lesa nejbližšímu svému prvnímu člověku (`nearestForest`
 * jako v `planDefense`). Bez mřížky (les neznámý) nebo bez utečených – null.
 */
function flightView(state: CampaignState, input: WarSceneInput): WarSceneFlight | null {
  const b = state.battle;
  const shelter = b?.shelter;
  if (!b || !shelter || !input.grid || !input.folk || shelter.forest.length === 0) return null;
  const folk = new Map(input.folk.map((p) => [p.id, p]));
  const fled = shelter.forest.flatMap((id) => folk.get(id) ?? []).sort((x, y) => x.id - y.id);
  const forests: Pos[] = [];
  const forestOf = new Map<number, number | null>();
  const people: WarSceneFleeing[] = [];
  for (const p of fled) {
    if (!forestOf.has(p.group)) {
      const at = nearestForest(input.grid, p.home);
      forestOf.set(p.group, at ? forests.push({ x: at.x, z: at.z }) - 1 : null);
    }
    const forest = forestOf.get(p.group);
    if (forest === null || forest === undefined) continue;
    people.push({
      id: p.id,
      home: { x: p.home.x, z: p.home.z },
      kind: p.kind,
      child: p.child,
      carries: p.carries,
      forest,
    });
  }
  if (people.length === 0) return null;
  const herd = Object.values(shelter.livestockForest).reduce((n, k) => n + k, 0);
  // takt otevření boje; starší stav bez něj – u běžícího boje z počtu taktů, jinak neznámo
  const startTick = b.openTick ?? (b.outcome === 'ongoing' ? state.tick - b.ticks + 1 : null);
  return { startTick, forests, people, herd };
}

/**
 * Boj pro scénu; `fallenOnly` – rozhodnutý boj: jen padlí a ranění (`down`) bez skupin – leží
 * a sedí do konce dne, stojící odešli (pochod nebo ves).
 */
function battleView(
  b: BattleState,
  day: number,
  input: WarSceneInput,
  fallenOnly: boolean,
): WarSceneBattle | null {
  const { side, grid } = input;
  const eyes = [
    ...input.eyes,
    ...b.fighters.filter((f) => f.side === side && STANDING.has(f.state)).map((f) => f.pos),
  ];
  const sees = (p: Pos): boolean => input.seesAll === true || eyes.some((e) => inSight(grid, e, p));
  const shown = b.fighters.filter(
    (f) => (!fallenOnly || f.state === 'down') && (f.side === side || sees(f.pos)),
  );
  const ids = new Set(shown.map((f) => f.id));
  const fighters = shown.map((f): WarSceneFighter => {
    const own = f.side === side;
    return {
      id: f.id,
      side: f.side,
      group: f.group,
      line: f.line,
      bow: f.bow,
      mounted: f.mounted,
      ...(own ? { health: f.health } : {}),
      ...(f.hits ? { hits: f.hits } : {}),
      pos: { x: f.pos.x, z: f.pos.z },
      // domov cizího muže se neprozradí – raněný sedí, kde je
      home: own ? { x: f.home.x, z: f.home.z } : { x: f.pos.x, z: f.pos.z },
      state: f.state,
      cooldown: f.cooldown,
      // cíl mimo dohled se neprozradí
      aim: f.aim !== null && ids.has(f.aim) ? f.aim : null,
      killed: f.killed,
      breachAt: f.breachAt,
      ...(f.ladder ? { ladder: true } : {}),
      ...(f.onWall ? { onWall: true } : {}),
      ...(f.underground ? { underground: true as const } : {}),
      ...(f.climb ? { climb: structuredClone(f.climb) } : {}),
      // skrčený za předprsní a vzdaný (stojí na místě bez zbraně) – jen v dohledu jako ostatní
      ...(f.cover ? { cover: true as const } : {}),
      ...(f.surrendered ? { surrendered: true as const } : {}),
    };
  });
  if (fighters.length === 0) return null;
  const groupIds = new Set(fighters.map((f) => `${f.side}:${f.group}`));
  return {
    ticks: b.ticks,
    outcome: b.outcome,
    fighters,
    groups: b.groups
      .filter((g) => !fallenOnly && groupIds.has(`${g.side}:${g.id}`))
      .map((g) => ({ side: g.side, id: g.id, order: g.order, broken: g.broken })),
    // brány a hradby jsou vidět z pole (stavba, ne vojsko)
    closedGates: [...b.closedGates],
    breaches: b.breaches
      .filter((x) => side === 'attack' || sees(x.at))
      .map((x) => ({
        key: x.key,
        fort: x.fort,
        segment: x.segment,
        spot: structuredClone(x.spot),
        at: { x: x.at.x, z: x.at.z },
        method: x.method,
        phase: x.phase,
        need: { ...x.need },
        ...(x.moat ? { moat: structuredClone(x.moat) } : {}),
        progress: structuredClone(x.progress),
      })),
    ladders: (b.ladders ?? [])
      .filter((l) => side === 'attack' || sees(l.foot))
      .map((l) => ({
        ...structuredClone(l),
        climber: l.climber !== null && ids.has(l.climber) ? l.climber : null,
      })),
    walls: battleWallsOf(input.forts, day),
  };
}

/** Směr chůze skupiny – k dalšímu bodu úseku pochodu, stojí-li k cíli, jinak na sever. */
function headingOf(g: CampaignGroup): Pos {
  return moverHeading(g.pos, g.leg, g.goal?.pos ?? null);
}

/**
 * Směr chůze z `pos` – k dalšímu bodu úseku `leg` před ušlými metry (`walkedM`) dál než 1 m, jinak
 * k `goal`, jinak na sever.
 */
function moverHeading(pos: Pos, leg: CampaignLeg | null, goal: Pos | null): Pos {
  const next = leg?.points.find((p, i) => {
    if ((leg.meadowM[i] ?? 0) <= leg.walkedM) return false;
    const px = p.x - pos.x;
    const pz = p.z - pos.z;
    return px * px + pz * pz > 1;
  });
  const to = next ?? goal ?? { x: pos.x, z: pos.z + 1 };
  const dx = to.x - pos.x;
  const dz = to.z - pos.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  return d > 1e-9 ? { x: dx / d, z: dz / d } : { x: 0, z: 1 };
}

/** Kam jde posel nebo skupina uprchlíků na své mapě (`AlarmMover`) – cíl jen na mapě cíle. */
function alarmHeading(m: AlarmMover): Pos {
  return moverHeading(m.pos, m.leg, sameCell(m.target.cell, m.cell) ? m.target.pos : null);
}

/**
 * Odkud strana vidí na mapě `input.cell` (mlha jako `campaignView`): oči `eyes` (u obránce domy),
 * vlastní bojovníci na nohou v boji na mapě a u útočníka skupiny s aktivním mužem.
 */
function sightEyes(state: CampaignState, input: WarSceneInput, shown: BattleState | null): Pos[] {
  const eyes: Pos[] = [...input.eyes];
  for (const f of shown?.fighters ?? []) {
    if (f.side === input.side && STANDING.has(f.state)) eyes.push(f.pos);
  }
  if (input.side === 'attack') {
    const active = new Set(state.members.filter((m) => m.status === 'active').map((m) => m.group));
    for (const g of state.groups) {
      if (active.has(g.id) && sameCell(g.cell, input.cell)) eyes.push(g.pos);
    }
  }
  return eyes;
}

/**
 * Vzhled uprchlíka v den `day`: skupina pohlaví nenese – muž od 16 let (`man`), jiná dospělá je
 * žena, dítě podle id (návrh Clauda – jen vzhled); zásoby nese od `WAR.flight.childFromYears`,
 * „jen lidé“ nenesou nic.
 */
function refugeeLook(p: RefugeePerson, mode: FlightMode, day: number): WarSceneRefugee {
  const age = ageYears(p.bornDay, day);
  const child = age < WAR.flight.adultFromYears;
  const kind = p.man || (child && p.id % 2 === 1) ? 'man' : 'woman';
  return { kind, child, carries: mode !== 'people' && age >= WAR.flight.childFromYears };
}

/**
 * Průvody uprchlíků a běžící poslové na mapě `input.cell` (war.md – Varování, poslové a útěk do
 * hradiště; Ú14): z vsí hráče `input.playerId` vždy (ukrytí v lese stojí u lesa), cizí jen
 * v dohledu (`sightEyes`, `inSight`) – ukrytí v lese ani na dohled ne. Skupina v hradišti nebo
 * dostižená a posel, který doběhl nebo byl chycen, na mapě nejsou.
 */
function alarmView(
  state: CampaignState,
  input: WarSceneInput,
  shown: BattleState | null,
): Pick<WarSceneView, 'refugeMarch' | 'messengers'> {
  const alarm = state.alarm;
  if (!alarm) return {};
  const { cell, grid } = input;
  const flights = alarm.flights.filter(
    (f) => sameCell(f.cell, cell) && (f.status === 'marching' || f.status === 'hidden'),
  );
  const runners = alarm.messengers.filter((m) => sameCell(m.cell, cell) && m.status === 'running');
  if (flights.length === 0 && runners.length === 0) return {};
  const owners = new Map(alarm.villages.map((v) => [v.villageId, v.owner.playerId]));
  const own = (villageId: string): boolean =>
    input.playerId !== undefined && owners.get(villageId) === input.playerId;
  const eyes = sightEyes(state, input, shown);
  const sees = (p: Pos): boolean => input.seesAll === true || eyes.some((e) => inSight(grid, e, p));
  const refugeMarch = flights.flatMap((f): WarSceneRefugeMarch[] => {
    const mine = own(f.villageId);
    if (!mine && (f.status === 'hidden' || !sees(f.pos))) return [];
    const lost = new Set(f.lost ?? []);
    const people = f.people
      .filter((p) => !lost.has(p.id))
      .map((p) => refugeeLook(p, f.mode, state.day));
    if (people.length === 0) return [];
    return [
      {
        refId: f.refId,
        own: mine,
        mode: f.mode,
        pos: { x: f.pos.x, z: f.pos.z },
        heading: alarmHeading(f),
        moving: f.status === 'marching',
        people,
        herd: Object.values(f.herd).reduce((n, k) => n + k, 0),
        carts: f.carts,
      },
    ];
  });
  const messengers = runners.flatMap((m): WarSceneMessenger[] => {
    const mine = own(m.fromVillageId);
    if (!mine && !sees(m.pos)) return [];
    return [
      {
        refId: m.refId,
        own: mine,
        pos: { x: m.pos.x, z: m.pos.z },
        heading: alarmHeading(m),
        mounted: m.mounted,
      },
    ];
  });
  return {
    ...(refugeMarch.length > 0 ? { refugeMarch } : {}),
    ...(messengers.length > 0 ? { messengers } : {}),
  };
}
