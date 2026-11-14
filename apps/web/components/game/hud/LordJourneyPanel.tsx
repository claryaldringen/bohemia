import type { ReactElement } from 'react';
import { Tooltip } from './Tooltip';

/**
 * Ovládání vybraných lidí venku v panelu výběru (expeditions.md – Výběr a skupina): ikona Domů,
 * která skupinu pošle nejkratší cestou do vsi. Jako v 0 A.D. – ikona, slovo jen v popisku; rozkaz
 * „Jdi sem“ se dává pravým tlačítkem do krajiny (`useExpeditionOrders`).
 */
export interface LordJourneyUi {
  onHome: () => void;
}

export function LordJourneyPanel({
  ui,
  placement = 'above',
}: {
  ui: LordJourneyUi;
  /** Kam se otevře popisek Domů (v panelu výběru nahoru, na cizí mapě v horním rohu dolů). */
  placement?: 'above' | 'below';
}): ReactElement {
  return (
    <div className="flex items-center gap-1.5" data-testid="lord-journey-away">
      <Tooltip content="Domů" placement={placement}>
        <button
          type="button"
          data-testid="lord-home"
          aria-label="Domů"
          className="hud-icon-button h-9 w-9"
          onClick={ui.onHome}
        >
          <img
            src="/icons/war/alarm-return.png"
            alt=""
            width={128}
            height={128}
            className="h-full w-full"
          />
        </button>
      </Tooltip>
    </div>
  );
}

/** Popisek u kurzoru při ovládání vojvody: „Na sousední mapu“ u okraje, nebo důvod odmítnutí. */
export function JourneyCursorNote({
  note,
}: {
  note: { text: string; tone: 'info' | 'error'; screen: { x: number; y: number } } | null;
}): ReactElement | null {
  if (!note) return null;
  const flipX = note.screen.x > window.innerWidth - 220;
  return (
    <div
      role="status"
      data-testid="journey-cursor-note"
      data-tone={note.tone}
      className={`pointer-events-none fixed z-30 rounded-sm bg-black/55 px-1.5 py-0.5 font-serif text-sm [text-shadow:0_1px_1px_rgb(0_0_0/0.9)] ${note.tone === 'error' ? 'text-[#ff9c88]' : 'text-[#f3dfb0]'}`}
      style={{
        top: note.screen.y + 18,
        left: flipX ? undefined : note.screen.x + 18,
        right: flipX ? window.innerWidth - note.screen.x + 18 : undefined,
      }}
    >
      {note.text}
    </div>
  );
}
