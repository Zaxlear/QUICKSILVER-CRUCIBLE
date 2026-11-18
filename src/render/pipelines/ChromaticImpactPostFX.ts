import Phaser from 'phaser';
import chromaticImpactFrag from '../shaders/chromatic_impact.frag?raw';

export const CHROMATIC_IMPACT_PIPELINE_KEY = 'ChromaticImpactPostFX';

/**
 * 暴击、重击、成功盾反与受重创瞬间屏幕边缘色差撕裂 + 径向模糊 PostFXPipeline：
 * - 仅作用于 WorldMainCam，中心命中焦点清晰，四周边缘 RGB 三通道径向撕裂；
 * - 支持脉冲指数衰减与 Visual QA 检视常驻锁定模式。
 */
export class ChromaticImpactPostFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private pulseIntensity = 0.0;
  private sustainedHoldIntensity = 0.0;
  private impactCenterUvX = 0.5;
  private impactCenterUvY = 0.5;

  public constructor(game: Phaser.Game) {
    super({
      game,
      name: CHROMATIC_IMPACT_PIPELINE_KEY,
      fragShader: chromaticImpactFrag,
    });
  }

  public get effectiveIntensity(): number {
    return Math.max(this.pulseIntensity, this.sustainedHoldIntensity);
  }

  public triggerPulse(
    intensity: number,
    worldX?: number,
    worldY?: number,
    cam?: Phaser.Cameras.Scene2D.Camera
  ): void {
    this.pulseIntensity = Math.max(this.pulseIntensity, Math.max(0, Math.min(1, intensity)));
    if (worldX !== undefined && worldY !== undefined && cam && cam.width > 0 && cam.height > 0) {
      this.impactCenterUvX = Math.max(0, Math.min(1, (worldX - cam.scrollX) / cam.width));
      this.impactCenterUvY = Math.max(0, Math.min(1, 1.0 - (worldY - cam.scrollY) / cam.height));
    } else {
      this.impactCenterUvX = 0.5;
      this.impactCenterUvY = 0.5;
    }
  }

  public setSustainedHold(active: boolean, holdIntensity = 0.85, uvX = 0.5, uvY = 0.52): void {
    this.sustainedHoldIntensity = active ? Math.max(0, Math.min(1, holdIntensity)) : 0.0;
    if (active) {
      this.impactCenterUvX = uvX;
      this.impactCenterUvY = uvY;
    }
  }

  public stepDecay(dtSec: number): void {
    if (this.pulseIntensity > 0.001) {
      this.pulseIntensity *= Math.exp(-7.5 * dtSec);
      if (this.pulseIntensity < 0.002) {
        this.pulseIntensity = 0.0;
      }
    } else {
      this.pulseIntensity = 0.0;
    }
  }

  public override onPreRender(): void {
    this.set1f('uIntensity', this.effectiveIntensity);
    this.set2f('uImpactCenter', this.impactCenterUvX, this.impactCenterUvY);
  }
}
