// Vojsko ve scéně (war.md – Ve scéně): muži jako postavy vsi (`man.glb`) s oštěpem, štítem
// a lukem z 0 A.D. (klipy `walk-spear`, `spear-thrust`, `sword-strike`, `shield-block`,
// `bow-draw`, `bow-release`), muži rodu na koních (`ride`, `ride-trot`), hloučky podle skupin
// a ikona rozkazu nad skupinou. Bez Babylonu – vstup je stav jádra (`BattleState`, skupiny
// a muži `CampaignState`) zúžený na to, co scéna kreslí; vykresluje army-renderer.ts.
import {
  TICKS_PER_SECOND,
  WAR,
  FORTIFICATIONS,
  battleWallsOf,
  climbTicks,
  type BattleBreach,
  type BattleFort,
  type BattleGroup,
  type BattleSide,
  type BattleState,
  type CampaignGroup,
  type CampaignMember,
  type Fighter,
  type GroupOrder,
  type Pos,
  type WallKind,
  type WarSceneBreach,
  type WarSceneFighter,
  type WarSceneWall,
} from '@bohemia/game';
import { CHAMBER, CRIB, RAMPART, STAKE_HEIGHT_M, WALKWAY } from './fortification-layout';

/** Muž v boji pro scénu (jádro – `Fighter`). */
export type SceneFighter = Pick<
  Fighter,
  | 'id'
  | 'side'
  | 'group'
  | 'line'
  | 'bow'
  | 'mounted'
  | 'health'
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
> & {
  /** Přechod hradby (jádro – `FighterClimb`); jinak chybí. */
  climb?: SceneClimb;
};

/** Přechod hradby pro scénu: žebřík, fáze a zbývající takty fáze (jádro – `FighterClimb`). */
export type SceneClimb = Pick<NonNullable<Fighter['climb']>, 'ladder' | 'phase' | 'ticks'>;

/** Žebřík u hradby pro scénu (jádro – `BattleLadder`). */
export type SceneLadder = Pick<
  NonNullable<BattleState['ladders']>[number],
  'key' | 'fort' | 'segment' | 'foot' | 'top' | 'inner' | 'climber' | 'up'
>;

/**
 * Hradba úseku na bojišti pro scénu: lomená čára úseku, stojící hradba (null – mezera, průlom,
 * holý val) a výška valu pod ní (0–1, 0 – bez valu). Výšky lezců a obránců na ochozu. Počítá ji
 * jádro (`battleWallsOf`) – i server pro scénu napadené vsi (`WarSceneView`).
 */
export type SceneWall = WarSceneWall;

/**
 * Boj, ze kterého se skládá snímek scény: celý stav jádra (`BattleState` – ukázka Bitva), nebo
 * to, co z boje smí hráč vidět (`WarSceneBattle` – server, mlha války).
 */
export interface SceneBattleSource extends Pick<BattleState, 'ticks' | 'outcome'> {
  fighters: readonly WarSceneFighter[];
  groups: readonly Pick<BattleGroup, 'side' | 'id' | 'order' | 'broken'>[];
  closedGates: readonly string[];
  breaches: readonly WarSceneBreach[];
  ladders?: readonly NonNullable<BattleState['ladders']>[number][];
}

/** Skupina v boji pro scénu (jádro – `BattleGroup`). */
export type SceneBattleGroup = Pick<BattleGroup, 'side' | 'id' | 'order' | 'broken'>;

/**
 * Rozdělaný průlom pro scénu (jádro – `BattleBreach`): postup a fáze, průběh 0–1, jestli je hotový,
 * a kolik z otepí je nanošeno (`fuel`) a z příkopu zasypáno (`fill`), obojí 0–1.
 */
export type SceneBreach = Pick<
  BattleBreach,
  'key' | 'fort' | 'segment' | 'spot' | 'at' | 'method' | 'phase' | 'moat'
> & {
  progress: number;
  breached: boolean;
  fuel: number;
  fill: number;
};

/** Boj pro scénu – snímek stavu po taktu `ticks` (jádro – `BattleState`). */
export interface SceneBattle extends Pick<BattleState, 'ticks' | 'outcome'> {
  fighters: SceneFighter[];
  groups: SceneBattleGroup[];
  closedGates: readonly string[];
  breaches: SceneBreach[];
  ladders: SceneLadder[];
  /** Hradby úseků bojiště (`battleWalls`); prázdné – výšky jako u palisády bez valu. */
  walls: readonly SceneWall[];
}

/** Muž tažení na pochodu (jádro – `CampaignMember`). */
export type SceneMarchMember = Pick<
  CampaignMember,
  'line' | 'mounted' | 'wounded' | 'group' | 'status'
>;

/** Skupina tažení na pochodu (jádro – `CampaignGroup`) a směr chůze. */
export type SceneMarchGroup = Pick<CampaignGroup, 'id' | 'order' | 'pos' | 'arrived'> & {
  heading: Pos;
};

/** Pochod vojska pro scénu – hloučky skupin. */
export interface SceneMarch {
  members: SceneMarchMember[];
  groups: SceneMarchGroup[];
}

/**
 * Boj z jádra pro scénu (kopie – stav jádra se taktem mění na místě). `walls` – hradby bojiště
 * (`battleWalls`), jednou za boj; bez nich se lezci a obránci zvednou jako u palisády bez valu.
 */
