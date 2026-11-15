'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComputeProgress } from '@bohemia/game';
import { useSerialRefresh, useServerEvent, useServerResync } from './use-server-events';

/** Route Handler s průběhem přeskoku času (server action být nemůže – čekala by za přeskokem). */
export const SKIP_PROGRESS_URL = '/api/dev/skip-progress';

/** Průběh z odpovědi serveru – jen celá nezáporná čísla, hotovo nejvýš celek; jinak null. */
export function parseSkipProgress(body: unknown): ComputeProgress | null {
  if (typeof body !== 'object' || body === null || !('progress' in body)) return null;
  const progress = body.progress;
  if (typeof progress !== 'object' || progress === null) return null;
  const { doneDays, totalDays } = progress as Record<string, unknown>;
  if (!Number.isInteger(doneDays) || !Number.isInteger(totalDays)) return null;
  const done = doneDays as number;
  const total = totalDays as number;
  if (done < 0 || total < done) return null;
  return { doneDays: done, totalDays: total };
}

/**
 * Průběh přeskoku času (vývojový režim) – dokud `active`, jede z události `skip` (server ji posílá
 * nejvýš 4× za sekundu a při konci s null). Jeden dotaz je při zapnutí (přeskok už mohl běžet)
 * a po obnovení spojení; jinak se neptá. Mimo přeskok i před první odpovědí null.
 */
export function useSkipProgress(active: boolean): ComputeProgress | null {
  const [progress, setProgress] = useState<ComputeProgress | null>(null);
  const [wasActive, setWasActive] = useState(active);
  const activeRef = useRef(active);
  // kolik událostí už dorazilo – odpověď dotazu, který začal před novější událostí, se zahodí
  const eventsRef = useRef(0);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  // nový přeskok začíná bez průběhu toho minulého (úprava stavu při změně vstupu – během vykreslení)
  if (wasActive !== active) {
    setWasActive(active);
    setProgress(null);
  }
  const load = useCallback(async (): Promise<void> => {
    const seen = eventsRef.current;
    const response = await fetch(SKIP_PROGRESS_URL, { cache: 'no-store' });
    if (!response.ok) return;
    const next = parseSkipProgress(await response.json());
    // odpověď po konci přeskoku nebo po novější události se zahodí
    if (activeRef.current && eventsRef.current === seen) setProgress(next);
  }, []);
  const ask = useSerialRefresh(load, 'Průběh přeskoku se nepodařilo načíst.');
  useEffect(() => {
    if (active) ask();
  }, [active, ask]);
  useServerEvent('skip', (event) => {
    if (!activeRef.current) return;
    eventsRef.current += 1;
    setProgress(parseSkipProgress(event));
  });
  useServerResync(() => {
    if (activeRef.current) ask();
  });
  return active ? progress : null;
}
