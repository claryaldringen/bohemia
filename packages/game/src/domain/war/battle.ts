import type { Random } from '../landscape/random';
import {
  assaultHours,
  assaultSteps,
  crossingLayers,
  mineUnderground,
  rampartPace,
  gatePartView,
  hasGateParts,
  wallSpotSegment,
  type GatePart,
  bandLine,
  fortOutlineOf,
  wallLineInM,
  fortSegments,
  layerBuilt,
  segmentIsGap,
  segmentWall,
  type AssaultStep,
  type FortSegmentShape,
} from '../village/fortification';
import type { Fortification, FortSegment } from '../village/fortification/types';
import { FORTIFICATIONS } from '../village/rules/rules-fortifications';
import type { WallKind } from '../village/types';
import type { GridGeometry } from '../village/placement/square-grid';
import { bowShot, poseOf, type TargetPose } from './aim';
import type { GroupAssault, GroupOrder } from './campaign-types';
import { defenderPlan, type Defender } from './defenders';
import {
  climbStep,
  defendLadder,
  fighterStrength,
  nearestForestOf,
  onLadder,
  outward,
  rampartFatigueStep,
  restFatigue,
  settleLadders,
  startCrossing,
  type BattleLadder,
  type ClimbWorld,
  type FighterClimb,
} from './ladders';
import { marchPath, nearestInArea, nearestPassable } from './march';
import {
  MARCH_BUILDING,
  MARCH_RAMPART,
  MARCH_WALL,
  marchCellAt,
  marchCellCenter,
  moatFillPace,
  type MarchGrid,
  type MoatFill,
  type Pos,
} from './march-grid';
import { marchArea } from './march-search';
import { lineClear } from './march-smooth';
import {
  attackerPlan,
  battleLeader,
  canAttack,
  dist2,
  inFight,
  type FighterPlan,
  type Leash,
  type PlanContext,
} from './orders';
import { WAR } from './rules-war';
import { leadTo } from './npc-assault';
import { inSight } from './sight';
import {
  breakoutGate,
  breakoutStep,
  fortBreakpoints,
  markTaken,
  orderBreakout,
  startFlee,
  surrender,
  untakenForts,
} from './rout';
import type { ShelterReport } from './stance';
import { TICKS_PER_SECOND } from './ticks';
import {
  battlePincers,
  canStrikeAcross,
  fortOfPost,
  onWallTop,
  pincerPoint,
  reinforceTarget,
  strikeReach,
  towerAt,
  crestAt,
  reachOf,
  wallKindAt,
  type BattlePincer,
  type StrikeKind,
  type WallWorld,
} from './wall-defense';

// Boj muž po muži (war.md – Boj; fortifications.md – Obrana, Prolomení): po taktech ve skutečném
// čase, každý muž zvlášť – zdraví 100, zásah `10 × síla` (bez násobku obrany – 8. 11. 2026), luk na
// 20–60 m poloviční zásah ≈ každé 4 s, zblízka plný ≈ každé 2 s; zda rána zblízka padne, určí los
// taktu 1 : 1, šíp podle dovednosti střelce a viditelné plochy v kruhu rozptylu (`aim.ts`). Na nule
// padlý, nebo raněný; skupina uteče při bodu zlomu podle počtu; velitel sám neuteče; poslední muž
// rodu doma neklesne pod 10 zdraví a vždy uteče. Opevnění: stěny úseků jsou úsečky, kterými se
// neprojde – jen branou, mezerou nebo průlomem, nebo přes ně (plot přelézt, žebřík – `ladders.ts`);
// prolamující nebojují a volí nejrychlejší postup místa – sekat, vypálit, odkopat, podkopat, napřed
// zasypat val či vodní příkop (`assault.ts`; Prolomení v boji). Rána přes stěnu jen podle druhu hradby, obránci v opevnění na stanovištích
// po hradbě a s posilami k žebříkům a průlomům (`wall-defense.ts`); kryt pod palbou, bod zlomu za
// hradbou jen ze ztrát v útoku, chaos, probíjení a dobytí útočiště (`rout.ts`). Stav je JSON, takt čte jen
// stav, bojiště a náhodu taktu – výsledek nezávisí na kouscích taktů. Jen det-math.

/** Strana boje. */
export type BattleSide = 'attack' | 'defend';

/**
 * Bojuje, prolamuje opevnění, přechází hradbu (žebřík, plot – `ladders.ts`), prchá, je pryč
 * z bojiště (utekl), leží (padlý nebo raněný).
 */
export type FighterState = 'fight' | 'breach' | 'climb' | 'flee' | 'fled' | 'down';

/** Muž v boji. */
export interface Fighter {
  /** `a:<index muže tažení>`, `d:<id člověka vsi>`. */
  id: string;
  side: BattleSide;
  /** Útočník: index v `CampaignState.members`; obránce: id člověka vsi. */
  ref: number;
  /** Útočník: skupina tažení; obránce: skupina domů. */
  group: number;
  line: boolean;
  bow: boolean;
  /** Dovednost luku 0–100 (muž rodu – `ArmsSkills.bow`); chybí – jako vesničan (`aim.ts`). */
  bowSkill?: number;
  mounted: boolean;
  /** Síla v boji (u útočníka × podíl síly po mrazu). */
  strength: number;
  health: number;
  pos: Pos;
  /** Obránce: jeho dům; útočník: kde vstoupil do boje (tam prchá). */
  home: Pos;
  state: FighterState;
  /** Takty do další rány. */
  cooldown: number;
  /** Na koho v tomto taktu útočí. */
  aim: string | null;
  /** Hráčem řízený muž (war.md – Boj: hráč živě řídí jen svého muže). */
  controlled: boolean;
  /** Koho napadnout a kam jít – určil hráč (jen řízený muž). */
  chosen: string | null;
  goal: Pos | null;
  /**
   * Průchod opevněním – body před a za průchodem –, nebo objížďka hustého lesa, vody či srázu
   * (body trasy `marchPath` – `detour`); `routeFor` = cíl, ke kterému vede.
   */
  route: Pos[];
  routeFor: string | null;
  /** Takt boje, kdy muž naposled hledal objížďku (`detour`); chybí = nehledal. */
  detourTick?: number;
  /** Takty v řadě, kdy se muž bez vodítka k cíli nepohnul (pojistka proti zastavení); chybí = 0. */
  stall?: number;
  /** Místo prolomení (`BattleBreach.key`). */
  breachAt: string | null;
  /** Kam prchá (útočník domů, obránce do nejbližšího lesa). */
  fleeTo: Pos | null;
  atHouseOnly: boolean;
  lastLine: boolean;
  /** Na nule zdraví – padl (jinak raněný). */
  killed: boolean;
  /** Přechod hradby (stav `climb`); jinak chybí. */
  climb?: FighterClimb;
  /** Nese vyrobený žebřík (do opření); jinak chybí. */
  ladder?: boolean;
  /** Únava po valu: síla × `factor` v taktu boje `tick`, zpět k 1 za 120 taktů; jinak chybí. */
  fatigue?: { factor: number; tick: number };
  /**
   * Obránce v opevnění: stanoviště na hradbě (`wall-defense.ts` – `wallPosts`), nebo v záloze ve
   * středu; chybí – brání dům.
   */
  post?: Pos;
  /** Stojí na ochozu či koruně hradby – kryje ho předprseň, chodí polovičním tempem; jinak chybí. */
  onWall?: boolean;
  /**
   * Obránce na hradbě v krytu pod palbou (fortifications.md – Obrana bez násobku 3, Kryt pod
   * palbou): na opevnění dopadají šípy a on nebrání místo útoku – na ochozu a koruně je skrčený
   * (`aim.ts` – póza `cover`), nestřílí ani nehází; jinak chybí. Plán obránce ho nastaví každý takt.
   */
  cover?: true;
  /**
   * Padl či je raněný ostřelováním přes hradbu, mimo místo útoku – do bodu zlomu obránců za
   * hradbou se nepočítá (tamtéž – bod zlomu jen v útoku); jinak chybí.
   */
  shotDown?: true;
  /**
   * Vzdal se při bodu zlomu za hradbou (raněný, odříznutý – tamtéž, Bod zlomu a probíjení); z boje
   * odešel (stav `fled`), útočník ho po vítězství odvede jako vzdaného; jinak chybí.
   */
  surrendered?: true;
  /**
   * Kopáč v podkopu po pětině práce (fortifications.md – Přechod hradby – Podkop): obránci ho
   * nevidí ani nezasáhnou; jinak chybí. Nastaví práce na průlomech v taktu (`breachWorkStep`).
   */
  underground?: true;
  /**
   * Kolikrát byl zasažen (`takeHit`) – scéna pozná ránu cizího muže bez přesného zdraví (war.md –
   * Ve scéně – napojení na hru); dokud nebyl, chybí.
   */
  hits?: number;
}

/** Skupina v boji – skupina tažení s rozkazem, nebo skupina domů obránců (rozkaz null). */
export interface BattleGroup {
  side: BattleSide;
  id: number;
  order: GroupOrder | null;
  holdAt: Pos | null;
  /** Muži, kteří do boje vstoupili – jmenovatel bodu zlomu. */
  entered: number;
  broken: boolean;
  /** Postup přes hradbu zvolený hráčem (útočníci); chybí = nejrychlejší. */
  assault?: GroupAssault;
}

/** Kde se prolamuje: brána, nebo zeď (4 m úseku mimo bránu). */
export type BreachSpot = 'gate' | 'wall';

/**
 * Postup prolomení místa (`assaultSteps`; fortifications.md – Přechod hradby): prosekat, vypálit,
 * odkopat, podkopat; `ladder` – jen zasypat vodní příkop, přes který pak půjdou žebříky.
 */
export type BreachMethod = 'cut' | 'burn' | 'dig' | 'mine' | 'ladder';

/** Fáze prolomení: zasypat (val, vodní příkop), nanosit otepi, hoří, práce (sekat, kopat), hotovo. */
export type BreachPhase = 'fill' | 'fuel' | 'burn' | 'work' | 'done';

