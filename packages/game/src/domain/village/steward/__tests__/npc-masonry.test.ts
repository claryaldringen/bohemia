import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  SURFACE_CODES,
  tileCenterWorld,
} from '../../../landscape';
import { createRandom, deriveSeed } from '../../../landscape/random';
import { foundVillage } from '../../core/actions';
import { advanceVillage } from '../../core/simulate';
import { CHURCH, LODGE, MASON_CRAFTS } from '../../rules';
import { STEWARD } from '../../rules/rules-steward';
import { CHURCH_EAST_ROTATION } from '../../buildings/church-build';
import { churchCapacity, churchTypesFor } from '../../buildings/church-geometry';
import { checkChurchPlacement } from '../../placement/placement-church';
import { placementVillageOf } from '../../placement/placement-village';
import { quarryNear } from '../../fortification/state/stone';
import { checkQuarryPlacement } from '../../fortification/state/quarry';
import { STONE } from '../../rules/rules-stone';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import { newSteward } from '../steward-state';
import { planCentre } from '../steward-land';
import { npcMasonryDay } from '../npc-masonry';
import type { Church, MasonCraft, MasonryCircle, Person, VillageState } from '../../types';

// Kamenné zdivo NPC rodu (churches.md – Stavba, stone-masonry.md – Kdo zve; návrh Clauda
// 12. 11. 2026): ves řízená NPC rodem pozve huť sama, postaví lom a kostel malého typu okruhu.

const YEAR = 365;
const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
const obstacles = obstaclesOf(landscape);
const DAY =
  Math.ceil(dayIndexOf({ year: 800, month: 3, day: 1 }) / STEWARD.everyDays) * STEWARD.everyDays;
const HOUSE = 'npc-house';

/** Ves u místa krajiny 1 s `count` lidmi (dospělí muži navíc), bohatými zásobami a mistry `crafts`. */
function village(count: number, crafts: readonly MasonCraft[] = []): VillageState {
  const site = landscape.villageSite;
  const c = tileCenterWorld(landscape, site.x, site.y);
  const base = withBuiltFirstDwelling(
    foundVillage({ seed: 4242, day: DAY, dwellingPosition: { x: c.x, z: c.z, rotation: 0 } }),
  );
  const home = base.dwellings[0]!.id;
  let id = base.nextId;
  const person = (extra: Partial<Person>): Person => ({
    id: id++,
    bornDay: DAY - 30 * YEAR,
    dwellingId: home,
    sex: 'male',
    faith: 'christian',
    ...extra,
  });
  const masters = crafts.map((mason) => person({ mason }));
  const extra = Math.max(0, count - base.people.length - masters.length);
  const helpers = Array.from({ length: extra }, () => person({}));
  return {
    ...base,
    nextId: id,
    people: [...base.people, ...masters, ...helpers],
    storesKg: base.storesKg + 200000,
    meatKg: 20000,
    legumesKg: 20000,
  };
}

/** Ves řízená pokřtěným NPC rodem. */
function npc(state: VillageState): VillageState {
  return {
    ...state,
    nobles: { houseId: HOUSE, headId: state.people[0]!.id },
    faith: { ...state.faith, nobles: { houseId: HOUSE, baptizedDay: DAY - YEAR } },
  };
}

/** Ves s hutí okruhu `circle` a dostavěným lomem u nejbližšího výchozu. */
function withLodgeAndQuarry(
  state: VillageState,
  circle: MasonryCircle = 'carolingian',
): VillageState {
  const centre = planCentre(state)!;
  const q = quarryNear(obstacles, centre)!;
  return {
    ...state,
    lodge: { circle, invitedDay: DAY - 90 },
    quarries: [{ outcropId: 1, x: q.x, z: q.z, rotation: 0, builtDay: DAY - 30 }],
  };
}

const sites = (s: VillageState): VillageState['constructions'] =>
  s.constructions.filter((c) => c.kind === 'church');

function run(state: VillageState, day = DAY): VillageState {
  const s = structuredClone(state);
  s.lastDay = day;
  npcMasonryDay(s, day, landscape, obstacles);
  return s;
}

