'use client';

import type { ReactElement, ReactNode } from 'react';
import type { DomainFoodView, HouseLinkView } from '@/lib/house-view';
import { Tooltip } from './Tooltip';

// Jídlo domény v panelu rodu (hillfort.md – Přehled jídla domény): sídla (vypěstuje, potřebuje,
// rozdíl), vazalové s domluvenou dávkou a součet. Jako v 0 A.D. ikony s čísly, slova v popiscích;
// jediný doslovný text Martina je „Domluveno – nemusí přijít“ (8. 11. 2026).

const RES = '/icons/resources';

function Img({ src, size = 18 }: { src: string; size?: number }): ReactElement {
  return <img src={src} alt="" width={size} height={size} draggable={false} />;
}

/** Ikona s číslem a popiskem. */
function Stat({
  icon,
  value,
  label,
  testId,
  bad,
}: {
  icon: string;
  value: string;
  label: string;
  testId?: string;
  bad?: boolean;
}): ReactElement {
  return (
    <Tooltip content={label}>
      <span
        tabIndex={0}
        aria-label={`${label}: ${value}`}
        data-testid={testId}
        data-bad={bad ? 'true' : undefined}
        className={`inline-flex items-center gap-0.5 text-xs tabular-nums ${bad ? 'text-red-400' : ''}`}
      >
        <Img src={icon} />
        {value}
      </span>
    </Tooltip>
  );
}

/** Celé kg se znaménkem (± u rozdílu). */
export function signedKg(kg: number): string {
  const n = Math.round(kg);
  return n > 0 ? `+${n}` : `${n}`;
}

/** Řádky jídla domény; `renderHouse` kreslí portrét rodu vazala (HouseLink panelu). */
export function DomainFoodRows({
  food,
  renderHouse,
}: {
  food: DomainFoodView;
  renderHouse?: (house: HouseLinkView, testId: string) => ReactNode;
}): ReactElement {
  return (
    <div className="flex w-full flex-col gap-1.5">
      {food.villages.map((v) => (
        <div
          key={v.villageId}
          data-testid="house-food-village"
          className="flex flex-wrap items-center gap-2"
        >
          <Tooltip content={v.name}>
            <span tabIndex={0} aria-label={v.name} className="inline-flex">
              <Img src={`${RES}/manor.png`} size={20} />
            </span>
          </Tooltip>
          <Stat
            icon={`${RES}/harvest.png`}
            value={`${Math.round(v.growsKg)}`}
            label="Vypěstuje za rok"
          />
          <Stat
            icon={`${RES}/food.png`}
            value={`${Math.round(v.needsKg)}`}
            label="Potřebuje za rok – lidé a zvířata"
          />
          <Stat
            icon={`${RES}/balance.png`}
            value={signedKg(v.balanceKg)}
            label={v.balanceKg < 0 ? 'Chybí' : 'Přebytek'}
            testId="house-food-balance"
            bad={v.balanceKg < 0}
          />
        </div>
      ))}
      {food.vassals.map((v) => (
        <div
          key={v.houseId}
          data-testid="house-food-vassal"
          className="flex flex-wrap items-center gap-2"
        >
          {v.house && renderHouse ? (
            renderHouse(v.house, 'house-food-vassal-house')
          ) : (
            <Img src="/icons/resources/people.png" size={22} />
          )}
          {v.grainKg > 0 && (
            <Stat icon={`${RES}/harvest.png`} value={`${Math.round(v.grainKg)}`} label="Obilí" />
          )}
          {v.cattle > 0 && <Stat icon={`${RES}/cow.png`} value={`${v.cattle}`} label="Dobytek" />}
          <Tooltip content="Domluveno – nemusí přijít">
            <span
              tabIndex={0}
              aria-label="Domluveno – nemusí přijít"
              data-testid="house-food-agreed"
              className="inline-flex"
            >
              <Img src="/icons/house/seal.svg" />
            </span>
          </Tooltip>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Stat
          icon={`${RES}/balance.png`}
          value={signedKg(food.totalKg)}
          label={food.totalKg < 0 ? 'Doména – chybí' : 'Doména – zbývá'}
          testId="house-food-total"
          bad={food.totalKg < 0}
        />
      </div>
    </div>
  );
}
