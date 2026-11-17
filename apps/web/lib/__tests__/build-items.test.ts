import { describe, expect, it } from 'vitest';
import {
  cemeteryPartsFromCells,
  checkDwellingPlacement,
  dwellingBuildLabor,
  fieldPartsFromCells,
  sacredBuildLabor,
  workshopLaborManDays,
  workshopTrees,
  threshingFloorBuildLabor,
  orchardPartsFromCells,
  packObstacles,
  penSquaresFromCells,
  type Landscape,
  type ObstaclePlacement,
  type PlacementVillage,
} from '@bohemia/game';
import {
  BUILD_ITEMS,
  PEN_VARIANTS,
  buildItem,
  buildItemForKey,
  buildVariantName,
  dwellingPlacementCost,
  penPlacementCost,
  WORKSHOP_VARIANTS,
  penVariantSpecies,
  workshopChoice,
} from '../build-items';

const key = (
  code: string,
  modifiers: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
});

describe('zkratky staveb', () => {
  it('Z zemnice, X polozemnice, C pole, V hřbitov, B sad – nekolidují s kamerou (WASD, Q/E, R)', () => {
    expect(buildItemForKey(key('KeyZ'))?.kind).toBe('zemnice');
    expect(buildItemForKey(key('KeyX'))?.kind).toBe('polozemnice');
    expect(buildItemForKey(key('KeyC'))?.kind).toBe('field');
    expect(buildItemForKey(key('KeyV'))?.kind).toBe('cemetery');
    expect(buildItemForKey(key('KeyB'))?.kind).toBe('orchard');
    expect(buildItemForKey(key('KeyN'))?.kind).toBe('idol');
    expect(buildItemForKey(key('KeyM'))?.kind).toBe('shrine');
    expect(buildItemForKey(key('KeyK'))?.kind).toBe('threshing-floor');
    // rozcestníky (obydlí, posvátná místa) zkratku nemají – sdílí zástupnou 'None'
    const keyed = BUILD_ITEMS.filter((item) => item.hotkey !== 'None');
    expect(new Set(keyed.map((item) => item.hotkey)).size).toBe(keyed.length);
    const camera = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR'];
    expect(BUILD_ITEMS.filter((item) => camera.includes(item.hotkey))).toEqual([]);
  });

  it('obydlí jsou jeden rozcestník, zkratky Z, X, 2 a 1 dál vybírají druh rovnou', () => {
    const hub = BUILD_ITEMS.find((i) => i.kind === 'dwelling');
    expect(hub).toMatchObject({ placement: 'dwellings', name: 'Obydlí' });
    expect(hub?.placement === 'dwellings' && hub.variants.map((v) => v.id)).toEqual([
      'zemnice',
      'polozemnice',
      'vypleteny',
      'srub',
    ]);
    // druhy nemají vlastní tlačítko, zkratky ano
    expect(BUILD_ITEMS.filter((i) => i.hubOf === 'dwelling').map((i) => i.kind)).toEqual([
      'zemnice',
      'polozemnice',
      'vypleteny',
      'srub',
    ]);
    expect(buildItemForKey(key('KeyZ'))?.kind).toBe('zemnice');
    expect(buildItemForKey(key('KeyX'))?.kind).toBe('polozemnice');
    expect(buildItemForKey(key('Digit2'))?.kind).toBe('vypleteny');
    expect(buildItemForKey(key('Digit1'))?.kind).toBe('srub');
    // rozcestník sám zkratku nespustí
    expect(buildItemForKey(key('None'))).toBeNull();
  });

  it('posvátná místa jsou jeden rozcestník, zkratky N, M, I a Y dál vybírají druh rovnou', () => {
    const hub = BUILD_ITEMS.find((i) => i.kind === 'sacred-hub');
    expect(hub).toMatchObject({ placement: 'sacred-hub', name: 'Posvátná místa' });
    expect(hub?.placement === 'sacred-hub' && hub.variants.map((v) => v.id)).toEqual([
      'idol',
      'shrine',
      'church-small',
      'church-large',
    ]);
    expect(BUILD_ITEMS.filter((i) => i.hubOf === 'sacred-hub').map((i) => i.kind)).toEqual([
      'idol',
      'shrine',
      'church-small',
      'church-large',
    ]);
    expect(buildItemForKey(key('KeyN'))?.kind).toBe('idol');
    expect(buildItemForKey(key('KeyI'))?.kind).toBe('church-small');
    expect(buildItemForKey(key('KeyY'))?.kind).toBe('church-large');
  });

  it('1 nadzemní dům – za polozemnicí, na pozemku s plotem (log-house.md – Dům)', () => {
    const item = buildItemForKey(key('Digit1'));
    expect(item?.kind).toBe('srub');
    expect(item).toMatchObject({
      name: 'Srub',
      icon: 'srub',
      hotkeyLabel: '1',
      placement: 'plot',
      dwellingType: 'srub',
    });
    const kinds = BUILD_ITEMS.map((i) => i.kind);
    expect(kinds.indexOf('srub')).toBe(kinds.indexOf('vypleteny') + 1);
    expect(buildItemForKey(key('Digit1', { shiftKey: true }))).toBeNull();
  });

  it('2 vypletený dům – za polozemnicí, na pozemku s plotem (log-house.md – Dům s vypletenými stěnami)', () => {
    const item = buildItemForKey(key('Digit2'));
    expect(item).toMatchObject({
      kind: 'vypleteny',
      name: 'Vypletený dům',
      icon: 'vypleteny',
      hotkeyLabel: '2',
      placement: 'plot',
      dwellingType: 'vypleteny',
    });
    const kinds = BUILD_ITEMS.map((i) => i.kind);
    expect(kinds.indexOf('vypleteny')).toBe(kinds.indexOf('polozemnice') + 1);
  });

  it('s modifikátorem nic (Ctrl+Z vrací tah pole)', () => {
    expect(buildItemForKey(key('KeyZ', { ctrlKey: true }))).toBeNull();
    expect(buildItemForKey(key('KeyZ', { metaKey: true }))).toBeNull();
    expect(buildItemForKey(key('KeyZ', { shiftKey: true }))).toBeNull();
    expect(buildItemForKey(key('KeyQ'))).toBeNull();
  });
});

