import { describe, expect, it } from 'vitest';
import {
  DWELLING_CLEARING_M,
  DWELLING_FOOTPRINT_M,
  MILIR,
  PLAIN_FRAME,
  WORKSHOP_SIDE_M,
  shapeFrame,
  shapeRect,
  type Craft,
} from '@bohemia/game';
import type { SceneVillage } from '../../village-view';
import { ventSmokeStrength, smokeStrength } from '../smoke-schedule';
import { CONSTRUCTION_PHASES, constructionState } from '../village-construction';
import { plantedScale } from '../felled-trees';
import { insideFootprint } from '../village-picking';
import {
  CRAFT_MODEL,
  MILIR_SHAPE_M,
  PORCH_FRONT_M,
  craftSpots,
  forestKilnAnchor,
  hasPorch,
  kilnVents,
  KILN_SETTLED,
  kilnLook,
  milirHideShape,
  milirPlace,
  modelSpots,
  modelVents,
  shedOrigin,
  workshopModelKeys,
  workshopVents,
} from '../workshop-layout';

const AT = { x: 10, z: 20, rotation: 0 };
const TURNED = { x: -5, z: 3, rotation: Math.PI / 2 };

describe('dílny ve scéně (crafts.md)', () => {
  it('řemeslo → model dílny s fázemi staveniště', () => {
    expect(CRAFT_MODEL).toEqual({
      potter: 'hrncir',
      smith: 'kovar',
      burner: 'uhlir',
      carpenter: 'tesar',
    });
    for (const model of Object.values(CRAFT_MODEL)) {
      expect(CONSTRUCTION_PHASES[model].length).toBeGreaterThan(0);
    }
  });

  it('milíř stojí kus od kotvy (MILIR.offset) a natáčí se s ní', () => {
    const p = milirPlace(AT);
    expect(p.x).toBeCloseTo(AT.x + MILIR.offset.x, 9);
    expect(p.z).toBeCloseTo(AT.z + MILIR.offset.z, 9);
    // natočená zemnice (vchod do +x): místní x napříč → −z světa
    const q = milirPlace(TURNED);
    expect(q.x).toBeCloseTo(TURNED.x + MILIR.offset.z, 6);
    expect(q.z).toBeCloseTo(TURNED.z - MILIR.offset.x, 6);
    const hide = milirHideShape(AT);
    expect(hide.contains(p.x, p.z)).toBe(true);
    expect(hide.contains(p.x + MILIR.clearingRadiusM + 0.5, p.z)).toBe(false);
  });

  it('dým: pec a výheň zpod přístřešku, uhlíř jen z komína milíře (samostatná stavba)', () => {
    const [kiln] = workshopVents('potter', AT);
    expect(kiln).toMatchObject({ kind: 'craft' });
    expect(kiln!.z).toBeGreaterThan(AT.z + PORCH_FRONT_M);
    const [forge] = workshopVents('smith', TURNED);
    // vchod do +x – přístřešek před domem v +x
    expect(forge!.x).toBeGreaterThan(TURNED.x + PORCH_FRONT_M);
    // zemnice uhlíře nekouří – dým stoupá z milíře u skácených buků (crafts.md)
    expect(workshopVents('burner', AT)).toEqual([]);
    const [milir] = kilnVents(AT);
    expect(milir).toMatchObject({ kind: 'milir', y: MILIR_SHAPE_M.height + 0.1 });
    expect(milir!.x).toBeCloseTo(milirPlace(AT).x, 9);
  });

  it('pec a výheň hoří přes pracovní den, milíř doutná i v noci', () => {
    const night = 400.05;
    const noon = 400.5;
    expect(ventSmokeStrength('craft', 9, night)).toBe(0);
    expect(ventSmokeStrength('craft', 9, noon)).toBeGreaterThan(0.5);
    expect(ventSmokeStrength('milir', 9, night)).toBeGreaterThan(0.4);
    expect(ventSmokeStrength('hearth', 9, noon)).toBe(smokeStrength(9, noon));
  });

  it('řemeslníci stojí u pece, kovadliny nebo kolem milíře čelem k práci', () => {
    for (const craft of ['potter', 'smith'] as const) {
      const spots = craftSpots(craft, AT);
      expect(spots.length).toBeGreaterThan(2);
      for (const s of spots) {
        expect(Math.hypot(s.hx, s.hz)).toBeCloseTo(1, 9);
        expect(Math.hypot(s.x - AT.x, s.z - AT.z)).toBeLessThan(PORCH_FRONT_M + 1);
      }
    }
    const milir = milirPlace(AT);
    for (const s of craftSpots('burner', AT)) {
      const d = Math.hypot(s.x - milir.x, s.z - milir.z);
      expect(d).toBeGreaterThan(MILIR_SHAPE_M.radius);
      // čelem k milíři
      expect(s.hx * (milir.x - s.x) + s.hz * (milir.z - s.z)).toBeGreaterThan(0);
    }
  });

  it('kliknutí na přístřešek vybere dílnu, milíř u zemnice už nestojí', () => {
    const dwelling: SceneVillage['dwellings'][number] = {
      id: 5,
      type: 'zemnice',
      craft: 'burner',
      position: AT,
      built: true,
      progress: 1,
    };
    const { craft: _burner, ...plain } = dwelling;
    void _burner;
    const milir = milirPlace(AT);
    expect(insideFootprint({ x: milir.x, z: milir.z }, dwelling)).toBe(false);
    expect(insideFootprint({ x: milir.x, z: milir.z }, plain)).toBe(false);
    const house = { ...plain, type: 'polozemnice' as const };
    // před polozemnicí pod přístřeškem (5 / 2 + 2,6 m)
    expect(insideFootprint({ x: AT.x, z: AT.z + 4.6 }, { ...house, craft: 'potter' })).toBe(true);
    expect(insideFootprint({ x: AT.x, z: AT.z + 4.6 }, house)).toBe(false);
  });
});

