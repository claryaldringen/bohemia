import type { ComponentProps, ReactElement } from 'react';
import { Tooltip } from './Tooltip';

/**
 * Vojvoda je na výjezdu (lord-control.md – Co hráč vidí): v horní liště jeho portrét s podkovou.
 * Klik ho vybere – pak mu jde dát rozkaz (pravé tlačítko do krajiny) nebo ho poslat domů – a je-li
 * na cizí mapě, přepne scénu na ni; scéna pak jde za ním z mapy na mapu (`useLordJourney`).
 */
export function LordAwayBadge({
  name,
  selected,
  onSelect,
  placement = 'below-left',
}: {
  /** Jméno vojvody do popisku; bez jména jen „Vojvoda“. */
  name: string | null;
  selected: boolean;
  onSelect: () => void;
  /** Kam se otevře popisek (v liště vpravo doleva, na cizí mapě vlevo doprava). */
  placement?: ComponentProps<typeof Tooltip>['placement'];
}): ReactElement {
  const label = name === null ? 'Vojvoda na cestě' : `${name} na cestě`;
  return (
    <Tooltip content={label} placement={placement}>
      <button
        type="button"
        data-hud-block
        data-testid="lord-away-badge"
        aria-label={label}
        aria-pressed={selected}
        className="hud-icon-button relative h-8 w-8"
        onClick={onSelect}
      >
        <img
          src="/icons/resources/man.png"
          alt=""
          width={32}
          height={32}
          className="h-full w-full"
        />
        <img
          src="/icons/resources/jizda.png"
          alt=""
          width={16}
          height={16}
          className="absolute -right-0.5 -bottom-0.5 h-4 w-4"
        />
      </button>
    </Tooltip>
  );
}
