import { describe, expect, it } from 'vitest';
import { fencedSquareEquivalents, newFenceSides } from '../fence-cost';

const cell = (x: number, y: number): { x: number; y: number } => ({ x, y });

describe('newFenceSides', () => {
  it('samostatný čtverec chce plot na čtyřech stranách', () => {
    expect(newFenceSides([cell(0, 0)], [])).toBe(4);
  });
  it('dva nové čtverce vedle sebe nemají mezi sebou plot', () => {
    expect(newFenceSides([cell(0, 0), cell(1, 0)], [])).toBe(6);
  });
  it('rozšíření o čtverec po jedné straně ušetří jednu stranu', () => {
    expect(newFenceSides([cell(1, 0)], [cell(0, 0)])).toBe(3);
  });
  it('čtverec v koutě L-tvaru ušetří dvě strany', () => {
    expect(newFenceSides([cell(1, 1)], [cell(0, 0), cell(1, 0), cell(0, 1)])).toBe(2);
  });
  it('čtverec, který zaplní díru ze tří stran, chce jednu stranu', () => {
    expect(newFenceSides([cell(1, 1)], [cell(0, 1), cell(1, 0), cell(2, 1)])).toBe(1);
  });
});

describe('fencedSquareEquivalents', () => {
  it('samostatný čtverec stojí celou cenu', () => {
    expect(fencedSquareEquivalents(1, 4, 0.5)).toBe(1);
  });
  it('rozšíření po jedné straně je o osminu levnější při polovičním podílu plotu', () => {
    expect(fencedSquareEquivalents(1, 3, 0.5)).toBeCloseTo(0.875);
  });
  it('čtverec bez nového plotu platí jen zbytek', () => {
    expect(fencedSquareEquivalents(1, 0, 0.3)).toBeCloseTo(0.7);
  });
});
