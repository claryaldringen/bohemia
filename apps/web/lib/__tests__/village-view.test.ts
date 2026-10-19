import { describe, expect, it } from 'vitest';
import {
  ROAD_TREE_ID_BASE,
  advanceVillage,
  obstacleChangesAt,
  startRoadApples,
  startRoadUpgrade,
  checkDwellingPlacement,
  dayIndexOf,
  fieldPartsFromCells,
  foundCemetery,
  foundOrchard,
  foundVillage,
  generateLandscape,
  groveAgeYears,
  oakAgeHappiness,
  obstaclesOf,
  placementVillageOf,
  reservedTrees,
  sacredOakLife,
  sacredOakNow,
  sacredSitesOf,
  neighbourSnapshot,
  startRelocation,
  surfaceAt,
  tileCenterWorld,
  villageDwellingPositions,
  type ChronicleEvent,
  type LandTaker,
  type Landscape,
  type PartInput,
  type VillageRecord,
  type VillageState,
} from '@bohemia/game';
import {
  CHRONICLE_LENGTH,
  buildVillageView,
  chronicleText,
  placementVillageFromScene,
  sceneRoadApples,
  type VillageView,
} from '../village-view';

const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const SIZE = 16;
const landscape: Landscape = {
  size: SIZE,
  cellSizeM: 15,
  heights: new Float32Array(SIZE * SIZE),
  surface: new Uint8Array(SIZE * SIZE).fill(2),
  fertility: new Uint8Array(SIZE * SIZE).fill(50),
  villageSite: { x: 8, y: 8 },
  stream: [],
  obstacleLayer: null,
};
const parts: PartInput[] = [0, 1, 2, 3, 4].map((i) => ({
  areaM2: 225,
  distanceM: 50,
  naturalFertility: 50,
  surface: 'meadow',
  obstacleCost: 0,
  cell: { x: 8 + i, y: 8 },
}));
const state = (): VillageState =>
  foundVillage({
    seed: 5,
    day: DAY,
    dwellingPosition: { x: -50, z: -50, rotation: 0.5 },
    firstField: { parts },
  });
/** Ves s dostavěnou první zemnicí (id domácnosti zakladatelů) – jako starší uložené vsi. */
const settled = (): VillageState => {
  const s = state();
  const site = s.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId !== null)!;
  s.constructions = s.constructions.filter((c) => c !== site);
  s.dwellings.push({
    id: site.dwellingId!,
    type: 'zemnice',
    builtDay: DAY,
    condition: 1,
    position: site.position!,
  });
  return s;
};
const record = (s: VillageState = state()): VillageRecord => ({
  id: 'v-1',
  settlementId: 's-1',
  name: 'Libice',
  state: s,
  version: 1,
});

describe('buildVillageView – práce vsi pro postavy', () => {
  it('čerstvá ves ještě rozdělení práce nemá – ve scéně nikdo', () => {
    const view = buildVillageView(record(), landscape, DAY);
    expect(view.scene.labor).toBeUndefined();
  });

  it('po dopočtu dne: člověkodny po místech na setiny, lidé podle věku a měsíc', () => {
    const s = advanceVillage(state(), DAY + 1, null);
    const view = buildVillageView(record(s), landscape, DAY + 1);
    const labor = view.scene.labor!;
    expect(labor).toMatchObject({ day: DAY + 1, month: 4, people: view.people });
    expect(labor.shares.length).toBeGreaterThan(0);
    for (const share of labor.shares) {
      expect(share.manDays).toBeGreaterThan(0);
      expect(Math.round(share.manDays * 100)).toBeCloseTo(share.manDays * 100, 6);
    }
    const domestic = labor.shares.find((x) => x.activity === 'domestic');
    expect(domestic?.target).toEqual({ kind: 'village' });
  });
});

describe('buildVillageView – zarůstání (fields.md)', () => {
  it('díly přílohu: roky bez pastvy, kde se pase, zarůstající plocha; les vsi se stromy', () => {
    const s = settled();
    s.constructions = s.constructions.filter((c) => c.kind !== 'field');
    s.parts.forEach((p, i) => {
      p.foundingDone = p.foundingCost;
      p.state = 'fallow';
      p.fallowSinceDay = DAY - 10 * 365;
      p.distanceM = 50 + i;
      p.areaM2 = 1000;
      if (i === 3) p.overgrowthYears = 2;
      if (i === 4) p.overgrowthYears = 7;
    });
    // jedna ovce spase 0,2 ha – dva nejbližší díly po 0,1 ha
    s.livestock = {
      herds: { sheep: 0, goat: 0, pig: 0, cow: 0 },
      young: { sheep: 0, goat: 0, pig: 0, cow: 0 },
    };
    s.livestock.herds.sheep = 1;
    const center = tileCenterWorld(landscape, 3, 3);
    s.woods = [
      {
        cell: { x: 3, y: 3 },
        x: center.x,
        z: center.z,
        areaM2: 225,
        surface: 'meadow',
        day: DAY - 400,
      },
    ];
    const view = buildVillageView(record(s), landscape, DAY);
    const scene = view.scene.fields[0]!.parts;
    expect(scene.map((p) => p.stage)).toEqual(['meadow', 'meadow', 'meadow', 'meadow', 'shrubs']);
    expect(scene.map((p) => p.overgrowth)).toEqual([undefined, undefined, undefined, 2, 7]);
    // křoviny se nepasou
    expect(scene.map((p) => p.grazed)).toEqual([true, true, false, false, undefined]);
    expect(scene[4]!.look).toBe('shrubs');
    expect(view.fields[0]!.overgrowingM2).toBe(2000);
    expect(view.fields[0]!.stages).toEqual({ meadow: 4, shrubs: 1 });
    expect(view.scene.woods).toEqual([
      { cell: { x: 3, y: 3 }, x: center.x, z: center.z, size: 15, surface: 'meadow', age: 31 },
    ]);
    const woodTrees = (view.scene.obstacles?.added ?? []).filter((o) => o.id >= 2 ** 31);
    expect(woodTrees).toHaveLength(5);
    expect(placementVillageFromScene(view.scene).woods).toEqual([{ cell: { x: 3, y: 3 } }]);
  });
});

