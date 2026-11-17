/** Panel divokého zvířete (druhu), lov a psi dvorce a škoda zvěře na dílu pole. */
import { type ReactElement } from 'react';
import type { SelectionDetails } from '@/lib/selection-details';
import { formatInteger } from '@/lib/village-format';
import {
  WILDLIFE_LABELS,
  type FieldDamageView,
  type HuntView,
  type WildlifeSpecies,
} from '@/lib/wildlife-view';
import { Tooltip } from '../Tooltip';
import { Stat, ROW } from './parts';

/** Popisek stupně plnosti (jen v tooltipu). */
const LEVEL_NAMES = ['Není', 'Málo', 'Středně', 'Hodně'] as const;

/** Co kraj uživí – popisek podle druhu. */
function capacityText(species: WildlifeSpecies, capacity: number): string {
  switch (species) {
    case 'hare':
      return `Louky a pole uživí ${formatInteger(capacity)}`;
    case 'bear':
      return capacity > 0 ? 'Les uživí medvěda' : 'Les je pro medvěda malý';
    case 'fish':
      return `Voda uživí ${formatInteger(capacity)} kg ryb`;
    case 'fox':
      return `Krajina uživí ${formatInteger(capacity)}`;
    default:
      return `Les uživí ${formatInteger(capacity)}`;
  }
}

/** Panel druhu: tři ikony podle stupně plnosti, loňská škoda a strhnutý dobytek (tooltipy). */
export function WildlifeBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'wildlife' }>;
}): ReactElement {
  const { name, icon } = WILDLIFE_LABELS[details.species];
  const level = LEVEL_NAMES[details.level];
  const tip = `${name} – ${details.full ? 'plno' : level.toLowerCase()}. ${capacityText(details.species, details.capacity)}`;
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5">
      <div className={ROW}>
        <Tooltip content={tip} placement="above">
          <span
            data-testid="wildlife-level"
            data-level={details.level}
            data-full={details.full ? 'true' : undefined}
            tabIndex={0}
            className="flex items-center gap-0.5"
          >
            {[1, 2, 3].map((n) => (
              <img
                key={n}
                src={`/icons/resources/${icon}.png`}
                alt=""
                width={24}
                height={24}
                className={n <= details.level ? '' : 'opacity-25 grayscale'}
              />
            ))}
            {details.full && <span className="ml-1 text-xs font-semibold text-amber-300">+</span>}
          </span>
        </Tooltip>
        {details.lastYearDamageKg !== null && (
          <Stat icon="harvest" name="Škoda na polích loni (kg obilí)" testId="wildlife-damage">
            {formatInteger(details.lastYearDamageKg)}
          </Stat>
        )}
        {details.killedHeads !== null && details.killedHeads > 0 && (
          <Stat icon="sheep" name="Strhnutý dobytek letos" testId="wildlife-killed">
            {details.killedHeads}
          </Stat>
        )}
      </div>
    </div>
  );
}

/**
 * Řádek lovu a psů na panelu dvorce (wildlife.md – Co hráč vidí): ikony úlovků letos s čísly, maso
 * v kg a smečka „6 / 7“ (v popisku obilí za den, červeně bez obilí).
 */
export function ManorHunt({ hunt }: { hunt: HuntView }): ReactElement {
  const { dogs } = hunt;
  return (
    <div className={ROW} data-testid="manor-hunt-row">
      {hunt.catches.map((c) => (
        <Stat key={c.icon} icon={c.icon} name={`${c.name} letos`} testId={`hunt-${c.icon}`}>
          {formatInteger(c.count)}
        </Stat>
      ))}
      {hunt.meatKg > 0 && (
        <Stat icon="meat" name="Maso ze zvěře letos (kg)" testId="hunt-meat">
          {formatInteger(hunt.meatKg)}
        </Stat>
      )}
      {dogs && (
        <Stat icon="dog" name="Psi dvorce" testId="manor-dogs">
          {dogs.count} / {dogs.wanted}
        </Stat>
      )}
    </div>
  );
}

/**
 * Škoda zvěře na dílu (wildlife.md – Co hráč vidí): ikona prasete a škoda letos v % (červeně od
 * 10 %), ikona ohně při hlídce, v popisku kg a vzdálenost k lesu.
 */
export function FieldDamage({ damage }: { damage: FieldDamageView }): ReactElement {
  return (
    <>
      <Stat
        icon="boar"
        name={`Škoda zvěře letos – ${formatInteger(damage.kg)} kg obilí; les je ${formatInteger(damage.edgeM)} m daleko`}
        testId="selection-damage"
        alert={damage.percent >= 10}
      >
        {damage.percent} %
      </Stat>
      {damage.watched && (
        <Tooltip content="Díl se v noci hlídá" placement="above">
          <span data-testid="selection-watch" tabIndex={0} className="flex items-center">
            <img src="/icons/resources/watch-fire.png" alt="" width={20} height={20} />
          </span>
        </Tooltip>
      )}
    </>
  );
}
