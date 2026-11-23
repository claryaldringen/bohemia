import { describe, expect, it } from 'vitest';
import { parseExpeditionInput } from '../expedition-input';

// Tvar vstupu příkazu výpravě (expeditions.md – Výběr a skupina).

const ID = '8c1f0a52-5f6e-4a46-8f4b-0b5a6a3c9d11';
const input = (over: Record<string, unknown> = {}): unknown => ({
  villageId: ID,
  people: [1, 2, 3],
  command: { kind: 'go', pos: { x: 10, z: 20 } },
  ...over,
});

describe('parseExpeditionInput', () => {
  it('rozkaz, Domů, Osedlat a Sesednout projdou', () => {
    expect(parseExpeditionInput(input())).toEqual({
      villageId: ID,
      people: [1, 2, 3],
      command: { kind: 'order', order: { kind: 'go', pos: { x: 10, z: 20 } } },
    });
    expect(parseExpeditionInput(input({ command: { kind: 'home' } }))?.command).toEqual({
      kind: 'order',
      order: { kind: 'home' },
    });
    expect(parseExpeditionInput(input({ command: { kind: 'saddle' } }))?.command).toEqual({
      kind: 'saddle',
    });
    expect(parseExpeditionInput(input({ command: { kind: 'dismount' } }))?.command).toEqual({
      kind: 'dismount',
    });
    // útok na vyhnané zvíře lovu
    expect(parseExpeditionInput(input({ command: { kind: 'strike' } }))?.command).toEqual({
      kind: 'strike',
    });
    expect(parseExpeditionInput(input({ command: { kind: 'strike', x: 1 } }))).toBeNull();
  });

  it('go smí mít cell s celými čísly', () => {
    const command = { kind: 'go', pos: { x: 1, z: 2 }, cell: { x: -1, y: 3 } };
    expect(parseExpeditionInput(input({ command }))?.command).toEqual({
      kind: 'order',
      order: command,
    });
    expect(
      parseExpeditionInput(input({ command: { ...command, cell: { x: 1.5, y: 3 } } })),
    ).toBeNull();
    expect(parseExpeditionInput(input({ command: { ...command, cell: { x: 1 } } }))).toBeNull();
  });

  it('duplicitní, NaN, 201 lidí, prázdný výběr a neznámý příkaz → null', () => {
    expect(parseExpeditionInput(input({ people: [1, 1] }))).toBeNull();
    expect(parseExpeditionInput(input({ people: [1, Number.NaN] }))).toBeNull();
    expect(parseExpeditionInput(input({ people: [1.5] }))).toBeNull();
    expect(parseExpeditionInput(input({ people: [-1] }))).toBeNull();
    expect(parseExpeditionInput(input({ people: [] }))).toBeNull();
    expect(
      parseExpeditionInput(input({ people: Array.from({ length: 201 }, (_, i) => i + 1) })),
    ).toBeNull();
    expect(
      parseExpeditionInput(input({ people: Array.from({ length: 200 }, (_, i) => i + 1) })),
    ).not.toBeNull();
    expect(parseExpeditionInput(input({ command: { kind: 'attack' } }))).toBeNull();
    expect(parseExpeditionInput(input({ command: { kind: 'saddle', x: 1 } }))).toBeNull();
    expect(parseExpeditionInput(input({ villageId: 5 }))).toBeNull();
    expect(parseExpeditionInput({ ...(input() as object), extra: 1 })).toBeNull();
    expect(parseExpeditionInput(null)).toBeNull();
  });
});
