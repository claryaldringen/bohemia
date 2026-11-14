import { describe, expect, it } from 'vitest';
import { createDatabase } from '@bohemia/db';
import { ACCEPTANCE_EFFECT_DEPS, type PlayerLock } from '@bohemia/game';
import { acceptanceDeps } from '../acceptances';
import { computePause } from '../compute-pause';
import { createGameDeps } from '../deps';
import { cachedLandscapes } from '../landscape-cache';

// Skládání závislostí účinků přijetí (audit A2 – M7): web i worker je berou odsud, takže
// schránka workeru má tytéž účinky jako přijetí ve webu – žádný se tiše nepřeskočí.

const locks: PlayerLock = {
  run: (_playerId, run) => run(),
  tryRun: async (_playerId, run) => ({ ran: true, value: await run() }),
};

describe('acceptanceDeps', () => {
  it('složí všechny závislosti, které účinky přijetí potřebují', async () => {
    // jen skládání – pool se k databázi nepřipojí, dokud nepadne dotaz
    const db = createDatabase('postgres://nikdo@127.0.0.1:1/nikde');
    try {
      const game = createGameDeps(db, {
        landscapes: cachedLandscapes(1),
        pause: computePause(),
        locks,
      });
      const deps = acceptanceDeps(game);
      for (const key of ACCEPTANCE_EFFECT_DEPS) expect(deps[key], key).toBeDefined();
      expect(ACCEPTANCE_EFFECT_DEPS).toEqual(['aid', 'dialogs', 'escheatGift', 'cede', 'ransom']);
      expect(deps.aid.loans).toBe(game.loans);
      expect(deps.aid.prepareVillage).toBeTypeOf('function');
      expect(deps.aid.shipments).toMatchObject({
        shipments: game.shipments,
        villages: game.villages,
        settlements: game.settlements,
        locks,
      });
      expect(deps.dialogs).toBe(game.dialogs);
      expect(deps.cede).toBe(game.cede);
      expect(deps.negotiations).toBe(game.negotiations);
      expect(deps.worldSeed).toBe(game.worldSeed);
    } finally {
      await db.$client.end();
    }
  });
});
