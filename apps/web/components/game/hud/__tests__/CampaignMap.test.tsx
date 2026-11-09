// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CampaignViewFlight } from '@/lib/campaign-view';
import { FlightMarks } from '../CampaignMap';

// Ikony uprchlíků a posla na mapě tažení (war.md – Varování, poslové a útěk do hradiště; plán
// 2026-11-09 – Ú14, Ú15): jen skupiny na ukázané mapě, ikona podle druhu, počty v popisku.

const flight = (o: Partial<CampaignViewFlight>): CampaignViewFlight => ({
  refId: 'c:a1',
  kind: 'refugees',
  cell: { x: 1, y: 0 },
  pos: { x: 100, z: -40 },
  people: 10,
  herd: 12,
  mounted: false,
  ...o,
});

const here = (c: { x: number; y: number }): boolean => c.x === 1 && c.y === 0;

function marks(flights: CampaignViewFlight[] | undefined): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(
    <svg>
      <FlightMarks flights={flights} here={here} />
    </svg>,
  );
  return container;
}

describe('FlightMarks', () => {
  it('uprchlíci se stádem, posel na koni, skupina na jiné mapě se nekreslí', () => {
    const c = marks([
      flight({}),
      flight({ refId: 'c:a2', kind: 'messenger', people: 1, herd: 0, mounted: true }),
      flight({ refId: 'c:a3', cell: { x: 2, y: 0 } }),
    ]);
    const refugees = c.querySelectorAll('[data-testid="campaign-flight-refugees"]');
    expect(refugees).toHaveLength(1);
    expect(refugees[0]!.getAttribute('href')).toBe('/icons/war/alarm-all.png');
    expect(refugees[0]!.getAttribute('x')).toBe('45');
    expect(refugees[0]!.textContent).toBe('Uprchlíci – lidí 10, dobytka 12');
    const messenger = c.querySelector('[data-testid="campaign-flight-messenger"]');
    expect(messenger!.getAttribute('href')).toBe('/icons/war/alarm-messenger.png');
    expect(messenger!.textContent).toBe('Posel na koni');
  });

  it('jen lidé – ikona hradiště s postavou; bez skupin nic', () => {
    const c = marks([flight({ herd: 0 })]);
    const icon = c.querySelector('[data-testid="campaign-flight-refugees"]');
    expect(icon!.getAttribute('href')).toBe('/icons/war/alarm-people.png');
    expect(icon!.textContent).toBe('Uprchlíci – lidí 10');
    expect(marks(undefined).querySelector('[data-testid="campaign-flights"]')).toBeNull();
  });
});
