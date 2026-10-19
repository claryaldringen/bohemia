import { describe, expect, it } from 'vitest';
import { CEMETERY } from '@bohemia/game';
import type { SceneFieldPart } from '../../village-view';
import { FIELD_LOOKS } from '../field-look';
import {
  FIELD_SHOWCASE_PHASES,
  LEGUME_SHOWCASE_PHASES,
  ORCHARD_SHOWCASE_PHASES,
  SHOWCASE_BUILDINGS,
  SHOWCASE_GROUNDS,
  showcaseGrounds,
} from '../building-showcase-layout';

describe('pole, hřbitov a sad na vývojové stránce staveb', () => {
  it('fáze navazují na sebe a pokryjí průběh 0–1', () => {
    for (const phases of [FIELD_SHOWCASE_PHASES, LEGUME_SHOWCASE_PHASES, ORCHARD_SHOWCASE_PHASES]) {
      expect(phases[0]!.from).toBe(0);
      expect(phases.at(-1)!.to).toBe(1);
      for (let i = 1; i < phases.length; i++) expect(phases[i]!.from).toBe(phases[i - 1]!.to);
    }
  });

  it('čtverce leží za stavbami a nepřekrývají se navzájem', () => {
    const squares = SHOWCASE_GROUNDS.flatMap((g) => g.squares);
    const keys = new Set(squares.map((s) => `${s.cell.x},${s.cell.y}`));
    expect(keys.size).toBe(squares.length);
    const back = Math.max(...SHOWCASE_BUILDINGS.flatMap((b) => b.models.map((m) => m.z))) + 10;
    for (const s of squares) expect(s.z - s.size / 2).toBeGreaterThan(back);
  });

  it('pole projde všechny vzhledy – práce jde po čtvercích, rozpracovaný je vždy jen jeden', () => {
    const parts = (p: number): SceneFieldPart[] => showcaseGrounds(p).village.fields[0]!.parts;
    const looks = new Set<string>();
    for (let p = 0; p <= 1; p += 0.005) {
      for (const part of parts(p)) if (part.look && (part.work ?? 1) > 0) looks.add(part.look);
      const working = parts(p).filter(
        (part) => part.work !== undefined && part.work > 0 && part.work < 1,
      );
      expect(working.length).toBeLessThanOrEqual(1);
    }
    expect([...looks].sort()).toEqual([...FIELD_LOOKS].sort());
    // na začátku jen vytyčené pole (zakládá se, práce 0)
    expect(parts(0).every((part) => part.stage === 'founding' && part.work === 0)).toBe(true);
    expect(showcaseGrounds(0).labels.field).toMatch(/vytyčení/);
    expect(showcaseGrounds(0.6).labels.field).toMatch(/žeň/);
  });

  it('pole s luštěninami: osev, zelený a zralý hrách, sklizeň po čtvercích, holá zem', () => {
    const parts = (p: number): SceneFieldPart[] =>
      showcaseGrounds(p).village.fields.find((f) => f.id === 3)!.parts;
    const looks = new Set<string>();
    for (let p = 0; p <= 1; p += 0.005) {
      expect(parts(p).every((part) => part.crop === 'legume' && part.stage === 'sown')).toBe(true);
      for (const part of parts(p)) if (part.look && (part.work ?? 1) > 0) looks.add(part.look);
      const working = parts(p).filter(
        (part) => part.work !== undefined && part.work > 0 && part.work < 1,
      );
      expect(working.length).toBeLessThanOrEqual(1);
    }
    expect([...looks].sort()).toEqual(
      ['plowed', 'sown', 'sprouted', 'green', 'ripe', 'harvesting', 'stubble'].sort(),
    );
    expect(showcaseGrounds(0.7).labels.legumes).toMatch(/hromádkách/);
  });

  it('pole se lnem: osev, zelený, modře kvetoucí a zralý len, trhání po čtvercích, holá zem', () => {
    const parts = (p: number): SceneFieldPart[] =>
      showcaseGrounds(p).village.fields.find((f) => f.id === 4)!.parts;
    const looks = new Set<string>();
    let bloom = false;
    for (let p = 0; p <= 1; p += 0.005) {
      expect(parts(p).every((part) => part.crop === 'flax' && part.stage === 'sown')).toBe(true);
      for (const part of parts(p)) if (part.look && (part.work ?? 1) > 0) looks.add(part.look);
      // kvete jen zelený len
      for (const part of parts(p)) {
        if (part.bloom) expect(part.look).toBe('green');
        bloom ||= part.bloom === true;
      }
    }
    expect(bloom).toBe(true);
    expect([...looks].sort()).toEqual(
      ['plowed', 'sown', 'sprouted', 'green', 'ripe', 'harvesting', 'stubble'].sort(),
    );
    expect(showcaseGrounds(0.48).labels.flax).toMatch(/kvete/);
    expect(showcaseGrounds(0.7).labels.flax).toMatch(/panácích/);
  });

  it('louka na seno: tráva, seč, kupky a stohy souběžně s loukou na poli', () => {
    expect(showcaseGrounds(0.5).labels.meadow).toMatch(/louka/);
    expect(showcaseGrounds(0.89).labels.meadow).toMatch(/seč/);
    expect(showcaseGrounds(0.93).labels.meadow).toMatch(/kupk/);
    expect(showcaseGrounds(0.98).labels.meadow).toMatch(/stohy/);
  });

  it('hřbitov: založení ve fázích, pak přibývají mohyly podle významu až do plného hřbitova', () => {
    const at = (
      p: number,
    ): NonNullable<ReturnType<typeof showcaseGrounds>['village']['cemeteries']>[number] =>
      showcaseGrounds(p).village.cemeteries![0]!;
    expect(at(0.1).built).toBe(false);
    expect(at(0.1).progress).toBeCloseTo(0.2);
    expect(showcaseGrounds(0.05).labels.cemetery).toMatch(/vytyčení/);
    expect(showcaseGrounds(0.15).labels.cemetery).toMatch(/kůlů/);
    expect(showcaseGrounds(0.4).labels.cemetery).toMatch(/plotu/);
    expect(at(0.6).built).toBe(true);
    const mounds = (p: number): number => at(p).mounds?.length ?? 0;
    expect(mounds(0.6)).toBeGreaterThan(0);
    expect(mounds(0.8)).toBeGreaterThan(mounds(0.6));
    // plný hřbitov – místa obsazená mohylami všech velikostí, posledních pár čerstvých
    const full = at(1).mounds!;
    const places = { great: 4, large: 2, normal: 1, small: 1 } as const;
    const capacity = at(1).squares.length * CEMETERY.gravesPerSquare;
    expect(full.reduce((sum, m) => sum + places[m.size], 0)).toBe(capacity);
    expect(new Set(full.map((m) => m.size))).toEqual(
      new Set(['great', 'large', 'normal', 'small']),
    );
    expect(full.filter((m) => m.fresh)).toHaveLength(3);
    expect(showcaseGrounds(1).labels.cemetery).toMatch(/plný hřbitov/);
  });

  it('sad: vytyčení, kůly, sazenice, rostoucí stromky, nakonec plný sad s jablky', () => {
    const square = (p: number): { planting: number; growth: number; fruit: boolean } =>
      showcaseGrounds(p).village.orchards![0]!.squares[0]!;
    expect(square(0.03).planting).toBe(0);
    expect(square(0.16).planting).toBeGreaterThan(0);
    expect(square(0.16).planting).toBeLessThan(0.5);
    expect(square(0.35).planting).toBeGreaterThan(0.5);
    expect(square(0.5).planting).toBe(1);
    expect(square(0.7).growth).toBeGreaterThan(square(0.5).growth);
    expect(square(0.7).fruit).toBe(false);
    expect(square(1).growth).toBe(1);
    expect(square(1).fruit).toBe(true);
    expect(showcaseGrounds(0.6).labels.orchard).toMatch(/\d+\. rok/);
  });
});