describe('milíř u skácených buků (crafts.md – Milíř u skácených buků)', () => {
  it('kotva milíře – funkce milíře ho kreslí na místě u buků', () => {
    const center = { x: 123.5, z: -48 };
    const anchor = forestKilnAnchor(center);
    const place = milirPlace(anchor);
    expect(place.x).toBeCloseTo(center.x, 9);
    expect(place.z).toBeCloseTo(center.z, 9);
    const [vent] = kilnVents(anchor);
    expect(vent).toMatchObject({ kind: 'milir' });
    expect(vent!.x).toBeCloseTo(center.x, 9);
  });

  it('zasazený buk roste od sazenice do velikosti stromu', () => {
    expect(plantedScale(0, 1)).toBeCloseTo(0.15, 9);
    expect(plantedScale(1, 1.2)).toBeCloseTo(1.2, 9);
    expect(plantedScale(0.5, 1)).toBeGreaterThan(plantedScale(0.2, 1));
  });
});

describe('dílna tesaře (wagons.md – Tesař)', () => {
  it('polozemnice s přístřeškem, fáze stavby, bez dýmu', () => {
    expect(hasPorch('tesar')).toBe(true);
    expect(hasPorch('uhlir')).toBe(false);
    expect(CONSTRUCTION_PHASES.tesar.map((p) => p.id)).toContain('carpentry');
    expect(modelVents('tesar', AT)).toEqual([]);
    expect(modelVents('kovar', AT)).toHaveLength(1);
  });

  it('tesaři stojí pod přístřeškem (mezi stěnou a předním okrajem, mezi sloupy)', () => {
    const spots = modelSpots('tesar', AT);
    expect(spots.length).toBeGreaterThanOrEqual(3);
    for (const spot of spots) {
      const lx = spot.x - AT.x;
      const lz = spot.z - AT.z;
      expect(lz).toBeGreaterThan(2.1);
      expect(lz).toBeLessThan(PORCH_FRONT_M + 0.4);
      expect(Math.abs(lx)).toBeLessThan(2.3);
      expect(Math.hypot(spot.hx, spot.hz)).toBeCloseTo(1, 9);
    }
  });
});

describe('fáze milíře ve scéně (crafts.md – Milíř stojí vždy)', () => {
  it('bez milíře jen milířiště, příprava dřeva vytyčí a roste hráň polen', () => {
    expect(kilnLook(null)).toMatchObject({ site: null, model: null, smoke: false });
    const wood = kilnLook({ stage: 'wood', progress: 0.5 });
    expect(wood.model).toBeNull();
    const heap = (site: number): string[] =>
      constructionState('milir', site).parts.filter((p) => /^(ring|stack|cover)/.test(p));
    expect(heap(wood.site!)).toHaveLength(0);
    expect(wood.timber).toBeCloseTo(0.65, 9);
  });

  it('stavba po fázích staveniště, pálení – hotový milíř s dýmem', () => {
    const built = kilnLook({ stage: 'build', progress: 1 });
    expect(built.model).toBeNull();
    expect(constructionState('milir', built.site!).parts.length).toBeGreaterThan(0);
    const burning = kilnLook({ stage: 'burn', progress: 0.3 });
    expect(burning).toMatchObject({ site: null, model: { scale: 1, scaleY: 1 }, smoke: true });
  });

  it('vypálený milíř nekouří, sesedne a při rozebírání se zmenšuje podle uhlí', () => {
    const burnt = kilnLook({ stage: 'draw', progress: 0, charcoal: 1 });
    expect(burnt).toMatchObject({ smoke: false, baskets: false });
    expect(burnt.model!.scale).toBeCloseTo(1, 9);
    expect(burnt.model!.scaleY).toBeCloseTo(KILN_SETTLED, 9);
    const half = kilnLook({ stage: 'draw', progress: 0.5, charcoal: 0.5 });
    expect(half.baskets).toBe(true);
    expect(half.model!.scale).toBeLessThan(burnt.model!.scale);
    expect(half.model!.scaleY).toBeLessThan(burnt.model!.scaleY);
    const last = kilnLook({ stage: 'draw', progress: 0.98, charcoal: 0.02 });
    expect(last.model!.scaleY).toBeLessThan(half.model!.scaleY);
    expect(last.model!.scaleY).toBeGreaterThan(0);
  });
});