export function sceneBattle(b: SceneBattleSource, walls: readonly SceneWall[] = []): SceneBattle {
  return {
    ticks: b.ticks,
    outcome: b.outcome,
    fighters: b.fighters.map((f) => ({
      id: f.id,
      side: f.side,
      group: f.group,
      line: f.line,
      bow: f.bow,
      mounted: f.mounted,
      // cizí muž ze serveru zdraví nemá (mlha války) – ránu pozná scéna podle `hits`
      health: f.health ?? 100,
      ...(f.hits ? { hits: f.hits } : {}),
      pos: { x: f.pos.x, z: f.pos.z },
      home: { x: f.home.x, z: f.home.z },
      state: f.state,
      cooldown: f.cooldown,
      aim: f.aim,
      killed: f.killed,
      breachAt: f.breachAt,
      ...(f.ladder ? { ladder: true } : {}),
      ...(f.onWall ? { onWall: true } : {}),
      ...(f.underground ? { underground: true as const } : {}),
      ...(f.climb
        ? { climb: { ladder: f.climb.ladder, phase: f.climb.phase, ticks: f.climb.ticks } }
        : {}),
    })),
    groups: b.groups.map((g) => ({ side: g.side, id: g.id, order: g.order, broken: g.broken })),
    closedGates: [...b.closedGates],
    breaches: b.breaches.map((x) => {
      const n = x.need;
      const done = x.progress.done;
      const share = (from: number, size: number): number =>
        size > 0 ? Math.min(1, Math.max(0, (done - from) / size)) : 1;
      return {
        key: x.key,
        fort: x.fort,
        segment: x.segment,
        spot: x.spot,
        at: { x: x.at.x, z: x.at.z },
        method: x.method,
        phase: x.phase,
        ...(x.moat ? { moat: { from: { ...x.moat.from }, to: { ...x.moat.to } } } : {}),
        progress: x.progress.required > 0 ? Math.min(1, done / x.progress.required) : 1,
        breached: x.progress.breached,
        fuel: share(n.fill, n.fuel),
        fill: share(0, n.fill),
      };
    }),
    ladders: (b.ladders ?? []).map((l) => ({
      key: l.key,
      fort: l.fort,
      segment: l.segment,
      foot: { x: l.foot.x, z: l.foot.z },
      top: { x: l.top.x, z: l.top.z },
      inner: l.inner ? { x: l.inner.x, z: l.inner.z } : null,
      climber: l.climber,
      up: l.up,
    })),
    walls,
  };
}

/**
 * Hradby bojiště pro scénu (jádro – `BattleFort`, `crossingLayers`): po úsecích lomená čára,
 * stojící hradba v den boje a výška valu. Pořadí opevnění jako na bojišti.
 */
export function battleWalls(forts: readonly BattleFort[], day: number): SceneWall[] {
  return battleWallsOf(forts, day);
}

/** Pochod z jádra pro scénu: směr skupiny podle úseku pochodu (stojí – k cíli, jinak na sever). */
export function sceneMarch(c: {
  members: readonly SceneMarchMember[];
  groups: readonly Pick<CampaignGroup, 'id' | 'order' | 'pos' | 'arrived' | 'leg' | 'goal'>[];
}): SceneMarch {
  return {
    members: c.members.map((m) => ({
      line: m.line,
      mounted: m.mounted,
      wounded: m.wounded,
      group: m.group,
      status: m.status,
    })),
    groups: c.groups.map((g) => {
      const next = g.leg?.points.find((p) => (p.x - g.pos.x) ** 2 + (p.z - g.pos.z) ** 2 > 1);
      const to = next ?? g.goal?.pos ?? { x: g.pos.x, z: g.pos.z + 1 };
      return {
        id: g.id,
        order: g.order,
        pos: { x: g.pos.x, z: g.pos.z },
        arrived: g.arrived,
        heading: unit(to.x - g.pos.x, to.z - g.pos.z),
      };
    }),
  };
}

/** Druh modelu postavy. */
export type FigureKind = 'man' | 'woman';

/** Barva oděvu a kód vlasů (villagerLook – VillagerPlugin). */
export type FigureLook = readonly [number, number, number, number];

/** Oděv útočníků (mořena), obránců (nebarvený len), mužů rodu (borůvka) – návrh Clauda. */
export const ARMY_LOOKS: Record<'attack' | 'defend' | 'line' | 'folk', FigureLook> = {
  attack: [0.92, 0.52, 0.42, 0],
  defend: [0.9, 0.86, 0.76, 0],
  line: [0.55, 0.6, 0.85, 0],
  folk: [0.95, 0.9, 0.8, 0],
};

/** Postava vojska nebo vesničana ve scéně (výšku podle terénu doplní renderer). */
export interface ArmyFigure {
  key: string;
  kind: FigureKind;
  x: number;
  z: number;
  /** Kam hledí (jednotkový vektor). */
  hx: number;
  hz: number;
  clip: string;
  /** Tempo klipu (1 = jak je zapečený, 0 = stojí). */
  pace: number;
  /** Zvednutí nad terén (m) – sed na koni. */
  lift: number;
  /** Leží (padlý) – postava položená na zem ve směru `hx/hz`. */
  lying: boolean;
  side: BattleSide | 'folk';
  look: FigureLook;
}

/** Zvíře u vojska – kůň muže rodu, nebo kus odehnaného stáda. */
export interface ArmyAnimal {
  key: string;
  species: 'horse' | 'cow';
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** Rychlost (m/s) – krok nohou. */
  speed: number;
}

/** Ikona rozkazu nad skupinou (war.md – Boj – Skupiny). */
export interface OrderIcon {
  group: number;
  order: GroupOrder;
  x: number;
  z: number;
}

/** Rozestup mužů v hloučku (m) – pěší, jezdec (návrh Clauda). */
export const HUDDLE_SPACING_M = { foot: 1.6, mounted: 3.2 } as const;
/** Pod kolik m/s muž stojí (klip na místě). */
const STAND_M_S = 0.15;
/** Rychlost, nad kterou jezdec klusá (m/s). */
const TROT_M_S = 2.6;
/** Chůze klipu `walk-spear` / `walk` při tempu 1 (m/s, postava × FIGURE_SCALE). */
const WALK_M_S = 1.5;
/** Rána zblízka / lukem – tolik taktů od rány ukazuje postava úder (pak klid se zbraní). */
const STRIKE_SHOW_TICKS = TICKS_PER_SECOND;
/** Takty mezi ranami (jádro – `battle.ts`). */
export const MELEE_TICKS = WAR.combat.meleeSeconds * TICKS_PER_SECOND;
export const BOW_TICKS = WAR.combat.bowSeconds * TICKS_PER_SECOND;
/** Hod z ochozu do 15 m každé 4 s (fortifications.md – Obrana bez násobku 3; jádro – `battle.ts`). */
export const THROW_TICKS = FORTIFICATIONS.defense.throwSeconds * TICKS_PER_SECOND;
const THROW_M = FORTIFICATIONS.defense.throwM;

