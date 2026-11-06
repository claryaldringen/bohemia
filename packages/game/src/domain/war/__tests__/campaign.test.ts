import { describe, expect, it } from 'vitest';
import { realTimeOf } from '../../calendar';
import { stepCampaign } from '../campaign';
import type { CampaignIntent, CampaignState, CampaignStep } from '../campaign-types';
import { dayOfTick, msOfTick, TICK_MS, tickOfMs } from '../ticks';
import {
  campaign,
  intent,
  LAUNCH,
  SET_OUT,
  SUMMER,
  SUMMER_DATE,
  world,
  worldOf,
} from './campaign-fixtures';

// Tažení po taktech (Úloha 6.5, Review bod 5): po kouscích = vcelku, restart z kontrolního bodu
// (JSON) = bez restartu, záměry přesně ve svém taktu.

/** Spočte tažení po kouscích `chunk` taktů; mezi kousky JSON (kontrolní bod). */
function inChunks(
  state: CampaignState,
  toTick: number,
  chunk: number,
  intents: readonly CampaignIntent[],
): CampaignStep {
  let current = state;
  const all: CampaignStep = { state, villageEvents: [], notices: [], waiting: null };
  while (current.tick < toTick && current.phase !== 'done') {
    const step = stepCampaign(current, Math.min(toTick, current.tick + chunk), intents, worldOf());
    expect(step.waiting).toBeNull();
    all.villageEvents.push(...step.villageEvents);
    all.notices.push(...step.notices);
    current = JSON.parse(JSON.stringify(step.state)) as CampaignState;
  }
  return { ...all, state: current };
}

/** Kopie s klíči objektů v obráceném pořadí (jako po cestě přes jsonb). */
function reversedKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v: unknown) => reversedKeys(v)) as T;
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>).reverse();
  return Object.fromEntries(entries.map(([k, v]) => [k, reversedKeys(v)])) as T;
}

describe('takty', () => {
  it('takt = 250 ms od začátku světa, den taktu shodný s kalendářem', () => {
    expect(TICK_MS).toBe(250);
    expect(tickOfMs(world.startMs, world)).toBe(0);
    expect(tickOfMs(world.startMs + 999, world)).toBe(3);
    expect(msOfTick(LAUNCH, world)).toBeGreaterThanOrEqual(realTimeOf(SUMMER_DATE, world));
    expect(tickOfMs(msOfTick(LAUNCH, world), world)).toBe(LAUNCH);
    expect(dayOfTick(LAUNCH, world)).toBe(SUMMER);
    expect(dayOfTick(LAUNCH - 1, world)).toBe(SUMMER - 1);
  });
});

