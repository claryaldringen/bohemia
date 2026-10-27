import { describe, it, expect } from 'vitest';
import {
  HAY_WINTER_MONTHS,
  buildForestField,
  buildRelief,
  dateOfDayIndex,
  generateLandscape,
} from '@bohemia/game';
import {
  chickenBox,
  chickenPoint,
  chickensFor,
  herdCounts,
  householdCount,
  herderCount,
  livestockGround,
  grazingHorses,
  planLivestock,
  tendedHerds,
  type Herd,
  type LivestockGround,
  type LivestockVillage,
} from '../livestock-placement';
import { insidePlot, plotHouse } from '../homestead-layout';
import { GROUND, VILLAGE, dwelling, inSquares } from './livestock-fixtures';
import { buildRenderSurface } from '../render-surface';
import { tileCenter } from '../tile-at';

const species = (herds: Herd[], kind: Herd['kind'], name: string): number =>
  herds
    .filter((h) => h.kind === kind)
    .reduce((sum, h) => sum + h.animals.filter((a) => a.species === name).length, 0);

describe('planLivestock – kolik zvířat', () => {
  it('slepice: 2 u zemnice, 3 u polozemnice, jen u hotových obydlí', () => {
    expect(chickensFor('zemnice')).toBe(2);
    expect(chickensFor('polozemnice')).toBe(3);
    const village: LivestockVillage = {
      dwellings: [
        dwelling(1, 'zemnice', 0, 0),
        dwelling(2, 'polozemnice', 20, 0),
        dwelling(3, 'polozemnice', -20, 0, { built: false }),
      ],
      fields: [],
    };
    const plan = planLivestock(village, GROUND, 7);
    expect(plan.chickens.map((f) => f.chickens.length).sort()).toEqual([2, 3]);
  });

  it('na domácnost 3 ovce, koza a 2 prasata, kráva na dvě domácnosti', () => {
    const plan = planLivestock(VILLAGE, GROUND, 7);
    expect(householdCount(VILLAGE)).toBe(4);
    expect(species(plan.herds, 'flock', 'sheep')).toBe(12);
    expect(species(plan.herds, 'flock', 'goat')).toBe(4);
    expect(species(plan.herds, 'cattle', 'cow')).toBe(2);
    expect(species(plan.herds, 'swine', 'pig')).toBe(8);
  });

  it('neobývané obydlí nemá dobytek (slepice ano), víc domácností = víc stád', () => {
    const village: LivestockVillage = {
      dwellings: [
        ...Array.from({ length: 7 }, (_, i) => dwelling(i + 1, 'zemnice', i * 13 - 40, 0)),
        dwelling(9, 'zemnice', 0, 20, { inhabited: false }),
      ],
      fields: [],
    };
    const plan = planLivestock(village, GROUND, 3);
    expect(plan.chickens).toHaveLength(8);
    expect(plan.herds.filter((h) => h.kind === 'flock')).toHaveLength(2);
    expect(species(plan.herds, 'flock', 'sheep')).toBe(21);
    expect(species(plan.herds, 'flock', 'goat')).toBe(7);
    expect(species(plan.herds, 'cattle', 'cow')).toBe(4);
    expect(species(plan.herds, 'swine', 'pig')).toBe(14);
  });

  it('skutečné počty stád od jádra (diet.md) místo odvození z domácností', () => {
    const village: LivestockVillage = {
      ...VILLAGE,
      livestock: { sheep: 30.4, goat: 6, pig: 3, cow: 0 },
    };
    expect(herdCounts(village)).toEqual({ sheep: 30, goat: 6, pig: 3, cow: 0 });
    const plan = planLivestock(village, GROUND, 7);
    expect(species(plan.herds, 'flock', 'sheep')).toBe(30);
    expect(species(plan.herds, 'flock', 'goat')).toBe(6);
    // stádo nejvýš po 20 kusech – 36 ovcí a koz jsou dvě stáda
    expect(plan.herds.filter((h) => h.kind === 'flock')).toHaveLength(2);
    expect(species(plan.herds, 'swine', 'pig')).toBe(3);
    // krávy v ohradě (v zimě) se nepasou
    expect(plan.herds.filter((h) => h.kind === 'cattle')).toHaveLength(0);
  });

  it('bez obydlí nic, rozmístění je deterministické', () => {
    expect(planLivestock({ dwellings: [], fields: [] }, GROUND, 1)).toEqual({
      chickens: [],
      herds: [],
    });
    expect(planLivestock(VILLAGE, GROUND, 11)).toEqual(planLivestock(VILLAGE, GROUND, 11));
  });
});

