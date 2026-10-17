import {
  AMBIENT_LAYERS,
  ambientMix,
  type AmbientEnvironment,
  type AmbientGains,
  type AmbientLayer,
  type AmbientView,
} from './ambient-mix';

/**
 * Přehrávání ambientních zvuků krajiny přes Web Audio API (bez Babylonu a bez Reactu).
 * Co a jak hlasitě hraje, určuje čistý `ambientMix`; tady jsou jen zvukové uzly, načítání
 * a pravidla prohlížečů (zvuk až po gestu uživatele, uspání ve skrytém panelu).
 */

/**
 * Stav zvuků: `locked` čeká na první kliknutí nebo klávesu (prohlížeč jinak zvuk nepustí),
 * `loading` stahuje a dekóduje soubory, `paused` je skrytý panel, `muted` vypnul hráč,
 * `unavailable` prohlížeč bez Web Audio nebo soubory nejdou načíst.
 */
export type AmbientSoundState =
  'locked' | 'loading' | 'running' | 'paused' | 'muted' | 'unavailable';

export interface AmbientSoundOptions {
  environment: AmbientEnvironment;
  enabled: boolean;
  onStateChange?: (state: AmbientSoundState) => void;
  /** Adresář se soubory (výchozí `/audio/ambient/`). */
  baseUrl?: string;
}

/** Smyčky – hrají pořád, hlasitost řídí mix. */
const LOOPS: [AmbientLayer, string][] = [
  ['birds', 'birds-day'],
  ['streamMedium', 'stream-medium'],
  ['streamFast', 'stream-fast'],
];
/** Skupiny jednotlivých zvuků (SoundGroup v 0 A.D.): náhodné pořadí, hlasitost a výška. */
const BIRDSONG = ['birdsong-1', 'birdsong-2', 'birdsong-3', 'birdsong-4'];
const LEAVES = ['leaves-1', 'leaves-2'];
const FILES = [...LOOPS.map(([, name]) => name), ...BIRDSONG, ...LEAVES];

/** Opus dekóduje vždy na 48 kHz – stejné vzorkování kontextu ušetří převzorkování smyček. */
const SAMPLE_RATE = 48_000;
const OPUS_FRAME = 960;
const OPUS_PRE_SKIP = 312;

/** Prodleva po přípravě scény, než se začnou stahovat zvuky (první snímky mají přednost). */
const PREFETCH_DELAY_MS = 1000;
/** Mix se přepočítá nejvýš jednou za tolik ms, i když se kamera hýbe plynule. */
const VIEW_UPDATE_MS = 120;
/** Časové konstanty plynulých změn hlasitosti (s) – bez lupnutí. */
const LAYER_TAU_S = 0.5;
const MASTER_TAU_S = 0.6;
const MUTE_TAU_S = 0.2;
/** Po ztišení se kontext uspí (šetří procesor). */
const SUSPEND_AFTER_MS = 1200;
/** Plánovač jednotlivých zvuků: jak často se dívá dopředu a jak daleko (s). */
const SCHEDULE_MS = 500;
const LOOKAHEAD_S = 1.5;
/** Zpěv ptáků: záznamy ≈ 25 s jdou za sebou a prolínají se. */
const BIRDSONG_FADE_S = 3;
/** Vítr v listí: poryvy ≈ 4,7 s, další začne za tolik sekund. */
const LEAVES_GAP_MIN_S = 1.5;
const LEAVES_GAP_MAX_S = 5;
/** Pod touto hlasitostí vrstvy se poryvy větru nepouštějí. */
const LEAVES_SILENT = 0.02;
/** Rozložení poryvů do stran (stereo) – 0 A.D. posouvá zvuky nejvýš o π/5 rad (sin ≈ 0,58). */
const LEAVES_PAN = 0.58;
/** Náhodná hlasitost a výška jako výchozí SoundGroup v 0 A.D. (`SoundGroup.cpp`). */
const GAIN_LOWER = 0.8;
const GAIN_UPPER = 1;
const PITCH_LOWER = 0.9;
const PITCH_UPPER = 1.1;
/** Gesta, po kterých prohlížeč dovolí spustit zvuk. */
const GESTURES = ['pointerdown', 'pointerup', 'keydown', 'touchend', 'click'] as const;

/** Prolínání se stejným výkonem (čtvrtsinus) pro náběh a doznění záznamů. */
const FADE_IN = Float32Array.from({ length: 32 }, (_, i) => Math.sin((i / 31) * (Math.PI / 2)));
const FADE_OUT = FADE_IN.slice().reverse();

/**
 * Úsek smyčky v dekódovaném bufferu (s). Smyčky mají délku N, kde N + 312 je násobek 960
 * (`tools/audio/ambient.sh`): dekodér, který nezahodí úvodních 312 vzorků Opusu (pre-skip),
 * vrátí délku dělitelnou 960 a smyčka pak musí začít až za nimi – jinak by ve švu lupalo.
 */