describe('buildVillageView', () => {
  it('pole: oseté díly podle plodiny – ozim, jař (díl bez plodiny je jař)', () => {
    const s = settled();
    s.parts.forEach((p, i) => {
      p.foundingDone = p.foundingCost;
      p.state = 'sown';
      if (i < 3) p.crop = 'winter';
      else if (i === 3) p.crop = 'spring';
    });
    s.constructions = s.constructions.filter((c) => c.kind !== 'field');
    expect(buildVillageView(record(s), landscape, DAY).fields[0]?.crops).toEqual({
      winter: 3,
      spring: 2,
    });
  });

  it('čerstvá ves: lidé, zásoby, stavba zemnice zakladatelů a pole', () => {
    const free = (
      laborManDays: number,
      unit: { perHa?: boolean; perSquare?: boolean },
    ): Record<string, unknown> => ({
      laborManDays,
      perHa: unit.perHa ?? false,
      perSquare: unit.perSquare ?? false,
      upfront: [],
      blocked: null,
      affordable: true,
    });
    const view = buildVillageView(record(), landscape, DAY);
    expect(view).toMatchObject({
      name: 'Libice',
      dayIndex: DAY,
      people: { children: 2, adults: 2, elders: 0 },
      fullHousehold: false,
    });
    // obydlí nemá kdo osídlit (zakladatelé si staví vlastní zemnici) ani z čeho ho postavit
    // (krajina testu nemá stromy, klády nejsou) – pole a hřbitov jdou
    const noSettlers = { resource: 'settlers', amount: 1, missing: 1 };
    expect(view.build).toEqual({
      zemnice: {
        laborManDays: 60,
        perHa: false,
        perSquare: false,
        upfront: [{ resource: 'wood', amount: 7, missing: 7 }, noSettlers],
        blocked: null,
        affordable: false,
      },
      polozemnice: {
        laborManDays: 220,
        perHa: false,
        perSquare: false,
        upfront: [{ resource: 'wood', amount: 18, missing: 18 }, noSettlers],
        blocked: null,
        affordable: false,
      },
      field: free(100, { perHa: true }),
      cemetery: free(10, { perSquare: true }),
      orchard: free(80, { perHa: true }),
      // modla a svatyně chtějí dospělé duby – krajina testu stromy nemá (happiness.md)
      idol: {
        laborManDays: 30,
        perHa: false,
        perSquare: false,
        upfront: [{ resource: 'oaks', amount: 1, missing: 1 }],
        blocked: null,
        affordable: false,
      },
      shrine: {
        laborManDays: 400,
        perHa: false,
        perSquare: false,
        upfront: [{ resource: 'oaks', amount: 3, missing: 3 }],
        blocked: null,
        affordable: false,
      },
      // řemeslné dílny – obydlí + 30 % práce i dřeva, mladý pár k osídlení (crafts.md)
      potter: {
        laborManDays: 286,
        perHa: false,
        perSquare: false,
        upfront: [{ resource: 'wood', amount: 23, missing: 23 }, noSettlers],
        blocked: null,
        affordable: false,
      },
      smith: {
        laborManDays: 286,
        perHa: false,
        perSquare: false,
        upfront: [{ resource: 'wood', amount: 23, missing: 23 }, noSettlers],
        blocked: null,
        affordable: false,
      },
      burner: {
        laborManDays: 78,
        perHa: false,
        perSquare: false,
        upfront: [{ resource: 'wood', amount: 9, missing: 9 }, noSettlers],
        blocked: null,
        affordable: false,
      },
      // ohrada s přístřeškem (oxen.md) – 40 čd a 6 stromů předem, osadníci ne
      pen: {
        laborManDays: 40,
        perHa: false,
        perSquare: false,
        upfront: [{ resource: 'wood', amount: 6, missing: 6 }],
        blocked: null,
        affordable: false,
      },
    });
    // zakladatelé bydlí na staveništi – domácnost s obydlím přibude s dostavěním zemnice
    expect(view.households).toEqual([]);
    expect(view.storesMonths).toBeCloseTo(18, 0);
    const fieldId = view.fields[0]?.id;
    expect(view.constructions).toEqual([
      {
        id: expect.any(Number),
        kind: 'dwelling',
        label: 'Zemnice',
        progress: 0,
        dwellingType: 'zemnice',
        craft: null,
        dwellingId: null,
        relocates: null,
        fieldId: null,
        cemeteryId: null,
        orchardId: null,
        treesToFell: 7,
      },
      {
        id: expect.any(Number),
        kind: 'field',
        label: 'Pole 0,11 ha',
        progress: 0,
        dwellingType: null,
        craft: null,
        dwellingId: null,
        relocates: null,
        fieldId,
        cemeteryId: null,
        orchardId: null,
        treesToFell: 0,
      },
    ]);
    expect(view.woodLogs).toBe(0);
    expect(view.fields).toEqual([
      {
        id: fieldId,
        areaM2: 5 * 225,
        fertility: 50,
        stages: { founding: 5 },
        surfaces: { meadow: 5 },
        crops: {},
        ashParts: 0,
        ashBonus: 0,
        overgrowingM2: 0,
      },
    ]);
    expect(view.hungry).toBe(false);
    expect(view.constructionsStalled).toBe(false);
  });

  it('plná domácnost se 4 dospělými dá lidi k osídlení – obydlí jde stavět', () => {
    const s = settled();
    for (const [i, years] of [20, 19].entries()) {
      s.people.push({ id: 90 + i, bornDay: DAY - Math.ceil(years * 365.25), dwellingId: 1 });
    }
    s.people.forEach((p) => (p.bornDay = Math.min(p.bornDay, DAY - Math.ceil(16 * 365.25))));
    s.lastDay = DAY;
    s.woodLogs = 20.3;
    const view = buildVillageView(record(s), landscape, DAY);
    expect(view.build.polozemnice).toEqual({
      laborManDays: 220,
      perHa: false,
      perSquare: false,
      upfront: [
        { resource: 'wood', amount: 18, missing: 0 },
        { resource: 'settlers', amount: 1, missing: 0 },
      ],
      blocked: null,
      affordable: true,
    });
    expect(view.fullHousehold).toBe(true);
    expect(view.woodLogs).toBe(20);
    expect(view.scene.woodLogs).toBe(20);
    // bez klád (a bez stromů v krajině) chybí dřevo
    s.woodLogs = 5;
    const short = buildVillageView(record(s), landscape, DAY).build.zemnice;
    expect(short.affordable).toBe(false);
    expect(short.upfront[0]).toEqual({ resource: 'wood', amount: 7, missing: 2 });
  });

  it('s dostavěnou zemnicí: domácnost s věky obyvatel', () => {
    const view = buildVillageView(record(settled()), landscape, DAY);
    expect(view.households).toEqual([
      {
        dwellingId: 1,
        type: 'zemnice',
        craft: null,
        occupants: 4,
        // zakladatelé: manželé 25 let, chlapec 13 a dívka 12 (kinship.md)
        family: { men: 1, women: 1, boys: 1, girls: 1, elderMen: 0, elderWomen: 0, couples: 1 },
        capacity: 6,
        full: false,
        overcrowded: false,
        condition: 1,
        ages: [25, 25, 13, 12],
        ageYears: 0,
        relocation: null,
        relocationBlock: null,
      },
    ]);
  });

  it('scéna: zemnice zakladatelů je do dostavění staveniště', () => {
    const s = state();
    const site = s.constructions[0]!;
    // bez vrstvy překážek kácí zemnice 7 stromů bez polohy (14 čd), pak staví (46 čd) – scéna
    // ukazuje jen stavbu
    expect(site.cost).toBe(60);
    site.done = 14 + 11.5;
    const { scene } = buildVillageView(record(s), landscape, DAY);
    expect(scene.dwellings).toEqual([
      {
        id: site.id,
        type: 'zemnice',
        position: { x: -50, z: -50, rotation: 0.5 },
        built: false,
        progress: 0.25,
        // od zahájení stavby se vyšlapávají pěšiny (paths.md)
        since: site.startedDay,
      },
    ]);
  });

  it('hlad a stojící stavby přejdou ze souhrnu vsi', () => {
    const s = state();
    s.hungry = true;
    s.commonLaborHistory = [0, 0, 0];
    const view = buildVillageView(record(s), landscape, DAY);
    expect(view.hungry).toBe(true);
    expect(view.constructionsStalled).toBe(true);
  });

  it('scéna: přestavba polozemnice na novém pozemku je staveniště tam, starý dům stojí dál', () => {
    const s = settled();
    const home = s.dwellings[0]!;
    home.type = 'polozemnice';
    s.constructions.push({
      id: 98,
      kind: 'rebuild',
      startedDay: DAY,
      cost: 220,
      done: 10,
      dwellingType: 'polozemnice',
      position: { x: 7.5, z: 7.5, rotation: Math.PI },
      plot: { cell: { x: 8, y: 8 }, variant: 'center' },
      dwellingId: home.id,
      fieldId: null,
    });
    const { scene } = buildVillageView(record(s), landscape, DAY);
    expect(scene.dwellings.find((d) => d.id === home.id)?.built).toBe(true);
    const site = scene.dwellings.find((d) => d.id === 98)!;
    expect(site.built).toBe(false);
    expect(site.plot?.cell).toEqual({ x: 8, y: 8 });
    expect(site.position).toEqual({ x: 7.5, z: 7.5, rotation: Math.PI });
    // přestavba na místě staveniště nemá
    s.constructions = s.constructions.filter((c) => c.id !== 98);
    s.constructions.push({
      id: 97,
      kind: 'rebuild',
      startedDay: DAY,
      cost: 220,
      done: 10,
      dwellingType: 'polozemnice',
      position: null,
      dwellingId: home.id,
      fieldId: null,
    });
    const inPlace = buildVillageView(record(s), landscape, DAY).scene;
    expect(inPlace.dwellings.some((d) => d.id === 97)).toBe(false);
  });

  it('scéna: obydlí bez obyvatel není obývané', () => {
    const s = settled();
    s.people = [];
    const { scene } = buildVillageView(record(s), landscape, DAY);
    expect(scene.dwellings[0]?.inhabited).toBe(false);
  });

  it('scéna: stav chátrajícího obydlí a zbytky jam po zaniklých obydlích (jak zarostly)', () => {
    const s = settled();
    s.dwellings[0]!.condition = 0.4321;
    const plot = { cell: { x: 9, y: 9 }, variant: 'center' as const };
    s.ruins = [
      { id: 7, type: 'polozemnice', position: { x: 10, z: 20, rotation: 0 }, plot, day: DAY - 365 },
    ];
    const { scene } = buildVillageView(record(s), landscape, DAY);
    expect(scene.dwellings[0]?.condition).toBe(0.432);
    const center = tileCenterWorld(landscape, 9, 9);
    expect(scene.ruins).toEqual([
      {
        id: 7,
        type: 'polozemnice',
        position: { x: 10, z: 20, rotation: 0 },
        since: DAY - 365,
        overgrowth: 0.1,
        plot: { cell: { x: 9, y: 9 }, x: center.x, z: center.z, size: 15, variant: 'center' },
      },
    ]);
    // celé obydlí stav neposílá, ves bez zbytků jam je nemá
    const plain = buildVillageView(record(settled()), landscape, DAY).scene;
    expect(plain.dwellings[0]).not.toHaveProperty('condition');
    expect(plain).not.toHaveProperty('ruins');
  });

  it('scéna: obydlí, díly pole ve středech políček a rozestavěné obydlí', () => {
    const s = settled();
    // stavba obydlí rovnou do stavu – pravidla odemčení tu netestujeme
    s.constructions.push({
      id: 99,
      kind: 'dwelling',
      startedDay: DAY,
      cost: 220,
      done: 55,
      dwellingType: 'polozemnice',
      position: { x: 30, z: 40, rotation: 0 },
      dwellingId: null,
      fieldId: null,
    });
    const { scene, constructions } = buildVillageView(record(s), landscape, DAY);
    expect(scene.dwellings).toEqual([
      {
        id: 1,
        type: 'zemnice',
        position: { x: -50, z: -50, rotation: 0.5 },
        built: true,
        progress: 1,
        inhabited: true,
        since: s.dwellings[0]!.builtDay,
      },
      {
        id: 99,
        type: 'polozemnice',
        position: { x: 30, z: 40, rotation: 0 },
        built: false,
        progress: 0.25,
        since: DAY,
      },
    ]);
    expect(constructions.find((c) => c.id === 99)).toEqual({
      id: 99,
      kind: 'dwelling',
      label: 'Polozemnice',
      progress: 0.25,
      dwellingType: 'polozemnice',
      craft: null,
      dwellingId: null,
      relocates: null,
      fieldId: null,
      cemeteryId: null,
      orchardId: null,
      treesToFell: 0,
    });
    expect(scene.fields).toHaveLength(1);
    const ids = s.parts.map((p) => p.id);
    expect(scene.fields[0]?.parts).toEqual([
      // zakládané díly: rozrytý drn, s 0 jen vytyčené (kolíky)
      ...[0, 1, 2, 3, 4].map((i) => ({
        id: ids[i],
        cell: { x: 8 + i, y: 8 },
        x: 7.5 + 15 * i,
        z: 7.5,
        size: 15,
        stage: 'founding',
        look: 'bare',
        work: 0,
      })),
    ]);
  });

  it('osetá pole po čtvercích: vzhled, rozpracovaný díl a rozdělení práce na dílech čela', () => {
    // ves s 5 díly dopočtená do podzimního kopání ozimu (1. 9. 504 – plán s ozimem)
    const day = dayIndexOf({ year: 504, month: 9, day: 3 });
    const s = advanceVillage(settled(), day, null);
    const scene = buildVillageView(record(s), landscape, day).scene;
    const parts = scene.fields[0]!.parts;
    const sown = parts.filter((p) => p.stage === 'sown');
    expect(sown.length).toBeGreaterThan(0);
    for (const p of sown) expect(['stubble', 'plowed', 'sown']).toContain(p.look);
    // jeden rozpracovaný díl na úlohu – kopání: hotová část zoraná, zbytek loňské strniště
    const working = parts.filter((p) => p.work !== undefined && p.look === 'plowed');
    expect(working).toHaveLength(1);
    expect(working[0]).toMatchObject({ look: 'plowed', before: 'stubble' });
    expect(working[0]!.work).toBeGreaterThan(0);
    expect(working[0]!.work).toBeLessThan(1);
    const dig = scene.labor?.shares.find((x) => x.activity === 'dig');
    expect(dig?.target).toEqual({ kind: 'field', id: scene.fields[0]!.id });
    expect(dig?.parts?.length).toBeGreaterThan(0);
    for (const id of dig?.parts ?? []) expect(parts.map((p) => p.id)).toContain(id);
    expect(dig?.parts?.at(-1)).toBe(working[0]!.id);
  });

  it('staveniště ve scéně ukazuje stavbu bez kácení, panel celý průběh a stromy ke skácení', () => {
    const s = settled();
    const fell = [3, 3, 3, 3].map((cost, i) => ({ id: 500 + i, cost }));
    s.constructions.push({
      id: 99,
      kind: 'dwelling',
      startedDay: DAY,
      cost: 100 + 12,
      done: 6 + 25,
      dwellingType: 'polozemnice',
      position: { x: 30, z: 40, rotation: 0 },
      dwellingId: null,
      fieldId: null,
      wood: { trees: 18, fromPile: 14, fell, felled: 2 },
    });
    const { scene, constructions } = buildVillageView(record(s), landscape, DAY);
    expect(scene.dwellings.find((d) => d.id === 99)?.progress).toBeCloseTo(0.19, 9);
    const c = constructions.find((x) => x.id === 99)!;
    expect(c.progress).toBeCloseTo(31 / 112, 9);
    expect(c.treesToFell).toBe(2);
  });

  it('ze scény jde složit data pro kontrolu umístění v prohlížeči', () => {
    const { scene } = buildVillageView(record(), landscape, DAY);
    const village = placementVillageFromScene(scene);
    const onHouse = checkDwellingPlacement(landscape, village, 'zemnice', {
      x: -48,
      z: -50,
      rotation: 0,
    });
    expect(onHouse.ok).toBe(false);
    // na pole obydlí smí – pole se zmenší (population.md – Obydlí na poli a v sadu)
    const inField = checkDwellingPlacement(landscape, village, 'zemnice', {
      x: 30,
      z: 7,
      rotation: 0,
    });
    expect(inField).toMatchObject({ ok: true, warning: 'Pole se zmenší' });
    expect(inField.takenLand.length).toBeGreaterThan(0);
  });

  it('scéna nese odstraněné a pokácené překážky – i do kontroly umístění v prohlížeči', () => {
    const s = state();
    s.clearedObstacles = [{ id: 7, day: DAY }];
    s.felledTrees = [
      { id: 9, day: DAY },
      { id: 11, day: DAY - 12_000 },
    ];
    const { scene } = buildVillageView(record(s), landscape, DAY);
    // strom 11 je pokácený přes 30 let – roste z náletu
    expect(scene.obstacles).toEqual({ removed: [7], stumps: [9], saplings: [11] });
    expect(placementVillageFromScene(scene).obstacleChanges).toEqual(scene.obstacles);
  });

  it('pole přes les: náhled v prohlížeči ze scény spočítá totéž co server', () => {
    const real = generateLandscape(5);
    const layer = obstaclesOf(real);
    const site = tileCenterWorld(real, real.villageSite.x, real.villageSite.y);
    const founded = foundVillage({
      seed: 3,
      day: DAY,
      dwellingPosition: { x: site.x, z: site.z, rotation: 0 },
      obstacles: layer,
    });
    // zakladatelé kácejí na zemnici – den, kdy jsou pařezy i stromy ještě vyhrazené
    let s = founded;
    while (!(s.felledTrees?.length && reservedTrees(s).size > 0) && s.lastDay < DAY + 60) {
      s = advanceVillage(s, s.lastDay + 1, layer);
    }
    expect(reservedTrees(s).size).toBeGreaterThan(0);
    expect(s.felledTrees?.length).toBeGreaterThan(0);
    // čtverce od místa vsi k nejbližšímu lesu a kus do lesa
    const { x: sx, y: sy } = real.villageSite;
    let best: { x: number; y: number } | null = null;
    for (let y = 0; y < real.size; y++) {
      for (let x = 0; x < real.size; x++) {
        if (surfaceAt(real, x, y) !== 'forest') continue;
        if (!best || Math.hypot(x - sx, y - sy) < Math.hypot(best.x - sx, best.y - sy)) {
          best = { x, y };
        }
      }
    }
    // a čtverce kolem stromu vyhrazeného zemnicí (klády za něj nedá ani náhled v prohlížeči)
    const reservedId = [...reservedTrees(s)][0]!;
    const index = layer.id.indexOf(reservedId);
    const half = (real.size * real.cellSizeM) / 2;
    const reservedTile = {
      x: Math.floor((layer.x[index]! + half) / real.cellSizeM),
      y: Math.floor((layer.z[index]! + half) / real.cellSizeM),
    };
    const around = (c: { x: number; y: number }): { x: number; y: number }[] =>
      [-2, -1, 0, 1, 2].flatMap((dy) =>
        [-2, -1, 0, 1, 2].map((dx) => ({ x: c.x + dx, y: c.y + dy })),
      );
    const cells = [...around(best!), ...around(reservedTile)];
    const view = buildVillageView(record(s), real, s.lastDay);
    const client = fieldPartsFromCells(
      real,
      placementVillageFromScene(view.scene),
      cells,
      view.scene.dwellings.map((d) => d.position),
      layer,
    );
    const server = fieldPartsFromCells(
      real,
      placementVillageOf(s, s.lastDay),
      cells,
      villageDwellingPositions(s),
      layer,
    );
    expect(client.surfaceCounts.forest).toBeGreaterThan(0);
    expect(client.parts.flatMap((p) => p.obstacleIds ?? [])).toContain(reservedId);
    expect(client).toEqual(server);
  });

  it('kronika: nejnovější první, s datem „12. dubna 503“, nejvýš CHRONICLE_LENGTH událostí', () => {
    const s = state();
    const view = buildVillageView(record(s), landscape, DAY);
    expect(view.chronicle).toEqual([
      {
        day: DAY,
        kind: 'village-founded',
        dateLabel: '12. dubna 503',
        text: 'Osadníci založili ves Libice.',
      },
    ]);
    s.chronicle.push(
      ...Array.from({ length: 20 }, (_, i) => ({ day: DAY + i + 1, kind: 'birth' as const })),
    );
    const long = buildVillageView(record(s), landscape, DAY + 20);
    expect(long.chronicle).toHaveLength(CHRONICLE_LENGTH);
    expect(long.chronicle[0]?.day).toBe(DAY + 20);
    expect(long.chronicle[0]?.dateLabel).toBe('2. května 503');
  });

  it('den poslední svatby mezi domy (upozornění „Svatba“), bez svatby null', () => {
    const s = state();
    expect(buildVillageView(record(s), landscape, DAY).lastMarriageDay).toBeNull();
    s.chronicle.push(
      { day: DAY + 1, kind: 'marriage', fromDwellingId: 2, toDwellingId: 1 },
      { day: DAY + 3, kind: 'marriage', fromDwellingId: 3, toDwellingId: 1 },
      { day: DAY + 4, kind: 'birth' },
    );
    expect(buildVillageView(record(s), landscape, DAY + 4).lastMarriageDay).toBe(DAY + 3);
  });
});