/** Jednotkový vektor (nulový – sever). */
function unit(x: number, z: number): Pos {
  const l = Math.hypot(x, z);
  return l > 1e-6 ? { x: x / l, z: z / l } : { x: 0, z: 1 };
}

/**
 * Místa v hloučku – slunečnicová spirála kolem středu (vpravo, vpřed v m): první místo uprostřed,
 * každé další o rozestup `spacing` dál, jezdci vpředu. Stejný počet = stejný hlouček.
 */
export function huddleSlots(count: number, spacing: number): Pos[] {
  const out: Pos[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const r = spacing * Math.sqrt(i) * 0.62;
    const a = i * golden;
    out.push({ x: r * Math.cos(a), z: r * Math.sin(a) });
  }
  return out;
}

/** Bod hloučku ve světě: střed skupiny, směr chůze, místo (vpravo, vpřed). */
function placeIn(center: Pos, heading: Pos, slot: Pos): Pos {
  return {
    x: center.x + heading.z * slot.x + heading.x * slot.z,
    z: center.z - heading.x * slot.x + heading.z * slot.z,
  };
}

/** Postavy a koně pochodu: hloučky po skupinách, jezdci vpředu, ranění pěší vzadu. */
export function marchFigures(march: SceneMarch): { figures: ArmyFigure[]; animals: ArmyAnimal[] } {
  const figures: ArmyFigure[] = [];
  const animals: ArmyAnimal[] = [];
  for (const g of march.groups) {
    const men = march.members
      .map((m, index) => ({ m, index }))
      .filter(({ m }) => m.group === g.id && m.status === 'active')
      // jezdci vpředu, ranění vzadu
      .sort((a, b) => rank(a.m) - rank(b.m) || a.index - b.index);
    const riders = men.filter(({ m }) => m.mounted);
    const foot = men.filter(({ m }) => !m.mounted);
    const riderSlots = huddleSlots(riders.length, HUDDLE_SPACING_M.mounted);
    const footSlots = huddleSlots(foot.length, HUDDLE_SPACING_M.foot);
    // pěší za jezdci: střed pěších posunutý o poloměr hloučku jezdců dozadu
    const back = riders.length > 0 ? HUDDLE_SPACING_M.mounted * Math.sqrt(riders.length) + 1 : 0;
    const moving = !g.arrived;
    const speed = moving ? WALK_M_S : 0;
    riders.forEach(({ m, index }, i) => {
      const p = placeIn(g.pos, g.heading, riderSlots[i]!);
      animals.push({
        key: `h${index}`,
        species: 'horse',
        x: p.x,
        z: p.z,
        hx: g.heading.x,
        hz: g.heading.z,
        speed,
      });
      figures.push(rider(`m${index}`, p, g.heading, moving ? 'ride' : 'ride-idle', m.line));
    });
    foot.forEach(({ m, index }, i) => {
      const slot = footSlots[i]!;
      const p = placeIn(g.pos, g.heading, { x: slot.x, z: slot.z - back });
      figures.push({
        key: `m${index}`,
        kind: 'man',
        x: p.x,
        z: p.z,
        hx: g.heading.x,
        hz: g.heading.z,
        clip: moving ? 'walk-spear' : m.line ? 'shield-block' : 'idle',
        pace: moving ? (m.wounded ? 0.7 : 1) : 1,
        lift: 0,
        lying: false,
        side: 'attack',
        look: m.line ? ARMY_LOOKS.line : ARMY_LOOKS.attack,
      });
    });
  }
  return { figures, animals };
}

function rank(m: SceneMarchMember): number {
  return m.mounted ? 0 : m.wounded ? 2 : 1;
}

/** Jezdec na koni (sed zvednutý nad hřbet – riders.ts). */
function rider(key: string, p: Pos, h: Pos, clip: string, line: boolean): ArmyFigure {
  return {
    key,
    kind: 'man',
    x: p.x,
    z: p.z,
    hx: h.x,
    hz: h.z,
    clip,
    pace: 1,
    lift: RIDER_LIFT_M,
    lying: false,
    side: 'attack',
    look: line ? ARMY_LOOKS.line : ARMY_LOOKS.attack,
  };
}

/** Výška sedu jezdce nad zemí (riders.ts – RIDER_SEAT_M × RIDE_HORSE_SCALE). */
export const RIDER_LIFT_M = 1.06;

/** Volby snímku boje. */
export interface BattleFigureOptions {
  /** Padlí a ranění se ukazují (do konce dne – battle-fx.ts `fallenShown`). */
  showFallen: boolean;
  /** Je bod vidět (mlha války – fog-of-war.ts)? Cizí muži mimo dohled se nekreslí. */
  visible?: (side: BattleSide, x: number, z: number) => boolean;
}

/**
 * Postavy a koně boje v okamžiku mezi taktem `prev` a `cur` (`f` 0–1): poloha plynule mezi takty,
 * pohled ke směru chůze nebo k cíli; klip podle stavu – chůze se zbraní, rána (oštěp, meč se
 * štítem, luk), prolamování (sekera, motyka, otepi, přikládání), útěk, padlý leží, raněný sedí
 * u domu. Lezec na žebříku a obránce na ochozu se zvednou (`climberPose`, `wallStandLift`),
 * kopáč v podkopu není vidět; žebříky (opřené, ležící, nesené) vrací `ladders`.
 */