describe('hřbitov', () => {
  const SIZE = 32;
  const landscape: Landscape = {
    size: SIZE,
    cellSizeM: 15,
    heights: new Float32Array(SIZE * SIZE),
    surface: new Uint8Array(SIZE * SIZE).fill(2),
    fertility: new Uint8Array(SIZE * SIZE).fill(50),
    villageSite: { x: 16, y: 16 },
    stream: [],
    obstacleLayer: null,
  };
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: { x: 0, z: 0, rotation: 0 } }],
    constructions: [],
    parts: [],
  };
  const item = buildItem('cemetery');

  it('maluje se po čtvercích; blízko obydlí jen varuje', () => {
    if (item.placement !== 'squares') throw new Error('Hřbitov se maluje po čtvercích.');
    const near = item.check(landscape, village, [{ x: 18, y: 16 }]);
    expect(near.check.ok).toBe(true);
    expect(near.check.warning).toMatch(/^Blízko obydlí \(\d+ m\)$/);
    expect(near.warningCells).toEqual([{ x: 18, y: 16 }]);
    const far = item.check(landscape, village, [{ x: 30, y: 30 }]);
    expect(far.check.ok).toBe(true);
    expect(far.check.warning).toBeUndefined();
    const over = item.check(landscape, village, [{ x: 16, y: 16 }]);
    expect(over.check.reason).toBe('Hřbitov se překrývá s obydlím.');
  });
});

