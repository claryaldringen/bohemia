'use client';

import { type ReactElement, type ReactNode } from 'react';
import type { HouseLinkView, PortraitView } from '@/lib/house-view';
import { breachLabel, hungerLabel } from '@/lib/terms-view';
import type { HungerLevel } from '@bohemia/game';
import { LanguageIcon } from '../LanguageChoice';
import { HouseIcon } from '../TermsForm';
import { Tooltip } from '../Tooltip';

const ICON = '/icons/house';

export function Icon({ name, size = 20 }: { name: string; size?: number }): ReactElement {
  return <HouseIcon name={name} size={size} />;
}

export function Portrait({ icon, size = 36 }: { icon: string; size?: number }): ReactElement {
  return (
    <img
      src={`/icons/resources/${icon}.png`}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className="rounded-sm border border-[#5c4526] bg-[#15100b]"
    />
  );
}

/** Řádek panelu: značka vlevo (popisek řádku) a ikony vpravo. */
export function Row({
  label,
  marker,
  testId,
  children,
}: {
  label: string;
  marker: ReactNode;
  testId: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div
      data-testid={testId}
      className="flex items-center gap-2 border-t border-[#5c4526] py-2 first:border-t-0"
    >
      <Tooltip content={label} placement="left">
        <span
          tabIndex={0}
          aria-label={label}
          className="flex h-7 w-7 shrink-0 items-center justify-center opacity-80"
        >
          {marker}
        </span>
      </Tooltip>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/**
 * Muž rodu: portrét (klik přepne na jeho ves), u seniora stolec, u hráčova muže praporec
 * (seniorate.md – Co hráč vidí).
 */
export function Man({
  man,
  onSelect,
}: {
  man: PortraitView;
  onSelect: (villageId: string) => void;
}): ReactElement {
  return (
    <Tooltip content={man.label}>
      <button
        type="button"
        aria-label={man.label}
        data-testid="house-own-man"
        data-village={man.villageId}
        data-senior={man.senior || undefined}
        data-lord={man.lord || undefined}
        onClick={() => onSelect(man.villageId)}
        className="relative inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-[#f3cf86]"
      >
        <Portrait icon={man.icon} />
        {man.senior && (
          <img
            src={`${ICON}/throne.png`}
            alt=""
            data-testid="house-senior-mark"
            width={18}
            height={18}
            className="absolute -top-1.5 -right-1.5 h-[18px] w-[18px]"
          />
        )}
        {man.lord && (
          <img
            src={`${ICON}/banner.png`}
            alt=""
            data-testid="house-lord-mark"
            width={18}
            height={18}
            className="absolute -bottom-1.5 -left-1.5 h-[18px] w-[18px]"
          />
        )}
      </button>
    </Tooltip>
  );
}

/** Cizí rod: portrét hlavy rodu a štít s počtem mužů. */
export function HouseLink({
  house,
  testId,
  tip,
  selected,
  onClick,
}: {
  house: HouseLinkView;
  testId: string;
  tip?: string;
  /** Hráč je vybraný (zvýrazněný rámeček). */
  selected?: boolean;
  /** Klik na rod (seznam hráčů); bez něj jde jen o náhled. */
  onClick?: () => void;
}): ReactElement {
  const label = tip ? `${house.label} – ${tip}` : house.label;
  const Wrapper = onClick ? 'button' : 'span';
  return (
    <Tooltip content={label}>
      <Wrapper
        {...(onClick ? { type: 'button' as const, onClick } : { tabIndex: 0 })}
        aria-label={label}
        aria-pressed={onClick ? selected === true : undefined}
        data-testid={testId}
        data-house-id={house.houseId}
        className={`relative inline-flex rounded-sm ${selected ? 'outline-2 outline-[#f3cf86]' : ''}`}
      >
        <Portrait icon={house.icon} />
        {/* jazyk rodu (newcomers.md – Jazyková skupina: v adresáři rodů ikonou) */}
        <span className="absolute -top-1 -right-1.5 inline-flex">
          <LanguageIcon language={house.language} size={12} />
        </span>
        <span className="absolute -right-1.5 -bottom-1.5 flex h-5 w-5 items-center justify-center">
          <img
            src={`${ICON}/shield.png`}
            alt=""
            width={20}
            height={20}
            className="absolute inset-0"
          />
          <span className="relative text-[11px] leading-none font-bold tabular-nums">
            {house.men}
          </span>
        </span>
      </Wrapper>
    </Tooltip>
  );
}

/** Tlačítko akce u cizího hráče; zašedlé nese důvod u kurzoru (`denied`). */
export function PlayerAction({
  label,
  icon,
  testId,
  reason,
  busy,
  onClick,
}: {
  label: string;
  icon: string;
  testId: string;
  reason: string | null;
  busy: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <Tooltip content={label} denied={reason}>
      <button
        type="button"
        aria-label={label}
        data-testid={testId}
        data-reason={reason ?? undefined}
        disabled={busy || reason !== null}
        className="hud-icon-button flex h-8 w-10 items-center justify-center"
        onClick={onClick}
      >
        <Icon name={icon} size={22} />
      </button>
    </Tooltip>
  );
}

/** Zlomená pečeť s počtem neplnění a ikona hladu (jen když je co ukázat). */
export function StatusMarks({
  breaches,
  hunger,
}: {
  breaches: number;
  hunger: HungerLevel | null;
}): ReactElement {
  const breach = breachLabel(breaches);
  const hungry = hungerLabel(hunger);
  return (
    <>
      {breach && (
        <Tooltip content={breach}>
          <span
            tabIndex={0}
            aria-label={breach}
            data-testid="house-breaches"
            className="inline-flex items-center gap-0.5"
          >
            <Icon name="seal-broken" size={18} />
            <span className="text-xs tabular-nums">{breaches}</span>
          </span>
        </Tooltip>
      )}
      {hungry && (
        <Tooltip content={hungry}>
          <span
            tabIndex={0}
            aria-label={hungry}
            data-testid="house-hunger"
            data-level={hunger ?? undefined}
            className="inline-flex"
          >
            <Icon name="hunger" size={18} />
          </span>
        </Tooltip>
      )}
    </>
  );
}
