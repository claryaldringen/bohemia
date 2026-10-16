'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { getWorldState, type WorldClock } from '@bohemia/game';
import { formatWorldState } from '@/lib/game-date';

// Herní den trvá v ostrém světě ≈ 86 s, v zrychlených testovacích světech i zlomek sekundy.
const REFRESH_MS = 1000;

interface Props {
  world: WorldClock;
  /** Čas serveru při renderu – první render v prohlížeči tak sedí s HTML ze serveru. */
  initialNowMs: number;
}

export function GameDateBadge({ world, initialNowMs }: Props): ReactElement {
  const [nowMs, setNowMs] = useState(initialNowMs);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <p className="fixed top-3 right-4 font-serif text-xs text-stone-500">
      {formatWorldState(getWorldState(nowMs, world), world)}
    </p>
  );
}
