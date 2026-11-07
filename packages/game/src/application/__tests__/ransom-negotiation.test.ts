import { describe, expect, it } from 'vitest';
import { bundle } from '../../domain/vassalage/__tests__/shipment-fixtures';
import { acceptNegotiation, openNegotiation, type RansomHooks } from '../negotiate';
import { NOW, setup } from './negotiation-fixture';

// Výkupné jako řádek jednání (war.md – Vzdaní, zajetí a výkupné): kontrola před nabídkou, po přijetí
// zaplacení a propuštění, odmítnutí, když zajatce nikdo nedrží.

const price = bundle({ grainKg: 300 });
const items = [{ kind: 'ransom' as const, prisonerIds: ['c1:5'], price }];

function hooks(held: boolean): { hooks: RansomHooks; applied: unknown[]; released: unknown[] } {
  const applied: unknown[] = [];
  const released: unknown[] = [];
  return {
    applied,
    released,
    hooks: {
      check: (parties) =>
        Promise.resolve(
          held
            ? { ok: true as const, captorHouseId: parties[0] }
            : { ok: false as const, reason: 'Tohle zajetí už neplatí.' },
        ),
      apply: (input) => {
        applied.push(input);
        return Promise.resolve(null);
      },
      release: (input) => {
        released.push(input);
        return Promise.resolve();
      },
    },
  };
}

describe('výkupné v jednání', () => {
  it('přijetí zaplatí výkupné a propustí zajatce', async () => {
    const w = await setup();
    const fake = hooks(true);
    const deps = { ...w.deps, ransom: fake.hooks };
    const opened = await openNegotiation(deps, {
      playerId: 'player-a',
      to: w.ids.b!,
      items,
      message: null,
      now: NOW,
      today: 100,
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const accepted = await acceptNegotiation(deps, {
      playerId: 'player-b',
      negotiationId: opened.negotiation.id,
      now: NOW,
      today: 100,
    });
    expect(accepted.ok).toBe(true);
    expect(fake.applied).toHaveLength(1);
    expect(fake.applied[0]).toMatchObject({ captorHouseId: w.ids.b, payerHouseId: w.ids.a });
  });

  it('bez držených zajatců nejde nabídnout', async () => {
    const w = await setup();
    const res = await openNegotiation(
      { ...w.deps, ransom: hooks(false).hooks },
      { playerId: 'player-a', to: w.ids.b!, items, message: null, now: NOW, today: 100 },
    );
    expect(res).toEqual({ ok: false, reason: 'Tohle zajetí už neplatí.' });
  });

  it('bez hlásičů výkupného nejde nabídnout', async () => {
    const w = await setup();
    const res = await openNegotiation(w.deps, {
      playerId: 'player-a',
      to: w.ids.b!,
      items,
      message: null,
      now: NOW,
      today: 100,
    });
    expect(res.ok).toBe(false);
  });
});