describe('hřbitov v pohledu na ves', () => {
  const withCemetery = (): VillageState =>
    foundCemetery(state(), DAY - 1, {
      squares: [
        { cell: { x: 0, y: 0 }, x: -112.5, z: -112.5, waterDistanceM: 500, obstacleCost: 0 },
        { cell: { x: 1, y: 0 }, x: -97.5, z: -112.5, waterDistanceM: 500, obstacleCost: 0 },
      ],
      squareSizeM: 15,
    });

  it('zakládaný hřbitov: stavba, místo, scéna a cena za čtverec', () => {
    const view = buildVillageView(record(withCemetery()), landscape, DAY);
    const cemeteryId = view.cemeteries[0]?.id;
    expect(view.build.cemetery).toMatchObject({ laborManDays: 10, perSquare: true });
    expect(view.constructions.at(-1)).toMatchObject({
      kind: 'cemetery',
      label: 'Hřbitov (2 čtverce)',
      cemeteryId,
    });
    expect(view.cemeteries).toEqual([
      {
        id: cemeteryId,
        squares: 2,
        built: false,
        progress: 0,
        capacity: 112,
        graves: 0,
        freeGraves: 112,
        yearsLeft: null,
        fenceCondition: 1,
        abandoned: false,
        repair: null,
      },
    ]);
    expect(view.scene.cemeteries).toEqual([
      {
        id: cemeteryId,
        squares: [
          { cell: { x: 0, y: 0 }, x: -112.5, z: -112.5, size: 15 },
          { cell: { x: 1, y: 0 }, x: -97.5, z: -112.5, size: 15 },
        ],
        built: false,
        progress: 0,
        graves: 0,
      },
    ]);
    expect(placementVillageFromScene(view.scene).cemeteries).toEqual([
      { squares: [{ cell: { x: 0, y: 0 } }, { cell: { x: 1, y: 0 } }] },
    ]);
  });

  it('hotový hřbitov s hroby: obsazené hroby a zbývající místo', () => {
    const s = withCemetery();
    s.constructions = s.constructions.filter((c) => c.kind !== 'cemetery');
    s.cemeteries![0]!.builtDay = DAY - 1;
    s.cemeteries![0]!.graves = 100;
    const view = buildVillageView(record(s), landscape, DAY);
    expect(view.cemeteries[0]).toMatchObject({ built: true, progress: 1, freeGraves: 12 });
    expect(view.cemeteries[0]).not.toHaveProperty('spaceLabel');
    expect(view.scene.cemeteries?.[0]).toMatchObject({ built: true, graves: 100 });
  });
});