describe('huť NPC rodu', () => {
  it('pokřtěný NPC rod s 30 lidmi pozve huť okruhu podle losu ze seedu vsi', () => {
    const s = run(npc(village(LODGE.npcMinPeople)));
    const draw = createRandom(deriveSeed(4242, 'npc-lodge')).next();
    expect(s.lodge?.circle).toBe(draw < 0.5 ? 'adriatic' : 'carolingian');
    expect(s.lodge?.invitedDay).toBe(DAY);
    expect(s.lodge?.arriving).toHaveLength(MASON_CRAFTS.length);
  });

  it('menší ves, nepokřtěný rod ani mimo den správce huť nezve', () => {
    expect(run(npc(village(LODGE.npcMinPeople - 1))).lodge).toBeUndefined();
    const pagan = npc(village(LODGE.npcMinPeople));
    delete pagan.faith!.nobles;
    expect(run(pagan).lodge).toBeUndefined();
    expect(run(npc(village(LODGE.npcMinPeople)), DAY + 1).lodge).toBeUndefined();
  });

  it('hráčův správce (ves bez NPC rodu) huť nezve ani kostel nestaví', () => {
    const base = village(40, MASON_CRAFTS);
    const own: VillageState = {
      ...withLodgeAndQuarry(base),
      faith: { ...base.faith, rodBaptizedDay: DAY - YEAR },
      steward: newSteward(DAY - YEAR, true),
    };
    // krok NPC rodu ves hráče nemění vůbec
    expect(run(own)).toEqual({ ...structuredClone(own), lastDay: DAY });
    const noLodge: VillageState = { ...own, lodge: undefined, quarries: undefined };
    delete noLodge.lodge;
    delete noLodge.quarries;
    const after = advanceVillage(noLodge, DAY + 2 * STEWARD.everyDays, obstacles, landscape);
    expect(after.lodge).toBeUndefined();
    expect(after.constructions.some((c) => c.kind === 'quarry' || c.kind === 'church')).toBe(false);
  });

  it('chybějícího mistra pozve znovu', () => {
    const s = run(withLodgeAndQuarry(npc(village(40, ['builder', 'mason']))));
    const roles = (s.lodge?.arriving ?? []).map((a) => a.role).sort();
    expect(roles).toEqual(['limeBurner', 'plasterer', 'stonemason']);
    expect(sites(s)).toHaveLength(0);
  });
});

describe('lom NPC rodu', () => {
  it('ves s hutí bez lomu založí plochu lomu u výchozu nejblíž středu vsi podle pravidel hráče', () => {
    const base = npc(village(40));
    const withLodge: VillageState = {
      ...base,
      lodge: { circle: 'adriatic', invitedDay: DAY - 10 },
    };
    const s = run(withLodge);
    const quarry = s.constructions.find((c) => c.kind === 'quarry')!;
    const near = quarryNear(obstacles, planCentre(base)!)!;
    const position = quarry.position!;
    // plocha vedle skal (Lom jako plocha u skal) – projde kontrolou hráče, do 50 m od okraje
    const check = checkQuarryPlacement(
      landscape,
      placementVillageOf(withLodge, DAY),
      position,
      obstacles,
    );
    expect(check.ok).toBe(true);
    expect(quarry.quarryOutcrop).toBe(check.outcrop!.id);
    expect(check.outcrop!.edgeM).toBeLessThanOrEqual(STONE.quarryArea.rockReachM);
    expect(quarry.quarryRock).toEqual(check.rock);
    expect(Math.hypot(position.x - near.x, position.z - near.z)).toBeLessThanOrEqual(
      STONE.quarryArea.rockReachM + 10,
    );
    // rozestavěný lom – druhý nezakládá
    const again = run(s, DAY + STEWARD.everyDays);
    expect(again.constructions.filter((c) => c.kind === 'quarry')).toHaveLength(1);
  });

  it('bez huti lom nestaví', () => {
    const base = npc(village(LODGE.npcMinPeople - 1));
    expect(run(base).constructions.some((c) => c.kind === 'quarry')).toBe(false);
  });
});

