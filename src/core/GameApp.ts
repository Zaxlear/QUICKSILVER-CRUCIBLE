import Phaser from 'phaser';
import { MAX_HARDWARE_LIGHTS, PALETTE_VOID_HEX } from './Constants';
import { EventBus, type ViewportSnapshotPayload } from './EventBus';

export interface GameAppConfig {
  readonly parentId: string;
  readonly scenes: Phaser.Types.Scenes.SceneType[];
  readonly computeViewportSnapshot: (
    cssWidth: number,
    cssHeight: number,
    rawDpr: number
  ) => ViewportSnapshotPayload;
  readonly checkPortraitLocked: (
    cssWidth: number,
    cssHeight: number,
    hasTouch: boolean
  ) => boolean;
}

declare global {
  interface Window {
    __QC_GAME_APP__?: GameApp;
  }
}

/**
 * Phaser.Game WebGL 实例工厂与自适应视口生命周期总控。
 * 遵循 core 层单向依赖原则，由入口注入视口计算纯函数与场景列表。
 */
export class GameApp {
  public readonly game: Phaser.Game;
  private readonly config: GameAppConfig;
  private lastSnapshot: ViewportSnapshotPayload;
  private lastPortraitLocked = false;

  public constructor(config: GameAppConfig) {
    this.config = config;
    this.assertWebGLSupport();

    const initialSnap = this.sampleViewportSnapshot();
    this.lastSnapshot = initialSnap;

    this.game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent: config.parentId,
      width: initialSnap.logicalWidth,
      height: initialSnap.logicalHeight,
      backgroundColor: PALETTE_VOID_HEX,
      banner: false,
      audio: {
        noAudio: true,
      },
      render: {
        pixelArt: true,
        antialias: false,
        roundPixels: false,
        preserveDrawingBuffer: Boolean(import.meta.env.DEV),
        maxLights: MAX_HARDWARE_LIGHTS,
        powerPreference: 'high-performance',
      },
      callbacks: {
        postBoot: () => {
          this.applyCanvasPresentation(this.lastSnapshot);
        },
      },
      scale: {
        mode: Phaser.Scale.NONE,
        width: initialSnap.logicalWidth,
        height: initialSnap.logicalHeight,
      },
      scene: config.scenes,
    });

    this.applyCanvasPresentation(initialSnap);
    this.syncOrientationState(true);
    EventBus.emit('system:viewport_changed', initialSnap);

    window.addEventListener('resize', this.handleWindowResize, { passive: true });
    window.addEventListener('orientationchange', this.handleWindowResize, { passive: true });
    window.__QC_GAME_APP__ = this;
  }

  public get currentViewport(): ViewportSnapshotPayload {
    return this.lastSnapshot;
  }

  public get isPortraitLocked(): boolean {
    return this.lastPortraitLocked;
  }

  public refreshViewport(): void {
    this.handleWindowResize();
  }

  public destroy(): void {
    window.removeEventListener('resize', this.handleWindowResize);
    window.removeEventListener('orientationchange', this.handleWindowResize);
    this.game.destroy(true);
  }

  private readonly handleWindowResize = (): void => {
    const snap = this.sampleViewportSnapshot();
    const sizeChanged =
      snap.logicalWidth !== this.lastSnapshot.logicalWidth ||
      snap.logicalHeight !== this.lastSnapshot.logicalHeight;

    this.lastSnapshot = snap;
    if (sizeChanged) {
      this.game.scale.resize(snap.logicalWidth, snap.logicalHeight);
    }
    this.applyCanvasPresentation(snap);
    this.syncOrientationState(false);
    EventBus.emit('system:viewport_changed', snap);
  };

  private sampleViewportSnapshot(): ViewportSnapshotPayload {
    const cssWidth = Math.max(window.innerWidth || 640, 1);
    const cssHeight = Math.max(window.innerHeight || 360, 1);
    const dpr = window.devicePixelRatio || 1;
    return this.config.computeViewportSnapshot(cssWidth, cssHeight, dpr);
  }

  private syncOrientationState(forceEmit: boolean): void {
    const cssWidth = Math.max(window.innerWidth || 640, 1);
    const cssHeight = Math.max(window.innerHeight || 360, 1);
    const hasTouch = (navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
    const locked = this.config.checkPortraitLocked(cssWidth, cssHeight, hasTouch);

    if (forceEmit || locked !== this.lastPortraitLocked) {
      this.lastPortraitLocked = locked;
      EventBus.emit('system:orientation_lock_changed', { isPortraitLocked: locked });
      EventBus.emit('ui:command:set_orientation_pause', { paused: locked });
    }
  }

  private applyCanvasPresentation(snap: ViewportSnapshotPayload): void {
    const canvas = this.game.canvas;
    if (!canvas) return;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    // Tier 1/2/4 整数倍开启像素锐化；Tier 3 非整数物理倍率开启双线性边缘防摩尔纹
    const isIntegerZoom = Math.abs(snap.zoomFactor - Math.round(snap.zoomFactor)) < 1e-3;
    canvas.style.imageRendering = isIntegerZoom ? 'pixelated' : 'auto';
  }

  private assertWebGLSupport(): void {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
    if (!gl) {
      throw new Error('WebGL context unavailable: QUICKSILVER CRUCIBLE forbids Canvas fallback.');
    }
  }
}