describe('planLivestock – kde', () => {
  const plan = planLivestock(VILLAGE, GROUND, 7);

  it('slepice chodí kolem domu, ne v něm ani v šíji, a ne do jiného domu', () => {
    for (const flock of plan.chickens) {
      const box = chickenBox(VILLAGE.dwellings.find((d) => d.position === flock.position)!.type);
      for (let i = 0; i < 64; i++) {
        const theta = flock.arc
          ? flock.arc.from + ((flock.arc.to - flock.arc.from) * i) / 63
          : (i / 64) * Math.PI * 2;
        for (const d of [flock.reachM.from, flock.reachM.to]) {
          const [x, z] = chickenPoint(flock, theta, d);
          const c = Math.cos(flock.position.rotation);
          const s = Math.sin(flock.position.rotation);
          const lx = (x - flock.position.x) * c - (z - flock.position.z) * s;
          const lz = (x - flock.position.x) * s + (z - flock.position.z) * c;
          const inside = Math.abs(lx) < box.halfX && lz > box.minZ && lz < box.maxZ;
          expect(inside).toBe(false);
        }
      }
    }
  });

  it('slepice polozemnice zůstávají uvnitř plotu pozemku – uprostřed i v rohu', () => {
    for (const variant of ['center', 'back-left', 'front-right'] as const) {
      const plot = { x: 0, z: 0, size: 15, variant };
      const house = plotHouse(plot, variant);
      const village: LivestockVillage = {
        dwellings: [{ ...dwelling(1, 'polozemnice', house.x, house.z), position: house, plot }],
        fields: [],
      };
      const [flock] = planLivestock(village, GROUND, 3).chickens;
      expect(flock, variant).toBeDefined();
      const samples = flock!.arc
        ? Array.from(
            { length: 41 },
            (_, i) => flock!.arc!.from + ((flock!.arc!.to - flock!.arc!.from) * i) / 40,
          )
        : Array.from({ length: 40 }, (_, i) => (i / 40) * Math.PI * 2);
      for (const theta of samples) {
        for (const d of [flock!.reachM.from, flock!.reachM.to]) {
          const [x, z] = chickenPoint(flock!, theta, d);
          expect(insidePlot(plot, x, z), `${variant} ${theta}`).toBe(true);
        }
      }
    }
  });

  it('cizí slepice do oploceného pozemku nechodí', () => {
    const plot = { x: 12, z: 0, size: 15, variant: 'center' as const };
    const village: LivestockVillage = {
      dwellings: [
        dwelling(1, 'zemnice', 0, 0),
        { ...dwelling(2, 'polozemnice', 12, 0), position: plotHouse(plot, 'center'), plot },
      ],
      fields: [],
    };
    const flock = planLivestock(village, GROUND, 3).chickens.find((f) => f.position.x === 0)!;
    expect(flock.arc).not.toBeNull();
    for (let i = 0; i <= 40; i++) {
      const theta = flock.arc!.from + ((flock.arc!.to - flock.arc!.from) * i) / 40;
      for (const d of [flock.reachM.from, flock.reachM.to]) {
        const [x, z] = chickenPoint(flock, theta, d);
        expect(insidePlot(plot, x, z)).toBe(false);
      }
    }
  });

  it('slepice se vyhnou sousednímu domu – u těsně postavených domů jen v oblouku', () => {
    const village: LivestockVillage = {
      dwellings: [dwelling(1, 'zemnice', 0, 0), dwelling(2, 'zemnice', 8, 0)],
      fields: [],
    };
    const tight = planLivestock(village, GROUND, 5);
    for (const flock of tight.chickens) {
      expect(flock.arc).not.toBeNull();
      const other = village.dwellings.find((d) => d.position !== flock.position)!;
      const box = chickenBox('zemnice');
      for (let i = 0; i <= 20; i++) {
        const theta = flock.arc!.from + ((flock.arc!.to - flock.arc!.from) * i) / 20;
        for (const d of [flock.reachM.from, flock.reachM.to]) {
          const [x, z] = chickenPoint(flock, theta, d);
          const lx = x - other.position.x;
          const lz = z - other.position.z;
          expect(Math.abs(lx) < box.halfX && lz > box.minZ && lz < box.maxZ).toBe(false);
        }
      }
    }
  });

  it('stáda se pasou na louce, dál od obydlí, mimo pole, hřbitov a vodu', () => {
    for (const herd of plan.herds.filter((h) => h.kind !== 'swine')) {
      expect(herd.route.length).toBeGreaterThan(20);
      for (const spot of herd.route) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const x = spot.x + Math.cos(a) * herd.radiusM;
          const z = spot.z + Math.sin(a) * herd.radiusM;
          expect(GROUND.pasture(x, z)).toBe(true);
          expect(inSquares(VILLAGE, x, z)).toBe(false);
        }
        for (const d of VILLAGE.dwellings) {
          expect(Math.hypot(spot.x - d.position.x, spot.z - d.position.z)).toBeGreaterThan(12);
        }
        expect(Math.hypot(spot.x, spot.z)).toBeLessThanOrEqual(300);
      }
    }
  });

  it('trasa vede po sousedních pastvinách (krok 6–22 m)', () => {
    for (const herd of plan.herds) {
      for (let i = 1; i < herd.route.length; i++) {
        const a = herd.route[i - 1]!;
        const b = herd.route[i]!;
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        expect(d).toBeGreaterThanOrEqual(6);
        expect(d).toBeLessThanOrEqual(22);
      }
    }
  });

  it('prasata jsou v lese u okraje do 150 m od vsi', () => {
    const swine = plan.herds.filter((h) => h.kind === 'swine');
    expect(swine.length).toBeGreaterThan(0);
    for (const herd of swine) {
      for (const spot of herd.route) {
        expect(GROUND.forestEdge(spot.x, spot.z)).toBe(true);
        expect(Math.hypot(spot.x - 1.25, spot.z + 1.5)).toBeLessThanOrEqual(155);
      }
    }
  });

  it('bez louky a lesa stáda nejsou (slepice ano)', () => {
    const bare: LivestockGround = {
      pasture: () => false,
      forestEdge: () => false,
      walkable: () => true,
    };
    const empty = planLivestock(VILLAGE, bare, 7);
    expect(empty.herds).toEqual([]);
    expect(empty.chickens.length).toBe(4);
  });
});

