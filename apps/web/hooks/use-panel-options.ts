'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { panelAskKey, type PanelAsk, type PanelOptions } from '@/lib/panel-options';

/**
 * Zdroj nabídek panelů (panel-options.ts): `load` se zeptá serveru, `key` je otisk pohledu – když
 * se změní (nový den, akce), otevřený panel se zeptá znovu. `peek` – nabídka známá hned (testy
 * statického vykreslení), jinak null.
 */
export interface PanelOptionsSource {
  key: string;
  load: (ask: PanelAsk) => Promise<PanelOptions | null>;
  peek?: (ask: PanelAsk) => PanelOptions | null;
}

export const PanelOptionsContext = createContext<PanelOptionsSource | null>(null);

/**
 * Nabídka panelu `ask` (null = panel zavřený, nic se neptá). Do první odpovědi null; při novém
 * pohledu zůstane předchozí nabídka téhož panelu, dokud nepřijde nová.
 */
export function usePanelOptions(ask: PanelAsk | null): PanelOptions | null {
  const source = useContext(PanelOptionsContext);
  const askKey = ask ? panelAskKey(ask) : null;
  const [known, setKnown] = useState<{ askKey: string; options: PanelOptions } | null>(null);
  const viewKey = source?.key ?? null;
  const load = source?.load;
  useEffect(() => {
    if (askKey === null || !ask || !load) return;
    let live = true;
    void load(ask)
      .then((options) => {
        if (live && options) setKnown({ askKey, options });
      })
      .catch((error: unknown) => console.error('Nabídka panelu selhala.', error));
    return () => {
      live = false;
    };
    // dotaz se opakuje jen pro jiný panel nebo nový pohled (`ask` je nový objekt každé vykreslení)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askKey, viewKey, load]);
  if (!ask || askKey === null) return null;
  if (known && known.askKey === askKey) return known.options;
  return source?.peek?.(ask) ?? null;
}
