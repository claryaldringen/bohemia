// Činnosti, které ve scéně ještě běží, i když je data dalšího dne už nemají (villagers.md –
// Činnosti od začátku do konce; Martin 31. 10. 2026: „Ve vykreslování by lidé měli dělat své
// činnosti od začátku do konce, bez ohledu na to, že např. cesta pro vodu trvá třeba několik dní.
// Z hlediska hry by se to počítalo jako teď“). Karavana a lov jdou ve skutečném čase přirozenou
// chůzí a trvají mnohem déle než v jádru – výprava se v jádru vrátí za pár herních dní, lov je
// den. Data vsi je pak už nemají, scéna je ale dohraje (návrh Clauda): pamatuje si každou viděnou
// karavanu (i s vozy, jak jely) a běžící lov do jejich konce ve skutečném čase. Prohlížeč, který
// ves otevře později, karavanu vrácenou v jádru už nevidí – jen ty, které jádro ještě má.
import type {
  SceneCart,
  SceneExpedition,
  SceneHunt,
  SceneLord,
  SceneVillage,
} from '../village-view';
import { LIVESTOCK_EPOCH_MS } from './livestock-motion';
import { cycleIndex, LORD_CYCLE, LORD_CYCLE_S } from './lord-day';
import {
  CARAVAN_LINGER_S,
  caravanPlan,
  caravanPoints,
  caravanTimeline,
  type DayWindow,
} from './caravan';
import { huntSpan } from './riders';
import { route } from './villager-motion';

/** Karavana, kterou scéna viděla: data výpravy, vozy, jak jely, a konec ve skutečném čase (ms). */
interface SeenCaravan {
  expedition: SceneExpedition;
  carts: SceneCart[];
  endMs: number;
}

/** Klíč karavany – výprava a den, kdy běžící cesta začala (víc jízd = víc karavan). */
export function caravanKey(e: Pick<SceneExpedition, 'id' | 'startDay' | 'day'>): string {
  return `${e.id}:${e.startDay ?? e.day}`;
}

/** Konec karavany ve skutečném čase (ms) – po návratu a chvíli v hloučku; bez stezky či okna null. */
export function caravanEndMs(
  e: SceneExpedition,
  trails: SceneVillage['trails'],
  window: DayWindow | null,
): number | null {
  const points = caravanPoints(e, trails);
  if (!window || points.length < 2) return null;
  const L = route(points.map((p) => [p.x, p.z] as const)).length;
  const plan = caravanPlan(e);
  const columns = { out: plan.out.length, back: plan.back.length };
  return caravanTimeline(e, window, L, columns).endMs + CARAVAN_LINGER_S * 1000;
}

/** Paměť běžících činností scény – jedna na ves (landscape-scene.ts). */
export class ActivityMemory {
  private caravans = new Map<string, SeenCaravan>();
  private hunt: { hunt: SceneHunt; endMs: number } | null = null;
  /** Jízdy rodiny, jak byly na začátku běžící výcvikové jízdy cyklu (`slot`). */
  private ride: {
    slot: number;
    lord: Pick<SceneLord, 'riders' | 'borderTrailId' | 'escort'>;
  } | null = null;

