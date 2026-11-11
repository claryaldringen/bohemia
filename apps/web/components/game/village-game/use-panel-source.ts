'use client';

import { useCallback, useMemo } from 'react';
import { getPanelOptions } from '@/app/game/actions';
import type { PanelOptionsSource } from '@/hooks/use-panel-options';
import type { PanelAsk, PanelOptions } from '@/lib/panel-options';
import type { VillageView } from '@/lib/village-view';

/**
 * Nabídky panelů až na vyžádání (panel-options.ts, `PanelOptionsContext`) – otevřený panel se
 * s novým pohledem (jiný otisk nebo den) zeptá znovu.
 */
export function usePanelSource(view: VillageView | null): PanelOptionsSource {
  const viewId = view?.id ?? null;
  const loadPanel = useCallback(
    async (ask: PanelAsk): Promise<PanelOptions | null> => {
      if (viewId === null) return null;
      const result = await getPanelOptions({ villageId: viewId, ...ask });
      return 'error' in result ? null : result;
    },
    [viewId],
  );
  const panelKey = view ? (view.stamp ?? `${view.id}:${view.dayIndex}`) : '';
  return useMemo<PanelOptionsSource>(
    () => ({ key: panelKey, load: loadPanel }),
    [panelKey, loadPanel],
  );
}