describe('kostel NPC rodu', () => {
  it('se všemi mistry postaví kostel malého typu na kapacitu lidé × 1,2, kněžištěm na východ', () => {
    const base = withLodgeAndQuarry(npc(village(40, MASON_CRAFTS)));
    const s = run(base);
    const [site] = sites(s);
    expect(site?.church?.type).toBe(churchTypesFor('carolingian')[0]);
    const { type, dims } = site!.church!;
    expect(churchCapacity(type, dims)).toBeGreaterThanOrEqual(Math.ceil(40 * 1.2));
    expect(dims.kind === 'long' && dims.width).toBe(5);
    expect(site!.position?.rotation).toBe(CHURCH_EAST_ROTATION);
    const check = checkChurchPlacement(
      landscape,
      placementVillageOf(base, DAY),
      type,
      dims,
      site!.position!,
      obstacles,
    );
    expect(check.ok).toBe(true);
    // staveniště stojí – druhý kostel ne
    expect(sites(run(s, DAY + STEWARD.everyDays))).toHaveLength(1);
  });

  it('adriatický okruh staví jednolodní kostel s pravoúhlým kněžištěm', () => {
    const s = run(withLodgeAndQuarry(npc(village(40, MASON_CRAFTS)), 'adriatic'));
    expect(sites(s)[0]?.church?.type).toBe('chancel');
  });

  it('bez všech mistrů ani bez lomu kostel nestaví', () => {
    const crafts = MASON_CRAFTS.filter((c) => c !== 'plasterer');
    expect(sites(run(withLodgeAndQuarry(npc(village(40, crafts)))))).toHaveLength(0);
    const noQuarry = withLodgeAndQuarry(npc(village(40, MASON_CRAFTS)));
    delete noQuarry.quarries;
    expect(sites(run(noQuarry))).toHaveLength(0);
  });

  it('další kostel jen při pokrytí pod 0,5', () => {
    const base = withLodgeAndQuarry(npc(village(40, MASON_CRAFTS)));
    const priest = base.people[base.people.length - 1]!;
    const church = (diameter: number): Church => ({
      id: 999,
      type: 'rotunda',
      dims: { kind: 'round', diameter, height: 6 },
      position: { x: 5000, z: 5000, rotation: 0 },
      finishedDay: DAY - YEAR,
      priestId: priest.id,
      graves: [],
    });
    // rotunda Ø 6,5 m pojme 44 lidí – pokrytí 1
    expect(sites(run({ ...base, churches: [church(6.5)] }))).toHaveLength(0);
    // Ø 4 m – 16 lidí z 40, pokrytí 0,4
    expect(sites(run({ ...base, churches: [church(4)] }))).toHaveLength(1);
  });

  it('místo se nenajde – zkusí to znovu za rok', () => {
    const base = withLodgeAndQuarry(npc(village(40, MASON_CRAFTS)));
    // samý les – žádné louky blízko středu vsi, kam by kostel šel
    const forest = {
      ...landscape,
      surface: new Uint8Array(landscape.surface.length).fill(SURFACE_CODES.forest),
    };
    const s = structuredClone(base);
    s.lastDay = DAY;
    npcMasonryDay(s, DAY, forest, obstacles);
    expect(sites(s)).toHaveLength(0);
    expect(s.lodge?.npcRetryDay).toBe(DAY + CHURCH.npc.retryDays);
    // před uplynutím roku nehledá (ani se zdravou krajinou)
    expect(sites(run(s, DAY + STEWARD.everyDays))).toHaveLength(0);
    const later = Math.ceil((DAY + CHURCH.npc.retryDays) / STEWARD.everyDays) * STEWARD.everyDays;
    expect(sites(run(s, later - STEWARD.everyDays))).toHaveLength(0);
    expect(sites(run(s, later))).toHaveLength(1);
  });
});

describe('determinismus', () => {
  it('dopočet NPC vsi vcelku = po kouscích', () => {
    const start = npc(village(LODGE.npcMinPeople + 2));
    const to = DAY + 120;
    const whole = advanceVillage(start, to, obstacles, landscape);
    let parts = start;
    for (let d = DAY + 7; d < to; d += 7) parts = advanceVillage(parts, d, obstacles, landscape);
    parts = advanceVillage(parts, to, obstacles, landscape);
    expect(whole.lodge).toBeDefined();
    // lom (≈ 20 čd) stihne i dostavět
    const quarry = whole.constructions.some((c) => c.kind === 'quarry');
    expect(quarry || (whole.quarries ?? []).length > 0).toBe(true);
    expect(parts).toEqual(whole);
  });

  it('staveniště kostela NPC vsi vcelku = po kouscích', () => {
    const start = withLodgeAndQuarry(npc(village(40, MASON_CRAFTS)));
    const to = DAY + 60;
    const whole = advanceVillage(start, to, obstacles, landscape);
    let parts = start;
    for (let d = DAY + 3; d < to; d += 3) parts = advanceVillage(parts, d, obstacles, landscape);
    parts = advanceVillage(parts, to, obstacles, landscape);
    expect(sites(whole)).toHaveLength(1);
    expect(parts).toEqual(whole);
  });
});