  /**
   * Ves doplněná o činnosti, které ve skutečném čase `nowMs` ještě běží: karavany, které data už
   * nemají (napřed – vůz dojede rozjetou cestu, než vyrazí na další), s vozy, jak jely; a lov, dokud
   * se lovci nevrátí – nový lov se ukáže až po návratu z běžícího. Vstupní ves nemění.
   */
  apply(
    village: SceneVillage,
    nowMs: number,
    dayWindow: (day: number) => DayWindow | null,
  ): SceneVillage {
    const incoming = village.expeditions ?? [];
    const keys = new Set(incoming.map(caravanKey));
    for (const e of incoming) {
      const endMs = caravanEndMs(e, village.trails, dayWindow(e.startDay ?? e.day));
      if (endMs === null) continue;
      const carts = (village.carts ?? []).filter((c) => e.carts.includes(c.id));
      this.caravans.set(caravanKey(e), { expedition: e, carts, endMs });
    }
    for (const [key, seen] of this.caravans) if (seen.endMs <= nowMs) this.caravans.delete(key);
    const lingering = [...this.caravans.entries()]
      .filter(([key]) => !keys.has(key))
      .map(([, seen]) => seen);
    let out = village;
    if (lingering.length > 0) {
      // vůz dohrávané karavany jede s ní, i když je v jádru už doma
      const kept = new Map<number, SceneCart>();
      for (const seen of lingering) for (const c of seen.carts) kept.set(c.id, c);
      const carts = (village.carts ?? []).map((c) =>
        kept.has(c.id) && c.job?.activity !== 'trade' ? kept.get(c.id)! : c,
      );
      out = {
        ...village,
        expeditions: [...lingering.map((seen) => seen.expedition), ...incoming],
        ...(village.carts ? { carts } : {}),
      };
    }
    const hunt = this.huntAt(village, nowMs, dayWindow);
    if (hunt !== (village.wildlife?.hunt ?? null) && village.wildlife) {
      const wildlife = { ...village.wildlife };
      if (hunt) wildlife.hunt = hunt;
      else delete wildlife.hunt;
      out = { ...out, wildlife };
    }
    return this.rideAt(out, nowMs);
  }

  /**
   * Výcviková jízda cyklu (lord-day.ts – `rideSlot`) trvá minuty, tedy přes víc herních dní – kdo
   * jede, kudy (objížďka, k hranici) a doprovod výpravy zůstanou až do jejího konce takové, jaké
   * byly, když scéna jízdu poprvé viděla (jinak by jezdec uprostřed jízdy přeskočil na jinou trasu
   * nebo zmizel, když ho data dalšího dne už nemají – lov, zranění). Mimo jízdu beze změny.
   */
  private rideAt(village: SceneVillage, nowMs: number): SceneVillage {
    const t = (nowMs - LIVESTOCK_EPOCH_MS) / 1000;
    const k = cycleIndex(t);
    const from = k * LORD_CYCLE_S + LORD_CYCLE.ride;
    if (t < from || t >= from + LORD_CYCLE.rideMax) {
      this.ride = null;
      return village;
    }
    const lord = village.labor?.lord;
    if (!lord || !village.labor) return village;
    if (!this.ride || this.ride.slot !== k) {
      const seen: Pick<SceneLord, 'riders' | 'borderTrailId' | 'escort'> = {};
      if (lord.riders) seen.riders = lord.riders;
      if (lord.borderTrailId !== undefined) seen.borderTrailId = lord.borderTrailId;
      if (lord.escort) seen.escort = lord.escort;
      this.ride = { slot: k, lord: seen };
      return village;
    }
    const kept: SceneLord = { ...lord };
    delete kept.riders;
    delete kept.borderTrailId;
    delete kept.escort;
    return { ...village, labor: { ...village.labor, lord: { ...kept, ...this.ride.lord } } };
  }

  /** Lov, který je teď vidět: běžící zapamatovaný, jinak lov z dat (bez dne lovu beze změny). */
  private huntAt(
    village: SceneVillage,
    nowMs: number,
    dayWindow: (day: number) => DayWindow | null,
  ): SceneHunt | null {
    const today = village.wildlife?.hunt ?? null;
    if (today && today.day === undefined) return today;
    if (this.hunt && this.hunt.endMs <= nowMs) this.hunt = null;
    // běžící lov dohraje – nový lov jiného dne až po návratu lovců
    if (this.hunt && (!today || today.day !== this.hunt.hunt.day)) return this.hunt.hunt;
    if (!today) return null;
    const span = huntSpan(dayWindow(today.day!));
    if (span && span[1] > nowMs) this.hunt = { hunt: today, endMs: span[1] };
    return today;
  }
}
