// Vojsko ve scéně (war.md – Ve scéně): muži jako postavy vsi (`man.glb`) s oštěpem, štítem
// a lukem z 0 A.D. (klipy `walk-spear`, `spear-thrust`, `sword-strike`, `shield-block`,
// `bow-draw`, `bow-release`), muži rodu na koních (`ride`, `ride-trot`), hloučky podle skupin
// a ikona rozkazu nad skupinou. Bez Babylonu – vstup je stav jádra (`BattleState`, skupiny
// a muži `CampaignState`) zúžený na to, co scéna kreslí; vykresluje army-renderer.ts.
import {
  TICKS_PER_SECOND,
  WAR,
  type BattleBreach,
  type BattleGroup,
  type BattleSide,
  type BattleState,
  type CampaignGroup,
  type CampaignMember,
  type Fighter,
  type GroupOrder,
  type Pos,
} from '@bohemia/game';

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
  | 'pos'
  | 'home'
  | 'state'
  | 'cooldown'
  | 'aim'
  | 'killed'
  | 'breachAt'
>;

/** Skupina v boji pro scénu (jádro – `BattleGroup`). */
export type SceneBattleGroup = Pick<BattleGroup, 'side' | 'id' | 'order' | 'broken'>;

/** Rozdělaný průlom pro scénu (jádro – `BattleBreach`): průběh 0–1 a jestli je hotový. */
export type SceneBreach = Pick<BattleBreach, 'key' | 'fort' | 'segment' | 'spot' | 'at'> & {
  progress: number;
  breached: boolean;
};

/** Boj pro scénu – snímek stavu po taktu `ticks` (jádro – `BattleState`). */
export interface SceneBattle extends Pick<BattleState, 'ticks' | 'outcome'> {
  fighters: SceneFighter[];
  groups: SceneBattleGroup[];
  closedGates: readonly string[];
  breaches: SceneBreach[];
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

/** Boj z jádra pro scénu (kopie – stav jádra se taktem mění na místě). */
export function sceneBattle(b: BattleState): SceneBattle {
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
      health: f.health,
      pos: { x: f.pos.x, z: f.pos.z },
      home: { x: f.home.x, z: f.home.z },
      state: f.state,
      cooldown: f.cooldown,
      aim: f.aim,
      killed: f.killed,
      breachAt: f.breachAt,
    })),
    groups: b.groups.map((g) => ({ side: g.side, id: g.id, order: g.order, broken: g.broken })),
    closedGates: [...b.closedGates],
    breaches: b.breaches.map((x) => ({
      key: x.key,
      fort: x.fort,
      segment: x.segment,
      spot: x.spot,
      at: { x: x.at.x, z: x.at.z },
      progress: x.progress.required > 0 ? Math.min(1, x.progress.done / x.progress.required) : 1,
      breached: x.progress.breached,
    })),
  };
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
 * štítem, luk), prolamování sekerou u stěny, útěk, padlý leží, raněný sedí u domu.
 */
export function battleFigures(
  prev: SceneBattle | null,
  cur: SceneBattle,
  f: number,
  options: BattleFigureOptions,
): { figures: ArmyFigure[]; animals: ArmyAnimal[] } {
  const before = new Map(prev?.fighters.map((x) => [x.id, x]) ?? []);
  const byId = new Map(cur.fighters.map((x) => [x.id, x]));
  const figures: ArmyFigure[] = [];
  const animals: ArmyAnimal[] = [];
  const t = Math.min(1, Math.max(0, f));
  const dtS = Math.max(1, cur.ticks - (prev?.ticks ?? cur.ticks - 1)) / TICKS_PER_SECOND;
  for (const man of cur.fighters) {
    if (man.state === 'fled') continue;
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
    const clip = fighterClip(man, target, speed);
    const riding = man.mounted;
    if (riding) {
      animals.push({ key: `h-${man.id}`, species: 'horse', x, z, hx: face.x, hz: face.z, speed });
    }
    figures.push({
      key: man.id,
      kind: 'man',
      x,
      z,
      hx: face.x,
      hz: face.z,
      clip,
      pace: walking(clip) ? Math.min(2.4, Math.max(0.7, speed / WALK_M_S)) : 1,
      lift: riding ? RIDER_LIFT_M : 0,
      lying: false,
      side: man.side,
      look,
    });
  }
  return { figures, animals };
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

/** Klip muže v boji podle stavu, cíle a rychlosti. */
export function fighterClip(
  man: Pick<SceneFighter, 'state' | 'mounted' | 'bow' | 'line' | 'cooldown' | 'aim' | 'pos'>,
  target: Pick<SceneFighter, 'pos'> | undefined,
  speed: number,
): string {
  if (man.state === 'breach') return speed > STAND_M_S ? 'walk-axe' : 'fell';
  if (man.mounted) {
    if (speed > TROT_M_S) return 'ride-trot';
    return speed > STAND_M_S ? 'ride' : 'ride-idle';
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
    if (man.bow && d >= c.bowMinM && d <= c.bowMaxM && speed <= STAND_M_S) {
      return man.cooldown > BOW_TICKS - STRIKE_SHOW_TICKS ? 'bow-release' : 'bow-draw';
    }
  }
  if (speed > STAND_M_S) return man.bow ? 'walk' : 'walk-spear';
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

/**
 * Brány a průlomy opevnění z boje (fortifications.md – Ve scéně): opevnění, u něhož boj zavřel
 * bránu, má brány zavřené; hotový průlom je mezera úseku (`breachedDay`) – vyvrácené kůly,
 * rozsekaná brána. Pořadí opevnění jako ve vsi (`BattleBreach.fort`).
 */
export function battleFortifications<
  T extends { segments: readonly { index: number; breachedDay?: number }[]; gatesClosed?: true },
>(forts: readonly T[], battle: Pick<SceneBattle, 'closedGates' | 'breaches'>, day: number): T[] {
  return forts.map((fort, i) => {
    const closed = battle.closedGates.some((key) => key.startsWith(`${i}:`));
    const broken = new Set(
      battle.breaches.filter((x) => x.fort === i && x.breached).map((x) => x.segment),
    );
    if (!closed && broken.size === 0) return fort;
    return {
      ...fort,
      ...(closed ? { gatesClosed: true as const } : {}),
      segments: fort.segments.map((s) =>
        broken.has(s.index) && s.breachedDay === undefined ? { ...s, breachedDay: day } : s,
      ),
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
  'army-dust',
  'army-order-follow-leader',
  'army-order-attack-all',
  'army-order-hold-place',
  'fog-veil',
] as const;

/**
 * Draw cally vojska: jeden na druh postavy a zvířete, stíny, šípy a prach (jen když letí / práší),
 * jeden na každý použitý rozkaz a závoj mlhy.
 */
export function armyDrawCalls(input: {
  figures: readonly Pick<ArmyFigure, 'kind'>[];
  animals: readonly Pick<ArmyAnimal, 'species'>[];
  icons: readonly Pick<OrderIcon, 'order'>[];
  arrows: number;
  dust: number;
  fog: boolean;
}): number {
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
    (input.fog ? 1 : 0)
  );
}
