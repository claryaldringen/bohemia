import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { isDrag, pinchZoomFactor } from './camera-input';
import { CAMERA_ZOOM_M } from './constants';
import { edgeScrollDirection } from './edge-scroll';

/**
 * Pohled šikmo shora jako v AoE2 (úhel od svislice, rad) – 41° pod vodorovnou, 0 A.D. má 35°.
 * Změna = nový render atlasu impostorů (`tools/blender/impostors.py`).
 */
const BETA = 0.85;
/** Natočení kamery na začátku a po R – kamera stojí na −z a dívá se k +z (sever nahoře). */
const HOME_ALPHA = -Math.PI / 2;
/** Zorný úhel (svislý, rad) – 45° jako `fov` v 0 A.D. */
const FOV = Math.PI / 4;
/**
 * Krok přiblížení kolečkem (podíl vzdálenosti): jeden zub (deltaY 100) ≈ čtvrtina vzdálenosti –
 * od výchozího přiblížení ≈ 30 m jako zub kolečka v 0 A.D. (32), celý rozsah na 13 zubů.
 */
const WHEEL_DELTA_PERCENTAGE = 0.03;
const ROTATE_SPEED = 1.4; // rad/s pro Q/E
/** Rychlost posunu klávesami a okrajem okna – podíl vzdálenosti kamery za sekundu. */
const PAN_SPEED = 0.9;
const KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyQ',
  'KeyE',
]);

export interface RtsCamera {
  camera: ArcRotateCamera;
  /** Zpracuje vstupy za uplynulý čas; vrátí true, když se změnil pohled (je co překreslit). */
  update(dtSeconds: number): boolean;
  /** Kam vrátí pohled klávesa R (ves – první obydlí, jinak místo vsi). */
  setHome(x: number, z: number): void;
  /** Přesune cíl kamery na bod krajiny (minimapa). */
  moveTo(x: number, z: number): void;
  /** Výchozí pohled na ves (R): domov, natočení k severu, výchozí přiblížení. */
  reset(): void;
  /**
   * Posunul poslední stisk levého tlačítka krajinou (tah, mezerník + tah)? Takové puštění
   * tlačítka nic nevybírá – platí do dalšího stisku.
   */
  leftPressPanned(): boolean;
  dispose(): void;
}