export function battleFigures(
  prev: SceneBattle | null,
  cur: SceneBattle,
  f: number,
  options: BattleFigureOptions,
): { figures: ArmyFigure[]; animals: ArmyAnimal[]; ladders: LadderPose[] } {
  const before = new Map(prev?.fighters.map((x) => [x.id, x]) ?? []);
  const byId = new Map(cur.fighters.map((x) => [x.id, x]));
  const breaches = new Map(cur.breaches.map((x) => [x.key, x]));
  const figures: ArmyFigure[] = [];
  const animals: ArmyAnimal[] = [];
  const carriers: { id: string; x: number; z: number; hx: number; hz: number }[] = [];
  const t = Math.min(1, Math.max(0, f));
  const dtS = Math.max(1, cur.ticks - (prev?.ticks ?? cur.ticks - 1)) / TICKS_PER_SECOND;
  // zbývající takty fáze přechodu plynule mezi takty (ve stejné fázi)
  const climbTicksOf = (id: string): number => {
    const c = byId.get(id)?.climb;
    const w = before.get(id)?.climb;
    if (!c) return 0;
    return w && w.phase === c.phase && w.ticks >= c.ticks
      ? c.ticks + (w.ticks - c.ticks) * (1 - t)
      : c.ticks;
  };
  for (const man of cur.fighters) {
    if (man.state === 'fled' || man.underground) continue;
    const was = before.get(man.id);
    const from = was?.pos ?? man.pos;
    const x = from.x + (man.pos.x - from.x) * t;
    const z = from.z + (man.pos.z - from.z) * t;
    const speed = Math.hypot(man.pos.x - from.x, man.pos.z - from.z) / dtS;
    if (options.visible && !options.visible(man.side, x, z)) continue;
    const look =
      man.line && man.side === 'attack'
        ? ARMY_LOOKS.line
        : man.side === 'attack'
          ? ARMY_LOOKS.attack
          : ARMY_LOOKS.defend;
    const target = man.aim ? byId.get(man.aim) : undefined;
    const face =
      man.state === 'fight' && target
        ? unit(target.pos.x - x, target.pos.z - z)
        : speed > STAND_M_S
          ? unit(man.pos.x - from.x, man.pos.z - from.z)
          : man.state === 'breach' && man.breachAt
            ? breachFace(cur, man)
            : nearestFoe(cur, man, x, z);
    if (man.state === 'down') {
      if (!options.showFallen) continue;
      // padlý leží, kde padl; raněný sedí u domu (útočník tam, kde vstoupil do boje)
      const at = man.killed ? man.pos : man.home;
      figures.push({
        key: man.id,
        kind: 'man',
        x: at.x,
        z: at.z,
        hx: face.x,
        hz: face.z,
        clip: man.killed ? 'idle' : 'sit',
        pace: man.killed ? 0 : 1,
        lift: 0,
        lying: man.killed,
        side: man.side,
        look,
      });
      continue;
    }
    const breach = man.breachAt ? breaches.get(man.breachAt) : undefined;
    const clip = fighterClip(man, target, speed, breach);
    const climb = climberPose(cur, man, climbTicksOf(man.id));
    if (climb) {
      // na žebříku – nahoře se otočí k obránci, se kterým bojuje
      const hx = target && man.aim ? unit(target.pos.x - climb.x, target.pos.z - climb.z) : null;
      figures.push({
        key: man.id,
        kind: 'man',
        x: climb.x,
        z: climb.z,
        hx: hx?.x ?? climb.hx,
        hz: hx?.z ?? climb.hz,
        clip,
        pace: 1,
        lift: climb.lift,
        lying: false,
        side: man.side,
        look,
      });
      continue;
    }
    const riding = man.mounted;
    if (riding) {
      animals.push({ key: `h-${man.id}`, species: 'horse', x, z, hx: face.x, hz: face.z, speed });
    }
    if (man.ladder) carriers.push({ id: man.id, x, z, hx: face.x, hz: face.z });
    figures.push({
      key: man.id,
      kind: 'man',
      x,
      z,
      hx: face.x,
      hz: face.z,
      clip,
      pace: walking(clip) ? Math.min(2.4, Math.max(0.7, speed / WALK_M_S)) : 1,
      lift: riding ? RIDER_LIFT_M : man.onWall ? wallStandLift(cur.walls, { x, z }) : 0,
      lying: false,
      side: man.side,
      look,
    });
  }
  return { figures, animals, ladders: ladderPoses(cur, carriers, climbTicksOf) };
}

// --- Přechod hradby ve scéně (fortifications.md – Hradby a obrana, Ve scéně) --------------------

/**
 * Kde stojí muž na hradbě nad patou hradby (m): na fošnách ochozu, na koruně roštové a komorové
 * hradby (fortification-layout.ts). Plot a palisáda bez ochozu korunu nemají.
 */
export const WALL_STAND_M: Readonly<Record<WallKind, number>> = {
  fence: 0,
  palisade: 0,
  walkway: WALKWAY.deckM,
  crib: CRIB.heightM,
  chamber: CHAMBER.heightM,
};
/** Předprseň nad korunou roštové a komorové hradby (m) – vrchol žebříku je na ní. */
const PARAPET_TOP_M = 1;
/**
 * Vrchol opřeného žebříku nad patou hradby (m): špičky kůlů palisády (i s ochozem), předprseň
 * roštové a komorové hradby.
 */
export const LADDER_TOP_M: Readonly<Record<WallKind, number>> = {
  fence: 0,
  palisade: STAKE_HEIGHT_M,
  walkway: STAKE_HEIGHT_M,
  crib: CRIB.heightM + PARAPET_TOP_M,
  chamber: CHAMBER.heightM + PARAPET_TOP_M,
};
/** Lezec nahoře na palisádě bez ochozu – nohy na horních příčkách, hruď nad špičkami kůlů. */
const ASTRIDE_BELOW_TIPS_M = 1.3;
/** Výskok přes polský plot (m). */
const FENCE_HOP_M = 0.9;
/** Žebříky ze `siege.glb` – délka (m). */
export const LADDER_MODELS = { 'ladder-5': 5, 'ladder-7': 7 } as const;
export type LadderModel = keyof typeof LADDER_MODELS;
/** Nesený žebřík: výška nad zemí (rameno) a kolik m za nosičem začíná. */
const CARRY_LIFT_M = 1.35;
const CARRY_BEHIND_M = 2.6;