/** Průběh prolomení: odvedená a potřebná práce (součet fází, `BattleBreach.need`), hotový průlom. */
export interface BreachProgress {
  done: number;
  required: number;
  /** Průlom hotový – mezera 4 m (zasypání pro žebříky průlom nedělá). */
  breached: boolean;
}

/** Rozdělaný průlom – úsek `segment` opevnění `fort` (pořadí ve vsi), brána nebo zeď. */
export interface BattleBreach {
  key: string;
  fort: number;
  segment: number;
  spot: BreachSpot;
  /** Kde prolamující stojí (venku u stěny). */
  at: Pos;
  method: BreachMethod;
  phase: BreachPhase;
  /**
   * Práce fází v mužohodinách po sobě: zasypat, nanosit otepi (× vzdálenost lesa či dříví), hořet
   * (hodiny × 2 přikládající), prolomit. Fáze končí, když `progress.done` dosáhne součtu.
   */
  need: { fill: number; fuel: number; burn: number; work: number };
  /** Zasypává se vodní příkop: kde zasypávající stojí (za vodou) a kam zasypaný pruh sahá. */
  moat?: MoatFill;
  progress: BreachProgress;
}

/**
 * Probíjení (fortifications.md – Obrana bez násobku 3, Bod zlomu a probíjení): obránci opevnění
 * `fort` se shromáždí u brány na úseku `segment`, pak se pohromadě probijí ven do lesa `to` (bez
 * lesa jen ven). `tick` – takt rozkazu, `gathered` – skupina vyrazila.
 */
export interface BattleBreakout {
  fort: number;
  segment: number;
  to: Pos | null;
  tick: number;
  gathered?: true;
}

/** Výsledek boje: běží, útočníci drží bojiště, útočníci poraženi, útočníci ustoupili. */
export type BattleOutcome = 'ongoing' | 'attackers' | 'defenders' | 'withdrawn';

/** Stav boje (část stavu tažení). */
export interface BattleState {
  fighters: Fighter[];
  groups: BattleGroup[];
  /** Velitel a zástupce tažení (id bojovníků). */
  commander: string | null;
  deputy: string | null;
  /** Zavřené brány `<opevnění>:<úsek>` (fortifications.md – Brány se zavřou). */
  closedGates: string[];
  /**
   * Brány, které otevřeli obránci – útěk při bodu zlomu, probíjení; už se nezavřou. Chybí = žádná.
   */
  openedGates?: string[];
  /** Kdy naposled dopadl šíp přes hradbu na obránce opevnění (opevnění → takt); kryt pod palbou. */
  underFire?: Record<number, number>;
  /** Opevnění, jejichž obránci dosáhli bodu zlomu – chaos, útěk branami; chybí = žádné. */
  routed?: number[];
  /** Probíjení obránců opevnění vybranou branou do lesa (rozkaz velitele obrany). */
  breakouts?: BattleBreakout[];
  /**
   * Rozkaz „Probít se“ od hráče obránců (záměr `breakout`), který takt teprve provede
   * (`orderDefenderBreakout`); jinak chybí.
   */
  breakoutOrder?: { fort: number; segment?: number };
  /** Dobytá útočiště – útočník stojí uvnitř obvodu (opevnění, pořadí na bojišti); chybí = žádné. */
  taken?: number[];
  breaches: BattleBreach[];
  /** Žebříky u hradeb (`ladders.ts`); chybí = žádný. */
  ladders?: BattleLadder[];
  outcome: BattleOutcome;
  /** Spočtené takty boje. */
  ticks: number;
  /**
   * Takt tažení, ve kterém se boj otevřel (ves utekla – scéna kreslí útěk od něj, i když je boj
   * už rozhodnutý; war.md – Ve scéně). Chybí – boj mimo tažení nebo starší stav.
   */
  openTick?: number;
  /** Kdo ze vsi odešel před bojem: útočiště, les, vzdaní, odnesené zásoby (Ú6.10 je použije). */
  shelter?: ShelterReport;
  /**
   * NPC velitel silné opevnění nenapadl a vzal, co je venku (Ú6.12) – výsledek `attackers`, ale
   * útočiště zůstalo nedobyté.
   */
  plundered?: true;
  /**
   * Vojvoda napadené vsi (číslo osoby), kterého hráč vzdal (záměr `lord-surrender` – war.md, Hráč
   * ve vsi a mimo ni): boj tím skončil a útočník ho zajme vždy, ať ke vzdaným zvolil cokoli.
   * Chybí – nikdo se nevzdal. Nezaměňovat s obránci vzdanými v boji (`yieldedOf`) ani s vsí vzdanou
   * Začít znovu (`CampaignState.yielded`).
   */
  lordYielded?: number;
}

/** Opevnění na bojišti s tvarem úseků (pořadí jako ve vsi). */
export interface BattleFort {
  fort: Fortification;
  shapes: FortSegmentShape[];
  center: Pos;
}

/** Bojiště – co takt čte mimo stav: mřížka mapy, opevnění vsi, den a délka taktu. */
export interface BattleField {
  grid: MarchGrid;
  geo: GridGeometry;
  forts: readonly BattleFort[];
  day: number;
  /** Herní hodiny jednoho taktu (prolamování je v mužohodinách). */
  hoursPerTick: number;
  /**
   * Dříví vsi na otepi – hromady klád (`logStacks`); les bere oheň z mřížky (`MARCH_FOREST`).
   * Chybí = jen les.
   */
  fuel?: readonly Pos[];
}

/** Útočník do boje – muž tažení. */
export interface BattleAttacker {
  member: number;
  group: number;
  line: boolean;
  mounted: boolean;
  strength: number;
  /** Dovednost luku muže rodu (`CampaignMember.bowSkill`); chybí – jako vesničan. */
  bowSkill?: number;
  health: number;
  pos: Pos;
}

/** Vstup nového boje. */
export interface NewBattle {
  attackers: readonly BattleAttacker[];
  defenders: readonly Defender[];
  groups: readonly {
    id: number;
    order: GroupOrder;
    holdAt: Pos | null;
    assault?: GroupAssault;
  }[];
  /** Index velitele a zástupce mezi muži tažení (`member`). */
  commander: number | null;
  deputy: number | null;
  /** Velitele řídí hráč živě. */
  liveCommand: boolean;
  /** Kdo ze vsi odešel před bojem (`planDefense`) – zásoby a dobytek, které útočník nedostane. */
  shelter?: ShelterReport;
}

/** Zásah `10 × síla`, luk polovina (war.md – Boj – Souboj mužů; násobek obrany zrušen 8. 11. 2026). */
export function hitDamage(strength: number, bow: boolean): number {
  const c = WAR.combat;
  return c.hitPerStrength * strength * (bow ? c.bowFactor : 1);
}

/**
 * Úseky posunuté na čáru hradby `inM` m od křivky (body na ose ohybu – `bandLine`; nejmenší ohyb
 * valu 8 m je víc než 7 m, posun se nepřehne) a brány opevnění na téže poměrné poloze úseku.
 */
function onWallLine(
  outline: NonNullable<ReturnType<typeof fortOutlineOf>>,
  fort: Fortification,
  shapes: FortSegmentShape[],
  inM: number,
): { fort: Fortification; shapes: FortSegmentShape[] } {
  if (inM === 0) return { fort, shapes };
  const scale = new Map<number, number>();
  const moved = shapes.map((s): FortSegmentShape => {
    const path = bandLine(outline, s.index, inM);
    const a = path[0];
    const b = path[path.length - 1];
    if (!a || !b) return s;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length <= 1e-6 || s.line.length <= 1e-6) return s;
    scale.set(s.index, length / s.line.length);
    let lengthM = 0;
    for (let i = 1; i < path.length; i++) {
      const ex = path[i]![0] - path[i - 1]![0];
      const ez = path[i]![1] - path[i - 1]![1];
      lengthM += Math.sqrt(ex * ex + ez * ez);
    }
    return {
      ...s,
      lengthM,
      path,
      line: { x: a[0], z: a[1], dx: dx / length, dz: dz / length, length },
      mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    };
  });
  const gates = fort.gates.map((g) => ({ ...g, offsetM: g.offsetM * (scale.get(g.segment) ?? 1) }));
  return { fort: { ...fort, gates }, shapes: moved };
}

/**
 * Opevnění vsi s tvarem úseků pro bojiště – čára úseku je čára hradby (`wallLineInM`; u valu na
 * křivce koruna valu, brány posunuté poměrně s úsekem).
 */
export function battleForts(geo: GridGeometry, forts: readonly Fortification[]): BattleFort[] {
  return forts.map((stored) => {
    const outline = fortOutlineOf(geo, stored);
    if (!outline) return { fort: stored, shapes: [], center: { x: 0, z: 0 } };
    const { fort, shapes } = onWallLine(
      outline,
      stored,
      fortSegments(outline),
      wallLineInM(stored),
    );
    let x = 0;
    let z = 0;
    for (const s of shapes) {
      x += s.mid[0];
      z += s.mid[1];
    }
    const n = Math.max(1, shapes.length);
    return { fort, shapes, center: { x: x / n, z: z / n } };
  });
}

const attackerId = (member: number): string => `a:${member}`;

