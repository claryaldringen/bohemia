import { and, eq } from 'drizzle-orm';
import {
  DEFAULT_LANGUAGE,
  isLanguageGroup,
  type AccountLanguages,
  type LanguageGroup,
} from '@bohemia/game';
import type { Database } from '../client';
import { account, user } from '../schema';

/** Drizzle adaptér portu AccountLanguages nad tabulkou `user`. */
export function createAccountLanguages(db: Database): AccountLanguages {
  return {
    async languageOf(playerId): Promise<LanguageGroup> {
      const [row] = await db
        .select({ language: user.language })
        .from(user)
        .where(eq(user.id, playerId))
        .limit(1);
      const language = row?.language;
      return isLanguageGroup(language) ? language : DEFAULT_LANGUAGE;
    },
    async setLanguage(playerId, language): Promise<void> {
      await db.update(user).set({ language }).where(eq(user.id, playerId));
    },
  };
}

/** Přihlašovací poskytovatel účtu (tabulka `account`, Better Auth) – pro volbu jazyka u Googlu. */
export function createAccountProviders(db: Database): {
  hasProvider(playerId: string, providerId: string): Promise<boolean>;
} {
  return {
    async hasProvider(playerId, providerId): Promise<boolean> {
      const [row] = await db
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, playerId), eq(account.providerId, providerId)))
        .limit(1);
      return row !== undefined;
    },
  };
}
