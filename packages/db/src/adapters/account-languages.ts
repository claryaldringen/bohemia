import { eq } from 'drizzle-orm';
import {
  DEFAULT_LANGUAGE,
  isLanguageGroup,
  type AccountLanguages,
  type LanguageGroup,
} from '@bohemia/game';
import type { Database } from '../client';
import { user } from '../schema';

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
