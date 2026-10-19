import { describe, expect, it } from 'vitest';
import {
  DWELLING_PATH_BOX_M,
  PATH_TRAFFIC,
  computePathNetwork,
  pathAgeFactor,
  pathBounds,
  pathNetworkKey,
  pathStrength,
  simplifyPathLine,
  smoothPathLine,
  villagePathBounds,
  type PathLine,
  type PathNetwork,
  type PathVillage,
} from '../paths/network';
import { WATER_FETCHING } from '../rules';
import { nearestWaterTiles, pathTerrainOf, pathWindowFor } from '../paths/terrain';
import { house, part, pathTestTerrain } from './paths-fixtures';
import { makeLandscape } from './placement-fixtures';

const terrain = pathTestTerrain();

function village(extra: Partial<PathVillage> = {}): PathVillage {
  return {
    dwellings: [house(1, 0, 0), house(2, 14, 4), house(3, -13, 5)],
    fields: [],
    labor: { day: 4000, month: 6, people: { children: 4, adults: 8, elders: 2 }, shares: [] },
    ...extra,
  };
}

const points = (network: PathNetwork): { x: number; z: number }[] =>
  network.lines.flatMap((l) => l.points);

/** Body os pěšin po 0,5 m (i mezi body lomené čáry). */
const samples = (network: PathNetwork): { x: number; z: number }[] =>
  network.lines.flatMap((l) =>
    l.points.slice(1).flatMap((b, k) => {
      const a = l.points[k]!;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
      return Array.from({ length: n }, (_, i) => ({
        x: a.x + ((b.x - a.x) * i) / n,
        z: a.z + ((b.z - a.z) * i) / n,
      }));
    }),
  );

describe('pathStrength, pathAgeFactor', () => {
  it('pod prahem provozu 0, pak roste a od plného provozu 1', () => {
    expect(pathStrength(PATH_TRAFFIC.min * 0.9)).toBe(0);
    expect(pathStrength(PATH_TRAFFIC.min)).toBeGreaterThan(0);
    expect(pathStrength(3)).toBeGreaterThan(pathStrength(1));
    expect(pathStrength(PATH_TRAFFIC.full)).toBe(1);
    expect(pathStrength(1000)).toBe(1);
  });

  it('spojení se vyšlapává dva roky', () => {
    expect(pathAgeFactor(0)).toBe(0);
    expect(pathAgeFactor(1)).toBeCloseTo(0.5);
    expect(pathAgeFactor(5)).toBe(1);
  });
});

