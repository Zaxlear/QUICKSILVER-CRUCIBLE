import Phaser from 'phaser';
import { PALETTE_VOID_HEX } from '../core/Constants';

// 静态确定性 1D 连续梯度表（[-1, 1] 均匀离散集），全程零非确定性随机调用
const DETERMINISTIC_GRAD_64: readonly number[] = [
  0.84, -0.62, 0.31, -0.95, 0.47, 0.18, -0.79, 0.66, -0.24, 0.91, -0.53, 0.12, 0.73, -0.88, 0.39,
  -0.15, -0.71, 0.58, -0.36, 0.97, -0.44, 0.27, 0.81, -0.69, 0.19, -0.92, 0.51, -0.08, -0.83, 0.64,
  -0.29, 0.76, 0.42, -0.75, 0.14, 0.89, -0.57, 0.33, -0.96, 0.22, 0.68, -0.49, 0.86, -0.17, -0.64,
  0.93, -0.38, 0.54, -0.81, 0.26, 0.72, -0.91, 0.45, -0.11, -0.67, 0.82, -0.32, 0.59, 0.16, -0.86,
  0.49, -0.73, 0.94, -0.21,
];

function smoothContinuousNoise1D(x: number): number {
  const xi = Math.floor(x);
  const xf = x - xi;
  // 五次 Hermite 平滑曲线 6t^5 - 15t^4 + 10t^3 确保高刷下导数连续不伤眼
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const g0 = DETERMINISTIC_GRAD_64[xi & 63]! * xf;
  const g1 = DETERMINISTIC_GRAD_64[(xi + 1) & 63]! * (xf - 1);
  return Math.max(-1, Math.min(1, (g0 + u * (g1 - g0)) * 1.85));
}

export interface WorldCameraBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * 双摄像机零污染同步控制器：
 * - WorldMainCam: 承载 Light2D 光照世界、前瞻偏移、非线性创伤震动与全屏 PostFX
 * - TelegraphOverlayCam: 透明背景叠加，仅同步基准 scrollX/Y 与 zoom，彻底免疫震动旋转与模糊
 */
export class CameraRig {
  public readonly worldMainCam: Phaser.Cameras.Scene2D.Camera;
  public readonly telegraphOverlayCam: Phaser.Cameras.Scene2D.Camera;

  private readonly scene: Phaser.Scene;
  private readonly worldLitObjects = new Set<Phaser.GameObjects.GameObject>();
  private readonly crispOverlayObjects = new Set<Phaser.GameObjects.GameObject>();

  private focusX = 0;
  private focusY = 0;
  private targetLookaheadX = 0;
  private targetLookaheadY = 0;
  private currentLookaheadX = 0;
  private currentLookaheadY = 0;
  private bounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  private targetBounds: WorldCameraBounds | null = null;

  private trauma = 0;
  private noiseClockSec = 0;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const width = scene.scale.width;
    const height = scene.scale.height;

    this.worldMainCam = scene.cameras.main;
    this.worldMainCam.setName('world_main');
    this.worldMainCam.setBackgroundColor(PALETTE_VOID_HEX);
    this.worldMainCam.setSize(width, height);

    this.telegraphOverlayCam = scene.cameras.add(0, 0, width, height, false, 'telegraph');
    this.telegraphOverlayCam.transparent = true;

    this.scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncCameras, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  public get currentTrauma(): number {
    return this.trauma;
  }