/** Úsek hradby boje (bez něj palisáda bez valu). */
function wallOf(b: Pick<SceneBattle, 'walls'>, fort: number, segment: number): SceneWall | null {
  return b.walls.find((w) => w.fort === fort && w.segment === segment) ?? null;
}

/** Výška valu pod hradbou úseku (m). */
function rampartLift(wall: SceneWall | null): number {
  return wall ? RAMPART.heightM * wall.rampart : 0;
}

/** Nejbližší bod čáry hradeb `walls` k bodu `p` – úsek, bod a čtverec vzdálenosti. */
export function nearestWall(
  walls: readonly SceneWall[],
  p: Pos,
  only?: { fort: number; segment: number },
): { wall: SceneWall; at: Pos; along: Pos; d2: number } | null {
  let best: { wall: SceneWall; at: Pos; along: Pos; d2: number } | null = null;
  for (const wall of walls) {
    if (only && (wall.fort !== only.fort || wall.segment !== only.segment)) continue;
    for (let i = 0; i + 1 < wall.path.length; i++) {
      const a = wall.path[i]!;
      const b = wall.path[i + 1]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      const t =
        len2 > 1e-9 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
      const at = { x: a.x + dx * t, z: a.z + dz * t };
      const d2 = (p.x - at.x) ** 2 + (p.z - at.z) ** 2;
      if (!best || d2 < best.d2) best = { wall, at, along: unit(dx, dz), d2 };
    }
  }
  return best;
}

/** Postava lezce: poloha, zvednutí nad terén a pohled (k hradbě, dolů dovnitř od ní). */
export interface ClimberPose {
  x: number;
  z: number;
  lift: number;
  hx: number;
  hz: number;
}

/**
 * Lezec na žebříku (jádro drží polohu u paty, nahoře na vrcholu): vylézá po žebříku – podíl fáze
 * `up` krát výška vrcholu nad patou (v půli 5 m žebříku 2,5 m), nahoře stojí na ochozu či koruně
 * (na palisádě bez ochozu visí nad špičkami kůlů), přetahuje druhý žebřík a slézá dovnitř;
 * přes plot jen přeskočí. `ticks` – zbývající takty fáze (plynule mezi takty). Na zemi null.
 */
export function climberPose(
  b: Pick<SceneBattle, 'walls' | 'ladders'>,
  man: Pick<SceneFighter, 'state' | 'climb' | 'pos'>,
  ticks: number,
): ClimberPose | null {
  const c = man.climb;
  if (man.state !== 'climb' || !c) return null;
  const ladder = c.ladder === null ? null : (b.ladders.find((l) => l.key === c.ladder) ?? null);
  const wall = ladder ? wallOf(b, ladder.fort, ladder.segment) : null;
  const kind: WallKind = wall?.kind ?? (ladder ? 'palisade' : 'fence');
  const t = climbTicks(kind);
  const share = (total: number): number =>
    total > 0 ? Math.min(1, Math.max(0, (total - ticks) / total)) : 1;
  if (!ladder) {
    if (c.phase !== 'up') return null;
    // přes plot – výskok na místě (jádro ho po fázi přesune za plot)
    const u = share(t.up);
    return { x: man.pos.x, z: man.pos.z, lift: FENCE_HOP_M * Math.sin(Math.PI * u), hx: 0, hz: 1 };
  }
  const base = rampartLift(wall);
  const into = unit(ladder.top.x - ladder.foot.x, ladder.top.z - ladder.foot.z);
  const top = LADDER_TOP_M[kind];
  const stand = kind === 'palisade' ? top - ASTRIDE_BELOW_TIPS_M : WALL_STAND_M[kind];
  const at = (p: Pos, lift: number): ClimberPose => ({
    x: p.x,
    z: p.z,
    lift,
    hx: into.x,
    hz: into.z,
  });
  const lerp = (a: Pos, q: Pos, u: number): Pos => ({
    x: a.x + (q.x - a.x) * u,
    z: a.z + (q.z - a.z) * u,
  });
  switch (c.phase) {
    case 'up': {
      if (ticks <= 0) return at(ladder.top, base + stand);
      const u = share(t.up);
      return at(lerp(ladder.foot, ladder.top, u), base + top * u);
    }
    case 'over':
      return at(ladder.top, base + stand);
    case 'down': {
      const u = share(t.down);
      const inside = ladder.inner ?? { x: ladder.top.x + into.x, z: ladder.top.z + into.z };
      return at(lerp(ladder.top, inside, u), (base + stand) * (1 - u));
    }
    default:
      return null;
  }
}

/** Žebřík ve scéně: model, pata (zvednutí nad terén) a kam míří (jednotkový vektor). */
export interface LadderPose {
  key: string;
  model: LadderModel;
  x: number;
  z: number;
  lift: number;
  up: { x: number; y: number; z: number };
}

/** Model žebříku, který dosáhne `length` m (kratší, když stačí). */
function ladderModel(length: number): LadderModel {
  return length <= LADDER_MODELS['ladder-5'] ? 'ladder-5' : 'ladder-7';
}

/** Směr z paty do bodu `dx, dy, dz` (jednotkový). */
function dir3(dx: number, dy: number, dz: number): { x: number; y: number; z: number } {
  const l = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / l, y: dy / l, z: dz / l };
}

/**
 * Žebříky boje: opřený od paty k vrcholu (podle hradby úseku), ležící u paty ven od hradby,
 * opíraný se zvedá s fází `lean` lezce, přetažený druhý žebřík uvnitř a žebříky nesené na rameni
 * (`ladder` – vyrobený, ještě neopřený). Plynule mezi takty: `ticks` lezců podle `climbTicks`.
 */
