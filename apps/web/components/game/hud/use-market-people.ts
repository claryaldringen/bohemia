'use client';

import { useEffect, useRef, useState } from 'react';
import type { MarketTripPeople, TradeGoods, TradePeople } from '@bohemia/game';
import { CONNECTION_FAILED } from '../village-game/village-data';

/** Prodleva dotazu na lidi na prodej po poslední změně výběru (ms) – klikání se nesčítá do dotazů. */
export const MARKET_PEOPLE_DELAY_MS = 250;

/** Odpověď serveru na lidi na prodej (`marketTripPeople` jádra), nebo chyba česky. */
export type MarketPeopleAnswer = MarketTripPeople | { error: string };

/** Lidé na prodej pro náhled: bez lidí ve výběru, čeká se na server, odpověď, nebo chyba. */
export type MarketPeopleState =
  | { status: 'none' }
  | { status: 'pending' }
  | { status: 'ready'; people: MarketTripPeople }
  | { status: 'error'; error: string };

/**
 * Počty rodin, mužů, žen a otroků ve výběru „Dáš“ (celé kusy – krokuje je panel); `slaves` jen
 * s otroky, ať se dotaz bez nich nemění.
 */
function peopleIn(give: TradeGoods): TradePeople {
  const people: TradePeople = {
    families: give.families ?? 0,
    men: give.men ?? 0,
    women: give.women ?? 0,
  };
  const slaves = give.slaves ?? 0;
  return slaves > 0 ? { ...people, slaves } : people;
}

/**
 * Lidé na prodej pro náhled výpravy (markets.md – Rozhodnutí plánu 3, bod 10; plán 3, Úloha 11):
 * kolik skupin s celým výběrem odejde a kolik dospělých zbude na nosiče, spočítá jen server
 * (`marketTripPeople` – stejně jako kontrola výpravy při odeslání; model všech kombinací byl
 * drahý). Panel se zeptá `ask` na vybrané počty `MARKET_PEOPLE_DELAY_MS` po poslední změně.
 * Odpověď platí jen pro tytéž počty a týž pohled na ves `view` – po novém pohledu (další den, po
 * odeslání výpravy) se zeptá znovu. `ask` nemá selhat (chybu vrací jako `{ error }`).
 */
export function useMarketPeople(
  give: TradeGoods,
  view: object,
  ask: (people: TradePeople) => Promise<MarketPeopleAnswer>,
): MarketPeopleState {
  const { families, men, women, slaves = 0 } = peopleIn(give);
  const none = families + men + women + slaves === 0;
  const key = `${families}/${men}/${women}/${slaves}`;
  const askRef = useRef(ask);
  useEffect(() => {
    askRef.current = ask;
  }, [ask]);
  const [answer, setAnswer] = useState<{
    key: string;
    view: object;
    state: MarketPeopleState;
  } | null>(null);

  useEffect(() => {
    if (none) return;
    let live = true;
    const done = (state: MarketPeopleState): void => {
      if (live) setAnswer({ key, view, state });
    };
    const timer = setTimeout(() => {
      askRef.current(slaves > 0 ? { families, men, women, slaves } : { families, men, women }).then(
        (result) =>
          done(
            'error' in result
              ? { status: 'error', error: result.error }
              : { status: 'ready', people: result },
          ),
        () => done({ status: 'error', error: CONNECTION_FAILED }),
      );
    }, MARKET_PEOPLE_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [none, key, view, families, men, women, slaves]);

  if (none) return { status: 'none' };
  return answer !== null && answer.key === key && answer.view === view
    ? answer.state
    : { status: 'pending' };
}
