import { describe, expect, it } from 'vitest';
import type { Person } from '../../types';
import { canBeSold, enslaveLed, isSlave } from '../slaves';
import { rehomePeople } from '../transfer-people';

// Otroci (markets.md – Pravidla 7, Rozhodnutí plánu 5, body 1 a 6).

const slave = (extra: Partial<Person> = {}): Person => ({
  id: 1,
  bornDay: 0,
  dwellingId: 1,
  slave: true,
  ...extra,
});

describe('canBeSold', () => {
  it('otrok-pohan jde prodat', () => {
    expect(canBeSold(slave())).toBe(true);
    expect(isSlave(slave())).toBe(true);
  });

  it('pokřtěný otrok ne', () => {
    expect(canBeSold(slave({ faith: 'christian' }))).toBe(false);
  });

  it('svobodný pohan ne', () => {
    const free: Person = { id: 1, bornDay: 0, dwellingId: 1 };
    expect(canBeSold(free)).toBe(false);
    expect(isSlave(free)).toBe(false);
  });

  it('otrok s příznakem rodu nebo šlechtic ne', () => {
    expect(canBeSold(slave({ line: true }))).toBe(false);
    expect(canBeSold(slave({ noble: { houseId: 'h1' } }))).toBe(false);
  });
});

describe('enslaveLed', () => {
  it('pohan se stane otrokem', () => {
    const p: Person = { id: 1, bornDay: 0, dwellingId: 1 };
    enslaveLed(p);
    expect(p.slave).toBe(true);
  });

  it('křesťan zůstane svobodný', () => {
    const p: Person = { id: 1, bornDay: 0, dwellingId: 1, faith: 'christian' };
    enslaveLed(p);
    expect(p.slave).toBeUndefined();
  });
});

describe('rehomePeople', () => {
  it('příchozí si příznak otroka nese', () => {
    const { arrivals } = rehomePeople({ nextId: 50 }, [slave({ id: 4 })]);
    expect(arrivals[0]).toMatchObject({ id: 50, slave: true });
  });
});