describe('planLivestock – pastva na úhoru', () => {
  // úhor 4 × 3 čtverce na louce západně od vsi, vedle osetý díl; ves bez pole u vsi
  const fallowParts = Array.from({ length: 12 }, (_, i) => ({
    x: -120 + (i % 4) * 15,
    z: -30 + Math.floor(i / 4) * 15,
    size: 15,
    stage: 'young-fallow' as const,
  }));
  const sown = { x: -45, z: -15, size: 15, stage: 'sown' as const };
  const village = (stage: 'young-fallow' | 'meadow', day?: number): LivestockVillage => ({
    ...VILLAGE,
    fields: [{ parts: [...fallowParts.map((p) => ({ ...p, stage })), sown] }],
    ...(day !== undefined ? { labor: { day } } : {}),
  });
  const onFallow = (x: number, z: number): boolean =>
    fallowParts.some((p) => Math.abs(x - p.x) <= p.size / 2 && Math.abs(z - p.z) <= p.size / 2);

  it('ovce, kozy a krávy se pasou na mladém úhoru (pasáček za nimi), nikdy na osetém dílu', () => {
    const plan = planLivestock(village('young-fallow'), GROUND, 7);
    const grazing = plan.herds.filter((h) => h.kind !== 'swine');
    expect(grazing.length).toBeGreaterThan(0);
    expect(grazing.some((h) => h.route.every((spot) => onFallow(spot.x, spot.z)))).toBe(true);
    for (const herd of grazing) {
      for (const spot of herd.route) {
        expect(Math.abs(spot.x - sown.x) < 7.5 && Math.abs(spot.z - sown.z) < 7.5).toBe(false);
      }
    }
  });

  it('louka na seno se pase až po seči (srpen), před ní stáda na louce', () => {
    // herní den 2422 = 15. 8. roku 506, 2330 = 15. 5.
    const august = planLivestock(village('meadow', 2422 + 0), GROUND, 7);
    const may = planLivestock(village('meadow', 2330), GROUND, 7);
    const routeOn = (herds: Herd[]): boolean =>
      herds.filter((h) => h.kind !== 'swine').some((h) => h.route.some((s) => onFallow(s.x, s.z)));
    expect(routeOn(august.herds)).toBe(true);
    expect(routeOn(may.herds)).toBe(false);
  });
});

