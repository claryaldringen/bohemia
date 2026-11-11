'use client';

import type { ReactElement } from 'react';
import { chooseLanguageAction, requestLordsAction, startFreeAction } from '@/app/game/actions';
import { lastLordName } from '@/lib/lord-name-memory';
import { personPortrait } from '@/lib/person-view';
import type { VillageView } from '@/lib/village-view';
import { LanguageChoice } from '../hud/LanguageChoice';
import { LineNamePanel } from '../hud/LineNamePanel';
import { NewcomerPanel } from '../hud/NewcomerPanel';
import type { House } from './use-house';
import type { LineNaming } from './use-line-naming';

/**
 * Úvod a jména rodu (newcomers.md – Rozhraní; lord.md – Kde se jméno zadává): bez vsi řádek
 * ikon jazyků (účet přes Google), volba cesty odříznutého nováčka, jméno vojvody před založením
 * vsi; ve vsi panel jména muže rodu bez jména.
 */
export function FoundingPanels({
  view,
  languageChoice,
  house,
  naming,
}: {
  view: VillageView | null;
  /** Účet přes Google bez založené vsi – v úvodu řádek ikon jazyků. */
  languageChoice: boolean;
  house: House;
  naming: LineNaming;
}): ReactElement {
  const { foundingName, newcomerChoice, namingTarget } = naming;
  const { newcomer, negotiate } = house;
  return (
    <>
      {foundingName && languageChoice && (
        <LanguageChoice
          onChoose={(language) =>
            chooseLanguageAction(language).then((r) => {
              // jazyk mění pořadí nabídky pánů
              void house.refresh();
              return r.ok ? null : r.error;
            })
          }
        />
      )}
      {newcomer && newcomerChoice && (
        <NewcomerPanel
          status={newcomer}
          error={house.error}
          onRequest={(houseIds) => void negotiate(() => requestLordsAction(houseIds))}
          onStartFree={() => void negotiate(() => startFreeAction())}
        />
      )}
      {foundingName && newcomer !== null && !newcomerChoice && (
        <LineNamePanel
          lord
          portrait="man"
          initialName={lastLordName()}
          taken={[]}
          onConfirm={naming.confirmFounderName}
        />
      )}
      {!foundingName && !newcomerChoice && namingTarget && (
        <LineNamePanel
          key={namingTarget.id}
          lord={namingTarget.lord}
          portrait={personPortrait({ age: namingTarget.age, sex: 'male' })}
          taken={view?.dynasty?.taken ?? []}
          onConfirm={(name) => naming.confirmLineName(namingTarget.id, namingTarget.lord, name)}
          onClose={naming.closeLineName}
        />
      )}
    </>
  );
}
