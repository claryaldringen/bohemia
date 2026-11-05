import { isInviteAvailableTo } from '../../domain/world';
import type { Invite, InviteRepository } from '../invites';

/** Repozitář pozvánek v paměti – `reserve` a `consumeReservation` jsou atomické jako v databázi. */
export class InMemoryInvites implements InviteRepository {
  readonly invites: Invite[] = [];

  async issue(input: {
    code: string;
    issuerId: string;
    createdAt: Date;
    validUntil: Date;
  }): Promise<Invite | null> {
    if (this.invites.some((i) => i.code === input.code)) return null;
    const invite: Invite = {
      ...input,
      reservedBy: null,
      reservedAt: null,
      usedBy: null,
      usedAt: null,
      revokedAt: null,
    };
    this.invites.push(invite);
    return invite;
  }

  async find(code: string): Promise<Invite | null> {
    return this.invites.find((i) => i.code === code) ?? null;
  }

  async revoke(code: string, issuerId: string, at: Date): Promise<boolean> {
    const invite = this.invites.find((i) => i.code === code && i.issuerId === issuerId);
    if (!invite || invite.usedBy !== null || invite.revokedAt !== null) return false;
    invite.revokedAt = at;
    return true;
  }

  async listOf(issuerId: string): Promise<Invite[]> {
    return this.invites.filter((i) => i.issuerId === issuerId).reverse();
  }

  async reserve(code: string, userId: string, now: Date): Promise<'ok' | 'invalid'> {
    const invite = this.invites.find((i) => i.code === code);
    if (!invite || !isInviteAvailableTo(invite, userId, now)) return 'invalid';
    invite.reservedBy = userId;
    invite.reservedAt ??= now;
    return 'ok';
  }

  async consumeReservation(userId: string, now: Date): Promise<Invite | null> {
    const invite = this.invites.find(
      (i) => i.reservedBy === userId && i.usedBy === null && i.revokedAt === null,
    );
    if (!invite) return null;
    invite.usedBy = userId;
    invite.usedAt = now;
    return invite;
  }
}