describe('planLivestock – vždy s pasákem (Martin 19. 10. 2026)', () => {
  // 15. 5. roku 506 – pastevní sezóna; 15. 12. – zima
  const MAY = 2330;
  const DECEMBER = 2330 + 214;
  const herding = (manDays: number): { activity: string; manDays: number } => ({
    activity: 'herding',
    manDays,
  });
  const village = (
    herders: { children: number; elders: number } | null,
    adults = 0,
    day = MAY,
  ): LivestockVillage => ({
    ...VILLAGE,
    livestock: { sheep: 46, goat: 12, pig: 21, cow: 13 },
    labor: {
      day,
      ...(herders ? { herders } : {}),
      shares: adults > 0 ? [herding(adults)] : [],
    },
  });
  const total = (herds: Herd[], name: string): number =>
    herds.reduce((sum, h) => sum + h.animals.filter((a) => a.species === name).length, 0);

  it('pasáků dnes: děti a starší z jádra, dospělí po člověkodnech; bez údaje neomezeně', () => {
    expect(
      herderCount({ day: MAY, herders: { children: 2, elders: 1 }, shares: [herding(1.2)] }),
    ).toBe(5);
    expect(herderCount({ day: MAY })).toBe(Infinity);
    expect(herderCount(undefined)).toBe(Infinity);
  });

  it('málo pasáků: pasák vede víc zvířat, s prasaty jde jeden, až když jsou aspoň dva', () => {
    expect(tendedHerds(9, 4, 3)).toEqual({ pasture: 4, swine: 3 });
    expect(tendedHerds(3, 4, 3)).toEqual({ pasture: 2, swine: 1 });
    expect(tendedHerds(1, 4, 3)).toEqual({ pasture: 1, swine: 0 });
    expect(tendedHerds(0, 4, 3)).toEqual({ pasture: 0, swine: 0 });
    expect(tendedHerds(2, 0, 3)).toEqual({ pasture: 0, swine: 2 });
  });

  it('dost pasáků – všechna stáda na pastvě s pasákem, stáda s pasákem v plánu napřed', () => {
    const plan = planLivestock(village({ children: 9, elders: 0 }), GROUND, 7);
    expect(plan.herds.every((h) => h.tended)).toBe(true);
    expect(total(plan.herds, 'sheep')).toBe(46);
  });

  it('dva pasáci – zvířata ve dvou stádech (louka a les), žádné samo', () => {
    const plan = planLivestock(village({ children: 2, elders: 0 }), GROUND, 7);
    const tended = plan.herds.filter((h) => h.tended);
    expect(tended).toHaveLength(2);
    expect(tended.map((h) => h.kind).sort()).toEqual(['cattle', 'swine']);
    // všechna zvířata pasáci vedou – ovce, kozy i krávy v jednom stádě
    expect(total(tended, 'sheep')).toBe(46);
    expect(total(tended, 'cow')).toBe(13);
    expect(total(tended, 'pig')).toBe(21);
    expect(plan.herds.filter((h) => !h.tended)).toHaveLength(0);
  });

  it('bez pasáka se nepase – stádo stojí u domů a nestěhuje se', () => {
    const plan = planLivestock(village({ children: 0, elders: 0 }), GROUND, 7);
    expect(plan.herds.length).toBeGreaterThan(0);
    for (const herd of plan.herds) {
      expect(herd.tended).toBe(false);
      expect(herd.route).toHaveLength(1);
      const spot = herd.route[0]!;
      expect(Math.hypot(spot.x, spot.z)).toBeLessThan(90);
    }
    // jeden dospělý pasák – stádo jde na louku
    const one = planLivestock(village({ children: 0, elders: 0 }, 0.5), GROUND, 7);
    expect(one.herds[0]!.tended).toBe(true);
    expect(one.herds[0]!.route.length).toBeGreaterThan(1);
    expect(one.herds.filter((h) => h.tended)).toHaveLength(1);
  });

  it('v zimě ovce, kozy a krávy u domů, s pasákem jen prasata v lese', () => {
    const plan = planLivestock(village({ children: 1, elders: 0 }, 0, DECEMBER), GROUND, 7);
    const tended = plan.herds.filter((h) => h.tended);
    expect(tended.map((h) => h.kind)).toEqual(['swine']);
    expect(plan.herds.filter((h) => !h.tended && h.kind !== 'swine').length).toBeGreaterThan(0);
  });
});

