import { describe, expect, it } from 'vitest';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryInvites } from './in-memory-invites';
import {
  INVITE_LIMIT,
  INVITE_NEEDS_HOUSE,
  checkInvite,
  issueInvite,
  reserveInvite,
  revokeInvite,
  type InviteDeps,
} from '../invites';

const DAY = 86_400_000;

async function setup(): Promise<{
  deps: InviteDeps;
  invites: InMemoryInvites;
  clock: { now: Date };
}> {
  const invites = new InMemoryInvites();
  const houses = new InMemoryHouses();
  const clock = { now: new Date('2026-11-05T12:00:00Z') };
  let n = 0;
  // Postupná náhoda – každý kód jiný.
  const random = { random: (): number => ((n++ * 7 + 3) % 97) / 97 };
  await houses.create({ playerId: 'p1', kind: 'player', createdAt: clock.now });
  return { deps: { invites, houses, random, now: () => clock.now }, invites, clock };
}

describe('pozvánky', () => {
  it('vydat smí jen hráč s živým rodem', async () => {
    const { deps } = await setup();
    expect(await issueInvite(deps, 'bez-rodu')).toEqual({ ok: false, error: INVITE_NEEDS_HOUSE });
    expect((await issueInvite(deps, 'p1')).ok).toBe(true);
  });

  it('čtvrtý nevyužitý kód odmítne, propadlý, zrušený i využitý uvolní místo', async () => {
    const { deps, invites, clock } = await setup();
    const issued = [];
    for (let i = 0; i < 3; i++) {
      const r = await issueInvite(deps, 'p1');
      if (r.ok) issued.push(r.invite);
    }
    expect(issued).toHaveLength(3);
    expect(await issueInvite(deps, 'p1')).toEqual({ ok: false, error: INVITE_LIMIT });

    expect(await revokeInvite(deps, 'p1', issued[0]!.code)).toBe(true);
    expect((await issueInvite(deps, 'p1')).ok).toBe(true);
    expect(await issueInvite(deps, 'p1')).toEqual({ ok: false, error: INVITE_LIMIT });

    issued[1]!.usedBy = 'novy';
    expect((await issueInvite(deps, 'p1')).ok).toBe(true);

    // Po 14 dnech všechny propadnou a místo je zase volné.
    clock.now = new Date(clock.now.getTime() + 14 * DAY + 1);
    expect(invites.invites.length).toBeGreaterThan(3);
    expect((await issueInvite(deps, 'p1')).ok).toBe(true);
  });

  it('revoke: cizí nebo využitý kód nezruší', async () => {
    const { deps } = await setup();
    const r = await issueInvite(deps, 'p1');
    if (!r.ok) throw new Error('nevydáno');
    expect(await revokeInvite(deps, 'jiny', r.invite.code)).toBe(false);
    expect(await revokeInvite(deps, 'p1', 'nesmysl')).toBe(false);
    r.invite.usedBy = 'x';
    expect(await revokeInvite(deps, 'p1', r.invite.code)).toBe(false);
  });

  it('kód po 14 dnech neplatí; před tím ano', async () => {
    const { deps, clock } = await setup();
    const r = await issueInvite(deps, 'p1');
    if (!r.ok) throw new Error('nevydáno');
    expect(await checkInvite(deps, r.invite.code.toLowerCase())).toBe(true);
    clock.now = new Date(clock.now.getTime() + 14 * DAY - 1000);
    expect(await checkInvite(deps, r.invite.code)).toBe(true);
    clock.now = new Date(clock.now.getTime() + 2000);
    expect(await checkInvite(deps, r.invite.code)).toBe(false);
    expect(await reserveInvite(deps, 'novy', r.invite.code)).toBe('invalid');
  });

  it('rezervovaný kód nejde rezervovat jiným; téhož uživatele je idempotentní; vlastní ne', async () => {
    const { deps } = await setup();
    const r = await issueInvite(deps, 'p1');
    if (!r.ok) throw new Error('nevydáno');
    const code = r.invite.code;
    expect(await reserveInvite(deps, 'a', code)).toBe('ok');
    expect(await reserveInvite(deps, 'a', code)).toBe('ok');
    expect(await reserveInvite(deps, 'b', code)).toBe('invalid');
    expect(await checkInvite(deps, code)).toBe(false);
    const other = await issueInvite(deps, 'p1');
    if (!other.ok) throw new Error('nevydáno');
    expect(await reserveInvite(deps, 'p1', other.invite.code)).toBe('invalid');
    expect(await reserveInvite(deps, 'a', 'zly kod')).toBe('invalid');
  });

  it('zrušený kód nejde rezervovat', async () => {
    const { deps } = await setup();
    const r = await issueInvite(deps, 'p1');
    if (!r.ok) throw new Error('nevydáno');
    await revokeInvite(deps, 'p1', r.invite.code);
    expect(await reserveInvite(deps, 'a', r.invite.code)).toBe('invalid');
  });

  it('consumeReservation vrátí kód jen jednou', async () => {
    const { deps } = await setup();
    const r = await issueInvite(deps, 'p1');
    if (!r.ok) throw new Error('nevydáno');
    await reserveInvite(deps, 'a', r.invite.code);
    expect((await deps.invites.consumeReservation('a', deps.now()))?.code).toBe(r.invite.code);
    expect(await deps.invites.consumeReservation('a', deps.now())).toBeNull();
    expect(await deps.invites.consumeReservation('b', deps.now())).toBeNull();
  });
});
