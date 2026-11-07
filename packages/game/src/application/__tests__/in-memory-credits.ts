import type { SuccessionCreditRepository } from '../succession-credits';

interface Credit {
  playerId: string;
  inviteeId: string;
  grantedAt: Date;
  usedDay: number | null;
}

/** Kredity nástupnictví v paměti – unikát na pozvaného jako v databázi. */
export class InMemoryCredits implements SuccessionCreditRepository {
  readonly credits: Credit[] = [];

  async grantOnce(playerId: string, inviteeId: string, at: Date): Promise<boolean> {
    await Promise.resolve();
    if (this.credits.some((c) => c.inviteeId === inviteeId)) return false;
    this.credits.push({ playerId, inviteeId, grantedAt: at, usedDay: null });
    return true;
  }

  async unused(playerId: string): Promise<number> {
    return this.credits.filter((c) => c.playerId === playerId && c.usedDay === null).length;
  }

  async consumeOne(playerId: string, deathDay: number): Promise<boolean> {
    await Promise.resolve();
    const credit = this.credits.find((c) => c.playerId === playerId && c.usedDay === null);
    if (!credit) return false;
    credit.usedDay = deathDay;
    return true;
  }
}