describe('planLivestock – mimo jídlo pro lidi (Martin 19. 10. 2026)', () => {
  const onSquare = (s: { x: number; z: number; size: number }, x: number, z: number): boolean =>
    Math.abs(x - s.x) < s.size / 2 && Math.abs(z - s.z) < s.size / 2;

  it('louka před sečí, sad a záhony pozemku nejsou pastvinou; strniště po sklizni ano', () => {
    // pás luk letošní seče západně od vsi, jinak louka
    const meadows = Array.from({ length: 40 }, (_, i) => ({
      x: -40 - (i % 8) * 15,
      z: -60 + Math.floor(i / 8) * 15,
      size: 15,
      look: 'meadow' as const,
    }));
    const village: LivestockVillage = {
      ...VILLAGE,
      hayMeadows: meadows,
      labor: { day: 2330 },
      livestock: { sheep: 60, goat: 0, pig: 0, cow: 12 },
    };
    const plan = planLivestock(village, GROUND, 7);
    for (const herd of plan.herds) {
      for (const spot of herd.route) {
        expect(meadows.some((m) => onSquare(m, spot.x, spot.z))).toBe(false);
      }
    }
    // strniště po sklizni – stáda se na něm smějí pást (přednostně jako úhor)
    const stubble = Array.from({ length: 12 }, (_, i) => ({
      x: -120 + (i % 4) * 15,
      z: -30 + Math.floor(i / 4) * 15,
      size: 15,
      stage: 'sown' as const,
      look: 'stubble' as const,
    }));
    const after = planLivestock(
      { ...VILLAGE, fields: [{ parts: stubble }], labor: { day: 2422 } },
      GROUND,
      7,
    );
    const onStubble = after.herds
      .filter((h) => h.kind !== 'swine')
      .some((h) => h.route.every((s) => stubble.some((p) => onSquare(p, s.x, s.z))));
    expect(onStubble).toBe(true);
  });

  it('stádo u domů nestojí na záhonech pozemku', () => {
    const plots = [
      { x: 20, z: 0, size: 15, variant: 'back-left' as const },
      { x: -20, z: 0, size: 15, variant: 'front-right' as const },
      { x: 0, z: 22, size: 15, variant: 'center' as const },
    ];
    const village: LivestockVillage = {
      dwellings: plots.map((plot, i) => ({
        ...dwelling(i + 1, 'polozemnice', plot.x, plot.z),
        position: plotHouse(plot, plot.variant),
        plot,
      })),
      fields: [],
      labor: { day: 2330, herders: { children: 0, elders: 0 } },
      livestock: { sheep: 40, goat: 8, pig: 0, cow: 6 },
    };
    const plan = planLivestock(village, GROUND, 7);
    expect(plan.herds.length).toBeGreaterThan(0);
    for (const herd of plan.herds) {
      const spot = herd.route[0]!;
      expect(plots.some((plot) => insidePlot(plot, spot.x, spot.z, -herd.radiusM))).toBe(false);
    }
  });
});

describe('livestockGround na skutečné krajině', () => {
  const landscape = generateLandscape(42);
  const surface = buildRenderSurface(landscape);
  const field = buildForestField(landscape);
  const relief = buildRelief(landscape);
  const site = tileCenter(landscape, landscape.villageSite.x, landscape.villageSite.y);
  const ground = livestockGround(
    landscape,
    { field, stream: surface.stream, relief },
    { x: site.worldX, z: site.worldZ },
  );
  const village: LivestockVillage = {
    dwellings: [0, 1, 2, 3].map((i) =>
      dwelling(i + 1, 'zemnice', site.worldX + (i % 2) * 12, site.worldZ + Math.floor(i / 2) * 12),
    ),
    fields: [],
  };

  it('pastva jen na louce dál od lesa a vody, prasata v lese u okraje', () => {
    const plan = planLivestock(village, ground, 42);
    const flock = plan.herds.find((h) => h.kind === 'flock');
    expect(flock).toBeDefined();
    for (const herd of plan.herds) {
      for (const spot of herd.route) {
        const forest = field.distanceAt(spot.x, spot.z);
        const bank = surface.stream.nearest(spot.x, spot.z).bankDistance;
        if (herd.kind === 'swine') {
          expect(forest).toBeGreaterThanOrEqual(-8);
          expect(forest).toBeLessThanOrEqual(6);
        } else {
          expect(forest).toBeLessThan(-5);
        }
        expect(bank).toBeGreaterThan(2);
        expect(relief.slopeAt(spot.x, spot.z)).toBeLessThan(0.17);
      }
    }
  });

  it('pás zvěře (verge) leží na louce před lesem, ne pod korunami', () => {
    let count = 0;
    for (let dz = -300; dz <= 300; dz += 3) {
      for (let dx = -300; dx <= 300; dx += 3) {
        const x = site.worldX + dx;
        const z = site.worldZ + dz;
        if (!ground.verge?.(x, z)) continue;
        count++;
        // střed buňky rastru (4 m) je aspoň 8 m před lesem, bod v buňce nejvýš o 2,9 m blíž
        expect(field.distanceAt(x, z)).toBeLessThan(-4);
        expect(field.distanceAt(x, z)).toBeGreaterThan(-24);
      }
    }
    expect(count).toBeGreaterThan(0);
  });
});