export function loopRegion(length: number, sampleRate: number): { start: number; end: number } {
  const end = length / sampleRate;
  const untrimmed = sampleRate === SAMPLE_RATE && length > OPUS_FRAME && length % OPUS_FRAME === 0;
  return { start: untrimmed ? OPUS_PRE_SKIP / sampleRate : 0, end };
}

/** Další varianta zvuku ze skupiny – náhodně, ale ne stejná jako předchozí. */
export function nextVariant(count: number, previous: number, random: () => number): number {
  if (count <= 1) return 0;
  if (previous < 0 || previous >= count) return Math.min(count - 1, Math.floor(random() * count));
  const pick = Math.min(count - 2, Math.floor(random() * (count - 1)));
  return pick >= previous ? pick + 1 : pick;
}

/** Náhodná hlasitost a rychlost (= výška) jednoho přehrání jako SoundGroup v 0 A.D. */
export function soundVariation(random: () => number): { gain: number; rate: number } {
  return {
    gain: GAIN_LOWER + (GAIN_UPPER - GAIN_LOWER) * random(),
    rate: PITCH_LOWER + (PITCH_UPPER - PITCH_LOWER) * random(),
  };
}

interface Graph {
  master: GainNode;
  layers: Record<AmbientLayer, GainNode>;
  buffers: Map<string, AudioBuffer>;
}

export class AmbientSound {
  private readonly environment: AmbientEnvironment;
  private readonly baseUrl: string;
  private readonly onStateChange: (state: AmbientSoundState) => void;
  private readonly abort = new AbortController();
  private state: AmbientSoundState | null = null;
  private enabled: boolean;
  /** Prohlížeč už zvuk dovolí (stránka dostala gesto uživatele). */
  private unlocked: boolean;
  private prefetchAllowed = false;
  private fetching = false;
  private failed = false;
  private disposed = false;
  private encoded: Map<string, ArrayBuffer> | null = null;
  private building = false;
  private context: AudioContext | null = null;
  private graph: Graph | null = null;
  private targets: AmbientGains | null = null;
  private pendingView: AmbientView | null = null;
  private viewTimer: number | null = null;
  private prefetchTimer: number | null = null;
  private suspendTimer: number | null = null;
  private scheduleTimer: number | null = null;
  /** Kdy (čas kontextu) začne další záznam zpěvu ptáků a další poryv větru. */
  private birdsongAt = 0;
  private birdsongStarted = false;
  private lastBirdsong = -1;
  private leavesAt = 0;
  private lastLeaves = -1;