/** Je událost klávesnice z pole formuláře (psaní jména vsi) – kamera ji pak nechá být? */
function fromFormField(event: KeyboardEvent): boolean {
  const target = event.target instanceof Element ? event.target : null;
  return target?.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

/** Na tlačítku nebo odkazu mezerník tlačítko stiskne – posun krajiny jen jinde. */
function onButton(event: KeyboardEvent): boolean {
  const target = event.target instanceof Element ? event.target : null;
  return target?.closest('button, a, [role="button"]') !== null;
}

/** Tah levým tlačítkem nad krajinou – posouvá ji, jakmile přejede mez kliknutí. */
interface LeftDrag {
  pointerId: number;
  from: { x: number; y: number };
  /** Kde je kurzor teď (px plátna) – kamera ho dožene v příštím snímku. */
  cursor: { x: number; y: number };
  /** Bod země pod kurzorem při stisku – drží se pod kurzorem jako uchopená mapa. */
  grab: { x: number; y: number; z: number } | null;
  panning: boolean;
}

/**
 * Kamera ve stylu 0 A.D.: WASD / šipky a myš u okraje okna posouvají, Q/E otáčejí, R vrátí
 * pohled na ves, kolečko i rozevření prstů na trackpadu přibližují. Krajinu jde chytit
 * a posunout: prostředním tlačítkem, mezerníkem + levým tlačítkem a – když se nic neumisťuje
 * (`leftDragPans`) – i samotným levým tažením (trackpad nemá prostřední tlačítko). Kliknutí bez
 * tažení nechává výběru a umisťování, pravé tlačítko rušení. Cíl kamery drží na terénu.
 */
export function createRtsCamera(
  scene: Scene,
  canvas: HTMLCanvasElement,
  options: {
    halfExtent: number;
    start: { x: number; z: number };
    groundHeight: (x: number, z: number) => number;
    /** Posouvá samotné levé tažení krajinou? (Ne, když se umisťuje stavba nebo maluje pole.) */
    leftDragPans: () => boolean;
  },
): RtsCamera {
  const { halfExtent, groundHeight } = options;
  const home = { ...options.start };
  const camera = new ArcRotateCamera(
    'camera',
    HOME_ALPHA,
    BETA,
    CAMERA_ZOOM_M.default,
    new Vector3(home.x, groundHeight(home.x, home.z), home.z),
    scene,
  );
  camera.fov = FOV;
  camera.lowerBetaLimit = BETA;
  camera.upperBetaLimit = BETA;
  camera.lowerRadiusLimit = CAMERA_ZOOM_M.min;
  camera.upperRadiusLimit = CAMERA_ZOOM_M.max;
  camera.wheelDeltaPercentage = WHEEL_DELTA_PERCENTAGE;
  camera.mapPanning = true;
  camera.minZ = 1;
  camera.maxZ = 6000;
  camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
  // noPreventDefault = false: kolečko a gesto přiblížení nezoomují stránku a vodorovný swipe
  // na trackpadu nevrací prohlížeč zpět.
  camera.attachControl(canvas, false);
  // Babylon posouvá jen prostředním tlačítkem a přibližuje kolečkem. Levé tažení posouvá
  // kamera sama (s mezí kliknutí, aby kliknutí dál vybíralo), pravé tlačítko ruší.
  camera.movement.input.inputMap = [
    { source: 'pointer', button: 1, interaction: 'pan' },
    { source: 'wheel', interaction: 'zoom' },
  ];

  const pressed = new Set<string>();
  /** Kurzor u okraje okna (posun krajiny), nebo null. */
  let pointer: { x: number; y: number; blocked: boolean } | null = null;
  let spaceHeld = false;
  let drag: LeftDrag | null = null;
  let lastPressPanned = false;
  /** Vzdálenost kamery na začátku gesta přiblížení v Safari (gesturestart), jinak null. */
  let gestureRadius: number | null = null;
  /** Kurzor plátna, který kamera nastavila – vrátí se, jen když ho mezitím nikdo nezměnil. */
  let cursorSet: { value: string; previous: string } | null = null;

  const setCursor = (value: string | null): void => {
    if (cursorSet && canvas.style.cursor === cursorSet.value) {
      canvas.style.cursor = cursorSet.previous;
    }
    cursorSet = null;
    if (value === null) return;
    cursorSet = { value, previous: canvas.style.cursor };
    canvas.style.cursor = value;
  };
  const refreshCursor = (): void => {
    setCursor(drag?.panning ? 'grabbing' : spaceHeld ? 'grab' : null);
  };

  const clamp = (): void => {
    const target = camera.target;
    target.x = Math.min(halfExtent, Math.max(-halfExtent, target.x));
    target.z = Math.min(halfExtent, Math.max(-halfExtent, target.z));
    target.y = groundHeight(target.x, target.z);
  };
  const moveTo = (x: number, z: number): void => {
    camera.target.x = x;
    camera.target.z = z;
    clamp();
    // Babylon jinak dotáhne rozjetou setrvačnost posunu – pohled by po skoku ještě ujel.
    camera.inertialPanningX = 0;
    camera.inertialPanningY = 0;
  };
  const reset = (): void => {
    camera.alpha = HOME_ALPHA;
    camera.radius = CAMERA_ZOOM_M.default;
    camera.inertialAlphaOffset = 0;
    camera.inertialRadiusOffset = 0;
    moveTo(home.x, home.z);
  };
  const setRadius = (radius: number): void => {
    camera.radius = Math.min(CAMERA_ZOOM_M.max, Math.max(CAMERA_ZOOM_M.min, radius));
    camera.inertialRadiusOffset = 0;
  };

  /** Bod roviny ve výšce `height` pod pixelem plátna (CSS px), nebo null nad obzorem. */
  const groundPoint = (x: number, y: number, height: number): { x: number; z: number } | null => {
    const ray = scene.createPickingRay(x, y, Matrix.Identity(), camera, false);
    if (Math.abs(ray.direction.y) < 1e-9) return null;
    const t = (height - ray.origin.y) / ray.direction.y;
    if (t < 0) return null;
    return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
  };

  const endDrag = (): void => {
    if (!drag) return;
    try {
      if (canvas.hasPointerCapture(drag.pointerId)) canvas.releasePointerCapture(drag.pointerId);
    } catch {
      // ukazatel už neexistuje – nic k uvolnění
    }
    drag = null;
    refreshCursor();
  };
  const startPanning = (current: LeftDrag): void => {
    current.panning = true;
    lastPressPanned = true;
    try {
      canvas.setPointerCapture(current.pointerId);
    } catch {
      // bez zachycení tah skončí na okraji plátna – nevadí
    }
    refreshCursor();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    lastPressPanned = false;
    endDrag();
    const withSpace = spaceHeld;
    if (!withSpace && !options.leftDragPans()) return;
    if (withSpace) {
      // Mezerník + tah posouvá vždy – umisťování a malování stisk vůbec nedostanou.
      event.stopImmediatePropagation();
      event.preventDefault();
    }
    const at = { x: event.offsetX, y: event.offsetY };
    const height = camera.target.y;
    const ground = groundPoint(at.x, at.y, height);
    drag = {
      pointerId: event.pointerId,
      from: at,
      cursor: at,
      grab: ground ? { x: ground.x, y: height, z: ground.z } : null,
      panning: false,
    };
    if (withSpace) startPanning(drag);
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (drag && event.pointerId === drag.pointerId) {
      drag.cursor = { x: event.offsetX, y: event.offsetY };
      if (!drag.panning && isDrag(drag.from, drag.cursor)) startPanning(drag);
    }
  };
  const onPointerEnd = (event: PointerEvent): void => {
    if (drag && event.pointerId === drag.pointerId) endDrag();
  };

  /**
   * Rozevření prstů na trackpadu (Chrome, Firefox: kolečko s Ctrl) přibližuje plynule podle
   * prstů – Babylon by ho bral jako kolečko a malé kroky gesta by skoro nepřiblížily. Obyčejné
   * kolečko nechává Babylonu.
   */
  const onWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (gestureRadius !== null) return; // Safari: přibližuje gesturechange
    setRadius(camera.radius * pinchZoomFactor(event.deltaY, event.deltaMode));
  };
  // Safari posílá rozevření prstů jako gesturestart / gesturechange s měřítkem od začátku gesta.
  const gestureScale = (event: Event): number | null =>
    'scale' in event && typeof event.scale === 'number' && event.scale > 0 ? event.scale : null;
  const onGestureStart = (event: Event): void => {
    event.preventDefault();
    gestureRadius = camera.radius;
  };
  const onGestureChange = (event: Event): void => {
    event.preventDefault();
    const scale = gestureScale(event);
    if (gestureRadius !== null && scale !== null) setRadius(gestureRadius / scale);
  };
  const onGestureEnd = (event: Event): void => {
    event.preventDefault();
    gestureRadius = null;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey || fromFormField(event)) return;
    if (event.code === 'Space' && !onButton(event)) {
      event.preventDefault(); // stránka se mezerníkem neposouvá
      if (!spaceHeld) {
        spaceHeld = true;
        refreshCursor();
      }
      return;
    }
    if (KEYS.has(event.code)) pressed.add(event.code);
    if (event.code === 'KeyR' && !event.repeat) reset();
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    pressed.delete(event.code);
    if (event.code === 'Space' && spaceHeld) {
      // rozběhnutý tah dokončí, co začal – mezerník platí pro příští stisk
      spaceHeld = false;
      refreshCursor();
    }
  };
  const onBlur = (): void => {
    pressed.clear();
    pointer = null;
    spaceHeld = false;
    endDrag();
  };
  const onWindowPointerMove = (event: PointerEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    // Nad panely rozhraní (minimapa, nabídka staveb…) se krajina okrajem neposouvá.
    pointer = {
      x: event.clientX,
      y: event.clientY,
      blocked: target !== canvas && target?.closest('[data-hud-block]') !== null,
    };
  };
  const onMouseOut = (event: MouseEvent): void => {
    if (event.relatedTarget === null) pointer = null; // kurzor opustil okno
  };
  const onContextMenu = (event: Event): void => event.preventDefault();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pointermove', onWindowPointerMove);
  document.addEventListener('mouseout', onMouseOut);
  canvas.addEventListener('contextmenu', onContextMenu);
  // Zachytávací fáze – kamera stisk vidí dřív než výběr, umisťování a Babylon.
  canvas.addEventListener('pointerdown', onPointerDown, { capture: true });
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerEnd);
  canvas.addEventListener('pointercancel', onPointerEnd);
  canvas.addEventListener('lostpointercapture', onPointerEnd);
  canvas.addEventListener('wheel', onWheel, { capture: true, passive: false });
  canvas.addEventListener('gesturestart', onGestureStart);
  canvas.addEventListener('gesturechange', onGestureChange);
  canvas.addEventListener('gestureend', onGestureEnd);

  const lastView = new Matrix();
  let hasView = false;

  const update = (dt: number): boolean => {
    // Krajina se při tažení posouvá zhruba s kurzorem, při každém přiblížení.
    camera.panningSensibility = 14_000 / camera.radius;

    const forward = new Vector3(-Math.cos(camera.alpha), 0, -Math.sin(camera.alpha));
    const right = new Vector3(Math.sin(camera.alpha), 0, -Math.cos(camera.alpha));
    const move = Vector3.Zero();
    if (pressed.has('KeyW') || pressed.has('ArrowUp')) move.addInPlace(forward);
    if (pressed.has('KeyS') || pressed.has('ArrowDown')) move.subtractInPlace(forward);
    if (pressed.has('KeyD') || pressed.has('ArrowRight')) move.subtractInPlace(right);
    if (pressed.has('KeyA') || pressed.has('ArrowLeft')) move.addInPlace(right);
    // Při tahu myší se okrajem okna neposouvá – tah sám drží krajinu pod kurzorem.
    if (pointer && !pointer.blocked && !drag?.panning) {
      const edge = edgeScrollDirection(pointer, { width: innerWidth, height: innerHeight });
      move.addInPlace(right.scale(-edge.x)).addInPlace(forward.scale(-edge.y));
    }
    if (move.lengthSquared() > 0) {
      camera.target.addInPlace(move.normalize().scale(camera.radius * PAN_SPEED * dt));
    }
    if (pressed.has('KeyQ')) camera.alpha -= ROTATE_SPEED * dt;
    if (pressed.has('KeyE')) camera.alpha += ROTATE_SPEED * dt;
    // Uchopená mapa: bod země ze stisku se vrátí pod kurzor.
    if (drag?.panning && drag.grab) {
      const under = groundPoint(drag.cursor.x, drag.cursor.y, drag.grab.y);
      if (under) {
        camera.target.x += drag.grab.x - under.x;
        camera.target.z += drag.grab.z - under.z;
      }
    }
    clamp();

    // Vstupy myši a setrvačnost – scéna se pak kreslí bez další aktualizace kamery.
    camera.update();
    const view = camera.getViewMatrix(true);
    const changed = !hasView || !view.equals(lastView);
    lastView.copyFrom(view);
    hasView = true;
    return changed;
  };

  return {
    camera,
    update,
    setHome(x: number, z: number): void {
      home.x = x;
      home.z = z;
    },
    moveTo,
    reset,
    leftPressPanned: () => lastPressPanned,
    dispose(): void {
      endDrag();
      setCursor(null);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointermove', onWindowPointerMove);
      document.removeEventListener('mouseout', onMouseOut);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('pointerdown', onPointerDown, { capture: true });
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
      canvas.removeEventListener('lostpointercapture', onPointerEnd);
      canvas.removeEventListener('wheel', onWheel, { capture: true });
      canvas.removeEventListener('gesturestart', onGestureStart);
      canvas.removeEventListener('gesturechange', onGestureChange);
      canvas.removeEventListener('gestureend', onGestureEnd);
      camera.detachControl();
    },
  };
}
