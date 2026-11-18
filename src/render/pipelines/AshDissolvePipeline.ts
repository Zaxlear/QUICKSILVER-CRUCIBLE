import Phaser from 'phaser';
import ashDissolveFrag from '../shaders/ash_dissolve.frag?raw';

export const ASH_DISSOLVE_PIPELINE_KEY = 'AshDissolvePipeline';

export const DATA_ASH_PROGRESS = 'qc_ashProgress';
export const DATA_ASH_NOISE_SCALE = 'qc_ashNoiseScale';

/**
 * 怪物死亡灰烬边缘余烬溶解 SinglePipeline：
 * - 自动读取当前 Sprite Frame 在 MultiAtlas 中的 (u0, v0, uSpan, vSpan) 归一化单帧局部 UV；
 * - 基于像素化双频 Value Noise 自上而下裁剪片元并渲染 #FF5E2B -> #FBBF24 锻炉余烬发光切口。
 */
export class AshDissolvePipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
  private defaultProgress = 0.46;
  private defaultNoiseScale: readonly [number, number] = [24.0, 24.0];

  public constructor(game: Phaser.Game) {
    super({
      game,
      name: ASH_DISSOLVE_PIPELINE_KEY,
      fragShader: ashDissolveFrag,
      batchSize: 1,
    });
  }

  public setDefaultDissolve(progress: number, scaleX = 24.0, scaleY = 24.0): void {
    this.defaultProgress = Math.max(0, Math.min(1, progress));
    this.defaultNoiseScale = [scaleX, scaleY];
  }

  public override onBind(gameObject?: Phaser.GameObjects.GameObject): void {
    super.onBind(gameObject);
    this.flush();

    let progress = this.defaultProgress;
    let noiseScale = this.defaultNoiseScale;
    let u0 = 0.0;
    let v0 = 0.0;
    let uSpan = 1.0;
    let vSpan = 1.0;

    if (gameObject) {
      if (gameObject.data) {
        const objProg = gameObject.getData(DATA_ASH_PROGRESS) as number | undefined;
        if (typeof objProg === 'number') {
          progress = Math.max(0, Math.min(1, objProg));
        }
        const objScale = gameObject.getData(DATA_ASH_NOISE_SCALE) as
          | readonly [number, number]
          | undefined;
        if (objScale) {
          noiseScale = objScale;
        }
      }
      const maybeFrame = (gameObject as { frame?: Phaser.Textures.Frame }).frame;
      if (maybeFrame && typeof maybeFrame.u0 === 'number' && typeof maybeFrame.u1 === 'number') {
        u0 = maybeFrame.u0;
        v0 = maybeFrame.v0;
        uSpan = Math.max(0.0001, maybeFrame.u1 - maybeFrame.u0);
        vSpan = Math.max(0.0001, maybeFrame.v1 - maybeFrame.v0);
      }
    }

    this.set1f('uProgress', progress);
    this.set2f('uNoiseScale', noiseScale[0], noiseScale[1]);
    this.set4f('uFrameUv', u0, v0, uSpan, vSpan);
  }
}