describe('sad', () => {
  const SIZE = 32;
  const landscape: Landscape = {
    size: SIZE,
    cellSizeM: 15,
    heights: new Float32Array(SIZE * SIZE),
    surface: new Uint8Array(SIZE * SIZE).fill(2),
    fertility: new Uint8Array(SIZE * SIZE).fill(50),
    villageSite: { x: 16, y: 16 },
    stream: [],
    obstacleLayer: null,
  };
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: { x: 0, z: 0, rotation: 0 } }],
    constructions: [],
    parts: [{ cell: { x: 20, y: 20 } }],
  };
  const item = buildItem('orchard');

  it('maluje se po čtvercích jako pole – i jeden čtverec, ne přes obydlí; pole jen varuje', () => {
    if (item.placement !== 'squares') throw new Error('Sad se maluje po čtvercích.');
    expect(item.icon).toBe('sad');
    expect(item.check(landscape, village, [{ x: 18, y: 18 }]).check).toEqual({
      ok: true,
      reason: null,
    });
    // na pole sad smí (fields.md – Pole jako krajina) – čtverec pole oranžově, u kurzoru varování
    const over = item.check(landscape, village, [{ x: 20, y: 20 }]);
    expect(over.check).toMatchObject({ ok: true, warning: 'Pole se zmenší' });
    expect(over.blockedCells).toEqual([]);
    expect(over.warningCells).toEqual([{ x: 20, y: 20 }]);
    expect(item.check(landscape, village, [{ x: 16, y: 16 }]).check.reason).toBe(
      'Sad se překrývá s obydlím.',
    );
  });
});

describe('cena u kurzoru', () => {
  const SIZE = 32;
  const landscape: Landscape = {
    size: SIZE,
    cellSizeM: 15,
    heights: new Float32Array(SIZE * SIZE),
    surface: new Uint8Array(SIZE * SIZE).fill(2),
    fertility: new Uint8Array(SIZE * SIZE).fill(50),
    villageSite: { x: 16, y: 16 },
    stream: [],
    obstacleLayer: null,
  };
  const home = { x: 0, z: 0, rotation: 0 };
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: home }],
    constructions: [],
    parts: [],
  };
  const homes = [home];
  // pole musí mít aspoň 5 čtverců
  const cells = [24, 25, 26, 27, 28].map((x) => ({ x, y: 24 }));

  it('pole, sad a hřbitov: práce celkem (i s překážkami), jen u prošlého umístění', () => {
    const expected = {
      field: fieldPartsFromCells(landscape, village, cells, homes).foundingCost,
      orchard: orchardPartsFromCells(landscape, village, cells, homes).plantingCost,
      cemetery: cemeteryPartsFromCells(landscape, village, cells, homes).foundingCost,
    };
    for (const kind of ['field', 'orchard', 'cemetery'] as const) {
      const item = buildItem(kind);
      if (item.placement !== 'squares') throw new Error(`${kind} se maluje po čtvercích.`);
      const ok = item.check(landscape, village, cells);
      expect(ok.check.ok).toBe(true);
      expect(ok.cost).toEqual({ laborManDays: expected[kind], trees: 0 });
      expect(expected[kind]).toBeGreaterThan(0);
      expect(item.check(landscape, village, []).cost).toBeNull();
    }
  });

  it('obydlí: stavba a překážky, dřevo z hromady klád práci nestojí; neprošlé bez ceny', () => {
    const item = buildItem('zemnice');
    if (item.placement !== 'footprint') throw new Error('Zemnice se umisťuje půdorysem.');
    const position = { x: 60, z: 0, rotation: 0 };
    const placed = checkDwellingPlacement(landscape, village, 'zemnice', position);
    const ok = item.check(landscape, village, position, 7);
    expect(ok.ok).toBe(true);
    expect(ok.cost).toEqual({
      laborManDays: dwellingBuildLabor('zemnice') + placed.obstacleCost,
      trees: 0,
    });
    const over = item.check(landscape, village, home, 7);
    expect(over.ok).toBe(false);
    expect(over.cost).toBeNull();
  });

  it('obydlí bez dost klád: skácí nejbližší dospělé stromy – kácení v ceně, stromy u ikony', () => {
    const tree = (id: number, x: number, z: number): ObstaclePlacement => ({
      id,
      kind: 'tree',
      look: 'beech-1',
      x,
      z,
      rotation: 0,
      scale: 1,
    });
    // pět stromů blízko (do 100 m – 2 člověkodny za strom), pět daleko (300 m – o 20 % dráž)
    const forest = packObstacles(
      [
        ...[1, 2, 3, 4, 5].map((id) => tree(id, 50, id * 4)),
        ...[6, 7, 8, 9, 10].map((id) => tree(id, 300, id * 4 - 20)),
      ],
      SIZE,
      15,
    );
    const position = { x: 0, z: 0, rotation: 0 };
    const site = { obstacleCost: 3, obstacleIds: [], clearedTrees: 0 };
    const base = dwellingBuildLabor('zemnice') + 3;
    const cost = (
      logs: number,
      v: PlacementVillage = village,
    ): ReturnType<typeof dwellingPlacementCost> =>
      dwellingPlacementCost(landscape, v, 'zemnice', position, site, logs, forest);
    expect(cost(2)).toEqual({ laborManDays: base + 5 * 2, trees: 5 });
    expect(cost(7)).toEqual({ laborManDays: base, trees: 0 });
    // stromy vyhrazené jinou stavbou se nekácí – vezmou se vzdálenější
    const far = cost(2, { ...village, reservedTrees: [1, 2, 3, 4, 5] });
    expect(far.trees).toBe(5);
    expect(far.laborManDays).toBeGreaterThan(base + 5 * 2 * 1.19);
    // stromy z vyklízené plochy jdou nejdřív na hromadu
    const cleared = dwellingPlacementCost(
      landscape,
      village,
      'zemnice',
      position,
      { obstacleCost: 3, obstacleIds: [1, 2], clearedTrees: 2 },
      2,
      forest,
    );
    expect(cleared.trees).toBe(3);
  });
});