describe('chronicleText', () => {
  const events: ChronicleEvent[] = [
    { day: DAY, kind: 'village-founded' },
    { day: DAY, kind: 'birth' },
    { day: DAY, kind: 'death', group: 'child' },
    { day: DAY, kind: 'death', group: 'adult' },
    { day: DAY, kind: 'death', group: 'elder' },
    { day: DAY, kind: 'death', group: 'child', cause: 'hunger' },
    { day: DAY, kind: 'death', group: 'adult', cause: 'hunger' },
    { day: DAY, kind: 'death', group: 'elder', cause: 'hunger' },
    { day: DAY, kind: 'village-extinct' },
    { day: DAY, kind: 'household-founded', dwellingId: 2 },
    { day: DAY, kind: 'household-merged', fromDwellingId: 2, toDwellingId: 1 },
    { day: DAY, kind: 'marriage', fromDwellingId: 2, toDwellingId: 1 },
    { day: DAY, kind: 'bride-from-outside', dwellingId: 1 },
    { day: DAY, kind: 'married-away', dwellingId: 1 },
    {
      day: DAY,
      kind: 'construction-finished',
      constructionKind: 'field',
      dwellingId: null,
      fieldId: 3,
    },
    { day: DAY, kind: 'rebuild-decided', dwellingId: 1, type: 'polozemnice' },
    { day: DAY, kind: 'harvest', kg: 1250 },
    { day: DAY, kind: 'hunger-began' },
    { day: DAY, kind: 'hunger-ended' },
    { day: DAY, kind: 'part-became-forest', partId: 4 },
    { day: DAY, kind: 'part-became-forest', partId: 4, fieldId: 2, parts: 3, gone: false },
    { day: DAY, kind: 'part-became-forest', partId: 4, fieldId: 2, parts: 1, gone: true },
    { day: DAY, kind: 'cemetery-full', cemeteryId: 5, othersFree: true },
    { day: DAY, kind: 'cemetery-full', cemeteryId: 5, othersFree: false },
    { day: DAY, kind: 'cemetery-full', cemeteryId: 5, othersFree: false, othersBuilding: true },
    {
      day: DAY,
      kind: 'construction-finished',
      constructionKind: 'cemetery',
      dwellingId: null,
      fieldId: null,
    },
    {
      day: DAY,
      kind: 'construction-finished',
      constructionKind: 'idol',
      dwellingId: null,
      fieldId: null,
    },
    {
      day: DAY,
      kind: 'construction-finished',
      constructionKind: 'shrine',
      dwellingId: null,
      fieldId: null,
    },
    { day: DAY, kind: 'sacred-spared', site: 'oak', id: 7 },
    { day: DAY, kind: 'sacred-spared', site: 'grove', id: 8 },
    { day: DAY, kind: 'road-formed', roadId: 3 },
    { day: DAY, kind: 'road-overgrown', roadId: 3 },
  ];

  it('každá událost má český text', () => {
    for (const event of events) expect(chronicleText(event, 'Libice')).toMatch(/\S.*\.$/);
  });

  it('sklizeň s tisíci a přestavba ve 4. pádě', () => {
    expect(chronicleText({ day: DAY, kind: 'harvest', kg: 1250 }, 'X')).toBe(
      'Sklizeň: 1 250 kg obilí.',
    );
    expect(chronicleText({ day: DAY, kind: 'harvest', kg: 900, crop: 'winter' }, 'X')).toBe(
      'Sklizeň ozimu: 900 kg obilí.',
    );
    expect(chronicleText({ day: DAY, kind: 'harvest', kg: 90, crop: 'spring' }, 'X')).toBe(
      'Sklizeň jaře: 90 kg obilí.',
    );
    expect(
      chronicleText({ day: DAY, kind: 'rebuild-decided', dwellingId: 1, type: 'polozemnice' }, 'X'),
    ).toBe('Obyvatelé se rozhodli přestavět dožilé obydlí na polozemnici.');
  });
});

describe('kronika – výměna lidí (trade.md – Výměna lidí)', () => {
  it('výprava s lidmi a lidé od souseda', () => {
    expect(
      chronicleText(
        {
          day: DAY,
          kind: 'trade-departed',
          direction: 'S',
          give: { grain: 100 },
          people: { families: 1, adults: 2 },
        },
        'X',
      ),
    ).toBe(
      'Nosiči vyrazili po stezce na jih – nesou 100 kg obilí; odchází s nimi 1 rodina a 2 dospělí.',
    );
    expect(
      chronicleText(
        {
          day: DAY,
          kind: 'trade-returned',
          direction: 'N',
          get: {},
          people: { families: 0, adults: 1 },
        },
        'X',
      ),
    ).toBe('Nosiči se vrátili ze severu – přišli s nimi 1 dospělý.');
    expect(
      chronicleText({ day: DAY, kind: 'trade-returned', direction: 'N', get: { grain: 5 } }, 'X'),
    ).toBe('Nosiči se vrátili ze severu – přinesli 5 kg obilí.');
    expect(
      chronicleText(
        { day: DAY, kind: 'newcomer', direction: 'E', group: 'family', people: 4, dwellingId: 1 },
        'X',
      ),
    ).toBe('Z východu přišla rodina – 4 lidé.');
    expect(
      chronicleText(
        { day: DAY, kind: 'newcomer', direction: 'SW', group: 'woman', people: 1, dwellingId: 1 },
        'X',
      ),
    ).toBe('Z jihozápadu přišla svobodná žena.');
  });
});

describe('kronika – zarůstání (fields.md)', () => {
  it('díl nebo pole zarostlo lesem a vypadlo z pole', () => {
    const forest = (parts: number, gone: boolean): string =>
      chronicleText(
        { day: DAY, kind: 'part-became-forest', partId: 1, fieldId: 2, parts, gone },
        'X',
      );
    expect(forest(1, false)).toBe('Nepasený díl pole zarostl lesem – pole se zmenšilo.');
    expect(forest(3, false)).toBe('Nepasené pole zarostlo lesem – ubylo 3 čtverce.');
    expect(forest(2, true)).toBe('Nepasené pole zarostlo lesem a zaniklo.');
  });
});

describe('kronika – hlad a vymření', () => {
  it('úmrtí hladem a vymření vsi', () => {
    expect(chronicleText({ day: DAY, kind: 'death', group: 'child', cause: 'hunger' }, 'X')).toBe(
      'Dítě zemřelo hlady.',
    );
    expect(chronicleText({ day: DAY, kind: 'village-extinct' }, 'Libice')).toBe(
      'Zemřel poslední obyvatel – ves Libice vymřela.',
    );
  });
});