describe('computePathNetwork – pěšiny vsi', () => {
  it('je deterministická', () => {
    const a = computePathNetwork({ village: village(), terrain });
    const b = computePathNetwork({ village: village(), terrain });
    expect(a.lines).toEqual(b.lines);
    expect(a.lines.length).toBeGreaterThan(0);
  });

  it('z domů vede pěšina k vodě (břeh potoka) a k okraji lesa', () => {
    const network = computePathNetwork({ village: village(), terrain });
    const pts = points(network);
    // u břehu (potok z ∈ (70, 76))
    expect(pts.some((p) => p.z > 60 && p.z < 72)).toBe(true);
    // u okraje lesa (x < −90 je les)
    expect(pts.some((p) => p.x < -80)).toBe(true);
    for (const id of [1, 2, 3]) {
      const errand = network.errands.get(id)!;
      expect(errand.water!.z).toBeGreaterThan(60);
      expect(errand.water!.z).toBeLessThan(72);
      expect(errand.wood!.x).toBeLessThan(-80);
    }
  });

  it('pro vodu se chodí vždy k nejbližší vodě – i daleko a naplno (paths.md – Pochůzky pro vodu)', () => {
    // Martin, 19. 10. 2026: „Ve Vlkově nikde nevidím vyšlapanou cestu k potoku. Ale vesničané tam
    // přece musí chodit nějak pro vodu a musí jim to zabírat čas.“ – louka 750 × 750 m, potok
    // v řadě políček z ∈ (315, 330), dům 510 m od břehu (dřív pochůzky jen do 450 m chůze)
    const far = makeLandscape({ size: 50, surface: (_x, y) => (y === 46 ? 'water' : 'meadow') });
    const farTerrain = pathTerrainOf(
      far,
      pathWindowFor(far, { minX: -375, minZ: -375, maxX: 375, maxZ: 375 }),
    );
    const people = 10;
    const network = computePathNetwork({
      village: {
        dwellings: [house(1, 0, -200)],
        fields: [],
        labor: {
          day: 4000,
          month: 6,
          people: { children: 0, adults: people, elders: 0 },
          shares: [],
        },
      },
      terrain: farTerrain,
    });
    const water = network.errands.get(1)?.water;
    expect(water).toBeDefined();
    expect(water!.z).toBeGreaterThan(300);
    expect(water!.z).toBeLessThan(316);
    // plný počet cest – 0,4 na člověka (dřív za 130 m úměrně méně)
    const t = network.traffic;
    const at = (x: number, z: number): number =>
      t.raw[
        Math.round((z - t.originZ) / t.cellM) * t.width + Math.round((x - t.originX) / t.cellM)
      ]!;
    let near = 0;
    for (let dx = -20; dx <= 20; dx += t.cellM) near = Math.max(near, at(water!.x + dx, 250));
    expect(near).toBeCloseTo(WATER_FETCHING.tripsPerPerson * people, 6);
    // pěšina k vodě vznikne
    expect(network.lines.some((l) => l.points.some((p) => p.z > 280))).toBe(true);
  });

  it('každé obývané obydlí má pochůzku pro vodu i dřevo – i když jeho branka vede k sousedovi', () => {
    // Vlkov (19. 10. 2026): polozemnice na pozemku přední stranou (branka, −z) k pozemku dvorce –
    // brána padla do cizího pozemku, domácnost vypadla ze sítě a neměla žádnou pochůzku
    const plot = (x: number, z: number): PathVillage['dwellings'][number]['plot'] => ({
      cell: { x: Math.round((x + 142.5) / 15), y: Math.round((z + 142.5) / 15) },
      x,
      z,
      size: 15,
    });
    const boxed: PathVillage = village({
      dwellings: [
        house(1, 7.5, 7.5, Math.PI, { type: 'polozemnice', plot: plot(7.5, 7.5) }),
        house(2, 7.5, -7.5, Math.PI, { type: 'polozemnice', plot: plot(7.5, -7.5) }),
        house(3, 22.5, 7.5, Math.PI, { type: 'polozemnice', plot: plot(22.5, 7.5) }),
      ],
    });
    const network = computePathNetwork({ village: boxed, terrain });
    for (const id of [1, 2, 3]) {
      const errand = network.errands.get(id);
      expect(errand?.water).toBeDefined();
      expect(errand?.wood).toBeDefined();
    }
    // pěšina domu 1 nezačíná v cizím pozemku (branka do souseda) – vyjde těsně u jeho pozemku
    const starts = network.lines.flatMap((l) => [l.points[0]!, l.points[l.points.length - 1]!]);
    const inPlot = (p: { x: number; z: number }, cx: number, cz: number): boolean =>
      Math.abs(p.x - cx) < 7.5 && Math.abs(p.z - cz) < 7.5;
    for (const p of starts) {
      expect(inPlot(p, 7.5, -7.5) || inPlot(p, 7.5, 7.5) || inPlot(p, 22.5, 7.5)).toBe(false);
    }
  });

  it('pěšina nevede domem a začíná u brány před vchodem', () => {
    const v = village();
    const network = computePathNetwork({ village: v, terrain });
    for (const d of v.dwellings) {
      const box = DWELLING_PATH_BOX_M[d.type];
      for (const p of network.lines.flatMap((l) => l.points)) {
        const c = Math.cos(d.position.rotation);
        const s = Math.sin(d.position.rotation);
        const lx = (p.x - d.position.x) * c - (p.z - d.position.z) * s;
        const lz = (p.x - d.position.x) * s + (p.z - d.position.z) * c;
        const inside = lx > box.minX && lx < box.maxX && lz > box.minZ && lz < box.maxZ;
        expect(inside).toBe(false);
      }
      // brána je kus před koncem šíje (vchod míří k +z)
      const gate = { x: d.position.x, z: d.position.z + box.maxZ + 1 };
      expect(
        network.lines.some((l) => l.points.some((p) => Math.hypot(p.x - gate.x, p.z - gate.z) < 4)),
      ).toBe(true);
    }
  });

  it('díl v osevu obejde, když je obcházení krátké, a jde přes něj, když je dlouhé (Martin)', () => {
    // Martin, 19. 10. 2026: „Pole, které zrovna neleží ladem: 0.5.“ a „nejkratší cesta je ta
    // nejrychlejší. Tj. může se stát, že někde bude jednodušší jít přes pole, než ho obcházet
    // i když je cesta přes pole pomalejší.“ – pole není zákaz, jen cena
    const narrow = (stage: 'sown' | 'young-fallow' | 'founding'): PathVillage =>
      village({
        fields: [
          {
            id: 9,
            // úzký hluboký blok mezi vsí a vodou – obejít je kousek
            parts: [22.5, 37.5, 52.5].flatMap((z) => [-7.5, 7.5].map((x) => part(x, z, stage))),
          },
        ],
      });
    const inside = (network: PathNetwork): number =>
      samples(network).filter((p) => Math.abs(p.x) < 6 && Math.abs(p.z - 37.5) < 10).length;
    const fallow = inside(computePathNetwork({ village: narrow('young-fallow'), terrain }));
    expect(fallow).toBeGreaterThan(0);
    // úhor a zakládaný díl jako louka – rovně; v osevu obejde
    expect(inside(computePathNetwork({ village: narrow('founding'), terrain }))).toBe(fallow);
    expect(inside(computePathNetwork({ village: narrow('sown'), terrain }))).toBeLessThan(fallow);
    // pás osevu přes celou louku (na západě les) – obcházet nejde, k vodě se jde přes pole
    const wide = village({
      fields: [
        {
          id: 9,
          parts: Array.from({ length: 16 }, (_, k) => part(-82.5 + k * 15, 37.5, 'sown')),
        },
      ],
    });
    const across = samples(computePathNetwork({ village: wide, terrain })).filter(
      (p) => p.z > 31 && p.z < 44 && p.x > -75,
    );
    expect(across.length).toBeGreaterThan(0);
  });

  it('pevná cesta přes díl v osevu jde rychlostí cesty, pěšina dne přes osev nezrychlí', () => {
    const narrow = (roads?: PathVillage['roads']): PathVillage =>
      village({
        fields: [
          {
            id: 9,
            parts: [22.5, 37.5, 52.5].flatMap((z) => [-7.5, 7.5].map((x) => part(x, z, 'sown'))),
          },
        ],
        ...(roads ? { roads } : {}),
      });
    const inside = (network: PathNetwork): number =>
      samples(network).filter((p) => Math.abs(p.x) < 6 && Math.abs(p.z - 37.5) < 10).length;
    const road = [
      {
        points: [
          { x: 0, z: 8 },
          { x: 0, z: 72 },
        ],
        grade: 'trodden' as const,
      },
    ];
    expect(inside(computePathNetwork({ village: narrow(road), terrain }))).toBeGreaterThan(
      inside(computePathNetwork({ village: narrow(), terrain })),
    );
  });

  it('zarůstající příloh (křoviny, mladý les) zdržuje – je to vegetace, ne pole', () => {
    const across = (stage: 'shrubs' | 'young-fallow'): PathVillage =>
      village({
        fields: [
          {
            id: 9,
            // úzký hluboký blok – obejít je kratší než prodírat se křovím
            parts: [22.5, 37.5, 52.5].flatMap((z) => [-7.5, 7.5].map((x) => part(x, z, stage))),
          },
        ],
      });
    const deepInside = (network: PathNetwork): number =>
      samples(network).filter((p) => Math.abs(p.x) < 6 && Math.abs(p.z - 37.5) < 10).length;
    expect(
      deepInside(computePathNetwork({ village: across('young-fallow'), terrain })),
    ).toBeGreaterThan(deepInside(computePathNetwork({ village: across('shrubs'), terrain })));
  });

  it('na pole se chodí podle práce dne – pěšina tam vede, s prací silnější', () => {
    const field = { id: 5, parts: [part(67.5, -22.5), part(82.5, -22.5)] };
    const idle = computePathNetwork({ village: village({ fields: [field] }), terrain });
    const busy = computePathNetwork({
      village: village({
        fields: [field],
        labor: {
          day: 4000,
          month: 7,
          people: { children: 4, adults: 8, elders: 2 },
          shares: [{ target: { kind: 'field', id: 5 }, manDays: 6 }],
        },
      }),
      terrain,
    });
    const nearField = (network: PathNetwork): number =>
      Math.max(
        0,
        ...network.lines.flatMap((l) =>
          l.points.flatMap((p, k) => (p.x > 45 && p.x < 62 ? [l.strength[k]!] : [])),
        ),
      );
    expect(nearField(idle)).toBeGreaterThan(0);
    expect(nearField(busy)).toBeGreaterThan(nearField(idle));
  });

  it('k přirozené louce, kde se dnes seče, vede pěšina (oxen.md – Seno)', () => {
    // louka na východ od vsi – bez seče tam nikdo nechodí
    const meadow = part(82.5, -37.5);
    const hayMeadows = [{ cell: meadow.cell, x: meadow.x, z: meadow.z, size: meadow.size }];
    const reaches = (network: PathNetwork): boolean =>
      samples(network).some((p) => p.x > 70 && p.x < 95 && p.z > -50 && p.z < -25);
    const idle = computePathNetwork({ village: village({ hayMeadows }), terrain });
    const mowing = computePathNetwork({
      village: village({
        hayMeadows,
        labor: {
          day: 4000,
          month: 6,
          people: { children: 4, adults: 8, elders: 2 },
          shares: [{ target: { kind: 'meadow', cells: [meadow.cell] }, manDays: 6 }],
        },
      }),
      terrain,
    });
    expect(reaches(idle)).toBe(false);
    expect(reaches(mowing)).toBe(true);
    // políčko, které ves mezi loukami seče nezná, pěšinu nedostane
    const unknown = computePathNetwork({
      village: village({
        labor: {
          day: 4000,
          month: 6,
          people: { children: 4, adults: 8, elders: 2 },
          shares: [{ target: { kind: 'meadow', cells: [meadow.cell] }, manDays: 6 }],
        },
      }),
      terrain,
    });
    expect(reaches(unknown)).toBe(false);
  });

  it('trasy se slévají – sousedé chodí k vodě i pro dřevo po společné pěšině', () => {
    const network = computePathNetwork({ village: village(), terrain });
    const key = (p: { x: number; z: number } | null): string => (p ? `${p.x},${p.z}` : '');
    const wood = [1, 2, 3].map((id) => key(network.errands.get(id)!.wood));
    expect(new Set(wood).size).toBe(1);
    // k vodě (z 40–55) vedou méně než tři souběžné pěšiny
    const lanes = new Set(
      samples(network)
        .filter((p) => p.z > 40 && p.z < 55)
        .map((p) => Math.round(p.x / 6)),
    );
    expect(lanes.size).toBeLessThan(3);
    // společný úsek je silnější než pěšina jedné domácnosti
    const strengths = network.lines.map((l) => Math.max(...l.strength));
    expect(Math.max(...strengths)).toBeGreaterThan(Math.min(...strengths));
  });

  it('nové obydlí pěšiny teprve vyšlapává (stáří), odjakživa stojící je má', () => {
    const fresh = village({
      dwellings: [house(1, 0, 0, 0, { since: 4000 }), house(2, 14, 4, 0, { since: 4000 })],
    });
    const old = village({
      dwellings: [house(1, 0, 0, 0, { since: 0 }), house(2, 14, 4, 0, { since: 0 })],
    });
    expect(computePathNetwork({ village: fresh, terrain }).lines).toEqual([]);
    expect(computePathNetwork({ village: old, terrain }).lines.length).toBeGreaterThan(0);
  });

  it('návštěvy hřbitova podle lidí – dvě domácnosti po 4 lidech mají pěšinu ke hřbitovu', () => {
    // domy daleko od sebe – každá domácnost chodí ke hřbitovu svou cestou, trasy se neslijí
    const cemetery = { id: 7, squares: [part(-7.5, -67.5), part(7.5, -67.5)] };
    const people = (adults: number) => ({ children: 0, adults, elders: 0 });
    const v = village({
      dwellings: [house(1, -40, 0), house(2, 40, 0)],
      cemeteries: [cemetery],
      labor: { day: 4000, month: 6, people: people(8), shares: [] },
    });
    const network = computePathNetwork({ village: v, terrain });
    const near = (p: { x: number; z: number }): boolean => p.z < -50 && Math.abs(p.x) < 25;
    expect(samples(network).some(near)).toBe(true);
    // bez hřbitova tam pěšina nevede
    const none = computePathNetwork({ village: { ...v, cemeteries: [] }, terrain });
    expect(samples(none).some(near)).toBe(false);
    // víc lidí – víc návštěv a silnější pěšina ke hřbitovu
    const traffic = (adults: number): number => {
      const t = computePathNetwork({
        village: { ...v, labor: { ...v.labor!, people: people(adults) } },
        terrain,
      }).traffic;
      let sum = 0;
      for (let j = 0; j < t.height; j++) {
        for (let i = 0; i < t.width; i++) {
          if (near({ x: t.originX + i * t.cellM, z: t.originZ + j * t.cellM })) {
            sum += t.raw[j * t.width + i]!;
          }
        }
      }
      return sum;
    };
    expect(traffic(20)).toBeGreaterThan(traffic(8) * 2);
  });

  it('k posvátným místům jen k nejbližšímu – vzdálená skupina model bez pěšiny', () => {
    const idol = (id: number, x: number, z: number) => ({
      id,
      kind: 'idol' as const,
      position: { x, z, rotation: 0 },
      built: true,
    });
    const v = village({
      dwellings: [house(1, -60, 0), house(2, 60, 0)],
      labor: { day: 4000, month: 6, people: { children: 0, adults: 8, elders: 0 }, shares: [] },
      sacred: {
        oaks: [],
        groves: [],
        // každá domácnost má modlu za domem, skupina model daleko u lesa
        buildings: [idol(1, -60, -40), idol(2, 60, -40), idol(3, -120, -120), idol(4, -110, -125)],
      },
    });
    const traffic = computePathNetwork({ village: v, terrain }).traffic;
    const near = (x: number, z: number, r: number): number => {
      let sum = 0;
      for (let j = 0; j < traffic.height; j++) {
        for (let i = 0; i < traffic.width; i++) {
          const cx = traffic.originX + i * traffic.cellM;
          const cz = traffic.originZ + j * traffic.cellM;
          if (Math.hypot(cx - x, cz - z) <= r) sum += traffic.raw[j * traffic.width + i]!;
        }
      }
      return sum;
    };
    // k modle za domem se chodí, mezi domy (k modle souseda) ne, ke vzdálené skupině nikdo
    expect(near(-60, -30, 6)).toBeGreaterThan(0);
    expect(near(60, -30, 6)).toBeGreaterThan(0);
    expect(near(0, -40, 15)).toBe(0);
    expect(near(-115, -115, 12)).toBe(0);
  });

  it('víc hřbitovů – každá domácnost chodí k nejbližšímu', () => {
    const west = { id: 7, squares: [part(-82.5, -67.5)] };
    const east = { id: 8, squares: [part(82.5, -67.5)] };
    const v = village({
      dwellings: [house(1, -60, 0), house(2, 60, 0)],
      cemeteries: [west, east],
      labor: { day: 4000, month: 6, people: { children: 0, adults: 8, elders: 0 }, shares: [] },
    });
    const pts = samples(computePathNetwork({ village: v, terrain }));
    expect(pts.some((p) => p.z < -50 && p.x < -60)).toBe(true);
    expect(pts.some((p) => p.z < -50 && p.x > 60)).toBe(true);
    // nikdo nechodí přes celou ves k vzdálenějšímu hřbitovu
    expect(pts.some((p) => p.z < -50 && Math.abs(p.x) < 20)).toBe(false);
  });

  it('zrušený cíl vypadne', () => {
    const field = { id: 5, parts: [part(67.5, -52.5)] };
    const withField = computePathNetwork({ village: village({ fields: [field] }), terrain });
    const without = computePathNetwork({ village: village(), terrain });
    const towards = (network: PathNetwork): boolean =>
      points(network).some((p) => p.x > 55 && p.z < -40);
    expect(towards(withField)).toBe(true);
    expect(towards(without)).toBe(false);
  });

  it('pozemek polozemnice: pěšina vede od branky a dovnitř plotu nechodí', () => {
    // pozemek na políčku se středem (37,5; 7,5), dům vchodem k −z (k brance)
    const plot = { cell: { x: 2, y: 0 }, x: 37.5, z: 7.5, size: 15, variant: 'center' as const };
    const v = village({
      dwellings: [
        house(1, 0, 0),
        house(2, 14, 4),
        {
          ...house(5, 37.5, 7.5, Math.PI),
          type: 'polozemnice',
          plot,
        },
      ],
    });
    const network = computePathNetwork({ village: v, terrain });
    const inside = samples(network).filter(
      (p) => Math.abs(p.x - plot.x) < 6.5 && Math.abs(p.z - plot.z) < 6.5,
    );
    expect(inside).toEqual([]);
    // branka je na přední straně (−z) proti vchodu
    const gate = { x: 37.5, z: 7.5 - 7.5 - 1 };
    expect(
      network.lines.some((l) => l.points.some((p) => Math.hypot(p.x - gate.x, p.z - gate.z) < 3)),
    ).toBe(true);
  });

  it('ves bez obydlí pěšiny nemá', () => {
    expect(computePathNetwork({ village: village({ dwellings: [] }), terrain }).lines).toEqual([]);
    expect(pathBounds(village({ dwellings: [] }))).toBeNull();
  });

  it('stáří pěšiny v bodech podle stáří obydlí', () => {
    const v = village({
      dwellings: [house(1, 0, 0, 0, { since: 4000 - 3653 }), house(2, 14, 4, 0, { since: 0 })],
    });
    const network = computePathNetwork({ village: v, terrain });
    const years = network.lines.flatMap((l) => l.years);
    expect(Math.min(...years)).toBeGreaterThan(5);
    expect(Math.max(...years)).toBeLessThanOrEqual(100);
  });
});