/** Výchozí stav boje – útočníci u svých skupin, obránci u domů. */
export function openBattle(input: NewBattle): BattleState {
  const fighters: Fighter[] = [];
  const base = {
    cooldown: 0,
    aim: null,
    chosen: null,
    goal: null,
    route: [],
    routeFor: null,
    breachAt: null,
    fleeTo: null,
    killed: false,
  };
  for (const a of input.attackers) {
    fighters.push({
      ...base,
      id: attackerId(a.member),
      side: 'attack',
      ref: a.member,
      group: a.group,
      line: a.line,
      bow: a.line,
      ...(a.bowSkill !== undefined ? { bowSkill: a.bowSkill } : {}),
      mounted: a.mounted,
      strength: a.strength,
      health: a.health,
      pos: { ...a.pos },
      home: { ...a.pos },
      state: 'fight',
      controlled: input.liveCommand && a.member === input.commander,
      atHouseOnly: false,
      lastLine: false,
    });
  }
  for (const d of input.defenders) {
    fighters.push({
      ...base,
      id: `d:${d.personId}`,
      side: 'defend',
      ref: d.personId,
      group: d.houseGroup,
      line: d.line,
      bow: d.bow,
      ...(d.bowSkill !== undefined ? { bowSkill: d.bowSkill } : {}),
      mounted: false,
      strength: d.strength,
      health: WAR.combat.health,
      pos: { ...d.pos },
      home: { ...d.pos },
      state: 'fight',
      controlled: false,
      atHouseOnly: d.atHouseOnly,
      lastLine: d.lastLine,
      ...(d.post ? { post: { ...d.post } } : {}),
      ...(d.onWall ? { onWall: true } : {}),
    });
  }
  const groups: BattleGroup[] = [];
  for (const g of input.groups) {
    const men = fighters.filter((f) => f.side === 'attack' && f.group === g.id);
    if (men.length === 0) continue;
    const holdAt = g.order === 'hold-place' ? (g.holdAt ?? { ...men[0]!.pos }) : g.holdAt;
    groups.push({
      side: 'attack',
      id: g.id,
      order: g.order,
      holdAt,
      entered: men.length,
      broken: false,
      ...(g.assault ? { assault: g.assault } : {}),
    });
  }
  const houseGroups = [...new Set(input.defenders.map((d) => d.houseGroup))].sort((a, b) => a - b);
  for (const id of houseGroups) {
    const entered = input.defenders.filter((d) => d.houseGroup === id).length;
    groups.push({ side: 'defend', id, order: null, holdAt: null, entered, broken: false });
  }
  const idOf = (m: number | null): string | null =>
    m !== null && input.attackers.some((a) => a.member === m) ? attackerId(m) : null;
  return {
    fighters,
    groups,
    commander: idOf(input.commander),
    deputy: idOf(input.deputy),
    closedGates: [],
    breaches: [],
    outcome: 'ongoing',
    ticks: 0,
    ...(input.shelter ? { shelter: input.shelter } : {}),
  };
}

// --- Stěny opevnění -------------------------------------------------------------------------

/**
 * Úsečka stěny, kterou se neprojde; `segment` – úsek opevnění, `along` – její střed na čáře úseku
 * (druh hradby podle polohy – kusy dílu s branou), `kind` – druh spočtený v taktu (`lineWall`).
 * `pincer` – rameno či vrata klešťové brány (druh ramen předem): nepřelézá se, vrata se prolamují.
 */
interface WallLine {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  segment: number;
  along: number;
  kind?: WallKind | null;
  pincer?: true;
}

/** Průchod opevněním – brána, mezera, průlom; body vně a uvnitř, úsek. */
interface Opening {
  out: Pos;
  in: Pos;
  segment: number;
}

/** Místo, kde jde opevnění prolomit: postupy místa (`assaultSteps`) a vnější normála hradby. */
interface Spot {
  key: string;
  fort: number;
  segment: number;
  spot: BreachSpot;
  at: Pos;
  out: Pos;
  steps: AssaultStep[];
  /** Nejvýš prolamujících na místě – u vrat klešťové brány `pincerGate.maxMen`; chybí – 4. */
  maxMen?: number;
}

/**
 * Stěny, průchody a místa prolomení každého opevnění v tomto taktu; zasypané kusy vodního příkopu
 * (průchozí jako suchý příkop – `moatFillPace`).
 */
interface Walls {
  lines: WallLine[][];
  openings: Opening[][];
  spots: Spot[][];
  fills: MoatFill[];
}

/**
 * Úsek blokuje: stojí a stojí na něm hradba – holý val (i s nedostavěnou či zbořenou hradbou) se
 * přejde čtvrtinovým tempem (mřížka).
 */
function blocks(fort: Fortification, seg: FortSegment, day: number): boolean {
  if (segmentIsGap(fort, seg, day)) return false;
  return layerBuilt(segmentWall(fort, seg));
}

/**
 * Nejbližší zasypaný kus vodního příkopu opevnění `fort` k `from`: úsek a bod na čáře hradby
 * (střed pruhu zasypání); žádný null.
 */
function filledNear(b: BattleState, fort: number, from: Pos): { segment: number; at: Pos } | null {
  let best: { segment: number; at: Pos } | null = null;
  let bestD = Infinity;
  for (const br of b.breaches) {
    if (br.fort !== fort || !br.moat || br.progress.done < br.need.fill - 1e-9) continue;
    const at = { x: (br.moat.from.x + br.moat.to.x) / 2, z: (br.moat.from.z + br.moat.to.z) / 2 };
    const d = dist2(from, at);
    if (d < bestD) {
      bestD = d;
      best = { segment: br.segment, at };
    }
  }
  return best;
}

/**
 * Opevnění s průlomy boje (prolomený úsek je mezera – `breachedDay`); vypálená brána vezme věž nad
 * sebou (hoří s branou – jako po boji `raid-apply.ts`).
 */
function breachedForts(field: BattleField, b: BattleState): BattleFort[] {
  const breached = b.breaches.filter((x) => x.progress.breached);
  if (breached.length === 0) return [...field.forts];
  const done = new Set(breached.map((x) => `${x.fort}:${x.segment}`));
  const burned = new Set(
    breached
      .filter((x) => x.spot === 'gate' && x.method === 'burn')
      .map((x) => `${x.fort}:${x.segment}`),
  );
  return field.forts.map((bf, fi) => ({
    ...bf,
    fort: {
      ...bf.fort,
      segments: bf.fort.segments.map((s) =>
        done.has(`${fi}:${s.index}`) ? { ...s, breachedDay: field.day } : s,
      ),
      gates: bf.fort.gates.map((g) => {
        if (g.towerDay === undefined || !burned.has(`${fi}:${g.segment}`)) return g;
        const copy = { ...g };
        delete copy.towerDay;
        return copy;
      }),
    },
  }));
}

/** Postupy prolomení místa: prosekat, vypálit, odkopat, podkopat; žebřík jen přes vodní příkop. */
function breachSteps(
  fort: Fortification,
  seg: FortSegment,
  day: number,
  gate: boolean,
): AssaultStep[] {
  return assaultSteps(crossingLayers(fort, seg, day, gate)).filter(
    (p) =>
      p.method !== 'open' && p.method !== 'climb' && (p.method !== 'ladder' || p.fill === 'moat'),
  );
}

/** Zasypané kusy vodního příkopu – průlomy po fázi zasypání. */
function moatFills(b: BattleState): MoatFill[] {
  const out: MoatFill[] = [];
  for (const br of b.breaches) {
    if (br.moat && br.progress.done >= br.need.fill - 1e-9) out.push(br.moat);
  }
  return out;
}

function wallsOf(
  forts: readonly BattleFort[],
  closed: ReadonlySet<string>,
  day: number,
  fills: MoatFill[],
): Walls {
  const walls: Walls = { lines: [], openings: [], spots: [], fills };
  forts.forEach((bf, fi) => {
    const lines: WallLine[] = [];
    const openings: Opening[] = [];
    const spots: Spot[] = [];
    const pincers = battlePincers(bf, day);
    bf.shapes.forEach((shape, k) => {
      const l = shape.line;
      const at = (t: number): Pos => ({ x: l.x + l.dx * t, z: l.z + l.dz * t });
      const mid = at(l.length / 2);
      const { x: nx, z: nz } = outward(bf, l);
      const shift = (p: Pos, m: number): Pos => ({ x: p.x + nx * m, z: p.z + nz * m });
      const opening = (p: Pos): Opening => ({
        out: shift(p, 3),
        in: shift(p, -3),
        segment: shape.index,
      });
      const part = (from: number, to: number): void => {
        if (to - from <= 1e-6) return;
        const a = at(from);
        const e = at(to);
        lines.push({
          ax: a.x,
          az: a.z,
          bx: e.x,
          bz: e.z,
          segment: shape.index,
          along: (from + to) / 2,
        });
      };
      const seg = bf.fort.segments.find((s) => s.index === shape.index);
      const gate = bf.fort.gates.find((g) => g.segment === shape.index);
      // díl s branou s kusy s vlastní hradbou blokuje po kusech (brána je brána)
      const split = gate !== undefined && seg !== undefined && hasGateParts(seg);
      const stands = (part: GatePart): boolean =>
        split ? blocks(bf.fort, gatePartView(seg, part), day) : true;
      // klešťová brána (plán hradeb Ú19): ramena jsou stěny s ochozem od čáry hradby po vrata –
      // stojí i na prolomeném dílu; ústí uličky v hradbě je vždy otevřené, zavřená vrata na jejím
      // vnitřním konci jsou stěna, otevřenými se projde uličkou
      const pincer = gate ? pincers.find((p) => p.segment === shape.index) : undefined;
      const alleyHalf = FORTIFICATIONS.pincerGate.alleyWidthM / 2;
      // stěna klešťové brány (rameno, vrata) – druh ramen předem
      const pincerLine = (p: BattlePincer, a: Pos, e: Pos): void => {
        lines.push({
          ax: a.x,
          az: a.z,
          bx: e.x,
          bz: e.z,
          segment: shape.index,
          along: gate?.offsetM ?? 0,
          kind: p.kind,
          pincer: true,
        });
      };
      if (pincer) {
        for (const side of [-alleyHalf, alleyHalf]) {
          pincerLine(pincer, pincerPoint(pincer, side, 0), pincerPoint(pincer, side, pincer.endM));
        }
      }
      if (!seg || (split ? !stands('before') && !stands('after') : !blocks(bf.fort, seg, day))) {
        openings.push(opening(mid));
        return;
      }
      const key = `${fi}:${shape.index}`;
      if (gate && (pincer || !closed.has(key))) {
        const half = FORTIFICATIONS.gate.widthM / 2;
        if (stands('before')) part(0, gate.offsetM - half);
        if (stands('after')) part(gate.offsetM + half, l.length);
        if (!pincer) openings.push(opening({ x: gate.x, z: gate.z }));
        else if (closed.has(key)) {
          pincerLine(
            pincer,
            pincerPoint(pincer, -alleyHalf, pincer.endM),
            pincerPoint(pincer, alleyHalf, pincer.endM),
          );
        } else {
          openings.push({
            out: shift({ x: pincer.mx, z: pincer.mz }, 3),
            in: pincerPoint(pincer, 0, pincer.endM + 3),
            segment: shape.index,
          });
        }
      } else {
        part(0, l.length);
      }
      // roh – tětiva oblouku ke začátku dalšího úseku
      const next = bf.shapes[(k + 1) % bf.shapes.length];
      if (shape.arc && next) {
        const e = at(l.length);
        lines.push({
          ax: e.x,
          az: e.z,
          bx: next.line.x,
          bz: next.line.z,
          segment: shape.index,
          along: l.length,
        });
      }
      if (gate) {
        // u klešťové brány se prolamují vrata na konci uličky – vejde se k nim `pincerGate.maxMen`
        spots.push({
          key: `${key}:gate`,
          fort: fi,
          segment: shape.index,
          spot: 'gate',
          at: pincer ? pincerPoint(pincer, 0, pincer.endM - 1) : shift({ x: gate.x, z: gate.z }, 1),
          out: { x: nx, z: nz },
          steps: breachSteps(bf.fort, seg, day, true),
          ...(pincer ? { maxMen: FORTIFICATIONS.pincerGate.maxMen } : {}),
        });
      }
      const wallT = gate
        ? gate.offsetM > l.length / 2
          ? l.length / 4
          : (3 * l.length) / 4
        : l.length / 2;
      spots.push({
        key: `${key}:wall`,
        fort: fi,
        segment: shape.index,
        spot: 'wall',
        at: shift(at(wallT), 1),
        out: { x: nx, z: nz },
        steps: breachSteps(bf.fort, wallSpotSegment(bf.fort.gates, seg, l.length), day, false),
      });
    });
    walls.lines.push(lines);
    walls.openings.push(openings);
    walls.spots.push(spots);
  });
  return walls;
}