describe('vymřelá ves a konec hry', () => {
  it('žijící ves: bez vymření, hra pokračuje', () => {
    const view = buildVillageView(record(), landscape, DAY);
    expect(view.extinct).toBeNull();
    expect(view.gameOver).toBe(false);
    expect(view.starving).toBe(false);
  });

  it('vymřelá ves: roky založení a vymření, obydlí bez obyvatel (bez dýmu a zvířat)', () => {
    const s = settled();
    s.people = [];
    const extinct = advanceVillage(s, DAY + 1, null);
    expect(extinct.extinctDay).toBe(DAY); // ves vzniká na začátku dne DAY – první den je DAY
    const view = buildVillageView(record(extinct), landscape, DAY + 1, { gameOver: true });
    expect(view.extinct).toEqual({ foundedYear: 503, extinctYear: 503, years: 0 });
    expect(view.gameOver).toBe(true);
    expect(view.scene.dwellings.every((d) => d.inhabited === false)).toBe(true);
    expect(view.chronicle[0]?.text).toBe('Zemřel poslední obyvatel – ves Libice vymřela.');
  });
});

describe('kronika – zaplněný hřbitov', () => {
  const full = (othersFree: boolean, othersBuilding?: boolean): ChronicleEvent => ({
    day: DAY,
    kind: 'cemetery-full',
    cemeteryId: 5,
    othersFree,
    ...(othersBuilding === undefined ? {} : { othersBuilding }),
  });

  it('„není kam pohřbívat“ jen když se žádný hřbitov nestaví ani nemá místo', () => {
    expect(chronicleText(full(true, false), 'X')).toBe(
      'Jeden z hřbitovů se zaplnil – pohřbívá se do dalšího.',
    );
    expect(chronicleText(full(false, true), 'X')).toBe('Hřbitov se zaplnil.');
    expect(chronicleText(full(false, false), 'X')).toBe(
      'Hřbitov se zaplnil – mrtvé není kam pohřbívat.',
    );
    expect(chronicleText(full(false), 'X')).toMatch(/není kam/);
  });
});

describe('sad v pohledu na ves', () => {
  const withOrchard = (): VillageState =>
    foundOrchard(state(), DAY - 1, {
      squares: [
        { cell: { x: 2, y: 2 }, areaM2: 225, distanceM: 60, obstacleCost: 0 },
        { cell: { x: 3, y: 2 }, areaM2: 225, distanceM: 70, obstacleCost: 0 },
      ],
    });

  it('vysazovaný sad: stavba, panel, scéna a cena za hektar', () => {
    const view = buildVillageView(record(withOrchard()), landscape, DAY);
    const orchardId = view.orchards[0]?.id;
    expect(view.build.orchard).toMatchObject({ laborManDays: 80, perHa: true });
    expect(view.constructions.at(-1)).toMatchObject({
      kind: 'orchard',
      label: 'Sad 0,04 ha',
      orchardId,
    });
    expect(view.orchards).toEqual([
      {
        id: orchardId,
        areaM2: 450,
        squares: 2,
        ageYears: null,
        expectedYieldKg: 0,
        planting: 0,
        // 12. 4. – jarní okno výsadby
        plantingWaits: false,
      },
    ]);
    expect(view.applesKg).toBe(0);
    expect(view.scene.orchards).toEqual([
      {
        id: orchardId,
        squares: [
          {
            cell: { x: 2, y: 2 },
            x: -82.5,
            z: -82.5,
            size: 15,
            planting: 0,
            growth: 0,
            fruit: false,
          },
          {
            cell: { x: 3, y: 2 },
            x: -67.5,
            z: -82.5,
            size: 15,
            planting: 0,
            growth: 0,
            fruit: false,
          },
        ],
      },
    ]);
    // v červnu výsadba čeká na podzimní okno
    const june = dayIndexOf({ year: 503, month: 6, day: 1 });
    expect(buildVillageView(record(withOrchard()), landscape, june).orchards[0]).toMatchObject({
      plantingWaits: true,
    });
    expect(placementVillageFromScene(view.scene).orchards).toEqual([
      {
        squares: [
          { cell: { x: 2, y: 2 }, areaM2: 225 },
          { cell: { x: 3, y: 2 }, areaM2: 225 },
        ],
      },
    ]);
  });

  it('plodící sad: stáří, odhad úrody, velikost stromů a jablka v srpnu', () => {
    const s = withOrchard();
    s.constructions = s.constructions.filter((c) => c.kind !== 'orchard');
    for (const square of s.orchards![0]!.squares) {
      square.plantedDay = dayIndexOf({ year: 507, month: 4, day: 1 });
      square.plantingDone = square.plantingCost;
    }
    s.applesKg = 12.4;
    const august = dayIndexOf({ year: 530, month: 8, day: 10 });
    s.lastDay = august;
    const view = buildVillageView(record(s), landscape, august);
    expect(view.orchards[0]).toMatchObject({ ageYears: 23, planting: null });
    // sklizeň 530 je 24. rok sadu – 19/20 plné úrody (3 t/ha)
    expect(view.orchards[0]!.expectedYieldKg).toBeCloseTo(3000 * 0.045 * (19 / 20), 6);
    expect(view.applesKg).toBe(12.4);
    expect(view.scene.orchards?.[0]?.squares[0]).toMatchObject({
      planting: 1,
      growth: 1,
      fruit: true,
    });
    const june = buildVillageView(
      record(s),
      landscape,
      dayIndexOf({ year: 530, month: 6, day: 1 }),
    );
    expect(june.scene.orchards?.[0]?.squares[0]?.fruit).toBe(false);
  });

  it('obnova: velikost stromů a jablka po čtvercích, vytyčený jen obnovovaný čtverec', () => {
    const s = withOrchard();
    s.constructions = s.constructions.filter((c) => c.kind !== 'orchard');
    const [old, renewed] = s.orchards![0]!.squares;
    old!.plantedDay = dayIndexOf({ year: 507, month: 4, day: 1 });
    old!.plantingDone = old!.plantingCost;
    // obnovený čtverec – vysazený znovu na jaře 558
    renewed!.plantedDay = dayIndexOf({ year: 558, month: 4, day: 1 });
    renewed!.plantingDone = renewed!.plantingCost;
    const august = dayIndexOf({ year: 560, month: 8, day: 10 });
    s.lastDay = august;
    const view = buildVillageView(record(s), landscape, august);
    const [oldScene, renewedScene] = view.scene.orchards![0]!.squares;
    // starý čtverec (54. rok sadu) má plné stromy s jablky, obnovený mladé stromky bez jablek
    expect(oldScene).toMatchObject({ planting: 1, growth: 1, fruit: true });
    expect(renewedScene).toMatchObject({ planting: 1, fruit: false });
    expect(renewedScene!.growth).toBeGreaterThan(0.3);
    expect(renewedScene!.growth).toBeLessThan(0.5);
    expect(renewedScene).not.toHaveProperty('renewal');
    // stáří sadu = průměr čtverců vážený plochou ((53,4 + 2,4) / 2)
    expect(view.orchards[0]!.ageYears).toBe(27);

    // obnova běží: staré stromy na čtverci skácené, sází se znovu (kůly → sazenice)
    renewed!.plantedDay = null;
    renewed!.plantingCost = 1.8;
    renewed!.plantingDone = 0.9;
    renewed!.renewal = 99;
    s.constructions.push({
      id: 99,
      kind: 'orchard',
      startedDay: august - 3,
      cost: 1.8,
      done: 0.9,
      dwellingType: null,
      position: null,
      dwellingId: null,
      fieldId: null,
      orchardId: s.orchards![0]!.id,
      renewal: true,
    });
    const renewing = buildVillageView(record(s), landscape, august);
    expect(renewing.scene.orchards![0]!.squares[1]).toMatchObject({
      planting: 0.5,
      growth: 0,
      fruit: false,
      renewal: true,
    });
    expect(renewing.scene.orchards![0]!.squares[0]).not.toHaveProperty('renewal');
    expect(renewing.orchards[0]).toMatchObject({ planting: 0.5, ageYears: 53 });
  });

  it('kronika obnovy – druh události pro upozornění a text', () => {
    const s = withOrchard();
    const orchardId = s.orchards![0]!.id;
    s.chronicle.push({ day: DAY - 30, kind: 'orchard-renewal-started', orchardId, squares: 4 });
    expect(buildVillageView(record(s), landscape, DAY).chronicle[0]).toMatchObject({
      day: DAY - 30,
      kind: 'orchard-renewal-started',
      text: 'Vesničané obnovují starý sad – znovu vysadí 4 čtverce.',
    });
  });

  it('kronika: pole a sad ustoupily stavbě obydlí', () => {
    const taken = (land: 'field' | 'orchard', gone: boolean): string =>
      chronicleText({ day: 0, kind: 'land-taken', land, id: 3, areaM2: 1234.4, gone }, 'Libice');
    expect(taken('field', false)).toBe('Pole ustoupilo stavbě obydlí – zmenšilo se o 1 234 m².');
    expect(taken('field', true)).toBe('Pole ustoupilo stavbě obydlí a zaniklo.');
    expect(taken('orchard', false)).toBe('Sad ustoupil stavbě obydlí – zmenšil se o 1 234 m².');
    expect(taken('orchard', true)).toBe('Sad ustoupil stavbě obydlí a zanikl.');
  });

  it('kronika: pole ustoupilo i ostatním stavbám (pole jako krajina)', () => {
    const by = (taker: LandTaker, gone = false): string =>
      chronicleText(
        { day: 0, kind: 'land-taken', land: 'field', id: 3, areaM2: 20, gone, by: taker },
        'Libice',
      );
    expect(by('orchard', true)).toBe('Pole ustoupilo sadu a zaniklo.');
    expect(by('cemetery', true)).toBe('Pole ustoupilo hřbitovu a zaniklo.');
    expect(by('pen')).toBe('Pole ustoupilo ohradě – zmenšilo se o 20 m².');
    expect(by('shrine')).toBe('Pole ustoupilo svatyni – zmenšilo se o 20 m².');
    expect(by('road-apples')).toBe('Pole ustoupilo jabloním u cesty – zmenšilo se o 20 m².');
    expect(by('road-trees')).toBe('Pole ustoupilo stromům u cesty – zmenšilo se o 20 m².');
  });

  it('kronika: sklizeň jablek a dosloužilý sad', () => {
    expect(chronicleText({ day: 0, kind: 'apple-harvest', kg: 1234 }, 'Libice')).toBe(
      'Sklizeň ovoce: 1 234 kg.',
    );
    expect(chronicleText({ day: 0, kind: 'orchard-gone', orchardId: 3 }, 'Libice')).toBe(
      'Starý sad dosloužil a zarostl loukou.',
    );
    expect(
      chronicleText(
        {
          day: 0,
          kind: 'construction-finished',
          constructionKind: 'orchard',
          dwellingId: null,
          fieldId: null,
        },
        'Libice',
      ),
    ).toBe('Sad je vysazený.');
  });
});