export function ladderPoses(
  b: Pick<SceneBattle, 'walls' | 'ladders' | 'fighters'>,
  carriers: readonly { id: string; x: number; z: number; hx: number; hz: number }[],
  ticksOf: (id: string) => number,
): LadderPose[] {
  const out: LadderPose[] = [];
  const byId = new Map(b.fighters.map((f) => [f.id, f]));
  for (const l of b.ladders) {
    const wall = wallOf(b, l.fort, l.segment);
    const kind: WallKind = wall?.kind ?? 'palisade';
    const base = rampartLift(wall);
    const top = LADDER_TOP_M[kind];
    const dx = l.top.x - l.foot.x;
    const dz = l.top.z - l.foot.z;
    const reach = Math.hypot(dx, top, dz);
    const model = ladderModel(reach);
    const leaned = dir3(dx, top, dz);
    // ležící – ven od hradby, kousek nad zemí
    const flat = dir3(-dx, 0.02 * Math.hypot(dx, dz), -dz);
    let up = leaned;
    if (!l.up) {
      const holder = l.climber === null ? undefined : byId.get(l.climber);
      const c = holder?.climb;
      const u =
        c?.phase === 'lean' && holder
          ? Math.min(1, Math.max(0, 1 - ticksOf(holder.id) / Math.max(1, climbTicks(kind).lean)))
          : 0;
      up = dir3(
        flat.x + (leaned.x - flat.x) * u,
        flat.y + (leaned.y - flat.y) * u,
        flat.z + (leaned.z - flat.z) * u,
      );
    }
    out.push({ key: l.key, model, x: l.foot.x, z: l.foot.z, lift: base, up });
    if (l.inner) {
      const ix = l.top.x - l.inner.x;
      const iz = l.top.z - l.inner.z;
      out.push({
        key: `${l.key}:in`,
        model: ladderModel(Math.hypot(ix, top, iz)),
        x: l.inner.x,
        z: l.inner.z,
        lift: 0,
        up: dir3(ix, base + top, iz),
      });
    }
  }
  for (const c of carriers) {
    out.push({
      key: `carry:${c.id}`,
      model: 'ladder-5',
      x: c.x - c.hx * CARRY_BEHIND_M,
      z: c.z - c.hz * CARRY_BEHIND_M,
      lift: CARRY_LIFT_M,
      up: dir3(c.hx, 0.08, c.hz),
    });
  }
  return out;
}

/** Obránce na hradbě stojí do tolika m od čáry hradby (stanoviště 1 m za ní, pás až 8 m). */
const WALL_REACH_M = 6;

/** Na hradbě – zvednutí obránce na ochozu či koruně nad terén (m); mimo hradbu 0. */
export function wallStandLift(walls: readonly SceneWall[], p: Pos): number {
  const near = nearestWall(walls, p);
  if (!near || near.d2 > WALL_REACH_M * WALL_REACH_M || !near.wall.kind) return 0;
  return rampartLift(near.wall) + WALL_STAND_M[near.wall.kind];
}

/** Místo průlomu u hradby: bod na čáře hradby, směr podél ní a ven (k prolamujícím). */
function breachSite(
  b: Pick<SceneBattle, 'walls'>,
  br: Pick<SceneBreach, 'fort' | 'segment' | 'at'>,
): { at: Pos; along: Pos; out: Pos } {
  const near = nearestWall(b.walls, br.at, br);
  if (!near) return { at: br.at, along: { x: 1, z: 0 }, out: { x: 0, z: -1 } };
  const along = near.along;
  const dx = br.at.x - near.at.x;
  const dz = br.at.z - near.at.z;
  // prolamující stojí venku – kolmice podél hradby na jeho stranu
  const side = dx * -along.z + dz * along.x >= 0 ? 1 : -1;
  return { at: near.at, along, out: { x: -along.z * side, z: along.x * side } };
}

/** Otep u paty hradby (díl `fagot` ze `siege.glb`): poloha, zvednutí a natočení podél hradby. */
export interface FagotPose {
  key: string;
  x: number;
  z: number;
  lift: number;
  yaw: number;
}

/** Otepí u místa – hromada podél paty ve dvou vrstvách po pěti (návrh Clauda). */
export const FAGOTS_PER_BREACH = 10;
const FAGOT_ROW = 5;
const FAGOT_STEP_M = 0.85;

/**
 * Otepi u paty hradby, kde se pálí (fortifications.md – Přechod hradby – Oheň): přibývají, jak
 * se nanosí (`fuel`), a leží, dokud hoří; po vyhoření zmizí (zbude ohořelý průlom).
 */
export function breachFagots(b: Pick<SceneBattle, 'walls' | 'breaches'>): FagotPose[] {
  const out: FagotPose[] = [];
  for (const br of b.breaches) {
    if (br.method !== 'burn' || (br.phase !== 'fuel' && br.phase !== 'burn')) continue;
    const count = br.phase === 'burn' ? FAGOTS_PER_BREACH : Math.round(br.fuel * FAGOTS_PER_BREACH);
    const site = breachSite(b, br);
    const yaw = Math.atan2(-site.along.z, site.along.x);
    for (let k = 0; k < count; k++) {
      const row = Math.floor(k / FAGOT_ROW);
      const u = ((k % FAGOT_ROW) - (FAGOT_ROW - 1) / 2) * FAGOT_STEP_M + row * 0.4;
      const o = 0.45 + row * 0.2;
      out.push({
        key: `${br.key}:${k}`,
        x: site.at.x + site.along.x * u + site.out.x * o,
        z: site.at.z + site.along.z * u + site.out.z * o,
        lift: row * 0.36,
        yaw,
      });
    }
  }
  return out;
}

/** Oheň u hradby: střed, natočení podél hradby (rad) a velikost. */
export interface BreachFire {
  key: string;
  x: number;
  z: number;
  yaw: number;
  scale: number;
}