function orient(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  return (bx - ax) * (pz - az) - (bz - az) * (px - ax);
}

/** Protne úsečka p → q stěnu? (Kolineární neblokuje.) */
function crosses(p: Pos, q: Pos, l: WallLine): boolean {
  const d1 = orient(l.ax, l.az, l.bx, l.bz, p.x, p.z);
  const d2 = orient(l.ax, l.az, l.bx, l.bz, q.x, q.z);
  if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0) || (d1 === 0 && d2 === 0)) return false;
  const d3 = orient(p.x, p.z, q.x, q.z, l.ax, l.az);
  const d4 = orient(p.x, p.z, q.x, q.z, l.bx, l.bz);
  return !((d3 > 0 && d4 > 0) || (d3 < 0 && d4 < 0));
}

/** První stěna na cestě p → q: opevnění a úsečka; žádná null. */
function firstWall(
  p: Pos,
  q: Pos,
  walls: Walls,
  climbable = false,
): { fort: number; line: WallLine } | null {
  for (let fi = 0; fi < walls.lines.length; fi++) {
    for (const line of walls.lines[fi]!) {
      if (climbable && line.pincer) continue;
      if (crosses(p, q, line)) return { fort: fi, line };
    }
  }
  return null;
}

// --- Pohyb ------------------------------------------------------------------------------------

/**
 * Tempo buňky mřížky; stěny opevnění řeší úsečky, ne buňky; boj ve vsi stavby neblokují; zasypaný
 * kus vodního příkopu se přejde jako suchý (`moatFillPace`).
 */
function paceAt(grid: MarchGrid, p: Pos, fills: readonly MoatFill[], attacker = false): number {
  const c = marchCellAt(grid, p);
  const flags = grid.flags[c]!;
  if ((flags & (MARCH_WALL | MARCH_BUILDING)) !== 0) {
    // hradba na koruně valu (Martin 9. 11. 2026): útočník leze přes příkop a val tempem plného
    // valu, obránce chodí po svém valu plným
    const crest = (flags & MARCH_WALL) !== 0 && (flags & MARCH_RAMPART) !== 0;
    return attacker && crest ? rampartPace(1) : 1;
  }
  return fills.length > 0 ? moatFillPace(grid, p, fills) : grid.pace[c]!;
}

/**
 * Místo muže ve formaci na začátku boje (war.md – Boj; plán 2026-11-16-dense-forest – oprava
 * Úlohy 4): bod `p`, kam boj vstoupí – průchodná buňka, stavba nebo stěna opevnění (`paceAt`).
 * Místo v buňce s tempem 0 (hustý les, voda, sráz, skála) nahradí střed nejbližší průchodné buňky
 * téže souvislé oblasti jako místo skupiny `anchor` – muž by se odtud nepohnul (`stepToward`)
 * a boj únik nemá. Nestojí-li na průchodné buňce ani skupina, nejbližší průchodná buňka vůbec;
 * mapa bez ní – `p`.
 */
export function formationSpot(grid: MarchGrid, p: Pos, anchor: Pos): Pos {
  const c = marchCellAt(grid, p);
  if (grid.pace[c]! > 0 || (grid.flags[c]! & (MARCH_WALL | MARCH_BUILDING)) !== 0) return p;
  const area = marchArea(grid, marchCellAt(grid, anchor));
  const spot =
    area > 0 ? nearestInArea(grid, c, area, Infinity) : nearestPassable(grid, c, Infinity);
  return spot < 0 ? p : marchCellCenter(grid, spot);
}

function leashGap(leash: Leash, p: Pos): number {
  let best = Infinity;
  for (const a of leash.at) best = Math.min(best, dist2(a, p));
  return best;
}

/**
 * Krok `pos` → `q` končí v buňce s tempem 0 (hustý les, voda, sráz, skála): muž sklouzne podél
 * jejího kraje jako podél stěny – průmět kroku do osy x, nebo z (napřed delší složka), kam vstoupit
 * smí a kde mu v cestě nestojí stěna (plán 2026-11-16-dense-forest – Úloha 5: jinak by u kraje
 * hustého lesa stál, dokud se cíl nezmění, a boj by se zastavil). Null = ani jedna osa.
 */
function alongEdge(pos: Pos, q: Pos, grid: MarchGrid, walls: Walls): Pos | null {
  const sx = q.x - pos.x;
  const sz = q.z - pos.z;
  const xs = { x: pos.x + sx, z: pos.z };
  const zs = { x: pos.x, z: pos.z + sz };
  for (const p of Math.abs(sx) >= Math.abs(sz) ? [xs, zs] : [zs, xs]) {
    if (p.x === pos.x && p.z === pos.z) continue;
    if (paceAt(grid, p, walls.fills) > 0 && !firstWall(pos, p, walls)) return p;
  }
  return null;
}

/**
 * Krok k `to` tempem muže a terénu. Stěnu neprojde – sklouzne podél ní; na vodu, sráz, skálu ani do
 * hustého lesa nevstoupí – sklouzne podél kraje (`alongEdge`); z vodítka ven nevykročí (zpátky
 * k němu ano). Vrací, zda se pohnul.
 */
function stepToward(
  f: Fighter,
  to: Pos,
  field: BattleField,
  walls: Walls,
  leash: Leash | null,
): boolean {
  const dx = to.x - f.pos.x;
  const dz = to.z - f.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1e-9) return false;
  const here = paceAt(field.grid, f.pos, walls.fills, f.side === 'attack');
  const speed =
    (WAR.pace.metersPerSecond / TICKS_PER_SECOND) *
    (f.mounted ? WAR.pace.riders : 1) *
    (f.onWall ? FORTIFICATIONS.defense.walkwayPace : 1) *
    (here > 0 ? here : 1);
  const step = Math.min(d, speed);
  const ux = dx / d;
  const uz = dz / d;
  let q = { x: f.pos.x + ux * step, z: f.pos.z + uz * step };
  const wall = firstWall(f.pos, q, walls);
  if (wall) {
    // podél stěny – průmět kroku do jejího směru
    const lx = wall.line.bx - wall.line.ax;
    const lz = wall.line.bz - wall.line.az;
    const len = Math.sqrt(lx * lx + lz * lz);
    if (len <= 1e-9) return false;
    const along = ((ux * lx + uz * lz) / len) * step;
    q = { x: f.pos.x + (lx / len) * along, z: f.pos.z + (lz / len) * along };
  }
  if (paceAt(field.grid, q, walls.fills) <= 0) {
    const slid = alongEdge(f.pos, q, field.grid, walls);
    if (!slid) return false;
    q = slid;
  } else if (firstWall(f.pos, q, walls)) {
    return false;
  }
  if (leash) {
    const gap = leashGap(leash, q);
    if (gap > leash.radiusM * leash.radiusM && gap >= leashGap(leash, f.pos)) return false;
  }
  if (q.x === f.pos.x && q.z === f.pos.z) return false;
  f.pos = q;
  return true;
}

// --- Takt boje --------------------------------------------------------------------------------

/** Co takt zná navíc ke stavu. */
interface TickWorld {
  field: BattleField;
  forts: BattleFort[];
  walls: Walls;
  b: BattleState;
  /** Co přechod hradby (`ladders.ts`) čte z taktu. */
  climb: ClimbWorld;
  /** Co obránci na hradbě (`wall-defense.ts`) čtou z taktu. */
  wall: WallWorld;
  /**
   * Nedobytá útočiště (opevnění), když už žádný obránce nebojuje ani neutíká – útočníci jdou
   * dovnitř; jinak prázdné.
   */
  refuges: number[];
}

const MELEE_TICKS = WAR.combat.meleeSeconds * TICKS_PER_SECOND;
const BOW_TICKS = WAR.combat.bowSeconds * TICKS_PER_SECOND;
const THROW_TICKS = FORTIFICATIONS.defense.throwSeconds * TICKS_PER_SECOND;
/** Prolamující pracuje, když stojí do tolika metrů od místa. */
const AT_SPOT_M = 1.5;

/** Hradba stěny `line` opevnění `fort` v tomto taktu (jednou za takt na stěnu). */
function lineWall(line: WallLine, fort: number, w: TickWorld): WallKind | null {
  if (line.kind === undefined) {
    const bf = w.forts[fort];
    line.kind = bf ? wallKindAt(bf, line.segment, line.along, w.field.day) : null;
  }
  return line.kind;
}

/**
 * Je cíl na ránu – zblízka, lukem, nebo hodem z ochozu (`strikeReach`; zblízka má přednost)?
 * Rána přes stěnu opevnění jen podle druhu hradby (`canStrikeAcross`); lezec nahoře na hradbě za
 * ní není (souboj u žebříku). `across` – rána jde přes hradbu (zespodu na ochoz – předprseň).
 */
