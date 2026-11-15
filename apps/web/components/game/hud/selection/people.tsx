/** Panel výběru postavy, spřežení a vozu. */
import { useState, type ReactElement } from 'react';
import { VillageTarget } from '@/lib/scene/village-picking';
import { HERD_LABELS, type SelectionDetails } from '@/lib/selection-details';
import { formatDecimal, formatInteger, formatPercent, plural } from '@/lib/village-format';
import type { ArmsView } from '@/lib/person-view';
import type { MasonCraft, MasonryCircle } from '@bohemia/game';
import { CartGoal } from '@/lib/draft-activity';
import { BaptizeButton, FaithCross } from '../BaptizeButton';
import { LodgeActions, MasonBadge, PriestBadge } from '../LodgeButtons';
import { useRightDenied } from '../rights';
import type { ExpeditionCommand } from '@bohemia/game';
import { ExpeditionButtons } from '../ExpeditionButtons';
import { Tooltip } from '../Tooltip';
import { TargetButton, Stat, ROW, Flag } from './parts';

/**
 * Portrét z ikon surovin (`public/icons/resources/`): člověk (villagers.md – Výběr postavy) – muž,
 * žena, dítě nebo starší, pod ním role; spřežení (vůl) a vůz – pod nimi název.
 */
export function PersonPortrait({
  icon,
  name,
  personName = null,
  testId = 'selection-person-portrait',
}: {
  icon: string;
  name: string;
  /**
   * Jméno muže rodu (lord.md – Kde se jméno ukazuje): první řádek nad rolí, popisek portrétu
   * „Bořivoj – Syn vojvody“; ostatní lidé bez jména.
   */
  personName?: string | null;
  testId?: string;
}): ReactElement {
  const image = (
    <div className="hud-inset h-20 w-20 overflow-hidden rounded">
      <img
        src={`/icons/resources/${icon}.png`}
        alt=""
        width={64}
        height={64}
        data-testid={testId}
        data-portrait={icon}
        className="h-full w-full"
      />
    </div>
  );
  return (
    <div className="flex min-w-20 shrink-0 flex-col items-center gap-1">
      {personName === null ? (
        image
      ) : (
        <Tooltip content={`${personName} – ${name}`} placement="above">
          <div tabIndex={0}>{image}</div>
        </Tooltip>
      )}
      <h2 className="text-center font-serif text-sm leading-tight whitespace-nowrap text-[#f3dfb0]">
        {personName !== null && (
          <span data-testid="selection-person-name" className="block text-base">
            {personName}
          </span>
        )}
        {name}
      </h2>
    </div>
  );
}

/** Dovednosti cvičeného člověka (lord.md – Co hráč vidí): luk, boj a jízda, jízda jen s koněm. */
function PersonArms({
  arms,
  horse,
}: {
  arms: NonNullable<Extract<SelectionDetails, { kind: 'person' }>['arms']>;
  horse: boolean;
}): ReactElement {
  const stats: { key: keyof ArmsView; icon: string; name: string }[] = [
    { key: 'bow', icon: 'luk', name: 'Lukostřelba' },
    { key: 'combat', icon: 'boj', name: 'Boj' },
  ];
  if (horse || arms.riding > 0) stats.push({ key: 'riding', icon: 'jizda', name: 'Jízda na koni' });
  return (
    <>
      {stats.map((s) => (
        <Stat
          key={s.key}
          icon={s.icon}
          name={`${s.name} ${arms[s.key]} / 100`}
          testId={`selection-person-arms-${s.key}`}
        >
          {arms[s.key]}
        </Stat>
      ))}
    </>
  );
}

/** Kůň pod jezdcem (horses.md – Co hráč vidí): věk, výcvik (přesýpací hodiny do 12 let), obilí. */
function PersonMount({
  mount,
}: {
  mount: NonNullable<Extract<SelectionDetails, { kind: 'person' }>['mount']>;
}): ReactElement {
  return (
    <>
      <Stat
        icon="horse"
        name={`Kůň jezdce – ${formatInteger(mount.ageYears)} ${plural(mount.ageYears, 'rok', 'roky', 'let')}`}
        testId="selection-person-mount-age"
      >
        {formatInteger(mount.ageYears)}
      </Stat>
      {mount.training < 1 && (
        <Stat
          icon="hourglass"
          name={`Výcvik koně (hotový ve 12 letech) ${formatPercent(mount.training)}`}
          testId="selection-person-mount-training"
        >
          {formatPercent(mount.training)}
        </Stat>
      )}
      <Stat
        icon="food"
        name={
          mount.fed
            ? 'Obilí koně za den (kg)'
            : 'Obilí koně za den (kg) – kůň je bez obilí, výcvik se zpomalil'
        }
        testId="selection-person-mount-grain"
        alert={!mount.fed}
      >
        {formatDecimal(mount.grainKgPerDay, 1)}
      </Stat>
    </>
  );
}

/** Povýšení vesničana (vassalage.md): vsi bez vojvody, kam smí jít, a akce (vrací důvod odmítnutí). */
export interface EnnobleActions {
  targets: readonly { id: string; name: string }[];
  onEnnoble: (personId: number, targetVillageId: string) => Promise<string | null>;
}