describe('planLivestock – koně na pastvě (horses.md – Krmení, Ve scéně)', () => {
  const days = Array.from({ length: 365 }, (_, d) => d);
  const summer = days.find((d) => !HAY_WINTER_MONTHS.includes(dateOfDayIndex(d).month))!;
  const winter = days.find((d) => HAY_WINTER_MONTHS.includes(dateOfDayIndex(d).month))!;
  const horses = [
    { id: 1, kind: 'mare' as const },
    { id: 2, kind: 'foal' as const },
    { id: 3, kind: 'riding' as const, riderId: 7 },
    { id: 4, kind: 'riding' as const },
  ];
  const stocked = (day: number, herders = 4): LivestockVillage => ({
    ...VILLAGE,
    labor: { day, herders: { children: herders } },
    livestock: { sheep: 6, goat: 2, pig: 4, cow: 4 },
    pens: [{ x: -40, z: 40, size: 15, horses }],
  });
  const horseHerds = (plan: ReturnType<typeof planLivestock>): Herd[] =>
    plan.herds.filter((h) => h.animals.some((a) => a.species === 'horse' || a.species === 'foal'));

  it('v létě s pasákem se pasou koně bez jezdce; kůň pod jezdcem zůstane stranou', () => {
    expect(grazingHorses(stocked(summer)).map((h) => h.id)).toEqual([1, 2, 4]);
    const herds = horseHerds(planLivestock(stocked(summer), GROUND, 11));
    expect(herds).toHaveLength(1);
    expect(herds[0]!.animals.map((a) => a.species).sort()).toEqual(['foal', 'horse', 'horse']);
  });

  it('v zimě a bez pasáka stojí koně v ohradě', () => {
    expect(grazingHorses(stocked(winter))).toEqual([]);
    expect(grazingHorses(stocked(summer, 0))).toEqual([]);
    expect(horseHerds(planLivestock(stocked(winter), GROUND, 11))).toHaveLength(0);
  });

  it('stádo nikdy samo: koně jdou na pastvu poslední, jen s pasákem navíc', () => {
    // ovce s kozami, krávy a prasata mají tři pasáky; čtvrtý patří koním
    for (const herders of [1, 2, 3]) {
      expect(grazingHorses(stocked(summer, herders))).toEqual([]);
      expect(horseHerds(planLivestock(stocked(summer, herders), GROUND, 11))).toHaveLength(0);
    }
    // ostatní stáda se pasou stejně s koňmi i bez nich (koně je neodeberou)
    const few = planLivestock(stocked(summer, 3), GROUND, 11);
    const bare = planLivestock({ ...stocked(summer, 3), pens: [] }, GROUND, 11);
    expect(JSON.stringify(few.herds)).toBe(JSON.stringify(bare.herds));
  });

  it('ostatní stáda se koňmi nemění (rozmístění stejné jako bez koní)', () => {
    const withHorses = planLivestock(stocked(summer), GROUND, 11);
    const without = planLivestock({ ...stocked(summer), pens: [] }, GROUND, 11);
    const others = withHorses.herds.filter((h) => !horseHerds(withHorses).includes(h));
    expect(JSON.stringify(others)).toBe(JSON.stringify(without.herds));
  });
});