describe('pevná cesta – chodí se po ní bez ohledu na povrch (Martin, 19. 10. 2026)', () => {
  /** Pevná cesta od vsi k potoku po ose x = 0. */
  const north: NonNullable<PathVillage['roads']> = [
    {
      id: 1,
      points: [
        { x: 0, z: 8 },
        { x: 0, z: 73 },
      ],
      grade: 'trodden',
    },
  ];
  /** Body os pěšin do 2 m od osy cesty v pásu `z` ± `half`. */
  const onRoad = (network: PathNetwork, z: number, half: number): number =>
    samples(network).filter((p) => Math.abs(p.x) < 2 && Math.abs(p.z - z) < half).length;

  it('pevná cesta přes křoviny na přílohu: lidé jdou po ní, ne kolem', () => {
    // úzký hluboký blok křovin mezi vsí a potokem (z od 15 do 60, x od −15 do 15)
    const parts = [22.5, 37.5, 52.5].flatMap((z) => [-7.5, 7.5].map((x) => part(x, z, 'shrubs')));
    const fields = [{ id: 9, parts }];
    const withRoad = computePathNetwork({ village: village({ fields, roads: north }), terrain });
    const without = computePathNetwork({ village: village({ fields }), terrain });
    expect(onRoad(withRoad, 37.5, 20)).toBeGreaterThan(onRoad(without, 37.5, 20));
    expect(onRoad(withRoad, 37.5, 20)).toBeGreaterThan(0);
  });

  it('drahý terén pod cestou (svah, les, překážky) ji neprodraží', () => {
    // pás drahého terénu (×10) mezi vsí a potokem – kolem se dá obejít
    const rough = { ...terrain, cost: new Float32Array(terrain.cost) };
    for (let j = 0; j < rough.height; j++) {
      for (let i = 0; i < rough.width; i++) {
        const x = rough.originX + i * rough.cellM;
        const z = rough.originZ + j * rough.cellM;
        if (Math.abs(x) <= 45 && z >= 20 && z <= 60) rough.cost[j * rough.width + i]! *= 10;
      }
    }
    const withRoad = computePathNetwork({ village: village({ roads: north }), terrain: rough });
    const without = computePathNetwork({ village: village(), terrain: rough });
    expect(onRoad(withRoad, 40, 15)).toBeGreaterThan(0);
    expect(onRoad(without, 40, 15)).toBe(0);
  });

  it('plot ohrady pod pevnou cestou dál překáží – jde se kolem', () => {
    // hotová ohrada bez zvířat (krmit se do ní nechodí) přes cestu
    const pens = [{ ...part(0, 37.5), id: 4, built: true, stocked: false }];
    const network = computePathNetwork({ village: village({ pens, roads: north }), terrain });
    // vnitřek ohrady (okraj čtverce je plot – pěšina vede podél něj)
    const inside = samples(network).filter((p) => Math.abs(p.x) < 4 && Math.abs(p.z - 37.5) < 4);
    expect(inside).toEqual([]);
    // cesta k potoku pokračuje kolem ohrady
    expect(onRoad(network, 60, 6)).toBeGreaterThan(0);
  });
});