/** Velikost ohně u hradby – hromada 3 m × 1,4 ≈ 4 m průlomu (clearing-fire.ts – `heapFireShape`). */
const BREACH_FIRE_SCALE = 1.4;

/** Ohně u hradby: místo ve fázi `burn` hoří u paty (vně, na otepích). */
export function breachFires(b: Pick<SceneBattle, 'walls' | 'breaches'>): BreachFire[] {
  return b.breaches
    .filter((br) => br.method === 'burn' && br.phase === 'burn')
    .map((br) => {
      const site = breachSite(b, br);
      return {
        key: br.key,
        x: site.at.x + site.out.x * 0.5,
        z: site.at.z + site.out.z * 0.5,
        yaw: Math.atan2(site.along.z, site.along.x),
        scale: BREACH_FIRE_SCALE,
      };
    });
}

/** Jáma podkopu u hradby: střed a poloměr (m). */
export interface MinePit {
  key: string;
  x: number;
  z: number;
  radius: number;
}

/** Jáma podkopu: od začátku práce roste, po pětině (kopáči pod zemí) má plnou velikost. */
const PIT_M = { from: 0.6, full: 1.6 } as const;

/**
 * Jámy podkopu (fortifications.md – Přechod hradby – Podkop): u místa, kde kopáči stojí (vně
 * u hradby); po zřícení zůstane jáma do konce boje ve scéně.
 */
export function minePits(b: Pick<SceneBattle, 'breaches'>, undergroundShare: number): MinePit[] {
  return b.breaches
    .filter((br) => br.method === 'mine' && (br.progress > 0 || br.breached))
    .map((br) => {
      const u = br.breached ? 1 : Math.min(1, br.progress / Math.max(1e-6, undergroundShare));
      return {
        key: br.key,
        x: br.at.x,
        z: br.at.z,
        radius: PIT_M.from + (PIT_M.full - PIT_M.from) * u,
      };
    });
}

/** Stojící muž hledí k nejbližšímu nepříteli, který ještě bojuje (bez nikoho k domu / na sever). */
function nearestFoe(b: SceneBattle, man: SceneFighter, x: number, z: number): Pos {
  let best: Pos | null = null;
  let bestD = Infinity;
  for (const o of b.fighters) {
    if (o.side === man.side || (o.state !== 'fight' && o.state !== 'breach')) continue;
    const d = (o.pos.x - x) ** 2 + (o.pos.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = o.pos;
    }
  }
  return best ? unit(best.x - x, best.z - z) : unit(x - man.home.x, z - man.home.z);
}

function walking(clip: string): boolean {
  return clip === 'walk' || clip === 'walk-spear' || clip === 'walk-axe';
}

/** Prolamující hledí ke stěně – od místa, kde stojí, k bodu průlomu (`at`) a za něj. */
function breachFace(b: SceneBattle, man: SceneFighter): Pos {
  const br = b.breaches.find((x) => x.key === man.breachAt);
  if (!br) return { x: 0, z: 1 };
  const d = unit(br.at.x - man.pos.x, br.at.z - man.pos.z);
  return d;
}

/**
 * Klip muže v boji podle stavu, cíle a rychlosti. Prolamující podle postupu a fáze místa
 * (`breach`): sekera (sekat, bez místa), motyka (zasypat, odkopat, podkopat), otepi v náručí
 * a skládání u paty (nanosit), přikládání (hoří). Lezec: v lese seká strom na žebřík, žebřík
 * nese v náručí, opírá vidlemi (`pitch`), po příčkách leze rukama (`build`); nahoře bojuje.
 */
export function fighterClip(
  man: Pick<SceneFighter, 'state' | 'mounted' | 'bow' | 'line' | 'cooldown' | 'aim' | 'pos'> &
    Partial<Pick<SceneFighter, 'climb'>>,
  target: Pick<SceneFighter, 'pos'> | undefined,
  speed: number,
  breach?: Pick<SceneBreach, 'method' | 'phase'>,
): string {
  const moving = speed > STAND_M_S;
  if (man.state === 'breach') {
    if (!breach) return moving ? 'walk-axe' : 'fell';
    if (breach.phase === 'fuel') return moving ? 'carry-wood' : 'build';
    if (breach.phase === 'burn') return moving ? 'walk' : 'seed';
    if (moving)
      return breach.method === 'cut' || breach.method === 'burn' ? 'walk-axe' : 'walk-hoe';
    if (breach.phase === 'fill') return 'hoe';
    return breach.method === 'dig' || breach.method === 'mine' ? 'hoe' : 'fell';
  }
  if (man.state === 'climb' && man.climb && !man.aim) {
    switch (man.climb.phase) {
      case 'make':
        return moving ? 'walk-axe' : 'fell';
      case 'carry':
        return moving ? 'carry-wood' : 'idle';
      case 'lean':
        return 'pitch';
      default:
        return 'build';
    }
  }
  if (man.mounted) {
    if (speed > TROT_M_S) return 'ride-trot';
    return moving ? 'ride' : 'ride-idle';
  }
  if (man.state === 'flee') return 'walk';
  if (target && man.aim) {
    const d = Math.hypot(target.pos.x - man.pos.x, target.pos.z - man.pos.z);
    const c = WAR.combat;
    if (d <= c.meleeM + 0.5) {
      // rána zblízka – úder hned po ráně, mezi ranami kryt (muž rodu se štítem)
      const fresh = man.cooldown > MELEE_TICKS - STRIKE_SHOW_TICKS;
      if (man.line) return fresh ? 'sword-strike' : 'shield-block';
      return fresh ? 'spear-thrust' : 'idle';
    }
    if (man.bow && d >= c.bowMinM && d <= c.bowMaxM && !moving) {
      return man.cooldown > BOW_TICKS - STRIKE_SHOW_TICKS ? 'bow-release' : 'bow-draw';
    }
    if (!moving && d <= THROW_M) {
      // hod z ochozu (kámen, oštěp) – švih paží po hodu
      return man.cooldown > THROW_TICKS - STRIKE_SHOW_TICKS ? 'spear-thrust' : 'idle';
    }
  }
  if (moving) return man.bow ? 'walk' : 'walk-spear';
  if (man.bow) return 'bow-draw';
  return man.line ? 'shield-block' : 'idle';
}