describe('štěstí a posvátná místa v pohledu na ves', () => {
  it('štěstí, ušetřený dub a háj, rozestavěná svatyně – panel, scéna, nabídka staveb', () => {
    const s = settled();
    s.happiness = { value: 62.4, deaths: [], toil: [] };
    s.sacredOaks = [{ id: 7, day: DAY, x: 20, z: 30 }];
    s.groves = [{ id: 8, day: DAY, x: -40, z: 50, cells: [{ x: 5, y: 11 }], oaks: 14 }];
    s.sacredBuildings = [
      { id: 40, kind: 'idol', position: { x: 60, z: 0, rotation: 0 }, builtDay: DAY },
    ];
    s.constructions.push({
      id: 41,
      kind: 'shrine',
      startedDay: DAY,
      cost: 400,
      done: 100,
      dwellingType: null,
      position: { x: 0, z: 90, rotation: 0 },
      dwellingId: null,
      fieldId: null,
      wood: { trees: 3, fromPile: 0, fell: [1, 2, 3].map((id) => ({ id, cost: 2 })), felled: 1 },
    });
    const view = buildVillageView(record(s), landscape, DAY);
    expect(view.happiness.value).toBe(62.4);
    expect(view.happiness.laborFactor).toBeCloseTo(1 + (0.1 * 12.4) / 50, 9);
    // ruční krajina bez vrstvy překážek – stáří dubů neznámé
    // bez vrstvy se dub počítá jako nejmladší (+1)
    expect(view.sacred.oaks).toEqual([{ id: 7, happiness: 1, ageYears: null, snag: false }]);
    expect(view.sacred.groves).toEqual([
      { id: 8, oaks: 14, squares: 1, happiness: 14, ageYears: null },
    ]);
    expect(view.sacred.buildings).toEqual([
      {
        id: 40,
        kind: 'idol',
        built: true,
        happiness: 8,
        progress: 1,
        oaksToFell: 0,
        condition: 1,
        abandoned: false,
        repair: null,
      },
      {
        id: 41,
        kind: 'shrine',
        built: false,
        happiness: 25,
        progress: 0.25,
        oaksToFell: 2,
        condition: 1,
        abandoned: false,
        repair: null,
      },
    ]);
    expect(view.scene.sacred).toEqual({
      oaks: [{ id: 7, x: 20, z: 30, growth: 1 }],
      groves: [
        {
          id: 8,
          x: -40,
          z: 50,
          squares: [{ cell: { x: 5, y: 11 }, x: -37.5, z: 52.5, size: 15 }],
        },
      ],
      buildings: [
        { id: 40, kind: 'idol', position: { x: 60, z: 0, rotation: 0 }, built: true, progress: 1 },
        {
          id: 41,
          kind: 'shrine',
          position: { x: 0, z: 90, rotation: 0 },
          built: false,
          progress: (100 - 6) / (400 - 6),
        },
      ],
    });
    expect(view.build.shrine).toMatchObject({ affordable: false, blocked: 'Ves už svatyni má.' });
    expect(view.build.idol.blocked).toBeNull();
    expect(view.constructions.find((c) => c.id === 41)?.label).toBe('Svatyně');
    // kontrola umístění v prohlížeči zná modly a svatyně ze scény
    expect(placementVillageFromScene(view.scene).sacredBuildings).toEqual([
      { kind: 'idol', position: { x: 60, z: 0, rotation: 0 } },
      { kind: 'shrine', position: { x: 0, z: 90, rotation: 0 } },
    ]);
  });

  it('posvátný dub ve scéně postupně roste podle let od ušetření (jen vzhled)', () => {
    const s = settled();
    s.sacredOaks = [{ id: 7, day: DAY - Math.ceil(30 * 365.25), x: 20, z: 30 }];
    const view = buildVillageView(record(s), landscape, DAY);
    expect(view.scene.sacred?.oaks[0]?.growth).toBeCloseTo(1.15, 9);
  });

  it('panel ukáže stáří posvátného dubu a nejstaršího dubu háje podle vrstvy překážek', () => {
    const real = generateLandscape(5);
    const sites = sacredSitesOf(obstaclesOf(real));
    const oak = sites.oaks[0]!;
    const grove = sites.groves[0]!;
    const s = settled();
    s.sacredOaks = [{ id: oak.id, day: DAY, x: oak.x, z: oak.z }];
    s.groves = [{ id: grove.id, day: DAY, x: grove.x, z: grove.z, cells: grove.cells, oaks: 9 }];
    const view = buildVillageView(record(s), real, DAY);
    const layer = obstaclesOf(real);
    expect(view.sacred.oaks[0]?.ageYears).toBe(sacredOakNow(layer, oak.id, DAY).ageYears);
    expect(view.sacred.groves[0]?.ageYears).toBe(groveAgeYears(layer, grove, DAY));
    // k 1. 1. 500 je posvátný dub starý 150–400 let, v roce 503 o 3 roky víc
    expect(view.sacred.oaks[0]?.ageYears).toBeGreaterThanOrEqual(153);
    expect(view.sacred.oaks[0]?.ageYears).toBeLessThanOrEqual(403);
  });

  it('posvátný dub uschne: panel souš se stářím a +1, scéna souš; padlá souš z panelu zmizí', () => {
    const real = generateLandscape(5);
    const layer = obstaclesOf(real);
    const oak = sacredSitesOf(layer).oaks.find((o) => {
      const life = sacredOakLife(layer, o.id);
      return life?.diesDay != null && life.fallsDay != null;
    })!;
    const life = sacredOakLife(layer, oak.id)!;
    const died = life.diesDay!;
    const fell = life.fallsDay!;
    const s = settled();
    s.sacredOaks = [{ id: oak.id, day: DAY, x: oak.x, z: oak.z }];
    const at = (day: number): VillageView => buildVillageView(record(s), real, day);
    const span = life.lifespanYears;
    expect(at(died - 1).sacred.oaks).toEqual([
      { id: oak.id, happiness: oakAgeHappiness(span), ageYears: span, snag: false },
    ]);
    expect(at(died - 1).scene.sacred?.oaks[0]?.snag).toBeUndefined();
    // souš: stáří, kdy uschla, štěstí 1, ve scéně souš s velikostí dubu – od uschnutí neroste
    const snag = at(died);
    expect(snag.sacred.oaks).toEqual([{ id: oak.id, happiness: 1, ageYears: span, snag: true }]);
    expect(snag.happiness.target).toBeGreaterThan(0);
    const sceneOak = snag.scene.sacred?.oaks[0];
    expect(sceneOak).toMatchObject({ id: oak.id, snag: true, sizeM: life.sizeM });
    expect(at(fell - 1).scene.sacred?.oaks[0]?.growth).toBe(sceneOak?.growth);
    // padlá souš: už není posvátný dub – v panelu ani mezi duby scény, leží padlý kmen
    const fallen = at(fell);
    expect(fallen.sacred.oaks).toEqual([]);
    expect(fallen.scene.sacred?.oaks).toEqual([]);
    expect(fallen.scene.sacred?.fallenOaks).toEqual([
      { id: oak.id, x: oak.x, z: oak.z, growth: sceneOak?.growth, sizeM: life.sizeM },
    ]);
  });

  it('kronika: posvátný dub uschl, posvátná souš padla', () => {
    expect(chronicleText({ day: 0, kind: 'sacred-oak-died', id: 1 }, 'Libice')).toBe(
      'Posvátný dub stářím uschl – zůstala posvátná souš.',
    );
    expect(chronicleText({ day: 0, kind: 'sacred-snag-fell', id: 1 }, 'Libice')).toBe(
      'Posvátná souš padla.',
    );
  });

  it('ves bez posvátných míst je ve scéně nemá', () => {
    const view = buildVillageView(record(settled()), landscape, DAY);
    expect(view.scene.sacred).toBeUndefined();
    expect(view.sacred).toEqual({ oaks: [], groves: [], buildings: [] });
    expect(view.happiness.value).toBe(50);
  });
});

