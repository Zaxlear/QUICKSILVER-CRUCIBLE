import Phaser from 'phaser';
import shieldRefractFrag from '../shaders/shield_refract.frag?raw';

export const SHIELD_REFRACT_PIPELINE_KEY = 'ShieldRefractPipeline';

/**
 * 炼金护盾与招架力场屏幕空间法线折射波纹 PostFXPipeline：
 * - 仅挂载于 WorldMainCam，对背景砖墙与角色做正弦涟漪折射与菲涅尔水银亮环增强；
 * - TelegraphOverlayCam 与 #ui-root 完全隔离不受扭曲。
 */
export class ShieldRefractPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private elapsedSec = 0;
  private shieldCenterUvX = 0.5;
  private shieldCenterUvY = 0.5;
  private shieldRadiusUv = 0.0;
  private shieldEnabled = false;

  public constructor(game: Phaser.Game) {
    super({
      game,
      name: SHIELD_REFRACT_PIPELINE_KEY,
      fragShader: shieldRefractFrag,
    });
    this.active = false;
  }

  public get isShieldActive(): boolean {
    return this.shieldEnabled && this.shieldRadiusUv > 0.0005;
  }

  public setShieldState(
    enabled: boolean,
    worldX: number,
    worldY: number,
    radiusPx: number,
    cam: Phaser.Cameras.Scene2D.Camera
  ): void {
    this.shieldEnabled = enabled;
    if (!enabled || cam.width <= 0 || cam.height <= 0) {
      this.shieldRadiusUv = 0.0;
      this.active = false;
      return;
    }

    const screenX = (worldX - cam.scrollX) / cam.width;
    const screenY = (worldY - cam.scrollY) / cam.height;
    // Phaser PostFXPipeline 帧缓冲 UV 原点位于左下角，翻转 Y 轴对齐屏幕像素空间
    this.shieldCenterUvX = Math.max(0, Math.min(1, screenX));
    this.shieldCenterUvY = Math.max(0, Math.min(1, 1.0 - screenY));
    this.shieldRadiusUv = Math.max(0, radiusPx / cam.height);
    this.active = this.isShieldActive;
  }

  public stepTime(dtSec: number): void {
    this.elapsedSec += dtSec;
  }

  public override onPreRender(): void {
    const w = Math.max(1, this.renderer.width);
    const h = Math.max(1, this.renderer.height);
    this.set1f('uTime', this.elapsedSec);
    this.set2f('uShieldCenter', this.shieldCenterUvX, this.shieldCenterUvY);
    this.set1f('uShieldRadius', this.shieldEnabled ? this.shieldRadiusUv : 0.0);
    this.set1f('uAspect', w / h);
  }
}