describe('žádné souběžné pěšiny (Martin: „lidé by měli použít tu, ne si prošlapat vlastní“)', () => {
  /** Počet čar sítě, které protínají přímku z = `z`. */
  const crossing = (lines: readonly PathLine[], z: number): number =>
    lines.filter((l) => l.points.some((p, k) => k > 0 && (l.points[k - 1]!.z - z) * (p.z - z) <= 0))
      .length;

  it('dvě domácnosti vedle sebe na pole stejným směrem – jedna pěšina', () => {
    for (const gap of [12, 16, 24]) {
      const v: PathVillage = {
        dwellings: [house(1, 0, 0), house(2, gap, 0)],
        fields: [{ id: 7, parts: [part(-7.5, -127.5), part(7.5, -127.5)] }],
        labor: {
          day: 4000,
          month: 6,
          people: { children: 2, adults: 8, elders: 1 },
          shares: [{ target: { kind: 'field', id: 7 }, manDays: 6 }],
        },
      };
      const net = computePathNetwork({ village: v, terrain });
      expect(crossing(net.lines, -60), `odstup ${gap} m`).toBe(1);
      expect(crossing(net.lines, -30), `odstup ${gap} m`).toBe(1);
      // deterministicky
      expect(computePathNetwork({ village: v, terrain }).lines).toEqual(net.lines);
    }
  });
});

