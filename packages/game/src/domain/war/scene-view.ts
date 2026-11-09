import { crossingLayers } from '../village/fortification';
import { ageYears, isAway } from '../village/people';
import type { DwellingType, Position, VillageState, WallKind } from '../village/types';
import { sameCell, type GridCell } from '../village/world-grid';
import type {
  BattleBreach,
  BattleFort,
  BattleGroup,
  BattleOutcome,
  BattleSide,
  BattleState,
  Fighter,
} from './battle';
import type { CampaignGroup, CampaignMember, CampaignState } from './campaign-types';
import { houseGroups } from './defenders';
import { nearestForest } from './flight';
import type { BattleLadder } from './ladders';
import type { MarchGrid, Pos } from './march-grid';
import { WAR } from './rules-war';
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
  /** Obránce na mapě své vsi: útěk vsi do lesa se stády. Chybí – nikdo neutekl. */
  flight?: WarSceneFlight;
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
  if (!battle && !march) return null;
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
  return view;

  function marchView(s: CampaignState, inp: WarSceneInput): WarSceneMarch | null {
    const groups = s.groups.filter(
      (g) =>
        sameCell(g.cell, inp.cell) &&
        (side === 'attack' || inp.eyes.some((e) => inSight(grid, e, g.pos))),
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
  const sees = (p: Pos): boolean => eyes.some((e) => inSight(grid, e, p));
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
  const next = g.leg?.points.find((p) => {
    const px = p.x - g.pos.x;
    const pz = p.z - g.pos.z;
    return px * px + pz * pz > 1;
  });
  const to = next ?? g.goal?.pos ?? { x: g.pos.x, z: g.pos.z + 1 };
  const dx = to.x - g.pos.x;
  const dz = to.z - g.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  return d > 1e-9 ? { x: dx / d, z: dz / d } : { x: 0, z: 1 };
}