function strikeOf(
  f: Fighter,
  t: Fighter,
  w: TickWorld,
): { kind: StrikeKind; across: boolean } | null {
  const reach = reachOf(f, w.wall);
  const kind = strikeReach(f, t, reach.bowMaxM, reach.throwM);
  if (kind === null) return null;
  if (onWallTop(f, w.b) || onWallTop(t, w.b)) return { kind, across: false };
  const range = kind === 'melee' ? 'melee' : 'ranged';
  let across = false;
  for (let fi = 0; fi < w.walls.lines.length; fi++) {
    for (const line of w.walls.lines[fi]!) {
      if (!crosses(f.pos, t.pos, line)) continue;
      across = true;
      if (!canStrikeAcross(lineWall(line, fi, w), f, t, range)) return null;
    }
  }
  return { kind, across };
}

/**
 * Dosáhne `f` na `t` přes hradby mezi nimi (`canStrikeAcross`) – lukem na dostřel, jinak zblízka
 * (vzdálenost zblízka se nehlídá – k cíli dojde)? Skupina „držet místo“ jiné cíle nevolí (plán
 * hradeb, Úloha 20).
 */
function reachable(f: Fighter, t: Fighter, w: TickWorld): boolean {
  if (onWallTop(f, w.b) || onWallTop(t, w.b)) return true;
  const c = WAR.combat;
  const d2 = dist2(f.pos, t.pos);
  const bow = f.bow && d2 >= c.bowMinM * c.bowMinM && d2 <= c.bowMaxM * c.bowMaxM;
  for (let fi = 0; fi < w.walls.lines.length; fi++) {
    for (const line of w.walls.lines[fi]!) {
      if (!crosses(f.pos, t.pos, line)) continue;
      if (!canStrikeAcross(lineWall(line, fi, w), f, t, bow ? 'ranged' : 'melee')) return false;
    }
  }
  return true;
}

/** Druh rány na cíl odsud, nebo null. */
function strikeKind(f: Fighter, t: Fighter, w: TickWorld): StrikeKind | null {
  return strikeOf(f, t, w)?.kind ?? null;
}

/**
 * Bod zlomu po skupinách (war.md – Bod zlomu): padlí a ranění ÷ muži, kteří do boje vstoupili.
 * Obránci za hradbou (se stanovištěm) mají bod zlomu po opevněních jen ze ztrát v útoku
 * (`rout.ts` – `fortBreakpoints`), ve skupině domů se nepočítají.
 */
function breakpoints(b: BattleState, field: BattleField, forts: readonly BattleFort[]): void {
  for (const g of b.groups) {
    if (g.broken || g.entered === 0) continue;
    const all = b.fighters.filter((f) => f.side === g.side && f.group === g.id);
    const men = g.side === 'defend' ? all.filter((f) => f.post === undefined) : all;
    const entered = g.entered - (all.length - men.length);
    if (entered <= 0) continue;
    const lost = men.filter((f) => f.state === 'down').length;
    const limit = g.side === 'attack' ? WAR.breakpoint.attacker : WAR.breakpoint.defender;
    if (lost / entered < limit - 1e-9) continue;
    g.broken = true;
    // velitel neuteče sám – ustoupí jen na pokyn hráče, nebo NPC velitele (Ú6.12)
    for (const f of men) if (inFight(f) && f.id !== b.commander) startFlee(f, field);
  }
  fortBreakpoints(b, field, forts);
}

/** Brány se zavřou, když je první útočník do 30 m (fortifications.md – Obrana; útočiště Ú6.9). */
function closeGates(b: BattleState, forts: readonly BattleFort[]): void {
  const r2 = FORTIFICATIONS.gatesCloseWithinM * FORTIFICATIONS.gatesCloseWithinM;
  forts.forEach((bf, fi) => {
    for (const gate of bf.fort.gates) {
      // zbořená brána je mezera – nemá co zavřít (demolition.md – Rozhodnutí)
      if (gate.demolishedDay !== undefined) continue;
      const key = `${fi}:${gate.segment}`;
      if (b.closedGates.includes(key) || (b.openedGates ?? []).includes(key)) continue;
      const near = b.fighters.some(
        (f) => f.side === 'attack' && inFight(f) && dist2(f.pos, gate) <= r2,
      );
      if (near) b.closedGates.push(key);
    }
  });
}

const A = FORTIFICATIONS.assault;
/** Fáze prolomení po sobě (`BattleBreach.need`). */
const PHASES = ['fill', 'fuel', 'burn', 'work'] as const;

/** Nejbližší les k místu (čtverec m) – jednou na mřížku a místo (místa se v boji nehýbou). */
const forestNear = new WeakMap<MarchGrid, Map<string, number>>();

/**
 * Kolik metrů nosí otepi (fortifications.md – Přechod hradby – Oheň): nejbližší místo u hustého lesa
 * (`nearestForestOf`) nebo hromada klád vsi (`BattleField.fuel`); nic – nekonečno (oheň nejde).
 */
function fuelDistanceM(field: BattleField, at: Pos): number {
  let cache = forestNear.get(field.grid);
  if (!cache) {
    cache = new Map();
    forestNear.set(field.grid, cache);
  }
  const key = `${at.x},${at.z}`;
  let best = cache.get(key);
  if (best === undefined) {
    const p = nearestForestOf(field.grid, at);
    best = p ? dist2(p, at) : Infinity;
    cache.set(key, best);
  }
  for (const p of field.fuel ?? []) best = Math.min(best, dist2(p, at));
  return Math.sqrt(best);
}

/** Práce fází postupu s otepi z `fuelM` metrů – součty jako `assaultHours`. */
function stepNeed(step: AssaultStep, fuelM: number): BattleBreach['need'] {
  return {
    fill: step.fillManHours,
    fuel: step.fuelManHours * Math.max(1, fuelM / A.burn.fuelM),
    burn: step.burnHours * A.burn.lighters,
    work: step.method === 'ladder' ? 0 : step.manHours,
  };
}

/** Fáze podle odvedené práce; hotový průlom (zasypání pro žebříky průlom nedělá). */
function syncPhase(br: BattleBreach): void {
  let end = 0;
  for (const phase of PHASES) {
    end += br.need[phase];
    if (br.progress.done < end - 1e-9) {
      br.phase = phase;
      return;
    }
  }
  br.phase = 'done';
  br.progress.done = br.progress.required;
  br.progress.breached = br.method !== 'ladder';
}

/** Průlom uložený před přechodem hradby (plán hradeb Úloha 14) – bez postupu a fází: sekání. */
function upgradeBreaches(b: BattleState): void {
  for (const br of b.breaches) {
    if ((br as Partial<BattleBreach>).need) continue;
    br.method = 'cut';
    br.need = { fill: 0, fuel: 0, burn: 0, work: br.progress.required };
    syncPhase(br);
  }
}

/** Zbývající hodiny průlomu s `men` muži (nejvýš 4, hoří 2 přikládající) – jako `assaultHours`. */
function breachHoursLeft(br: BattleBreach, men: number): number {
  let left = 0;
  let start = 0;
  for (const phase of PHASES) {
    const need = br.need[phase];
    const rest = Math.max(0, Math.min(need, start + need - br.progress.done));
    if (rest > 0) left += rest / Math.min(men, phase === 'burn' ? A.burn.lighters : A.maxMen);
    start += need;
  }
  return left;
}

/**
 * Práce `men` mužů za `hours` herních hodin: fáze po sobě – zasypat, nanosit otepi a prolomit
 * nejvýš 4 muži, hoří s nejvýš 2 přikládajícími (bez nich oheň nepostoupí). Po zasypání vodního
 * příkopu takt končí – muži přejdou zasypaným kusem k hradbě. Vrací, zda je hotovo.
 */
function advanceBreach(br: BattleBreach, men: number, hours: number): boolean {
  let h = hours;
  let end = 0;
  for (const phase of PHASES) {
    end += br.need[phase];
    if (br.progress.done >= end - 1e-9) continue;
    const rate = Math.min(men, phase === 'burn' ? A.burn.lighters : A.maxMen);
    if (rate <= 0 || h <= 0) break;
    const t = Math.min(h, (end - br.progress.done) / rate);
    br.progress.done = Math.min(end, br.progress.done + t * rate);
    h -= t;
    if (br.progress.done < end - 1e-9) break;
    br.progress.done = end;
    if (phase === 'fill' && br.moat) break;
  }
  syncPhase(br);
  return br.phase === 'done';
}

/** Kde prolamující stojí: při zasypávání vodního příkopu za vodou, jinak u hradby. */
function standOf(br: BattleBreach): Pos {
  return br.moat && br.phase === 'fill' ? br.moat.from : br.at;
}

/** Nejdál, kam se od hradby hledá suché místo za vodním příkopem (m). */
const MOAT_REACH_M = 40;

/**
 * Pruh zasypání vodního příkopu u místa: od prvního suchého bodu ven od hradby (po metru) přes
 * hradbu stejně daleko dovnitř; bez suchého bodu od místa samého.
 */
function moatStrip(grid: MarchGrid, spot: Spot): MoatFill {
  const line = { x: spot.at.x - spot.out.x, z: spot.at.z - spot.out.z };
  let k = 1;
  for (; k <= MOAT_REACH_M; k++) {
    const p = { x: line.x + spot.out.x * k, z: line.z + spot.out.z * k };
    if (grid.pace[marchCellAt(grid, p)]! > 0) break;
  }
  if (k > MOAT_REACH_M) k = 1;
  return {
    from: { x: line.x + spot.out.x * k, z: line.z + spot.out.z * k },
    to: { x: line.x - spot.out.x * k, z: line.z - spot.out.z * k },
  };
}

