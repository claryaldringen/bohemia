import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEV_MODE_ONLY } from '@bohemia/game';
import { clearSkipProgress, reportSkipProgress } from '@/lib/skip-progress';

type FakeSession = { user: { id: string; devMode?: boolean } } | null;
const session = vi.hoisted(() => ({ current: null as FakeSession }));
vi.mock('@/lib/session', () => ({ getSession: async () => session.current }));

const { GET } = await import('../route');

afterEach(() => {
  clearSkipProgress('dev');
  clearSkipProgress('jiny');
  session.current = null;
});

describe('GET /api/dev/skip-progress', () => {
  it('nepřihlášený nic nedostane (401)', async () => {
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('hráč bez vývojového režimu nic nedostane (403)', async () => {
    session.current = { user: { id: 'dev', devMode: false } };
    reportSkipProgress('dev', { doneDays: 10, totalDays: 30 });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: DEV_MODE_ONLY });
  });

  it('vývojář dostane jen svůj průběh, po konci null – a nic se neukládá do mezipaměti', async () => {
    session.current = { user: { id: 'dev', devMode: true } };
    reportSkipProgress('jiny', { doneDays: 300, totalDays: 365 });
    expect(await (await GET()).json()).toEqual({ progress: null });

    reportSkipProgress('dev', { doneDays: 146, totalDays: 365 });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ progress: { doneDays: 146, totalDays: 365 } });

    clearSkipProgress('dev');
    expect(await (await GET()).json()).toEqual({ progress: null });
  });
});