describe('modla a svatyně', () => {
  const SIZE = 32;
  const landscape: Landscape = {
    size: SIZE,
    cellSizeM: 15,
    heights: new Float32Array(SIZE * SIZE),
    surface: new Uint8Array(SIZE * SIZE).fill(2),
    fertility: new Uint8Array(SIZE * SIZE).fill(50),
    villageSite: { x: 16, y: 16 },
    stream: [],
    obstacleLayer: null,
  };
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: { x: 0, z: 0, rotation: 0 } }],
    constructions: [],
    parts: [],
  };

  it('půdorys u kurzoru jako obydlí; cena práce bez dubů (krajina bez stromů), přes obydlí ne', () => {
    for (const kind of ['idol', 'shrine'] as const) {
      const item = buildItem(kind);
      if (item.placement !== 'sacred') throw new Error('Modla a svatyně se umisťují půdorysem.');
      expect(item.sacredKind).toBe(kind);
      const free = item.check(landscape, village, { x: 60, z: 60, rotation: 0 });
      expect(free.ok).toBe(true);
      expect(free.cost).toEqual({ laborManDays: sacredBuildLabor(kind), trees: 0, oaks: 0 });
      const over = item.check(landscape, village, { x: 0, z: 0, rotation: 0 });
      expect(over.ok).toBe(false);
      expect(over.cost).toBeNull();
    }
  });

  it('svatyně je jedna na ves', () => {
    const item = buildItem('shrine');
    if (item.placement !== 'sacred') throw new Error('Svatyně se umisťuje půdorysem.');
    const withShrine: PlacementVillage = {
      ...village,
      sacredBuildings: [{ kind: 'shrine', position: { x: -100, z: -100, rotation: 0 } }],
    };
    expect(item.check(landscape, withShrine, { x: 60, z: 60, rotation: 0 }).ok).toBe(false);
  });
});

describe('humno (production-chains.md – Humno)', () => {
  const SIZE = 32;
  const landscape: Landscape = {
    size: SIZE,
    cellSizeM: 15,
    heights: new Float32Array(SIZE * SIZE),
    surface: new Uint8Array(SIZE * SIZE).fill(2),
    fertility: new Uint8Array(SIZE * SIZE).fill(50),
    villageSite: { x: 16, y: 16 },
    stream: [],
    obstacleLayer: null,
  };
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: { x: 0, z: 0, rotation: 0 } }],
    constructions: [],
    parts: [],
  };

  it('půdorys u kurzoru jako dílna; dřevo z hromady práci nestojí, přes obydlí ne', () => {
    const item = buildItem('threshing-floor');
    if (item.placement !== 'threshing-floor') throw new Error('Humno se umisťuje půdorysem.');
    expect(item).toMatchObject({ name: 'Humno', icon: 'humno', hotkeyLabel: 'K' });
    const free = item.check(landscape, village, { x: 60, z: 60, rotation: 0 }, 10);
    expect(free.ok).toBe(true);
    expect(free.cost).toEqual({ laborManDays: threshingFloorBuildLabor(), trees: 0 });
    const over = item.check(landscape, village, { x: 0, z: 0, rotation: 0 }, 10);
    expect(over.ok).toBe(false);
    expect(over.cost).toBeNull();
  });
});