/** Nový průlom místa postupem `step`; práce 0 (brána plotu, závora valu) je prolomená hned. */
function openBreach(w: TickWorld, spot: Spot, step: AssaultStep): BattleBreach {
  const need = stepNeed(step, step.method === 'burn' ? fuelDistanceM(w.field, spot.at) : 0);
  const br: BattleBreach = {
    key: spot.key,
    fort: spot.fort,
    segment: spot.segment,
    spot: spot.spot,
    at: { ...spot.at },
    method: step.method as BreachMethod,
    phase: 'fill',
    need,
    progress: {
      done: 0,
      required: need.fill + need.fuel + need.burn + need.work,
      breached: false,
    },
  };
  if (step.fill === 'moat') br.moat = moatStrip(w.field.grid, spot);
  syncPhase(br);
  return br;
}

/** Místo a postup prolomení; `step` null = rozdělaný průlom; `hours` – zbývá se 4 muži. */
interface SpotChoice {
  spot: Spot;
  step: AssaultStep | null;
  hours: number;
}

/**
 * Volné místo prolomení a postup (fortifications.md – Přechod hradby): nejméně hodin s `men` muži
 * (rozdělaný průlom – zbývajících), pak nejblíž; nejvýš 4 muži na místo. Postup skupiny (`assault`)
 * má přednost, nabízí-li ho místo; oheň jen s otepi (les, dříví vsi).
 */
function chooseSpot(
  w: Pick<TickWorld, 'field' | 'walls' | 'b'>,
  fort: number,
  from: Pos,
  assault: GroupAssault | undefined,
  men: number,
): SpotChoice | null {
  let best: SpotChoice | null = null;
  let bestKey: [number, number, string] | null = null;
  for (const spot of w.walls.spots[fort] ?? []) {
    const there = w.b.fighters.filter(
      (f) => f.state === 'breach' && f.breachAt === spot.key,
    ).length;
    const cap = spot.maxMen ?? A.maxMen;
    if (there >= cap) continue;
    // hodiny s tolika muži, kolik se k místu vejde (u vrat klešťové brány `pincerGate.maxMen`)
    const workers = Math.min(men, cap);
    const started = w.b.breaches.find((x) => x.key === spot.key);
    let choice: SpotChoice | null = null;
    if (started) {
      if (started.phase !== 'done') {
        choice = {
          spot,
          step: null,
          hours: breachHoursLeft(started, Math.min(cap, Math.max(workers, there + 1))),
        };
      }
    } else {
      const fuelM = spot.steps.some((p) => p.method === 'burn')
        ? fuelDistanceM(w.field, spot.at)
        : Infinity;
      let steps = spot.steps.filter((p) => p.method !== 'burn' || Number.isFinite(fuelM));
      if (assault && steps.some((p) => p.method === assault)) {
        steps = steps.filter((p) => p.method === assault);
      }
      for (const step of steps) {
        const hours = assaultHours(step, workers, step.method === 'burn' ? fuelM : 0);
        if (!choice || hours < choice.hours) choice = { spot, step, hours };
      }
    }
    if (!choice) continue;
    const k: [number, number, string] = [choice.hours, dist2(from, spot.at), spot.key];
    if (
      bestKey === null ||
      k[0] < bestKey[0] ||
      (k[0] === bestKey[0] && (k[1] < bestKey[1] || (k[1] === bestKey[1] && k[2] < bestKey[2])))
    ) {
      best = choice;
      bestKey = k;
    }
  }
  return best;
}

/** Průchod opevněním pro NPC velitele: mezera, nebo místo a postup prolomení s hodinami. */
export interface FortPassage {
  fort: number;
  segment: number;
  /** Kde se stojí – vně před průchodem či místem prolomení. */
  at: Pos;
  method: 'open' | BreachMethod;
  /** Herní hodiny prolomení se `min(4, muži)` (rozdělaný průlom – zbývající); mezera 0. */
  hours: number;
}

/**
 * Průchody opevněním bojiště pro NPC velitele (`npc-assault.ts` – plán hradeb, Úloha 20): mezery
 * a průlomy boje (`openings`) a na každém opevnění nejrychlejší místo prolomení – stejné stěny
 * a volba jako v taktu (`wallsOf`, `chooseSpot` – i nejvýš `maxMen` u vrat klešťové brány); brány
 * zavřené – zavřou se, než k nim vojsko dojde. U klešťové brány stojí velitel před ústím uličky.
 * Stav ani bojiště nemění.
 */
export function fortPassages(
  field: BattleField,
  b: BattleState,
  from: Pos,
  men: number,
): FortPassage[] {
  // průlom uložený před Úlohou 14 – takt ho převede až po rozhodnutí velitele; stav se nemění
  if (b.breaches.some((x) => !(x as Partial<BattleBreach>).need)) {
    b = structuredClone(b);
    upgradeBreaches(b);
  }
  const forts = breachedForts(field, b);
  const closed = new Set<string>();
  // brány, které otevřeli obránci (útěk, probíjení), zůstanou otevřené
  const opened = new Set(b.openedGates ?? []);
  forts.forEach((bf, fi) => {
    for (const g of bf.fort.gates) {
      if (g.demolishedDay !== undefined) continue;
      if (!opened.has(`${fi}:${g.segment}`)) closed.add(`${fi}:${g.segment}`);
    }
  });
  const walls = wallsOf(forts, closed, field.day, moatFills(b));
  const out: FortPassage[] = [];
  forts.forEach((_, fi) => {
    for (const o of walls.openings[fi] ?? []) {
      out.push({ fort: fi, segment: o.segment, at: { ...o.out }, method: 'open', hours: 0 });
    }
    const c = chooseSpot({ field, walls, b }, fi, from, undefined, Math.min(A.maxMen, men));
    if (!c) return;
    const method = c.step
      ? (c.step.method as BreachMethod)
      : b.breaches.find((x) => x.key === c.spot.key)!.method;
    // vrata klešťové brány jsou na konci uličky – velitel stojí před jejím ústím, k vratům
    // dojdou muži v boji sami (ramena nepřelézají)
    const pincer =
      c.spot.spot === 'gate'
        ? battlePincers(forts[fi]!, field.day).find((p) => p.segment === c.spot.segment)
        : undefined;
    const at = pincer
      ? { x: pincer.mx + c.spot.out.x, z: pincer.mz + c.spot.out.z }
      : { ...c.spot.at };
    out.push({ fort: fi, segment: c.spot.segment, at, method, hours: c.hours });
  });
  return out;
}

/** Po kolika taktech v řadě bez pohybu muž bez vodítka hledá novou trasu (návrh Clauda). */
const STALL_TICKS = 8;
/** Objížďku k témuž cíli hledá muž nejvýš jednou za tolik taktů (návrh Clauda – výkon). */
const DETOUR_RETRY_TICKS = 20;

/**
 * Krok k `to` (`stepToward`); útočník počítá takty bez pohybu (`stall`) – jen bez vodítka a dál
 * než 1 m (u vodítka stojí schválně). Obránce nepočítá – u hradby stojí schválně a stav se nemění.
 */
function walk(f: Fighter, to: Pos, w: TickWorld, leash: Leash | null): void {
  const moved = stepToward(f, to, w.field, w.walls, leash);
  if (f.side !== 'attack') return;
  if (moved || leash !== null || dist2(f.pos, to) <= 1) delete f.stall;
  else f.stall = (f.stall ?? 0) + 1;
}

/**
 * Objížďka útočníka po mřížce boje (plán 2026-11-16-dense-forest – oprava Úlohy 5): když přímka
 * k cíli vede buňkou, kam boj nevstoupí (`paceAt` 0 – hustý les, voda, sráz, skála; stavby a stěny
 * ne – ty řeší boj sám), nebo když muž `force` (pojistka proti zastavení) – uloží si body trasy
 * `marchPath` po `field.grid` jako průchod opevněním a jde po nich. Skluz podél kraje (`alongEdge`)
 * od skvrny lesa nebo z ramene průseku, které vede od cíle, nepomohl – útočníci stáli u lesa
 * a nájezd neskončil. Hledá nejvýš jednou za `DETOUR_RETRY_TICKS`; bez trasy (cíl nedosažitelný)
 * nebo s přímou trasou false – jde přímo jako dřív. Obránce objížďky nehledá – průchody hradbou
 * nehledá a ke vsi to má blízko (návrh Clauda).
 */
function detour(
  f: Fighter,
  goal: Pos,
  key: string,
  w: TickWorld,
  leash: Leash | null,
  force: boolean,
): boolean {
  if (f.side !== 'attack') return false;
  const grid = w.field.grid;
  const fills = w.walls.fills;
  const open = (c: number): boolean => paceAt(grid, marchCellCenter(grid, c), fills) > 0;
  if (!force && lineClear(grid, f.pos, goal, open)) return false;
  if (f.detourTick !== undefined && w.b.ticks - f.detourTick < DETOUR_RETRY_TICKS) return false;
  f.detourTick = w.b.ticks;
  const path = marchPath(grid, f.pos, goal);
  if (!path || path.points.length <= 2) return false;
  f.route = path.points.slice(1, -1).map((p) => ({ x: p.x, z: p.z }));
  f.routeFor = key;
  walk(f, f.route[0]!, w, leash);
  return true;
}

/**
 * Jde k cíli `goal`. Útočník, kterému v cestě stojí stěna, jde průchodem (brána, mezera, průlom)
 * – body před ním a za ním; bez průchodu hradbu přeleze (plot, žebřík – `startCrossing`), je-li
 * to postup skupiny nebo nejrychlejší, jinak začne opevnění prolamovat. Hustý les, vodu, sráz
 * a skálu mezi sebou a cílem obejde po trase mřížky (`detour`); když se `STALL_TICKS` taktů nepohne,
 * hledá trasu znovu. Obránce průchody ani objížďky nehledá.
 */