describe('stepCampaign', () => {
  const END = LAUNCH + 900;
  const whole = stepCampaign(campaign(), END, SET_OUT, worldOf());

  it('vyrazí, dojde na sousední mapu k cíli, obrátí se a vrátí domů', () => {
    expect(whole.waiting).toBeNull();
    expect(whole.state.phase).toBe('done');
    expect(whole.state.returnReason).toBe('arrived');
    expect(whole.state.groups.every((g) => g.cell.x === 0 && g.cell.y === 0)).toBe(true);
    expect(whole.state.supplies.foodKg).toBeLessThan(20);
    expect(whole.villageEvents.map((e) => [e.villageId, e.body.kind])).toEqual([
      ['lhota', 'chronicle'],
      ['lhota', 'chronicle'],
      ['brod', 'chronicle'],
    ]);
    expect(whole.villageEvents[0]!.ref).toBe(`camp:c1:${LAUNCH + 2}:0`);
    expect(whole.notices).toEqual([
      {
        playerId: 'p1',
        kind: 'campaign-returned',
        payload: { campaignId: 'c1', reason: 'arrived' },
        gameDay: whole.state.day,
      },
    ]);
  });

  it('po 1, 7, 40 a 400 taktech = vcelku (stejný JSON stavu i události)', () => {
    for (const chunk of [1, 7, 40, 400]) {
      const parts = inChunks(campaign(), END, chunk, SET_OUT);
      expect(JSON.stringify(parts.state)).toBe(JSON.stringify(whole.state));
      expect(parts.villageEvents).toEqual(whole.villageEvents);
      expect(parts.notices).toEqual(whole.notices);
    }
  });

  it('restart z kontrolního bodu uprostřed pochodu = bez restartu', () => {
    const half = stepCampaign(campaign(), LAUNCH + 120, SET_OUT, worldOf());
    expect(half.state.phase).toBe('marching');
    const checkpoint = JSON.parse(JSON.stringify(half.state)) as CampaignState;
    const rest = stepCampaign(checkpoint, END, SET_OUT, worldOf());
    expect(JSON.stringify(rest.state)).toBe(JSON.stringify(whole.state));
    // jsonb v úložišti vrátí klíče objektů v jiném pořadí – takt na pořadí nezávisí
    const reordered = stepCampaign(reversedKeys(half.state), END, SET_OUT, worldOf());
    expect(reordered.state).toStrictEqual(whole.state);
    expect([...half.villageEvents, ...rest.villageEvents]).toEqual(whole.villageEvents);
  });

  it('záměr platí přesně ve svém taktu, záměr v minulosti a cizí se zahodí', () => {
    const before = stepCampaign(campaign(), LAUNCH + 1, SET_OUT, worldOf());
    expect(before.state.phase).toBe('assembling');
    const at = stepCampaign(before.state, LAUNCH + 2, SET_OUT, worldOf());
    expect(at.state.phase).toBe('marching');

    const late = stepCampaign(
      before.state,
      LAUNCH + 50,
      [intent(LAUNCH + 1, 1, { kind: 'set-out' })],
      worldOf(),
    );
    expect(late.state.phase).toBe('assembling');
    const foreign = stepCampaign(
      campaign(),
      LAUNCH + 50,
      [intent(LAUNCH + 2, 1, { kind: 'set-out' }, 'p2')],
      worldOf(),
    );
    expect(foreign.state.phase).toBe('assembling');
  });

  it('obrat rozkazem v taktu záměru; vstupní stav se nemění', () => {
    const start = campaign();
    const copy = JSON.stringify(start);
    const intents = [...SET_OUT, intent(LAUNCH + 40, 2, { kind: 'turn-back' })];
    const at = stepCampaign(start, LAUNCH + 40, intents, worldOf());
    expect(at.state.phase).toBe('returning');
    expect(at.state.returnReason).toBe('order');
    expect(stepCampaign(start, LAUNCH + 39, intents, worldOf()).state.phase).toBe('marching');
    expect(JSON.stringify(start)).toBe(copy);
    expect(stepCampaign(start, END, intents, worldOf()).state.phase).toBe('done');
  });

  it('bez jídla se vojsko na začátku dalšího dne obrátí', () => {
    const far = campaign({
      foodKg: 0,
      target: { villageId: 'daleko', cell: { x: 3, y: 0 }, pos: { x: 0, z: 0 } },
    });
    const step = stepCampaign(far, LAUNCH + 400, SET_OUT, worldOf());
    expect(step.state.phase).toBe('returning');
    expect(step.state.returnReason).toBe('supplies');
  });

  it('chybějící mapa takt zastaví; po načtení pokračuje se stejným výsledkem', () => {
    const partial = stepCampaign(
      campaign(),
      END,
      SET_OUT,
      worldOf((c) => c.x === 0),
    );
    expect(partial.waiting?.cells).toEqual([{ x: 1, y: 0 }]);
    expect(partial.state.tick).toBeLessThan(END);
    const rest = stepCampaign(partial.state, END, SET_OUT, worldOf());
    expect(JSON.stringify(rest.state)).toBe(JSON.stringify(whole.state));
    expect([...partial.villageEvents, ...rest.villageEvents]).toEqual(whole.villageEvents);
  });
});
