import type { CampaignLock } from '@bohemia/game';
import type { Pool } from 'pg';
import { createPlayerLock } from './player-lock';

// Zámek tažení (plán 2026-11-03 – Úloha 6.5): tažení počítá najednou jen jeden proces (dva
// workery, worker × web). Stejný advisory zámek na úrovni spojení jako zámek hráče, jen ve vlastním
// jmenném prostoru klíčů – zámek tažení se nikdy nesrazí se zámkem hráče.

/** Jmenný prostor zámků tažení – „Camp“ v ASCII (int4). */
export const CAMPAIGN_LOCK_NAMESPACE = 0x43616d70;

/** Adaptér portu `CampaignLock` nad poolem zámků `pool` (`createLockPool`). */
export function createCampaignLock(pool: Pool): CampaignLock {
  const lock = createPlayerLock(pool, {
    namespace: CAMPAIGN_LOCK_NAMESPACE,
    onLost: (campaignId, error) =>
      console.warn(
        `Zámek tažení ${campaignId}: spojení spadlo uprostřed výpočtu (${error.message}).`,
      ),
  });
  return { tryRun: (campaignId, run) => lock.tryRun(campaignId, run) };
}