function approach(f: Fighter, goal: Pos, key: string, w: TickWorld, leash: Leash | null): void {
  const stalled = (f.stall ?? 0) >= STALL_TICKS;
  if (stalled) {
    delete f.stall;
    f.route = [];
    f.routeFor = null;
  }
  if (f.routeFor === key && f.route.length > 0) {
    if (dist2(f.pos, f.route[0]!) <= 1) f.route.shift();
    // průchod se mezitím zavřel – cesta neplatí
    if (f.route.length > 0 && firstWall(f.pos, f.route[0]!, w.walls)) f.route = [];
    if (f.route.length > 0) {
      walk(f, f.route[0]!, w, leash);
      return;
    }
  }
  if (f.side === 'attack') {
    const wall = firstWall(f.pos, goal, w.walls);
    if (wall) {
      const route = openingRoute(f.pos, w.walls.openings[wall.fort] ?? []);
      if (route) {
        f.route = route;
        f.routeFor = key;
        stepToward(f, f.route[0]!, w.field, w.walls, leash);
        return;
      }
      const group = w.b.groups.find((g) => g.side === 'attack' && g.id === f.group);
      // nejrychlejší pro skupinu – s tolika muži, kolik jich ze skupiny bojuje (nejvýš 4 na místo)
      const mates = w.b.fighters.filter(
        (x) => x.side === 'attack' && x.group === f.group && inFight(x),
      ).length;
      const choice = chooseSpot(w, wall.fort, f.pos, group?.assault, Math.min(A.maxMen, mates));
      const breachHours = choice ? choice.hours : null;
      // rameno ani vrata klešťové brány se nepřelézají – žebřík jen přes hradbu na cestě
      const climb = wall.line.pincer ? firstWall(f.pos, goal, w.walls, true) : wall;
      if (
        climb &&
        startCrossing(f, climb.fort, climb.line.segment, group?.assault, breachHours, w.climb)
      ) {
        return;
      }
      if (choice) {
        let br = w.b.breaches.find((x) => x.key === choice.spot.key);
        if (!br) {
          br = openBreach(w, choice.spot, choice.step!);
          w.b.breaches.push(br);
        }
        f.state = 'breach';
        f.breachAt = br.key;
        f.aim = null;
        f.route = [];
        f.routeFor = null;
        stepToward(f, standOf(br), w.field, w.walls, null);
        return;
      }
    }
  }
  f.route = [];
  f.routeFor = null;
  if (detour(f, goal, key, w, leash, stalled)) return;
  walk(f, goal, w, leash);
}

/** Nejbližší průchod – nejdřív bod na mé straně, pak za ním; žádný null. */
function openingRoute(from: Pos, openings: readonly Opening[]): Pos[] | null {
  let route: Pos[] | null = null;
  let routeD = Infinity;
  for (const o of openings) {
    const outFirst = dist2(from, o.out) <= dist2(from, o.in);
    const d = dist2(from, outFirst ? o.out : o.in);
    if (d < routeD) {
      routeD = d;
      route = outFirst ? [{ ...o.out }, { ...o.in }] : [{ ...o.in }, { ...o.out }];
    }
  }
  return route;
}

/**
 * Útěk o krok (war.md – Bod zlomu). Obránce z opevnění (se stanovištěm) jde napřed nejbližší branou
 * či mezerou ven (body před a za průchodem); kdo průchod nemá nebo se k němu nedostane, je
 * odříznutý – vzdá se (poslední muž rodu se nevzdá, brání se dál). Kdo se nepohne nebo doběhl, je
 * pryč z bojiště.
 */
function fleeStep(f: Fighter, w: TickWorld): void {
  const to = f.fleeTo;
  if (to === null) {
    f.state = 'fled';
    return;
  }
  if (f.side === 'defend' && f.post !== undefined) {
    if (f.route.length > 0 && dist2(f.pos, f.route[0]!) <= 1) f.route.shift();
    if (f.route.length > 0 && firstWall(f.pos, f.route[0]!, w.walls)) f.route = [];
    if (f.route.length === 0) {
      const wall = firstWall(f.pos, to, w.walls);
      const route = wall ? openingRoute(f.pos, w.walls.openings[wall.fort] ?? []) : null;
      if (wall && !route) {
        cutOff(f);
        return;
      }
      if (route) f.route = route;
    }
    const routed = f.route.length > 0;
    const moved = stepToward(f, f.route[0] ?? to, w.field, w.walls, null);
    if (routed && !moved) cutOff(f);
    else if (!routed && (!moved || dist2(f.pos, to) <= 4)) f.state = 'fled';
    return;
  }
  const moved = stepToward(f, to, w.field, w.walls, null);
  if (!moved || dist2(f.pos, to) <= 4) f.state = 'fled';
}

/** Odříznutý obránce se vzdá; poslední muž rodu se nevzdá – brání se dál. */
function cutOff(f: Fighter): void {
  if (!f.lastLine) {
    surrender(f);
    return;
  }
  f.state = 'fight';
  f.fleeTo = null;
  f.route = [];
}

/**
 * Útočník jde do nedobytého útočiště (nejbližší střed): má-li opevnění průchod (brána otevřená
 * prchajícími, mezera, průlom), napřed k němu kolem hradby (`leadTo` – boj kolem hradby jinak
 * neobchází) a jím dovnitř; jinak přes hradbu nebo prolomením (`approach`).
 */
function enterRefuge(f: Fighter, w: TickWorld): void {
  f.aim = null;
  let fi = w.refuges[0]!;
  for (const x of w.refuges) {
    if (dist2(f.pos, w.forts[x]!.center) < dist2(f.pos, w.forts[fi]!.center)) fi = x;
  }
  const center = w.forts[fi]!.center;
  let exit: Opening | null = null;
  for (const o of w.walls.openings[fi] ?? []) {
    if (!exit || dist2(f.pos, o.out) < dist2(f.pos, exit.out)) exit = o;
  }
  const routed = f.routeFor === 'refuge' && f.route.length > 0;
  if (exit && !routed && dist2(f.pos, exit.out) > 4) {
    f.route = [];
    f.routeFor = null;
    stepToward(f, leadTo(w.field, f.pos, exit.out), w.field, w.walls, null);
    return;
  }
  approach(f, center, 'refuge', w, null);
}

/** Bojující muž: plán podle rozkazu (útočník) nebo postoje (obránce), pak krok k cíli. */
function fightStep(f: Fighter, w: TickWorld, ctx: PlanContext): void {
  const group = w.b.groups.find((g) => g.side === f.side && g.id === f.group);
  // nikdo už nebojuje, útočiště nedobyté – neřízený útočník jde dovnitř (útočiště je dobyté, až je
  // útočník uvnitř – fortifications.md, Bod zlomu a probíjení); skupina „držet místo“ stojí
  if (
    f.side === 'attack' &&
    !f.controlled &&
    w.refuges.length > 0 &&
    group?.order !== 'hold-place'
  ) {
    enterRefuge(f, w);
    return;
  }
  const plan: FighterPlan =
    f.side === 'attack' && group ? attackerPlan(f, group, ctx) : defenderPlan(f, ctx, w.wall);
  f.aim = plan.target?.id ?? null;
  if (plan.target) {
    if (strikeKind(f, plan.target, w) === null)
      approach(f, plan.target.pos, plan.target.id, w, plan.leash);
    return;
  }
  if (plan.moveTo) {
    approach(f, plan.moveTo, 'goal', w, plan.leash);
    if (f.controlled && f.goal && dist2(f.pos, f.goal) <= 1) f.goal = null;
  }
}

/** Prolamující jde k místu; když opevnění mezitím průchod má, vrátí se do boje. */
function breachStepOf(f: Fighter, w: TickWorld): void {
  const br = w.b.breaches.find((x) => x.key === f.breachAt);
  if (!br || br.phase === 'done' || (w.walls.openings[br.fort]?.length ?? 0) > 0) {
    f.state = 'fight';
    f.breachAt = null;
    return;
  }
  const stand = standOf(br);
  if (dist2(f.pos, stand) > AT_SPOT_M * AT_SPOT_M) stepToward(f, stand, w.field, w.walls, null);
}

/**
 * Práce na průlomech v taktu – nejvýš 4 muži na místo, hoří 2 přikládající (`advanceBreach`). Po
 * průlomu (či zasypání pro žebříky) se prolamující vrátí do boje. Kopáč podkopu po pětině práce je
 * pod zemí (`Fighter.underground`).
 */
function breachWorkStep(w: TickWorld): void {
  const near = (f: Fighter, p: Pos): boolean => dist2(f.pos, p) <= AT_SPOT_M * AT_SPOT_M;
  for (const br of w.b.breaches) {
    if (br.phase === 'done') continue;
    const stand = standOf(br);
    const men = w.b.fighters.filter(
      (f) => f.state === 'breach' && f.breachAt === br.key && near(f, stand),
    ).length;
    if (men === 0) continue;
    if (!advanceBreach(br, men, w.field.hoursPerTick)) continue;
    for (const f of w.b.fighters) {
      if (f.state === 'breach' && f.breachAt === br.key) {
        f.state = 'fight';
        f.breachAt = null;
      }
    }
  }
  for (const f of w.b.fighters) {
    const br = f.state === 'breach' ? w.b.breaches.find((x) => x.key === f.breachAt) : undefined;
    const before = br ? br.need.fill + br.need.fuel + br.need.burn : 0;
    const under =
      br !== undefined &&
      br.method === 'mine' &&
      br.phase === 'work' &&
      near(f, br.at) &&
      mineUnderground(br.progress.done - before, br.need.work);
    if (under) f.underground = true;
    else delete f.underground;
  }
}

/**
 * Zásah do muže (war.md – Na nule zdraví): poslední muž rodu doma neklesne pod 10 zdraví a uteče
 * (i řízený hráčem); jinak na nule padlý, nebo raněný – los 1 : 1, muž rodu raněný 2 ze 3.
 */
function takeHit(t: Fighter, damage: number, w: TickWorld, rng: Random): void {
  t.hits = (t.hits ?? 0) + 1;
  if (t.lastLine) {
    // Ú6.9: vzdání – poslední muž rodu doma se nevzdá; Ú6.11: nezajme se
    t.health = Math.max(WAR.lastLineManMinHealth, t.health - damage);
    if (t.health <= WAR.lastLineManMinHealth && inFight(t)) startFlee(t, w.field);
    return;
  }
  t.health -= damage;
  if (t.health > 0) return;
  t.health = 0;
  t.state = 'down';
  t.aim = null;
  t.breachAt = null;
  t.route = [];
  const killed = t.line ? 1 - WAR.downed.lineWoundedShare : WAR.downed.killedShare;
  t.killed = rng.next() < killed;
}