describe('pathNetworkKey', () => {
  it('drobná změna práce síť nepřepočítá, nové pole ano', () => {
    const base = village({
      fields: [{ id: 5, parts: [part(67.5, -22.5)] }],
      labor: {
        day: 4000,
        month: 7,
        people: { children: 4, adults: 8, elders: 2 },
        shares: [{ target: { kind: 'field', id: 5 }, manDays: 6.04 }],
      },
    });
    const tiny = {
      ...base,
      labor: {
        ...base.labor!,
        day: 4001,
        shares: [
          { activity: 'harvest' as const, target: { kind: 'field' as const, id: 5 }, manDays: 6.1 },
        ],
      },
    };
    expect(pathNetworkKey(tiny)).toBe(pathNetworkKey(base));
    const grown = { ...base, fields: [...base.fields, { id: 6, parts: [part(82.5, -22.5)] }] };
    expect(pathNetworkKey(grown)).not.toBe(pathNetworkKey(base));
  });
});

describe('pathBounds', () => {
  it('ves s okolím zaokrouhlená ven', () => {
    const b = pathBounds(village())!;
    expect(b.minX).toBeLessThan(-200);
    expect(b.maxX).toBeGreaterThan(200);
    expect(Math.abs(b.minX % 90)).toBe(0);
  });

  it('voda mimo okno ho rozšíří jen k sobě, voda v okně ho nemění (paths.md – Pochůzky pro vodu)', () => {
    const v = village();
    const b = pathBounds(v)!;
    // voda v okně – beze změny
    expect(pathBounds(v, [{ x: 0, z: b.maxZ - 10 }])).toEqual(b);
    // voda 600 m na sever – okno sahá k ní (s okrajem, zaokrouhleno), do stran se nemění
    const far = pathBounds(v, [{ x: 10, z: 600 }])!;
    expect(far.maxZ).toBeGreaterThanOrEqual(600 + 30);
    expect(far.maxZ).toBeLessThanOrEqual(720);
    expect([far.minX, far.minZ, far.maxX]).toEqual([b.minX, b.minZ, b.maxX]);
    expect(Math.abs(far.maxZ % 90)).toBe(0);
  });
});