describe('pevné cesty v pohledu na ves (roads.md)', () => {
  const YEAR = 365.25;
  const withRoads = (): VillageState => {
    const s = settled();
    const tree = (id: number, years: number, life = 100) => ({
      id: ROAD_TREE_ID_BASE + id,
      spot: id,
      x: 20 + id * 10,
      z: 3,
      species: 'elm' as const,
      rootedDay: DAY - Math.round(years * YEAR),
      diesDay: DAY - Math.round(years * YEAR) + Math.round(life * YEAR),
    });
    s.roads = {
      nextId: 20,
      roads: [
        {
          id: 1,
          points: [
            { x: 0, z: 0 },
            { x: 80, z: 0 },
          ],
          bornDay: DAY - 3000,
          grade: 'trodden',
          traffic: [4.5],
          spots: [],
        },
      ],
      // keř, mladý strom, plný strom, souš, pařez, zmizelý pařez, strom odstraněný stavbou
      trees: [tree(1, 3), tree(2, 12), tree(3, 60), tree(4, 105), tree(5, 115), tree(6, 130)],
      candidates: [],
      labor: { from: DAY - 10, days: 10, shares: [] },
    };
    s.roads.trees.push(tree(7, 50));
    s.clearedObstacles = [{ id: ROAD_TREE_ID_BASE + 7, day: DAY - 5 }];
    return s;
  };

  it('scéna dostane osy cest a stromy ve stadiu podle dne (velikost po dvacetinách)', () => {
    const view = buildVillageView(record(withRoads()), landscape, DAY);
    expect(view.scene.roads).toEqual([
      {
        id: 1,
        points: [
          { x: 0, z: 0 },
          { x: 80, z: 0 },
        ],
        grade: 'trodden',
      },
    ]);
    const trees = view.scene.roadTrees!;
    expect(trees.map((t) => [t.id - ROAD_TREE_ID_BASE, t.stage])).toEqual([
      [1, 'shrub'],
      [2, 'tree'],
      [3, 'tree'],
      [4, 'snag'],
      [5, 'stump'],
    ]);
    for (const t of trees) expect(Math.round(t.growth * 20)).toBeCloseTo(t.growth * 20, 9);
    expect(trees[2]!.growth).toBe(1);
    expect(trees[1]!.growth).toBeLessThan(0.5);
  });

  it('stromy u cest jsou překážky i pro kontrolu umístění v prohlížeči', () => {
    const s = withRoads();
    const view = buildVillageView(record(s), landscape, DAY);
    const fromScene = placementVillageFromScene(view.scene).obstacleChanges!;
    expect(fromScene.added).toEqual(placementVillageOf(s, DAY).obstacleChanges!.added);
    expect(fromScene.added!.map((o) => o.kind)).toEqual([
      'shrub',
      'youngTree',
      'tree',
      'snag',
      'stump',
    ]);
  });

  it('panel cesty: stupeň, délka, stromy, vylepšení s cenou; rozestavěné ve scéně s průběhem', () => {
    const s = withRoads();
    const view = buildVillageView(record(s), landscape, DAY);
    const road = view.roads[0]!;
    expect(road).toMatchObject({ id: 1, grade: 'trodden', lengthM: 80, building: null });
    // stromy se počítají jen na místech úseku – tenhle úsek místa nemá
    expect(road.trees).toBe(0);
    expect(road.upgrades.map((u) => u.upgrade)).toEqual(['improved']);
    expect(road.upgrades[0]!.laborManDays).toBe(12);
    const started = startRoadUpgrade(s, DAY, 1, 'improved', null);
    const building = buildVillageView(record(started), landscape, DAY);
    expect(building.roads[0]!.building).toMatchObject({ grade: 'improved', progress: 0 });
    expect(building.roads[0]!.upgrades[0]!.blocked).toMatch(/vylepšuje/);
    expect(building.scene.roads![0]!.upgrade).toEqual({ grade: 'improved', progress: 0 });
    expect(building.constructions.at(-1)!.label).toBe('Úprava cesty');
  });

  it('jabloně u cesty: panel s počtem a plodícími, scéna se stadiem, velikostí a plody', () => {
    const s = withRoads();
    const apple = (id: number, years: number) => ({
      id: ROAD_TREE_ID_BASE + id,
      roadId: 1,
      x: 10 + id * 3,
      z: -3,
      distanceM: 30,
      plantedDay: DAY - Math.round(years * YEAR),
    });
    // mladá (neplodí), plodící, souš, zmizelá souš
    s.roads!.apples = [apple(11, 2), apple(12, 20), apple(13, 65), apple(14, 80)];
    const view = buildVillageView(record(s), landscape, DAY);
    expect(view.roads[0]!.apples).toMatchObject({ trees: 2, bearing: 1, planting: null });
    const scene = view.scene.roadApples!;
    expect(scene.map((a) => [a.id - ROAD_TREE_ID_BASE, a.stage])).toEqual([
      [11, 'tree'],
      [12, 'tree'],
      [13, 'snag'],
    ]);
    expect(scene[0]!.growth).toBeLessThan(0.5);
    expect(scene[1]!.growth).toBe(1);
    // duben – bez jablek; v srpnu plodící jabloň jablka má, mladá ne
    expect(scene.some((a) => a.fruit)).toBe(false);
    const august = dayIndexOf({ year: 503, month: 8, day: 10 });
    const summer = sceneRoadApples(s, august, obstacleChangesAt(s, august));
    expect(summer.find((a) => a.id === ROAD_TREE_ID_BASE + 12)!.fruit).toBe(true);
    expect(summer.find((a) => a.id === ROAD_TREE_ID_BASE + 11)!.fruit).toBe(false);
  });

  it('výsadba jabloní: panel s průběhem a zašedlým tlačítkem, scéna vytyčená místa', () => {
    const s = withRoads();
    const option = buildVillageView(record(s), landscape, DAY).roads[0]!.apples.option;
    expect(option.blocked).toBeNull();
    expect(option.trees).toBeGreaterThan(3);
    const started = startRoadApples(s, DAY, 1, landscape, obstaclesOf(landscape));
    const view = buildVillageView(record(started), landscape, DAY);
    // duben – okno výsadby, nečeká se
    expect(view.roads[0]!.apples.planting).toEqual({
      trees: option.trees,
      progress: 0,
      waits: false,
    });
    expect(view.roads[0]!.apples.option.blocked).toMatch(/sázejí/);
    expect(view.scene.roadApples!.every((a) => a.stage === 'planting')).toBe(true);
    expect(view.constructions.at(-1)!.label).toBe('Jabloně u cesty');
  });

  it('ves bez pevných cest je ve scéně nemá', () => {
    const view = buildVillageView(record(settled()), landscape, DAY);
    expect(view.scene.roads).toBeUndefined();
    expect(view.scene.roadTrees).toBeUndefined();
    expect(view.scene.roadApples).toBeUndefined();
  });
});

describe('buildVillageView – víc vsí a přestěhování (migration.md)', () => {
  it('id vsi a sídla; bez seznamu vsí přepínač ukáže jen tuhle ves', () => {
    const view = buildVillageView(record(), landscape, DAY);
    expect(view.id).toBe('v-1');
    expect(view.settlementId).toBe('s-1');
    expect(view.villages).toEqual([
      {
        id: 'v-1',
        settlementId: 's-1',
        name: 'Libice',
        people: 4,
        extinct: false,
        abandoned: false,
        travelling: false,
        hungry: false,
        starving: false,
      },
    ]);
  });

  it('přestěhování domácnosti: cena bez lidí k osídlení, průběh a stavba u domácnosti', () => {
    const s = settled();
    s.woodLogs = 20;
    const before = buildVillageView(record(s), landscape, DAY);
    // nové obydlí nemá kdo osídlit, přestěhovat se domácnost může
    expect(before.build.zemnice.affordable).toBe(false);
    expect(before.relocation.zemnice).toMatchObject({ affordable: true, blocked: null });
    expect(before.relocation.zemnice.upfront).toEqual([
      { resource: 'wood', amount: 7, missing: 0 },
    ]);
    expect(before.households[0]?.relocationBlock).toBeNull();
    const moving = startRelocation(s, DAY, 1, 'zemnice', { x: 60, z: 60, rotation: 0 }, 0);
    const view = buildVillageView(record(moving), landscape, DAY);
    const site = view.constructions.find((c) => c.relocates === 1);
    expect(site).toMatchObject({ kind: 'dwelling', dwellingType: 'zemnice', progress: 0 });
    expect(view.households[0]).toMatchObject({
      relocation: { constructionId: site?.id, type: 'zemnice', progress: 0 },
      relocationBlock: 'relocating',
    });
    expect(view.chronicle[0]?.text).toBe(
      'Domácnost si začala stavět novou zemnici – přestěhuje se.',
    );
  });
});

