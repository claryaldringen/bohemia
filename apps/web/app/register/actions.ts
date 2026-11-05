'use server';

import { INVITE_INVALID, checkInvite, parseInviteCode } from '@bohemia/game';
import { createInviteRepository } from '@bohemia/db';
import { getDatabase } from '@/lib/db';
import { forgetInvite, rememberInvite } from '@/lib/invite-cookie';

/**
 * Předběžná kontrola pozvánky před registrací: platný kód se uloží do cookie (registrace i Google
 * ho přečtou), neplatný dá hlášku k poli a cookie smaže – registrace jde dál bez kódu.
 */
export async function checkInviteAction(input: string): Promise<{ error?: string }> {
  const code = parseInviteCode(input);
  const invites = createInviteRepository(getDatabase());
  if (code === null || !(await checkInvite({ invites, now: () => new Date() }, code))) {
    await forgetInvite();
    return { error: INVITE_INVALID };
  }
  await rememberInvite(code);
  return {};
}
