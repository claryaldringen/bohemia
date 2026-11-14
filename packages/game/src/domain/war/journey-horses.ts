import { length2 } from '../landscape/det-math';
import { horsePens, isGrainHorse, penHorses } from '../village/livestock/horses';
import { ageGroup, isAway, isInjured } from '../village/people/people';
import type { Horse, Pen, VillageState } from '../village/types';
import { MissingData, type TickContext, type TickOut } from './campaign-tick';
import type { JourneyState } from './journey-types';
import { marchSpeed } from './march';
import type { Pos } from './march-grid';
import { JOURNEY } from './rules-war';
import { TICKS_PER_SECOND } from './ticks';

// Koně výpravy (expeditions.md – Koně, Koně mimo ves; plán 2026-11-14 – Rozhodnutí 6 a 7, Úloha 3):
// jezdec (`JourneyMember.horseId`) má jezdeckého koně v ohradě domovské vsi. Doma ho osedlá
// a přivede nejbližší dospělý, který je doma (`pickGroom`) – nikdo doma: jezdec dojde pro koně sám.
// Práce s koňmi (`JourneyParty.horseWork`) trvá cestu tempem pěšího a `JOURNEY.mountWaitS`; hloučky
// skupiny po tu dobu stojí. Mimo ves se nasedá i sesedá hned – kůň zůstane u jezdce, vedený za uzdu
// (`horse: 'led'`). Ves se o koni venku dozví událostí `journey-horse` (chov a porážka ho přeskočí).
// Příkazy Osedlat a Sesednout jsou v `journey-parties.ts`; tady je, co čte ves, trvání, konec práce
// a ztráta koně. Jen det-math (`domain/war/**`).

/**
 * Jezdecký kůň jezdce v ohradě koní vsi (expeditions.md – Koně; horses.md – Výcvik koně a jezdec):
 * kůň `horseId`, jehož jezdcem je `personId` (`Horse.riderId`) a který je jezdecký (samec od 3 let –
 * `isGrainHorse`), s ohradou, ve které stojí. Kůň venku s výpravou v ohradě zůstává (Rozhodnutí 6).
 * Bez `horseId` (není jezdec, starší bod) nebo kůň ve vsi už není (uhynul, prodán, jiný jezdec) –
 * null. Jen čte stav.
 */
export function riderHorse(
  village: VillageState,
  personId: number,
  horseId: number | undefined,
  day: number,
): { horse: Horse; pen: Pen } | null {
  if (horseId === undefined) return null;
  for (const pen of horsePens(village)) {
    for (const horse of penHorses(pen)) {
      if (horse.id !== horseId) continue;
      return horse.riderId === personId && isGrainHorse(horse, day) ? { horse, pen } : null;
    }
  }
  return null;
}

/**
 * Vesničan, který koně osedlá a přivede, nebo je odvede do ohrady (expeditions.md – Koně: nejbližší
 * dospělý ze vsi, který není ve skupině – návrh Clauda): dospělý (`ageGroup`), dnes doma (`isAway`),
 * nezraněný (`isInjured`), mimo `skip` (lidé výpravy). Vyhraje nejmenší vzdálenost od jeho obydlí
 * (`Dwelling.position`) k místu `near`, při shodě nižší id; `from` je poloha obydlí. Kdo obydlí ve
 * vsi nemá, nejde. Nikdo – null. Jen čte stav.
 */
export function pickGroom(
  village: VillageState,
  day: number,
  near: Pos,
  skip: ReadonlySet<number>,
): { personId: number; from: Pos } | null {
  const homes = new Map(village.dwellings.map((d) => [d.id, d.position]));
  let best: { personId: number; from: Pos } | null = null;
  let bestDistance = Infinity;
  for (const p of village.people) {
    if (skip.has(p.id) || ageGroup(p, day) !== 'adult' || isAway(p, day) || isInjured(p, day)) {
      continue;
    }
    const at = homes.get(p.dwellingId);
    if (at === undefined) continue;
    const d = length2(at.x - near.x, at.z - near.z);
    if (best !== null && (d > bestDistance || (d === bestDistance && p.id > best.personId))) {
      continue;
    }
    best = { personId: p.id, from: { x: at.x, z: at.z } };
    bestDistance = d;
  }
  return best;
}

/**
 * Trvání práce s koňmi v taktech (plán 2026-11-14 – Rozhodnutí 7, návrh Clauda): cesta
 * tempem jednoho pěšího (`marchSpeed` – i sníh) a `JOURNEY.mountWaitS`, nahoru na celé takty.
 * - `saddle` – vesničan od obydlí `groom` do ohrady `pen` a s koňmi k jezdcům `riders`; bez vesničana
 *   (null) jezdec od skupiny do ohrady a zpět;
 * - `unsaddle` – vesničan k jezdcům (koně pak odvede sám, skupina už nečeká).
 * Vzdálenosti jsou přímé (`length2`).
 */
