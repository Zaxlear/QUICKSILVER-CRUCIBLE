import Phaser from 'phaser';
import vignetteBloomFrag from '../shaders/vignette_bloom.frag?raw';

export const VIGNETTE_BLOOM_PIPELINE_KEY = 'VignetteBloomPostFX';

/**
 * 暗黑炼金氛围四角冷色压暗暗角 + 高亮度阈值 9-Tap 星芒辉光 PostFXPipeline：
 * - 默认参数严格对齐美术圣经：uBloomStrength = 0.42, uBloomThreshold = 0.72, uVignetteDarkness = 0.38
 */
export class VignetteBloomPostFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private bloomEnabled = true;
  private bloomStrength = 0.42;
  private bloomThreshold = 0.72;
  private vignetteDarkness = 0.38;

  public constructor(game: Phaser.Game) {
    super({
      game,
      name: VIGNETTE_BLOOM_PIPELINE_KEY,
      fragShader: vignetteBloomFrag,
    });
  }

  public get isBloomEnabled(): boolean {
    return this.bloomEnabled;
  }

  public setBloomEnabled(enabled: boolean): void {
    this.bloomEnabled = enabled;
    this.active = enabled;
  }

  public configure(strength: number, threshold: number, vignetteDarkness: number): void {
    this.bloomStrength = Math.max(0, strength);
    this.bloomThreshold = Math.max(0, Math.min(1, threshold));
    this.vignetteDarkness = Math.max(0, Math.min(1, vignetteDarkness));
  }

  public override onPreRender(): void {
    const w = Math.max(1, this.renderer.width);
    const h = Math.max(1, this.renderer.height);
    this.set2f('uResolution', w, h);
    this.set1f('uBloomStrength', this.bloomEnabled ? this.bloomStrength : 0.0);
    this.set1f('uBloomThreshold', this.bloomThreshold);
    this.set1f('uVignetteDarkness', this.bloomEnabled ? this.vignetteDarkness : 0.0);
  }
}
