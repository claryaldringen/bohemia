'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComputeProgress } from '@bohemia/game';
import { usePolling } from './use-polling';

/** Route Handler s průběhem přeskoku času (server action být nemůže – čekala by za přeskokem). */
export const SKIP_PROGRESS_URL = '/api/dev/skip-progress';

/** Jak často se během přeskoku ptá na průběh (ms). */
export const SKIP_PROGRESS_POLL_MS = 400;

const pollDelay = (): number => SKIP_PROGRESS_POLL_MS;

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
 * Průběh přeskoku času (vývojový režim) – dokud `active`, ptá se serveru každých
 * `SKIP_PROGRESS_POLL_MS` ms; mimo přeskok i před první odpovědí null.
 */
export function useSkipProgress(active: boolean): ComputeProgress | null {
  const [progress, setProgress] = useState<ComputeProgress | null>(null);
  const [wasActive, setWasActive] = useState(active);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  // nový přeskok začíná bez průběhu toho minulého (úprava stavu při změně vstupu – během vykreslení)
  if (wasActive !== active) {
    setWasActive(active);
    setProgress(null);
  }
  const poll = useCallback(async (): Promise<void> => {
    const response = await fetch(SKIP_PROGRESS_URL, { cache: 'no-store' });
    if (!response.ok) return;
    const next = parseSkipProgress(await response.json());
    // odpověď, která dorazila až po konci přeskoku, se zahodí
    if (activeRef.current) setProgress(next);
  }, []);
  usePolling(poll, pollDelay, active);
  return active ? progress : null;
}