describe('villagePathBounds, nearestWaterTiles – okno sítě až k vodě', () => {
  // louka 900 × 900 m, potok v řadě políček z ∈ (375, 390); ves 670 m od vody bez staveb k ní
  const far = makeLandscape({ size: 60, surface: (_x, y) => (y === 55 ? 'water' : 'meadow') });
  const v = village({
    dwellings: [house(1, 0, -300), house(2, 14, -296), house(3, -13, -295)],
  });

  it('nejbližší vodní políčko ke každému obydlí, každé jednou; dál než 1 000 m nic', () => {
    const tiles = nearestWaterTiles(
      far,
      v.dwellings.map((d) => d.position),
    );
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) expect(t.z).toBe(382.5);
    expect(new Set(tiles.map((t) => t.x)).size).toBe(tiles.length);
    expect(nearestWaterTiles(far, [{ x: 0, z: -700 }])).toEqual([]);
  });

  it('pěšina k vodě vznikne, i když voda leží daleko za okolím staveb', () => {
    const narrow = pathBounds(v)!;
    const wide = villagePathBounds(v, far)!;
    expect(narrow.maxZ).toBeLessThan(375);
    expect(wide.maxZ).toBeGreaterThan(390);
    expect([wide.minX, wide.minZ, wide.maxX]).toEqual([narrow.minX, narrow.minZ, narrow.maxX]);
    const network = (b: typeof wide): PathNetwork =>
      computePathNetwork({ village: v, terrain: pathTerrainOf(far, pathWindowFor(far, b)) });
    expect([...network(narrow).errands.values()].some((e) => e.water)).toBe(false);
    const errands = [...network(wide).errands.values()];
    expect(errands.length).toBe(3);
    for (const e of errands) expect(e.water!.z).toBeGreaterThan(360);
    expect(network(wide).lines.some((l) => l.points.some((p) => p.z > 340))).toBe(true);
  });
});

describe('simplifyPathLine, smoothPathLine', () => {
  it('zjednodušení nechá konce a zlom, vyhlazení konce a hodnoty mezi', () => {
    const pts = [
      { x: 0, z: 0 },
      { x: 5, z: 0.1 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
    ];
    const simple = simplifyPathLine(pts, [[0, 0.5, 1, 1]], 0.5);
    expect(simple.points).toEqual([pts[0], pts[2], pts[3]]);
    expect(simple.values[0]).toEqual([0, 1, 1]);
    const smooth = smoothPathLine(simple.points, simple.values, 2);
    expect(smooth.points[0]).toEqual(pts[0]);
    expect(smooth.points[smooth.points.length - 1]).toEqual(pts[3]);
    expect(smooth.points.length).toBeGreaterThan(3);
    for (const v of smooth.values[0]!) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
