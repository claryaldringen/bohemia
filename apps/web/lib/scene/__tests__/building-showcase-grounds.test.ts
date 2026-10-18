import { describe, expect, it } from 'vitest';
import { CEMETERY } from '@bohemia/game';
import {
  FIELD_SHOWCASE_PHASES,
  ORCHARD_SHOWCASE_PHASES,
  SHOWCASE_BUILDINGS,
  SHOWCASE_GROUNDS,
  showcaseGrounds,
} from '../building-showcase-layout';

describe('pole, hřbitov a sad na vývojové stránce staveb', () => {
  it('fáze navazují na sebe a pokryjí průběh 0–1', () => {
    for (const phases of [FIELD_SHOWCASE_PHASES, ORCHARD_SHOWCASE_PHASES]) {
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

  it('pole: zakládání po čtvercích, brázdy, osev, zelené a zralé obilí, strniště', () => {
    const stages = (p: number): string[] =>
      showcaseGrounds(p).village.fields[0]!.parts.map((part) => part.crop ?? part.stage);
    expect(new Set(stages(0))).toEqual(new Set(['founding']));
    expect(new Set(stages(0.2))).toEqual(new Set(['founding', 'ready']));
    expect(new Set(stages(0.4))).toEqual(new Set(['ready']));
    expect(new Set(stages(0.55))).toEqual(new Set(['ready', 'sown']));
    expect(new Set(stages(0.7))).toEqual(new Set(['growing']));
    expect(new Set(stages(0.85))).toEqual(new Set(['ripe']));
    expect(new Set(stages(1))).toEqual(new Set(['stubble']));
    expect(showcaseGrounds(0.7).labels.field).toMatch(/ve hře zatím ne/);
    expect(showcaseGrounds(0.4).labels.field).not.toMatch(/ve hře zatím ne/);
  });

  it('hřbitov: založení ve fázích, pak přibývají hroby až do plného hřbitova', () => {
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
    expect(at(0.6).graves).toBeGreaterThan(0);
    expect(at(0.8).graves).toBeGreaterThan(at(0.6).graves);
    const capacity = at(1).squares.length * CEMETERY.gravesPerSquare;
    expect(at(1).graves).toBe(capacity);
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
