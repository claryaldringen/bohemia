import type { ReactElement, ReactNode } from 'react';
import { PART_COLORS } from '@/lib/minimap';
import { PART_STAGE_NAMES, type SelectionDetails } from '@/lib/selection-details';
import { formatHa, formatInteger, formatPercent, formatYearsShort } from '@/lib/village-format';
import { DWELLING_NAMES } from '@/lib/village-view';
import { Tooltip } from './Tooltip';

function Portrait({ icon, name }: { icon: string; name: string }): ReactElement {
  return (
    <div className="flex w-20 shrink-0 flex-col items-center gap-1">
      <div className="hud-inset h-20 w-20 overflow-hidden rounded">
        <img
          src={`/icons/build/${icon}.png`}
          alt=""
          width={128}
          height={128}
          className="h-full w-full"
        />
      </div>
      <h2 className="text-center font-serif text-sm leading-tight text-[#f3dfb0]">{name}</h2>
    </div>
  );
}

function Stat({
  icon,
  name,
  testId,
  children,
}: {
  icon: string;
  name: string;
  testId?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <Tooltip content={name} placement="above">
      <span className="flex items-center gap-1" tabIndex={0}>
        <img src={`/icons/resources/${icon}.png`} alt="" width={20} height={20} />
        <span data-testid={testId} className="text-sm font-semibold tabular-nums">
          {children}
        </span>
      </span>
    </Tooltip>
  );
}

function Bar({
  value,
  name,
  testId,
}: {
  value: number;
  name: string;
  testId?: string;
}): ReactElement {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <Tooltip content={`${name} ${percent} %`} placement="above">
      <span
        role="progressbar"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        data-testid={testId}
        tabIndex={0}
        className="hud-bar block h-2.5 w-40"
      >
        <span style={{ width: `${percent}%` }} />
      </span>
    </Tooltip>
  );
}

function DwellingBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'dwelling' }>;
}): ReactElement {
  const tone = details.overcrowded ? 'text-red-400' : details.full ? 'text-[#f3cf86]' : '';
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <Stat icon="people" name="Obyvatelé" testId="selection-occupants">
          <span className={tone}>
            {details.occupants}/{details.capacity}
          </span>
        </Stat>
        <Stat icon="date" name="Stáří (roky)">
          {details.ageYears}
        </Stat>
      </div>
      <ul data-testid="selection-ages" aria-label="Věk obyvatel" className="flex flex-wrap gap-1">
        {details.ages.map((age, i) => (
          <li
            key={i}
            className="hud-inset min-w-7 rounded px-1 text-center text-xs tabular-nums text-[#ecdfc4]"
          >
            {age}
          </li>
        ))}
      </ul>
      <Bar value={details.condition} name="Stav" testId="selection-condition" />
      {details.rebuild && <Bar value={details.rebuild.progress} name="Přestavba" />}
    </div>
  );
}

function FieldBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'field' }>;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <Tooltip content="Výměra" placement="above">
          <span
            data-testid="selection-area"
            tabIndex={0}
            className="text-sm font-semibold tabular-nums"
          >
            {formatHa(details.areaM2)}
          </span>
        </Tooltip>
        <Stat icon="food" name="Úrodnost" testId="selection-fertility">
          {Math.round(details.fertility)}
        </Stat>
      </div>
      <ul aria-label="Díly pole" className="flex flex-wrap gap-1.5">
        {details.stages.map(({ stage, count }) => (
          <li key={stage}>
            <Tooltip content={PART_STAGE_NAMES[stage]} placement="above">
              <span
                data-stage={stage}
                tabIndex={0}
                className="flex items-center gap-1 text-xs tabular-nums"
              >
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 rounded-sm border border-black/50"
                  style={{ background: `rgb(${PART_COLORS[stage].join(' ')})` }}
                />
                {count}
              </span>
            </Tooltip>
          </li>
        ))}
      </ul>
      {details.founding !== null && <Bar value={details.founding} name="Založení" />}
    </div>
  );
}

function CemeteryBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'cemetery' }>;
}): ReactElement {
  if (!details.built) {
    return (
      <div className="flex flex-col justify-center gap-1.5">
        <Bar value={details.building ?? 0} name="Založení" testId="selection-progress" />
      </div>
    );
  }
  const full = details.freeGraves === 0;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <Tooltip content="Hroby" placement="above">
          <span
            data-testid="selection-graves"
            tabIndex={0}
            className={`text-sm font-semibold tabular-nums ${full ? 'text-red-400' : ''}`}
          >
            {details.graves}/{details.capacity}
          </span>
        </Tooltip>
        <Stat icon="date" name="Místo na roky" testId="selection-years">
          {formatYearsShort(details.yearsLeft)}
        </Stat>
      </div>
      {details.building !== null && <Bar value={details.building} name="Rozšíření" />}
    </div>
  );
}

function OrchardBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'orchard' }>;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <Tooltip content="Výměra" placement="above">
          <span
            data-testid="selection-area"
            tabIndex={0}
            className="text-sm font-semibold tabular-nums"
          >
            {formatHa(details.areaM2)}
          </span>
        </Tooltip>
        {details.ageYears !== null && (
          <Stat icon="date" name="Stáří (roky)" testId="selection-age">
            {details.ageYears}
          </Stat>
        )}
        <Stat icon="apples" name="Úroda (kg)" testId="selection-yield">
          {formatInteger(details.expectedYieldKg)}
        </Stat>
      </div>
      {details.planting !== null && (
        <div className="flex items-center gap-1.5">
          <Bar value={details.planting} name="Výsadba" testId="selection-progress" />
          {details.plantingWaits && (
            <Tooltip content="Sází se na jaře a na podzim" placement="above">
              <img
                data-testid="selection-planting-waits"
                src="/icons/resources/date.png"
                alt="Sází se na jaře a na podzim"
                width={18}
                height={18}
                tabIndex={0}
              />
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Panel výběru dole uprostřed (jako v 0 A.D.) – jen když je něco vybrané: portrét, typ
 * a ikony s čísly. Obydlí: obyvatelé, věk obyvatel, stav, stáří; staveniště: průběh stavby;
 * pole: výměra, úrodnost, díly podle stadia; hřbitov: hroby, na kolik let místo vystačí
 * a průběh založení / rozšíření; sad: výměra, stáří, úroda příští sklizně a průběh výsadby.
 */
export function SelectionPanel({
  details,
}: {
  details: SelectionDetails | null;
}): ReactElement | null {
  if (!details) return null;
  let portrait: ReactElement;
  let body: ReactElement;
  if (details.kind === 'field') {
    portrait = <Portrait icon="pole" name="Pole" />;
    body = <FieldBody details={details} />;
  } else if (details.kind === 'cemetery') {
    portrait = <Portrait icon="hrbitov" name="Hřbitov" />;
    body = <CemeteryBody details={details} />;
  } else if (details.kind === 'orchard') {
    portrait = <Portrait icon="sad" name="Sad" />;
    body = <OrchardBody details={details} />;
  } else if (details.kind === 'site') {
    portrait = <Portrait icon={details.type} name={DWELLING_NAMES[details.type].nominative} />;
    body = (
      <div className="flex flex-col justify-center gap-1.5">
        <Stat icon="labor" name="Stavba">
          {formatPercent(details.progress)}
        </Stat>
        <Bar value={details.progress} name="Stavba" testId="selection-progress" />
      </div>
    );
  } else {
    portrait = <Portrait icon={details.type} name={DWELLING_NAMES[details.type].nominative} />;
    body = <DwellingBody details={details} />;
  }
  return (
    <section
      data-testid="selection-panel"
      data-kind={details.kind}
      data-hud-block
      aria-label="Výběr"
      className="hud-panel fixed bottom-2 left-1/2 z-20 flex min-h-28 w-[22rem] max-w-[calc(100vw-30rem)] -translate-x-1/2 gap-3 p-2"
    >
      {portrait}
      {body}
    </section>
  );
}