describe('ohrada podle druhu (oxen.md – Ohrady podle druhu)', () => {
  const SIZE = 32;
  const landscape: Landscape = {
    size: SIZE,
    cellSizeM: 15,
    heights: new Float32Array(SIZE * SIZE),
    surface: new Uint8Array(SIZE * SIZE).fill(2),
    fertility: new Uint8Array(SIZE * SIZE).fill(50),
    villageSite: { x: 16, y: 16 },
    stream: [],
    obstacleLayer: null,
  };
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: { x: 0, z: 0, rotation: 0 } }],
    constructions: [],
    parts: [],
  };
  const item = buildItem('pen');
  if (item.placement !== 'squares') throw new Error('Ohrada se maluje po čtvercích.');

  it('druhy v rozcestníku: ovce, kozy, prasata, skot, voli, koně – s názvy ohrad', () => {
    expect(PEN_VARIANTS.map((v) => v.id)).toEqual([
      'sheep',
      'goat',
      'pig',
      'cattle',
      'team',
      'horse',
    ]);
    expect(item.variants).toBe(PEN_VARIANTS);
    expect(PEN_VARIANTS.map((v) => buildVariantName(item, v))).toEqual([
      'Ohrada ovcí',
      'Ohrada koz',
      'Ohrada prasat',
      'Ohrada skotu',
      'Ohrada volů',
      'Ohrada koní',
    ]);
    expect(PEN_VARIANTS.at(-1)!.name).toBe('Koně');
    // ikony zvířat – i u kurzoru
    expect(PEN_VARIANTS.map((v) => v.icon)).toEqual(['sheep', 'goat', 'pig', 'cow', 'ox', 'horse']);
    expect(penVariantSpecies(undefined)).toBe('sheep');
    expect(penVariantSpecies('team')).toBe('team');
    expect(penVariantSpecies('horse')).toBe('horse');
  });

  it('maluje se po čtvercích jako hřbitov – nejvýš 4, cena roste s čtverci', () => {
    const one = item.check(landscape, village, [{ x: 20, y: 20 }], undefined, 'pig');
    const two = item.check(
      landscape,
      village,
      [
        { x: 20, y: 20 },
        { x: 21, y: 20 },
      ],
      undefined,
      'pig',
    );
    expect(one.check.ok).toBe(true);
    expect(two.check.ok).toBe(true);
    // sdílená strana bez plotu (oxen.md – Plot podle délky): dva čtverce levněji než dvakrát jeden
    expect(two.cost!.laborManDays).toBeGreaterThan(one.cost!.laborManDays);
    expect(two.cost!.laborManDays).toBeLessThan(2 * one.cost!.laborManDays);
    const five = item.check(
      landscape,
      village,
      [20, 21, 22, 23, 24].map((x) => ({ x, y: 20 })),
      undefined,
      'pig',
    );
    expect(five.check.ok).toBe(false);
    expect(five.check.reason).toMatch(/nejvýš 4 čtverce/);
  });

  it('cena u kurzoru nese druh – ohrada koní 50 čd a 8 stromů na čtverec (horses.md)', () => {
    const cells = [{ x: 20, y: 20 }];
    const sheep = penSquaresFromCells(landscape, village, cells, 'sheep');
    const horse = penSquaresFromCells(landscape, village, cells, 'horse');
    const sheepCost = penPlacementCost(village, sheep, 'sheep');
    const horseCost = penPlacementCost(village, horse, 'horse');
    expect(horseCost.laborManDays).toBeGreaterThan(sheepCost.laborManDays);
    expect(penPlacementCost(village, horse).laborManDays).toBe(sheepCost.laborManDays);
  });

  it('nad ohradou téhož druhu ji rozšíří, jiný druh je nová ohrada vedle', () => {
    const withPen: PlacementVillage = {
      ...village,
      pens: [{ id: 7, species: 'sheep', cell: { x: 20, y: 20 } }],
    };
    const sheep = penSquaresFromCells(landscape, withPen, [{ x: 21, y: 20 }], 'sheep');
    expect(sheep.extendsPen).toBe(7);
    const goats = penSquaresFromCells(landscape, withPen, [{ x: 21, y: 20 }], 'goat');
    expect(goats.check.ok).toBe(true);
    expect(goats.extendsPen).toBeNull();
    // přes ohradu ne
    expect(item.check(landscape, withPen, [{ x: 20, y: 20 }], undefined, 'sheep').check.ok).toBe(
      false,
    );
  });
});