/**
 * Jeden takt boje (war.md – Boj). Mění `b` na místě (volající má kopii taktu). Pořadí: brány,
 * bod zlomu, pohyb mužů v pevném pořadí, práce na průlomech, rány (los, zda padne, v pořadí mužů –
 * zblízka 1 : 1, šíp podle `bowShot`; zásahy se sečtou a použijí až po všech ranách – kdo padne,
 * v tomto taktu ještě udeřil), výsledek.
 */
export function battleTick(b: BattleState, field: BattleField, rng: Random): void {
  if (b.outcome !== 'ongoing') return;
  b.ticks++;
  upgradeBreaches(b);
  const forts = breachedForts(field, b);
  closeGates(b, forts);
  // rozkaz hráče obránců „Probít se“, pak bod zlomu – před stěnami taktu: útěk a probíjení
  // otevřou brány (`rout.ts`)
  if (b.breakoutOrder) {
    const o = b.breakoutOrder;
    delete b.breakoutOrder;
    // hráč rozkáže sám – i hlídanou branou, kudy se dá nejlépe probít (`breakoutGate`)
    const gate = o.segment ?? breakoutGate(b, forts, o.fort, false);
    if (gate !== null) orderBreakout(b, field, forts, o.fort, gate);
  }
  breakpoints(b, field, forts);
  breakoutStep(b, forts);
  const walls = wallsOf(forts, new Set(b.closedGates), field.day, moatFills(b));
  const fighting = (f: Fighter): boolean =>
    f.side === 'defend' && (inFight(f) || f.state === 'flee');
  const w: TickWorld = {
    field,
    forts,
    walls,
    b,
    climb: {
      b,
      field,
      forts,
      walk: (f, to) => stepToward(f, to, field, walls, null),
      hasOpening: (fort) => (walls.openings[fort]?.length ?? 0) > 0,
      moatFilled: (fort, from) => filledNear(b, fort, from),
    },
    wall: {
      b,
      forts,
      day: field.day,
      strike: (f, t) => strikeKind(f, t, w),
      walled: (p, q) => firstWall(p, q, walls) !== null,
      exits: (fort) => walls.openings[fort] ?? [],
    },
    refuges: b.fighters.some(fighting) ? [] : untakenForts(b, forts),
  };
  settleLadders(b);
  const byId = new Map(b.fighters.map((f) => [f.id, f]));
  const houses = new Map<number, Pos[]>();
  for (const f of b.fighters) {
    if (f.side !== 'defend') continue;
    const list = houses.get(f.group) ?? [];
    if (!list.some((h) => h.x === f.home.x && h.z === f.home.z)) list.push(f.home);
    houses.set(f.group, list);
  }
  const towers = forts.some((bf) => battlePincers(bf, field.day).some((p) => p.tower));
  const towerSightM = FORTIFICATIONS.tower.sightM;
  // z koruny valu pod hradbou je vidět o kus dál (`crestAt`; Martin 9. 11. 2026)
  const crests = forts.some(
    (bf) => bf.fort.kind === 'rampart' || bf.fort.segments.some((s) => s.rampartOutside),
  );
  const crestSightM = WAR.sight.openM + FORTIFICATIONS.defense.crest.sightM;
  const sightFrom = (p: Pos): number | undefined =>
    towers && towerAt(forts, p, field.day)
      ? towerSightM
      : crests && crestAt(forts, p)
        ? crestSightM
        : undefined;
  const ctx: PlanContext = {
    fighters: b.fighters,
    byId,
    leader: battleLeader(b, byId),
    // z věže nad branou je vidět dál (`towerReach`)
    sees:
      towers || crests
        ? (p, q) => inSight(field.grid, p, q, sightFrom(p))
        : (p, q) => inSight(field.grid, p, q),
    houses: (g) => houses.get(g) ?? [],
    reaches: (p, q) => reachable(p, q, w),
  };
  for (const f of b.fighters) {
    if (f.cooldown > 0) f.cooldown--;
    restFatigue(f, b.ticks);
    const from = f.pos;
    switch (f.state) {
      case 'down':
      case 'fled':
        break;
      case 'flee':
        fleeStep(f, w);
        break;
      case 'breach':
        breachStepOf(f, w);
        break;
      case 'climb':
        climbStep(f, w.climb);
        break;
      case 'fight':
        fightStep(f, w, ctx);
        break;
    }
    if (f.pos !== from) rampartFatigueStep(f, from, field.grid, b.ticks);
  }
  breachWorkStep(w);
  const damage = new Map<string, number>();
  // zásahy taktu jen ostřelováním přes hradbu mimo místo útoku – do bodu zlomu se nepočítají
  const fireOnly = new Map<string, boolean>();
  const hitBy = (id: string, fire: boolean): void => {
    fireOnly.set(id, (fireOnly.get(id) ?? true) && fire);
  };
  for (const f of b.fighters) {
    if (f.cooldown > 0) continue;
    // lezec nahoře bojuje s obráncem, který ho nepustí (`aim`); jinak jen muž ve stavu `fight`
    if (f.state !== 'fight' && !(f.state === 'climb' && f.aim !== null)) continue;
    const t = f.aim === null ? undefined : byId.get(f.aim);
    const strike = t && canAttack(f, t, true) ? strikeOf(f, t, w) : null;
    const kind = strike?.kind ?? null;
    const strength = fighterStrength(f, b);
    if (f.side === 'defend') {
      // místo rány shodí žebřík (`ladders.ts`); prázdný, když nemá na koho udeřit
      const push = defendLadder(f, b, hitDamage(strength, false), kind === null, rng);
      if (push) {
        f.cooldown = MELEE_TICKS;
        if (push.fallen !== null) {
          damage.set(push.fallen, (damage.get(push.fallen) ?? 0) + push.damage);
          hitBy(push.fallen, false);
        }
        continue;
      }
    }
    if (!t || !strike || kind === null) continue;
    let hit: string | null;
    if (kind === 'bow' || kind === 'throw') {
      // přes hradbu zespodu kryje obránce na ochozu předprseň (`poseOf`); hod jako vesničan
      const pose = (x: Fighter): TargetPose => poseOf(x, field, b, strike.across);
      const skill = kind === 'throw' ? WAR.combat.aim.villagerSkill : undefined;
      // v kruhu jen vlastní – nestřílí a ránu si nechá na další takt
      const shot = bowShot(f, t, b.fighters, pose, rng, skill);
      if (!shot.fired) continue;
      f.cooldown = kind === 'throw' ? THROW_TICKS : BOW_TICKS;
      hit = shot.hit;
      // šíp přes hradbu na obránce opevnění – obránci mimo místo útoku se kryjí (kryt pod palbou)
      if (strike.across && f.side === 'attack' && t.side === 'defend' && t.post !== undefined) {
        b.underFire = { ...b.underFire, [fortOfPost(forts, t.post)]: b.ticks };
      }
    } else {
      f.cooldown = MELEE_TICKS;
      // lezec na žebříku neuhne – každá rána na něj padne
      hit = onLadder(t, b) || rng.next() < WAR.combat.hitChance ? t.id : null;
    }
    if (hit === null) continue;
    damage.set(hit, (damage.get(hit) ?? 0) + hitDamage(strength, kind !== 'melee'));
    const struck = byId.get(hit);
    hitBy(hit, kind !== 'melee' && strike.across && struck !== undefined && fromAfar(struck, w));
  }
  for (const t of b.fighters) {
    const d = damage.get(t.id);
    if (d === undefined || t.state === 'down') continue;
    takeHit(t, d, w, rng);
    // takeHit stav mění – kontrola po zásahu
    if ((t.state as FighterState) === 'down' && fireOnly.get(t.id) === true) t.shotDown = true;
  }
  settleLadders(b);
  // útočiště je dobyté, až útočník stojí uvnitř obvodu (Bod zlomu a probíjení)
  markTaken(b, forts);
  const attackers = b.fighters.some((f) => f.side === 'attack' && inFight(f));
  const defenders = b.fighters.some(fighting);
  if (!attackers) b.outcome = 'defenders';
  else if (!defenders && untakenForts(b, forts).length === 0) b.outcome = 'attackers';
}

/**
 * Je zásah šípem či hodem přes hradbu na `t` ostřelováním – obránce za hradbou, který nebrání místo
 * útoku (žebřík, průlom – `reinforceTarget`)? Takové ztráty bod zlomu nepočítá.
 */
function fromAfar(t: Fighter, w: TickWorld): boolean {
  return t.side === 'defend' && t.post !== undefined && reinforceTarget(t, w.wall) === null;
}

/** Hráčův pokyn veliteli v boji: jít na místo, nebo napadnout muže (`chosen`). */
export function commandFighter(
  b: BattleState,
  id: string,
  order: { goal?: Pos; strike?: string },
): void {
  const f = b.fighters.find((x) => x.id === id);
  if (!f || !f.controlled || !inFight(f)) return;
  if (order.goal) {
    f.goal = { x: order.goal.x, z: order.goal.z };
    f.chosen = null;
  }
  if (order.strike !== undefined) {
    const t = b.fighters.find((x) => x.id === order.strike);
    f.chosen = t && t.side !== f.side ? t.id : null;
  }
}

/**
 * Nedobytá útočiště bojiště (opevnění, pořadí na bojišti) – obránci za hradbou nebo lidé
 * v útočišti, útočník zatím uvnitř nestál (`rout.ts`). Stav nemění.
 */
export function untakenRefuges(field: BattleField, b: BattleState): number[] {
  return untakenForts(b, breachedForts(field, b));
}

/**
 * Rozkaz „Probít se“ obráncům opevnění `fort` (fortifications.md – Obrana bez násobku 3, Bod zlomu
 * a probíjení): branou na úseku `segment`, jinak tou s nejméně útočníky do 30 m – i hlídanou,
 * rozkaz dává hráč (`breakoutGate`). Mění `b`; vrací, zda rozkaz platí (před bodem zlomu, s branou
 * a s obránci na nohou).
 */
export function orderDefenderBreakout(
  b: BattleState,
  field: BattleField,
  fort: number,
  segment?: number,
): boolean {
  const forts = breachedForts(field, b);
  const gate = segment ?? breakoutGate(b, forts, fort, false);
  return gate !== null && orderBreakout(b, field, forts, fort, gate);
}