export function horseWorkTicks(input: {
  kind: 'saddle' | 'unsaddle';
  groom: Pos | null;
  pen: Pos;
  riders: Pos;
  day: number;
}): number {
  const { kind, groom, pen, riders, day } = input;
  const from = groom ?? riders;
  const meters =
    kind === 'unsaddle' ? distance(from, riders) : distance(from, pen) + distance(pen, riders);
  const speed = marchSpeed({ onFoot: 1, riders: 0, woundedOnFoot: 0, herd: 0 }, day);
  return Math.ceil((meters / speed + JOURNEY.mountWaitS) * TICKS_PER_SECOND);
}

function distance(a: Pos, b: Pos): number {
  return length2(b.x - a.x, b.z - a.z);
}

/**
 * Domovská ves pro den výpravy (`world.villageAt`) – příkazy s koňmi ji čtou jen, když jezdec stojí
 * doma. Ves bez spočteného dne krok zastaví (`MissingData`) jako denní krok; ves, která zanikla, je
 * null (výpravu ukončí další denní krok).
 */
export function homeVillage(s: JourneyState, ctx: TickContext): VillageState | null {
  const id = s.home.villageId;
  const village = ctx.world.villageAt(id, s.day);
  if (village === null && !ctx.world.villageGone?.(id)) throw new MissingData([], [id]);
  return village;
}

/**
 * Událost do domovské vsi `journey-horse` (Rozhodnutí 6): kůň jezdce `personId` je venku s výpravou
 * (`horseId`), nebo zase v ohradě (null). Platí ode dne taktu (`ref` jako ostatní události výpravy).
 */
export function sendHorse(
  s: JourneyState,
  out: TickOut,
  personId: number,
  horseId: number | null,
): void {
  out.events.push({
    villageId: s.home.villageId,
    day: s.day,
    ref: `journey:${s.id}:${s.tick}:${out.events.length}`,
    body: { kind: 'journey-horse', journeyId: s.id, personId, horseId },
  });
}

/**
 * Konec práce s koňmi (krok ji volá v každém taktu před příkazy): v `untilTick` jezdci `riders`, kteří
 * jsou ve skupině živí, u osedlání nasednou (`mounted`, `horse: 'ridden'`), u sesednutí sesednou
 * a kůň je v ohradě (`horse` zmizí, ves dostane `journey-horse` null). Práce zmizí; stojí-li všechny
 * hloučky skupiny, lhůta běží od `untilTick` (expeditions.md – Co platí dál: u skupiny stojící ve vsi
 * od osedlání). Skupina s rozkazem pak vyrazí.
 */
export function finishHorseWork(s: JourneyState, out: TickOut): void {
  for (const p of s.parties) {
    const work = p.horseWork;
    if (work === undefined || work.untilTick > s.tick) continue;
    delete p.horseWork;
    const groups = new Set(s.groups.filter((g) => g.party === p.id).map((g) => g.id));
    const riders = new Set(work.riders);
    for (const m of s.members) {
      if (m.status !== 'active' || !groups.has(m.group) || !riders.has(m.ref.personId)) continue;
      if (work.kind === 'saddle') {
        m.mounted = true;
        m.horse = 'ridden';
      } else {
        m.mounted = false;
        delete m.horse;
        sendHorse(s, out, m.ref.personId, null);
      }
    }
    if (s.groups.every((g) => g.party !== p.id || g.arrived)) p.arrivedTick = work.untilTick;
  }
}

/**
 * Kůň zmizel ze vsi (plán 2026-11-14 – Review Focus 4: uhynul, prodán, má jiného jezdce –
 * `riderHorse` null): jezdec s koněm u sebe ho ztratí (`mounted` false, `horse` zmizí) a osedlání,
 * na které čeká, ho vynechá. Krok to kontroluje na začátku dne (`homeDay`) se stavem vsi dne. Jezdec
 * bez `horseId` (starší bod – ves o koni neví) beze změny.
 */
export function loseHorses(s: JourneyState, village: VillageState): void {
  const gone = new Set<number>();
  for (const m of s.members) {
    if (m.status !== 'active' || m.horseId === undefined) continue;
    if (riderHorse(village, m.ref.personId, m.horseId, s.day) !== null) continue;
    gone.add(m.ref.personId);
    m.mounted = false;
    delete m.horse;
  }
  if (gone.size === 0) return;
  for (const p of s.parties) {
    const work = p.horseWork;
    if (work?.kind === 'saddle') work.riders = work.riders.filter((id) => !gone.has(id));
  }
}