describe('řemeslná dílna – druhy (workshops.md)', () => {
  const SIZE = 32;
  const landscape: Landscape = {
    size: SIZE,
    cellSizeM: 15,
    heights: new Float32Array(SIZE * SIZE),
    surface: new Uint8Array(SIZE * SIZE).fill(2),
    fertility: new Uint8Array(SIZE * SIZE).fill(50),
    villageSite: { x: 16, y: 16 },
    stream: [],
    obstacleLayer: null,
  };
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: { x: 0, z: 0, rotation: 0 } }],
    constructions: [],
    parts: [],
  };
  const smith = buildItem('smith');
  if (smith.placement !== 'workshop') throw new Error('Kovář je dílna.');

  it('rozcestník: dnešní dílna, vypletená a roubená; uhlíř má zemnici', () => {
    expect(WORKSHOP_VARIANTS('smith')).toEqual([
      { id: 'polozemnice', icon: 'build/kovar', name: 'Polozemnice' },
      { id: 'vypleteny', icon: 'build/kovar-vypleteny', name: 'Vypletená' },
      { id: 'srub', icon: 'build/kovar-srub', name: 'Roubená' },
    ]);
    expect(WORKSHOP_VARIANTS('burner')[0]).toEqual({
      id: 'zemnice',
      icon: 'build/uhlir',
      name: 'Zemnice',
    });
    expect(buildVariantName(smith, WORKSHOP_VARIANTS('smith')[1]!)).toBe('Kovář – Vypletená');
  });

  it('do roku 750 tlačítko i klávesa staví rovnou dnešní dílnu, pak otevřou rozcestník', () => {
    const early = {
      variants: {
        vypleteny: { blocked: 'Od roku 750' },
        srub: { blocked: 'Od roku 800' },
      },
    };
    const mid = {
      variants: { vypleteny: { blocked: null }, srub: { blocked: 'Od roku 800' } },
    };
    expect(workshopChoice(smith, early as never)).toEqual({ kind: 'start', type: 'polozemnice' });
    expect(workshopChoice(smith, mid as never)).toEqual({ kind: 'hub' });
    expect(workshopChoice(smith, mid as never, 'vypleteny')).toEqual({
      kind: 'start',
      type: 'vypleteny',
    });
    // roubená před rokem 800 a neznámý druh (ruční volání) nejdou
    expect(workshopChoice(smith, mid as never, 'srub')).toEqual({ kind: 'denied' });
    expect(workshopChoice(smith, mid as never, 'zemnice')).toEqual({ kind: 'denied' });
    // klávesa G řemesla je rozcestník, ne druh
    expect(buildItemForKey(key('KeyG'))?.kind).toBe('smith');
  });

  it('cena u kurzoru vypletené kovárny = práce a stromy domu s přístřeškem', () => {
    const position = { x: 40, z: 40, rotation: 0 };
    const check = smith.check(landscape, village, position, 99, 'vypleteny');
    expect(check.ok).toBe(true);
    const plain = smith.check(landscape, village, position, 99);
    expect(check.cost!.laborManDays).toBeCloseTo(
      workshopLaborManDays('smith', 0, { fell: [] }, 'vypleteny'),
      6,
    );
    expect(check.cost!.laborManDays).not.toBe(plain.cost!.laborManDays);
    expect(workshopTrees('smith', 'vypleteny')).toBe(19);
    // stromy z plánu dřeva: klády na hromadě (99) kryjí všechno, nic se nekácí
    expect(check.cost!.trees).toBe(0);
  });
});