  public registerWorldLit<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.worldLitObjects.add(obj);
    this.telegraphOverlayCam.ignore(obj);
    return obj;
  }

  public registerCrispOverlay<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.crispOverlayObjects.add(obj);
    this.worldMainCam.ignore(obj);
    return obj;
  }

  public unregister(obj: Phaser.GameObjects.GameObject): void {
    this.worldLitObjects.delete(obj);
    this.crispOverlayObjects.delete(obj);
  }

  public setFocus(worldX: number, worldY: number): void {
    this.focusX = worldX;
    this.focusY = worldY;
  }

  public setLookahead(offsetX: number, offsetY = 0): void {
    this.targetLookaheadX = offsetX;
    this.targetLookaheadY = offsetY;
  }

  public setWorldBounds(bounds: WorldCameraBounds | null): void {
    this.bounds = bounds ? { ...bounds } : null;
    this.targetBounds = bounds;
  }

  /** 跨房间/走廊过渡时平滑阻尼插值摄像机边界，杜绝镜头硬切跳变 */
  public transitionWorldBounds(nextBounds: WorldCameraBounds | null, immediate = false): void {
    if (!nextBounds || immediate || !this.bounds) {
      this.setWorldBounds(nextBounds);
      return;
    }
    this.targetBounds = nextBounds;
  }

  public addTrauma(amount: number): void {
    if (amount <= 0) return;
    this.trauma = Math.min(1.0, Math.max(0, this.trauma + amount));
  }

  /** 在 120Hz 固定步长或帧步进中衰减创伤度与前瞻阻尼 */
  public stepSimulation(dtSec: number): void {
    this.noiseClockSec += dtSec;

    if (this.trauma > 0) {
      const decay = (1.85 * this.trauma + 0.65) * dtSec;
      this.trauma = Math.max(0, this.trauma - decay);
    }

    const blend = 1 - Math.exp(-10.0 * dtSec);
    this.currentLookaheadX += (this.targetLookaheadX - this.currentLookaheadX) * blend;
    this.currentLookaheadY += (this.targetLookaheadY - this.currentLookaheadY) * blend;

    if (this.bounds && this.targetBounds) {
      const bBlend = 1 - Math.exp(-11.5 * dtSec);
      this.bounds.minX += (this.targetBounds.minX - this.bounds.minX) * bBlend;
      this.bounds.minY += (this.targetBounds.minY - this.bounds.minY) * bBlend;
      this.bounds.maxX += (this.targetBounds.maxX - this.bounds.maxX) * bBlend;
      this.bounds.maxY += (this.targetBounds.maxY - this.bounds.maxY) * bBlend;
    }
  }

  public resize(logicalWidth: number, logicalHeight: number): void {
    this.worldMainCam.setSize(logicalWidth, logicalHeight);
    this.telegraphOverlayCam.setSize(logicalWidth, logicalHeight);
    this.syncCameras();
  }

  public syncCameras(): void {
    const viewW = this.worldMainCam.width;
    const viewH = this.worldMainCam.height;

    let baseScrollX = this.focusX + this.currentLookaheadX - viewW * 0.5;
    let baseScrollY = this.focusY + this.currentLookaheadY - viewH * 0.5;

    if (this.bounds) {
      const maxScrollX = Math.max(this.bounds.minX, this.bounds.maxX - viewW);
      const maxScrollY = Math.max(this.bounds.minY, this.bounds.maxY - viewH);
      baseScrollX = Math.min(Math.max(baseScrollX, this.bounds.minX), maxScrollX);
      baseScrollY = Math.min(Math.max(baseScrollY, this.bounds.minY), maxScrollY);
    }

    const t2 = this.trauma * this.trauma;
    const t3 = t2 * this.trauma;
    const tSec = this.noiseClockSec;

    const shakeX = t2 > 0 ? 14.0 * t2 * smoothContinuousNoise1D(28.0 * tSec) : 0;
    const shakeY = t2 > 0 ? 10.0 * t2 * smoothContinuousNoise1D(28.0 * tSec + 100.0) : 0;
    const shakeDeg = t3 > 0 ? 1.6 * t3 * smoothContinuousNoise1D(22.0 * tSec + 200.0) : 0;

    this.worldMainCam.setScroll(baseScrollX + shakeX, baseScrollY + shakeY);
    this.worldMainCam.setRotation((shakeDeg * Math.PI) / 180.0);

    // TelegraphOverlayCam 严格同步无震动基准坐标与缩放，杜绝旋转与后处理重影
    this.telegraphOverlayCam.setScroll(baseScrollX, baseScrollY);
    this.telegraphOverlayCam.setZoom(this.worldMainCam.zoom);
    this.telegraphOverlayCam.setRotation(0);
  }

  public destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncCameras, this);
    this.worldLitObjects.clear();
    this.crispOverlayObjects.clear();
  }
}
