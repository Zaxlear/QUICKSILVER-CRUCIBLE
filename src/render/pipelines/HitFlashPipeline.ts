import Phaser from 'phaser';
import {
  DATA_HIT_FLASH_AMOUNT,
  DATA_HIT_FLASH_COLOR,
  HIT_FLASH_PIPELINE_KEY,
  sampleHitFlashCurve,
} from '../../core/Constants';
import hitFlashFrag from '../shaders/hit_flash.frag?raw';

export { DATA_HIT_FLASH_AMOUNT, DATA_HIT_FLASH_COLOR, HIT_FLASH_PIPELINE_KEY, sampleHitFlashCurve };

/**
 * 实体级受击纯白/元素色闪白 SinglePipeline：
 * - 受击前 60ms uFlashAmount 锁定 1.0，随后 40ms 线性归零并混入元素高亮色；
 * - batchSize = 1 配合 onBind 逐实体读取 data，杜绝同屏多受击怪 uniform 串染。
 */
export class HitFlashPipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
  private defaultAmount = 1.0;
  private defaultColor: readonly [number, number, number] = [1.0, 1.0, 1.0];

  public constructor(game: Phaser.Game) {
    super({
      game,
      name: HIT_FLASH_PIPELINE_KEY,
      fragShader: hitFlashFrag,
      batchSize: 1,
    });
  }

  public setDefaultFlash(amount: number, r = 1.0, g = 1.0, b = 1.0): void {
    this.defaultAmount = Math.max(0, Math.min(1, amount));
    this.defaultColor = [r, g, b];
  }

  public override onBind(gameObject?: Phaser.GameObjects.GameObject): void {
    super.onBind(gameObject);
    this.flush();

    let amount = this.defaultAmount;
    let color = this.defaultColor;

    if (gameObject && gameObject.data) {
      const objAmount = gameObject.getData(DATA_HIT_FLASH_AMOUNT) as number | undefined;
      if (typeof objAmount === 'number') {
        amount = Math.max(0, Math.min(1, objAmount));
      }
      const objColor = gameObject.getData(DATA_HIT_FLASH_COLOR) as
        | readonly [number, number, number]
        | undefined;
      if (objColor) {
        color = objColor;
      }
    }

    this.set1f('uFlashAmount', amount);
    this.set3f('uFlashColor', color[0], color[1], color[2]);
  }
}