describe('nadzemní dílny ve scéně (workshops.md – Ve scéně)', () => {
  const CRAFTS = Object.keys(CRAFT_MODEL) as Craft[];
  const TYPES = ['vypleteny', 'srub'] as const;
  /** Dnešní tvar a dvě varianty rozměrů (population.md). */
  const FRAMES = [
    PLAIN_FRAME,
    shapeFrame('srub', { area: 1.1, ratio: 0.9, height: 1.1 }),
    shapeFrame('srub', { area: 0.9, ratio: 1.1, height: 0.9 }),
  ];

  it('dnešní dílna je jeden model, nadzemní dům typu a vedle přístřešek', () => {
    expect(workshopModelKeys('smith', 'polozemnice')).toEqual({ house: 'kovar', side: null });
    expect(workshopModelKeys('burner', 'zemnice')).toEqual({ house: 'uhlir', side: null });
    expect(workshopModelKeys('smith', 'srub')).toEqual({
      house: 'srub',
      side: 'pristresek-kovar',
    });
    expect(workshopModelKeys('potter', 'vypleteny')).toEqual({
      house: 'vypleteny',
      side: 'pristresek-hrncir',
    });
  });

  it('přístřešek má počátek na ose pravé boční stěny a s variantou rozměrů se posune s ní', () => {
    expect(shedOrigin('srub', PLAIN_FRAME)).toEqual({ x: 2.5, z: 0 });
    const wide = shapeFrame('srub', { area: 1.1, ratio: 0.9, height: 1 });
    expect(shedOrigin('srub', wide).x).toBeGreaterThan(2.5 - 1e-9);
    const { width } = DWELLING_FOOTPRINT_M.srub;
    expect(shedOrigin('srub', wide).x).toBeCloseTo(
      shapeRect(wide, { minX: -width / 2, maxX: width / 2, minZ: 0, maxZ: 0 }).maxX,
      9,
    );
  });

  it('řemeslníci stojí pod přístřeškem (nejvýš 1,8 m od něj), mimo dům a ve vyklízené ploše', () => {
    for (const craft of CRAFTS) {
      for (const type of TYPES) {
        for (const frame of FRAMES) {
          const spots = craftSpots(craft, TURNED, frame, type);
          expect(spots.length, `${craft} ${type}`).toBeGreaterThanOrEqual(3);
          const side = WORKSHOP_SIDE_M[craft];
          const o = shedOrigin(type, frame);
          const house = shapeRect(frame, {
            minX: -DWELLING_FOOTPRINT_M[type].width / 2,
            maxX: DWELLING_FOOTPRINT_M[type].width / 2,
            minZ: -DWELLING_FOOTPRINT_M[type].depth / 2,
            maxZ: DWELLING_FOOTPRINT_M[type].depth / 2,
          });
          const clearing = shapeRect(frame, DWELLING_CLEARING_M[type]);
          for (const spot of spots) {
            // zpět do osů domu
            const dx = spot.x - TURNED.x;
            const dz = spot.z - TURNED.z;
            const c = Math.cos(TURNED.rotation);
            const s = Math.sin(TURNED.rotation);
            const lx = dx * c - dz * s;
            const lz = dx * s + dz * c;
            expect(lx, `${craft} ${type} pod přístřeškem`).toBeGreaterThan(o.x);
            expect(lx, `${craft} ${type} pod přístřeškem`).toBeLessThan(o.x + side + 1.8);
            expect(Math.abs(lz - o.z), `${craft} ${type} podél stěny`).toBeLessThanOrEqual(3 + 1.8);
            // mimo dům, uvnitř vyklízené plochy s přístřeškem
            expect(lx).toBeGreaterThan(house.maxX);
            expect(lx).toBeLessThanOrEqual(clearing.maxX + side);
            expect(lz).toBeGreaterThanOrEqual(clearing.minZ);
            expect(lz).toBeLessThanOrEqual(clearing.maxZ);
            expect(Math.hypot(spot.hx, spot.hz)).toBeCloseTo(1, 9);
          }
        }
      }
    }
  });

  it('dým nadzemní hrnčířské pece a výhně vychází zpod přístřešku, tesař a uhlíř nekouří', () => {
    for (const type of TYPES) {
      expect(workshopVents('potter', AT, PLAIN_FRAME, type)).toHaveLength(1);
      expect(workshopVents('smith', AT, PLAIN_FRAME, type)).toHaveLength(1);
      expect(workshopVents('carpenter', AT, PLAIN_FRAME, type)).toEqual([]);
      expect(workshopVents('burner', AT, PLAIN_FRAME, type)).toEqual([]);
    }
    // před domem (dnešní dílna) dým beze změny
    expect(workshopVents('smith', AT, PLAIN_FRAME, 'polozemnice')).toEqual(
      workshopVents('smith', AT),
    );
  });
});