/**
 * Člověk vsi (villagers.md – Výběr postavy): co právě dělá (jediný řádek slov), věk, dům (tlačítko
 * ho vybere), u pasáka zvíře stáda, u pokřtěného kříž víry a u vojvody, který se smí nechat
 * pokřtít, tlačítko křtu (christianity.md – Křest rodu).
 */
export function PersonBody({
  details,
  onSelectTarget,
  ennoble,
  onBaptize,
  onInviteLodge,
  onInviteMaster,
  expeditionCommand,
}: {
  details: Extract<SelectionDetails, { kind: 'person' }>;
  /** Příkaz vybranému člověku – tlačítka Osedlat, Sesednout a Domů (`useExpeditionOrders`). */
  expeditionCommand?:
    ((c: ExpeditionCommand, screen?: { x: number; y: number }) => void) | undefined;
  onSelectTarget?: ((target: VillageTarget) => void) | undefined;
  ennoble?: EnnobleActions | undefined;
  /** Křest vojvody (server action) – vrací důvod odmítnutí, nebo null. */
  onBaptize?: (() => Promise<string | null>) | undefined;
  /** Pozvání stavební huti okruhu (server action) – vrací důvod odmítnutí, nebo null. */
  onInviteLodge?: ((circle: MasonryCircle) => Promise<string | null>) | undefined;
  /** Pozvání chybějícího mistra oboru (server action) – vrací důvod odmítnutí, nebo null. */
  onInviteMaster?: ((craft: MasonCraft) => Promise<string | null>) | undefined;
}): ReactElement {
  const home = details.home;
  const denied = useRightDenied('ennoble');
  const [refusal, setRefusal] = useState<string | null>(null);
  const targets = details.ennobleable ? (ennoble?.targets ?? []) : [];
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5">
      <p
        data-testid="selection-person-activity"
        className="text-sm whitespace-nowrap text-[#ecdfc4]"
      >
        {details.activity}
      </p>
      <div className={ROW}>
        <Stat icon="date" name="Věk (roky)" testId="selection-person-age">
          {formatInteger(details.age)}
        </Stat>
        {details.christian && (
          <Tooltip content="Křesťan" placement="above">
            <span data-testid="selection-person-christian" tabIndex={0} className="h-5 w-5">
              <FaithCross size={20} />
            </span>
          </Tooltip>
        )}
        {details.mason && <MasonBadge craft={details.mason} circle={details.lodgeCircle ?? null} />}
        {details.priest && <PriestBadge />}
        {details.arms && <PersonArms arms={details.arms} horse={details.horse === true} />}
        {details.mount && <PersonMount mount={details.mount} />}
        {home !== null && details.homeIcon && (
          <Tooltip content="Dům" placement="above">
            <button
              type="button"
              data-testid="selection-person-home"
              aria-label="Dům"
              className="hud-icon-button h-7 w-7"
              onClick={() => onSelectTarget?.({ kind: 'dwelling', id: home })}
            >
              <img
                src={`/icons/build/${details.homeIcon}.png`}
                alt=""
                width={128}
                height={128}
                className="h-full w-full"
              />
            </button>
          </Tooltip>
        )}
        {details.herd && (
          <Tooltip content={HERD_LABELS[details.herd].name} placement="above">
            <img
              src={`/icons/resources/${HERD_LABELS[details.herd].icon}.png`}
              alt=""
              width={20}
              height={20}
              data-testid="selection-person-herd"
              data-herd={details.herd}
              tabIndex={0}
            />
          </Tooltip>
        )}
        {targets.map((target) => (
          <Tooltip
            key={target.id}
            content={denied ?? refusal ?? `Povýšit pro ${target.name}`}
            placement="above"
          >
            <button
              type="button"
              data-testid="selection-person-ennoble"
              aria-label={`Povýšit pro ${target.name}`}
              aria-disabled={denied !== null}
              className="hud-icon-button h-7 w-7"
              onClick={() => {
                if (denied !== null) return;
                void ennoble?.onEnnoble(details.id, target.id).then(setRefusal);
              }}
            >
              <img
                src="/icons/house/village-key.png"
                alt=""
                width={128}
                height={128}
                className="h-full w-full"
              />
            </button>
          </Tooltip>
        ))}
        {details.baptizable && onBaptize && <BaptizeButton onBaptize={onBaptize} />}
        {details.lodge && onInviteLodge && onInviteMaster && (
          <LodgeActions
            lodge={details.lodge}
            onInviteLodge={onInviteLodge}
            onInviteMaster={onInviteMaster}
          />
        )}
        {details.draft && (
          <TargetButton
            src={`/icons/resources/${details.draft.kind === 'cart' ? 'cart' : 'ox'}.png`}
            name={details.draft.kind === 'cart' ? 'Vůz' : 'Spřežení'}
            testId="selection-person-draft"
            target={details.draft}
            onSelectTarget={onSelectTarget}
          />
        )}
      </div>
      {expeditionCommand && details.expedition && (
        <ExpeditionButtons people={[details.expedition]} command={expeditionCommand} />
      )}
    </div>
  );
}

