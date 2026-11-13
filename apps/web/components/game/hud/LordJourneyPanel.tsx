import type { ReactElement } from 'react';
import type { JourneyCandidate } from '@bohemia/game';
import { formatInteger } from '@/lib/village-format';
import { Tooltip } from './Tooltip';

/**
 * Ovládání vybraného vojvody v panelu výběru (lord-control.md – Co hráč vidí): doma řada portrétů
 * mužů rodu, kteří smějí jet (klik přidá nebo ubere z družiny; podkova = jezdec) a meč se silou
 * skupiny; na cestě ikona Domů. Jako v 0 A.D. – ikony, slova jen v popiscích; rozkaz se dává
 * pravým tlačítkem do krajiny (`useLordJourney`).
 */
export interface LordJourneyUi {
  /** Vojvoda doma s kandidáty, nebo na cestě (jen Domů). */
  mode: 'home' | 'away';
  lord: JourneyCandidate | null;
  men: readonly JourneyCandidate[];
  /** Důvod, proč výjezd nejde (česky) – jen v popisku zašedlé řady; rozkaz ho ukáže u kurzoru. */
  reason?: string | null;
  retinue: ReadonlySet<number>;
  onToggle: (personId: number) => void;
  onHome: () => void;
}

function Horseshoe(): ReactElement {
  return (
    <img
      src="/icons/resources/jizda.png"
      alt=""
      width={16}
      height={16}
      data-testid="lord-retinue-horseshoe"
      className="absolute -right-0.5 -bottom-0.5 h-4 w-4"
    />
  );
}

export function LordJourneyPanel({
  ui,
  placement = 'above',
}: {
  ui: LordJourneyUi;
  /** Kam se otevře popisek Domů (v panelu výběru nahoru, na cizí mapě v horním rohu dolů). */
  placement?: 'above' | 'below';
}): ReactElement {
  if (ui.mode === 'away') {
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
  const strength =
    (ui.lord?.strength ?? 0) +
    ui.men.filter((m) => ui.retinue.has(m.personId)).reduce((sum, m) => sum + m.strength, 0);
  return (
    <div className="flex flex-col gap-1" data-testid="lord-journey">
      <div
        className={`flex items-center gap-1.5 ${ui.reason ? 'grayscale' : ''}`}
        data-testid="lord-retinue"
      >
        {ui.men.map((man) => {
          const chosen = ui.retinue.has(man.personId);
          const title = `${man.name === '' ? 'Muž rodu' : man.name} (${formatInteger(man.age)})`;
          return (
            <Tooltip key={man.personId} content={title} placement="above">
              <button
                type="button"
                data-testid="lord-retinue-man"
                data-person-id={man.personId}
                data-mounted={man.mounted || undefined}
                aria-label={title}
                aria-pressed={chosen}
                className={`hud-icon-button relative h-9 w-9 ${chosen ? 'ring-2 ring-[#f3cf86]' : 'opacity-60'}`}
                onClick={() => ui.onToggle(man.personId)}
              >
                <img
                  src="/icons/resources/man.png"
                  alt=""
                  width={36}
                  height={36}
                  className="h-full w-full"
                />
                {man.mounted && <Horseshoe />}
              </button>
            </Tooltip>
          );
        })}
        <Tooltip content={ui.reason ?? 'Síla skupiny'} placement="above">
          <span className="ml-1 flex items-center gap-1" tabIndex={0}>
            <img src="/icons/house/sword.png" alt="" width={20} height={20} />
            <span data-testid="lord-strength" className="text-sm font-semibold tabular-nums">
              {formatInteger(Math.round(strength))}
            </span>
          </span>
        </Tooltip>
      </div>
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
