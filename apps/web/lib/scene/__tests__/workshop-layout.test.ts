import { describe, expect, it } from 'vitest';
import { MILIR, milirPosition } from '@bohemia/game';
import type { SceneVillage } from '../../village-view';
import { ventSmokeStrength, smokeStrength } from '../smoke-schedule';
import { CONSTRUCTION_PHASES } from '../village-construction';
import { plantedScale } from '../felled-trees';
import { insideFootprint } from '../village-picking';
import {
  CRAFT_MODEL,
  MILIR_SHAPE_M,
  PORCH_FRONT_M,
  craftSpots,
  forestKilnAnchor,
  milirHideShape,
  milirPlace,
  workshopVents,
} from '../workshop-layout';

const AT = { x: 10, z: 20, rotation: 0 };
const TURNED = { x: -5, z: 3, rotation: Math.PI / 2 };

describe('dílny ve scéně (crafts.md)', () => {
  it('řemeslo → model dílny s fázemi staveniště', () => {
    expect(CRAFT_MODEL).toEqual({ potter: 'hrncir', smith: 'kovar', burner: 'uhlir' });
    for (const model of Object.values(CRAFT_MODEL)) {
      expect(CONSTRUCTION_PHASES[model].length).toBeGreaterThan(0);
    }
  });

  it('milíř stojí kus od zemnice podle herního jádra a natáčí se s ní', () => {
    expect(milirPlace(AT)).toEqual(milirPosition(AT));
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

  it('dým: pec a výheň zpod přístřešku, uhlíř z komína milíře', () => {
    const [kiln] = workshopVents('potter', AT);
    expect(kiln).toMatchObject({ kind: 'craft' });
    expect(kiln!.z).toBeGreaterThan(AT.z + PORCH_FRONT_M);
    const [forge] = workshopVents('smith', TURNED);
    // vchod do +x – přístřešek před domem v +x
    expect(forge!.x).toBeGreaterThan(TURNED.x + PORCH_FRONT_M);
    const [milir] = workshopVents('burner', AT);
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

  it('kliknutí na přístřešek i na milíř vybere dílnu', () => {
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
    expect(insideFootprint({ x: milir.x, z: milir.z }, dwelling)).toBe(true);
    expect(insideFootprint({ x: milir.x, z: milir.z }, plain)).toBe(false);
    const house = { ...plain, type: 'polozemnice' as const };
    // před polozemnicí pod přístřeškem (5 / 2 + 2,6 m)
    expect(insideFootprint({ x: AT.x, z: AT.z + 4.6 }, { ...house, craft: 'potter' })).toBe(true);
    expect(insideFootprint({ x: AT.x, z: AT.z + 4.6 }, house)).toBe(false);
  });
});

describe('milíř v lese (crafts.md – Uhlíř)', () => {
  it('kotva lesního milíře – funkce milíře u dílny ho kreslí na místě v lese', () => {
    const center = { x: 123.5, z: -48 };
    const anchor = forestKilnAnchor(center);
    const place = milirPlace(anchor);
    expect(place.x).toBeCloseTo(center.x, 9);
    expect(place.z).toBeCloseTo(center.z, 9);
    const [vent] = workshopVents('burner', anchor);
    expect(vent).toMatchObject({ kind: 'milir' });
    expect(vent!.x).toBeCloseTo(center.x, 9);
  });

  it('zasazený buk roste od sazenice do velikosti stromu', () => {
    expect(plantedScale(0, 1)).toBeCloseTo(0.15, 9);
    expect(plantedScale(1, 1.2)).toBeCloseTo(1.2, 9);
    expect(plantedScale(0.5, 1)).toBeGreaterThan(plantedScale(0.2, 1));
  });
});