/**
 * Spřežení volů s rádlem (oxen.md – Výběr spřežení): co dělá (jediný řádek slov), voli a tlačítka
 * dílu, který orá, ohrady volů, oráče a honáka.
 */
export function TeamBody({
  details,
  onSelectTarget,
}: {
  details: Extract<SelectionDetails, { kind: 'plough-team' }>;
  onSelectTarget?: ((target: VillageTarget) => void) | undefined;
}): ReactElement {
  const { part, pen, ploughman, leader } = details;
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5">
      <p data-testid="selection-team-activity" className="text-sm whitespace-nowrap text-[#ecdfc4]">
        {details.activity}
      </p>
      <div className={ROW}>
        <Stat icon="ox" name="Voli" testId="selection-team-oxen">
          {formatInteger(details.oxen)}
        </Stat>
        {part && (
          <TargetButton
            src="/icons/build/pole.png"
            name="Díl pole"
            testId="selection-team-part"
            target={{ kind: 'field-part', id: part.fieldId, cell: part.cell }}
            onSelectTarget={onSelectTarget}
          />
        )}
        {pen !== null && (
          <TargetButton
            src="/icons/build/ohrada.png"
            name="Ohrada volů"
            testId="selection-team-pen"
            target={{ kind: 'pen', id: pen }}
            onSelectTarget={onSelectTarget}
          />
        )}
        {ploughman && (
          <TargetButton
            src={`/icons/resources/${ploughman.portrait}.png`}
            name="Oráč"
            testId="selection-team-ploughman"
            target={{ kind: 'person', id: ploughman.id }}
            onSelectTarget={onSelectTarget}
          />
        )}
        {leader && (
          <TargetButton
            src={`/icons/resources/${leader.portrait}.png`}
            name="Honák"
            testId="selection-team-leader"
            target={{ kind: 'person', id: leader.id }}
            onSelectTarget={onSelectTarget}
          />
        )}
      </div>
    </div>
  );
}

/** Náklad vozu v panelu – ikona suroviny a název (voda a zboží výpravy bez ikony). */
export const CARGO_LABELS: Record<CartGoal, { icon: string | null; name: string }> = {
  sheaves: { icon: 'food', name: 'Snopy' },
  hay: { icon: 'hay', name: 'Seno' },
  logs: { icon: 'wood', name: 'Klády' },
  charcoal: { icon: 'charcoal', name: 'Uhlí' },
  ore: { icon: 'ore', name: 'Ruda' },
  clay: { icon: 'clay', name: 'Hlína' },
  water: { icon: null, name: 'Voda' },
  seed: { icon: 'food', name: 'Osivo' },
  apples: { icon: 'apples', name: 'Jablka' },
  goods: { icon: null, name: 'Zboží' },
  stone: { icon: 'stone', name: 'Kámen' },
};

/**
 * Vůz (wagons.md – Výběr vozu): co dělá (jediný řádek slov), stav, voli, náklad a tlačítka ohrady
 * a vozky.
 */
export function CartBody({
  details,
  onSelectTarget,
}: {
  details: Extract<SelectionDetails, { kind: 'cart' }>;
  onSelectTarget?: ((target: VillageTarget) => void) | undefined;
}): ReactElement {
  const { pen, drover } = details;
  const cargo = details.cargo ? CARGO_LABELS[details.cargo] : null;
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5">
      <p data-testid="selection-cart-activity" className="text-sm whitespace-nowrap text-[#ecdfc4]">
        {details.activity}
      </p>
      <div className={ROW}>
        <Stat icon="condition" name="Stav vozu" testId="selection-cart-condition">
          {formatPercent(details.condition)}
        </Stat>
        <Stat
          icon="cart"
          name={details.loadKg === null ? 'Nosnost (kg)' : 'Náklad / nosnost (kg)'}
          testId="selection-cart-load"
        >
          {details.loadKg === null
            ? formatInteger(details.capacityKg)
            : `${formatInteger(details.loadKg)} / ${formatInteger(details.capacityKg)}`}
        </Stat>
        {details.oxen > 0 && (
          <Stat icon="ox" name="Voli" testId="selection-cart-oxen">
            {formatInteger(details.oxen)}
          </Stat>
        )}
        {cargo?.icon && <Flag icon={cargo.icon} name={cargo.name} testId="selection-cart-cargo" />}
        {pen !== null && (
          <TargetButton
            src="/icons/build/ohrada.png"
            name="Ohrada"
            testId="selection-cart-pen"
            target={{ kind: 'pen', id: pen }}
            onSelectTarget={onSelectTarget}
          />
        )}
        {drover && (
          <TargetButton
            src={`/icons/resources/${drover.portrait}.png`}
            name="Vozka"
            testId="selection-cart-drover"
            target={{ kind: 'person', id: drover.id }}
            onSelectTarget={onSelectTarget}
          />
        )}
      </div>
    </div>
  );
}
