import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefObject } from 'react';
import type { VillageView } from '@/lib/village-view';
import { villageCommands } from '../village-commands';

// Obsluha objednávky zbroje (plán 4): akce dostane id zobrazené vsi, zboží a počet.

const orderArms = vi.hoisted(() => vi.fn());
vi.mock('@/app/game/actions', () => ({
  orderArms,
  // ostatní akce modul `village-commands` jen importuje
  ...Object.fromEntries(
    [
      'abandonFieldParts',
      'abandonStructure',
      'addFortificationRampart',
      'baptizeLord',
      'buildTrail',
      'buildWagonRoad',
      'cancelConstruction',
      'choosePlayerDeparture',
      'decidePrisonerAction',
      'declareHunt',
      'sendMarketExpedition',
      'demolishFortificationSection',
      'demolishStructure',
      'ennobleVillager',
      'fillFortificationMoat',
      'inviteLodge',
      'inviteMaster',
      'leaveVillage',
      'orderStoneQuarrying',
      'plantRoadApples',
      'renameVillage',
      'restoreStructure',
      'setDefenseStance',
      'setSteward',
      'upgradeFortification',
      'upgradeFortificationGate',
      'abandonFortificationGate',
      'demolishFortificationGate',
      'upgradeRoad',
    ].map((name) => [name, vi.fn()]),
  ),
}));

describe('villageCommands.orderArms', () => {
  beforeEach(() => orderArms.mockReset());

  it('akce dostane villageId zobrazené vsi, zboží a počet', async () => {
    const runAction = vi.fn((action: () => Promise<unknown>) => action().then(() => null));
    orderArms.mockResolvedValue({});
    const commands = villageCommands({
      scene: null,
      viewRef: { current: { id: 'v-7' } } as unknown as RefObject<VillageView | null>,
      runAction: runAction as never,
      runBuildAction: vi.fn(),
      pushNotice: vi.fn(),
      setSelected: vi.fn(),
    });
    await commands.orderArms('helmets', 4);
    expect(orderArms).toHaveBeenCalledWith({ villageId: 'v-7', good: 'helmets', amount: 4 });
  });

  it('bez zobrazené vsi nic neposílá', async () => {
    const runAction = vi.fn();
    const commands = villageCommands({
      scene: null,
      viewRef: { current: null },
      runAction: runAction as never,
      runBuildAction: vi.fn(),
      pushNotice: vi.fn(),
      setSelected: vi.fn(),
    });
    expect(await commands.orderArms('swords', 1)).toBeNull();
    expect(runAction).not.toHaveBeenCalled();
  });
});
