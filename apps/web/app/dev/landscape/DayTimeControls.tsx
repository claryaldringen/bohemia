'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { sunElevationDeg } from '@/lib/scene/day-light';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { REFERENCE_DAY } from '@/lib/scene/season-look';
import { formatHour, playedHour, type DayPlay } from './day-time';

/** Jak často se při přehrávání dne obnoví popisek hodiny (ms) – scéna si hodinu počítá sama. */
const LABEL_REFRESH_MS = 250;

interface Props {
  scene: LandscapeScene | null;
  /** Den v roce z posuvníku období (null = podle data – léto) – pro výšku slunce v popisku. */
  seasonDay: number | null;
  buttonClass: string;
}

/**
 * Den a noc na vývojové stránce (docs/design/landscape.md – Den a noc): posuvník hodiny dne,
 * „Přehrát den“ (den za ≈ 86 s jako ve hře, i spolu s přehráváním roku) a návrat k pevnému
 * světlu bez denní doby. Stav drží sama – při přehrávání se překresluje jen ona, ne celá stránka.
 */
export function DayTimeControls({ scene, seasonDay, buttonClass }: Props): ReactElement {
  const [hour, setHour] = useState<number | null>(null);
  const [play, setPlay] = useState<DayPlay | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!scene) return;
    if (play) scene.setDayClock((nowMs) => playedHour(play, nowMs));
    else scene.setDayClock(hour === null ? null : () => hour);
  }, [scene, hour, play]);

  useEffect(() => {
    if (!play) return;
    const timer = setInterval(() => setNow(Date.now()), LABEL_REFRESH_MS);
    return () => clearInterval(timer);
  }, [play]);

  return (
    <DayTimeReadout
      hour={play ? playedHour(play, Math.max(now, play.startedAt)) : hour}
      playing={play !== null}
      seasonDay={seasonDay}
      buttonClass={buttonClass}
      onHour={(next) => {
        setPlay(null);
        setHour(next);
      }}
      onTogglePlay={() => {
        if (play) {
          setHour(playedHour(play, Date.now()));
          setPlay(null);
        } else {
          const startedAt = Date.now();
          setNow(startedAt);
          setPlay({ fromHour: hour ?? 12, startedAt });
        }
      }}
    />
  );
}

interface ReadoutProps {
  hour: number | null;
  playing: boolean;
  seasonDay: number | null;
  buttonClass: string;
  onHour: (hour: number | null) => void;
  onTogglePlay: () => void;
}

/** Ovládání bez stavu (testuje se statickým renderem). */
export function DayTimeReadout({
  hour,
  playing,
  seasonDay,
  buttonClass,
  onHour,
  onTogglePlay,
}: ReadoutProps): ReactElement {
  const elevation = hour === null ? null : sunElevationDeg(seasonDay ?? REFERENCE_DAY, hour);
  return (
    <>
      <label
        className="flex items-center gap-1"
        title="Hodina dne – den a noc (pravý sluneční čas)"
      >
        Hodina
        <input
          type="range"
          min={0}
          max={24}
          step={0.25}
          value={hour ?? 12}
          data-testid="dev-day-hour"
          onChange={(e) => onHour(Number(e.target.value))}
        />
        <span className="w-32 tabular-nums" data-testid="dev-day-hour-label">
          {hour === null || elevation === null
            ? 'bez denní doby'
            : `${formatHour(hour)} · slunce ${Math.round(elevation)}°`}
        </span>
      </label>
      <button className={buttonClass} onClick={onTogglePlay} data-testid="dev-day-play">
        {playing ? '■ zastavit den' : '▶ Přehrát den'}
      </button>
      <button
        className={buttonClass}
        disabled={hour === null && !playing}
        onClick={() => onHour(null)}
        title="Pevné odpolední slunce jako ve hře"
      >
        Bez denní doby
      </button>
    </>
  );
}