describe('buildVillageView – uhlíř (crafts.md – Uhlíř)', () => {
  /** Ves s uhlířem (id 50) – milíř podle `kiln`, pařez 7 se sazenicí. */
  const burnerVillage = (
    kiln: NonNullable<VillageState['dwellings'][number]['workshop']>['kiln'],
  ): VillageState => {
    const s = settled();
    s.dwellings.push({
      id: 50,
      type: 'zemnice',
      builtDay: DAY,
      condition: 1,
      position: { x: 40, z: 0, rotation: 0 },
      workshop: { craft: 'burner', felling: null, fuelKg: 0, activity: 'burning', kiln },
    });
    s.people.push({ id: 90, bornDay: DAY - 9000, dwellingId: 50 });
    s.felledTrees = [{ id: 7, day: DAY - 3650, planted: DAY - 3650 }];
    return s;
  };
  const kiln = (site: { x: number; z: number } | null) => ({
    site,
    trees: [{ id: null, cost: 2 }],
    stage: 'burn' as const,
    prepared: 1,
    done: 4,
  });

  it('milíř u dílny při pálení kouří z dílny, lesní milíř je ve scéně zvlášť', () => {
    const home = buildVillageView(record(burnerVillage(kiln(null))), landscape, DAY);
    expect(home.scene.dwellings.find((d) => d.id === 50)).toMatchObject({ working: true });
    expect(home.scene.kilns).toBeUndefined();
    const forest = buildVillageView(record(burnerVillage(kiln({ x: 90, z: 10 }))), landscape, DAY);
    expect(forest.scene.dwellings.find((d) => d.id === 50)?.working).toBeUndefined();
    expect(forest.scene.kilns).toEqual([{ id: 50, x: 90, z: 10, stage: 'burn', progress: 0.5 }]);
    const workshop = forest.crafts.workshops.find((w) => w.dwellingId === 50);
    expect(workshop?.kiln).toMatchObject({ stage: 'burn', forest: true, progress: 0.5 });
  });

  it('mladé buky od uhlíře rostou – velikost podle stáří (za 60 let dospělé)', () => {
    const view = buildVillageView(record(burnerVillage(null)), landscape, DAY);
    const sapling = view.scene.plantedSaplings?.find((p) => p.id === 7);
    expect(sapling?.growth).toBeCloseTo(10 / 60, 1);
  });
});

describe('opuštěné stavby v pohledu na ves (abandonment.md)', () => {
  it('stav a opuštění v panelu, stupeň ve scéně, zbytky padlých model a kronika pádu', () => {
    const s = settled();
    s.livestock = {
      herds: { sheep: 0, goat: 0, pig: 0, cow: 0 },
      young: { sheep: 0, goat: 0, pig: 0, cow: 0 },
    };
    const yearDays = 365.25;
    s.sacredBuildings = [
      {
        id: 40,
        kind: 'idol',
        position: { x: 60, z: 0, rotation: 0 },
        builtDay: DAY - 3000,
        // opuštěná před 5 lety z plného stavu – modla padne za 20 let
        wear: { condition: 1, abandonedDay: DAY - Math.round(5 * yearDays) },
      },
    ];
    s.sacredRuins = [
      {
        id: 39,
        kind: 'shrine',
        position: { x: 0, z: 90, rotation: 0 },
        day: DAY - Math.round(4 * yearDays),
      },
    ];
    s.pens = [
      {
        id: 70,
        cell: { x: 2, y: 2 },
        x: -82.5,
        z: -82.5,
        builtDay: DAY - 4000,
        team: null,
        training: null,
        wear: { condition: 0.3 },
      },
    ];
    s.chronicle.push({ day: DAY - 1, kind: 'structure-fell', structure: 'pen', id: 71 });
    const view = buildVillageView(record(s), landscape, DAY);
    const idol = view.sacred.buildings.find((b) => b.id === 40)!;
    expect(idol.abandoned).toBe(true);
    expect(idol.condition).toBeCloseTo(0.75, 2);
    expect(view.scene.sacred!.buildings[0]).toMatchObject({ condition: 0.75, abandoned: true });
    expect(view.scene.sacred!.ruins).toEqual([
      { id: 39, kind: 'shrine', position: { x: 0, z: 90, rotation: 0 }, overgrowth: 0.2 },
    ]);
    expect(view.pens[0]).toMatchObject({ condition: 0.3, abandoned: false });
    expect(view.scene.pens![0]).toMatchObject({ condition: 0.3, stocked: false });
    const fell = view.chronicle.find((e) => e.kind === 'structure-fell')!;
    expect(fell.structure).toBe('pen');
    expect(fell.text).toBe('Opuštěná ohrada se rozpadla.');
  });

  it('oprava (abandonment.md – Oprava): průběh v panelu, studená ohniště svatyně, kronika', () => {
    const s = settled();
    s.sacredBuildings = [
      {
        id: 41,
        kind: 'shrine',
        position: { x: 0, z: 90, rotation: 0 },
        builtDay: DAY - 9000,
        wear: { condition: 0.8 },
      },
    ];
    s.pens = [
      {
        id: 70,
        cell: { x: 2, y: 2 },
        x: -82.5,
        z: -82.5,
        builtDay: DAY - 4000,
        team: null,
        training: null,
        wear: { condition: 0.3 },
      },
    ];
    const repair = (id: number, structure: 'shrine' | 'pen', from: number, done: number) => ({
      id,
      kind: 'repair' as const,
      startedDay: DAY - 10,
      cost: 10,
      done,
      dwellingType: null,
      position: null,
      dwellingId: null,
      fieldId: null,
      repair: { structure, id: structure === 'shrine' ? 41 : 70, from },
    });
    s.constructions.push(repair(500, 'shrine', 0.6, 5), repair(501, 'pen', 0.3, 0));
    s.chronicle.push({ day: DAY - 1, kind: 'structure-repaired', structure: 'idol', id: 40 });
    const view = buildVillageView(record(s), landscape, DAY);
    const shrine = view.sacred.buildings.find((b) => b.id === 41)!;
    expect(shrine).toMatchObject({ condition: 0.8, abandoned: false, repair: 0.5 });
    expect(view.pens[0]).toMatchObject({ condition: 0.3, repair: 0 });
    // stav roste s prací, ohniště se rozhoří až po opravě
    expect(view.scene.sacred!.buildings[0]).toMatchObject({ condition: 0.8, repairing: true });
    expect(view.scene.sacred!.buildings[0]).not.toHaveProperty('abandoned');
    const label = view.constructions.find((c) => c.id === 500)!;
    expect(label.label).toBe('Oprava – svatyně');
    const repaired = view.chronicle.find((e) => e.kind === 'structure-repaired')!;
    expect(repaired.structure).toBe('idol');
    expect(repaired.text).toBe('Vesničané modlu znovu usadili a opravili.');
  });
});

describe('buildVillageView – odchod do nové vsi (migration.md – fáze 3 a 4)', () => {
  it('opuštěná ves: roky, žádné stavby k nabídce, domy chátrají podle dne odchodu', () => {
    const s = settled();
    s.people = [];
    s.abandonedDay = DAY;
    const view = buildVillageView(record(s), landscape, DAY + 2 * 365);
    expect(view.abandoned).toEqual({ foundedYear: 503, abandonedYear: 503, years: 0 });
    expect(view.extinct).toBeNull();
    expect(view.scene.dwellings[0]!.condition).toBeLessThan(1);
    const later = buildVillageView(record(s), landscape, DAY + 6 * 365);
    expect(later.scene.dwellings).toEqual([]);
    expect(later.scene.ruins?.length).toBe(1);
  });

  it('lidé na cestě: kam a za kolik dní, ves zatím bez staveb', () => {
    const s = state();
    s.constructions = [];
    s.journey = { direction: 'N', departedDay: DAY, arrivalDay: DAY + 2 };
    const view = buildVillageView(record(s), landscape, DAY + 1);
    expect(view.journey).toEqual({
      direction: 'N',
      arrivalDay: DAY + 2,
      arrived: false,
      daysLeft: 1,
    });
    expect(view.scene.dwellings).toEqual([]);
  });

  it('jiná ves na téže mapě: její stavby pro scénu, paseky a vlastní vsi kolem po směrech', () => {
    const other = settled();
    other.clearedObstacles = [{ id: 4242, day: DAY }];
    const neighbourScene = buildVillageView(record(other), landscape, DAY).scene;
    const view = buildVillageView(record(settled()), landscape, DAY, {
      neighbours: neighbourSnapshot([other], DAY),
      neighbourScenes: [{ dwellings: neighbourScene.dwellings, fields: neighbourScene.fields }],
      ownMaps: { S: 'Budeč' },
    });
    expect(view.scene.neighbours).toHaveLength(1);
    expect(view.scene.obstacles?.removed).toContain(4242);
    expect(view.leave.directions.find((d) => d.direction === 'S')!.blocked).toMatch(/Budeč/);
    // kontrola umístění v prohlížeči zná cizí půdu
    const placement = placementVillageFromScene(view.scene);
    expect(placement.foreign?.dwellings).toHaveLength(1);
    expect(placement.foreign?.cells.length).toBeGreaterThan(0);
  });
});
