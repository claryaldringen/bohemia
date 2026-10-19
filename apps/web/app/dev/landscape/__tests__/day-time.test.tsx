import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GAME_DAY_MS } from '@/lib/scene/day-light';
import { DayTimeReadout } from '../DayTimeControls';
import { formatHour, playedHour } from '../day-time';

describe('den a noc na vývojové stránce', () => {
  it('přehrávaný den běží jako ve hře – celý den za herní den, dokola', () => {
    const play = { fromHour: 6, startedAt: 1000 };
    expect(playedHour(play, 1000)).toBe(6);
    expect(playedHour(play, 1000 + GAME_DAY_MS / 4)).toBeCloseTo(12, 9);
    expect(playedHour(play, 1000 + GAME_DAY_MS)).toBeCloseTo(6, 9);
    expect(playedHour({ fromHour: 23, startedAt: 0 }, GAME_DAY_MS / 12)).toBeCloseTo(1, 9);
  });

  it('hodina jako 6:05', () => {
    expect(formatHour(6 + 5 / 60)).toBe('6:05');
    expect(formatHour(0)).toBe('0:00');
    expect(formatHour(23.999)).toBe('23:59');
    expect(formatHour(24)).toBe('0:00');
  });

  it('bez denní doby to popisek řekne, s hodinou ukáže i výšku slunce', () => {
    const props = { playing: false, seasonDay: null, buttonClass: '', onHour: () => undefined };
    const none = renderToStaticMarkup(
      <DayTimeReadout {...props} hour={null} onTogglePlay={() => undefined} />,
    );
    expect(none).toContain('bez denní doby');
    expect(none).toContain('▶ Přehrát den');
    const noon = renderToStaticMarkup(
      <DayTimeReadout {...props} hour={12} onTogglePlay={() => undefined} />,
    );
    expect(noon).toContain('12:00 · slunce 62°');
  });
});
