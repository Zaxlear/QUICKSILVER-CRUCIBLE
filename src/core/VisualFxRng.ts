import { DeterministicRng } from './DeterministicRng';

/**
 * 纯表现层确定性伪随机数生成器（非存档隔离流）。
 *
 * 严格遵循 level-topology-and-determinism 规范：
 * 1. 绝不使用原生非确定性随机函数；
 * 2. 独立于局内存档 DeterministicRng，粒子飞溅角度、尘雾微扰与音效音高抖动绝不污染存档 stepCount。
 */
export class VisualFxStream {
  private readonly rng: DeterministicRng;

  public constructor(seed = 0x7f4a7c15) {
    this.rng = new DeterministicRng(seed);
  }

  public nextFloat(): number {
    return this.rng.nextFloat();
  }

  public range(min: number, max: number): number {
    return min + (max - min) * this.rng.nextFloat();
  }

  public intRange(min: number, max: number): number {
    return this.rng.nextInt(min, max);
  }

  public signedJitter(amplitude: number): number {
    return (this.rng.nextFloat() * 2 - 1) * amplitude;
  }
}

export const VisualFxRng = new VisualFxStream();