  constructor(options: AmbientSoundOptions) {
    this.environment = options.environment;
    this.enabled = options.enabled;
    this.baseUrl = options.baseUrl ?? '/audio/ambient/';
    this.onStateChange = options.onStateChange ?? (() => undefined);
    // Starší prohlížeče userActivation nemají – pak se čeká na gesto.
    const activation = navigator.userActivation as UserActivation | undefined;
    this.unlocked = activation?.hasBeenActive ?? false;
    if (typeof AudioContext === 'undefined') {
      this.failed = true;
      this.reportState();
      return;
    }
    for (const type of GESTURES) {
      window.addEventListener(type, this.onGesture, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.prefetchTimer = window.setTimeout(() => {
      this.prefetchTimer = null;
      this.prefetchAllowed = true;
      this.update();
    }, PREFETCH_DELAY_MS);
    this.update();
  }

  /** Pohled kamery se změnil – přepočítá mix (nejvýš jednou za VIEW_UPDATE_MS). */
  setView(view: AmbientView): void {
    if (this.disposed) return;
    this.pendingView = view;
    if (this.viewTimer !== null) return;
    this.flushView();
    this.viewTimer = window.setTimeout(() => {
      this.viewTimer = null;
      this.flushView();
    }, VIEW_UPDATE_MS);
  }

  /**
   * Zapne nebo vypne zvuky. Volat přímo z obsluhy kliknutí – Safari pustí zvuk jen v gestu.
   */
  setEnabled(enabled: boolean): void {
    if (this.disposed || this.enabled === enabled) return;
    this.enabled = enabled;
    this.update();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    for (const timer of [this.viewTimer, this.prefetchTimer, this.suspendTimer]) {
      if (timer !== null) window.clearTimeout(timer);
    }
    if (this.scheduleTimer !== null) window.clearInterval(this.scheduleTimer);
    for (const type of GESTURES) {
      window.removeEventListener(type, this.onGesture, { capture: true });
    }
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.context?.removeEventListener('statechange', this.onContextStateChange);
    // Zavření kontextu zastaví a uvolní všechny zvuky naráz.
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.graph = null;
    this.encoded = null;
  }

  private readonly onGesture = (): void => {
    if (this.unlocked && this.context?.state === 'running') return;
    this.unlocked = true;
    // Kontext vzniká (nebo se probouzí) přímo v obsluze gesta – jinak by ho Safari nepustil.
    this.update();
  };

  private readonly onVisibilityChange = (): void => this.update();

  private readonly onContextStateChange = (): void => this.reportState();

  private flushView(): void {
    const view = this.pendingView;
    if (!view) return;
    this.pendingView = null;
    this.targets = ambientMix(view, this.environment);
    this.applyTargets(LAYER_TAU_S);
  }

  /** Srovná zvuk s tím, co má být: zapnuto/vypnuto, viditelný panel, načtené soubory. */
  private update(): void {
    if (this.disposed || this.failed) return;
    if (this.enabled && this.prefetchAllowed && !this.encoded && !this.fetching && !this.graph) {
      void this.prefetch();
    }
    if (this.enabled && this.unlocked && !this.context) this.createContext();
    const context = this.context;
    if (context && this.encoded && !this.graph && !this.building) void this.build(context);
    if (context && this.graph) {
      const audible = this.enabled && !document.hidden;
      rampGain(
        this.graph.master.gain,
        audible ? 1 : 0,
        context,
        audible ? MASTER_TAU_S : MUTE_TAU_S,
      );
      if (this.suspendTimer !== null) window.clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
      if (audible) {
        if (context.state !== 'running') void context.resume().catch(() => undefined);
      } else if (context.state === 'running') {
        // Nejdřív doznít, pak uspat – ve skrytém panelu hned (nikdo neposlouchá).
        this.suspendTimer = window.setTimeout(
          () => {
            this.suspendTimer = null;
            if (!this.enabled || document.hidden) void context.suspend().catch(() => undefined);
          },
          document.hidden ? 0 : SUSPEND_AFTER_MS,
        );
      }
    } else if (context && this.enabled && context.state !== 'running') {
      void context.resume().catch(() => undefined);
    }
    this.reportState();
  }

  private createContext(): void {
    let context: AudioContext;
    try {
      context = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'playback' });
    } catch {
      // Prohlížeč, který neumí zvolit vzorkování, dostane výchozí (smyčky se převzorkují).
      context = new AudioContext({ latencyHint: 'playback' });
    }
    context.addEventListener('statechange', this.onContextStateChange);
    this.context = context;
  }

  private async prefetch(): Promise<void> {
    this.fetching = true;
    try {
      const entries = await Promise.all(
        FILES.map(async (name): Promise<[string, ArrayBuffer]> => {
          const response = await fetch(`${this.baseUrl}${name}.webm`, {
            signal: this.abort.signal,
          });
          if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
          return [name, await response.arrayBuffer()];
        }),
      );
      if (this.disposed) return;
      this.encoded = new Map(entries);
    } catch (error) {
      if (this.disposed) return;
      console.warn('Zvuky krajiny se nepodařilo načíst – krajina zůstane potichu.', error);
      this.failed = true;
    } finally {
      this.fetching = false;
    }
    this.update();
    this.reportState();
  }

  private async build(context: AudioContext): Promise<void> {
    const encoded = this.encoded;
    if (!encoded) return;
    this.building = true;
    try {
      const decoded = await Promise.all(
        [...encoded].map(async ([name, data]): Promise<[string, AudioBuffer]> => [
          name,
          await context.decodeAudioData(data),
        ]),
      );
      if (this.disposed || context !== this.context) return;
      this.encoded = null;
      this.graph = this.createGraph(context, new Map(decoded));
      this.applyTargets(LAYER_TAU_S);
      this.birdsongAt = context.currentTime;
      this.leavesAt = context.currentTime;
      this.scheduleTimer = window.setInterval(() => this.schedule(), SCHEDULE_MS);
      this.schedule();
    } catch (error) {
      if (this.disposed) return;
      console.warn('Zvuky krajiny se nepodařilo připravit – krajina zůstane potichu.', error);
      this.failed = true;
    } finally {
      this.building = false;
    }
    this.update();
  }

  private createGraph(context: AudioContext, buffers: Map<string, AudioBuffer>): Graph {
    // Pojistka proti přebuzení, když se sejdou hlasité vrstvy.
    const limiter = new DynamicsCompressorNode(context, {
      threshold: -3,
      knee: 3,
      ratio: 20,
      attack: 0.003,
      release: 0.25,
    });
    limiter.connect(context.destination);
    const master = new GainNode(context, { gain: 0 });
    master.connect(limiter);
    const layers = {} as Record<AmbientLayer, GainNode>;
    for (const layer of AMBIENT_LAYERS) {
      layers[layer] = new GainNode(context, { gain: 0 });
      layers[layer].connect(master);
    }
    for (const [layer, name] of LOOPS) {
      const buffer = buffers.get(name);
      if (!buffer) continue;
      const region = loopRegion(buffer.length, buffer.sampleRate);
      const source = new AudioBufferSourceNode(context, {
        buffer,
        loop: true,
        loopStart: region.start,
        loopEnd: region.end,
      });
      source.connect(layers[layer]);
      // Náhodné místo startu – krajina pokaždé nezačíná stejně.
      source.start(0, region.start + Math.random() * (region.end - region.start));
    }
    return { master, layers, buffers };
  }

