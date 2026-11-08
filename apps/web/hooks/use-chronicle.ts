'use client';

import { useCallback, useEffect, useState } from 'react';
import { getChronicle } from '@/app/game/actions';
import {
  appendOlder,
  mergeNewest,
  type ChronicleAsk,
  type ChroniclePage,
} from '@/lib/chronicle-view';
import type { VillageView } from '@/lib/village-view';

const CONNECTION_FAILED = 'Spojení se serverem selhalo.';

type Load = (input: {
  villageId: string;
  before: number | null;
}) => Promise<ChroniclePage | { error: string }>;

/** Stav panelu Kronika pro `VillageGame` a lištu. */
export interface ChronicleControl {
  open: boolean;
  page: ChroniclePage | null;
  loading: boolean;
  error: string | null;
  toggle: () => void;
  close: () => void;
  loadOlder: () => void;
}

/**
 * Panel Kronika (chronicle-view.ts): první stránka se načte při otevření, při jiné vsi a když
 * v pohledu přibude zápis (`latest` – nejnovější zápis kroniky v pohledu); starší stránky na
 * vyžádání. Panely vpravo nahoře se střídají: otevření kroniky zavře ostatní (`closeOthers`),
 * otevření jiného panelu (`othersOpen`) zavře kroniku.
 */
export function useChronicle({
  villageId,
  latest,
  othersOpen,
  closeOthers,
  load = getChronicle,
}: {
  villageId: string | null;
  latest: VillageView['chronicle'][number] | undefined;
  othersOpen: boolean;
  closeOthers: () => void;
  load?: Load;
}): ChronicleControl {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<{ villageId: string; page: ChroniclePage } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // jiný panel na stejném místě kroniku zavře (stav se upraví při vykreslení, ne v efektu)
  const [othersBefore, setOthersBefore] = useState(othersOpen);
  if (othersBefore !== othersOpen) {
    setOthersBefore(othersOpen);
    if (othersOpen) setOpen(false);
  }
  const latestKey = latest ? `${latest.day}:${latest.kind}:${latest.text}` : '';

  useEffect(() => {
    if (!open || villageId === null) return;
    let live = true;
    const ask: ChronicleAsk & { villageId: string } = { villageId, before: null };
    void load(ask)
      .then((result) => {
        if (!live) return;
        if ('error' in result) {
          setError(result.error);
          return;
        }
        setError(null);
        setShown((known) => ({
          villageId,
          page: mergeNewest(known?.villageId === villageId ? known.page : null, result),
        }));
      })
      .catch(() => {
        if (live) setError(CONNECTION_FAILED);
      });
    return () => {
      live = false;
    };
  }, [open, villageId, latestKey, load]);

  const page = shown && shown.villageId === villageId ? shown.page : null;

  const loadOlder = (): void => {
    if (!page || page.olderThan === null || loading || villageId === null) return;
    setLoading(true);
    load({ villageId, before: page.olderThan })
      .then((result) => {
        if ('error' in result) {
          setError(result.error);
          return;
        }
        setError(null);
        setShown((known) =>
          known?.villageId === villageId
            ? { villageId, page: appendOlder(known.page, result) }
            : known,
        );
      })
      .catch(() => setError(CONNECTION_FAILED))
      .finally(() => setLoading(false));
  };

  const close = useCallback((): void => setOpen(false), []);
  const toggle = (): void => {
    if (open) {
      setOpen(false);
      return;
    }
    closeOthers();
    setError(null);
    setOpen(true);
  };

  return { open, page, loading, error, toggle, close, loadOlder };
}