/** Výška ikony rozkazu nad středem skupiny (m). */
export const ORDER_ICON_LIFT_M = 4.2;

/**
 * Ikony rozkazů skupin útočníků: nad středem mužů skupiny, kteří ještě bojují (zlomená skupina
 * bez ikony). Pochod – nad středem hloučku.
 */
export function orderIcons(battle: SceneBattle | null, march: SceneMarch | null): OrderIcon[] {
  const out: OrderIcon[] = [];
  if (battle) {
    for (const g of battle.groups) {
      if (g.side !== 'attack' || g.broken || g.order === null) continue;
      const men = battle.fighters.filter(
        (x) =>
          x.side === 'attack' && x.group === g.id && (x.state === 'fight' || x.state === 'breach'),
      );
      if (men.length === 0) continue;
      out.push({
        group: g.id,
        order: g.order,
        x: men.reduce((s, m) => s + m.pos.x, 0) / men.length,
        z: men.reduce((s, m) => s + m.pos.z, 0) / men.length,
      });
    }
    return out;
  }
  for (const g of march?.groups ?? []) {
    if (!march?.members.some((m) => m.group === g.id && m.status === 'active')) continue;
    out.push({ group: g.id, order: g.order, x: g.pos.x, z: g.pos.z });
  }
  return out;
}

/** Zasypaný kus vodního příkopu v boji (jádro – `BattleBreach.moat`): pruh a podíl zasypání. */
export interface SceneMoatFill {
  from: Pos;
  to: Pos;
  share: number;
}

/**
 * Brány a průlomy opevnění z boje (fortifications.md – Ve scéně): opevnění, u něhož boj zavřel
 * bránu, má brány zavřené; hotový průlom je mezera úseku (`breachedDay`) – vyvrácené kůly,
 * rozsekaná brána, po ohni ohořelé (`burnedDay`); zasypávaný vodní příkop (`moatFills`).
 * Pořadí opevnění jako ve vsi (`BattleBreach.fort`).
 */
export function battleFortifications<
  T extends {
    segments: readonly { index: number; breachedDay?: number; burnedDay?: number }[];
    gatesClosed?: true;
    moatFills?: readonly SceneMoatFill[];
  },
>(
  forts: readonly T[],
  battle: {
    closedGates: SceneBattle['closedGates'];
    breaches: readonly (Pick<SceneBreach, 'fort' | 'segment' | 'breached'> &
      Partial<SceneBreach>)[];
  },
  day: number,
): T[] {
  return forts.map((fort, i) => {
    const closed = battle.closedGates.some((key) => key.startsWith(`${i}:`));
    const mine = battle.breaches.filter((x) => x.fort === i);
    const broken = new Map(mine.filter((x) => x.breached).map((x) => [x.segment, x.method]));
    const fills = mine.flatMap((x) =>
      x.moat && (x.fill ?? 0) > 0 ? [{ from: x.moat.from, to: x.moat.to, share: x.fill! }] : [],
    );
    if (!closed && broken.size === 0 && fills.length === 0) return fort;
    return {
      ...fort,
      ...(closed ? { gatesClosed: true as const } : {}),
      ...(fills.length > 0 ? { moatFills: fills } : {}),
      segments: fort.segments.map((s) => {
        if (!broken.has(s.index) || s.breachedDay !== undefined) return s;
        const burned = broken.get(s.index) === 'burn' && s.burnedDay === undefined;
        return { ...s, breachedDay: day, ...(burned ? { burnedDay: day } : {}) };
      }),
    };
  });
}

/** Meshe vojska (draw cally, když jsou vidět) – pro měření a dokumentaci (docs/code/scene.md). */
export const ARMY_MESHES = [
  'army-man',
  'army-woman',
  'army-horse',
  'army-cow',
  'army-shadow',
  'army-arrow',
  'army-stone',
  'army-javelin',
  'army-dust',
  'army-ladder-5',
  'army-ladder-7',
  'army-fagot',
  'army-pit',
  'army-order-follow-leader',
  'army-order-attack-all',
  'army-order-hold-place',
  'fog-veil',
] as const;

/**
 * Draw cally vojska: jeden na druh postavy a zvířete, stíny, šípy a prach (jen když letí / práší),
 * jeden na každý použitý rozkaz a závoj mlhy; u hradby kameny, oštěpy, díl žebříku, otepi a jámy
 * (oheň jsou sprity – správce `battle-fire`, jeden draw call navíc).
 */
export function armyDrawCalls(input: {
  figures: readonly Pick<ArmyFigure, 'kind'>[];
  animals: readonly Pick<ArmyAnimal, 'species'>[];
  icons: readonly Pick<OrderIcon, 'order'>[];
  arrows: number;
  dust: number;
  fog: boolean;
  siege?: {
    stones: number;
    javelins: number;
    ladders: readonly Pick<LadderPose, 'model'>[];
    fagots: number;
    pits: number;
    fires: number;
  };
}): number {
  const g = input.siege;
  const siege = g
    ? [g.stones, g.javelins, g.fagots, g.pits, g.fires].filter((n) => n > 0).length +
      new Set(g.ladders.map((l) => l.model)).size
    : 0;
  const kinds = new Set(input.figures.map((x) => x.kind)).size;
  const species = new Set(input.animals.map((x) => x.species)).size;
  const orders = new Set(input.icons.map((x) => x.order)).size;
  const shadow = input.figures.length + input.animals.length > 0 ? 1 : 0;
  return (
    kinds +
    species +
    shadow +
    (input.arrows > 0 ? 1 : 0) +
    (input.dust > 0 ? 1 : 0) +
    orders +
    (input.fog ? 1 : 0) +
    siege
  );
}