  private applyTargets(tau: number): void {
    const { context, graph, targets } = this;
    if (!context || !graph || !targets) return;
    for (const layer of AMBIENT_LAYERS)
      rampGain(graph.layers[layer].gain, targets[layer], context, tau);
  }

  /** Naplánuje jednotlivé zvuky (zpěv ptáků, poryvy větru) na nejbližší sekundy dopředu. */
  private schedule(): void {
    const { context, graph } = this;
    if (!context || !graph || context.state !== 'running') return;
    const horizon = context.currentTime + LOOKAHEAD_S;
    const soon = context.currentTime + 0.05;
    while (this.birdsongAt < horizon) {
      this.lastBirdsong = nextVariant(BIRDSONG.length, this.lastBirdsong, Math.random);
      const buffer = graph.buffers.get(BIRDSONG[this.lastBirdsong]!);
      if (!buffer) break;
      const start = Math.max(this.birdsongAt, soon);
      // První záznam začne kdekoli v první polovině, další od začátku.
      const offset = this.birdsongStarted ? 0 : Math.random() * buffer.duration * 0.5;
      this.birdsongStarted = true;
      const duration = this.playClip(graph, context, buffer, start, offset, 'birdsong', 0);
      this.birdsongAt = start + duration - Math.min(BIRDSONG_FADE_S, duration / 3);
    }
    while (this.leavesAt < horizon) {
      const start = Math.max(this.leavesAt, soon);
      const gap = LEAVES_GAP_MIN_S + Math.random() * (LEAVES_GAP_MAX_S - LEAVES_GAP_MIN_S);
      this.leavesAt = start + gap;
      if ((this.targets?.leaves ?? 0) < LEAVES_SILENT) continue;
      this.lastLeaves = nextVariant(LEAVES.length, this.lastLeaves, Math.random);
      const buffer = graph.buffers.get(LEAVES[this.lastLeaves]!);
      if (!buffer) break;
      this.playClip(
        graph,
        context,
        buffer,
        start,
        0,
        'leaves',
        (Math.random() * 2 - 1) * LEAVES_PAN,
      );
    }
  }

  /** Přehraje jeden záznam s náhodnou hlasitostí a výškou; vrátí jeho délku (s). */
  private playClip(
    graph: Graph,
    context: AudioContext,
    buffer: AudioBuffer,
    start: number,
    offset: number,
    layer: AmbientLayer,
    pan: number,
  ): number {
    const { gain, rate } = soundVariation(Math.random);
    const duration = (buffer.duration - offset) / rate;
    const source = new AudioBufferSourceNode(context, { buffer, playbackRate: rate });
    const envelope = new GainNode(context, { gain: 0 });
    const panner = new StereoPannerNode(context, { pan });
    source.connect(envelope).connect(panner).connect(graph.layers[layer]);
    if (layer === 'birdsong') {
      // Záznamy jdou za sebou a prolínají se; poryvy větru mají náběh a doznění v sobě.
      const fade = Math.min(BIRDSONG_FADE_S, duration / 3);
      envelope.gain.setValueCurveAtTime(scaled(FADE_IN, gain), start, fade);
      envelope.gain.setValueCurveAtTime(scaled(FADE_OUT, gain), start + duration - fade, fade);
    } else {
      envelope.gain.setValueAtTime(gain, start);
    }
    source.addEventListener('ended', () => {
      source.disconnect();
      envelope.disconnect();
      panner.disconnect();
    });
    source.start(start, offset);
    source.stop(start + duration);
    return duration;
  }

  private reportState(): void {
    const state = this.currentState();
    if (state === this.state) return;
    this.state = state;
    this.onStateChange(state);
  }

  private currentState(): AmbientSoundState {
    if (this.failed) return 'unavailable';
    if (!this.enabled) return 'muted';
    if (document.hidden) return 'paused';
    if (!this.unlocked) return 'locked';
    if (!this.graph) return 'loading';
    return this.context?.state === 'running' ? 'running' : 'locked';
  }
}

/** Plynulá změna hlasitosti k cíli – bez skoku, který by lupnul. */
function rampGain(param: AudioParam, value: number, context: AudioContext, tau: number): void {
  param.setTargetAtTime(value, context.currentTime, tau);
}

function scaled(curve: Float32Array, gain: number): Float32Array {
  return curve.map((value) => value * gain);
}
